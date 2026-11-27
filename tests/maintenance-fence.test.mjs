import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../v4/worker.mjs';

const origin='https://nexoraid.example';
const actor='123456789012345678';
const key='b'.repeat(64);
const headers={authorization:'Bearer '+key,'x-discord-guild-id':'1487728359482851348','x-discord-user-id':actor,'content-type':'application/json'};
const req=(path,method='GET',h=headers)=>new Request(origin+path,{method,headers:h,...(method==='POST'?{body:'{}'}:{})});
test('maintenance rejects authenticated bot mutation before any DB access',async()=>{
 let queries=0;
 const env={PUBLIC_ORIGIN:origin,NEXORAID_BOT_API_KEY:key,MAINTENANCE_MODE:'true',DB:{prepare(){queries++;throw Error('unexpected DB access');}}};
 for(const p of ['/api/bot/orders','/api/bot/orders/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/claim','/api/bot/orders/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/status','/api/bot/orders/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/evidence','/api/bot/orders/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/ticket']){
  assert.equal((await worker.fetch(req(p,'POST'),env)).status,503);
 }
 assert.equal(queries,0);
 assert.equal((await worker.fetch(req('/api/bot/orders','POST',{...headers,authorization:'Bearer invalid'}),env)).status,401);
 assert.equal(queries,0);
});
test('maintenance bot GET cannot provision unknown actor',async()=>{
 const sqls=[];
 const env={PUBLIC_ORIGIN:origin,NEXORAID_BOT_API_KEY:key,MAINTENANCE_MODE:'true',DB:{prepare(sql){sqls.push(sql);return {bind(){return this;},async first(){return null;}};}}};
 assert.equal((await worker.fetch(req('/api/bot/orders'),env)).status,401);
 assert.equal(sqls.length,1);
 assert.match(sqls[0],/^SELECT /);
});
test('maintenance browser writes fail before session or database access',async()=>{
 let queries=0;
 const env={PUBLIC_ORIGIN:origin,MAINTENANCE_MODE:'true',DB:{prepare(){queries++;throw Error('unexpected DB access');}}};
 const h={origin,'content-type':'application/json'};
 for(const p of ['/api/orders','/api/customer/checkout','/api/business/catalog','/api/team/role'])assert.equal((await worker.fetch(req(p,'POST',h),env)).status,503);
 assert.equal(queries,0);
});
