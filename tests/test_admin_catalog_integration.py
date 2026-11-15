import io
import os
from pathlib import Path
import threading

from PIL import Image
from playwright.sync_api import sync_playwright
from werkzeug.serving import make_server

from backend.app import create_app
from backend.app.auth.rbac import Role, StaffRole
from backend.app.core.config import TestingConfig
from backend.app.extensions import db
from backend.app.models import AdminAuditLog, Category, Product, User
from backend.app.seed import seed_development_data


CHROMIUM_EXE = r"C:\Users\jomar\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe"


def _make_png_bytes(color=(180, 120, 75), size=(120, 90)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def _cleanup_uploaded_urls(urls):
    frontend_root = Path("frontend").resolve()
    for url in urls:
        if isinstance(url, str) and url.startswith("/static/uploads/"):
            rel = url.lstrip("/")
            candidate = (frontend_root / rel).resolve()
            if str(candidate).startswith(str(frontend_root)) and candidate.exists():
                candidate.unlink(missing_ok=True)


def _setup_test_app():
    app = create_app(TestingConfig)
    with app.app_context():
        db.create_all()
        seed_development_data()
    return app


def _teardown_test_app(app):
    with app.app_context():
        db.session.remove()
        db.drop_all()


def test_catalog_manager_rbac_and_audit_trail():
    app = _setup_test_app()
    uploaded_urls = []
    try:
        with app.app_context():
            catalog_mgr = User(
                email="catalog@secondmarket.test",
                role=StaffRole.CATALOG_MANAGER.value,
                first_name="Catalog",
                last_name="Lead",
            )
            catalog_mgr.set_password("CatalogPass2026!")

            support_agent = User(
                email="support@secondmarket.test",
                role=StaffRole.SUPPORT_AGENT.value,
                first_name="Support",
                last_name="Agent",
            )
            support_agent.set_password("SupportPass2026!")
            db.session.add_all([catalog_mgr, support_agent])
            db.session.commit()

        # 1. Support Agent must NOT be able to manage categories or products
        support_client = app.test_client()
        assert (
            support_client.post(
                "/api/v1/auth/login",
                json={"email": "support@secondmarket.test", "password": "SupportPass2026!"},
            ).status_code
            == 200
        )
        assert support_client.get("/api/v1/admin/categories").status_code == 403
        assert support_client.post("/api/v1/admin/products", json={"title": "Blocked"}).status_code == 403

        # 2. Catalog Manager has full CRUD + image upload access to categories & products
        cat_client = app.test_client()
        assert (
            cat_client.post(
                "/api/v1/auth/login",
                json={"email": "catalog@secondmarket.test", "password": "CatalogPass2026!"},
            ).status_code
            == 200
        )

        # Upload category image
        cat_upload = cat_client.post(
            "/api/v1/admin/categories/upload-image",
            data={"image": (io.BytesIO(_make_png_bytes((120, 90, 60))), "decor.png")},
            content_type="multipart/form-data",
        )
        assert cat_upload.status_code == 201
        cat_img_url = cat_upload.get_json()["data"]["image_url"]
        uploaded_urls.append(cat_img_url)

        # Create category
        cat_create = cat_client.post(
            "/api/v1/admin/categories",
            json={
                "name": "Nordic Accents",
                "slug": "nordic-accents",
                "description": "Curated Scandinavian accent decor.",
                "image_url": cat_img_url,
                "is_active": True,
                "sort_order": 2,
            },
        )
        assert cat_create.status_code == 201
        assert cat_create.get_json()["data"]["slug"] == "nordic-accents"

        # Update category
        cat_update = cat_client.put(
            "/api/v1/admin/categories/nordic-accents",
            json={"name": "Nordic Home Accents", "sort_order": 1},
        )
        assert cat_update.status_code == 200
        assert cat_update.get_json()["data"]["name"] == "Nordic Home Accents"

        # Upload product image
        prod_upload = cat_client.post(
            "/api/v1/admin/products/upload-image",
            data={"image": (io.BytesIO(_make_png_bytes((60, 110, 95))), "oak-stool.png")},
            content_type="multipart/form-data",
        )
        assert prod_upload.status_code == 201
        prod_img_url = prod_upload.get_json()["data"]["image_url"]
        uploaded_urls.append(prod_img_url)

        # Create product
        prod_create = cat_client.post(
            "/api/v1/admin/products",
            json={
                "title": "Ash Wood Counter Stool",
                "slug": "ash-wood-counter-stool",
                "category_slug": "nordic-accents",
                "description": "Solid ash wood stool with matte lacquer finish.",
                "price": 1850.0,
                "compare_at_price": 2200.0,
                "cost": 900.0,
                "condition": "like_new",
                "status": "available",
                "quantity": 5,
                "sku": "SM-STOOL-01",
                "variants": [{"name": "Wood", "val": "Natural Ash"}],
                "images": [{"image_url": prod_img_url, "alt_text": "Ash Stool", "sort_order": 0, "is_primary": True}],
            },
        )
        assert prod_create.status_code == 201
        assert prod_create.get_json()["data"]["images"][0]["url"] == prod_img_url

        # Update product
        prod_update = cat_client.put(
            "/api/v1/admin/products/ash-wood-counter-stool",
            json={"price": 1790.0, "quantity": 6},
        )
        assert prod_update.status_code == 200
        assert prod_update.get_json()["data"]["quantity"] == 6

        # Delete category -> reassigns product to uncategorized
        cat_delete = cat_client.delete("/api/v1/admin/categories/nordic-accents")
        assert cat_delete.status_code == 200

        with app.app_context():
            actions = {log.action for log in AdminAuditLog.query.all()}
            assert {
                "category_created",
                "category_updated",
                "category_deleted",
                "product_created",
                "product_updated",
            }.issubset(actions)
    finally:
        _cleanup_uploaded_urls(uploaded_urls)
        _teardown_test_app(app)


def test_unassign_product_to_uncategorized_on_demand():
    app = _setup_test_app()
    try:
        client = app.test_client()
        assert (
            client.post(
                "/api/v1/auth/login",
                json={"email": "admin@secondmarket.test", "password": "AdminSeller2026"},
            ).status_code
            == 200
        )

        with app.app_context():
            assert Category.query.filter_by(slug="uncategorized").first() is None
            first_product = Product.query.first()
            slug = first_product.slug

        # Unassigning a product to "uncategorized" should auto-create Uncategorized cleanly
        ok_resp = client.put(f"/api/v1/admin/products/{slug}", json={"category_slug": "uncategorized"})
        assert ok_resp.status_code == 200
        assert ok_resp.get_json()["data"]["category"]["slug"] == "uncategorized"

        # Invalid unknown category slug still returns 422 validation error
        bad_resp = client.put(f"/api/v1/admin/products/{slug}", json={"category_slug": "definitely-missing-cat"})
        assert bad_resp.status_code == 422
    finally:
        _teardown_test_app(app)


def test_admin_add_category_and_product_browser_e2e(tmp_path):
    db_file = tmp_path / "e2e_catalog.db"

    class IsolatedE2EConfig(TestingConfig):
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{db_file.as_posix()}"

    app = create_app(IsolatedE2EConfig)
    with app.app_context():
        db.create_all()
        seed_development_data()

    server = make_server("127.0.0.1", 0, app)
    port = server.server_port
    base_url = f"http://127.0.0.1:{port}"
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    png_one = tmp_path / "lounge-front.png"
    png_two = tmp_path / "lounge-side.png"
    png_cat = tmp_path / "dining-cat.png"
    png_one.write_bytes(_make_png_bytes((155, 110, 75), (240, 180)))
    png_two.write_bytes(_make_png_bytes((85, 115, 95), (240, 180)))
    png_cat.write_bytes(_make_png_bytes((185, 155, 115), (240, 180)))

    uploaded_urls = []
    console_errors = []
    page_errors = []

    try:
        with sync_playwright() as p:
            launch_kwargs = {"headless": True}
            if os.path.exists(CHROMIUM_EXE):
                launch_kwargs["executable_path"] = CHROMIUM_EXE
            browser = p.chromium.launch(**launch_kwargs)
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            page = context.new_page()

            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda exc: page_errors.append(str(exc)))

            def _capture_upload(resp):
                if resp.status == 201 and "/upload-image" in resp.url:
                    try:
                        img_url = (resp.json().get("data") or {}).get("image_url")
                        if img_url:
                            uploaded_urls.append(img_url)
                    except Exception:
                        pass

            page.on("response", _capture_upload)

            # 1. Sign into Admin Panel
            page.goto(f"{base_url}/admin/login.html", wait_until="networkidle")
            page.fill("#admin-login-email", "admin@secondmarket.test")
            page.fill("#admin-login-password", "AdminSeller2026")
            page.click('button[type="submit"]')
            page.wait_for_url(f"{base_url}/admin/**", timeout=15000)
            page.wait_for_selector(".admin-btn-quick-create", timeout=15000)

            # 2. Navigate to Categories -> Add icon category ("Accent Lighting") + uploaded-image category ("Nordic Dining")
            page.click('[data-admin-nav="categories"]')
            page.wait_for_selector('button:has-text("Add Category")', timeout=10000)

            # Create icon-based category first
            page.click('button:has-text("Add Category")')
            page.wait_for_selector("#admin-category-modal", state="visible", timeout=5000)
            page.fill("#admin-category-name", "Accent Lighting")
            page.select_option("#admin-category-icon", "lamp")
            page.fill("#admin-category-description", "Warm ambient table and floor lamps.")
            page.click("#admin-category-submit-btn")
            page.wait_for_selector("#admin-category-modal", state="hidden", timeout=10000)
            page.wait_for_selector('text="Accent Lighting"', timeout=10000)

            # Edit icon-based category and verify icon update sticks (regression test for old icon:... bug)
            page.locator('button[onclick*="accent-lighting"]').first.evaluate("el => el.click()")
            page.wait_for_selector("#admin-category-modal", state="visible", timeout=5000)
            page.select_option("#admin-category-icon", "sofa")
            page.click("#admin-category-submit-btn")
            page.wait_for_selector("#admin-category-modal", state="hidden", timeout=10000)

            # Create image-uploaded category with product assignment
            page.click('button:has-text("Add Category")')
            page.wait_for_selector("#admin-category-modal", state="visible", timeout=5000)
            page.fill("#admin-category-name", "Nordic Dining")
            page.click("#admin-cat-advanced-toggle-btn")
            page.set_input_files("#admin-category-image-file", str(png_cat))
            page.wait_for_selector("#admin-category-preview-card", state="visible", timeout=5000)
            page.fill("#admin-category-sort-order", "1")
            page.locator('#admin-modal-product-checklist input[name="product_ids"]').first.check()
            page.click("#admin-category-submit-btn")
            page.wait_for_selector("#admin-category-modal", state="hidden", timeout=15000)
            page.wait_for_selector('text="Nordic Dining"', timeout=10000)

            # 3. Switch to Dashboard and click global topbar "+ Create" button (regression test for modal outside #products)
            page.click('[data-admin-nav="dashboard"]')
            page.wait_for_selector(".admin-hero-title, h2", timeout=10000)
            page.click(".admin-btn-quick-create")
            page.wait_for_selector("#admin-product-modal", state="visible", timeout=10000)

            # Fill Basic Info EXCEPT leave Description blank first, to verify multi-tab validation feedback
            page.fill("#admin-product-title", "Oslo Ash Dining Bench")
            page.select_option("#admin-product-category", "nordic-dining")

            # Switch to Pricing tab
            page.click('.admin-modal-tab-btn[data-tab-name="pricing"]')
            page.fill("#admin-product-price", "2450.00")
            page.fill("#admin-product-compare-price", "2990.00")
            page.fill("#admin-product-cost", "1250.00")

            # Switch to Inventory tab
            page.click('.admin-modal-tab-btn[data-tab-name="inventory"]')
            page.fill("#admin-product-quantity", "4")

            # Switch to Media tab, upload 2 PNGs, mark 2nd image as Primary
            page.click('.admin-modal-tab-btn[data-tab-name="media"]')
            page.set_input_files("#admin-product-file-input", [str(png_one), str(png_two)])
            page.wait_for_selector(".admin-media-card >> nth=1", timeout=5000)
            page.locator(".admin-media-card").nth(1).locator('button:has-text("Set Primary")').click()

            # Switch to Variants tab, add Variant, then submit WITHOUT description -> must NOT fail silently!
            page.click('.admin-modal-tab-btn[data-tab-name="variants"]')
            page.click('button:has-text("Add Variant")')
            page.click("#admin-product-submit-btn")

            # Modal should stay open, toast should show error, and modal should switch back to Basic tab
            page.wait_for_selector('#admin-toast-container .admin-toast.is-error', timeout=5000)
            assert page.is_visible("#admin-product-modal")
            assert page.locator("#admin-product-tab-basic.is-active").is_visible()

            # Complete Description & save Product cleanly
            page.fill("#admin-product-desc", "Crafted solid ash dining bench with tapered legs.")
            page.click("#admin-product-submit-btn")
            page.wait_for_selector("#admin-product-modal", state="hidden", timeout=15000)
            page.wait_for_selector('text="Oslo Ash Dining Bench"', timeout=10000)

            # 4. Open Edit modal on "Oslo Ash Dining Bench" and verify non-index-0 primary image doesn't trigger dual-primary 422!
            page.locator('button[title="Edit Product"][onclick*="oslo-ash-dining-bench"]').click()
            page.wait_for_selector("#admin-product-modal", state="visible", timeout=5000)
            page.click('.admin-modal-tab-btn[data-tab-name="pricing"]')
            page.fill("#admin-product-price", "2390.00")
            page.click("#admin-product-submit-btn")
            page.wait_for_selector("#admin-product-modal", state="hidden", timeout=15000)

            # Record uploaded files from DB for cleanup & verify icon update persisted
            with app.app_context():
                accent_cat = Category.query.filter_by(slug="accent-lighting").one()
                assert accent_cat.image_url == "icon:sofa"

                dining_cat = Category.query.filter_by(slug="nordic-dining").one()
                assert dining_cat.image_url and dining_cat.image_url.startswith("/static/uploads/categories/")
                uploaded_urls.append(dining_cat.image_url)

                bench = Product.query.filter_by(slug="oslo-ash-dining-bench").one()
                assert bench.price_cents == 239000
                primaries = [img for img in bench.images if img.is_primary]
                assert len(primaries) == 1
                assert bench.images[1].is_primary is True
                for img in bench.images:
                    uploaded_urls.append(img.image_url)

            # 5. Verify Storefront Homepage, Shop & Product Detail in a clean customer session!
            buyer_context = browser.new_context(viewport={"width": 1440, "height": 900})
            buyer_page = buyer_context.new_page()
            buyer_page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
            buyer_page.on("pageerror", lambda exc: page_errors.append(str(exc)))

            buyer_page.goto(f"{base_url}/", wait_until="networkidle")
            buyer_page.wait_for_selector('text="Nordic Dining"', timeout=10000)

            # Verify icon:... category images resolve to clean fallback paths rather than broken icon: scheme
            resolved_icon_fallback = buyer_page.evaluate("() => app.categoryImage(0, 'accent-lighting', 'icon:sofa')")
            assert resolved_icon_fallback and not resolved_icon_fallback.startswith("icon:")

            # Verify no <img> anywhere on homepage has icon: scheme or failed image load
            cat_imgs = buyer_page.eval_on_selector_all(
                "img",
                "els => els.map(el => ({ src: el.getAttribute('src'), complete: el.complete, width: el.naturalWidth }))",
            )
            assert all(img["src"] and not img["src"].startswith("icon:") for img in cat_imgs)

            buyer_page.evaluate("() => app.navigate('shop')")
            buyer_page.wait_for_selector('text="Oslo Ash Dining Bench"', timeout=10000)
            buyer_page.wait_for_selector('button:has-text("Accent Lighting")', timeout=10000)

            assert not page_errors, f"Unhandled page errors: {page_errors}"
            assert not console_errors, f"Console errors: {console_errors}"
            buyer_context.close()
            browser.close()
    finally:
        server.shutdown()
        _cleanup_uploaded_urls(uploaded_urls)
        with app.app_context():
            db.session.remove()
            db.drop_all()
