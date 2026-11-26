const json=(d,s=200)=>Response.json(d,{status:s,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const err=(error,s=400)=>json({error},s);
const valid=x=>Number.isSafeInteger(x)&&x>=1&&x<=999999999;
export async function installments({p,m,user,env,r,readBody}){
 const route=p.match(/^\/api\/workspace\/orders\/([a-f0-9-]{36})\/(installments|receipt-adjustment)$/);
 if(!route)return null;
 const [,id,action]=route,db=env.DB;
 const order=await db.prepare('SELECT customer_id,status FROM orders WHERE id=?').bind(id).first();
 const managementRead=user.role==='management'&&action==='installments'&&m==='GET';
 if(!order||!(user.role==='owner'||order.customer_id===user.id||managementRead))return err('Order tidak ditemukan.',404);
 if(action==='installments'&&m==='GET'){
  const b=await db.prepare('SELECT b.*,f.state FROM installment_balances b JOIN order_finance f ON f.order_id=b.order_id WHERE b.order_id=?').bind(id).first();
  if(!b)return json({balance:null,receipts:[]});
  // Management needs the balance to respect invoice/cancel locks, not payment references.
  const rows=managementRead?[]:(await db.prepare('SELECT amount,reference,created_at FROM verified_receipts WHERE order_id=? ORDER BY created_at,id LIMIT 200').bind(id).all()).results;
  return json({balance:{...b,due:order.status==='cancelled'||b.state==='paid'?0:Math.max(0,b.invoice_amount-b.received),surplus_due:Math.max(0,b.received-b.invoice_amount-b.surplus_refunded)},receipts:rows});
 }
 if(m!=='POST')return err('Metode tidak diizinkan.',405);
 if(user.role!=='owner')return err('Hanya pemilik dapat mencatat dana aktual.',403);
 const b=await readBody(r),ref=typeof b?.reference==='string'?b.reference.trim():'';
 if(b?.confirmed!==true||!valid(b.amount)||ref.length<4||ref.length>80)return err('Nominal aktual, referensi dan konfirmasi wajib.');
 const rowId=crypto.randomUUID(),t=Math.floor(Date.now()/1000);
 let stmt,kind;
 if(action==='installments'){
  kind='payment:installment';stmt=db.prepare('INSERT INTO verified_receipts VALUES(?,?,?,?,?,?)').bind(rowId,id,b.amount,ref,user.id,t);
 }else{
  if(!['surplus','partial_cancel'].includes(b.kind))return err('Jenis koreksi tidak valid.');
  const reason=typeof b.reason==='string'?b.reason.trim():'';
  if(reason.length<10||reason.length>300)return err('Alasan pengembalian dana wajib 10–300 karakter.');
  kind='payment:adjustment';stmt=db.prepare('INSERT INTO receipt_adjustments(id,order_id,kind,amount,reference,actor_id,created_at,reason) VALUES(?,?,?,?,?,?,?,?)').bind(rowId,id,b.kind,b.amount,ref,user.id,t,reason);
 }
 try{await db.batch([stmt,db.prepare('INSERT INTO audit_events(actor_id,action,target_id,created_at) VALUES(?,?,?,?)').bind(user.id,kind,id,t)]);return json({ok:true},201);}
 catch(e){if(/receipt_not_allowed|adjustment_not_allowed|UNIQUE constraint|duplicate_payment_reference|duplicate_refund_reference/i.test(String(e.message)))return err('Referensi sudah dipakai atau syarat pembayaran/refund belum terpenuhi.',409);throw e;}
}
