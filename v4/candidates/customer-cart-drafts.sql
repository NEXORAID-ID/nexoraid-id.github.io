-- Candidate only. Promote to sequential migration after encrypted backup/restore evidence.
CREATE TABLE customer_cart_drafts (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 revision TEXT NOT NULL CHECK(length(revision)=36),
 items TEXT NOT NULL CHECK(length(items) BETWEEN 2 AND 2048),
 updated_at INTEGER NOT NULL
);
