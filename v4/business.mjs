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
 const price=n===null?null:Math.floor(n*(100-pct)/100);
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
  const unread=rows.filter(x=>x.id>seen).length;
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
 if(p==='/api/business/investors'&&get){
  const capital=(await db.prepare('SELECT c.id,c.name,c.amount,COALESCE(SUM(d.principal_return),0) AS returned FROM investor_capital c LEFT JOIN investor_distributions d ON d.capital_id=c.id GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100').all()).results;
  const distributions=(await db.prepare('SELECT capital_id,period,profit,owner_share,investor_share,principal_return,reference FROM investor_distributions ORDER BY period DESC LIMIT 100').all()).results;
  return json({capital,distributions});
 }
 if(p==='/api/business/investors'&&post){
  const b=await readBody(r),name=str(b?.name,2,100),ref=str(b?.reference,4,80);
  if(!name||!ref||!integer(b?.amount))return err('Modal nyata, nama dan referensi wajib.');
  const id=crypto.randomUUID();return record(db,db.prepare("INSERT INTO investor_capital SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM investor_capital WHERE reference=?) AND NOT EXISTS(SELECT 1 FROM investor_capital c WHERE c.amount>(SELECT COALESCE(SUM(principal_return),0) FROM investor_distributions WHERE capital_id=c.id))").bind(id,name,b.amount,ref,t,user.id,ref),user,'investor:capital',id,t);
 }
 if(p==='/api/business/distributions'&&post){
  const b=await readBody(r),ref=str(b?.reference,4,80);
  if(!uuid.test(b?.capital_id||'')||!integer(b?.profit)||!ref||!/^\d{4}-(0[1-9]|1[0-2])$/.test(b?.period||''))return err('Data distribusi tidak valid.');
  const c=await db.prepare('SELECT c.amount-COALESCE(SUM(d.principal_return),0) AS remaining FROM investor_capital c LEFT JOIN investor_distributions d ON d.capital_id=c.id WHERE c.id=? GROUP BY c.id').bind(b.capital_id).first();
  const split=c&&splitInvestor(b.profit,c.remaining);if(!split)return err('Modal tidak aktif atau sudah lunas.',409);
  const id=crypto.randomUUID();
  // A manually approved realized distributable profit, not an automatic claim on gross sales.
  return record(db,db.prepare('INSERT INTO investor_distributions SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM investor_distributions WHERE period=? OR reference=?) AND ?=(SELECT amount FROM investor_capital WHERE id=?)-(SELECT COALESCE(SUM(principal_return),0) FROM investor_distributions WHERE capital_id=?)').bind(id,b.capital_id,b.period,b.profit,split.owner_share,split.investor_share,split.principal_return,ref,t,user.id,b.period,ref,c.remaining,b.capital_id,b.capital_id),user,'investor:distribution',id,t);
 }
 return null;
}
