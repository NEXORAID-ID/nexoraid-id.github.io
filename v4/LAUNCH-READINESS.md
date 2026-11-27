# Launch readiness — owner priority matrix, 27 November 2026 WIB

Decision: NO-GO for combined NEXORAID V4 + HYPEBOTX final stable. Priority groups supplied by owner; sequencing and evidence gates below are operational recommendations, not a new financial, retention or credential policy. This record supplements MASTER-AUDIT.md and RELEASE-GATE.md, does not override them, and is a snapshot rather than a claim of current production certification.

| Group | Priority | Candidate / current evidence | Hard acceptance gate |
|---|---|---|---|
| Finance and business | P0 | Website #57 head 4e397f5dd41d912bfff45526b905026ddde6def5: security 45950889022, D1 45950889083, Pages/browser 45950889057 all passed; draft, not merged. | Combined finance, invoice fee, receipt/overpayment/refund/payout, cash and cross-ledger reconciliation, approved investor terms, actual staged workflow; no real money transfer in test. |
| Database and migrations | P0 | #57 candidate 0019–0023; #76 proposes 0024; checkout #74 may alter fee schema. | One exact integrated migration tree, inventory from target D1, no rewrite of applied migration, digest, tested upgrade from actual baseline, compatible rollback, production approval. |
| Backup and restore | P0 | Historical isolated restore passed; production-derived encrypted off-host restore evidence not established. | Verified ciphertext/checksum, independent source and restored counts/totals/attachment checksums, copied sessions invalidated, off-host custody, recent exact-digest attestation. |
| Order and checkout | P0 | #74 head 82093049b2f79e5305d0ffb322a01e055c5172d1: mergeable=false at observation; no PR workflow returned for exact head. | Reconcile with #57; approved Rp500 fee allocation/refund behavior; concurrent retries, price and rental reservation, multi-receipt, cancellation, refund, settlement and ticket linkage pass on same candidate. |
| Security | P0 | #81 head 48e9b61c1c22645df7193f3d1327d974d2405898: D1 45951186224 passed; Pages build job passed, overall 45951186388 failed; security 45951186315 failed on A68. #76 head 21405d468018e6c71a919963da22133be5d8a78e security 45950734101 and D1 45950734172 passed. | Private history triage; revoke/rotate affected credentials; documented remediation and accepted history-scan result, current CVE/CSP/RBAC/concurrency/suspend tests; approved retention and audit completeness; no bypass. |
| Website and bot | P0 | Bot #38 head f513bf1266b403a597ba6860b1b7a2708971623c draft; #56 head cfaf05724dab14aa0a76c03a20cdb1ffddea052a diagnoses channel scope; website compatibility not certified. | Same web/bot release SHAs tested on isolated D1 + Discord test guild; OAuth and role checks, queue lease/crash/replay, actual channel/message linkage, terminal closure, scope/privacy, finance status parity. Keep queue rollout disabled until verified. |
| Catalog and services | P1 | Prior #59 catalog CI passed; #62 open. | Current canonical pricebook, approved actual rates/stock/warranty/promotion, offline failure, bot parity and immutable invoice. Catalog integrity needed by checkout remains P0. |
| Dashboard | P1 | #79 head 8368fdc022999ae6d5901b6c543cf97074c9b3de: D1 45950895240, security 45950895217, browser 45950895195 passed; not merged. | Consolidate against final finance/auth API, role isolation and all workflows; critical role/finance failures are P0. |
| UI/UX | P2 | Historical browser regression and current #79 candidate. | Responsive, accessible, correct Indonesian labels and no broken essential flow; cosmetic polish is P2, not authorization to ignore accessibility/security defects. |
| Documentation | P2 | Existing master audit and final evidence; #82 documentation candidate for Railway predeploy. | Final exact SHAs, operational runbooks, support/training, rollback and release decision. Missing mandatory safety instructions or evidence remain P0. |

## Dependency order

1. Parallel now: reconcile #57 + #74 and security #81 + #76; privately resolve A68/A66; prepare isolated staging, encrypted backup destination, owner-approved policy details. No deployment.
2. Freeze one integrated website candidate and compatible HYPEBOTX candidate. Record exact commit SHA for each. Resolve merge conflicts without discarding unrelated changes. Recheck actual applied migrations, pending order and exact content digest.
3. Run clean-install CI, source/browser/security tests, isolated D1 upgrade + restore, cross-ledger arithmetic and negative role/concurrency cases, native bot tests and runtime dependency checks. Evidence tied to older heads cannot certify the combined head.
4. Run end-to-end staging using separate accounts/guild/DB and synthetic orders: Discord login and membership -> checkout -> static QRIS invoice and dummy receipt -> owner verification -> claim/work/evidence -> settlement/refund -> ticket closure; failure recovery, privacy, duplicate prevention. Never use live customer data or fabricate paid records.
5. For production promotion, freeze writes, acquire exact migration-set encrypted backup and isolated restore attestation per RELEASE-GATE.md. Confirm QRIS merchant, real inventory/policy values, authorized credentials and rollback compatible with schema. Never publish provisional finance policy.
6. Require all P0 gates and every applicable mandatory A01–A85 acceptance, independent deployment verification and explicit owner release approval. P1/P2 work may run in parallel, but no lower-priority label excuses a release-blocking defect.
7. Deploy via existing guarded workflows only; verify Worker and Railway release IDs match approved commits, actual health/membership, monitoring, backups and authorized live UAT. Queue activation remains separately gated. If failure, stop writes and use schema-compatible rollback; never restore over production automatically.

## Current owner/external dependencies

- Access to authorized private secret-management environment and sanitized secret remediation evidence (no secrets in chat/commits/logs).
- Confirm proposed Rp500 allocation/waiver/refund behavior and post-principal investor policy; do not infer from a candidate.
- Confirm actual current encrypted off-host backup and restore, exact D1 inventory, and owner-controlled key custody.
- Dedicated staging resources/test guild, actual QRIS merchant verification and approved role accounts; no production secret reuse.
- Approval of retention/dispute/legal-hold handling before any deletion.

## Evidence semantics

Candidate = code exists. CI passed = named run and tested head only. Isolated passed = synthetic or isolated environment only. Runtime probe = specific live observation only. Final stable = exact combined release plus mandatory gates, deployment and acceptance evidence. Do not derive percentage from commit count or number of PRs. At this snapshot none of the six P0 groups is fully verified end-to-end; no release approval has been recorded. Recheck current branch/CI/production before every promotion.

Source references: website PRs [#57](https://github.com/NEXORAID-ID/nexoraid-id.github.io/pull/57), [#74](https://github.com/NEXORAID-ID/nexoraid-id.github.io/pull/74), [#76](https://github.com/NEXORAID-ID/nexoraid-id.github.io/pull/76), [#81](https://github.com/NEXORAID-ID/nexoraid-id.github.io/pull/81), [#79](https://github.com/NEXORAID-ID/nexoraid-id.github.io/pull/79), [#82](https://github.com/NEXORAID-ID/nexoraid-id.github.io/pull/82); bot [#38](https://github.com/NEXORAID-ID/nexoraid-bot/pull/38), [#56](https://github.com/NEXORAID-ID/nexoraid-bot/pull/56). CI run IDs above refer to the website repository.
