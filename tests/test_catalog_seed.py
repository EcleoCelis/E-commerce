import json
from pathlib import Path

from backend.app import create_app
from backend.app.core.config import TestingConfig
from backend.app.extensions import db
from backend.app.models import Category, Product, ProductImage, User
from backend.app.seed import ensure_admin_user, seed_catalog_data


def test_catalog_seed_populates_empty_db_and_skips_when_nonempty():
    app = create_app(TestingConfig)

    with app.app_context():
        db.create_all()
        first = seed_catalog_data(only_if_empty=True)
        assert first["skipped"] is False
        assert first["categories"] == 8
        assert first["products"] == 23
        assert Category.query.count() == 8
        assert Product.query.count() == 23
        assert ProductImage.query.count() == 23

        second = seed_catalog_data(only_if_empty=True)
        assert second == {"users": 0, "categories": 0, "products": 0, "skipped": True}


def test_catalog_seed_image_files_exist_on_disk():
    root = Path(__file__).resolve().parents[1]
    seed_file = root / "backend" / "app" / "catalog_seed.json"
    payload = json.loads(seed_file.read_text(encoding="utf-8"))

    for cat in payload["categories"]:
        img = cat.get("image_url") or ""
        if img.startswith("/static/"):
            assert (root / "frontend" / img.lstrip("/")).exists(), f"Missing category image: {img}"

    for prod in payload["products"]:
        assert prod["images"], f"Product missing images: {prod['slug']}"
        for img in prod["images"]:
            url = img["image_url"]
            if url.startswith("/static/"):
                assert (root / "frontend" / url.lstrip("/")).exists(), f"Missing product image: {url}"


def test_ensure_admin_cli_creates_updates_and_skips_when_unconfigured(monkeypatch):
    app = create_app(TestingConfig)
    runner = app.test_cli_runner()

    with app.app_context():
        db.create_all()

    monkeypatch.delenv("SEED_ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("SEED_ADMIN_PASSWORD", raising=False)

    # Without password and with --if-configured, skips cleanly with exit code 0
    skipped = runner.invoke(args=["ensure-admin", "--if-configured"])
    assert skipped.exit_code == 0
    assert "skipped" in skipped.output.lower()

    # With SEED_ADMIN_* configured, creates new admin user
    monkeypatch.setenv("SEED_ADMIN_EMAIL", "owner@secondmarket.test")
    monkeypatch.setenv("SEED_ADMIN_PASSWORD", "OwnerPass2026")
    created = runner.invoke(args=["ensure-admin", "--if-configured"])
    assert created.exit_code == 0
    assert "Admin created: owner@secondmarket.test." in created.output

    with app.app_context():
        user = User.query.filter_by(email="owner@secondmarket.test").one()
        assert user.role == "admin"
        assert user.check_password("OwnerPass2026") is True

    # Running again updates the existing admin password cleanly
    monkeypatch.setenv("SEED_ADMIN_PASSWORD", "UpdatedPass2026")
    updated = runner.invoke(args=["ensure-admin", "--if-configured"])
    assert updated.exit_code == 0
    assert "Admin updated: owner@secondmarket.test." in updated.output

    with app.app_context():
        user = User.query.filter_by(email="owner@secondmarket.test").one()
        assert user.check_password("OwnerPass2026") is False
        assert user.check_password("UpdatedPass2026") is True

    # Ensure weak password returns friendly CLI error
    weak = runner.invoke(args=["ensure-admin", "--email", "owner@secondmarket.test", "--password", "weak"])
    assert weak.exit_code != 0
    assert "Error:" in weak.output

    # Ensure direct call also works cleanly
    with app.app_context():
        assert ensure_admin_user(email="owner@secondmarket.test", password="FinalPass2026") == {
            "action": "updated",
            "email": "owner@secondmarket.test",
        }
