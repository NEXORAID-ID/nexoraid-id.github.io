
-- Additive guards for existing and future orders.
CREATE TRIGGER worker_role_active_guard BEFORE UPDATE OF role ON users
WHEN OLD.role='worker' AND NEW.role<>'worker' AND EXISTS(SELECT 1 FROM orders WHERE assigned_to=OLD.id AND status IN ('claimed','confirmed','processing'))
BEGIN SELECT RAISE(ABORT,'worker_has_active_orders'); END;
CREATE TRIGGER worker_management_active_guard BEFORE INSERT ON management_grants
WHEN EXISTS(SELECT 1 FROM orders WHERE assigned_to=NEW.user_id AND status IN ('claimed','confirmed','processing'))
BEGIN SELECT RAISE(ABORT,'worker_has_active_orders'); END;
CREATE TRIGGER invoice_claim_lock BEFORE UPDATE OF amount ON order_finance
WHEN NEW.amount<>OLD.amount AND EXISTS(SELECT 1 FROM payment_claims WHERE order_id=OLD.order_id)
BEGIN SELECT RAISE(ABORT,'payment_claim_exists'); END;
CREATE TABLE rejected_payment_claims (
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),amount INTEGER NOT NULL,
 reference TEXT NOT NULL,submitted_at INTEGER NOT NULL,reason TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL
);
CREATE INDEX rejected_claim_order ON rejected_payment_claims(order_id,created_at);
CREATE INDEX sessions_user ON sessions(user_id);
