import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {createCheckout} from '../v4/customer.mjs';
const customer='444444444444444444',owner='111111111111111111';
async function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 const dir=new URL('../v4/migrations/',import.meta.url);
 for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())db.exec(await readFile(new URL(name,dir),'utf8'));
 for(const id of [customer,owner])db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,1)').run(id,id);
 let beforeBatch;
 const DB={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return db.prepare(sql).get(...this.args)||null;},async all(){return {results:db.prepare(sql).all(...this.args)};},execute(){return {meta:{changes:Number(db.prepare(sql).run(...this.args).changes)}};}};},async batch(statements){if(beforeBatch){const f=beforeBatch;beforeBatch=null;f();}db.exec('BEGIN');try{const out=statements.map(s=>s.execute());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={DB,DISCORD_MEMBERSHIP_BOT_TOKEN:'fixture',DISCORD_MEMBERSHIP_FETCH:async()=>Response.json({user:{id:customer},roles:[]})};
 const items=[{service_id:'optiwindows',quantity:2}];
 const call=(key,opts={})=>createCheckout({env,user:{id:customer},items,key,...opts});
 return {db,call,env,items,hook:f=>{beforeBatch=f;}};
}
test('shared namespace: simultaneous cart/single retry creates one order and one outbox',async()=>{
 const f=await fixture();try{
 const responses=await Promise.all([f.call('shared-request-0001',{single:true}),f.call('shared-request-0001')]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);
 const [a,b]=await Promise.all(responses.map(r=>r.json()));assert.equal(a.order.id,b.orders[0].id);
 for(const table of ['orders','checkout_groups','checkout_items','web_ticket_outbox','audit_events'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+table).get().n,1);
 assert.equal((await f.call('shared-request-0001',{items:[{service_id:'optiwindows',quantity:1}]})).status,409);
 }finally{f.db.close();}
});
test('price snapshot uses override at batch time and replay retains original price',async()=>{
 const f=await fixture();try{
 f.hook(()=>f.db.prepare('INSERT INTO catalog_overrides VALUES(?,?,?,?,?,?)').run('optiwindows',123456,1,25,owner,1));
 const r=await f.call('atomic-price-0001',{single:true});assert.equal(r.status,201);const a=(await r.json()).order;
 assert.equal(a.estimate,185184);assert.equal(a.catalog_price,'Rp92.592');
 f.db.exec("UPDATE catalog_overrides SET amount=100000 WHERE service_id='optiwindows'");
 const b=(await (await f.call('atomic-price-0001')).json()).orders[0];assert.equal(b.estimate,a.estimate);assert.equal(b.catalog_price,a.catalog_price);
 const next=(await (await f.call('atomic-price-0002',{single:true})).json()).order;assert.equal(next.estimate,150000);
 }finally{f.db.close();}
});
test('quota and disabled catalog roll back entire group including audit and ticket outbox',async()=>{
 const f=await fixture();try{
 const key='disabled-cart-0001';f.hook(()=>f.db.prepare('INSERT INTO catalog_overrides VALUES(?,?,?,?,?,?)').run('optiwindows',150000,0,0,owner,1));
 const cart=[{service_id:'gta-heist',quantity:1},...f.items];assert.equal((await f.call(key,{items:cart})).status,409);
 for(const table of ['orders','checkout_groups','checkout_items','web_ticket_outbox','audit_events'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+table).get().n,0);
 f.db.exec("UPDATE catalog_overrides SET enabled=1");
 for(let i=0;i<4;i++)assert.equal((await f.call('quota-request-000'+i,{single:true})).status,201);
 assert.equal((await f.call('quota-cart-00001',{items:cart})).status,429);
 assert.equal((await f.call('quota-request-0000')).status,200);
 assert.equal((await f.call('quota-request-0005',{single:true})).status,201);
 assert.equal((await f.call('quota-request-0006',{single:true})).status,429);
 assert.equal(f.db.prepare('SELECT count(*) n FROM orders').get().n,5);
 }finally{f.db.close();}
});
