"""Validate an authorized decrypted SQL export in an isolated temporary database.
Never connects to Cloudflare or restores production. Optional expected JSON
must be produced independently from the authorized source; totals are compared
without logging amounts or row contents.
Usage: age -d -i /secure/identity backup.sql.age | python3 v4/scripts/restore-check.py --expected /secure/summary.json
"""
import argparse
import hashlib
import json
import pathlib
import sqlite3
import sys
import tempfile

NAMES = ("users", "orders", "order_finance", "order_settlements", "order_attachments",
         "web_ticket_outbox", "order_ticket_links", "rental_reservations", "investor_attestations")
TOTALS = {
    "verified_invoice_amount": "SELECT COALESCE(SUM(amount),0) FROM order_finance WHERE state='paid'",
    "settlement_gross": "SELECT COALESCE(SUM(gross),0) FROM order_settlements",
    "worker_share": "SELECT COALESCE(SUM(worker_share),0) FROM order_settlements",
    "owner_share": "SELECT COALESCE(SUM(owner_share),0) FROM order_settlements",
    "cash_movements": "SELECT COALESCE(SUM(delta),0) FROM cash_movements",
}
# Optional migration-era records: pre-upgrade production backups remain valid.
OPTIONAL_TOTALS = {
    "order_receipts": ("actual_receipts", "SELECT COALESCE(SUM(amount),0) FROM order_receipts"),
    "receipt_refunds": ("actual_receipt_refunds", "SELECT COALESCE(SUM(amount),0) FROM receipt_refunds"),
    "seller_settlements": ("seller_gross", "SELECT COALESCE(SUM(gross),0) FROM seller_settlements"),
    "seller_order_fees": ("seller_fee_total", "SELECT COALESCE(SUM(amount),0) FROM seller_order_fees"),
    "payout_requests": ("paid_payout_total", "SELECT COALESCE(SUM(amount),0) FROM payout_requests WHERE state='paid'"),
    "order_refunds": ("order_refund_total", "SELECT COALESCE(SUM(amount),0) FROM order_refunds"),
    "completed_refunds": ("completed_refund_total", "SELECT COALESCE(SUM(amount),0) FROM completed_refunds"),
    "operating_expenses": ("operating_expense_total", "SELECT COALESCE(SUM(amount),0) FROM operating_expenses"),
    "investor_capital": ("investor_capital_total", "SELECT COALESCE(SUM(amount),0) FROM investor_capital"),
    "investor_distributions": ("investor_principal_return_total", "SELECT COALESCE(SUM(principal_return),0) FROM investor_distributions"),
    "order_cost_basis": ("order_cost_basis", "SELECT COALESCE(SUM(amount),0) FROM order_cost_basis"),
    "investor_noncash_bonuses": ("noncash_bonus_value", "SELECT COALESCE(SUM(value_amount),0) FROM investor_noncash_bonuses"),
}
OPTIONAL_NAMES = ("cash_period_closes", "payout_approvals", "order_receipts", "receipt_refunds",
                  "seller_order_fees", "seller_settlements", "order_cost_basis",
                  "investor_post_policies", "investor_noncash_bonuses",
                  "checkout_groups", "checkout_items", "service_policies",
                  "order_policy_snapshots", "ticket_closure_fences",
                  "cash_opening", "payout_requests", "order_refunds", "completed_refunds",
                  "supplier_movements", "operating_expenses", "investor_capital",
                  "investor_distributions")
def snapshot_plan(existing):
    return NAMES + tuple(n for n in OPTIONAL_NAMES if n in existing), {
        **TOTALS, **{label: query for table, (label, query) in OPTIONAL_TOTALS.items() if table in existing}
    }
def snapshot(db):
    existing = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    names, totals = snapshot_plan(existing)
    return {
        "counts": {name: db.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] for name in names},
        "totals": {name: db.execute(query).fetchone()[0] for name, query in totals.items()},
        "attachments": {row[0]: hashlib.sha256(row[1]).hexdigest()
                        for row in db.execute("SELECT id,bytes FROM order_attachments ORDER BY id")},
    }

def verify(sql, expected=None):
    with tempfile.TemporaryDirectory(prefix="nexoraid-restore-") as tmp:
        db = sqlite3.connect(pathlib.Path(tmp) / "restore.sqlite")
        try:
            # Deny ATTACH/DETACH so an export cannot write outside the temporary DB.
            db.set_authorizer(lambda action, *_: sqlite3.SQLITE_DENY
                              if action in (sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH)
                              else sqlite3.SQLITE_OK)
            db.executescript(sql)
            if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                raise ValueError("Integrity check failed")
            if db.execute("PRAGMA foreign_key_check").fetchone():
                raise ValueError("Foreign-key check failed")
            summary = snapshot(db)
            if expected is not None and summary != expected:
                raise ValueError("Source snapshot mismatch")
            db.execute("PRAGMA foreign_keys=ON")
            db.execute("DELETE FROM sessions")
            db.commit()
            if db.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] != 0:
                raise ValueError("Session cleanup failed")
            if db.execute("SELECT COUNT(*) FROM session_metadata").fetchone()[0] != 0:
                raise ValueError("Session metadata cleanup failed")
            if snapshot(db) != summary:
                raise ValueError("Session cleanup changed business records")
            return summary["counts"]
        finally:
            db.close()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected", type=pathlib.Path)
    args = parser.parse_args()
    try:
        expected = json.loads(args.expected.read_text()) if args.expected else None
        if args.expected and not isinstance(expected, dict):
            raise ValueError("Invalid source snapshot")
        counts = verify(sys.stdin.read(), expected)
    except (sqlite3.Error, OSError, ValueError):
        # SQLite errors may contain private identifiers/values.
        print("Local restore verification failed; inspect securely.", file=sys.stderr)
        return 1
    for name, count in counts.items():
        print(f"{name}: {count}")
    print("Local restore integrity OK; copied sessions removed.")
    print("Source counts and financial totals matched." if args.expected else
          "Source reconciliation not performed; supply independent expected summary.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
