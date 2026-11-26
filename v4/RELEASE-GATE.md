# NEXORAID V4 release gate

Do not declare stable merely because a GitHub Pages deployment succeeds.

## Before production
- Confirm the exact target Worker and D1 database identity; never create a replacement database during redeploy.
- Run npm test and build, browser regression for all four roles, Wrangler dry run.
- Export existing D1 database using v4/scripts/backup.sh in a trusted terminal; keep the private backup encrypted at rest and off-repo. Record checksum. The export may contain session hashes, customer information and private attachments.
- Verify restore in an isolated test database, never in production; validate row counts, foreign keys, money totals, attachment bytes, and invalidate copied sessions. No automated restore-to-production script is provided.
- Confirm payment provider account and QRIS scan; manual verification only until official API is configured.
- Confirm legacy HYPEBOTX orders and settlements, compare references and reconcile before importing. Do not invent paid transactions or double-credit staff.
- Confirm completed-refund owner-borne policy, seller policy, and supplier/investor accounting rules.

## After deployment
- /api/health must return HTTP 200 with database_ready, schema >= 11 and release matching deployed Git SHA.
- Test owner, management, worker and customer sessions in controlled accounts, including unauthorized paths.
- Test quote, payment, claim, evidence, completion, payout, refund, notification, checkout retry and attachment isolation without actual money transfers.
- Verify bot /weborder health and test bridge with a test order; verify music separately.
- Confirm monitoring, backups, recovery drills and load/security testing.
- If a release fails, preserve database and stop new transactions. Roll back Worker only to a schema-compatible deployment; never apply destructive down migrations or restore over live data without explicit approval and reconciliation.

## Remaining external dependencies
Cloudflare environment configuration, provider QRIS API credentials, isolated production-like restore and live role checks. CI cannot substitute for these. 
