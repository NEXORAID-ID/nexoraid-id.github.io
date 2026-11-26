import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const filePattern=/^\d{4}_[a-z0-9_]+\.sql$/;
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function pendingFinancialMigrations(files,applied){
 if(!Array.isArray(applied)||applied.some(x=>typeof x!=='string'||!filePattern.test(x)))throw Error('Invalid migration inventory');
 if(new Set(applied).size!==applied.length||applied.some(x=>!files.includes(x)))throw Error('Migration inventory diverged');
 return files.filter(x=>Number(x.slice(0,4))>=16&&!applied.includes(x));
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
 const files=(await readdir(dir)).filter(x=>filePattern.test(x)).sort();
 if(!files.some(x=>Number(x.slice(0,4))>=16)){console.log('No new financial migration files; existing deploy gate unchanged.');return;}
 const config=JSON.parse(await readFile('v4/.generated/wrangler.json','utf8'));
 const databases=config.d1_databases?.filter(x=>x.binding==='DB'&&x.database_name==='nexoraid-v4');
 if(config.name!=='nexoraid-v4'||databases?.length!==1||!/^[-a-f0-9]{36}$/i.test(databases[0].database_id))throw Error('Unexpected production target');
 const databaseId=databases[0].database_id;
 // Query the actual migration inventory using the existing authorized D1 configuration.
 // Never print remote response, credentials, database ID or raw errors.
 const response=JSON.parse(execFileSync('npx',['--yes','wrangler@4.168.0','d1','execute','nexoraid-v4','--remote','--config','v4/.generated/wrangler.json','--json','--command','SELECT name FROM d1_migrations ORDER BY name'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:1024*1024}));
 if(!Array.isArray(response)||response.length!==1||response[0].success!==true||!Array.isArray(response[0].results))throw Error('Migration inventory unavailable');
 const pending=pendingFinancialMigrations(files,response[0].results.map(x=>x.name));
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
