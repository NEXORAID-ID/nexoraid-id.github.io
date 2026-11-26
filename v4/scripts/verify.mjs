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
await check('/api/health',async r=>{const h=await r.json();if(h.status!=='ok'||!h.database_ready||!h.login_configured||h.schema<16)throw Error('Database or schema not ready');const expected=process.env.RELEASE_SHA||process.env.GITHUB_SHA;if(expected&&h.release!==expected)throw Error('Wrong release: '+h.release);});
await check('/api/catalog',async r=>{const c=await r.json();if(!Array.isArray(c.services)||!c.services.length)throw Error('Empty catalog');});
for(const p of ['/','/login.html','/portal.html'])await check(p,async r=>{if(!r.headers.get('content-type')?.includes('text/html'))throw Error('Not HTML');});
await check('/api/auth/login',async r=>{const url=new URL(r.headers.get('location'));if(url.hostname!=='discord.com'||url.searchParams.get('redirect_uri')!==origin+'/api/auth/callback'||url.searchParams.get('code_challenge_method')!=='S256'||!url.searchParams.get('code_challenge'))throw Error('Wrong OAuth redirect');},303,{'Sec-Fetch-Mode':'navigate'});
await check('/api/me',async r=>{if(!(await r.json()).error)throw Error('Expected auth rejection');},401);

for(const [path,key,method,body,extra] of [
 ['/api/bot/orders?probe=1',process.env.NEXORAID_BOT_API_KEY,'GET',undefined,{'x-discord-user-id':process.env.OWNER_DISCORD_ID}],
 ['/api/bot/ticket-queue',process.env.NEXORAID_TICKET_MACHINE_KEY,'POST',JSON.stringify({action:'health'}),{'content-type':'application/json'}]
]){
 if(!key)throw Error('Missing bridge verification credential');
 let passed=false,lastStatus='transport';
 for(let attempt=0;attempt<6;attempt++){
  try{
   const response=await fetch(origin+path,{method,body,headers:{authorization:'Bearer '+key,'x-discord-guild-id':'1487728359482851348',...extra},redirect:'error',signal:AbortSignal.timeout(15000)});
   lastStatus=String(response.status);const result=await response.json().catch(()=>null);
   if(response.ok&&result?.ok===true){passed=true;break;}
  }catch{}
  if(attempt<5)await new Promise(r=>setTimeout(r,3000));
 }
 if(!passed)throw Error(path+' authenticated read-only probe failed: HTTP '+lastStatus);
 console.log(path+' authenticated read-only probe OK');
}
