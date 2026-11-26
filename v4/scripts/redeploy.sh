#!/usr/bin/env bash
set -Eeuo pipefail
set +x
cd "$(git rev-parse --show-toplevel)"
[[ "$(git branch --show-current)" == main ]] || { echo 'Gunakan branch main.' >&2; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo 'Simpan perubahan lokal dahulu.' >&2; exit 1; }
CONFIG=v4/.generated/wrangler.json
[[ -f "$CONFIG" ]] || { echo 'Config sebelumnya tidak tersedia. Jalankan bash v4/scripts/setup.sh.' >&2; exit 1; }
export WRANGLER_SEND_METRICS=false
export PUBLIC_ORIGIN="$(node -e 'const c=require("./"+process.argv[1]);if(c.name!=="nexoraid-v4"||!/^https:\/\/nexoraid-v4\.nexoraid\.workers\.dev$/.test(c.vars?.PUBLIC_ORIGIN||"")||!c.d1_databases?.some(d=>d.binding==="DB"&&d.database_name==="nexoraid-v4"))process.exit(1);console.log(c.vars.PUBLIC_ORIGIN)' "$CONFIG")"
export RELEASE_SHA="$(git rev-parse HEAD)"
node -e 'const fs=require("node:fs");const p=process.argv[1],c=JSON.parse(fs.readFileSync(p));c.vars.RELEASE_SHA=process.env.RELEASE_SHA;fs.writeFileSync(p,JSON.stringify(c,null,2))' "$CONFIG"
echo "Deploy existing Worker: $PUBLIC_ORIGIN ($RELEASE_SHA)"
npm test
bash v4/scripts/release-security.sh
SITE_URL="$PUBLIC_ORIGIN" npm run build
for file in portal.html portal.css portal.mjs portal-ui.mjs portal-core.mjs portal.webmanifest portal-sw.js portal-offline.html; do cp "v4/$file" "dist/$file"; done
npm install --no-save --package-lock=false playwright@1.56.1
npx playwright install chromium
node tests/browser.mjs
npx --yes wrangler@4.168.0 whoami
npx --yes wrangler@4.168.0 deploy --dry-run --config "$CONFIG"
bash v4/scripts/backup.sh
node v4/scripts/financial-migration-gate.mjs
npx --yes wrangler@4.168.0 d1 migrations apply nexoraid-v4 --remote --config "$CONFIG"
npx --yes wrangler@4.168.0 deploy --config "$CONFIG"
node v4/scripts/verify.mjs
echo "Portal: $PUBLIC_ORIGIN/portal.html"
