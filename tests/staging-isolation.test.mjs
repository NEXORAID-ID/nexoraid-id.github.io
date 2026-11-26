import test from 'node:test';
import assert from 'node:assert/strict';
import staging from '../v4/staging-worker.mjs';
test('staging denies authentication, bot endpoints, writes and wrong origins before runtime',async()=>{
 const env={PUBLIC_ORIGIN:'https://nexoraid-v4-staging.example.workers.dev'};
 for(const [url,method] of [['/api/auth/login','GET'],['/api/bot/ticket-queue','POST'],['/api/orders','POST'],['/api/catalog','POST'],['/','GET']]){
  const r=await staging.fetch(new Request(env.PUBLIC_ORIGIN+url,{method}),env);assert.equal(r.status,403);
 }
 assert.equal((await staging.fetch(new Request('https://wrong.invalid/api/health'),env)).status,403);
});
