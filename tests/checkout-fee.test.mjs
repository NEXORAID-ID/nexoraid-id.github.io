import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createCheckout} from '../v4/customer.mjs';
import {DatabaseSync} from 'node:sqlite';
import {checkoutTotals,CHECKOUT_SERVICE_FEE} from '../v4/checkout-fee.mjs';
const item=(id,estimate)=>({id,estimate});
test('one Rp500 fee for one or multiple paid order lines; existing quantity totals are not multiplied again',()=>{
 assert.equal(CHECKOUT_SERVICE_FEE,500);
 assert.deepEqual(checkoutTotals([item('a',150000)]),{subtotal:150000,known_subtotal:150000,unknown_count:0,service_fee:500,total:150500});
 assert.equal(checkoutTotals([item('a',5000),item('b',10000)]).total,15500);
 assert.equal(checkoutTotals([item('a',300000)]).total,300500);
});
test('promo-adjusted base is used; free downloads and historical checkout policy are not charged',()=>{
 assert.equal(checkoutTotals([item('a',75000)]).total,75500);
 assert.equal(checkoutTotals([item('a',0)]).total,0);
 assert.equal(checkoutTotals([item('a',150000)],{fee:0}).total,150000);
});
test('request price is pending, not a false fixed invoice',()=>{
 assert.deepEqual(checkoutTotals([item('a',10000),item('b',null)]),{subtotal:null,known_subtotal:10000,unknown_count:1,service_fee:500,total:null});
 assert.equal(checkoutTotals([item('a',null)]).total,null);
});
test('reject duplicate orders, invalid amounts and integer overflow',()=>{
 for(const rows of [[],[item('a',-1)],[item('a',1.5)],[item('a',1),item('a',2)],[item('a',Number.MAX_SAFE_INTEGER)]])assert.throws(()=>checkoutTotals(rows));
 assert.throws(()=>checkoutTotals([item('a',1)],{fee:1000}));
});
test('candidate SQL snapshots new groups once and preserves old checkout history',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE checkout_groups(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL,request_id TEXT NOT NULL,signature TEXT NOT NULL,item_count INTEGER NOT NULL,created_at INTEGER NOT NULL,UNIQUE(customer_id,request_id));');
  const add=db.prepare('INSERT INTO checkout_groups VALUES(?,?,?,?,?,?)');add.run('old','c','old-key','[]',1,1);
  db.exec(await readFile(new URL('../v4/candidates/checkout-service-fee.sql',import.meta.url),'utf8'));
  add.run('new','c','new-key','[]',2,2);
  assert.deepEqual({...db.prepare('SELECT * FROM checkout_service_fees WHERE checkout_id=?').get('new')},{checkout_id:'new',amount:500,created_at:2});
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM checkout_service_fees WHERE checkout_id=?').get('old').n,0);
  assert.throws(()=>add.run('retry','c','new-key','[]',2,3),/UNIQUE/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM checkout_service_fees').get().n,1);
  assert.throws(()=>db.exec("UPDATE checkout_service_fees SET amount=0 WHERE checkout_id='new'"),/checkout_service_fee_immutable/);
  assert.throws(()=>db.exec("DELETE FROM checkout_service_fees WHERE checkout_id='new'"),/checkout_service_fee_immutable/);
 }finally{db.close();}
});

test('real checkout transaction and replay expose only opt-in persisted group fee estimates',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON');
  const dir=new URL('../v4/migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())db.exec(await readFile(new URL(name,dir),'utf8'));
  const user={id:'123456789012345678',role:'customer'};
  db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)').run(user.id,'Fixture',1);
  const DB={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return db.prepare(sql).get(...this.args)||null;},async all(){return {results:db.prepare(sql).all(...this.args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...this.args).changes)}};}};},async batch(stmts){db.exec('BEGIN');try{const r=[];for(const stmt of stmts)r.push(await stmt.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
  const env={DB,DISCORD_MEMBERSHIP_BOT_TOKEN:'fixture',DISCORD_MEMBERSHIP_FETCH:async()=>Response.json({user:{id:user.id},roles:[]})};
  const items=[{service_id:'optiwindows',quantity:1}];
  const call=(key,items,single=false)=>createCheckout({env,user,items,key,single});
  const old=await call('legacy-checkout-0001',items,true);assert.equal(old.status,201);assert.equal((await old.json()).checkout_pricing,undefined);
  env.CHECKOUT_FEE_PREVIEW='true';
  const blocked=await call('blocked-checkout-001',items,true);
  assert.equal(blocked.status,503);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM checkout_groups').get().n,1);
  db.exec(await readFile(new URL('../v4/candidates/checkout-service-fee.sql',import.meta.url),'utf8'));
  db.exec('DROP TRIGGER checkout_service_fee_snapshot');
  assert.equal((await call('blocked-checkout-002',items,true)).status,503);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM checkout_groups').get().n,1);
  db.exec('CREATE TRIGGER checkout_service_fee_snapshot AFTER INSERT ON checkout_groups BEGIN INSERT INTO checkout_service_fees VALUES(NEW.id,500,NEW.created_at); END;');
  const historic=await (await call('legacy-checkout-0001',items,true)).json();
  assert.equal(historic.checkout_pricing.service_fee,0);assert.equal(historic.checkout_pricing.fee_snapshot_present,false);
  const res=await call('new-fee-checkout-001',items,true);assert.equal(res.status,201);
  const fresh=await res.json();assert.equal(fresh.order.estimate,150000);assert.equal(fresh.checkout_pricing.total,150500);assert.equal(fresh.checkout_pricing.status,'estimate_only');
  const replay=await call('new-fee-checkout-001',items);assert.equal(replay.status,200);
  const repeated=await replay.json();assert.deepEqual(repeated.checkout_pricing,fresh.checkout_pricing);assert.equal(repeated.orders[0].id,fresh.order.id);
  const multi=await call('new-fee-checkout-002',[{service_id:'optiwindows',quantity:2},{service_id:'gta-heist',quantity:1}]);assert.equal(multi.status,201);
  const m=await multi.json();assert.equal(m.checkout_pricing.service_fee,500);assert.equal(m.checkout_pricing.total,null);assert.equal(m.checkout_pricing.known_subtotal,300000);assert.equal(m.checkout_pricing.unknown_count,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM checkout_service_fees').get().n,2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_finance').get().n,0);
 }finally{db.close();}
});
