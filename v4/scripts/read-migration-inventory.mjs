import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrationInventory} from './financial-migration-gate.mjs';
let dir;
try{
 const id=process.env.D1_DATABASE_ID;
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id||'')||!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)throw Error('Missing target');
 dir=await mkdtemp(join(tmpdir(),'nexoraid-migration-inventory-'));
 const config=join(dir,'wrangler.json');
 await writeFile(config,JSON.stringify({name:'nexoraid-v4',compatibility_date:'2026-10-01',d1_databases:[{binding:'DB',database_name:'nexoraid-v4',database_id:id}]}),{mode:0o600});
 const result=JSON.parse(execFileSync('npx',['--yes','wrangler@4.168.0','d1','execute','nexoraid-v4','--remote','--config',config,'--json','--command','SELECT name FROM d1_migrations ORDER BY name'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:1024*1024}));
 if(!Array.isArray(result)||result.length!==1||result[0].success!==true||!Array.isArray(result[0].results))throw Error('Invalid inventory response');
 const local=(await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql'));
 console.log(JSON.stringify(migrationInventory(local,result[0].results.map(x=>x.name)),null,2));
}catch{console.error('Read-only inventory unavailable. Check authorized environment configuration. No mutation attempted.');process.exitCode=1;}
finally{if(dir)await rm(dir,{recursive:true,force:true});}
