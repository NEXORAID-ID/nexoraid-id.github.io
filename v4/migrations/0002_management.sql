-- Add management grants without rebuilding users or altering existing orders.
CREATE TABLE management_grants (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 granted_at INTEGER NOT NULL
);
