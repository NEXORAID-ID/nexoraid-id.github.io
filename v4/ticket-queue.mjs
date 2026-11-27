import {closureStatus} from './ticket-closure-status.mjs';
import {closureFence} from './ticket-closure-fence.mjs';
import {services} from '../services-data.js';
import {dispatchAvailableOrder} from './worker-dispatch.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const err=(error,status)=>json({error},status);
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
const snow=x=>typeof x==='string'&&/^\d{17,20}$/.test(x);
const guild='1487728359482851348';
export async function ticketQueue({db,r,m,readBody,clock=()=>Math.floor(Date.now()/1000),token=()=>crypto.randomUUID(),maintenance=false,owner,verifyWorker,exclusive=false,autoInvoice=false}){
 if(m!=='POST')return err('Metode tidak diizinkan.',405);
 const b=await readBody(r),t=clock();
 if(b?.action==='health'){const probe=await db.prepare('SELECT COUNT(*) AS probe FROM web_ticket_outbox WHERE 0').first();return probe?.probe===0?json({ok:true}):err('Queue tidak siap.',503);}
 if(b?.action==='readiness'){
  // Single read-only snapshot: never lease, backfill, mutate orders, or expose customer IDs.
  const counts=await db.prepare(`SELECT
   (SELECT COUNT(*) FROM orders o WHERE o.status NOT IN ('completed','cancelled')) AS active,
   (SELECT COUNT(*) FROM orders o LEFT JOIN web_ticket_outbox q ON q.order_id=o.id WHERE o.status NOT IN ('completed','cancelled') AND q.order_id IS NULL) AS historicalUnqueued,
   (SELECT COUNT(*) FROM web_ticket_outbox q JOIN orders o ON o.id=q.order_id WHERE o.status NOT IN ('completed','cancelled') AND q.delivered_at IS NULL) AS pending,
   (SELECT COUNT(*) FROM web_ticket_outbox q JOIN orders o ON o.id=q.order_id WHERE o.status NOT IN ('completed','cancelled') AND q.delivered_at IS NULL AND q.next_attempt<=? AND (q.lease_until IS NULL OR q.lease_until<=?)) AS eligible,
   (SELECT COUNT(*) FROM web_ticket_outbox q WHERE q.delivered_at IS NULL AND q.lease_until>?) AS leased,
   (SELECT COUNT(*) FROM web_ticket_outbox q WHERE q.delivered_at IS NOT NULL) AS delivered,
   (SELECT COUNT(*) FROM web_ticket_outbox q JOIN orders o ON o.id=q.order_id LEFT JOIN order_ticket_links l ON l.order_id=q.order_id WHERE q.delivered_at IS NOT NULL AND (l.order_id IS NULL OR l.guild_id<>? OR l.customer_id<>o.customer_id OR l.channel_id<>q.channel_id)) AS inconsistent,
   (SELECT COUNT(*) FROM (SELECT l.customer_id FROM order_ticket_links l JOIN orders o ON o.id=l.order_id WHERE l.guild_id=? AND o.status NOT IN ('completed','cancelled') GROUP BY l.customer_id HAVING COUNT(DISTINCT l.channel_id)>1 OR COUNT(DISTINCT l.ticket_id)>1)) AS splitActive
  `).bind(t,t,t,guild,guild).first();
  if(!counts||Object.values(counts).some(v=>!Number.isSafeInteger(v)||v<0))return err('Pemeriksaan antrean tidak valid.',503);
  return json({ok:true,read_only:true,maintenance:Boolean(maintenance),...counts});
 }
 if(b?.action==='missing-status'){
  if(!snow(b.customer_id)||!snow(b.channel_id)||typeof b.ticket_id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(b.ticket_id))return err('Identitas tiket tidak valid.',400);
  // No transcript is fabricated, no D1 link/fence is changed. Only a fully
  // cancelled, acknowledged mapping without an existing fence may be retired locally.
  const row=await db.prepare(`WITH i(guild,customer,channel,ticket) AS (VALUES(?,?,?,?)) SELECT
   (SELECT COUNT(*) FROM order_ticket_links l JOIN orders o ON o.id=l.order_id AND o.customer_id=l.customer_id JOIN web_ticket_outbox q ON q.order_id=o.id AND q.channel_id=l.channel_id CROSS JOIN i WHERE l.guild_id=i.guild AND l.customer_id=i.customer AND l.channel_id=i.channel AND l.ticket_id=i.ticket AND q.delivered_at IS NOT NULL AND q.message_id IS NOT NULL AND o.status='cancelled') AS cancelled,
   (SELECT COUNT(*) FROM order_ticket_links l CROSS JOIN i WHERE l.guild_id=i.guild AND (l.channel_id=i.channel OR l.ticket_id=i.ticket)) AS mapped,
   (SELECT COUNT(*) FROM orders o CROSS JOIN i WHERE o.customer_id=i.customer AND o.status NOT IN ('cancelled','completed')) AS active,
   (SELECT COUNT(*) FROM ticket_closure_fences f CROSS JOIN i WHERE f.guild_id=i.guild AND (f.channel_id=i.channel OR f.ticket_id=i.ticket OR (f.customer_id=i.customer AND f.closed_at IS NULL))) AS fences
  `).bind(guild,b.customer_id,b.channel_id,b.ticket_id).first();
  if(!row||Object.values(row).some(v=>!Number.isSafeInteger(v)||v<0))return err('Pemeriksaan recovery tidak valid.',503);
  return json({ok:true,read_only:true,...row,eligible:row.cancelled>0&&row.cancelled===row.mapped&&row.active===0&&row.fences===0});
 }
 if(b?.action==='message-status'){
  if(!snow(b.customer_id)||!snow(b.channel_id)||typeof b.ticket_id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(b.ticket_id))return err('Identitas tiket tidak valid.',400);
  // Only acknowledged canonical web messages, never arbitrary orders or legacy tickets.
  const rows=(await db.prepare(`SELECT o.id,o.status,o.updated_at,q.message_id,o.assigned_to,
   CASE
    WHEN EXISTS(SELECT 1 FROM order_refunds r WHERE r.order_id=o.id) OR EXISTS(SELECT 1 FROM completed_refunds r WHERE r.order_id=o.id) OR EXISTS(SELECT 1 FROM receipt_refunds r WHERE r.order_id=o.id AND r.kind='partial_cancel') THEN 'refund_recorded'
    WHEN f.state='paid' THEN 'verified'
    WHEN o.status='cancelled' THEN 'cancelled'
    WHEN EXISTS(SELECT 1 FROM payment_claims c WHERE c.order_id=o.id) THEN 'reported'
    WHEN COALESCE(pt.received,0)>0 THEN 'partial'
    WHEN f.state='quoted' THEN 'awaiting'
    ELSE 'unquoted'
   END AS payment_status FROM order_ticket_links l
   JOIN orders o ON o.id=l.order_id AND o.customer_id=l.customer_id
   JOIN web_ticket_outbox q ON q.order_id=o.id AND q.channel_id=l.channel_id
   LEFT JOIN order_finance f ON f.order_id=o.id LEFT JOIN order_payment_totals pt ON pt.order_id=o.id
   WHERE l.guild_id=? AND l.customer_id=? AND l.channel_id=? AND l.ticket_id=? AND q.delivered_at IS NOT NULL AND q.message_id IS NOT NULL
   ORDER BY o.id LIMIT 101`).bind(guild,b.customer_id,b.channel_id,b.ticket_id).all()).results;
  if(rows.length>100||rows.some(x=>!uuid(x.id)||!snow(x.message_id)||!['requested','claimed','confirmed','processing','completed','cancelled'].includes(x.status)||!Number.isSafeInteger(x.updated_at)||(x.assigned_to!=null&&!snow(x.assigned_to))||!['refund_recorded','verified','cancelled','reported','partial','awaiting','unquoted'].includes(x.payment_status)))return err('Pemetaan pesan memerlukan pemeriksaan.',409);
  return json({ok:true,read_only:true,random_assignment_exclusive:exclusive,orders:rows});
 }
 if(maintenance)return err('Antrean dalam pemeliharaan.',503);
 if(b?.action==='dispatch'){if(typeof verifyWorker!=='function')return err('Verifikasi penjoki belum siap.',503);return json(await dispatchAvailableOrder(db,{now:t,owner,verifyWorker,clock,autoInvoice}));}
 if(['closure-begin','closure-finish','closure-state'].includes(b?.action)){
  const result=await closureFence(db,b,guild,t);
  return json(result.body,result.status);
 }
 if(b?.action==='closure-status'){
  if(!snow(b.customer_id)||!snow(b.channel_id)||typeof b.ticket_id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(b.ticket_id))return err('Identitas tiket tidak valid.',400);
  return json(await closureStatus(db,b,guild));
 }
 if(b?.action==='lease'){
  const lease=token();
  const result=await db.prepare("UPDATE web_ticket_outbox SET lease_token=?,lease_until=?,attempts=attempts+1 WHERE order_id=(SELECT q.order_id FROM web_ticket_outbox q JOIN orders o ON o.id=q.order_id WHERE q.delivered_at IS NULL AND q.next_attempt<=? AND (q.lease_until IS NULL OR q.lease_until<=?) AND o.status NOT IN ('completed','cancelled') ORDER BY q.next_attempt,o.created_at,o.id LIMIT 1) RETURNING order_id").bind(lease,t+180,t,t).first();
  if(!result)return json({order:null});
  const o=await db.prepare('SELECT id,customer_id,service_id,quantity,estimate,status,created_at FROM orders WHERE id=?').bind(result.order_id).first();
  return json({order:{...o,service_name:services.find(s=>s.id===o.service_id)?.name||o.service_id},lease_token:lease,lease_until:t+180});
 }
 if(!uuid(b?.order_id)||!uuid(b?.lease_token))return err('Order atau lease tidak valid.',400);
 if(b.action==='renew'){
  const result=await db.prepare("UPDATE web_ticket_outbox SET lease_until=?+180 WHERE order_id=? AND lease_token=? AND lease_until>? AND delivered_at IS NULL AND EXISTS(SELECT 1 FROM orders o WHERE o.id=web_ticket_outbox.order_id AND o.status NOT IN ('completed','cancelled')) RETURNING lease_until").bind(t,b.order_id,b.lease_token,t).first();
  return result?json({ok:true,lease_until:result.lease_until}):err('Lease sudah berakhir.',409);
 }
 if(b.action==='check'){
  const active=await db.prepare("SELECT q.order_id FROM web_ticket_outbox q JOIN orders o ON o.id=q.order_id WHERE q.order_id=? AND q.lease_token=? AND q.lease_until>? AND q.delivered_at IS NULL AND o.status NOT IN ('completed','cancelled')").bind(b.order_id,b.lease_token,t).first();
  return active?json({ok:true}):err('Order atau lease tidak aktif.',409);
 }
 if(b.action==='retry'){
  const res=await db.prepare("UPDATE web_ticket_outbox SET lease_token=NULL,lease_until=NULL,next_attempt=?+MIN(3600,30*(1 << MIN(attempts,7))) WHERE order_id=? AND lease_token=? AND lease_until>? AND delivered_at IS NULL").bind(t,b.order_id,b.lease_token,t).run();
  return res.meta.changes?json({ok:true}):err('Lease sudah berakhir.',409);
 }
 if(b.action!=='ack'||!snow(b.channel_id)||!snow(b.message_id)||typeof b.ticket_id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(b.ticket_id))return err('Data tiket tidak valid.',400);
 const previous=await db.prepare('SELECT q.channel_id,q.message_id,l.ticket_id,l.guild_id,l.channel_id AS linked_channel,l.customer_id,o.customer_id AS order_customer FROM web_ticket_outbox q LEFT JOIN order_ticket_links l ON l.order_id=q.order_id JOIN orders o ON o.id=q.order_id WHERE q.order_id=? AND q.delivered_at IS NOT NULL').bind(b.order_id).first();
 if(previous)return previous.channel_id===b.channel_id&&previous.message_id===b.message_id&&previous.ticket_id===b.ticket_id&&previous.guild_id===guild&&previous.linked_channel===b.channel_id&&previous.customer_id===previous.order_customer?json({ok:true,replayed:true}):err('Tiket sudah tercatat.',409);
 const blocked=await db.prepare('SELECT closure_id FROM ticket_closure_fences WHERE guild_id=? AND (channel_id=? OR ticket_id=?)').bind(guild,b.channel_id,b.ticket_id).first();
 if(blocked)return err('Tiket sedang atau sudah ditutup.',409);
 let results;try{results=await db.batch([
 db.prepare("INSERT INTO order_ticket_links(order_id,customer_id,guild_id,channel_id,ticket_id,linked_at) SELECT o.id,o.customer_id,?,?,?,? FROM orders o JOIN web_ticket_outbox q ON q.order_id=o.id WHERE o.id=? AND q.lease_token=? AND q.lease_until>? AND q.delivered_at IS NULL AND o.status NOT IN ('completed','cancelled') AND NOT EXISTS(SELECT 1 FROM order_ticket_links x JOIN orders xo ON xo.id=x.order_id WHERE x.guild_id=? AND x.order_id<>o.id AND (((x.channel_id=? OR x.ticket_id=?) AND (x.customer_id<>o.customer_id OR x.channel_id<>? OR x.ticket_id<>?)) OR (x.customer_id=o.customer_id AND xo.status NOT IN ('completed','cancelled') AND (x.channel_id<>? OR x.ticket_id<>?)))) ON CONFLICT(order_id) DO NOTHING").bind(guild,b.channel_id,b.ticket_id,t,b.order_id,b.lease_token,t,guild,b.channel_id,b.ticket_id,b.channel_id,b.ticket_id,b.channel_id,b.ticket_id),
 db.prepare("UPDATE web_ticket_outbox SET channel_id=?,message_id=?,delivered_at=?,lease_token=NULL,lease_until=NULL WHERE order_id=? AND lease_token=? AND lease_until>? AND delivered_at IS NULL AND EXISTS(SELECT 1 FROM orders o WHERE o.id=web_ticket_outbox.order_id AND o.status NOT IN ('completed','cancelled')) AND EXISTS(SELECT 1 FROM order_ticket_links l WHERE l.order_id=web_ticket_outbox.order_id AND l.guild_id=? AND l.channel_id=? AND l.ticket_id=? AND l.customer_id=(SELECT customer_id FROM orders WHERE id=web_ticket_outbox.order_id)) AND NOT EXISTS(SELECT 1 FROM order_ticket_links x JOIN orders xo ON xo.id=x.order_id JOIN orders o ON o.id=web_ticket_outbox.order_id WHERE x.guild_id=? AND x.order_id<>o.id AND (((x.channel_id=? OR x.ticket_id=?) AND (x.customer_id<>o.customer_id OR x.channel_id<>? OR x.ticket_id<>?)) OR (x.customer_id=o.customer_id AND xo.status NOT IN ('completed','cancelled') AND (x.channel_id<>? OR x.ticket_id<>?))))").bind(b.channel_id,b.message_id,t,b.order_id,b.lease_token,t,guild,b.channel_id,b.ticket_id,guild,b.channel_id,b.ticket_id,b.channel_id,b.ticket_id,b.channel_id,b.ticket_id)
 ]);}catch(e){if(String(e.message).includes('ticket_closure_relink'))return err('Tiket sedang atau sudah ditutup.',409);throw e;}
 return results[1].meta.changes?json({ok:true}):err('Lease atau hubungan tiket tidak sesuai.',409);
}
