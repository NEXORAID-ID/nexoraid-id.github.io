import test from 'node:test';
import assert from 'node:assert/strict';
import {membershipStatus,guildMembership,oauthGuildMember} from '../v4/membership.mjs';
const id='444444444444444444',env={DISCORD_MEMBERSHIP_BOT_TOKEN:'test-token'};
test('membership fails closed without credential, timeout, rate limit or wrong guild',async()=>{
 assert.equal(await membershipStatus({},id,()=>{throw Error('unexpected');}),503);
 assert.equal(await membershipStatus(env,id,async()=>{throw Error('transport');}),503);
 assert.equal(await membershipStatus(env,id,async()=>Response.json({},{status:429})),503);
 assert.equal(await membershipStatus(env,id,async()=>Response.json({code:10004},{status:404})),503);
});
test('membership checks only exact guild, requires matching non-bot member',async()=>{
 assert.equal(await membershipStatus(env,id,async(url,opts)=>{assert.equal(url,'https://discord.com/api/v10/guilds/1487728359482851348/members/'+id);assert.equal(opts.headers.authorization,'Bot test-token');assert.equal(opts.redirect,'manual');return Response.json({user:{id}});}),200);
 assert.equal(await membershipStatus(env,id,async()=>Response.json({code:10007},{status:404})),403);
 assert.equal(await membershipStatus(env,id,async()=>Response.json({user:{id,bot:true}})),403);
 assert.equal(await membershipStatus(env,id,async()=>Response.json({user:{id:'555555555555555555'}})),403);
});

test('Cloudflare compatible manual redirects prevent credential forwarding and fail closed',async()=>{
 for(const [lookup,expected] of [[request=>guildMembership(env,id,request),'Bot test-token'],[request=>oauthGuildMember(id,'oauth-fixture',request),'Bearer oauth-fixture']]){
  let calls=0;
  const result=await lookup(async(url,options)=>{
   calls++;if(options.redirect==='error')throw new TypeError('Unsupported Workers redirect mode');
   assert.equal(options.redirect,'manual');assert.equal(options.headers.authorization,expected);
   return new Response(null,{status:302,headers:{location:'https://external.invalid/'}});
  });
  assert.equal(calls,1);assert.equal(result.status,503);assert.equal(result.reason,'UNEXPECTED_REDIRECT');assert.equal(result.upstreamStatus,302);
 }
});
test('Cloudflare fetch compatibility accepts verified membership without redirect error mode',async()=>{
 const request=async(url,options)=>{if(options.redirect!=='manual')throw TypeError('Unsupported redirect mode');return Response.json({user:{id},roles:[]});};
 assert.equal((await guildMembership(env,id,request)).status,200);
 assert.equal((await oauthGuildMember(id,'oauth-fixture',request)).status,200);
});
