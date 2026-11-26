#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077
STEP='Persiapan'
trap 'rc=$?; printf "\nERROR: %s gagal (baris %s, exit %s).\n" "$STEP" "$LINENO" "$rc" >&2; exit "$rc"' ERR
cd "$(git rev-parse --show-toplevel)"
[[ -t 0 && -t 1 ]] || { echo 'Jalankan di terminal interaktif.' >&2; exit 1; }
command -v node >/dev/null && command -v npm >/dev/null || { echo 'Node.js 22+ diperlukan.' >&2; exit 1; }
if ! node -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit(major>22||major===22&&minor>=13?0:1)'; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    set +u
    . "$NVM_DIR/nvm.sh"
    nvm install 22
    nvm use 22
    set -u
  else
    echo 'Node.js 22.13+ diperlukan. Pilih Node 22 di Codespaces atau pasang melalui nvm.' >&2
    exit 1
  fi
fi
echo "Node: $(node --version)"
[[ "$(git branch --show-current)" == main ]] || { echo 'Gunakan branch main.' >&2; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo 'Ada perubahan lokal; simpan dahulu.' >&2; exit 1; }
export WRANGLER_SEND_METRICS=false
wr() { npx --yes wrangler@4 "$@"; }
ask() { local dest="$1" prompt="$2" value; local default="${!dest:-}"; if [[ -n "$default" ]]; then read -r -p "$prompt [$default]: " value; else read -r -p "$prompt: " value; fi; printf -v "$dest" '%s' "${value:-$default}"; }
echo 'NEXORAID V4 — setup Cloudflare (staging dahulu).'
echo 'Tidak mengaktifkan paket berbayar. Periksa kuota dan akun tujuan sendiri.'
echo 'Validasi source terlebih dahulu...'
STEP='Unit tests'
npm test
STEP='Wrangler CLI'
wr --version
STEP='Cloudflare authorization'
if ! wr whoami --json >/dev/null; then
  wr login --device --browser=false
fi
wr whoami
echo 'Pilih Account ID dari tabel whoami di atas (32 karakter hex).'
ask CLOUDFLARE_ACCOUNT_ID 'Cloudflare Account ID'
[[ "$CLOUDFLARE_ACCOUNT_ID" =~ ^[a-fA-F0-9]{32}$ ]] || { echo 'Account ID tidak valid.' >&2; exit 1; }
export CLOUDFLARE_ACCOUNT_ID
STEP='Cloudflare account verification'
wr whoami --account "$CLOUDFLARE_ACCOUNT_ID"
echo 'Gunakan subdomain workers.dev yang telah didaftarkan pada Cloudflare Workers.'
ask SUBDOMAIN 'Subdomain workers.dev (tanpa .workers.dev)'
[[ "$SUBDOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]] || { echo 'Subdomain tidak valid.' >&2; exit 1; }
export PUBLIC_ORIGIN="https://nexoraid-v4.$SUBDOMAIN.workers.dev"
echo "URL: $PUBLIC_ORIGIN"
echo "Discord Developer Portal: https://discord.com/developers/applications"
echo "Tambahkan OAuth2 Redirect URI: $PUBLIC_ORIGIN/api/auth/callback"
ask OWNER_DISCORD_ID 'Discord User ID owner'
ask DISCORD_CLIENT_ID 'Discord Application/Client ID'
[[ "$OWNER_DISCORD_ID" =~ ^[0-9]{17,20}$ && "$DISCORD_CLIENT_ID" =~ ^[0-9]{17,20}$ ]] || { echo 'ID Discord tidak valid.' >&2; exit 1; }
export OWNER_DISCORD_ID DISCORD_CLIENT_ID
echo "Akun Cloudflare: $CLOUDFLARE_ACCOUNT_ID"
echo 'Database: nexoraid-v4; Worker: nexoraid-v4. Database bernama sama akan digunakan kembali.'
echo 'Jika Worker tersebut sudah ada, kode Worker akan diperbarui. Tidak ada data yang dihapus.'
ask CONFIRM 'Ketik DEPLOY untuk menyetujui perubahan cloud ini'
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
STEP='D1 provisioning'
D1_DATABASE_ID="$(list_db)"
if [[ -z "$D1_DATABASE_ID" ]]; then
  wr d1 create nexoraid-v4 --update-config=false
  D1_DATABASE_ID="$(list_db)"
fi
[[ "$D1_DATABASE_ID" =~ ^[a-fA-F0-9-]{36}$ ]] || { echo 'Database UUID tidak ditemukan. Periksa dashboard dan jalankan ulang.' >&2; exit 1; }
export D1_DATABASE_ID
STEP='Build static storefront'
SITE_URL="$PUBLIC_ORIGIN" npm run build
node v4/scripts/prepare.mjs
CONFIG=v4/.generated/wrangler.json
read -r -s -p 'Discord Client Secret (input disembunyikan): ' DISCORD_SECRET
echo
[[ -n "$DISCORD_SECRET" ]] || { echo 'Secret wajib diisi.' >&2; exit 1; }
STEP='Prepare OAuth secret'
SECRET_FILE="$(mktemp --suffix=.json)"
trap 'rm -f -- "$SECRET_FILE"; unset DISCORD_SECRET' EXIT
printf '%s' "$DISCORD_SECRET" | node --input-type=module -e 'let s="";for await(const c of process.stdin)s+=c;process.stdout.write(JSON.stringify({DISCORD_CLIENT_SECRET:s}));' > "$SECRET_FILE"
unset DISCORD_SECRET
STEP='Worker dry-run'
wr deploy --dry-run --config "$CONFIG" --secrets-file "$SECRET_FILE"
STEP='D1 migrations'
wr d1 migrations apply nexoraid-v4 --remote --config "$CONFIG"
STEP='Worker deployment'
wr deploy --config "$CONFIG" --secrets-file "$SECRET_FILE"
rm -f -- "$SECRET_FILE"
STEP='Live health check'
curl --fail --silent --show-error --retry 5 "$PUBLIC_ORIGIN/api/health" | node --input-type=module -e 'let s="";for await(const c of process.stdin)s+=c;const h=JSON.parse(s);if(!h.database_configured||!h.login_configured)throw Error("Health check failed");console.log("API health: OK");'
curl --fail --silent --show-error "$PUBLIC_ORIGIN/" -o /dev/null
curl --fail --silent --show-error "$PUBLIC_ORIGIN/portal.html" -o /dev/null
echo "Portal staging: $PUBLIC_ORIGIN/portal.html"
echo 'Uji login Discord, order uji, dan role sebelum digunakan pelanggan. Belum final stable.'
