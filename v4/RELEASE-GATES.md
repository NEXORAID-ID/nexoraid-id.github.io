# Integrated NEXORAID V4 / HYPEBOTX release evidence
Updated 2026-11-26. Status: NOT STABLE. Single prioritized backlog for both repositories.
| Priority | Gate | Evidence / remaining work |
|---|---|---|
| P0 | Audio | Owner reports audible music; bot main 1d6e3bb CI green (45787017873). Mandatory decoder and local HTTP fixture candidate bot PR #2; real controls, DAVE and duration checks remain. |
| P0 | Deploy | Website main e23012a Pages CI green (45786982085); Cloudflare CI failed (45786982093) missing environment configuration. Verify deployed SHA, migrations and OAuth live. |
| P0 | Order API | D1 claim, manual payment, evidence, settlement implemented; SQLite lifecycle tests. Candidate request idempotency adds nullable unique key; client retry adoption and real D1 concurrency remain. |
| P0 | Ticket integration | Shared weborder bridge exists; one active ticket per customer, outbox/reconciliation and legacy isolation not verified. |
| P0 | Finance | Integer 60/40 and Rp10k other fee, seller excluded; payout records, export, refunds and reconciliation remain. No automatic payment claim. |
| P1 | UX/security | Four role browser fixture checks; live role checks, accessibility, CVE, CSP, privacy and resource limits remain. |
| P1 | Bot operations | Persistence restart, moderation, giveaway, transcript and backup restore drill remain. |
| P2 | Release | Real deployment SHA, rollback, monitoring, runbook and final evidence remain. |
No provider credentials or production data in this file. Merge candidates only after CI passes; do not reset existing data or Discord structure. No QRIS or AI activation without official configuration.
