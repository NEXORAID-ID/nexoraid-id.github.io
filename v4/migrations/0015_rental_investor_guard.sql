-- No legacy backfill. Owner attests real agreement and actual receipt separately.
CREATE TABLE investor_attestations (
 capital_id TEXT PRIMARY KEY REFERENCES investor_capital(id), agreement_reference TEXT NOT NULL CHECK(length(agreement_reference) BETWEEN 4 AND 120), actor_id TEXT NOT NULL REFERENCES users(id), confirmed_at INTEGER NOT NULL
);
CREATE TRIGGER investor_attestation_immutable BEFORE UPDATE ON investor_attestations BEGIN SELECT RAISE(ABORT,'agreement_immutable'); END;
CREATE TRIGGER investor_attestation_no_delete BEFORE DELETE ON investor_attestations BEGIN SELECT RAISE(ABORT,'agreement_immutable'); END;
CREATE TRIGGER investor_distribution_attestation BEFORE INSERT ON investor_distributions
WHEN NOT EXISTS(SELECT 1 FROM investor_attestations WHERE capital_id=NEW.capital_id)
BEGIN SELECT RAISE(ABORT,'agreement_required'); END;
-- Independent capacity pools, measured in 30-day packages; owner deducts pre-existing commitments.
CREATE TABLE rental_capacity (
 service_id TEXT PRIMARY KEY CHECK(service_id IN ('cherax-rental-standard','cherax-rental-premium')),
 units INTEGER NOT NULL CHECK(units BETWEEN 0 AND 10000), reference TEXT NOT NULL CHECK(length(reference) BETWEEN 4 AND 120), actor_id TEXT NOT NULL REFERENCES users(id), updated_at INTEGER NOT NULL
);
CREATE TABLE rental_reservations (
 order_id TEXT PRIMARY KEY REFERENCES orders(id), service_id TEXT NOT NULL REFERENCES rental_capacity(service_id), units INTEGER NOT NULL CHECK(units BETWEEN 1 AND 99), release_at INTEGER
);
CREATE INDEX rental_reservation_service ON rental_reservations(service_id,release_at);
CREATE TRIGGER rental_capacity_guard BEFORE UPDATE OF units ON rental_capacity
WHEN NEW.units<(SELECT COALESCE(SUM(units),0) FROM rental_reservations WHERE service_id=NEW.service_id AND (release_at IS NULL OR release_at>unixepoch()))
BEGIN SELECT RAISE(ABORT,'rental_capacity_below_reserved'); END;
CREATE TRIGGER rental_order_capacity BEFORE INSERT ON orders
WHEN EXISTS(SELECT 1 FROM rental_capacity WHERE service_id=NEW.service_id)
 AND NEW.quantity>(SELECT units FROM rental_capacity WHERE service_id=NEW.service_id)-(SELECT COALESCE(SUM(units),0) FROM rental_reservations WHERE service_id=NEW.service_id AND (release_at IS NULL OR release_at>unixepoch()))
BEGIN SELECT RAISE(ABORT,'rental_stock_unavailable'); END;
CREATE TRIGGER rental_reserve AFTER INSERT ON orders
WHEN EXISTS(SELECT 1 FROM rental_capacity WHERE service_id=NEW.service_id)
BEGIN INSERT INTO rental_reservations(order_id,service_id,units) VALUES(NEW.id,NEW.service_id,NEW.quantity); END;
CREATE TRIGGER rental_release AFTER UPDATE OF status ON orders
WHEN OLD.status<>NEW.status AND NEW.status IN ('completed','cancelled')
BEGIN UPDATE rental_reservations SET release_at=unixepoch()+CASE WHEN NEW.status='completed' THEN 2592000 ELSE 0 END WHERE order_id=NEW.id AND release_at IS NULL; END;
