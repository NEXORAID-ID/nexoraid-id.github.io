import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {feeTrialEnabled,trialQuote} from '../v4/checkout-fee-trial.mjs';
async function fixture({prequote=true}={}){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 try{
 const dir=new URL('../v4/migrations/',import.meta.url);
 for(const n of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort())db.exec(await readFile(new URL(n,dir),'utf8'));
 for(const n of ['checkout-service-fee.sql','checkout-fee-allocation.sql','checkout-fee-policy-trial.sql'])db.exec(await readFile(new URL('../v4/candidates/'+n,import.meta.url),'utf8'));
 db.exec("INSERT INTO users VALUES('c','customer','customer',1),('w','worker','worker',1),('o','owner','customer',1)");
 db.exec("INSERT INTO checkout_groups VALUES('g','c','fixture-key','[]',2,100)");
 for(const [id,service] of [['a','gta-heist'],['b','optiwindows']]){
 db.prepare("INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,estimate,status,assigned_to,created_at,updated_at) VALUES(?,'c',?,1,'Rp100.000',100000,'claimed','w',100,100)").run(id,service);
 db.prepare("INSERT INTO checkout_items VALUES('g',?)").run(id);
 }
 if(prequote){db.exec("INSERT INTO checkout_fee_allocations VALUES('g','a',500,'o',101)");
 db.exec("INSERT INTO order_finance(order_id,amount,kind,quoted_by,quoted_at) VALUES('a',100500,'joki','o',101),('b',100000,'other','o',101)");}
 const receipt=(id,amount,t)=>db.prepare("INSERT INTO order_receipts VALUES(?,'a',?,?,'o',?)").run(id,amount,'receipt-'+id,t);
 const ledger=()=>({...db.prepare("SELECT * FROM checkout_fee_ledger_components WHERE order_id='a'").get()});
 return {db,receipt,ledger};
 }catch(e){db.close();throw e;}
}
test('fee trial: actual installments, principal-only 60/40, excess refund and full completed refund reconcile',async()=>{
 const {db,receipt,ledger}=await fixture();try{
 assert.throws(()=>db.exec("UPDATE order_finance SET state='paid',paid_by='o',paid_at=102,payment_ref='fake-ref' WHERE order_id='a'"),/fee_receipt_required/);
 receipt('r1',100000,102);assert.equal(ledger().fee_received,0);
 assert.equal(db.prepare("SELECT state FROM order_finance WHERE order_id='a'").get().state,'quoted');
 receipt('r2',700,103);assert.equal(ledger().fee_received,500);
 db.exec("UPDATE orders SET status='confirmed',updated_at=104 WHERE id='a'; UPDATE orders SET status='processing',updated_at=105 WHERE id='a'; INSERT INTO order_work VALUES('a','w','synthetic work evidence',106); UPDATE orders SET status='completed',updated_at=107 WHERE id='a'");
 const split=db.prepare("SELECT gross,worker_share,owner_share FROM order_settlements WHERE order_id='a'").get();
 assert.deepEqual({...split},{gross:100500,worker_share:60000,owner_share:40500});
 db.exec("INSERT INTO receipt_refunds VALUES('e','a','overpayment',200,'refund-excess','o',108)");
 db.exec("INSERT INTO completed_refunds VALUES('f1','a',100000,'refund-base','synthetic refund reason','o',109)");
 assert.equal(ledger().base_refunded,100000);assert.equal(ledger().fee_net,500);
 db.exec("INSERT INTO completed_refunds VALUES('f2','a',500,'refund-fee','synthetic refund reason','o',110)");
 assert.equal(ledger().fee_net,0);assert.equal(ledger().excess_returned,200);
 assert.throws(()=>db.exec("INSERT INTO completed_refunds VALUES('f3','a',1,'refund-extra','synthetic refund reason','o',111)"),/refund_limit/);
 assert.equal(db.prepare("SELECT SUM(delta) n FROM cash_order_movements").get().n,0);
 }finally{db.close();}
});
test('fee trial: full cancellation returns fee; partial cancellation returns only actual receipt',async()=>{
 for(const amount of [100250,100500]){
 const {db,receipt,ledger}=await fixture();try{
 receipt('r1',amount,102);
 if(amount===100500)db.exec("INSERT INTO order_refunds VALUES('a',100500,'refund-full','o',103)");
 else db.exec("INSERT INTO receipt_refunds VALUES('r','a','partial_cancel',100250,'refund-partial','o',103)");
 assert.equal(ledger().invoice_refunded,amount);assert.equal(ledger().fee_net,0);
 assert.equal(db.prepare("SELECT status FROM orders WHERE id='a'").get().status,'cancelled');
 assert.equal(db.prepare("SELECT SUM(delta) n FROM cash_order_movements").get().n,0);
 }finally{db.close();}
 }
});

test('atomic quote assigns fee once, subsequent quote and re-quote never duplicate it',async()=>{
 const {db}=await fixture({prequote:false});try{
 const DB={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},execute(){return {meta:{changes:Number(db.prepare(sql).run(...this.args).changes)}};}};},async batch(stmts){db.exec('BEGIN');try{const out=stmts.map(s=>s.execute());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const quote=(id,amount,kind)=>trialQuote(DB,{id,amount,kind,actor:'o',time:101});
 assert.equal(feeTrialEnabled({CHECKOUT_FEE_POLICY_TRIAL:'true',PUBLIC_ORIGIN:'https://production.invalid'}),false);
 assert.equal(feeTrialEnabled({CHECKOUT_FEE_POLICY_TRIAL:'true',PUBLIC_ORIGIN:'https://staging.invalid'}),true);
 assert.equal(await quote('a',100000,'joki'),true);
 assert.equal(await quote('b',100000,'other'),true);
 assert.equal(await quote('a',110000,'joki'),true);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM checkout_fee_allocations').get().n,1);
 assert.equal(db.prepare('SELECT SUM(amount) n FROM order_finance').get().n,210500);
 db.exec("INSERT INTO order_receipts VALUES('r','a',1,'receipt-lock','o',102)");
 assert.equal(await quote('a',100000,'joki'),false);
 assert.equal(db.prepare("SELECT amount FROM order_finance WHERE order_id='a'").get().amount,110500);
 }finally{db.close();}
});
