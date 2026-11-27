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
 const fail=()=>{throw Error('Respons pesanan belum dapat dipastikan.');};
 if(!Array.isArray(items)||items.length<1||items.length>5||(single&&items.length!==1)||items.some(x=>typeof x?.service_id!=='string'||!x.service_id.trim()||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>99))fail();
 const rows=single?[result?.order]:result?.orders;
 if(!Array.isArray(rows)||rows.length!==items.length||(!single&&(typeof result?.checkout_id!=='string'||!result.checkout_id.trim())))fail();
 const expected=new Map(items.map(x=>[x.service_id,x.quantity])),ids=new Set();
 if(expected.size!==items.length)fail();
 for(const row of rows){
  if(!row||typeof row.id!=='string'||!row.id.trim()||ids.has(row.id)||!expected.has(row.service_id)||expected.get(row.service_id)!==row.quantity)throw Error('Respons pesanan belum dapat dipastikan.');
  ids.add(row.id);expected.delete(row.service_id);
 }
 if(expected.size!==0)fail();
 return result;
}

// A monotonically increasing ticket prevents A→B→A responses from overwriting a newer view.
export function latestRequest(){let sequence=0;return ()=>{const ticket=++sequence;return ()=>ticket===sequence;};}

export function checkoutPricingPreview(pricing){
 if(pricing?.status!=='estimate_only')return '';
 const {known_subtotal,unknown_count,service_fee,total}=pricing;
 if(!Number.isSafeInteger(known_subtotal)||known_subtotal<0||!Number.isInteger(unknown_count)||unknown_count<0||unknown_count>5||![0,500].includes(service_fee)||(!unknown_count&&(!Number.isSafeInteger(total)||total!==known_subtotal+service_fee))||(unknown_count&&total!==null))return '';
 const rupiah=n=>'Rp'+n.toLocaleString('id-ID');
 return ' Estimasi saja (bukan tagihan): subtotal '+rupiah(known_subtotal)+(unknown_count?' + '+unknown_count+' penawaran tertunda':'')+'; biaya layanan '+rupiah(service_fee)+'; total '+(total===null?'menunggu penawaran':rupiah(total))+'.';
}

// Storefront handoff accepts only public identifiers and bounded quantities. It is not an order or price quote.
export function parseStorefrontCart(raw){
 if(typeof raw!=='string'||raw.length>2048)return null;
 try{const rows=JSON.parse(raw);if(!Array.isArray(rows)||rows.length<1||rows.length>5||rows.some(x=>!x||Object.keys(x).length!==2||typeof x.service_id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(x.service_id)||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>99)||new Set(rows.map(x=>x.service_id)).size!==rows.length)return null;return rows.map(x=>({service_id:x.service_id,quantity:x.quantity}));}catch{return null;}
}

// Only explicit public portal destinations are eligible for a storefront deep link.
export function storefrontView(value){return ['orders','account','shop','notifications','support'].includes(value)?value:null;}

// Compare by service and quantity, independent of display order; never merge quantities implicitly.
export function sameStorefrontCart(a,b){return a.length===b.length&&a.every(x=>b.some(y=>y.service_id===x.service_id&&y.quantity===x.quantity));}
