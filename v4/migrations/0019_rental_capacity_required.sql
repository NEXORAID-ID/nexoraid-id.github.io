-- Fail closed for new rental orders; historical rows are not rewritten.
CREATE TRIGGER rental_capacity_required BEFORE INSERT ON orders
WHEN NEW.service_id IN ('cherax-rental-standard','cherax-rental-premium')
 AND NOT EXISTS(SELECT 1 FROM rental_capacity WHERE service_id=NEW.service_id)
BEGIN SELECT RAISE(ABORT,'rental_stock_unavailable'); END;
