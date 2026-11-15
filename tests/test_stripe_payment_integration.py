import stripe

from backend.app import create_app
from backend.app.auth.rbac import Role
from backend.app.core.config import TestingConfig
from backend.app.extensions import db
from backend.app.models import Order, OrderItem, OrderStatus, Payment, PaymentStatus, Product, ProductStatus, ReturnRequest, ReturnStatus, User
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


def _register_buyer(client, email="stripebuyer@example.com"):
    return client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "Secondhand2026",
            "first_name": "Stripe",
            "last_name": "Buyer",
            "role": Role.BUYER.value,
        },
    )


def _add_available_product_to_cart(app, client):
    with app.app_context():
        product = (
            Product.query.filter_by(status=ProductStatus.AVAILABLE.value)
            .filter(Product.quantity > 0)
            .order_by(Product.id.asc())
            .first()
        )
        slug = product.slug
        initial_qty = product.quantity

    resp = client.post("/api/v1/cart/items", json={"product_slug": slug, "quantity": 1})
    assert resp.status_code in {200, 201}
    return slug, initial_qty


def _card_checkout_payload():
    return {
        "shipping_address": {
            "recipient_name": "Stripe Buyer",
            "phone": "09171234567",
            "address_line1": "123 Reuse Street",
            "address_line2": "Unit 2",
            "city": "Tagbilaran",
            "province": "Bohol",
            "postal_code": "6300",
            "country": "Philippines",
        },
        "payment_method": "credit_debit_card",
    }


def test_stripe_checkout_unconfigured_returns_503_without_orphaned_order(monkeypatch):
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    app = _setup_app()
    app.config["STRIPE_SECRET_KEY"] = ""
    client = app.test_client()

    _register_buyer(client)
    slug, initial_qty = _add_available_product_to_cart(app, client)

    methods_res = client.get("/api/v1/checkout/payments/methods")
    assert methods_res.status_code == 200
    assert methods_res.get_json()["data"]["stripe_configured"] is False

    confirm_res = client.post("/api/v1/checkout/confirm", json=_card_checkout_payload())
    assert confirm_res.status_code == 503
    assert confirm_res.get_json()["error"]["code"] == "stripe_not_configured"

    with app.app_context():
        product = Product.query.filter_by(slug=slug).one()
        assert product.quantity == initial_qty
        assert Order.query.count() == 0

    _teardown_app(app)


def test_stripe_checkout_session_creation_and_server_verification(monkeypatch):
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    app = _setup_app()
    app.config["STRIPE_SECRET_KEY"] = "sk_test_mock_123"
    client = app.test_client()

    _register_buyer(client)
    _add_available_product_to_cart(app, client)

    captured_session_kwargs = {}

    def fake_create(**kwargs):
        captured_session_kwargs.update(kwargs)
        order_number = kwargs["metadata"]["order_number"]
        return {
            "id": "cs_test_a1b2c3d4",
            "url": "https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4",
            "status": "open",
            "payment_status": "unpaid",
            "metadata": {"order_number": order_number},
        }

    monkeypatch.setattr(stripe.checkout.Session, "create", fake_create)

    confirm_res = client.post("/api/v1/checkout/confirm", json=_card_checkout_payload())
    assert confirm_res.status_code == 201
    data = confirm_res.get_json()["data"]
    order_number = data["order"]["order_number"]

    assert data["payment"]["method"] == "credit_debit_card"
    assert data["payment"]["reference_number"] == "cs_test_a1b2c3d4"
    assert data["payment"]["intent"]["provider"] == "stripe"
    assert data["payment"]["intent"]["redirect_required"] is True
    assert data["payment"]["intent"]["checkout_url"] == "https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4"

    assert captured_session_kwargs["api_key"] == "sk_test_mock_123"
    assert captured_session_kwargs["mode"] == "payment"
    assert captured_session_kwargs["line_items"][0]["price_data"]["currency"] == "php"
    assert f"confirmed={order_number}" in captured_session_kwargs["success_url"]

    # Buyer cannot bypass Stripe by calling the manual GCash /confirm endpoint
    manual_confirm = client.post(f"/api/v1/checkout/payments/{order_number}/confirm", json={})
    assert manual_confirm.status_code == 409
    assert manual_confirm.get_json()["error"]["code"] == "online_verification_required"

    # Unpaid Stripe session must not mark order paid
    monkeypatch.setattr(
        stripe.checkout.Session,
        "retrieve",
        lambda session_id, api_key=None: {
            "id": session_id,
            "status": "open",
            "payment_status": "unpaid",
            "amount_total": captured_session_kwargs["line_items"][0]["price_data"]["unit_amount"],
            "metadata": {"order_number": order_number},
        },
    )
    incomplete_res = client.post(
        f"/api/v1/checkout/payments/{order_number}/verify-stripe",
        json={"session_id": "cs_test_a1b2c3d4"},
    )
    assert incomplete_res.status_code == 402
    assert incomplete_res.get_json()["error"]["code"] == "stripe_payment_incomplete"

    # Paid Stripe session marks order & payment as paid server-side
    monkeypatch.setattr(
        stripe.checkout.Session,
        "retrieve",
        lambda session_id, api_key=None: {
            "id": session_id,
            "status": "complete",
            "payment_status": "paid",
            "payment_intent": "pi_test_999888",
            "amount_total": captured_session_kwargs["line_items"][0]["price_data"]["unit_amount"],
            "metadata": {"order_number": order_number},
        },
    )
    verify_res = client.post(
        f"/api/v1/checkout/payments/{order_number}/verify-stripe",
        json={"session_id": "cs_test_a1b2c3d4"},
    )
    assert verify_res.status_code == 200
    verify_data = verify_res.get_json()["data"]
    assert verify_data["order"]["payment_status"] == PaymentStatus.PAID.value
    assert verify_data["payment"]["reference_number"] == "pi_test_999888"

    # Repeating verification stays idempotent
    repeat_res = client.post(
        f"/api/v1/checkout/payments/{order_number}/verify-stripe",
        json={"session_id": "cs_test_a1b2c3d4"},
    )
    assert repeat_res.status_code == 200
    assert repeat_res.get_json()["data"]["order"]["payment_status"] == PaymentStatus.PAID.value

    _teardown_app(app)


def test_stripe_webhook_handles_signature_success_and_failure(monkeypatch):
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    app = _setup_app()
    app.config["STRIPE_SECRET_KEY"] = "sk_test_mock_123"
    app.config["STRIPE_WEBHOOK_SECRET"] = "whsec_mock_123"
    client = app.test_client()

    _register_buyer(client)
    _add_available_product_to_cart(app, client)

    created_total_cents = {"val": 0}

    def fake_create(**kwargs):
        created_total_cents["val"] = kwargs["line_items"][0]["price_data"]["unit_amount"]
        return {
            "id": "cs_test_webhook_01",
            "url": "https://checkout.stripe.com/c/pay/cs_test_webhook_01",
            "status": "open",
            "payment_status": "unpaid",
            "metadata": kwargs["metadata"],
        }

    monkeypatch.setattr(stripe.checkout.Session, "create", fake_create)
    confirm_res = client.post("/api/v1/checkout/confirm", json=_card_checkout_payload())
    assert confirm_res.status_code == 201
    order_number = confirm_res.get_json()["data"]["order"]["order_number"]

    # Invalid signature must return 401
    def fake_bad_construct(payload, sig_header, secret):
        raise stripe.SignatureVerificationError("bad sig", sig_header)

    monkeypatch.setattr(stripe.Webhook, "construct_event", fake_bad_construct)
    bad_sig_res = client.post(
        "/api/v1/checkout/payments/webhook",
        data=b"{}",
        headers={"Stripe-Signature": "t=1,v1=invalid"},
    )
    assert bad_sig_res.status_code == 401
    assert bad_sig_res.get_json()["error"]["code"] == "invalid_signature"

    # Expired/failed session marks payment failed
    monkeypatch.setattr(
        stripe.Webhook,
        "construct_event",
        lambda payload, sig_header, secret: {
            "type": "checkout.session.expired",
            "data": {
                "object": {
                    "id": "cs_test_webhook_01",
                    "metadata": {"order_number": order_number},
                }
            },
        },
    )
    failed_res = client.post(
        "/api/v1/checkout/payments/webhook",
        data=b"{}",
        headers={"Stripe-Signature": "t=1,v1=valid"},
    )
    assert failed_res.status_code == 200
    with app.app_context():
        order = Order.query.filter_by(order_number=order_number).one()
        assert order.payment_status == PaymentStatus.FAILED.value

    # Completed paid webhook upgrades payment from failed -> paid
    monkeypatch.setattr(
        stripe.Webhook,
        "construct_event",
        lambda payload, sig_header, secret: {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_test_webhook_01",
                    "payment_intent": "pi_webhook_paid_01",
                    "payment_status": "paid",
                    "amount_total": created_total_cents["val"],
                    "metadata": {"order_number": order_number},
                }
            },
        },
    )
    paid_res = client.post(
        "/api/v1/checkout/payments/webhook",
        data=b"{}",
        headers={"Stripe-Signature": "t=1,v1=valid"},
    )
    assert paid_res.status_code == 200
    assert paid_res.get_json()["data"]["processed"] is True
    with app.app_context():
        order = Order.query.filter_by(order_number=order_number).one()
        assert order.payment_status == PaymentStatus.PAID.value
        assert order.payments[0].reference_number == "pi_webhook_paid_01"

    _teardown_app(app)


def test_profile_accepts_credit_debit_card_and_blocks_raw_card_fields():
    app = _setup_app()
    client = app.test_client()
    _register_buyer(client)

    update_res = client.patch(
        "/api/v1/auth/payment-preferences",
        json={
            "preferred_payment_method": "credit_debit_card",
            "enabled_methods": ["cash_on_delivery", "credit_debit_card"],
        },
    )
    assert update_res.status_code == 200
    user_data = update_res.get_json()["data"]
    assert user_data["preferred_payment_method"] == "credit_debit_card"
    assert "credit_debit_card" in user_data["payment_preferences"]["enabled_methods"]

    # Raw card numbers or CVV must still be strictly blocked
    raw_card_res = client.patch(
        "/api/v1/auth/payment-preferences",
        json={
            "preferred_payment_method": "credit_debit_card",
            "enabled_methods": ["credit_debit_card"],
            "card_number": "4242424242424242",
        },
    )
    assert raw_card_res.status_code == 422

    _teardown_app(app)


def test_stripe_refund_execution_and_idempotency_on_return(monkeypatch):
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    app = _setup_app()
    app.config["STRIPE_SECRET_KEY"] = "sk_test_refund_123"
    client = app.test_client()

    _register_buyer(client, email="refundbuyer@example.com")
    with app.app_context():
        buyer = User.query.filter_by(email="refundbuyer@example.com").one()
        product = Product.query.filter_by(status=ProductStatus.AVAILABLE.value).first()
        order = Order(
            user_id=buyer.id,
            order_number="SM-STRIPE-RET01",
            status=OrderStatus.DELIVERED.value,
            payment_status=PaymentStatus.PAID.value,
            subtotal_cents=250000,
            shipping_cents=0,
            total_cents=250000,
        )
        order.items.append(
            OrderItem(
                product_id=product.id,
                product_title=product.title,
                quantity=1,
                unit_price_cents=250000,
            )
        )
        db.session.add(order)
        db.session.flush()
        db.session.add(
            Payment(
                order_id=order.id,
                method="credit_debit_card",
                status=PaymentStatus.PAID.value,
                amount_cents=250000,
                reference_number="cs_test_session_refund_01",
            )
        )
        ret = ReturnRequest(
            return_number="RET-STRIPE01",
            order_id=order.id,
            user_id=buyer.id,
            reason="Item not as described",
            description="Scratches on top surface",
            status=ReturnStatus.APPROVED.value,
            refund_amount_cents=250000,
        )
        db.session.add(ret)
        db.session.commit()

    # Log in as seeded admin
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@secondmarket.test", "password": "AdminSeller2026"},
    )
    assert login_res.status_code == 200

    # Excess refund validation -> 422 before hitting Stripe
    excess_res = client.patch(
        "/api/v1/admin/returns/RET-STRIPE01/status",
        json={"status": "refunded", "refund_amount": 3000},
    )
    assert excess_res.status_code == 422
    assert excess_res.get_json()["error"]["code"] == "invalid_refund_amount"

    # Mock Stripe session retrieve (cs_ -> pi_) & Refund.create error rollback
    monkeypatch.setattr(
        stripe.checkout.Session,
        "retrieve",
        lambda session_id, api_key=None: {"id": session_id, "payment_intent": "pi_refund_target_01"},
    )

    def fake_refund_fail(**kwargs):
        raise stripe.StripeError("Insufficient funds for refund")

    monkeypatch.setattr(stripe.Refund, "create", fake_refund_fail)
    fail_res = client.patch(
        "/api/v1/admin/returns/RET-STRIPE01/status",
        json={"status": "refunded", "refund_amount": 2000, "admin_notes": "Partial refund agreed"},
    )
    assert fail_res.status_code == 502
    assert fail_res.get_json()["error"]["code"] == "stripe_refund_failed"

    with app.app_context():
        ret = ReturnRequest.query.filter_by(return_number="RET-STRIPE01").one()
        assert ret.status == ReturnStatus.APPROVED.value
        assert ret.order.payment_status == PaymentStatus.PAID.value

    # Now succeed with Stripe Refund.create
    refund_calls = []

    def fake_refund_ok(**kwargs):
        refund_calls.append(kwargs)
        return {"id": "re_test_998877", "amount": kwargs.get("amount"), "status": "succeeded"}

    monkeypatch.setattr(stripe.Refund, "create", fake_refund_ok)
    ok_res = client.patch(
        "/api/v1/admin/returns/RET-STRIPE01/status",
        json={"status": "refunded", "refund_amount": 2000, "admin_notes": "Partial refund agreed"},
    )
    assert ok_res.status_code == 200
    data = ok_res.get_json()["data"]
    assert data["status"] == "refunded"
    assert data["refund_reference"] == "re_test_998877"
    assert data["refund_gateway"] == "stripe"
    assert len(refund_calls) == 1
    assert refund_calls[0]["payment_intent"] == "pi_refund_target_01"
    assert refund_calls[0]["amount"] == 200000

    # Transitioning refunded -> completed must be idempotent (no second Stripe refund)
    complete_res = client.patch(
        "/api/v1/admin/returns/RET-STRIPE01/status",
        json={"status": "completed"},
    )
    assert complete_res.status_code == 200
    assert complete_res.get_json()["data"]["status"] == "completed"
    assert len(refund_calls) == 1

    with app.app_context():
        order = Order.query.filter_by(order_number="SM-STRIPE-RET01").one()
        assert order.payment_status == PaymentStatus.REFUNDED.value
        refund_rows = [p for p in order.payments if p.method == "refund"]
        assert len(refund_rows) == 1
        assert refund_rows[0].reference_number == "re_test_998877"
        assert refund_rows[0].amount_cents == 200000

    _teardown_app(app)
