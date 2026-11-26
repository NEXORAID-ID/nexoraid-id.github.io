// CI-only Worker. Never use this entrypoint for a remote deployment.
// Uses real local D1/workerd bindings, synthetic identities, no Discord calls.
import worker from '../v4/worker.mjs';
const origin='https://staging.invalid',owner='111111111111111111',customer='444444444444444444',guild='1487728359482851348',key='b'.repeat(64);
const token='a'.repeat(72);
const hash=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),n=>n.toString(16).padStart(2,'0')).join('');
export default {async fetch(request,bindings){
 const url=new URL(request.url);
 if(url.pathname==='/ready')return new Response('ready');
 if(url.pathname!=='/run'||bindings.PUBLIC_ORIGIN!==origin)return new Response('not found',{status:404});
 let checks=0;
 const eq=(actual,expected,label)=>{if(actual!==expected)throw Error(label+': expected '+expected+', got '+actual);checks++;};
 const db=bindings.DB;
 const env={DB:db,PUBLIC_ORIGIN:origin,OWNER_DISCORD_ID:owner,NEXORAID_BOT_API_KEY:key,DISCORD_MEMBERSHIP_BOT_TOKEN:'synthetic-local',DISCORD_MEMBERSHIP_FETCH:async url=>Response.json({user:{id:url.split('/').at(-1)},roles:[]})};
 const call=(path,body)=>worker.fetch(new Request(origin+path,{method:'POST',headers:{'content-type':'application/json',...(path.startsWith('/api/bot/')?{authorization:'Bearer '+key,'x-discord-user-id':customer,'x-discord-guild-id':guild}:{origin,cookie:'nexo_session='+token})},body:JSON.stringify(body)}),env);
 const single=(request_id,quantity=1,path='/api/orders')=>call(path,{request_id,service_id:'optiwindows',quantity});
 const cart=(request_id,items)=>call('/api/customer/checkout',{request_id,items});
 const item={service_id:'optiwindows',quantity:1};
 const count=async table=>(await db.prepare('SELECT count(*) AS n FROM '+table).first()).n;
 try{
  await db.batch([db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,1)').bind(owner,'CI owner'),db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,1)').bind(customer,'CI customer'),db.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await hash(token),customer,Math.floor(Date.now()/1000)+600)]);
  const results=await Promise.all([single('cross-route-key-0001'),cart('cross-route-key-0001',[item]),single('cross-route-key-0001',1,'/api/bot/orders')]);
  eq(results.map(r=>r.status).sort().join(','),'200,200,201','cross-route statuses');
  const data=await Promise.all(results.map(r=>r.json()));const id=data[0].order.id;
  eq(data[1].orders[0].id,id,'cart identity');eq(data[2].order.id,id,'bot identity');
  eq(await count('orders'),1,'only one order');eq(await count('web_ticket_outbox'),1,'only one outbox');
  eq((await single('cross-route-key-0001',2)).status,409,'payload conflict');
  await db.prepare('INSERT INTO catalog_overrides VALUES(?,?,?,?,?,?)').bind('optiwindows',123456,1,25,owner,1).run();
  const price=(await (await single('price-snapshot-0001',2)).json()).order;
  eq(price.estimate,185184,'integer promo');
  await db.prepare("UPDATE catalog_overrides SET amount=100000,enabled=0 WHERE service_id='optiwindows'").run();
  eq((await (await single('price-snapshot-0001',2)).json()).order.estimate,185184,'immutable replay');
  eq((await cart('disabled-basket-0001',[{service_id:'gta-heist',quantity:1},item])).status,409,'disabled basket rollback');
  eq(await count('orders'),2,'no partial insert');
  await db.prepare("UPDATE catalog_overrides SET enabled=1 WHERE service_id='optiwindows'").run();
  const remaining=await Promise.all(Array.from({length:5},(_,i)=>single('quota-runtime-000'+i)));
  eq(remaining.map(r=>r.status).sort().join(','),'201,201,201,429,429','concurrent quota');
  eq(await count('orders'),5,'rolling limit');
  return Response.json({ok:true,checks});
 }catch(e){return Response.json({ok:false,checks,error:String(e.message).slice(0,400)},{status:500});}
}};
