#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077
cd "$(git rev-parse --show-toplevel)"
CONFIG=v4/.generated/wrangler.json
[[ -f "$CONFIG" ]] || { echo 'Missing existing configuration.' >&2; exit 1; }
: "${NEXORAID_BACKUP_AGE_RECIPIENT:?Set trusted age PUBLIC recipient; never supply private key to CI}"
command -v age >/dev/null || { echo 'Install age before backup.' >&2; exit 1; }
node -e 'const c=require("./"+process.argv[1]);if(c.name!=="nexoraid-v4"||!c.d1_databases?.some(d=>d.binding==="DB"&&d.database_name==="nexoraid-v4"&&/^[a-f0-9-]{36}$/i.test(d.database_id)))process.exit(1)' "$CONFIG"
dest="${NEXORAID_BACKUP_DIR:-$HOME/.local/share/nexoraid-private-backups}"
mkdir -p "$dest"
dest="$(realpath "$dest")"
root="$(git rev-parse --show-toplevel)"
case "$dest/" in "$root/"*) echo 'Backup destination must be outside repository.' >&2; exit 1;; esac
chmod 700 "$dest"
work="$(mktemp -d)"
file="$dest/nexoraid-v4-$(date -u +%Y%m%dT%H%M%SZ)-$$.sql.age"
trap 'rm -rf -- "$work"; rm -f -- "$file.partial"' EXIT
npx --yes wrangler@4.168.0 d1 export nexoraid-v4 --remote --config "$CONFIG" --output "$work/backup.sql"
[[ -s "$work/backup.sql" ]] || { echo 'Backup empty; abort.' >&2; exit 1; }
age -r "$NEXORAID_BACKUP_AGE_RECIPIENT" -o "$file.partial" "$work/backup.sql"
[[ -s "$file.partial" ]] || exit 1
mv "$file.partial" "$file"
chmod 600 "$file"
(cd "$dest"; sha256sum "$(basename "$file")" > "$(basename "$file").sha256")
echo "Encrypted backup saved: $file (off-device copy and isolated restore still required)"
