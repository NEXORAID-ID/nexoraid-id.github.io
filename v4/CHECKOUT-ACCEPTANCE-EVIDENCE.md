# Checkout acceptance evidence — A17–A19

## Section A — checkout evidence (27 Nov 2026 WIB)

- Website PR #40 merged as `460c0aab20282ea13acb0c1b896a462353dd3203`. [Latest PR CI](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45879106288) passed 82/82 unit tests, Chromium and lost-response replay after reload and edited quantity; [real isolated D1](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45879106292) passed 12 assertions. These use synthetic customer data, not actual live transactions.
- Bot PR #39 passed 136/136 tests and security gate; Railway deployed `ad5bae677ed736bb4dbb56450e6f10b377d72e5f` with ready and authenticated bridge logs. Existing historical tickets were preserved; new catalog orders route to canonical checkout.
- Production website PR #32 deploy passed including authenticated read-only bridge and membership. The later production run [45878587510](https://github.com/NEXORAID-ID/nexoraid-id.github.io/actions/runs/45878587510) blocked migrations 0019/0020 at the owner backup gate. Do not fabricate attestation, skip gate, or create fake production payments. Latest merged release needs successful deployment and controlled live order verification. Auto-ticket remains separately blocked by historical reconciliation. A17–A19 implementation and isolated testing complete for the tested head; retain IN PROGRESS until remaining acceptance evidence is available.

Current registry remains IN PROGRESS pending live acceptance. This standalone evidence avoids concurrent edits to the master registry.
