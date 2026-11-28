// Only the owner-configured policy authorizes an automatic fixed-price quote.
// quoted_by records that policy principal; audit action distinguishes automation
// from a human quote. No payment, fee allocation, or receipt is created.
export function autoInvoiceEnabled(env){return env?.AUTO_FIXED_INVOICE_ENABLED==='true'&&env?.CHECKOUT_FEE_POLICY_TRIAL!=='true'&&env?.CHECKOUT_FEE_PREVIEW!=='true';}
export function fixedInvoiceStatements(db,{id,worker,owner,time,requireCanonical=false}){
 if(!/^\d{17,20}$/.test(owner||'')||!/^\d{17,20}$/.test(worker||'')||owner===worker)return [];
 return [
 db.prepare(`INSERT INTO order_finance(order_id,amount,kind,quoted_by,quoted_at)
 SELECT o.id,o.estimate,CASE WHEN substr(o.service_id,1,4)='gta-' THEN 'joki' ELSE 'other' END,?,?
 FROM orders o WHERE changes()=1 AND o.id=? AND o.assigned_to=? AND o.status='claimed' AND o.updated_at=?
 AND o.service_id<>'seller' AND typeof(o.estimate)='integer' AND o.estimate BETWEEN 1 AND 999999999
 AND (substr(o.service_id,1,4)='gta-' OR o.estimate>=10000)
 AND EXISTS(SELECT 1 FROM users u WHERE u.id=? AND NOT EXISTS(SELECT 1 FROM account_suspensions a WHERE a.user_id=u.id))
 ${requireCanonical?"AND EXISTS(SELECT 1 FROM web_ticket_outbox q JOIN order_ticket_links l ON l.order_id=q.order_id AND l.customer_id=o.customer_id AND l.channel_id=q.channel_id WHERE q.order_id=o.id AND q.delivered_at IS NOT NULL AND q.message_id IS NOT NULL AND l.guild_id='1487728359482851348')":''}
 AND NOT EXISTS(SELECT 1 FROM payment_claims c WHERE c.order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM order_receipts r WHERE r.order_id=o.id)
 ON CONFLICT(order_id) DO NOTHING`).bind(owner,time,id,worker,time,owner),
 db.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,'invoice:auto_quote',?,? WHERE changes()=1").bind(owner,id,time)
 ];
}
