const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const err=(error,status=400)=>json({error},status);
const now=()=>Math.floor(Date.now()/1000);
export function imageMime(bytes){
 if(bytes.length<16)return null;
 if([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82].every((x,i)=>bytes[i]===x))return 'image/png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217)return 'image/jpeg';
 return null;
}
async function boundedImage(r){
 const mime=r.headers.get('content-type')?.toLowerCase();
 if(!['image/png','image/jpeg'].includes(mime))return null;
 const reader=r.body?.getReader();if(!reader)return null;let size=0;const chunks=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>524288){await reader.cancel();return null;}chunks.push(value);}const bytes=new Uint8Array(size);let off=0;for(const c of chunks){bytes.set(c,off);off+=c.length;}return imageMime(bytes)===mime?{bytes,mime}:null;}catch{return null;}
}
async function save(db,stmt,user,action,target,t){
 const [result]=await db.batch([stmt,db.prepare('INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,?,?,? WHERE changes()=1').bind(user.id,action,target,t)]);
 return result.meta.changes?json({ok:true}):err('Syarat belum terpenuhi atau batas penyimpanan tercapai.',409);
}
export async function collaboration({p,m,url,user,env,r,readBody}){
 const db=env.DB,t=now(),staff=['owner','management'].includes(user.role);
 if(p==='/api/collaboration/calendar'&&m==='GET'){
  const month=url.searchParams.get('month')||new Date(t*1000+25200000).toISOString().slice(0,7);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2000-01'||month>'2100-12')return err('Periode tidak valid.');
  const [y,mo]=month.split('-').map(Number),start=Date.UTC(y,mo-1,1)/1000-25200,end=Date.UTC(y,mo,1)/1000-25200;
  const where=staff?'1=1':user.role==='worker'?'(o.customer_id=? OR o.assigned_to=?)':'o.customer_id=?';
  const args=staff?[]:user.role==='worker'?[user.id,user.id]:[user.id];
  const items=(await db.prepare("SELECT o.id,o.service_id,o.status,p.priority,p.due_at FROM order_plans p JOIN orders o ON o.id=p.order_id WHERE p.due_at>=? AND p.due_at<? AND "+where+" ORDER BY p.due_at,o.id LIMIT 201").bind(start,end,...args).all()).results;
  return json({month,items:items.slice(0,200),truncated:items.length>200});
 }
 const match=p.match(/^\/api\/collaboration\/orders\/([a-f0-9-]{36})\/(overview|message|plan|attachment)(?:\/([a-z0-9-]+))?$/);
 if(!match||!idPattern.test(match[1]))return null;
 const [,id,action,tail]=match;
 const o=await db.prepare('SELECT o.customer_id,o.assigned_to,o.status,f.state AS payment_state FROM orders o LEFT JOIN order_finance f ON f.order_id=o.id WHERE o.id=?').bind(id).first();
 if(!o)return err('Order tidak ditemukan.',404);
 const owns=o.customer_id===user.id,assigned=user.role==='worker'&&o.assigned_to===user.id;
 if(!staff&&!owns&&!assigned)return err('Order tidak ditemukan.',404);
 const canSee=kind=>kind==='payment'?(owns||user.role==='owner'):(staff||assigned);
 if(action==='overview'&&m==='GET'&&!tail){
  const messages=(await db.prepare('SELECT id,actor_id,visibility,message,created_at FROM order_messages WHERE order_id=? AND '+(staff?'1=1':"visibility='shared'")+' ORDER BY id DESC LIMIT 100').bind(id).all()).results;
  const attachments=(await db.prepare('SELECT id,kind,mime,length(bytes) AS size,created_at FROM order_attachments WHERE order_id=? ORDER BY created_at DESC').bind(id).all()).results.filter(x=>canSee(x.kind));
  const plan=await db.prepare('SELECT priority,due_at FROM order_plans WHERE order_id=?').bind(id).first();
  return json({messages:messages.reverse(),attachments,plan});
 }
 if(action==='attachment'&&m==='GET'&&idPattern.test(tail||'')){
  const a=await db.prepare('SELECT kind,mime,bytes FROM order_attachments WHERE id=? AND order_id=?').bind(tail,id).first();
  if(!a||!canSee(a.kind))return err('Lampiran tidak ditemukan.',404);
  const ext=a.mime==='image/png'?'png':'jpg';
  return new Response(new Uint8Array(a.bytes),{headers:{'content-type':'application/octet-stream','content-disposition':'attachment; filename="nexoraid-'+a.kind+'-'+tail+'.'+ext+'"','cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",'referrer-policy':'no-referrer'}});
 }
 if(m!=='POST')return err('Metode tidak diizinkan.',405);
 if(action==='attachment'){
  const kind=tail;
  if(!(kind==='payment'&&owns||kind==='work'&&assigned))return err('Akses unggah tidak diizinkan.',403);
  if(kind==='payment'&&!(o.payment_state==='quoted'&&['claimed','confirmed','processing'].includes(o.status))||kind==='work'&&o.status!=='processing')return err('Order tidak menerima lampiran saat ini.',409);
  const image=await boundedImage(r);if(!image)return err('Gunakan PNG/JPEG asli maksimal 512 KiB.',400);
  const aid=crypto.randomUUID();
  const guard=kind==='payment'?"o.customer_id=? AND o.status IN ('claimed','confirmed','processing') AND EXISTS(SELECT 1 FROM order_finance f WHERE f.order_id=o.id AND f.state='quoted')":"o.assigned_to=? AND o.status='processing' AND EXISTS(SELECT 1 FROM users u WHERE u.id=o.assigned_to AND u.role='worker' AND NOT EXISTS(SELECT 1 FROM management_grants g WHERE g.user_id=u.id))";
  return save(db,db.prepare("INSERT INTO order_attachments SELECT ?,o.id,?,?,?,?,? FROM orders o WHERE o.id=? AND "+guard+" AND (SELECT COUNT(*) FROM order_attachments WHERE order_id=o.id AND kind=?)<3").bind(aid,user.id,kind,image.mime,image.bytes,t,id,user.id,kind),user,'attachment:'+kind,id,t);
 }
 if(tail)return err('Rute tidak valid.',404);
 const b=await readBody(r);
 if(action==='message'){
  const message=typeof b?.message==='string'?b.message.trim():'';
  if(!message||message.length>1000||!['shared','internal'].includes(b?.visibility))return err('Pesan 1–1000 karakter wajib.');
  if(b.visibility==='internal'&&!staff)return err('Catatan internal khusus management.',403);
  // Prevent stale assignments from posting after reassignment.
  const guard=staff?'1=1':owns?'o.customer_id=?':"o.assigned_to=? AND EXISTS(SELECT 1 FROM users u WHERE u.id=o.assigned_to AND u.role='worker' AND NOT EXISTS(SELECT 1 FROM management_grants g WHERE g.user_id=u.id))";
  return save(db,db.prepare("INSERT INTO order_messages(order_id,actor_id,visibility,message,created_at) SELECT o.id,?,?,?,? FROM orders o WHERE o.id=? AND "+guard+" AND (SELECT COUNT(*) FROM order_messages WHERE order_id=o.id)<500").bind(user.id,b.visibility,message,t,id,...(staff?[]:[user.id])),user,'message:'+b.visibility,id,t);
 }
 if(action==='plan'){
  if(!staff)return err('Akses management diperlukan.',403);
  if(!['normal','high','urgent'].includes(b?.priority)||!Number.isSafeInteger(b?.due_at)||b.due_at<t-86400||b.due_at>t+366*86400)return err('Deadline dan prioritas tidak valid.');
  return save(db,db.prepare("INSERT INTO order_plans SELECT id,?,?,?,? FROM orders WHERE id=? AND status NOT IN ('completed','cancelled') ON CONFLICT(order_id) DO UPDATE SET priority=excluded.priority,due_at=excluded.due_at,actor_id=excluded.actor_id,updated_at=excluded.updated_at").bind(b.priority,b.due_at,user.id,t,id),user,'order:plan',id,t);
 }
 return null;
}
