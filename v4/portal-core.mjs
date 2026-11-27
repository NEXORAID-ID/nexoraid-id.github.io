export const VIEW_IDS=Object.freeze({orders:'orderLayout',finance:'financeView',audit:'auditView',team:'teamPanel',workspace:'workspaceView',support:'supportView',report:'reportView',business:'businessView',notifications:'notificationsView',account:'accountView',calendar:'calendarView',shop:'shopView',performance:'performanceView'});
export function canOpenView(name,buttons){return Object.hasOwn(VIEW_IDS,name)&&Array.from(buttons).some(b=>!b.hidden&&b.dataset.view===name);}
export function createNavigator({get,buttons,allowed,loaders}){
 return async name=>{const items=buttons();if(!allowed()||!canOpenView(name,items))return false;
 for(const b of items)b.setAttribute('aria-pressed',String(b.dataset.view===name));
 for(const [key,id] of Object.entries(VIEW_IDS))get(id).hidden=key!==name;
 if(loaders[name])await loaders[name]();return true;
 };
}
export function createPortalApi({isExpired,expiredError,hasUser,expireSession,isOnline,fetcher=fetch}){
 return async (path,data)=>{
  if(isExpired())throw expiredError();
  if(!isOnline())throw Error('Tidak ada koneksi internet. Coba lagi setelah terhubung.');
  const options={cache:'no-store',signal:AbortSignal.timeout(15000)};
  if(data!==undefined)Object.assign(options,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  const r=await fetcher('/api/'+path,options);
  if(r.status===401&&hasUser()){expireSession();throw expiredError();}
  const j=await r.json().catch(()=>null);
  if(isExpired())throw expiredError();
  if(!r.ok||!j){const e=Error(j?.error||'Respons server tidak valid.');e.status=r.status;e.validError=typeof j?.error==='string';throw e;}
  return j;
 };
}

 // A failed retry never resolves the original uncertain transaction.
export function shouldClearPendingCheckout({sent,retry,error}){
 return !retry&&(!sent||([400,403,409,429].includes(error?.status)&&error.validError===true&&!String(error.message).includes('ID permintaan sudah')));
}
// Do not discard a persisted request on a malformed or mismatched success response.
export function validateCheckoutReceipt(result,items,{single=false}={}){
 const rows=single?[result?.order]:result?.orders;
 if(!Array.isArray(rows)||rows.length!==items.length||(!single&&typeof result?.checkout_id!=='string'))throw Error('Respons pesanan belum dapat dipastikan.');
 const expected=new Map(items.map(x=>[x.service_id,x.quantity])),ids=new Set();
 for(const row of rows){
  if(!row||typeof row.id!=='string'||!row.id||ids.has(row.id)||!expected.has(row.service_id)||expected.get(row.service_id)!==row.quantity)throw Error('Respons pesanan belum dapat dipastikan.');
  ids.add(row.id);expected.delete(row.service_id);
 }
 return result;
}
