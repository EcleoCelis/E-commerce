import io

from backend.app import create_app
from backend.app.auth.rbac import Role
from backend.app.core.config import TestingConfig
from backend.app.extensions import db
from backend.app.models import Category
from backend.app.seed import seed_development_data


def setup_category_app():
    app = create_app(TestingConfig)
    with app.app_context():
        db.create_all()
        seed_development_data()
    return app


def teardown_category_app(app):
    with app.app_context():
        db.session.remove()
        db.drop_all()


def login_admin(client):
    return client.post(
        "/api/v1/auth/login",
        json={"email": "admin@secondmarket.test", "password": "AdminSeller2026"},
    )


def register_buyer(client):
    return client.post(
        "/api/v1/auth/register",
        json={
            "email": "buyer@example.com",
            "password": "Secondhand2026",
            "first_name": "Second",
            "last_name": "Buyer",
            "role": Role.BUYER.value,
        },
    )


def test_admin_can_create_category_with_generated_slug():
    app = setup_category_app()
    client = app.test_client()

    login_admin(client)
    response = client.post(
        "/api/v1/admin/categories",
        json={
            "name": "Home Decor",
            "description": "Secondhand decor, frames, and small fixtures.",
            "sort_order": 8,
        },
    )
    payload = response.get_json()

    assert response.status_code == 201
    assert payload["data"]["name"] == "Home Decor"
    assert payload["data"]["slug"] == "home-decor"
    assert payload["data"]["is_active"] is True
    assert payload["data"]["sort_order"] == 8

    with app.app_context():
        assert Category.query.filter_by(slug="home-decor").one().description.startswith("Secondhand decor")

    teardown_category_app(app)


def test_category_create_requires_admin_role():
    app = setup_category_app()
    client = app.test_client()

    anonymous_response = client.post("/api/v1/admin/categories", json={"name": "Unauthorized"})
    assert anonymous_response.status_code == 401

    register_buyer(client)
    buyer_response = client.post("/api/v1/admin/categories", json={"name": "Buyer Category"})
    assert buyer_response.status_code == 403

    teardown_category_app(app)


def test_category_create_validates_payload_and_uniqueness():
    app = setup_category_app()
    client = app.test_client()

    login_admin(client)
    invalid_response = client.post(
        "/api/v1/admin/categories",
        json={"name": "", "slug": "Invalid Slug", "sort_order": -1, "is_active": "yes"},
    )
    invalid_payload = invalid_response.get_json()

    assert invalid_response.status_code == 422
    assert "name" in invalid_payload["error"]["details"]
    assert "slug" in invalid_payload["error"]["details"]
    assert "sort_order" in invalid_payload["error"]["details"]
    assert "is_active" in invalid_payload["error"]["details"]

    duplicate_slug_response = client.post("/api/v1/admin/categories", json={"name": "Gadgets", "slug": "electronics"})
    duplicate_slug_payload = duplicate_slug_response.get_json()

    assert duplicate_slug_response.status_code == 422
    assert "slug" in duplicate_slug_payload["error"]["details"]

    duplicate_name_response = client.post("/api/v1/admin/categories", json={"name": "Electronics", "slug": "gadgets"})
    duplicate_name_payload = duplicate_name_response.get_json()

    assert duplicate_name_response.status_code == 422
    assert "name" in duplicate_name_payload["error"]["details"]

    teardown_category_app(app)


def test_admin_can_update_category_fields():
    app = setup_category_app()
    client = app.test_client()

    login_admin(client)
    response = client.put(
        "/api/v1/admin/categories/books",
        json={
            "name": "Books and References",
            "slug": "books-references",
            "description": "Used books, references, and study materials.",
            "sort_order": 2,
            "is_active": False,
        },
    )
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["data"]["name"] == "Books and References"
    assert payload["data"]["slug"] == "books-references"
    assert payload["data"]["is_active"] is False
    assert payload["data"]["sort_order"] == 2

    teardown_category_app(app)


def test_category_update_rejects_conflicts_and_missing_category():
    app = setup_category_app()
    client = app.test_client()

    login_admin(client)
    conflict_response = client.put("/api/v1/admin/categories/books", json={"slug": "electronics"})
    conflict_payload = conflict_response.get_json()

    assert conflict_response.status_code == 422
    assert "slug" in conflict_payload["error"]["details"]

    missing_response = client.put("/api/v1/admin/categories/missing", json={"name": "Missing"})
    missing_payload = missing_response.get_json()

    assert missing_response.status_code == 404
    assert missing_payload["error"]["code"] == "category_not_found"

    teardown_category_app(app)


def test_admin_can_activate_and_deactivate_category():
    app = setup_category_app()
    client = app.test_client()

    login_admin(client)
    deactivate_response = client.patch("/api/v1/admin/categories/fashion/status", json={"is_active": False})
    deactivate_payload = deactivate_response.get_json()

    assert deactivate_response.status_code == 200
    assert deactivate_payload["data"]["is_active"] is False

    activate_response = client.patch("/api/v1/admin/categories/fashion/status", json={"is_active": True})
    activate_payload = activate_response.get_json()

    assert activate_response.status_code == 200
    assert activate_payload["data"]["is_active"] is True

    teardown_category_app(app)


def test_category_status_validates_boolean_and_missing_category():
    app = setup_category_app()
    client = app.test_client()

    login_admin(client)
    invalid_response = client.patch("/api/v1/admin/categories/fashion/status", json={"is_active": "false"})
    invalid_payload = invalid_response.get_json()

    assert invalid_response.status_code == 422
    assert "is_active" in invalid_payload["error"]["details"]

    missing_response = client.patch("/api/v1/admin/categories/missing/status", json={"is_active": False})
    missing_payload = missing_response.get_json()

    assert missing_response.status_code == 404
    assert missing_payload["error"]["code"] == "category_not_found"

    teardown_category_app(app)


def test_admin_can_upload_category_image_and_create_category():
    app = setup_category_app()
    client = app.test_client()

    login_admin(client)
    image_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    upload_response = client.post(
        "/api/v1/admin/categories/upload-image",
        data={"image": (io.BytesIO(image_content), "vintage.png")},
        content_type="multipart/form-data",
    )
    assert upload_response.status_code == 201
    upload_payload = upload_response.get_json()
    assert upload_payload["success"] is True
    assert upload_payload["data"]["image_url"].startswith("/static/uploads/categories/")

    image_url = upload_payload["data"]["image_url"]

    create_response = client.post(
        "/api/v1/admin/categories",
        json={
            "name": "Vintage Watches",
            "description": "Curated vintage mechanical and digital timepieces.",
            "image_url": image_url,
            "sort_order": 5,
        },
    )
    assert create_response.status_code == 201
    create_payload = create_response.get_json()
    assert create_payload["data"]["image_url"] == image_url

    with app.app_context():
        category = Category.query.filter_by(slug="vintage-watches").one()
        assert category.image_url == image_url

    teardown_category_app(app)


def test_category_image_upload_validates_file_extension():
    app = setup_category_app()
    client = app.test_client()

    login_admin(client)
    invalid_upload = client.post(
        "/api/v1/admin/categories/upload-image",
        data={"image": (io.BytesIO(b"malicious script"), "exploit.exe")},
        content_type="multipart/form-data",
    )
    assert invalid_upload.status_code == 422
    assert invalid_upload.get_json()["error"]["code"] == "invalid_image_type"

    no_file_upload = client.post(
        "/api/v1/admin/categories/upload-image",
        data={},
        content_type="multipart/form-data",
    )
    assert no_file_upload.status_code == 400
    assert no_file_upload.get_json()["error"]["code"] == "missing_image_file"

    teardown_category_app(app)


def test_category_image_defaults_to_null_when_omitted():
    app = setup_category_app()
    client = app.test_client()

    login_admin(client)
    create_response = client.post(
        "/api/v1/admin/categories",
        json={
            "name": "Retro Games",
            "description": "Cartridges, consoles, and accessories.",
            "sort_order": 9,
        },
    )
    assert create_response.status_code == 201
    create_payload = create_response.get_json()
    assert create_payload["data"]["image_url"] is None

    with app.app_context():
        category = Category.query.filter_by(slug="retro-games").one()
        assert category.image_url is None

    teardown_category_app(app)


def test_admin_can_delete_empty_category():
    app = setup_category_app()
    client = app.test_client()

    login_admin(client)
    create_res = client.post(
        "/api/v1/admin/categories",
        json={"name": "Temporary Empty", "description": "To be deleted"},
    )
    assert create_res.status_code == 201
    slug = create_res.get_json()["data"]["slug"]

    delete_res = client.delete(f"/api/v1/admin/categories/{slug}")
    assert delete_res.status_code == 200
    assert delete_res.get_json()["success"] is True

    with app.app_context():
        assert Category.query.filter_by(slug=slug).one_or_none() is None

    teardown_category_app(app)


def test_admin_delete_category_reassigns_products_to_uncategorized():
    from backend.app.models import Product

    app = setup_category_app()
    client = app.test_client()

    login_admin(client)

    with app.app_context():
        cat = Category.query.filter_by(slug="fashion").one()
        prod_ids = [p.id for p in Product.query.filter_by(category_id=cat.id).all()]
        assert len(prod_ids) > 0

    delete_res = client.delete("/api/v1/admin/categories/fashion")
    assert delete_res.status_code == 200
    assert delete_res.get_json()["success"] is True

    with app.app_context():
        assert Category.query.filter_by(slug="fashion").one_or_none() is None
        uncategorized = Category.query.filter_by(slug="uncategorized").one()
        for prod_id in prod_ids:
            prod = db.session.get(Product, prod_id)
            assert prod.category_id == uncategorized.id

    teardown_category_app(app)


def test_unauthorized_cannot_delete_category():
    app = setup_category_app()
    client = app.test_client()

    anon_res = client.delete("/api/v1/admin/categories/furniture")
    assert anon_res.status_code == 401

    register_buyer(client)
    buyer_res = client.delete("/api/v1/admin/categories/furniture")
    assert buyer_res.status_code == 403

    teardown_category_app(app)


def test_delete_missing_category_returns_404():
    app = setup_category_app()
    client = app.test_client()

    login_admin(client)
    missing_res = client.delete("/api/v1/admin/categories/nonexistent-category-slug")
    assert missing_res.status_code == 404
    assert missing_res.get_json()["error"]["code"] == "category_not_found"

    teardown_category_app(app)


