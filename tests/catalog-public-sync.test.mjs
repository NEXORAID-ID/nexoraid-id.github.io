import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {activePromotions} from '../catalog.js';
const item={id:'fixture',base_unit_amount:1000,policy:{promo:{legacy:false,start:100,end:200,percent:10,min_quantity:2,terms:'Fixture only'}}};
test('public promo listing requires fresh scheduled valid active policies',()=>{
 for(const at of [99,200,201])assert.deepEqual(activePromotions([item],true,at),[]);
 for(const at of [100,199])assert.deepEqual(activePromotions([item],true,at),[item]);
 assert.deepEqual(activePromotions([item],false,150),[]);
 for(const patch of [{orderable:false},{availability:'sold_out'},{availability:'unconfigured'},{base_unit_amount:null},{policy:{promo:{...item.policy.promo,legacy:true}}},{policy:{promo:{...item.policy.promo,terms:''}}}])assert.deepEqual(activePromotions([{...item,...patch}],true,150),[]);
});
test('all public app pages allow only official catalog origin in connect-src',async()=>{
 for(const page of ["index.html","layanan.html","detail.html","cara-order.html","seller.html","faq.html","tentang.html","kontak.html","kebijakan.html","promo.html","harga.html","keranjang.html"]){const html=await readFile(new URL('../'+page,import.meta.url),'utf8');assert.match(html,/connect-src 'self' https:\/\/nexoraid-v4\.nexoraid\.workers\.dev;/);assert.match(html,/script-src 'self';/);}
});
