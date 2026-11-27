// Candidate shared draft: revision is also the checkout idempotency key.
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const error=(message,status)=>json({error:message},status);
export async function sharedCart({db,user,m,readBody,normalize,clock=()=>Math.floor(Date.now()/1000),token=()=>crypto.randomUUID()}){
 const read=()=>db.prepare('SELECT revision,items,updated_at FROM customer_cart_drafts WHERE user_id=?').bind(user.id).first();
 const decode=row=>{if(!row)return {revision:null,items:[],updated_at:null};const items=JSON.parse(row.items);if(!uuid(row.revision)||!Array.isArray(items)||(items.length&&JSON.stringify(normalize(items))!==row.items))throw Error('Invalid stored cart');return {...row,items};};
 if(m==='GET')return json(decode(await read()));
 if(m!=='POST')return error('Metode tidak diizinkan.',405);
 const b=await readBody();
 if(!b||!['save','clear-confirmed'].includes(b.action)||!(b.revision===null||uuid(b.revision)))return error('Versi keranjang tidak valid.',400);
 const current=decode(await read());
 if(current.revision!==b.revision)return error('Keranjang berubah di perangkat lain. Muat ulang sebelum menyimpan.',409);
 let items;
 if(b.action==='save'){
  if(Object.keys(b).some(k=>!['action','revision','items'].includes(k)))return error('Data keranjang tidak valid.',400);
  items=Array.isArray(b.items)&&b.items.length===0?[]:normalize(b.items);
  if(!items)return error('Layanan atau jumlah tidak valid.',400);
 }else{
  if(!current.revision||!current.items.length||Object.keys(b).some(k=>!['action','revision'].includes(k)))return error('Keranjang tidak dapat dikosongkan.',400);
  const receipt=await db.prepare('SELECT signature FROM checkout_groups WHERE customer_id=? AND request_id=?').bind(user.id,current.revision).first();
  if(receipt?.signature!==JSON.stringify(current.items))return error('Pesanan belum terkonfirmasi.',409);
  items=[];
 }
 const payload=JSON.stringify(items);
 // Re-saving an identical snapshot must preserve its cross-device checkout key.
 if(current.revision&&payload===JSON.stringify(current.items))return json(current);
 const revision=token(),time=clock();if(!uuid(revision))throw Error('Invalid revision');
 const result=current.revision===null?await db.prepare('INSERT INTO customer_cart_drafts(user_id,revision,items,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO NOTHING').bind(user.id,revision,payload,time).run():await db.prepare('UPDATE customer_cart_drafts SET revision=?,items=?,updated_at=? WHERE user_id=? AND revision=?').bind(revision,payload,time,user.id,current.revision).run();
 if(result.meta.changes!==1)return error('Keranjang berubah di perangkat lain. Muat ulang sebelum menyimpan.',409);
 return json({revision,items,updated_at:time});
}
