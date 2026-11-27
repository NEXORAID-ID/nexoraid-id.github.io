import {readdir,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const pattern=/^\d{4}_[a-z0-9_]+\.sql$/;
export function verifyMigrationHistory(local,applied){
 if(!Array.isArray(local)||!Array.isArray(applied)||!local.length||
    [...local,...applied].some(n=>typeof n!=='string'||!pattern.test(n)))
   throw Error('Invalid migration inventory');
 const expected=[...local].sort(),actual=[...applied].sort();
 if(expected.some((n,i)=>Number(n.slice(0,4))!==i+1))
   throw Error('Local migration sequence must start at 0001 and be contiguous');
 if(actual.length!==expected.length||actual.some((n,i)=>n!==expected[i]))
   throw Error('Production migration inventory does not exactly match candidate');
 return expected.length;
}
export function readAppliedHistory(response){
 if(!Array.isArray(response)||response.length!==1||response[0]?.success!==true||
    !Array.isArray(response[0].results))throw Error('Migration inventory unavailable');
 return response[0].results.map(row=>row?.name);
}
export function verifyReleaseHealth(h,expected){
 if(!/^[a-f0-9]{40}$/i.test(expected||''))
   throw Error('Exact expected release SHA required');
 if(h?.status!=='ok'||h.database_configured!==true||h.database_ready!==true||
    h.login_configured!==true||!Number.isInteger(h.schema)||h.schema<18||
    typeof h.maintenance!=='boolean'||h.release!==expected)
   throw Error('Release health or SHA mismatch');
 // Maintenance is allowed during a controlled deployment freeze, not public launch.
 return {runtime_schema:h.schema,maintenance:h.maintenance,public_ready:!h.maintenance};
}
export const PRODUCTION_ORIGIN='https://nexoraid-v4.nexoraid.workers.dev';
export function requireProductionOrigin(origin){
 if(origin!==PRODUCTION_ORIGIN)throw Error('Unexpected production origin');
 return origin;
}
export function validateProductionTarget(config,expectedOrigin=PRODUCTION_ORIGIN){
 requireProductionOrigin(expectedOrigin);
 const targets=config?.d1_databases?.filter(d=>d.binding==='DB');
 if(config?.name!=='nexoraid-v4'||config.vars?.PUBLIC_ORIGIN!==expectedOrigin||
    targets?.length!==1||targets[0].database_name!=='nexoraid-v4'||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(targets[0].database_id||''))
   throw Error('Unexpected production target');
 return targets[0].database_id;
}
export async function verifyProductionMigrations(){
 const configPath='v4/.generated/wrangler.json';
 const config=JSON.parse(await readFile(configPath,'utf8'));
 validateProductionTarget(config);
 const local=(await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql'));
 let response;
 try{
   response=JSON.parse(execFileSync('npx',['--yes','wrangler@4.168.0','d1','execute','nexoraid-v4','--remote','--config',configPath,'--json','--command','SELECT name FROM d1_migrations ORDER BY name'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:1024*1024}));
 }catch{throw Error('Production migration inventory query failed');}
 return verifyMigrationHistory(local,readAppliedHistory(response));
}
