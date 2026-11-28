"""Synthetic fresh start rehearsal only; no production reset, network or file import."""
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
# Ordered copy: preserve configuration and identity, never copy credentials or transactions.
CONFIG = ("users", "management_grants", "account_suspensions", "catalog_overrides",
          "service_policies", "rental_capacity", "suppliers", "saved_services")
TRANSIENT = {"sessions", "session_metadata", "worker_presence", "api_rate_limits",
             "notification_reads", "customer_cart_drafts"}
ORDER = {"orders", "order_finance", "order_work", "order_settlements", "support_cases",
         "payment_claims", "order_reviews", "order_refunds", "order_ticket_links",
         "rejected_payment_claims", "order_attachments", "order_messages", "order_plans",
         "checkout_groups", "checkout_items", "completed_refunds", "web_ticket_outbox",
         "rental_reservations", "order_policy_snapshots", "order_receipts", "receipt_refunds",
         "ticket_closure_fences", "seller_order_fees", "seller_settlements", "order_cost_basis"}
REVIEW = {"audit_events", "payout_requests", "operating_expenses", "supplier_movements",
          "investor_capital", "investor_distributions", "cash_opening", "investor_attestations",
          "cash_period_closes", "payout_approvals", "investor_post_policies",
          "investor_noncash_bonuses"}
def new_fixture():
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    for path in sorted((ROOT / "v4/migrations").glob("*.sql")):
        db.executescript(path.read_text())
    return db
def inventory(db):
    return {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
def rows(db, table):
    return db.execute(f'SELECT * FROM "{table}" ORDER BY rowid').fetchall()

class FreshStartTests(unittest.TestCase):
    def test_all_schema_tables_classified_and_no_protection_removed(self):
        with new_fixture() as db:
            self.assertEqual(inventory(db), set(CONFIG) | TRANSIENT | ORDER | REVIEW)
            self.assertEqual(len(CONFIG)+len(TRANSIENT)+len(ORDER)+len(REVIEW), len(inventory(db)))
            guards={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='trigger'")}
            for guard in ("policy_snapshot_no_delete","cash_opening_no_delete","receipt_no_delete","seller_settlement_no_delete"):
                self.assertIn(guard,guards)

    def test_nonempty_synthetic_source_preserved_clean_target_and_config_parity(self):
        source,new = new_fixture(),new_fixture()
        try:
            source.executescript("""
            INSERT INTO users(id,display_name,role,created_at) VALUES
              ('c','Synthetic customer','customer',1),('o','Synthetic owner','customer',1),('w','Synthetic worker','worker',1);
            INSERT INTO management_grants VALUES('c',1);
            INSERT INTO catalog_overrides(service_id,amount,enabled,actor_id,updated_at) VALUES('optiwindows',150000,1,'o',1);
            INSERT INTO suppliers VALUES('fixture-supplier','Synthetic supplier',1);
            INSERT INTO saved_services VALUES('c','optiwindows',1);
            INSERT INTO sessions VALUES('fixture-session','c',999999);
            INSERT INTO session_metadata VALUES('fixture-session','fixture-public','fixture',1);
            INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,estimate,status,assigned_to,created_at,updated_at)
              VALUES('fixture-order','c','gta-heist',1,'Rp100.000',100000,'confirmed','w',1,1);
            INSERT INTO order_finance(order_id,amount,kind,state,quoted_by,quoted_at,paid_by,paid_at,payment_ref)
              VALUES('fixture-order',100000,'joki','paid','o',1,'o',2,'fixture-payment');
            INSERT INTO order_work(order_id,worker_id,evidence,submitted_at) VALUES('fixture-order','w','synthetic evidence only',3);
            UPDATE orders SET status='completed',updated_at=4 WHERE id='fixture-order';
            INSERT INTO order_attachments VALUES('fixture-attachment','fixture-order','c','payment','image/png',X'89504E470D0A1A0A0000000D49484452',5);
            INSERT INTO cash_opening VALUES(1,100000,1,'synthetic opening','o',1);
            """)
            before={table:rows(source,table) for table in inventory(source)}
            self.assertEqual(len(before["orders"]),1)
            self.assertEqual(len(before["order_settlements"]),1)
            self.assertEqual(len(before["order_attachments"]),1)
            self.assertEqual(len(before["cash_opening"]),1)
            # Explicitly synthetic test data only. The old DB is never modified.
            for table in CONFIG:
                values=before[table]
                if values:
                    marks=",".join("?" for _ in values[0])
                    new.executemany(f'INSERT INTO "{table}" VALUES({marks})',values)
            new.commit()
            for table in CONFIG:
                self.assertEqual(rows(new,table),before[table],table)
            for table in TRANSIENT | ORDER | REVIEW:
                self.assertEqual(rows(new,table),[],table)
            self.assertEqual(new.execute("SELECT COALESCE(SUM(delta),0) FROM cash_movements").fetchone()[0],0)
            self.assertEqual(new.execute("PRAGMA foreign_key_check").fetchall(),[])
            self.assertEqual(new.execute("PRAGMA integrity_check").fetchall(),[("ok",)])
            self.assertEqual({table:rows(source,table) for table in inventory(source)},before)
            self.assertEqual(new.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").fetchall(),source.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").fetchall())
        finally:
            source.close()
            new.close()

if __name__=="__main__":
    unittest.main()
