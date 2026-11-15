from backend.app.marketplace.serializers import format_price


def _serialize_summary(summary):
    return {
        "gross_revenue": format_price(summary["gross_revenue_cents"]),
        "net_revenue": format_price(summary["net_revenue_cents"]),
        "refunded_amount": format_price(summary.get("refunded_cents", 0)),
        "ordered_merchandise": format_price(summary.get("ordered_merchandise_cents", 0)),
        "pending_collection": format_price(summary.get("pending_collection_cents", 0)),
        "previous_net_revenue": (
            format_price(summary["previous_net_revenue_cents"])
            if summary.get("previous_net_revenue_cents") is not None
            else None
        ),
        "previous_gross_revenue": (
            format_price(summary["previous_gross_revenue_cents"])
            if summary.get("previous_gross_revenue_cents") is not None
            else None
        ),
        "revenue_growth_pct": summary.get("revenue_growth_pct"),
        "revenue_growth_status": summary.get("revenue_growth_status", "no_baseline"),
        "total_orders": summary["total_orders"],
        "previous_total_orders": summary.get("previous_total_orders"),
        "orders_growth_pct": summary.get("orders_growth_pct"),
        "orders_growth_status": summary.get("orders_growth_status", "no_baseline"),
        "completed_orders": summary["completed_orders"],
        "pending_orders": summary.get("pending_orders", 0),
        "cancelled_orders": summary["cancelled_orders"],
        "cancellation_rate_pct": summary.get("cancellation_rate_pct", 0.0),
        "fulfillment_rate_pct": summary.get("fulfillment_rate_pct", 0.0),
        "paid_orders": summary["paid_orders"],
        "average_order_value": format_price(summary["average_order_value_cents"]),
        "previous_average_order_value": (
            format_price(summary["previous_average_order_value_cents"])
            if summary.get("previous_average_order_value_cents") is not None
            else None
        ),
        "aov_growth_pct": summary.get("aov_growth_pct"),
        "aov_growth_status": summary.get("aov_growth_status", "no_baseline"),
        "total_customers": summary["total_customers"],
        "new_customers": summary.get("new_customers", 0),
        "previous_new_customers": summary.get("previous_new_customers"),
        "customers_growth_pct": summary.get("customers_growth_pct"),
        "customers_growth_status": summary.get("customers_growth_status", "no_baseline"),
        "active_customers": summary["active_customers"],
        "returning_buyers": summary.get("returning_buyers", 0),
        "first_time_buyers": summary.get("first_time_buyers", 0),
        "returning_customer_rate_pct": summary.get("returning_customer_rate_pct", 0.0),
        "total_products": summary["total_products"],
        "available_products": summary["available_products"],
        "sold_products": summary["sold_products"],
        "draft_products": summary["draft_products"],
        "low_stock_products": summary["low_stock_products"],
        "out_of_stock_products": summary.get("out_of_stock_products", 0),
        "inventory_valuation": format_price(summary["inventory_valuation_cents"]),
    }


def _serialize_revenue_series(series):
    return [
        {
            "date": point["date"],
            "label": point["label"],
            "gross_revenue": format_price(point["gross_revenue_cents"]),
            "net_revenue": format_price(point["net_revenue_cents"]),
            "refunded_amount": format_price(point["refunded_cents"]),
            "orders_count": point["orders_count"],
            "paid_orders_count": point["paid_orders_count"],
        }
        for point in series
    ]


def _serialize_payment_analytics(methods):
    return [
        {
            "method": item["method"],
            "label": item["label"],
            "orders_count": item["orders_count"],
            "paid_count": item["paid_count"],
            "pending_count": item["pending_count"],
            "failed_count": item["failed_count"],
            "refunded_count": item["refunded_count"],
            "collected_amount": format_price(item["collected_amount_cents"]),
            "pending_amount": format_price(item["pending_amount_cents"]),
            "refunded_amount": format_price(item["refunded_amount_cents"]),
        }
        for item in methods
    ]


def _serialize_top_products(items):
    return [
        {
            "product_id": item["product_id"],
            "title": item["title"],
            "units_sold": item["units_sold"],
            "paid_units": item.get("paid_units", 0),
            "total_revenue": format_price(item["revenue_cents"]),
            "ordered_value": format_price(item.get("ordered_value_cents", item["revenue_cents"])),
            "collected_revenue": format_price(item.get("collected_revenue_cents", 0)),
        }
        for item in items
    ]


def _serialize_top_categories(items):
    return [
        {
            "category_id": item["category_id"],
            "name": item["name"],
            "units_sold": item["units_sold"],
            "paid_units": item.get("paid_units", 0),
            "total_revenue": format_price(item["revenue_cents"]),
            "ordered_value": format_price(item.get("ordered_value_cents", item["revenue_cents"])),
            "collected_revenue": format_price(item.get("collected_revenue_cents", 0)),
        }
        for item in items
    ]


def _serialize_low_stock_items(items):
    return [
        {
            "id": prod.id,
            "title": prod.title,
            "slug": prod.slug,
            "quantity": prod.quantity,
            "price": format_price(prod.price_cents),
            "condition": prod.condition,
            "category": prod.category.name if prod.category else "Uncategorized",
        }
        for prod in items
    ]


def serialize_dashboard_kpis(kpis):
    return {
        "summary": _serialize_summary(kpis["summary"]),
        "orders_by_status": kpis["orders_by_status"],
        "orders_by_payment_status": kpis["orders_by_payment_status"],
        "revenue_series": _serialize_revenue_series(kpis.get("revenue_series", [])),
        "series_granularity": kpis.get("series_granularity", "day"),
        "payment_analytics": _serialize_payment_analytics(kpis.get("payment_analytics", [])),
        "customer_analytics": kpis.get("customer_analytics", {}),
        "operational_insights": kpis.get("operational_insights", {}),
        "top_selling_products": _serialize_top_products(kpis.get("top_selling_products", [])),
        "top_categories": _serialize_top_categories(kpis.get("top_categories", [])),
        "recent_orders": kpis.get("recent_orders", []),
        "low_stock_items": _serialize_low_stock_items(kpis.get("low_stock_items", [])),
        "applied_range": kpis["applied_range"],
    }


def serialize_analytics_overview(data):
    return {
        "summary": _serialize_summary(data["summary"]),
        "operational_insights": data.get("operational_insights", {}),
        "applied_range": data["applied_range"],
    }


def serialize_revenue_analytics(data):
    return {
        "summary": _serialize_summary(data["summary"]),
        "revenue_series": _serialize_revenue_series(data.get("revenue_series", [])),
        "series_granularity": data.get("series_granularity", "day"),
        "applied_range": data["applied_range"],
    }


def serialize_orders_analytics(data):
    return {
        "summary": _serialize_summary(data["summary"]),
        "orders_by_status": data["orders_by_status"],
        "orders_by_payment_status": data["orders_by_payment_status"],
        "recent_orders": data.get("recent_orders", []),
        "applied_range": data["applied_range"],
    }


def serialize_products_analytics(data):
    return {
        "top_selling_products": _serialize_top_products(data.get("top_selling_products", [])),
        "top_categories": _serialize_top_categories(data.get("top_categories", [])),
        "low_stock_items": _serialize_low_stock_items(data.get("low_stock_items", [])),
        "applied_range": data["applied_range"],
    }


def serialize_customers_analytics(data):
    return {
        "customer_analytics": data.get("customer_analytics", {}),
        "applied_range": data["applied_range"],
    }


def serialize_payments_analytics(data):
    return {
        "payment_analytics": _serialize_payment_analytics(data.get("payment_analytics", [])),
        "orders_by_payment_status": data.get("orders_by_payment_status", {}),
        "applied_range": data["applied_range"],
    }


def serialize_sales_report(report):
    summary = report["summary"]
    return {
        "summary": {
            "gross_revenue": format_price(summary["gross_revenue_cents"]),
            "net_revenue": format_price(summary["net_revenue_cents"]),
            "total_orders": summary["total_orders"],
            "total_units_sold": summary["total_units_sold"],
            "refunded": format_price(summary["refunded_cents"]),
            "refunded_orders": summary.get("refunded_orders", 0),
            "cancelled_orders": summary.get("cancelled_orders", 0),
            "cancelled": format_price(summary.get("cancelled_cents", 0)),
        },
        "daily_sales": [
            {
                "date": row["date"],
                "orders_count": row["orders_count"],
                "units_sold": row["units_sold"],
                "revenue": format_price(row["revenue_cents"]),
            }
            for row in report.get("daily_sales", [])
        ],
        "orders": report.get("orders", []),
        "applied_range": report["applied_range"],
    }


def serialize_inventory_report(report):
    summary = report["summary"]
    return {
        "summary": {
            "total_skus": summary["total_skus"],
            "total_units_in_stock": summary["total_units_in_stock"],
            "total_valuation": format_price(summary["total_valuation_cents"]),
            "low_stock_count": summary["low_stock_count"],
            "out_of_stock_count": summary["out_of_stock_count"],
        },
        "condition_breakdown": summary.get("condition_breakdown", {}),
        "status_breakdown": summary.get("status_breakdown", {}),
        "category_breakdown": [
            {
                "category_id": cat["category_id"],
                "name": cat["name"],
                "sku_count": cat["sku_count"],
                "stock_units": cat["stock_units"],
                "valuation": format_price(cat["valuation_cents"]),
            }
            for cat in report.get("category_breakdown", [])
        ],
        "products": [
            {
                "id": prod["id"],
                "title": prod["title"],
                "slug": prod["slug"],
                "category": prod["category"],
                "condition": prod["condition"],
                "status": prod["status"],
                "quantity": prod["quantity"],
                "price": format_price(prod["price_cents"]),
                "valuation": format_price(prod["valuation_cents"]),
            }
            for prod in report.get("products", [])
        ],
    }
