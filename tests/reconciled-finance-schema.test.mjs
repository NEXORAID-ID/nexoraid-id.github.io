import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {pendingFinancialMigrations} from '../v4/scripts/financial-migration-gate.mjs';
test('reconciled finance and closure schema upgrades populated schema 15 through current catalog 18 to 23',async()=>{
 const active=new URL('../v4/migrations/',import.meta.url);
 const candidate=new URL('../v4/candidates/finance-schema/',import.meta.url);
 const baseline=(await readdir(active)).filter(x=>x.endsWith('.sql')).sort();
 const staged=(await readdir(candidate)).filter(x=>x.endsWith('.sql')).sort();
 assert.deepEqual(baseline.map(x=>Number(x.slice(0,4))),Array.from({length:18},(_,i)=>i+1));
 assert.deepEqual(pendingFinancialMigrations([...baseline,...staged],baseline.slice(0,15)).map(x=>Number(x.slice(0,4))),[16,17,18,19,20,21,22,23]);
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON');
  for(const n of baseline.slice(0,15))db.exec(await readFile(new URL(n,active),'utf8'));
  db.exec("INSERT INTO users(id,display_name,role,created_at) VALUES('c','Synthetic','customer',1); INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,estimate,status,created_at,updated_at) VALUES('old-order','c','gta-heist',1,'Rp100.000',100000,'requested',1,1)");
  const before=db.prepare("SELECT * FROM orders WHERE id='old-order'").get();
  for(const n of baseline.slice(15))db.exec(await readFile(new URL(n,active),'utf8'));
  for(const n of staged)db.exec(await readFile(new URL(n,candidate),'utf8'));
  assert.deepEqual(db.prepare("SELECT * FROM orders WHERE id='old-order'").get(),before);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  const names=new Set(db.prepare('SELECT name FROM sqlite_master').all().map(r=>r.name));
  for(const n of ['ticket_closure_fences','rental_capacity_required','variant_parent_guard','seller_order_fees','investor_post_policies','order_cost_basis','service_policies','order_policy_snapshots','cash_period_closes','payout_approvals','order_receipts'])assert.ok(names.has(n),n);
  assert.throws(()=>db.exec("INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,estimate,status,created_at,updated_at) VALUES('rental','c','cherax-rental-standard',1,'Rp220.000',220000,'requested',2,2)"),/rental_stock_unavailable/);
 }finally{db.close();}
});
