from backend.app.marketplace.serializers import format_price, serialize_category


def primary_image_for(product):
    primary_image = next((image for image in product.images if image.is_primary), None)
    return primary_image or (product.images[0] if product.images else None)


def serialize_admin_category(category, product_count=0):
    data = serialize_category(category)
    data["product_count"] = product_count
    return data


def serialize_admin_product(product):
    primary_image = primary_image_for(product)
    compare_cents = getattr(product, "compare_at_price_cents", None)
    cost_cents = getattr(product, "cost_cents", None)
    low_stock = getattr(product, "low_stock_threshold", None)
    track_inv = getattr(product, "track_inventory", None)
    variants = getattr(product, "variants_json", None)

    return {
        "id": product.id,
        "title": product.title,
        "slug": product.slug,
        "description": product.description,
        "price": format_price(product.price_cents),
        "compare_at_price": format_price(compare_cents) if compare_cents is not None else None,
        "cost": format_price(cost_cents) if cost_cents is not None else None,
        "condition": product.condition,
        "status": product.status,
        "quantity": product.quantity,
        "low_stock_threshold": low_stock if low_stock is not None else 5,
        "track_inventory": bool(track_inv) if track_inv is not None else True,
        "variants": variants if isinstance(variants, list) else [],
        "sku": product.sku,
        "brand": product.brand,
        "color": product.color,
        "material": product.material,
        "dimensions": product.dimensions,
        "listed_at": product.listed_at.isoformat() if product.listed_at else None,
        "created_at": product.created_at.isoformat() if getattr(product, "created_at", None) else None,
        "updated_at": product.updated_at.isoformat() if getattr(product, "updated_at", None) else None,
        "category": serialize_category(product.category),
        "seller": {
            "id": product.seller.id,
            "name": f"{product.seller.first_name} {product.seller.last_name}".strip(),
            "email": product.seller.email,
        },
        "primary_image": {
            "id": primary_image.id,
            "url": primary_image.image_url,
            "alt_text": primary_image.alt_text,
        } if primary_image else None,
        "images": [
            {
                "id": image.id,
                "url": image.image_url,
                "alt_text": image.alt_text,
                "sort_order": image.sort_order,
                "is_primary": image.is_primary,
            }
            for image in product.images
        ],
    }
