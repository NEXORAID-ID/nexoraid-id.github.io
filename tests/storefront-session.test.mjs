import test from 'node:test';
import assert from 'node:assert/strict';
import {MARKETPLACE_ORIGIN,marketplaceAccountOrigin,marketplaceAccountState} from '../catalog.js';
import {storefrontView} from '../v4/portal-core.mjs';
test('storefront never queries private identity across origins',()=>{assert.equal(marketplaceAccountOrigin(MARKETPLACE_ORIGIN),true);for(const origin of ['https://nexoraid-id.github.io','http://localhost:4173',MARKETPLACE_ORIGIN+'.evil.test'])assert.equal(marketplaceAccountOrigin(origin),false);});
test('account header uses bounded server identity and known role only',()=>{assert.deepEqual(marketplaceAccountState({user:{display_name:'Member',role:'customer',id:'private'}}),{display_name:'Member',role:'customer'});for(const role of ['admin','',null])assert.equal(marketplaceAccountState({user:{display_name:'Member',role}}),null);assert.equal(marketplaceAccountState({user:{display_name:'',role:'owner'}}),null);});
test('portal only allows safe member navigation destinations',()=>{for(const view of ['orders','account','shop','notifications','support'])assert.equal(storefrontView(view),view);for(const view of ['finance','team','https://evil.test','../','__proto__',null])assert.equal(storefrontView(view),null);});
