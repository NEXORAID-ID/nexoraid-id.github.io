// Read-only preflight. This is not an authorization to close: a durable
// checkout/closure fence is required before performing any Discord side effects.
export async function closureStatus(db,{customer_id,channel_id,ticket_id},guild){
 const r=await db.prepare(`SELECT
  (SELECT COUNT(*) FROM order_ticket_links l JOIN orders o ON o.id=l.order_id WHERE l.guild_id=?1 AND l.customer_id=?2 AND o.customer_id=?2 AND l.channel_id=?3 AND l.ticket_id=?4) AS linked,
  (SELECT COUNT(*) FROM orders o WHERE o.customer_id=?2 AND (o.status IS NULL OR o.status NOT IN ('completed','cancelled'))) AS active,
  (SELECT COUNT(*) FROM order_ticket_links l JOIN orders o ON o.id=l.order_id LEFT JOIN web_ticket_outbox q ON q.order_id=l.order_id WHERE l.guild_id=?1 AND l.customer_id=?2 AND l.channel_id=?3 AND l.ticket_id=?4 AND (q.delivered_at IS NULL OR q.channel_id IS NULL OR q.channel_id<>l.channel_id OR q.message_id IS NULL OR o.customer_id<>l.customer_id)) AS uncertain,
  (SELECT COUNT(*) FROM order_ticket_links l JOIN orders o ON o.id=l.order_id WHERE l.guild_id=?1 AND (l.channel_id=?3 OR l.ticket_id=?4) AND (l.customer_id<>?2 OR o.customer_id<>?2 OR l.channel_id<>?3 OR l.ticket_id<>?4)) AS conflicts
 `).bind(guild,customer_id,channel_id,ticket_id).first();
 const counts={linked:Number(r?.linked),active:Number(r?.active),uncertain:Number(r?.uncertain),conflicts:Number(r?.conflicts)};
 if(Object.values(counts).some(n=>!Number.isSafeInteger(n)||n<0))throw Error('Closure snapshot invalid');
 return {ok:true,eligible:counts.linked>0&&counts.active===0&&counts.uncertain===0&&counts.conflicts===0,...counts,read_only:true};
}
