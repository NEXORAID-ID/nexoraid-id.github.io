// Read-only launch preflight. Existing users, roles, catalog, supplier configuration,
// opening cash and rental capacity are intentionally NOT treated as imported orders.
// This check is intended before the first December transaction, not routine redeploys.
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {validateProductionTarget,verifyMigrationHistory,readAppliedHistory} from './deployment-verification.mjs';
import {readdir} from 'node:fs/promises';
export const OPERATIONAL_TABLES=Object.freeze([
 'orders','order_finance','order_settlements','order_attachments','web_ticket_outbox',
 'order_ticket_links','rental_reservations','order_work','payout_requests','operating_expenses',
 'support_cases','payment_claims','order_reviews','order_refunds','supplier_movements',
 'investor_distributions','rejected_payment_claims','order_messages','order_plans',
 'checkout_groups','checkout_items','completed_refunds','cash_period_closes','payout_approvals',
 'order_receipts','receipt_refunds','seller_order_fees','seller_settlements','order_cost_basis',
 'investor_noncash_bonuses','order_policy_snapshots','ticket_closure_fences'
]);
export function inventoryQuery(){
 return OPERATIONAL_TABLES.map(name=>"SELECT '"+name+"' AS table_name, COUNT(*) AS n FROM "+name).join(' UNION ALL ');
}
export function verifyFreshStart(rows){
 if(!Array.isArray(rows)||rows.length!==OPERATIONAL_TABLES.length)throw Error('Incomplete fresh-start inventory');
 const seen=new Set(),nonempty=[];
 for(const row of rows){
  if(!OPERATIONAL_TABLES.includes(row?.table_name)||seen.has(row.table_name)||!Number.isSafeInteger(row.n)||row.n<0)throw Error('Invalid fresh-start inventory');
  seen.add(row.table_name);
  if(row.n!==0)nonempty.push(row.table_name);
 }
 return {ready:nonempty.length===0,checked:seen.size,nonempty:nonempty.sort()};
}
async function main(){
 const path='v4/.generated/wrangler.json';
 const config=JSON.parse(await readFile(path,'utf8'));
 validateProductionTarget(config);
 const query=sql=>{
  const result=JSON.parse(execFileSync('npx',['--yes','wrangler@4.168.0','d1','execute','nexoraid-v4','--remote','--config',path,'--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:1024*1024}));
  if(!Array.isArray(result)||result.length!==1||result[0]?.success!==true||!Array.isArray(result[0].results))throw Error('Inventory unavailable');
  return result;
 };
 const files=(await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql'));
 verifyMigrationHistory(files,readAppliedHistory(query('SELECT name FROM d1_migrations ORDER BY name')));
 const report=verifyFreshStart(query(inventoryQuery())[0].results);
 // Report table names and pass/fail only, never raw records, IDs or amounts.
 console.log(JSON.stringify(report));
 if(!report.ready)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{await main();}catch{console.error('Fresh-start check blocked: verify target, exact schema and read-only access. No data changed.');process.exitCode=1;}
}
