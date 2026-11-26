import test from 'node:test';
import assert from 'node:assert/strict';
import {membershipStatus} from '../v4/membership.mjs';
const id='444444444444444444',env={DISCORD_MEMBERSHIP_BOT_TOKEN:'test-token'};
test('membership fails closed without credential, timeout, rate limit or wrong guild',async()=>{
 assert.equal(await membershipStatus({},id,()=>{throw Error('unexpected');}),503);
 assert.equal(await membershipStatus(env,id,async()=>{throw Error('transport');}),503);
 assert.equal(await membershipStatus(env,id,async()=>Response.json({},{status:429})),503);
 assert.equal(await membershipStatus(env,id,async()=>Response.json({code:10004},{status:404})),503);
});
test('membership checks only exact guild, requires matching non-bot member',async()=>{
 assert.equal(await membershipStatus(env,id,async(url,opts)=>{assert.equal(url,'https://discord.com/api/v10/guilds/1487728359482851348/members/'+id);assert.equal(opts.headers.authorization,'Bot test-token');assert.equal(opts.redirect,'error');return Response.json({user:{id}});}),200);
 assert.equal(await membershipStatus(env,id,async()=>Response.json({code:10007},{status:404})),403);
 assert.equal(await membershipStatus(env,id,async()=>Response.json({user:{id,bot:true}})),403);
 assert.equal(await membershipStatus(env,id,async()=>Response.json({user:{id:'555555555555555555'}})),403);
});
