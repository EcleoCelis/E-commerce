from datetime import datetime, timezone
from flask import Blueprint, Response, request

from backend.app.auth.decorators import roles_required
from backend.app.auth.rbac import Role
from backend.app.core.responses import error_response, success_response
from backend.app.reports.serializers import (
    serialize_analytics_overview,
    serialize_customers_analytics,
    serialize_dashboard_kpis,
    serialize_inventory_report,
    serialize_orders_analytics,
    serialize_payments_analytics,
    serialize_products_analytics,
    serialize_revenue_analytics,
    serialize_sales_report,
)
from backend.app.reports.service import (
    generate_csv_export,
    get_analytics_overview,
    get_customers_analytics,
    get_dashboard_kpis,
    get_inventory_report,
    get_orders_analytics,
    get_payments_analytics,
    get_products_analytics,
    get_revenue_analytics,
    get_sales_report,
)
from backend.app.reports.validation import parse_export_filters, parse_report_filters

admin_reports_bp = Blueprint("admin_reports", __name__, url_prefix="/admin/reports")
admin_analytics_bp = Blueprint("admin_analytics", __name__, url_prefix="/admin/analytics")


def _run_filtered_report(fetcher, serializer, message):
    filters, errors = parse_report_filters(request.args)
    if errors:
        return error_response(
            message="Invalid filter parameters.",
            status_code=422,
            details=errors,
            code="validation_error",
        )

    data = fetcher(filters)
    payload = serializer(data)
    return success_response(data=payload, message=message)


@admin_reports_bp.get("")
@admin_reports_bp.get("/dashboard")
@roles_required(Role.ADMIN.value)
def get_dashboard_metrics():
    return _run_filtered_report(
        get_dashboard_kpis,
        serialize_dashboard_kpis,
        "Dashboard metrics retrieved successfully.",
    )


@admin_reports_bp.get("/sales")
@roles_required(Role.ADMIN.value)
def get_sales_analytics():
    filters, errors = parse_report_filters(request.args)
    if errors:
        return error_response(
            message="Invalid filter parameters.",
            status_code=422,
            details=errors,
            code="validation_error",
        )

    sales = get_sales_report(filters)
    payload = serialize_sales_report(sales)
    return success_response(data=payload, message="Sales report retrieved successfully.")


@admin_reports_bp.get("/inventory")
@roles_required(Role.ADMIN.value)
def get_inventory_analytics():
    filters, errors = parse_report_filters(request.args)
    if errors:
        return error_response(
            message="Invalid filter parameters.",
            status_code=422,
            details=errors,
            code="validation_error",
        )

    inventory = get_inventory_report(filters)
    payload = serialize_inventory_report(inventory)
    return success_response(data=payload, message="Inventory report retrieved successfully.")


@admin_reports_bp.get("/export")
@roles_required(Role.ADMIN.value)
def export_reports_csv():
    filters, errors = parse_export_filters(request.args)
    if errors:
        return error_response(
            message="Invalid export parameters.",
            status_code=422,
            details=errors,
            code="validation_error",
        )

    export_type = filters["type"]
    csv_content = generate_csv_export(export_type, filters)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"secondmarket_{export_type}_report_{timestamp}.csv"

    return Response(
        csv_content,
        mimetype="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@admin_analytics_bp.get("/overview")
@roles_required(Role.ADMIN.value)
def get_analytics_overview_endpoint():
    return _run_filtered_report(
        get_analytics_overview,
        serialize_analytics_overview,
        "Analytics overview retrieved successfully.",
    )


@admin_analytics_bp.get("/revenue")
@roles_required(Role.ADMIN.value)
def get_revenue_analytics_endpoint():
    return _run_filtered_report(
        get_revenue_analytics,
        serialize_revenue_analytics,
        "Revenue analytics retrieved successfully.",
    )


@admin_analytics_bp.get("/orders")
@roles_required(Role.ADMIN.value)
def get_orders_analytics_endpoint():
    return _run_filtered_report(
        get_orders_analytics,
        serialize_orders_analytics,
        "Order analytics retrieved successfully.",
    )


@admin_analytics_bp.get("/products")
@roles_required(Role.ADMIN.value)
def get_products_analytics_endpoint():
    return _run_filtered_report(
        get_products_analytics,
        serialize_products_analytics,
        "Product analytics retrieved successfully.",
    )


@admin_analytics_bp.get("/customers")
@roles_required(Role.ADMIN.value)
def get_customers_analytics_endpoint():
    return _run_filtered_report(
        get_customers_analytics,
        serialize_customers_analytics,
        "Customer analytics retrieved successfully.",
    )


@admin_analytics_bp.get("/payments")
@roles_required(Role.ADMIN.value)
def get_payments_analytics_endpoint():
    return _run_filtered_report(
        get_payments_analytics,
        serialize_payments_analytics,
        "Payment analytics retrieved successfully.",
    )

