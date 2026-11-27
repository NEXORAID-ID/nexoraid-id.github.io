import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../v4/worker.mjs';
const origin='https://nexoraid.example';
const ASSETS={fetch:async r=>{
 const path=new URL(r.url).pathname;
 if(path==='/app.js')return new Response('export {};',{headers:{'content-type':'text/javascript'}});
 const exists=['/index.html','/login.html','/portal.html','/404.html'].includes(path);
 return new Response(r.method==='HEAD'?null:path,{status:exists?200:404,headers:{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'",'cache-control':'max-age=60'}});
}};
test('HTML responses deny embedding and preserve existing CSP and cache policy',async()=>{
 for(const p of ['/','/login.html','/portal.html','/not-found']){
  const r=await worker.fetch(new Request(origin+p),{ASSETS});
  assert.equal(r.status,p==='/not-found'?404:200);
  assert.equal(r.headers.get('x-frame-options'),'DENY');
  assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.match(r.headers.get('content-security-policy'),/default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  assert.equal(r.headers.get('cache-control'),'max-age=60');
  assert.equal(await r.text(),p==='/'?'/index.html':p==='/not-found'?'/404.html':p);
 }
 const h=await worker.fetch(new Request(origin+'/portal.html',{method:'HEAD'}),{ASSETS});
 assert.equal(h.headers.get('x-frame-options'),'DENY');
 assert.equal(await h.text(),'');
});
test('non-HTML assets and public JSON do not receive document policy',async()=>{
 const js=await worker.fetch(new Request(origin+'/app.js'),{ASSETS});
 assert.equal(js.headers.get('x-frame-options'),null);
 const api=await worker.fetch(new Request(origin+'/api/catalog'),{});
 assert.equal(api.status,200);
 assert.equal(api.headers.get('access-control-allow-origin'),'*');
 assert.equal(api.headers.get('x-frame-options'),null);
});
