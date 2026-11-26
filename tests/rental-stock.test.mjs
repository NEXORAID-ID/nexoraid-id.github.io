import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFile,readdir} from 'node:fs/promises';
test('rental inventory atomic reservation, rollback, terminal release and legacy preservation',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');const dir=new URL('../v4/migrations/',import.meta.url);for(const n of (await readdir(dir)).filter(n=>n.endsWith('.sql')&&n!=='0016_rental_capacity_required.sql').sort())db.exec(await readFile(new URL(n,dir),'utf8'));
 db.exec("INSERT INTO users(id,display_name,created_at) VALUES('owner','owner',1),('c','customer',1)");
 const add=(id,q)=>db.prepare("INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,created_at,updated_at) VALUES(?,'c','cherax-rental-standard',?,'Rp220000',1,1)").run(id,q);
 add('legacy',1);assert.equal(db.prepare('SELECT count(*) n FROM rental_reservations').get().n,0);
 db.exec(await readFile(new URL('0016_rental_capacity_required.sql',dir),'utf8'));
 assert.throws(()=>add('unconfigured',1),/rental_stock_unavailable/);
 assert.equal(db.prepare("SELECT count(*) n FROM orders WHERE id='unconfigured'").get().n,0);
 db.exec("INSERT INTO rental_capacity VALUES('cherax-rental-standard',2,'stock-check','owner',1)");
 add('new',2);assert.throws(()=>add('over',1),/rental_stock_unavailable/);assert.throws(()=>db.exec("UPDATE rental_capacity SET units=1"),/rental_capacity_below_reserved/);
 db.exec("UPDATE orders SET status='cancelled' WHERE id='new'");add('replacement',2);
 assert.equal(db.prepare('SELECT count(*) n FROM rental_reservations').get().n,2);
 assert.equal(db.prepare("SELECT count(*) n FROM orders WHERE id='over'").get().n,0);
 db.close();
});
