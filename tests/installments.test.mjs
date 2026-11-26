import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFile,readdir} from 'node:fs/promises';
test('installment, overpayment, refund and cash invariants; no legacy backfill',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');const dir=new URL('../v4/migrations/',import.meta.url);for(const n of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())db.exec(await readFile(new URL(n,dir),'utf8'));
 db.exec("INSERT INTO users(id,display_name,created_at) VALUES('o','Owner',1),('c','Customer',1),('w','Worker',1)");
 const add=id=>{db.prepare("INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,status,assigned_to,created_at,updated_at) VALUES(?,'c','gta-heist',1,'Rp15000','confirmed','w',1,1)").run(id);db.prepare("INSERT INTO order_finance(order_id,amount,kind,quoted_by,quoted_at) VALUES(?,15000,'joki','o',1)").run(id);};
 const pay=(id,amount,ref)=>db.prepare("INSERT INTO verified_receipts VALUES(?,?,?,?, 'o',2)").run(ref,id,amount,ref);
 const refund=(id,kind,amount,ref,reason='Dana aktual dikembalikan setelah pengecekan')=>db.prepare("INSERT INTO receipt_adjustments(id,order_id,kind,amount,reference,actor_id,created_at,reason) VALUES(?,?,?,?,?,'o',3,?)").run(ref,id,kind,amount,ref,reason);
 add('a');pay('a',5000,'ref-a1');assert.equal(db.prepare("SELECT state FROM order_finance WHERE order_id='a'").get().state,'quoted');assert.throws(()=>db.exec("UPDATE orders SET status='processing' WHERE id='a'"),/payment_required/);assert.throws(()=>db.exec("UPDATE orders SET status='cancelled' WHERE id='a'"),/partial_refund_required/);assert.throws(()=>db.exec("UPDATE order_finance SET amount=1000 WHERE order_id='a'"),/installment_invoice_locked/);assert.throws(()=>pay('a',5000,'ref-a1'),/UNIQUE/);
 pay('a',12000,'ref-a2');assert.equal(db.prepare("SELECT state FROM order_finance WHERE order_id='a'").get().state,'paid');assert.throws(()=>refund('a','surplus',2001,'refund-too-much'),/adjustment_not_allowed/);assert.throws(()=>refund('a','surplus',2000,'refund-a1','   '),/CHECK constraint/);refund('a','surplus',2000,'refund-a1');assert.match(db.prepare("SELECT reason FROM receipt_adjustments WHERE reference='refund-a1'").get().reason,/Dana aktual/);assert.throws(()=>refund('a','surplus',1,'refund-a2'),/adjustment_not_allowed/);
 db.exec("UPDATE orders SET status='processing' WHERE id='a'; INSERT INTO order_work VALUES('a','w','evidence completed',3); UPDATE orders SET status='completed' WHERE id='a'");assert.equal(db.prepare("SELECT worker_share FROM order_settlements WHERE order_id='a'").get().worker_share,9000);
 add('b');pay('b',3000,'ref-b1');refund('b','partial_cancel',3000,'refund-b1');assert.equal(db.prepare("SELECT status FROM orders WHERE id='b'").get().status,'cancelled');
 add('legacy');db.exec("UPDATE order_finance SET state='paid',paid_by='o',paid_at=2,payment_ref='legacy-ref' WHERE order_id='legacy'");assert.equal(db.prepare("SELECT COUNT(*) AS n FROM verified_receipts WHERE order_id='legacy'").get().n,0);
 assert.equal(db.prepare("SELECT SUM(delta) AS n FROM cash_movements WHERE kind='payment'").get().n,35000);assert.equal(db.prepare("SELECT SUM(delta) AS n FROM cash_movements WHERE kind='refund'").get().n,-5000);assert.equal(db.prepare("SELECT SUM(delta) AS n FROM cash_movements").get().n,30000);db.close();
});

test('receipt adjustment requires owner-confirmed payment and documented reason before writing',async()=>{
 const {installments}=await import('../v4/installments.mjs');
 const id='11111111-1111-4111-8111-111111111111';let writes=0;
 const db={prepare(sql){if(sql.startsWith('SELECT customer_id'))return {bind:()=>({first:async()=>({customer_id:'c',status:'confirmed'})})};return {bind:(...args)=>({sql,args})};},async batch(stmts){writes++;assert.match(stmts[0].sql,/reason/);assert.equal(stmts[0].args.at(-1),'Dana dikembalikan ke pelanggan');}};
 const call=(reason,role='owner')=>installments({p:'/api/workspace/orders/'+id+'/receipt-adjustment',m:'POST',user:{id:role==='owner'?'o':'c',role},env:{DB:db},r:{},readBody:async()=>({confirmed:true,amount:5000,reference:'refund-actual',kind:'surplus',reason})});
 assert.equal((await call('   ')).status,400);assert.equal((await call('pendek')).status,400);assert.equal((await call('x'.repeat(301))).status,400);assert.equal((await call('Dana dikembalikan ke pelanggan','customer')).status,403);assert.equal(writes,0);
 assert.equal((await call('  Dana dikembalikan ke pelanggan  ')).status,201);assert.equal(writes,1);
});
