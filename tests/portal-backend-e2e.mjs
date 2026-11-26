import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import worker from '../v4/worker.mjs';
export async function runPortalBackendE2E({browser,url,portalFiles}){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 const migrationDir=new URL('../v4/migrations/',import.meta.url);
 for(const n of (await readdir(migrationDir)).filter(x=>x.endsWith('.sql')).sort())db.exec(await readFile(new URL(n,migrationDir),'utf8'));
 const DB={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return db.prepare(sql).get(...this.args)||null;},async all(){return {results:db.prepare(sql).all(...this.args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...this.args).changes)}};}};},async batch(stmts){db.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const id='444444444444444444',owner='111111111111111111',origin='https://fixture.invalid',guild='1487728359482851348',machine='a'.repeat(64);
 let member=true,oauth=0;
 const env={DB,PUBLIC_ORIGIN:origin,OWNER_DISCORD_ID:owner,DISCORD_CLIENT_ID:'222222222222222222',DISCORD_CLIENT_SECRET:'fixture-only',DISCORD_MEMBERSHIP_BOT_TOKEN:'fixture-only',NEXORAID_TICKET_MACHINE_KEY:machine,NEXORAID_BOT_API_KEY:'b'.repeat(64),
 DISCORD_OAUTH_FETCH:async()=>Response.json(++oauth===1?{access_token:'fixture'}:oauth===2?{id,username:'Browser fixture'}:{roles:[]}),
 DISCORD_MEMBERSHIP_FETCH:async()=>member?Response.json({user:{id},roles:[]}):Response.json({code:10007},{status:404})};
 const state='a'.repeat(72),verifier='b'.repeat(43);
 let ctx;
 try{
 const login=await worker.fetch(new Request(origin+'/api/auth/callback?code=fixture&state='+state,{headers:{cookie:'nexo_state='+state+'; nexo_pkce='+verifier}}),env);
 assert.equal(login.headers.get('location'),'/portal.html');
 const cookie=login.headers.getSetCookie().find(x=>x.startsWith('nexo_session=')).split(';')[0];
 ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let lastOrderBody;
 for(const [name,body] of Object.entries(portalFiles))await page.route('**/'+name,r=>r.fulfill({contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript',body}));
 await page.route('**/api/**',async route=>{
  const req=route.request(),u=new URL(req.url()),method=req.method(),body=req.postData();
  if(u.pathname==='/api/orders'&&method==='POST')lastOrderBody=body;
  const response=await worker.fetch(new Request(origin+u.pathname+u.search,{method,headers:{cookie,origin,'content-type':'application/json'},...(body?{body}:{})}),env);
  await route.fulfill({status:response.status,contentType:response.headers.get('content-type')||'application/json',body:await response.text()});
 });
 await page.goto(url+'portal.html');await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='Terhubung.');
 assert.equal(await page.locator('#roleBadge').innerText(),'Pelanggan');
 await page.locator('#service').selectOption('optiwindows');await page.locator('#quantity').fill('1');
 await page.locator('#request button').click();await page.waitForFunction(()=>document.querySelector('#status')?.textContent.startsWith('Permintaan tercatat:'));
 const order=db.prepare('SELECT * FROM orders').get();assert.equal(order.customer_id,id);assert.equal(order.estimate,150000);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM web_ticket_outbox WHERE order_id=?').get(order.id).n,1);
 const call=(path,body)=>worker.fetch(new Request(origin+path,{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body}),env);
 assert.equal((await call('/api/orders',lastOrderBody)).status,200);assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,1);
 const queue=async body=>worker.fetch(new Request(origin+'/api/bot/ticket-queue',{method:'POST',headers:{authorization:'Bearer '+machine,'x-discord-guild-id':guild,'content-type':'application/json'},body:JSON.stringify(body)}),env);
 const lease=await (await queue({action:'lease'})).json();assert.equal(lease.order.id,order.id);
 const ack=await queue({action:'ack',order_id:order.id,lease_token:lease.lease_token,channel_id:'666666666666666666',message_id:'777777777777777777',ticket_id:'0001'});
 assert.equal(ack.status,200);
 const link=await worker.fetch(new Request(origin+'/api/orders/'+order.id+'/ticket',{headers:{cookie}}),env);
 assert.equal((await link.json()).ticket.ticket_id,'0001');
 member=false;
 await page.locator('#request button').click();await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Gabung server Discord'));
 assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,1);assert.deepEqual(errors,[]);
 console.log('Portal backend E2E passed: OAuth fixture, browser checkout, persistent D1/outbox, replay, machine lease/ACK and nonmember rejection. No real Discord side effects.');
 }finally{await ctx?.close();db.close();}
}
