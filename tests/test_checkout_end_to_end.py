from pathlib import Path

from backend.app.extensions import db
from backend.app.models import Coupon, DiscountType, Order, Payment, Product, ShippingRecord
from tests.test_checkout_confirmation_api import (
    register_buyer,
    setup_confirmation_app,
    teardown_confirmation_app,
    valid_checkout_payload,
)


def test_cart_and_checkout_sync_live_product_price_changes():
    app = setup_confirmation_app()
    client = app.test_client()

    register_buyer(client)
    add_res = client.post(
        "/api/v1/cart/items",
        json={"product_slug": "pre-owned-wireless-headphones", "quantity": 1},
    )
    assert add_res.status_code == 201
    assert add_res.get_json()["data"]["subtotal"]["amount_cents"] == 185000

    # Admin adjusts price while item sits in buyer's cart
    with app.app_context():
        product = Product.query.filter_by(slug="pre-owned-wireless-headphones").one()
        product.price_cents = 150000
        db.session.commit()

    cart_res = client.get("/api/v1/cart")
    assert cart_res.status_code == 200
    assert cart_res.get_json()["data"]["subtotal"]["amount_cents"] == 150000

    draft_payload = valid_checkout_payload()
    draft_res = client.post("/api/v1/checkout/draft", json=draft_payload)
    assert draft_res.status_code == 200
    # 1500 + 45 shipping = 1545
    assert draft_res.get_json()["data"]["totals"]["total"]["amount_cents"] == 154500

    confirm_res = client.post("/api/v1/checkout/confirm", json=draft_payload)
    assert confirm_res.status_code == 201
    assert confirm_res.get_json()["data"]["order"]["total"]["amount_cents"] == 154500

    teardown_confirmation_app(app)


def test_checkout_confirm_idempotency_key_prevents_duplicate_orders():
    app = setup_confirmation_app()
    client = app.test_client()

    register_buyer(client)
    client.post(
        "/api/v1/cart/items",
        json={"product_slug": "pre-owned-wireless-headphones", "quantity": 1},
    )

    headers = {"Idempotency-Key": "chk-test-idempotency-001"}
    first = client.post("/api/v1/checkout/confirm", json=valid_checkout_payload(), headers=headers)
    second = client.post("/api/v1/checkout/confirm", json=valid_checkout_payload(), headers=headers)

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.get_json()["data"]["order"]["order_number"] == second.get_json()["data"]["order"]["order_number"]

    with app.app_context():
        assert Order.query.count() == 1
        assert Payment.query.count() == 1
        assert ShippingRecord.query.count() == 1
        product = Product.query.filter_by(slug="pre-owned-wireless-headphones").one()
        assert product.quantity == 0

    teardown_confirmation_app(app)


def test_order_recalculate_totals_preserves_discount():
    app = setup_confirmation_app()
    with app.app_context():
        order = Order(
            user_id=1,
            order_number="SM-TEST-RECALC",
            subtotal_cents=200000,
            shipping_cents=4500,
            discount_cents=25000,
            total_cents=0,
        )
        # Mock one order item in memory via relationship attribute assignment isn't persisted; test method directly:
        order.discount_cents = 25000
        # Add real coupon and verify checkout order math end to end too
        coupon = Coupon(
            code="DISC250",
            discount_type=DiscountType.FIXED.value,
            discount_value_cents=25000,
            min_spend_cents=0,
            is_active=True,
        )
        db.session.add(coupon)
        db.session.commit()

    client = app.test_client()
    register_buyer(client)
    client.post(
        "/api/v1/cart/items",
        json={"product_slug": "pre-owned-wireless-headphones", "quantity": 1},
    )
    payload = valid_checkout_payload(coupon_code="DISC250")
    res = client.post("/api/v1/checkout/confirm", json=payload)
    assert res.status_code == 201
    order_number = res.get_json()["data"]["order"]["order_number"]

    with app.app_context():
        saved = Order.query.filter_by(order_number=order_number).one()
        saved.recalculate_totals()
        # 185000 - 25000 + 4500 = 164500
        assert saved.total_cents == 164500

    teardown_confirmation_app(app)


def test_returning_buyer_saved_address_to_orders_history_journey():
    app = setup_confirmation_app()
    client = app.test_client()

    reg = register_buyer(client)
    assert reg.status_code == 201

    addr_res = client.post(
        "/api/v1/addresses",
        json={
            "label": "Office",
            "recipient_name": "Returning Buyer",
            "phone": "09179998888",
            "street_line1": "88 Ayala Ave",
            "city": "Makati",
            "state_or_province": "Metro Manila",
            "postal_code": "1226",
            "country": "Philippines",
            "is_default": True,
        },
    )
    assert addr_res.status_code == 201

    pref_res = client.patch(
        "/api/v1/auth/payment-preferences",
        json={
            "preferred_payment_method": "gcash_pending",
            "enabled_methods": ["cash_on_delivery", "gcash_pending"],
            "gcash_mobile": "09179998888",
        },
    )
    assert pref_res.status_code == 200

    client.post(
        "/api/v1/cart/items",
        json={"product_slug": "pre-owned-wireless-headphones", "quantity": 1},
    )
    confirm_res = client.post(
        "/api/v1/checkout/confirm",
        json={
            "shipping_address": {
                "recipient_name": "Returning Buyer",
                "phone": "09179998888",
                "address_line1": "88 Ayala Ave",
                "city": "Makati",
                "province": "Metro Manila",
                "postal_code": "1226",
                "country": "Philippines",
            },
            "payment_method": "gcash_pending",
        },
    )
    assert confirm_res.status_code == 201
    order_number = confirm_res.get_json()["data"]["order"]["order_number"]

    history_res = client.get("/api/v1/orders")
    assert history_res.status_code == 200
    assert any(o["order_number"] == order_number for o in history_res.get_json()["data"])

    detail_res = client.get(f"/api/v1/orders/{order_number}")
    assert detail_res.status_code == 200
    detail = detail_res.get_json()["data"]
    assert detail["shipping_record"]["city"] == "Makati"
    assert detail["payments"][0]["method"] == "gcash_pending"

    teardown_confirmation_app(app)


def test_checkout_shell_templates_are_synchronized_and_no_mock_checkout():
    app = setup_confirmation_app()
    client = app.test_client()

    shell_html = client.get("/checkout").get_data(as_text=True)
    summary_tpl = client.get("/checkout/pages/summary.html").get_data(as_text=True)
    cart_tpl = client.get("/checkout/pages/cart.html").get_data(as_text=True)
    confirm_tpl = client.get("/checkout/pages/confirmation.html").get_data(as_text=True)

    # Critical: inline templates inside /checkout must stay synced with pages/*.html
    for marker in (
        "{{couponSection}}",
        "{{discountRow}}",
        "{{paymentMethodOptions}}",
        "{{summaryItems}}",
        'id="template-confirmation"',
    ):
        assert marker in shell_html

    assert "{{couponSection}}" in summary_tpl
    assert "{{cartAlertBanner}}" in cart_tpl
    assert "{{confirmationBody}}" in confirm_tpl

    marketplace_js = Path("frontend/static/js/marketplace/app.js").read_text(encoding="utf-8")
    assert "Encrypted Mock Authorization" not in marketplace_js
    assert "AUR-" not in marketplace_js

    auth_page_js = Path("frontend/static/js/auth-page.js").read_text(encoding="utf-8")
    assert "getSafeNextUrl" in auth_page_js

    teardown_confirmation_app(app)
