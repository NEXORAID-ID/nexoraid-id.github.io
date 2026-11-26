#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077
cd "$(git rev-parse --show-toplevel)"
[[ -t 0 && -t 1 ]] || { echo 'Jalankan di terminal interaktif.' >&2; exit 1; }
command -v node >/dev/null && command -v npm >/dev/null || { echo 'Node.js 22+ diperlukan.' >&2; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)'
[[ "$(git branch --show-current)" == main ]] || { echo 'Gunakan branch main.' >&2; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo 'Ada perubahan lokal; simpan dahulu.' >&2; exit 1; }
export WRANGLER_SEND_METRICS=false
wr() { npx --yes wrangler@4 "$@"; }
ask() { local dest="$1"; shift; read -r -p "$*" "$dest"; }
echo 'NEXORAID V4 — setup Cloudflare (staging dahulu).'
echo 'Tidak mengaktifkan paket berbayar. Periksa kuota dan akun tujuan sendiri.'
echo 'Validasi source terlebih dahulu...'
npm test
if ! wr whoami; then
  wr login --device --browser=false
  wr whoami
fi
echo 'Pilih Account ID dari tabel whoami di atas (32 karakter hex).'
ask CLOUDFLARE_ACCOUNT_ID 'Cloudflare Account ID: '
[[ "$CLOUDFLARE_ACCOUNT_ID" =~ ^[a-fA-F0-9]{32}$ ]] || { echo 'Account ID tidak valid.' >&2; exit 1; }
export CLOUDFLARE_ACCOUNT_ID
echo 'Gunakan subdomain workers.dev yang telah didaftarkan pada Cloudflare Workers.'
ask SUBDOMAIN 'Subdomain workers.dev (tanpa .workers.dev): '
[[ "$SUBDOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]] || { echo 'Subdomain tidak valid.' >&2; exit 1; }
export PUBLIC_ORIGIN="https://nexoraid-v4.$SUBDOMAIN.workers.dev"
echo "URL: $PUBLIC_ORIGIN"
echo "Discord Developer Portal: https://discord.com/developers/applications"
echo "Tambahkan OAuth2 Redirect URI: $PUBLIC_ORIGIN/api/auth/callback"
ask OWNER_DISCORD_ID 'Discord User ID owner: '
ask DISCORD_CLIENT_ID 'Discord Application/Client ID: '
[[ "$OWNER_DISCORD_ID" =~ ^[0-9]{17,20}$ && "$DISCORD_CLIENT_ID" =~ ^[0-9]{17,20}$ ]] || { echo 'ID Discord tidak valid.' >&2; exit 1; }
export OWNER_DISCORD_ID DISCORD_CLIENT_ID
echo "Akun Cloudflare: $CLOUDFLARE_ACCOUNT_ID"
echo 'Database: nexoraid-v4; Worker: nexoraid-v4. Database bernama sama akan digunakan kembali.'
echo 'Jika Worker tersebut sudah ada, kode Worker akan diperbarui. Tidak ada data yang dihapus.'
ask CONFIRM 'Ketik DEPLOY untuk menyetujui perubahan cloud ini: '
[[ "$CONFIRM" == DEPLOY ]] || { echo 'Dibatalkan.'; exit 0; }
list_db() {
  wr d1 list --json | node --input-type=module -e '
    let s="";for await(const c of process.stdin)s+=c;
    const rows=JSON.parse(s);
    if(!Array.isArray(rows))throw Error("Unexpected D1 list");
    const match=rows.filter(x=>x.name==="nexoraid-v4");
    if(match.length>1)throw Error("Ambiguous database");
    if(match.length){const id=match[0].uuid??match[0].id;if(!/^[a-f0-9-]{36}$/i.test(id??""))throw Error("Invalid D1 UUID");console.log(id);}
  '
}
D1_DATABASE_ID="$(list_db)"
if [[ -z "$D1_DATABASE_ID" ]]; then
  wr d1 create nexoraid-v4 --update-config=false
  D1_DATABASE_ID="$(list_db)"
fi
[[ "$D1_DATABASE_ID" =~ ^[a-fA-F0-9-]{36}$ ]] || { echo 'Database UUID tidak ditemukan. Periksa dashboard dan jalankan ulang.' >&2; exit 1; }
export D1_DATABASE_ID
SITE_URL="$PUBLIC_ORIGIN" npm run build
node v4/scripts/prepare.mjs
CONFIG=v4/.generated/wrangler.json
wr deploy --dry-run --config "$CONFIG"
read -r -s -p 'Discord Client Secret (input disembunyikan): ' DISCORD_SECRET
echo
[[ -n "$DISCORD_SECRET" ]] || { echo 'Secret wajib diisi.' >&2; exit 1; }
SECRET_FILE="$(mktemp)"
trap 'rm -f -- "$SECRET_FILE"; unset DISCORD_SECRET' EXIT
printf '%s' "$DISCORD_SECRET" | node --input-type=module -e 'let s="";for await(const c of process.stdin)s+=c;process.stdout.write(JSON.stringify({DISCORD_CLIENT_SECRET:s}));' > "$SECRET_FILE"
unset DISCORD_SECRET
wr d1 migrations apply nexoraid-v4 --remote --config "$CONFIG"
wr deploy --config "$CONFIG" --secrets-file "$SECRET_FILE"
rm -f -- "$SECRET_FILE"
curl --fail --silent --show-error --retry 5 "$PUBLIC_ORIGIN/api/health" | node --input-type=module -e 'let s="";for await(const c of process.stdin)s+=c;const h=JSON.parse(s);if(!h.database_configured||!h.login_configured)throw Error("Health check failed");console.log("API health: OK");'
curl --fail --silent --show-error "$PUBLIC_ORIGIN/" -o /dev/null
curl --fail --silent --show-error "$PUBLIC_ORIGIN/portal.html" -o /dev/null
echo "Portal staging: $PUBLIC_ORIGIN/portal.html"
echo 'Uji login Discord, order uji, dan role sebelum digunakan pelanggan. Belum final stable.'
