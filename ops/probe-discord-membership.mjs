import {pathToFileURL} from 'node:url';
const GUILD='1487728359482851348';
const id=x=>typeof x==='string'&&/^\d{17,20}$/.test(x);
const statusCode=s=>s===401?'TOKEN_UNAUTHORIZED':s===403?'GUILD_FORBIDDEN':s===404?'GUILD_OR_MEMBER_NOT_FOUND':s===429?'RATE_LIMITED':'UPSTREAM_ERROR';
export async function probeMembershipCredential(token,request=fetch){
 if(typeof token!=='string'||!token.trim())return {ok:false,stage:'configuration',reason:'NOT_CONFIGURED',status:0};
 const headers={authorization:'Bot '+token.trim(),accept:'application/json','user-agent':'DiscordBot (https://nexoraid-v4.nexoraid.workers.dev, 4.0)'};
 let stage='identity';
 try{
  const self=await request('https://discord.com/api/v10/users/@me',{headers,redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!self.ok)return {ok:false,stage,reason:statusCode(self.status),status:self.status};
  const actor=await self.json();
  if(!id(actor?.id)||actor.bot!==true)return {ok:false,stage,reason:'INVALID_BOT_IDENTITY',status:self.status};
  stage='guild_member';
  const member=await request('https://discord.com/api/v10/guilds/'+GUILD+'/members/'+actor.id,{headers,redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!member.ok)return {ok:false,stage,reason:statusCode(member.status),status:member.status};
  const result=await member.json();
  if(result?.user?.id!==actor.id||result.user.bot!==true||!Array.isArray(result.roles))return {ok:false,stage,reason:'INVALID_MEMBER_RESPONSE',status:member.status};
  return {ok:true,stage,reason:'BOT_MEMBER_VERIFIED',status:member.status};
 }catch{return {ok:false,stage,reason:'TRANSPORT_OR_INVALID_RESPONSE',status:0};}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await probeMembershipCredential(process.env.DISCORD_MEMBERSHIP_BOT_TOKEN);
 console.log(JSON.stringify(result));
 if(!result.ok)process.exitCode=1;
}
