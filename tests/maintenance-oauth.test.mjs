import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../v4/worker.mjs';
const origin='https://nexoraid.example';
test('maintenance blocks new OAuth login and callback before provider or session writes',async()=>{
 let reads=0,calls=0;
 const env={PUBLIC_ORIGIN:origin,MAINTENANCE_MODE:'true',DISCORD_CLIENT_ID:'123456789012345678',DISCORD_CLIENT_SECRET:'fixture',DB:{prepare(){reads++;throw Error('unexpected DB access');}},DISCORD_OAUTH_FETCH:async()=>{calls++;throw Error('unexpected upstream');}};
 const state=crypto.randomUUID()+crypto.randomUUID(),verifier='a'.repeat(43);
 for(const path of ['/api/auth/login','/api/auth/callback?code=fixture&state='+state]){
  const r=await worker.fetch(new Request(origin+path,{headers:{cookie:'nexo_state='+state+'; nexo_pkce='+verifier}}),env);
  assert.equal(r.status,503);
  const cookies=r.headers.getSetCookie();assert.equal(cookies.length,2);assert.ok(cookies.every(x=>x.includes('Max-Age=0')));
 }
 assert.equal(reads,0);assert.equal(calls,0);
});
test('maintenance leaves existing authenticated read access and health endpoint available',async()=>{
 const env={PUBLIC_ORIGIN:origin,MAINTENANCE_MODE:'true',DB:{prepare(sql){assert.match(sql,/^SELECT /);return {bind(){return this;},async first(){return sql.includes('FROM sessions')?{id:'123456789012345678',role:'customer',display_name:'Fixture'}:null;}};}}};
 const r=await worker.fetch(new Request(origin+'/api/me',{headers:{cookie:'nexo_session='+ 'a'.repeat(72)}}),env);
 assert.equal(r.status,200);assert.equal((await r.json()).user.role,'customer');
 const h=await worker.fetch(new Request(origin+'/api/health'),env);assert.equal((await h.json()).maintenance,true);
});
