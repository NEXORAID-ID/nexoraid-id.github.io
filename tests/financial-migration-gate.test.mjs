import test from 'node:test';import assert from 'node:assert/strict';
import {pendingFinancialMigrations,verifyEvidence} from '../v4/scripts/financial-migration-gate.mjs';
const files=['0015_rental_investor_guard.sql','0016_installment_ledger.sql','0017_business_controls.sql'];
const pending=files.slice(1),databaseId='fixture-db',digest='a'.repeat(64),now=Date.parse('2026-11-26T17:00:00Z');
const evidence={database_id:databaseId,migration_digest:digest,backup_sha256:'b'.repeat(64),pending_migrations:pending,external_encrypted_copy:true,isolated_restore_verified:true,independent_totals_matched:true,attachment_checksums_matched:true,verified_at:new Date(now-60000).toISOString()};
const check=e=>verifyEvidence(e,{databaseId,pending,digest,now});
test('gate detects only unapplied financial schema and rejects divergent inventory',()=>{
 assert.deepEqual(pendingFinancialMigrations(files,[files[0]]),pending);
 assert.deepEqual(pendingFinancialMigrations(files,files),[]);
 assert.throws(()=>pendingFinancialMigrations(files,['0016_other.sql']),/diverged/);
 assert.throws(()=>pendingFinancialMigrations(files,[files[0],files[0]]),/diverged/);
});
test('missing or mismatched owner evidence blocks exact pending migration',()=>{
 assert.throws(()=>check(null));assert.throws(()=>check({...evidence,database_id:'wrong'}));
 assert.throws(()=>check({...evidence,migration_digest:'c'.repeat(64)}));
 assert.throws(()=>check({...evidence,pending_migrations:[pending[0]]}));
 assert.throws(()=>check({...evidence,backup_sha256:'bad'}));
});
test('backup, restore, source totals and attachment checks must all be attested',()=>{
 for(const key of ['external_encrypted_copy','isolated_restore_verified','independent_totals_matched','attachment_checksums_matched'])assert.throws(()=>check({...evidence,[key]:false}));
 assert.doesNotThrow(()=>check(evidence));
});
test('stale and future evidence fail, no pending migrations needs no attestation',()=>{
 assert.throws(()=>check({...evidence,verified_at:new Date(now-86400001).toISOString()}));
 assert.throws(()=>check({...evidence,verified_at:new Date(now+1).toISOString()}));
 assert.doesNotThrow(()=>verifyEvidence(null,{pending:[]}));
});

test('rejects missing versions, duplicate numeric versions and malformed inventory',()=>{
 assert.throws(()=>pendingFinancialMigrations([files[0],files[2]],[files[0]]),/sequence/);
 assert.throws(()=>pendingFinancialMigrations([...files,'0017_duplicate.sql'],[files[0]]),/sequence/);
 assert.throws(()=>pendingFinancialMigrations([...files,'bad.sql'],[files[0]]),/Invalid migration inventory/);
});
test('rejects out-of-order applied history and incomplete baseline; pending order is canonical',()=>{
 assert.throws(()=>pendingFinancialMigrations(files,[files[0],files[2]]),/exact prefix/);
 assert.throws(()=>pendingFinancialMigrations(files,[]),/baseline not applied/);
 assert.deepEqual(pendingFinancialMigrations([...files].reverse(),[files[0]]),pending);
});
