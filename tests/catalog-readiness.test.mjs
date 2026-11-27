import test from 'node:test';import assert from 'node:assert/strict';import {inspectCatalog} from '../v4/scripts/catalog-readiness.mjs';
const base=[{id:'top-up-game',orderable:false},{id:'cherax-rental-standard'},{id:'cherax-rental-premium'},{id:'optiwindows'}];
const rental=(id,availability)=>({id,name:id,price:'Rp220.000',enabled:true,availability});
const rows=[{id:'top-up-game',name:'Top-up',price:'Menyusul',enabled:true,orderable:false},rental('cherax-rental-standard','sold_out'),rental('cherax-rental-premium','unconfigured'),{id:'optiwindows',name:'OptiWindows',price:'Rp150.000',enabled:true,policy:{warranty_days:0,warranty_terms:'No warranty',promo:{legacy:false,start:100,end:200,percent:10,min_quantity:1,terms:'Fixture only'}}}];
const inspect=(services=rows,at=100)=>inspectCatalog({catalog_revision:1,services},base,at);
test('reports catalog readiness separately from successful transport and contract',()=>{
 const r=inspect();assert.equal(r.contract_ok,true);assert.equal(r.warranty_configured,1);assert.equal(r.warranty_missing,2);assert.equal(r.top_up_placeholder,true);assert.equal(r.top_up_orderable,0);assert.equal(r.active_promos,1);assert.equal(r.rental['cherax-rental-premium'],'unconfigured');assert.equal(inspect(rows,200).active_promos,0);
});
test('rejects baseline, duplicates, informational checkout and unknown rental status',()=>{
 assert.equal(inspectCatalog({baseline:true,services:rows},base).contract_ok,false);
 assert.equal(inspect([...rows,rows[0]]).contract_ok,false);
 assert.equal(inspect([{...rows[0],orderable:true},...rows.slice(1)]).contract_ok,false);
 assert.equal(inspect([rows[0],rental('cherax-rental-standard',undefined),...rows.slice(2)]).contract_ok,false);
});
test('reports missing known services, unknown IDs and invalid legacy promo without exposing row details',()=>{
 const r=inspect([{...rows[3],policy:{promo:{legacy:true,percent:10}}},{id:'top-up-game-fixture',parent_id:'top-up-game',name:'Fixture',price:'Rp1000',enabled:true,unit_amount:1000,reference:'private'}]);
 assert.equal(r.missing_known,3);assert.equal(r.unknown_ids,1);assert.equal(r.invalid_promos,1);assert.equal(r.top_up_orderable,1);assert.equal(r.rental['cherax-rental-standard'],'not_listed');assert.doesNotMatch(JSON.stringify(r),/private/);
});
