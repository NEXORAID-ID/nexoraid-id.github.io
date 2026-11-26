import test from 'node:test';
import assert from 'node:assert/strict';
import { services, CONFIG } from '../services-data.js';
import { categories, queryCatalog, priceValue, fixedPriceValue, comparisonTotals, escapeHTML, orderText } from '../catalog.js';

test('catalog records have unique stable routes and complete order information', () => {
  assert.equal(services.length, 138);
  assert.equal(new Set(services.map(s => s.id)).size, services.length);
  for (const service of services) {
    assert.match(service.id, /^[a-z0-9-]+$/);
    assert.ok(categories[service.category]);
    assert.ok(service.name && service.desc && service.price && service.details.length);
    for (const row of service.details) assert.ok(row.length === 2 && row.every(v => typeof v === 'string' && v.length));
  }
  assert.equal(CONFIG.discordUrl, 'https://discord.com/channels/1487728359482851348/1505557388969644052');
});
test('account category exposes all four request types and platforms', () => {
  const result = queryCatalog(services, {category:'accounts'});
  assert.equal(result.total, 4);
  assert.deepEqual(result.rows.map(s => s.name), ['Akun Game Random', 'Akun Game Starter', 'Akun Game Premium', 'Akun Game Custom']);
  for (const service of result.rows) {
    assert.equal(service.price, 'Sesuai Request');
    for (const platform of ['GTA', 'Steam', 'Epic Games', 'mobile', 'PC']) assert.ok(JSON.stringify(service.details).includes(platform));
  }
});
test('search matches detail content, multi-word queries, and category together', () => {
  assert.equal(queryCatalog(services, {category:'accounts', query:'EPIC games'}).total, 4);
  assert.equal(queryCatalog(services, {category:'software', query:'Office 2021'}).total, 1);
  assert.equal(queryCatalog(services, {query:'not-a-real-service-xyz'}).total, 0);
  assert.equal(queryCatalog(services, {category:'mobile', query:'GTA'}).total, 0);
});
test('price sorting handles rupiah formats and keeps request prices last in both directions', () => {
  assert.equal(priceValue('Mulai Rp2.500'), 2500);
  assert.equal(priceValue('Rp300K — Rp550K'), 300000);
  assert.equal(priceValue('Rp1JT'), 1000000);
  assert.equal(priceValue('Sesuai Request'), null);
  const rows = [{...services[0],price:'Rp100K'}, {...services[0],price:'Sesuai Request'}, {...services[0],price:'Rp2.500'}];
  assert.deepEqual(queryCatalog(rows, {sort:'price-asc'}).rows.map(s=>s.price), ['Rp2.500','Rp100K','Sesuai Request']);
  assert.deepEqual(queryCatalog(rows, {sort:'price-desc'}).rows.map(s=>s.price), ['Rp100K','Rp2.500','Sesuai Request']);
});
test('comparison subtotal accepts only exact catalog prices, never ranges or starting prices', () => {
  assert.equal(fixedPriceValue('Rp14.999'), 14999);
  assert.equal(fixedPriceValue('Rp 75.000'), 75000);
  assert.equal(fixedPriceValue('Daftar Rp500.000'), 500000);
  assert.equal(fixedPriceValue('Mulai Rp100.000'), null);
  assert.equal(fixedPriceValue('Rp300K — Rp550K'), null);
  assert.equal(fixedPriceValue('Sesuai Request'), null);
});
test('comparison totals exclude every non-fixed price and count quotes to confirm', () => {
  assert.deepEqual(comparisonTotals([
    {price:'Rp14.999'},
    {price:'Rp75.000'},
    {price:'Mulai Rp100.000'},
    {price:'Sesuai Request'}
  ]), {knownTotal:89999, needsQuote:2});
});
test('pagination clamps malformed and out-of-range pages without dropping records', () => {
  assert.equal(queryCatalog(services, {page:-2}).currentPage, 1);
  assert.equal(queryCatalog(services, {page:'x'}).currentPage, 1);
  assert.equal(queryCatalog(services, {page:999}).currentPage, queryCatalog(services).totalPages);
  const ids = Array.from({length:queryCatalog(services).totalPages},(_,i)=>i+1).flatMap(page=>queryCatalog(services,{page}).rows.map(s=>s.id));
  assert.equal(ids.length, services.length);
  assert.equal(new Set(ids).size, services.length);
  assert.equal(queryCatalog(services,{category:'accounts',page:4}).currentPage,1);
});
test('order copy contains exact product and price without collecting credentials', () => {
  const service = services.find(s=>s.id==='akun-game-custom');
  const text = orderText(service,'https://example.com/shop/detail.html?id=akun-game-custom');
  assert.ok(text.includes(service.name)); assert.ok(text.includes(service.price));
  assert.ok(text.includes('/shop/detail.html?id=akun-game-custom'));
  assert.ok(!/password|kata sandi/i.test(text));
});
test('catalog values are escaped before HTML insertion', () => {
  assert.equal(escapeHTML('<script>"&\''), '&lt;script&gt;&quot;&amp;&#39;');
});
test('Windows and Office prices and GTA login-only terms remain intact', () => {
  for (const [id,price] of [['windows-license','Rp75.000'],['office-license','Rp75.000'],['windows-office-bundle','Rp100.000']]) assert.equal(services.find(s=>s.id===id).price,price);
  const gta = services.filter(s=>s.id.startsWith('gta-')&&!s.id.startsWith('gta-heist')&&!s.parent_id);
  assert.equal(gta.length,18);
  assert.ok(!/mabar|non-login/i.test(JSON.stringify(gta)));
  assert.ok(gta.every(s=>JSON.stringify(s.details).includes('via login akun')));
});
test('seller registration price matches the published Rp1.500.000 fee', () => {
  const seller = services.find(service => service.id === 'seller');
  assert.equal(seller.price, 'Daftar Rp1.500.000');
  assert.equal(seller.details.find(([label]) => label === 'Biaya Daftar')?.[1], 'Rp1.500.000');
});

test('saved selection validates IDs and deduplicates', async()=>{const {safeSelection}=await import('../catalog.js');assert.deepEqual(safeSelection(['missing',services[0].id,services[0].id],services),[services[0].id]);});
test('basket validates quantities and excludes variable price from subtotal',async()=>{const {safeBasket,basketTotals,basketText}=await import('../catalog.js');const rows=[{id:'optiwindows',quantity:2},{id:'gta-heist',quantity:1},{id:'missing',quantity:1},{id:'windows-license',quantity:0}];assert.equal(safeBasket(rows,services).length,2);assert.deepEqual(basketTotals(rows,services),{total:300000,needsQuote:1});assert.ok(basketText(rows,services).includes('OptiWindows'));});
test('advanced filters distinguish fixed and quoted pricing',()=>{const fixed=queryCatalog(services,{maxPrice:75000,priceType:'fixed'});assert.ok(fixed.total>0);assert.ok(fixed.rows.every(s=>fixedPriceValue(s.price)<=75000&&fixedPriceValue(s.price)!==null));assert.equal(queryCatalog(services,{savedIds:['optiwindows']}).total,1);assert.equal(queryCatalog(services,{query:'lisensi',category:'software'}).total>0,true);});
test('featured and related cards do not enable orphan compare controls',async()=>{const {readFile}=await import('node:fs/promises');const js=await readFile(new URL('../app.js',import.meta.url),'utf8');assert.ok(!js.includes('.map(serviceCard)'));});
test('seller fee is consistent in source HTML',async()=>{const {readFile}=await import('node:fs/promises');for(const p of ['faq.html','seller.html'])assert.ok((await readFile(new URL('../'+p,import.meta.url),'utf8')).includes('Rp1.500.000'));});

test('pricing type is explicit and range preserves maximum',async()=>{const {pricingInfo,packageOptions}=await import('../catalog.js');assert.deepEqual(pricingInfo('Rp300.000 — Rp550.000'),{type:'range',min:300000,max:550000});assert.deepEqual(pricingInfo('Sesuai Request'),{type:'quote',min:null,max:null});assert.equal(packageOptions(services.find(s=>s.id==='gta-heist'))[0].amount,2500);assert.equal(packageOptions(services.find(s=>s.id==='cherax')).length,0);});

test('official invite is distinct from member-only ticket URL',()=>{assert.match(CONFIG.discordInvite,/^https:\/\/discord\.gg\/[A-Za-z0-9-]+$/);assert.notEqual(CONFIG.discordInvite,CONFIG.discordUrl);});


test('CSV export protects formula cells, preserves quotes and contains every service', async()=>{
 const {csvCell,priceCSV}=await import('../catalog.js');
 for(const text of ['=1+1','+1','-1','@SUM(1)','  =1','\t=1']) assert.ok(csvCell(text).startsWith('"\''));
 assert.equal(csvCell('A"B'),'"A""B"');
 const csv=priceCSV(services); assert.equal(csv.split('\r\n').length,services.length+1);
 assert.ok(csv.includes('OptiWindows'));
});
test('DOM collection operations use the multi-element selector',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/(^|[^$])\$\([^)]*\)\.(forEach|map|filter|find)\b/m);
});

test('Live catalogue merges authoritative prices, excludes disabled items and removes stale monetary details',async()=>{
 const {mergeLiveCatalog}=await import('../live-catalog.js');const base=[{id:'a',price:'Rp10.000',details:[['Package','Rp10.000'],['Contents','5 items']]},{id:'b',price:'Rp20.000',details:[]}];
 const merged=mergeLiveCatalog(base,{catalog_revision:1,services:[{id:'a',enabled:true,price:'Rp9.000'}]});
 assert.equal(merged.length,1);assert.equal(merged[0].price,'Rp9.000');assert.deepEqual(merged[0].details,[['Harga portal saat ini','Rp9.000'],['Contents','5 items']]);assert.throws(()=>mergeLiveCatalog(base,{services:[]}));
});

test('approved heist SKUs use exact integer price for all 22 login and mabar variants',async()=>{const {estimateOrder}=await import('../v4/worker.mjs');const counts=[1,5,10,20,30,40,50,80,100,120,150],login=[2500,12500,25000,50000,75000,100000,125000,200000,250000,300000,375000],mabar=[2500,12500,30000,60000,90000,120000,150000,240000,300000,360000,450000];for(const [mode,amounts] of [['login',login],['mabar',mabar]])for(let i=0;i<counts.length;i++){const id='gta-heist-'+mode+'-'+counts[i];assert.equal(estimateOrder(id,1).estimate,amounts[i]);assert.equal(estimateOrder(id,2).estimate,amounts[i]*2);}assert.equal(estimateOrder('cherax-rental-standard',1).estimate,220000);assert.equal(estimateOrder('cherax-rental-premium',1).estimate,420000);});
