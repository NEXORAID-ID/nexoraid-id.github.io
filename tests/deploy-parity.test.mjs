import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('all authorized deployment routes pin Wrangler and gate migrations before remote mutation',async()=>{
 for(const p of ['v4/scripts/setup.sh','v4/scripts/redeploy.sh','.github/workflows/cloudflare-v4.yml']){
  const s=await read(p);
  assert.ok(!/wrangler@4(?:\s|["']|$)/m.test(s),p);
  const gate=s.indexOf('node v4/scripts/financial-migration-gate.mjs');
  const migrate=s.indexOf('d1 migrations apply nexoraid-v4 --remote');
  assert.ok(gate>=0&&migrate>gate,p);
  assert.ok(s.indexOf('deploy --dry-run')>=0&&s.indexOf('deploy --dry-run')<migrate,p);
  assert.ok(s.indexOf('node tests/browser.mjs')>=0&&s.indexOf('node tests/browser.mjs')<migrate,p);
  if(p.endsWith('.sh'))assert.equal(spawnSync('bash',['-n',new URL('../'+p,import.meta.url).pathname]).status,0,p);
 }
});
test('manual redeploy copies every portal PWA asset',async()=>{
 const s=await read('v4/scripts/redeploy.sh');
 for(const p of ['portal.html','portal.css','portal.mjs','portal-ui.mjs','portal.webmanifest','portal-sw.js','portal-offline.html'])assert.ok(s.includes(p),p);
});
