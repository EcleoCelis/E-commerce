from sqlalchemy import func, or_
from sqlalchemy.orm import selectinload

from backend.app.extensions import db
from backend.app.models import Category, InventoryMovement, Product, ProductCondition, ProductImage, ProductStatus


ADMIN_PRODUCT_SORTS = {"recent", "title_asc", "price_asc", "price_desc", "quantity_asc", "quantity_desc"}
ADMIN_PRODUCT_STATUSES = {status.value for status in ProductStatus}
ADMIN_PRODUCT_CONDITIONS = {condition.value for condition in ProductCondition}


class AdminProductError(Exception):
    def __init__(self, message, status_code=400, code="admin_product_error", details=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details or {}


class AdminCategoryError(Exception):
    def __init__(self, message, status_code=400, code="admin_category_error", details=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details or {}


def list_admin_categories():
    product_counts = dict(
        db.session.query(Product.category_id, func.count(Product.id))
        .group_by(Product.category_id)
        .all()
    )

    categories = Category.query.order_by(Category.sort_order.asc(), Category.name.asc()).all()
    return [(category, product_counts.get(category.id, 0)) for category in categories]


def admin_products_query():
    return Product.query.options(
        selectinload(Product.category),
        selectinload(Product.images),
        selectinload(Product.seller),
    ).join(Category)


def get_or_create_uncategorized_category():
    uncategorized = Category.query.filter_by(slug="uncategorized").one_or_none()
    if not uncategorized:
        uncategorized = Category(
            name="Uncategorized",
            slug="uncategorized",
            description="Default category for unassigned products.",
            is_active=True,
            sort_order=999,
        )
        db.session.add(uncategorized)
        db.session.flush()
    return uncategorized


def get_category_by_slug(slug):
    category = Category.query.filter_by(slug=slug).one_or_none()
    if not category and slug == "uncategorized":
        return get_or_create_uncategorized_category()
    return category


def category_slug_exists(slug, excluded_category_id=None):
    query = Category.query.filter(Category.slug == slug)
    if excluded_category_id is not None:
        query = query.filter(Category.id != excluded_category_id)
    return db.session.query(query.exists()).scalar()


def category_name_exists(name, excluded_category_id=None):
    query = Category.query.filter(func.lower(Category.name) == name.lower())
    if excluded_category_id is not None:
        query = query.filter(Category.id != excluded_category_id)
    return db.session.query(query.exists()).scalar()


def ensure_category_can_use_payload(data, category=None):
    excluded_category_id = category.id if category is not None else None

    if data.get("slug") and category_slug_exists(data["slug"], excluded_category_id=excluded_category_id):
        raise AdminCategoryError(
            message="Request validation failed.",
            status_code=422,
            code="validation_error",
            details={"slug": ["Slug is already used by another category."]},
        )

    if data.get("name") and category_name_exists(data["name"], excluded_category_id=excluded_category_id):
        raise AdminCategoryError(
            message="Request validation failed.",
            status_code=422,
            code="validation_error",
            details={"name": ["Name is already used by another category."]},
        )


def create_admin_category(data, actor=None):
    from backend.app.admin.settings import record_admin_audit

    ensure_category_can_use_payload(data)
    category = Category(
        name=data["name"],
        slug=data["slug"],
        description=data.get("description") or None,
        image_url=data.get("image_url") or None,
        is_active=data.get("is_active", True),
        sort_order=data.get("sort_order", 0),
    )
    db.session.add(category)
    db.session.flush()
    record_admin_audit(
        actor=actor,
        action="category_created",
        entity_type="category",
        entity_id=category.slug,
        summary=f"Created category '{category.name}' ({category.slug}).",
        metadata={"category_id": category.id, "slug": category.slug, "is_active": category.is_active},
        commit=False,
    )
    db.session.commit()
    return category


def update_admin_category(category, data, actor=None):
    from backend.app.admin.settings import record_admin_audit

    ensure_category_can_use_payload(data, category=category)

    for field_name in ("name", "slug", "description", "image_url", "is_active", "sort_order"):
        if field_name in data:
            value = data[field_name]
            if field_name in ("description", "image_url"):
                value = value or None
            setattr(category, field_name, value)

    record_admin_audit(
        actor=actor,
        action="category_updated",
        entity_type="category",
        entity_id=category.slug,
        summary=f"Updated category '{category.name}' ({category.slug}).",
        metadata={"category_id": category.id, "slug": category.slug, "is_active": category.is_active},
        commit=False,
    )
    db.session.commit()
    return category


def update_admin_category_status(category, is_active):
    category.is_active = is_active
    db.session.commit()
    return category


def delete_admin_category(category, actor=None):
    from backend.app.admin.settings import record_admin_audit

    category_id = category.id
    category_slug = category.slug
    category_name = category.name

    products = Product.query.filter_by(category_id=category.id).all()
    if products:
        uncategorized = get_or_create_uncategorized_category()

        if category.id == uncategorized.id:
            raise AdminCategoryError(
                message="Cannot delete Uncategorized category while it contains products.",
                status_code=400,
                code="cannot_delete_uncategorized",
            )

        for product in products:
            product.category = uncategorized
            product.category_id = uncategorized.id

        category.products.clear()
        db.session.flush()

    for child in list(category.children):
        child.parent = None
        child.parent_id = None
    category.children.clear()

    db.session.delete(category)
    record_admin_audit(
        actor=actor,
        action="category_deleted",
        entity_type="category",
        entity_id=category_slug,
        summary=f"Deleted category '{category_name}' ({category_slug}).",
        metadata={"category_id": category_id, "slug": category_slug, "reassigned_products": len(products)},
        commit=False,
    )
    db.session.commit()
    return True



def get_admin_product_by_slug(slug):
    return (
        Product.query.options(
            selectinload(Product.category),
            selectinload(Product.images),
            selectinload(Product.seller),
        )
        .filter(Product.slug == slug)
        .one_or_none()
    )


def product_slug_exists(slug, excluded_product_id=None):
    query = Product.query.filter(Product.slug == slug)
    if excluded_product_id is not None:
        query = query.filter(Product.id != excluded_product_id)
    return db.session.query(query.exists()).scalar()


def ensure_product_can_use_payload(data, product=None):
    category_slug = data.get("category_slug")
    if category_slug and get_category_by_slug(category_slug) is None:
        raise AdminProductError(
            message="Request validation failed.",
            status_code=422,
            code="validation_error",
            details={"category_slug": ["Category was not found."]},
        )

    slug = data.get("slug")
    excluded_product_id = product.id if product is not None else None
    if slug and product_slug_exists(slug, excluded_product_id=excluded_product_id):
        raise AdminProductError(
            message="Request validation failed.",
            status_code=422,
            code="validation_error",
            details={"slug": ["Slug is already used by another product."]},
        )


def set_product_images(product, images):
    if images is None:
        return

    if product.id is not None and product.images:
        for existing_image in list(product.images):
            db.session.delete(existing_image)
        product.images.clear()
        db.session.flush()
    else:
        product.images.clear()

    for index, image_data in enumerate(images):
        product.images.append(
            ProductImage(
                image_url=image_data["image_url"],
                alt_text=image_data["alt_text"],
                sort_order=image_data.get("sort_order", index),
                is_primary=image_data.get("is_primary", False),
            )
        )

    if product.images and not any(image.is_primary for image in product.images):
        product.images[0].is_primary = True


def apply_product_status(product, status):
    if status == ProductStatus.AVAILABLE.value:
        if product.quantity <= 0:
            raise AdminProductError(
                message="Request validation failed.",
                status_code=422,
                code="validation_error",
                details={"quantity": ["Available products must have at least one item in stock."]},
            )
        if product.status != ProductStatus.AVAILABLE.value:
            product.publish()
        return

    if status == ProductStatus.RESERVED.value and product.quantity <= 0:
        raise AdminProductError(
            message="Request validation failed.",
            status_code=422,
            code="validation_error",
            details={"quantity": ["Reserved products must have at least one item in stock."]},
        )

    if status == ProductStatus.SOLD.value:
        product.status = status
        product.quantity = 0
        return

    if status:
        product.status = status


def create_admin_product(seller, data, actor=None):
    from backend.app.admin.settings import record_admin_audit

    ensure_product_can_use_payload(data)
    category = get_category_by_slug(data["category_slug"])
    product = Product(
        seller=seller,
        category=category,
        title=data["title"],
        slug=data["slug"],
        description=data["description"],
        price_cents=data["price_cents"],
        compare_at_price_cents=data.get("compare_at_price_cents"),
        cost_cents=data.get("cost_cents"),
        condition=data["condition"],
        status=ProductStatus.DRAFT.value,
        quantity=data["quantity"],
        low_stock_threshold=data.get("low_stock_threshold", 5),
        track_inventory=data.get("track_inventory", True),
        variants_json=data.get("variants_json") or [],
        sku=data.get("sku") or None,
        brand=data.get("brand") or None,
        color=data.get("color") or None,
        material=data.get("material") or None,
        dimensions=data.get("dimensions") or None,
    )
    set_product_images(product, data.get("images"))
    apply_product_status(product, data.get("status", ProductStatus.DRAFT.value))
    db.session.add(product)
    db.session.flush()
    record_admin_audit(
        actor=actor or seller,
        action="product_created",
        entity_type="product",
        entity_id=product.slug,
        summary=f"Created product '{product.title}' ({product.slug}).",
        metadata={"product_id": product.id, "slug": product.slug, "status": product.status, "quantity": product.quantity},
        commit=False,
    )
    db.session.commit()
    return product


def update_admin_product(product, data, actor=None):
    from backend.app.admin.settings import record_admin_audit

    if data.get("category_slug") == "uncategorized" and get_category_by_slug("uncategorized") is None:
        get_or_create_uncategorized_category()

    ensure_product_can_use_payload(data, product=product)

    if "category_slug" in data:
        product.category = get_category_by_slug(data["category_slug"])
    for field_name in (
        "title",
        "slug",
        "description",
        "price_cents",
        "compare_at_price_cents",
        "cost_cents",
        "condition",
        "quantity",
        "low_stock_threshold",
        "track_inventory",
        "variants_json",
        "sku",
        "brand",
        "color",
        "material",
        "dimensions",
    ):
        if field_name in data:
            value = data[field_name]
            if field_name in {"sku", "brand", "color", "material", "dimensions"}:
                value = value or None
            setattr(product, field_name, value)

    set_product_images(product, data.get("images"))
    if "status" in data:
        apply_product_status(product, data["status"])
    elif product.status == ProductStatus.AVAILABLE.value and product.quantity <= 0:
        apply_product_status(product, ProductStatus.AVAILABLE.value)

    record_admin_audit(
        actor=actor,
        action="product_updated",
        entity_type="product",
        entity_id=product.slug,
        summary=f"Updated product '{product.title}' ({product.slug}).",
        metadata={"product_id": product.id, "slug": product.slug, "status": product.status, "quantity": product.quantity},
        commit=False,
    )
    db.session.commit()
    return product


def update_admin_product_status(product, status):
    apply_product_status(product, status)
    db.session.commit()
    return product


def update_admin_product_quantity(product, quantity, actor=None, reason="manual_adjustment", reference=None):
    if product.status in {ProductStatus.AVAILABLE.value, ProductStatus.RESERVED.value} and quantity <= 0:
        raise AdminProductError(
            message="Request validation failed.",
            status_code=422,
            code="validation_error",
            details={"quantity": ["Active products must have at least one item in stock."]},
        )

    previous_quantity = int(product.quantity or 0)
    product.quantity = quantity
    if quantity != previous_quantity:
        cleaned_reason = (str(reason or "manual_adjustment").strip() or "manual_adjustment")[:120]
        db.session.add(
            InventoryMovement(
                product_id=product.id,
                actor_id=actor.id if actor else None,
                delta=quantity - previous_quantity,
                previous_quantity=previous_quantity,
                new_quantity=quantity,
                reason=cleaned_reason,
                reference=(str(reference).strip()[:100] if reference else None),
            )
        )
    db.session.commit()
    return product


def list_product_inventory_movements(product, limit=50):
    movements = (
        InventoryMovement.query.options(selectinload(InventoryMovement.actor), selectinload(InventoryMovement.product))
        .filter(InventoryMovement.product_id == product.id)
        .order_by(InventoryMovement.created_at.desc(), InventoryMovement.id.desc())
        .limit(max(1, min(int(limit or 50), 100)))
        .all()
    )
    return [item.to_dict() for item in movements]


def _permanently_delete_product(product, actor=None):
    """Permanently delete a product while clearing blocking cart rows and preserving order snapshots."""
    from backend.app.admin.settings import record_admin_audit
    from backend.app.models import CartItem, OrderItem

    product_id = product.id
    slug = product.slug
    title = product.title

    CartItem.query.filter(CartItem.product_id == product_id).delete(synchronize_session=False)
    OrderItem.query.filter(OrderItem.product_id == product_id).update(
        {"product_id": None},
        synchronize_session=False,
    )

    db.session.delete(product)
    record_admin_audit(
        actor=actor,
        action="product_deleted",
        entity_type="product",
        entity_id=slug,
        summary=f"Permanently deleted product '{title}' ({slug}).",
        metadata={"product_id": product_id, "slug": slug, "title": title},
        commit=False,
    )
    return {"id": product_id, "slug": slug, "title": title}


def delete_admin_product(product, actor=None):
    deleted = _permanently_delete_product(product, actor=actor)
    db.session.commit()
    return deleted, False


def execute_bulk_product_action(slugs, action, status=None, actor=None):
    products = Product.query.filter(Product.slug.in_(slugs)).all()
    if not products:
        raise AdminProductError(
            message="No matching products found.",
            status_code=404,
            code="products_not_found",
        )

    affected_count = 0
    archived_count = 0
    deleted_count = 0

    for product in products:
        if action == "status":
            if status in {ProductStatus.AVAILABLE.value, ProductStatus.RESERVED.value} and product.quantity <= 0:
                continue
            apply_product_status(product, status)
            affected_count += 1
        elif action == "delete":
            _permanently_delete_product(product, actor=actor)
            deleted_count += 1
            affected_count += 1

    db.session.commit()
    return {
        "affected_count": affected_count,
        "deleted_count": deleted_count,
        "archived_count": archived_count,
        "action": action,
        "status": status,
    }


def list_admin_products(filters):
    query = admin_products_query()

    search = (filters.get("q") or "").strip()
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Product.title.ilike(pattern),
                Product.description.ilike(pattern),
                Product.slug.ilike(pattern),
                Product.sku.ilike(pattern),
                Product.brand.ilike(pattern),
                Product.material.ilike(pattern),
            )
        )

    category = (filters.get("category") or "").strip()
    if category:
        query = query.filter(Category.slug == category)

    status = (filters.get("status") or "").strip()
    if status:
        query = query.filter(Product.status == status)

    condition = (filters.get("condition") or "").strip()
    if condition:
        query = query.filter(Product.condition == condition)

    sort = filters.get("sort") or "recent"
    if sort == "title_asc":
        query = query.order_by(Product.title.asc(), Product.id.asc())
    elif sort == "price_asc":
        query = query.order_by(Product.price_cents.asc(), Product.id.asc())
    elif sort == "price_desc":
        query = query.order_by(Product.price_cents.desc(), Product.id.asc())
    elif sort == "quantity_asc":
        query = query.order_by(Product.quantity.asc(), Product.id.asc())
    elif sort == "quantity_desc":
        query = query.order_by(Product.quantity.desc(), Product.id.asc())
    else:
        query = query.order_by(Product.updated_at.desc(), Product.id.desc())

    return query.all()


def parse_admin_product_filters(args):
    filters = {
        "q": args.get("q", ""),
        "category": args.get("category", ""),
        "status": args.get("status", ""),
        "condition": args.get("condition", ""),
        "sort": args.get("sort", "recent"),
    }
    errors = {}

    if filters["sort"] not in ADMIN_PRODUCT_SORTS:
        errors.setdefault("sort", []).append(
            "Sort must be recent, title_asc, price_asc, price_desc, quantity_asc, or quantity_desc."
        )

    if filters["status"] and filters["status"] not in ADMIN_PRODUCT_STATUSES:
        errors.setdefault("status", []).append("Status must be draft, available, reserved, sold, or hidden.")

    if filters["condition"] and filters["condition"] not in ADMIN_PRODUCT_CONDITIONS:
        errors.setdefault("condition", []).append(
            "Condition must be new_other, like_new, good, fair, or for_repair."
        )

    return filters, errors
