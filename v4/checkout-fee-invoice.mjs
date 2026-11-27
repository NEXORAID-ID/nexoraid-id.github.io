// Candidate only. Invoice allocation and refund components require an explicit
// approved policy; this module never writes a ledger or moves money.
import {CHECKOUT_SERVICE_FEE} from './checkout-fee.mjs';
const money=n=>Number.isSafeInteger(n)&&n>=0;
const id=s=>typeof s==='string'&&s.length>0;
const sum=(a,b)=>{const v=a+b;if(!money(v))throw new RangeError('amount_overflow');return v;};
export function planCheckoutInvoices({orders,fee,feeOrderId}){
 if(!Array.isArray(orders)||orders.length<1||orders.length>5||![0,CHECKOUT_SERVICE_FEE].includes(fee))throw new TypeError('invalid_checkout');
 const seen=new Set();
 for(const o of orders){
  if(!id(o?.id)||seen.has(o.id)||!money(o.base_amount)||o.base_amount<1||o.base_amount>999999999)throw new TypeError('invalid_quote');
  seen.add(o.id);
 }
 // The fee-bearing invoice must be selected explicitly and persisted before
 // issuance. Never automatically move the fee to a different invoice.
 if(fee>0?!seen.has(feeOrderId):feeOrderId!=null)throw new TypeError('fee_allocation_required');
 let total=0,subtotal=0;
 const invoices=orders.map(o=>{
  const service_fee=o.id===feeOrderId?fee:0,amount=sum(o.base_amount,service_fee);
  if(amount>999999999)throw new RangeError('invoice_limit');
  total=sum(total,amount);subtotal=sum(subtotal,o.base_amount);
  return {order_id:o.id,base_amount:o.base_amount,service_fee,amount};
 });
 return {invoices,subtotal,service_fee:fee,total};
}
export function planInvoiceRefund({invoice,received,previous,baseRefund,feeRefund}){
 if(!id(invoice?.order_id)||!money(invoice.base_amount)||![0,CHECKOUT_SERVICE_FEE].includes(invoice.service_fee)||invoice.amount!==sum(invoice.base_amount,invoice.service_fee)||!money(received)||received>invoice.amount||!Array.isArray(previous)||!money(baseRefund)||!money(feeRefund))throw new TypeError('invalid_refund');
 let priorBase=0,priorFee=0;
 const refs=new Set();
 for(const row of previous){
  if(!id(row?.reference)||refs.has(row.reference)||!money(row.base_amount)||!money(row.service_fee)||sum(row.base_amount,row.service_fee)<1)throw new TypeError('invalid_refund_history');
  refs.add(row.reference);priorBase=sum(priorBase,row.base_amount);priorFee=sum(priorFee,row.service_fee);
 }
 const amount=sum(baseRefund,feeRefund);
 if(amount<1||sum(priorBase,baseRefund)>invoice.base_amount||sum(priorFee,feeRefund)>invoice.service_fee||sum(sum(priorBase,priorFee),amount)>received)throw new RangeError('refund_limit');
 // Separate components prevent double-refunding the group fee and preserve
 // service principal for worker settlement. The caller must verify actual
 // receipt, authorisation, unique transfer reference and atomically persist.
 return {base_amount:baseRefund,service_fee:feeRefund,amount,remaining_refundable:received-priorBase-priorFee-amount};
}
