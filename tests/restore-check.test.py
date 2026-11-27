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
    schema_limit = None
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        for path in sorted((ROOT / "v4/migrations").glob("*.sql")):
            if self.schema_limit is None or int(path.name[:4]) <= self.schema_limit:
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
class OwnerBackupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("finance_backup", ROOT / "v4/scripts/finance-backup.py")
        cls.helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.helper)

    def test_pending_digest_matches_node_gate_byte_for_byte(self):
        import hashlib
        from unittest.mock import patch
        sha="a"*40
        name="0016_installment_ledger.sql"
        baseline=[f"{n:04d}_fixture.sql" for n in range(1,16)]
        sql=b"CREATE TABLE fixture(id TEXT);\n"
        def git(args):
            if args[1]=="rev-parse": return (sha+"\n").encode()
            if args[1]=="ls-tree": return ("\n".join(baseline+[name])+"\n").encode()
            if args[1]=="show": return sql
            raise AssertionError("unexpected command")
        with patch.object(self.helper,"run",side_effect=git):
            self.assertEqual(self.helper.pending_digest("fixture",baseline),
                ([name],hashlib.sha256(name.encode()+b"\0"+sql+b"\0").hexdigest()))
            with self.assertRaisesRegex(ValueError,"Divergent migration"):
                self.helper.pending_digest("fixture",["0015_other.sql"])
            with self.assertRaisesRegex(ValueError,"baseline not applied"):
                self.helper.pending_digest("fixture",baseline[:-1])
            with self.assertRaisesRegex(ValueError,"Divergent migration"):
                self.helper.pending_digest("fixture",baseline[:-2]+[baseline[-1]])
        for suffix in [["0017_gap.sql"],["0016_one.sql","0016_two.sql"]]:
            def invalid_git(args):
                if args[1]=="rev-parse": return (sha+"\n").encode()
                if args[1]=="ls-tree": return ("\n".join(baseline+suffix)+"\n").encode()
                raise AssertionError("must reject before digest")
            with patch.object(self.helper,"run",side_effect=invalid_git):
                with self.assertRaisesRegex(ValueError,"gap or duplicate"):
                    self.helper.pending_digest("fixture",baseline)

    def test_source_attachment_hash_is_independent_and_chunked(self):
        import hashlib
        from unittest.mock import patch
        data=b"a"*65536+b"z"*20
        def scalar(sql):
            if sql.startswith("SELECT length(bytes)"): return len(data)
            return 1 if "order_attachments" in sql else 0
        def query(sql):
            if sql.startswith("SELECT id"): return [{"id":"fixture"}]
            if "substr(bytes,1,65536)" in sql: return [{"data":data[:65536].hex()}]
            if "substr(bytes,65537,65536)" in sql: return [{"data":data[65536:].hex()}]
            raise AssertionError("unexpected query")
        with patch.object(self.helper,"scalar",side_effect=scalar), patch.object(self.helper,"query",side_effect=query):
            self.assertEqual(self.helper.source_snapshot()["attachments"],{"fixture":hashlib.sha256(data).hexdigest()})
        with patch.object(self.helper,"scalar",side_effect=scalar), patch.object(self.helper,"query",return_value=[]):
            with self.assertRaisesRegex(ValueError,"Attachment inventory"):
                self.helper.source_snapshot()


class RecoveryDrill(unittest.TestCase):
    def test_pre_upgrade_backup_recovers_populated_baseline_without_touching_source(self):
        # All three databases are local synthetic fixtures, never Cloudflare D1.
        fixture = RestoreTests("test_nonempty_finance_snapshot_and_session_cleanup")
        fixture.schema_limit = 15
        fixture.setUp()
        self.addCleanup(fixture.tearDown)
        source = fixture.db
        original = fixture.expected
        with tempfile.TemporaryDirectory(prefix="nexoraid-recovery-drill-") as tmp:
            root = pathlib.Path(tmp)
            backup_path = root / "before-upgrade.sqlite"
            with sqlite3.connect(backup_path) as backup:
                source.backup(backup)
            with sqlite3.connect(root / "candidate.sqlite") as candidate:
                with sqlite3.connect(backup_path) as backup:
                    backup.backup(candidate)
                candidate.execute("PRAGMA foreign_keys=ON")
                migrations = [p for p in sorted((ROOT / "v4/migrations").glob("*.sql"))
                              if int(p.name[:4]) > 15]
                self.assertTrue(migrations, "Candidate must include an upgrade")
                for path in migrations:
                    candidate.executescript(path.read_text())
                # A schema upgrade may introduce additional snapshot fields.
                # Require all baseline values to survive exactly, and new
                # tracked ledgers to begin empty (no fabricated/backfilled
                # business records in the fresh-start release).
                upgraded = restore.snapshot(candidate)
                self.assertEqual(set(upgraded), set(original))
                self.assertEqual(upgraded["attachments"], original["attachments"])
                for section in ("counts", "totals"):
                    self.assertTrue(original[section].keys() <= upgraded[section].keys())
                    self.assertEqual(
                        {k: upgraded[section][k] for k in original[section]},
                        original[section])
                    for key in upgraded[section].keys() - original[section].keys():
                        self.assertEqual(upgraded[section][key], 0,
                                         "Unexpected new ledger value: " + key)
                self.assertEqual(
                    restore.verify("\n".join(candidate.iterdump()), upgraded)["orders"], 1)
                self.assertEqual(candidate.execute("PRAGMA foreign_key_check").fetchall(), [])
                # Simulate failed release validation following a business write
                # in the disposable candidate. The pre-upgrade copy is untouched.
                candidate.execute("INSERT INTO users(id,display_name,created_at) VALUES('failed-release-user','fixture',6)")
                candidate.commit()
                self.assertNotEqual(restore.snapshot(candidate), upgraded)
                candidate_dump = "\n".join(candidate.iterdump())
                with self.assertRaisesRegex(ValueError, "Source snapshot mismatch"):
                    restore.verify(candidate_dump, upgraded)
            with sqlite3.connect(root / "recovered.sqlite") as recovered:
                with sqlite3.connect(backup_path) as backup:
                    backup.backup(recovered)
                self.assertEqual(recovered.execute("PRAGMA integrity_check").fetchall(), [("ok",)])
                self.assertEqual(recovered.execute("PRAGMA foreign_key_check").fetchall(), [])
                self.assertEqual(restore.snapshot(recovered), original)
                self.assertEqual(restore.verify("\n".join(recovered.iterdump()), original)["orders"], 1)
                self.assertEqual(recovered.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='service_policies'").fetchone()[0],0)
            self.assertEqual(restore.snapshot(source), original)
            self.assertEqual(source.execute("SELECT COUNT(*) FROM sessions").fetchone()[0],1)

if __name__ == "__main__":
    unittest.main()
