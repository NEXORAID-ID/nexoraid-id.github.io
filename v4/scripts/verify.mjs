import {verifyProductionMigrations,verifyReleaseHealth,requireProductionOrigin} from './deployment-verification.mjs';
const origin=requireProductionOrigin(process.env.PUBLIC_ORIGIN);
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
const expected=process.env.RELEASE_SHA||process.env.GITHUB_SHA;
const appliedCount=await verifyProductionMigrations();
console.log('Exact production migration inventory verified: '+appliedCount+' migrations');
await check('/api/health',async r=>{
 const state=verifyReleaseHealth(await r.json(),expected);
 if(state.runtime_schema!==appliedCount)throw Error('Runtime schema differs from exact migration inventory');
 console.log('Release readiness: '+JSON.stringify(state));
});
await check('/api/catalog',async r=>{const c=await r.json();if(!Array.isArray(c.services)||!c.services.length)throw Error('Empty catalog');});
for(const p of ['/','/login.html','/portal.html'])await check(p,async r=>{if(!r.headers.get('content-type')?.includes('text/html'))throw Error('Not HTML');});
await check('/api/auth/login',async r=>{const url=new URL(r.headers.get('location'));if(url.hostname!=='discord.com'||url.searchParams.get('redirect_uri')!==origin+'/api/auth/callback'||url.searchParams.get('code_challenge_method')!=='S256'||!url.searchParams.get('code_challenge')||!url.searchParams.get('scope')?.split(' ').includes('guilds.members.read'))throw Error('Wrong OAuth redirect');},303,{'Sec-Fetch-Mode':'navigate'});
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

 // Verify membership from the Worker runtime (not merely the GitHub runner).
 // A fixed result code is safe to log; never emit upstream responses or secrets.
 const membership=await fetch(origin+'/api/bot/health?membership=1',{headers:{authorization:'Bearer '+process.env.NEXORAID_BOT_API_KEY,'x-discord-user-id':process.env.OWNER_DISCORD_ID,'x-discord-guild-id':'1487728359482851348'},redirect:'error',signal:AbortSignal.timeout(20000)});
 const checkMembership=await membership.json().catch(()=>null);
 const knownReasons=['VERIFIED','NOT_MEMBER','GUILD_LOOKUP_FAILED','UNAUTHORIZED','FORBIDDEN','RATE_LIMITED','UPSTREAM_ERROR','IDENTITY_MISMATCH','INVALID_RESPONSE','NOT_CONFIGURED','TRANSPORT','UNEXPECTED_REDIRECT'];
 const safeReason=knownReasons.includes(checkMembership?.reason)?checkMembership.reason:'UNKNOWN';
 console.log('Worker membership diagnostic: '+JSON.stringify({ok:membership.ok&&checkMembership?.ok===true,reason:safeReason,upstream_status:Number.isInteger(checkMembership?.upstream_status)?checkMembership.upstream_status:0}));
 if(!membership.ok||checkMembership?.ok!==true)throw Error('Worker membership verification failed: '+safeReason);
