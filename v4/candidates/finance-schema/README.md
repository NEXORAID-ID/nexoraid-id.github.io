# Reconciled migration candidate — do not deploy alone

Main now reserves 0016 rental capacity, 0017 variant guard and 0018 catalog policy. Earlier combined candidate PR #44 reserved 0016–0018 for finance and had no current catalog-policy migration. Preserve main's existing migration filenames and bytes, and stage exact SQL from PR #44 head 5370ec1957715df4d4d125b8655d51a02bb51d25 in the following prospective order:

- 0019 cash period controls (was 0016)
- 0020 payout approval (was 0017)
- 0021 order receipts (was 0018)
- 0022 ticket closure fence (was 0021)
- 0023 business accounting (was 0022)

Candidate files are outside the live migration directory. The regression applies actual main migrations 0001–0015, inserts a historical fixture, then applies 0016–0018 and these five staged SQL files in sequence. This is isolated schema verification only. Current application code is NOT compatible with all new triggers until finance/closure routes, portal, backup inventory and regression fixtures from PR #31/#29/#44 are integrated with the latest main. Fee #50 needs a subsequent unique migration and allocation rules. Recheck actual remote inventory and exact migration digest before any release. No production changes or evidence claims.
