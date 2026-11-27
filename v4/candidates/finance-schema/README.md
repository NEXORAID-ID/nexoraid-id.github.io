# Reconciled migration candidate — do not deploy alone

Main now reserves 0016 rental capacity, 0017 variant guard and 0018 catalog policy. Earlier combined candidate PR #44 reserved 0016–0018 for finance and had no current catalog-policy migration. Preserve main's existing migration filenames and bytes, and stage exact SQL from PR #44 head 5370ec1957715df4d4d125b8655d51a02bb51d25 in the following prospective order:

- 0019 cash period controls (was 0016)
- 0020 payout approval (was 0017)
- 0021 order receipts (was 0018)
- 0022 ticket closure fence (was 0021)
- 0023 business accounting (was 0022)

This draft now also contains the prospective 0019–0023 SQL files under v4/migrations/ and application integration changes; these files would become deployable inputs if merged. Do not merge or deploy this draft before the exact production schema inventory, encrypted off-host backup/restore attestation, integrated finance/closure staging tests and owner release approval are available. The isolated regression exercises a populated earlier schema and the full upgrade; green CI alone is not production acceptance. Fee #50 needs a subsequent unique migration and allocation rules. Recheck actual remote inventory and exact migration digest before any release. No production changes or evidence claims.

The integrated restore manifest additionally compares checkout, catalog policy, closure fence and finance source inventories, plus independent component totals. These optional schema-era checks are backward-compatible with earlier backups. Generate a fresh expected manifest using the same candidate helper; never reuse an older-format snapshot. Count and total agreement is not row-level proof, and external backup/restore remains an owner-side release gate.
