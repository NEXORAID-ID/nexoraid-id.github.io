import { execFileSync } from 'node:child_process';
import { mkdir,copyFile,writeFile } from 'node:fs/promises';
const id=process.env.D1_DATABASE_ID,origin=process.env.PUBLIC_ORIGIN,owner=process.env.OWNER_DISCORD_ID,client=process.env.DISCORD_CLIENT_ID;
if(!/^[a-f0-9-]{36}$/i.test(id||'')||!/^https:\/\/[a-z0-9.-]+$/i.test(origin||'')||!/^\d{17,20}$/.test(owner||'')||!/^\d{17,20}$/.test(client||''))throw Error('Configure D1_DATABASE_ID, PUBLIC_ORIGIN, OWNER_DISCORD_ID, DISCORD_CLIENT_ID before deployment.');
await mkdir('v4/.generated',{recursive:true});
for(const name of ['portal.html','portal.css','portal.mjs','portal.webmanifest','portal-sw.js','portal-offline.html'])await copyFile('v4/'+name,'dist/'+name);
const config={name:'nexoraid-v4',main:'../worker.mjs',compatibility_date:'2026-10-01',compatibility_flags:['assets_navigation_has_no_effect'],assets:{directory:'../../dist',binding:'ASSETS',run_worker_first:true,html_handling:'none',not_found_handling:'none'},d1_databases:[{binding:'DB',database_name:'nexoraid-v4',database_id:id,migrations_dir:'../migrations'}],workers_dev:true,secrets:{required:['DISCORD_CLIENT_SECRET']},vars:{MAINTENANCE_MODE:process.env.MAINTENANCE_MODE==='true'?'true':'false',PUBLIC_ORIGIN:origin,OWNER_DISCORD_ID:owner,DISCORD_CLIENT_ID:client,RELEASE_SHA:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}};
await writeFile('v4/.generated/wrangler.json',JSON.stringify(config,null,2));
