# Master audit A01–A85 — evidence registry
Status: candidate development, not stable. Source: owner-approved 26 Nov 2026 audit. Status labels: C = candidate implementation, O = open (defect, feature or verification); none are production-verified by this registry. Prior green CI for website PR #4 45822816039 and bot PR #6 45822887312 applies only to their initial commits, not later changes. Recheck current HEAD and tests before promotion.

| ID | Priority | Finding / required evidence | State |
|---|---|---|---|
| A01 | P0 | Live Discord membership before checkout | RUNTIME PROBE PASSED |
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
| A17 | P0 | Shared D1 web/bot/cart namespace deployed (website PR #32, bot PR #36); new manual entry fence candidate bot PR #39; authenticated live transaction pending | IN PROGRESS |
| A18 | P1 | Common quota, membership, catalog and configured inventory guards deployed; Worker membership probe passed; isolated real D1 checkout and live transaction evidence pending | IN PROGRESS |
| A19 | P0 | Atomic override snapshot deployed; SQLite/browser regressions passed; isolated real D1 checkout and live transaction evidence pending | IN PROGRESS |
| A20 | P1 | Order message ID | C |
| A21 | P0 | Category capacity recovery | C |
| A22 | P1 | Canonical closure after all orders terminal | IN PROGRESS |
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
| A36 | P1 | Catalog price freshness | C |
| A37 | P0 | Server-side variants | C |
| A38 | P0 | Atomic rental inventory | C |
| A39 | P1 | Warranty snapshots | C |
| A40 | P1 | Promotion dates and eligibility | C |
| A41 | P1 | Bot catalog sync | O |
| A42 | P2 | Global search | O |
| A43 | P2 | Skeleton and empty states | O |
| A44 | P2 | Central toast | O |
| A45 | P2 | Calendar | O |
| A46 | P1 | Excel/PDF export | O |
| A47 | P2 | PWA offline | O |
| A48 | P1 | Persistent cart | C |
| A49 | P1 | Portal modularization | O |
| A50 | P1 | Real responsive E2E | IN PROGRESS |
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
| A79 | P0 | Real backend browser E2E | ISOLATED E2E PASSED |
| A80 | P1 | Native dependencies CI | O |
| A81 | P0 | Mandatory security gate | O |
| A82 | P1 | Isolated staging | O |
| A83 | P1 | Release drift monitor | O |
| A84 | P0 | Restore drill | ISOLATED RESTORE PASSED |
| A85 | P0 | Complete release evidence | O |

## Candidate evidence
Website PR #4: initial commit 070f7f00, migration 0012 and ticket-queue tests; subsequent candidate changes add portal draft persistence, sync states and schema probe. Bot PR #6: initial commit 48bb583a, subsequent 31c8023b adds gated consumer. New commits require fresh CI. All open items must have specific code/test evidence or explicit external blocker; do not mark stable from this table alone. No data import, no real money transfers, no restructuring.

## Verified evidence register
| ID | Priority | Description | Root cause | Implementation file | Regression test | Implementation SHA | CI evidence | Deployment evidence | Final status |
|---|---|---|---|---|---|---|---|---|---|
| A01 | P0 | Membership in the configured Discord guild is checked before order insertion; missing credentials or an unavailable API fail closed. | The audit state did not reflect the existing membership gate. | `v4/worker.mjs`, `v4/membership.mjs` | `tests/membership.test.mjs` — credential/transport/rate-limit failures, exact guild member, non-member, mismatched identity, and bot account. | `0e75b0b` | `npm test` passed 50/50 locally; the main build at evidence collection passed in [run 45846230465](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45846230465). | No production membership-credential probe is available; `/api/health` reports login configuration only. | IMPLEMENTED |
| A04 | P0 | OAuth authorization uses S256 PKCE, with the verifier held in a secure HTTP-only cookie and checked at callback. | The authorization-code exchange previously lacked a proof-key verifier; the implementation was added in the merged PKCE change. | `v4/worker.mjs` | `tests/v4.test.mjs` — RFC S256 vector, secure verifier cookie, token exchange verifier, and missing-verifier rejection. | `4cef248bc0537c064a1829581aaf45ea851569f8` | Main SHA `21dc487bf9dc4b762e7cec80972ee065e5b26db2` at verification time: build passed in [run 45846230465](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45846230465). | [V4 deploy run 45846230511](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45846230511) succeeded; production `/api/health` reported release `21dc487bf9dc4b762e7cec80972ee065e5b26db2`, database ready, login configured. No real Discord OAuth sign-in was performed. | TEST PASSED |
| A13 | P0 | Website token-fenced renewal and HYPEBOTX consumer heartbeat are implemented; consumer fails closed on renewal/check failure. | Original 180-second lease could expire during long delivery. Discord side effects and D1 acknowledgement are not a distributed transaction; recovery still needs integrated testing. | `v4/ticket-queue.mjs`, `tests/ticket-queue.test.mjs`, `v4/TICKET-QUEUE.md`; bot `src/jobs/ticketLeaseGuard.js`, `src/jobs/webTicketJob.js`, `src/services/ticketService.js`, `src/tests/webTicketQueue.test.js` | Website regression covers renewal, concurrent claim denial and stale acknowledgement; bot fixtures cover renewal token, expiry, concurrent renewal coalescing, invalid responses and stop. | Website `9ce0f02` (PR #13); HYPEBOTX `4105bf9` (bot PR #12) | Website production CI 45848737980 passed (50/50); bot PR CI 45848870319 passed (63/63), dependency audit 45848870226 passed (0 vulnerabilities). | Website deployment verified; bot merged, deployment not yet verified at audit time. Queue remains disabled; real Discord/D1 crash-restart, uncertain side effects and duplicate prevention require staging evidence. | IN PROGRESS |
| A50 | P1 | Public pages and role dashboards are exercised at mobile, tablet, and desktop widths; the 320px closing CTA overflow is fixed. | Earlier Chromium coverage missed the narrowest public-page layout and all public pages across responsive breakpoints. | `tests/browser.mjs`, `styles.css`, `v4/login.html`, `v4/portal.html`, `v4/portal.css` | Chromium covers 13 public pages at five widths, service detail routes, and customer/worker/seller/management/owner portal fixtures at five widths. | `21e7018` + `eda2222` | Browser/build passed in [run 45858405454](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45858405454); isolated D1 passed in [run 45858405356](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45858405356). | Not deployed. Portal tests use controlled API fixtures; real-backend role workflow E2E remains open. | IN PROGRESS |

## 26 Nov execution update
- Website 7cdea591: membership verification and required request ID; processing refund; Cherax rate changes. Website 12630983: cash opening + consolidated view, CI 45823990589 passed. Website ec73b585: 22 exact heist SKUs, two rental SKUs, Joki Coding and VPN, seller browser fixture coverage. Latest CI required. Bot 5f2bd811: fixed log destinations, customer recovery marker and exact role allowlist; CI 45824055546 passed. Candidate only, no production claims. The membership token and independent machine credential must be configured securely before enabling checkout/ticket sync. A01/A26/A31/A36/A37/A52/A54 are candidate implementations or partial implementations, not final closure. Full finance, atomic reservation, warranties, dated promos, top-up actual prices, live integration and security evidence remain open.

## 27 Nov 2026 WIB — verified website evidence (supersedes older status text for these rows)

| Audit | Scope and result | Verified commit / CI | Remaining release boundary |
|---|---|---|---|
| A01 | Runtime Discord guild membership probe returned VERIFIED / HTTP 200 after manual-redirect hotfix; checkout membership remains fail-closed. | ea4c7fbf, [production 45865650498](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45865650498) | Real member/nonmember UAT still needed. |
| A22 | Canonical closure read-only preflight implemented and deployed; detects active customer orders, uncertain delivery and mapping conflicts. | a6958ead, [production 45866006693](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45866006693) | Durable closure/checkout fencing, bot integration and live staging remain mandatory. |
| A79 | Five-role browser runs real Worker with isolated SQLite D1 adapter; synthetic OAuth, request, claim, invoice, receipt, owner verification, work evidence, settlement, closure preflight and seller isolation. 60/60 Node tests and browser E2E passed. | 6533bb07, [PR CI 45868499754](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45868499754) | Discord and payment provider synthetic; actual member UAT, finance candidates and production integration not certified. |
| A84 | Seeded financial restore, independent reconciliation, rejection of mismatch, invalid SQL and ATTACH, copied session cleanup; isolated D1 migration/export/restore passed. | f66cb96d, [local gate 45866262430](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45866262430) | No evidence of encrypted off-volume production backup or production-derived isolated restore. Do not promote finance migrations on this alone. |

The labels RUNTIME PROBE PASSED, ISOLATED E2E PASSED and ISOLATED RESTORE PASSED describe only the named evidence. None is full production acceptance. Earlier evidence rows are historical records, not current release clearance. No change to production data or Discord channels.

- A36–A38 candidate PR #33: 79 explicit package SKUs, official Rockstar Support assistance price, canonical variant amounts, parent disable guard and rental capacity required. Preserves merged A17–A19 atomic checkout. Current CI and deployment evidence required. HyperBoostX free distribution, final top-up prices and owner attestation of complete catalog remain outstanding. A41 bot PR #32 merged; production registration and end-to-end parity not yet verified.

- A39/A40 focused policy branch: order snapshots immutable, dates and minimum quantity evaluated inside shared atomic checkout, no historical claims or invented owner values. Earlier stacked PR #10 overlaps service_policies and order_policy_snapshots; reconcile its migration and pricing code before any merge. Legacy discounts preserved until explicit owner change, no new undated discounts. Production requires backup/restore evidence, owner-entered policies and real parity test.
