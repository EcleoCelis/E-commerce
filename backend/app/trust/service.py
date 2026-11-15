from sqlalchemy import func
from sqlalchemy.orm import selectinload

from backend.app.extensions import db
from backend.app.models import (
    Order,
    OrderItem,
    OrderStatus,
    Product,
    ProductReport,
    ReportReason,
    ReportStatus,
    Review,
    ReviewStatus,
    ShippingStatus,
)


class TrustError(Exception):
    def __init__(self, message, status_code=400, code="trust_error", details=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details or {}


def check_review_eligibility(user, product, order_number=None, order_id=None):
    if user is None or not user.is_authenticated if hasattr(user, "is_authenticated") else user is None:
        return False, None, "Authentication required."

    query = (
        Order.query.join(OrderItem, OrderItem.order_id == Order.id)
        .filter(Order.user_id == user.id)
        .filter(OrderItem.product_id == product.id)
        .filter(
            (Order.shipping_status == ShippingStatus.DELIVERED.value)
            | (Order.status == OrderStatus.DELIVERED.value)
        )
    )

    if order_number:
        query = query.filter(Order.order_number == order_number)
    elif order_id:
        query = query.filter(Order.id == order_id)

    delivered_orders = query.order_by(Order.placed_at.desc()).all()
    if not delivered_orders:
        return False, None, "You can only review items from delivered orders you have purchased."

    # Check which orders already have a review
    existing_reviewed_order_ids = {
        row[0]
        for row in db.session.query(Review.order_id)
        .filter(Review.user_id == user.id, Review.product_id == product.id)
        .filter(Review.order_id.isnot(None))
        .all()
    }

    unreviewed_orders = [order for order in delivered_orders if order.id not in existing_reviewed_order_ids]
    if not unreviewed_orders:
        return False, None, "You have already reviewed this product for your delivered purchase."

    return True, unreviewed_orders[0], ""


def create_review(user, product, payload):
    order_number = payload.get("order_number")
    order_id = payload.get("order_id")

    is_eligible, eligible_order, reason = check_review_eligibility(
        user, product, order_number=order_number, order_id=order_id
    )
    if not is_eligible:
        if "already reviewed" in reason:
            raise TrustError(
                message=reason,
                status_code=409,
                code="duplicate_review",
            )
        raise TrustError(
            message=reason,
            status_code=403,
            code="not_eligible",
        )

    review = Review(
        user=user,
        product=product,
        order=eligible_order,
        rating=payload["rating"],
        title=payload.get("title"),
        body=payload.get("body"),
        status=ReviewStatus.PUBLISHED.value,
    )
    db.session.add(review)
    db.session.commit()
    return review


def list_product_reviews(product, filters=None):
    filters = filters or {}
    query = (
        Review.query.options(selectinload(Review.user), selectinload(Review.order))
        .filter(Review.product_id == product.id)
        .filter(Review.status == ReviewStatus.PUBLISHED.value)
    )

    sort = filters.get("sort", "recent")
    if sort == "oldest":
        query = query.order_by(Review.created_at.asc(), Review.id.asc())
    elif sort == "rating_desc":
        query = query.order_by(Review.rating.desc(), Review.created_at.desc())
    elif sort == "rating_asc":
        query = query.order_by(Review.rating.asc(), Review.created_at.desc())
    else:
        query = query.order_by(Review.created_at.desc(), Review.id.desc())

    return query.all()


def get_product_rating_summary(product):
    rows = (
        db.session.query(Review.rating, func.count(Review.id))
        .filter(Review.product_id == product.id, Review.status == ReviewStatus.PUBLISHED.value)
        .group_by(Review.rating)
        .all()
    )

    breakdown = {str(i): 0 for i in range(1, 6)}
    total_reviews = 0
    total_score = 0

    for rating, count in rows:
        breakdown[str(rating)] = count
        total_reviews += count
        total_score += rating * count

    average = round(total_score / total_reviews, 1) if total_reviews > 0 else 0.0

    return {
        "average_rating": average,
        "review_count": total_reviews,
        "breakdown": breakdown,
    }


def create_product_report(reporter, product, payload):
    report = ProductReport(
        product=product,
        reporter=reporter,
        reason=payload["reason"],
        details=payload.get("details"),
        status=ReportStatus.OPEN.value,
    )
    db.session.add(report)
    db.session.commit()
    return report


def list_admin_reviews(filters=None):
    filters = filters or {}
    query = Review.query.options(
        selectinload(Review.user),
        selectinload(Review.product),
        selectinload(Review.order),
    )

    status = (filters.get("status") or "").strip()
    if status:
        query = query.filter(Review.status == status)

    sort = filters.get("sort", "recent")
    if sort == "oldest":
        query = query.order_by(Review.created_at.asc(), Review.id.asc())
    elif sort == "rating_desc":
        query = query.order_by(Review.rating.desc(), Review.created_at.desc())
    elif sort == "rating_asc":
        query = query.order_by(Review.rating.asc(), Review.created_at.desc())
    else:
        query = query.order_by(Review.created_at.desc(), Review.id.desc())

    return query.all()


def update_admin_review_status(review_id, new_status):
    review = Review.query.filter_by(id=review_id).one_or_none()
    if review is None:
        raise TrustError("Review was not found.", status_code=404, code="review_not_found")

    if new_status not in {status.value for status in ReviewStatus}:
        raise TrustError("Review status is not supported.", status_code=422, code="validation_error")

    review.status = new_status
    db.session.commit()
    return review


def list_admin_product_reports(filters=None):
    filters = filters or {}
    query = ProductReport.query.options(
        selectinload(ProductReport.product),
        selectinload(ProductReport.reporter),
        selectinload(ProductReport.resolved_by),
    )

    status = (filters.get("status") or "").strip()
    if status:
        query = query.filter(ProductReport.status == status)

    reason = (filters.get("reason") or "").strip()
    if reason:
        query = query.filter(ProductReport.reason == reason)

    sort = filters.get("sort", "recent")
    if sort == "oldest":
        query = query.order_by(ProductReport.created_at.asc(), ProductReport.id.asc())
    else:
        query = query.order_by(ProductReport.created_at.desc(), ProductReport.id.desc())

    return query.all()


def update_admin_product_report_status(report_id, new_status, admin_user):
    report = ProductReport.query.filter_by(id=report_id).one_or_none()
    if report is None:
        raise TrustError("Product report was not found.", status_code=404, code="report_not_found")

    if new_status not in {status.value for status in ReportStatus}:
        raise TrustError("Report status is not supported.", status_code=422, code="validation_error")

    if new_status in {ReportStatus.RESOLVED.value, ReportStatus.DISMISSED.value}:
        report.resolve(admin_user, new_status)
    else:
        report.status = new_status

    db.session.commit()
    return report

