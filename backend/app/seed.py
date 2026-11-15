import json
import os
import secrets
from pathlib import Path

from backend.app.auth.rbac import Role
from backend.app.extensions import db
from backend.app.models import Category, Product, ProductCondition, ProductImage, ProductStatus, User, UserStatus


STARTER_CATEGORIES = (
    ("Furniture", "furniture", "Tables, chairs, cabinets, shelves, and home fixtures."),
    ("Electronics", "electronics", "Pre-owned gadgets, accessories, and small appliances."),
    ("Fashion", "fashion", "Secondhand clothing, shoes, bags, and accessories."),
    ("Books", "books", "Used books, references, learning materials, and collectibles."),
)

STARTER_PRODUCTS = (
    {
        "category_slug": "electronics",
        "title": "Pre-Owned Wireless Headphones",
        "slug": "pre-owned-wireless-headphones",
        "description": "Comfortable over-ear headphones with clean ear pads and tested audio output.",
        "price_cents": 185000,
        "condition": ProductCondition.GOOD.value,
        "brand": "SoundCore",
        "color": "Black",
        "material": "Plastic and leatherette",
        "image_url": "/static/productImages/headphones/m502t0016_13june22_headphone_03.jpg",
        "alt_text": "Black wireless headphones",
    },
    {
        "category_slug": "electronics",
        "title": "Secondhand Smartphone",
        "slug": "secondhand-smartphone",
        "description": "Unlocked smartphone with minor cosmetic wear and a clear display.",
        "price_cents": 420000,
        "condition": ProductCondition.GOOD.value,
        "brand": "Android",
        "color": "Black",
        "material": "Glass and aluminum",
        "image_url": "/static/productImages/smartphones/330788-P9NVVS-165.jpg",
        "alt_text": "Secondhand smartphone",
    },
    {
        "category_slug": "fashion",
        "title": "Classic Black Short Sleeve Shirt",
        "slug": "classic-black-short-sleeve-shirt",
        "description": "Casual black shirt suitable for everyday wear.",
        "price_cents": 45000,
        "condition": ProductCondition.LIKE_NEW.value,
        "brand": "Everyday",
        "color": "Black",
        "material": "Cotton blend",
        "image_url": "/static/productImages/shirts/men-rsquo-s-black-short-sleeve-shirt-casual-apparel.jpg",
        "alt_text": "Black short sleeve shirt",
    },
    {
        "category_slug": "fashion",
        "title": "Pre-Loved Student Backpack",
        "slug": "pre-loved-student-backpack",
        "description": "Gray student backpack with spacious compartments and light signs of use.",
        "price_cents": 65000,
        "condition": ProductCondition.GOOD.value,
        "brand": "Campus",
        "color": "Gray",
        "material": "Canvas",
        "image_url": "/static/productImages/bags/young-girl-with-gray-student-backpack.jpg",
        "alt_text": "Gray student backpack",
    },
    {
        "category_slug": "fashion",
        "title": "Casual Denim Shorts",
        "slug": "casual-denim-shorts",
        "description": "Comfortable casual denim shorts in fair secondhand condition.",
        "price_cents": 38000,
        "condition": ProductCondition.FAIR.value,
        "brand": "Denim Co.",
        "color": "Blue",
        "material": "Denim",
        "image_url": "/static/productImages/jeans/casual-men-short-pants.jpg",
        "alt_text": "Casual denim shorts",
    },
    {
        "category_slug": "fashion",
        "title": "Sand Casual Shoes",
        "slug": "sand-casual-shoes",
        "description": "Neutral casual shoes with visible wear but plenty of life left.",
        "price_cents": 90000,
        "condition": ProductCondition.GOOD.value,
        "brand": "Streetwalk",
        "color": "Sand",
        "material": "Synthetic leather",
        "image_url": "/static/productImages/shoe/shoes-sand.jpg",
        "alt_text": "Sand casual shoes",
    },
    {
        "category_slug": "electronics",
        "title": "Minimal Analog Watch",
        "slug": "minimal-analog-watch",
        "description": "Simple analog watch with a clean face and working battery.",
        "price_cents": 120000,
        "condition": ProductCondition.LIKE_NEW.value,
        "brand": "Timewell",
        "color": "Silver",
        "material": "Stainless steel",
        "image_url": "/static/productImages/watch/f85e8d4c-ef9a-4b92-9c66-4592728c2e7a.jpg",
        "alt_text": "Minimal analog watch",
    },
    {
        "category_slug": "fashion",
        "title": "Soft Sleepwear Set",
        "slug": "soft-sleepwear-set",
        "description": "Comfortable sleepwear set, washed and ready for reuse.",
        "price_cents": 52000,
        "condition": ProductCondition.GOOD.value,
        "brand": "Homewear",
        "color": "Light",
        "material": "Cotton",
        "image_url": "/static/productImages/sleepware/e2818e87-ffaf-4391-9019-450bf92552af.jpg",
        "alt_text": "Soft sleepwear set",
    },
)


def seed_development_data():
    created = {"users": 0, "categories": 0, "products": 0}

    admin = User.query.filter_by(email="admin@secondmarket.test").one_or_none()
    if admin is None:
        admin = User(
            email="admin@secondmarket.test",
            role=Role.ADMIN.value,
            first_name="SecondMarket",
            last_name="Admin",
        )
        admin.set_password("AdminSeller2026")
        db.session.add(admin)
        created["users"] += 1

    for name, slug, description in STARTER_CATEGORIES:
        category = Category.query.filter_by(slug=slug).one_or_none()
        if category is None:
            category = Category(name=name, slug=slug, description=description)
            db.session.add(category)
            created["categories"] += 1

    db.session.flush()

    categories_by_slug = {category.slug: category for category in Category.query.all()}
    for product_data in STARTER_PRODUCTS:
        product = Product.query.filter_by(slug=product_data["slug"]).one_or_none()
        if product is not None:
            continue

        category = categories_by_slug[product_data["category_slug"]]
        product = Product(
            seller=admin,
            category=category,
            title=product_data["title"],
            slug=product_data["slug"],
            description=product_data["description"],
            price_cents=product_data["price_cents"],
            condition=product_data["condition"],
            status=ProductStatus.AVAILABLE.value,
            quantity=1,
            brand=product_data["brand"],
            color=product_data["color"],
            material=product_data["material"],
        )
        product.publish()
        product.images.append(
            ProductImage(
                image_url=product_data["image_url"],
                alt_text=product_data["alt_text"],
                sort_order=0,
                is_primary=True,
            )
        )
        db.session.add(product)
        created["products"] += 1

    db.session.commit()
    return created


def seed_catalog_data(only_if_empty=True):
    """Populate starter catalog categories, products, and images from catalog_seed.json."""
    created = {"users": 0, "categories": 0, "products": 0, "skipped": False}

    if only_if_empty and (Category.query.count() > 0 or Product.query.count() > 0):
        created["skipped"] = True
        return created

    seed_path = Path(__file__).resolve().with_name("catalog_seed.json")
    payload = json.loads(seed_path.read_text(encoding="utf-8"))

    seller = User.query.filter_by(role=Role.ADMIN.value).order_by(User.id.asc()).first()
    if seller is None:
        admin_email = os.getenv("SEED_ADMIN_EMAIL", "admin@secondmarket.test").strip().lower()
        admin_password = os.getenv("SEED_ADMIN_PASSWORD", "").strip() or secrets.token_urlsafe(24)
        seller = User(
            email=admin_email,
            role=Role.ADMIN.value,
            first_name="SecondMarket",
            last_name="Admin",
        )
        seller.set_password(admin_password)
        db.session.add(seller)
        db.session.flush()
        created["users"] += 1

    for cat_data in payload.get("categories", []):
        category = Category.query.filter_by(slug=cat_data["slug"]).one_or_none()
        if category is None:
            category = Category(
                name=cat_data["name"],
                slug=cat_data["slug"],
                description=cat_data.get("description"),
                image_url=cat_data.get("image_url"),
                sort_order=cat_data.get("sort_order", 0),
                is_active=True,
            )
            db.session.add(category)
            created["categories"] += 1

    db.session.flush()
    categories_by_slug = {category.slug: category for category in Category.query.all()}

    for product_data in payload.get("products", []):
        if Product.query.filter_by(slug=product_data["slug"]).one_or_none() is not None:
            continue
        category = categories_by_slug.get(product_data["category_slug"])
        if category is None:
            continue

        product = Product(
            seller=seller,
            category=category,
            title=product_data["title"],
            slug=product_data["slug"],
            description=product_data["description"],
            price_cents=product_data["price_cents"],
            condition=product_data["condition"],
            status=ProductStatus.AVAILABLE.value,
            quantity=product_data.get("quantity", 1),
            brand=product_data.get("brand"),
            color=product_data.get("color"),
            material=product_data.get("material"),
            dimensions=product_data.get("dimensions"),
        )
        product.publish()
        for img_data in product_data.get("images", []):
            product.images.append(
                ProductImage(
                    image_url=img_data["image_url"],
                    alt_text=img_data.get("alt_text") or product_data["title"],
                    sort_order=img_data.get("sort_order", 0),
                    is_primary=bool(img_data.get("is_primary", True)),
                )
            )
        db.session.add(product)
        created["products"] += 1

    db.session.commit()
    return created


def ensure_admin_user(email=None, password=None, first_name="SecondMarket", last_name="Admin"):
    """Create or update an admin account using explicit args or SEED_ADMIN_* env vars."""
    raw_email = email if email is not None else os.getenv("SEED_ADMIN_EMAIL", "admin@secondmarket.test")
    raw_password = password if password is not None else os.getenv("SEED_ADMIN_PASSWORD", "")

    clean_email = (raw_email or "").strip().lower()
    clean_password = (raw_password or "").strip()
    if not clean_email or not clean_password:
        return {"action": "skipped", "email": clean_email or None}

    user = User.query.filter_by(email=clean_email).one_or_none()
    if user is None:
        user = User(
            email=clean_email,
            role=Role.ADMIN.value,
            status=UserStatus.ACTIVE.value,
            email_verified=True,
            first_name=first_name,
            last_name=last_name,
        )
        user.set_password(clean_password)
        db.session.add(user)
        action = "created"
    else:
        user.role = Role.ADMIN.value
        user.status = UserStatus.ACTIVE.value
        user.email_verified = True
        user.set_password(clean_password)
        action = "updated"

    db.session.commit()
    return {"action": action, "email": user.email}
