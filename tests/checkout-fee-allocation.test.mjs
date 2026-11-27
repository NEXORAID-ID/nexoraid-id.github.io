import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
test('staging allocation persists exactly once; invoice cannot charge an unallocated checkout or bypass pending payment policy',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON');
  const dir=new URL('../v4/migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())db.exec(await readFile(new URL(name,dir),'utf8'));
  db.exec(await readFile(new URL('../v4/candidates/checkout-service-fee.sql',import.meta.url),'utf8'));
  db.exec(await readFile(new URL('../v4/candidates/checkout-fee-allocation.sql',import.meta.url),'utf8'));
  db.exec("INSERT INTO users VALUES('c','customer','customer',1),('w','worker','worker',1),('o','owner','customer',1)");
  const group=db.prepare('INSERT INTO checkout_groups VALUES(?,?,?,?,?,?)');
  const order=db.prepare("INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,estimate,status,assigned_to,created_at,updated_at) VALUES(?,'c',?,1,'Rp100.000',100000,'claimed','w',?,?)");
  const link=db.prepare('INSERT INTO checkout_items VALUES(?,?)');
  group.run('g','c','fixture-key','[]',2,100);order.run('a','optiwindows',100,100);order.run('b','gta-heist',100,100);link.run('g','a');link.run('g','b');
  const quote=db.prepare("INSERT INTO order_finance(order_id,amount,kind,quoted_by,quoted_at) VALUES(?,?,?,'o',101)");
  assert.throws(()=>quote.run('a',100500,'other'),/fee_allocation_required/);
  assert.throws(()=>db.exec("INSERT INTO checkout_fee_allocations VALUES('g','a',0,'o',100)"),/CHECK constraint|fee_allocation_invalid/);
  db.exec("INSERT INTO checkout_fee_allocations VALUES('g','a',500,'o',100)");
  assert.throws(()=>db.exec("INSERT INTO checkout_fee_allocations VALUES('g','b',500,'o',100)"),/UNIQUE constraint/);
  assert.throws(()=>db.exec("UPDATE checkout_fee_allocations SET order_id='b' WHERE checkout_id='g'"),/fee_allocation_immutable/);
  assert.throws(()=>quote.run('a',10000,'other'),/fee_invoice_base_invalid/);
  quote.run('a',100500,'other');quote.run('b',100000,'joki');
  const rows=db.prepare('SELECT * FROM checkout_fee_invoice_components ORDER BY order_id').all().map(r=>({...r}));
  assert.deepEqual(rows,[{order_id:'a',base_amount:100000,service_fee:500,amount:100500},{order_id:'b',base_amount:100000,service_fee:0,amount:100000}]);
  assert.throws(()=>db.exec("INSERT INTO order_receipts VALUES('r','a',100500,'receipt-test','o',102)"),/fee_payment_policy_pending/);
  assert.throws(()=>db.exec("UPDATE order_finance SET state='paid',paid_by='o',paid_at=102,payment_ref='receipt-direct' WHERE order_id='a'"),/fee_payment_policy_pending/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM order_receipts').get().n,0);
 }finally{db.close();}
});
