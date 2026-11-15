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
    ProductReport,
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


def test_moderation_endpoints_require_admin_role(client):
    create_user("buyer@example.com", Role.BUYER.value)
    login(client, "buyer@example.com")

    assert client.get("/api/v1/admin/reviews").status_code == 403
    assert client.get("/api/v1/admin/reports").status_code == 403
    assert client.patch("/api/v1/admin/reviews/1/status", json={"status": "hidden"}).status_code == 403
    assert client.patch("/api/v1/admin/reports/1/status", json={"status": "resolved"}).status_code == 403


def test_admin_can_list_and_moderate_reviews(client):
    admin = create_user("admin@example.com", Role.ADMIN.value)
    buyer = create_user("buyer@example.com", Role.BUYER.value)
    product = create_product(admin)

    review = Review(
        user=buyer,
        product=product,
        rating=1,
        title="Inappropriate review",
        body="Offensive text",
        status=ReviewStatus.PUBLISHED.value,
    )
    db.session.add(review)
    db.session.commit()

    login(client, "admin@example.com")

    # List reviews
    list_res = client.get("/api/v1/admin/reviews")
    assert list_res.status_code == 200
    reviews = list_res.get_json()["data"]
    assert len(reviews) == 1
    assert reviews[0]["id"] == review.id

    # Update status to hidden
    patch_res = client.patch(
        f"/api/v1/admin/reviews/{review.id}/status",
        json={"status": ReviewStatus.HIDDEN.value},
    )
    assert patch_res.status_code == 200
    assert patch_res.get_json()["data"]["status"] == ReviewStatus.HIDDEN.value

    # Public reviews should now exclude this hidden review
    pub_res = client.get(f"/api/v1/marketplace/products/{product.slug}/reviews")
    assert pub_res.status_code == 200
    assert len(pub_res.get_json()["data"]) == 0


def test_admin_can_list_and_resolve_reports(client):
    admin = create_user("admin@example.com", Role.ADMIN.value)
    buyer = create_user("buyer@example.com", Role.BUYER.value)
    product = create_product(admin)

    report = ProductReport(
        product=product,
        reporter=buyer,
        reason=ReportReason.COUNTERFEIT.value,
        details="Brand logo looks fake.",
        status=ReportStatus.OPEN.value,
    )
    db.session.add(report)
    db.session.commit()

    login(client, "admin@example.com")

    # List reports
    list_res = client.get("/api/v1/admin/reports")
    assert list_res.status_code == 200
    reports = list_res.get_json()["data"]
    assert len(reports) == 1
    assert reports[0]["id"] == report.id
    assert reports[0]["reason"] == ReportReason.COUNTERFEIT.value

    # Filter reports by status
    filter_res = client.get("/api/v1/admin/reports?status=open")
    assert filter_res.status_code == 200
    assert len(filter_res.get_json()["data"]) == 1

    # Resolve report
    patch_res = client.patch(
        f"/api/v1/admin/reports/{report.id}/status",
        json={"status": ReportStatus.RESOLVED.value},
    )
    assert patch_res.status_code == 200
    assert patch_res.get_json()["data"]["status"] == ReportStatus.RESOLVED.value
    assert patch_res.get_json()["data"]["resolved_by"]["email"] == "admin@example.com"

