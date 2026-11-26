-- A payment reference cannot be credited twice. Use unique merchant transaction references.
CREATE UNIQUE INDEX order_finance_paid_reference ON order_finance(payment_ref) WHERE state='paid';
