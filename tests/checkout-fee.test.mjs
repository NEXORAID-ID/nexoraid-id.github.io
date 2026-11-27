import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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
