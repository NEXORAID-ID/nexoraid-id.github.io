// Read-only preflight. This is not an authorization to close: a durable
// checkout/closure fence is required before performing any Discord side effects.
export async function closureStatus(db,{customer_id,channel_id,ticket_id},guild){
 const r=await db.prepare(`WITH input(guild,customer,channel,ticket) AS (VALUES (?,?,?,?)) SELECT
  (SELECT COUNT(*) FROM order_ticket_links l JOIN orders o ON o.id=l.order_id WHERE l.guild_id=(SELECT guild FROM input) AND l.customer_id=(SELECT customer FROM input) AND o.customer_id=(SELECT customer FROM input) AND l.channel_id=(SELECT channel FROM input) AND l.ticket_id=(SELECT ticket FROM input)) AS linked,
  (SELECT COUNT(*) FROM orders o WHERE o.customer_id=(SELECT customer FROM input) AND (o.status IS NULL OR o.status NOT IN ('completed','cancelled'))) AS active,
  (SELECT COUNT(*) FROM order_ticket_links l JOIN orders o ON o.id=l.order_id LEFT JOIN web_ticket_outbox q ON q.order_id=l.order_id WHERE l.guild_id=(SELECT guild FROM input) AND l.customer_id=(SELECT customer FROM input) AND l.channel_id=(SELECT channel FROM input) AND l.ticket_id=(SELECT ticket FROM input) AND (q.delivered_at IS NULL OR q.channel_id IS NULL OR q.channel_id<>l.channel_id OR q.message_id IS NULL OR o.customer_id<>l.customer_id)) AS uncertain,
  (SELECT COUNT(*) FROM order_ticket_links l JOIN orders o ON o.id=l.order_id WHERE l.guild_id=(SELECT guild FROM input) AND (l.channel_id=(SELECT channel FROM input) OR l.ticket_id=(SELECT ticket FROM input)) AND (l.customer_id<>(SELECT customer FROM input) OR o.customer_id<>(SELECT customer FROM input) OR l.channel_id<>(SELECT channel FROM input) OR l.ticket_id<>(SELECT ticket FROM input))) AS conflicts
 `).bind(guild,customer_id,channel_id,ticket_id).first();
 const counts={linked:Number(r?.linked),active:Number(r?.active),uncertain:Number(r?.uncertain),conflicts:Number(r?.conflicts)};
 if(Object.values(counts).some(n=>!Number.isSafeInteger(n)||n<0))throw Error('Closure snapshot invalid');
 return {ok:true,eligible:counts.linked>0&&counts.active===0&&counts.uncertain===0&&counts.conflicts===0,...counts,read_only:true};
}
