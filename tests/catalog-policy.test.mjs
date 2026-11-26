import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFile,readdir} from 'node:fs/promises';import {services} from '../services-data.js';import {applyOverride,validatePolicy} from '../v4/business.mjs';
const base=services.find(s=>s.id==='optiwindows'),policy={service_id:base.id,warranty_days:7,warranty_terms:'Fixture warranty',promo_percent:10,promo_start:100,promo_end:200,promo_terms:'Fixture promo',promo_min_quantity:2,eligibility_confirmed:true};
test('scheduled discount requires valid dates, terms and explicit automatic eligibility',()=>{
 assert.ok(validatePolicy(policy));assert.equal(validatePolicy({...policy,promo_end:100}),null);assert.equal(validatePolicy({...policy,eligibility_confirmed:false}),null);assert.equal(validatePolicy({...policy,warranty_terms:''}),null);assert.equal(validatePolicy({...policy,promo_min_quantity:0}),null);assert.equal(validatePolicy({...policy,service_id:'hyperboostx'}),null);
 const row={policy_exists:1,policy_percent:10,promo_start:100,promo_end:200,promo_min_quantity:2};
 for(const [at,q,expected] of [[99,2,150000],[100,1,150000],[100,2,135000],[199,2,135000],[200,2,150000]])assert.equal(applyOverride(base,row,at,q).unit_amount,expected);
});
test('warranty and applied promo are immutable snapshots, not retroactive claims',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');const dir=new URL('../v4/migrations/',import.meta.url);for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())db.exec(await readFile(new URL(name,dir),'utf8'));
 db.exec("INSERT INTO users(id,display_name,created_at) VALUES('o','owner',1),('c','customer',1)");
 const insert=(id,q,at,estimate)=>db.prepare("INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,estimate,created_at,updated_at) VALUES(?,'c','optiwindows',?,'fixture',?,?,?)").run(id,q,estimate,at,at);
 insert('unknown',1,90,150000);
 db.exec("INSERT INTO service_policies(service_id,warranty_days,warranty_terms,promo_percent,promo_start,promo_end,promo_terms,promo_min_quantity,actor_id,updated_at) VALUES('optiwindows',7,'Fixture warranty',10,100,200,'Fixture promo',2,'o',1)");
 insert('active',2,100,270000);insert('minimum',1,100,150000);insert('expired',2,200,300000);
 db.exec("UPDATE service_policies SET warranty_days=30,promo_percent=20");
 const get=id=>db.prepare('SELECT * FROM order_policy_snapshots WHERE order_id=?').get(id);
 assert.equal(get('unknown').warranty_days,null);assert.equal(get('active').warranty_days,7);assert.equal(get('active').promo_percent,10);assert.equal(get('active').promo_min_quantity,2);assert.equal(get('active').promo_start,100);assert.equal(get('minimum').promo_percent,0);assert.equal(get('expired').promo_percent,0);
 assert.throws(()=>db.exec("UPDATE order_policy_snapshots SET warranty_days=90 WHERE order_id='active'"),/policy_snapshot_immutable/);assert.throws(()=>db.exec("DELETE FROM order_policy_snapshots WHERE order_id='active'"),/policy_snapshot_immutable/);db.close();
});

test('public quantity estimate follows the same scheduled boundaries as the server',async()=>{const {effectiveCatalogUnit}=await import('../catalog.js');const item={...base,base_unit_amount:150000,policy:{promo:{percent:10,start:100,end:200,min_quantity:2,legacy:false}}};assert.equal(effectiveCatalogUnit(item,1,100),150000);assert.equal(effectiveCatalogUnit(item,2,100),135000);assert.equal(effectiveCatalogUnit(item,2,200),150000);});
