from backend.app import create_app
from backend.app.core.config import TestingConfig
from backend.app.extensions import db
from backend.app.seed import seed_development_data


def setup_test_app():
    app = create_app(TestingConfig)
    with app.app_context():
        db.create_all()
        seed_development_data()
    return app


def teardown_test_app(app):
    with app.app_context():
        db.session.remove()
        db.drop_all()


def login_admin(client):
    return client.post(
        "/api/v1/auth/login",
        json={"email": "admin@secondmarket.test", "password": "AdminSeller2026"},
    )


def test_admin_product_5_tab_fields_persist_in_database():
    app = setup_test_app()
    client = app.test_client()
    login_admin(client)

    create_resp = client.post(
        "/api/v1/admin/products",
        json={
            "title": "Vintage Brass Desk Lamp",
            "slug": "vintage-brass-desk-lamp",
            "category_slug": "electronics",
            "description": "Restored vintage brass desk lamp with warm LED bulb.",
            "price": 1250.00,
            "compare_at_price": 1600.00,
            "cost": 650.00,
            "condition": "good",
            "status": "available",
            "quantity": 4,
            "low_stock_threshold": 2,
            "track_inventory": True,
            "sku": "SKU-LAMP-009",
            "variants": [
                {"name": "Finish", "val": "Aged Brass"},
                {"name": "Voltage", "val": "220V"},
            ],
        },
    )
    assert create_resp.status_code == 201
    created = create_resp.get_json()["data"]
    assert created["price"]["amount"] == 1250.0
    assert created["compare_at_price"]["amount"] == 1600.0
    assert created["cost"]["amount"] == 650.0
    assert created["sku"] == "SKU-LAMP-009"
    assert created["low_stock_threshold"] == 2
    assert created["track_inventory"] is True
    assert len(created["variants"]) == 2
    assert created["variants"][0]["name"] == "Finish"

    # Update product and verify fields update accurately
    update_resp = client.put(
        "/api/v1/admin/products/vintage-brass-desk-lamp",
        json={
            "price": 1100.00,
            "compare_at_price": 1500.00,
            "cost": 600.00,
            "low_stock_threshold": 3,
            "track_inventory": False,
            "sku": "SKU-LAMP-010",
            "variants": [{"name": "Finish", "val": "Polished Brass"}],
        },
    )
    assert update_resp.status_code == 200
    updated = update_resp.get_json()["data"]
    assert updated["price"]["amount"] == 1100.0
    assert updated["compare_at_price"]["amount"] == 1500.0
    assert updated["cost"]["amount"] == 600.0
    assert updated["low_stock_threshold"] == 3
    assert updated["track_inventory"] is False
    assert updated["sku"] == "SKU-LAMP-010"
    assert updated["variants"] == [{"name": "Finish", "val": "Polished Brass"}]

    teardown_test_app(app)


def test_admin_bulk_product_actions_status_and_delete():
    app = setup_test_app()
    client = app.test_client()
    login_admin(client)

    list_resp = client.get("/api/v1/admin/products")
    assert list_resp.status_code == 200
    products = list_resp.get_json()["data"]
    slugs = [p["slug"] for p in products[:2]]
    assert len(slugs) == 2

    bulk_status_resp = client.post(
        "/api/v1/admin/products/bulk",
        json={"slugs": slugs, "action": "status", "status": "hidden"},
    )
    assert bulk_status_resp.status_code == 200
    assert bulk_status_resp.get_json()["data"]["affected_count"] == 2

    for s in slugs:
        detail = client.get(f"/api/v1/admin/products/{s}").get_json()["data"]
        assert detail["status"] == "hidden"

    bulk_delete_resp = client.post(
        "/api/v1/admin/products/bulk",
        json={"slugs": slugs, "action": "delete"},
    )
    assert bulk_delete_resp.status_code == 200
    delete_data = bulk_delete_resp.get_json()["data"]
    assert delete_data["deleted_count"] == 2
    assert delete_data["archived_count"] == 0
    assert delete_data["affected_count"] == 2

    for s in slugs:
        assert client.get(f"/api/v1/admin/products/{s}").status_code == 404

    teardown_test_app(app)


def test_admin_portal_ui_wires_support_returns_coupons_and_peso_currency():
    app = setup_test_app()
    client = app.test_client()

    index_html = client.get("/admin").get_data(as_text=True)
    assert 'data-admin-nav="support"' in index_html
    assert 'data-admin-nav="returns"' in index_html
    assert 'data-admin-nav="coupons"' in index_html
    assert "/static/js/admin/pages/support-page.js" in index_html
    assert "/static/js/admin/pages/returns-page.js" in index_html
    assert "/static/js/admin/pages/coupons-page.js" in index_html

    app_js = client.get("/static/js/admin/app.js").get_data(as_text=True)
    assert "return `₱${Number(val).toLocaleString" in app_js
    assert "executeBulkProductAction" in app_js
    assert "markOrderAsPaid" in app_js
    assert "submitOrderShippingForm" in app_js

    for script_path in (
        "/static/js/admin/pages/support-page.js",
        "/static/js/admin/pages/returns-page.js",
        "/static/js/admin/pages/coupons-page.js",
    ):
        resp = client.get(script_path)
        assert resp.status_code == 200

    teardown_test_app(app)
