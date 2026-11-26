-- Durable customer-level closure fence. No historical backfill or deletion.
CREATE TABLE ticket_closure_fences (
 closure_id TEXT PRIMARY KEY,
 customer_id TEXT NOT NULL REFERENCES users(id),
 guild_id TEXT NOT NULL,
 channel_id TEXT NOT NULL,
 ticket_id TEXT NOT NULL,
 started_at INTEGER NOT NULL,
 closed_at INTEGER,
 transcript_channel_id TEXT,
 transcript_message_id TEXT,
 UNIQUE(guild_id,channel_id),
 UNIQUE(guild_id,ticket_id),
 CHECK((closed_at IS NULL AND transcript_channel_id IS NULL AND transcript_message_id IS NULL)
 OR (closed_at IS NOT NULL AND transcript_channel_id IS NOT NULL AND transcript_message_id IS NOT NULL))
);
CREATE UNIQUE INDEX ticket_closure_one_pending ON ticket_closure_fences(customer_id) WHERE closed_at IS NULL;
CREATE TRIGGER ticket_closure_checkout_fence BEFORE INSERT ON orders
 WHEN EXISTS(SELECT 1 FROM ticket_closure_fences f WHERE f.customer_id=NEW.customer_id AND f.closed_at IS NULL)
 BEGIN SELECT RAISE(ABORT,'ticket_closure_pending'); END;
