import { services } from '../services-data.js';
import { fixedPriceValue } from '../catalog.js';
import { operations,listOrders } from './operations.mjs';
import { workspace } from './workspace.mjs';
import { business,memberCatalog,rateLimit } from './business.mjs';
import { ticketLinks } from './ticket-links.mjs';
import { collaboration } from './collaboration.mjs';
import { customer,deviceLabel,createCheckout } from './customer.mjs';

import { ticketQueue } from './ticket-queue.mjs';
import { membershipMessage,discordWorkerRole,oauthGuildMember,workerRoleSyncStatements,guildMembership } from './membership.mjs';
import { cashLedger } from './cash-ledger.mjs';
import { publicRateLimit } from './public-rate-limit.mjs';
const DAY=86400;
const cookie=(name,value,age)=>name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+age;
const getCookie=(r,name)=>r.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),n=>n.toString(16).padStart(2,'0')).join('');
const random=()=>crypto.randomUUID()+crypto.randomUUID();
export const pkceChallenge=async verifier=>btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const pkceVerifier=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
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
 if(!service||service.orderable===false||!Number.isInteger(quantity)||quantity<1||quantity>99)return null;
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
export async function discordIdentity(env,code,request=fetch,report=(details)=>console.warn('Discord OAuth diagnostic',details),verifier=null,checkGuild=false){
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
  const form=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID.trim(),client_secret:env.DISCORD_CLIENT_SECRET.trim(),grant_type:'authorization_code',code,redirect_uri:env.PUBLIC_ORIGIN+'/api/auth/callback',...(verifier?{code_verifier:verifier}:{})}).toString();
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
  if(checkGuild&&!(validId(env.OWNER_DISCORD_ID)&&user.id===env.OWNER_DISCORD_ID)){
   stage='guild_member';
   const membership=await oauthGuildMember(user.id,token.access_token,send);
   if(membership.status===503)return fail('membership_unavailable',{status:membership.upstreamStatus||0,reason_code:membership.reason});
   return {user,membership};
  }
  return {user};
 }catch(e){return fail(stage.startsWith('token')?'token_transport':stage==='guild_member'?'membership_unavailable':'identity_transport',{exception:kind(e)});}
}
const loginFailure=(code)=>redirect('/portal.html?login_error='+encodeURIComponent(code),[cookie('nexo_state','',0),cookie('nexo_pkce','',0)]);
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
  let ready=false;try{if(env.DB){const check=await env.DB.prepare('SELECT (SELECT COUNT(*) FROM users WHERE 0)+(SELECT COUNT(*) FROM order_ticket_links WHERE 0)+(SELECT COUNT(*) FROM rejected_payment_claims WHERE 0)+(SELECT COUNT(*) FROM order_attachments WHERE 0)+(SELECT COUNT(*) FROM order_messages WHERE 0)+(SELECT COUNT(*) FROM order_plans WHERE 0)+(SELECT COUNT(*) FROM checkout_groups WHERE 0)+(SELECT COUNT(*) FROM session_metadata WHERE 0)+(SELECT COUNT(*) FROM completed_refunds WHERE 0)+(SELECT COUNT(*) FROM web_ticket_outbox WHERE 0)+(SELECT COUNT(*) FROM cash_opening WHERE 0)+(SELECT COUNT(*) FROM cash_movements WHERE 0)+(SELECT COUNT(*) FROM rental_reservations WHERE 0)+(SELECT COUNT(*) FROM investor_attestations WHERE 0)+(SELECT COUNT(*) FROM service_policies WHERE 0)+(SELECT COUNT(*) FROM order_policy_snapshots WHERE 0) AS probe').first();const trigger=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='web_ticket_order_insert'").first();const policyTrigger=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='order_policy_snapshot'").first();ready=check?.probe===0&&trigger?.name==='web_ticket_order_insert'&&policyTrigger?.name==='order_policy_snapshot';}}catch{}
  return json({status:ready&&oauthReady(env)?'ok':'degraded',version:4,release:env.RELEASE_SHA||null,database_configured:Boolean(env.DB),database_ready:ready,login_configured:oauthReady(env),schema:ready?18:null,maintenance:env.MAINTENANCE_MODE==='true'},ready&&oauthReady(env)?200:503);
 }
 const limited=await publicRateLimit(r,env,p,m);if(limited)return limited;
 if(p==='/api/catalog'&&m==='GET'){const response=env.DB?json({services:await memberCatalog(env.DB),catalog_revision:1}):json({services:services.map(({id,name,category,desc,price})=>({id,name,category,desc,price})),baseline:true});response.headers.set('access-control-allow-origin','*');return response;}
 if(!env.DB||!env.PUBLIC_ORIGIN||url.origin!==env.PUBLIC_ORIGIN)return err('Layanan akun belum dikonfigurasi untuk domain ini.',503);
 if(p==='/api/bot/ticket-queue'){
 const key=env.NEXORAID_TICKET_MACHINE_KEY||'';
 if(!/^[a-f0-9]{64}$/i.test(key)||key===env.NEXORAID_BOT_API_KEY)return err('Integrasi tiket belum dikonfigurasi.',503);
 const actual=await hash(r.headers.get('authorization')||''),expected=await hash('Bearer '+key);
 let diff=0;for(let i=0;i<expected.length;i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i);
 if(diff!==0)return err('Bot tidak terotorisasi.',401);
 if(r.headers.get('x-discord-guild-id')!=='1487728359482851348'||r.headers.has('x-discord-user-id'))return err('Identitas mesin tidak valid.',403);
 return ticketQueue({db:env.DB,r,m,readBody:body,maintenance:env.MAINTENANCE_MODE==='true'});
 }
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
  if(m==='GET'&&p==='/api/bot/health'&&url.searchParams.get('membership')==='1'){
   // Fixed owner-only diagnostic: never accept an arbitrary target or return roles/IDs.
   if(!validId(env.OWNER_DISCORD_ID)||actor!==env.OWNER_DISCORD_ID)return err('Akses owner diperlukan.',403);
   const check=await guildMembership(env,actor,env.DISCORD_MEMBERSHIP_FETCH||fetch);
   return json({ok:check.status===200,reason:check.reason,upstream_status:check.upstreamStatus},check.status===200?200:503);
  }
  if(m==='GET'&&(p==='/api/bot/health'||p==='/api/bot/orders'&&url.searchParams.get('probe')==='1'))return json({ok:true});
  p=p.replace('/api/bot/','/api/');
  if(!((p==='/api/orders'&&['GET','POST'].includes(m))||(m==='POST'&&/^\/api\/orders\/[a-f0-9-]{36}\/(claim|status|evidence)$/.test(p))||(['GET','POST'].includes(m)&&/^\/api\/orders\/[a-f0-9-]{36}\/ticket$/.test(p))))return err('Endpoint bot tidak diizinkan.',404);
  // In maintenance, authenticated bot mutations must stop before any actor provisioning.
  // Existing actors can still read orders; unknown actors cannot create a row via GET.
  if(env.MAINTENANCE_MODE==='true'&&!['GET','HEAD'].includes(m))return err('Sistem sedang dalam pemeliharaan. Tidak ada perubahan yang disimpan.',503);
  if(env.MAINTENANCE_MODE!=='true')await env.DB.prepare("INSERT INTO users(id,display_name,created_at) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING").bind(actor,'Discord '+actor,now()).run();
  const u=await env.DB.prepare('SELECT u.id,u.display_name,'+teamRoleSql+' FROM users u WHERE u.id=?').bind(actor).first();
  botUser=u?{...u,role:roleFor(u,env)}:null;
  if(botUser?.role==='worker'){
   const verified=await guildMembership(env,actor,env.DISCORD_MEMBERSHIP_FETCH||fetch);
   if(verified.status!==200)return err(membershipMessage(verified.status),verified.status);
   if(!discordWorkerRole(verified))return err('Role Penjoki Discord tidak lagi terverifikasi.',403);
  }
 }else if(m!=='GET'&&r.headers.get('origin')!==env.PUBLIC_ORIGIN)return err('Origin tidak diizinkan.',403);
 if(p==='/api/auth/login'&&m==='GET'){
  if(!oauthReady(env))return err('Login belum dikonfigurasi.',503);
  const state=random(),verifier=pkceVerifier(),challenge=await pkceChallenge(verifier);const q=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID.trim(),response_type:'code',redirect_uri:env.PUBLIC_ORIGIN+'/api/auth/callback',scope:'identify guilds.members.read',state,prompt:'consent',code_challenge:challenge,code_challenge_method:'S256'});
  return redirect('https://discord.com/oauth2/authorize?'+q,[cookie('nexo_state',state,600),cookie('nexo_pkce',verifier,600)]);
 }
 if(p==='/api/auth/callback'&&m==='GET'){
  if(!oauthReady(env))return err('Login belum dikonfigurasi.',503);
  const code=url.searchParams.get('code'),state=url.searchParams.get('state');
  if(!state||state!==getCookie(r,'nexo_state')||!/^[a-f0-9-]{72}$/.test(state))return loginFailure('invalid_state');
  if(url.searchParams.get('error')==='access_denied')return loginFailure('access_denied');
  if(!code||code.length>2048)return loginFailure('invalid_grant');
  const verifier=getCookie(r,'nexo_pkce');if(!/^[a-zA-Z0-9_-]{43}$/.test(verifier))return loginFailure('invalid_state');
  const result=await discordIdentity(env,code,env.DISCORD_OAUTH_FETCH||fetch,undefined,verifier,true);
  if(result.error)return loginFailure(result.error);
  const user=result.user;
  const t=now(),s=random(),sessionHash=await hash(s);
  const isOwner=validId(env.OWNER_DISCORD_ID)&&user.id===env.OWNER_DISCORD_ID;
  const displayName=String(user.global_name||user.username||'Pelanggan').slice(0,100);
  // Discord's exact PENJOKI role can authorize a worker; management/seller
  // still require existing owner-approved D1 grants. Never infer owner.
  const workerVerified=!isOwner&&discordWorkerRole(result.membership);
  const sync=isOwner?[]:workerRoleSyncStatements(env.DB,user.id,workerVerified,t);
  // Bound automatically synced worker sessions; a fresh OAuth member check is
  // required to renew. Old sessions are revoked atomically on role changes.
  const age=isOwner?7*DAY:workerVerified?900:7*DAY;
  try{await env.DB.batch([
   env.DB.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name').bind(user.id,displayName,t),
   ...sync,
   env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(t),
   env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(sessionHash,user.id,t+age),
   env.DB.prepare('INSERT INTO session_metadata VALUES(?,?,?,?)').bind(sessionHash,crypto.randomUUID(),deviceLabel(r.headers.get('user-agent')||''),t)
  ]);}catch(e){
   if(!isOwner&&String(e?.message).includes('worker_has_active_orders')){
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id).run();
    return loginFailure('worker_role_review');
   }
   throw e;
  }
  return redirect('/portal.html',[cookie('nexo_state','',0),cookie('nexo_pkce','',0),cookie('nexo_session',s,age)]);
 }
 if(env.MAINTENANCE_MODE==='true'&&!['GET','HEAD'].includes(m)&&!['/api/auth/logout','/api/auth/logout-all'].includes(p))return err('Sistem sedang dalam pemeliharaan. Tidak ada perubahan yang disimpan.',503);
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
  const b=await body(r);
  if(!b||Object.keys(b).some(k=>!['service_id','quantity','request_id'].includes(k)))return err('Layanan, jumlah atau ID permintaan tidak valid.',400);
  return createCheckout({env,user,items:[{service_id:b.service_id,quantity:b.quantity}],key:b.request_id,single:true});
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
  const b=await body(r);const order=await env.DB.prepare('SELECT o.status,o.assigned_to,f.state AS payment_state,w.worker_id AS evidence_worker,EXISTS(SELECT 1 FROM payment_claims c WHERE c.order_id=o.id) AS payment_claimed FROM orders o LEFT JOIN order_finance f ON f.order_id=o.id LEFT JOIN order_work w ON w.order_id=o.id WHERE o.id=?').bind(id).first();
  if(!order||!b||!mayTransition(user.role,order.assigned_to,user.id,order.status,b.status))return err('Perubahan status tidak diizinkan.',403);
  if(['processing','completed'].includes(b.status)&&order.payment_state!=='paid')return err('Pembayaran belum diverifikasi owner.',409);
  if(b.status==='completed'&&(!order.assigned_to||order.evidence_worker!==order.assigned_to))return err('Bukti pengerjaan belum dikirim penjoki.',409);
  if(b.status==='cancelled'&&order.payment_state==='paid')return err('Order sudah dibayar. Memerlukan proses refund manual.',409);
  if(b.status==='cancelled'&&order.payment_claimed)return err('Laporan pembayaran sedang menunggu pemeriksaan owner.',409);
  const results=await env.DB.batch([env.DB.prepare("UPDATE orders SET status=?,updated_at=? WHERE id=? AND status=? AND assigned_to IS ? AND (?<>'cancelled' OR (NOT EXISTS(SELECT 1 FROM payment_claims WHERE order_id=orders.id) AND NOT EXISTS(SELECT 1 FROM order_finance WHERE order_id=orders.id AND state='paid')))").bind(b.status,t,id,order.status,order.assigned_to,b.status),env.DB.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,?,?,? WHERE changes()=1").bind(user.id,'status:'+b.status,id,t)]);
  return results[0].meta.changes?json({ok:true}):err('Status sudah berubah.',409);
 }
 if(p.endsWith('/ticket')){const linked=await ticketLinks({p,m,user,env,bot,r,readBody:body});if(linked)return linked;}
 if(!bot&&p.startsWith('/api/collaboration/')){const extra=await collaboration({p,m,url,user,env,r,readBody:body});if(extra)return extra;}
 if(!bot&&p==='/api/workspace/cash-ledger')return cashLedger({p,m,user,env,r,readBody:body});
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
// frame-ancestors is enforced only in an HTTP CSP, not in a meta tag.
function documentSecurity(response){
 if(!/^text\/html(?:;|$)/i.test(response.headers.get('content-type')||''))return response;
 const headers=new Headers(response.headers);
 headers.append('content-security-policy',"frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
 headers.set('x-frame-options','DENY');
 headers.set('x-content-type-options','nosniff');
 headers.set('referrer-policy','no-referrer');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export default {async fetch(r,env){try{return documentSecurity(await handle(r,env));}catch{console.error('nexoraid_request_failed',{method:r.method,request_id:crypto.randomUUID()});return err('Terjadi kesalahan layanan. Coba kembali.',500);}}};
