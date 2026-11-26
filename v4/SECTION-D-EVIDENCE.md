# Section D — automated acceptance evidence

### Section D follow-up evidence (PR #42 and #43)

- PR #42 merged as d7ac0ae6d38a7be10343d12a563a740a394a2c2b. [Chromium and unit CI](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45878793659) passed 78/78 tests, including five-role loading/error/retry/empty states and toast deduplication; [security](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45878793682) and [isolated D1](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45878793687) passed. API/navigation extracted into portal-core.mjs and explicit unauthorized navigation/session tests added.
- PR #43 merged as 210efc380467725d91c770a53f91833dc1d00bca. [Build/Chromium CI](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45879119375) passed 82/82 tests, 0 failures; [security](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45879119487) passed. Public storefront and support wording localized; CSV filename restored and build verified. Product names and established industry terms retained.
- All eight Section D rows now have candidate implementations and automated test evidence. TEST PASSED does not mean exhaustive coverage or production verification. The outstanding acceptance items in the preceding table still apply where not covered by these follow-up tests; particularly live deployed version, real device installation, representative report visual review, populated deadline workflows and full role/error/copy review.
- Final Stable requires current main and deployed release evidence. The PR CI deploy job is skipped by design; its success is not production deployment proof.

Current release blocker: production deployment is not confirmed. See FINAL-STABLE-EVIDENCE.md for the live migration gate and backup/restore requirements. Never bypass that gate.
