from datetime import datetime

ALLOWED_RANGES = {"all", "today", "7d", "30d", "90d", "this_month", "custom"}
ALLOWED_EXPORT_TYPES = {"sales", "inventory", "orders"}


def parse_report_date(date_str):
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str.strip(), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def parse_report_filters(args):
    date_range = (args.get("range") or "all").strip().lower()
    start_str = (args.get("start_date") or "").strip()
    end_str = (args.get("end_date") or "").strip()

    errors = {}

    if date_range not in ALLOWED_RANGES:
        errors.setdefault("range", []).append(
            f"Range must be one of: {', '.join(sorted(ALLOWED_RANGES))}."
        )

    start_date = None
    if start_str:
        start_date = parse_report_date(start_str)
        if start_date is None:
            errors.setdefault("start_date", []).append("Start date must be in YYYY-MM-DD format.")

    end_date = None
    if end_str:
        end_date = parse_report_date(end_str)
        if end_date is None:
            errors.setdefault("end_date", []).append("End date must be in YYYY-MM-DD format.")

    if start_date and end_date and start_date > end_date:
        errors.setdefault("date_range", []).append("Start date cannot be after end date.")

    filters = {
        "range": date_range,
        "start_date": start_date,
        "end_date": end_date,
        "start_str": start_str,
        "end_str": end_str,
    }

    return filters, errors


def parse_export_filters(args):
    filters, errors = parse_report_filters(args)

    export_type = (args.get("type") or "sales").strip().lower()
    if export_type not in ALLOWED_EXPORT_TYPES:
        errors.setdefault("type", []).append(
            f"Export type must be one of: {', '.join(sorted(ALLOWED_EXPORT_TYPES))}."
        )

    filters["type"] = export_type
    return filters, errors

