import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import worker from '../v4/worker.mjs';

test('A65 owner suspends account; old sessions and OAuth/bot access denied until reactivation',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 try{
  const dir=new URL('../v4/migrations/',import.meta.url);
  for(const n of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort())db.exec(await readFile(new URL(n,dir),'utf8'));
  const DB={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return db.prepare(sql).get(...this.args)||null;},async all(){return {results:db.prepare(sql).all(...this.args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...this.args).changes)}};}};},async batch(stmts){db.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
  const owner='111111111111111111',target='222222222222222222',other='333333333333333333',origin='https://fixture.invalid';
  const tokens=['a'.repeat(72),'b'.repeat(72),'c'.repeat(72)];
  const hash=s=>createHash('sha256').update(s).digest('hex');
  const expires=Math.floor(Date.now()/1000)+3600;
  for(const [i,id] of [owner,target,other].entries()){
   db.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,1)').run(id,'Fixture');
   db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(tokens[i]),id,expires);
  }
  let oauth=0;
  const key='d'.repeat(64);
  const env={DB,PUBLIC_ORIGIN:origin,OWNER_DISCORD_ID:owner,NEXORAID_BOT_API_KEY:key,DISCORD_CLIENT_ID:'444444444444444444',DISCORD_CLIENT_SECRET:'fixture',DISCORD_OAUTH_FETCH:async()=>Response.json(++oauth===1?{access_token:'fixture'}:oauth===2?{id:target,username:'fixture'}:{roles:[]})};
  const get=(idx,path='/api/me')=>worker.fetch(new Request(origin+path,{headers:{cookie:'nexo_session='+tokens[idx]}}),env);
  const change=(idx,id,suspended)=>worker.fetch(new Request(origin+'/api/team/suspension',{method:'POST',headers:{cookie:'nexo_session='+tokens[idx],origin,'content-type':'application/json'},body:JSON.stringify({user_id:id,suspended})}),env);
  const bot=()=>worker.fetch(new Request(origin+'/api/bot/orders',{headers:{authorization:'Bearer '+key,'x-discord-user-id':target,'x-discord-guild-id':'1487728359482851348'}}),env);
  const state='a'.repeat(72),verifier='b'.repeat(43);
  const login=()=>{oauth=0;return worker.fetch(new Request(origin+'/api/auth/callback?code=fixture&state='+state,{headers:{cookie:'nexo_state='+state+'; nexo_pkce='+verifier}}),env);};
  assert.equal((await change(2,target,true)).status,403);
  assert.equal((await change(0,owner,true)).status,400);
  assert.equal((await get(1)).status,200);
  assert.equal((await change(0,target,true)).status,200);
  assert.equal((await (await change(0,target,true)).json()).changed,false);
  assert.equal((await get(1)).status,401);
  assert.equal((await get(2)).status,200);
  assert.equal((await bot()).status,403);
  assert.match((await login()).headers.get('location'),/account_suspended/);
  assert.throws(()=>db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash('e'.repeat(72)),target,expires),/account_suspended/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(target).n,0);
  assert.equal((await change(0,target,false)).status,200);
  assert.equal((await get(1)).status,401);
  assert.equal((await bot()).status,200);
  const newLogin=await login();assert.equal(newLogin.headers.get('location'),'/portal.html');
  assert.ok(newLogin.headers.getSetCookie().some(s=>s.startsWith('nexo_session=')));
  assert.deepEqual(db.prepare('SELECT action FROM audit_events WHERE target_id=? ORDER BY id').all(target).map(x=>x.action),['account:active->suspended','account:suspended->active']);
 }finally{db.close();}
});
