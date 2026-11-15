from datetime import datetime, timedelta, timezone
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
    ProductReport,
    ProductStatus,
    ReportReason,
    ReportStatus,
    ReturnRequest,
    ReturnStatus,
    SupportTicket,
    SupportTicketStatus,
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


def create_user(email, role=Role.BUYER.value, created_at=None):
    user = User(email=email, role=role, first_name="Test", last_name="Buyer")
    user.set_password("SecurePassword2026")
    if created_at:
        user.created_at = created_at
    db.session.add(user)
    db.session.commit()
    return user


def login_user(client, email):
    return client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "SecurePassword2026"},
    )


def seed_analytics_dataset():
    now = datetime.now(timezone.utc)
    recent_dt = now - timedelta(days=2)
    prior_dt = now - timedelta(days=10)
    older_dt = now - timedelta(days=45)

    admin = create_user("analytics-admin@secondmarket.ph", role=Role.ADMIN.value, created_at=older_dt)
    returning_buyer = create_user("repeat@secondmarket.ph", created_at=prior_dt)
    new_buyer = create_user("newbuyer@secondmarket.ph", created_at=recent_dt)
    dormant_buyer = create_user("dormant@secondmarket.ph", created_at=older_dt)

    cat_elec = Category(name="Electronics", slug="electronics")
    cat_fashion = Category(name="Fashion", slug="fashion")
    db.session.add_all([cat_elec, cat_fashion])
    db.session.flush()

    p_phone = Product(
        title="Refurbished Phone",
        slug="refurbished-phone",
        description="Tested phone",
        price_cents=150000,
        quantity=1,
        condition=ProductCondition.GOOD.value,
        status=ProductStatus.AVAILABLE.value,
        category_id=cat_elec.id,
        seller_id=admin.id,
    )
    p_jacket = Product(
        title="Vintage Jacket",
        slug="vintage-jacket",
        description="Warm coat",
        price_cents=80000,
        quantity=5,
        condition=ProductCondition.LIKE_NEW.value,
        status=ProductStatus.AVAILABLE.value,
        category_id=cat_fashion.id,
        seller_id=admin.id,
    )
    p_watch = Product(
        title="Smart Watch",
        slug="smart-watch",
        description="Good watch",
        price_cents=100000,
        quantity=0,
        condition=ProductCondition.GOOD.value,
        status=ProductStatus.AVAILABLE.value,
        category_id=cat_elec.id,
        seller_id=admin.id,
    )
    db.session.add_all([p_phone, p_jacket, p_watch])
    db.session.flush()

    # Current 7d period orders:
    # 1) Delivered & Paid GCash order by returning_buyer: ₱1,500
    o1 = Order(
        order_number="SM-CUR-001",
        user_id=returning_buyer.id,
        status=OrderStatus.DELIVERED.value,
        payment_status=PaymentStatus.PAID.value,
        subtotal_cents=150000,
        shipping_cents=0,
        total_cents=150000,
        placed_at=recent_dt,
    )
    # 2) Processing & Pending COD order by new_buyer: ₱800
    o2 = Order(
        order_number="SM-CUR-002",
        user_id=new_buyer.id,
        status=OrderStatus.PROCESSING.value,
        payment_status=PaymentStatus.PENDING.value,
        subtotal_cents=80000,
        shipping_cents=0,
        total_cents=80000,
        placed_at=recent_dt + timedelta(hours=3),
    )
    # 3) Cancelled & Failed Payment order by new_buyer: ₱800 (excluded from revenue!)
    o3 = Order(
        order_number="SM-CUR-003",
        user_id=new_buyer.id,
        status=OrderStatus.CANCELLED.value,
        payment_status=PaymentStatus.FAILED.value,
        subtotal_cents=80000,
        shipping_cents=0,
        total_cents=80000,
        placed_at=recent_dt + timedelta(hours=5),
    )
    # 4) Prior 7d period (10 days ago) order by returning_buyer: Delivered & Paid ₱1,000
    # So returning_buyer has 2 non-cancelled lifetime orders -> classified as returning!
    # Also Fashion only sold in prior period (or Jacket in cur), let's make p_watch in prior only so
    # 7d vs all verifies category date filtering too!
    o4 = Order(
        order_number="SM-PRI-001",
        user_id=returning_buyer.id,
        status=OrderStatus.DELIVERED.value,
        payment_status=PaymentStatus.PAID.value,
        subtotal_cents=100000,
        shipping_cents=0,
        total_cents=100000,
        placed_at=prior_dt,
    )
    # 5) 45 days ago order refunded (checks 90d vs 7d/30d boundaries)
    o5 = Order(
        order_number="SM-OLD-001",
        user_id=dormant_buyer.id,
        status=OrderStatus.DELIVERED.value,
        payment_status=PaymentStatus.REFUNDED.value,
        subtotal_cents=80000,
        shipping_cents=0,
        total_cents=80000,
        placed_at=older_dt,
    )
    db.session.add_all([o1, o2, o3, o4, o5])
    db.session.flush()

    db.session.add_all([
        OrderItem(order_id=o1.id, product_id=p_phone.id, product_title=p_phone.title, unit_price_cents=150000, quantity=1),
        OrderItem(order_id=o2.id, product_id=p_jacket.id, product_title=p_jacket.title, unit_price_cents=80000, quantity=1),
        OrderItem(order_id=o3.id, product_id=p_jacket.id, product_title=p_jacket.title, unit_price_cents=80000, quantity=1),
        OrderItem(order_id=o4.id, product_id=p_watch.id, product_title=p_watch.title, unit_price_cents=100000, quantity=1),
        OrderItem(order_id=o5.id, product_id=p_jacket.id, product_title=p_jacket.title, unit_price_cents=80000, quantity=1),
    ])

    db.session.add_all([
        Payment(order_id=o1.id, method="gcash", status=PaymentStatus.PAID.value, amount_cents=150000),
        Payment(order_id=o2.id, method="cash_on_delivery", status=PaymentStatus.PENDING.value, amount_cents=80000),
        Payment(order_id=o3.id, method="maya", status=PaymentStatus.FAILED.value, amount_cents=80000),
        Payment(order_id=o4.id, method="gcash", status=PaymentStatus.PAID.value, amount_cents=100000),
        Payment(order_id=o5.id, method="credit_card", status=PaymentStatus.REFUNDED.value, amount_cents=80000),
    ])

    # Operational queue items
    db.session.add(
        ReturnRequest(
            return_number="RET-OPEN-1",
            order_id=o1.id,
            user_id=returning_buyer.id,
            reason="damaged",
            description="Screen scuff noticed",
            status=ReturnStatus.REQUESTED.value,
            refund_amount_cents=150000,
        )
    )
    db.session.add(
        SupportTicket(
            ticket_number="TKT-OPEN-1",
            user_id=new_buyer.id,
            subject="Delivery ETA",
            category="order",
            status=SupportTicketStatus.OPEN.value,
        )
    )
    db.session.add(
        ProductReport(
            product_id=p_phone.id,
            reporter_id=new_buyer.id,
            reason=ReportReason.MISLEADING.value,
            details="Battery details missing",
            status=ReportStatus.OPEN.value,
        )
    )
    db.session.commit()
    return admin, new_buyer


def test_dashboard_analytics_financials_growth_and_series(client):
    admin, _ = seed_analytics_dataset()
    login_user(client, admin.email)

    # 7d vs prior 7d (days 8..14 ago):
    # Current 7d: o1 paid ₱1,500, o2 pending ₱800, o3 cancelled/failed ₱800
    # -> net revenue ₱1,500 (150000), prior 7d o4 paid ₱1,000 (100000) -> +50.0% growth!
    res_7d = client.get("/api/v1/admin/reports/dashboard?range=7d")
    assert res_7d.status_code == 200
    data = res_7d.get_json()["data"]
    summary = data["summary"]

    assert summary["net_revenue"]["amount_cents"] == 150000
    assert summary["gross_revenue"]["amount_cents"] == 150000
    assert summary["ordered_merchandise"]["amount_cents"] == 230000
    assert summary["pending_collection"]["amount_cents"] == 80000
    assert summary["previous_net_revenue"]["amount_cents"] == 100000
    assert summary["revenue_growth_pct"] == 50.0
    assert summary["revenue_growth_status"] == "up"
    assert summary["total_orders"] == 3
    assert summary["previous_total_orders"] == 1
    assert summary["orders_growth_pct"] == 200.0
    assert summary["cancelled_orders"] == 1
    assert summary["pending_orders"] == 1
    assert summary["average_order_value"]["amount_cents"] == 150000

    # Top products distinguish ordered merchandise value vs actually collected (paid) revenue
    products_by_title = {p["title"]: p for p in data["top_selling_products"]}
    assert products_by_title["Refurbished Phone"]["ordered_value"]["amount_cents"] == 150000
    assert products_by_title["Refurbished Phone"]["collected_revenue"]["amount_cents"] == 150000
    assert products_by_title["Vintage Jacket"]["ordered_value"]["amount_cents"] == 80000
    assert products_by_title["Vintage Jacket"]["collected_revenue"]["amount_cents"] == 0

    # Payment analytics separates paid vs pending vs failed
    payments_by_method = {m["method"]: m for m in data["payment_analytics"]}
    assert payments_by_method["gcash"]["collected_amount"]["amount_cents"] == 150000
    assert payments_by_method["cash_on_delivery"]["pending_amount"]["amount_cents"] == 80000
    assert payments_by_method["cash_on_delivery"]["collected_amount"]["amount_cents"] == 0
    assert payments_by_method["maya"]["failed_count"] == 1

    # Customer returning vs first-time buyers in 7d (returning_buyer had o4 prior + o1 recent; new_buyer had o2 only non-cancelled)
    cust = data["customer_analytics"]
    assert cust["new_customers"] == 1
    assert cust["active_purchasers"] == 2
    assert cust["returning_buyers"] == 1
    assert cust["first_time_buyers"] == 1
    assert cust["returning_customer_rate_pct"] == 50.0

    # Operational attention counts
    ops = data["operational_insights"]
    assert ops["open_returns"] == 1
    assert ops["open_tickets"] == 1
    assert ops["open_reports"] == 1
    assert ops["low_stock_products"] == 2  # p_phone (qty=1) and p_watch (qty=0, available)
    assert ops["out_of_stock_products"] == 1
    assert ops["failed_payments"] == 1

    # Time series has contiguous daily points for 7d
    assert len(data["revenue_series"]) >= 7
    assert data["series_granularity"] == "day"

    # Range 90d captures o5 (45 days ago refunded ₱800) so net = (150000 + 100000) - 80000 = 170000
    res_90d = client.get("/api/v1/admin/reports/dashboard?range=90d")
    assert res_90d.status_code == 200
    summary_90d = res_90d.get_json()["data"]["summary"]
    assert summary_90d["gross_revenue"]["amount_cents"] == 250000
    assert summary_90d["refunded_amount"]["amount_cents"] == 80000
    assert summary_90d["net_revenue"]["amount_cents"] == 170000

    # Range 'all' explicitly reports no prior baseline rather than faking 0% or +100%
    res_all = client.get("/api/v1/admin/reports/dashboard?range=all")
    assert res_all.status_code == 200
    summary_all = res_all.get_json()["data"]["summary"]
    assert summary_all["revenue_growth_status"] == "no_baseline"
    assert summary_all["revenue_growth_pct"] is None


def test_top_categories_respects_date_filter_and_weekly_custom_bucketing(client):
    admin, _ = seed_analytics_dataset()
    login_user(client, admin.email)

    # Top categories in custom date range covering ONLY 10 days ago (prior_dt) should contain Electronics (Smart Watch), NOT Fashion!
    target_day = (datetime.now(timezone.utc) - timedelta(days=10)).date().isoformat()
    res = client.get(f"/api/v1/admin/reports/dashboard?range=custom&start_date={target_day}&end_date={target_day}")
    assert res.status_code == 200
    payload = res.get_json()["data"]
    cat_names = [c["name"] for c in payload["top_categories"]]
    assert cat_names == ["Electronics"]

    # Custom range > 90 days automatically switches to weekly granularity
    start_far = (datetime.now(timezone.utc) - timedelta(days=140)).date().isoformat()
    end_now = datetime.now(timezone.utc).date().isoformat()
    res_wide = client.get(f"/api/v1/admin/analytics/revenue?range=custom&start_date={start_far}&end_date={end_now}")
    assert res_wide.status_code == 200
    assert res_wide.get_json()["data"]["series_granularity"] == "week"


def test_analytics_endpoints_rbac_and_validation(client):
    admin, buyer = seed_analytics_dataset()

    # Unauthenticated -> 401
    for path in [
        "/api/v1/admin/analytics/overview",
        "/api/v1/admin/analytics/revenue",
        "/api/v1/admin/analytics/orders",
        "/api/v1/admin/analytics/products",
        "/api/v1/admin/analytics/customers",
        "/api/v1/admin/analytics/payments",
    ]:
        assert client.get(path).status_code == 401

    # Non-admin buyer -> 403
    login_user(client, buyer.email)
    for path in [
        "/api/v1/admin/analytics/overview",
        "/api/v1/admin/analytics/revenue",
        "/api/v1/admin/analytics/orders",
        "/api/v1/admin/analytics/products",
        "/api/v1/admin/analytics/customers",
        "/api/v1/admin/analytics/payments",
    ]:
        assert client.get(path).status_code == 403

    # Admin -> 200 on all granular endpoints + 422 on invalid range
    login_user(client, admin.email)
    assert client.get("/api/v1/admin/analytics/overview?range=30d").status_code == 200
    assert client.get("/api/v1/admin/analytics/revenue?range=90d").status_code == 200
    assert client.get("/api/v1/admin/analytics/orders?range=7d").status_code == 200
    assert client.get("/api/v1/admin/analytics/products?range=all").status_code == 200
    assert client.get("/api/v1/admin/analytics/customers?range=30d").status_code == 200
    assert client.get("/api/v1/admin/analytics/payments?range=30d").status_code == 200
    assert client.get("/api/v1/admin/analytics/revenue?range=invalid_range").status_code == 422
    assert client.get("/api/v1/admin/analytics/revenue?range=custom&start_date=2026-05-10&end_date=2026-05-01").status_code == 422


def test_admin_dashboard_assets_and_template_contracts(client):
    admin_html = client.get("/admin").get_data(as_text=True)
    assert "/static/js/admin/components/analytics-charts.js" in admin_html

    dashboard_tpl = client.get("/admin/pages/dashboard.html").get_data(as_text=True)
    assert "{{metricCards}}" in dashboard_tpl
    assert "{{revenueTrendChart}}" in dashboard_tpl
    assert "{{orderStatusDonut}}" in dashboard_tpl
    assert "{{paymentMethodsChart}}" in dashboard_tpl
    assert "{{topProductsChart}}" in dashboard_tpl
    assert "{{topCategoriesChart}}" in dashboard_tpl
    assert "{{customerAcquisitionChart}}" in dashboard_tpl
    assert "{{operationalInsightsCards}}" in dashboard_tpl
    assert "{{recentOrderRows}}" in dashboard_tpl
    assert "{{lowStockRows}}" in dashboard_tpl

    charts_js = client.get("/static/js/admin/components/analytics-charts.js").get_data(as_text=True)
    assert "AdminAnalyticsCharts" in charts_js
    assert "renderAreaLineChart" in charts_js
    assert "renderDonutChart" in charts_js
    assert "renderPieChart" in charts_js
    assert "renderPaymentBreakdown" in charts_js

    dashboard_js = client.get("/static/js/admin/pages/dashboard-page.js").get_data(as_text=True)
    assert "renderPieChart" in dashboard_js
    assert "Net Collected Revenue" in dashboard_tpl
    assert "Orders Placed" in dashboard_tpl
    assert "Top Ordered Products" in dashboard_tpl
    assert "Category Sales Mix" in dashboard_tpl
