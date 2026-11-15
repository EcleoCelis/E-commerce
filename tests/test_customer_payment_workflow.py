from pathlib import Path

from backend.app.extensions import db
from backend.app.models.commerce import (
    Coupon,
    CouponRedemption,
    DiscountType,
    Order,
    Payment,
    PaymentStatus,
)
from tests.test_checkout_confirmation_api import (
    register_buyer,
    setup_confirmation_app,
    teardown_confirmation_app,
    valid_checkout_payload,
)


def create_fixed_coupon(app, code="SAVE200", discount_value_cents=20000):
    with app.app_context():
        coupon = Coupon(
            code=code,
            discount_type=DiscountType.FIXED.value,
            discount_value_cents=discount_value_cents,
            min_spend_cents=0,
            is_active=True,
        )
        db.session.add(coupon)
        db.session.commit()
        return coupon.code


def test_payment_methods_catalog_endpoint():
    app = setup_confirmation_app()
    client = app.test_client()

    response = client.get("/api/v1/checkout/payments/methods")
    payload = response.get_json()

    assert response.status_code == 200
    methods_by_code = {item["code"]: item for item in payload["data"]["methods"]}
    assert methods_by_code["cash_on_delivery"]["supported"] is True
    assert methods_by_code["gcash_pending"]["supported"] is True

    teardown_confirmation_app(app)


def test_checkout_coupon_and_gcash_customer_payment_confirmation_flow():
    app = setup_confirmation_app()
    client = app.test_client()
    coupon_code = create_fixed_coupon(app, code="SAVE200", discount_value_cents=20000)

    register_buyer(client)
    add_res = client.post(
        "/api/v1/cart/items",
        json={"product_slug": "pre-owned-wireless-headphones", "quantity": 1},
    )
    assert add_res.status_code in (200, 201)

    apply_res = client.post(
        "/api/v1/checkout/coupons/apply",
        json={"code": coupon_code, "subtotal": 1850},
    )
    assert apply_res.status_code == 200
    assert apply_res.get_json()["data"]["discount_cents"] == 20000

    draft_payload = valid_checkout_payload(payment_method="gcash_pending")
    draft_payload["coupon_code"] = coupon_code

    draft_res = client.post("/api/v1/checkout/draft", json=draft_payload)
    draft_data = draft_res.get_json()["data"]
    assert draft_res.status_code == 200
    assert draft_data["coupon_code"] == "SAVE200"
    assert draft_data["totals"]["discount"]["amount"] == 200
    # 1850 - 200 + 45 shipping = 1695
    assert draft_data["totals"]["total"]["amount"] == 1695

    confirm_res = client.post("/api/v1/checkout/confirm", json=draft_payload)
    confirm_data = confirm_res.get_json()["data"]
    assert confirm_res.status_code == 201

    order_number = confirm_data["order"]["order_number"]
    assert confirm_data["order"]["discount"]["amount"] == 200
    assert confirm_data["order"]["total"]["amount"] == 1695
    assert confirm_data["order"]["payment_status"] == PaymentStatus.PENDING.value
    assert confirm_data["payment"]["method"] == "gcash_pending"
    assert confirm_data["payment"]["status"] == PaymentStatus.PENDING.value
    assert confirm_data["payment"]["intent"]["checkout_url"] == f"/orders?order={order_number}"

    status_res = client.get(f"/api/v1/checkout/payments/{order_number}")
    assert status_res.status_code == 200
    assert status_res.get_json()["data"]["payment"]["amount"]["amount"] == 1695

    invalid_ref_res = client.post(
        f"/api/v1/checkout/payments/{order_number}/confirm",
        json={"reference_number": "bad ref!!"},
    )
    assert invalid_ref_res.status_code == 422

    pay_res = client.post(
        f"/api/v1/checkout/payments/{order_number}/confirm",
        json={"reference_number": "GCASH-99887766"},
    )
    pay_data = pay_res.get_json()["data"]
    assert pay_res.status_code == 200
    assert pay_data["payment"]["status"] == PaymentStatus.PAID.value
    assert pay_data["payment"]["reference_number"] == "GCASH-99887766"
    assert pay_data["order"]["payment_status"] == PaymentStatus.PAID.value
    assert pay_data["order"]["status"] == "confirmed"

    repeat_res = client.post(
        f"/api/v1/checkout/payments/{order_number}/confirm",
        json={"reference_number": "GCASH-99887766"},
    )
    assert repeat_res.status_code == 200
    assert repeat_res.get_json()["data"]["payment"]["reference_number"] == "GCASH-99887766"

    with app.app_context():
        assert Payment.query.count() == 1
        payment = Payment.query.one()
        assert payment.status == PaymentStatus.PAID.value
        assert payment.amount_cents == 169500
        assert CouponRedemption.query.count() == 1

    teardown_confirmation_app(app)


def test_customer_payment_confirm_blocks_cod_cancelled_and_other_buyers():
    app = setup_confirmation_app()
    client = app.test_client()

    register_buyer(client, email="buyer1@example.com")
    client.post(
        "/api/v1/cart/items",
        json={"product_slug": "pre-owned-wireless-headphones", "quantity": 1},
    )
    cod_res = client.post("/api/v1/checkout/confirm", json=valid_checkout_payload(payment_method="cash_on_delivery"))
    assert cod_res.status_code == 201
    cod_order = cod_res.get_json()["data"]["order"]["order_number"]

    cod_confirm = client.post(f"/api/v1/checkout/payments/{cod_order}/confirm", json={})
    assert cod_confirm.status_code == 409
    assert cod_confirm.get_json()["error"]["code"] == "cod_not_payable_online"

    client.post(
        "/api/v1/cart/items",
        json={"product_slug": "secondhand-smartphone", "quantity": 1},
    )
    gcash_res = client.post("/api/v1/checkout/confirm", json=valid_checkout_payload(payment_method="gcash_pending"))
    assert gcash_res.status_code == 201
    gcash_order = gcash_res.get_json()["data"]["order"]["order_number"]

    cancel_res = client.patch(f"/api/v1/orders/{gcash_order}/cancel")
    assert cancel_res.status_code == 200

    cancelled_confirm = client.post(f"/api/v1/checkout/payments/{gcash_order}/confirm", json={})
    assert cancelled_confirm.status_code == 409
    assert cancelled_confirm.get_json()["error"]["code"] == "order_cancelled"

    other_client = app.test_client()
    register_buyer(other_client, email="buyer2@example.com")
    other_get = other_client.get(f"/api/v1/checkout/payments/{cod_order}")
    assert other_get.status_code == 404

    with app.app_context():
        assert Order.query.count() == 2

    teardown_confirmation_app(app)


def test_frontend_payment_workflow_assets_and_templates():
    summary_html = Path("frontend/checkout/pages/summary.html").read_text(encoding="utf-8")
    summary_js = Path("frontend/static/js/checkout/pages/summary-page.js").read_text(encoding="utf-8")
    checkout_app_js = Path("frontend/static/js/checkout/app.js").read_text(encoding="utf-8")
    checkout_api_js = Path("frontend/static/js/checkout/checkout-api.js").read_text(encoding="utf-8")
    detail_html = Path("frontend/orders/pages/detail.html").read_text(encoding="utf-8")
    detail_js = Path("frontend/static/js/orders/pages/detail-page.js").read_text(encoding="utf-8")
    orders_app_js = Path("frontend/static/js/orders/app.js").read_text(encoding="utf-8")
    orders_api_js = Path("frontend/static/js/orders/orders-api.js").read_text(encoding="utf-8")

    assert "{{paymentMethodOptions}}" in summary_html
    assert "{{couponSection}}" in summary_html
    assert "{{discountRow}}" in summary_html
    assert "applyCouponCode" in summary_js
    assert "confirmOrderPayment" in summary_js
    assert "applyCoupon" in checkout_api_js
    assert "confirmPayment" in checkout_api_js
    assert 'typeof price === "number"' in checkout_app_js
    assert "saveDraftFormValues" in checkout_app_js

    assert "{{paymentPanel}}" in detail_html
    assert "renderPaymentPanel" in detail_js
    assert "Complete GCash Payment" in detail_js
    assert "confirmOrderPayment" in orders_app_js
    assert "confirmPayment" in orders_api_js
