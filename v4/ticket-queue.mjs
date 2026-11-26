import {services} from '../services-data.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const err=(error,status)=>json({error},status);
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
const snow=x=>typeof x==='string'&&/^\d{17,20}$/.test(x);
const guild='1487728359482851348';
export async function ticketQueue({db,r,m,readBody,clock=()=>Math.floor(Date.now()/1000),token=()=>crypto.randomUUID(),maintenance=false}){
 if(m!=='POST')return err('Metode tidak diizinkan.',405);
 const b=await readBody(r),t=clock();
 if(b?.action==='health'){const probe=await db.prepare('SELECT COUNT(*) AS probe FROM web_ticket_outbox WHERE 0').first();return probe?.probe===0?json({ok:true}):err('Queue tidak siap.',503);}
 if(maintenance)return err('Antrean dalam pemeliharaan.',503);
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
 const previous=await db.prepare('SELECT channel_id,message_id FROM web_ticket_outbox WHERE order_id=? AND delivered_at IS NOT NULL').bind(b.order_id).first();
 if(previous)return previous.channel_id===b.channel_id&&previous.message_id===b.message_id?json({ok:true,replayed:true}):err('Tiket sudah tercatat.',409);
 const results=await db.batch([
 db.prepare("INSERT INTO order_ticket_links(order_id,customer_id,guild_id,channel_id,ticket_id,linked_at) SELECT o.id,o.customer_id,?,?,?,? FROM orders o JOIN web_ticket_outbox q ON q.order_id=o.id WHERE o.id=? AND q.lease_token=? AND q.lease_until>? AND q.delivered_at IS NULL AND o.status NOT IN ('completed','cancelled') ON CONFLICT(order_id) DO NOTHING").bind(guild,b.channel_id,b.ticket_id,t,b.order_id,b.lease_token,t),
 db.prepare("UPDATE web_ticket_outbox SET channel_id=?,message_id=?,delivered_at=?,lease_token=NULL,lease_until=NULL WHERE order_id=? AND lease_token=? AND lease_until>? AND delivered_at IS NULL AND EXISTS(SELECT 1 FROM orders o WHERE o.id=web_ticket_outbox.order_id AND o.status NOT IN ('completed','cancelled')) AND EXISTS(SELECT 1 FROM order_ticket_links l WHERE l.order_id=web_ticket_outbox.order_id AND l.guild_id=? AND l.channel_id=? AND l.ticket_id=?)").bind(b.channel_id,b.message_id,t,b.order_id,b.lease_token,t,guild,b.channel_id,b.ticket_id)
 ]);
 return results[1].meta.changes?json({ok:true}):err('Lease atau hubungan tiket tidak sesuai.',409);
}
