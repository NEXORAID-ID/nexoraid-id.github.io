import { services } from '../services-data.js';
import { fixedPriceValue } from '../catalog.js';

const DAY=86400;
const cookie=(name,value,age)=>name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+age;
const getCookie=(r,name)=>r.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),n=>n.toString(16).padStart(2,'0')).join('');
const random=()=>crypto.randomUUID()+crypto.randomUUID();
const now=()=>Math.floor(Date.now()/1000);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const redirect=(path,cookies=[])=>{const h=new Headers({'location':path,'cache-control':'no-store','referrer-policy':'no-referrer'});for(const c of cookies)h.append('set-cookie',c);return new Response(null,{status:303,headers:h});};
const err=(message,status)=>json({error:message},status);
const validId=s=>typeof s==='string'&&/^\d{17,20}$/.test(s);
export function roleFor(user,env){return user.id===env.OWNER_DISCORD_ID&&validId(env.OWNER_DISCORD_ID)?'owner':user.role;}
export function estimateOrder(id,quantity){
 const service=services.find(s=>s.id===id);
 if(!service||!Number.isInteger(quantity)||quantity<1||quantity>99)return null;
 const fixed=fixedPriceValue(service.price);
 return {service_id:id,quantity,catalog_price:service.price,estimate:fixed===null?null:fixed*quantity};
}
export function mayTransition(role,assigned,actor,from,to){
 if(role==='owner')return ({requested:['cancelled'],claimed:['confirmed','cancelled'],confirmed:['processing','cancelled'],processing:['completed','cancelled']})[from]?.includes(to)||false;
 return role==='worker'&&assigned===actor&&((from==='confirmed'&&to==='processing')||(from==='processing'&&to==='completed'));
}
async function session(r,env){
 const token=getCookie(r,'nexo_session');
 if(!/^[a-f0-9-]{72}$/.test(token))return null;
 const user=await env.DB.prepare('SELECT u.id,u.display_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await hash(token),now()).first();
 return user?{...user,role:roleFor(user,env)}:null;
}
async function body(r){
 if(!r.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return null;
 const reader=r.body?.getReader();if(!reader)return null;
 let size=0;const chunks=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return null;}chunks.push(value);}
 const bytes=new Uint8Array(size);let off=0;for(const c of chunks){bytes.set(c,off);off+=c.length;}const value=JSON.parse(new TextDecoder().decode(bytes));return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}
}
function oauthReady(env){return Boolean(env.PUBLIC_ORIGIN&&env.DISCORD_CLIENT_ID&&env.DISCORD_CLIENT_SECRET&&env.DB);}
async function handle(r,env){
 const url=new URL(r.url),p=url.pathname,m=r.method;
 if(!p.startsWith('/api/'))return env.ASSETS.fetch(r);
 if(p==='/api/health'&&m==='GET')return json({status:'ok',version:4,database_configured:Boolean(env.DB),login_configured:oauthReady(env)});
 if(p==='/api/catalog'&&m==='GET')return json({services:services.map(({id,name,category,desc,price})=>({id,name,category,desc,price}))});
 if(!env.DB||!env.PUBLIC_ORIGIN||url.origin!==env.PUBLIC_ORIGIN)return err('Layanan akun belum dikonfigurasi untuk domain ini.',503);
 if(m!=='GET'&&r.headers.get('origin')!==env.PUBLIC_ORIGIN)return err('Origin tidak diizinkan.',403);
 if(p==='/api/auth/login'&&m==='GET'){
  if(!oauthReady(env))return err('Login belum dikonfigurasi.',503);
  const state=random();const q=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,response_type:'code',redirect_uri:env.PUBLIC_ORIGIN+'/api/auth/callback',scope:'identify',state,prompt:'consent'});
  return redirect('https://discord.com/oauth2/authorize?'+q,[cookie('nexo_state',state,600)]);
 }
 if(p==='/api/auth/callback'&&m==='GET'){
  if(!oauthReady(env))return err('Login belum dikonfigurasi.',503);
  const code=url.searchParams.get('code'),state=url.searchParams.get('state');
  if(!code||!state||state!==getCookie(r,'nexo_state')||!/^[a-f0-9-]{72}$/.test(state))return err('Sesi login tidak valid. Coba lagi.',400);
  const tokenResponse=await fetch('https://discord.com/api/v10/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:env.PUBLIC_ORIGIN+'/api/auth/callback'})});
  if(!tokenResponse.ok)return err('Login Discord gagal.',502);
  const token=await tokenResponse.json();
  const userResponse=await fetch('https://discord.com/api/v10/users/@me',{headers:{authorization:'Bearer '+token.access_token}});
  if(!userResponse.ok)return err('Identitas Discord tidak tersedia.',502);
  const user=await userResponse.json();if(!validId(user.id))return err('Identitas tidak valid.',502);
  const t=now(),s=random();
  await env.DB.batch([
   env.DB.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name').bind(user.id,String(user.global_name||user.username||'Pelanggan').slice(0,100),t),
   env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(t),
   env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await hash(s),user.id,t+7*DAY)
  ]);
  return redirect('/portal.html',[cookie('nexo_state','',0),cookie('nexo_session',s,7*DAY)]);
 }
 const user=await session(r,env);
 if(!user)return err('Silakan masuk melalui Discord.',401);
 if(p==='/api/auth/logout'&&m==='POST'){
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(getCookie(r,'nexo_session'))).run();
  const response=json({ok:true});response.headers.append('set-cookie',cookie('nexo_session','',0));return response;
 }
 if(p==='/api/me'&&m==='GET')return json({user});
 if(p==='/api/orders'&&m==='GET'){
  const query=user.role==='owner'?env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100'):user.role==='worker'?env.DB.prepare("SELECT * FROM orders WHERE customer_id=? OR assigned_to=? OR status='requested' ORDER BY created_at DESC LIMIT 100").bind(user.id,user.id):env.DB.prepare('SELECT * FROM orders WHERE customer_id=? ORDER BY created_at DESC LIMIT 100').bind(user.id);
  return json({orders:(await query.all()).results});
 }
 if(p==='/api/orders'&&m==='POST'){
  const b=await body(r);const order=b&&estimateOrder(b.service_id,b.quantity);if(!order)return err('Layanan atau jumlah tidak valid.',400);
  const t=now(),id=crypto.randomUUID();
  // Atomic conditional insert: no more than 5 requests per user in any rolling hour.
  const result=await env.DB.prepare("INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,estimate,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM orders WHERE customer_id=? AND created_at>=?)<5").bind(id,user.id,order.service_id,order.quantity,order.catalog_price,order.estimate,t,t,user.id,t-3600).run();
  if(!result.meta.changes)return err('Batas permintaan per jam tercapai.',429);
  return json({order:{id,...order,status:'requested'}},201);
 }
 const match=p.match(/^\/api\/orders\/([a-f0-9-]{36})\/(claim|status)$/);
 if(match&&m==='POST'){
  const [_,id,action]=match;const t=now();
  if(action==='claim'){
   if(user.role!=='worker')return err('Akses penjoki diperlukan.',403);
   const results=await env.DB.batch([env.DB.prepare("UPDATE orders SET status='claimed',assigned_to=?,updated_at=? WHERE id=? AND status='requested' AND assigned_to IS NULL").bind(user.id,t,id),env.DB.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,'claim',?,? WHERE changes()=1").bind(user.id,id,t)]);
   return results[0].meta.changes?json({ok:true}):err('Order tidak tersedia.',409);
  }
  const b=await body(r);const order=await env.DB.prepare('SELECT status,assigned_to FROM orders WHERE id=?').bind(id).first();
  if(!order||!b||!mayTransition(user.role,order.assigned_to,user.id,order.status,b.status))return err('Perubahan status tidak diizinkan.',403);
  const results=await env.DB.batch([env.DB.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=? AND status=?').bind(b.status,t,id,order.status),env.DB.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,?,?,? WHERE changes()=1").bind(user.id,'status:'+b.status,id,t)]);
  return results[0].meta.changes?json({ok:true}):err('Status sudah berubah.',409);
 }
 if(p==='/api/team/role'&&m==='POST'){
  if(user.role!=='owner')return err('Akses owner diperlukan.',403);
  const b=await body(r);if(!b||!validId(b.user_id)||!['customer','worker','seller'].includes(b.role)||b.user_id===env.OWNER_DISCORD_ID)return err('Peran atau pengguna tidak valid.',400);
  const results=await env.DB.batch([env.DB.prepare('UPDATE users SET role=? WHERE id=?').bind(b.role,b.user_id),env.DB.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,?,?,? WHERE changes()=1").bind(user.id,'role:'+b.role,b.user_id,now())]);
  return results[0].meta.changes?json({ok:true}):err('Pengguna belum terdaftar.',404);
 }
 return err('Endpoint tidak ditemukan.',404);
}
export default {async fetch(r,env){try{return await handle(r,env);}catch{return err('Terjadi kesalahan layanan. Coba kembali.',500);}}};
