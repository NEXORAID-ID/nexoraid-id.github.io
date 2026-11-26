#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077
cd "$(git rev-parse --show-toplevel)"
CONFIG=v4/.generated/wrangler.json
[[ -f "$CONFIG" ]] || { echo 'Missing existing configuration.' >&2; exit 1; }
node -e 'const c=require("./"+process.argv[1]);if(c.name!=="nexoraid-v4"||!c.d1_databases?.some(d=>d.binding==="DB"&&d.database_name==="nexoraid-v4"&&/^[a-f0-9-]{36}$/i.test(d.database_id)))process.exit(1)' "$CONFIG"
# Keep financial and customer data OUTSIDE git, CI artifacts and public dist.
dest="$HOME/.local/share/nexoraid-private-backups"
mkdir -p "$dest"
chmod 700 "$dest"
file="$dest/nexoraid-v4-$(date -u +%Y%m%dT%H%M%SZ)-$$.sql"
trap 'rm -f -- "$file.partial"' EXIT
npx --yes wrangler@4 d1 export nexoraid-v4 --remote --config "$CONFIG" --output "$file.partial"
[[ -s "$file.partial" ]] || { echo 'Backup empty; abort.' >&2; exit 1; }
mv "$file.partial" "$file"
chmod 600 "$file"
sha256sum "$file" > "$file.sha256"
chmod 600 "$file.sha256"
echo "Private SQL backup saved: $file (restore verification still required)"
