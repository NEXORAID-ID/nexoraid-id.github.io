import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../v4/worker.mjs';
import {publicRateLimit} from '../v4/public-rate-limit.mjs';
import {configurePublicLimits} from '../v4/scripts/public-limit-config.mjs';
const origin='https://nexoraid.example';
const request=(path,ip='192.0.2.10')=>new Request(origin+path,{headers:ip?{'cf-connecting-ip':ip}:{}});
test('public edge limit denies excessive catalog and OAuth before DB or upstream',async()=>{
 let db=0,upstream=0;const keys=[];
 const limiter={async limit({key}){keys.push(key);return {success:false};}};
 const env={PUBLIC_ORIGIN:origin,PUBLIC_RATE_LIMIT_REQUIRED:'true',PUBLIC_CATALOG_LIMIT:limiter,PUBLIC_OAUTH_LIMIT:limiter,DB:{prepare(){db++;throw Error('unexpected DB');}},DISCORD_OAUTH_FETCH:async()=>{upstream++;throw Error('unexpected upstream');}};
 for(const path of ['/api/catalog','/api/auth/login','/api/auth/callback?code=fixture']){
  const r=await worker.fetch(request(path),env);assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'60');
 }
 assert.equal(db,0);assert.equal(upstream,0);assert.equal(new Set(keys).size,1);assert.match(keys[0],/^[a-f0-9]{64}$/);assert.ok(!keys[0].includes('192.0.2.10'));
});
test('successful limit permits catalog and distinguishes addresses without sending raw IP',async()=>{
 const keys=[];const env={PUBLIC_RATE_LIMIT_REQUIRED:'true',PUBLIC_CATALOG_LIMIT:{async limit({key}){keys.push(key);return {success:true};}}};
 for(const ip of ['192.0.2.10','192.0.2.11'])assert.equal((await worker.fetch(request('/api/catalog',ip),env)).status,200);
 assert.notEqual(keys[0],keys[1]);assert.ok(keys.every(k=>/^[a-f0-9]{64}$/.test(k)));
});
test('required binding and invalid edge address fail closed; no limiter affects health or private API',async()=>{
 const r=request('/api/catalog','');const env={PUBLIC_RATE_LIMIT_REQUIRED:'true'};
 assert.equal((await worker.fetch(r,env)).status,503);
 assert.equal((await publicRateLimit(r,{...env,PUBLIC_CATALOG_LIMIT:{limit:async()=>({success:true})}},'/api/catalog','GET')).status,503);
 assert.equal((await publicRateLimit(request('/api/catalog'),{...env,PUBLIC_CATALOG_LIMIT:{limit:async()=>{throw Error('fixture')}}},'/api/catalog','GET')).status,503);
 assert.equal(await publicRateLimit(request('/api/health'),env,'/api/health','GET'),null);
 assert.equal(await publicRateLimit(request('/api/orders'),env,'/api/orders','POST'),null);
});
test('configuration is idempotent, unique and separates catalog and OAuth limits',()=>{
 const c={d1_databases:[{binding:'DB',database_id:'11111111-1111-4111-8111-111111111111'}],vars:{OTHER:'keep'},ratelimits:[{name:'OTHER',namespace_id:'1',simple:{limit:10,period:60}}]};
 configurePublicLimits(c);const snapshot=JSON.stringify(c);configurePublicLimits(c);assert.equal(JSON.stringify(c),snapshot);assert.equal(c.vars.OTHER,'keep');assert.equal(c.vars.PUBLIC_RATE_LIMIT_REQUIRED,'true');assert.equal(c.ratelimits.length,3);assert.equal(new Set(c.ratelimits.map(x=>x.namespace_id)).size,3);
 assert.equal(c.ratelimits.find(x=>x.name==='PUBLIC_OAUTH_LIMIT').simple.limit,20);
});
