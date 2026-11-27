-- Approval is not cash payment; retain historic paid rows.
CREATE TABLE payout_approvals (payout_id TEXT PRIMARY KEY REFERENCES payout_requests(id),approved_by TEXT NOT NULL REFERENCES users(id),approved_at INTEGER NOT NULL,reference TEXT NOT NULL CHECK(length(reference) BETWEEN 4 AND 80));
CREATE TRIGGER payout_approval_pending BEFORE INSERT ON payout_approvals WHEN NOT EXISTS(SELECT 1 FROM payout_requests WHERE id=NEW.payout_id AND state='pending') BEGIN SELECT RAISE(ABORT,'payout_not_pending'); END;
CREATE TRIGGER payout_approval_no_update BEFORE UPDATE ON payout_approvals BEGIN SELECT RAISE(ABORT,'approval_immutable'); END;
CREATE TRIGGER payout_approval_no_delete BEFORE DELETE ON payout_approvals BEGIN SELECT RAISE(ABORT,'approval_immutable'); END;
CREATE TRIGGER payout_paid_requires_approval BEFORE UPDATE OF state ON payout_requests WHEN NEW.state='paid' AND OLD.state<>'paid' AND NOT EXISTS(SELECT 1 FROM payout_approvals WHERE payout_id=NEW.id) BEGIN SELECT RAISE(ABORT,'payout_approval_required'); END;
CREATE TRIGGER payout_initial_pending BEFORE INSERT ON payout_requests WHEN NEW.state<>'pending' BEGIN SELECT RAISE(ABORT,'payout_initial_pending'); END;
