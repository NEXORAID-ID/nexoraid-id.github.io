import {writeFile} from 'node:fs/promises';
import {verifyReleaseHealth} from './deployment-verification.mjs';
const expected=process.env.GITHUB_SHA;
if(!/^[a-f0-9]{40}$/i.test(expected||''))throw Error('Expected Git SHA missing');
const report={checked_at:new Date().toISOString(),repository_sha:expected,production_sha:null,health:null,sha_match:false,match:false,public_ready:false,migration_inventory_verified:false};
try{
 const r=await fetch('https://nexoraid-v4.nexoraid.workers.dev/api/health',{redirect:'error',signal:AbortSignal.timeout(15000)});
 const h=await r.json();
 report.http_status=r.status;
 report.production_sha=/^[a-f0-9]{40}$/i.test(h?.release||'')?h.release:null;
 report.sha_match=report.production_sha===expected;
 report.health={database_configured:h?.database_configured===true,database_ready:h?.database_ready===true,login_configured:h?.login_configured===true,schema:Number.isInteger(h?.schema)?h.schema:null,maintenance:typeof h?.maintenance==='boolean'?h.maintenance:null};
 if(r.ok){
   const state=verifyReleaseHealth(h,expected);
   report.match=true;
   report.public_ready=state.public_ready;
 }
}catch{report.error='Production release health unavailable or invalid';}
console.log(JSON.stringify(report,null,2));
await writeFile('release-drift-evidence.json',JSON.stringify(report,null,2)+'\n');
if(!report.match||!report.public_ready)process.exitCode=1;
