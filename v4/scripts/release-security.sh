#!/usr/bin/env bash
set -euo pipefail
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
cd "$work"
printf '%s\n' '{"name":"nexoraid-release-tools","version":"1.0.0","private":true,"dependencies":{"wrangler":"4.168.0","playwright":"1.56.1"}}' > package.json
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm audit --omit=dev --audit-level=high
