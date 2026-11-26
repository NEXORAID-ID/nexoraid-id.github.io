
CREATE TABLE order_attachments (
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),actor_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CHECK(kind IN ('payment','work')),mime TEXT NOT NULL CHECK(mime IN ('image/png','image/jpeg')),
 bytes BLOB NOT NULL CHECK(length(bytes) BETWEEN 16 AND 524288),created_at INTEGER NOT NULL
);
CREATE INDEX attachment_order ON order_attachments(order_id,kind);
CREATE TRIGGER attachment_quota BEFORE INSERT ON order_attachments
WHEN (SELECT COUNT(*) FROM order_attachments WHERE order_id=NEW.order_id AND kind=NEW.kind)>=3
BEGIN SELECT RAISE(ABORT,'attachment_quota'); END;
CREATE TABLE order_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT NOT NULL REFERENCES orders(id),actor_id TEXT NOT NULL REFERENCES users(id),
 visibility TEXT NOT NULL CHECK(visibility IN ('shared','internal')),
 message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 1000),created_at INTEGER NOT NULL
);
CREATE INDEX messages_order ON order_messages(order_id,id);
CREATE TABLE order_plans (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),priority TEXT NOT NULL CHECK(priority IN ('normal','high','urgent')),
 due_at INTEGER NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id),updated_at INTEGER NOT NULL
);
CREATE INDEX plans_due ON order_plans(due_at);
