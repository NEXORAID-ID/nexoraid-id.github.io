const rentalIds=new Set(['cherax-rental-standard','cherax-rental-premium']);
// No live stock response means no rental availability, even if the baseline has old data.
export function offlineCatalog(baseline){return baseline.map(s=>rentalIds.has(s.id)?{...s,availability:'unconfigured'}:s);}
// Preserve source descriptions and package contents; live price overrides replace stale monetary rows.
export function mergeLiveCatalog(baseline,response){
 if(response?.catalog_revision!==1||response.baseline===true||!Array.isArray(response.services)||!response.services.length)throw Error('Live catalogue unavailable');
 const byId=new Map(response.services.map(s=>[s.id,s]));
 if(byId.size!==response.services.length)throw Error('Duplicate catalogue service');
 return baseline.flatMap(s=>{
  const live=byId.get(s.id);
  if(!live||live.enabled!==true)return [];
  if(typeof live.price!=='string'||live.price.length>100)throw Error('Invalid live price');
  const policy=live.policy?{policy:live.policy,base_unit_amount:live.base_unit_amount}:{};
  if(rentalIds.has(s.id))policy.availability=['available','sold_out','unconfigured'].includes(live.availability)?live.availability:'unconfigured';
  const children=baseline.filter(v=>v.parent_id===s.id);
  if(children.length){
   const byLabel=new Map(children.map(v=>[v.details[0][0],v]));
   const details=s.details.flatMap(([label,value])=>{
    const child=byLabel.get(label);if(!child)return [[label,value]];
    const active=byId.get(child.id);if(!active||active.enabled!==true)return [];
    if(typeof active.price!=='string'||active.price.length>100)throw Error('Invalid variant price');
    return [[label,active.price+value.replace(/^Rp\s*[\d.]+/i,'')]];
   });
   return [{...s,...policy,price:live.price,details}];
  }
  if(live.price===s.price)return [{...s,...policy}];
  return [{...s,...policy,price:live.price,details:[['Harga portal saat ini',live.price],...s.details.filter(([k,v])=>!/Rp\s*[\d.]/i.test(String(k)+' '+String(v)))]}];
 });
}
export async function getLiveCatalog(baseline,location,fetcher=fetch){
 const hosts=['nexoraid-v4.nexoraid.workers.dev','nexoraid-id.github.io'];
 if(!hosts.includes(location.hostname))return {services:offlineCatalog(baseline),live:false,production:false};
 try{
  const r=await fetcher('https://nexoraid-v4.nexoraid.workers.dev/api/catalog',{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(3500)});
  if(!r.ok)throw Error('Catalogue offline');
  return {services:mergeLiveCatalog(baseline,await r.json()),live:true,production:true};
 }catch{return {services:offlineCatalog(baseline),live:false,production:true};}
}
