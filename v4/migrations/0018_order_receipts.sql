-- Actual verified receipts, separate from invoice and settlement. Legacy paid invoices remain readable.
CREATE TABLE order_receipts (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES order_finance(order_id),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 999999999),
 reference TEXT NOT NULL UNIQUE CHECK(length(reference) BETWEEN 4 AND 80),
 actor_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL
);
CREATE INDEX order_receipts_order ON order_receipts(order_id);
CREATE TABLE receipt_refunds (
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES order_finance(order_id),
 kind TEXT NOT NULL CHECK(kind IN ('partial_cancel','overpayment')),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 999999999),
 reference TEXT NOT NULL UNIQUE CHECK(length(reference) BETWEEN 4 AND 80),
 actor_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL
);
CREATE INDEX receipt_refunds_order ON receipt_refunds(order_id);
CREATE VIEW order_payment_totals AS
 SELECT f.order_id,f.amount AS invoice_amount,
 CASE WHEN EXISTS(SELECT 1 FROM order_receipts r WHERE r.order_id=f.order_id) THEN (SELECT SUM(r.amount) FROM order_receipts r WHERE r.order_id=f.order_id) WHEN f.state='paid' THEN f.amount ELSE 0 END AS received,
 COALESCE((SELECT SUM(amount) FROM receipt_refunds r WHERE r.order_id=f.order_id AND kind='overpayment'),0) AS excess_returned,
 COALESCE((SELECT SUM(amount) FROM receipt_refunds r WHERE r.order_id=f.order_id AND kind='partial_cancel'),0) AS partial_returned
 FROM order_finance f;
DROP VIEW cash_order_movements;
CREATE VIEW cash_receipt_movements AS
 SELECT 'receipt:'||id AS id,'payment' AS kind,amount AS delta,reference,created_at AS event_at FROM order_receipts
 UNION ALL SELECT 'receipt-refund:'||id,'refund',-amount,reference,created_at FROM receipt_refunds;
CREATE VIEW cash_order_movements AS
 SELECT 'payment:'||order_id AS id,'payment' AS kind,amount AS delta,payment_ref AS reference,paid_at AS event_at FROM order_finance f WHERE state='paid' AND NOT EXISTS(SELECT 1 FROM order_receipts r WHERE r.order_id=f.order_id)
 UNION ALL SELECT 'refund:'||order_id,'refund',-amount,reference,created_at FROM order_refunds
 UNION ALL SELECT 'completed-refund:'||id,'refund',-amount,reference,created_at FROM completed_refunds
 UNION ALL SELECT 'payout:'||id,'payout',-amount,reference,reviewed_at FROM payout_requests WHERE state='paid'
 UNION ALL SELECT id,kind,delta,reference,event_at FROM cash_receipt_movements;
-- The final receipt reference is also the legacy invoice compatibility marker, not another cash movement.
DROP TRIGGER cash_guard_order_finance_update;
CREATE TRIGGER cash_guard_order_finance_update BEFORE UPDATE ON order_finance WHEN OLD.state='paid' OR NEW.state='paid' BEGIN
 SELECT CASE WHEN OLD.state='paid' THEN RAISE(ABORT,'cash_movement_immutable') END;
 SELECT CASE WHEN NEW.paid_at IS NULL OR NEW.paid_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN NEW.payment_ref IS NULL OR length(trim(NEW.payment_ref))<4 OR (EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.payment_ref)) AND NOT EXISTS(SELECT 1 FROM order_receipts r WHERE r.order_id=NEW.order_id AND r.reference=NEW.payment_ref AND r.created_at=NEW.paid_at AND r.actor_id=NEW.paid_by AND (SELECT SUM(amount) FROM order_receipts WHERE order_id=NEW.order_id)>=NEW.amount)) THEN RAISE(ABORT,'cash_reference_conflict') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM order_receipts WHERE order_id=NEW.order_id) AND (SELECT SUM(amount) FROM order_receipts WHERE order_id=NEW.order_id)<NEW.amount THEN RAISE(ABORT,'payment_incomplete') END;
END;
CREATE TRIGGER receipt_invoice_lock BEFORE UPDATE OF amount,kind ON order_finance
WHEN (OLD.amount<>NEW.amount OR OLD.kind<>NEW.kind) AND EXISTS(SELECT 1 FROM order_receipts WHERE order_id=OLD.order_id)
BEGIN SELECT RAISE(ABORT,'receipt_invoice_locked'); END;
CREATE TRIGGER receipt_guard BEFORE INSERT ON order_receipts BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM order_finance f JOIN orders o ON o.id=f.order_id WHERE f.order_id=NEW.order_id AND f.state='quoted' AND o.status IN ('claimed','confirmed','processing')) THEN RAISE(ABORT,'receipt_not_allowed') END;
 SELECT CASE WHEN NEW.created_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.reference)) THEN RAISE(ABORT,'cash_reference_conflict') END;
 SELECT CASE WHEN NEW.amount+COALESCE((SELECT SUM(amount) FROM order_receipts WHERE order_id=NEW.order_id),0)>999999999 THEN RAISE(ABORT,'receipt_limit') END;
END;
CREATE TRIGGER receipt_apply AFTER INSERT ON order_receipts BEGIN
 UPDATE order_finance SET state='paid',paid_by=NEW.actor_id,paid_at=NEW.created_at,payment_ref=NEW.reference
 WHERE order_id=NEW.order_id AND state='quoted' AND amount<=(SELECT SUM(amount) FROM order_receipts WHERE order_id=NEW.order_id);
 DELETE FROM payment_claims WHERE order_id=NEW.order_id AND reference=NEW.reference AND amount=NEW.amount;
END;
CREATE TRIGGER receipt_no_update BEFORE UPDATE ON order_receipts BEGIN SELECT RAISE(ABORT,'cash_movement_immutable'); END;
CREATE TRIGGER receipt_no_delete BEFORE DELETE ON order_receipts BEGIN SELECT RAISE(ABORT,'cash_movement_immutable'); END;
CREATE TRIGGER partial_cancel_guard BEFORE UPDATE OF status ON orders
WHEN NEW.status='cancelled' AND OLD.status<>NEW.status AND EXISTS(SELECT 1 FROM order_finance f JOIN order_payment_totals p ON p.order_id=f.order_id WHERE f.order_id=OLD.id AND f.state='quoted' AND p.received>p.partial_returned)
BEGIN SELECT RAISE(ABORT,'partial_refund_required'); END;
CREATE TRIGGER receipt_refund_guard BEFORE INSERT ON receipt_refunds BEGIN
 SELECT CASE WHEN NEW.created_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.reference)) THEN RAISE(ABORT,'cash_reference_conflict') END;
 SELECT CASE WHEN NEW.kind='overpayment' AND NOT EXISTS(SELECT 1 FROM order_payment_totals p WHERE p.order_id=NEW.order_id AND NEW.amount<=p.received-p.invoice_amount-p.excess_returned) THEN RAISE(ABORT,'refund_limit') END;
 SELECT CASE WHEN NEW.kind='partial_cancel' AND NOT EXISTS(SELECT 1 FROM order_payment_totals p JOIN orders o ON o.id=p.order_id JOIN order_finance f ON f.order_id=p.order_id WHERE p.order_id=NEW.order_id AND f.state='quoted' AND o.status IN ('claimed','confirmed','processing') AND p.received>0 AND NEW.amount=p.received-p.partial_returned) THEN RAISE(ABORT,'refund_limit') END;
END;
CREATE TRIGGER partial_refund_cancel AFTER INSERT ON receipt_refunds WHEN NEW.kind='partial_cancel' BEGIN UPDATE orders SET status='cancelled',updated_at=NEW.created_at WHERE id=NEW.order_id; END;
CREATE TRIGGER receipt_refund_no_update BEFORE UPDATE ON receipt_refunds BEGIN SELECT RAISE(ABORT,'cash_movement_immutable'); END;
CREATE TRIGGER receipt_refund_no_delete BEFORE DELETE ON receipt_refunds BEGIN SELECT RAISE(ABORT,'cash_movement_immutable'); END;
