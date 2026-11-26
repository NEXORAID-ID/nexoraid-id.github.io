-- Owner-entered terms only. No fabricated opening balances or historical terms.
CREATE TABLE service_policies (
 service_id TEXT PRIMARY KEY, unit_cost INTEGER CHECK(unit_cost BETWEEN 0 AND 999999999),
 warranty_days INTEGER CHECK(warranty_days BETWEEN 0 AND 3650), warranty_terms TEXT CHECK(length(warranty_terms)<=1000),
 promo_percent INTEGER NOT NULL DEFAULT 0 CHECK(promo_percent BETWEEN 0 AND 90),
 promo_start INTEGER,promo_end INTEGER, promo_terms TEXT CHECK(length(promo_terms)<=500),
 actor_id TEXT NOT NULL REFERENCES users(id),updated_at INTEGER NOT NULL,
 CHECK(promo_percent=0 OR (promo_start IS NOT NULL AND promo_end IS NOT NULL AND promo_end>promo_start AND length(promo_terms)>=4))
);
CREATE TABLE order_policy_snapshots (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),unit_cost INTEGER,warranty_days INTEGER,warranty_terms TEXT,
 promo_percent INTEGER NOT NULL,promo_terms TEXT,captured_at INTEGER NOT NULL
);
CREATE TRIGGER order_policy_snapshot AFTER INSERT ON orders
BEGIN INSERT INTO order_policy_snapshots
 SELECT NEW.id,p.unit_cost,p.warranty_days,p.warranty_terms,
 CASE WHEN p.promo_start<=NEW.created_at AND NEW.created_at<p.promo_end THEN COALESCE(p.promo_percent,0) ELSE 0 END,
 CASE WHEN p.promo_start<=NEW.created_at AND NEW.created_at<p.promo_end THEN p.promo_terms ELSE NULL END,NEW.created_at
 FROM (SELECT 1) LEFT JOIN service_policies p ON p.service_id=NEW.service_id;
END;
CREATE TRIGGER policy_snapshot_immutable BEFORE UPDATE ON order_policy_snapshots BEGIN SELECT RAISE(ABORT,'policy_snapshot_immutable'); END;
CREATE TRIGGER policy_snapshot_no_delete BEFORE DELETE ON order_policy_snapshots BEGIN SELECT RAISE(ABORT,'policy_snapshot_immutable'); END;
CREATE TABLE gear_rewards (
 id TEXT PRIMARY KEY,worker_id TEXT NOT NULL REFERENCES users(id),capital_id TEXT NOT NULL REFERENCES investor_capital(id),
 item TEXT NOT NULL CHECK(length(item) BETWEEN 3 AND 120),amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 999999),
 reference TEXT NOT NULL UNIQUE CHECK(length(reference) BETWEEN 4 AND 80),actor_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,
 UNIQUE(worker_id,capital_id)
);
CREATE TRIGGER gear_investment_guard BEFORE INSERT ON gear_rewards
WHEN NOT EXISTS(SELECT 1 FROM investor_attestations WHERE capital_id=NEW.capital_id)
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.worker_id AND role='worker')
BEGIN SELECT RAISE(ABORT,'gear_not_eligible'); END;
CREATE TABLE account_suspensions (
 user_id TEXT PRIMARY KEY REFERENCES users(id),reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 300),actor_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL
);
CREATE TRIGGER suspension_active_work_guard BEFORE INSERT ON account_suspensions
WHEN EXISTS(SELECT 1 FROM orders WHERE assigned_to=NEW.user_id AND status IN ('claimed','confirmed','processing'))
BEGIN SELECT RAISE(ABORT,'active_work_requires_reassignment'); END;
CREATE TRIGGER suspension_revoke AFTER INSERT ON account_suspensions
BEGIN DELETE FROM sessions WHERE user_id=NEW.user_id; END;
CREATE TRIGGER suspension_session_guard BEFORE INSERT ON sessions
WHEN EXISTS(SELECT 1 FROM account_suspensions WHERE user_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'account_suspended'); END;
CREATE TRIGGER suspension_claim_guard BEFORE UPDATE OF assigned_to ON orders
WHEN NEW.assigned_to IS NOT NULL AND EXISTS(SELECT 1 FROM account_suspensions WHERE user_id=NEW.assigned_to)
BEGIN SELECT RAISE(ABORT,'account_suspended'); END;
