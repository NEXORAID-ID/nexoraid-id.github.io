-- Additive durable delivery queue. No historical orders are reopened.
CREATE TABLE web_ticket_outbox (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 next_attempt INTEGER NOT NULL DEFAULT 0,
 channel_id TEXT,
 message_id TEXT,
 CHECK ((channel_id IS NULL AND message_id IS NULL) OR (channel_id IS NOT NULL AND message_id IS NOT NULL))
);
CREATE INDEX web_ticket_outbox_pending ON web_ticket_outbox(next_attempt) WHERE message_id IS NULL;
CREATE TRIGGER web_ticket_order_insert AFTER INSERT ON orders
BEGIN
 INSERT INTO web_ticket_outbox(order_id) VALUES(NEW.id);
END;
