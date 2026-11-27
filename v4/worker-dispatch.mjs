// A worker must explicitly confirm availability; no row is OFF. Confirmation expires after four hours.
export const PRESENCE_TTL=4*60*60;
export function activePresence(row,now){return row?.available===1&&Number.isSafeInteger(row.updated_at)&&row.updated_at<=now&&row.updated_at>now-PRESENCE_TTL;}
const eligible="u.role='worker' AND u.id<>? AND u.id<>? AND p.available=1 AND p.updated_at>? AND p.updated_at<=? AND NOT EXISTS(SELECT 1 FROM management_grants g WHERE g.user_id=u.id) AND NOT EXISTS(SELECT 1 FROM account_suspensions a WHERE a.user_id=u.id)";
export async function dispatchAvailableOrder(db,{now,owner,verifyWorker}){
 // Only new canonical web orders with a confirmed ticket mapping; never import historic channels.
 const order=await db.prepare("SELECT o.id,o.customer_id FROM orders o JOIN web_ticket_outbox q ON q.order_id=o.id JOIN order_ticket_links l ON l.order_id=o.id AND l.customer_id=o.customer_id AND l.channel_id=q.channel_id WHERE o.status='requested' AND o.assigned_to IS NULL AND q.delivered_at IS NOT NULL ORDER BY o.created_at,o.id LIMIT 1").first();
 if(!order)return {ok:true,assigned:false};
 const candidates=(await db.prepare("SELECT u.id FROM users u JOIN worker_presence p ON p.worker_id=u.id WHERE "+eligible+" ORDER BY RANDOM() LIMIT 5").bind(order.customer_id,owner||'',now-PRESENCE_TTL,now).all()).results;
 for(const candidate of candidates){
  if(!/^\d{17,20}$/.test(candidate.id)||!await verifyWorker(candidate.id))continue;
  // Recheck exact order and worker in the same atomic D1 batch, including concurrent OFF/claim/suspension.
  const rows=await db.batch([
   db.prepare("UPDATE orders SET assigned_to=?,status='claimed',updated_at=? WHERE id=? AND status='requested' AND assigned_to IS NULL AND customer_id<>? AND EXISTS(SELECT 1 FROM users u JOIN worker_presence p ON p.worker_id=u.id WHERE u.id=? AND "+eligible+") AND EXISTS(SELECT 1 FROM web_ticket_outbox q JOIN order_ticket_links l ON l.order_id=q.order_id AND l.channel_id=q.channel_id WHERE q.order_id=orders.id AND q.delivered_at IS NOT NULL)").bind(candidate.id,now,order.id,candidate.id,candidate.id,order.customer_id,owner||'',now-PRESENCE_TTL,now),
   db.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,'order:auto_assign',?,? WHERE changes()=1").bind(candidate.id,order.id,now)
  ]);
  if(rows[0].meta.changes===1)return {ok:true,assigned:true};
 }
 return {ok:true,assigned:false};
}
