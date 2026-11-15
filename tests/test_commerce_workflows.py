import hashlib
import hmac
import json
from backend.app import create_app
from backend.app.auth.service import create_auth_session, register_buyer
from backend.app.checkout.coupons import create_coupon
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
    UserStatus,
)


def setup_commerce_fixtures():
    db.drop_all()
    db.create_all()

    category = Category(name="Furniture", slug="furniture")
    db.session.add(category)

    buyer_a = register_buyer({
        "email": "buyer_commerce_a@example.com",
        "password": "Password123!",
        "first_name": "Charlie",
        "last_name": "Commerce",
        "role": "buyer",
    })
    buyer_b = register_buyer({
        "email": "buyer_commerce_b@example.com",
        "password": "Password123!",
        "first_name": "Diana",
        "last_name": "Commerce",
        "role": "buyer",
    })
    admin = User(
        email="admin_commerce@example.com",
        role="admin",
        status=UserStatus.ACTIVE.value,
        first_name="Admin",
        last_name="Seller",
    )
    admin.set_password("AdminPass123!")
    db.session.add(admin)
    db.session.commit()

    token_a, _ = create_auth_session(buyer_a)
    token_b, _ = create_auth_session(buyer_b)
    token_admin, _ = create_auth_session(admin)

    return (buyer_a, token_a), (buyer_b, token_b), (admin, token_admin), category


def test_saved_addresses_workflow_and_isolation():
    app = create_app(TestingConfig)
    with app.app_context():
        (buyer_a, token_a), (buyer_b, token_b), _, _ = setup_commerce_fixtures()
        client = app.test_client()

        # 1. Buyer A creates first address (auto-default)
        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], token_a)
        resp1 = client.post("/api/v1/addresses", json={
            "label": "Apartment",
            "recipient_name": "Charlie C",
            "phone": "09170001111",
            "street_line1": "123 Mango Street",
            "city": "Makati",
            "state_or_province": "Metro Manila",
            "postal_code": "1200",
        })
        assert resp1.status_code == 201
        addr1 = resp1.json["data"]
        assert addr1["is_default"] is True
        addr1_id = addr1["id"]

        # 2. Buyer A creates second address and sets default
        resp2 = client.post("/api/v1/addresses", json={
            "label": "Office",
            "recipient_name": "Charlie Work",
            "phone": "09170002222",
            "street_line1": "456 Ayala Ave",
            "city": "Makati",
            "state_or_province": "Metro Manila",
            "postal_code": "1226",
            "is_default": True,
        })
        assert resp2.status_code == 201
        addr2 = resp2.json["data"]
        assert addr2["is_default"] is True
        addr2_id = addr2["id"]

        # List addresses
        list_resp = client.get("/api/v1/addresses")
        assert list_resp.status_code == 200
        addresses = list_resp.json["data"]["addresses"]
        assert len(addresses) == 2

        # 3. Ownership isolation: Buyer B cannot update or delete Buyer A's address
        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], token_b)
        tamper_resp = client.patch(f"/api/v1/addresses/{addr1_id}", json={"recipient_name": "Attacker"})
        assert tamper_resp.status_code == 404

        delete_tamper = client.delete(f"/api/v1/addresses/{addr1_id}")
        assert delete_tamper.status_code == 404

        # 4. Buyer A deletes addr2
        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], token_a)
        del_resp = client.delete(f"/api/v1/addresses/{addr2_id}")
        assert del_resp.status_code == 200


def test_coupons_and_promotions_application():
    app = create_app(TestingConfig)
    with app.app_context():
        (buyer_a, token_a), _, (admin, token_admin), _ = setup_commerce_fixtures()
        client = app.test_client()

        # Admin creates coupon: FIXED ₱200 off, minimum spend ₱1,000
        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], token_admin)
        coupon_resp = client.post("/api/v1/admin/coupons", json={
            "code": "SAVE200",
            "discount_type": "fixed",
            "discount_value": 200,
            "min_spend": 1000,
            "usage_limit": 5,
        })
        assert coupon_resp.status_code == 201
        coupon_data = coupon_resp.json["data"]
        assert coupon_data["code"] == "SAVE200"

        # Buyer attempts to apply coupon with insufficient subtotal (₱800)
        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], token_a)
        fail_resp = client.post("/api/v1/checkout/coupons/apply", json={
            "code": "SAVE200",
            "subtotal": 800,
        })
        assert fail_resp.status_code == 400
        assert fail_resp.json["error"]["code"] == "coupon_min_spend_not_met"

        # Buyer applies coupon with qualifying subtotal (₱1,500)
        success_resp = client.post("/api/v1/checkout/coupons/apply", json={
            "code": "SAVE200",
            "subtotal": 1500,
        })
        assert success_resp.status_code == 200
        applied = success_resp.json["data"]
        assert applied["discount_amount"] == 200
        assert applied["new_subtotal_cents"] == 130000

        # Percentage coupon: 10% off with max discount ₱500
        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], token_admin)
        client.post("/api/v1/admin/coupons", json={
            "code": "PCT10",
            "discount_type": "percentage",
            "discount_value": 10,
            "min_spend": 500,
            "max_discount": 500,
        })

        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], token_a)
        pct_resp = client.post("/api/v1/checkout/coupons/apply", json={
            "code": "PCT10",
            "subtotal": 6000,
        })
        assert pct_resp.status_code == 200
        assert pct_resp.json["data"]["discount_amount"] == 500  # Capped at 500


def test_post_delivery_return_and_refund_workflow():
    app = create_app(TestingConfig)
    with app.app_context():
        (buyer_a, token_a), _, (admin, token_admin), category = setup_commerce_fixtures()
        client = app.test_client()

        # Create product & delivered order for Buyer A
        product = Product(
            title="Vintage Armchair",
            slug="vintage-armchair",
            description="Comfortable vintage armchair with classic fabric.",
            price_cents=450000,
            quantity=1,
            category_id=category.id,
            condition=ProductCondition.GOOD.value,
            status=ProductStatus.SOLD.value,
            seller_id=admin.id,
        )
        db.session.add(product)

        order = Order(
            user=buyer_a,
            order_number="SM-DELIVERED01",
            status=OrderStatus.DELIVERED.value,
            payment_status=PaymentStatus.PAID.value,
            shipping_status=ShippingStatus.SHIPPED.value,
            subtotal_cents=450000,
            shipping_cents=0,
            total_cents=450000,
        )
        order.items.append(OrderItem(product=product, product_title="Vintage Armchair", quantity=1, unit_price_cents=450000))
        db.session.add(order)
        db.session.commit()

        # Buyer A submits return request
        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], token_a)
        ret_resp = client.post("/api/v1/orders/SM-DELIVERED01/returns", json={
            "reason": "Damaged upholstery",
            "description": "The fabric on the backrest has a tear not disclosed in pictures.",
        })
        assert ret_resp.status_code == 201
        ret_data = ret_resp.json["data"]
        return_number = ret_data["return_number"]
        assert ret_data["status"] == "requested"

        # Admin lists returns
        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], token_admin)
        admin_list = client.get("/api/v1/admin/returns")
        assert admin_list.status_code == 200
        assert admin_list.json["data"]["total"] >= 1

        # Admin completes refund
        refund_resp = client.patch(f"/api/v1/admin/returns/{return_number}/status", json={
            "status": "refunded",
            "admin_notes": "Courier retrieved item; full refund issued to buyer.",
            "refund_amount": 4500,
        })
        assert refund_resp.status_code == 200
        assert refund_resp.json["data"]["status"] == "refunded"

        # Verify order payment status transitioned to REFUNDED
        db.session.refresh(order)
        assert order.payment_status == PaymentStatus.REFUNDED.value


def test_bulk_csv_product_import():
    app = create_app(TestingConfig)
    with app.app_context():
        _, _, (admin, token_admin), category = setup_commerce_fixtures()
        client = app.test_client()
        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], token_admin)

        # CSV with 2 items and a formula injection attempt (=1+1)
        csv_content = (
            "Title,SKU,Category,Condition,Price,Quantity,Description\n"
            "Teak Coffee Table,TBL-001,furniture,Lightly Used,3500.00,2,Sturdy mid-century teak table\n"
            "=2+5 Malicious Formula,XLS-002,furniture,Like New,1200.00,1,Should be sanitized\n"
        )

        resp = client.post("/api/v1/admin/products/import-csv", json={"csv_data": csv_content})
        assert resp.status_code == 201
        data = resp.json["data"]
        assert data["imported_count"] == 2
        assert data["failed_count"] == 0

        # Verify product created and formula was neutralized with leading quote
        sanitized_prod = Product.query.filter_by(sku="XLS-002").one_or_none()
        assert sanitized_prod is not None
        assert sanitized_prod.title.startswith("'=")


def test_payment_webhook_idempotency():
    app = create_app(TestingConfig)
    with app.app_context():
        (buyer_a, _), _, (admin, _), category = setup_commerce_fixtures()
        client = app.test_client()

        # Create unpaid pending order
        order = Order(
            user=buyer_a,
            order_number="SM-PAYTEST01",
            status=OrderStatus.CONFIRMED.value,
            payment_status=PaymentStatus.PENDING.value,
            subtotal_cents=250000,
            shipping_cents=0,
            total_cents=250000,
        )
        db.session.add(order)
        db.session.commit()

        webhook_secret = b"sandbox_secret_key"
        payload_dict = {
            "event": "payment.succeeded",
            "order_number": "SM-PAYTEST01",
            "amount_cents": 250000,
            "payment_reference": "TXN_WEBHOOK_999",
        }
        payload_bytes = json.dumps(payload_dict).encode("utf-8")
        signature = hmac.new(webhook_secret, payload_bytes, hashlib.sha256).hexdigest()

        # 1. First webhook execution succeeds and marks order paid
        resp = client.post(
            "/api/v1/checkout/payments/webhook?provider=sandbox",
            data=payload_bytes,
            headers={"Content-Type": "application/json", "X-Signature": signature},
        )
        assert resp.status_code == 200
        assert resp.json["data"]["processed"] is True

        db.session.refresh(order)
        assert order.payment_status == PaymentStatus.PAID.value

        # 2. Duplicate webhook execution is idempotent
        resp_dup = client.post(
            "/api/v1/checkout/payments/webhook?provider=sandbox",
            data=payload_bytes,
            headers={"Content-Type": "application/json", "X-Signature": signature},
        )
        assert resp_dup.status_code == 200

        # Payments table has exactly one payment record for this reference
        payments = Payment.query.filter_by(reference_number="TXN_WEBHOOK_999").all()
        assert len(payments) == 1
