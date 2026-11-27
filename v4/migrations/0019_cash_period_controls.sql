-- Cash-basis period close and cross-ledger reference control. No historical rewrite.
CREATE TABLE cash_period_closes (
 end_at INTEGER PRIMARY KEY,
 start_at INTEGER NOT NULL,
 incoming INTEGER NOT NULL CHECK(incoming>=0),
 outgoing INTEGER NOT NULL CHECK(outgoing>=0),
 closing_balance INTEGER NOT NULL,
 movement_count INTEGER NOT NULL CHECK(movement_count>=0),
 reference TEXT NOT NULL UNIQUE CHECK(length(reference) BETWEEN 4 AND 80),
 actor_id TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL,
 CHECK(end_at>start_at AND end_at<created_at)
);
CREATE TRIGGER cash_period_close_guard BEFORE INSERT ON cash_period_closes
WHEN NOT EXISTS(SELECT 1 FROM cash_opening WHERE id=1)
 OR NEW.start_at<>COALESCE((SELECT MAX(end_at) FROM cash_period_closes),(SELECT effective_at FROM cash_opening WHERE id=1))
 OR EXISTS(SELECT 1 FROM cash_movements WHERE event_at>(SELECT effective_at FROM cash_opening WHERE id=1) AND event_at<=NEW.end_at AND (reference IS NULL OR length(trim(reference))<4))
 OR EXISTS(SELECT 1 FROM cash_movements WHERE event_at<=NEW.end_at AND reference IS NOT NULL GROUP BY trim(reference) HAVING COUNT(*)>1)
 OR NEW.incoming<>(SELECT COALESCE(SUM(CASE WHEN delta>0 THEN delta ELSE 0 END),0) FROM cash_movements WHERE event_at>NEW.start_at AND event_at<=NEW.end_at)
 OR NEW.outgoing<>(SELECT COALESCE(SUM(CASE WHEN delta<0 THEN -delta ELSE 0 END),0) FROM cash_movements WHERE event_at>NEW.start_at AND event_at<=NEW.end_at)
 OR NEW.movement_count<>(SELECT COUNT(*) FROM cash_movements WHERE event_at>NEW.start_at AND event_at<=NEW.end_at)
 OR NEW.closing_balance<>(SELECT amount FROM cash_opening WHERE id=1)+(SELECT COALESCE(SUM(delta),0) FROM cash_movements WHERE event_at>(SELECT effective_at FROM cash_opening WHERE id=1) AND event_at<=NEW.end_at)
BEGIN SELECT RAISE(ABORT,'cash_close_conflict'); END;
CREATE TRIGGER cash_period_no_update BEFORE UPDATE ON cash_period_closes BEGIN SELECT RAISE(ABORT,'cash_close_immutable'); END;
CREATE TRIGGER cash_period_no_delete BEFORE DELETE ON cash_period_closes BEGIN SELECT RAISE(ABORT,'cash_close_immutable'); END;
CREATE TRIGGER cash_guard_order_finance_insert BEFORE INSERT ON order_finance WHEN NEW.state='paid' BEGIN SELECT CASE WHEN NEW.paid_at IS NULL OR NEW.paid_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN NEW.payment_ref IS NULL OR length(trim(NEW.payment_ref))<4 OR EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.payment_ref)) THEN RAISE(ABORT,'cash_reference_conflict') END; END;
CREATE TRIGGER cash_guard_order_finance_update BEFORE UPDATE ON order_finance WHEN (OLD.state='paid') OR (NEW.state='paid') BEGIN
 SELECT CASE WHEN (OLD.state='paid') THEN RAISE(ABORT,'cash_movement_immutable') END;
 SELECT CASE WHEN NEW.paid_at IS NULL OR NEW.paid_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN NEW.payment_ref IS NULL OR length(trim(NEW.payment_ref))<4 OR EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.payment_ref)) THEN RAISE(ABORT,'cash_reference_conflict') END;
END;
CREATE TRIGGER cash_guard_order_finance_delete BEFORE DELETE ON order_finance WHEN OLD.state='paid' BEGIN SELECT RAISE(ABORT,'cash_movement_immutable'); END;
CREATE TRIGGER cash_guard_order_refunds_insert BEFORE INSERT ON order_refunds WHEN 1 BEGIN SELECT CASE WHEN NEW.created_at IS NULL OR NEW.created_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN NEW.reference IS NULL OR length(trim(NEW.reference))<4 OR EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.reference)) THEN RAISE(ABORT,'cash_reference_conflict') END; END;
CREATE TRIGGER cash_guard_order_refunds_update BEFORE UPDATE ON order_refunds WHEN (1) OR (1) BEGIN
 SELECT CASE WHEN (1) THEN RAISE(ABORT,'cash_movement_immutable') END;
 SELECT CASE WHEN NEW.created_at IS NULL OR NEW.created_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN NEW.reference IS NULL OR length(trim(NEW.reference))<4 OR EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.reference)) THEN RAISE(ABORT,'cash_reference_conflict') END;
END;
CREATE TRIGGER cash_guard_order_refunds_delete BEFORE DELETE ON order_refunds WHEN 1 BEGIN SELECT RAISE(ABORT,'cash_movement_immutable'); END;
CREATE TRIGGER cash_guard_completed_refunds_insert BEFORE INSERT ON completed_refunds WHEN 1 BEGIN SELECT CASE WHEN NEW.created_at IS NULL OR NEW.created_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN NEW.reference IS NULL OR length(trim(NEW.reference))<4 OR EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.reference)) THEN RAISE(ABORT,'cash_reference_conflict') END; END;
CREATE TRIGGER cash_guard_completed_refunds_update BEFORE UPDATE ON completed_refunds WHEN (1) OR (1) BEGIN
 SELECT CASE WHEN (1) THEN RAISE(ABORT,'cash_movement_immutable') END;
 SELECT CASE WHEN NEW.created_at IS NULL OR NEW.created_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN NEW.reference IS NULL OR length(trim(NEW.reference))<4 OR EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.reference)) THEN RAISE(ABORT,'cash_reference_conflict') END;
END;
CREATE TRIGGER cash_guard_completed_refunds_delete BEFORE DELETE ON completed_refunds WHEN 1 BEGIN SELECT RAISE(ABORT,'cash_movement_immutable'); END;
CREATE TRIGGER cash_guard_payout_requests_insert BEFORE INSERT ON payout_requests WHEN NEW.state='paid' BEGIN SELECT CASE WHEN NEW.reviewed_at IS NULL OR NEW.reviewed_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN NEW.reference IS NULL OR length(trim(NEW.reference))<4 OR EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.reference)) THEN RAISE(ABORT,'cash_reference_conflict') END; END;
CREATE TRIGGER cash_guard_payout_requests_update BEFORE UPDATE ON payout_requests WHEN (OLD.state='paid') OR (NEW.state='paid') BEGIN
 SELECT CASE WHEN (OLD.state='paid') THEN RAISE(ABORT,'cash_movement_immutable') END;
 SELECT CASE WHEN NEW.reviewed_at IS NULL OR NEW.reviewed_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN NEW.reference IS NULL OR length(trim(NEW.reference))<4 OR EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.reference)) THEN RAISE(ABORT,'cash_reference_conflict') END;
END;
CREATE TRIGGER cash_guard_payout_requests_delete BEFORE DELETE ON payout_requests WHEN OLD.state='paid' BEGIN SELECT RAISE(ABORT,'cash_movement_immutable'); END;
CREATE TRIGGER cash_guard_operating_expenses_insert BEFORE INSERT ON operating_expenses WHEN 1 BEGIN SELECT CASE WHEN NEW.created_at IS NULL OR NEW.created_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN NEW.reference IS NULL OR length(trim(NEW.reference))<4 OR EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.reference)) THEN RAISE(ABORT,'cash_reference_conflict') END; END;
CREATE TRIGGER cash_guard_operating_expenses_update BEFORE UPDATE ON operating_expenses WHEN (1) OR (1) BEGIN
 SELECT CASE WHEN (1) THEN RAISE(ABORT,'cash_movement_immutable') END;
 SELECT CASE WHEN NEW.created_at IS NULL OR NEW.created_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN NEW.reference IS NULL OR length(trim(NEW.reference))<4 OR EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.reference)) THEN RAISE(ABORT,'cash_reference_conflict') END;
END;
CREATE TRIGGER cash_guard_operating_expenses_delete BEFORE DELETE ON operating_expenses WHEN 1 BEGIN SELECT RAISE(ABORT,'cash_movement_immutable'); END;
CREATE TRIGGER cash_guard_supplier_movements_insert BEFORE INSERT ON supplier_movements WHEN NEW.kind IN ('deposit','withdrawal') BEGIN SELECT CASE WHEN NEW.created_at IS NULL OR NEW.created_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN NEW.reference IS NULL OR length(trim(NEW.reference))<4 OR EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.reference)) THEN RAISE(ABORT,'cash_reference_conflict') END; END;
CREATE TRIGGER cash_guard_supplier_movements_update BEFORE UPDATE ON supplier_movements WHEN (OLD.kind IN ('deposit','withdrawal')) OR (NEW.kind IN ('deposit','withdrawal')) BEGIN
 SELECT CASE WHEN (OLD.kind IN ('deposit','withdrawal')) THEN RAISE(ABORT,'cash_movement_immutable') END;
 SELECT CASE WHEN NEW.created_at IS NULL OR NEW.created_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN NEW.reference IS NULL OR length(trim(NEW.reference))<4 OR EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.reference)) THEN RAISE(ABORT,'cash_reference_conflict') END;
END;
CREATE TRIGGER cash_guard_supplier_movements_delete BEFORE DELETE ON supplier_movements WHEN OLD.kind IN ('deposit','withdrawal') BEGIN SELECT RAISE(ABORT,'cash_movement_immutable'); END;
CREATE TRIGGER cash_guard_investor_capital_insert BEFORE INSERT ON investor_capital WHEN 1 BEGIN SELECT CASE WHEN NEW.created_at IS NULL OR NEW.created_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN NEW.reference IS NULL OR length(trim(NEW.reference))<4 OR EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.reference)) THEN RAISE(ABORT,'cash_reference_conflict') END; END;
CREATE TRIGGER cash_guard_investor_capital_update BEFORE UPDATE ON investor_capital WHEN (1) OR (1) BEGIN
 SELECT CASE WHEN (1) THEN RAISE(ABORT,'cash_movement_immutable') END;
 SELECT CASE WHEN NEW.created_at IS NULL OR NEW.created_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN NEW.reference IS NULL OR length(trim(NEW.reference))<4 OR EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.reference)) THEN RAISE(ABORT,'cash_reference_conflict') END;
END;
CREATE TRIGGER cash_guard_investor_capital_delete BEFORE DELETE ON investor_capital WHEN 1 BEGIN SELECT RAISE(ABORT,'cash_movement_immutable'); END;
CREATE TRIGGER cash_guard_investor_distributions_insert BEFORE INSERT ON investor_distributions WHEN 1 BEGIN SELECT CASE WHEN NEW.created_at IS NULL OR NEW.created_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN NEW.reference IS NULL OR length(trim(NEW.reference))<4 OR EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.reference)) THEN RAISE(ABORT,'cash_reference_conflict') END; END;
CREATE TRIGGER cash_guard_investor_distributions_update BEFORE UPDATE ON investor_distributions WHEN (1) OR (1) BEGIN
 SELECT CASE WHEN (1) THEN RAISE(ABORT,'cash_movement_immutable') END;
 SELECT CASE WHEN NEW.created_at IS NULL OR NEW.created_at<=COALESCE((SELECT MAX(end_at) FROM cash_period_closes),-1) THEN RAISE(ABORT,'cash_period_closed') END;
 SELECT CASE WHEN NEW.reference IS NULL OR length(trim(NEW.reference))<4 OR EXISTS(SELECT 1 FROM cash_movements WHERE trim(reference)=trim(NEW.reference)) THEN RAISE(ABORT,'cash_reference_conflict') END;
END;
CREATE TRIGGER cash_guard_investor_distributions_delete BEFORE DELETE ON investor_distributions WHEN 1 BEGIN SELECT RAISE(ABORT,'cash_movement_immutable'); END;
