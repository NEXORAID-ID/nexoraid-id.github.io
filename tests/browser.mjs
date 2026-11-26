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
  await page.locator('#navToggle').click();assert.equal(await page.locator('#navToggle').getAttribute('aria-expanded'),'true');assert.ok(await page.locator('#accountNav').isVisible());assert.equal(await page.locator('#accountNav').getAttribute('href'),'https://nexoraid-v4.nexoraid.workers.dev/portal.html');await page.keyboard.press('Escape');
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
  await desktopPage.goto(url+'index.html');await desktopPage.locator('#homeSearchInput').waitFor();assert.ok(await desktopPage.locator('#navMenu').isVisible());assert.ok(await desktopPage.locator('#accountNav').isVisible());assert.equal(await desktopPage.locator('#accountNav').getAttribute('href'),'https://nexoraid-v4.nexoraid.workers.dev/portal.html');
  await desktopPage.goto(url+'harga.html');assert.equal(await desktopPage.locator('.price-table tbody tr').count(),32);const csv=await desktopPage.request.get(url+'pricelist.csv');assert.ok(csv.ok());assert.match(await csv.text(),/OptiWindows/);
  const {services}=await import('../services-data.js');for(const s of services){const response=await desktopPage.goto(url+'layanan-'+s.id+'.html');assert.ok(response.ok(),s.id);assert.equal(await desktopPage.locator('h1').innerText(),s.name);}
  assert.deepEqual(errors,[]);await desktop.close();
  const noJS=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});const staticPage=await noJS.newPage();
  await staticPage.goto(url+'layanan.html');assert.equal(await staticPage.locator('.static-catalog li').count(),32);
  assert.ok(await staticPage.locator('#navMenu').isVisible());await staticPage.goto(url+'layanan-optiwindows.html');assert.match(await staticPage.locator('h1').innerText(),/OptiWindows/);
  await staticPage.goto(url+'kontak.html');assert.match(await staticPage.locator('[data-discord-invite]').getAttribute('href'),/^https:\/\/discord\.gg\//);await context.close();await noJS.close();console.log('Browser smoke test passed (mobile, cart, comparison, variants, legacy URL, static fallback).');
}finally{await browser?.close();server.kill();}
