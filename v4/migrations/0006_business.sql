
CREATE TABLE catalog_overrides (
 service_id TEXT PRIMARY KEY, amount INTEGER CHECK(amount BETWEEN 1 AND 999999999),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 promo_percent INTEGER NOT NULL DEFAULT 0 CHECK(promo_percent BETWEEN 0 AND 90),
 actor_id TEXT NOT NULL REFERENCES users(id), updated_at INTEGER NOT NULL,
 CHECK(promo_percent=0 OR amount IS NOT NULL)
);
CREATE TABLE suppliers (
 id TEXT PRIMARY KEY,name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 100),created_at INTEGER NOT NULL
);
CREATE TABLE supplier_movements (
 id TEXT PRIMARY KEY,supplier_id TEXT NOT NULL REFERENCES suppliers(id),
 kind TEXT NOT NULL CHECK(kind IN ('deposit','usage','withdrawal')),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 999999999),
 reference TEXT NOT NULL UNIQUE, note TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL
);
CREATE INDEX supplier_movements_supplier ON supplier_movements(supplier_id);
CREATE TRIGGER supplier_balance_guard BEFORE INSERT ON supplier_movements
WHEN NEW.kind<>'deposit' AND NEW.amount>(SELECT COALESCE(SUM(CASE WHEN kind='deposit' THEN amount ELSE -amount END),0) FROM supplier_movements WHERE supplier_id=NEW.supplier_id)
BEGIN SELECT RAISE(ABORT,'supplier_balance_insufficient'); END;
CREATE TABLE investor_capital (
 id TEXT PRIMARY KEY,name TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 999999999),
 reference TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id)
);
CREATE TABLE investor_distributions (
 id TEXT PRIMARY KEY,capital_id TEXT NOT NULL REFERENCES investor_capital(id),period TEXT NOT NULL UNIQUE,
 profit INTEGER NOT NULL CHECK(profit BETWEEN 1 AND 999999999),owner_share INTEGER NOT NULL CHECK(owner_share>=0),
 investor_share INTEGER NOT NULL CHECK(investor_share>=0),principal_return INTEGER NOT NULL CHECK(principal_return>=0),
 reference TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),
 CHECK(profit=owner_share+investor_share+principal_return)
);
CREATE TRIGGER investor_principal_guard BEFORE INSERT ON investor_distributions
WHEN NEW.principal_return>(SELECT amount FROM investor_capital WHERE id=NEW.capital_id)-(SELECT COALESCE(SUM(principal_return),0) FROM investor_distributions WHERE capital_id=NEW.capital_id)
BEGIN SELECT RAISE(ABORT,'principal_exceeded'); END;
CREATE TABLE notification_reads(user_id TEXT PRIMARY KEY REFERENCES users(id),last_id INTEGER NOT NULL CHECK(last_id>=0));
CREATE INDEX audit_target ON audit_events(target_id,id);
CREATE TABLE api_rate_limits(user_id TEXT NOT NULL REFERENCES users(id),bucket INTEGER NOT NULL,hits INTEGER NOT NULL,PRIMARY KEY(user_id,bucket));
