import csv
import io
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy import case, func, or_
from sqlalchemy.orm import selectinload

from backend.app.auth.rbac import Role
from backend.app.extensions import db
from backend.app.models import (
    Category,
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    PaymentStatus,
    Product,
    ProductCondition,
    ProductReport,
    ProductStatus,
    ReportStatus,
    ReturnRequest,
    ReturnStatus,
    SupportTicket,
    SupportTicketStatus,
    User,
)
from backend.app.orders.serializers import serialize_order_summary

PAYMENT_METHOD_LABELS = {
    "cash_on_delivery": "Cash on Delivery",
    "gcash": "GCash",
    "maya": "Maya",
    "credit_card": "Card Payment",
    "bank_transfer": "Bank Transfer",
    "unrecorded": "Unrecorded",
}


def compute_date_bounds(filters):
    date_range = filters.get("range", "all")
    now = datetime.now(timezone.utc)
    start_dt = None
    end_dt = now

    if date_range == "today":
        today_date = now.date()
        start_dt = datetime.combine(today_date, time.min, tzinfo=timezone.utc)
    elif date_range == "7d":
        start_dt = now - timedelta(days=7)
    elif date_range == "30d":
        start_dt = now - timedelta(days=30)
    elif date_range == "90d":
        start_dt = now - timedelta(days=90)
    elif date_range == "this_month":
        start_dt = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    elif date_range == "custom":
        if filters.get("start_date"):
            start_dt = datetime.combine(filters["start_date"], time.min, tzinfo=timezone.utc)
        if filters.get("end_date"):
            end_dt = datetime.combine(filters["end_date"], time.max, tzinfo=timezone.utc)

    return start_dt, end_dt


def compute_previous_bounds(filters, start_dt, end_dt):
    """Return an equal-duration preceding UTC window when period-over-period comparison is valid."""
    date_range = filters.get("range", "all")
    if date_range == "all" or not start_dt or not end_dt:
        return None, None
    span = end_dt - start_dt
    if span.total_seconds() <= 0:
        return None, None
    prev_end_dt = start_dt - timedelta(microseconds=1)
    prev_start_dt = prev_end_dt - span
    return prev_start_dt, prev_end_dt


def apply_order_date_filters(query, start_dt, end_dt):
    if start_dt:
        query = query.filter(func.coalesce(Order.placed_at, Order.created_at) >= start_dt)
    if end_dt:
        query = query.filter(func.coalesce(Order.placed_at, Order.created_at) <= end_dt)
    return query


def _to_utc(dt):
    if not dt:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _round_pct(numerator, denominator):
    if not denominator:
        return 0.0
    pct = (Decimal(numerator) / Decimal(denominator)) * Decimal("100")
    return float(pct.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def _compute_growth(current_value, previous_value):
    if previous_value is None:
        return None, "no_baseline"
    if previous_value == 0:
        if current_value == 0:
            return 0.0, "flat"
        return None, "new_baseline"
    delta = ((Decimal(current_value) - Decimal(previous_value)) / Decimal(previous_value)) * Decimal("100")
    rounded = float(delta.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
    if rounded > 0:
        status = "up"
    elif rounded < 0:
        status = "down"
    else:
        status = "flat"
    return rounded, status


def _compute_financial_totals(orders):
    total_orders = len(orders)
    completed_orders = sum(1 for o in orders if o.status == OrderStatus.DELIVERED.value)
    cancelled_orders = sum(1 for o in orders if o.status == OrderStatus.CANCELLED.value)
    pending_orders = sum(
        1
        for o in orders
        if o.status in {OrderStatus.PENDING.value, OrderStatus.CONFIRMED.value, OrderStatus.PROCESSING.value}
    )
    paid_orders_list = [
        o for o in orders if o.payment_status == PaymentStatus.PAID.value and o.status != OrderStatus.CANCELLED.value
    ]
    paid_orders = len(paid_orders_list)
    gross_revenue_cents = int(sum(Decimal(o.total_cents or 0) for o in paid_orders_list))
    refunded_cents = int(sum(Decimal(o.total_cents or 0) for o in orders if o.payment_status == PaymentStatus.REFUNDED.value))
    net_revenue_cents = max(0, gross_revenue_cents - refunded_cents)
    ordered_merchandise_cents = int(
        sum(Decimal(o.total_cents or 0) for o in orders if o.status != OrderStatus.CANCELLED.value)
    )
    pending_collection_cents = int(
        sum(
            Decimal(o.total_cents or 0)
            for o in orders
            if o.status != OrderStatus.CANCELLED.value and o.payment_status == PaymentStatus.PENDING.value
        )
    )
    aov_cents = int(round(Decimal(gross_revenue_cents) / Decimal(paid_orders))) if paid_orders > 0 else 0
    return {
        "total_orders": total_orders,
        "completed_orders": completed_orders,
        "cancelled_orders": cancelled_orders,
        "pending_orders": pending_orders,
        "paid_orders": paid_orders,
        "gross_revenue_cents": gross_revenue_cents,
        "refunded_cents": refunded_cents,
        "net_revenue_cents": net_revenue_cents,
        "ordered_merchandise_cents": ordered_merchandise_cents,
        "pending_collection_cents": pending_collection_cents,
        "average_order_value_cents": aov_cents,
    }


def _build_time_buckets(start_dt, end_dt, timestamps):
    if not timestamps and not start_dt:
        return [], "day"

    anchor_start = _to_utc(start_dt).date() if start_dt else min(_to_utc(ts).date() for ts in timestamps)
    anchor_end = _to_utc(end_dt).date() if end_dt else max(_to_utc(ts).date() for ts in timestamps)
    if timestamps:
        max_ts_date = max(_to_utc(ts).date() for ts in timestamps)
        if max_ts_date > anchor_end:
            anchor_end = max_ts_date
    if anchor_end < anchor_start:
        anchor_start = anchor_end

    span_days = (anchor_end - anchor_start).days + 1
    granularity = "week" if span_days > 90 else "day"

    buckets = []
    if granularity == "day":
        cursor = anchor_start
        while cursor <= anchor_end:
            buckets.append(
                {
                    "date": cursor.isoformat(),
                    "label": cursor.strftime("%b %d"),
                }
            )
            cursor += timedelta(days=1)
    else:
        cursor = anchor_start - timedelta(days=anchor_start.weekday())
        end_week = anchor_end - timedelta(days=anchor_end.weekday())
        while cursor <= end_week:
            buckets.append(
                {
                    "date": cursor.isoformat(),
                    "label": f"Wk {cursor.strftime('%b %d')}",
                }
            )
            cursor += timedelta(days=7)

    return buckets, granularity


def _bucket_key(dt, granularity):
    utc_date = _to_utc(dt).date()
    if granularity == "week":
        utc_date = utc_date - timedelta(days=utc_date.weekday())
    return utc_date.isoformat()


def _build_revenue_series(orders, start_dt, end_dt):
    order_timestamps = [o.placed_at or o.created_at for o in orders if (o.placed_at or o.created_at)]
    buckets, granularity = _build_time_buckets(start_dt, end_dt, order_timestamps)
    series_map = {
        b["date"]: {
            "date": b["date"],
            "label": b["label"],
            "gross_revenue_cents": 0,
            "net_revenue_cents": 0,
            "refunded_cents": 0,
            "orders_count": 0,
            "paid_orders_count": 0,
        }
        for b in buckets
    }

    for order in orders:
        ts = order.placed_at or order.created_at
        if not ts:
            continue
        key = _bucket_key(ts, granularity)
        if key not in series_map:
            continue
        entry = series_map[key]
        entry["orders_count"] += 1
        if order.payment_status == PaymentStatus.PAID.value and order.status != OrderStatus.CANCELLED.value:
            entry["paid_orders_count"] += 1
            entry["gross_revenue_cents"] += int(order.total_cents or 0)
        elif order.payment_status == PaymentStatus.REFUNDED.value:
            entry["refunded_cents"] += int(order.total_cents or 0)

    for entry in series_map.values():
        entry["net_revenue_cents"] = max(0, entry["gross_revenue_cents"] - entry["refunded_cents"])

    return list(series_map.values()), granularity


def _build_payment_analytics(orders):
    methods = {}

    def _ensure_method(code):
        key = code or "unrecorded"
        if key not in methods:
            methods[key] = {
                "method": key,
                "label": PAYMENT_METHOD_LABELS.get(key, key.replace("_", " ").title()),
                "orders_count": 0,
                "paid_count": 0,
                "pending_count": 0,
                "failed_count": 0,
                "refunded_count": 0,
                "collected_amount_cents": 0,
                "pending_amount_cents": 0,
                "refunded_amount_cents": 0,
                "_order_ids": set(),
            }
        return methods[key]

    for order in orders:
        payments = list(order.payments) if order.payments else []
        if not payments:
            bucket = _ensure_method("unrecorded")
            bucket["_order_ids"].add(order.id)
            if order.payment_status == PaymentStatus.PAID.value and order.status != OrderStatus.CANCELLED.value:
                bucket["paid_count"] += 1
                bucket["collected_amount_cents"] += int(order.total_cents or 0)
            elif order.payment_status == PaymentStatus.REFUNDED.value:
                bucket["refunded_count"] += 1
                bucket["refunded_amount_cents"] += int(order.total_cents or 0)
            elif order.payment_status == PaymentStatus.FAILED.value:
                bucket["failed_count"] += 1
            elif order.status != OrderStatus.CANCELLED.value:
                bucket["pending_count"] += 1
                bucket["pending_amount_cents"] += int(order.total_cents or 0)
            continue

        for payment in payments:
            bucket = _ensure_method(payment.method)
            bucket["_order_ids"].add(order.id)
            amount = int(payment.amount_cents if payment.amount_cents is not None else (order.total_cents or 0))
            if payment.status == PaymentStatus.PAID.value and order.status != OrderStatus.CANCELLED.value:
                bucket["paid_count"] += 1
                bucket["collected_amount_cents"] += amount
            elif payment.status == PaymentStatus.REFUNDED.value or order.payment_status == PaymentStatus.REFUNDED.value:
                bucket["refunded_count"] += 1
                bucket["refunded_amount_cents"] += amount
            elif payment.status == PaymentStatus.FAILED.value:
                bucket["failed_count"] += 1
            elif order.status != OrderStatus.CANCELLED.value:
                bucket["pending_count"] += 1
                bucket["pending_amount_cents"] += amount

    result = []
    for item in methods.values():
        item["orders_count"] = len(item.pop("_order_ids"))
        result.append(item)

    result.sort(key=lambda m: (m["collected_amount_cents"], m["orders_count"]), reverse=True)
    return result


def get_dashboard_kpis(filters=None):
    filters = filters or {}
    start_dt, end_dt = compute_date_bounds(filters)
    prev_start_dt, prev_end_dt = compute_previous_bounds(filters, start_dt, end_dt)

    orders_q = apply_order_date_filters(
        Order.query.options(selectinload(Order.payments), selectinload(Order.items)),
        start_dt,
        end_dt,
    )
    all_orders = orders_q.all()

    totals = _compute_financial_totals(all_orders)
    total_orders = totals["total_orders"]
    completed_orders = totals["completed_orders"]
    cancelled_orders = totals["cancelled_orders"]
    pending_orders = totals["pending_orders"]
    paid_orders = totals["paid_orders"]
    gross_revenue_cents = totals["gross_revenue_cents"]
    refunded_cents = totals["refunded_cents"]
    net_revenue_cents = totals["net_revenue_cents"]
    aov_cents = totals["average_order_value_cents"]

    prev_net_revenue_cents = None
    prev_gross_revenue_cents = None
    prev_total_orders = None
    prev_aov_cents = None
    if prev_start_dt and prev_end_dt:
        prev_orders = apply_order_date_filters(Order.query, prev_start_dt, prev_end_dt).all()
        prev_totals = _compute_financial_totals(prev_orders)
        prev_net_revenue_cents = prev_totals["net_revenue_cents"]
        prev_gross_revenue_cents = prev_totals["gross_revenue_cents"]
        prev_total_orders = prev_totals["total_orders"]
        prev_aov_cents = prev_totals["average_order_value_cents"]

    revenue_growth_pct, revenue_growth_status = _compute_growth(net_revenue_cents, prev_net_revenue_cents)
    orders_growth_pct, orders_growth_status = _compute_growth(total_orders, prev_total_orders)
    aov_growth_pct, aov_growth_status = _compute_growth(aov_cents, prev_aov_cents)

    orders_by_status = {status.value: 0 for status in OrderStatus}
    for o in all_orders:
        if o.status in orders_by_status:
            orders_by_status[o.status] += 1

    orders_by_payment_status = {status.value: 0 for status in PaymentStatus}
    for o in all_orders:
        if o.payment_status in orders_by_payment_status:
            orders_by_payment_status[o.payment_status] += 1

    buyer_query = User.query.filter(User.role == Role.BUYER.value)
    all_buyers = buyer_query.all()
    total_customers = len(all_buyers)

    new_buyers_list = [
        u
        for u in all_buyers
        if u.created_at
        and (not start_dt or _to_utc(u.created_at) >= start_dt)
        and (not end_dt or _to_utc(u.created_at) <= end_dt)
    ]
    new_customers = len(new_buyers_list)
    prev_new_customers = None
    if prev_start_dt and prev_end_dt:
        prev_new_customers = sum(
            1
            for u in all_buyers
            if u.created_at and prev_start_dt <= _to_utc(u.created_at) <= prev_end_dt
        )
    customers_growth_pct, customers_growth_status = _compute_growth(new_customers, prev_new_customers)

    active_customer_ids = {o.user_id for o in all_orders if o.status != OrderStatus.CANCELLED.value}
    active_customers = len(active_customer_ids)

    returning_buyers = 0
    first_time_buyers = 0
    if active_customer_ids:
        lifetime_counts_q = db.session.query(Order.user_id, func.count(Order.id)).filter(
            Order.user_id.in_(active_customer_ids),
            Order.status != OrderStatus.CANCELLED.value,
        )
        if end_dt:
            lifetime_counts_q = lifetime_counts_q.filter(func.coalesce(Order.placed_at, Order.created_at) <= end_dt)
        lifetime_map = dict(lifetime_counts_q.group_by(Order.user_id).all())
        for buyer_id in active_customer_ids:
            if lifetime_map.get(buyer_id, 0) > 1:
                returning_buyers += 1
            else:
                first_time_buyers += 1

    all_products = Product.query.options(selectinload(Product.category)).all()
    total_products = len(all_products)
    available_products = sum(1 for p in all_products if p.status == ProductStatus.AVAILABLE.value and p.quantity > 0)
    sold_products = sum(1 for p in all_products if p.status == ProductStatus.SOLD.value or p.quantity == 0)
    draft_products = sum(1 for p in all_products if p.status == ProductStatus.DRAFT.value)
    low_stock_products = sum(1 for p in all_products if p.status == ProductStatus.AVAILABLE.value and p.quantity <= 1)
    out_of_stock_products = sum(1 for p in all_products if p.status == ProductStatus.AVAILABLE.value and p.quantity == 0)
    inventory_valuation_cents = sum(
        p.price_cents * p.quantity for p in all_products if p.status == ProductStatus.AVAILABLE.value and p.quantity > 0
    )

    low_stock_items = [
        p for p in all_products if p.status == ProductStatus.AVAILABLE.value and p.quantity <= 1
    ][:10]

    # Top selling products (filtered by period, excluding cancelled orders)
    paid_units_expr = func.sum(
        case((Order.payment_status == PaymentStatus.PAID.value, OrderItem.quantity), else_=0)
    )
    paid_revenue_expr = func.sum(
        case(
            (Order.payment_status == PaymentStatus.PAID.value, OrderItem.quantity * OrderItem.unit_price_cents),
            else_=0,
        )
    )
    item_rows = (
        db.session.query(
            OrderItem.product_id,
            OrderItem.product_title,
            func.sum(OrderItem.quantity).label("units_sold"),
            func.sum(OrderItem.quantity * OrderItem.unit_price_cents).label("revenue_cents"),
            paid_units_expr.label("paid_units"),
            paid_revenue_expr.label("collected_revenue_cents"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.status != OrderStatus.CANCELLED.value)
    )
    item_rows = apply_order_date_filters(item_rows, start_dt, end_dt)

    top_items = (
        item_rows.group_by(OrderItem.product_id, OrderItem.product_title)
        .order_by(func.sum(OrderItem.quantity * OrderItem.unit_price_cents).desc(), func.sum(OrderItem.quantity).desc())
        .limit(5)
        .all()
    )

    top_selling_products = [
        {
            "product_id": row[0],
            "title": row[1],
            "units_sold": int(row[2] or 0),
            "revenue_cents": int(row[3] or 0),
            "ordered_value_cents": int(row[3] or 0),
            "paid_units": int(row[4] or 0),
            "collected_revenue_cents": int(row[5] or 0),
        }
        for row in top_items
    ]

    # Top categories (filtered by period, excluding cancelled orders)
    category_rows = (
        db.session.query(
            Category.id,
            Category.name,
            func.sum(OrderItem.quantity).label("units_sold"),
            func.sum(OrderItem.quantity * OrderItem.unit_price_cents).label("revenue_cents"),
            paid_units_expr.label("paid_units"),
            paid_revenue_expr.label("collected_revenue_cents"),
        )
        .join(Product, Product.category_id == Category.id)
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.status != OrderStatus.CANCELLED.value)
    )
    category_rows = apply_order_date_filters(category_rows, start_dt, end_dt)

    category_map = {}
    for item in (
        category_rows.group_by(Category.id, Category.name)
        .order_by(func.sum(OrderItem.quantity * OrderItem.unit_price_cents).desc(), func.sum(OrderItem.quantity).desc())
        .limit(5)
        .all()
    ):
        category_map[item[0]] = {
            "category_id": item[0],
            "name": item[1],
            "units_sold": int(item[2] or 0),
            "revenue_cents": int(item[3] or 0),
            "ordered_value_cents": int(item[3] or 0),
            "paid_units": int(item[4] or 0),
            "collected_revenue_cents": int(item[5] or 0),
        }

    recent_orders_raw = (
        apply_order_date_filters(Order.query, start_dt, end_dt)
        .options(selectinload(Order.user), selectinload(Order.items))
        .order_by(Order.created_at.desc())
        .limit(10)
        .all()
    )
    recent_orders = [serialize_order_summary(o, include_buyer=True) for o in recent_orders_raw]

    revenue_series, series_granularity = _build_revenue_series(all_orders, start_dt, end_dt)
    payment_analytics = _build_payment_analytics(all_orders)

    reg_buckets, reg_granularity = _build_time_buckets(
        start_dt,
        end_dt,
        [u.created_at for u in new_buyers_list if u.created_at],
    )
    reg_series_map = {
        b["date"]: {"date": b["date"], "label": b["label"], "new_customers": 0}
        for b in reg_buckets
    }
    for u in new_buyers_list:
        if not u.created_at:
            continue
        key = _bucket_key(u.created_at, reg_granularity)
        if key in reg_series_map:
            reg_series_map[key]["new_customers"] += 1

    open_returns = ReturnRequest.query.filter(
        ReturnRequest.status.in_([ReturnStatus.REQUESTED.value, ReturnStatus.APPROVED.value])
    ).count()
    open_tickets = SupportTicket.query.filter(
        SupportTicket.status.in_([SupportTicketStatus.OPEN.value, SupportTicketStatus.IN_PROGRESS.value])
    ).count()
    open_reports = ProductReport.query.filter(
        ProductReport.status.in_([ReportStatus.OPEN.value, ReportStatus.REVIEWING.value])
    ).count()
    failed_payments = sum(m["failed_count"] for m in payment_analytics)

    return {
        "summary": {
            "gross_revenue_cents": gross_revenue_cents,
            "net_revenue_cents": net_revenue_cents,
            "refunded_cents": refunded_cents,
            "ordered_merchandise_cents": totals["ordered_merchandise_cents"],
            "pending_collection_cents": totals["pending_collection_cents"],
            "previous_net_revenue_cents": prev_net_revenue_cents,
            "previous_gross_revenue_cents": prev_gross_revenue_cents,
            "revenue_growth_pct": revenue_growth_pct,
            "revenue_growth_status": revenue_growth_status,
            "total_orders": total_orders,
            "previous_total_orders": prev_total_orders,
            "orders_growth_pct": orders_growth_pct,
            "orders_growth_status": orders_growth_status,
            "completed_orders": completed_orders,
            "pending_orders": pending_orders,
            "cancelled_orders": cancelled_orders,
            "cancellation_rate_pct": _round_pct(cancelled_orders, total_orders),
            "fulfillment_rate_pct": _round_pct(completed_orders, total_orders),
            "paid_orders": paid_orders,
            "average_order_value_cents": aov_cents,
            "previous_average_order_value_cents": prev_aov_cents,
            "aov_growth_pct": aov_growth_pct,
            "aov_growth_status": aov_growth_status,
            "total_customers": total_customers,
            "new_customers": new_customers,
            "previous_new_customers": prev_new_customers,
            "customers_growth_pct": customers_growth_pct,
            "customers_growth_status": customers_growth_status,
            "active_customers": active_customers,
            "returning_buyers": returning_buyers,
            "first_time_buyers": first_time_buyers,
            "returning_customer_rate_pct": _round_pct(returning_buyers, active_customers),
            "total_products": total_products,
            "available_products": available_products,
            "sold_products": sold_products,
            "draft_products": draft_products,
            "low_stock_products": low_stock_products,
            "out_of_stock_products": out_of_stock_products,
            "inventory_valuation_cents": inventory_valuation_cents,
        },
        "orders_by_status": orders_by_status,
        "orders_by_payment_status": orders_by_payment_status,
        "revenue_series": revenue_series,
        "series_granularity": series_granularity,
        "payment_analytics": payment_analytics,
        "customer_analytics": {
            "total_customers": total_customers,
            "new_customers": new_customers,
            "active_purchasers": active_customers,
            "first_time_buyers": first_time_buyers,
            "returning_buyers": returning_buyers,
            "returning_customer_rate_pct": _round_pct(returning_buyers, active_customers),
            "registration_series": list(reg_series_map.values()),
        },
        "operational_insights": {
            "unfulfilled_orders": pending_orders,
            "failed_payments": failed_payments,
            "low_stock_products": low_stock_products,
            "out_of_stock_products": out_of_stock_products,
            "open_returns": open_returns,
            "open_tickets": open_tickets,
            "open_reports": open_reports,
        },
        "top_selling_products": top_selling_products,
        "top_categories": list(category_map.values()),
        "recent_orders": recent_orders,
        "low_stock_items": low_stock_items,
        "applied_range": {
            "range": filters.get("range", "all"),
            "start": start_dt.isoformat() if start_dt else None,
            "end": end_dt.isoformat() if end_dt else None,
            "previous_start": prev_start_dt.isoformat() if prev_start_dt else None,
            "previous_end": prev_end_dt.isoformat() if prev_end_dt else None,
        },
    }


def get_analytics_overview(filters=None):
    data = get_dashboard_kpis(filters)
    return {
        "summary": data["summary"],
        "operational_insights": data["operational_insights"],
        "applied_range": data["applied_range"],
    }


def get_revenue_analytics(filters=None):
    data = get_dashboard_kpis(filters)
    return {
        "summary": data["summary"],
        "revenue_series": data["revenue_series"],
        "series_granularity": data["series_granularity"],
        "applied_range": data["applied_range"],
    }


def get_orders_analytics(filters=None):
    data = get_dashboard_kpis(filters)
    return {
        "summary": data["summary"],
        "orders_by_status": data["orders_by_status"],
        "orders_by_payment_status": data["orders_by_payment_status"],
        "recent_orders": data["recent_orders"],
        "applied_range": data["applied_range"],
    }


def get_products_analytics(filters=None):
    data = get_dashboard_kpis(filters)
    return {
        "top_selling_products": data["top_selling_products"],
        "top_categories": data["top_categories"],
        "low_stock_items": data["low_stock_items"],
        "applied_range": data["applied_range"],
    }


def get_customers_analytics(filters=None):
    data = get_dashboard_kpis(filters)
    return {
        "customer_analytics": data["customer_analytics"],
        "applied_range": data["applied_range"],
    }


def get_payments_analytics(filters=None):
    data = get_dashboard_kpis(filters)
    return {
        "payment_analytics": data["payment_analytics"],
        "orders_by_payment_status": data["orders_by_payment_status"],
        "applied_range": data["applied_range"],
    }



def get_sales_report(filters=None):
    filters = filters or {}
    start_dt, end_dt = compute_date_bounds(filters)

    orders_q = (
        apply_order_date_filters(Order.query, start_dt, end_dt)
        .options(selectinload(Order.user), selectinload(Order.items))
        .order_by(Order.created_at.desc())
    )
    orders = orders_q.all()

    total_orders = len(orders)
    paid_orders = [o for o in orders if o.payment_status == PaymentStatus.PAID.value and o.status != OrderStatus.CANCELLED.value]
    refunded_orders = [o for o in orders if o.payment_status == PaymentStatus.REFUNDED.value]
    cancelled_orders = [o for o in orders if o.status == OrderStatus.CANCELLED.value]
    gross_revenue_cents = sum(o.total_cents for o in paid_orders)
    refunded_cents = sum(o.total_cents for o in refunded_orders)
    cancelled_cents = sum(o.total_cents for o in cancelled_orders)
    net_revenue_cents = max(0, gross_revenue_cents - refunded_cents)
    total_units_sold = sum(
        sum(item.quantity for item in o.items)
        for o in paid_orders
    )

    daily_dict = {}
    for o in paid_orders:
        date_key = (o.placed_at or o.created_at).date().isoformat()
        if date_key not in daily_dict:
            daily_dict[date_key] = {"date": date_key, "orders_count": 0, "units_sold": 0, "revenue_cents": 0}
        daily_dict[date_key]["orders_count"] += 1
        daily_dict[date_key]["units_sold"] += sum(i.quantity for i in o.items)
        daily_dict[date_key]["revenue_cents"] += o.total_cents

    daily_sales = sorted(daily_dict.values(), key=lambda r: r["date"], reverse=True)

    return {
        "summary": {
            "gross_revenue_cents": gross_revenue_cents,
            "net_revenue_cents": net_revenue_cents,
            "total_orders": total_orders,
            "total_units_sold": total_units_sold,
            "refunded_cents": refunded_cents,
            "refunded_orders": len(refunded_orders),
            "cancelled_orders": len(cancelled_orders),
            "cancelled_cents": cancelled_cents,
        },
        "daily_sales": daily_sales,
        "orders": [serialize_order_summary(o, include_buyer=True) for o in orders],
        "applied_range": {
            "range": filters.get("range", "all"),
            "start": start_dt.isoformat() if start_dt else None,
            "end": end_dt.isoformat() if end_dt else None,
        },
    }


def get_inventory_report(filters=None):
    products = Product.query.options(selectinload(Product.category)).order_by(Product.title.asc()).all()

    total_skus = len(products)
    total_units = sum(p.quantity for p in products)
    total_valuation = sum(p.price_cents * p.quantity for p in products if p.status == ProductStatus.AVAILABLE.value)
    low_stock = sum(1 for p in products if p.status == ProductStatus.AVAILABLE.value and p.quantity <= 1)
    out_of_stock = sum(1 for p in products if p.quantity == 0 or p.status == ProductStatus.SOLD.value)

    condition_breakdown = {cond.value: 0 for cond in ProductCondition}
    for p in products:
        if p.condition in condition_breakdown:
            condition_breakdown[p.condition] += 1

    status_breakdown = {st.value: 0 for st in ProductStatus}
    for p in products:
        if p.status in status_breakdown:
            status_breakdown[p.status] += 1

    cat_dict = {}
    for p in products:
        cid = p.category_id or 0
        cname = p.category.name if p.category else "Uncategorized"
        if cid not in cat_dict:
            cat_dict[cid] = {"category_id": cid, "name": cname, "sku_count": 0, "stock_units": 0, "valuation_cents": 0}
        cat_dict[cid]["sku_count"] += 1
        cat_dict[cid]["stock_units"] += p.quantity
        if p.status == ProductStatus.AVAILABLE.value:
            cat_dict[cid]["valuation_cents"] += p.price_cents * p.quantity

    return {
        "summary": {
            "total_skus": total_skus,
            "total_units_in_stock": total_units,
            "total_valuation_cents": total_valuation,
            "low_stock_count": low_stock,
            "out_of_stock_count": out_of_stock,
            "condition_breakdown": condition_breakdown,
            "status_breakdown": status_breakdown,
        },
        "category_breakdown": list(cat_dict.values()),
        "products": [
            {
                "id": p.id,
                "title": p.title,
                "slug": p.slug,
                "category": p.category.name if p.category else "Uncategorized",
                "condition": p.condition,
                "status": p.status,
                "quantity": p.quantity,
                "price_cents": p.price_cents,
                "valuation_cents": p.price_cents * p.quantity,
            }
            for p in products
        ],
    }


def generate_csv_export(export_type, filters=None):
    output = io.StringIO()
    writer = csv.writer(output)

    if export_type == "sales":
        report = get_sales_report(filters)
        writer.writerow([
            "Order Number",
            "Placed Date",
            "Buyer Name",
            "Buyer Email",
            "Item Count",
            "Subtotal (PHP)",
            "Shipping (PHP)",
            "Total (PHP)",
            "Order Status",
            "Payment Status",
        ])
        for order in report["orders"]:
            buyer = order.get("buyer") or {}
            writer.writerow([
                order["order_number"],
                order["placed_at"] or order["created_at"] or "",
                buyer.get("name", "Guest"),
                buyer.get("email", ""),
                order.get("item_count", 0),
                order["subtotal"]["amount"],
                order["shipping"]["amount"],
                order["total"]["amount"],
                order["status"],
                order["payment_status"],
            ])

    elif export_type == "inventory":
        report = get_inventory_report(filters)
        writer.writerow([
            "Product ID",
            "Title",
            "Slug",
            "Category",
            "Condition",
            "Status",
            "Price (PHP)",
            "Quantity In Stock",
            "Valuation (PHP)",
        ])
        for prod in report["products"]:
            writer.writerow([
                prod["id"],
                prod["title"],
                prod["slug"],
                prod["category"],
                prod["condition"],
                prod["status"],
                round(prod["price_cents"] / 100, 2),
                prod["quantity"],
                round(prod["valuation_cents"] / 100, 2),
            ])

    elif export_type == "orders":
        orders = Order.query.options(
            selectinload(Order.user),
            selectinload(Order.items),
            selectinload(Order.shipping_record),
        ).order_by(Order.created_at.desc()).all()

        writer.writerow([
            "Order Number",
            "Placed Date",
            "Buyer Name",
            "Buyer Email",
            "Order Status",
            "Payment Status",
            "Shipping Status",
            "Tracking Number",
            "Recipient Name",
            "Recipient Phone",
            "Shipping Address",
            "Items Summary",
            "Total (PHP)",
        ])
        for o in orders:
            ship = o.shipping_record
            addr = f"{ship.address_line1}, {ship.city}, {ship.province}" if ship else ""
            items_str = "; ".join(f"{item.product_title} x{item.quantity}" for item in o.items)
            writer.writerow([
                o.order_number,
                o.placed_at.isoformat() if o.placed_at else (o.created_at.isoformat() if o.created_at else ""),
                f"{o.user.first_name} {o.user.last_name}",
                o.user.email,
                o.status,
                o.payment_status,
                o.shipping_status,
                ship.tracking_number if ship else "",
                ship.recipient_name if ship else "",
                ship.phone if ship else "",
                addr,
                items_str,
                round(o.total_cents / 100, 2),
            ])

    return output.getvalue()
