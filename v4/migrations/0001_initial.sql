CREATE TABLE users (
 id TEXT PRIMARY KEY, display_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','worker','seller')),
 created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE orders (
 id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES users(id), service_id TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99), catalog_price TEXT NOT NULL, estimate INTEGER,
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','claimed','confirmed','processing','completed','cancelled')),
 assigned_to TEXT REFERENCES users(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX orders_customer ON orders(customer_id,created_at);
CREATE INDEX orders_status ON orders(status,created_at);
CREATE TABLE audit_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT NOT NULL, created_at INTEGER NOT NULL
);
