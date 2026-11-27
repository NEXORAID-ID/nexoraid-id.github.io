-- PROVISIONAL ONLY: integrate into a uniquely numbered migration after the
-- finance/closure candidates are reconciled. Not in the production migration directory.
-- Existing checkout groups deliberately receive no backfill.
CREATE TABLE checkout_service_fees (
 checkout_id TEXT PRIMARY KEY REFERENCES checkout_groups(id),
 amount INTEGER NOT NULL CHECK(amount IN (0,500)),
 created_at INTEGER NOT NULL
);
-- Existing checkout writer creates the group before its orders. Capture only
-- the policy amount here; a confirmed paid quote/invoice is still required.
CREATE TRIGGER checkout_service_fee_snapshot AFTER INSERT ON checkout_groups
BEGIN
 INSERT INTO checkout_service_fees(checkout_id,amount,created_at)
 VALUES(NEW.id,500,NEW.created_at);
END;
CREATE TRIGGER checkout_service_fee_immutable BEFORE UPDATE ON checkout_service_fees
BEGIN SELECT RAISE(ABORT,'checkout_service_fee_immutable'); END;
CREATE TRIGGER checkout_service_fee_no_delete BEFORE DELETE ON checkout_service_fees
BEGIN SELECT RAISE(ABORT,'checkout_service_fee_immutable'); END;
