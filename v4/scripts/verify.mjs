const origin=process.env.PUBLIC_ORIGIN;
if(!origin||!/^https:\/\/[a-z0-9.-]+$/i.test(origin))throw Error('PUBLIC_ORIGIN required');
async function check(path,validate,expected=200,headers={}){
 let last;
 for(let i=0;i<6;i++){
  try{
   const response=await fetch(origin+path,{redirect:'manual',headers,signal:AbortSignal.timeout(15000)});
   if(response.status!==expected)throw Error('HTTP '+response.status+'; content-type='+response.headers.get('content-type'));
   await validate(response);console.log(path+' OK ('+expected+')');return;
  }catch(e){last=e;if(i<5)await new Promise(r=>setTimeout(r,3000));}
 }
 throw Error(path+': '+last.message);
}
await check('/api/health',async r=>{const h=await r.json();if(h.status!=='ok'||!h.database_ready||!h.login_configured||h.schema<15)throw Error('Database or schema not ready');const expected=process.env.RELEASE_SHA||process.env.GITHUB_SHA;if(expected&&h.release!==expected)throw Error('Wrong release: '+h.release);});
await check('/api/catalog',async r=>{const c=await r.json();if(!Array.isArray(c.services)||!c.services.length)throw Error('Empty catalog');});
for(const p of ['/','/login.html','/portal.html'])await check(p,async r=>{if(!r.headers.get('content-type')?.includes('text/html'))throw Error('Not HTML');});
await check('/api/auth/login',async r=>{const url=new URL(r.headers.get('location'));if(url.hostname!=='discord.com'||url.searchParams.get('redirect_uri')!==origin+'/api/auth/callback')throw Error('Wrong OAuth redirect');},303,{'Sec-Fetch-Mode':'navigate'});
await check('/api/me',async r=>{if(!(await r.json()).error)throw Error('Expected auth rejection');},401);
