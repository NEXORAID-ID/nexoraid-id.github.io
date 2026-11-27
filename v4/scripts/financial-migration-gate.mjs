import {validateProductionTarget} from './deployment-verification.mjs';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const filePattern=/^\d{4}_[a-z0-9_]+\.sql$/;
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function migrationInventory(files,applied){
 if(!Array.isArray(files)||!Array.isArray(applied)||[...files,...applied].some(x=>typeof x!=='string'||!filePattern.test(x)))throw Error('Invalid migration inventory');
 return {local:[...files].sort(),applied:[...applied].sort(),pending:files.filter(x=>!applied.includes(x)).sort(),unknown:applied.filter(x=>!files.includes(x)).sort()};
}
export function pendingFinancialMigrations(files,applied){
 if(!Array.isArray(files)||!Array.isArray(applied)||[...files,...applied].some(x=>typeof x!=='string'||!filePattern.test(x)))throw Error('Invalid migration inventory');
 const ordered=[...files].sort();
 const versions=ordered.map(x=>Number(x.slice(0,4)));
 if(versions.some((v,i)=>v<1||(i>0&&v!==versions[i-1]+1)))throw Error('Migration sequence has a gap or duplicate version');
 const actual=[...applied].sort();
 if(actual.length>ordered.length||actual.some((name,i)=>name!==ordered[i]))throw Error('Migration inventory diverged: applied history must be an exact prefix');
 // Never attest new schema against an incomplete pre-0016 baseline.
 if(ordered.some(x=>Number(x.slice(0,4))>=16)&&ordered.some(x=>Number(x.slice(0,4))<16&&!actual.includes(x)))throw Error('Migration inventory diverged: baseline not applied');
 return ordered.slice(actual.length).filter(x=>Number(x.slice(0,4))>=16);
}
export function verifyEvidence(evidence,{databaseId,pending,digest,now=Date.now()}){
 if(!pending.length)return;
 if(!evidence||evidence.database_id!==databaseId||evidence.migration_digest!==digest||
    !sha(evidence.backup_sha256)||!Array.isArray(evidence.pending_migrations)||
    JSON.stringify(evidence.pending_migrations)!==JSON.stringify(pending)||
    evidence.external_encrypted_copy!==true||evidence.isolated_restore_verified!==true||
    evidence.independent_totals_matched!==true||evidence.attachment_checksums_matched!==true)
  throw Error('Owner-approved encrypted backup and restore evidence required');
 const time=Date.parse(evidence.verified_at);
 if(!Number.isFinite(time)||time>now||now-time>24*60*60*1000)
  throw Error('Backup restore evidence must be recent (24 hours)');
}
async function main(){
 const dir=new URL('../migrations/',import.meta.url);
 const files=(await readdir(dir)).filter(x=>x.endsWith('.sql')).sort();
 if(files.length===0||!files[0].startsWith('0001_')||files.some(x=>!filePattern.test(x)))throw Error('Invalid local migration inventory');
 if(!files.some(x=>Number(x.slice(0,4))>=16)){console.log('No new financial migration files; existing deploy gate unchanged.');return;}
 const config=JSON.parse(await readFile('v4/.generated/wrangler.json','utf8'));
 const databaseId=validateProductionTarget(config);
 // Query the actual migration inventory using the existing authorized D1 configuration.
 // Never print remote response, credentials, database ID or raw errors.
 const response=JSON.parse(execFileSync('npx',['--yes','wrangler@4.168.0','d1','execute','nexoraid-v4','--remote','--config','v4/.generated/wrangler.json','--json','--command','SELECT name FROM d1_migrations ORDER BY name'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:1024*1024}));
 if(!Array.isArray(response)||response.length!==1||response[0].success!==true||!Array.isArray(response[0].results))throw Error('Migration inventory unavailable');
 const applied=response[0].results.map(x=>x.name);
 // Only validated migration filenames are printed, never the remote response or business data.
 console.log('Migration inventory (read-only): '+JSON.stringify(migrationInventory(files,applied)));
 const pending=pendingFinancialMigrations(files,applied);
 if(!pending.length){console.log('No pending financial migrations.');return;}
 const hash=createHash('sha256');
 for(const name of pending){hash.update(name+'\0');hash.update(await readFile(new URL(name,dir)));hash.update('\0');}
 const digest=hash.digest('hex');
 console.log('Pending financial migrations: '+pending.join(', '));
 console.log('Migration digest: '+digest);
 let evidence=null;try{evidence=JSON.parse(process.env.NEXORAID_FINANCE_BACKUP_EVIDENCE||'null');}catch{}
 verifyEvidence(evidence,{databaseId,pending,digest});
 console.log('Owner backup/restore attestation accepted for exact pending migrations. Independent restore remains owner responsibility.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{await main();}catch{console.error('Financial migration blocked: verify production migration inventory and owner-approved recent encrypted backup/restore evidence. See v4/RELEASE-GATE.md.');process.exitCode=1;}
}
