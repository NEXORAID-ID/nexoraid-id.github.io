import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {guardedCatalogPrice,catalogPriceBindings,catalogChangedError} from '../v4/catalog-snapshot.mjs';

async function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 for(const f of ['0001_initial.sql','0006_business.sql','0010_checkout.sql']){
  db.exec(await readFile(new URL('../v4/migrations/'+f,import.meta.url),'utf8'));
 }
 db.exec("INSERT INTO users VALUES('c','Customer','customer',1)");
 return db;
}
function insert(db,id,service,override,price,estimate){
 return db.prepare('INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,estimate,created_at,updated_at) VALUES(?,?,?,?,'+guardedCatalogPrice+',?,?,?)')
  .run(id,'c',service,1,...catalogPriceBindings(service,override,price),estimate,1,1);
}
function override(db,service,amount,enabled=1,promo=0){
 db.prepare('INSERT INTO catalog_overrides VALUES(?,?,?,?,?,?) ON CONFLICT(service_id) DO UPDATE SET amount=excluded.amount,enabled=excluded.enabled,promo_percent=excluded.promo_percent').run(service,amount,enabled,promo,'c',1);
}
test('snapshot persists fixed and quoted prices when catalog is unchanged',async()=>{
 const db=await fixture();try{
  insert(db,'a','optiwindows',null,'Rp150.000',150000);
  insert(db,'b','gta-heist',null,'Sesuai Request',null);
  override(db,'other',20000,1,10);
  insert(db,'c','other',{amount:20000,promo_percent:10},'Rp18.000',18000);
  assert.deepEqual(db.prepare('SELECT estimate FROM orders ORDER BY id').all().map(r=>r.estimate),[150000,null,18000]);
  override(db,'other',30000);
  assert.equal(db.prepare("SELECT estimate FROM orders WHERE id='c'").get().estimate,18000);
 }finally{db.close();}
});
test('amount, promotion, disable and deletion invalidate stale prices',async()=>{
 const db=await fixture();try{
  override(db,'other',20000,1,10);
  assert.throws(()=>insert(db,'a','other',null,'Rp10.000',10000),catalogChangedError);
  assert.throws(()=>insert(db,'b','other',{amount:20000,promo_percent:0},'Rp20.000',20000),catalogChangedError);
  override(db,'other',20000,0,10);
  assert.throws(()=>insert(db,'c','other',{amount:20000,promo_percent:10},'Rp18.000',18000),catalogChangedError);
  db.exec("DELETE FROM catalog_overrides WHERE service_id='other'");
  assert.throws(()=>insert(db,'d','other',{amount:20000,promo_percent:10},'Rp18.000',18000),catalogChangedError);
  assert.equal(db.prepare('SELECT count(*) n FROM orders').get().n,0);
 }finally{db.close();}
});
test('stale second cart item rolls back first item, group and audit',async()=>{
 const db=await fixture();try{
  override(db,'second',20000);
  db.exec('BEGIN');
  try{
   db.exec("INSERT INTO checkout_groups VALUES('g','c','request','sig',2,1)");
   insert(db,'first','first',null,'Rp10.000',10000);
   db.exec("INSERT INTO checkout_items VALUES('g','first'); INSERT INTO audit_events(actor_id,action,target_id,created_at) VALUES('c','order:create','first',1)");
   assert.throws(()=>insert(db,'second','second',null,'Rp15.000',15000),catalogChangedError);
  }finally{db.exec('ROLLBACK');}
  for(const table of ['orders','checkout_groups','checkout_items','audit_events'])assert.equal(db.prepare('SELECT count(*) n FROM '+table).get().n,0);
 }finally{db.close();}
});
