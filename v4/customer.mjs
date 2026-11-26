import {services} from '../services-data.js';
import {fixedPriceValue} from '../catalog.js';
import {membershipStatus,membershipMessage} from './membership.mjs';
const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const err=(error,s=400)=>json({error},s);
export function normalizeCart(items){
 if(!Array.isArray(items)||items.length<1||items.length>5)return null;
 const seen=new Set(),out=[];
 for(const x of items){if(!x||Object.keys(x).some(k=>!['service_id','quantity'].includes(k))||!services.some(s=>s.id===x.service_id)||seen.has(x.service_id)||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>99)return null;seen.add(x.service_id);out.push({service_id:x.service_id,quantity:x.quantity});}
 return out.sort((a,b)=>a.service_id.localeCompare(b.service_id));
}
// All D1 order entry points share the same per-customer request namespace.
async function legacyOrderId(customerId,key){
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(customerId+':'+key))),n=>n.toString(16).padStart(2,'0')).join('');
 return [digest.slice(0,8),digest.slice(8,12),'4'+digest.slice(13,16),'8'+digest.slice(17,20),digest.slice(20,32)].join('-');
}
export async function createCheckout({env,user,items,key,single=false}){
 const db=env.DB;
 items=normalizeCart(items);
 if(!items||typeof key!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(key)||single&&items.length!==1)return err('Layanan, jumlah atau ID permintaan tidak valid.');
 const signature=JSON.stringify(items),legacyId=await legacyOrderId(user.id,key);
 const response=(id,rows,replayed)=>json(single?{order:rows[0],...(replayed?{replayed:true}:{})}:{checkout_id:id,orders:rows,...(replayed?{replayed:true}:{})},replayed?200:201);
 const replay=async(replayed=true)=>{
  const g=await db.prepare('SELECT id,signature FROM checkout_groups WHERE customer_id=? AND request_id=?').bind(user.id,key).first();
  if(g){
   if(g.signature!==signature)return err('ID permintaan sudah digunakan untuk order lain.',409);
   const rows=(await db.prepare('SELECT o.id,o.service_id,o.quantity,o.catalog_price,o.estimate,o.status FROM orders o JOIN checkout_items i ON i.order_id=o.id WHERE i.checkout_id=? AND o.customer_id=? ORDER BY o.service_id').bind(g.id,user.id).all()).results;
   if(rows.length!==items.length)throw Error('checkout_integrity');
   return response(g.id,rows,replayed);
  }
  // Existing single orders predate the shared registry. Preserve their ID and
  // never create another order if that historical request is retried via cart.
  const old=await db.prepare('SELECT id,service_id,quantity,catalog_price,estimate,status FROM orders WHERE id=? AND customer_id=?').bind(legacyId,user.id).first();
  if(!old)return null;
  if(items.length!==1||old.service_id!==items[0].service_id||old.quantity!==items[0].quantity)return err('ID permintaan sudah digunakan untuk order lain.',409);
  return response(old.id,[old],true);
 };
 const old=await replay();if(old)return old;
 const membership=await membershipStatus(env,user.id,env.DISCORD_MEMBERSHIP_FETCH||fetch);
 if(membership!==200)return err(membershipMessage(membership),membership);
 const id=crypto.randomUUID(),t=Math.floor(Date.now()/1000);
 const statements=[db.prepare('INSERT INTO checkout_groups VALUES(?,?,?,?,?,?)').bind(id,user.id,key,signature,items.length,t)];
 for(const item of items){
  const service=services.find(s=>s.id===item.service_id),orderId=items.length===1?legacyId:crypto.randomUUID();
  // Evaluate the CURRENT override and price inside the same D1 transaction as
  // the quota trigger, order, ticket outbox and audit. No pre-read pricing.
  statements.push(db.prepare(`INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,estimate,created_at,updated_at)
   SELECT ?,?,?,?,CASE WHEN unit IS NULL THEN ? ELSE 'Rp'||replace(printf('%,d',unit),',','.') END,unit*?,?,?
   FROM (SELECT CASE WHEN COALESCE(c.amount,base.amount) IS NULL THEN NULL
    ELSE MAX(1,COALESCE(c.amount,base.amount)*(100-COALESCE(c.promo_percent,0))/100) END AS unit
    FROM (SELECT ? AS amount) base LEFT JOIN catalog_overrides c ON c.service_id=?)`)
   .bind(orderId,user.id,item.service_id,item.quantity,service.price,item.quantity,t,t,fixedPriceValue(service.price),item.service_id),
   db.prepare('INSERT INTO checkout_items VALUES(?,?)').bind(id,orderId),
   db.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) VALUES(?,'order:create',?,?)").bind(user.id,orderId,t));
 }
 try{await db.batch(statements);}catch(e){
  const existing=await replay();if(existing)return existing;
  const reason=String(e?.message);
  if(reason.includes('ticket_closure_pending'))return err('Tiket sebelumnya sedang ditutup. Coba kembali setelah proses selesai.',409);
  if(reason.includes('checkout_quota'))return err('Maksimal lima permintaan per jam.',429);
  if(reason.includes('rental_stock_unavailable'))return err('Stok sewa tidak tersedia.',409);
  if(reason.includes('catalog_disabled'))return err('Layanan sedang tidak tersedia.',409);
  throw e;
 }
 const committed=await replay(false);if(!committed)throw Error('checkout_commit_missing');return committed;
}
export function deviceLabel(ua=''){return (/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iOS':/Windows/i.test(ua)?'Windows':/Macintosh/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'Perangkat lain')+' · '+(/Edg\//i.test(ua)?'Edge':/Firefox|FxiOS/i.test(ua)?'Firefox':/Chrome|CriOS/i.test(ua)?'Chrome':/Safari/i.test(ua)?'Safari':'Browser');}
export async function customer({p,m,user,env,r,readBody,sessionHash}){
 const db=env.DB,t=Math.floor(Date.now()/1000);
 if(p==='/api/customer/saved'&&m==='GET'){const rows=(await db.prepare('SELECT service_id FROM saved_services WHERE user_id=? ORDER BY service_id').bind(user.id).all()).results;return json({saved:rows.map(x=>x.service_id)});}
 if(p==='/api/customer/saved'&&m==='POST'){const b=await readBody(r);if(!services.some(s=>s.id===b?.service_id)||typeof b.saved!=='boolean')return err('Layanan tidak valid.');if(b.saved)await db.prepare('INSERT INTO saved_services VALUES(?,?,?) ON CONFLICT(user_id,service_id) DO NOTHING').bind(user.id,b.service_id,t).run();else await db.prepare('DELETE FROM saved_services WHERE user_id=? AND service_id=?').bind(user.id,b.service_id).run();return json({ok:true});}
 if(p==='/api/customer/sessions'&&m==='GET'){const rows=(await db.prepare('SELECT m.public_id,m.device,m.created_at,s.expires_at,s.token_hash FROM sessions s JOIN session_metadata m ON m.token_hash=s.token_hash WHERE s.user_id=? AND s.expires_at>? ORDER BY m.created_at DESC LIMIT 100').bind(user.id,t).all()).results;return json({sessions:rows.map(({token_hash,...x})=>({...x,current:token_hash===sessionHash}))});}
 if(p==='/api/customer/sessions/revoke'&&m==='POST'){const b=await readBody(r);if(typeof b?.id!=='string'||!/^[a-f0-9-]{32,36}$/i.test(b.id))return err('Sesi tidak valid.');const row=await db.prepare('SELECT s.token_hash FROM sessions s JOIN session_metadata m ON m.token_hash=s.token_hash WHERE m.public_id=? AND s.user_id=?').bind(b.id,user.id).first();if(!row)return err('Sesi tidak ditemukan.',404);if(row.token_hash===sessionHash)return err('Gunakan tombol keluar untuk sesi aktif.',409);await db.prepare('DELETE FROM sessions WHERE token_hash=? AND user_id=?').bind(row.token_hash,user.id).run();return json({ok:true});}
 if(p!=='/api/customer/checkout'||m!=='POST')return null;
 const b=await readBody(r);
 return createCheckout({env,user,items:b?.items,key:b?.request_id});
}
