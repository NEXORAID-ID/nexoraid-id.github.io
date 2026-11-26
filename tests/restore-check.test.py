"""Synthetic nonempty restore regression. No production records or network."""
import importlib.util
import pathlib
import sqlite3
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("restore_check", ROOT / "v4/scripts/restore-check.py")
restore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore)

class RestoreTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        for path in sorted((ROOT / "v4/migrations").glob("*.sql")):
            self.db.executescript(path.read_text())
        self.db.executescript("""
        INSERT INTO users(id,display_name,role,created_at) VALUES
         ('c','synthetic customer','customer',1),('o','synthetic owner','customer',1),('w','synthetic worker','worker',1);
        INSERT INTO sessions VALUES('fixture-session','c',999999);
        INSERT INTO session_metadata VALUES('fixture-session','fixture-public','fixture',1);
        INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,estimate,status,assigned_to,created_at,updated_at)
         VALUES('fixture-order','c','gta-heist',1,'Rp100.000',100000,'confirmed','w',1,1);
        INSERT INTO order_finance(order_id,amount,kind,state,quoted_by,quoted_at,paid_by,paid_at,payment_ref)
         VALUES('fixture-order',100000,'joki','paid','o',1,'o',2,'fixture-payment');
        INSERT INTO order_work(order_id,worker_id,evidence,submitted_at) VALUES('fixture-order','w','synthetic evidence only',3);
        UPDATE orders SET status='completed',updated_at=4 WHERE id='fixture-order';
        """)
        self.db.execute("INSERT INTO order_attachments VALUES(?,?,?,?,?,?,?)",
                        ("fixture-attachment","fixture-order","c","payment","image/png",b"synthetic-attachment-bytes",5))
        self.db.commit()
        self.expected = restore.snapshot(self.db)
        self.dump = "\n".join(self.db.iterdump())
    def tearDown(self):
        self.db.close()
    def test_nonempty_finance_snapshot_and_session_cleanup(self):
        self.assertEqual(self.expected["totals"]["settlement_gross"], 100000)
        self.assertEqual(self.expected["totals"]["worker_share"], 60000)
        self.assertEqual(self.expected["totals"]["owner_share"], 40000)
        self.assertEqual(restore.verify(self.dump,self.expected)["orders"],1)
    def test_source_mismatch(self):
        self.expected["totals"]["verified_invoice_amount"] += 1
        with self.assertRaisesRegex(ValueError,"Source snapshot mismatch"):
            restore.verify(self.dump,self.expected)
    def test_attachment_content_mismatch(self):
        self.expected["attachments"]["fixture-attachment"] = "0" * 64
        with self.assertRaisesRegex(ValueError,"Source snapshot mismatch"):
            restore.verify(self.dump,self.expected)
    def test_malformed_export(self):
        with self.assertRaises(sqlite3.Error):
            restore.verify("not SQL")
    def test_attach_outside_temp_denied(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=pathlib.Path(tmp)/"outside.sqlite"
            with self.assertRaises(sqlite3.Error):
                restore.verify("ATTACH DATABASE '"+str(target)+"' AS outside;")
            self.assertFalse(target.exists())
if __name__ == "__main__":
    unittest.main()
