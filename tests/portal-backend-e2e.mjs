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
 let ctx;const roleContexts=[];
 try{
 const login=await worker.fetch(new Request(origin+'/api/auth/callback?code=fixture&state='+state,{headers:{cookie:'nexo_state='+state+'; nexo_pkce='+verifier}}),env);
 assert.equal(login.headers.get('location'),'/portal.html');
 const cookie=login.headers.getSetCookie().find(x=>x.startsWith('nexo_session=')).split(';')[0];
 ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let lastOrderBody,lostOrderResponse=true;
 for(const [name,body] of Object.entries(portalFiles))await page.route('**/'+name,r=>r.fulfill({contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript',body}));
 await page.route('**/api/**',async route=>{
  const req=route.request(),u=new URL(req.url()),method=req.method(),body=req.postDataBuffer();
  if(u.pathname==='/api/customer/checkout'&&method==='POST')lastOrderBody=req.postData();
  const response=await worker.fetch(new Request(origin+u.pathname+u.search,{method,headers:{cookie,origin,'content-type':req.headers()['content-type']||'application/json'},...(body?{body}:{})}),env);
  if(lostOrderResponse&&u.pathname==='/api/customer/checkout'&&method==='POST'&&response.status===201){lostOrderResponse=false;await route.abort('failed');return;}
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 });
 await page.goto(url+'portal.html');await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='Terhubung.');
 assert.equal(await page.locator('#roleBadge').innerText(),'Pelanggan');
 const addCart=async p=>{await p.locator('[data-view="shop"]').click();const add=p.locator('#shopBody > form');await add.locator('select').selectOption('optiwindows');await add.getByRole('button',{name:'Simpan'}).click();await p.getByRole('button',{name:'Buat pesanan',exact:true}).waitFor();};
 await addCart(page);await page.getByRole('button',{name:'Buat pesanan',exact:true}).click();
 await page.locator('.checkout-review [role=alert]').filter({hasText:'belum pasti'}).waitFor();assert.match(await page.locator('#status').innerText(),/belum pasti/);
 const lost=JSON.parse(lastOrderBody);assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,1);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='Terhubung.');
 await page.locator('[data-view="shop"]').click();
 assert.equal(await page.locator('.checkout-review input[type=number]').isDisabled(),true);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Ulangi pengiriman pesanan',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('pesanan berhasil tercatat'));
 assert.deepEqual(JSON.parse(lastOrderBody),lost);assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,1);
 await page.locator('#orderDialog[open]').waitFor();await page.locator('#closeDetail').click();
 console.log('Browser lost-response checkout recovery passed: original cart key and payload persisted and locked after reload.');
 const order=db.prepare('SELECT * FROM orders').get();assert.equal(order.customer_id,id);assert.equal(order.estimate,150000);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM web_ticket_outbox WHERE order_id=?').get(order.id).n,1);
 const call=(path,body)=>worker.fetch(new Request(origin+path,{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body}),env);
 assert.equal((await call('/api/customer/checkout',lastOrderBody)).status,200);assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,1);
 const queue=async body=>worker.fetch(new Request(origin+'/api/bot/ticket-queue',{method:'POST',headers:{authorization:'Bearer '+machine,'x-discord-guild-id':guild,'content-type':'application/json'},body:JSON.stringify(body)}),env);
 const lease=await (await queue({action:'lease'})).json();assert.equal(lease.order.id,order.id);
 const ack=await queue({action:'ack',order_id:order.id,lease_token:lease.lease_token,channel_id:'666666666666666666',message_id:'777777777777777777',ticket_id:'0001'});
 assert.equal(ack.status,200);
 const link=await worker.fetch(new Request(origin+'/api/orders/'+order.id+'/ticket',{headers:{cookie}}),env);
 assert.equal((await link.json()).ticket.ticket_id,'0001');
 member=false;
 await addCart(page);await page.getByRole('button',{name:'Buat pesanan',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Gabung server Discord'));
 assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,1);assert.deepEqual(errors,[]);
 console.log('Portal backend E2E passed: OAuth fixture, browser checkout, persistent D1/outbox, replay, machine lease/ACK and nonmember rejection. No real Discord side effects.');

 // Five real API-backed role dashboards and cross-role financial lifecycle.
 // Discord itself and payment provider remain synthetic; never touch production.
 member=true;
 const ids={owner,management:'555555555555555555',worker:'333333333333333333',seller:'888888888888888888'};
 db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(ids.management,'Fixture manager','customer',1);
 db.prepare('INSERT INTO management_grants VALUES(?,?)').run(ids.management,1);
 db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(ids.seller,'Fixture seller','seller',1);
 const pages={customer:page},cookies={customer:cookie};
 const labels={owner:'Pemilik',management:'Manajemen',worker:'Penjoki',seller:'Penjual',customer:'Pelanggan'};
 for(const [role,actor] of Object.entries(ids)){
  let n=0;const config={...env,DISCORD_OAUTH_FETCH:async()=>Response.json(++n===1?{access_token:'fixture'}:n===2?{id:actor,username:'Fixture '+role}:{roles:role==='worker'?['1511392414516903966']:[]})};
  const login=await worker.fetch(new Request(origin+'/api/auth/callback?code=fixture&state='+state,{headers:{cookie:'nexo_state='+state+'; nexo_pkce='+verifier}}),config);
  assert.equal(login.headers.get('location'),'/portal.html',role+' OAuth callback');const session=login.headers.getSetCookie().find(x=>x.startsWith('nexo_session=')).split(';')[0];cookies[role]=session;
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});roleContexts.push(context);
  const p=await context.newPage();pages[role]=p;p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  for(const [name,body] of Object.entries(portalFiles))await p.route('**/'+name,r=>r.fulfill({contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript',body}));
  await p.route('**/api/**',async route=>{const req=route.request(),u=new URL(req.url()),method=req.method(),body=req.postDataBuffer();
   const response=await worker.fetch(new Request(origin+u.pathname+u.search,{method,headers:{cookie:session,origin,'content-type':req.headers()['content-type']||'application/json'},...(body?{body}:{})}),{...env,DISCORD_MEMBERSHIP_FETCH:async url=>Response.json({user:{id:url.split('/').at(-1)},roles:url.endsWith(ids.worker)?['1511392414516903966']:[]})});
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
  await p.goto(url+'portal.html');await p.waitForFunction(()=>document.querySelector('#status')?.textContent==='Terhubung.');
  assert.equal(await p.locator('#roleBadge').innerText(),labels[role]);
  assert.equal(await p.locator('[data-view="team"]').isVisible(),role==='owner');
  assert.equal(await p.locator('[data-view="finance"]').isVisible(),['owner','worker'].includes(role));
 }
 const api=(role,path,data)=>worker.fetch(new Request(origin+path,{headers:{cookie:cookies[role],origin,'content-type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})}),env);
 assert.equal((await api('seller','/api/orders/'+order.id)).status,404);
 assert.equal((await api('seller','/api/team')).status,403);
 assert.equal((await api('seller','/api/orders/'+order.id+'/claim',{})).status,403);
 const open=async role=>{const p=pages[role];await p.reload();await p.waitForFunction(()=>document.querySelector('#status')?.textContent==='Terhubung.');await p.getByRole('button',{name:role==='customer'||role==='seller'?/^(Lihat pesanan|Bayar sekarang)$/: 'Detail & tindakan',exact:true}).first().click();await p.locator('#orderDialog[open]').waitFor();return p;};
 const submit=async(p,locator,endpoint)=>{const done=p.waitForResponse(r=>new URL(r.url()).pathname===endpoint&&r.request().method()==='POST');await locator.click();const response=await done;assert.equal(response.status(),200,endpoint+' '+await response.text());};
 const endpoint='/api/orders/'+order.id;
 let p=await open('worker');await submit(p,p.getByRole('button',{name:'Ambil pesanan',exact:true}),endpoint+'/claim');
 assert.equal(db.prepare('SELECT assigned_to FROM orders WHERE id=?').get(order.id).assigned_to,ids.worker);
 // Exercise shared and internal messages through the actual role dashboards.
 const messagePath='/api/collaboration/orders/'+order.id+'/message';
 const overviewPath='/api/collaboration/orders/'+order.id+'/overview';
 const sharedMessage='Synthetic shared communication for acceptance';
 const internalMessage='Synthetic internal management note';
 for(const [role,visibility,message] of [['customer','shared',sharedMessage],['management','internal',internalMessage]]){
  p=await open(role);if(role==='customer')await p.locator('.customer-order-extra > summary').click();
  const form=p.locator('form').filter({has:p.getByRole('heading',{name:'Kirim pesan',exact:true})});
  await form.getByLabel('Visibilitas',{exact:true}).selectOption(visibility);
  await form.getByLabel('Pesan',{exact:true}).fill(message);
  await submit(p,form.getByRole('button',{name:'Simpan'}),messagePath);
  await p.locator('.order-messages').getByText(message,{exact:true}).waitFor();
 }
 for(const role of ['owner','management','worker','customer','seller']){
  const response=await api(role,overviewPath);
  if(role==='seller'){assert.equal(response.status,404);continue;}
  assert.equal(response.status,200);
  const {messages}=await response.json();
  assert.ok(messages.some(m=>m.message===sharedMessage));
  assert.equal(messages.some(m=>m.message===internalMessage),['owner','management'].includes(role));
 }
 for(const role of ['customer','worker'])assert.equal((await api(role,messagePath,{visibility:'internal',message:'Forbidden synthetic note'})).status,403);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM order_messages WHERE order_id=?').get(order.id).n,2);
 console.log('Communication acceptance passed: shared/internal browser submissions and five-role privacy matrix.');
 // Actual Worker/SQLite-backed calendar: create and update a deadline from the UI, then verify every role.
 const planPath='/api/collaboration/orders/'+order.id+'/plan';
 const wibInput=seconds=>new Date(seconds*1000+25200000).toISOString().slice(0,16);
 const baseSeconds=Math.floor(Date.now()/60000)*60;
 const firstDue=baseSeconds+3600,updatedDue=baseSeconds+7200,planMonth=wibInput(updatedDue).slice(0,7);
 p=await open('management');let planForm=p.locator('form').filter({has:p.getByRole('heading',{name:'Atur tenggat',exact:true})});
 await planForm.getByLabel('Prioritas').selectOption('high');await planForm.getByLabel('Tanggal dan jam WIB').fill(wibInput(firstDue));await submit(p,planForm.getByRole('button',{name:'Simpan'}),planPath);
 assert.equal(db.prepare('SELECT due_at FROM order_plans WHERE order_id=?').get(order.id).due_at,firstDue);
 p=await open('owner');planForm=p.locator('form').filter({has:p.getByRole('heading',{name:'Atur tenggat',exact:true})});
 await planForm.getByLabel('Prioritas').selectOption('urgent');await planForm.getByLabel('Tanggal dan jam WIB').fill(wibInput(updatedDue));await submit(p,planForm.getByRole('button',{name:'Simpan'}),planPath);
 assert.deepEqual({...db.prepare('SELECT priority,due_at FROM order_plans WHERE order_id=?').get(order.id)},{priority:'urgent',due_at:updatedDue});
 for(const role of ['owner','management','worker','customer','seller']){
  const response=await api(role,'/api/collaboration/calendar?month='+planMonth);assert.equal(response.status,200);
  const {items}=await response.json();assert.equal(items.some(x=>x.id===order.id),role!=='seller');
  const search=await api(role,'/api/orders?q='+encodeURIComponent(order.id));assert.equal(search.status,200);
  assert.equal((await search.json()).orders.some(x=>x.id===order.id),role!=='seller');
  const rp=pages[role];if(await rp.locator('#orderDialog').isVisible())await rp.locator('#closeDetail').click();
  await rp.locator('[data-view="calendar"]').click();await rp.locator('#calendarMonth').fill(planMonth);
  if(role==='seller')await rp.locator('#calendarBody').getByText('Tidak ada tenggat pada bulan ini.').waitFor();
  else await rp.locator('#calendarBody article').filter({hasText:'Mendesak'}).waitFor();
 }
 for(const role of ['worker','customer','seller']){
  const denied=await api(role,planPath,{priority:'normal',due_at:updatedDue+60});assert.ok([403,404].includes(denied.status),role+' must not edit deadline');
 }
 assert.equal(db.prepare('SELECT due_at FROM order_plans WHERE order_id=?').get(order.id).due_at,updatedDue);
 console.log('Calendar acceptance passed: actual plan create/update, WIB, five-role scope and search, forbidden edits.');

 p=await open('management');let form=p.locator('form').filter({has:p.getByRole('heading',{name:'Tetapkan tagihan',exact:true})});await form.getByLabel('Nominal rupiah').fill('150000');await submit(p,form.getByRole('button',{name:'Simpan'}),endpoint+'/quote');
 p=await open('management');await submit(p,p.getByRole('button',{name:'Konfirmasi pesanan',exact:true}),endpoint+'/status');
 p=await open('customer');assert.ok(await p.locator('.qris-payment').isVisible());
 // Binary-safe browser transport: exercise attachment upload/download against the actual Worker.
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64');
 const attachmentBase='/api/collaboration/orders/'+order.id+'/attachment/';
 const uploadFixture=async(page,kind)=>{
  const input=page.locator('#orderDetail input[type=file]');
  await input.setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});
  await submit(page,page.getByRole('button',{name:'Unggah file',exact:true}),attachmentBase+kind);
  const label=kind==='payment'?'pembayaran':'pengerjaan';
  if(kind==='payment'){await page.getByRole('link',{name:new RegExp('Unduh bukti '+label),includeHidden:true}).waitFor({state:'attached'});if(await page.locator('.customer-order-extra').getAttribute('open')===null)await page.locator('.customer-order-extra > summary').click();}await page.getByRole('link',{name:new RegExp('Unduh bukti '+label)}).waitFor();
  const record=db.prepare('SELECT id,bytes FROM order_attachments WHERE order_id=? AND kind=?').get(order.id,kind);
  assert.deepEqual(Buffer.from(record.bytes),png);
  return record.id;
 };
 const downloadFixture=async(page,kind)=>{
  const label=kind==='payment'?'pembayaran':'pengerjaan';
  const pending=page.waitForEvent('download');
  await page.getByRole('link',{name:new RegExp('Unduh bukti '+label)}).click();
  const file=await pending;assert.match(file.suggestedFilename(),/\.png$/);
  assert.deepEqual(await readFile(await file.path()),png);
 };
 const fileInput=p.locator('#orderDetail input[type=file]');
 await fileInput.setInputFiles({name:'invalid.png',mimeType:'image/png',buffer:Buffer.from('not a PNG')});
 const rejected=p.waitForResponse(r=>new URL(r.url()).pathname===attachmentBase+'payment'&&r.request().method()==='POST');
 await p.getByRole('button',{name:'Unggah file',exact:true}).click();
 assert.equal((await rejected).status(),400);
 await p.locator('#orderDetail .form-feedback[role=alert]').waitFor();
 assert.equal(db.prepare('SELECT COUNT(*) n FROM order_attachments WHERE order_id=?').get(order.id).n,0);
 const paymentAttachment=await uploadFixture(p,'payment');
 await downloadFixture(p,'payment');
 for(const role of ['owner','management','worker','customer','seller']){
  const response=await api(role,attachmentBase+paymentAttachment);
  assert.equal(response.status,['owner','customer'].includes(role)?200:404);
  if(response.status===200)assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
 }

 form=p.locator('form').filter({has:p.getByRole('heading',{name:'Laporkan pembayaran',exact:true})});await form.getByLabel('Referensi pembayaran (bukan PIN/OTP)').fill('fixture-ui-receipt');await submit(p,form.getByRole('button',{name:'Kirim laporan pembayaran'}),'/api/workspace/orders/'+order.id+'/receipt');await p.locator('.customer-step h3').filter({hasText:'Menunggu verifikasi pembayaran'}).waitFor();assert.equal(await p.locator('.qris-payment').count(),0);
 p=await open('management');assert.equal(await p.getByRole('heading',{name:'Verifikasi pembayaran manual',exact:true}).count(),0);
 assert.equal((await api('management',endpoint+'/payment',{amount:150000,reference:'fixture-forbidden'})).status,403);
 p=await open('owner');form=p.locator('form').filter({has:p.getByRole('heading',{name:'Verifikasi pembayaran manual',exact:true})});await form.getByLabel('Referensi transaksi (bukan data rekening)').fill('fixture-ui-payment');await submit(p,form.getByRole('button',{name:'Simpan'}),endpoint+'/payment');
 p=await open('worker');await submit(p,p.getByRole('button',{name:'Mulai pengerjaan',exact:true}),endpoint+'/status');
 p=await open('worker');
 const workAttachment=await uploadFixture(p,'work');
 await downloadFixture(p,'work');
 for(const role of ['owner','management','worker','customer','seller']){
  const response=await api(role,attachmentBase+workAttachment);
  assert.equal(response.status,['owner','management','worker'].includes(role)?200:404);
  if(response.status===200)assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
 }
 console.log('Attachment acceptance passed: invalid PNG rejection, payment/work browser upload/download, byte integrity and five-role privacy.');
 p=await open('worker');form=p.locator('form').filter({has:p.getByRole('heading',{name:'Kirim bukti pengerjaan',exact:true})});await form.getByLabel('Catatan hasil / referensi bukti. Jangan kirim password atau OTP.').fill('Synthetic browser work evidence');await submit(p,form.getByRole('button',{name:'Simpan'}),endpoint+'/evidence');
 p=await open('management');await submit(p,p.getByRole('button',{name:'Setujui hasil & selesaikan',exact:true}),endpoint+'/status');
 const settlement=db.prepare('SELECT worker_share,owner_share,gross FROM order_settlements WHERE order_id=?').get(order.id);
 assert.equal(settlement.gross,150000);assert.equal(settlement.worker_share,10000);assert.equal(settlement.owner_share,140000);
 assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(order.id).status,'completed');
 // Actual customer support and completed-order review forms, with role and duplicate checks.
 const supportPath='/api/workspace/orders/'+order.id+'/support';
 const reviewPath='/api/workspace/orders/'+order.id+'/review';
 const complaint='Synthetic customer support request for acceptance';
 const resolution='Synthetic management resolution confirmed';
 p=await open('customer');await p.locator('.customer-order-extra > summary').click();
 form=p.locator('form').filter({has:p.getByRole('heading',{name:'Ajukan bantuan',exact:true})});
 await form.getByLabel('Jenis bantuan',{exact:true}).selectOption('complaint');
 await form.getByLabel('Jelaskan kebutuhan (tanpa kredensial)',{exact:true}).fill(complaint);
 await submit(p,form.getByRole('button',{name:'Simpan'}),supportPath);
 const supportCase=db.prepare('SELECT id,state,customer_id FROM support_cases WHERE order_id=?').get(order.id);
 assert.equal(supportCase.state,'open');assert.equal(supportCase.customer_id,id);
 assert.equal((await api('customer',supportPath,{kind:'complaint',message:complaint})).status,409);
 const resolvePath='/api/workspace/support/'+supportCase.id;
 for(const role of ['customer','worker','seller'])assert.equal((await api(role,resolvePath,{resolution})).status,403);
 for(const role of ['customer','owner','management','worker','seller']){
  const response=await api(role,'/api/workspace/support');assert.equal(response.status,200);
  assert.equal((await response.json()).items.some(x=>x.id===supportCase.id),['customer','owner','management'].includes(role));
 }
 p=pages.management;if(await p.locator('#orderDialog').isVisible())await p.locator('#closeDetail').click();
 await p.locator('[data-view="support"]').click();
 form=p.locator('#supportBody form').filter({has:p.getByRole('heading',{name:'Tanggapi kasus',exact:true})});
 await form.getByLabel('Resolusi 10–500 karakter',{exact:true}).fill(resolution);
 await submit(p,form.getByRole('button',{name:'Simpan'}),resolvePath);
 await p.locator('#supportBody').getByText('Resolusi: '+resolution,{exact:true}).waitFor();
 assert.equal(db.prepare('SELECT state FROM support_cases WHERE id=?').get(supportCase.id).state,'resolved');
 p=await open('customer');await p.locator('.customer-order-extra > summary').click();
 form=p.locator('form').filter({has:p.getByRole('heading',{name:'Beri ulasan',exact:true})});
 await form.getByLabel('Penilaian 1–5',{exact:true}).fill('4');
 await form.getByLabel('Catatan singkat',{exact:true}).fill('Synthetic completed-order review');
 await submit(p,form.getByRole('button',{name:'Simpan'}),reviewPath);
 await p.getByText('Penilaian: 4/5 · Synthetic completed-order review',{exact:true}).waitFor();
 assert.equal(db.prepare('SELECT rating FROM order_reviews WHERE order_id=?').get(order.id).rating,4);
 assert.equal((await api('customer',reviewPath,{rating:1,note:'Duplicate'})).status,409);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM order_reviews WHERE order_id=?').get(order.id).n,1);
 console.log('Support and review acceptance passed: browser forms, role privacy, duplicate prevention and persisted resolution.');
 const reportMonth=wibInput(Math.floor(Date.now()/1000)).slice(0,7);
 const ownerReport=await api('owner','/api/workspace/report?month='+reportMonth);assert.equal(ownerReport.status,200);const report=await ownerReport.json();assert.equal(report.finance.gross,150000);
 const managerReport=await api('management','/api/workspace/report?month='+reportMonth);assert.equal(managerReport.status,200);assert.equal(Object.hasOwn(await managerReport.json(),'finance'),false);
 for(const role of ['worker','customer','seller'])assert.equal((await api(role,'/api/workspace/report?month='+reportMonth)).status,403);
 const op=pages.owner;if(await op.locator('#orderDialog').isVisible())await op.locator('#closeDetail').click();
 await op.locator('[data-view="report"]').click();await op.locator('#reportMonth').fill(reportMonth);
 await op.locator('#reportBody').getByText('Omzet pesanan selesai dengan pembagian pendapatan: Rp150.000',{exact:true}).waitFor();
 const csvDownload=op.waitForEvent('download');await op.getByRole('button',{name:'Unduh CSV laporan ini'}).click();const csv=await csvDownload;const csvContents=await readFile(await csv.path(),'utf8');assert.ok(csvContents.includes('"150000"'));assert.match(csvContents,/Omzet pesanan selesai/);
 const download=op.waitForEvent('download');await op.getByRole('button',{name:'Unduh Excel (.xlsx)'}).click();const file=await download;const workbook=await readFile(await file.path());assert.ok(workbook.includes(Buffer.from('<v>150000</v>')));
 await op.evaluate(()=>{window.print=()=>{window.__reportMarkup=document.querySelector('.print-invoice').outerHTML;window.__reportText=document.querySelector('.print-invoice').textContent;};});await op.getByRole('button',{name:'Cetak / simpan PDF'}).click();
 assert.match(await op.evaluate(()=>window.__reportText),/150000/);
 await op.evaluate(()=>{const template=document.createElement('template');template.innerHTML=window.__reportMarkup;document.body.append(template.content);});
 const pdf=await op.pdf({format:'A4'});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');await op.locator('.print-invoice').evaluate(el=>el.remove());
 console.log('Report acceptance passed: real isolated settlement totals, owner-only finance and XLSX/PDF export.');

 const closure=await queue({action:'closure-status',customer_id:id,channel_id:'666666666666666666',ticket_id:'0001'});assert.equal(closure.status,200);assert.equal((await closure.json()).eligible,true);
 p=pages.seller;await addCart(p);await p.getByRole('button',{name:'Buat pesanan',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('pesanan berhasil tercatat'));
 assert.equal(db.prepare('SELECT COUNT(*) n FROM orders WHERE customer_id=?').get(ids.seller).n,1);
 assert.equal((await (await api('seller','/api/orders')).json()).orders.length,1);
 assert.equal((await (await api('customer','/api/orders')).json()).orders.length,1);
 assert.deepEqual(errors,[]);
 // Actual browser/API backed D1 fence: preserve the completed order and its settlement.
 const previousGroups=db.prepare('SELECT COUNT(*) n FROM checkout_groups WHERE customer_id=?').get(id).n;
 const closing={closure_id:'00000000-0000-4000-8000-000000000099',customer_id:id,channel_id:'666666666666666666',ticket_id:'0001'};
 assert.equal((await queue({...closing,action:'closure-begin'})).status,200);
 const request={service_id:'optiwindows',quantity:1,request_id:'fixture-closure-request-001'};
 const blocked=await api('customer','/api/orders',request);assert.equal(blocked.status,409);assert.match((await blocked.json()).error,/sedang ditutup/);
 const cart={request_id:'fixture-closure-checkout-001',items:[{service_id:'optiwindows',quantity:1}]};
 const blockedCart=await api('customer','/api/customer/checkout',cart);assert.equal(blockedCart.status,409);assert.match((await blockedCart.json()).error,/sedang ditutup/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM checkout_groups WHERE customer_id=?').get(id).n,previousGroups);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM orders WHERE customer_id=?').get(id).n,1);
 const finish={...closing,action:'closure-finish',transcript_channel_id:'999999999999999999',transcript_message_id:'999999999999999998'};
 assert.equal((await queue(finish)).status,200);assert.equal((await queue(finish)).status,200);
 assert.equal((await api('customer','/api/orders',request)).status,201);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM orders WHERE customer_id=?').get(id).n,2);
 assert.deepEqual(db.prepare('SELECT worker_share,owner_share,gross FROM order_settlements WHERE order_id=?').get(order.id),settlement);
 console.log('Closure fence E2E passed: single and cart checkout blocked, receipt replay, new checkout after closure, historical settlement unchanged.');
 // Recover an already-committed cart after a retry fails BEFORE transmission.
 // Use synthetic local D1 only; keep the original key and payload locked.
 const cartKey='fixture-cart-recovery-0001',cartItems=[{service_id:'optiwindows',quantity:1}];
 const cartBefore=db.prepare('SELECT COUNT(*) n FROM orders WHERE customer_id=?').get(id).n;
 assert.equal((await call('/api/customer/checkout',JSON.stringify({request_id:cartKey,items:cartItems}))).status,201);
 await page.evaluate(({id,cartKey,cartItems})=>localStorage.setItem('nexo-order-draft-v1:'+id,JSON.stringify({cart:cartItems,cartKey,requestKey:null})),{id,cartKey,cartItems});
 await page.reload();await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='Terhubung.');
 if(await page.locator('#orderDialog').isVisible())await page.locator('#closeDetail').click();await page.locator('[data-view="shop"]').click();
 const retryButton=page.getByRole('button',{name:'Ulangi pengiriman pesanan',exact:true});
 await retryButton.waitFor();
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('nexo-order-draft-v1:'))throw new DOMException('fixture storage failure','QuotaExceededError');return original.call(this,key,value);};window.restoreFixtureStorage=()=>{Storage.prototype.setItem=original;};});
 page.once('dialog',d=>d.accept());
 await retryButton.click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Penyimpanan draft tidak tersedia'));
 await retryButton.waitFor();
 assert.equal(db.prepare('SELECT COUNT(*) n FROM orders WHERE customer_id=?').get(id).n,cartBefore+1);
 await page.evaluate(()=>window.restoreFixtureStorage());
 page.once('dialog',d=>d.accept());
 await retryButton.click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('pesanan berhasil tercatat'));
 assert.equal(db.prepare('SELECT COUNT(*) n FROM orders WHERE customer_id=?').get(id).n,cartBefore+1);
 assert.equal(await page.evaluate(id=>JSON.parse(localStorage.getItem('nexo-order-draft-v1:'+id)).cartKey,id),null);
 console.log('Cart retry storage failure preserves original pending key and replays without creating a duplicate.');
 // Revoke the actual session in the isolated DB while the owner dashboard is open.
 p=pages.owner;await p.reload();await p.waitForFunction(()=>document.querySelector('#status')?.textContent==='Terhubung.');
 assert.equal(await p.locator('#account').isVisible(),true);
 db.prepare('DELETE FROM sessions WHERE user_id=?').run(ids.owner);
 await p.locator('#refresh').click();
 await p.locator('#sessionExpired').waitFor({state:'visible'});
 assert.equal(await p.locator('#account').isVisible(),false);
 assert.equal(await p.locator('#orderDialog').isVisible(),false);
 assert.equal(await p.locator('#sessionExpiredLink').getAttribute('href'),'/portal.html');
 assert.deepEqual(errors,[]);
 console.log('Revoked session browser E2E passed: actual D1 revocation, stale dashboard hidden, re-login required.');
 console.log('Five-role browser backend E2E passed: customer request and receipt, worker claim and evidence, management quote and completion, owner manual verification, seller isolated order, settlement and closure preflight.');

 }finally{for(const c of roleContexts)await c.close();await ctx?.close();db.close();}
}
