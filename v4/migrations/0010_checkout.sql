
CREATE TABLE saved_services(user_id TEXT NOT NULL REFERENCES users(id),service_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,service_id));
CREATE TABLE checkout_groups(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,signature TEXT NOT NULL,item_count INTEGER NOT NULL CHECK(item_count BETWEEN 1 AND 5),created_at INTEGER NOT NULL,UNIQUE(customer_id,request_id));
CREATE TABLE checkout_items(checkout_id TEXT NOT NULL REFERENCES checkout_groups(id),order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),PRIMARY KEY(checkout_id,order_id));
CREATE TRIGGER checkout_quota BEFORE INSERT ON checkout_groups WHEN NEW.item_count+(SELECT COUNT(*) FROM orders WHERE customer_id=NEW.customer_id AND created_at>=NEW.created_at-3600)>5 BEGIN SELECT RAISE(ABORT,'checkout_quota'); END;
CREATE TRIGGER disabled_catalog_guard BEFORE INSERT ON orders WHEN EXISTS(SELECT 1 FROM catalog_overrides WHERE service_id=NEW.service_id AND enabled=0) BEGIN SELECT RAISE(ABORT,'catalog_disabled'); END;
CREATE TABLE session_metadata(token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,public_id TEXT NOT NULL UNIQUE,device TEXT NOT NULL,created_at INTEGER NOT NULL);
INSERT INTO session_metadata SELECT token_hash,lower(hex(randomblob(16))),'Sesi sebelumnya',0 FROM sessions;
CREATE TRIGGER session_metadata_cleanup AFTER DELETE ON sessions BEGIN DELETE FROM session_metadata WHERE token_hash=OLD.token_hash; END;
