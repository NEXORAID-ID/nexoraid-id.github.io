import {services} from '../services-data.js';
const json=(d,s=200)=>Response.json(d,{status:s,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const err=(error,s=400)=>json({error},s),text=(x,min,max)=>typeof x==='string'&&x.trim().length>=min&&x.trim().length<=max?x.trim():null;
const int=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const snow=x=>typeof x==='string'&&/^\d{17,20}$/.test(x);
export async function businessControls({p,m,user,env,r,readBody}){
 const db=env.DB,t=Math.floor(Date.now()/1000),get=m==='GET',post=m==='POST';
 if(!['/api/business/policies','/api/business/gear','/api/team/suspension'].includes(p))return null;
 if(user.role!=='owner')return err('Khusus pemilik.',403);
 if(!get&&!post)return err('Metode tidak diizinkan.',405);
 if(p==='/api/business/policies'&&get)return json({items:(await db.prepare('SELECT * FROM service_policies ORDER BY service_id').all()).results});
 if(p==='/api/business/gear'&&get)return json({items:(await db.prepare('SELECT worker_id,capital_id,item,amount,reference,created_at FROM gear_rewards ORDER BY created_at DESC LIMIT 100').all()).results});
 if(p==='/api/team/suspension'&&get)return json({items:(await db.prepare('SELECT user_id,reason,created_at FROM account_suspensions ORDER BY created_at DESC LIMIT 100').all()).results});
 const b=await readBody(r);if(!b)return err('Data tidak valid.');
 let stmt,action,target,extra=null;
 if(p==='/api/business/policies'){
  const id=b.service_id;if(!services.some(s=>s.id===id)||!(b.unit_cost===null||int(b.unit_cost,0,999999999))||!(b.warranty_days===null||int(b.warranty_days,0,3650))||!int(b.promo_percent,0,90))return err('Biaya, garansi atau promo tidak valid.');
  const terms=b.warranty_terms===''?null:text(b.warranty_terms,4,1000),promo=b.promo_terms===''?null:text(b.promo_terms,4,500);
  if(b.warranty_days!==null&&b.warranty_days>0&&!terms)return err('Ketentuan garansi wajib.');
  if(b.promo_percent>0&&(!int(b.promo_start,1,4102444800)||!int(b.promo_end,1,4102444800)||b.promo_end<=b.promo_start||!promo))return err('Tanggal mulai, akhir, dan ketentuan promo wajib.');
  stmt=db.prepare('INSERT INTO service_policies VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(service_id) DO UPDATE SET unit_cost=excluded.unit_cost,warranty_days=excluded.warranty_days,warranty_terms=excluded.warranty_terms,promo_percent=excluded.promo_percent,promo_start=excluded.promo_start,promo_end=excluded.promo_end,promo_terms=excluded.promo_terms,actor_id=excluded.actor_id,updated_at=excluded.updated_at').bind(id,b.unit_cost,b.warranty_days,terms,b.promo_percent,b.promo_percent?b.promo_start:null,b.promo_percent?b.promo_end:null,promo,user.id,t);
  action='policy:update';target=id;
 }else if(p==='/api/business/gear'){
  const item=text(b.item,3,120),ref=text(b.reference,4,80);if(!snow(b.worker_id)||!item||!ref||!int(b.amount,1,999999)||b.non_cash_confirmed!==true||typeof b.capital_id!=='string'||!/^[a-f0-9-]{36}$/.test(b.capital_id))return err('Penerimaan gear non-tunai, nominal di bawah Rp1 juta, dan bukti wajib.');
  target=crypto.randomUUID();action='gear:received';stmt=db.prepare('INSERT INTO gear_rewards VALUES(?,?,?,?,?,?,?,?)').bind(target,b.worker_id,b.capital_id,item,b.amount,ref,user.id,t);
 }else{
  if(!snow(b.user_id)||b.user_id===env.OWNER_DISCORD_ID||typeof b.suspended!=='boolean')return err('Akun tidak valid atau dilindungi.');
  const reason=text(b.reason,10,300);if(!reason)return err('Alasan wajib 10–300 karakter.');
  target=b.user_id;action=b.suspended?'account:suspend':'account:restore';
  stmt=b.suspended?db.prepare('INSERT INTO account_suspensions VALUES(?,?,?,?) ON CONFLICT(user_id) DO NOTHING').bind(target,reason,user.id,t):db.prepare('DELETE FROM account_suspensions WHERE user_id=?').bind(target);
 }
 try{const [res]=await db.batch([stmt,db.prepare('INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,?,?,? WHERE changes()=1').bind(user.id,action,target,t)]);return res.meta.changes?json({ok:true}):err('Tidak ada perubahan.',409);}
 catch(e){if(/constraint|gear_not_eligible|active_work_requires_reassignment/i.test(String(e.message)))return err('Syarat belum terpenuhi, data duplikat, atau pekerjaan aktif perlu dialihkan.',409);throw e;}
}
