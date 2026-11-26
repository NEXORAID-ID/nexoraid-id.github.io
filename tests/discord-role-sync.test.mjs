import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';import {readFile} from 'node:fs/promises';
import worker,{discordIdentity} from '../v4/worker.mjs';
import {oauthGuildMember,discordWorkerRole,workerRoleSyncStatements,guildMembership} from '../v4/membership.mjs';
const id='444444444444444444',role='1511392414516903966',env={DISCORD_CLIENT_ID:'111111111111111111',DISCORD_CLIENT_SECRET:'test',PUBLIC_ORIGIN:'https://nexoraid.example'};
test('OAuth requests exact guild membership scope and trusted member endpoint',async()=>{
 const start=await worker.fetch(new Request(env.PUBLIC_ORIGIN+'/api/auth/login'),{...env,DB:{}});
 assert.equal(new URL(start.headers.get('location')).searchParams.get('scope'),'identify guilds.members.read');
 const calls=[];const r=await discordIdentity(env,'code',async(url,opts)=>{calls.push({url,opts});return Response.json(calls.length===1?{access_token:'test-token'}:calls.length===2?{id,username:'test'}:{roles:[role,'1503411734885568653']});},()=>{},'v',true);
 assert.equal(calls[2].url,'https://discord.com/api/v10/users/@me/guilds/1487728359482851348/member');assert.equal(calls[2].opts.headers.authorization,'Bearer test-token');assert.equal(discordWorkerRole(r.membership),true);
});
test('membership failure and wrong role fail closed without granting worker',async()=>{
 assert.equal(discordWorkerRole(await oauthGuildMember(id,'x',async()=>Response.json({roles:['1503411734885568653']}))),false);
 assert.equal((await oauthGuildMember(id,'x',async()=>Response.json({}))).status,503);
 assert.equal((await oauthGuildMember(id,'x',async()=>Response.json({roles:[123]}))).status,503);
 assert.equal(discordWorkerRole(await oauthGuildMember(id,'x',async()=>Response.json({user:{id:'555555555555555555'},roles:[role]}))),false);
 assert.equal((await oauthGuildMember(id,'x',async()=>Response.json({code:10007},{status:404}))).status,403);
 assert.equal((await guildMembership({DISCORD_MEMBERSHIP_BOT_TOKEN:'x'},id,async()=>Response.json({},{status:401}))).reason,'UNAUTHORIZED');
});
test('D1 sync grants only verified worker, revokes stale sessions, preserves owner-approved seller and management',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const n of ['0001_initial.sql','0002_management.sql'])db.exec(await readFile(new URL('../v4/migrations/'+n,import.meta.url),'utf8'));
 const adapter={prepare(sql){return {bind(...args){return {run:()=>db.prepare(sql).run(...args)}}}}};
 const insert=db.prepare('INSERT INTO users VALUES(?,?,?,?)');
 insert.run(id,'worker','customer',1);insert.run('s','seller','seller',1);insert.run('m','management','customer',1);
 db.exec("INSERT INTO management_grants VALUES('m',1);INSERT INTO sessions VALUES('old','444444444444444444',999999)");
 const sync=(who,verified)=>{for(const q of workerRoleSyncStatements(adapter,who,verified,100))q.run();};
 sync(id,true);assert.equal(db.prepare('SELECT role FROM users WHERE id=?').get(id).role,'worker');assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);
 sync('s',true);sync('m',true);assert.equal(db.prepare("SELECT role FROM users WHERE id='s'").get().role,'seller');assert.equal(db.prepare("SELECT role FROM users WHERE id='m'").get().role,'customer');
 sync(id,false);assert.equal(db.prepare('SELECT role FROM users WHERE id=?').get(id).role,'customer');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_events').get().n,2);db.close();
});

test('actual OAuth callback creates verified worker session and /api/me resolves role without manual grant',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const n of ['0001_initial.sql','0002_management.sql','0003_operations.sql','0004_payment_reference.sql','0005_workspace.sql','0006_business.sql','0007_ticket_links.sql','0008_integrity.sql','0009_order_collaboration.sql','0010_checkout.sql'])db.exec(await readFile(new URL('../v4/migrations/'+n,import.meta.url),'utf8'));
 const DB={prepare(sql){return {bind(...args){return {async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};},async first(){return db.prepare(sql).get(...args)||null;}};}};},async batch(stmts){db.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const state='a'.repeat(72),verifier='b'.repeat(43);
 const config={...env,DB,OWNER_DISCORD_ID:'999999999999999999'};
 const callback=()=>worker.fetch(new Request(env.PUBLIC_ORIGIN+'/api/auth/callback?code=fixture&state='+state,{headers:{cookie:'nexo_state='+state+'; nexo_pkce='+verifier}}),config);
 let calls=0;config.DISCORD_OAUTH_FETCH=async()=>++calls===1?Response.json({access_token:'fixture'}):calls===2?Response.json({id,username:'fixture'}):Response.json({roles:[role]});
 try{
 const r=await callback();assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/portal.html');
 const session=r.headers.getSetCookie().find(x=>x.startsWith('nexo_session='));assert.ok(session);assert.match(session,/Max-Age=900/);
 const me=await worker.fetch(new Request(env.PUBLIC_ORIGIN+'/api/me',{headers:{cookie:session.split(';')[0]}}),config);
 assert.equal(me.status,200);assert.equal((await me.json()).user.role,'worker');
 calls=0;config.DISCORD_OAUTH_FETCH=async()=>++calls===1?Response.json({access_token:'fixture'}):calls===2?Response.json({id,username:'fixture'}):Response.json({},{status:429});
 const failed=await callback();assert.match(failed.headers.get('location'),/membership_unavailable/);
 assert.equal(db.prepare('SELECT role FROM users WHERE id=?').get(id).role,'worker');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,1);
 }finally{db.close();}
});
test('runtime membership diagnostic requires exact owner and actor key; no arbitrary lookup or data exposure',async()=>{
 const owner='999999999999999999',key='a'.repeat(64);let calls=0;
 const config={...env,DB:{},OWNER_DISCORD_ID:owner,NEXORAID_BOT_API_KEY:key,DISCORD_MEMBERSHIP_BOT_TOKEN:'fixture',DISCORD_MEMBERSHIP_FETCH:async url=>{calls++;assert.equal(url,'https://discord.com/api/v10/guilds/1487728359482851348/members/'+owner);return Response.json({user:{id:owner},roles:[role]});}};
 const call=(actor,token=key)=>worker.fetch(new Request(env.PUBLIC_ORIGIN+'/api/bot/health?membership=1&user_id='+id,{headers:{authorization:'Bearer '+token,'x-discord-user-id':actor,'x-discord-guild-id':'1487728359482851348'}}),config);
 assert.equal((await call(id)).status,403);assert.equal((await call(owner,'wrong')).status,401);assert.equal(calls,0);
 const r=await call(owner);assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,reason:'VERIFIED',upstream_status:200});assert.equal(calls,1);
 config.DISCORD_MEMBERSHIP_FETCH=async()=>Response.json({private:'never expose'},{status:401});
 const fail=await call(owner);assert.equal(fail.status,503);assert.deepEqual(await fail.json(),{ok:false,reason:'UNAUTHORIZED',upstream_status:401});
});
