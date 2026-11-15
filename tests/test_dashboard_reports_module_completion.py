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


def test_module_10_kpi_calculations_and_data_integrity(client):
    """
    Validates that all Module 10 KPIs are calculated accurately from underlying DB records:
    - Gross and net revenue from paid orders
    - Exclusion of cancelled orders from revenue
    - Calculation of average order value (AOV)
    - Inventory valuation based only on available stock
    - Identification of low stock (< 2 units) and out of stock items
    - Correct status distribution counts
    """
    admin = User(email="admin@secondmarket.local", role=Role.ADMIN.value, first_name="Market", last_name="Admin")
    admin.set_password("AdminPass2026")
    buyer1 = User(email="buyer1@test.local", role=Role.BUYER.value, first_name="Buyer", last_name="One")
    buyer1.set_password("BuyerPass2026")
    buyer2 = User(email="buyer2@test.local", role=Role.BUYER.value, first_name="Buyer", last_name="Two")
    buyer2.set_password("BuyerPass2026")

    db.session.add_all([admin, buyer1, buyer2])
    db.session.commit()

    cat1 = Category(name="Electronics", slug="electronics")
    cat2 = Category(name="Furniture", slug="furniture")
    db.session.add_all([cat1, cat2])
    db.session.commit()

    # Product A: 1 unit available @ 10,000 PHP (1,000,000 cents) -> Low stock
    prod_a = Product(
        title="Laptop A",
        slug="laptop-a",
        description="High spec laptop",
        price_cents=1000000,
        quantity=1,
        condition=ProductCondition.GOOD.value,
        status=ProductStatus.AVAILABLE.value,
        category_id=cat1.id,
        seller_id=admin.id,
    )
    # Product B: 4 units available @ 5,000 PHP (500,000 cents)
    prod_b = Product(
        title="Chair B",
        slug="chair-b",
        description="Comfortable office chair",
        price_cents=500000,
        quantity=4,
        condition=ProductCondition.LIKE_NEW.value,
        status=ProductStatus.AVAILABLE.value,
        category_id=cat2.id,
        seller_id=admin.id,
    )
    # Product C: 0 units available @ 3,000 PHP (300,000 cents) -> Sold / Out of stock
    prod_c = Product(
        title="Desk C",
        slug="desk-c",
        description="Wooden desk",
        price_cents=300000,
        quantity=0,
        condition=ProductCondition.FAIR.value,
        status=ProductStatus.SOLD.value,
        category_id=cat2.id,
        seller_id=admin.id,
    )
    db.session.add_all([prod_a, prod_b, prod_c])
    db.session.commit()

    # Order 1: Paid & Delivered -> 1x Laptop A (1,000,000 cents + 10,000 shipping = 1,010,000 cents)
    order1 = Order(
        order_number="ORD-M10-001",
        user_id=buyer1.id,
        status=OrderStatus.DELIVERED.value,
        payment_status=PaymentStatus.PAID.value,
        shipping_status=ShippingStatus.DELIVERED.value,
        subtotal_cents=1000000,
        shipping_cents=10000,
        total_cents=1010000,
        placed_at=datetime.now(timezone.utc),
    )
    # Order 2: Paid & Processing -> 2x Chair B (1,000,000 cents + 15,000 shipping = 1,015,000 cents)
    order2 = Order(
        order_number="ORD-M10-002",
        user_id=buyer2.id,
        status=OrderStatus.PROCESSING.value,
        payment_status=PaymentStatus.PAID.value,
        shipping_status=ShippingStatus.NOT_READY.value,
        subtotal_cents=1000000,
        shipping_cents=15000,
        total_cents=1015000,
        placed_at=datetime.now(timezone.utc),
    )
    # Order 3: Cancelled order -> should not count toward revenue
    order3 = Order(
        order_number="ORD-M10-003",
        user_id=buyer1.id,
        status=OrderStatus.CANCELLED.value,
        payment_status=PaymentStatus.REFUNDED.value,
        shipping_status=ShippingStatus.NOT_READY.value,
        subtotal_cents=500000,
        shipping_cents=10000,
        total_cents=510000,
        placed_at=datetime.now(timezone.utc),
    )
    db.session.add_all([order1, order2, order3])
    db.session.commit()

    item1 = OrderItem(
        order_id=order1.id,
        product_id=prod_a.id,
        product_title=prod_a.title,
        quantity=1,
        unit_price_cents=1000000,
    )
    item2 = OrderItem(
        order_id=order2.id,
        product_id=prod_b.id,
        product_title=prod_b.title,
        quantity=2,
        unit_price_cents=500000,
    )
    item3 = OrderItem(
        order_id=order3.id,
        product_id=prod_b.id,
        product_title=prod_b.title,
        quantity=1,
        unit_price_cents=500000,
    )
    db.session.add_all([item1, item2, item3])
    db.session.commit()

    # Login as admin
    client.post("/api/v1/auth/login", json={"email": admin.email, "password": "AdminPass2026"})

    resp = client.get("/api/v1/admin/reports/dashboard")
    assert resp.status_code == 200
    data = resp.get_json()["data"]

    summary = data["summary"]
    # Total orders = 3, completed = 1, cancelled = 1, paid = 2
    assert summary["total_orders"] == 3
    assert summary["completed_orders"] == 1
    assert summary["cancelled_orders"] == 1
    assert summary["paid_orders"] == 2

    # Gross revenue: Order 1 (1,010,000) + Order 2 (1,015,000) = 2,025,000 cents
    assert summary["gross_revenue"]["amount_cents"] == 2025000
    # Net revenue: Gross (2,025,000) - Refunded (510,000) = 1,515,000 cents
    assert summary["net_revenue"]["amount_cents"] == 1515000

    # AOV: 2,025,000 / 2 paid orders = 1,012,500 cents
    assert summary["average_order_value"]["amount_cents"] == 1012500

    # Customers
    assert summary["total_customers"] == 2
    assert summary["active_customers"] == 2

    # Inventory:
    # Prod A: 1 unit * 10,000 = 10,000 PHP (1,000,000 cents)
    # Prod B: 4 units * 5,000 = 20,000 PHP (2,000,000 cents)
    # Total available valuation = 3,000,000 cents
    assert summary["inventory_valuation"]["amount_cents"] == 3000000
    assert summary["available_products"] == 2
    assert summary["sold_products"] == 1
    assert summary["low_stock_products"] == 1

    # Status distribution
    status_counts = data["orders_by_status"]
    assert status_counts[OrderStatus.DELIVERED.value] == 1
    assert status_counts[OrderStatus.PROCESSING.value] == 1
    assert status_counts[OrderStatus.CANCELLED.value] == 1

    # Low stock items list contains Prod A
    assert any(item["title"] == "Laptop A" for item in data["low_stock_items"])
