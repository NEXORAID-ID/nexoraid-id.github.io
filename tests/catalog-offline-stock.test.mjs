import test from 'node:test';
import assert from 'node:assert/strict';
import {getLiveCatalog,mergeLiveCatalog} from '../live-catalog.js';
import {safeBasket,basketTotals,basketText} from '../catalog.js';
import {services} from '../services-data.js';
const rentals=['cherax-rental-standard','cherax-rental-premium'];
const baseline=services.filter(s=>[...rentals,'optiwindows'].includes(s.id));
const location={hostname:'nexoraid-id.github.io'};
const cart=baseline.map(s=>({id:s.id,quantity:1}));
test('offline, failed and invalid live responses fail closed for both rental tiers',async()=>{
 for(const fetcher of [async()=>{throw Error('offline')},async()=>({ok:false}),async()=>({ok:true,json:async()=>({catalog_revision:0,services:[]})})]){
  const result=await getLiveCatalog(baseline,location,fetcher);
  assert.equal(result.live,false);
  for(const id of rentals)assert.equal(result.services.find(s=>s.id===id).availability,'unconfigured');
  assert.deepEqual(safeBasket(cart,result.services),[{id:'optiwindows',quantity:1}]);
  assert.equal(basketTotals(cart,result.services).total,150000);
  assert.doesNotMatch(basketText(cart,result.services),/Cherax/i);
 }
});
test('missing inventory and sold-out rental cannot be restored into cart; live available rental can',()=>{
 for(const availability of [undefined,'sold_out','unconfigured','invalid','available']){
  const live=mergeLiveCatalog(baseline,{catalog_revision:1,services:baseline.map(s=>({id:s.id,price:s.price,enabled:true,availability}))});
  assert.equal(safeBasket(cart,live).length,availability==='available'?3:1);
 }
});
test('offline fallback does not mutate baseline and cannot reuse old availability',async()=>{
 const old=baseline.map(s=>({...s,availability:'available'}));
 const result=await getLiveCatalog(old,location,async()=>{throw Error('offline')});
 assert.equal(old.find(s=>s.id===rentals[0]).availability,'available');
 assert.equal(result.services.find(s=>s.id===rentals[0]).availability,'unconfigured');
});
