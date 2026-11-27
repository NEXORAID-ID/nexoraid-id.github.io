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
    def test_required_baseline_catalog_access_and_supplier_inventory(self):
        self.db.execute("INSERT INTO management_grants(user_id,granted_at) VALUES('c',1)")
        self.db.execute("INSERT INTO catalog_overrides(service_id,amount,enabled,actor_id,updated_at) VALUES('fixture-sku',15000,1,'o',1)")
        self.db.execute("INSERT INTO suppliers(id,name,created_at) VALUES('fixture-supplier','Synthetic supplier',1)")
        self.db.commit()
        expected = restore.snapshot(self.db)
        dump = "\n".join(self.db.iterdump())
        counts = restore.verify(dump, expected)
        for name in ("management_grants", "catalog_overrides", "suppliers"):
            self.assertEqual(counts[name], 1)
            changed = {"counts": dict(expected["counts"]), "totals": expected["totals"],
                       "attachments": expected["attachments"]}
            changed["counts"][name] = 0
            with self.assertRaisesRegex(ValueError, "Source snapshot mismatch"):
                restore.verify(dump, changed)
        for name in ("cash_opening", "checkout_groups", "checkout_items", "rental_capacity",
                     "supplier_movements", "investor_capital", "investor_distributions",
                     "audit_events", "order_messages", "order_work"):
            self.assertIn(name, counts)
    def test_source_mismatch(self):
        self.expected["totals"]["verified_invoice_amount"] += 1
        with self.assertRaisesRegex(ValueError,"Source snapshot mismatch"):
            restore.verify(self.dump,self.expected)
    def test_attachment_content_mismatch(self):
        self.expected["attachments"]["fixture-attachment"] = "0" * 64
        with self.assertRaisesRegex(ValueError,"Source snapshot mismatch"):
            restore.verify(self.dump,self.expected)
    def test_snapshot_includes_catalog_checkout_ticket_and_financial_inventory(self):
        counts = self.expected["counts"]
        for name in ("checkout_groups", "checkout_items", "service_policies",
                     "order_policy_snapshots", "ticket_closure_fences", "cash_opening",
                     "payout_requests", "order_refunds", "completed_refunds",
                     "supplier_movements", "operating_expenses", "investor_capital",
                     "investor_distributions"):
            self.assertIn(name, counts)
        self.assertEqual(counts["order_policy_snapshots"], 1)
        for name in ("seller_fee_total", "paid_payout_total", "order_refund_total",
                     "completed_refund_total", "operating_expense_total",
                     "investor_capital_total", "investor_principal_return_total"):
            self.assertIn(name, self.expected["totals"])
        self.expected["counts"]["order_policy_snapshots"] += 1
        with self.assertRaisesRegex(ValueError, "Source snapshot mismatch"):
            restore.verify(self.dump, self.expected)

    def test_optional_inventory_compatible_with_earlier_schema(self):
        names, totals = restore.snapshot_plan(set(restore.NAMES))
        self.assertEqual(names, restore.NAMES)
        self.assertEqual(totals, {**restore.TOTALS, **{
            label: query for table, (label, query) in restore.OPTIONAL_TOTALS.items()
            if table in restore.NAMES}})
        self.assertFalse(set(restore.NAMES) & set(restore.OPTIONAL_NAMES))
        self.assertNotIn("account_suspensions", names)

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

    def test_owner_backup_requires_live_maintenance(self):
        import io
        import json
        from unittest.mock import MagicMock
        def opener(payload, status=200, redirected=False):
            response=MagicMock()
            response.__enter__.return_value=response
            response.status=status
            response.geturl.return_value=("https://other.invalid" if redirected else
                "https://nexoraid-v4.nexoraid.workers.dev/api/health")
            response.read.side_effect=io.BytesIO(json.dumps(payload).encode()).read
            return lambda request, timeout: response
        ready={"status":"ok","database_ready":True,"maintenance":True}
        self.helper.verify_live_freeze(opener(ready))
        for patch in ({"maintenance":False},{"maintenance":1},{"database_ready":False},{"status":"degraded"}):
            with self.assertRaisesRegex(ValueError,"maintenance must be active"):
                self.helper.verify_live_freeze(opener({**ready,**patch}))
        for probe in (opener(ready,status=503),opener(ready,redirected=True)):
            with self.assertRaisesRegex(ValueError,"health unavailable"):
                self.helper.verify_live_freeze(probe)

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
            if sql.startswith("SELECT name FROM sqlite_master"): return [{"name":"order_receipts"}]
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
    def test_production_style_rehearsal_requires_unchanged_baseline(self):
        fixture = RestoreTests("test_nonempty_finance_snapshot_and_session_cleanup")
        fixture.schema_limit = 15
        fixture.setUp()
        self.addCleanup(fixture.tearDown)
        dump = "\n".join(fixture.db.iterdump())
        expected = fixture.expected
        migrations = [p.read_text() for p in sorted((ROOT / "v4/migrations").glob("*.sql"))
                      if int(p.name[:4]) > 15]
        self.assertEqual(restore.verify(dump, expected, migrations=migrations)["orders"], 1)
        with self.assertRaisesRegex(ValueError, "requires source snapshot"):
            restore.verify(dump, migrations=migrations)
        with self.assertRaisesRegex(ValueError, "requires source snapshot"):
            restore.verify(dump, expected, migrations=[])
        with self.assertRaisesRegex(ValueError, "Upgrade changed baseline"):
            restore.verify(dump, expected, migrations=migrations+[
                "INSERT INTO users(id,display_name,created_at) VALUES('unexpected','fixture',6);"])
        self.assertEqual(restore.snapshot(fixture.db), expected)
        self.assertEqual(fixture.db.execute("SELECT COUNT(*) FROM sessions").fetchone()[0], 1)

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
                upgraded = restore.snapshot(candidate)
                self.assertEqual(set(upgraded), set(original))
                self.assertEqual(upgraded["attachments"], original["attachments"])
                for section in ("counts", "totals"):
                    self.assertEqual({name: upgraded[section][name] for name in original[section]}, original[section])
                    # Newly introduced tables and totals must not fabricate historical activity.
                    for name in upgraded[section].keys() - original[section].keys():
                        self.assertEqual(upgraded[section][name], 0, name)
                self.assertIn("order_receipts", upgraded["counts"])
                self.assertIn("cash_period_closes", upgraded["counts"])
                self.assertIn("seller_settlements", upgraded["counts"])
                self.assertEqual(restore.verify("\n".join(candidate.iterdump()), upgraded)["orders"], 1)
                self.assertEqual(candidate.execute("PRAGMA foreign_key_check").fetchall(), [])
                # Simulate failed release validation following a business write
                # in the disposable candidate. The pre-upgrade copy is untouched.
                candidate.execute("INSERT INTO users(id,display_name,created_at) VALUES('failed-release-user','fixture',6)")
                candidate.commit()
                self.assertEqual(restore.snapshot(candidate)['counts']['users'], upgraded['counts']['users'] + 1)
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
