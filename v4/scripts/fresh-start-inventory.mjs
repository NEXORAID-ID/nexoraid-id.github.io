// Production read-only aggregate inventory. No data rows, IDs, balances or secrets printed.
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {validateProductionTarget} from './deployment-verification.mjs';
const groups={"configuration":["users","management_grants","account_suspensions","catalog_overrides","service_policies","rental_capacity","suppliers","saved_services"],"transient":["sessions","session_metadata","worker_presence","api_rate_limits","notification_reads"],"transaction":["orders","order_finance","order_work","order_settlements","support_cases","payment_claims","order_reviews","order_refunds","order_ticket_links","rejected_payment_claims","order_attachments","order_messages","order_plans","checkout_groups","checkout_items","completed_refunds","web_ticket_outbox","rental_reservations","order_policy_snapshots","order_receipts","receipt_refunds","ticket_closure_fences","seller_order_fees","seller_settlements","order_cost_basis"],"review":["audit_events","payout_requests","operating_expenses","supplier_movements","investor_capital","investor_distributions","cash_opening","investor_attestations","cash_period_closes","payout_approvals","investor_post_policies","investor_noncash_bonuses"]};
const tables=Object.values(groups).flat(),config='v4/.generated/wrangler.json';
function query(sql){
 const r=JSON.parse(execFileSync('npx',['--yes','wrangler@4.168.0','d1','execute','nexoraid-v4','--remote','--config',config,'--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:1024*1024}));
 if(!Array.isArray(r)||r.length!==1||r[0].success!==true||!Array.isArray(r[0].results))throw Error('Inventory response invalid');return r[0].results;
}
try{
 validateProductionTarget(JSON.parse(await readFile(config,'utf8')));
 const found=query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('d1_migrations','_cf_KV','_cf_METADATA')").map(r=>r.name);
 if(tables.some(x=>!found.includes(x))||found.some(x=>!tables.includes(x)))throw Error('Unclassified schema');
 // Chunk by fixed table allowlist. No dynamic identifiers from user/database.
 const counts={};for(let i=0;i<tables.length;i+=10){const part=tables.slice(i,i+10);const rows=query('SELECT '+part.map(x=>'(SELECT COUNT(*) FROM "'+x+'") AS "'+x+'"').join(','));
 if(rows.length!==1)throw Error('Count result invalid');for(const name of part){const n=rows[0][name];if(!Number.isSafeInteger(n)||n<0)throw Error('Count invalid');counts[name]=n;}}
 const active=query("SELECT (SELECT COUNT(*) FROM orders WHERE status NOT IN ('completed','cancelled')) AS active_orders,(SELECT COUNT(*) FROM web_ticket_outbox WHERE delivered_at IS NULL) AS undelivered,(SELECT COUNT(*) FROM ticket_closure_fences WHERE closed_at IS NULL) AS pending_closures");
 if(active.length!==1||Object.values(active[0]).some(n=>!Number.isSafeInteger(n)||n<0))throw Error('Queue result invalid');
 console.log('Fresh-start inventory (read-only): '+JSON.stringify({schemaTables:tables.length,counts,active:active[0],reviewRequired:groups.review.filter(x=>counts[x]>0),syntheticClassificationVerified:false,resetPerformed:false}));
}catch{console.error('Fresh-start inventory unavailable or schema unclassified. No mutations attempted.');process.exitCode=1;}
