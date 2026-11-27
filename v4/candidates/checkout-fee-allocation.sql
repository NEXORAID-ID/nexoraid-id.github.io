-- STAGING CANDIDATE ONLY. Apply checkout-service-fee.sql first in an isolated DB.
-- No historical backfill. No changes to the production migration directory.
CREATE TABLE checkout_fee_allocations (
 checkout_id TEXT PRIMARY KEY REFERENCES checkout_service_fees(checkout_id),
 order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
 amount INTEGER NOT NULL CHECK(amount=500),
 actor_id TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL
);
CREATE TRIGGER checkout_fee_allocation_guard BEFORE INSERT ON checkout_fee_allocations BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM checkout_service_fees s JOIN checkout_items i ON i.checkout_id=s.checkout_id
  JOIN checkout_groups g ON g.id=i.checkout_id JOIN orders o ON o.id=i.order_id
  WHERE s.checkout_id=NEW.checkout_id AND s.amount=NEW.amount AND i.order_id=NEW.order_id
  AND o.customer_id=g.customer_id AND o.status IN ('claimed','confirmed','processing')
 ) THEN RAISE(ABORT,'fee_allocation_invalid') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM checkout_items i JOIN order_finance f ON f.order_id=i.order_id WHERE i.checkout_id=NEW.checkout_id) THEN RAISE(ABORT,'fee_allocation_after_invoice') END;
END;
CREATE TRIGGER checkout_fee_allocation_no_update BEFORE UPDATE ON checkout_fee_allocations BEGIN SELECT RAISE(ABORT,'fee_allocation_immutable'); END;
CREATE TRIGGER checkout_fee_allocation_no_delete BEFORE DELETE ON checkout_fee_allocations BEGIN SELECT RAISE(ABORT,'fee_allocation_immutable'); END;
-- An invoice is not eligible until allocation is decided for the entire group.
CREATE TRIGGER checkout_fee_invoice_guard BEFORE INSERT ON order_finance
WHEN EXISTS(SELECT 1 FROM checkout_items i JOIN checkout_service_fees s ON s.checkout_id=i.checkout_id WHERE i.order_id=NEW.order_id AND s.amount=500)
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM checkout_items i JOIN checkout_fee_allocations a ON a.checkout_id=i.checkout_id WHERE i.order_id=NEW.order_id) THEN RAISE(ABORT,'fee_allocation_required') END;
 SELECT CASE WHEN NEW.amount-COALESCE((SELECT amount FROM checkout_fee_allocations WHERE order_id=NEW.order_id),0)<CASE WHEN NEW.kind='other' THEN 10000 ELSE 1 END THEN RAISE(ABORT,'fee_invoice_base_invalid') END;
END;
CREATE TRIGGER checkout_fee_invoice_update_guard BEFORE UPDATE OF amount,kind ON order_finance
WHEN EXISTS(SELECT 1 FROM checkout_fee_allocations WHERE order_id=NEW.order_id)
AND NEW.amount-(SELECT amount FROM checkout_fee_allocations WHERE order_id=NEW.order_id)<CASE WHEN NEW.kind='other' THEN 10000 ELSE 1 END
BEGIN SELECT RAISE(ABORT,'fee_invoice_base_invalid'); END;
CREATE VIEW checkout_fee_invoice_components AS
 SELECT f.order_id,f.amount-COALESCE(a.amount,0) AS base_amount,COALESCE(a.amount,0) AS service_fee,f.amount
 FROM order_finance f LEFT JOIN checkout_fee_allocations a ON a.order_id=f.order_id;
-- Fail closed: the current settlement/refund triggers have no fee policy.
-- These guards prevent an isolated fee invoice from being used with the
-- legacy paths until component allocation and policy are implemented.
CREATE TRIGGER checkout_fee_pending_settlement BEFORE UPDATE OF status ON orders
WHEN NEW.status='completed' AND OLD.status<>NEW.status AND EXISTS(SELECT 1 FROM checkout_fee_allocations WHERE order_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'fee_settlement_policy_pending'); END;
CREATE TRIGGER checkout_fee_pending_full_refund BEFORE INSERT ON order_refunds
WHEN EXISTS(SELECT 1 FROM checkout_fee_allocations WHERE order_id=NEW.order_id)
BEGIN SELECT RAISE(ABORT,'fee_refund_policy_pending'); END;
CREATE TRIGGER checkout_fee_pending_completed_refund BEFORE INSERT ON completed_refunds
WHEN EXISTS(SELECT 1 FROM checkout_fee_allocations WHERE order_id=NEW.order_id)
BEGIN SELECT RAISE(ABORT,'fee_refund_policy_pending'); END;
CREATE TRIGGER checkout_fee_pending_receipt_refund BEFORE INSERT ON receipt_refunds
WHEN NEW.kind='partial_cancel' AND EXISTS(SELECT 1 FROM checkout_fee_allocations WHERE order_id=NEW.order_id)
BEGIN SELECT RAISE(ABORT,'fee_refund_policy_pending'); END;
-- Never collect actual payment through this staging candidate.
CREATE TRIGGER checkout_fee_pending_receipt BEFORE INSERT ON order_receipts
WHEN EXISTS(SELECT 1 FROM checkout_fee_allocations WHERE order_id=NEW.order_id)
BEGIN SELECT RAISE(ABORT,'fee_payment_policy_pending'); END;
CREATE TRIGGER checkout_fee_pending_direct_payment BEFORE UPDATE OF state ON order_finance
WHEN NEW.state='paid' AND OLD.state<>'paid' AND EXISTS(SELECT 1 FROM checkout_fee_allocations WHERE order_id=NEW.order_id)
BEGIN SELECT RAISE(ABORT,'fee_payment_policy_pending'); END;

CREATE TRIGGER checkout_fee_pending_direct_insert BEFORE INSERT ON order_finance
WHEN NEW.state='paid' AND EXISTS(SELECT 1 FROM checkout_fee_allocations WHERE order_id=NEW.order_id)
BEGIN SELECT RAISE(ABORT,'fee_payment_policy_pending'); END;
