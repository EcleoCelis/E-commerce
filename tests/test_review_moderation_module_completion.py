from pathlib import Path

from backend.app import create_app
from backend.app.core.config import TestingConfig


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_module_08_roadmap_marks_required_steps_complete():
    roadmap = (PROJECT_ROOT / "backend" / "docs" / "modules" / "modules.md").read_text(encoding="utf-8")

    assert "| 08 | Reviews, Reports & Moderation |" in roadmap
    assert "Complete" in roadmap
    assert "Step 1 - Trust Domain Foundation" in roadmap
    assert "Step 2 - Verified Purchase Reviews API" in roadmap
    assert "Step 3 - Product Reporting and Moderation API" in roadmap
    assert "Step 4 - Marketplace Reviews and Reporting Frontend Integration" in roadmap
    assert "Step 5 - Admin Moderation Workspace" in roadmap
    assert "Step 6 - Module 08 Completion Check" in roadmap


def test_module_08_frontend_assets_remain_modular():
    required_files = [
        "frontend/admin/pages/moderation.html",
        "frontend/static/js/admin/pages/moderation-page.js",
        "frontend/marketplace/pages/product-detail.html",
        "frontend/static/js/marketplace/pages/product-detail-page.js",
    ]

    for relative_path in required_files:
        assert (PROJECT_ROOT / relative_path).is_file()


def test_module_08_backend_contracts_are_registered_and_guarded():
    app = create_app(TestingConfig)
    client = app.test_client()

    review_submit = client.post("/api/v1/marketplace/products/retro-radio/reviews", json={"rating": 5})
    report_submit = client.post("/api/v1/marketplace/products/retro-radio/reports", json={"reason": "misleading"})
    eligibility_check = client.get("/api/v1/marketplace/products/retro-radio/reviews/eligibility")
    admin_reviews_list = client.get("/api/v1/admin/reviews")
    admin_reports_list = client.get("/api/v1/admin/reports")
    admin_review_patch = client.patch("/api/v1/admin/reviews/1/status", json={"status": "hidden"})
    admin_report_patch = client.patch("/api/v1/admin/reports/1/status", json={"status": "resolved"})

    assert review_submit.status_code == 401
    assert report_submit.status_code == 401
    assert eligibility_check.status_code == 401
    assert admin_reviews_list.status_code == 401
    assert admin_reports_list.status_code == 401
    assert admin_review_patch.status_code == 401
    assert admin_report_patch.status_code == 401


def test_module_08_frontend_shells_and_clients_are_reachable():
    app = create_app(TestingConfig)
    client = app.test_client()

    admin_shell = client.get("/admin")
    admin_api_client = client.get("/static/js/admin/admin-api.js")
    admin_moderation_page = client.get("/static/js/admin/pages/moderation-page.js")
    marketplace_api_client = client.get("/static/js/marketplace-api.js")
    pdp_page = client.get("/static/js/marketplace/pages/product-detail-page.js")

    assert admin_shell.status_code == 200
    assert 'data-admin-nav="moderation"' in admin_shell.get_data(as_text=True)
    assert "/static/js/admin/pages/moderation-page.js" in admin_shell.get_data(as_text=True)

    admin_js = admin_api_client.get_data(as_text=True)
    assert admin_api_client.status_code == 200
    assert "listReviews" in admin_js
    assert "updateReviewStatus" in admin_js
    assert "listReports" in admin_js
    assert "updateReportStatus" in admin_js

    assert admin_moderation_page.status_code == 200
    assert "renderModerationPage" in admin_moderation_page.get_data(as_text=True)

    market_js = marketplace_api_client.get_data(as_text=True)
    assert marketplace_api_client.status_code == 200
    assert "listProductReviews" in market_js
    assert "checkReviewEligibility" in market_js
    assert "submitReview" in market_js
    assert "submitProductReport" in market_js

    assert pdp_page.status_code == 200
    assert "renderReviewsList" in pdp_page.get_data(as_text=True)

