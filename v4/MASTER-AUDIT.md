# Master audit A01–A85 — evidence registry
Status: candidate development, not stable. Source: owner-approved 26 Nov 2026 audit. Status labels: C = candidate implementation, O = open (defect, feature or verification); none are production-verified by this registry. Prior green CI for website PR #4 45822816039 and bot PR #6 45822887312 applies only to their initial commits, not later changes. Recheck current HEAD and tests before promotion.

| ID | Priority | Finding / required evidence | State |
|---|---|---|---|
| A01 | P0 | Live Discord membership before checkout | IMPLEMENTED |
| A02 | P0 | Transactional ticket outbox | C |
| A03 | P0 | Automatic bot delivery vs manual command | C |
| A04 | P0 | OAuth PKCE | TEST PASSED |
| A05 | P0 | Machine credential separate from actor | C |
| A06 | P1 | Actual schema health probe | C |
| A07 | P1 | Redacted structured errors | C |
| A08 | P2 | Bot branding docs | C |
| A09 | P1 | Node version docs | C |
| A10 | P1 | Fresh-start release gate docs | C |
| A11 | P0 | Existing OPEN TICKET category | C |
| A12 | P0 | No replacement category | C |
| A13 | P0 | Crash recovery across Discord/D1 | IN PROGRESS |
| A14 | P1 | Order claim button to D1 | C |
| A15 | P1 | Portal ticket sync state | C |
| A16 | P0 | Persistent retry key across reload | C |
| A17 | P0 | Idempotency across all order routes | O |
| A18 | P1 | Checkout quotas business verification | O |
| A19 | P0 | Atomic price snapshot | TEST PASSED |
| A20 | P1 | Order message ID | C |
| A21 | P0 | Category capacity recovery | C |
| A22 | P1 | Canonical closure after all orders terminal | O |
| A23 | P0 | Partial payment nominal handling | O |
| A24 | P0 | Multiple partial receipts | O |
| A25 | P0 | Overpayment liability | O |
| A26 | P0 | In-progress refund | O |
| A27 | P0 | Explicit Join Seller fee | O |
| A28 | P0 | Payout approval vs paid | O |
| A29 | P0 | Investor agreement and funds gate | O |
| A30 | P1 | Post-repayment policy | O |
| A31 | P0 | Unified cash ledger | O |
| A32 | P1 | Period close | O |
| A33 | P0 | Cross-ledger reference reconciliation | O |
| A34 | P1 | Cost basis and margin | O |
| A35 | P2 | Noncash bonus gear | O |
| A36 | P1 | Catalog price freshness | O |
| A37 | P0 | Server-side variants | O |
| A38 | P0 | Atomic rental inventory | O |
| A39 | P1 | Warranty snapshots | O |
| A40 | P1 | Promotion dates and eligibility | O |
| A41 | P1 | Bot catalog sync | O |
| A42 | P2 | Global search | O |
| A43 | P2 | Skeleton and empty states | O |
| A44 | P2 | Central toast | O |
| A45 | P2 | Calendar | O |
| A46 | P1 | Excel/PDF export | O |
| A47 | P2 | PWA offline | O |
| A48 | P1 | Persistent cart | C |
| A49 | P1 | Portal modularization | O |
| A50 | P1 | Real responsive E2E | O |
| A51 | P2 | Language consistency | O |
| A52 | P0 | Logging channel ID mapping | O |
| A53 | P1 | Legacy role names | O |
| A54 | P0 | Role permissions mapping | O |
| A55 | P0 | Owner-only structure commands | O |
| A56 | P1 | Single-replica persistence boundary | O |
| A57 | P0 | Lost-volume recovery | O |
| A58 | P0 | Encrypted off-volume backup | O |
| A59 | P0 | Deleted-channel reconciliation | O |
| A60 | P1 | Integrated closure | O |
| A61 | P2 | Command docs | O |
| A62 | P1 | Audio legacy dependency audit | O |
| A63 | P1 | Real music control tests | O |
| A64 | P0 | Transcript/log privacy | O |
| A65 | P0 | Account suspension | O |
| A66 | P0 | Key rotation | O |
| A67 | P0 | CVE scan | O |
| A68 | P0 | Secret history scan | O |
| A69 | P1 | Public and OAuth limits | O |
| A70 | P0 | Attachment safety | O |
| A71 | P1 | CSP | O |
| A72 | P1 | Data retention | O |
| A73 | P1 | Before/after audit | O |
| A74 | P0 | IDOR/RBAC tests | O |
| A75 | P0 | Concurrency and replay tests | O |
| A76 | P1 | Maintenance mode | O |
| A77 | P1 | Pin Wrangler patch | O |
| A78 | P0 | Migration deployment compatibility | O |
| A79 | P0 | Real backend browser E2E | O |
| A80 | P1 | Native dependencies CI | O |
| A81 | P0 | Mandatory security gate | O |
| A82 | P1 | Isolated staging | O |
| A83 | P1 | Release drift monitor | O |
| A84 | P0 | Restore drill | O |
| A85 | P0 | Complete release evidence | O |

## Candidate evidence
Website PR #4: initial commit 070f7f00, migration 0012 and ticket-queue tests; subsequent candidate changes add portal draft persistence, sync states and schema probe. Bot PR #6: initial commit 48bb583a, subsequent 31c8023b adds gated consumer. New commits require fresh CI. All open items must have specific code/test evidence or explicit external blocker; do not mark stable from this table alone. No data import, no real money transfers, no restructuring.

## Verified evidence register
| ID | Priority | Description | Root cause | Implementation file | Regression test | Implementation SHA | CI evidence | Deployment evidence | Final status |
|---|---|---|---|---|---|---|---|---|---|
| A01 | P0 | Membership in the configured Discord guild is checked before order insertion; missing credentials or an unavailable API fail closed. | The audit state did not reflect the existing membership gate. | `v4/worker.mjs`, `v4/membership.mjs` | `tests/membership.test.mjs` — credential/transport/rate-limit failures, exact guild member, non-member, mismatched identity, and bot account. | `0e75b0b` | `npm test` passed 50/50 locally; the main build at evidence collection passed in [run 45846230465](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45846230465). | No production membership-credential probe is available; `/api/health` reports login configuration only. | IMPLEMENTED |
| A04 | P0 | OAuth authorization uses S256 PKCE, with the verifier held in a secure HTTP-only cookie and checked at callback. | The authorization-code exchange previously lacked a proof-key verifier; the implementation was added in the merged PKCE change. | `v4/worker.mjs` | `tests/v4.test.mjs` — RFC S256 vector, secure verifier cookie, token exchange verifier, and missing-verifier rejection. | `4cef248bc0537c064a1829581aaf45ea851569f8` | Main SHA `21dc487bf9dc4b762e7cec80972ee065e5b26db2` at verification time: build passed in [run 45846230465](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45846230465). | [V4 deploy run 45846230511](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45846230511) succeeded; production `/api/health` reported release `21dc487bf9dc4b762e7cec80972ee065e5b26db2`, database ready, login configured. No real Discord OAuth sign-in was performed. | TEST PASSED |
| A13 | P0 | The website queue can renew a live 180-second lease using its current token; HYPEBOTX must invoke this before expiry for long-running delivery. | The lease had no renewal operation, so work lasting over 180 seconds could be reclaimed by another consumer. | `v4/ticket-queue.mjs`, `tests/ticket-queue.test.mjs`, `v4/TICKET-QUEUE.md` | Queue regression covers renewal extending the lease, denying renewal after expiry, blocking a concurrent claim, and rejecting stale acknowledgement. | `4c7f636` | Local `npm run check` passed (50/50 tests and build); PR CI is pending. | Not deployed. HYPEBOTX consumer integration and live crash/restart verification remain blocked by unavailable bot-repository access. | IN PROGRESS |
| A19 | P0 | Order creation reads the live owner override and scheduled promotion in the same INSERT that stores catalog price and estimate; disabled services remain rejected. | Checkout previously read memberCatalog before a separate insert, allowing an owner price update between those operations. | `v4/worker.mjs`, `tests/v4.test.mjs` | Race regression updates the catalog immediately before the D1 batch and verifies both returned and persisted price/estimate use the new discounted price. | `92d0776782287f50472651c10c584b05337e5eaf` | Local `npm run check` passed (52/52 tests and build); schema-17 local D1 migration/export/restore passed. PR CI is pending. | Not deployed; this is a candidate branch. | TEST PASSED |

## 26 Nov execution update
- Website 7cdea591: membership verification and required request ID; processing refund; Cherax rate changes. Website 12630983: cash opening + consolidated view, CI 45823990589 passed. Website ec73b585: 22 exact heist SKUs, two rental SKUs, Joki Coding and VPN, seller browser fixture coverage. Latest CI required. Bot 5f2bd811: fixed log destinations, customer recovery marker and exact role allowlist; CI 45824055546 passed. Candidate only, no production claims. The membership token and independent machine credential must be configured securely before enabling checkout/ticket sync. A01/A26/A31/A36/A37/A52/A54 are candidate implementations or partial implementations, not final closure. Full finance, atomic reservation, warranties, dated promos, top-up actual prices, live integration and security evidence remain open.
