"""Production Readiness and Deployment Verification Script."""
import os
import sys
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from sqlalchemy import text
from backend.app import create_app
from backend.app.core.config import get_config
from backend.app.extensions import db


def verify_deployment():
    print("=" * 60)
    print("SecondMarket Production Deployment Verification")
    print("=" * 60)

    app = create_app(get_config())
    client = app.test_client()

    checks = []

    # 1. Check Liveness Endpoint
    resp = client.get("/api/v1/health")
    liveness_ok = resp.status_code == 200 and resp.json.get("success") is True
    checks.append(("API Liveness Endpoint (/api/v1/health)", liveness_ok, f"HTTP {resp.status_code}"))

    # 2. Check Database Connectivity & Readiness
    resp = client.get("/api/v1/health/ready")
    readiness_ok = resp.status_code == 200 and resp.json.get("data", {}).get("database") == "connected"
    checks.append(("Database Readiness Endpoint (/api/v1/health/ready)", readiness_ok, f"HTTP {resp.status_code}"))

    # 3. Check Security Headers
    resp = client.get("/")
    has_nosniff = resp.headers.get("X-Content-Type-Options") == "nosniff"
    has_frame = "X-Frame-Options" in resp.headers or "Content-Security-Policy" in resp.headers
    checks.append(("HTTP Security Headers (nosniff, frame protection)", has_nosniff and has_frame, f"nosniff: {has_nosniff}"))

    # 4. Check Root Storefront Serving
    root_ok = resp.status_code == 200 and "SecondMarket" in resp.get_data(as_text=True)
    checks.append(("Storefront Root Page Serving (/)", root_ok, f"HTTP {resp.status_code}"))

    # 5. Check Admin Shell Serving
    admin_resp = client.get("/admin")
    admin_ok = admin_resp.status_code == 200 and "Admin Seller | SecondMarket" in admin_resp.get_data(as_text=True)
    checks.append(("Admin Seller Workspace Serving (/admin)", admin_ok, f"HTTP {admin_resp.status_code}"))

    # 6. Check System Metadata
    sys_resp = client.get("/api/v1/system/metadata")
    sys_ok = sys_resp.status_code == 200
    checks.append(("System Metadata Endpoint (/api/v1/system/metadata)", sys_ok, f"HTTP {sys_resp.status_code}"))

    # Print Report
    all_passed = True
    for name, passed, detail in checks:
        status_icon = "PASS" if passed else "FAIL"
        print(f"[{status_icon:4}] {name} - {detail}")
        if not passed:
            all_passed = False

    print("=" * 60)
    if all_passed:
        print("All verification checks PASSED! System is ready for operation.")
        return 0
    else:
        print("[WARNING] One or more verification checks failed.")
        return 1


if __name__ == "__main__":
    sys.exit(verify_deployment())
