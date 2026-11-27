import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutPricingPreview} from '../v4/portal-core.mjs';
import {planCheckoutInvoices,planInvoiceRefund} from '../v4/checkout-fee-invoice.mjs';
const orders=[{id:'a',base_amount:150000},{id:'b',base_amount:50000}];
const plan=()=>planCheckoutInvoices({orders,fee:500,feeOrderId:'b'});
test('one selected invoice carries exactly one fee; service amounts remain separate',()=>{
 const r=plan();assert.deepEqual(r,{invoices:[{order_id:'a',base_amount:150000,service_fee:0,amount:150000},{order_id:'b',base_amount:50000,service_fee:500,amount:50500}],subtotal:200000,service_fee:500,total:200500});
 assert.equal(planCheckoutInvoices({orders:[...orders].reverse(),fee:500,feeOrderId:'b'}).total,r.total);
 assert.equal(planCheckoutInvoices({orders,fee:0}).total,200000);
});
test('reject ambiguous fee anchor, duplicate orders, unknown quotes and overflow',()=>{
 for(const input of [{orders,fee:500},{orders,fee:500,feeOrderId:'c'},{orders,fee:0,feeOrderId:'a'},{orders:[orders[0],orders[0]],fee:500,feeOrderId:'a'},{orders:[{id:'a',base_amount:null}],fee:500,feeOrderId:'a'},{orders:[{id:'a',base_amount:999999999}],fee:500,feeOrderId:'a'}])assert.throws(()=>planCheckoutInvoices(input));
});
test('partial and full refund can return fee only when explicitly selected, never twice',()=>{
 const invoice=plan().invoices[1],received=50500;
 const first=planInvoiceRefund({invoice,received,previous:[],baseRefund:20000,feeRefund:0});
 assert.deepEqual(first,{base_amount:20000,service_fee:0,amount:20000,remaining_refundable:30500});
 const previous=[{reference:'first',base_amount:20000,service_fee:0}];
 const final=planInvoiceRefund({invoice,received,previous,baseRefund:30000,feeRefund:500});assert.equal(final.remaining_refundable,0);
 assert.throws(()=>planInvoiceRefund({invoice,received,previous:[...previous,{reference:'second',base_amount:30000,service_fee:500}],baseRefund:0,feeRefund:500}),/refund_limit/);
 assert.throws(()=>planInvoiceRefund({invoice:plan().invoices[0],received:150000,previous:[],baseRefund:1,feeRefund:500}),/refund_limit/);
});
test('receipt cap protects installments and malformed refund history',()=>{
 const invoice=plan().invoices[1];
 assert.throws(()=>planInvoiceRefund({invoice,received:10000,previous:[],baseRefund:10000,feeRefund:500}),/refund_limit/);
 assert.throws(()=>planInvoiceRefund({invoice,received:50500,previous:[{reference:'x',base_amount:1,service_fee:0},{reference:'x',base_amount:1,service_fee:0}],baseRefund:1,feeRefund:0}),/invalid_refund_history/);
 assert.throws(()=>planInvoiceRefund({invoice,received:50500,previous:[],baseRefund:50000}),/invalid_refund/);
});

test('portal fee preview is explicitly non-payable, including pending quotes and absent preview',()=>{
 assert.equal(checkoutPricingPreview(undefined),'');
 assert.equal(checkoutPricingPreview({status:'paid',known_subtotal:200000,unknown_count:0,service_fee:500,total:200500}),'');
 assert.match(checkoutPricingPreview({status:'estimate_only',known_subtotal:200000,unknown_count:0,service_fee:500,total:200500}),/bukan tagihan.*Rp200\.000.*Rp500.*Rp200\.500/);
 assert.match(checkoutPricingPreview({status:'estimate_only',known_subtotal:150000,unknown_count:1,service_fee:500,total:null}),/menunggu penawaran/);
 assert.equal(checkoutPricingPreview({status:'estimate_only',known_subtotal:1000,unknown_count:0,service_fee:500,total:1000}),'');
});
