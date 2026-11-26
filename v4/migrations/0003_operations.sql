
-- Additive migration; legacy orders remain intact. No historic payment is inferred.
CREATE TABLE order_finance (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 999999999),
 kind TEXT NOT NULL CHECK(kind IN ('joki','other','seller')),
 state TEXT NOT NULL DEFAULT 'quoted' CHECK(state IN ('quoted','paid')),
 quoted_by TEXT NOT NULL REFERENCES users(id),
 quoted_at INTEGER NOT NULL,
 paid_by TEXT REFERENCES users(id),
 paid_at INTEGER,
 payment_ref TEXT,
 CHECK(kind<>'other' OR amount>=10000),
 CHECK((state='quoted' AND paid_by IS NULL AND paid_at IS NULL) OR (state='paid' AND paid_by IS NOT NULL AND paid_at IS NOT NULL AND payment_ref IS NOT NULL))
);
CREATE TABLE order_work (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 worker_id TEXT NOT NULL REFERENCES users(id),
 evidence TEXT NOT NULL CHECK(length(evidence) BETWEEN 10 AND 500),
 submitted_at INTEGER NOT NULL
);
CREATE TABLE order_settlements (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 worker_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CHECK(kind IN ('joki','other')),
 gross INTEGER NOT NULL CHECK(gross>0),
 worker_share INTEGER NOT NULL CHECK(worker_share>=0),
 owner_share INTEGER NOT NULL CHECK(owner_share>=0),
 created_at INTEGER NOT NULL,
 CHECK(gross=worker_share+owner_share)
);
CREATE INDEX orders_page ON orders(created_at DESC,id DESC);
CREATE INDEX orders_assigned ON orders(assigned_to,status);
CREATE INDEX settlements_worker ON order_settlements(worker_id,created_at);
CREATE INDEX audit_recent ON audit_events(created_at DESC,id DESC);
-- Enforce prerequisites even if a caller forgets the API guard.
CREATE TRIGGER order_paid_before_progress BEFORE UPDATE OF status ON orders
WHEN NEW.status<>OLD.status AND NEW.status IN ('processing','completed')
 AND NOT EXISTS(SELECT 1 FROM order_finance f WHERE f.order_id=NEW.id AND f.state='paid')
BEGIN SELECT RAISE(ABORT,'payment_required'); END;
CREATE TRIGGER order_evidence_before_completion BEFORE UPDATE OF status ON orders
WHEN NEW.status<>OLD.status AND NEW.status='completed'
 AND NOT EXISTS(SELECT 1 FROM order_work w WHERE w.order_id=NEW.id AND w.worker_id=NEW.assigned_to)
BEGIN SELECT RAISE(ABORT,'evidence_required'); END;
CREATE TRIGGER order_paid_cancel_guard BEFORE UPDATE OF status ON orders
WHEN NEW.status<>OLD.status AND NEW.status='cancelled'
 AND EXISTS(SELECT 1 FROM order_finance f WHERE f.order_id=NEW.id AND f.state='paid')
BEGIN SELECT RAISE(ABORT,'refund_review_required'); END;
CREATE TRIGGER order_settlement_after_completion AFTER UPDATE OF status ON orders
WHEN NEW.status<>OLD.status AND NEW.status='completed'
BEGIN
 INSERT INTO order_settlements(order_id,worker_id,kind,gross,worker_share,owner_share,created_at)
 SELECT NEW.id,NEW.assigned_to,f.kind,f.amount,
 CASE f.kind WHEN 'joki' THEN (f.amount*60)/100 ELSE 10000 END,
 f.amount-CASE f.kind WHEN 'joki' THEN (f.amount*60)/100 ELSE 10000 END,NEW.updated_at
 FROM order_finance f WHERE f.order_id=NEW.id AND f.state='paid' AND f.kind IN ('joki','other');
END;
