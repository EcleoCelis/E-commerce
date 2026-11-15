from flask import Blueprint, g, request

from backend.app.auth.decorators import roles_required
from backend.app.auth.rbac import Role
from backend.app.core.responses import error_response, success_response
from backend.app.marketplace.serializers import (
    serialize_category,
    serialize_product_detail,
    serialize_product_summary,
)
from backend.app.marketplace.service import (
    add_wishlist_item,
    get_marketplace_product_by_slug,
    list_active_categories,
    list_marketplace_products,
    list_wishlist_items,
    parse_marketplace_filters,
    remove_wishlist_item,
)
from backend.app.trust.serializers import (
    serialize_product_report,
    serialize_rating_summary,
    serialize_review,
)
from backend.app.trust.service import (
    TrustError,
    check_review_eligibility,
    create_product_report,
    create_review,
    get_product_rating_summary,
    list_product_reviews,
)
from backend.app.trust.validation import (
    parse_review_filters,
    validate_report_payload,
    validate_review_payload,
)


marketplace_bp = Blueprint("marketplace", __name__, url_prefix="/marketplace")


def trust_error_response(error):
    return error_response(
        message=error.message,
        status_code=error.status_code,
        code=error.code,
        details=error.details,
    )



@marketplace_bp.get("/categories")
def categories():
    return success_response(
        data=[
            serialize_category(category, product_count=product_count)
            for category, product_count in list_active_categories()
        ]
    )


@marketplace_bp.get("/products")
def products():
    filters, errors = parse_marketplace_filters(request.args)
    if errors:
        return error_response(
            message="Request validation failed.",
            status_code=422,
            code="validation_error",
            details=errors,
        )

    products = list_marketplace_products(filters)
    return success_response(
        data=[serialize_product_summary(product) for product in products],
        meta={"count": len(products)},
    )


@marketplace_bp.get("/products/<slug>")
def product_detail(slug):
    product = get_marketplace_product_by_slug(slug)
    if product is None:
        return error_response(
            message="Product was not found.",
            status_code=404,
            code="product_not_found",
        )

    return success_response(data=serialize_product_detail(product))


@marketplace_bp.get("/wishlist")
@roles_required(Role.BUYER.value)
def wishlist():
    wishlist_items = list_wishlist_items(g.current_user)
    return success_response(
        data=[serialize_product_summary(item.product) for item in wishlist_items],
        meta={"count": len(wishlist_items)},
    )


@marketplace_bp.post("/wishlist")
@roles_required(Role.BUYER.value)
def add_to_wishlist():
    payload = request.get_json(silent=True) or {}
    product_slug = (payload.get("product_slug") or "").strip()
    if not product_slug:
        return error_response(
            message="Request validation failed.",
            status_code=422,
            code="validation_error",
            details={"product_slug": ["Product slug is required."]},
        )

    product = get_marketplace_product_by_slug(product_slug)
    if product is None:
        return error_response(
            message="Product was not found.",
            status_code=404,
            code="product_not_found",
        )

    wishlist_item, created = add_wishlist_item(g.current_user, product)
    return success_response(
        data=serialize_product_summary(wishlist_item.product),
        message="Product saved to wishlist.",
        status_code=201 if created else 200,
    )


@marketplace_bp.delete("/wishlist/<slug>")
@roles_required(Role.BUYER.value)
def remove_from_wishlist(slug):
    product = get_marketplace_product_by_slug(slug)
    if product is None:
        return error_response(
            message="Product was not found.",
            status_code=404,
            code="product_not_found",
        )

    removed = remove_wishlist_item(g.current_user, product)
    if not removed:
        return error_response(
            message="Product is not saved in your wishlist.",
            status_code=404,
            code="wishlist_item_not_found",
        )

    return success_response(
        data={"product_slug": slug},
        message="Product removed from wishlist.",
    )


@marketplace_bp.get("/products/<slug>/reviews")
def product_reviews(slug):
    product = get_marketplace_product_by_slug(slug)
    if product is None:
        return error_response(
            message="Product was not found.",
            status_code=404,
            code="product_not_found",
        )

    filters, errors = parse_review_filters(request.args)
    if errors:
        return error_response(
            message="Request validation failed.",
            status_code=422,
            code="validation_error",
            details=errors,
        )

    reviews = list_product_reviews(product, filters)
    summary = get_product_rating_summary(product)

    return success_response(
        data=[serialize_review(review) for review in reviews],
        meta={
            "count": len(reviews),
            "rating_summary": serialize_rating_summary(summary),
        },
    )


@marketplace_bp.get("/products/<slug>/reviews/eligibility")
@roles_required(Role.BUYER.value)
def review_eligibility(slug):
    product = get_marketplace_product_by_slug(slug)
    if product is None:
        return error_response(
            message="Product was not found.",
            status_code=404,
            code="product_not_found",
        )

    is_eligible, order, reason = check_review_eligibility(g.current_user, product)
    return success_response(
        data={
            "eligible": is_eligible,
            "reason": reason,
            "order_number": order.order_number if order else None,
        }
    )


@marketplace_bp.post("/products/<slug>/reviews")
@roles_required(Role.BUYER.value)
def submit_review(slug):
    product = get_marketplace_product_by_slug(slug)
    if product is None:
        return error_response(
            message="Product was not found.",
            status_code=404,
            code="product_not_found",
        )

    payload, errors = validate_review_payload(request.get_json(silent=True))
    if errors:
        return error_response(
            message="Request validation failed.",
            status_code=422,
            code="validation_error",
            details=errors,
        )

    try:
        review = create_review(g.current_user, product, payload)
    except TrustError as error:
        return trust_error_response(error)

    return success_response(
        data=serialize_review(review),
        message="Review submitted successfully.",
        status_code=201,
    )


@marketplace_bp.post("/products/<slug>/reports")
@roles_required(Role.BUYER.value)
def submit_product_report(slug):
    product = get_marketplace_product_by_slug(slug)
    if product is None:
        return error_response(
            message="Product was not found.",
            status_code=404,
            code="product_not_found",
        )

    payload, errors = validate_report_payload(request.get_json(silent=True))
    if errors:
        return error_response(
            message="Request validation failed.",
            status_code=422,
            code="validation_error",
            details=errors,
        )

    try:
        report = create_product_report(g.current_user, product, payload)
    except TrustError as error:
        return trust_error_response(error)

    return success_response(
        data=serialize_product_report(report),
        message="Product report submitted.",
        status_code=201,
    )

