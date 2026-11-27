import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ORDER_TRANSITION_SQL} from '../v4/order-transition.mjs';

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`
 CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT);
 CREATE TABLE management_grants(user_id TEXT PRIMARY KEY);
 CREATE TABLE account_suspensions(user_id TEXT PRIMARY KEY);
 CREATE TABLE orders(id TEXT PRIMARY KEY,status TEXT,assigned_to TEXT,updated_at INTEGER);
 CREATE TABLE order_finance(order_id TEXT PRIMARY KEY,state TEXT);
 CREATE TABLE order_work(order_id TEXT PRIMARY KEY,worker_id TEXT);
 CREATE TABLE payment_claims(order_id TEXT PRIMARY KEY);
 INSERT INTO users VALUES('owner','customer'),('manager','customer'),('worker','worker'),('other','worker');
 INSERT INTO management_grants VALUES('manager');
 INSERT INTO orders VALUES('order','confirmed','worker',0);
 INSERT INTO order_finance VALUES('order','paid');
 INSERT INTO order_work VALUES('order','worker');
 `);
 const transition=(role,actor,from='confirmed',to='processing',assignee='worker')=>
  Number(db.prepare(ORDER_TRANSITION_SQL).run(to,1,'order',from,assignee,to,to,to,role,actor,role,actor,role,actor,actor).changes);
 return {db,transition};
}
test('A74 denies cross-worker status updates and stale roles',()=>{
 const {db,transition:t}=fixture();try{
 assert.equal(t('worker','other'),0);
 db.exec("DELETE FROM management_grants WHERE user_id='manager'");
 assert.equal(t('management','manager'),0);
 db.exec("UPDATE users SET role='customer' WHERE id='worker'");
 assert.equal(t('worker','worker'),0);
 assert.equal(t('owner','owner'),1);
 }finally{db.close();}
});
test('A75 rejects stale payment/evidence and replayed transitions',()=>{
 const {db,transition:t}=fixture();try{
 db.exec("UPDATE order_finance SET state='pending'");
 assert.equal(t('worker','worker'),0);
 db.exec("UPDATE order_finance SET state='paid'");
 assert.equal(t('worker','worker'),1);
 assert.equal(t('worker','worker'),0);
 db.exec("DELETE FROM order_work");
 assert.equal(t('owner','owner','processing','completed'),0);
 db.exec("INSERT INTO order_work VALUES('order','other')");
 assert.equal(t('owner','owner','processing','completed'),0);
 db.exec("UPDATE order_work SET worker_id='worker'");
 assert.equal(t('owner','owner','processing','completed'),1);
 }finally{db.close();}
});
test('A75 denies cancellation when payment arrives after authorization',()=>{
 const {db,transition:t}=fixture();try{
 assert.equal(t('owner','owner','confirmed','cancelled'),0);
 db.exec("UPDATE order_finance SET state='pending'; INSERT INTO payment_claims VALUES('order')");
 assert.equal(t('owner','owner','confirmed','cancelled'),0);
 db.exec("DELETE FROM payment_claims");
 assert.equal(t('owner','owner','confirmed','cancelled'),1);
 assert.equal(t('owner','owner','confirmed','cancelled'),0);
 }finally{db.close();}
});

test('A65/A75 suspension committed after authorization prevents status write',()=>{
 const {db,transition:t}=fixture();try{
 db.exec("INSERT INTO account_suspensions VALUES('worker')");
 assert.equal(t('worker','worker'),0);
 db.exec("DELETE FROM account_suspensions");
 assert.equal(t('worker','worker'),1);
 }finally{db.close();}
});
