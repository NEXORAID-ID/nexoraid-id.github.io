import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
export async function runPortalOfflineE2E(browser){
 const types={'portal.html':'text/html','portal-offline.html':'text/html','portal-sw.js':'text/javascript','portal.webmanifest':'application/manifest+json','portal.mjs':'text/javascript','portal-ui.mjs':'text/javascript','portal.css':'text/css'};
 const assets=Object.fromEntries(await Promise.all(Object.keys(types).map(async name=>[name,await readFile(new URL('../v4/'+name,import.meta.url))])));
 let mutations=0;const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname.slice(1);
  if(req.method!=='GET')mutations++;
  if(assets[path]){res.writeHead(200,{'content-type':types[path],'cache-control':'no-store'});res.end(assets[path]);return;}
  if(path==='api/health'||path==='api/me'){res.writeHead(path==='api/me'?401:200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(path==='api/me'?{error:'Unauthenticated'}:{login_configured:true}));return;}
  res.writeHead(404);res.end();
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin='http://127.0.0.1:'+server.address().port;
 const ctx=await browser.newContext({serviceWorkers:'allow'});const page=await ctx.newPage();
 try{
  await page.goto(origin+'/portal.html');
  await page.locator('#login').waitFor();
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/portal-sw.js',{scope:'/portal.html'});await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  const cache=await page.evaluate(async()=>{const c=await caches.open('nexo-portal-offline-v2');return (await c.keys()).map(r=>new URL(r.url).pathname);});
  assert.deepEqual(cache,['/portal-offline.html']);
  await ctx.setOffline(true);await page.reload();await page.getByRole('heading',{name:'Koneksi terputus'}).waitFor();assert.equal(await page.locator('#account').count(),0);
  assert.equal(await page.evaluate(async()=>{try{await fetch('/api/me');return false;}catch{return true;}}),true);
  await ctx.setOffline(false);await page.getByRole('link',{name:'Coba lagi'}).click();await page.locator('#login').waitFor();assert.equal(mutations,0);
 }finally{await ctx.close();await new Promise(resolve=>server.close(resolve));}
}
