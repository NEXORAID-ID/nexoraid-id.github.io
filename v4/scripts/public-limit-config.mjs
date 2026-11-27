import {createHash} from 'node:crypto';
// Stable per-database namespaces, separated for catalog and combined OAuth.
// Verify namespace uniqueness against other Workers in the target account.
export function configurePublicLimits(config){
 const id=config.d1_databases?.find(x=>x.binding==='DB')?.database_id;
 if(!/^[a-f0-9-]{36}$/i.test(id||''))throw Error('Missing database identity for limiter namespace');
 const base=Number.parseInt(createHash('sha256').update('nexoraid-public-limits:'+id.toLowerCase()).digest('hex').slice(0,7),16)*2+100;
 const names=new Set(['PUBLIC_CATALOG_LIMIT','PUBLIC_OAUTH_LIMIT']);
 config.ratelimits=[...(config.ratelimits||[]).filter(x=>!names.has(x.name)),{name:'PUBLIC_CATALOG_LIMIT',namespace_id:String(base),simple:{limit:120,period:60}},{name:'PUBLIC_OAUTH_LIMIT',namespace_id:String(base+1),simple:{limit:20,period:60}}];
 if(new Set(config.ratelimits.map(x=>x.namespace_id)).size!==config.ratelimits.length)throw Error('Duplicate rate-limit namespace');
 config.vars={...config.vars,PUBLIC_RATE_LIMIT_REQUIRED:'true'};
 return config;
}
