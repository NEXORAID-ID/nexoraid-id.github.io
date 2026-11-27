-- Explicit seller commission, actual cost attribution, signed post-repayment policy and noncash bonus.
-- Preserve all old rows; no fee or cost is invented for historical orders.
CREATE TABLE seller_order_fees (
 order_id TEXT PRIMARY KEY REFERENCES order_finance(order_id), amount INTEGER NOT NULL CHECK(amount BETWEEN 0 AND 999999999),
 reference TEXT NOT NULL CHECK(length(reference) BETWEEN 4 AND 80), actor_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL
);
CREATE TRIGGER seller_fee_guard BEFORE INSERT ON seller_order_fees
WHEN NOT EXISTS(SELECT 1 FROM order_finance f JOIN orders o ON o.id=f.order_id WHERE f.order_id=NEW.order_id AND f.kind='seller' AND NEW.amount<=f.amount AND o.status IN ('claimed','confirmed','processing'))
BEGIN SELECT RAISE(ABORT,'seller_fee_invalid'); END;
CREATE TRIGGER seller_fee_no_update BEFORE UPDATE ON seller_order_fees BEGIN SELECT RAISE(ABORT,'seller_fee_immutable'); END;
CREATE TRIGGER seller_fee_no_delete BEFORE DELETE ON seller_order_fees BEGIN SELECT RAISE(ABORT,'seller_fee_immutable'); END;
CREATE TRIGGER seller_fee_invoice_guard BEFORE UPDATE OF amount ON order_finance
WHEN EXISTS(SELECT 1 FROM seller_order_fees WHERE order_id=OLD.order_id AND amount>NEW.amount)
BEGIN SELECT RAISE(ABORT,'seller_fee_exceeds_invoice'); END;
CREATE TABLE seller_settlements (
 order_id TEXT PRIMARY KEY REFERENCES orders(id), worker_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL DEFAULT 'seller' CHECK(kind='seller'),gross INTEGER NOT NULL CHECK(gross>0),
 worker_share INTEGER NOT NULL CHECK(worker_share>=0),owner_share INTEGER NOT NULL CHECK(owner_share>=0),created_at INTEGER NOT NULL,
 CHECK(gross=worker_share+owner_share)
);
CREATE TRIGGER seller_fee_before_complete BEFORE UPDATE OF status ON orders
WHEN NEW.status='completed' AND OLD.status<>NEW.status AND EXISTS(SELECT 1 FROM order_finance WHERE order_id=NEW.id AND kind='seller')
 AND NOT EXISTS(SELECT 1 FROM seller_order_fees WHERE order_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'seller_fee_required'); END;
CREATE TRIGGER seller_settlement_complete AFTER UPDATE OF status ON orders
WHEN NEW.status='completed' AND OLD.status<>NEW.status
BEGIN INSERT INTO seller_settlements SELECT NEW.id,NEW.assigned_to,'seller',f.amount,s.amount,f.amount-s.amount,NEW.updated_at FROM order_finance f JOIN seller_order_fees s ON s.order_id=f.order_id WHERE f.order_id=NEW.id AND f.kind='seller' AND f.state='paid'; END;
CREATE TRIGGER seller_settlement_no_update BEFORE UPDATE ON seller_settlements BEGIN SELECT RAISE(ABORT,'settlement_immutable'); END;
CREATE TRIGGER seller_settlement_no_delete BEFORE DELETE ON seller_settlements BEGIN SELECT RAISE(ABORT,'settlement_immutable'); END;
CREATE VIEW all_order_settlements AS SELECT order_id,worker_id,kind,gross,worker_share,owner_share,created_at FROM order_settlements UNION ALL SELECT order_id,worker_id,kind,gross,worker_share,owner_share,created_at FROM seller_settlements;
DROP TRIGGER payout_balance_guard;
CREATE TRIGGER payout_balance_guard BEFORE INSERT ON payout_requests
WHEN NEW.amount>(SELECT COALESCE(SUM(worker_share),0) FROM all_order_settlements WHERE worker_id=NEW.worker_id)-(SELECT COALESCE(SUM(amount),0) FROM payout_requests WHERE worker_id=NEW.worker_id AND state IN ('pending','paid'))
BEGIN SELECT RAISE(ABORT,'insufficient_balance'); END;
CREATE TABLE order_cost_basis (
 order_id TEXT PRIMARY KEY REFERENCES order_finance(order_id), amount INTEGER NOT NULL CHECK(amount BETWEEN 0 AND 999999999),
 reference TEXT NOT NULL CHECK(length(reference) BETWEEN 4 AND 80), note TEXT NOT NULL CHECK(length(note) BETWEEN 3 AND 200),
 actor_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL
);
CREATE TRIGGER cost_basis_guard BEFORE INSERT ON order_cost_basis
WHEN NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND status IN ('claimed','confirmed','processing','completed'))
BEGIN SELECT RAISE(ABORT,'cost_basis_invalid'); END;
CREATE TRIGGER cost_basis_no_update BEFORE UPDATE ON order_cost_basis BEGIN SELECT RAISE(ABORT,'cost_basis_immutable'); END;
CREATE TRIGGER cost_basis_no_delete BEFORE DELETE ON order_cost_basis BEGIN SELECT RAISE(ABORT,'cost_basis_immutable'); END;
CREATE TABLE investor_post_policies (
 capital_id TEXT PRIMARY KEY REFERENCES investor_capital(id), investor_percent INTEGER NOT NULL CHECK(investor_percent BETWEEN 0 AND 100),
 agreement_reference TEXT NOT NULL CHECK(length(agreement_reference) BETWEEN 4 AND 120),
 actor_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL
);
CREATE TRIGGER investor_post_policy_guard BEFORE INSERT ON investor_post_policies
WHEN NOT EXISTS(SELECT 1 FROM investor_capital c JOIN investor_attestations a ON a.capital_id=c.id WHERE c.id=NEW.capital_id AND c.amount=(SELECT COALESCE(SUM(principal_return),0) FROM investor_distributions WHERE capital_id=c.id))
BEGIN SELECT RAISE(ABORT,'investor_not_repaid'); END;
CREATE TRIGGER investor_policy_conflict BEFORE INSERT ON investor_post_policies
WHEN NEW.investor_percent>0 AND (EXISTS(SELECT 1 FROM investor_post_policies WHERE capital_id<>NEW.capital_id AND investor_percent>0) OR EXISTS(SELECT 1 FROM investor_capital c WHERE c.id<>NEW.capital_id AND c.amount>(SELECT COALESCE(SUM(principal_return),0) FROM investor_distributions WHERE capital_id=c.id)))
BEGIN SELECT RAISE(ABORT,'investor_policy_conflict'); END;
CREATE TRIGGER investor_capital_policy_conflict BEFORE INSERT ON investor_capital
WHEN EXISTS(SELECT 1 FROM investor_post_policies WHERE investor_percent>0)
BEGIN SELECT RAISE(ABORT,'investor_policy_conflict'); END;
CREATE TRIGGER investor_post_policy_no_update BEFORE UPDATE ON investor_post_policies BEGIN SELECT RAISE(ABORT,'policy_immutable'); END;
CREATE TRIGGER investor_post_policy_no_delete BEFORE DELETE ON investor_post_policies BEGIN SELECT RAISE(ABORT,'policy_immutable'); END;
CREATE TRIGGER investor_distribution_post_guard BEFORE INSERT ON investor_distributions
WHEN (SELECT amount FROM investor_capital WHERE id=NEW.capital_id)=(SELECT COALESCE(SUM(principal_return),0) FROM investor_distributions WHERE capital_id=NEW.capital_id)
AND NOT EXISTS(SELECT 1 FROM investor_post_policies p WHERE p.capital_id=NEW.capital_id AND p.investor_percent>0 AND NEW.principal_return=0 AND NEW.investor_share=(NEW.profit*p.investor_percent)/100)
BEGIN SELECT RAISE(ABORT,'post_repayment_policy_required'); END;
CREATE TABLE investor_noncash_bonuses (
 id TEXT PRIMARY KEY,capital_id TEXT NOT NULL REFERENCES investor_capital(id),
 item TEXT NOT NULL CHECK(length(item) BETWEEN 3 AND 120), quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 1000),
 value_amount INTEGER NOT NULL CHECK(value_amount BETWEEN 1 AND 999999999), reference TEXT NOT NULL UNIQUE CHECK(length(reference) BETWEEN 4 AND 80),
 expense_id TEXT UNIQUE REFERENCES operating_expenses(id), actor_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL
);
CREATE TRIGGER bonus_expense_guard BEFORE INSERT ON investor_noncash_bonuses
WHEN NEW.expense_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM operating_expenses WHERE id=NEW.expense_id AND amount<=NEW.value_amount)
BEGIN SELECT RAISE(ABORT,'bonus_expense_invalid'); END;
CREATE TRIGGER bonus_no_update BEFORE UPDATE ON investor_noncash_bonuses BEGIN SELECT RAISE(ABORT,'bonus_immutable'); END;
CREATE TRIGGER bonus_no_delete BEFORE DELETE ON investor_noncash_bonuses BEGIN SELECT RAISE(ABORT,'bonus_immutable'); END;

CREATE TRIGGER bonus_single_set_budget BEFORE INSERT ON investor_noncash_bonuses
WHEN NEW.quantity<>1 OR NEW.value_amount>=1000000
BEGIN SELECT RAISE(ABORT,'bonus_set_budget_invalid'); END;
