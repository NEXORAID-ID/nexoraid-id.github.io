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
