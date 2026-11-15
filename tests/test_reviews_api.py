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
    Product,
    ProductCondition,
    ProductStatus,
    ReportReason,
    ReportStatus,
    Review,
    ReviewStatus,
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


def create_product(seller=None):
    if seller is None:
        seller = create_user("seller@example.com", Role.ADMIN.value)

    category = Category(name="Electronics", slug="electronics")
    db.session.add(category)
    db.session.commit()

    product = Product(
        seller=seller,
        category=category,
        title="Retro Radio",
        slug="retro-radio",
        description="A vintage radio.",
        price_cents=150000,
        condition=ProductCondition.GOOD.value,
        status=ProductStatus.AVAILABLE.value,
        quantity=5,
    )
    product.publish()
    db.session.add(product)
    db.session.commit()
    return product


def create_order(buyer, product, status=OrderStatus.DELIVERED.value, shipping_status=ShippingStatus.DELIVERED.value):
    order = Order(
        user=buyer,
        order_number=f"SM-{buyer.id}-1001",
        status=status,
        shipping_status=shipping_status,
        subtotal_cents=product.price_cents,
        shipping_cents=0,
        total_cents=product.price_cents,
    )
    order.items.append(
        OrderItem(
            product=product,
            product_title=product.title,
            quantity=1,
            unit_price_cents=product.price_cents,
        )
    )
    db.session.add(order)
    db.session.commit()
    return order


def test_public_can_view_reviews_and_summary(client):
    product = create_product()
    buyer = create_user("buyer1@example.com")
    order = create_order(buyer, product)

    review = Review(
        user=buyer,
        product=product,
        order=order,
        rating=5,
        title="Superb quality",
        body="Exceeded expectations.",
        status=ReviewStatus.PUBLISHED.value,
    )
    db.session.add(review)
    db.session.commit()

    response = client.get(f"/api/v1/marketplace/products/{product.slug}/reviews")
    assert response.status_code == 200
    data = response.get_json()["data"]
    meta = response.get_json()["meta"]

    assert len(data) == 1
    assert data[0]["rating"] == 5
    assert data[0]["title"] == "Superb quality"
    assert data[0]["is_verified_purchase"] is True
    assert meta["rating_summary"]["average_rating"] == 5.0
    assert meta["rating_summary"]["review_count"] == 1


def test_review_submission_requires_buyer_role(client):
    product = create_product()

    response = client.post(
        f"/api/v1/marketplace/products/{product.slug}/reviews",
        json={"rating": 5, "title": "Good"},
    )
    assert response.status_code == 401


def test_buyer_without_purchase_cannot_review(client):
    product = create_product()
    create_user("buyer@example.com", Role.BUYER.value)
    login(client, "buyer@example.com")

    response = client.post(
        f"/api/v1/marketplace/products/{product.slug}/reviews",
        json={"rating": 5, "title": "Never bought this"},
    )
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "not_eligible"


def test_buyer_with_undelivered_order_cannot_review(client):
    product = create_product()
    buyer = create_user("buyer@example.com", Role.BUYER.value)
    create_order(
        buyer, product, status=OrderStatus.PROCESSING.value, shipping_status=ShippingStatus.SHIPPED.value
    )
    login(client, "buyer@example.com")

    response = client.post(
        f"/api/v1/marketplace/products/{product.slug}/reviews",
        json={"rating": 4, "title": "Still waiting"},
    )
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "not_eligible"


def test_buyer_with_delivered_order_can_submit_review(client):
    product = create_product()
    buyer = create_user("buyer@example.com", Role.BUYER.value)
    create_order(buyer, product)
    login(client, "buyer@example.com")

    # Check eligibility endpoint
    elig_res = client.get(f"/api/v1/marketplace/products/{product.slug}/reviews/eligibility")
    assert elig_res.status_code == 200
    assert elig_res.get_json()["data"]["eligible"] is True

    # Submit review
    response = client.post(
        f"/api/v1/marketplace/products/{product.slug}/reviews",
        json={"rating": 4, "title": "Solid item", "body": "Works well for secondhand gear."},
    )
    assert response.status_code == 201
    review_data = response.get_json()["data"]
    assert review_data["rating"] == 4
    assert review_data["is_verified_purchase"] is True

    # Duplicate review attempt
    dup_res = client.post(
        f"/api/v1/marketplace/products/{product.slug}/reviews",
        json={"rating": 5, "title": "Another review"},
    )
    assert dup_res.status_code == 409
    assert dup_res.get_json()["error"]["code"] == "duplicate_review"


def test_review_validation_rejects_out_of_range_ratings(client):
    product = create_product()
    buyer = create_user("buyer@example.com", Role.BUYER.value)
    create_order(buyer, product)
    login(client, "buyer@example.com")

    response = client.post(
        f"/api/v1/marketplace/products/{product.slug}/reviews",
        json={"rating": 6, "title": "Invalid"},
    )
    assert response.status_code == 422
    assert "rating" in response.get_json()["error"]["details"]


def test_buyer_can_report_product(client):
    product = create_product()
    create_user("buyer@example.com", Role.BUYER.value)
    login(client, "buyer@example.com")

    response = client.post(
        f"/api/v1/marketplace/products/{product.slug}/reports",
        json={"reason": ReportReason.MISLEADING.value, "details": "Description says new but pictures show damage."},
    )
    assert response.status_code == 201
    report_data = response.get_json()["data"]
    assert report_data["reason"] == ReportReason.MISLEADING.value
    assert report_data["status"] == ReportStatus.OPEN.value


def test_report_validation_rejects_unsupported_reason(client):
    product = create_product()
    create_user("buyer@example.com", Role.BUYER.value)
    login(client, "buyer@example.com")

    response = client.post(
        f"/api/v1/marketplace/products/{product.slug}/reports",
        json={"reason": "unsupported_reason"},
    )
    assert response.status_code == 422
    assert "reason" in response.get_json()["error"]["details"]

