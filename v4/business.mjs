import {services} from '../services-data.js';
import {fixedPriceValue} from '../catalog.js';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const integer=n=>Number.isSafeInteger(n)&&n>0&&n<=999999999;
const str=(s,min,max)=>typeof s==='string'&&s.trim().length>=min&&s.trim().length<=max?s.trim():null;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const err=(error,status=400)=>json({error},status);
const now=()=>Math.floor(Date.now()/1000);
export function applyOverride(s,row){
 const n=row?.amount??fixedPriceValue(s.price),pct=row?.promo_percent??0;
 const price=n===null?null:Math.max(1,Math.floor(n*(100-pct)/100));
 return {...s,price:price===null?s.price:'Rp'+price.toLocaleString('id-ID'),unit_amount:price,enabled:row?.enabled!==0,promo_percent:pct};
}
export async function memberCatalog(db,includeDisabled=false){
 const rows=(await db.prepare('SELECT service_id,amount,enabled,promo_percent FROM catalog_overrides').all()).results;
 const overrides=new Map(rows.map(x=>[x.service_id,x]));
 return services.map(s=>applyOverride(s,overrides.get(s.id))).filter(s=>includeDisabled||s.enabled).map(({id,name,category,desc,price,unit_amount,enabled,promo_percent})=>({id,name,category,desc,price,unit_amount,enabled,promo_percent}));
}
export function splitInvestor(profit,remaining){
 if(!integer(profit)||!Number.isSafeInteger(remaining)||remaining<1)return null;
 const investor=Math.floor(profit*25/100),principal=Math.min(remaining,Math.floor(profit*5/100));
 return {owner_share:profit-investor-principal,investor_share:investor,principal_return:principal};
}
async function record(db,stmt,user,action,id,t){
 const [x]=await db.batch([stmt,db.prepare('INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,?,?,? WHERE changes()=1').bind(user.id,action,id,t)]);
 return x.meta.changes?json({ok:true,id}):err('Data sudah tercatat atau syarat tidak terpenuhi.',409);
}
export async function rateLimit(db,id,t=now()){
 const bucket=Math.floor(t/60);
 const x=await db.prepare('INSERT INTO api_rate_limits VALUES(?,?,1) ON CONFLICT(user_id,bucket) DO UPDATE SET hits=hits+1 WHERE hits<120').bind(id,bucket).run();
 // Opportunistic bounded cleanup; no logs of credentials or IPs.
 if(t%60<3)await db.prepare('DELETE FROM api_rate_limits WHERE bucket<?').bind(bucket-120).run();
 return Boolean(x.meta.changes);
}
export async function business({p,m,url,user,env,readBody,r}){
 const db=env.DB,t=now(),get=m==='GET',post=m==='POST',owner=user.role==='owner',staff=owner||user.role==='management';
 if(p==='/api/business/catalog'&&get)return json({services:await memberCatalog(db,owner&&url.searchParams.get('all')==='1')});
 if(p==='/api/business/notifications'&&get){
  const scope=staff?"(a.target_id IN (SELECT id FROM orders) OR a.target_id IN (SELECT id FROM support_cases))":user.role==='worker'?"(a.target_id IN (SELECT id FROM orders WHERE assigned_to=? OR customer_id=? OR status='requested') OR a.target_id IN (SELECT id FROM payout_requests WHERE worker_id=?) OR a.target_id IN (SELECT id FROM support_cases WHERE customer_id=?))":"(a.target_id IN (SELECT id FROM orders WHERE customer_id=?) OR a.target_id IN (SELECT id FROM support_cases WHERE customer_id=?))";
  const args=staff?[]:user.role==='worker'?[user.id,user.id,user.id,user.id]:[user.id,user.id];
  const last=await db.prepare('SELECT last_id FROM notification_reads WHERE user_id=?').bind(user.id).first();
  const seen=last?.last_id??0;
  const rows=(await db.prepare('SELECT a.id,a.action,a.target_id,a.created_at FROM audit_events a WHERE '+scope+' ORDER BY a.id DESC LIMIT 50').bind(...args).all()).results;
  const unread=(await db.prepare('SELECT COUNT(*) AS n FROM audit_events a WHERE '+scope+' AND a.id>?').bind(...args,seen).first()).n;
  return json({items:rows,unread,latest:rows[0]?.id??seen});
 }
 if(p==='/api/business/notifications/read'&&post){
  const b=await readBody(r);if(!Number.isSafeInteger(b?.last_id)||b.last_id<0)return err('Cursor tidak valid.');
  const latest=(await db.prepare('SELECT COALESCE(MAX(id),0) AS n FROM audit_events').first()).n;
  await db.prepare('INSERT INTO notification_reads VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET last_id=MAX(last_id,excluded.last_id)').bind(user.id,Math.min(latest,b.last_id)).run();return json({ok:true});
 }
 if(!p.startsWith('/api/business/'))return null;
 if(!owner)return err('Khusus owner.',403);
 if(p==='/api/business/catalog'&&post){
  const b=await readBody(r);if(!b||!services.some(s=>s.id===b.service_id)||typeof b.enabled!=='boolean'||!(b.amount===null||integer(b.amount))||!Number.isInteger(b.promo_percent)||b.promo_percent<0||b.promo_percent>90||b.promo_percent&&b.amount===null)return err('Harga, layanan atau promo tidak valid.');
  return record(db,db.prepare('INSERT INTO catalog_overrides VALUES(?,?,?,?,?,?) ON CONFLICT(service_id) DO UPDATE SET amount=excluded.amount,enabled=excluded.enabled,promo_percent=excluded.promo_percent,actor_id=excluded.actor_id,updated_at=excluded.updated_at').bind(b.service_id,b.amount,Number(b.enabled),b.promo_percent,user.id,t),user,'catalog:update',b.service_id,t);
 }
 if(p==='/api/business/suppliers'&&get){
  const suppliers=(await db.prepare("SELECT s.id,s.name,COALESCE(SUM(CASE WHEN m.kind='deposit' THEN m.amount ELSE -m.amount END),0) AS balance FROM suppliers s LEFT JOIN supplier_movements m ON m.supplier_id=s.id GROUP BY s.id ORDER BY s.created_at DESC LIMIT 100").all()).results;
  return json({suppliers});
 }
 if(p==='/api/business/suppliers'&&post){
  const b=await readBody(r),name=str(b?.name,2,100);if(!name)return err('Nama supplier wajib.');
  const id=crypto.randomUUID();return record(db,db.prepare('INSERT INTO suppliers VALUES(?,?,?)').bind(id,name,t),user,'supplier:create',id,t);
 }
 const match=p.match(/^\/api\/business\/suppliers\/([a-f0-9-]{36})$/);
 if(match&&uuid.test(match[1])){
  const id=match[1],s=await db.prepare('SELECT id FROM suppliers WHERE id=?').bind(id).first();if(!s)return err('Supplier tidak ditemukan.',404);
  if(get){const rows=(await db.prepare('SELECT kind,amount,reference,note,created_at FROM supplier_movements WHERE supplier_id=? ORDER BY created_at DESC,id DESC LIMIT 100').bind(id).all()).results;return json({movements:rows});}
  if(post){const b=await readBody(r),ref=str(b?.reference,4,80),note=str(b?.note,3,200);if(!ref||!note||!integer(b?.amount)||!['deposit','usage','withdrawal'].includes(b?.kind))return err('Data mutasi tidak valid.');
   const movement=crypto.randomUUID();return record(db,db.prepare("INSERT INTO supplier_movements SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM supplier_movements WHERE reference=?) AND (?='deposit' OR ?<=(SELECT COALESCE(SUM(CASE WHEN kind='deposit' THEN amount ELSE -amount END),0) FROM supplier_movements WHERE supplier_id=?))").bind(movement,id,b.kind,b.amount,ref,note,user.id,t,ref,b.kind,b.amount,id),user,'supplier:'+b.kind,movement,t);}
 }
 if(p==='/api/business/rental-stock'&&get){
  const items=(await db.prepare("SELECT c.service_id,c.units,c.reference,c.updated_at,COALESCE(SUM(CASE WHEN r.release_at IS NULL OR r.release_at>unixepoch() THEN r.units ELSE 0 END),0) AS reserved FROM rental_capacity c LEFT JOIN rental_reservations r ON r.service_id=c.service_id GROUP BY c.service_id").all()).results;
  return json({items});
 }
 if(p==='/api/business/rental-stock'&&post){
  const b=await readBody(r),ref=str(b?.reference,4,120);
  if(!['cherax-rental-standard','cherax-rental-premium'].includes(b?.service_id)||!Number.isSafeInteger(b.units)||b.units<0||b.units>10000||!ref||b.confirmed!==true)return err('Kapasitas paket terpisah, referensi dan konfirmasi owner wajib.');
  try{return await record(db,db.prepare('INSERT INTO rental_capacity VALUES(?,?,?,?,?) ON CONFLICT(service_id) DO UPDATE SET units=excluded.units,reference=excluded.reference,actor_id=excluded.actor_id,updated_at=excluded.updated_at').bind(b.service_id,b.units,ref,user.id,t),user,'rental:capacity',b.service_id,t);}catch(e){if(String(e.message).includes('rental_capacity_below_reserved'))return err('Kapasitas di bawah paket yang sudah dipesan.',409);throw e;}
 }
 if(p==='/api/business/investors'&&get){
  const capital=(await db.prepare('SELECT c.id,c.name,c.amount,EXISTS(SELECT 1 FROM investor_attestations a WHERE a.capital_id=c.id) AS agreement_verified,COALESCE(SUM(d.principal_return),0) AS returned FROM investor_capital c LEFT JOIN investor_distributions d ON d.capital_id=c.id GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100').all()).results;
  const distributions=(await db.prepare('SELECT capital_id,period,profit,owner_share,investor_share,principal_return,reference FROM investor_distributions ORDER BY period DESC LIMIT 100').all()).results;
  const policies=(await db.prepare('SELECT capital_id,investor_percent,agreement_reference FROM investor_post_policies').all()).results;
  const bonuses=(await db.prepare('SELECT id,capital_id,item,quantity,value_amount,reference,expense_id,created_at FROM investor_noncash_bonuses ORDER BY created_at DESC LIMIT 100').all()).results;
  return json({capital,distributions,policies,bonuses});
 }
 if(p==='/api/business/investors'&&post){
  const b=await readBody(r),name=str(b?.name,2,100),ref=str(b?.reference,4,80);
  const agreement=str(b?.agreement_reference,4,120);
  if(!name||!ref||!integer(b?.amount)||!agreement||b.received_confirmed!==true)return err('Modal nyata, nama, bukti penerimaan dan referensi perjanjian wajib.');
  const id=crypto.randomUUID();
  const [result]=await db.batch([db.prepare("INSERT INTO investor_capital SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM investor_capital WHERE reference=?) AND NOT EXISTS(SELECT 1 FROM investor_post_policies WHERE investor_percent>0) AND NOT EXISTS(SELECT 1 FROM investor_capital c WHERE c.amount>(SELECT COALESCE(SUM(principal_return),0) FROM investor_distributions WHERE capital_id=c.id))").bind(id,name,b.amount,ref,t,user.id,ref),db.prepare("INSERT INTO investor_attestations SELECT id,?,?,? FROM investor_capital WHERE id=?").bind(agreement,user.id,t,id),db.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,'investor:capital',id,? FROM investor_capital WHERE id=?").bind(user.id,t,id)]);
  return result.meta.changes?json({ok:true,id}):err('Modal sudah tercatat atau modal aktif masih ada.',409);
 }
 if(p==='/api/business/investors/attest'&&post){
  const b=await readBody(r),agreement=str(b?.agreement_reference,4,120);
  if(!uuid.test(b?.capital_id||'')||!agreement||b.received_confirmed!==true)return err('Referensi perjanjian dan konfirmasi penerimaan wajib.');
  return record(db,db.prepare('INSERT INTO investor_attestations SELECT id,?,?,? FROM investor_capital WHERE id=? ON CONFLICT(capital_id) DO NOTHING').bind(agreement,user.id,t,b.capital_id),user,'investor:attest',b.capital_id,t);
 }
 if(p==='/api/business/investors/post-policy'&&post){
  const b=await readBody(r),agreement=str(b?.agreement_reference,4,120);
  if(!uuid.test(b?.capital_id||'')||!Number.isInteger(b.investor_percent)||b.investor_percent<0||b.investor_percent>100||!agreement||b.confirmed!==true)return err('Persentase, kesepakatan baru dan konfirmasi wajib.');
  try{return await record(db,db.prepare('INSERT INTO investor_post_policies VALUES(?,?,?,?,?) ON CONFLICT(capital_id) DO NOTHING').bind(b.capital_id,b.investor_percent,agreement,user.id,t),user,'investor:post-policy',b.capital_id,t);}catch(e){if(/investor_not_repaid|investor_policy_conflict/.test(String(e.message)))return err('Modal belum lunas, belum diverifikasi atau ada perjanjian investor aktif lain.',409);throw e;}
 }
 if(p==='/api/business/investors/bonus'&&post){
  const b=await readBody(r),item=str(b?.item,3,120),ref=str(b?.reference,4,80),expense=b?.expense_id||null;
  if(!uuid.test(b?.capital_id||'')||!item||!ref||!integer(b?.value_amount)||!Number.isSafeInteger(b.quantity)||b.quantity<1||b.quantity>1000||expense&&!uuid.test(expense)||b.confirmed!==true)return err('Data serah terima, nilai total dan konfirmasi wajib.');
  const id=crypto.randomUUID();
  try{return await record(db,db.prepare('INSERT INTO investor_noncash_bonuses SELECT ?,c.id,?,?,?,?,?,?,? FROM investor_capital c WHERE c.id=? AND EXISTS(SELECT 1 FROM investor_attestations WHERE capital_id=c.id) ON CONFLICT(reference) DO NOTHING').bind(id,item,b.quantity,b.value_amount,ref,expense,user.id,t,b.capital_id),user,'investor:bonus',id,t);}catch(e){if(/bonus_expense_invalid|UNIQUE constraint/.test(String(e.message)))return err('Biaya sudah tertaut atau tidak valid.',409);throw e;}
 }
 if(p==='/api/business/distributions'&&post){
  const b=await readBody(r),ref=str(b?.reference,4,80);
  if(!uuid.test(b?.capital_id||'')||!integer(b?.profit)||!ref||!/^\d{4}-(0[1-9]|1[0-2])$/.test(b?.period||''))return err('Data distribusi tidak valid.');
  const c=await db.prepare('SELECT c.amount-COALESCE(SUM(d.principal_return),0) AS remaining FROM investor_capital c LEFT JOIN investor_distributions d ON d.capital_id=c.id WHERE c.id=? AND EXISTS(SELECT 1 FROM investor_attestations a WHERE a.capital_id=c.id) GROUP BY c.id').bind(b.capital_id).first();
  const policy=c?.remaining===0?await db.prepare('SELECT investor_percent FROM investor_post_policies WHERE capital_id=?').bind(b.capital_id).first():null;
  const postShare=policy?.investor_percent>0?Math.floor(b.profit*policy.investor_percent/100):null;
  const split=c?.remaining===0&&postShare!==null?{owner_share:b.profit-postShare,investor_share:postShare,principal_return:0}:c&&splitInvestor(b.profit,c.remaining);if(!split)return err('Modal tidak aktif, belum diverifikasi perjanjiannya, atau sudah lunas.',409);
  const id=crypto.randomUUID();
  // A manually approved realized distributable profit, not an automatic claim on gross sales.
  return record(db,db.prepare('INSERT INTO investor_distributions SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM investor_distributions WHERE period=? OR reference=?) AND ?=(SELECT amount FROM investor_capital WHERE id=?)-(SELECT COALESCE(SUM(principal_return),0) FROM investor_distributions WHERE capital_id=?)').bind(id,b.capital_id,b.period,b.profit,split.owner_share,split.investor_share,split.principal_return,ref,t,user.id,b.period,ref,c.remaining,b.capital_id,b.capital_id),user,'investor:distribution',id,t);
 }
 return null;
}
