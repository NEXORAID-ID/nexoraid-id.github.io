-- A39/A40: owner-authored warranty and scheduled promotion policies.
-- No historical backfill and no fabricated commercial terms.
CREATE TABLE service_policies (
 service_id TEXT PRIMARY KEY, unit_cost INTEGER CHECK(unit_cost BETWEEN 0 AND 999999999),
 warranty_days INTEGER CHECK(warranty_days BETWEEN 0 AND 3650), warranty_terms TEXT CHECK(length(warranty_terms)<=1000),
 promo_percent INTEGER NOT NULL DEFAULT 0 CHECK(promo_percent BETWEEN 0 AND 90),
 promo_start INTEGER,promo_end INTEGER,promo_terms TEXT CHECK(length(promo_terms)<=500),
 promo_min_quantity INTEGER NOT NULL DEFAULT 1 CHECK(promo_min_quantity BETWEEN 1 AND 99),
 actor_id TEXT NOT NULL REFERENCES users(id),updated_at INTEGER NOT NULL,
 CHECK(warranty_days IS NULL OR (warranty_terms IS NOT NULL AND length(trim(warranty_terms))>=4)),
 CHECK(promo_percent=0 OR (promo_start IS NOT NULL AND promo_end IS NOT NULL AND promo_end>promo_start AND promo_terms IS NOT NULL AND length(trim(promo_terms))>=4))
);
CREATE TABLE order_policy_snapshots (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),unit_cost INTEGER,warranty_days INTEGER,warranty_terms TEXT,
 promo_percent INTEGER NOT NULL,promo_terms TEXT,captured_at INTEGER NOT NULL,
 promo_start INTEGER,promo_end INTEGER,promo_min_quantity INTEGER,legacy_promo INTEGER NOT NULL CHECK(legacy_promo IN (0,1))
);
CREATE TRIGGER order_policy_snapshot AFTER INSERT ON orders
BEGIN
 INSERT INTO order_policy_snapshots
 SELECT NEW.id,p.unit_cost,p.warranty_days,p.warranty_terms,
 CASE WHEN NEW.estimate IS NULL THEN 0 WHEN p.service_id IS NULL THEN COALESCE(c.promo_percent,0)
 WHEN p.promo_start<=NEW.created_at AND NEW.created_at<p.promo_end AND NEW.quantity>=p.promo_min_quantity THEN p.promo_percent ELSE 0 END,
 CASE WHEN NEW.estimate IS NULL THEN NULL WHEN p.service_id IS NULL AND COALESCE(c.promo_percent,0)>0 THEN 'Diskon lama; periode belum dikonfirmasi.'
 WHEN p.promo_percent>0 AND p.promo_start<=NEW.created_at AND NEW.created_at<p.promo_end AND NEW.quantity>=p.promo_min_quantity THEN p.promo_terms ELSE NULL END,
 NEW.created_at,
 CASE WHEN NEW.estimate IS NOT NULL AND p.promo_percent>0 AND p.promo_start<=NEW.created_at AND NEW.created_at<p.promo_end AND NEW.quantity>=p.promo_min_quantity THEN p.promo_start END,
 CASE WHEN NEW.estimate IS NOT NULL AND p.promo_percent>0 AND p.promo_start<=NEW.created_at AND NEW.created_at<p.promo_end AND NEW.quantity>=p.promo_min_quantity THEN p.promo_end END,
 CASE WHEN NEW.estimate IS NOT NULL AND p.promo_percent>0 AND p.promo_start<=NEW.created_at AND NEW.created_at<p.promo_end AND NEW.quantity>=p.promo_min_quantity THEN p.promo_min_quantity END,
 CASE WHEN NEW.estimate IS NOT NULL AND p.service_id IS NULL AND COALESCE(c.promo_percent,0)>0 THEN 1 ELSE 0 END
 FROM (SELECT 1) LEFT JOIN service_policies p ON p.service_id=NEW.service_id LEFT JOIN catalog_overrides c ON c.service_id=NEW.service_id;
END;
CREATE TRIGGER policy_snapshot_immutable BEFORE UPDATE ON order_policy_snapshots BEGIN SELECT RAISE(ABORT,'policy_snapshot_immutable'); END;
CREATE TRIGGER policy_snapshot_no_delete BEFORE DELETE ON order_policy_snapshots BEGIN SELECT RAISE(ABORT,'policy_snapshot_immutable'); END;
