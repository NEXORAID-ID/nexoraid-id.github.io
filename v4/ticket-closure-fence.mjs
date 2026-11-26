// Machine-only protocol. No Discord calls. A pending fence never auto-expires:
 // releasing it without proving Discord state could permit a conflicting new order.
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
const snow=x=>typeof x==='string'&&/^\d{17,20}$/.test(x);
const ticket=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(x);
const result=(body,status=200)=>({body,status});
const conflict=()=>result({error:'Penutupan tiket belum dapat diverifikasi.'},409);
export async function closureFence(db,b,guild,t){
 if(!uuid(b.closure_id)||!snow(b.customer_id)||!snow(b.channel_id)||!ticket(b.ticket_id))return result({error:'Identitas penutupan tidak valid.'},400);
 const args=[b.closure_id,b.customer_id,guild,b.channel_id,b.ticket_id];
 const read=()=>db.prepare('SELECT closed_at,transcript_channel_id,transcript_message_id FROM ticket_closure_fences WHERE closure_id=? AND customer_id=? AND guild_id=? AND channel_id=? AND ticket_id=?').bind(...args).first();
 const state=row=>result({ok:true,state:row.closed_at==null?'closing':'closed',closure_id:b.closure_id});
 if(b.action==='closure-begin'){
  const prior=await read();if(prior)return state(prior);
  // All eligibility conditions and the insert run in a single SQLite write statement.
  // The trigger blocks every order insert while the fence is open, including checkout batches.
  const row=await db.prepare(`WITH input(closure_id,customer,guild,channel,ticket,stamp) AS (VALUES(?,?,?,?,?,?))
 INSERT INTO ticket_closure_fences(closure_id,customer_id,guild_id,channel_id,ticket_id,started_at)
 SELECT closure_id,customer,guild,channel,ticket,stamp FROM input i
 WHERE EXISTS(SELECT 1 FROM order_ticket_links l JOIN orders o ON o.id=l.order_id WHERE l.customer_id=i.customer AND o.customer_id=i.customer AND l.guild_id=i.guild AND l.channel_id=i.channel AND l.ticket_id=i.ticket)
 AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.customer_id=i.customer AND (o.status IS NULL OR o.status NOT IN ('completed','cancelled')))
 AND NOT EXISTS(SELECT 1 FROM order_ticket_links l JOIN orders o ON o.id=l.order_id LEFT JOIN web_ticket_outbox q ON q.order_id=l.order_id WHERE l.guild_id=i.guild AND l.customer_id=i.customer AND l.channel_id=i.channel AND l.ticket_id=i.ticket AND (q.delivered_at IS NULL OR q.channel_id IS NULL OR q.channel_id<>l.channel_id OR q.message_id IS NULL OR o.customer_id<>l.customer_id))
 AND NOT EXISTS(SELECT 1 FROM order_ticket_links l JOIN orders o ON o.id=l.order_id WHERE l.guild_id=i.guild AND (l.channel_id=i.channel OR l.ticket_id=i.ticket) AND (l.customer_id<>i.customer OR o.customer_id<>i.customer OR l.channel_id<>i.channel OR l.ticket_id<>i.ticket))
 ON CONFLICT DO NOTHING RETURNING closed_at`).bind(...args,t).first();
  if(row)return state(row);const replay=await read();return replay?state(replay):conflict();
 }
 if(b.action==='closure-finish'){
  if(!snow(b.transcript_channel_id)||!snow(b.transcript_message_id)||b.transcript_channel_id===b.channel_id)return result({error:'Bukti transcript tidak valid.'},400);
  const old=await read();if(!old)return conflict();
  const matches=row=>row.transcript_channel_id===b.transcript_channel_id&&row.transcript_message_id===b.transcript_message_id;
  if(old.closed_at!=null)return matches(old)?state(old):conflict();
  const row=await db.prepare('UPDATE ticket_closure_fences SET closed_at=?,transcript_channel_id=?,transcript_message_id=? WHERE closure_id=? AND customer_id=? AND guild_id=? AND channel_id=? AND ticket_id=? AND closed_at IS NULL RETURNING closed_at,transcript_channel_id,transcript_message_id').bind(t,b.transcript_channel_id,b.transcript_message_id,...args).first();
  if(row)return state(row);const replay=await read();return replay&&replay.closed_at!=null&&matches(replay)?state(replay):conflict();
 }
 return result({error:'Aksi penutupan tidak valid.'},400);
}
