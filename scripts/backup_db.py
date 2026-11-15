"""Database Backup Script for SecondMarket E-Commerce."""
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse


def backup_database():
    database_url = os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:2005@localhost:5432/secondhand")
    normalized_url = database_url.replace("postgresql+psycopg://", "postgresql://")
    parsed = urlparse(normalized_url)

    backup_dir = Path("backups")
    backup_dir.mkdir(exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = backup_dir / f"backup_{parsed.path.lstrip('/')}_{timestamp}.sql"

    print(f"Starting database backup for '{parsed.path.lstrip('/')}'...")
    env = os.environ.copy()
    if parsed.password:
        env["PGPASSWORD"] = parsed.password

    cmd = [
        "pg_dump",
        "-h", parsed.hostname or "localhost",
        "-p", str(parsed.port or 5432),
        "-U", parsed.username or "postgres",
        "-F", "c",  # Custom format (compressed)
        "-f", str(backup_file),
        parsed.path.lstrip("/"),
    ]

    try:
        subprocess.run(cmd, env=env, check=True)
        print(f"Database backup completed successfully: {backup_file}")
        return str(backup_file)
    except FileNotFoundError:
        print("[Warning] 'pg_dump' utility not found on PATH. Ensure PostgreSQL client tools are installed.")
        return None
    except subprocess.CalledProcessError as exc:
        print(f"[Error] Backup failed with code {exc.returncode}")
        return None


if __name__ == "__main__":
    backup_database()
