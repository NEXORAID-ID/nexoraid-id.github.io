#!/usr/bin/env bash
# Run only in an authorized private terminal; never in public CI.
set -euo pipefail
umask 077
test -t 1 || { echo "Use an interactive private terminal." >&2; exit 1; }
root="$(git rev-parse --show-toplevel)"
test "$(git -C "$root" rev-parse --is-shallow-repository)" = false || {
  echo "Full-depth clone required; fetch authorized refs first." >&2; exit 1;
}
image=ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
mkdir "$work/config" "$work/report"
printf '[extend]\nuseDefault = true\n' > "$work/config/gitleaks.toml"
touch "$work/config/.gitleaksignore"
docker pull "$image"
rc=0
docker run --rm --network none --read-only --tmpfs /tmp \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -e GIT_CONFIG_COUNT=1 \
  -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0=/repo \
  -v "$root:/repo:ro" -v "$work/config:/scan-config:ro" -v "$work/report:/reports" \
  "$image" git --config /scan-config/gitleaks.toml \
  --gitleaks-ignore-path /scan-config/.gitleaksignore \
  --ignore-gitleaks-allow --redact=100 --exit-code 42 \
  --report-format json --report-path /reports/findings.json \
  --log-opts="--all --full-history -m" /repo > "$work/scan.log" 2>&1 || rc=$?
case "$rc" in
  0) echo "No findings in fetched history. Review other exposures separately."; exit 0 ;;
  42) ;;
  *) echo "Scanner failed (exit $rc); no release clearance." >&2; exit 1 ;;
esac
# Extract only metadata. Never emit Secret, Match, Message, raw JSON or scanner logs.
out="$(mktemp "$HOME/nexoraid-secret-triage.XXXXXX.json")"
if ! python3 - "$work/report/findings.json" "$out" <<'PY'
import collections, json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    rows=json.load(f)
if not isinstance(rows,list) or not rows:
    raise ValueError("Expected nonempty findings")
keys=("RuleID","File","Commit","StartLine","EndLine","Fingerprint")
metadata=[{k:r.get(k) for k in keys} for r in rows]
with open(sys.argv[2],"w",encoding="utf-8") as f:
    json.dump({"count":len(rows),"rules":dict(collections.Counter(str(r.get("RuleID")) for r in rows)),"locations":metadata},f,indent=2)
print("Potential findings:",len(rows))
PY
then
  rm -f -- "$out"
  echo "Could not produce safe metadata report; release remains blocked." >&2
  exit 1
fi
echo "Private metadata report: $out"
echo "Review privately, revoke confirmed exposed credentials, and record sanitized resolution evidence. Do not upload the report."
exit 42
