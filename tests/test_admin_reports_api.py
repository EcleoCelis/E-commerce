from datetime import datetime, timezone
import pytest

from backend.app import create_app
from backend.app.auth.rbac import Role
from backend.app.core.config import TestingConfig
from backend.app.extensions import db
from backend.app.models import (
    Category,
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    PaymentStatus,
    Product,
    ProductCondition,
    ProductStatus,
    ShippingRecord,
    ShippingStatus,
    User,
)


@pytest.fixture()
def app():
    app = create_app(TestingConfig)

    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def create_user(email, role=Role.BUYER.value):
    user = User(email=email, role=role, first_name="Test", last_name="User")
    user.set_password("SecurePassword2026")
    db.session.add(user)
    db.session.commit()
    return user


def login(client, email):
    client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "SecurePassword2026"},
    )


def seed_marketplace_data(admin, buyer):
    cat_phones = Category(name="Phones", slug="phones")
    cat_laptops = Category(name="Laptops", slug="laptops")
    db.session.add_all([cat_phones, cat_laptops])
    db.session.commit()

    p1 = Product(
        title="iPhone 12",
        slug="iphone-12",
        description="Great condition iPhone 12",
        price_cents=2500000,
        quantity=1,  # Low stock
        condition=ProductCondition.GOOD.value,
        status=ProductStatus.AVAILABLE.value,
        category_id=cat_phones.id,
        seller_id=admin.id,
    )
    p2 = Product(
        title="ThinkPad T480",
        slug="thinkpad-t480",
        description="Reliable work laptop",
        price_cents=1800000,
        quantity=5,
        condition=ProductCondition.FAIR.value,
        status=ProductStatus.AVAILABLE.value,
        category_id=cat_laptops.id,
        seller_id=admin.id,
    )
    p3 = Product(
        title="Vintage iPod",
        slug="vintage-ipod",
        description="Classic collector item",
        price_cents=500000,
        quantity=0,
        condition=ProductCondition.LIKE_NEW.value,
        status=ProductStatus.SOLD.value,
        category_id=cat_phones.id,
        seller_id=admin.id,
    )
    db.session.add_all([p1, p2, p3])
    db.session.commit()

    order1 = Order(
        order_number="ORD-REPORT-001",
        user_id=buyer.id,
        status=OrderStatus.DELIVERED.value,
        payment_status=PaymentStatus.PAID.value,
        shipping_status=ShippingStatus.DELIVERED.value,
        subtotal_cents=2500000,
        shipping_cents=15000,
        total_cents=2515000,
        placed_at=datetime.now(timezone.utc),
    )
    db.session.add(order1)
    db.session.commit()

    pm = Payment(
        order_id=order1.id,
        method="credit_card",
        status=PaymentStatus.PAID.value,
        amount_cents=2515000,
    )
    ship1 = ShippingRecord(
        order_id=order1.id,
        recipient_name="Buyer Recipient",
        phone="09171234567",
        address_line1="123 Ayala Ave",
        city="Makati",
        province="Metro Manila",
        postal_code="1200",
        tracking_number="TRK-001",
        status=ShippingStatus.DELIVERED.value,
    )
    item1 = OrderItem(
        order_id=order1.id,
        product_id=p1.id,
        product_title=p1.title,
        quantity=1,
        unit_price_cents=2500000,
    )
    db.session.add_all([item1, pm, ship1])
    db.session.commit()

    return {"p1": p1, "p2": p2, "p3": p3, "order1": order1}


def test_reports_access_control(client):
    buyer = create_user("buyer@example.com", Role.BUYER.value)
    admin = create_user("admin@example.com", Role.ADMIN.value)

    # 1. Unauthenticated -> 401
    resp = client.get("/api/v1/admin/reports/dashboard")
    assert resp.status_code == 401

    # 2. Buyer -> 403
    login(client, buyer.email)
    resp = client.get("/api/v1/admin/reports/dashboard")
    assert resp.status_code == 403

    # 3. Admin -> 200
    login(client, admin.email)
    resp = client.get("/api/v1/admin/reports/dashboard")
    assert resp.status_code == 200


def test_dashboard_kpis_endpoint(client):
    admin = create_user("admin@example.com", Role.ADMIN.value)
    buyer = create_user("buyer@example.com", Role.BUYER.value)
    seed_marketplace_data(admin, buyer)

    login(client, admin.email)
    resp = client.get("/api/v1/admin/reports/dashboard")
    assert resp.status_code == 200
    data = resp.get_json()["data"]

    summary = data["summary"]
    assert summary["total_orders"] == 1
    assert summary["completed_orders"] == 1
    assert summary["paid_orders"] == 1
    assert summary["gross_revenue"]["amount_cents"] == 2515000
    assert summary["average_order_value"]["amount_cents"] == 2515000
    assert summary["available_products"] == 2
    assert summary["sold_products"] == 1
    assert summary["low_stock_products"] == 1

    top_prods = data["top_selling_products"]
    assert len(top_prods) >= 1
    assert top_prods[0]["title"] == "iPhone 12"
    assert top_prods[0]["units_sold"] == 1

    assert len(data["recent_orders"]) == 1
    assert data["recent_orders"][0]["order_number"] == "ORD-REPORT-001"

    assert len(data["low_stock_items"]) == 1
    assert data["low_stock_items"][0]["title"] == "iPhone 12"


def test_dashboard_date_filtering(client):
    admin = create_user("admin@example.com", Role.ADMIN.value)
    login(client, admin.email)

    # Valid ranges
    for r in ["all", "today", "7d", "30d", "this_month"]:
        resp = client.get(f"/api/v1/admin/reports/dashboard?range={r}")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["applied_range"]["range"] == r

    # Custom valid
    resp = client.get("/api/v1/admin/reports/dashboard?range=custom&start_date=2026-01-01&end_date=2026-12-31")
    assert resp.status_code == 200

    # Invalid range parameter -> 422
    resp = client.get("/api/v1/admin/reports/dashboard?range=invalid_range")
    assert resp.status_code == 422

    # Invalid custom date range (start after end) -> 422
    resp = client.get("/api/v1/admin/reports/dashboard?range=custom&start_date=2026-12-31&end_date=2026-01-01")
    assert resp.status_code == 422


def test_sales_report_endpoint(client):
    admin = create_user("admin@example.com", Role.ADMIN.value)
    buyer = create_user("buyer@example.com", Role.BUYER.value)
    seed_marketplace_data(admin, buyer)

    login(client, admin.email)
    resp = client.get("/api/v1/admin/reports/sales?range=all")
    assert resp.status_code == 200
    data = resp.get_json()["data"]

    summary = data["summary"]
    assert summary["total_orders"] == 1
    assert summary["total_units_sold"] == 1
    assert summary["gross_revenue"]["amount_cents"] == 2515000

    assert len(data["daily_sales"]) == 1
    assert len(data["orders"]) == 1


def test_inventory_report_endpoint(client):
    admin = create_user("admin@example.com", Role.ADMIN.value)
    buyer = create_user("buyer@example.com", Role.BUYER.value)
    seed_marketplace_data(admin, buyer)

    login(client, admin.email)
    resp = client.get("/api/v1/admin/reports/inventory")
    assert resp.status_code == 200
    data = resp.get_json()["data"]

    summary = data["summary"]
    assert summary["total_skus"] == 3
    assert summary["total_units_in_stock"] == 6  # 1 (p1) + 5 (p2) + 0 (p3)
    assert summary["low_stock_count"] == 1
    assert summary["out_of_stock_count"] == 1

    assert len(data["category_breakdown"]) == 2
    assert len(data["products"]) == 3


def test_export_csv_endpoints(client):
    admin = create_user("admin@example.com", Role.ADMIN.value)
    buyer = create_user("buyer@example.com", Role.BUYER.value)
    seed_marketplace_data(admin, buyer)

    login(client, admin.email)

    # 1. Sales CSV
    resp = client.get("/api/v1/admin/reports/export?type=sales")
    assert resp.status_code == 200
    assert resp.mimetype == "text/csv"
    assert "attachment; filename=" in resp.headers["Content-Disposition"]
    csv_text = resp.data.decode("utf-8")
    assert "Order Number" in csv_text
    assert "ORD-REPORT-001" in csv_text

    # 2. Inventory CSV
    resp = client.get("/api/v1/admin/reports/export?type=inventory")
    assert resp.status_code == 200
    assert resp.mimetype == "text/csv"
    csv_text = resp.data.decode("utf-8")
    assert "Product ID" in csv_text
    assert "iPhone 12" in csv_text

    # 3. Orders CSV
    resp = client.get("/api/v1/admin/reports/export?type=orders")
    assert resp.status_code == 200
    assert resp.mimetype == "text/csv"
    csv_text = resp.data.decode("utf-8")
    assert "Recipient Name" in csv_text
    assert "Buyer Recipient" in csv_text
    assert "TRK-001" in csv_text

    # 4. Invalid export type -> 422
    resp = client.get("/api/v1/admin/reports/export?type=unknown")
    assert resp.status_code == 422
