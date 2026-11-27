// Synthetic environment only. No production flag or migration enables this.
export function feeTrialEnabled(env){return env?.CHECKOUT_FEE_POLICY_TRIAL==='true'&&env?.PUBLIC_ORIGIN==='https://staging.invalid';}
export async function trialQuote(db,{id,amount,kind,actor,time}){
 const eligibility="o.id=? AND o.status IN ('claimed','confirmed','processing') AND NOT EXISTS(SELECT 1 FROM payment_claims WHERE order_id=o.id) AND NOT EXISTS(SELECT 1 FROM order_receipts WHERE order_id=o.id) AND NOT EXISTS(SELECT 1 FROM order_finance f WHERE f.order_id=o.id AND f.state='paid') AND NOT EXISTS(SELECT 1 FROM seller_order_fees s WHERE s.order_id=o.id AND s.amount>?)";
 const allocate=db.prepare("INSERT INTO checkout_fee_allocations(checkout_id,order_id,amount,actor_id,created_at) SELECT i.checkout_id,o.id,s.amount,?,? FROM orders o JOIN checkout_items i ON i.order_id=o.id JOIN checkout_service_fees s ON s.checkout_id=i.checkout_id WHERE "+eligibility+" AND s.amount=500 AND NOT EXISTS(SELECT 1 FROM checkout_fee_allocations a WHERE a.checkout_id=i.checkout_id)").bind(actor,time,id,amount);
 const quote=db.prepare("INSERT INTO order_finance(order_id,amount,kind,quoted_by,quoted_at) SELECT o.id,?+COALESCE((SELECT amount FROM checkout_fee_allocations WHERE order_id=o.id),0),?,?,? FROM orders o WHERE "+eligibility+" ON CONFLICT(order_id) DO UPDATE SET amount=excluded.amount,quoted_by=excluded.quoted_by,quoted_at=excluded.quoted_at WHERE order_finance.state='quoted' AND NOT EXISTS(SELECT 1 FROM payment_claims WHERE order_id=order_finance.order_id) AND NOT EXISTS(SELECT 1 FROM order_receipts WHERE order_id=order_finance.order_id)").bind(amount,kind,actor,time,id,amount);
 const audit=db.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,'invoice:quote',?,? WHERE changes()=1").bind(actor,id,time);
 const results=await db.batch([allocate,quote,audit]);
 return results[1].meta.changes===1;
}
