from backend.app.models import ReportReason, ReportStatus, ReviewStatus

ALLOWED_REVIEW_STATUSES = {status.value for status in ReviewStatus}
ALLOWED_REPORT_STATUSES = {status.value for status in ReportStatus}
ALLOWED_REPORT_REASONS = {reason.value for reason in ReportReason}
ALLOWED_REVIEW_SORTS = {"recent", "oldest", "rating_desc", "rating_asc"}
ALLOWED_REPORT_SORTS = {"recent", "oldest"}


def validate_review_payload(data):
    if not isinstance(data, dict):
        return None, {"payload": ["A JSON object is required."]}

    errors = {}
    cleaned = {}

    rating = data.get("rating")
    if rating is None:
        errors.setdefault("rating", []).append("Rating is required.")
    else:
        try:
            rating_val = int(rating)
            if rating_val < 1 or rating_val > 5:
                errors.setdefault("rating", []).append("Rating must be between 1 and 5.")
            else:
                cleaned["rating"] = rating_val
        except (ValueError, TypeError):
            errors.setdefault("rating", []).append("Rating must be a whole number between 1 and 5.")

    title = data.get("title")
    if title is not None:
        title_str = str(title).strip()
        if len(title_str) > 140:
            errors.setdefault("title", []).append("Title cannot exceed 140 characters.")
        else:
            cleaned["title"] = title_str or None
    else:
        cleaned["title"] = None

    body = data.get("body")
    if body is not None:
        body_str = str(body).strip()
        if len(body_str) > 2000:
            errors.setdefault("body", []).append("Review body cannot exceed 2000 characters.")
        else:
            cleaned["body"] = body_str or None
    else:
        cleaned["body"] = None

    order_id = data.get("order_id")
    order_number = data.get("order_number")
    cleaned["order_id"] = int(order_id) if order_id and str(order_id).isdigit() else None
    cleaned["order_number"] = str(order_number).strip() if order_number else None

    return cleaned, errors


def validate_report_payload(data):
    if not isinstance(data, dict):
        return None, {"payload": ["A JSON object is required."]}

    errors = {}
    cleaned = {}

    reason = (data.get("reason") or "").strip()
    if not reason:
        errors.setdefault("reason", []).append("Report reason is required.")
    elif reason not in ALLOWED_REPORT_REASONS:
        errors.setdefault("reason", []).append(
            f"Report reason must be one of: {', '.join(sorted(ALLOWED_REPORT_REASONS))}."
        )
    else:
        cleaned["reason"] = reason

    details = data.get("details")
    if details is not None:
        details_str = str(details).strip()
        if len(details_str) > 2000:
            errors.setdefault("details", []).append("Details cannot exceed 2000 characters.")
        else:
            cleaned["details"] = details_str or None
    else:
        cleaned["details"] = None

    return cleaned, errors


def validate_review_status_payload(data):
    if not isinstance(data, dict):
        return None, {"payload": ["A JSON object is required."]}

    errors = {}
    status = (data.get("status") or "").strip()
    if not status:
        errors.setdefault("status", []).append("Status is required.")
    elif status not in ALLOWED_REVIEW_STATUSES:
        errors.setdefault("status", []).append(
            f"Status must be one of: {', '.join(sorted(ALLOWED_REVIEW_STATUSES))}."
        )

    return {"status": status}, errors


def validate_report_status_payload(data):
    if not isinstance(data, dict):
        return None, {"payload": ["A JSON object is required."]}

    errors = {}
    status = (data.get("status") or "").strip()
    if not status:
        errors.setdefault("status", []).append("Status is required.")
    elif status not in ALLOWED_REPORT_STATUSES:
        errors.setdefault("status", []).append(
            f"Status must be one of: {', '.join(sorted(ALLOWED_REPORT_STATUSES))}."
        )

    return {"status": status}, errors


def parse_review_filters(args):
    filters = {
        "status": (args.get("status") or "").strip(),
        "sort": (args.get("sort") or "recent").strip(),
    }
    errors = {}

    if filters["status"] and filters["status"] not in ALLOWED_REVIEW_STATUSES:
        errors.setdefault("status", []).append(
            f"Status must be one of: {', '.join(sorted(ALLOWED_REVIEW_STATUSES))}."
        )

    if filters["sort"] not in ALLOWED_REVIEW_SORTS:
        errors.setdefault("sort", []).append(
            f"Sort must be one of: {', '.join(sorted(ALLOWED_REVIEW_SORTS))}."
        )

    return filters, errors


def parse_report_filters(args):
    filters = {
        "status": (args.get("status") or "").strip(),
        "reason": (args.get("reason") or "").strip(),
        "sort": (args.get("sort") or "recent").strip(),
    }
    errors = {}

    if filters["status"] and filters["status"] not in ALLOWED_REPORT_STATUSES:
        errors.setdefault("status", []).append(
            f"Status must be one of: {', '.join(sorted(ALLOWED_REPORT_STATUSES))}."
        )

    if filters["reason"] and filters["reason"] not in ALLOWED_REPORT_REASONS:
        errors.setdefault("reason", []).append(
            f"Reason must be one of: {', '.join(sorted(ALLOWED_REPORT_REASONS))}."
        )

    if filters["sort"] not in ALLOWED_REPORT_SORTS:
        errors.setdefault("sort", []).append(
            f"Sort must be one of: {', '.join(sorted(ALLOWED_REPORT_SORTS))}."
        )

    return filters, errors

