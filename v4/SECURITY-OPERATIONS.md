# Security operations — A65–A76

Status: candidate, not production evidence. Do not mark any requirement stable until its acceptance check passes on the deployed release. Never put secret values, raw scan results, customer data or session tokens in GitHub, chat, artifacts or logs.

## A66 — credential rotation (owner-operated)
Inventory the Worker Discord OAuth client secret, Discord bot token, membership token, website bot bridge key, ticket queue bridge key and deployment credentials by **name and consumer only**, verifying actual configured bindings. Keep bot and queue keys distinct. Do not use the Discord token as a bridge key. Record rotation time, operator, consumer and old-key rejection, never values.
1. Verify backup, access to both producer and consumer, and rollback procedure. Pause affected writers/queue consumers; preserve pending tickets and idempotency records.
2. Generate replacement through the provider or a cryptographically secure generator, store directly in each provider's secret manager. For a bridge key with no overlap support, coordinate a maintenance window; do not introduce a second accepted key implicitly.
3. Update both ends of each integration, deploy the exact approved release, verify health, legitimate requests, and rejection of old/invalid credentials. Resume consumers only after both ends agree. A suspected compromised credential must be revoked, not restored as rollback.
4. Record sanitized evidence. Rotate immediately after confirmed exposure; periodic cadence requires owner approval. Do not rotate live credentials from CI or without provider access.

## A68 — history scan
The release-security workflow scans fetched refs with full-depth checkout and a digest-pinned scanner. Findings are not printed or uploaded. A nonzero scanner result blocks the gate; distinguish tool errors from findings on an authorized private workstation. No raw secret output in public CI. Scan additional inaccessible refs, forks, cached artifacts and provider logs privately where authorized. If a real secret is found, revoke/rotate it first, investigate access and coordinate any history rewrite separately. Never force-push automatically. A passing scan is not proof that no credential was ever exposed.

Owner-operated raw scan on 27 November 2026 reported 15 `discord-client-id` matches only, in `tests/maintenance-oauth.test.mjs` and `tests/v4.test.mjs`. Historical source review confirmed public Discord identifiers in test fixtures; neighboring secret literals are synthetic. `v4/security/a68-reviewed-fingerprints.txt` records only exact commit/path/rule/line fingerprints; no rule-wide or file-wide exemptions. New matches, including new public-ID occurrences, remain blocking until reviewed. The private triage script intentionally continues to show all raw findings; compare its sanitized fingerprints with the reviewed list. Actual gate success is required before release; no rotation or history rewrite was performed for these public identifiers.

## A72 — retention proposal (not approved; no deletion)
Proposed initial review periods: expired sessions 30 days; rate-limit counters 7 days after expiry; non-financial operational logs 90 days; attachments and ticket content 180 days after closure subject to disputes and legal holds. Finance, invoice, refund, investor and audit evidence require a separately approved legal/business schedule; no automatic deletion pending approval. Validate applicable obligations and privacy policy before enabling. No historical Discord ticket import.
Implement dry-run counts per data class, scoped batch deletion, foreign-key checks, legal holds, restricted audit metadata and backup/restore rehearsal. Never delete open orders, disputed orders, active sessions, queued tickets, or financial records under this proposal. Enable scheduled deletion only after owner approval and staging verification.

## Acceptance matrix
| ID | Required evidence |
|---|---|
| A65 | Owner-only suspension, atomic session invalidation, denial for existing cookie and bot actor, reactivation without restoring old sessions. |
| A66 | Rotation record and successful new/failed old credential probes for each actual consumer. |
| A67 | Current dependency audit and source/authorization regression results for exact release. |
| A68 | Full-depth scan run succeeds; synthetic noncredential canary test privately verifies failure handling; triage closed. |
| A69 | Public/OAuth and authenticated throttling, multi-request burst checks and fail-closed storage errors. |
| A70 | Authorization, MIME and byte-signature mismatch, size, active-content handling and safe download checks. |
| A71 | Browser tests for complete policy, external resources, script injection and anti-framing on actual pages. |
| A72 | Owner-approved retention schedule, dry-run, legal hold, deletion and restore evidence. |
| A73 | Atomic before/after events for sensitive mutations, actor attribution and redaction of PII/secrets. |
| A74 | Cross-user and cross-role read/write denial tests for every order, attachment, finance and management route. |
| A75 | Parallel writes, duplicate requests, expired/reused tokens and exactly-once effects tested on isolated D1. |
| A76 | Maintenance blocks browser and bot mutation, login provisioning and ticket claims as specified; health and allowed reads/logout remain available. |

No automatic production deployment, secret rotation, account suspension, destructive migration or data deletion is authorized by this document.
