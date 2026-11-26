-- New orders only; no historical backfill.
CREATE TABLE web_ticket_outbox (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 next_attempt INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 lease_token TEXT, lease_until INTEGER,
 channel_id TEXT, message_id TEXT, delivered_at INTEGER,
 CHECK((lease_token IS NULL)=(lease_until IS NULL)),
 CHECK((channel_id IS NULL)=(message_id IS NULL)),
 CHECK((message_id IS NULL)=(delivered_at IS NULL))
);
CREATE INDEX web_ticket_outbox_pending ON web_ticket_outbox(next_attempt,lease_until) WHERE delivered_at IS NULL;
CREATE TRIGGER web_ticket_order_insert AFTER INSERT ON orders BEGIN
 INSERT INTO web_ticket_outbox(order_id) VALUES(NEW.id);
END;
