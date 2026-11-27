-- Candidate 0024; integrate only after validating 0019–0023 against actual D1.
CREATE TABLE account_suspensions (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 suspended_by TEXT NOT NULL REFERENCES users(id),
 suspended_at INTEGER NOT NULL CHECK(suspended_at>=0)
);
CREATE TRIGGER suspension_revoke_sessions AFTER INSERT ON account_suspensions
BEGIN
 DELETE FROM sessions WHERE user_id=NEW.user_id;
END;
CREATE TRIGGER suspended_session_insert BEFORE INSERT ON sessions
WHEN EXISTS(SELECT 1 FROM account_suspensions WHERE user_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'account_suspended'); END;
CREATE TRIGGER suspended_session_update BEFORE UPDATE ON sessions
WHEN EXISTS(SELECT 1 FROM account_suspensions WHERE user_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'account_suspended'); END;
