import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {OPERATIONAL_TABLES,inventoryQuery,verifyFreshStart} from '../v4/scripts/fresh-start-check.mjs';
const empty=()=>OPERATIONAL_TABLES.map(table_name=>({table_name,n:0}));
test('fresh start accepts complete empty operational inventory but not partial or duplicate inventory',()=>{
 assert.deepEqual(verifyFreshStart(empty()),{ready:true,checked:OPERATIONAL_TABLES.length,nonempty:[]});
 for(const rows of [empty().slice(1),[...empty().slice(1),empty()[1]],empty().map((r,i)=>i? r:{...r,n:'0'}),empty().map((r,i)=>i?r:{...r,n:-1})])assert.throws(()=>verifyFreshStart(rows),/inventory/);
});
test('fresh-start report rejects existing operational rows without exposing data or deleting records',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  for(const name of OPERATIONAL_TABLES)db.exec('CREATE TABLE '+name+'(id TEXT)');
  for(const name of ['users','catalog_overrides','management_grants','cash_opening','rental_capacity'])db.exec("CREATE TABLE "+name+"(id TEXT); INSERT INTO "+name+" VALUES('configuration')");
  assert.equal(verifyFreshStart(db.prepare(inventoryQuery()).all()).ready,true);
  db.exec("INSERT INTO orders VALUES('synthetic'); INSERT INTO order_receipts VALUES('synthetic')");
  assert.deepEqual(verifyFreshStart(db.prepare(inventoryQuery()).all()).nonempty,['order_receipts','orders']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,1);
 }finally{db.close();}
});
