
-- Links only: do not import or infer financial state from legacy Discord tickets.
CREATE TABLE order_ticket_links (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 customer_id TEXT NOT NULL REFERENCES users(id),
 guild_id TEXT NOT NULL,
 channel_id TEXT NOT NULL,
 ticket_id TEXT NOT NULL,
 linked_at INTEGER NOT NULL
);
CREATE INDEX ticket_links_customer ON order_ticket_links(customer_id);
