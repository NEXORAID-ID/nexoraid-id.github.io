-- Nullable for existing orders and legacy clients; no historical records rewritten.
ALTER TABLE orders ADD COLUMN request_key TEXT;
CREATE UNIQUE INDEX orders_customer_request_key ON orders(customer_id,request_key);
