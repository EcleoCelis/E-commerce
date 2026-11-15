from backend.app.marketplace.serializers import format_price, serialize_category


def _product_is_purchasable(product):
    return bool(product and product.is_available and product.category is not None and product.category.is_active)


def serialize_cart_item(item):
    product = item.product
    primary_image = next((image for image in product.images if image.is_primary), None)
    if primary_image is None and product.images:
        primary_image = product.images[0]
    purchasable = _product_is_purchasable(product)

    return {
        "id": item.id,
        "quantity": item.quantity,
        "unit_price": format_price(item.unit_price_cents),
        "line_total": format_price(item.line_total_cents),
        "max_quantity": product.quantity,
        "is_available": purchasable,
        "has_stock_issue": (not purchasable) or (item.quantity > product.quantity),
        "product": {
            "id": product.id,
            "title": product.title,
            "slug": product.slug,
            "condition": product.condition,
            "status": product.status,
            "category": serialize_category(product.category),
            "primary_image": {
                "url": primary_image.image_url,
                "alt_text": primary_image.alt_text,
            } if primary_image else None,
        },
    }


def serialize_cart(cart):
    items = sorted(cart.items, key=lambda item: item.created_at or item.id)
    total_items = sum(item.quantity for item in items)
    has_unavailable_items = any((not _product_is_purchasable(item.product)) or (item.quantity > item.product.quantity) for item in items)

    return {
        "id": cart.id,
        "status": cart.status,
        "items": [serialize_cart_item(item) for item in items],
        "total_items": total_items,
        "has_unavailable_items": has_unavailable_items,
        "subtotal": format_price(cart.subtotal_cents),
        "updated_at": cart.updated_at.isoformat() if cart.updated_at else None,
    }
