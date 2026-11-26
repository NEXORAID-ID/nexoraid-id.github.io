-- Independent exact-price SKUs must respect a disabled parent.
CREATE TRIGGER variant_parent_guard BEFORE INSERT ON orders
WHEN instr(NEW.service_id,'-v-')>0 AND EXISTS (
 SELECT 1 FROM catalog_overrides
 WHERE service_id=substr(NEW.service_id,1,instr(NEW.service_id,'-v-')-1) AND enabled=0
)
BEGIN SELECT RAISE(ABORT,'catalog_disabled'); END;
