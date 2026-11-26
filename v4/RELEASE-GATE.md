# NEXORAID V4 release gate

Do not declare stable merely because a GitHub Pages deployment succeeds.

## Before production
- Confirm the exact target Worker and D1 database identity; never create a replacement database during redeploy.
- Run npm test and build, browser regression for all five roles, Wrangler dry run.
- Export existing D1 database using v4/scripts/backup.sh in a trusted terminal; keep the private backup encrypted at rest and off-repo. Record checksum. The export may contain session hashes, customer information and private attachments.
- Verify restore in an isolated test database, never in production; validate row counts, foreign keys, money totals, attachment bytes, and invalidate copied sessions. No automated restore-to-production script is provided.
- Confirm the original NEXORAID STORE static QRIS scans to the correct merchant. Static QRIS and owner-only manual reconciliation are the approved final payment workflow; a payment gateway, dynamic QRIS or provider API is not required. Test invoice amount, receipt submission, owner verification, duplicate reference rejection and refund recording.
- Keep legacy HYPEBOTX history read-only; reconcile separately, never import or backfill it into the new ledger. Do not invent paid transactions or double-credit staff.
- Confirm completed-refund owner-borne policy, seller policy, and supplier/investor accounting rules.

## After deployment
- /api/health must return HTTP 200 with database_ready, schema >= 12 and release matching deployed Git SHA.
- Test owner, management, worker, seller and customer sessions in controlled accounts, including unauthorized paths.
- Test quote, payment, claim, evidence, completion, payout, refund, notification, checkout retry and attachment isolation without actual money transfers.
- Verify bot /weborder health and test bridge with a test order; verify music separately.
- Confirm monitoring, backups, recovery drills and load/security testing.
- If a release fails, preserve database and stop new transactions. Roll back Worker only to a schema-compatible deployment; never apply destructive down migrations or restore over live data without explicit approval and reconciliation.

## Remaining external dependencies
Cloudflare environment configuration, isolated production-like restore and live role checks. CI cannot substitute for these. 

## Ticket queue rollout
- Keep WEB_TICKET_ENABLED=false until both candidates pass integration and live permissions checks. A distinct machine key is required; never reuse or expose the actor key.
- Validate membership before checkout, crash-safe channel and message recovery, duplicate prevention, and terminal-order closure. This remains an open gate.

## Mandatory membership verification
- Before promoting, configure DISCORD_MEMBERSHIP_BOT_TOKEN only in Cloudflare Worker secrets (never commit or disclose it); verify API access to the exact guild, member and non-member cases, rate limits and transport failures. Both create paths fail closed if unavailable; already committed idempotent requests remain retrievable. Verify the production Worker secret persists through deployment. Do not deploy this candidate without the credential and controlled staging checks.
- Migration 0013 permits owner-recorded full refund of a paid in-progress order. No automatic transfer, no settlement on cancelled orders. Test actual review flow with dummy transactions only.
