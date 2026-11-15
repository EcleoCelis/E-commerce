from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import selectinload

from backend.app.extensions import db
from backend.app.models import (
    Order,
    OrderItem,
    OrderStatus,
    PaymentStatus,
    Product,
    ProductStatus,
    ShippingStatus,
    User,
)
from backend.app.orders.validation import (
    ALLOWED_ORDER_TRANSITIONS,
    ALLOWED_SHIPPING_TRANSITIONS,
    validate_buyer_cancellation,
    validate_fulfillment_payload,
)


ORDER_STATUSES = {status.value for status in OrderStatus}
PAYMENT_STATUSES = {status.value for status in PaymentStatus}
SHIPPING_STATUSES = {status.value for status in ShippingStatus}
ORDER_SORTS = {"recent", "oldest", "total_desc", "total_asc"}


def order_query():
    return Order.query.options(
        selectinload(Order.user),
        selectinload(Order.items).selectinload(OrderItem.product).selectinload(Product.images),
        selectinload(Order.payments),
        selectinload(Order.shipping_record),
    )


def apply_order_filters(query, filters):
    if filters.get("q"):
        keyword = f"%{filters['q'].strip()}%"
        query = query.filter(
            db.or_(
                Order.order_number.ilike(keyword),
                Order.user.has(
                    db.or_(
                        User.first_name.ilike(keyword),
                        User.last_name.ilike(keyword),
                        User.email.ilike(keyword),
                    )
                ),
            )
        )

    if filters.get("status"):
        query = query.filter(Order.status == filters["status"])

    if filters.get("payment_status"):
        query = query.filter(Order.payment_status == filters["payment_status"])

    if filters.get("shipping_status"):
        query = query.filter(Order.shipping_status == filters["shipping_status"])

    fulfillment_status = filters.get("fulfillment_status")
    if fulfillment_status:
        if fulfillment_status == "unfulfilled":
            query = query.filter(
                Order.shipping_status.in_([ShippingStatus.NOT_READY.value, ShippingStatus.READY.value]),
                Order.status != OrderStatus.CANCELLED.value,
            )
        elif fulfillment_status in {"shipped", "fulfilled"}:
            query = query.filter(Order.shipping_status == ShippingStatus.SHIPPED.value)
        elif fulfillment_status == "delivered":
            query = query.filter(Order.shipping_status == ShippingStatus.DELIVERED.value)
        elif fulfillment_status == "cancelled":
            query = query.filter(Order.status == OrderStatus.CANCELLED.value)
        elif fulfillment_status in SHIPPING_STATUSES:
            query = query.filter(Order.shipping_status == fulfillment_status)

    date_range = filters.get("date_range")
    if date_range:
        now = datetime.now(timezone.utc)
        if date_range == "today":
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            query = query.filter(Order.placed_at >= start_date)
        elif date_range == "this_week":
            start_date = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
            query = query.filter(Order.placed_at >= start_date)
        elif date_range == "this_month":
            start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            query = query.filter(Order.placed_at >= start_date)
        elif date_range == "this_year":
            start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
            query = query.filter(Order.placed_at >= start_date)

    sort = filters.get("sort") or "recent"
    if sort == "oldest":
        query = query.order_by(Order.placed_at.asc(), Order.id.asc())
    elif sort == "total_desc":
        query = query.order_by(Order.total_cents.desc(), Order.id.desc())
    elif sort == "total_asc":
        query = query.order_by(Order.total_cents.asc(), Order.id.desc())
    else:
        query = query.order_by(Order.placed_at.desc(), Order.id.desc())

    return query


def parse_order_filters(args):
    filters = {
        "q": (args.get("q") or "").strip(),
        "status": (args.get("status") or "").strip(),
        "payment_status": (args.get("payment_status") or "").strip(),
        "shipping_status": (args.get("shipping_status") or "").strip(),
        "fulfillment_status": (args.get("fulfillment_status") or "").strip(),
        "date_range": (args.get("date_range") or "").strip(),
        "sort": (args.get("sort") or "recent").strip(),
    }
    errors = {}

    if filters["status"] and filters["status"] not in ORDER_STATUSES:
        errors.setdefault("status", []).append("Status is not supported.")

    if filters["payment_status"] and filters["payment_status"] not in PAYMENT_STATUSES:
        errors.setdefault("payment_status", []).append("Payment status is not supported.")

    if filters["shipping_status"] and filters["shipping_status"] not in SHIPPING_STATUSES:
        errors.setdefault("shipping_status", []).append("Shipping status is not supported.")

    if filters["sort"] not in ORDER_SORTS:
        errors.setdefault("sort", []).append("Sort must be recent, oldest, total_desc, or total_asc.")

    return filters, errors


def list_buyer_orders(user, filters):
    query = order_query().filter(Order.user_id == user.id)
    return apply_order_filters(query, filters).all()


def get_buyer_order_by_number(user, order_number):
    return order_query().filter(Order.user_id == user.id, Order.order_number == order_number).one_or_none()


def list_admin_orders(filters):
    return apply_order_filters(order_query(), filters).all()


def get_admin_order_by_number(order_number):
    return order_query().filter(Order.order_number == order_number).one_or_none()


def update_admin_order_fulfillment(order, payload, actor=None):
    cleaned, errors = validate_fulfillment_payload(payload, order)
    if errors:
        return None, errors

    previous_status = order.status
    if cleaned["order_status"]:
        order.status = cleaned["order_status"]

    if cleaned["payment_status"]:
        order.payment_status = cleaned["payment_status"]
        for payment in order.payments:
            payment.status = cleaned["payment_status"]

    if cleaned["shipping_status"]:
        order.shipping_status = cleaned["shipping_status"]
        if order.shipping_record:
            order.shipping_record.status = cleaned["shipping_status"]

    if order.shipping_record:
        if cleaned["tracking_number"]:
            order.shipping_record.tracking_number = cleaned["tracking_number"]
        if isinstance(payload, dict) and "carrier" in payload:
            order.shipping_record.carrier = cleaned["carrier"]
        if isinstance(payload, dict) and "tracking_url" in payload:
            order.shipping_record.tracking_url = cleaned["tracking_url"]

    if isinstance(payload, dict) and "admin_notes" in payload:
        order.admin_notes = cleaned["admin_notes"]

    if cleaned["order_status"] == OrderStatus.CANCELLED.value and previous_status != OrderStatus.CANCELLED.value:
        for item in order.items:
            if item.product is None:
                continue

            item.product.quantity += item.quantity
            if item.product.status == ProductStatus.SOLD.value and item.product.quantity > 0:
                item.product.status = ProductStatus.AVAILABLE.value

    if actor is not None:
        from backend.app.admin.settings import record_admin_audit

        record_admin_audit(
            actor=actor,
            action="order.fulfillment_updated",
            entity_type="order",
            entity_id=order.order_number,
            summary=f"Updated fulfillment for {order.order_number} ({order.status} / {order.shipping_status})",
            metadata={
                "order_status": order.status,
                "payment_status": order.payment_status,
                "shipping_status": order.shipping_status,
                "carrier": order.shipping_record.carrier if order.shipping_record else None,
                "tracking_number": order.shipping_record.tracking_number if order.shipping_record else None,
            },
            commit=False,
        )

    db.session.commit()

    # Trigger communication notifications
    from backend.app.communication import create_notification, email_service
    if cleaned["shipping_status"] == ShippingStatus.SHIPPED.value and cleaned.get("tracking_number"):
        create_notification(
            user_id=order.user_id,
            title="Order Shipped",
            message=f"Order #{order.order_number} has been shipped! Tracking: {cleaned['tracking_number']}",
            notif_type="shipping",
            data={"order_number": order.order_number, "tracking_number": cleaned["tracking_number"]},
        )
        if order.user and order.user.email:
            email_service.send_shipping_update(order.user.email, order.order_number, cleaned["tracking_number"])
    elif cleaned["order_status"] == OrderStatus.DELIVERED.value:
        create_notification(
            user_id=order.user_id,
            title="Order Delivered",
            message=f"Order #{order.order_number} has been delivered. We hope you love your secondhand finds!",
            notif_type="order",
            data={"order_number": order.order_number},
        )
    elif cleaned["order_status"] == OrderStatus.CANCELLED.value and previous_status != OrderStatus.CANCELLED.value:
        create_notification(
            user_id=order.user_id,
            title="Order Cancelled",
            message=f"Order #{order.order_number} was cancelled.",
            notif_type="order",
            data={"order_number": order.order_number},
        )

    return order, {}


def cancel_buyer_order(order):
    errors = validate_buyer_cancellation(order)
    if errors:
        return None, errors

    if order.payment_status == PaymentStatus.PAID.value:
        from backend.app.checkout.payment_service import PaymentServiceError, payment_service

        try:
            payment_service.issue_refund(order, reason="requested_by_customer", commit=False)
        except PaymentServiceError as exc:
            db.session.rollback()
            return None, {"payment": [exc.message]}

    order.status = OrderStatus.CANCELLED.value

    for item in order.items:
        if item.product is None:
            continue

        item.product.quantity += item.quantity
        if item.product.status == ProductStatus.SOLD.value and item.product.quantity > 0:
            item.product.status = ProductStatus.AVAILABLE.value

    db.session.commit()

    from backend.app.communication import create_notification, notify_admins

    create_notification(
        user_id=order.user_id,
        title="Order Cancelled",
        message=f"Order #{order.order_number} has been cancelled.",
        notif_type="order",
        data={"order_number": order.order_number},
    )
    notify_admins(
        title="Order Cancelled by Buyer",
        message=f"Order #{order.order_number} was cancelled by the buyer prior to fulfillment.",
        notif_type="operational",
        data={"order_number": order.order_number},
    )
    return order, {}


BULK_ORDER_ACTIONS = {
    "mark_confirmed": {
        "order_status": OrderStatus.CONFIRMED.value,
        "shipping_status": None,
        "label": "Confirm Orders",
    },
    "mark_processing": {
        "order_status": OrderStatus.PROCESSING.value,
        "shipping_status": ShippingStatus.READY.value,
        "label": "Move to Processing / Ready",
    },
    "mark_ready": {
        "order_status": None,
        "shipping_status": ShippingStatus.READY.value,
        "label": "Mark Shipping Ready",
    },
    "mark_delivered": {
        "order_status": OrderStatus.DELIVERED.value,
        "shipping_status": ShippingStatus.DELIVERED.value,
        "label": "Mark Delivered",
    },
}


def execute_bulk_order_action(order_numbers, action, actor=None):
    """Apply a validated bulk fulfillment transition across multiple orders."""
    if not isinstance(order_numbers, list) or not order_numbers:
        return None, {"order_numbers": ["Select at least one order."]}
    if len(order_numbers) > 50:
        return None, {"order_numbers": ["A maximum of 50 orders can be updated at once."]}

    cleaned_action = str(action or "").strip().lower()
    spec = BULK_ORDER_ACTIONS.get(cleaned_action)
    if spec is None:
        return None, {
            "action": [f"Action must be one of: {', '.join(sorted(BULK_ORDER_ACTIONS))}."]
        }

    normalized_numbers = []
    seen = set()
    for raw in order_numbers:
        token = str(raw or "").strip().upper()
        if token and token not in seen:
            seen.add(token)
            normalized_numbers.append(token)

    if not normalized_numbers:
        return None, {"order_numbers": ["Select at least one valid order number."]}

    orders = order_query().filter(Order.order_number.in_(normalized_numbers)).all()
    order_map = {order.order_number: order for order in orders}

    updated_orders = []
    skipped = []

    for order_number in normalized_numbers:
        order = order_map.get(order_number)
        if order is None:
            skipped.append({"order_number": order_number, "reason": "Order not found."})
            continue

        patch = {}
        if spec["order_status"] and order.status != spec["order_status"]:
            if spec["order_status"] not in ALLOWED_ORDER_TRANSITIONS.get(order.status, set()):
                skipped.append(
                    {
                        "order_number": order_number,
                        "reason": f"Cannot transition order status from {order.status} to {spec['order_status']}.",
                    }
                )
                continue
            patch["order_status"] = spec["order_status"]

        if spec["shipping_status"] and order.shipping_status != spec["shipping_status"]:
            if spec["shipping_status"] not in ALLOWED_SHIPPING_TRANSITIONS.get(order.shipping_status, set()):
                skipped.append(
                    {
                        "order_number": order_number,
                        "reason": f"Cannot transition shipping status from {order.shipping_status} to {spec['shipping_status']}.",
                    }
                )
                continue
            patch["shipping_status"] = spec["shipping_status"]

        if not patch:
            skipped.append({"order_number": order_number, "reason": "Already in target state."})
            continue

        _, errs = validate_fulfillment_payload(patch, order)
        if errs:
            first_msg = next((msgs[0] for msgs in errs.values() if msgs), "Validation failed.")
            skipped.append({"order_number": order_number, "reason": first_msg})
            continue

        if patch.get("order_status"):
            order.status = patch["order_status"]
        if patch.get("shipping_status"):
            order.shipping_status = patch["shipping_status"]
            if order.shipping_record:
                order.shipping_record.status = patch["shipping_status"]

        updated_orders.append(order.order_number)

    if updated_orders and actor is not None:
        from backend.app.admin.settings import record_admin_audit

        record_admin_audit(
            actor=actor,
            action="orders.bulk_action",
            entity_type="order",
            entity_id=f"{len(updated_orders)} orders",
            summary=f"Bulk action '{cleaned_action}' applied to {len(updated_orders)} order(s): {', '.join(updated_orders[:5])}",
            metadata={"action": cleaned_action, "updated": updated_orders, "skipped": skipped},
            commit=False,
        )

    db.session.commit()
    return {
        "action": cleaned_action,
        "updated_count": len(updated_orders),
        "updated_orders": updated_orders,
        "skipped": skipped,
    }, {}
