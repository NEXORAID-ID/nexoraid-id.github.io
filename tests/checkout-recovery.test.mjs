import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldClearPendingCheckout,validateCheckoutReceipt} from '../v4/portal-core.mjs';
test('uncertain checkout key survives a retry that fails before sending or is rejected',()=>{
 const storage=Error('storage unavailable'),rejected=Object.assign(Error('Gabung server Discord'),{status:403,validError:true});
 for(const error of [storage,rejected])for(const sent of [false,true])assert.equal(shouldClearPendingCheckout({sent,retry:true,error}),false);
 assert.equal(shouldClearPendingCheckout({sent:false,retry:false,error:storage}),true);
 assert.equal(shouldClearPendingCheckout({sent:true,retry:false,error:rejected}),true);
 assert.equal(shouldClearPendingCheckout({sent:true,retry:false,error:storage}),false);
 assert.equal(shouldClearPendingCheckout({sent:true,retry:false,error:Object.assign(Error('ID permintaan sudah digunakan'),{status:409,validError:true})}),false);
});
test('only a complete matching receipt can clear an uncertain checkout',()=>{
 const items=[{service_id:'a',quantity:2},{service_id:'b',quantity:1}];
 const a={id:'order-a',...items[0]},b={id:'order-b',...items[1]},receipt={checkout_id:'group',orders:[b,a]};
 assert.equal(validateCheckoutReceipt(receipt,items),receipt);
 for(const invalid of [{},{checkout_id:'group',orders:[a]},{checkout_id:'group',orders:[a,a]},{checkout_id:'group',orders:[a,{...b,id:a.id}]},{checkout_id:'group',orders:[a,{...b,quantity:2}]},{orders:[a,b]}])assert.throws(()=>validateCheckoutReceipt(invalid,items),/belum dapat dipastikan/);
 assert.deepEqual(validateCheckoutReceipt({order:a},[items[0]],{single:true}),{order:a});
 assert.throws(()=>validateCheckoutReceipt({order:b},[items[0]],{single:true}),/belum dapat dipastikan/);
});
