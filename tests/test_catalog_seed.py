import json
from pathlib import Path

from backend.app import create_app
from backend.app.core.config import TestingConfig
from backend.app.extensions import db
from backend.app.models import Category, Product, ProductImage
from backend.app.seed import seed_catalog_data


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
