// Anonymous public endpoints have no authenticated actor; use the edge-supplied
// connecting IP only as a hashed, ephemeral limiter key. No D1 storage or logging.
const lanes={'/api/catalog':'PUBLIC_CATALOG_LIMIT','/api/auth/login':'PUBLIC_OAUTH_LIMIT','/api/auth/callback':'PUBLIC_OAUTH_LIMIT'};
function refusal(status){
 return Response.json({error:status===429?'Terlalu banyak permintaan. Coba lagi nanti.':'Pembatas permintaan sementara tidak tersedia.'},{status,headers:{'cache-control':'no-store','retry-after':'60','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
}
export async function publicRateLimit(request,env,path,method){
 if(method!=='GET'||!Object.hasOwn(lanes,path))return null;
 const binding=env[lanes[path]],required=env.PUBLIC_RATE_LIMIT_REQUIRED==='true';
 if(!binding||typeof binding.limit!=='function')return required?refusal(503):null;
 const ip=request.headers.get('cf-connecting-ip')||'';
 if(!/^[0-9a-f:.]{2,64}$/i.test(ip))return refusal(503);
 try{
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('nexoraid:v4:'+ip.toLowerCase())));
  const key=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
  const result=await binding.limit({key});
  if(result?.success===true)return null;
  return refusal(result?.success===false?429:503);
 }catch{return refusal(503);}
}
