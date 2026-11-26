
-- Additive: no existing balances or historic expenses are invented.
CREATE TABLE payout_requests (
 id TEXT PRIMARY KEY, worker_id TEXT NOT NULL REFERENCES users(id),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 999999999),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','paid','rejected')),
 created_at INTEGER NOT NULL, reviewed_at INTEGER, reviewed_by TEXT REFERENCES users(id),
 reference TEXT,
 CHECK((state='pending' AND reviewed_at IS NULL AND reviewed_by IS NULL AND reference IS NULL) OR
 (state<>'pending' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND reference IS NOT NULL))
);
CREATE INDEX payout_worker ON payout_requests(worker_id,state);
CREATE UNIQUE INDEX payout_transfer_reference ON payout_requests(reference) WHERE state='paid';
CREATE TRIGGER payout_balance_guard BEFORE INSERT ON payout_requests
WHEN NEW.amount > (SELECT COALESCE(SUM(worker_share),0) FROM order_settlements WHERE worker_id=NEW.worker_id)
 - (SELECT COALESCE(SUM(amount),0) FROM payout_requests WHERE worker_id=NEW.worker_id AND state IN ('pending','paid'))
BEGIN SELECT RAISE(ABORT,'insufficient_balance'); END;
CREATE TABLE operating_expenses (
 id TEXT PRIMARY KEY, category TEXT NOT NULL CHECK(category IN ('hosting','supplier','marketing','tools','other')),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 999999999),
 note TEXT NOT NULL CHECK(length(note) BETWEEN 3 AND 200),
 reference TEXT NOT NULL UNIQUE CHECK(length(reference) BETWEEN 4 AND 80),
 actor_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL
);
CREATE TABLE support_cases (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
 customer_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CHECK(kind IN ('question','complaint','refund')),
 message TEXT NOT NULL CHECK(length(message) BETWEEN 10 AND 500),
 state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','resolved')),
 resolution TEXT, resolved_by TEXT REFERENCES users(id), resolved_at INTEGER,
 created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX one_open_case_per_order ON support_cases(order_id) WHERE state='open';
CREATE INDEX support_customer ON support_cases(customer_id,created_at);
CREATE TABLE payment_claims (
 order_id TEXT PRIMARY KEY REFERENCES orders(id), customer_id TEXT NOT NULL REFERENCES users(id),
 reference TEXT NOT NULL CHECK(length(reference) BETWEEN 4 AND 80),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 999999999), submitted_at INTEGER NOT NULL
);
CREATE TABLE order_reviews (
 order_id TEXT PRIMARY KEY REFERENCES orders(id), customer_id TEXT NOT NULL REFERENCES users(id),
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
 note TEXT NOT NULL CHECK(length(note)<=300), created_at INTEGER NOT NULL
);
CREATE TABLE worker_presence (
 worker_id TEXT PRIMARY KEY REFERENCES users(id), available INTEGER NOT NULL CHECK(available IN (0,1)), updated_at INTEGER NOT NULL
);
CREATE TABLE order_refunds (
 order_id TEXT PRIMARY KEY REFERENCES orders(id), amount INTEGER NOT NULL CHECK(amount>0),
 reference TEXT NOT NULL UNIQUE, actor_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL
);
DROP TRIGGER order_paid_cancel_guard;
CREATE TRIGGER order_paid_cancel_guard BEFORE UPDATE OF status ON orders
WHEN NEW.status<>OLD.status AND NEW.status='cancelled'
 AND EXISTS(SELECT 1 FROM order_finance f WHERE f.order_id=NEW.id AND f.state='paid')
 AND NOT EXISTS(SELECT 1 FROM order_refunds r JOIN order_finance f ON f.order_id=r.order_id WHERE r.order_id=NEW.id AND r.amount=f.amount)
BEGIN SELECT RAISE(ABORT,'refund_review_required'); END;
CREATE TRIGGER refund_only_before_work BEFORE INSERT ON order_refunds
WHEN NOT EXISTS(SELECT 1 FROM orders o JOIN order_finance f ON f.order_id=o.id WHERE o.id=NEW.order_id AND o.status IN ('claimed','confirmed') AND f.state='paid' AND f.amount=NEW.amount)
BEGIN SELECT RAISE(ABORT,'refund_not_allowed'); END;
CREATE TRIGGER refund_cancel AFTER INSERT ON order_refunds
BEGIN UPDATE orders SET status='cancelled',updated_at=NEW.created_at WHERE id=NEW.order_id; END;
