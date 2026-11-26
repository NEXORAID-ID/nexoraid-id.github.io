import { services } from '../services-data.js';
import { fixedPriceValue } from '../catalog.js';
import { operations,listOrders } from './operations.mjs';
import { workspace } from './workspace.mjs';
import { business,memberCatalog,applyOverride,rateLimit } from './business.mjs';
import { ticketLinks } from './ticket-links.mjs';
import { collaboration } from './collaboration.mjs';
import { customer,deviceLabel } from './customer.mjs';

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
export function roleFor(user,env){return user.id===env.OWNER_DISCORD_ID&&validId(env.OWNER_DISCORD_ID)?'owner':user.role==='owner'?'customer':user.role;}
const teamRoleSql="CASE WHEN EXISTS(SELECT 1 FROM management_grants g WHERE g.user_id=u.id) THEN 'management' ELSE u.role END AS role";
export const overseesOrders=role=>role==='owner'||role==='management';
export function estimateOrder(id,quantity){
 const service=services.find(s=>s.id===id);
 if(!service||!Number.isInteger(quantity)||quantity<1||quantity>99)return null;
 const fixed=fixedPriceValue(service.price);
 return {service_id:id,quantity,catalog_price:service.price,estimate:fixed===null?null:fixed*quantity};
}
export function mayTransition(role,assigned,actor,from,to){
 if(overseesOrders(role))return ({requested:['cancelled'],claimed:['confirmed','cancelled'],confirmed:['processing','cancelled'],processing:['completed','cancelled']})[from]?.includes(to)||false;
 return role==='worker'&&assigned===actor&&from==='confirmed'&&to==='processing';
}
async function session(r,env){
 const token=getCookie(r,'nexo_session');
 if(!/^[a-f0-9-]{72}$/.test(token))return null;
 const user=await env.DB.prepare('SELECT u.id,u.display_name,'+teamRoleSql+' FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await hash(token),now()).first();
 return user?{...user,role:roleFor(user,env)}:null;
}
async function body(r){
 if(!r.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return null;
 const reader=r.body?.getReader();if(!reader)return null;
 let size=0;const chunks=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return null;}chunks.push(value);}
 const bytes=new Uint8Array(size);let off=0;for(const c of chunks){bytes.set(c,off);off+=c.length;}const value=JSON.parse(new TextDecoder().decode(bytes));return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}
}
export function oauthFailure(status,value){
 const known=['invalid_client','invalid_grant','invalid_request','unauthorized_client','unsupported_grant_type','invalid_scope'];
 return status===429?'rate_limited':known.includes(value?.error)?value.error:status===401?'invalid_client':'provider_error';
}
// Never log the request, response body, authorization code, token or secret.
export async function discordIdentity(env,code,request=fetch,report=(details)=>console.warn('Discord OAuth diagnostic',details)){
 let stage='token_request';
 const fail=(reason,details={})=>{report({stage,reason,...details});return {error:reason};};
 const kind=e=>['AbortError','TimeoutError','TypeError','NetworkError'].includes(e?.name)?e.name:'Error';
 async function send(url,options){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try{return await request(url,{...options,redirect:'manual',signal:controller.signal});}finally{clearTimeout(timer);}
 }
 const headers={'accept':'application/json','user-agent':'NEXORAID/4.0 (https://nexoraid-v4.nexoraid.workers.dev)'};
 try{
  const form=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID.trim(),client_secret:env.DISCORD_CLIENT_SECRET.trim(),grant_type:'authorization_code',code,redirect_uri:env.PUBLIC_ORIGIN+'/api/auth/callback'}).toString();
  const response=await send('https://discord.com/api/oauth2/token',{method:'POST',headers:{...headers,'content-type':'application/x-www-form-urlencoded'},body:form});
  stage='token_response';
  if(!response.ok){
   const value=await response.json().catch(()=>null);
   const reason=oauthFailure(response.status,value);
   return fail(reason,{status:response.status,format:value?'json':'non-json'});
  }
  const token=await response.json();
  if(typeof token.access_token!=='string'||!token.access_token)return fail('provider_error');
  stage='identity_request';
  const identity=await send('https://discord.com/api/v10/users/@me',{headers:{...headers,authorization:'Bearer '+token.access_token}});
  stage='identity_response';
  if(!identity.ok)return fail('identity_error',{status:identity.status});
  const user=await identity.json();
  if(!validId(user.id))return fail('identity_error');
  return {user};
 }catch(e){return fail(stage.startsWith('token')?'token_transport':'identity_transport',{exception:kind(e)});}
}
const loginFailure=(code)=>redirect('/portal.html?login_error='+encodeURIComponent(code),[cookie('nexo_state','',0)]);
function oauthReady(env){return Boolean(env.PUBLIC_ORIGIN&&env.DISCORD_CLIENT_ID&&env.DISCORD_CLIENT_SECRET&&env.DB);}
async function handle(r,env){
 const url=new URL(r.url),m=r.method;let p=url.pathname;
 if(p==='/'&&(m==='GET'||m==='HEAD')){const home=new URL('/index.html',url);return env.ASSETS.fetch(new Request(home,r));}
 if(!p.startsWith('/api/')){
  const asset=await env.ASSETS.fetch(r);
  if(asset.status!==404||!['GET','HEAD'].includes(m))return asset;
  const page=await env.ASSETS.fetch(new Request(new URL('/404.html',url),{method:m}));
  return page.ok?new Response(page.body,{status:404,headers:page.headers}):asset;
 }
 if(p==='/api/health'&&m==='GET'){
  let ready=false;try{if(env.DB){const check=await env.DB.prepare('SELECT (SELECT COUNT(*) FROM users WHERE 0)+(SELECT COUNT(*) FROM order_ticket_links WHERE 0)+(SELECT COUNT(*) FROM rejected_payment_claims WHERE 0)+(SELECT COUNT(*) FROM order_attachments WHERE 0)+(SELECT COUNT(*) FROM order_messages WHERE 0)+(SELECT COUNT(*) FROM order_plans WHERE 0)+(SELECT COUNT(*) FROM checkout_groups WHERE 0)+(SELECT COUNT(*) FROM session_metadata WHERE 0) AS probe').first();ready=check?.probe===0;}}catch{}
  return json({status:ready&&oauthReady(env)?'ok':'degraded',version:4,release:env.RELEASE_SHA||null,database_configured:Boolean(env.DB),database_ready:ready,login_configured:oauthReady(env),schema:ready?10:null},ready&&oauthReady(env)?200:503);
 }
 if(p==='/api/catalog'&&m==='GET'){const response=env.DB?json({services:await memberCatalog(env.DB),catalog_revision:1}):json({services:services.map(({id,name,category,desc,price})=>({id,name,category,desc,price})),baseline:true});response.headers.set('access-control-allow-origin','*');return response;}
 if(!env.DB||!env.PUBLIC_ORIGIN||url.origin!==env.PUBLIC_ORIGIN)return err('Layanan akun belum dikonfigurasi untuk domain ini.',503);
 const bot=p.startsWith('/api/bot/');
 let botUser=null;
 if(bot){
  if(!/^[a-f0-9]{64}$/i.test(env.NEXORAID_BOT_API_KEY||''))return err('Integrasi bot belum aktif.',503);
  const token=r.headers.get('authorization')||'';
  // Compare fixed-length digests without early exit.
  const actual=await hash(token),expected=await hash('Bearer '+env.NEXORAID_BOT_API_KEY);
  let diff=0;for(let i=0;i<expected.length;i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i);
  if(diff!==0)return err('Bot tidak terotorisasi.',401);
  const actor=r.headers.get('x-discord-user-id'),guild=r.headers.get('x-discord-guild-id');
  if(!validId(actor)||guild!=='1487728359482851348')return err('Identitas bot tidak valid.',403);
  p=p.replace('/api/bot/','/api/');
  if(!((p==='/api/orders'&&['GET','POST'].includes(m))||(m==='POST'&&/^\/api\/orders\/[a-f0-9-]{36}\/(claim|status|evidence)$/.test(p))||(['GET','POST'].includes(m)&&/^\/api\/orders\/[a-f0-9-]{36}\/ticket$/.test(p))))return err('Endpoint bot tidak diizinkan.',404);
  await env.DB.prepare("INSERT INTO users(id,display_name,created_at) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING").bind(actor,'Discord '+actor,now()).run();
  const u=await env.DB.prepare('SELECT u.id,u.display_name,'+teamRoleSql+' FROM users u WHERE u.id=?').bind(actor).first();
  botUser=u?{...u,role:roleFor(u,env)}:null;
 }else if(m!=='GET'&&r.headers.get('origin')!==env.PUBLIC_ORIGIN)return err('Origin tidak diizinkan.',403);
 if(p==='/api/auth/login'&&m==='GET'){
  if(!oauthReady(env))return err('Login belum dikonfigurasi.',503);
  const state=random();const q=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID.trim(),response_type:'code',redirect_uri:env.PUBLIC_ORIGIN+'/api/auth/callback',scope:'identify',state,prompt:'consent'});
  return redirect('https://discord.com/oauth2/authorize?'+q,[cookie('nexo_state',state,600)]);
 }
 if(p==='/api/auth/callback'&&m==='GET'){
  if(!oauthReady(env))return err('Login belum dikonfigurasi.',503);
  const code=url.searchParams.get('code'),state=url.searchParams.get('state');
  if(!state||state!==getCookie(r,'nexo_state')||!/^[a-f0-9-]{72}$/.test(state))return loginFailure('invalid_state');
  if(url.searchParams.get('error')==='access_denied')return loginFailure('access_denied');
  if(!code||code.length>2048)return loginFailure('invalid_grant');
  const result=await discordIdentity(env,code);
  if(result.error)return loginFailure(result.error);
  const user=result.user;
  const t=now(),s=random(),sessionHash=await hash(s);
  await env.DB.batch([
   env.DB.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name').bind(user.id,String(user.global_name||user.username||'Pelanggan').slice(0,100),t),
   env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(t),
   env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(sessionHash,user.id,t+7*DAY),
   env.DB.prepare('INSERT INTO session_metadata VALUES(?,?,?,?)').bind(sessionHash,crypto.randomUUID(),deviceLabel(r.headers.get('user-agent')||''),t)
  ]);
  return redirect('/portal.html',[cookie('nexo_state','',0),cookie('nexo_session',s,7*DAY)]);
 }
 const user=bot?botUser:await session(r,env);
 if(!user)return err('Silakan masuk melalui Discord.',401);
 if(p==='/api/auth/logout'&&m==='POST'){
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(getCookie(r,'nexo_session'))).run();
  const response=json({ok:true});response.headers.append('set-cookie',cookie('nexo_session','',0));return response;
 }
 if(p==='/api/me'&&m==='GET'){const earned=await env.DB.prepare('SELECT order_id FROM order_settlements WHERE worker_id=? LIMIT 1').bind(user.id).first();return json({user:{...user,finance_access:user.role==='owner'||user.role==='worker'||Boolean(earned)}});}
 if(p==='/api/auth/logout-all'&&m==='POST'&&!bot){await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id).run();const response=json({ok:true});response.headers.append('set-cookie',cookie('nexo_session','',0));return response;}
 if(m==='POST'&&!(p==='/api/team/role'&&user.role!=='owner')&&!await rateLimit(env.DB,user.id))return err('Terlalu banyak permintaan.',429);
 if(!bot&&p.startsWith('/api/customer/')){const extra=await customer({p,m,user,env,r,readBody:body,sessionHash:await hash(getCookie(r,'nexo_session'))});if(extra)return extra;}
 if(!bot&&p.startsWith('/api/business/')){const extra=await business({p,m,url,user,env,readBody:body,r});if(extra)return extra;}
 if(p==='/api/orders'&&m==='GET')return listOrders(env.DB,user,url);
 if(p==='/api/orders'&&m==='POST'){
  const b=await body(r);const order=b&&estimateOrder(b.service_id,b.quantity);if(!order)return err('Layanan atau jumlah tidak valid.',400);
  const key=b.request_id;
  if(key!==undefined&&(typeof key!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(key)))return err('ID permintaan tidak valid.',400);
  const digest=key?await hash(user.id+':'+key):null;
  const id=digest?[digest.slice(0,8),digest.slice(8,12),'4'+digest.slice(13,16),'8'+digest.slice(17,20),digest.slice(20,32)].join('-'):crypto.randomUUID();
  const replay=async()=>{const old=await env.DB.prepare('SELECT id,service_id,quantity,catalog_price,estimate,status FROM orders WHERE id=? AND customer_id=?').bind(id,user.id).first();if(!old)return null;return old.service_id===order.service_id&&old.quantity===order.quantity?json({order:old,replayed:true}):err('ID permintaan sudah dipakai untuk order lain.',409);};
  if(key){const old=await replay();if(old)return old;}
  const override=await env.DB.prepare('SELECT amount,enabled,promo_percent FROM catalog_overrides WHERE service_id=?').bind(order.service_id).first();
  if(override){const s=applyOverride(services.find(s=>s.id===order.service_id),override);if(!s.enabled)return err('Layanan sedang tidak tersedia.',409);order.catalog_price=s.price;order.estimate=s.unit_amount===null?null:s.unit_amount*order.quantity;}
  const t=now();
  // Atomic conditional insert: no more than 5 requests per user in any rolling hour.
  const [result]=await env.DB.batch([env.DB.prepare("INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,estimate,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM orders WHERE customer_id=? AND created_at>=?)<5 ON CONFLICT(id) DO NOTHING").bind(id,user.id,order.service_id,order.quantity,order.catalog_price,order.estimate,t,t,user.id,t-3600),env.DB.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,'order:create',?,? WHERE changes()=1").bind(user.id,id,t)]);
  if(!result.meta.changes){if(key){const old=await replay();if(old)return old;}return err('Batas permintaan per jam tercapai.',429);}
  return json({order:{id,...order,status:'requested'}},201);
 }
 const match=p.match(/^\/api\/orders\/([a-f0-9-]{36})\/(claim|status)$/);
 if(match&&m==='POST'){
  const [_,id,action]=match;const t=now();
  if(action==='claim'){
   if(user.role!=='worker')return err('Akses penjoki diperlukan.',403);
   const presence=await env.DB.prepare('SELECT available FROM worker_presence WHERE worker_id=?').bind(user.id).first();if(presence?.available===0)return err('Aktifkan ketersediaan untuk mengambil order.',409);
   const results=await env.DB.batch([env.DB.prepare("UPDATE orders SET status='claimed',assigned_to=?,updated_at=? WHERE id=? AND status='requested' AND assigned_to IS NULL AND customer_id<>? AND NOT EXISTS(SELECT 1 FROM worker_presence WHERE worker_id=? AND available=0) AND EXISTS(SELECT 1 FROM users u WHERE u.id=? AND u.role='worker' AND NOT EXISTS(SELECT 1 FROM management_grants g WHERE g.user_id=u.id))").bind(user.id,t,id,user.id,user.id,user.id),env.DB.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,'claim',?,? WHERE changes()=1").bind(user.id,id,t)]);
   return results[0].meta.changes?json({ok:true}):err('Order tidak tersedia.',409);
  }
  const b=await body(r);const order=await env.DB.prepare('SELECT o.status,o.assigned_to,f.state AS payment_state,w.worker_id AS evidence_worker FROM orders o LEFT JOIN order_finance f ON f.order_id=o.id LEFT JOIN order_work w ON w.order_id=o.id WHERE o.id=?').bind(id).first();
  if(!order||!b||!mayTransition(user.role,order.assigned_to,user.id,order.status,b.status))return err('Perubahan status tidak diizinkan.',403);
  if(['processing','completed'].includes(b.status)&&order.payment_state!=='paid')return err('Pembayaran belum diverifikasi owner.',409);
  if(b.status==='completed'&&(!order.assigned_to||order.evidence_worker!==order.assigned_to))return err('Bukti pengerjaan belum dikirim penjoki.',409);
  if(b.status==='cancelled'&&order.payment_state==='paid')return err('Order sudah dibayar. Memerlukan proses refund manual.',409);
  const results=await env.DB.batch([env.DB.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=? AND status=? AND assigned_to IS ?').bind(b.status,t,id,order.status,order.assigned_to),env.DB.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,?,?,? WHERE changes()=1").bind(user.id,'status:'+b.status,id,t)]);
  return results[0].meta.changes?json({ok:true}):err('Status sudah berubah.',409);
 }
 if(p.endsWith('/ticket')){const linked=await ticketLinks({p,m,user,env,bot,r,readBody:body});if(linked)return linked;}
 if(!bot&&p.startsWith('/api/collaboration/')){const extra=await collaboration({p,m,url,user,env,r,readBody:body});if(extra)return extra;}
 if(!bot&&p.startsWith('/api/workspace/')){const extra=await workspace({p,m,url,user,env,readBody:body,r});if(extra)return extra;}
 if(!bot||p.endsWith('/evidence')){const extra=await operations({p,m,url,user,env,readBody:body,r});if(extra)return extra;}
 if(p==='/api/team'&&m==='GET'){
  if(user.role!=='owner')return err('Akses owner diperlukan.',403);
  const after=url.searchParams.get('after')||'';
  if(after&&!validId(after))return err('Cursor tidak valid.',400);
  const rows=(await env.DB.prepare('SELECT u.id,u.display_name,'+teamRoleSql+' FROM users u WHERE u.id>? ORDER BY u.id LIMIT 101').bind(after).all()).results;
  const page=rows.slice(0,100).map(u=>({...u,role:roleFor(u,env)}));
  return json({members:page,next:rows.length>100?page.at(-1).id:null});
 }
 if(p==='/api/team/role'&&m==='POST'){
  if(user.role!=='owner')return err('Akses owner diperlukan.',403);
  const b=await body(r);if(!b||!validId(b.user_id)||!['customer','worker','seller','management'].includes(b.role)||b.user_id===env.OWNER_DISCORD_ID)return err('Peran atau pengguna tidak valid.',400);
  const target=await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(b.user_id).first();
  if(!target)return err('Pengguna belum terdaftar.',404);
  if(b.role!=='worker'&&await env.DB.prepare("SELECT id FROM orders WHERE assigned_to=? AND status IN ('claimed','confirmed','processing') LIMIT 1").bind(b.user_id).first())return err('Selesaikan atau alihkan pekerjaan aktif sebelum mencabut role penjoki.',409);
  const grant=b.role==='management'?env.DB.prepare('INSERT INTO management_grants(user_id,granted_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET granted_at=excluded.granted_at').bind(b.user_id,now()):env.DB.prepare('DELETE FROM management_grants WHERE user_id=?').bind(b.user_id);
  try{await env.DB.batch([env.DB.prepare('UPDATE users SET role=? WHERE id=?').bind(b.role==='management'?'customer':b.role,b.user_id),grant,env.DB.prepare('INSERT INTO audit_events(actor_id,action,target_id,created_at) VALUES(?,?,?,?)').bind(user.id,'role:'+b.role,b.user_id,now())]);}catch(e){if(String(e.message).includes('worker_has_active_orders'))return err('Penjoki masih memiliki order aktif.',409);throw e;}
  return json({ok:true});
 }
 return err('Endpoint tidak ditemukan.',404);
}
export default {async fetch(r,env){try{return await handle(r,env);}catch{return err('Terjadi kesalahan layanan. Coba kembali.',500);}}};
