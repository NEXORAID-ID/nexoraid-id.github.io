import production from './worker.mjs';
// Staging uses the same read-only runtime paths but has no real OAuth or bot credentials.
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method!=='GET'||!['/api/health','/api/catalog'].includes(url.pathname)||url.origin!==env.PUBLIC_ORIGIN)
   return new Response('Isolated staging: read-only smoke endpoints only',{status:403,headers:{'cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
  const response=await production.fetch(request,env,ctx);
  const headers=new Headers(response.headers);headers.set('cache-control','no-store');headers.set('x-robots-tag','noindex, nofollow');
  return new Response(response.body,{status:response.status,headers});
 }
};
