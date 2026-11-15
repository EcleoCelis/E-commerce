def format_price(price_cents):
    return {
        "amount_cents": price_cents,
        "amount": round(price_cents / 100, 2),
        "currency": "PHP",
    }


def serialize_category(category, product_count=None):
    data = {
        "id": category.id,
        "name": category.name,
        "slug": category.slug,
        "description": category.description,
        "image_url": getattr(category, "image_url", None),
        "is_active": category.is_active,
        "sort_order": category.sort_order,
        "created_at": category.created_at.isoformat() if getattr(category, "created_at", None) else None,
    }

    if product_count is not None:
        data["product_count"] = product_count

    return data


def serialize_product_summary(product):
    primary_image = next((image for image in product.images if image.is_primary), None)
    if primary_image is None and product.images:
        primary_image = product.images[0]

    published_reviews = [r for r in getattr(product, "reviews", []) if r.status == "published"]
    review_count = len(published_reviews)
    average_rating = round(sum(r.rating for r in published_reviews) / review_count, 1) if review_count > 0 else 0.0

    return {
        "id": product.id,
        "title": product.title,
        "slug": product.slug,
        "description": product.description,
        "price": format_price(product.price_cents),
        "compare_at_price": format_price(product.compare_at_price_cents) if getattr(product, "compare_at_price_cents", None) is not None else None,
        "condition": product.condition,
        "status": product.status,
        "quantity": product.quantity,
        "rating": average_rating,
        "reviews_count": review_count,
        "category": serialize_category(product.category),
        "primary_image": {
            "url": primary_image.image_url,
            "alt_text": primary_image.alt_text,
        } if primary_image else None,
        "listed_at": product.listed_at.isoformat() if product.listed_at else None,
    }


def serialize_product_detail(product):
    data = serialize_product_summary(product)
    published_reviews = [r for r in getattr(product, "reviews", []) if r.status == "published"]
    data.update(
        {
            "sku": getattr(product, "sku", None),
            "brand": product.brand,
            "color": product.color,
            "material": product.material,
            "dimensions": product.dimensions,
            "variants": product.variants_json if isinstance(getattr(product, "variants_json", None), list) else [],
            "seller": {
                "id": product.seller.id,
                "name": f"{product.seller.first_name} {product.seller.last_name}".strip(),
            },
            "rating_summary": {
                "average_rating": data["rating"],
                "review_count": data["reviews_count"],
                "breakdown": {
                    str(i): len([r for r in published_reviews if r.rating == i])
                    for i in range(1, 6)
                },
            },
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
    )
    return data

