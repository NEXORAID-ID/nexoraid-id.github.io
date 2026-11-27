// Read-only catalog release evidence; never writes customer data or creates orders.
export function inspectCatalog(data,baseline,at=Math.floor(Date.now()/1000)){
 const result={contract_ok:false,services:0,variants:0,missing_known:0,unknown_ids:0,warranty_configured:0,warranty_missing:0,active_promos:0,invalid_promos:0,rental:{},top_up_orderable:0,top_up_placeholder:false,errors:[]};
 if(data?.catalog_revision!==1||data.baseline===true||!Array.isArray(data.services)||!data.services.length){result.errors.push('live_catalog_unavailable');return result;}
 const ids=new Set(),known=new Map(baseline.map(s=>[s.id,s]));
 for(const s of data.services){
  if(!s||typeof s.id!=='string'||!/^[a-z0-9-]{1,100}$/.test(s.id)||ids.has(s.id)||s.enabled!==true||typeof s.name!=='string'||typeof s.price!=='string'||!s.price.trim()){result.errors.push('invalid_or_duplicate_service');continue;}
  ids.add(s.id);result.services++;
  const base=known.get(s.id);if(!base)result.unknown_ids++;
  if(s.parent_id)result.variants++;
  if(s.id==='top-up-game')result.top_up_placeholder=s.orderable===false;
  if((s.parent_id==='top-up-game'||s.id.startsWith('top-up-game-'))&&s.orderable!==false&&Number.isSafeInteger(s.unit_amount)&&s.unit_amount>0)result.top_up_orderable++;
  if(base?.orderable===false&&s.orderable!==false)result.errors.push('informational_service_orderable');
  if(s.orderable!==false){
   const p=s.policy,w=p?.warranty_days;
   if(Number.isInteger(w)&&w>=0&&w<=3650&&typeof p.warranty_terms==='string'&&p.warranty_terms.trim().length>=4)result.warranty_configured++;else result.warranty_missing++;
   const promo=p?.promo;
   if(promo){
    const valid=promo.legacy===false&&Number.isSafeInteger(promo.start)&&Number.isSafeInteger(promo.end)&&promo.start<promo.end&&Number.isInteger(promo.percent)&&promo.percent>=1&&promo.percent<=90&&Number.isInteger(promo.min_quantity)&&promo.min_quantity>=1&&promo.min_quantity<=99&&typeof promo.terms==='string'&&promo.terms.trim().length>=4;
    if(!valid)result.invalid_promos++;else if(promo.start<=at&&at<promo.end)result.active_promos++;
   }
  }
  if(['cherax-rental-standard','cherax-rental-premium'].includes(s.id)){
   result.rental[s.id]=['available','sold_out','unconfigured'].includes(s.availability)?s.availability:'unknown';
   if(result.rental[s.id]==='unknown')result.errors.push('missing_rental_status');
  }
 }
 result.missing_known=baseline.filter(s=>!ids.has(s.id)).length;
 for(const id of ['cherax-rental-standard','cherax-rental-premium'])if(!Object.hasOwn(result.rental,id))result.rental[id]='not_listed';
 result.contract_ok=result.errors.length===0;
 return result;
}
