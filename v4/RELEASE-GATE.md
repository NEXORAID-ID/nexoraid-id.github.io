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
- /api/health must return HTTP 200 with database_ready, schema >= 18 and release matching deployed Git SHA.
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

- Cash ledger 0014 is a read-only reconciliation view with owner-attested opening cash and duplicate-reference warnings. Do not report it as a finalized general ledger; verify opening balance cut-off, cash vs noncash, double-entry/reversals, cross-ledger duplicates and real merchant reconciliation.

- Approved pricebook adds 22 fixed GTA heist method SKUs and separate Cherax rental SKUs, Joki Coding and VPN. Rental availability remains manual until atomic stock reservation is implemented; do not claim a slot is guaranteed. HyperBoostX remains free standalone, not a paid order. Do not publish top-up prices or activate Christmas promo without actual owner-supplied rates/date/inclusions.

## Additional production guard
The deployment workflow now requires distinct machine and actor credentials and a membership token in the existing cloudflare-v4 environment before migration, without printing any credential. Do not overwrite an existing actor key blindly; use the same authorized key already configured for HYPEBOTX or coordinate a controlled rotation. Ticket lease check rejects terminal orders before Discord side effects; acknowledgement rejects terminal orders. An unavoidable cancellation race after the final check may still leave an unlinked message/channel and requires owner reconciliation; never delete automatically.

## Schema 15 candidate: rental stock and investor agreement
Capacity is owner-attested independent package pools; existing obligations must be deducted, no legacy backfill. Unconfigured service stays manual. New reservations are enforced atomically, cancelled orders release and completed orders hold for 30 days after completion. Pending holds require manual review; no automatic cancellation. Investor capital requires actual receipt and signed agreement reference; existing capital must be attested before new distributions. No actual stock or agreement inferred. Production gates still apply.

## Financial migrations 0016 and newer — mandatory owner evidence
Both CI and manual redeploy run financial-migration-gate.mjs before remote migrations. It reads the actual D1 migration inventory and refuses divergent history. If no new financial migration files exist or all such migrations are already applied, routine deployment is unaffected. Otherwise it prints pending filenames and a SHA-256 digest of exact pending migration contents, then blocks unless the owner has supplied recent evidence for that exact database and migration set.

After obtaining the encrypted off-device backup, verifying its ciphertext SHA-256, independently reconciling source counts/totals and attachment checksums in an isolated restore, set the secret NEXORAID_FINANCE_BACKUP_EVIDENCE in the existing cloudflare-v4 GitHub environment (or the equivalent environment variable in the trusted manual terminal). JSON fields: database_id, migration_digest, pending_migrations (ordered array of filenames), backup_sha256 (ciphertext digest), verified_at (ISO UTC timestamp no older than 24 hours), external_encrypted_copy, isolated_restore_verified, independent_totals_matched, attachment_checksums_matched (all true only after actual checks). Never put evidence or backup contents in commits, CI logs or chat; never give CI the decryption key. Coordinate a controlled write freeze and consistent snapshot before migration. This is an owner attestation gate, not automated cryptographic verification of the remote backup or authorization to restore production. No fabricated values, no bypass. Routine schema 15 deployments do not need this new secret.

### Owner-side backup and restore helper
Use a trusted local terminal with authenticated Wrangler access, existing generated production configuration, Python 3.11+, age and the owner's existing age identity. Keep the identity offline/owner-controlled. Mount an external or off-host storage destination; never choose a repository or a public share. Coordinate a write freeze for all writers first. Fetch the intended candidate ref, then run:

```bash
python3 v4/scripts/finance-backup.py --candidate origin/main --identity /secure/owner.agekey --external-dir /mounted/private-backup --confirm-write-freeze
```

The helper compares independently queried source counts, finance totals and SHA-256 for attachment bytes before and after export/restore, verifies an encrypted copy from the destination in a temporary SQLite database, and writes NEXORAID-FINANCE-EVIDENCE.json only after checks pass. The operator must independently ensure the destination is off-host and all writes remain paused; aggregate comparisons do not prove every individual row remained unchanged. Keep earlier evidence files in a private archive; helper refuses to overwrite. It never migrates production, changes Cloudflare settings, or uploads a key or data. After owner review, use `gh secret set NEXORAID_FINANCE_BACKUP_EVIDENCE --repo NEXORAID-ID/nexoraid-id.github.io --env cloudflare-v4 < /mounted/private-backup/NEXORAID-FINANCE-EVIDENCE.json`. Every changed pending migration set requires fresh evidence for its exact filenames and contents. Fetch current main, verify inventory, and do not use evidence from a superseded candidate.

## Section C acceptance — 27 Nov 2026 WIB

Catalog PR #59 merged at `ac926e89276d6ecdc7966c36b8827d5c96637b1f`; [real isolated D1 45946803086](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45946803086) reports 23/23 checks, including concurrent last-slot reservation, missing capacity rejection, release on cancellation, scheduled price and immutable warranty. [Browser CI 45946803087](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45946803087) and [security 45946803093](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45946803093) passed.

Production run [45939897706](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45939897706) observed applied 0001–0015 and pending 0016_rental_capacity_required.sql, 0017_variant_parent_guard.sql, 0018_catalog_policy.sql, with no unknown files. Gate blocked pending owner-approved encrypted backup and restore evidence. Do not bypass. Current inventory and digest must be re-read before the owner runs the helper. No live order or slot allocation is authorized by this document.

Owner acceptance: verify actual remaining independent rental package pools against existing obligations; configure approved warranty per SKU (unknown is not zero days), and confirmed promo dates/eligibility. Game top-up remains informational until approved per-denomination rates are provided. After schema migration, compare live public catalog and Discord /katalog, verify available/unconfigured/sold-out display, exercise isolated authorized test orders and verify immutable snapshots; no real funds or customer data should be fabricated. Do not mark A36–A41 production stable based solely on CI.
