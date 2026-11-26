-- Permit owner-recorded full refund during processing; no historical rows changed.
DROP TRIGGER refund_only_before_work;
CREATE TRIGGER refund_only_before_work BEFORE INSERT ON order_refunds
WHEN NOT EXISTS(SELECT 1 FROM orders o JOIN order_finance f ON f.order_id=o.id WHERE o.id=NEW.order_id AND o.status IN ('claimed','confirmed','processing') AND f.state='paid' AND f.amount=NEW.amount)
BEGIN SELECT RAISE(ABORT,'refund_not_allowed'); END;
