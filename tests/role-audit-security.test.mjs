import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import worker from '../v4/worker.mjs';

test('role mutation is owner-only, revokes affected sessions and records before/after',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 try{
  const dir=new URL('../v4/migrations/',import.meta.url);
  for(const n of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort())db.exec(await readFile(new URL(n,dir),'utf8'));
  const DB={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return db.prepare(sql).get(...this.args)||null;},async all(){return {results:db.prepare(sql).all(...this.args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...this.args).changes)}};}};},async batch(stmts){db.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
  const owner='111111111111111111',target='222222222222222222',other='333333333333333333',origin='https://fixture.invalid';
  const tokens=['a'.repeat(72),'b'.repeat(72),'c'.repeat(72)];
  for(const [i,id] of [owner,target,other].entries()){
   db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,1)').run(id,'Fixture');
   db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(tokens[i]).digest('hex'),id,Math.floor(Date.now()/1000)+3600);
  }
  const env={DB,PUBLIC_ORIGIN:origin,OWNER_DISCORD_ID:owner};
  const call=(idx,role)=>worker.fetch(new Request(origin+'/api/team/role',{method:'POST',headers:{cookie:'nexo_session='+tokens[idx],origin,'content-type':'application/json'},body:JSON.stringify({user_id:target,role})}),env);
  assert.equal((await call(2,'management')).status,403);
  assert.equal((await call(0,'customer')).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(target).n,1);
  assert.equal((await call(0,'management')).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(target).n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(other).n,1);
  assert.equal(db.prepare('SELECT action FROM audit_events WHERE target_id=?').get(target).action,'role:customer->management');
  assert.equal((await worker.fetch(new Request(origin+'/api/me',{headers:{cookie:'nexo_session='+tokens[1]}}),env)).status,401);
  assert.equal((await call(0,'seller')).status,200);
  assert.deepEqual(db.prepare('SELECT action FROM audit_events WHERE target_id=? ORDER BY id').all(target).map(x=>x.action),['role:customer->management','role:management->seller']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM management_grants WHERE user_id=?').get(target).n,0);
 }finally{db.close();}
});
