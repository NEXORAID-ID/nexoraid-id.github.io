const GUILD='1487728359482851348';
const WORKER='1511392414516903966';
const validId=id=>typeof id==='string'&&/^\d{17,20}$/.test(id);
const result=(status,reason,upstreamStatus=0)=>({status,reason,upstreamStatus});
async function parseMember(r,id,{oauth=false}={}){
 if(r.status===404){
  const b=await r.json().catch(()=>null);
  return result(b?.code===10007?403:503,b?.code===10007?'NOT_MEMBER':'GUILD_LOOKUP_FAILED',404);
 }
 if(r.status>=300&&r.status<400)return result(503,'UNEXPECTED_REDIRECT',r.status);
 if(!r.ok)return result(503,r.status===401?'UNAUTHORIZED':r.status===403?'FORBIDDEN':r.status===429?'RATE_LIMITED':'UPSTREAM_ERROR',r.status);
 const b=await r.json();
 if((!oauth||b?.user!==undefined)&&(!b?.user||b.user.id!==id||b.user.bot))return result(403,'IDENTITY_MISMATCH',r.status);
 if(!b||typeof b!=='object'||Array.isArray(b)||(oauth&&(!Array.isArray(b.roles)||b.roles.some(x=>!validId(x)))))return result(503,'INVALID_RESPONSE',r.status);
 return {...result(200,'VERIFIED',r.status),roles:Array.isArray(b.roles)?b.roles.filter(validId):[]};
}
export async function guildMembership(env,id,request=fetch){
 if(!validId(id)||typeof env.DISCORD_MEMBERSHIP_BOT_TOKEN!=='string'||!env.DISCORD_MEMBERSHIP_BOT_TOKEN.trim())return result(503,'NOT_CONFIGURED');
 try{
  const r=await request('https://discord.com/api/v10/guilds/'+GUILD+'/members/'+id,{headers:{authorization:'Bot '+env.DISCORD_MEMBERSHIP_BOT_TOKEN.trim(),accept:'application/json','user-agent':'DiscordBot (https://nexoraid-v4.nexoraid.workers.dev, 4.0)'},redirect:'manual',signal:AbortSignal.timeout(8000)});
  return await parseMember(r,id);
 }catch{return result(503,'TRANSPORT');}
}
export async function membershipStatus(env,id,request=fetch){
 const check=await guildMembership(env,id,request);
 if(check.status===503)console.warn('discord_membership_unavailable',{reason:check.reason,status:check.upstreamStatus});
 return check.status;
}
export async function oauthGuildMember(id,token,request=fetch){
 if(!validId(id)||typeof token!=='string'||!token)return result(503,'NOT_CONFIGURED');
 try{
  const r=await request('https://discord.com/api/v10/users/@me/guilds/'+GUILD+'/member',{headers:{authorization:'Bearer '+token,accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)});
  return await parseMember(r,id,{oauth:true});
 }catch{return result(503,'TRANSPORT');}
}
export function discordWorkerRole(membership){return membership?.status===200&&Array.isArray(membership.roles)&&membership.roles.includes(WORKER);}
export function workerRoleSyncStatements(db,id,verified,t){
 // D1 remains the source of effective permissions. Explicit management and
 // seller grants remain owner-controlled. The worker transition and audit
 // run in the same login transaction; active-order downgrade trigger remains.
 const from=verified?'customer':'worker',to=verified?'worker':'customer';
 const eligible="id=? AND role=? AND NOT EXISTS(SELECT 1 FROM management_grants WHERE user_id=users.id)";
 return [
  db.prepare("DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE "+eligible+")").bind(id,id,from),
  db.prepare("UPDATE users SET role=? WHERE "+eligible).bind(to,id,from),
  db.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,'discord_role_sync:"+to+"',?,? WHERE changes()=1").bind(id,id,t),
  // Also limit pre-existing worker sessions even if no role change was needed.
  ...(verified?[db.prepare("DELETE FROM sessions WHERE user_id=? AND expires_at>? AND EXISTS(SELECT 1 FROM users WHERE id=? AND role='worker')").bind(id,t+900,id)]:[])
 ];
}
export function membershipMessage(status){return status===403?'Gabung server Discord NEXORAID terlebih dahulu.':'Verifikasi keanggotaan Discord belum tersedia. Coba lagi nanti.';}
