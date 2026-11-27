// Bind target status, time, order id, prior status, prior assignee,
// target status x3, then (authorized role, actor id) x3.
// Owner identity is verified against the server configuration in worker.mjs.
// Recheck mutable permissions, payment, evidence, and cancellation conditions
// in the UPDATE itself; a stale pre-read cannot authorize the write.
export const ORDER_TRANSITION_SQL = `
UPDATE orders SET status=?,updated_at=?
WHERE id=? AND status=? AND assigned_to IS ?
AND (? NOT IN ('processing','completed') OR EXISTS(
 SELECT 1 FROM order_finance f WHERE f.order_id=orders.id AND f.state='paid'
))
AND (?<>'completed' OR EXISTS(
 SELECT 1 FROM order_work w WHERE w.order_id=orders.id AND w.worker_id=orders.assigned_to
))
AND (?<>'cancelled' OR (
 NOT EXISTS(SELECT 1 FROM payment_claims WHERE order_id=orders.id)
 AND NOT EXISTS(SELECT 1 FROM order_finance WHERE order_id=orders.id AND state='paid')
))
AND (
 (?='owner' AND EXISTS(SELECT 1 FROM users WHERE id=?))
 OR (?='management' AND EXISTS(SELECT 1 FROM management_grants WHERE user_id=?))
 OR (?='worker' AND EXISTS(SELECT 1 FROM users u WHERE u.id=?
  AND u.id=orders.assigned_to AND u.role='worker'
  AND NOT EXISTS(SELECT 1 FROM management_grants g WHERE g.user_id=u.id)))
)
`;
