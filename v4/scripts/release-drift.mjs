import {writeFile} from 'node:fs/promises';
const expected=process.env.GITHUB_SHA;
if(!/^[a-f0-9]{40}$/i.test(expected||''))throw Error('Expected Git SHA missing');
const report={checked_at:new Date().toISOString(),repository_sha:expected,production_sha:null,health:null,match:false};
try{
 const r=await fetch('https://nexoraid-v4.nexoraid.workers.dev/api/health',{redirect:'error',signal:AbortSignal.timeout(15000)});
 const h=await r.json();
 report.http_status=r.status;
 report.production_sha=/^[a-f0-9]{40}$/i.test(h.release||'')?h.release:null;
 report.health={database_ready:h.database_ready===true,login_configured:h.login_configured===true,schema:Number.isInteger(h.schema)?h.schema:null};
 report.match=r.ok&&h.status==='ok'&&report.health.database_ready&&report.health.login_configured&&report.production_sha===expected;
}catch{report.error='Production health unavailable or invalid';}
console.log(JSON.stringify(report,null,2));
await writeFile('release-drift-evidence.json',JSON.stringify(report,null,2)+'\n');
if(!report.match)process.exitCode=1;
