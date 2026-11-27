import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../v4/worker.mjs';
test('schema 15 freeze blocks all non-health API requests before writes or outbound OAuth',async()=>{
 let reads=0;
 const env={MAINTENANCE_MODE:'true',DB:{prepare(){reads++;throw Error('unexpected database access');}},PUBLIC_ORIGIN:'https://fixture.invalid',DISCORD_OAUTH_FETCH:async()=>{throw Error('unexpected OAuth');}};
 for(const [path,method] of [['/api/auth/login','GET'],['/api/auth/callback','GET'],['/api/auth/logout','POST'],['/api/catalog','GET'],['/api/bot/orders','GET'],['/api/bot/ticket-queue','POST'],['/api/orders','POST'],['/api/me','GET']]){
   const res=await worker.fetch(new Request(env.PUBLIC_ORIGIN+path,{method}),env);
   assert.equal(res.status,503,path);
 }
 assert.equal(reads,0);
});
