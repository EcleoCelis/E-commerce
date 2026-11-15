from pathlib import Path
from types import SimpleNamespace

import pytest
import stripe

from backend.app import create_app
from backend.app.auth.rbac import Role
from backend.app.communication import email_service
from backend.app.core.config import ProductionConfig, TestingConfig
from backend.app.extensions import db
from backend.app.models import (
    Category,
    Coupon,
    CouponRedemption,
    DiscountType,
    Order,
    OrderStatus,
    PaymentStatus,
    Product,
    ProductStatus,
)
from backend.app.seed import seed_development_data


def _setup_app():
    app = create_app(TestingConfig)
    with app.app_context():
        db.create_all()
        seed_development_data()
    return app


def _teardown_app(app):
    with app.app_context():
        db.session.remove()
        db.drop_all()


def _register_buyer(client, email="auditbuyer@example.com"):
    return client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "Secondhand2026",
            "first_name": "Audit",
            "last_name": "Buyer",
            "role": Role.BUYER.value,
        },
    )


def _checkout_payload(payment_method="cash_on_delivery", coupon_code=None):
    data = {
        "shipping_address": {
            "recipient_name": "Audit Buyer",
            "phone": "09171234567",
            "address_line1": "101 Rizal Avenue",
            "address_line2": "",
            "city": "Tagbilaran",
            "province": "Bohol",
            "postal_code": "6300",
            "country": "Philippines",
        },
        "payment_method": payment_method,
    }
    if coupon_code:
        data["coupon_code"] = coupon_code
    return data


def test_authenticated_payment_methods_endpoint_returns_resolved_preferences():
    app = _setup_app()
    client = app.test_client()
    assert _register_buyer(client).status_code == 201

    resp = client.get("/api/v1/checkout/payments/methods")
    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["preferred_payment_method"] == "cash_on_delivery"
    assert isinstance(data["payment_preferences"]["enabled_methods"], list)
    assert "gcash_mobile" in data["payment_preferences"]

    _teardown_app(app)


def test_readiness_endpoint_does_not_leak_raw_exception(monkeypatch):
    app = _setup_app()
    client = app.test_client()

    def _boom(*args, **kwargs):
        raise RuntimeError("psycopg fatal: password authentication failed for user postgres@10.0.0.5")

    monkeypatch.setattr(db.session, "execute", _boom)
    resp = client.get("/api/v1/health/ready")
    assert resp.status_code == 503
    body = resp.get_json()
    assert body["message"] == "Database readiness check failed."
    assert "psycopg" not in body["message"]
    assert "10.0.0.5" not in body["message"]

    _teardown_app(app)


def test_forgot_password_dispatches_reset_email():
    app = _setup_app()
    client = app.test_client()
    _register_buyer(client, email="resetme@example.com")
    email_service.sent_emails.clear()

    resp = client.post("/api/v1/auth/forgot-password", json={"email": "resetme@example.com"})
    assert resp.status_code == 200
    token = resp.get_json()["data"]["dev_token"]
    assert token

    matching = [m for m in email_service.sent_emails if m["to"] == "resetme@example.com"]
    assert len(matching) == 1
    assert token in matching[0]["text"]

    _teardown_app(app)


def test_production_config_blocks_default_secret_key(monkeypatch):
    class InsecureProdConfig(ProductionConfig):
        TESTING = False
        SECRET_KEY = "dev-only-change-me"

    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        create_app(InsecureProdConfig)


def test_csrf_enforces_buyer_mutations_and_exempts_stripe_webhook(monkeypatch):
    app = _setup_app()
    app.config["TESTING"] = False
    app.config["CSRF_PROTECTION_ENABLED"] = True
    client = app.test_client()

    # Buyer POST without CSRF token is rejected
    blocked = client.post(
        "/api/v1/auth/register",
        json={
            "email": "csrf@example.com",
            "password": "Secondhand2026",
            "first_name": "Csrf",
            "last_name": "User",
            "role": Role.BUYER.value,
        },
    )
    assert blocked.status_code == 403
    assert blocked.get_json()["error"]["code"] == "csrf_token_invalid"

    # Fetch token and submit with X-CSRF-Token succeeds
    token_resp = client.get("/api/v1/auth/csrf-token")
    csrf_token = token_resp.get_json()["data"]["csrf_token"]
    allowed = client.post(
        "/api/v1/auth/register",
        headers={"X-CSRF-Token": csrf_token},
        json={
            "email": "csrf@example.com",
            "password": "Secondhand2026",
            "first_name": "Csrf",
            "last_name": "User",
            "role": Role.BUYER.value,
        },
    )
    assert allowed.status_code == 201

    # Webhook bypasses CSRF and reaches signature check (401/503), never 403 csrf_token_invalid
    webhook_resp = client.post(
        "/api/v1/checkout/payments/webhook",
        data=b"{}",
        content_type="application/json",
    )
    assert webhook_resp.status_code in {401, 503}

    _teardown_app(app)


def test_cart_and_checkout_block_products_in_deactivated_categories():
    app = _setup_app()
    client = app.test_client()
    assert _register_buyer(client).status_code == 201

    with app.app_context():
        product = Product.query.filter_by(status=ProductStatus.AVAILABLE.value).filter(Product.quantity > 0).first()
        slug = product.slug
        category_id = product.category_id

    assert client.post("/api/v1/cart/items", json={"product_slug": slug, "quantity": 1}).status_code == 201

    with app.app_context():
        cat = db.session.get(Category, category_id)
        cat.is_active = False
        db.session.commit()

    cart_resp = client.get("/api/v1/cart")
    assert cart_resp.status_code == 200
    assert cart_resp.get_json()["data"]["has_unavailable_items"] is True

    confirm_resp = client.post("/api/v1/checkout/confirm", json=_checkout_payload())
    assert confirm_resp.status_code == 409
    assert confirm_resp.get_json()["error"]["code"] == "cart_not_checkout_ready"

    add_resp = client.post("/api/v1/cart/items", json={"product_slug": slug, "quantity": 1})
    assert add_resp.status_code == 409
    assert add_resp.get_json()["error"]["code"] == "product_unavailable"

    _teardown_app(app)


def test_coupon_usage_limit_is_atomic_with_checkout():
    app = _setup_app()
    with app.app_context():
        coupon = Coupon(
            code="ONCEONLY",
            discount_type=DiscountType.FIXED.value,
            discount_value_cents=10000,
            min_spend_cents=0,
            usage_limit=1,
            is_active=True,
        )
        db.session.add(coupon)
        product = Product.query.filter_by(status=ProductStatus.AVAILABLE.value).filter(Product.quantity >= 2).first()
        if product is None:
            product = Product.query.filter_by(status=ProductStatus.AVAILABLE.value).first()
            product.quantity = 3
        slug = product.slug
        db.session.commit()

    buyer1 = app.test_client()
    assert _register_buyer(buyer1, "c1@example.com").status_code == 201
    buyer1.post("/api/v1/cart/items", json={"product_slug": slug, "quantity": 1})
    res1 = buyer1.post("/api/v1/checkout/confirm", json=_checkout_payload(coupon_code="ONCEONLY"))
    assert res1.status_code == 201

    buyer2 = app.test_client()
    assert _register_buyer(buyer2, "c2@example.com").status_code == 201
    buyer2.post("/api/v1/cart/items", json={"product_slug": slug, "quantity": 1})
    res2 = buyer2.post("/api/v1/checkout/confirm", json=_checkout_payload(coupon_code="ONCEONLY"))
    assert res2.status_code in {400, 409}

    with app.app_context():
        c = Coupon.query.filter_by(code="ONCEONLY").one()
        assert c.used_count == 1
        assert CouponRedemption.query.filter_by(coupon_id=c.id).count() == 1

    _teardown_app(app)


def test_buyer_cancel_paid_stripe_order_issues_stripe_refund(monkeypatch):
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    app = _setup_app()
    app.config["STRIPE_SECRET_KEY"] = "sk_test_mock_refund"
    client = app.test_client()
    assert _register_buyer(client, "stripecancel@example.com").status_code == 201

    with app.app_context():
        product = Product.query.filter_by(status=ProductStatus.AVAILABLE.value).filter(Product.quantity > 0).first()
        slug = product.slug
        initial_qty = product.quantity

    monkeypatch.setattr(
        stripe.checkout.Session,
        "create",
        lambda **kwargs: SimpleNamespace(
            id="cs_test_cancel_1",
            url="https://checkout.stripe.com/pay/cs_test_cancel_1",
            payment_intent="pi_test_cancel_1",
        ),
    )
    monkeypatch.setattr(
        stripe.checkout.Session,
        "retrieve",
        lambda session_id, **kwargs: SimpleNamespace(
            id=session_id,
            payment_status="paid",
            amount_total=kwargs.get("amount_total", 9999999),
            payment_intent="pi_test_cancel_1",
            metadata={},
            client_reference_id=None,
        ),
    )

    refund_calls = []
    monkeypatch.setattr(
        stripe.Refund,
        "create",
        lambda **kwargs: (
            refund_calls.append(kwargs),
            SimpleNamespace(id="re_test_cancel_1", amount=kwargs.get("amount", 0), status="succeeded"),
        )[1],
    )

    client.post("/api/v1/cart/items", json={"product_slug": slug, "quantity": 1})
    order_res = client.post("/api/v1/checkout/confirm", json=_checkout_payload(payment_method="credit_debit_card"))
    assert order_res.status_code == 201
    order_number = order_res.get_json()["data"]["order"]["order_number"]

    verify_res = client.post(
        f"/api/v1/checkout/payments/{order_number}/verify-stripe",
        json={"session_id": "cs_test_cancel_1"},
    )
    assert verify_res.status_code == 200

    cancel_res = client.patch(f"/api/v1/orders/{order_number}/cancel")
    assert cancel_res.status_code == 200
    cancelled_order = cancel_res.get_json()["data"]
    assert cancelled_order["status"] == OrderStatus.CANCELLED.value
    assert cancelled_order["payment_status"] == PaymentStatus.REFUNDED.value
    assert len(refund_calls) == 1
    assert refund_calls[0]["payment_intent"] == "pi_test_cancel_1"

    with app.app_context():
        p = Product.query.filter_by(slug=slug).one()
        assert p.quantity == initial_qty

    _teardown_app(app)


def test_frontend_buyer_readiness_fixes_present():
    app = create_app(TestingConfig)
    client = app.test_client()

    auth_client = client.get("/static/js/auth-client.js").get_data(as_text=True)
    marketplace_api = client.get("/static/js/marketplace-api.js").get_data(as_text=True)
    checkout_api = client.get("/static/js/checkout/checkout-api.js").get_data(as_text=True)
    orders_api = client.get("/static/js/orders/orders-api.js").get_data(as_text=True)
    marketplace_app = client.get("/static/js/marketplace/app.js").get_data(as_text=True)
    wishlist_page = client.get("/static/js/marketplace/pages/wishlist-page.js").get_data(as_text=True)
    login_html = client.get("/login.html").get_data(as_text=True)
    detail_html = client.get("/orders/pages/detail.html").get_data(as_text=True)

    assert "X-CSRF-Token" in auth_client
    assert "X-CSRF-Token" in marketplace_api
    assert "X-CSRF-Token" in checkout_api
    assert "X-CSRF-Token" in orders_api
    assert "payload.message || payload.error?.message" in marketplace_api
    assert "priceMax: null" in marketplace_app
    assert "requestedView === 'pdp'" in marketplace_app
    assert "wishlistProducts" in wishlist_page
    assert "data-forgot-form" in login_html
    assert "data-reset-form" in login_html
    assert "{{returnSection}}" in detail_html


def test_forgot_password_email_contains_reset_link_and_completes_reset_flow(monkeypatch):
    app = _setup_app()
    app.config["APP_PUBLIC_BASE_URL"] = "https://shop.secondmarket.example"
    client = app.test_client()
    _register_buyer(client, email="resetflow@example.com")
    email_service.sent_emails.clear()

    # Unknown account still returns generic 200 and dispatches no email
    unknown_resp = client.post("/api/v1/auth/forgot-password", json={"email": "missing@example.com"})
    assert unknown_resp.status_code == 200
    assert len(email_service.sent_emails) == 0

    # Registered account creates token and dispatches reset link + token instructions
    forgot_resp = client.post("/api/v1/auth/forgot-password", json={"email": "resetflow@example.com"})
    assert forgot_resp.status_code == 200
    token = forgot_resp.get_json()["data"]["dev_token"]
    assert token

    matching = [m for m in email_service.sent_emails if m["to"] == "resetflow@example.com"]
    assert len(matching) == 1
    expected_link = f"https://shop.secondmarket.example/login.html?reset_token={token}"
    assert expected_link in matching[0]["text"]
    assert matching[0]["html"] and expected_link in matching[0]["html"]

    # Weak password rejected
    weak_resp = client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "weak"},
    )
    assert weak_resp.status_code == 422

    # Valid reset completes and invalidates the token for reuse
    reset_resp = client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "NewPassword2026"},
    )
    assert reset_resp.status_code == 200

    reuse_resp = client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "AnotherPassword2026"},
    )
    assert reuse_resp.status_code == 400
    assert reuse_resp.get_json()["error"]["code"] == "invalid_reset_token"

    # Old password fails, new password succeeds
    old_login = client.post(
        "/api/v1/auth/login",
        json={"email": "resetflow@example.com", "password": "Secondhand2026"},
    )
    assert old_login.status_code == 401

    new_login = client.post(
        "/api/v1/auth/login",
        json={"email": "resetflow@example.com", "password": "NewPassword2026"},
    )
    assert new_login.status_code == 200

    _teardown_app(app)


def test_email_service_dispatches_via_smtp_and_flags_unconfigured_production(monkeypatch):
    import smtplib

    sent_calls = []

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            sent_calls.append({"host": host, "port": port, "timeout": timeout, "tls": False, "login": None})

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def starttls(self):
            sent_calls[-1]["tls"] = True

        def login(self, user, password):
            sent_calls[-1]["login"] = (user, password)

        def sendmail(self, from_addr, to_addrs, raw_msg):
            sent_calls[-1]["from"] = from_addr
            sent_calls[-1]["to"] = to_addrs
            sent_calls[-1]["msg"] = raw_msg

    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USE_TLS", "true")
    monkeypatch.setenv("SMTP_USER", "mailer@example.com")
    monkeypatch.setenv("SMTP_PASS", "app-password")
    monkeypatch.setenv("EMAIL_FROM", "SecondMarket <no-reply@example.com>")

    email_service.sent_emails.clear()
    ok = email_service.send_password_reset(
        "celisjomari711@gmail.com",
        "tok_abc_123",
        base_url="https://e-commerce-production-b648aa02.up.railway.app",
    )
    assert ok is True
    assert len(sent_calls) == 1
    assert sent_calls[0]["host"] == "smtp.example.com"
    assert sent_calls[0]["port"] == 587
    assert sent_calls[0]["timeout"] == 15.0
    assert sent_calls[0]["tls"] is True
    assert sent_calls[0]["login"] == ("mailer@example.com", "app-password")
    assert sent_calls[0]["to"] == ["celisjomari711@gmail.com"]

    import email as stdlib_email

    parsed_msg = stdlib_email.message_from_string(sent_calls[0]["msg"])
    decoded_parts = [
        part.get_payload(decode=True).decode("utf-8")
        for part in parsed_msg.walk()
        if part.get_content_maintype() == "text"
    ]
    assert any("login.html?reset_token=tok_abc_123" in body for body in decoded_parts)

    # Without SMTP_HOST in production runtime, send_email returns False instead of silently faking success
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.setattr(email_service, "_is_production_runtime", lambda: True)
    delivered = email_service.send_email("celisjomari711@gmail.com", "Test", "Body")
    assert delivered is False
