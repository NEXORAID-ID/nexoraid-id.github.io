import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {pendingFinancialMigrations} from '../v4/scripts/financial-migration-gate.mjs';
test('combined migration candidate upgrades a nonempty schema 15 without rewriting historical data',async()=>{
 const dir=new URL('../v4/migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(x=>x.endsWith('.sql')).sort();
 const baseline=files.filter(x=>Number(x.slice(0,4))<=15);
 const pending=pendingFinancialMigrations(files,baseline);
 assert.deepEqual(pending.map(x=>Number(x.slice(0,4))),[16,17,18,19,20,21,22]);
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON');
  for(const n of baseline)db.exec(await readFile(new URL(n,dir),'utf8'));
  db.exec("INSERT INTO users(id,display_name,role,created_at) VALUES('c','synthetic','customer',1); INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,estimate,status,created_at,updated_at) VALUES('old-order','c','gta-heist',1,'Rp100.000',100000,'requested',1,1)");
  const before=db.prepare("SELECT * FROM orders WHERE id='old-order'").get();
  for(const n of pending)db.exec(await readFile(new URL(n,dir),'utf8'));
  assert.deepEqual(db.prepare("SELECT * FROM orders WHERE id='old-order'").get(),before);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  const names=new Set(db.prepare("SELECT name FROM sqlite_master").all().map(r=>r.name));
  for(const n of ['ticket_closure_fences','rental_capacity_required','variant_parent_guard','seller_order_fees','investor_post_policies','order_cost_basis'])assert.ok(names.has(n),n);
  assert.throws(()=>db.exec("INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,estimate,status,created_at,updated_at) VALUES('rental','c','cherax-rental-standard',1,'Rp220.000',220000,'requested',2,2)"),/rental_stock_unavailable/);
 }finally{db.close();}
});
