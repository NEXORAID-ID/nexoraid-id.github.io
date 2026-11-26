import test from 'node:test';import assert from 'node:assert/strict';
import {services} from '../services-data.js';import {estimateOrder} from '../v4/worker.mjs';import {normalizeCart} from '../v4/customer.mjs';
import {DatabaseSync} from 'node:sqlite';import {readFile,readdir} from 'node:fs/promises';
test('79 published packages have distinct server-priced stable SKUs',()=>{
 const variants=services.filter(s=>s.parent_id);assert.equal(variants.length,79);
 for(const s of variants){const p=services.find(x=>x.id===s.parent_id);const [label,raw]=s.details[0];assert.ok(p.details.some(([k,v])=>k===label&&v===raw));const price=Number(raw.match(/^Rp([\d.]+)/)[1].replaceAll('.',''));assert.equal(estimateOrder(s.id,2).estimate,price*2);}
 assert.equal(estimateOrder('gta-rank-v-not-real',1),null);
 assert.equal(normalizeCart([{service_id:'gta-rank-v-100-rank',quantity:1,price:1}]),null);
 assert.equal(normalizeCart([{service_id:'gta-rank-v-100-rank',quantity:1,variant_id:'fake'}]),null);
 assert.equal(estimateOrder('rockstar-2fa-recovery',1).estimate,150000);
});
test('parent disabling blocks new variant orders in D1',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');const dir=new URL('../v4/migrations/',import.meta.url);for(const n of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())db.exec(await readFile(new URL(n,dir),'utf8'));
 db.exec("INSERT INTO users(id,display_name,created_at) VALUES('o','owner',1),('c','customer',1); INSERT INTO catalog_overrides VALUES('gta-rank',NULL,0,0,'o',1)");
 assert.throws(()=>db.exec("INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,created_at,updated_at) VALUES('x','c','gta-rank-v-100-rank',1,'Rp12.999',1,1)"),/catalog_disabled/);db.close();
});

test('live parent details use current child price and omit disabled children',async()=>{
 const {mergeLiveCatalog}=await import('../live-catalog.js');const p=services.find(s=>s.id==='gta-rank'),children=services.filter(s=>s.parent_id===p.id);
 const v=children[0];const merged=mergeLiveCatalog([p,...children],{catalog_revision:1,services:[{id:p.id,price:'Mulai Rp10.000',enabled:true},{id:v.id,price:'Rp10.000',enabled:true}]});
 assert.equal(merged.length,2);assert.equal(merged[0].details[0][1],'Rp10.000');assert.ok(!merged[0].details.some(([k])=>k===children[1].details[0][0]));
});

test('free HyperBoostX and pending topup are visible but cannot be invoiced or ordered',async()=>{
 const {safeBasket}=await import('../catalog.js');const {applyOverride}=await import('../v4/business.mjs');
 for(const id of ['hyperboostx','top-up-game']){
 const s=services.find(x=>x.id===id);assert.equal(s.orderable,false);assert.equal(estimateOrder(id,1),null);assert.equal(normalizeCart([{service_id:id,quantity:1}]),null);assert.deepEqual(safeBasket([{id,quantity:1}],services),[]);assert.equal(applyOverride(s,{amount:100,enabled:1,promo_percent:0}).price,s.price);}
 assert.equal(services.find(s=>s.id==='hyperboostx').download_url,'https://github.com/jxxzy/HyperBoostX/releases');
});
