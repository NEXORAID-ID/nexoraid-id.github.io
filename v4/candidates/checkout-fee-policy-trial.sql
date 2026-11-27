-- Isolated policy trial only: apply after checkout-fee-allocation.sql.
-- Proposed policy (NOT owner-approved): fee belongs to owner; base-first
-- attribution for receipts/refunds; full cancellation refunds all received
-- principal and fee, excess remains separately refundable. Fee is waived
-- if its immutable anchor is cancelled; no silent charge on another order.
DROP TRIGGER checkout_fee_pending_settlement;
DROP TRIGGER checkout_fee_pending_full_refund;
DROP TRIGGER checkout_fee_pending_completed_refund;
DROP TRIGGER checkout_fee_pending_receipt_refund;
DROP TRIGGER checkout_fee_pending_receipt;
DROP TRIGGER checkout_fee_pending_direct_payment;
-- Direct paid INSERT remains blocked; paid transition requires actual receipts.
CREATE TRIGGER checkout_fee_require_receipt BEFORE UPDATE OF state ON order_finance
WHEN NEW.state='paid' AND OLD.state<>'paid' AND EXISTS(SELECT 1 FROM checkout_fee_allocations WHERE order_id=NEW.order_id)
AND NOT EXISTS(SELECT 1 FROM order_receipts r WHERE r.order_id=NEW.order_id AND r.reference=NEW.payment_ref AND r.created_at=NEW.paid_at AND r.actor_id=NEW.paid_by AND (SELECT SUM(amount) FROM order_receipts WHERE order_id=NEW.order_id)>=NEW.amount)
BEGIN SELECT RAISE(ABORT,'fee_receipt_required'); END;
-- Keep 60/40 on service principal, not on the Rp500 fee.
DROP TRIGGER order_settlement_after_completion;
CREATE TRIGGER order_settlement_after_completion AFTER UPDATE OF status ON orders
WHEN NEW.status<>OLD.status AND NEW.status='completed'
BEGIN
 INSERT INTO order_settlements(order_id,worker_id,kind,gross,worker_share,owner_share,created_at)
 SELECT NEW.id,NEW.assigned_to,f.kind,f.amount,
 CASE f.kind WHEN 'joki' THEN (c.base_amount*60)/100 ELSE 10000 END,
 f.amount-CASE f.kind WHEN 'joki' THEN (c.base_amount*60)/100 ELSE 10000 END,NEW.updated_at
 FROM order_finance f JOIN checkout_fee_invoice_components c ON c.order_id=f.order_id
 WHERE f.order_id=NEW.id AND f.state='paid' AND f.kind IN ('joki','other');
END;
CREATE TRIGGER checkout_fee_seller_principal_guard BEFORE INSERT ON seller_order_fees
WHEN NEW.amount>(SELECT base_amount FROM checkout_fee_invoice_components WHERE order_id=NEW.order_id)
BEGIN SELECT RAISE(ABORT,'seller_fee_exceeds_base'); END;
CREATE TRIGGER checkout_fee_seller_quote_guard BEFORE UPDATE OF amount ON order_finance
WHEN EXISTS(SELECT 1 FROM seller_order_fees s WHERE s.order_id=OLD.order_id AND s.amount>NEW.amount-COALESCE((SELECT amount FROM checkout_fee_allocations WHERE order_id=OLD.order_id),0))
BEGIN SELECT RAISE(ABORT,'seller_fee_exceeds_base'); END;
-- Read-only component projection of the existing canonical ledger; no
-- duplicate cash events and no inference from unverified customer claims.
CREATE VIEW checkout_fee_ledger_components AS
WITH totals AS (
 SELECT c.order_id,c.base_amount,c.service_fee,c.amount,
 MIN(c.amount,p.received) AS invoice_received,
 COALESCE((SELECT amount FROM order_refunds WHERE order_id=c.order_id),0)
 +COALESCE((SELECT SUM(amount) FROM completed_refunds WHERE order_id=c.order_id),0)
 +p.partial_returned AS invoice_refunded,
 p.excess_returned
 FROM checkout_fee_invoice_components c JOIN order_payment_totals p ON p.order_id=c.order_id
)
SELECT *,MIN(base_amount,invoice_received) AS base_received,
 MAX(0,invoice_received-base_amount) AS fee_received,
 MIN(base_amount,invoice_refunded) AS base_refunded,
 MAX(0,invoice_refunded-base_amount) AS fee_refunded,
 MAX(0,invoice_received-base_amount)-MAX(0,invoice_refunded-base_amount) AS fee_net
FROM totals;
