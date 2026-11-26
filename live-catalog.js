// Preserve source descriptions and package contents; live price overrides replace stale monetary rows.
export function mergeLiveCatalog(baseline,response){
 if(response?.catalog_revision!==1||!Array.isArray(response.services))throw Error('Live catalogue unavailable');
 const byId=new Map(response.services.map(s=>[s.id,s]));
 return baseline.flatMap(s=>{
  const live=byId.get(s.id);
  if(!live||live.enabled!==true)return [];
  if(typeof live.price!=='string'||live.price.length>100)throw Error('Invalid live price');
  if(live.price===s.price)return [s];
  return [{...s,price:live.price,details:[['Harga portal saat ini',live.price],...s.details.filter(([k,v])=>!/Rp\s*[\d.]/i.test(String(k)+' '+String(v)))]}];
 });
}
export async function getLiveCatalog(baseline,location,fetcher=fetch){
 const hosts=['nexoraid-v4.nexoraid.workers.dev','nexoraid-id.github.io'];
 if(!hosts.includes(location.hostname))return {services:baseline,live:false,production:false};
 try{
  const r=await fetcher('https://nexoraid-v4.nexoraid.workers.dev/api/catalog',{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(3500)});
  if(!r.ok)throw Error('Catalogue offline');
  return {services:mergeLiveCatalog(baseline,await r.json()),live:true,production:true};
 }catch{return {services:baseline,live:false,production:true};}
}
