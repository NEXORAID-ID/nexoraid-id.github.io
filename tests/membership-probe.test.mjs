import test from 'node:test';import assert from 'node:assert/strict';
import {probeMembershipCredential} from '../ops/probe-discord-membership.mjs';
const id='111111111111111111';
test('membership probe uses official read-only endpoints and returns no identity or token',async()=>{
 let calls=0;const r=await probeMembershipCredential('test-token',async(url,init)=>{
  assert.equal(init.headers.authorization,'Bot test-token');assert.equal(init.redirect,'error');assert.equal(init.method,undefined);
  assert.equal(url,calls++===0?'https://discord.com/api/v10/users/@me':'https://discord.com/api/v10/guilds/1487728359482851348/members/'+id);
  return Response.json(calls===1?{id,bot:true}:{user:{id,bot:true},roles:[]});
 });
 assert.deepEqual(r,{ok:true,stage:'guild_member',reason:'BOT_MEMBER_VERIFIED',status:200});assert.equal(calls,2);
});
test('membership probe distinguishes credential, guild and throttling failures without leaking response',async()=>{
 for(const [status,reason] of [[401,'TOKEN_UNAUTHORIZED'],[403,'GUILD_FORBIDDEN'],[404,'GUILD_OR_MEMBER_NOT_FOUND'],[429,'RATE_LIMITED']]){
  let n=0;const r=await probeMembershipCredential('secret',async()=>++n===1?Response.json({id,bot:true}):Response.json({secret:'private-body'},{status}));
  assert.deepEqual(r,{ok:false,stage:'guild_member',reason,status});assert.equal(n,2);
 }
 assert.equal((await probeMembershipCredential('secret',async()=>Response.json({},{status:401}))).stage,'identity');
});
test('membership probe rejects missing credential, non-bot, mismatched membership and transport errors',async()=>{
 assert.equal((await probeMembershipCredential('',()=>{throw Error('not called')})).reason,'NOT_CONFIGURED');
 assert.equal((await probeMembershipCredential('x',async()=>Response.json({id,bot:false}))).reason,'INVALID_BOT_IDENTITY');
 let n=0;assert.equal((await probeMembershipCredential('x',async()=>Response.json(++n===1?{id,bot:true}:{user:{id:'222222222222222222',bot:true},roles:[]}))).reason,'INVALID_MEMBER_RESPONSE');
 assert.equal((await probeMembershipCredential('x',async()=>{throw Error('private-token')})).reason,'TRANSPORT_OR_INVALID_RESPONSE');
});
