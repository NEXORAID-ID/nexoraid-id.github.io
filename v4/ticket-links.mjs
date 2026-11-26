const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const err=(error,status)=>json({error},status);
export async function ticketLinks({p,m,user,env,bot,r,readBody}){
 const match=p.match(/^\/api\/orders\/([a-f0-9-]{36})\/ticket$/);
 if(!match)return null;
 const id=match[1],db=env.DB;
 const order=await db.prepare('SELECT id,customer_id,assigned_to,status FROM orders WHERE id=?').bind(id).first();
 if(!order)return err('Order tidak ditemukan.',404);
 const owns=order.customer_id===user.id;
 const allowed=owns||['owner','management'].includes(user.role)||user.role==='worker'&&order.assigned_to===user.id;
 if(!allowed||bot&&!owns)return err('Order tidak ditemukan.',404);
 if(m==='GET'){
  const ticket=await db.prepare('SELECT guild_id,channel_id,ticket_id,linked_at FROM order_ticket_links WHERE order_id=?').bind(id).first();
  const delivery=await db.prepare('SELECT delivered_at,channel_id,message_id,attempts FROM web_ticket_outbox WHERE order_id=?').bind(id).first();
  const sync=delivery?delivery.delivered_at&&ticket?.channel_id===delivery.channel_id?'delivered':delivery.delivered_at?'needs_review':delivery.attempts>0?'retrying':'queued':'legacy';
  return json({ticket,sync,can_link:owns&&!['completed','cancelled'].includes(order.status)});
 }
 // All new links must be acknowledged through the machine lease endpoint.
 // Legacy records are read-only until owner reconciliation; actor credentials
 // cannot authorize arbitrary Discord channel IDs.
 return err('Pengaitan tiket hanya melalui antrean resmi NEXORAID.',403);
}
