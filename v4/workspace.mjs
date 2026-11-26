// Workspace records are manual attestations; no bank transfer or payment gateway is called.
const staff=u=>['owner','management'].includes(u.role),owner=u=>u.role==='owner';
const idRe=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const amount=n=>Number.isSafeInteger(n)&&n>=1&&n<=999999999;
const str=(s,min,max)=>typeof s==='string'&&s.trim().length>=min&&s.trim().length<=max?s.trim():null;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const err=(error,status=400)=>json({error},status),deny=()=>err('Akses tidak diizinkan.',403);
const epoch=()=>Math.floor(Date.now()/1000);
async function write(db,stmt,user,action,id,t){
 const [result]=await db.batch([stmt,db.prepare('INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,?,?,? WHERE changes()=1').bind(user.id,action,id,t)]);
 return result.meta.changes?json({ok:true,id}):err('Syarat belum terpenuhi atau data sudah berubah.',409);
}
async function page(db,url,table,fields,where,args){
 const cursor=url.searchParams.get('before')||'';
 if(cursor&&!idRe.test(cursor))return err('Cursor tidak valid.');
 const rows=(await db.prepare('SELECT '+fields+' FROM '+table+' WHERE '+where+' AND id>? ORDER BY id LIMIT 51').bind(...args,cursor).all()).results;
 return json({items:rows.slice(0,50),next:rows.length>50?rows[49].id:null});
}
export async function workspace({p,m,url,user,env,readBody,r}){
 const db=env.DB,t=epoch(),get=m==='GET',post=m==='POST';
 if(p==='/api/workspace/payouts'&&(get||post)){
  const entitled=user.role==='worker'||Boolean(await db.prepare('SELECT order_id FROM order_settlements WHERE worker_id=? LIMIT 1').bind(user.id).first());if(!owner(user)&&!entitled)return deny();
  if(get){
   const w=!owner(user),where=w?'worker_id=?':'1=1',args=w?[user.id]:[];
   const earned=await db.prepare('SELECT COALESCE(SUM(worker_share),0) AS earned FROM order_settlements WHERE '+where).bind(...args).first();
   const spent=await db.prepare("SELECT COALESCE(SUM(CASE WHEN state='paid' THEN amount ELSE 0 END),0) AS paid,COALESCE(SUM(CASE WHEN state='pending' THEN amount ELSE 0 END),0) AS pending FROM payout_requests WHERE "+where).bind(...args).first();
   const res=await page(db,url,'payout_requests','id,worker_id,amount,state,created_at,reviewed_at',where,args);if(!res.ok)return res;
   return json({...await res.json(),balance:{...earned,...spent,available:earned.earned-spent.paid-spent.pending}});
  }
  if(owner(user)||!entitled)return deny();
  const b=await readBody(r);if(!amount(b?.amount))return err('Nominal pencairan tidak valid.');
  const id=crypto.randomUUID();
  return write(db,db.prepare("INSERT INTO payout_requests(id,worker_id,amount,created_at) SELECT ?,?,?,? WHERE ? <= (SELECT COALESCE(SUM(worker_share),0) FROM order_settlements WHERE worker_id=?) - (SELECT COALESCE(SUM(amount),0) FROM payout_requests WHERE worker_id=? AND state IN ('pending','paid'))").bind(id,user.id,b.amount,t,b.amount,user.id,user.id),user,'payout:request',id,t);
 }
 const payout=p.match(/^\/api\/workspace\/payouts\/([a-f0-9-]{36})$/);
 if(payout&&post&&idRe.test(payout[1])){
  if(!owner(user))return deny();
  const b=await readBody(r),ref=str(b?.reference,4,80),id=payout[1];
  if(!ref||!['paid','rejected'].includes(b?.state))return err('Status dan referensi / alasan wajib.');
  return write(db,db.prepare("UPDATE payout_requests SET state=?,reviewed_at=?,reviewed_by=?,reference=? WHERE id=? AND state='pending' AND (?<>'paid' OR NOT EXISTS(SELECT 1 FROM payout_requests WHERE state='paid' AND reference=?))").bind(b.state,t,user.id,ref,id,b.state,ref),user,'payout:'+b.state,id,t);
 }
 if(p==='/api/workspace/expenses'&&(get||post)){
  if(!owner(user))return deny();
  if(get)return page(db,url,'operating_expenses','id,category,amount,note,reference,created_at','1=1',[]);
  const b=await readBody(r),note=str(b?.note,3,200),ref=str(b?.reference,4,80);
  if(!amount(b?.amount)||!note||!ref||!['hosting','supplier','marketing','tools','other'].includes(b?.category))return err('Data biaya tidak valid.');
  const id=crypto.randomUUID();
  return write(db,db.prepare('INSERT INTO operating_expenses(id,category,amount,note,reference,actor_id,created_at) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM operating_expenses WHERE reference=?)').bind(id,b.category,b.amount,note,ref,user.id,t,ref),user,'expense:record',id,t);
 }
 if(p==='/api/workspace/report'&&get){
  if(!staff(user))return deny();
  const month=url.searchParams.get('month')||new Date(t*1000+7*3600000).toISOString().slice(0,7);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2000-01'||month>'2100-12')return err('Periode tidak valid.');
  const [y,mo]=month.split('-').map(Number),start=Date.UTC(y,mo-1,1)/1000-25200,end=Date.UTC(y,mo,1)/1000-25200;
  const counts=(await db.prepare('SELECT status,COUNT(*) AS count FROM orders WHERE created_at>=? AND created_at<? GROUP BY status').bind(start,end).all()).results;
  const workers=(await db.prepare("SELECT u.id,u.display_name,COALESCE(p.available,1) AS available,COUNT(o.id) AS completed FROM users u LEFT JOIN worker_presence p ON p.worker_id=u.id LEFT JOIN orders o ON o.assigned_to=u.id AND o.status='completed' AND o.updated_at>=? AND o.updated_at<? WHERE u.role='worker' AND NOT EXISTS(SELECT 1 FROM management_grants g WHERE g.user_id=u.id) GROUP BY u.id ORDER BY completed DESC,u.id LIMIT 100").bind(start,end).all()).results;
  const result={month,counts,workers};
  if(owner(user)){
   const completed=await db.prepare('SELECT COALESCE(SUM(gross),0) AS gross,COALESCE(SUM(worker_share),0) AS worker_share,COALESCE(SUM(owner_share),0) AS owner_share FROM order_settlements WHERE created_at>=? AND created_at<?').bind(start,end).first();
   const cost=await db.prepare('SELECT COALESCE(SUM(amount),0) AS expenses FROM operating_expenses WHERE created_at>=? AND created_at<?').bind(start,end).first();
   const cash=await db.prepare("SELECT COALESCE(SUM(delta),0) AS received FROM cash_order_movements WHERE kind='payment' AND event_at>=? AND event_at<?").bind(start,end).first();
   const refunds=await db.prepare("SELECT COALESCE(SUM(-delta),0) AS refunded FROM cash_order_movements WHERE kind='refund' AND event_at>=? AND event_at<?").bind(start,end).first();
   const completedRefunds=await db.prepare('SELECT COALESCE(SUM(amount),0) AS completed_refund_cost FROM completed_refunds WHERE created_at>=? AND created_at<?').bind(start,end).first();
   const payouts=await db.prepare("SELECT COALESCE(SUM(amount),0) AS paid_out FROM payout_requests WHERE state='paid' AND reviewed_at>=? AND reviewed_at<?").bind(start,end).first();
   const daily=(await db.prepare("SELECT date(created_at,'unixepoch','+7 hours') AS day,SUM(gross) AS gross,SUM(owner_share) AS owner_share FROM order_settlements WHERE created_at>=? AND created_at<? GROUP BY day ORDER BY day").bind(start,end).all()).results;
   result.finance={...completed,...cost,...cash,...refunds,...payouts,...completedRefunds,recorded_margin:completed.owner_share-cost.expenses-completedRefunds.completed_refund_cost,daily};
  }
  return json(result);
 }
 if(p==='/api/workspace/presence'&&(get||post)){
  if(user.role!=='worker')return deny();
  if(get){const row=await db.prepare('SELECT available,updated_at FROM worker_presence WHERE worker_id=?').bind(user.id).first();return json({available:row?Boolean(row.available):true});}
  const b=await readBody(r);if(typeof b?.available!=='boolean')return err('Status tidak valid.');
  return write(db,db.prepare('INSERT INTO worker_presence VALUES(?,?,?) ON CONFLICT(worker_id) DO UPDATE SET available=excluded.available,updated_at=excluded.updated_at').bind(user.id,Number(b.available),t),user,'worker:presence',user.id,t);
 }
 if(p==='/api/workspace/support'&&get){
  return page(db,url,'support_cases','id,order_id,customer_id,kind,message,state,resolution,created_at,resolved_at',staff(user)?'1=1':'customer_id=?',staff(user)?[]:[user.id]);
 }
 const support=p.match(/^\/api\/workspace\/support\/([a-f0-9-]{36})$/);
 if(support&&post&&idRe.test(support[1])){
  if(!staff(user))return deny();const b=await readBody(r),note=str(b?.resolution,10,500),id=support[1];if(!note)return err('Resolusi 10–500 karakter.');
  return write(db,db.prepare("UPDATE support_cases SET state='resolved',resolution=?,resolved_by=?,resolved_at=? WHERE id=? AND state='open'").bind(note,user.id,t,id),user,'support:resolve',id,t);
 }
 const orderRoute=p.match(/^\/api\/workspace\/orders\/([a-f0-9-]{36})\/(receipt|support|review|refund|timeline|reject-receipt|completed-refund)$/);
 if(!orderRoute||!idRe.test(orderRoute[1]))return null;
 const [,id,action]=orderRoute;
 const order=await db.prepare('SELECT o.id,o.customer_id,o.assigned_to,o.status,f.amount,f.state AS payment_state FROM orders o LEFT JOIN order_finance f ON f.order_id=o.id WHERE o.id=?').bind(id).first();
 if(!order)return err('Order tidak ditemukan.',404);
 const owns=order.customer_id===user.id,assigned=user.role==='worker'&&order.assigned_to===user.id;
 if(!owns&&!staff(user)&&!assigned)return err('Order tidak ditemukan.',404);
 if(action==='timeline'&&get){
  const events=(await db.prepare("SELECT action,created_at FROM audit_events WHERE target_id=? AND (action LIKE 'status:%' OR action IN ('order:create','claim','order:assign','invoice:quote','payment:verified','work:evidence','order:customer_cancel','payment:claim','payment:claim_rejected','refund:record','refund:completed','ticket:link')) ORDER BY id DESC LIMIT 100").bind(id).all()).results;
  const receipt=owns||owner(user)?await db.prepare('SELECT amount,reference,submitted_at FROM payment_claims WHERE order_id=?').bind(id).first():null;
  const review=owns||staff(user)||assigned?await db.prepare('SELECT rating,note,created_at FROM order_reviews WHERE order_id=?').bind(id).first():null;
  const refund=await db.prepare('SELECT SUM(amount) AS amount,MAX(created_at) AS created_at FROM (SELECT amount,created_at FROM order_refunds WHERE order_id=? UNION ALL SELECT amount,created_at FROM completed_refunds WHERE order_id=?) HAVING COUNT(*)>0').bind(id,id).first();
  return json({events,receipt,review,refund});
 }
 if(!post)return err('Metode tidak diizinkan.',405);
 const b=await readBody(r);
 if(action==='reject-receipt'){
  if(!owner(user))return deny();const reason=str(b?.reason,10,300);if(!reason)return err('Alasan 10–300 karakter wajib.');
  const claimId=crypto.randomUUID();
  const results=await db.batch([db.prepare("INSERT INTO rejected_payment_claims SELECT ?,c.order_id,c.amount,c.reference,c.submitted_at,?,?,? FROM payment_claims c JOIN order_finance f ON f.order_id=c.order_id WHERE c.order_id=? AND f.state='quoted'").bind(claimId,reason,user.id,t,id),db.prepare("DELETE FROM payment_claims WHERE order_id=? AND EXISTS(SELECT 1 FROM rejected_payment_claims WHERE id=?)").bind(id,claimId),db.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,'payment:claim_rejected',?,? WHERE changes()=1").bind(user.id,id,t)]);
  return results[0].meta.changes?json({ok:true}):err('Tidak ada laporan pembayaran yang dapat ditolak.',409);
 }
 if(action==='receipt'){
  if(!owns)return deny();const ref=str(b?.reference,4,80);
  if(!ref||!amount(b?.amount))return err('Nominal aktual dan referensi wajib.');
  return write(db,db.prepare("INSERT INTO payment_claims(order_id,customer_id,reference,amount,submitted_at) SELECT o.id,?,?,?,? FROM orders o JOIN order_finance f ON f.order_id=o.id WHERE o.id=? AND o.customer_id=? AND o.status IN ('claimed','confirmed','processing') AND f.state='quoted' ON CONFLICT(order_id) DO NOTHING").bind(user.id,ref,b.amount,t,id,user.id),user,'payment:claim',id,t);
 }
 if(action==='support'){
  if(!owns)return deny();const note=str(b?.message,10,500);if(!note||!['question','complaint','refund'].includes(b?.kind))return err('Jenis dan pesan 10–500 karakter wajib.');
  const caseId=crypto.randomUUID();
  return write(db,db.prepare("INSERT INTO support_cases(id,order_id,customer_id,kind,message,created_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM support_cases WHERE order_id=? AND state='open')").bind(caseId,id,user.id,b.kind,note,t,id),user,'support:open',caseId,t);
 }
 if(action==='review'){
  if(!owns)return deny();const note=typeof b?.note==='string'&&b.note.length<=300?b.note.trim():null;
  if(!Number.isInteger(b?.rating)||b.rating<1||b.rating>5||note===null)return err('Rating 1–5 dan catatan maksimal 300 karakter.');
  return write(db,db.prepare("INSERT INTO order_reviews SELECT id,customer_id,?,?,? FROM orders WHERE id=? AND customer_id=? AND status='completed' ON CONFLICT(order_id) DO NOTHING").bind(b.rating,note,t,id,user.id),user,'review:submit',id,t);
 }
 if(action==='completed-refund'){
  if(!owner(user))return deny();const ref=str(b?.reference,4,80),reason=str(b?.reason,10,300);
  if(!ref||!reason||!amount(b?.amount)||b.owner_bears_cost!==true)return err('Nominal, referensi, alasan dan persetujuan beban owner wajib.');
  const rid=crypto.randomUUID();
  try{return await write(db,db.prepare("INSERT INTO completed_refunds SELECT ?,o.id,?,?,?,?,? FROM orders o JOIN order_finance f ON f.order_id=o.id WHERE o.id=? AND o.status='completed' AND f.state='paid' AND ?<=f.amount-(SELECT COALESCE(SUM(amount),0) FROM completed_refunds WHERE order_id=o.id) AND NOT EXISTS(SELECT 1 FROM completed_refunds WHERE reference=?) AND NOT EXISTS(SELECT 1 FROM order_refunds WHERE reference=? OR order_id=o.id)").bind(rid,b.amount,ref,reason,user.id,t,id,b.amount,ref,ref),user,'refund:completed',id,t);}catch(e){if(String(e.message).includes('refund_limit'))return err('Refund melebihi pembayaran atau sudah tercatat.',409);throw e;}
 }
 if(action==='refund'){
  if(!owner(user))return deny();const ref=str(b?.reference,4,80);
  if(!ref||!amount(b?.amount)||b.amount!==order.amount)return err('Refund penuh harus sesuai pembayaran dan referensi transfer.');
  return write(db,db.prepare("INSERT INTO order_refunds(order_id,amount,reference,actor_id,created_at) SELECT o.id,f.amount,?,?,? FROM orders o JOIN order_finance f ON f.order_id=o.id WHERE o.id=? AND o.status IN ('claimed','confirmed','processing') AND f.state='paid' AND f.amount=? AND NOT EXISTS(SELECT 1 FROM order_refunds WHERE order_id=o.id OR reference=?) AND NOT EXISTS(SELECT 1 FROM completed_refunds WHERE reference=?)").bind(ref,user.id,t,id,b.amount,ref,ref),user,'refund:record',id,t);
 }
 return null;
}
