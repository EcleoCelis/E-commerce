from datetime import datetime, timedelta, timezone
from backend.app import create_app
from backend.app.auth.rbac import Role
from backend.app.communication import notify_admins
from backend.app.core.config import TestingConfig
from backend.app.extensions import db
from backend.app.models import Order, OrderItem, OrderStatus, PaymentStatus, Product, ShippingRecord, ShippingStatus, User
from backend.app.seed import seed_development_data


def _setup_admin_env():
    app = create_app(TestingConfig)
    with app.app_context():
        db.create_all()
        seed_development_data()
        buyer = User(
            email="searchbuyer@example.com",
            role=Role.BUYER.value,
            first_name="Elena",
            last_name="Navarro",
            phone="09171234567",
        )
        buyer.set_password("BuyerPass2026!")
        db.session.add(buyer)
        db.session.flush()

        product = Product.query.first()
        product.sku = "SM-DESK-901"
        order = Order(
            user_id=buyer.id,
            order_number="SM-2026-0042",
            status=OrderStatus.PENDING.value,
            payment_status=PaymentStatus.PAID.value,
            subtotal_cents=product.price_cents,
            shipping_cents=0,
            total_cents=product.price_cents,
        )
        order.items.append(
            OrderItem(
                product_id=product.id,
                product_title=product.title,
                quantity=1,
                unit_price_cents=product.price_cents,
            )
        )
        db.session.add(order)
        db.session.commit()

    client = app.test_client()
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@secondmarket.test", "password": "AdminSeller2026"},
    )
    assert login_res.status_code == 200
    return app, client


def test_admin_global_search_matches_sm_prefix_product_sku_and_customer():
    app, client = _setup_admin_env()

    # Strip leading # for #SM- order lookup
    res_order = client.get("/api/v1/admin/search?q=%23SM-2026-0042")
    assert res_order.status_code == 200
    orders = res_order.get_json()["data"]["orders"]
    assert any(o["order_number"] == "SM-2026-0042" for o in orders)

    # Match SKU
    res_sku = client.get("/api/v1/admin/search?q=SM-DESK-901")
    assert res_sku.status_code == 200
    products = res_sku.get_json()["data"]["products"]
    assert any(p["sku"] == "SM-DESK-901" for p in products)

    # Match Customer email/name
    res_cust = client.get("/api/v1/admin/search?q=searchbuyer@example.com")
    assert res_cust.status_code == 200
    customers = res_cust.get_json()["data"]["customers"]
    assert any(c["email"] == "searchbuyer@example.com" for c in customers)

    with app.app_context():
        db.session.remove()
        db.drop_all()


def test_admin_notifications_sync_unread_and_mark_all_read():
    app, client = _setup_admin_env()

    with app.app_context():
        notify_admins(
            title="New High-Value Order",
            message="Order #SM-2026-0042 placed.",
            data={"order_number": "SM-2026-0042"},
        )

    unread_res = client.get("/api/v1/notifications/unread-count")
    assert unread_res.status_code == 200
    assert unread_res.get_json()["data"]["unread_count"] >= 1

    feed_res = client.get("/api/v1/notifications")
    assert feed_res.status_code == 200
    notifs = feed_res.get_json()["data"]["notifications"]
    assert any(n["data"].get("order_number") == "SM-2026-0042" for n in notifs)

    mark_res = client.post("/api/v1/notifications/mark-all-read")
    assert mark_res.status_code == 200

    unread_after = client.get("/api/v1/notifications/unread-count")
    assert unread_after.get_json()["data"]["unread_count"] == 0

    with app.app_context():
        db.session.remove()
        db.drop_all()


def test_coupon_full_lifecycle_cap_dates_edit_delete_and_redemptions():
    from backend.app.checkout.coupons import record_coupon_redemption

    app, client = _setup_admin_env()

    # 1. Percentage coupon with max_discount cap and validity dates
    create_res = client.post(
        "/api/v1/admin/coupons",
        json={
            "code": "VIP20",
            "discount_type": "percentage",
            "discount_value": 20,
            "max_discount": 150,
            "min_spend": 500,
            "usage_limit": 5,
            "valid_from": "2020-01-01",
            "valid_until": "2099-12-31",
        },
    )
    assert create_res.status_code == 201
    coupon = create_res.get_json()["data"]
    assert coupon["max_discount"] == 150.0
    assert coupon["valid_from"] is not None
    assert coupon["valid_until"] is not None
    coupon_id = coupon["id"]

    # 2. Apply coupon as buyer: 20% of 2000 = 400 -> capped at 150
    apply_res = client.post(
        "/api/v1/checkout/coupons/apply",
        json={"code": "VIP20", "subtotal": 2000},
    )
    assert apply_res.status_code == 200
    assert apply_res.get_json()["data"]["discount_amount"] == 150.0

    # 3. Edit coupon cap & code via PATCH
    patch_res = client.patch(
        f"/api/v1/admin/coupons/{coupon_id}",
        json={"max_discount": 250, "discount_value": 25},
    )
    assert patch_res.status_code == 200
    assert patch_res.get_json()["data"]["max_discount"] == 250.0
    assert patch_res.get_json()["data"]["discount_value"] == 25.0

    # 4. Future scheduled coupon is rejected at checkout
    sched_res = client.post(
        "/api/v1/admin/coupons",
        json={
            "code": "FUTURE50",
            "discount_type": "fixed",
            "discount_value": 50,
            "valid_from": "2099-01-01",
        },
    )
    assert sched_res.status_code == 201
    sched_id = sched_res.get_json()["data"]["id"]
    early_apply = client.post("/api/v1/checkout/coupons/apply", json={"code": "FUTURE50", "subtotal": 500})
    assert early_apply.status_code == 400
    assert early_apply.get_json()["error"]["code"] == "coupon_not_started"

    # Unused coupon deletes cleanly
    del_unused = client.delete(f"/api/v1/admin/coupons/{sched_id}")
    assert del_unused.status_code == 200
    assert del_unused.get_json()["data"]["deleted"] is True

    # 5. Record redemption -> redemptions history works and delete is blocked (409)
    with app.app_context():
        order = Order.query.filter_by(order_number="SM-2026-0042").one()
        record_coupon_redemption("VIP20", order.id, order.user_id, 15000)

    hist_res = client.get(f"/api/v1/admin/coupons/{coupon_id}/redemptions")
    assert hist_res.status_code == 200
    redemptions = hist_res.get_json()["data"]["redemptions"]
    assert len(redemptions) == 1
    assert redemptions[0]["order_number"] == "SM-2026-0042"
    assert redemptions[0]["discount_amount"] == 150.0

    del_used = client.delete(f"/api/v1/admin/coupons/{coupon_id}")
    assert del_used.status_code == 409

    with app.app_context():
        db.session.remove()
        db.drop_all()


def test_admin_customer_management_360_suspend_and_session_revoke():
    from backend.app.models.identity import Address, AuthSession
    from backend.app.models.base import utc_now
    from datetime import timedelta

    app, client = _setup_admin_env()

    with app.app_context():
        buyer = User.query.filter_by(email="searchbuyer@example.com").one()
        buyer_id = buyer.id
        db.session.add(
            Address(
                user_id=buyer.id,
                label="Home",
                recipient_name="Elena Navarro",
                phone="09171234567",
                street_line1="123 Rizal Ave",
                city="Makati",
                state_or_province="Metro Manila",
                postal_code="1200",
                is_default=True,
            )
        )
        db.session.add(
            AuthSession(
                user_id=buyer.id,
                token_hash="buyer-active-session-hash-001",
                expires_at=utc_now() + timedelta(days=7),
            )
        )
        db.session.commit()

    # 1. List customers with stats
    list_res = client.get("/api/v1/admin/customers?q=elena")
    assert list_res.status_code == 200
    data = list_res.get_json()["data"]
    assert data["summary"]["total_customers"] >= 1
    assert any(c["email"] == "searchbuyer@example.com" and c["order_count"] == 1 and c["active_session_count"] == 1 for c in data["customers"])

    # 2. Customer 360 detail
    detail_res = client.get(f"/api/v1/admin/customers/{buyer_id}")
    assert detail_res.status_code == 200
    detail = detail_res.get_json()["data"]
    assert len(detail["addresses"]) == 1
    assert len(detail["orders"]) == 1
    assert detail["orders"][0]["order_number"] == "SM-2026-0042"

    # 3. Suspend revokes sessions automatically
    susp_res = client.patch(
        f"/api/v1/admin/customers/{buyer_id}/status",
        json={"status": "disabled"},
    )
    assert susp_res.status_code == 200
    assert susp_res.get_json()["data"]["status"] == "disabled"
    assert susp_res.get_json()["data"]["active_session_count"] == 0

    # Reactivate cleanly
    act_res = client.patch(
        f"/api/v1/admin/customers/{buyer_id}/status",
        json={"status": "active"},
    )
    assert act_res.status_code == 200
    assert act_res.get_json()["data"]["status"] == "active"

    # Revoke new session explicitly
    with app.app_context():
        db.session.add(
            AuthSession(
                user_id=buyer_id,
                token_hash="buyer-active-session-hash-002",
                expires_at=utc_now() + timedelta(days=7),
            )
        )
        db.session.commit()

    rev_res = client.post(f"/api/v1/admin/customers/{buyer_id}/revoke-sessions")
    assert rev_res.status_code == 200
    assert rev_res.get_json()["data"]["revoked_count"] == 1

    with app.app_context():
        db.session.remove()
        db.drop_all()


def test_admin_payments_ledger_reconcile_and_refund(monkeypatch):
    import stripe
    from backend.app.models.commerce import Payment

    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    app, client = _setup_admin_env()
    app.config["STRIPE_SECRET_KEY"] = "sk_test_ledger_123"

    with app.app_context():
        buyer = User.query.filter_by(email="searchbuyer@example.com").one()
        product = Product.query.first()

        # Order 1: Pending Stripe Checkout session
        o_stripe = Order(
            user_id=buyer.id,
            order_number="SM-PAY-STRIPE01",
            status=OrderStatus.PENDING.value,
            payment_status=PaymentStatus.PENDING.value,
            subtotal_cents=200000,
            shipping_cents=0,
            total_cents=200000,
        )
        o_stripe.items.append(OrderItem(product_id=product.id, product_title=product.title, quantity=1, unit_price_cents=200000))
        db.session.add(o_stripe)
        db.session.flush()
        p_stripe = Payment(
            order_id=o_stripe.id,
            method="credit_debit_card",
            status=PaymentStatus.PENDING.value,
            amount_cents=200000,
            reference_number="cs_test_ledger_01",
        )
        db.session.add(p_stripe)

        # Order 2: Pending GCash payment
        o_gcash = Order(
            user_id=buyer.id,
            order_number="SM-PAY-GCASH01",
            status=OrderStatus.PENDING.value,
            payment_status=PaymentStatus.PENDING.value,
            subtotal_cents=95000,
            shipping_cents=0,
            total_cents=95000,
        )
        o_gcash.items.append(OrderItem(product_id=product.id, product_title=product.title, quantity=1, unit_price_cents=95000))
        db.session.add(o_gcash)
        db.session.flush()
        p_gcash = Payment(
            order_id=o_gcash.id,
            method="gcash_pending",
            status=PaymentStatus.PENDING.value,
            amount_cents=95000,
            reference_number="GCASH-PENDING-01",
        )
        db.session.add(p_gcash)
        db.session.commit()
        stripe_pid = p_stripe.id
        gcash_pid = p_gcash.id

    # 1. List ledger
    list_res = client.get("/api/v1/admin/payments")
    assert list_res.status_code == 200
    ledger = list_res.get_json()["data"]
    assert ledger["summary"]["pending_amount"] == 2950.0
    assert len(ledger["payments"]) >= 2

    # 2. Reconcile GCash pending -> Paid
    gcash_rec = client.post(f"/api/v1/admin/payments/{gcash_pid}/reconcile")
    assert gcash_rec.status_code == 200
    assert gcash_rec.get_json()["data"]["status"] == "paid"

    # 3. Reconcile Stripe pending -> Verify session & mark Paid with pi_...
    monkeypatch.setattr(
        stripe.checkout.Session,
        "retrieve",
        lambda session_id, api_key=None: {
            "id": session_id,
            "payment_status": "paid",
            "payment_intent": "pi_ledger_paid_01",
            "amount_total": 200000,
            "metadata": {"order_number": "SM-PAY-STRIPE01"},
        },
    )
    stripe_rec = client.post(f"/api/v1/admin/payments/{stripe_pid}/reconcile")
    assert stripe_rec.status_code == 200
    assert stripe_rec.get_json()["data"]["status"] == "paid"
    assert stripe_rec.get_json()["data"]["reference_number"] == "pi_ledger_paid_01"

    # 4. Refund Stripe payment -> executes stripe.Refund.create
    monkeypatch.setattr(
        stripe.Refund,
        "create",
        lambda **kwargs: {"id": "re_ledger_01", "amount": kwargs.get("amount"), "status": "succeeded"},
    )
    refund_res = client.post(f"/api/v1/admin/payments/{stripe_pid}/refund", json={"amount": 2000})
    assert refund_res.status_code == 200
    rdata = refund_res.get_json()["data"]
    assert rdata["gateway"] == "stripe"
    assert rdata["refund_id"] == "re_ledger_01"

    # Verify KPI summary has no double-counting (collected: 950 GCash only, refunded: 2000 Stripe)
    after_res = client.get("/api/v1/admin/payments")
    summary_after = after_res.get_json()["data"]["summary"]
    assert summary_after["collected_amount"] == 950.0
    assert summary_after["refunded_amount"] == 2000.0
    assert summary_after["pending_amount"] == 0.0

    with app.app_context():
        db.session.remove()
        db.drop_all()


def test_store_settings_staff_rbac_and_audit_log():
    from backend.app.checkout.service import shipping_cents_for_subtotal
    from backend.app.checkout.validation import validate_checkout_draft_payload

    app, client = _setup_admin_env()

    # 1. Default settings match baseline checkout rules
    cfg_res = client.get("/api/v1/admin/settings")
    assert cfg_res.status_code == 200
    assert cfg_res.get_json()["data"]["standard_shipping_fee"] == 45.0

    # 2. Update shipping fee, free shipping threshold & disable gcash_pending
    upd_res = client.patch(
        "/api/v1/admin/settings",
        json={
            "store_name": "SecondMarket Curated",
            "support_email": "concierge@secondmarket.test",
            "standard_shipping_fee": 95,
            "free_shipping_threshold": 5000,
            "default_low_stock_threshold": 5,
            "return_window_days": 21,
            "enabled_payment_methods": ["cash_on_delivery", "credit_debit_card"],
        },
    )
    assert upd_res.status_code == 200
    assert upd_res.get_json()["data"]["standard_shipping_fee"] == 95.0

    with app.app_context():
        # Subtotal 3500 now still pays 95.00 PHP because threshold raised to 5000
        assert shipping_cents_for_subtotal(350000) == 9500
        assert shipping_cents_for_subtotal(500000) == 0

        _, errs = validate_checkout_draft_payload(
            {
                "payment_method": "gcash_pending",
                "shipping_address": {
                    "recipient_name": "Buyer",
                    "phone": "09171234567",
                    "address_line1": "123 St",
                    "city": "Makati",
                    "province": "MM",
                    "postal_code": "1200",
                },
            }
        )
        assert "payment_method" in errs

    # Storefront catalog endpoint hides disabled method cleanly
    methods_res = client.get("/api/v1/checkout/payments/methods")
    assert methods_res.status_code == 200
    supported_codes = {m["code"] for m in methods_res.get_json()["data"]["methods"] if m.get("supported")}
    assert "gcash_pending" not in supported_codes
    assert "cash_on_delivery" in supported_codes

    # 3. Create Staff Member with support_agent role & verify RBAC boundaries
    staff_res = client.post(
        "/api/v1/admin/staff",
        json={
            "email": "agent@secondmarket.test",
            "first_name": "Support",
            "last_name": "Agent",
            "role": "support_agent",
            "password": "AgentPassword2026!",
        },
    )
    assert staff_res.status_code == 200
    assert "support" in staff_res.get_json()["data"]["capabilities"]
    assert "settings" not in staff_res.get_json()["data"]["capabilities"]

    # Check Audit Log recorded both settings.update & staff.role_update
    audit_res = client.get("/api/v1/admin/audit-logs")
    assert audit_res.status_code == 200
    actions = [log["action"] for log in audit_res.get_json()["data"]["logs"]]
    assert "settings.update" in actions
    assert "staff.role_update" in actions

    # Log in as support_agent
    agent_client = app.test_client()
    login_agent = agent_client.post(
        "/api/v1/auth/login",
        json={"email": "agent@secondmarket.test", "password": "AgentPassword2026!"},
    )
    assert login_agent.status_code == 200
    assert login_agent.get_json()["data"]["user"]["is_staff"] is True

    # Support agent can view support tickets & orders, but gets 403 on Settings & Staff RBAC
    assert agent_client.get("/api/v1/admin/support/tickets").status_code == 200
    assert agent_client.get("/api/v1/admin/orders").status_code == 200
    assert agent_client.get("/api/v1/admin/settings").status_code == 403
    assert agent_client.get("/api/v1/admin/staff").status_code == 403

    with app.app_context():
        db.session.remove()
        db.drop_all()


def test_orders_fulfillment_metadata_bulk_inventory_movements_and_custom_reports():
    app, client = _setup_admin_env()

    with app.app_context():
        buyer = User.query.filter_by(email="searchbuyer@example.com").one()
        prod = Product.query.first()
        prod_slug = prod.slug
        initial_qty = int(prod.quantity)

        # Attach ShippingRecord to existing order + add second shipped/cancelled orders for bulk & report breakdown
        order1 = Order.query.filter_by(order_number="SM-2026-0042").one()
        db.session.add(
            ShippingRecord(
                order_id=order1.id,
                recipient_name="Elena Navarro",
                phone="09171234567",
                address_line1="123 Rizal Ave",
                city="Manila",
                province="Metro Manila",
                postal_code="1000",
                country="Philippines",
                status=ShippingStatus.NOT_READY.value,
            )
        )

        order2 = Order(
            user_id=buyer.id,
            order_number="SM-2026-0099",
            status=OrderStatus.CONFIRMED.value,
            payment_status=PaymentStatus.PAID.value,
            shipping_status=ShippingStatus.NOT_READY.value,
            subtotal_cents=100000,
            shipping_cents=0,
            total_cents=100000,
            placed_at=datetime.now(timezone.utc) - timedelta(days=5),
        )
        db.session.add(order2)
        db.session.flush()
        db.session.add(
            ShippingRecord(
                order_id=order2.id,
                recipient_name="Elena Navarro",
                phone="09171234567",
                address_line1="123 Rizal Ave",
                city="Manila",
                province="Metro Manila",
                postal_code="1000",
                country="Philippines",
                status=ShippingStatus.NOT_READY.value,
            )
        )

        order_cancelled = Order(
            user_id=buyer.id,
            order_number="SM-2026-0100",
            status=OrderStatus.CANCELLED.value,
            payment_status=PaymentStatus.REFUNDED.value,
            shipping_status=ShippingStatus.RETURNED.value,
            subtotal_cents=50000,
            shipping_cents=0,
            total_cents=50000,
            placed_at=datetime.now(timezone.utc) - timedelta(days=2),
        )
        db.session.add(order_cancelled)
        db.session.commit()

    # 1. Invalid tracking URL fails 422 cleanly
    bad_url = client.patch(
        "/api/v1/admin/orders/SM-2026-0042/fulfillment",
        json={"tracking_url": "ftp://invalid-scheme.local/123"},
    )
    assert bad_url.status_code == 422

    # 2. Save carrier, tracking_url, admin_notes & confirm order via PATCH
    fulfill_res = client.patch(
        "/api/v1/admin/orders/SM-2026-0042/fulfillment",
        json={
            "order_status": "confirmed",
            "carrier": "LBC Express",
            "tracking_number": "LBC-884422",
            "tracking_url": "https://track.lbcexpress.com/LBC-884422",
            "admin_notes": "VIP buyer — double-wrap edges.",
        },
    )
    assert fulfill_res.status_code == 200
    fdata = fulfill_res.get_json()["data"]
    assert fdata["admin_notes"] == "VIP buyer — double-wrap edges."
    assert fdata["shipping_record"]["carrier"] == "LBC Express"
    assert fdata["shipping_record"]["tracking_url"] == "https://track.lbcexpress.com/LBC-884422"

    # 3. Bulk order action across confirmed + pending orders
    bulk_res = client.post(
        "/api/v1/admin/orders/bulk",
        json={
            "order_numbers": ["SM-2026-0042", "SM-2026-0099"],
            "action": "mark_processing",
        },
    )
    assert bulk_res.status_code == 200
    bdata = bulk_res.get_json()["data"]
    assert bdata["updated_count"] == 2
    assert set(bdata["updated_orders"]) == {"SM-2026-0042", "SM-2026-0099"}

    # Bulk mark_delivered skips order without tracking_number cleanly instead of failing batch
    bulk_deliv = client.post(
        "/api/v1/admin/orders/bulk",
        json={"order_numbers": ["SM-2026-0099"], "action": "mark_delivered"},
    )
    assert bulk_deliv.status_code == 200
    assert bulk_deliv.get_json()["data"]["updated_count"] == 0
    assert len(bulk_deliv.get_json()["data"]["skipped"]) == 1

    # 4. Product inventory adjustment creates InventoryMovement ledger entry
    new_qty = initial_qty + 3
    inv_res = client.patch(
        f"/api/v1/admin/products/{prod_slug}/inventory",
        json={"quantity": new_qty, "reason": "restock_received"},
    )
    assert inv_res.status_code == 200
    assert inv_res.get_json()["data"]["quantity"] == new_qty

    mov_res = client.get(f"/api/v1/admin/products/{prod_slug}/movements")
    assert mov_res.status_code == 200
    movements = mov_res.get_json()["data"]["movements"]
    assert len(movements) >= 1
    assert movements[0]["delta"] == 3
    assert movements[0]["previous_quantity"] == initial_qty
    assert movements[0]["new_quantity"] == new_qty
    assert movements[0]["reason"] == "restock_received"

    # 5. Custom date range sales report & CSV export + refunded/cancelled summary breakdown
    today_str = datetime.now(timezone.utc).date().isoformat()
    start_str = (datetime.now(timezone.utc).date() - timedelta(days=7)).isoformat()
    rep_res = client.get(f"/api/v1/admin/reports/sales?range=custom&start_date={start_str}&end_date={today_str}")
    assert rep_res.status_code == 200
    rsummary = rep_res.get_json()["data"]["summary"]
    assert rsummary["cancelled_orders"] >= 1
    assert rsummary["refunded_orders"] >= 1
    assert rsummary["cancelled"]["amount"] >= 500.0

    csv_res = client.get(f"/api/v1/admin/reports/export?type=sales&range=custom&start_date={start_str}&end_date={today_str}")
    assert csv_res.status_code == 200
    assert "SM-2026-0099" in csv_res.get_data(as_text=True)

    with app.app_context():
        db.session.remove()
        db.drop_all()
