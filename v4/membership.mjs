const GUILD='1487728359482851348';
export async function membershipStatus(env,id,request=fetch){
 if(!/^\d{17,20}$/.test(id)||typeof env.DISCORD_MEMBERSHIP_BOT_TOKEN!=='string'||!env.DISCORD_MEMBERSHIP_BOT_TOKEN.trim())return 503;
 try{
  const r=await request('https://discord.com/api/v10/guilds/'+GUILD+'/members/'+id,{headers:{authorization:'Bot '+env.DISCORD_MEMBERSHIP_BOT_TOKEN.trim(),accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)});
  if(r.status===404){const b=await r.json().catch(()=>null);return b?.code===10007?403:503;}
  if(!r.ok)return 503;
  const b=await r.json();return b?.user?.id===id&&!b.user.bot?200:403;
 }catch{return 503;}
}
export function membershipMessage(status){return status===403?'Gabung server Discord NEXORAID terlebih dahulu.':'Verifikasi keanggotaan Discord belum tersedia. Coba lagi nanti.';}
