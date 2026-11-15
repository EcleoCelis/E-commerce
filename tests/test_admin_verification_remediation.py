from backend.app import create_app
from backend.app.auth.rbac import Role
from backend.app.core.config import TestingConfig
from backend.app.extensions import db
from backend.app.models import CartItem, Category, Order, OrderItem, Product, ProductCondition, ProductStatus
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


def register_buyer(client, email="buyer2@example.com"):
    return client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "Secondhand2026",
            "first_name": "Second",
            "last_name": "Buyer",
            "role": Role.BUYER.value,
        },
    )


def test_order_can_transition_directly_from_confirmed_to_shipped_with_tracking():
    app = setup_test_app()
    buyer_client = app.test_client()
    admin_client = app.test_client()

    with app.app_context():
        product = Product.query.filter_by(slug="pre-owned-wireless-headphones").one()
        product.quantity = 3
        db.session.commit()

    register_buyer(buyer_client)
    buyer_client.post("/api/v1/cart/items", json={"product_slug": "pre-owned-wireless-headphones", "quantity": 1})
    confirm_resp = buyer_client.post(
        "/api/v1/checkout/confirm",
        json={
            "shipping_address": {
                "recipient_name": "Second Buyer",
                "phone": "09171234567",
                "address_line1": "123 Reuse Street",
                "address_line2": "Unit 2",
                "city": "Tagbilaran",
                "province": "Bohol",
                "postal_code": "6300",
                "country": "Philippines",
            },
            "payment_method": "cash_on_delivery",
        },
    )
    order_number = confirm_resp.get_json()["data"]["order"]["order_number"]

    login_admin(admin_client)

    # Directly transition from confirmed to shipped with tracking number
    response = admin_client.patch(
        f"/api/v1/admin/orders/{order_number}/fulfillment",
        json={
            "order_status": "shipped",
            "shipping_status": "shipped",
            "tracking_number": "SM-DIRECT-TRACK-9999",
        },
    )
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["data"]["status"] == "shipped"
    assert payload["data"]["shipping_status"] == "shipped"
    assert payload["data"]["shipping_record"]["tracking_number"] == "SM-DIRECT-TRACK-9999"

    teardown_test_app(app)


def test_product_condition_can_be_updated_and_persisted():
    app = setup_test_app()
    admin_client = app.test_client()
    login_admin(admin_client)

    # Check original condition
    get_resp = admin_client.get("/api/v1/admin/products/pre-owned-wireless-headphones")
    assert get_resp.status_code == 200
    assert get_resp.get_json()["data"]["condition"] == "good"

    # Update product condition to for_repair
    update_resp = admin_client.put(
        "/api/v1/admin/products/pre-owned-wireless-headphones",
        json={"condition": "for_repair"},
    )
    assert update_resp.status_code == 200
    assert update_resp.get_json()["data"]["condition"] == "for_repair"

    # Verify persisted in database
    with app.app_context():
        product = Product.query.filter_by(slug="pre-owned-wireless-headphones").one()
        assert product.condition == ProductCondition.FOR_REPAIR.value

    teardown_test_app(app)


def test_product_deletion_permanently_deletes_and_preserves_order_history():
    app = setup_test_app()
    buyer_client = app.test_client()
    cart_buyer_client = app.test_client()
    admin_client = app.test_client()

    register_buyer(buyer_client)
    buyer_client.post("/api/v1/cart/items", json={"product_slug": "pre-owned-wireless-headphones", "quantity": 1})
    confirm_resp = buyer_client.post(
        "/api/v1/checkout/confirm",
        json={
            "shipping_address": {
                "recipient_name": "Second Buyer",
                "phone": "09171234567",
                "address_line1": "123 Reuse Street",
                "address_line2": "Unit 2",
                "city": "Tagbilaran",
                "province": "Bohol",
                "postal_code": "6300",
                "country": "Philippines",
            },
            "payment_method": "cash_on_delivery",
        },
    )
    assert confirm_resp.status_code == 201
    order_number = confirm_resp.get_json()["data"]["order"]["order_number"]

    # Also add the same product to another shopper's cart to verify CartItem FK does not block deletion.
    with app.app_context():
        p = Product.query.filter_by(slug="pre-owned-wireless-headphones").one()
        p.quantity = 5
        p.status = ProductStatus.AVAILABLE.value
        db.session.commit()
    register_buyer(cart_buyer_client, email="buyer3@example.com")
    cart_add = cart_buyer_client.post("/api/v1/cart/items", json={"product_slug": "pre-owned-wireless-headphones", "quantity": 1})
    assert cart_add.status_code == 201

    login_admin(admin_client)
    delete_resp = admin_client.delete("/api/v1/admin/products/pre-owned-wireless-headphones")
    payload = delete_resp.get_json()

    assert delete_resp.status_code == 200
    assert payload["data"]["deleted"] is True
    assert "permanently deleted" in payload["message"].lower()

    # Verify the product and its active cart rows are permanently gone while order history snapshot remains intact.
    with app.app_context():
        assert Product.query.filter_by(slug="pre-owned-wireless-headphones").one_or_none() is None
        order = Order.query.filter_by(order_number=order_number).one()
        order_item = OrderItem.query.filter_by(order_id=order.id).one()
        assert order_item.product_id is None
        assert "headphones" in order_item.product_title.lower()
        assert CartItem.query.count() == 0

    teardown_test_app(app)


def test_category_deletion_reassigns_products_to_uncategorized():
    app = setup_test_app()
    admin_client = app.test_client()
    login_admin(admin_client)

    # Electronics category has starter products
    delete_resp = admin_client.delete("/api/v1/admin/categories/electronics")
    assert delete_resp.status_code == 200

    with app.app_context():
        uncat = Category.query.filter_by(slug="uncategorized").one()
        assert uncat.name == "Uncategorized"
        # Products that belonged to electronics are now in uncategorized
        electronic_products = Product.query.filter_by(category_id=uncat.id).all()
        assert len(electronic_products) > 0

    teardown_test_app(app)


def test_admin_product_listing_category_filtering():
    app = setup_test_app()
    admin_client = app.test_client()
    login_admin(admin_client)

    # Filter by electronics
    response = admin_client.get("/api/v1/admin/products?category=electronics")
    assert response.status_code == 200
    data = response.get_json()["data"]
    assert len(data) > 0
    assert all(p["category"]["slug"] == "electronics" for p in data)

    # Filter by fashion
    response_fashion = admin_client.get("/api/v1/admin/products?category=fashion")
    assert response_fashion.status_code == 200
    data_fashion = response_fashion.get_json()["data"]
    assert len(data_fashion) > 0
    assert all(p["category"]["slug"] == "fashion" for p in data_fashion)

    teardown_test_app(app)


def test_frontend_admin_categories_and_products_ui_elements():
    app = setup_test_app()
    client = app.test_client()

    # Check categories.html template contains search and view toggle
    cat_resp = client.get("/admin/pages/categories.html")
    assert cat_resp.status_code == 200
    cat_html = cat_resp.get_data(as_text=True)
    assert "adminApp.filterCategories(this.value)" in cat_html
    assert "admin-cat-view-grid-btn" in cat_html
    assert "admin-cat-view-table-btn" in cat_html
    assert "adminApp.createCategory(event)" in cat_html

    # Check products.html template contains condition select and PHP currency
    prod_resp = client.get("/admin/pages/products.html")
    assert prod_resp.status_code == 200
    prod_html = prod_resp.get_data(as_text=True)
    assert "admin-product-condition" in prod_html
    assert "Regular Price (₱)" in prod_html
    assert "Sale / Compare-at Price (₱)" in prod_html
    assert "Cost per Item (₱)" in prod_html

    # Check orders.html template maintains filter form and drawer contracts
    ord_resp = client.get("/admin/pages/orders.html")
    assert ord_resp.status_code == 200
    ord_html = ord_resp.get_data(as_text=True)
    assert "adminApp.applyOrderFilters(event)" in ord_html
    assert "{{orderDetail}}" in ord_html
    assert "{{orderRows}}" in ord_html

    teardown_test_app(app)
