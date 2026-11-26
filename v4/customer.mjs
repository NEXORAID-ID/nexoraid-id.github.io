import {services} from '../services-data.js';
import {applyOverride,catalogPricingState} from './business.mjs';
import {guardedCatalogPrice,catalogPriceBindings,catalogChangedError} from './catalog-snapshot.mjs';
import {membershipStatus,membershipMessage} from './membership.mjs';
const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const err=(error,s=400)=>json({error},s);
export function normalizeCart(items){
 if(!Array.isArray(items)||items.length<1||items.length>5)return null;
 const seen=new Set(),out=[];
 for(const x of items){if(!x||!services.some(s=>s.id===x.service_id)||seen.has(x.service_id)||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>99)return null;seen.add(x.service_id);out.push({service_id:x.service_id,quantity:x.quantity});}
 return out.sort((a,b)=>a.service_id.localeCompare(b.service_id));
}
export function deviceLabel(ua=''){return (/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iOS':/Windows/i.test(ua)?'Windows':/Macintosh/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'Perangkat lain')+' · '+(/Edg\//i.test(ua)?'Edge':/Firefox|FxiOS/i.test(ua)?'Firefox':/Chrome|CriOS/i.test(ua)?'Chrome':/Safari/i.test(ua)?'Safari':'Browser');}
export async function customer({p,m,user,env,r,readBody,sessionHash}){
 const db=env.DB,t=Math.floor(Date.now()/1000);
 if(p==='/api/customer/saved'&&m==='GET'){const rows=(await db.prepare('SELECT service_id FROM saved_services WHERE user_id=? ORDER BY service_id').bind(user.id).all()).results;return json({saved:rows.map(x=>x.service_id)});}
 if(p==='/api/customer/saved'&&m==='POST'){const b=await readBody(r);if(!services.some(s=>s.id===b?.service_id)||typeof b.saved!=='boolean')return err('Layanan tidak valid.');if(b.saved)await db.prepare('INSERT INTO saved_services VALUES(?,?,?) ON CONFLICT(user_id,service_id) DO NOTHING').bind(user.id,b.service_id,t).run();else await db.prepare('DELETE FROM saved_services WHERE user_id=? AND service_id=?').bind(user.id,b.service_id).run();return json({ok:true});}
 if(p==='/api/customer/sessions'&&m==='GET'){const rows=(await db.prepare('SELECT m.public_id,m.device,m.created_at,s.expires_at,s.token_hash FROM sessions s JOIN session_metadata m ON m.token_hash=s.token_hash WHERE s.user_id=? AND s.expires_at>? ORDER BY m.created_at DESC LIMIT 100').bind(user.id,t).all()).results;return json({sessions:rows.map(({token_hash,...x})=>({...x,current:token_hash===sessionHash}))});}
 if(p==='/api/customer/sessions/revoke'&&m==='POST'){const b=await readBody(r);if(typeof b?.id!=='string'||!/^[a-f0-9-]{32,36}$/i.test(b.id))return err('Sesi tidak valid.');const row=await db.prepare('SELECT s.token_hash FROM sessions s JOIN session_metadata m ON m.token_hash=s.token_hash WHERE m.public_id=? AND s.user_id=?').bind(b.id,user.id).first();if(!row)return err('Sesi tidak ditemukan.',404);if(row.token_hash===sessionHash)return err('Gunakan tombol keluar untuk sesi aktif.',409);await db.prepare('DELETE FROM sessions WHERE token_hash=? AND user_id=?').bind(row.token_hash,user.id).run();return json({ok:true});}
 if(p!=='/api/customer/checkout'||m!=='POST')return null;
 const b=await readBody(r),items=normalizeCart(b?.items);
 if(!items||typeof b?.request_id!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(b.request_id))return err('Keranjang 1–5 layanan unik dan ID permintaan wajib.');
 const signature=JSON.stringify(items);
 const replay=async()=>{const g=await db.prepare('SELECT id,signature FROM checkout_groups WHERE customer_id=? AND request_id=?').bind(user.id,b.request_id).first();if(!g)return null;if(g.signature!==signature)return err('ID checkout sudah digunakan.',409);const rows=(await db.prepare('SELECT o.id,o.service_id,o.quantity,o.catalog_price,o.estimate,o.status FROM orders o JOIN checkout_items i ON i.order_id=o.id WHERE i.checkout_id=? ORDER BY o.service_id').bind(g.id).all()).results;return json({checkout_id:g.id,orders:rows,replayed:true});};
 const old=await replay();if(old)return old;
 const membership=await membershipStatus(env,user.id,env.DISCORD_MEMBERSHIP_FETCH||fetch);
 if(membership!==200)return err(membershipMessage(membership),membership);
 const pricing=await catalogPricingState(db),catalog=new Map(services.map(s=>[s.id,applyOverride(s,pricing.get(s.id),t)]));if(items.some(i=>!catalog.get(i.service_id)?.enabled))return err('Layanan tidak tersedia.',409);
 const id=crypto.randomUUID(),rows=items.map(i=>{const s=catalog.get(i.service_id);return {...i,id:crypto.randomUUID(),catalog_price:s.price,estimate:s.unit_amount===null?null:s.unit_amount*i.quantity,status:'requested'};});
 const statements=[db.prepare('INSERT INTO checkout_groups VALUES(?,?,?,?,?,?)').bind(id,user.id,b.request_id,signature,items.length,t)];
 for(const o of rows)statements.push(db.prepare('INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,estimate,created_at,updated_at) VALUES(?,?,?,?,'+guardedCatalogPrice+',?,?,?)').bind(o.id,user.id,o.service_id,o.quantity,...catalogPriceBindings(o.service_id,pricing.get(o.service_id),o.catalog_price),o.estimate,t,t),db.prepare('INSERT INTO checkout_items VALUES(?,?)').bind(id,o.id),db.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) VALUES(?,'order:create',?,?)").bind(user.id,o.id,t));
 try{await db.batch(statements);}catch(e){const existing=await replay();if(existing)return existing;if(String(e.message).includes('checkout_quota'))return err('Maksimal lima permintaan per jam.',429);if(String(e.message).includes('rental_stock_unavailable'))return err('Stok sewa tidak tersedia.',409);if(catalogChangedError(e))return err('Harga atau ketersediaan layanan berubah. Muat ulang katalog dan coba lagi.',409);throw e;}
 return json({checkout_id:id,orders:rows},201);
}
