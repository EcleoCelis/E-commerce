def serialize_review(review, include_admin_fields=False):
    data = {
        "id": review.id,
        "product_id": review.product_id,
        "rating": review.rating,
        "title": review.title,
        "body": review.body,
        "status": review.status,
        "is_verified_purchase": review.order_id is not None,
        "created_at": review.created_at.isoformat() if review.created_at else None,
    }

    if review.user:
        if include_admin_fields:
            data["user"] = {
                "id": review.user.id,
                "name": f"{review.user.first_name} {review.user.last_name}".strip(),
                "email": review.user.email,
            }
        else:
            first = review.user.first_name or ""
            last_initial = f"{review.user.last_name[0]}." if review.user.last_name else ""
            data["user"] = {
                "id": review.user.id,
                "name": f"{first} {last_initial}".strip() or "Verified Buyer",
            }

    if review.order:
        data["order_number"] = review.order.order_number

    if include_admin_fields and review.product:
        data["product"] = {
            "id": review.product.id,
            "title": review.product.title,
            "slug": review.product.slug,
        }

    return data


def serialize_rating_summary(stats):
    return {
        "average_rating": stats.get("average_rating", 0.0),
        "review_count": stats.get("review_count", 0),
        "breakdown": stats.get("breakdown", {str(i): 0 for i in range(1, 6)}),
    }


def serialize_product_report(report):
    data = {
        "id": report.id,
        "reason": report.reason,
        "details": report.details,
        "status": report.status,
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "resolved_at": report.resolved_at.isoformat() if report.resolved_at else None,
    }

    if report.product:
        data["product"] = {
            "id": report.product.id,
            "title": report.product.title,
            "slug": report.product.slug,
        }

    if report.reporter:
        data["reporter"] = {
            "id": report.reporter.id,
            "name": f"{report.reporter.first_name} {report.reporter.last_name}".strip(),
            "email": report.reporter.email,
        }

    if report.resolved_by:
        data["resolved_by"] = {
            "id": report.resolved_by.id,
            "name": f"{report.resolved_by.first_name} {report.resolved_by.last_name}".strip(),
            "email": report.resolved_by.email,
        }

    return data

