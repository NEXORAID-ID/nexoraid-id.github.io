import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{estimateOrder,roleFor,mayTransition} from '../v4/worker.mjs';
const req=(path,init)=>new Request('https://nexoraid.example'+path,init);
test('V4 public API serves actual catalog and reports unconfigured login',async()=>{const c=await worker.fetch(req('/api/catalog'),{});assert.equal(c.status,200);assert.equal((await c.json()).services.length,140);const h=await worker.fetch(req('/api/health'),{});assert.equal((await h.json()).login_configured,false);});
test('V4 server calculates exact price and rejects manipulated quantities',()=>{assert.equal(estimateOrder('optiwindows',2).estimate,300000);assert.equal(estimateOrder('gta-heist',1).estimate,null);assert.equal(estimateOrder('missing',1),null);assert.equal(estimateOrder('optiwindows',100),null);assert.equal(estimateOrder('optiwindows','2'),null);});
test('V4 private API fails closed without bindings or valid session',async()=>{assert.equal((await worker.fetch(req('/api/orders'),{})).status,503);const env={DB:{},PUBLIC_ORIGIN:'https://nexoraid.example'};assert.equal((await worker.fetch(req('/api/orders'),env)).status,401);assert.equal((await worker.fetch(req('/api/orders',{method:'POST',headers:{origin:'https://other.example'}}),env)).status,403);});
test('V4 role escalation and status transitions are restricted',()=>{const id='123456789012345678';assert.equal(roleFor({id,role:'customer'},{OWNER_DISCORD_ID:id}),'owner');assert.equal(roleFor({id:'other',role:'worker'},{OWNER_DISCORD_ID:id}),'worker');assert.equal(mayTransition('worker','a','b','processing','completed'),false);assert.equal(mayTransition('worker','a','a','claimed','confirmed'),false);assert.equal(mayTransition('owner',null,'o','claimed','confirmed'),true);assert.equal(mayTransition('owner',null,'o','completed','processing'),false);});
test('V4 migration creates order and session tables',async()=>{const {DatabaseSync}=await import('node:sqlite');const {readFile}=await import('node:fs/promises');const db=new DatabaseSync(':memory:');db.exec(await readFile(new URL('../v4/migrations/0001_initial.sql',import.meta.url),'utf8'));const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);for(const name of ['users','sessions','orders','audit_events'])assert.ok(tables.includes(name));db.close();});

test('V4 interactive setup script passes shell syntax check',async()=>{const {spawnSync}=await import('node:child_process');const {fileURLToPath}=await import('node:url');const result=spawnSync('bash',['-n',fileURLToPath(new URL('../v4/scripts/setup.sh',import.meta.url))],{encoding:'utf8'});if(result.error?.code==='ENOENT')return;assert.equal(result.status,0,result.stderr);});

test('V4 serves assets and explicit HTML 404 without swallowing API routes',async()=>{const ASSETS={fetch:async r=>{const p=new URL(r.url).pathname;return new Response(p==='/index.html'?'home':p==='/404.html'?'not found':'missing',{status:['/index.html','/404.html'].includes(p)?200:404,headers:{'content-type':'text/html'}});}};const env={ASSETS};assert.equal(await (await worker.fetch(req('/'),env)).text(),'home');const missing=await worker.fetch(req('/missing'),env);assert.equal(missing.status,404);assert.equal(await missing.text(),'not found');assert.equal((await worker.fetch(req('/api/health',{headers:{'Sec-Fetch-Mode':'navigate'}}),env)).status,503);});

test('Bot endpoint rejects missing key, invalid key, wrong guild and unauthorized route',async()=>{const env={DB:{},PUBLIC_ORIGIN:'https://nexoraid.example'};assert.equal((await worker.fetch(req('/api/bot/orders'),env)).status,503);env.NEXORAID_BOT_API_KEY='a'.repeat(64);assert.equal((await worker.fetch(req('/api/bot/orders'),env)).status,401);const headers={authorization:'Bearer '+env.NEXORAID_BOT_API_KEY,'x-discord-user-id':'996796760112513127','x-discord-guild-id':'0'};assert.equal((await worker.fetch(req('/api/bot/orders',{headers}),env)).status,403);headers['x-discord-guild-id']='1487728359482851348';assert.equal((await worker.fetch(req('/api/bot/team/role',{method:'POST',headers}),env)).status,404);});

test('Management grants migrate non-destructively and owner remains exclusive',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const {readFile}=await import('node:fs/promises');const db=new DatabaseSync(':memory:');db.exec(await readFile(new URL('../v4/migrations/0001_initial.sql',import.meta.url),'utf8'));db.exec("INSERT INTO users(id,display_name,role,created_at) VALUES('123456789012345678','Existing','worker',1)");db.exec(await readFile(new URL('../v4/migrations/0002_management.sql',import.meta.url),'utf8'));assert.equal(db.prepare('SELECT role FROM users').get().role,'worker');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM management_grants').get().n,0);assert.equal(roleFor({id:'other',role:'owner'},{OWNER_DISCORD_ID:'123456789012345678'}),'customer');assert.equal(mayTransition('management',null,'m','claimed','confirmed'),true);assert.equal(mayTransition('management',null,'m','processing','cancelled'),true);assert.equal(mayTransition('customer',null,'c','claimed','confirmed'),false);db.close();
});
test('Owner-only team endpoints reject management, worker and customer and protect owner',async()=>{
 const id='123456789012345678';let role='management';const DB={prepare(sql){return {bind(){return this;},first:async()=>({id:'223456789012345678',display_name:'Test',role})};}};
 const env={DB,PUBLIC_ORIGIN:'https://nexoraid.example',OWNER_DISCORD_ID:id};const headers={cookie:'nexo_session='+'a'.repeat(72),origin:env.PUBLIC_ORIGIN,'content-type':'application/json'};
 for(const r of ['management','worker','customer','seller']){role=r;assert.equal((await worker.fetch(req('/api/team',{headers}),env)).status,403);assert.equal((await worker.fetch(req('/api/team/role',{method:'POST',headers,body:JSON.stringify({user_id:id,role:'management'})}),env)).status,403);}
});

test('OAuth error classification never echoes arbitrary provider response or secrets',async()=>{const {oauthFailure}=await import('../v4/worker.mjs');assert.equal(oauthFailure(400,{error:'invalid_grant'}),'invalid_grant');assert.equal(oauthFailure(401,{error:'invalid_client'}),'invalid_client');assert.equal(oauthFailure(400,{error:'secret-value'}),'provider_error');assert.equal(oauthFailure(429,null),'rate_limited');});
test('Invalid OAuth state redirects to portal and clears state without contacting Discord',async()=>{const env={DB:{},PUBLIC_ORIGIN:'https://nexoraid.example',DISCORD_CLIENT_ID:'123456789012345678',DISCORD_CLIENT_SECRET:'test-secret'};const r=await worker.fetch(req('/api/auth/callback?code=example&state=bad'),env);assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/portal.html?login_error=invalid_state');assert.match(r.headers.get('set-cookie'),/Max-Age=0/);});

test('Discord OAuth uses official form-encoded token endpoint and verifies identity',async()=>{const {discordIdentity}=await import('../v4/worker.mjs');const env={DISCORD_CLIENT_ID:'123456789012345678',DISCORD_CLIENT_SECRET:'test-secret',PUBLIC_ORIGIN:'https://nexoraid.example'};const calls=[];const result=await discordIdentity(env,'test-code',async(url,options)=>{calls.push({url,options});return calls.length===1?Response.json({access_token:'test-token'}):Response.json({id:'123456789012345678',username:'Test'});},()=>{});assert.equal(result.user.id,'123456789012345678');assert.equal(calls[0].url,'https://discord.com/api/oauth2/token');assert.equal(typeof calls[0].options.body,'string');assert.equal(new URLSearchParams(calls[0].options.body).get('redirect_uri'),env.PUBLIC_ORIGIN+'/api/auth/callback');assert.equal(calls[0].options.redirect,'manual');assert.equal(calls[1].options.headers.authorization,'Bearer test-token');});
test('Discord OAuth transport errors are separated by stage without leaking exception messages',async()=>{const {discordIdentity}=await import('../v4/worker.mjs');const env={DISCORD_CLIENT_ID:'123456789012345678',DISCORD_CLIENT_SECRET:'test-secret',PUBLIC_ORIGIN:'https://nexoraid.example'};const logs=[];const report=x=>logs.push(x);let r=await discordIdentity(env,'test-code',async()=>{throw new TypeError('test-secret');},report);assert.equal(r.error,'token_transport');assert.equal(logs.at(-1).stage,'token_request');let count=0;r=await discordIdentity(env,'test-code',async()=>{if(++count===1)return Response.json({access_token:'test-token'});throw new Error('test-token');},report);assert.equal(r.error,'identity_transport');assert.equal(logs.at(-1).stage,'identity_request');assert.doesNotMatch(JSON.stringify(logs),/test-secret|test-token|test-code/);});
test('Discord OAuth reports non-JSON upstream response without raw body',async()=>{const {discordIdentity}=await import('../v4/worker.mjs');const logs=[];const result=await discordIdentity({DISCORD_CLIENT_ID:'123456789012345678',DISCORD_CLIENT_SECRET:'secret',PUBLIC_ORIGIN:'https://nexoraid.example'},'code',async()=>new Response('private detail',{status:403}),x=>logs.push(x));assert.equal(result.error,'provider_error');assert.deepEqual(logs,[{stage:'token_response',reason:'provider_error',status:403,format:'non-json'}]);});

test('Operations migration gates payment and evidence, records exact settlement once, preserves old rows',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const {readFile}=await import('node:fs/promises');const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const name of ['0001_initial.sql','0002_management.sql','0003_operations.sql'])db.exec(await readFile(new URL('../v4/migrations/'+name,import.meta.url),'utf8'));
 db.exec("INSERT INTO users(id,display_name,role,created_at) VALUES('c','Customer','customer',1),('w','Worker','worker',1),('o','Owner','customer',1); INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,status,assigned_to,created_at,updated_at) VALUES('test','c','gta-heist',1,'Rp','confirmed','w',1,1)");
 assert.throws(()=>db.exec("UPDATE orders SET status='processing' WHERE id='test'"),/payment_required/);
 db.exec("INSERT INTO order_finance(order_id,amount,kind,quoted_by,quoted_at) VALUES('test',14999,'joki','o',1); UPDATE order_finance SET state='paid',paid_by='o',paid_at=2,payment_ref='ref1' WHERE order_id='test'; UPDATE orders SET status='processing' WHERE id='test'");
 assert.throws(()=>db.exec("UPDATE orders SET status='completed' WHERE id='test'"),/evidence_required/);
 assert.throws(()=>db.exec("UPDATE orders SET status='cancelled' WHERE id='test'"),/refund_review_required/);
 db.exec("INSERT INTO order_work VALUES('test','w','Verified work',3); UPDATE orders SET status='completed',updated_at=4 WHERE id='test'; UPDATE orders SET status='completed' WHERE id='test'");
 const s=db.prepare('SELECT gross,worker_share,owner_share FROM order_settlements').get();assert.equal(s.gross,14999);assert.equal(s.worker_share,8999);assert.equal(s.owner_share,6000);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_settlements').get().n,1);db.close();
});
test('Operations scope and seller settlement policy are explicit',async()=>{const {scopeFor,financeKind}=await import('../v4/operations.mjs');assert.deepEqual(scopeFor({role:'customer',id:'c'}).args,['c']);assert.deepEqual(scopeFor({role:'worker',id:'w'}).args,['w','w']);assert.equal(financeKind('cherax'),'other');assert.equal(financeKind('seller'),'seller');assert.equal(financeKind('gta-heist'),'joki');assert.equal(mayTransition('worker','w','w','processing','completed'),false);});

test('Four-role API lifecycle with SQLite D1 adapter and real persisted records',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const {readFile}=await import('node:fs/promises');
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const name of ['0001_initial.sql','0002_management.sql','0003_operations.sql','0004_payment_reference.sql','0005_workspace.sql','0006_business.sql','0007_ticket_links.sql','0008_integrity.sql','0009_order_collaboration.sql','0010_checkout.sql','0011_refund_ledger.sql','0012_web_ticket_outbox.sql','0013_processing_refund.sql','0014_cash_ledger.sql','0015_rental_investor_guard.sql','0016_cash_period_controls.sql','0017_payout_approval.sql','0018_order_receipts.sql','0019_rental_capacity_required.sql','0020_variant_parent_guard.sql','0021_ticket_closure_fence.sql','0022_business_accounting.sql'])db.exec(await readFile(new URL('../v4/migrations/'+name,import.meta.url),'utf8'));
 const ids={owner:'111111111111111111',management:'222222222222222222',worker:'333333333333333333',customer:'444444444444444444',other:'555555555555555555'};
 const cookies={};
 for(const [role,id] of Object.entries(ids)){
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id,role,role==='worker'?'worker':'customer',1);
  if(role==='management')db.prepare('INSERT INTO management_grants VALUES(?,?)').run(id,1);
  const token=crypto.randomUUID()+crypto.randomUUID();cookies[role]='nexo_session='+token;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,'0')).join('');
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash,id,Math.floor(Date.now()/1000)+3600);
 }
 const DB={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return db.prepare(sql).get(...this.args)||null;},async all(){return {results:db.prepare(sql).all(...this.args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...this.args).changes)}};}};},async batch(statements){db.exec('BEGIN');try{const out=[];for(const stmt of statements)out.push(await stmt.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={DB,PUBLIC_ORIGIN:'https://nexoraid.example',OWNER_DISCORD_ID:ids.owner,NEXORAID_BOT_API_KEY:'b'.repeat(64),DISCORD_MEMBERSHIP_BOT_TOKEN:'fixture',DISCORD_MEMBERSHIP_FETCH:async url=>{const id=url.split('/').at(-1);return Response.json({user:{id},roles:id===ids.worker?['1511392414516903966']:[]});}};
 let fixtureRequest=0;
 const call=async(role,path,data)=>{if(path==='orders'&&data&&data.request_id===undefined)data={...data,request_id:'fixture-order-'+String(++fixtureRequest).padStart(8,'0')};const headers={cookie:cookies[role],origin:env.PUBLIC_ORIGIN,'content-type':'application/json'};return worker.fetch(req('/api/'+path,{headers,...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})}),env);};
 try{
  for(const role of ['owner','management','worker','customer'])assert.equal((await (await call(role,'me')).json()).user.role,role);
  const created=await call('customer','orders',{service_id:'gta-heist',quantity:1,request_id:'test-order-request-001'});assert.equal(created.status,201);const {order}=await created.json();const id=order.id;
  const replay=await call('customer','orders',{service_id:'gta-heist',quantity:1,request_id:'test-order-request-001'});assert.equal(replay.status,200);assert.equal((await replay.json()).order.id,id);assert.equal((await call('customer','orders',{service_id:'gta-heist',quantity:2,request_id:'test-order-request-001'})).status,409);
  const cartReplay=await call('customer','customer/checkout',{request_id:'test-order-request-001',items:[{service_id:'gta-heist',quantity:1}]});assert.equal(cartReplay.status,200);assert.equal((await cartReplay.json()).orders[0].id,id);
  const botReplay=await worker.fetch(req('/api/bot/orders',{method:'POST',headers:{authorization:'Bearer '+env.NEXORAID_BOT_API_KEY,'x-discord-user-id':ids.customer,'x-discord-guild-id':'1487728359482851348','content-type':'application/json'},body:JSON.stringify({service_id:'gta-heist',quantity:1,request_id:'test-order-request-001'})}),env);assert.equal(botReplay.status,200);assert.equal((await botReplay.json()).order.id,id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM web_ticket_outbox WHERE order_id=?').get(id).n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action='order:create' AND target_id=?").get(id).n,1);
  assert.equal((await (await call('other','orders')).json()).orders.length,0);
  assert.equal((await call('other','orders/'+id)).status,404);
  assert.equal((await call('other','orders/'+id+'/ticket')).status,404);
  assert.equal((await call('customer','orders/'+id+'/ticket',{guild_id:'1487728359482851348',channel_id:'666666666666666666',ticket_id:'0001'})).status,403);
  const ticketBridge=await worker.fetch(req('/api/bot/orders/'+id+'/ticket',{method:'POST',headers:{authorization:'Bearer '+env.NEXORAID_BOT_API_KEY,'x-discord-user-id':ids.customer,'x-discord-guild-id':'1487728359482851348','content-type':'application/json'},body:JSON.stringify({guild_id:'1487728359482851348',channel_id:'666666666666666666',ticket_id:'0001'})}),env);
  assert.equal(ticketBridge.status,403);
  const noLink=await (await call('customer','orders/'+id+'/ticket')).json();assert.equal(noLink.ticket,null);assert.equal(noLink.sync,'queued');
  assert.equal((await (await call('worker','orders')).json()).orders[0].customer_id,null);
  assert.equal((await call('management','team')).status,403);
  assert.equal((await call('customer','orders/'+id+'/claim',{})).status,403);
  assert.equal((await call('worker','workspace/presence',{available:false})).status,200);
  assert.equal((await call('worker','orders/'+id+'/claim',{})).status,409);
  assert.equal((await call('worker','workspace/presence',{available:true})).status,200);
  assert.equal((await call('worker','orders/'+id+'/claim',{})).status,200);
  assert.equal((await call('worker','orders/'+id+'/claim',{})).status,409);
  const deadline=Math.floor(Date.now()/1000)+3600;
  assert.equal((await call('management','collaboration/orders/'+id+'/plan',{priority:'high',due_at:deadline})).status,200);
  assert.equal((await call('customer','collaboration/orders/'+id+'/message',{visibility:'internal',message:'Private'})).status,403);
  assert.equal((await call('management','collaboration/orders/'+id+'/message',{visibility:'internal',message:'Internal note'})).status,200);
  assert.equal((await call('customer','collaboration/orders/'+id+'/message',{visibility:'shared',message:'Hello team'})).status,200);
  const cv=await (await call('customer','collaboration/orders/'+id+'/overview')).json();assert.equal(cv.messages.length,1);assert.equal(cv.plan.priority,'high');
  assert.equal((await call('other','collaboration/orders/'+id+'/overview')).status,404);
  assert.equal((await call('owner','team/role',{user_id:ids.worker,role:'customer'})).status,409);
  assert.equal((await call('management','orders/'+id+'/quote',{amount:15000})).status,200);
  assert.equal((await call('management','orders/'+id+'/status',{status:'confirmed'})).status,200);
  assert.equal((await call('worker','orders/'+id+'/status',{status:'processing'})).status,409);
  assert.equal((await call('management','orders/'+id+'/payment',{amount:15000,reference:'transfer-001'})).status,403);
  assert.equal((await call('owner','orders/'+id+'/payment',{amount:0,reference:'transfer-001'})).status,400);
  assert.equal((await call('other','workspace/orders/'+id+'/receipt',{amount:15000,reference:'claim-001'})).status,404);
  assert.equal((await call('customer','workspace/orders/'+id+'/receipt',{amount:15000,reference:'claim-001'})).status,200);
  assert.equal((await (await call('customer','workspace/orders/'+id+'/timeline')).json()).receipt.reference,'claim-001');
  assert.equal((await call('management','orders/'+id+'/status',{status:'cancelled'})).status,409);
  assert.equal((await call('owner','orders/'+id+'/status',{status:'cancelled'})).status,409);
  assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(id).status,'confirmed');
  assert.equal((await call('management','orders/'+id+'/quote',{amount:20000})).status,409);assert.equal((await call('management','workspace/orders/'+id+'/reject-receipt',{reason:'Not found in provider'})).status,403);assert.equal((await call('owner','workspace/orders/'+id+'/reject-receipt',{reason:'Not found in provider'})).status,200);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rejected_payment_claims').get().n,1);assert.equal((await call('customer','workspace/orders/'+id+'/receipt',{amount:15000,reference:'claim-002'})).status,200);
  const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1]);
  const upload=async(role)=>worker.fetch(req('/api/collaboration/orders/'+id+'/attachment/payment',{method:'POST',headers:{cookie:cookies[role],origin:env.PUBLIC_ORIGIN,'content-type':'image/png'},body:bytes}),env);
  assert.equal((await upload('other')).status,404);assert.equal((await upload('customer')).status,200);
  const attached=(await (await call('customer','collaboration/orders/'+id+'/overview')).json()).attachments[0];
  const download=await call('owner','collaboration/orders/'+id+'/attachment/'+attached.id);assert.equal(download.status,200);assert.equal(download.headers.get('content-type'),'application/octet-stream');assert.equal((await call('worker','collaboration/orders/'+id+'/attachment/'+attached.id)).status,404);
  assert.equal((await call('owner','orders/'+id+'/payment',{amount:5000,reference:'transfer-part-001'})).status,200);
  assert.equal((await call('owner','orders/'+id+'/payment',{amount:5000,reference:'transfer-part-001'})).status,409);
  assert.equal((await call('worker','orders/'+id+'/status',{status:'processing'})).status,409);
  assert.equal((await call('owner','orders/'+id+'/status',{status:'cancelled'})).status,409);
  assert.equal((await call('owner','orders/'+id+'/quote',{amount:20000})).status,409);
  assert.equal((await call('customer','orders/'+id)).status,200);
  assert.equal((await call('owner','orders/'+id+'/payment',{amount:11000,reference:'transfer-001'})).status,200);
  const paidOrder=(await (await call('customer','orders/'+id)).json()).order;
  const botFinance=async(role,method='GET')=>worker.fetch(req('/api/bot/orders/'+id+'/finance',{method,headers:{authorization:'Bearer '+env.NEXORAID_BOT_API_KEY,'x-discord-user-id':ids[role],'x-discord-guild-id':'1487728359482851348'}}),env);
  const bf=await botFinance('customer');assert.equal(bf.status,200);const fin=(await bf.json()).finance;assert.equal(fin.received_amount,16000);assert.equal(fin.overpayment_due,1000);assert.equal('reference' in fin,false);
  assert.equal((await botFinance('other')).status,404);assert.equal((await botFinance('owner','POST')).status,404);
  assert.equal(paidOrder.received_amount,16000);assert.equal(paidOrder.overpayment_due,1000);assert.equal(paidOrder.payment_state,'paid');
  assert.equal((await call('owner','workspace/orders/'+id+'/receipt-refund',{kind:'overpayment',amount:1001,reference:'over-ref-001',confirmed:true})).status,409);
  assert.equal((await call('owner','workspace/orders/'+id+'/receipt-refund',{kind:'overpayment',amount:1000,reference:'over-ref-001',confirmed:true})).status,200);
  assert.equal((await call('worker','orders/'+id+'/status',{status:'processing'})).status,200);
  assert.equal((await call('management','orders/'+id+'/status',{status:'completed'})).status,409);
  const bridge=await worker.fetch(req('/api/bot/orders/'+id+'/evidence',{method:'POST',headers:{authorization:'Bearer '+env.NEXORAID_BOT_API_KEY,'x-discord-user-id':ids.worker,'x-discord-guild-id':'1487728359482851348','content-type':'application/json'},body:JSON.stringify({evidence:'Work completed; reference #1'})}),env);assert.equal(bridge.status,200);
  assert.equal((await call('worker','orders/'+id+'/status',{status:'completed'})).status,403);
  assert.equal((await call('management','orders/'+id+'/status',{status:'completed'})).status,200);
  const finance=await (await call('owner','settlements')).json();assert.equal(finance.settlements[0].worker_share,9000);assert.equal(finance.settlements[0].owner_share,6000);
  assert.equal((await call('customer','settlements')).status,403);assert.equal((await call('management','audit')).status,403);
  const personal=await (await call('worker','settlements')).json();assert.equal(personal.settlements[0].worker_share,9000);assert.equal('owner_share' in personal.settlements[0],false);
  const detail=await (await call('customer','orders/'+id)).json();assert.equal(detail.evidence,null);assert.equal('payment_ref' in detail.order,false);
  const summary=await (await call('owner','dashboard')).json();assert.equal(summary.counts.completed,1);
  const wp=await call('worker','workspace/payouts',{amount:9001});assert.equal(wp.status,409);
  const requested=await call('worker','workspace/payouts',{amount:8000});assert.equal(requested.status,200);const payoutId=(await requested.json()).id;
  assert.equal((await call('worker','workspace/payouts',{amount:1001})).status,409);
  assert.equal((await call('management','workspace/payouts/'+payoutId,{state:'paid',reference:'bank-001'})).status,403);
  assert.equal((await call('owner','workspace/payouts/'+payoutId,{state:'paid',reference:'bank-001'})).status,409);
  assert.equal((await call('owner','workspace/payouts/'+payoutId,{state:'approved',reference:'approve-001'})).status,200);
  assert.equal((await call('owner','workspace/payouts/'+payoutId,{state:'approved',reference:'approve-002'})).status,409);
  const approved=(await (await call('worker','workspace/payouts')).json());
  assert.equal(approved.balance.paid,0);assert.equal(approved.balance.pending,8000);assert.ok(approved.items.find(x=>x.id===payoutId).approved_at);
  assert.equal((await call('owner','workspace/payouts/'+payoutId,{state:'paid',reference:'bank-001'})).status,200);
  assert.equal((await call('owner','workspace/payouts/'+payoutId,{state:'paid',reference:'bank-002'})).status,409);
  assert.equal((await (await call('worker','workspace/payouts')).json()).balance.available,1000);
  assert.equal((await call('other','workspace/orders/'+id+'/review',{rating:5,note:'OK'})).status,404);
  assert.equal((await call('customer','workspace/orders/'+id+'/review',{rating:5,note:'OK'})).status,200);
  assert.equal((await call('customer','workspace/orders/'+id+'/review',{rating:4,note:'Again'})).status,409);
  assert.equal((await call('customer','workspace/orders/'+id+'/support',{kind:'question',message:'Please check the result'})).status,200);
  const cases=await (await call('management','workspace/support')).json();assert.equal(cases.items.length,1);
  assert.equal((await call('management','workspace/support/'+cases.items[0].id,{resolution:'Checked and resolved'})).status,200);
  assert.equal((await call('worker','workspace/expenses',{category:'hosting',amount:500,note:'Hosting',reference:'exp-1'})).status,403);
  assert.equal((await call('owner','workspace/expenses',{category:'hosting',amount:500,note:'Hosting',reference:'exp-1'})).status,200);
  const second=(await (await call('other','orders',{service_id:'gta-heist',quantity:1})).json()).order.id;
  assert.equal((await call('worker','orders/'+second+'/claim',{})).status,200);
  assert.equal((await call('management','orders/'+second+'/quote',{amount:20000})).status,200);
  assert.equal((await call('owner','orders/'+second+'/payment',{amount:20000,reference:'transfer-002'})).status,200);
  assert.equal((await call('management','workspace/orders/'+second+'/refund',{amount:20000,reference:'refund-001'})).status,403);
  assert.equal((await call('owner','workspace/orders/'+second+'/refund',{amount:20000,reference:'refund-001'})).status,200);
  const refunded=(await (await call('other','orders/'+second)).json()).order;assert.equal(refunded.status,'cancelled');assert.equal(refunded.refunded_amount,20000);
  assert.equal((await call('owner','workspace/orders/'+second+'/refund',{amount:20000,reference:'refund-002'})).status,409);
  const report=await (await call('owner','workspace/report')).json();assert.equal(report.finance.refunded,21000);assert.equal(report.finance.recorded_margin,5500);
  assert.equal((await (await call('management','workspace/report')).json()).finance,undefined);
  assert.equal((await call('customer','business/catalog',{service_id:'gta-heist',amount:20000,enabled:true,promo_percent:10})).status,403);
  assert.equal((await call('owner','business/catalog',{service_id:'gta-heist',amount:20000,enabled:true,promo_percent:10})).status,200);
  const adjusted=await (await call('customer','orders',{service_id:'gta-heist',quantity:2})).json();assert.equal(adjusted.order.estimate,36000);
  const supplier=(await (await call('owner','business/suppliers',{name:'Test supplier'})).json()).id;
  assert.equal((await call('owner','business/suppliers/'+supplier,{kind:'deposit',amount:500000,reference:'dep-01',note:'Initial deposit'})).status,200);
  assert.equal((await call('owner','business/suppliers/'+supplier,{kind:'usage',amount:600000,reference:'use-01',note:'Too much'})).status,409);
  assert.equal((await call('owner','business/suppliers/'+supplier,{kind:'usage',amount:100000,reference:'use-02',note:'Purchase'})).status,200);
  assert.equal((await (await call('owner','business/suppliers')).json()).suppliers[0].balance,400000);
  assert.equal((await call('owner','business/investors',{name:'Test investor',amount:10000000,reference:'capital-01'})).status,400);
  const cap=(await (await call('owner','business/investors',{name:'Test investor',amount:10000000,reference:'capital-01',agreement_reference:'signed-test-agreement',received_confirmed:true})).json()).id;
  assert.equal((await call('owner','business/distributions',{capital_id:cap,period:'2026-11',profit:1000000,reference:'distribution-01'})).status,200);
  const inv=await (await call('owner','business/investors')).json();assert.equal(inv.capital[0].returned,50000);assert.equal(inv.distributions[0].investor_share,250000);
  assert.equal((await call('customer','business/investors')).status,403);
  assert.equal((await call('owner','business/investors/post-policy',{capital_id:cap,investor_percent:0,agreement_reference:'signed-after-repayment',confirmed:true})).status,409);
  assert.equal((await call('customer','business/investors/bonus',{capital_id:cap,item:'Streaming gear',quantity:1,value_amount:800000,reference:'bonus-001',confirmed:true})).status,403);
  assert.equal((await call('owner','business/investors/bonus',{capital_id:cap,item:'Streaming gear',quantity:1,value_amount:800000,reference:'bonus-001',confirmed:true})).status,200);
  assert.equal((await call('owner','business/investors/bonus',{capital_id:cap,item:'Streaming gear',quantity:1,value_amount:800000,reference:'bonus-001',confirmed:true})).status,409);
  assert.equal((await call('owner','orders/'+id+'/cost-basis',{amount:2000,reference:'cost-001',note:'Actual supplier cost'})).status,200);
  assert.equal((await call('owner','orders/'+id+'/cost-basis',{amount:1,reference:'cost-002',note:'Duplicate cost'})).status,409);
  const notices=await (await call('customer','business/notifications')).json();assert.ok(notices.items.every(x=>x.target_id!==second));
  assert.equal((await call('customer','business/notifications/read',{last_id:notices.latest})).status,200);
  assert.equal((await (await call('customer','business/notifications')).json()).unread,0);
  assert.equal((await call('owner','team/role',{user_id:ids.worker,role:'customer'})).status,200);
  assert.equal((await call('worker','settlements')).status,200);assert.equal((await (await call('worker','workspace/payouts')).json()).balance.available,1000);assert.equal((await (await call('worker','me')).json()).user.finance_access,true);
  assert.equal((await call('customer','customer/saved',{service_id:'gta-heist',saved:true})).status,200);
  assert.deepEqual((await (await call('other','customer/saved')).json()).saved,[]);
  const basket={request_id:'checkout-test-001',items:[{service_id:'gta-heist',quantity:1},{service_id:'optiwindows',quantity:1}]};
  const checkout=await call('other','customer/checkout',basket);assert.equal(checkout.status,201);const result=await checkout.json();assert.equal(result.orders.length,2);
  const again=await call('other','customer/checkout',basket);assert.equal(again.status,200);assert.equal((await again.json()).checkout_id,result.checkout_id);
  assert.equal((await call('other','customer/checkout',{...basket,items:[{service_id:'gta-heist',quantity:2}]})).status,409);
  assert.equal((await call('other','customer/checkout',{...basket,request_id:'checkout-test-002',items:[...basket.items,{service_id:'cherax',quantity:1}]})).status,429);
  assert.equal((await call('other','orders',{request_id:basket.request_id,service_id:'gta-heist',quantity:1})).status,409);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM checkout_groups WHERE customer_id=? AND request_id=?").get(ids.other,basket.request_id).n,1);
  const refundData={amount:3000,reference:'refund-completed-1',reason:'Customer agreed partial refund',owner_bears_cost:true};
  assert.equal((await call('management','workspace/orders/'+id+'/completed-refund',refundData)).status,403);
  assert.equal((await call('owner','workspace/orders/'+id+'/completed-refund',{...refundData,owner_bears_cost:false})).status,400);
  assert.equal((await call('owner','workspace/orders/'+id+'/completed-refund',refundData)).status,200);
  assert.equal((await call('owner','workspace/orders/'+id+'/completed-refund',refundData)).status,409);
  assert.equal((await call('owner','workspace/orders/'+id+'/completed-refund',{...refundData,amount:13000,reference:'refund-completed-2'})).status,409);
  assert.equal((await (await call('customer','orders/'+id)).json()).order.refunded_amount,3000);
  assert.equal((await (await call('worker','workspace/payouts')).json()).balance.available,1000);
  assert.equal((await (await call('owner','workspace/report')).json()).finance.recorded_margin,2500);
  assert.equal((await call('customer','performance')).status,403);const perf=await (await call('management','performance')).json();assert.equal(perf.items[0].completed,1);assert.equal(perf.items[0].rating,5);
  const hashes=db.prepare('SELECT token_hash,user_id FROM sessions').all();for(const x of hashes)db.prepare('INSERT INTO session_metadata VALUES(?,?,?,?)').run(x.token_hash,crypto.randomUUID(),'Test',1);
  const sessions=await (await call('customer','customer/sessions')).json();assert.equal(sessions.sessions.length,1);assert.equal(sessions.sessions[0].current,true);assert.equal('token_hash' in sessions.sessions[0],false);
  const otherSessions=await (await call('other','customer/sessions')).json();assert.equal((await call('customer','customer/sessions/revoke',{id:otherSessions.sessions[0].public_id})).status,404);
 }finally{db.close();}
});

test('PKCE uses RFC S256 challenge and keeps verifier in secure HTTP-only cookie',async()=>{
 const {pkceChallenge,discordIdentity}=await import('../v4/worker.mjs');
 assert.equal(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
 const env={DB:{},PUBLIC_ORIGIN:'https://nexoraid.example',DISCORD_CLIENT_ID:'123456789012345678',DISCORD_CLIENT_SECRET:'test-secret'};
 const response=await worker.fetch(req('/api/auth/login'),env);assert.equal(response.status,303);const u=new URL(response.headers.get('location'));assert.equal(u.searchParams.get('code_challenge_method'),'S256');
 const cookies=response.headers.get('set-cookie'),verifier=cookies.match(/nexo_pkce=([A-Za-z0-9_-]{43})/)?.[1];assert.ok(verifier);assert.match(cookies,/HttpOnly; Secure; SameSite=Lax/);assert.equal(await pkceChallenge(verifier),u.searchParams.get('code_challenge'));assert.equal(u.search.includes(verifier),false);
 let count=0;const result=await discordIdentity(env,'test-code',async(url,options)=>{if(++count===1){assert.equal(new URLSearchParams(options.body).get('code_verifier'),verifier);return Response.json({access_token:'test-token'});}return Response.json({id:'123456789012345678'});},()=>{},verifier);assert.ok(result.user);
 const state=u.searchParams.get('state');const missing=await worker.fetch(req('/api/auth/callback?code=x&state='+state,{headers:{cookie:'nexo_state='+state}}),env);assert.equal(missing.headers.get('location'),'/portal.html?login_error=invalid_state');
});
test('maintenance rejects write requests without accessing database',async()=>{const env={DB:{},PUBLIC_ORIGIN:'https://nexoraid.example',MAINTENANCE_MODE:'true'};const res=await worker.fetch(req('/api/orders',{method:'POST',headers:{origin:env.PUBLIC_ORIGIN}}),env);assert.equal(res.status,503);});

test('combined release health requires closure, catalog and finance schema guards',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const {readdir,readFile}=await import('node:fs/promises');
 const sql=new DatabaseSync(':memory:');try{
 const dir=new URL('../v4/migrations/',import.meta.url);for(const n of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort())sql.exec(await readFile(new URL(n,dir),'utf8'));
 const DB={prepare(q){return {first:async()=>sql.prepare(q).get()}}};const env={DB,PUBLIC_ORIGIN:'https://nexoraid.example',DISCORD_CLIENT_ID:'123',DISCORD_CLIENT_SECRET:'synthetic'};
 const health=()=>worker.fetch(req('/api/health'),env);
 let response=await health();assert.equal(response.status,200);assert.equal((await response.json()).schema,22);
 sql.exec('DROP TRIGGER ticket_closure_checkout_fence');response=await health();assert.equal(response.status,503);assert.equal((await response.json()).schema,null);
 }finally{sql.close();}
});
