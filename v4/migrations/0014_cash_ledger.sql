-- Owner-entered cash opening position, immutable; do not infer or import historic balances.
CREATE TABLE cash_opening (
 id INTEGER PRIMARY KEY CHECK(id=1),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 0 AND 999999999999),
 effective_at INTEGER NOT NULL,
 reference TEXT NOT NULL CHECK(length(reference) BETWEEN 4 AND 80),
 actor_id TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL
);
CREATE TRIGGER cash_opening_no_update BEFORE UPDATE ON cash_opening BEGIN SELECT RAISE(ABORT,'opening_immutable'); END;
CREATE TRIGGER cash_opening_no_delete BEFORE DELETE ON cash_opening BEGIN SELECT RAISE(ABORT,'opening_immutable'); END;
-- Read-only consolidated view of actual recorded cash, not an accrual/general ledger.
-- Supplier usage is noncash. Owner allocation is retained cash, not a transfer.
CREATE VIEW cash_movements AS
 SELECT 'payment:'||order_id AS id,'payment' AS kind,amount AS delta,payment_ref AS reference,paid_at AS event_at FROM order_finance WHERE state='paid'
 UNION ALL SELECT 'refund:'||order_id,'refund',-amount,reference,created_at FROM order_refunds
 UNION ALL SELECT 'completed-refund:'||id,'refund',-amount,reference,created_at FROM completed_refunds
 UNION ALL SELECT 'payout:'||id,'payout',-amount,reference,reviewed_at FROM payout_requests WHERE state='paid'
 UNION ALL SELECT 'expense:'||id,'expense',-amount,reference,created_at FROM operating_expenses
 UNION ALL SELECT 'supplier:'||id,'supplier:'||kind,CASE kind WHEN 'deposit' THEN -amount ELSE amount END,reference,created_at FROM supplier_movements WHERE kind IN ('deposit','withdrawal')
 UNION ALL SELECT 'capital:'||id,'investor:capital',amount,reference,created_at FROM investor_capital
 UNION ALL SELECT 'distribution:'||id,'investor:distribution',-(investor_share+principal_return),reference,created_at FROM investor_distributions;
