const staff=r=>r==='owner'||r==='management';
const statuses=['requested','claimed','confirmed','processing','completed','cancelled'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const validId=s=>typeof s==='string'&&/^\d{17,20}$/.test(s);
const now=()=>Math.floor(Date.now()/1000);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const err=(error,status)=>json({error},status);
export function financeKind(serviceId){return serviceId==='seller'?'seller':serviceId.startsWith('gta-')?'joki':'other';}
export function scopeFor(user){return staff(user.role)?{where:'1=1',args:[]}:user.role==='worker'?{where:"(o.customer_id=? OR o.assigned_to=? OR o.status='requested')",args:[user.id,user.id]}:{where:'o.customer_id=?',args:[user.id]};}
const orderFields="o.*,f.amount AS invoice_amount,f.kind AS invoice_kind,f.state AS payment_state,f.paid_at,w.submitted_at AS evidence_at,EXISTS(SELECT 1 FROM payment_claims c WHERE c.order_id=o.id) AS payment_claimed,(SELECT amount FROM order_refunds r WHERE r.order_id=o.id) AS refunded_amount";
const joins=" FROM orders o LEFT JOIN order_finance f ON f.order_id=o.id LEFT JOIN order_work w ON w.order_id=o.id";
function redact(o,user){if(user.role==='worker'&&o.status==='requested'&&o.customer_id!==user.id)return {...o,customer_id:null};return o;}
export async function listOrders(db,user,url){
 const {where,args}=scopeFor(user);
 const status=url.searchParams.get('status')||'',q=(url.searchParams.get('q')||'').trim(),cursor=url.searchParams.get('cursor')||'';
 if(status&&!statuses.includes(status)||q.length>100)return err('Filter tidak valid.',400);
 const conditions=[where],bind=[...args];
 if(status){conditions.push('o.status=?');bind.push(status);}
 if(q){conditions.push("(instr(lower(o.id),lower(?))>0 OR instr(lower(o.service_id),lower(?))>0)");bind.push(q,q);}
 if(cursor){const [time,id,extra]=cursor.split(':');if(extra||!/^\d{1,12}$/.test(time)||!uuid.test(id||''))return err('Cursor tidak valid.',400);conditions.push('(o.created_at<? OR (o.created_at=? AND o.id<?))');bind.push(Number(time),Number(time),id);}
 const rows=(await db.prepare('SELECT '+orderFields+joins+' WHERE '+conditions.join(' AND ')+' ORDER BY o.created_at DESC,o.id DESC LIMIT 51').bind(...bind).all()).results;
 const page=rows.slice(0,50).map(o=>redact(o,user));const last=page.at(-1);
 return json({orders:page,next:rows.length>50?last.created_at+':'+last.id:null});
}
export async function dashboardSummary(db,user){
 const {where,args}=scopeFor(user);
 const counts=(await db.prepare('SELECT o.status,COUNT(*) AS count FROM orders o WHERE '+where+' GROUP BY o.status').bind(...args).all()).results;
 const totals=Object.fromEntries(statuses.map(s=>[s,0]));for(const row of counts)totals[row.status]=row.count;
 const result={counts:totals,total:Object.values(totals).reduce((a,b)=>a+b,0)};
 if(user.role==='owner'||user.role==='worker'||await db.prepare('SELECT order_id FROM order_settlements WHERE worker_id=? LIMIT 1').bind(user.id).first()){
  const worker=user.role!=='owner';
  const row=await db.prepare(worker?'SELECT COUNT(*) AS count,COALESCE(SUM(worker_share),0) AS worker_share FROM order_settlements WHERE worker_id=?':'SELECT COUNT(*) AS count,COALESCE(SUM(gross),0) AS gross,COALESCE(SUM(worker_share),0) AS worker_share,COALESCE(SUM(owner_share),0) AS owner_share FROM order_settlements').bind(...(worker?[user.id]:[])).first();
  result.settlement=row;
 }
 return json(result);
}
async function mutate(db,statement,actor,action,id,time){
 const rows=await db.batch([statement,db.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,?,?,? WHERE changes()=1").bind(actor,action,id,time)]);
 return rows[0].meta.changes?json({ok:true}):err('Data sudah berubah atau syarat belum terpenuhi. Muat ulang.',409);
}
export async function operations({p,m,url,user,env,readBody,r}){
 const db=env.DB;
 if(p==='/api/dashboard'&&m==='GET')return dashboardSummary(db,user);
 if(p==='/api/audit'&&m==='GET'){
  if(user.role!=='owner')return err('Akses owner diperlukan.',403);
  const before=url.searchParams.get('before')||'';
  if(before&&!/^\d{1,15}$/.test(before))return err('Cursor tidak valid.',400);
  const rows=(await db.prepare('SELECT id,actor_id,action,target_id,created_at FROM audit_events WHERE id<? ORDER BY id DESC LIMIT 51').bind(before?Number(before):Number.MAX_SAFE_INTEGER).all()).results;
  const events=rows.slice(0,50);return json({events,next:rows.length>50?events.at(-1).id:null});
 }
 if(p==='/api/settlements'&&m==='GET'){
  if(!['owner','worker'].includes(user.role)&&!await db.prepare('SELECT order_id FROM order_settlements WHERE worker_id=? LIMIT 1').bind(user.id).first())return err('Akses keuangan tidak diizinkan.',403);
  const worker=user.role!=='owner',before=url.searchParams.get('before')||'';
  if(before&&!uuid.test(before))return err('Cursor tidak valid.',400);
  const where=worker?'worker_id=? AND order_id>?':'order_id>?';
  const columns=worker?'order_id,kind,worker_share,created_at':'order_id,worker_id,kind,gross,worker_share,owner_share,created_at';
  const rows=(await db.prepare('SELECT '+columns+' FROM order_settlements WHERE '+where+' ORDER BY order_id LIMIT 51').bind(...(worker?[user.id,before]:[before])).all()).results;
  const settlements=rows.slice(0,50);return json({settlements,next:rows.length>50?settlements.at(-1).order_id:null});
 }
 const match=p.match(/^\/api\/orders\/([a-f0-9-]{36})(?:\/(quote|payment|evidence|assign|cancel))?$/);
 if(!match||!uuid.test(match[1]))return null;
 const [,id,action]=match;
 const order=await db.prepare('SELECT '+orderFields+joins+' WHERE o.id=?').bind(id).first();
 if(!order)return err('Order tidak ditemukan.',404);
 const owns=order.customer_id===user.id,assigned=order.assigned_to===user.id,over=staff(user.role);
 if(!over&&!owns&&!(user.role==='worker'&&(assigned||order.status==='requested')))return err('Order tidak ditemukan.',404);
 if(!action&&m==='GET'){
  const visible=redact(order,user);
  // Payment references and evidence are deliberately excluded from general customer responses.
  const evidence=over||assigned&&user.role==='worker'?await db.prepare('SELECT evidence,submitted_at FROM order_work WHERE order_id=?').bind(id).first():null;
  return json({order:visible,evidence});
 }
 if(m!=='POST')return err('Metode tidak diizinkan.',405);
 const b=await readBody(r),t=now();if(!b)return err('Data tidak valid.',400);
 if(action==='quote'){
  if(!over)return err('Akses management diperlukan.',403);
  const kind=financeKind(order.service_id),amount=b.amount;
  if(!Number.isSafeInteger(amount)||amount<1||amount>999999999||kind==='other'&&amount<10000)return err('Nominal tidak valid; fee layanan lain minimal Rp10.000.',400);
  if(!['claimed','confirmed','processing'].includes(order.status))return err('Order harus sudah diambil penjoki.',409);
  if(order.payment_claimed)return err('Invoice dikunci karena ada laporan pembayaran. Owner harus meninjau laporan dahulu.',409);
  return mutate(db,db.prepare("INSERT INTO order_finance(order_id,amount,kind,quoted_by,quoted_at) SELECT id,?,?,?,? FROM orders WHERE id=? AND status IN ('claimed','confirmed','processing') ON CONFLICT(order_id) DO UPDATE SET amount=excluded.amount,quoted_by=excluded.quoted_by,quoted_at=excluded.quoted_at WHERE order_finance.state='quoted' AND NOT EXISTS(SELECT 1 FROM payment_claims WHERE order_id=order_finance.order_id)").bind(amount,kind,user.id,t,id),user.id,'invoice:quote',id,t);
 }
 if(action==='payment'){
  if(user.role!=='owner')return err('Hanya owner dapat memverifikasi pembayaran.',403);
  const ref=typeof b.reference==='string'?b.reference.trim():'';
  if(ref.length<4||ref.length>80||!Number.isSafeInteger(b.amount)||b.amount!==order.invoice_amount)return err('Nominal harus sesuai invoice dan referensi transaksi wajib.',400);
  return mutate(db,db.prepare("UPDATE order_finance SET state='paid',paid_by=?,paid_at=?,payment_ref=? WHERE order_id=? AND state='quoted' AND amount=? AND NOT EXISTS(SELECT 1 FROM order_finance f WHERE f.state='paid' AND f.payment_ref=? AND f.order_id<>?) AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status IN ('claimed','confirmed','processing'))").bind(user.id,t,ref,id,b.amount,ref,id,id),user.id,'payment:verified',id,t);
 }
 if(action==='evidence'){
  if(user.role!=='worker'||!assigned)return err('Hanya penjoki yang ditugaskan.',403);
  const evidence=typeof b.evidence==='string'?b.evidence.trim():'';
  if(evidence.length<10||evidence.length>500)return err('Catatan bukti 10–500 karakter.',400);
  return mutate(db,db.prepare("INSERT INTO order_work(order_id,worker_id,evidence,submitted_at) SELECT id,?,?,? FROM orders WHERE id=? AND assigned_to=? AND status='processing' ON CONFLICT(order_id) DO UPDATE SET worker_id=excluded.worker_id,evidence=excluded.evidence,submitted_at=excluded.submitted_at").bind(user.id,evidence,t,id,user.id),user.id,'work:evidence',id,t);
 }
 if(action==='assign'){
  if(!over)return err('Akses management diperlukan.',403);
  if(!validId(b.worker_id)||b.worker_id===order.customer_id||b.worker_id===env.OWNER_DISCORD_ID)return err('Penjoki tidak valid.',400);
  // Override only before work starts, and never assign a management member.
  return mutate(db,db.prepare("UPDATE orders SET assigned_to=?,status=CASE WHEN status='requested' THEN 'claimed' ELSE status END,updated_at=? WHERE id=? AND status IN ('requested','claimed','confirmed') AND customer_id<>? AND EXISTS(SELECT 1 FROM users u WHERE u.id=? AND u.role='worker' AND NOT EXISTS(SELECT 1 FROM management_grants g WHERE g.user_id=u.id))").bind(b.worker_id,t,id,b.worker_id,b.worker_id),user.id,'order:assign',id,t);
 }
 if(action==='cancel'){
  if(!owns||order.status!=='requested')return err('Hanya permintaan sendiri yang belum diambil dapat dibatalkan.',403);
  return mutate(db,db.prepare("UPDATE orders SET status='cancelled',updated_at=? WHERE id=? AND customer_id=? AND status='requested'").bind(t,id,user.id),user.id,'order:customer_cancel',id,t);
 }
 return err('Endpoint tidak ditemukan.',404);
}
