// Run after npm run build, with playwright and Chromium installed.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const port=4173;const url='http://127.0.0.1:'+port+'/';
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
let browser;
try{
  for(let i=0;i<40;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'index.html');await page.locator('#homeSearchInput').waitFor({timeout:10000});assert.deepEqual(errors,[]);assert.equal(await page.locator('#featuredServices [data-compare]').count(),0);
  await page.locator('#homeSearchInput').fill('OptiWindows');await page.locator('#homeSearchResults [data-suggestion]').first().waitFor();assert.match(await page.locator('#homeSearchResults').innerText(),/OptiWindows/i);await page.keyboard.press('Escape');
  await page.locator('#navToggle').click();assert.equal(await page.locator('#navToggle').getAttribute('aria-expanded'),'true');assert.ok(await page.locator('#accountNav').isVisible());assert.equal(await page.locator('#accountNav').getAttribute('href'),'login.html');await page.keyboard.press('Escape');
  await page.goto(url+'login.html');assert.ok(await page.locator('#login').isVisible());assert.equal(await page.locator('#login').getAttribute('href'),'https://nexoraid-v4.nexoraid.workers.dev/api/auth/login');assert.deepEqual(await page.locator('.role-grid strong').allTextContents(),['Pelanggan','Penjoki','Manajemen','Pemilik','Penjual']);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.goto(url+'layanan.html?category=software');
  await page.locator('#serviceGrid [data-basket="optiwindows"]').waitFor();
  await page.locator('#serviceGrid [data-compare="optiwindows"]').click();
  await page.reload();await page.locator('#serviceGrid [data-compare="optiwindows"][aria-pressed="true"]').waitFor();
  await page.locator('#serviceGrid [data-favorite="optiwindows"]').click();
  await page.locator('#savedOnly').check();await page.locator('#serviceGrid [data-basket="optiwindows"]').waitFor();assert.equal(await page.locator('#serviceGrid article').count(),1);
  await page.locator('#serviceGrid [data-basket="optiwindows"]').click();await page.goto(url+'keranjang.html');await page.locator('[data-quantity="optiwindows"]').waitFor();
  await page.locator('[data-quantity="optiwindows"]').fill('2');await page.locator('[data-quantity="optiwindows"]').press('Tab');
  assert.match(await page.locator('#basketTotal').innerText(),/300\.000/);
  await page.goto(url+'layanan-gta-heist.html');await page.locator('#orderVariant').waitFor();await page.locator('#orderVariant').selectOption({index:1});assert.match(await page.locator('#orderEstimate').innerText(),/2\.500/);
  await page.goto(url+'detail.html?id=optiwindows');await page.locator('#orderQuantity').waitFor();assert.match(await page.locator('h1').innerText(),/OptiWindows/);assert.equal(await page.locator('.related-section [data-compare]').count(),0);
  for(const name of ['harga','promo','tentang','kontak','kebijakan','cara-order','seller','faq']){const response=await page.goto(url+name+'.html');assert.ok(response.ok(),name);await page.locator('h1').waitFor();}
  assert.deepEqual(errors,[]);
  const desktop=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const desktopPage=await desktop.newPage();desktopPage.on('pageerror',e=>errors.push(e.message));
  await desktopPage.goto(url+'index.html');await desktopPage.locator('#homeSearchInput').waitFor();assert.ok(await desktopPage.locator('#navMenu').isVisible());assert.ok(await desktopPage.locator('#accountNav').isVisible());assert.equal(await desktopPage.locator('#accountNav').getAttribute('href'),'login.html');
  await desktopPage.goto(url+'login.html');assert.ok(await desktopPage.locator('#login').isVisible());assert.ok(await desktopPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // Exercise the authenticated portal with controlled API fixtures, never production user data.
  const {readFile}=await import('node:fs/promises');
  const portalFiles=Object.fromEntries(await Promise.all(['portal.html','portal.css','portal.mjs'].map(async name=>[name,await readFile(new URL('../v4/'+name,import.meta.url),'utf8')])));
  for(const role of ['owner','management','worker','seller','customer']){
   const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
   const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
   await p.route('**/portal.html',r=>r.fulfill({contentType:'text/html',body:portalFiles['portal.html']}));
   await p.route('**/portal.css',r=>r.fulfill({contentType:'text/css',body:portalFiles['portal.css']}));
   await p.route('**/portal.mjs',r=>r.fulfill({contentType:'text/javascript',body:portalFiles['portal.mjs']}));
   const order={id:'11111111-1111-4111-8111-111111111111',service_id:'gta-heist',quantity:1,status:'requested',customer_id:role==='seller'?'seller-id':'customer-id',created_at:1,estimate:15000,invoice_amount:null,payment_state:null};
   await p.route('**/api/**',r=>{const path=new URL(r.request().url()).pathname;let data;
    if(path==='/api/health')data={login_configured:true};else if(path==='/api/me')data={user:{id:role+'-id',role,display_name:'Test '+role}};else if(path==='/api/catalog'||path==='/api/business/catalog')data={services:[{id:'gta-heist',name:'Heist',price:'Rp15.000'}]};else if(path==='/api/orders')data={orders:[order],next:null};else if(path==='/api/customer/saved')data={saved:[]};else if(path==='/api/customer/sessions')data={sessions:[{public_id:'session-1',device:'Windows · Chrome',current:true,expires_at:1900000000}]};else if(path==='/api/performance')data={items:[],scope:role==='worker'?'personal':'team'};else if(path==='/api/business/notifications')data={items:[],unread:0,latest:0};else if(path==='/api/dashboard')data={counts:{requested:1},total:1};else if(path==='/api/orders/'+order.id)data={order,evidence:null};else if(path.endsWith('/overview'))data={messages:[],attachments:[],plan:null};else if(path.endsWith('/ticket'))data={ticket:null,can_link:['customer','seller'].includes(role)};else if(path.endsWith('/timeline'))data={events:[{action:'order:create',created_at:1}],receipt:null,review:null,refund:null};else if(path==='/api/workspace/support')data={items:[],next:null};else if(path==='/api/workspace/payouts')data={items:[],next:null,balance:{earned:0,pending:0,paid:0,available:0}};else if(path==='/api/workspace/presence')data={available:true};else if(path==='/api/workspace/cash-ledger')data={opening:null,incoming:0,outgoing:0,estimated_balance:null,items:[],duplicate_references:[],requires_reconciliation:true};else if(path==='/api/workspace/expenses')data={items:[],next:null};else if(path==='/api/workspace/report')data={month:'2026-11',counts:[],workers:[],...(role==='owner'?{finance:{daily:[],received:0,refunded:0,paid_out:0,gross:0,owner_share:0,expenses:0,recorded_margin:0}}:{})};else return r.fulfill({status:404,json:{error:'Missing fixture'}});return r.fulfill({json:data});});
   await p.goto(url+'portal.html');await p.locator('#orders article').waitFor();assert.deepEqual(await p.locator('.role-grid strong').allTextContents(),['Pelanggan','Penjoki','Manajemen','Pemilik','Penjual']);
   for(const width of [320,390,768,1024,1440]){await p.setViewportSize({width,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'portal width '+width);assert.ok(await p.locator('#request').evaluate(el=>[...el.querySelectorAll('input,select,button')].every(c=>c.getBoundingClientRect().right<=el.getBoundingClientRect().right+1)),'form overflow '+width);}
   await p.setViewportSize({width:390,height:844});await p.locator('#globalSearch').fill('Heist');await p.getByRole('button',{name:'Layanan: Heist'}).click();assert.equal(await p.locator('#service').inputValue(),'gta-heist');
   assert.equal(await p.locator('#roleBadge').innerText(),{owner:'Pemilik',management:'Manajemen',worker:'Penjoki',seller:'Penjual',customer:'Pelanggan'}[role]);
   assert.equal(await p.locator('[data-view="finance"]').isVisible(),['owner','worker'].includes(role));assert.equal(await p.locator('[data-view="team"]').isVisible(),role==='owner');
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await p.getByRole('button',{name:'Detail & tindakan'}).click();await p.locator('#orderDialog[open]').waitFor();
   assert.equal(await p.getByRole('button',{name:'Ambil order',exact:true}).isVisible(),role==='worker');assert.equal(await p.getByRole('button',{name:'Batalkan permintaan',exact:true}).isVisible(),['customer','seller'].includes(role));assert.equal(await p.getByRole('heading',{name:'Tugaskan penjoki'}).isVisible(),['owner','management'].includes(role));
   assert.equal(await p.locator('.qris-payment').count(),0);
   await p.locator('#closeDetail').click();order.status='confirmed';order.payment_state='quoted';order.invoice_amount=15000;
   await p.getByRole('button',{name:'Detail & tindakan'}).click();await p.locator('#orderDialog[open]').waitFor();
   assert.equal(await p.locator('.qris-payment').isVisible(),['customer','seller'].includes(role));
   if(['customer','seller'].includes(role)){const img=p.locator('.qris-payment img');await img.waitFor();assert.ok(await img.evaluate(e=>e.complete&&e.naturalWidth>0)||await img.evaluate(e=>new Promise(resolve=>{e.onload=()=>resolve(true);e.onerror=()=>resolve(false);})));assert.match(await p.locator('.qris-amount').innerText(),/15\.000/);}
   await p.locator('#closeDetail').click();await p.locator('#themeToggle').click();assert.ok(await p.locator('body.light-theme').count());await p.locator('#themeToggle').click();
   await p.locator('#layoutToggle').click();assert.equal(await p.locator('#orders.kanban .kanban-column').count(),6);await p.locator('#layoutToggle').click();
   await p.locator('[data-view="shop"]').click();await p.getByRole('heading',{name:'Isi keranjang'}).waitFor();await p.locator('#shopBody form').first().getByRole('button',{name:'Simpan'}).click();await p.getByRole('button',{name:'Ajukan semua order'}).waitFor();
   await p.locator('[data-view="account"]').click();await p.getByText('Windows · Chrome · Sesi ini').waitFor();
   if(['owner','management','worker'].includes(role)){await p.locator('[data-view="performance"]').click();await p.getByText('Belum ada pekerjaan tercatat.').waitFor();}
   await p.locator('[data-view="support"]').click();await p.getByText('Belum ada kasus bantuan.').waitFor();
   if(['owner','worker'].includes(role)){await p.locator('[data-view="workspace"]').click();await p.getByText('Tersedia untuk diajukan: Rp0').waitFor();}
   if(['owner','management'].includes(role)){await p.locator('[data-view="report"]').click();await p.getByRole('button',{name:'Export CSV laporan ini'}).waitFor();const downloaded=p.waitForEvent('download');await p.getByRole('button',{name:'Unduh Excel (.xlsx)'}).click();const dl=await downloaded;assert.equal(dl.suggestedFilename(),'NEXORAID-2026-11.xlsx');const bytes=await readFile(await dl.path());assert.equal(bytes.readUInt32LE(0),0x04034b50);assert.ok(bytes.includes(Buffer.from('xl/worksheets/sheet1.xml')));}
   await p.setViewportSize({width:1440,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await ctx.close();
  }
  // Check every public page at phone, tablet and desktop widths. No real login or live order.
  for(const name of ['index.html','layanan.html','detail.html?id=optiwindows','cara-order.html','seller.html','faq.html','tentang.html','kontak.html','kebijakan.html','promo.html','harga.html','keranjang.html','login.html']){
   const response=await desktopPage.goto(url+name);assert.ok(response.ok(),name);await desktopPage.locator('h1').first().waitFor();
    for(const width of [320,390,768,1024,1440]){await desktopPage.setViewportSize({width,height:900});await desktopPage.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const layout=await desktopPage.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return {tag:el.tagName,id:el.id,className:String(el.className),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),text:(el.innerText||'').trim().slice(0,72)};}).filter(el=>el.left< -1||el.right>innerWidth+1).slice(0,12)}));assert.ok(layout.scrollWidth<=layout.viewport,name+' overflow at '+width+'px: '+JSON.stringify(layout));}
  }
  const {services}=await import('../services-data.js');await desktopPage.goto(url+'harga.html');assert.equal(await desktopPage.locator('.price-table tbody tr').count(),services.length);const csv=await desktopPage.request.get(url+'pricelist.csv');assert.ok(csv.ok());assert.match(await csv.text(),/OptiWindows/);
  for(const s of services){const response=await desktopPage.goto(url+'layanan-'+s.id+'.html');assert.ok(response.ok(),s.id);assert.equal(await desktopPage.locator('h1').innerText(),s.name);}
  assert.deepEqual(errors,[]);await desktop.close();
  const noJS=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});const staticPage=await noJS.newPage();
  await staticPage.goto(url+'layanan.html');assert.equal(await staticPage.locator('.static-catalog li').count(),services.length);
  assert.ok(await staticPage.locator('#navMenu').isVisible());await staticPage.goto(url+'layanan-optiwindows.html');assert.match(await staticPage.locator('h1').innerText(),/OptiWindows/);
  await staticPage.goto(url+'kontak.html');assert.match(await staticPage.locator('[data-discord-invite]').getAttribute('href'),/^https:\/\/discord\.gg\//);await context.close();await noJS.close();console.log('Browser smoke test passed (mobile, cart, comparison, variants, legacy URL, static fallback).');
}finally{await browser?.close();server.kill();}
