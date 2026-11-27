import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStorefrontCart,sameStorefrontCart} from '../v4/portal-core.mjs';
test('storefront cart retains exact public IDs and quantities',()=>{const rows=[{service_id:'gta-online',quantity:2},{service_id:'rental_1',quantity:99}];assert.deepEqual(parseStorefrontCart(JSON.stringify(rows)),rows);});
test('storefront cart rejects untrusted fields, duplicate IDs and out-of-range quantities',()=>{for(const rows of [[],Array.from({length:6},(_,i)=>({service_id:'x'+i,quantity:1})),[{service_id:'x',quantity:0}],[{service_id:'x',quantity:100}],[{service_id:'x',quantity:1.5}],[{service_id:'x',quantity:1,price:1}],[{service_id:'x',quantity:1},{service_id:'x',quantity:2}],[{service_id:'<script>',quantity:1}]])assert.equal(parseStorefrontCart(JSON.stringify(rows)),null);assert.equal(parseStorefrontCart('invalid'),null);});

test('same cart is recognized without replacing or doubling quantities',()=>{const a=[{service_id:'a',quantity:2},{service_id:'b',quantity:1}];assert.equal(sameStorefrontCart(a,[...a].reverse()),true);assert.equal(sameStorefrontCart(a,[{service_id:'a',quantity:3},{service_id:'b',quantity:1}]),false);assert.equal(sameStorefrontCart(a,[a[0]]),false);});
