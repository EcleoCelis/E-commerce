import uuid
from sqlalchemy.orm import selectinload

from backend.app.checkout.payment_service import (
    PaymentServiceError,
    StripeCheckoutProvider,
    payment_service,
)
from backend.app.extensions import db
from backend.app.models.commerce import Order, OrderStatus, Payment, PaymentStatus
from backend.app.models.identity import User


class PaymentAdminError(Exception):
    def __init__(self, message, code="payment_admin_error", status_code=400, details=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}


def _detect_gateway(payment: Payment) -> str:
    ref = (payment.reference_number or "").strip()
    method = (payment.method or "").strip().lower()
    if method in {"credit_debit_card", "stripe"} or ref.startswith(("cs_", "pi_", "re_")):
        return "stripe"
    if "gcash" in method or ref.startswith("GCASH-"):
        return "gcash"
    if method == "cash_on_delivery":
        return "cod"
    return "manual"


def serialize_admin_payment(payment: Payment) -> dict:
    order = payment.order
    user = order.user if order else None
    buyer_name = f"{user.first_name or ''} {user.last_name or ''}".strip() if user else "Guest"
    return {
        "id": payment.id,
        "order_id": payment.order_id,
        "order_number": order.order_number if order else None,
        "order_status": order.status if order else None,
        "order_total": round((order.total_cents or 0) / 100, 2) if order else 0.0,
        "order_payment_status": order.payment_status if order else None,
        "buyer_id": user.id if user else None,
        "buyer_name": buyer_name or (user.email if user else "Guest"),
        "buyer_email": user.email if user else "",
        "method": payment.method,
        "gateway": _detect_gateway(payment),
        "status": payment.status,
        "amount_cents": int(payment.amount_cents or 0),
        "amount": round((payment.amount_cents or 0) / 100, 2),
        "reference_number": payment.reference_number,
        "created_at": payment.created_at.isoformat() if payment.created_at else None,
        "updated_at": payment.updated_at.isoformat() if payment.updated_at else None,
    }


def list_admin_payments(filters: dict = None) -> dict:
    filters = filters or {}
    q = (filters.get("q") or "").strip().lstrip("#")
    status_filter = (filters.get("status") or "").strip().lower()
    method_filter = (filters.get("method") or "").strip().lower()
    page = max(1, int(filters.get("page") or 1))
    per_page = min(100, max(1, int(filters.get("per_page") or 25)))

    all_payments = (
        Payment.query.options(
            selectinload(Payment.order).selectinload(Order.user)
        )
        .order_by(Payment.created_at.desc(), Payment.id.desc())
        .all()
    )

    collected_cents = sum(
        int(p.amount_cents or 0)
        for p in all_payments
        if p.status == PaymentStatus.PAID.value and p.method != "refund"
    )
    pending_cents = sum(
        int(p.amount_cents or 0)
        for p in all_payments
        if p.status == PaymentStatus.PENDING.value
    )
    refunded_orders_with_row = {
        p.order_id
        for p in all_payments
        if p.method == "refund" and p.status == PaymentStatus.REFUNDED.value
    }
    refunded_cents = sum(
        int(p.amount_cents or 0)
        for p in all_payments
        if (p.method == "refund" and p.status == PaymentStatus.REFUNDED.value)
        or (
            p.status == PaymentStatus.REFUNDED.value
            and p.method != "refund"
            and p.order_id not in refunded_orders_with_row
        )
    )
    failed_count = sum(1 for p in all_payments if p.status == PaymentStatus.FAILED.value)

    summary = {
        "total_transactions": len(all_payments),
        "collected_amount": round(collected_cents / 100, 2),
        "pending_amount": round(pending_cents / 100, 2),
        "refunded_amount": round(refunded_cents / 100, 2),
        "failed_count": failed_count,
    }

    query = Payment.query.options(
        selectinload(Payment.order).selectinload(Order.user)
    )
    if status_filter and status_filter != "all":
        query = query.filter(Payment.status == status_filter)
    if method_filter and method_filter != "all":
        query = query.filter(Payment.method == method_filter)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            db.or_(
                Payment.reference_number.ilike(pattern),
                Payment.order.has(
                    db.or_(
                        Order.order_number.ilike(pattern),
                        Order.user.has(
                            db.or_(
                                User.email.ilike(pattern),
                                User.first_name.ilike(pattern),
                                User.last_name.ilike(pattern),
                            )
                        ),
                    )
                ),
            )
        )

    matched = query.order_by(Payment.created_at.desc(), Payment.id.desc()).all()
    total = len(matched)
    start = (page - 1) * per_page
    paged = matched[start : start + per_page]

    return {
        "payments": [serialize_admin_payment(p) for p in paged],
        "summary": summary,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": max(1, (total + per_page - 1) // per_page),
        },
    }


def reconcile_admin_payment(payment_id: int) -> dict:
    payment = Payment.query.options(selectinload(Payment.order).selectinload(Order.user)).filter_by(id=payment_id).one_or_none()
    if not payment:
        raise PaymentAdminError("Payment transaction was not found.", code="payment_not_found", status_code=404)

    order = payment.order
    if not order:
        raise PaymentAdminError("Associated order not found.", code="order_not_found", status_code=404)

    if order.status == OrderStatus.CANCELLED.value:
        raise PaymentAdminError("Cancelled orders cannot be reconciled as paid.", code="order_cancelled", status_code=409)

    if payment.status == PaymentStatus.PAID.value and order.payment_status == PaymentStatus.PAID.value:
        return serialize_admin_payment(payment)

    if payment.status == PaymentStatus.REFUNDED.value or order.payment_status == PaymentStatus.REFUNDED.value:
        raise PaymentAdminError("Refunded transactions cannot be re-settled.", code="already_refunded", status_code=409)

    try:
        if payment.method in {"credit_debit_card", "stripe"}:
            stripe_provider = StripeCheckoutProvider()
            amount_cents, reference = stripe_provider.verify_session(order, payment.reference_number)
            settled = payment_service.process_successful_payment(
                order_number=order.order_number,
                amount_cents=amount_cents,
                reference_number=reference,
                method=payment.method,
            )
        else:
            ref = payment.reference_number or f"{(payment.method or 'MANUAL').upper()}-{uuid.uuid4().hex[:8].upper()}"
            settled = payment_service.process_successful_payment(
                order_number=order.order_number,
                amount_cents=order.total_cents,
                reference_number=ref,
                method=payment.method,
            )
    except PaymentServiceError as exc:
        raise PaymentAdminError(exc.message, code=exc.code, status_code=exc.status_code)

    return serialize_admin_payment(settled)


def refund_admin_payment(payment_id: int, amount_cents: int | None = None, reason: str = "requested_by_customer", actor=None) -> dict:
    payment = Payment.query.options(selectinload(Payment.order).selectinload(Order.payments)).filter_by(id=payment_id).one_or_none()
    if not payment:
        raise PaymentAdminError("Payment transaction was not found.", code="payment_not_found", status_code=404)

    order = payment.order
    if not order:
        raise PaymentAdminError("Associated order not found.", code="order_not_found", status_code=404)

    if order.payment_status != PaymentStatus.PAID.value and payment.status != PaymentStatus.PAID.value:
        raise PaymentAdminError(
            "Only settled payments can be refunded.",
            code="payment_not_refundable",
            status_code=409,
        )

    try:
        result = payment_service.issue_refund(order, amount_cents=amount_cents, reason=reason, commit=True)
    except PaymentServiceError as exc:
        raise PaymentAdminError(exc.message, code=exc.code, status_code=exc.status_code)

    from backend.app.admin.settings import record_admin_audit

    record_admin_audit(
        actor=actor,
        action="payment.refund",
        entity_type="payment",
        entity_id=payment.id,
        summary=f"Executed {result.get('gateway')} refund {result.get('refund_id')} for order #{order.order_number}",
        metadata={"order_number": order.order_number, "refund_id": result.get("refund_id"), "amount_cents": result.get("amount_cents")},
    )

    refund_payment = result.get("payment") or payment
    return {
        "payment": serialize_admin_payment(refund_payment),
        "gateway": result.get("gateway"),
        "refund_id": result.get("refund_id"),
        "already_refunded": bool(result.get("already_refunded")),
    }
