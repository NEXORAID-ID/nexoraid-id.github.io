const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const error=(message,status=400)=>json({error:message},status);
export async function cashLedger({p,m,user,env,r,readBody}){
 if(p!=='/api/workspace/cash-ledger')return null;
 if(user.role!=='owner')return error('Khusus owner.',403);
 const db=env.DB,t=Math.floor(Date.now()/1000);
 if(m==='POST'){
  const b=await readBody(r),ref=typeof b?.reference==='string'?b.reference.trim():'';
  if(b?.action==='close'){
   if(b.confirmed!==true||!Number.isSafeInteger(b.end_at)||b.end_at<1||b.end_at>=t||ref.length<4||ref.length>80)return error('Waktu tutup, referensi dan konfirmasi owner wajib.');
   const q=`INSERT INTO cash_period_closes(end_at,start_at,incoming,outgoing,closing_balance,movement_count,reference,actor_id,created_at)
   SELECT ?,s.start_at,
   (SELECT COALESCE(SUM(CASE WHEN delta>0 THEN delta ELSE 0 END),0) FROM cash_movements WHERE event_at>s.start_at AND event_at<=?),
   (SELECT COALESCE(SUM(CASE WHEN delta<0 THEN -delta ELSE 0 END),0) FROM cash_movements WHERE event_at>s.start_at AND event_at<=?),
   s.amount+(SELECT COALESCE(SUM(delta),0) FROM cash_movements WHERE event_at>s.effective_at AND event_at<=?),
   (SELECT COUNT(*) FROM cash_movements WHERE event_at>s.start_at AND event_at<=?),?,?,?
   FROM (SELECT amount,effective_at,COALESCE((SELECT MAX(end_at) FROM cash_period_closes),effective_at) AS start_at FROM cash_opening WHERE id=1) s WHERE s.start_at<?`;
   try{
    const [x]=await db.batch([db.prepare(q).bind(b.end_at,b.end_at,b.end_at,b.end_at,b.end_at,ref,user.id,t,b.end_at),db.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,'cash:close',?,? WHERE changes()=1").bind(user.id,String(b.end_at),t)]);
    return x.meta.changes?json({ok:true,end_at:b.end_at},201):error('Saldo awal atau periode tidak valid.',409);
   }catch(e){if(/cash_close_conflict|UNIQUE constraint failed/.test(String(e.message)))return error('Periode bentrok atau referensi transaksi perlu rekonsiliasi.',409);throw e;}
  }
  if(b?.action!==undefined&&b.action!=='opening')return error('Tindakan buku kas tidak dikenal.');
  if(b?.confirmed!==true||!Number.isSafeInteger(b.amount)||b.amount<0||b.amount>999999999999||!Number.isSafeInteger(b.effective_at)||b.effective_at<0||b.effective_at>t||ref.length<4||ref.length>80)return error('Saldo aktual, waktu efektif, referensi dan konfirmasi owner wajib.');
  const [result]=await db.batch([db.prepare('INSERT INTO cash_opening VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(b.amount,b.effective_at,ref,user.id,t),db.prepare("INSERT INTO audit_events(actor_id,action,target_id,created_at) SELECT ?,'cash:opening','cash-opening',? WHERE changes()=1").bind(user.id,t)]);
  return result.meta.changes?json({ok:true},201):error('Saldo awal sudah ditetapkan; koreksi memerlukan jurnal terpisah.',409);
 }
 if(m!=='GET')return error('Metode tidak diizinkan.',405);
 const opening=await db.prepare('SELECT amount,effective_at,reference FROM cash_opening WHERE id=1').first();
 const since=opening?.effective_at??0;
 const sums=await db.prepare('SELECT COALESCE(SUM(CASE WHEN delta>0 THEN delta ELSE 0 END),0) AS incoming,COALESCE(SUM(CASE WHEN delta<0 THEN -delta ELSE 0 END),0) AS outgoing,COALESCE(SUM(delta),0) AS net FROM cash_movements WHERE event_at>?').bind(since).first();
 const items=(await db.prepare('SELECT id,kind,delta,reference,event_at FROM cash_movements WHERE event_at>? ORDER BY event_at DESC,id DESC LIMIT 100').bind(since).all()).results;
 const duplicates=(await db.prepare("SELECT trim(reference) AS reference,COUNT(*) AS count FROM cash_movements WHERE event_at>? AND reference IS NOT NULL GROUP BY trim(reference) HAVING COUNT(*)>1 LIMIT 100").bind(since).all()).results;
 const closed=(await db.prepare('SELECT * FROM cash_period_closes ORDER BY end_at DESC LIMIT 24').all()).results;
 return json({closed_periods:closed,opening,...sums,estimated_balance:opening?opening.amount+sums.net:null,items,duplicate_references:duplicates,requires_reconciliation:!opening||duplicates.length>0});
}
