"""Database Restoration Script for SecondMarket E-Commerce."""
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse


def restore_database(backup_filepath):
    if not backup_filepath or not Path(backup_filepath).exists():
        print(f"[Error] Backup file '{backup_filepath}' does not exist.")
        sys.exit(1)

    database_url = os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:2005@localhost:5432/secondhand")
    normalized_url = database_url.replace("postgresql+psycopg://", "postgresql://")
    parsed = urlparse(normalized_url)

    print(f"Starting restoration into '{parsed.path.lstrip('/')}' from {backup_filepath}...")
    env = os.environ.copy()
    if parsed.password:
        env["PGPASSWORD"] = parsed.password

    cmd = [
        "pg_restore",
        "-h", parsed.hostname or "localhost",
        "-p", str(parsed.port or 5432),
        "-U", parsed.username or "postgres",
        "-d", parsed.path.lstrip("/"),
        "--clean",
        "--if-exists",
        str(backup_filepath),
    ]

    try:
        subprocess.run(cmd, env=env, check=True)
        print("Database restoration completed successfully.")
    except FileNotFoundError:
        print("[Warning] 'pg_restore' utility not found on PATH. Ensure PostgreSQL client tools are installed.")
    except subprocess.CalledProcessError as exc:
        print(f"[Error] Restoration failed with code {exc.returncode}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/restore_db.py <path_to_backup.sql>")
        sys.exit(1)
    restore_database(sys.argv[1])
