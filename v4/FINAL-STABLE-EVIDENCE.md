# Final Stable evidence (candidate, not certification)

| Requirement | Evidence at baseline | Remaining |
|---|---|---|
| A77/A78/A81 | PR #30 merged at 19abba4224323c3c7412d93b478cc569373f008d; [Cloudflare run](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45876179381) passed browser, finance gate, deployment and verification; [Pages run](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45876179393) passed. | New candidate checks and independent acceptance; manual gate parity. |
| A80 | Bot native gate candidate in [bot PR #35](https://github.com/NEXORAID-ID/nexoraid-bot/pull/35). | Native CI and Railway build/runtime verification. |
| A81 | Candidate adds a no-production-secret reusable gate to Cloudflare/Pages and manual deployment. High/critical dependency advisories block website release; bot gate uses low threshold. | CI results and branch/deployment controls; tool transitive lock currently resolved at runtime. |
| A82 | Candidate runs real local Wrangler Worker and temporary D1 with synthetic configuration, no remote credentials or migrations. | Separate cloud Worker/D1 and Discord test application/guild; never clone live data or credentials. |
| A83 | Candidate hourly read-only website drift check records expected and actual SHA, health and mismatch as failing Actions run. | Monitor activation on main; bot requires Railway deployment SHA check separately. |
| A85 | This evidence index, baseline CI and candidate checks. | Current CI/artifacts, live role acceptance, actual bridge/music test, backup/restore evidence, release approval and rollback plan. |

Baseline bot Railway deployment e69a2bc9-f723-4dd5-839d-39b60db7b316 succeeded at 87ec9b17a7758c6235df09de71cff3ec8e08227e; automatic deployment was configured with checkSuites=false. This is a release blocker, not a certification. No production state was changed by the candidate. Never declare Final Stable until all open audit gates have independently verifiable evidence.
