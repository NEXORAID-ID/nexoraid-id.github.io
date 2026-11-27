# Biaya Layanan Rp500 — integration candidate (#50)

Owner price formula: harga dasar + Biaya Layanan Rp500 once per paid checkout. Catalog price is unchanged. Promotions apply to the base. HyperBoostX is non-orderable/free. An unknown request price is not a fixed invoice. Existing orders and checkouts are never backfilled.

This draft contains executable integer-money calculation and a provisional immutable checkout-group policy snapshot. The SQL is deliberately OUTSIDE v4/migrations because PR #31/#29/#44 migration numbering is unresolved. The SQL captures the policy amount, not payment; it must never be mistaken for receipt, revenue, or a verified invoice. Do not merge or deploy this draft as an active charge.

Integration requirements:
- Apply the uniquely numbered snapshot migration in the coordinated finance branch, after owner-approved backup/restore evidence. New groups snapshot the fee inside their existing atomic checkout transaction; replay uses the stored snapshot, legacy groups use zero.
- Wire checkoutTotals to authenticated create/replay responses and cart/single-order presentation. Show subtotal, Biaya Layanan, and total separately, using persisted snapshots and actual accepted quotes. Bot single-order path must consume the same response.
- Existing order_finance is per order, whereas the charge is per checkout group. A single group fee must be collected exactly once across multiple invoices, cancellations, partial receipts and overpayments. Do not simply add Rp500 to each order estimate or quote. Resolve allocation and fee treatment for cancelled/refunded groups and settlement (owner/worker/investor allocation) with the owner; existing split rules stay unchanged until confirmed.
- Verify quote/receipt/QRIS total, partial payments, refunds, ledger/reconciliation, settlement, request-price and historical orders, concurrency, retries and bot parity in one integrated test. No actual transfers or production mutation during testing.

## Candidate integration increment
An explicitly enabled synthetic environment (`CHECKOUT_FEE_PREVIEW=true`) now returns `checkout_pricing` from both cart and single-order create/replay paths based on persisted group snapshots. Legacy rows have zero fee. Response status is `estimate_only`; no invoice or payment changes. The default production path has no new field and no snapshot lookup. A real checkout lifecycle test uses the current migrations and separately applies the provisional SQL in memory. Do not enable preview in production or treat it as a collected charge.

Preview fails closed before any new order is written if either the snapshot table or its trigger is absent. Regression verifies both missing-schema scenarios do not create checkout groups.
