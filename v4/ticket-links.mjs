const guild='1487728359482851348';
const snowflake=s=>typeof s==='string'&&/^\d{17,20}$/.test(s);
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
 if(m!=='POST'||!bot||!owns)return err('Pengaitan hanya melalui bot resmi oleh customer pemilik order.',403);
 const b=await readBody(r);
 if(!b||!snowflake(b.channel_id)||b.guild_id!==guild||typeof b.ticket_id!=='string'||!/^\d{1,12}$/.test(b.ticket_id))return err('Data tiket tidak valid.',400);
 const t=Math.floor(Date.now()/1000);
 const [result]=await db.batch([db.prepare("INSERT INTO order_ticket_links SELECT id,customer_id,?,?,?,? FROM orders WHERE id=? AND customer_id=? AND status NOT IN ('completed','cancelled') ON CONFLICT(order_id) DO UPDATE SET guild_id=excluded.guild_id,channel_id=excluded.channel_id,ticket_id=excluded.ticket_id,linked_at=excluded.linked_at").bind(guild,b.channel_id,b.ticket_id,t,id,user.id),db.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,'ticket:link',?,? WHERE changes()=1").bind(user.id,id,t)]);
 return result.meta.changes?json({ok:true}):err('Order tidak aktif.',409);
}
