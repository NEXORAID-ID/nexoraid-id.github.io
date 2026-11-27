import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {retentionReview} from '../v4/retention-review.mjs';
test('retention report counts old records without deleting or exposing contents',async()=>{
 const db=new DatabaseSync(':memory:');
 const at=2000000000,day=86400;
 try{
 db.exec(`CREATE TABLE sessions(expires_at INTEGER);
 CREATE TABLE api_rate_limits(bucket INTEGER);
 CREATE TABLE audit_events(created_at INTEGER);
 CREATE TABLE orders(id TEXT PRIMARY KEY,status TEXT,updated_at INTEGER);
 CREATE TABLE order_attachments(order_id TEXT,created_at INTEGER);
 CREATE TABLE order_messages(order_id TEXT,created_at INTEGER);`);
 for(const [table,field,old,boundary] of [['sessions','expires_at',at-31*day,at-30*day],['api_rate_limits','bucket',Math.floor((at-8*day)/60),Math.floor((at-7*day)/60)],['audit_events','created_at',at-91*day,at-90*day]]){
  const s=db.prepare('INSERT INTO '+table+'('+field+') VALUES(?)');s.run(old);s.run(boundary);
 }
 const order=db.prepare('INSERT INTO orders VALUES(?,?,?)');
 order.run('old','completed',at-181*day);order.run('active','processing',at-181*day);order.run('recent','cancelled',at-10*day);
 for(const table of ['order_attachments','order_messages']){
  const s=db.prepare('INSERT INTO '+table+' VALUES(?,?)');
  s.run('old',at-200*day);s.run('old',at-1);s.run('active',at-200*day);s.run('recent',at-200*day);
 }
 const adapter={prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args);}};}};}};
 const report=await retentionReview(adapter,at);
 assert.equal(report.deletion_enabled,false);assert.equal(report.policy_approved,false);
 assert.deepEqual(report.review_counts,{expired_sessions:1,rate_limits:1,audit_events:1,closed_order_attachments:1,closed_order_messages:1});
 assert.equal(db.prepare('SELECT COUNT(*) n FROM order_attachments').get().n,4);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,2);
 }finally{db.close();}
});
