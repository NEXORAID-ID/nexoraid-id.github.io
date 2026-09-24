import test from 'node:test';
import assert from 'node:assert/strict';
import { services, CONFIG } from '../services-data.js';
import { categories, queryCatalog, priceValue, escapeHTML, orderText } from '../catalog.js';

test('catalog records have unique stable routes and complete order information', () => {
  assert.equal(services.length, 32);
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
test('pagination clamps malformed and out-of-range pages without dropping records', () => {
  assert.equal(queryCatalog(services, {page:-2}).currentPage, 1);
  assert.equal(queryCatalog(services, {page:'x'}).currentPage, 1);
  assert.equal(queryCatalog(services, {page:999}).currentPage, 4);
  const ids = [1,2,3,4].flatMap(page=>queryCatalog(services,{page}).rows.map(s=>s.id));
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
  const gta = services.filter(s=>s.id.startsWith('gta-'));
  assert.equal(gta.length,19);
  assert.ok(!/mabar|non-login/i.test(JSON.stringify(gta)));
  assert.ok(gta.every(s=>JSON.stringify(s.details).includes('via login akun')));
});
