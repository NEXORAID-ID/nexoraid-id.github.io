"""Validate an explicitly decrypted SQL export in a fresh temporary LOCAL database.
Never connects to Cloudflare, never prints row content, never restores production.
Usage: age -d -i /secure/identity backup.sql.age | python3 v4/scripts/restore-check.py
"""
import sqlite3, sys, tempfile, pathlib
with tempfile.TemporaryDirectory(prefix="nexoraid-restore-") as tmp:
    db = sqlite3.connect(pathlib.Path(tmp) / "restore.sqlite")
    try:
        db.executescript(sys.stdin.read())
        if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise SystemExit("Integrity check failed")
        if db.execute("PRAGMA foreign_key_check").fetchone():
            raise SystemExit("Foreign-key check failed")
        names = ("users", "orders", "order_finance", "order_settlements", "order_attachments", "web_ticket_outbox", "rental_reservations", "investor_attestations")
        for name in names:
            count = db.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
            print(f"{name}: {count}")
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("DELETE FROM sessions")
        db.commit()
        print("Local restore integrity OK; copied sessions removed. Compare counts, financial totals and attachment checksums against authorized source before sign-off.")
    finally:
        db.close()
