-- Owner attests each actual incoming payment; no legacy paid orders are backfilled.
CREATE TABLE verified_receipts (
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES order_finance(order_id),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 999999999),
 reference TEXT NOT NULL UNIQUE CHECK(length(reference) BETWEEN 4 AND 80),
 actor_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL
);
CREATE INDEX verified_receipts_order ON verified_receipts(order_id);
CREATE TRIGGER verified_receipt_guard BEFORE INSERT ON verified_receipts
WHEN NOT EXISTS(SELECT 1 FROM order_finance f JOIN orders o ON o.id=f.order_id WHERE f.order_id=NEW.order_id AND ((f.state='quoted' AND o.status IN ('claimed','confirmed')) OR (f.state='paid' AND EXISTS(SELECT 1 FROM verified_receipts WHERE order_id=f.order_id))))
 OR EXISTS(SELECT 1 FROM order_finance WHERE payment_ref=NEW.reference)
 OR EXISTS(SELECT 1 FROM payment_claims WHERE order_id=NEW.order_id AND (reference<>NEW.reference OR amount<>NEW.amount))
BEGIN SELECT RAISE(ABORT,'receipt_not_allowed'); END;
CREATE TRIGGER verified_receipt_immutable BEFORE UPDATE ON verified_receipts BEGIN SELECT RAISE(ABORT,'receipt_immutable'); END;
CREATE TRIGGER verified_receipt_no_delete BEFORE DELETE ON verified_receipts BEGIN SELECT RAISE(ABORT,'receipt_immutable'); END;
CREATE TRIGGER installment_invoice_lock BEFORE UPDATE OF amount ON order_finance
WHEN NEW.amount<>OLD.amount AND EXISTS(SELECT 1 FROM verified_receipts WHERE order_id=OLD.order_id)
BEGIN SELECT RAISE(ABORT,'installment_invoice_locked'); END;
CREATE TRIGGER installment_paid_guard BEFORE UPDATE OF state ON order_finance
WHEN NEW.state='paid' AND EXISTS(SELECT 1 FROM verified_receipts WHERE order_id=OLD.order_id)
 AND NEW.amount>(SELECT COALESCE(SUM(amount),0) FROM verified_receipts WHERE order_id=OLD.order_id)
BEGIN SELECT RAISE(ABORT,'installment_payment_required'); END;
CREATE TRIGGER verified_receipt_apply AFTER INSERT ON verified_receipts
BEGIN
 UPDATE order_finance SET state='paid',paid_by=NEW.actor_id,paid_at=NEW.created_at,payment_ref=NEW.reference
 WHERE order_id=NEW.order_id AND state='quoted' AND amount<=(SELECT SUM(amount) FROM verified_receipts WHERE order_id=NEW.order_id);
 DELETE FROM payment_claims WHERE order_id=NEW.order_id AND reference=NEW.reference AND amount=NEW.amount;
END;
-- Refunds here are ONLY partial-order cancellation or surplus; existing paid invoice refunds remain separate.
CREATE TABLE receipt_adjustments (
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES order_finance(order_id),
 kind TEXT NOT NULL CHECK(kind IN ('surplus','partial_cancel')),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 999999999),
 reference TEXT NOT NULL UNIQUE CHECK(length(reference) BETWEEN 4 AND 80),
 actor_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 300)
);
CREATE INDEX receipt_adjustments_order ON receipt_adjustments(order_id);
CREATE VIEW installment_balances AS
 SELECT f.order_id,f.amount AS invoice_amount,
 COALESCE((SELECT SUM(amount) FROM verified_receipts WHERE order_id=f.order_id),0) AS received,
 COALESCE((SELECT SUM(amount) FROM receipt_adjustments WHERE order_id=f.order_id AND kind='surplus'),0) AS surplus_refunded,
 COALESCE((SELECT SUM(amount) FROM receipt_adjustments WHERE order_id=f.order_id AND kind='partial_cancel'),0) AS partial_refunded
 FROM order_finance f;
CREATE TRIGGER receipt_adjustment_guard BEFORE INSERT ON receipt_adjustments
WHEN EXISTS(SELECT 1 FROM order_refunds WHERE reference=NEW.reference)
 OR EXISTS(SELECT 1 FROM completed_refunds WHERE reference=NEW.reference)
 OR NOT EXISTS(SELECT 1 FROM installment_balances b JOIN order_finance f ON f.order_id=b.order_id JOIN orders o ON o.id=b.order_id WHERE b.order_id=NEW.order_id AND (
 (NEW.kind='surplus' AND f.state='paid' AND NEW.amount<=b.received-b.invoice_amount-b.surplus_refunded)
 OR (NEW.kind='partial_cancel' AND f.state='quoted' AND o.status IN ('claimed','confirmed') AND b.received>0 AND b.partial_refunded=0 AND NEW.amount=b.received AND NOT EXISTS(SELECT 1 FROM payment_claims WHERE order_id=b.order_id))))
BEGIN SELECT RAISE(ABORT,'adjustment_not_allowed'); END;
CREATE TRIGGER receipt_adjustment_immutable BEFORE UPDATE ON receipt_adjustments BEGIN SELECT RAISE(ABORT,'adjustment_immutable'); END;
CREATE TRIGGER receipt_adjustment_no_delete BEFORE DELETE ON receipt_adjustments BEGIN SELECT RAISE(ABORT,'adjustment_immutable'); END;
CREATE TRIGGER installment_cancel_guard BEFORE UPDATE OF status ON orders
WHEN NEW.status='cancelled' AND NEW.status<>OLD.status AND EXISTS(SELECT 1 FROM installment_balances b JOIN order_finance f ON f.order_id=b.order_id WHERE b.order_id=NEW.id AND f.state='quoted' AND b.received>b.partial_refunded)
BEGIN SELECT RAISE(ABORT,'partial_refund_required'); END;
CREATE TRIGGER partial_refund_cancel AFTER INSERT ON receipt_adjustments WHEN NEW.kind='partial_cancel'
BEGIN UPDATE orders SET status='cancelled',updated_at=NEW.created_at WHERE id=NEW.order_id; END;
CREATE TRIGGER existing_refund_adjustment_ref BEFORE INSERT ON order_refunds
WHEN EXISTS(SELECT 1 FROM receipt_adjustments WHERE reference=NEW.reference)
BEGIN SELECT RAISE(ABORT,'duplicate_refund_reference'); END;
CREATE TRIGGER completed_refund_adjustment_ref BEFORE INSERT ON completed_refunds
WHEN EXISTS(SELECT 1 FROM receipt_adjustments WHERE reference=NEW.reference)
BEGIN SELECT RAISE(ABORT,'duplicate_refund_reference'); END;
CREATE TRIGGER old_payment_receipt_ref BEFORE UPDATE OF state ON order_finance
WHEN NEW.state='paid' AND EXISTS(SELECT 1 FROM verified_receipts WHERE reference=NEW.payment_ref AND order_id<>NEW.order_id)
BEGIN SELECT RAISE(ABORT,'duplicate_payment_reference'); END;
-- Actual cash per receipt, not the final invoice amount. Legacy paid orders stay intact.
DROP VIEW cash_movements;
DROP VIEW cash_order_movements;
CREATE VIEW cash_order_movements AS
 SELECT 'payment:'||order_id AS id,'payment' AS kind,amount AS delta,payment_ref AS reference,paid_at AS event_at FROM order_finance f WHERE state='paid' AND NOT EXISTS(SELECT 1 FROM verified_receipts v WHERE v.order_id=f.order_id)
 UNION ALL SELECT 'receipt:'||id,'payment',amount,reference,created_at FROM verified_receipts
 UNION ALL SELECT 'refund:'||order_id,'refund',-amount,reference,created_at FROM order_refunds
 UNION ALL SELECT 'completed-refund:'||id,'refund',-amount,reference,created_at FROM completed_refunds
 UNION ALL SELECT 'adjustment:'||id,'refund',-amount,reference,created_at FROM receipt_adjustments;
CREATE VIEW cash_movements AS
 SELECT id,kind,delta,reference,event_at FROM cash_order_movements
 UNION ALL SELECT 'payout:'||id,'payout',-amount,reference,reviewed_at FROM payout_requests WHERE state='paid'
 UNION ALL SELECT id,kind,delta,reference,event_at FROM cash_business_movements;
