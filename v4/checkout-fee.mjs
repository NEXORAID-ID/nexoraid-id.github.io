// Owner requirement #50: one fixed service fee for a paid checkout, not per item.
export const CHECKOUT_SERVICE_FEE=500;
const money=n=>Number.isSafeInteger(n)&&n>=0;
export function checkoutTotals(orders,{fee=CHECKOUT_SERVICE_FEE}={}){
 if(!Array.isArray(orders)||orders.length<1||orders.length>5||![0,CHECKOUT_SERVICE_FEE].includes(fee))throw new TypeError('invalid_checkout_fee');
 const seen=new Set();let subtotal=0,unknown=0;
 for(const o of orders){
  if(typeof o?.id!=='string'||!o.id||seen.has(o.id)||!(o.estimate===null||money(o.estimate)))throw new TypeError('invalid_checkout_order');
  seen.add(o.id);
  if(o.estimate===null){unknown++;continue;}
  subtotal+=o.estimate;
  if(!Number.isSafeInteger(subtotal))throw new RangeError('checkout_total_overflow');
 }
 // A zero-price checkout is not charged. A request-price order is not free;
 // its final total remains unknown until a quote has been accepted.
 const pending=unknown>0;
 const service_fee=subtotal>0||pending?fee:0;
 const known_total=subtotal+service_fee;
 if(!Number.isSafeInteger(known_total))throw new RangeError('checkout_total_overflow');
 return {subtotal:pending?null:subtotal,known_subtotal:subtotal,unknown_count:unknown,service_fee,total:pending?null:known_total};
}
