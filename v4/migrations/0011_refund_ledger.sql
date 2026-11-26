
CREATE TABLE completed_refunds (
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 999999999),
 reference TEXT NOT NULL UNIQUE,reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 300),
 actor_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL
);
CREATE INDEX completed_refunds_order ON completed_refunds(order_id);
CREATE TRIGGER completed_refund_guard BEFORE INSERT ON completed_refunds
WHEN NOT EXISTS(SELECT 1 FROM orders o JOIN order_finance f ON f.order_id=o.id WHERE o.id=NEW.order_id AND o.status='completed' AND f.state='paid' AND NEW.amount<=f.amount-(SELECT COALESCE(SUM(amount),0) FROM completed_refunds WHERE order_id=o.id))
OR EXISTS(SELECT 1 FROM order_refunds WHERE reference=NEW.reference OR order_id=NEW.order_id)
BEGIN SELECT RAISE(ABORT,'refund_limit'); END;
CREATE TRIGGER refund_reference_guard BEFORE INSERT ON order_refunds
WHEN EXISTS(SELECT 1 FROM completed_refunds WHERE reference=NEW.reference)
BEGIN SELECT RAISE(ABORT,'refund_duplicate_reference'); END;
