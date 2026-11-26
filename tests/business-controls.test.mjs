import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFile,readdir} from 'node:fs/promises';
test('owner business policy snapshots and suspension enforce invariant without backfill',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');const dir=new URL('../v4/migrations/',import.meta.url);for(const n of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())db.exec(await readFile(new URL(n,dir),'utf8'));
 db.exec("INSERT INTO users(id,display_name,created_at) VALUES('o','Owner',1),('c','Customer',1),('w','Worker',1); UPDATE users SET role='worker' WHERE id='w';");
 db.exec("INSERT INTO service_policies VALUES('optiwindows',10000,30,'Garansi layanan',10,1,1000,'Promo uji','o',1)");
 db.exec("INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,created_at,updated_at) VALUES('a','c','optiwindows',1,'Rp100000',10,10); UPDATE service_policies SET warranty_days=90 WHERE service_id='optiwindows'");
 const x=db.prepare("SELECT warranty_days,promo_percent,unit_cost FROM order_policy_snapshots WHERE order_id='a'").get();assert.equal(x.warranty_days,30);assert.equal(x.promo_percent,10);assert.equal(x.unit_cost,10000);
 assert.throws(()=>db.exec("UPDATE order_policy_snapshots SET warranty_days=99 WHERE order_id='a'"),/policy_snapshot_immutable/);
 db.exec("INSERT INTO sessions VALUES('hash','c',1000); INSERT INTO account_suspensions VALUES('c','Test suspension','o',1)");assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n,0);assert.throws(()=>db.exec("INSERT INTO sessions VALUES('hash2','c',1000)"),/account_suspended/);
 db.exec("UPDATE orders SET status='claimed',assigned_to='w' WHERE id='a'");assert.throws(()=>db.exec("INSERT INTO account_suspensions VALUES('w','Test suspension','o',1)"),/active_work_requires_reassignment/);db.close();
});
