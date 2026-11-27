import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyMigrationHistory,readAppliedHistory,verifyReleaseHealth} from '../v4/scripts/deployment-verification.mjs';
const files=['0001_initial.sql','0002_finance.sql','0003_settlement.sql'];
test('exact migration inventory, sorted canonically',()=>{
 assert.equal(verifyMigrationHistory(files,[...files].reverse()),3);
});
test('missing, extra, renamed or duplicate migrations fail closed',()=>{
 for(const actual of [files.slice(0,2),[...files,'0004_other.sql'],[files[0],'0002_other.sql',files[2]],[files[0],files[1],files[1]]])
  assert.throws(()=>verifyMigrationHistory(files,actual),/does not exactly match/);
});
test('local sequence starts at one and rejects gaps, duplicates and malformed names',()=>{
 for(const local of [files.slice(1),[files[0],files[2]],[...files,'0003_duplicate.sql']])
  assert.throws(()=>verifyMigrationHistory(local,local),/contiguous/);
 assert.throws(()=>verifyMigrationHistory([],[]),/Invalid/);
 assert.throws(()=>verifyMigrationHistory(['secret\n'],[]),/Invalid/);
});
test('remote response must be a single successful query with results',()=>{
 assert.deepEqual(readAppliedHistory([{success:true,results:files.map(name=>({name}))}]),files);
 for(const data of [null,[],[{success:false,results:[]}],[{success:true}], [{success:true,results:[]},{success:true,results:[]}]])
  assert.throws(()=>readAppliedHistory(data),/unavailable/);
 assert.throws(()=>verifyMigrationHistory(files,readAppliedHistory([{success:true,results:[null]}])),/Invalid/);
});
const sha='a'.repeat(40);
const health={status:'ok',release:sha,database_configured:true,database_ready:true,login_configured:true,schema:18,maintenance:false};
test('release health distinguishes maintenance from public launch',()=>{
 assert.deepEqual(verifyReleaseHealth(health,sha),{runtime_schema:18,maintenance:false,public_ready:true});
 assert.equal(verifyReleaseHealth({...health,maintenance:true},sha).public_ready,false);
});
test('release health rejects wrong SHA, wrong types and degraded readiness',()=>{
 for(const patch of [{release:'b'.repeat(40)},{database_ready:false},{database_configured:false},{login_configured:1},{schema:undefined},{schema:'18'},{schema:17},{maintenance:undefined},{status:'degraded'}])
  assert.throws(()=>verifyReleaseHealth({...health,...patch},sha),/mismatch/);
 assert.throws(()=>verifyReleaseHealth(health,undefined),/SHA required/);
});
