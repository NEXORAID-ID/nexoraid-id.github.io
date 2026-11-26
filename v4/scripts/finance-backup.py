"""Owner-side production export, encrypted external copy and independent restore.
Run ONLY in a trusted local terminal; never give CI the age identity.
Requires configured Wrangler production target and an owner-coordinated write freeze.
No production mutations. No secret values, SQL rows or raw errors printed.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONFIG = ROOT / "v4/.generated/wrangler.json"
spec = importlib.util.spec_from_file_location("restore_check", ROOT / "v4/scripts/restore-check.py")
restore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore)
PATTERN = re.compile(r"^\d{4}_[a-z0-9_]+\.sql$")
WRANGLER = ["npx", "--yes", "wrangler@4.168.0", "d1"]

def run(args, **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, timeout=300, **kwargs).stdout

def query(sql):
    result = json.loads(run(WRANGLER + ["execute","nexoraid-v4","--remote","--config",str(CONFIG),"--json","--command",sql]))
    if not isinstance(result,list) or len(result)!=1 or result[0].get("success") is not True:
        raise ValueError("Remote query failed")
    rows = result[0].get("results")
    if not isinstance(rows,list):
        raise ValueError("Remote rows unavailable")
    return rows

def scalar(sql):
    rows=query(sql)
    if len(rows)!=1 or len(rows[0])!=1:
        raise ValueError("Invalid scalar")
    value=next(iter(rows[0].values()))
    if not isinstance(value,int):
        raise ValueError("Invalid integer")
    return value

def source_snapshot():
    existing={r["name"] for r in query("SELECT name FROM sqlite_master WHERE type='table'")}
    names, queries=restore.snapshot_plan(existing)
    counts={name:scalar(f'SELECT COUNT(*) FROM "{name}"') for name in names}
    totals={name:scalar(sql) for name,sql in queries.items()}
    attachments={}
    # IDs are UUIDs in the actual application; quote literal regardless of content.
    rows=query("SELECT id FROM order_attachments ORDER BY id")
    if len(rows)!=counts["order_attachments"]:
        raise ValueError("Attachment inventory changed")
    for row in rows:
        identifier=row["id"]
        if not isinstance(identifier,str) or identifier in attachments:
            raise ValueError("Invalid attachment ID")
        literal="'"+identifier.replace("'","''")+"'"
        size=scalar("SELECT length(bytes) FROM order_attachments WHERE id="+literal)
        if not 16<=size<=524288:
            raise ValueError("Attachment size invalid")
        digest=hashlib.sha256()
        for offset in range(1,size+1,65536):
            result=query(f"SELECT hex(substr(bytes,{offset},65536)) AS data FROM order_attachments WHERE id="+literal)
            if len(result)!=1:
                raise ValueError("Attachment disappeared")
            chunk=bytes.fromhex(result[0]["data"])
            if len(chunk)!=min(65536,size-offset+1):
                raise ValueError("Attachment changed")
            digest.update(chunk)
        attachments[identifier]=digest.hexdigest()
    return {"counts":counts,"totals":totals,"attachments":attachments}

def pending_digest(ref,applied):
    commit=run(["git","rev-parse","--verify",ref+"^{commit}"]).decode().strip()
    if not re.fullmatch("[0-9a-f]{40}",commit):
        raise ValueError("Invalid candidate")
    names=run(["git","ls-tree","--name-only",commit+":v4/migrations"]).decode().splitlines()
    files=sorted(n for n in names if n.endswith(".sql"))
    if not files or not files[0].startswith("0001_") or any(not PATTERN.fullmatch(n) for n in files):
        raise ValueError("Invalid local migration inventory")
    versions=[int(n[:4]) for n in files]
    if any(v!=i+1 for i,v in enumerate(versions)):
        raise ValueError("Migration sequence has a gap or duplicate version")
    actual=sorted(applied)
    if actual!=files[:len(actual)]:
        raise ValueError("Divergent migration history")
    if any(int(n[:4])<16 and n not in actual for n in files):
        raise ValueError("Divergent migration history: baseline not applied")
    pending=[n for n in files[len(actual):] if int(n[:4])>=16]
    if not pending:
        raise ValueError("No pending financial migrations")
    digest=hashlib.sha256()
    for name in pending:
        digest.update(name.encode()+b"\0")
        digest.update(run(["git","show",commit+":v4/migrations/"+name]))
        digest.update(b"\0")
    return pending,digest.hexdigest()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--candidate",required=True,help="Exact local or remote-tracking ref; fetch first")
    parser.add_argument("--identity",required=True,type=pathlib.Path,help="Existing owner-only age private key file")
    parser.add_argument("--external-dir",required=True,type=pathlib.Path,help="Owner-controlled external drive or trusted off-host mounted destination")
    parser.add_argument("--confirm-write-freeze",action="store_true",help="Owner has paused business writes and other writers")
    args=parser.parse_args()
    os.umask(0o077)
    try:
        if not args.confirm_write_freeze:
            raise ValueError("Write freeze required")
        config=json.loads(CONFIG.read_text())
        dbs=[d for d in config.get("d1_databases",[]) if d.get("binding")=="DB" and d.get("database_name")=="nexoraid-v4"]
        if config.get("name")!="nexoraid-v4" or len(dbs)!=1 or not re.fullmatch("[a-fA-F0-9-]{36}",dbs[0]["database_id"]):
            raise ValueError("Invalid target")
        if config.get("vars",{}).get("PUBLIC_ORIGIN")!="https://nexoraid-v4.nexoraid.workers.dev":
            raise ValueError("Unexpected origin")
        # Do not silently create or rotate a key. Its private bytes never leave this terminal.
        identity=args.identity.expanduser().resolve(strict=True)
        dest=args.external_dir.expanduser().resolve(strict=True)
        if not dest.is_dir() or dest==ROOT or ROOT in dest.parents or not identity.is_file():
            raise ValueError("Unsafe key or destination")
        recipient=run(["age-keygen","-y",str(identity)]).decode().strip()
        if not recipient.startswith("age1") or "\n" in recipient:
            raise ValueError("Invalid public recipient")
        applied=[r["name"] for r in query("SELECT name FROM d1_migrations ORDER BY name")]
        pending,digest=pending_digest(args.candidate,applied)
        before=source_snapshot()
        with tempfile.TemporaryDirectory(prefix="nexoraid-finance-") as work:
            work=pathlib.Path(work)
            sql=work/"backup.sql"
            encrypted=work/"backup.sql.age"
            run(WRANGLER+["export","nexoraid-v4","--remote","--config",str(CONFIG),"--output",str(sql)])
            if not sql.is_file() or sql.stat().st_size==0:
                raise ValueError("Empty backup")
            run(["age","-r",recipient,"-o",str(encrypted),str(sql)])
            if source_snapshot()!=before or [r["name"] for r in query("SELECT name FROM d1_migrations ORDER BY name")]!=applied:
                raise ValueError("Source changed during snapshot")
            # Create exclusively, never overwrite previous recovery points.
            stamp=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            target=dest/f"nexoraid-v4-{stamp}-{os.getpid()}.sql.age"
            with target.open("xb") as handle:
                with encrypted.open("rb") as src:
                    while chunk:=src.read(1024*1024):
                        handle.write(chunk)
                handle.flush();os.fsync(handle.fileno())
            def checksum(path):
                with path.open("rb") as handle:
                    return hashlib.file_digest(handle,"sha256").hexdigest()
            checksum_value=checksum(target)
            if checksum_value!=checksum(encrypted):
                raise ValueError("Encrypted copy mismatch")
            # Restore from the actual external ciphertext, not the original plaintext.
            recovered=run(["age","-d","-i",str(identity),str(target)])
            restore.verify(recovered.decode("utf-8"),before)
            if source_snapshot()!=before:
                raise ValueError("Source changed during restore")
            evidence={"database_id":dbs[0]["database_id"],"migration_digest":digest,
                      "pending_migrations":pending,"backup_sha256":checksum_value,
                      "verified_at":datetime.now(timezone.utc).isoformat(),
                      "external_encrypted_copy":True,"isolated_restore_verified":True,
                      "independent_totals_matched":True,"attachment_checksums_matched":True}
            with (dest/"NEXORAID-FINANCE-EVIDENCE.json").open("x") as f:
                json.dump(evidence,f,indent=2);f.write("\n")
        print("Encrypted backup, external copy checksum, isolated restore and independent reconciliation passed.")
        print("Evidence file created in the selected external directory. Owner must approve and set the environment secret.")
        return 0
    except (OSError,ValueError,KeyError,TypeError,RuntimeError,subprocess.SubprocessError,restore.sqlite3.Error):
        print("Backup gate failed. Check trusted terminal configuration, freeze, destination and source integrity. No migration attempted.",file=sys.stderr)
        return 1

if __name__=="__main__":
    sys.exit(main())
