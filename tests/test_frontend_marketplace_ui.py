from backend.app import create_app
from backend.app.core.config import TestingConfig


def test_storefront_references_marketplace_frontend_client():
    app = create_app(TestingConfig)

    response = app.test_client().get("/")
    html = response.get_data(as_text=True)

    assert response.status_code == 200
    assert "/static/css/marketplace/base.css" in html
    assert "/static/js/marketplace-api.js" in html
    assert "/static/js/checkout/checkout-api.js" in html
    assert "/static/js/marketplace/app.js" in html
    assert "/static/js/marketplace/components/product-card.js" in html
    assert "/static/js/marketplace/pages/home-page.js" in html
    assert "/static/js/marketplace/pages/catalog-page.js" in html
    assert "/static/js/marketplace/pages/product-detail-page.js" in html
    assert "/static/js/marketplace/pages/wishlist-page.js" in html
    assert "class SecondMarketApp" not in html
    assert "MOCK_PRODUCTS" not in html


def test_frontend_entry_pages_do_not_depend_on_cdn_assets():
    app = create_app(TestingConfig)
    client = app.test_client()

    entry_pages = [
        "/",
        "/login.html",
        "/register.html",
        "/admin/login.html",
        "/admin",
        "/checkout",
        "/orders",
    ]
    forbidden_external_assets = [
        "cdn.",
        "cdn/",
        "tailwindcss.com",
        "fonts.googleapis.com",
        "fonts.gstatic.com",
        "unpkg.com",
        "jsdelivr.net",
    ]

    for page_path in entry_pages:
        response = client.get(page_path)
        html = response.get_data(as_text=True).lower()

        assert response.status_code == 200
        for forbidden_asset in forbidden_external_assets:
            assert forbidden_asset not in html


def test_marketplace_frontend_client_is_served():
    app = create_app(TestingConfig)

    response = app.test_client().get("/static/js/marketplace-api.js")
    javascript = response.get_data(as_text=True)

    assert response.status_code == 200
    assert 'const BASE_URL = "/api/v1/marketplace"' in javascript
    assert "listCategories" in javascript
    assert "listProducts" in javascript
    assert "getProduct" in javascript
    assert "listWishlist" in javascript
    assert "addWishlistItem" in javascript
    assert "removeWishlistItem" in javascript
    assert "buildQueryString" in javascript
    assert "URLSearchParams" in javascript
    assert "`/products${buildQueryString(filters)}`" in javascript


def test_storefront_uses_local_product_images_for_marketplace_sections():
    app = create_app(TestingConfig)
    client = app.test_client()

    response = client.get("/")
    app_js = client.get("/static/js/marketplace/app.js").get_data(as_text=True)
    home_template = client.get("/marketplace/pages/home.html").get_data(as_text=True)
    index_html = response.get_data(as_text=True)

    assert response.status_code == 200
    assert "/static/productImages/" in app_js
    assert "/static/productImages/" in home_template
    assert "electronics" in index_html
    assert "fashion" in index_html


def test_storefront_includes_responsive_marketplace_polish():
    app = create_app(TestingConfig)
    client = app.test_client()

    response = client.get("/")
    css = client.get("/static/css/marketplace/base.css").get_data(as_text=True)
    product_card_js = client.get("/static/js/marketplace/components/product-card.js").get_data(as_text=True)
    home_template = client.get("/marketplace/pages/home.html").get_data(as_text=True)
    catalog_template = client.get("/marketplace/pages/catalog.html").get_data(as_text=True)

    assert response.status_code == 200
    assert "marketplace-filter-panel" in css
    assert "Local Tailwind-style fallback utilities" in css
    assert ".flex { display: flex; }" in css
    assert ".bg-\\[\\#4E4638\\]" in css
    assert ".marketplace-home-hero" in css
    assert "100svh - 7.5rem" in css
    assert "marketplace-card-image" in product_card_js
    assert "marketplace-home-hero" in home_template
    assert "Secondhand Promise" in home_template
    assert "condition-filter" in catalog_template
    assert "Architectural Forms" not in home_template
    assert "Complimentary Global Express Shipping" not in response.get_data(as_text=True)


def test_storefront_refreshes_catalog_filters_through_marketplace_api():
    app = create_app(TestingConfig)
    client = app.test_client()

    response = client.get("/")
    app_js = client.get("/static/js/marketplace/app.js").get_data(as_text=True)
    catalog_template = client.get("/marketplace/pages/catalog.html").get_data(as_text=True)

    assert response.status_code == 200
    assert "refreshMarketplaceProducts" in app_js
    assert "marketplaceQueryParams" in app_js
    assert "applyMarketplaceFilters" in app_js
    assert "applyCatalogSearch" in app_js
    assert "condition-filter" in catalog_template
    assert "max_price_cents" in app_js
    assert "price_asc" in app_js
    assert "title_asc" in app_js


def test_storefront_prepares_wishlist_persistence_for_authenticated_buyers():
    app = create_app(TestingConfig)
    client = app.test_client()

    response = client.get("/")
    app_js = client.get("/static/js/marketplace/app.js").get_data(as_text=True)

    assert response.status_code == 200
    assert "loadWishlist" in app_js
    assert "listWishlist" in app_js
    assert "addWishlistItem" in app_js
    assert "removeWishlistItem" in app_js
    assert "Saved temporarily. Sign in to keep your wishlist." in app_js


def test_storefront_integrates_persisted_cart_api_for_buyers():
    app = create_app(TestingConfig)
    client = app.test_client()

    response = client.get("/")
    app_js = client.get("/static/js/marketplace/app.js").get_data(as_text=True)
    checkout_api_js = client.get("/static/js/checkout/checkout-api.js").get_data(as_text=True)
    index_html = response.get_data(as_text=True)

    assert response.status_code == 200
    assert 'const BASE_URL = "/api/v1/cart"' in checkout_api_js
    assert "SecondMarketCheckoutAPI.addItem" in app_js
    assert "SecondMarketCheckoutAPI.updateItem" in app_js
    assert "SecondMarketCheckoutAPI.removeItem" in app_js
    assert "syncCartFromApi" in app_js
    assert "loadCart" in app_js
    assert "window.location.href='/checkout'" in app_js
    assert "window.location.href='/checkout'" in index_html


def test_marketplace_page_modules_are_served_separately():
    app = create_app(TestingConfig)
    client = app.test_client()

    expected_assets = {
        "/static/css/marketplace/base.css": ".marketplace-filter-panel",
        "/static/js/marketplace/app.js": "class SecondMarketApp",
        "/static/js/marketplace/components/product-card.js": "renderProductCard",
        "/static/js/marketplace/pages/home-page.js": "renderHomeView",
        "/static/js/marketplace/pages/catalog-page.js": "renderShopView",
        "/static/js/marketplace/pages/product-detail-page.js": "renderPDPView",
        "/static/js/marketplace/pages/wishlist-page.js": "renderWishlistView",
        "/static/js/marketplace/pages/about-page.js": "renderAboutView",
    }

    for asset_path, expected_text in expected_assets.items():
        response = client.get(asset_path)
        assert response.status_code == 200
        assert expected_text in response.get_data(as_text=True)


def test_marketplace_html_page_templates_are_served_separately():
    app = create_app(TestingConfig)
    client = app.test_client()

    expected_templates = {
        "/marketplace/pages/home.html": "{{categoryTiles}}",
        "/marketplace/pages/catalog.html": "{{productGrid}}",
        "/marketplace/pages/product-detail.html": "{{galleryButtons}}",
        "/marketplace/pages/wishlist.html": "{{wishlistGrid}}",
        "/marketplace/pages/about.html": "{{developerCards}}",
    }

    for template_path, expected_text in expected_templates.items():
        response = client.get(template_path)
        assert response.status_code == 200
        assert expected_text in response.get_data(as_text=True)


def test_storefront_hero_rotates_background_images_every_5000ms():
    app = create_app(TestingConfig)
    client = app.test_client()

    index_html = client.get("/").get_data(as_text=True)
    home_template = client.get("/marketplace/pages/home.html").get_data(as_text=True)
    app_js = client.get("/static/js/marketplace/app.js").get_data(as_text=True)
    css = client.get("/static/css/marketplace/base.css").get_data(as_text=True)

    for html in (index_html, home_template):
        assert 'id="home-hero-media"' in html
        assert 'data-hero-slide="0"' in html
        assert 'data-hero-slide="1"' in html
        assert 'data-hero-slide="2"' in html
        assert 'data-hero-slide="3"' in html
        assert "/static/images/hero-furniture-editorial.jpg" in html
        assert "/static/images/hero-furniture-dining.jpg" in html
        assert "/static/images/hero-tech-devices.jpg" in html
        assert "/static/images/hero-smartphones.jpg" in html

    assert ".home-hero-slide" in css
    assert ".home-hero-slide.is-active" in css
    assert "this.heroSlideIntervalMs = 5000;" in app_js
    assert "startHeroBackgroundSlideshow()" in app_js
    assert "stopHeroBackgroundSlideshow()" in app_js
    assert "advanceHeroBackgroundSlide()" in app_js

    for asset in (
        "/static/images/hero-furniture-editorial.jpg",
        "/static/images/hero-furniture-editorial.webp",
        "/static/images/hero-furniture-dining.jpg",
        "/static/images/hero-furniture-dining.webp",
        "/static/images/hero-tech-devices.jpg",
        "/static/images/hero-tech-devices.webp",
        "/static/images/hero-smartphones.jpg",
        "/static/images/hero-smartphones.webp",
    ):
        resp = client.get(asset)
        assert resp.status_code == 200


def test_storefront_includes_dedicated_about_page_and_credits():
    app = create_app(TestingConfig)
    client = app.test_client()

    index_html = client.get("/").get_data(as_text=True)
    about_route_html = client.get("/about").get_data(as_text=True)
    about_template = client.get("/marketplace/pages/about.html").get_data(as_text=True)
    about_js = client.get("/static/js/marketplace/pages/about-page.js").get_data(as_text=True)
    app_js = client.get("/static/js/marketplace/app.js").get_data(as_text=True)
    css = client.get("/static/css/marketplace/base.css").get_data(as_text=True)

    assert "<!DOCTYPE html>" in about_route_html
    assert "/static/js/marketplace/pages/about-page.js" in index_html
    assert 'id="template-about"' in index_html
    assert "app.navigate('about')" in index_html
    assert "{{developerCards}}" in index_html
    assert "{{developerCards}}" in about_template
    assert "case 'about':" in app_js
    assert "renderAboutView()" in app_js
    assert ".about-team-grid" in css

    for developer_name in (
        "Alexa Alegarbes",
        "Richelle Jean Rosagaran",
        "Diondell Apariccio",
        "Jomarie Celis",
    ):
        assert developer_name in about_js
