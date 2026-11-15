from flask import Blueprint, g, request

from backend.app.auth.decorators import load_current_session, roles_required
from backend.app.auth.rbac import Role
from backend.app.auth.service import get_payment_methods_catalog
from backend.app.checkout.payment_service import (
    PaymentServiceError,
    is_stripe_configured,
    payment_service,
)
from backend.app.core.responses import error_response, success_response
from backend.app.models.commerce import Order
from backend.app.orders.serializers import serialize_order_detail, serialize_payment


payments_bp = Blueprint("payments", __name__, url_prefix="/checkout/payments")


@payments_bp.get("/methods")
def list_payment_methods():
    from backend.app.admin.settings import get_store_config

    load_current_session()
    user = getattr(g, "current_user", None)
    enabled = set(get_store_config().get("enabled_payment_methods") or [])
    catalog = get_payment_methods_catalog()
    if enabled:
        catalog = [m for m in catalog if (not m.get("supported")) or (m.get("code") in enabled)]
    data = {
        "methods": catalog,
        "stripe_configured": is_stripe_configured(),
        "store_enabled_methods": sorted(enabled),
    }
    if user:
        data["preferred_payment_method"] = user.preferred_payment_method or "cash_on_delivery"
        data["payment_preferences"] = user.resolved_payment_preferences()
    return success_response(data=data, message="Payment methods retrieved.")


@payments_bp.get("/<order_number>")
@roles_required(Role.BUYER.value)
def get_order_payment_status(order_number):
    order = Order.query.filter_by(order_number=order_number, user_id=g.current_user.id).one_or_none()
    if not order:
        return error_response(message=f"Order #{order_number} not found.", status_code=404, code="order_not_found")

    primary_payment = order.payments[0] if order.payments else None
    method = primary_payment.method if primary_payment else "cash_on_delivery"
    try:
        intent = payment_service.create_payment_intent(order, method)
    except PaymentServiceError as exc:
        return error_response(message=exc.message, status_code=exc.status_code, code=exc.code)

    return success_response(
        data={
            "order_number": order.order_number,
            "order_status": order.status,
            "payment_status": order.payment_status,
            "payment": serialize_payment(primary_payment),
            "intent": intent,
        },
        message="Order payment details retrieved.",
    )


@payments_bp.post("/<order_number>/confirm")
@roles_required(Role.BUYER.value)
def confirm_buyer_order_payment(order_number):
    payload = request.get_json(silent=True) or {}
    reference_number = payload.get("reference_number")

    try:
        payment = payment_service.confirm_buyer_payment(
            user=g.current_user,
            order_number=order_number,
            reference_number=reference_number,
        )
    except PaymentServiceError as exc:
        return error_response(message=exc.message, status_code=exc.status_code, code=exc.code)

    order = Order.query.filter_by(order_number=order_number, user_id=g.current_user.id).one()
    return success_response(
        data={
            "order": serialize_order_detail(order),
            "payment": serialize_payment(payment),
        },
        message="Payment confirmed successfully.",
    )


@payments_bp.post("/<order_number>/verify-stripe")
@roles_required(Role.BUYER.value)
def verify_stripe_order_payment(order_number):
    payload = request.get_json(silent=True) or {}
    session_id = payload.get("session_id") or request.args.get("session_id")

    try:
        payment = payment_service.verify_stripe_payment(
            user=g.current_user,
            order_number=order_number,
            session_id=session_id,
        )
    except PaymentServiceError as exc:
        return error_response(message=exc.message, status_code=exc.status_code, code=exc.code)

    order = Order.query.filter_by(order_number=order_number, user_id=g.current_user.id).one()
    return success_response(
        data={
            "order": serialize_order_detail(order),
            "payment": serialize_payment(payment),
        },
        message="Stripe payment verified successfully.",
    )


@payments_bp.post("/webhook")
def handle_payment_webhook():
    payload = request.get_data()
    stripe_signature = request.headers.get("Stripe-Signature")
    if stripe_signature:
        signature = stripe_signature
        provider_name = "credit_debit_card"
    else:
        signature = request.headers.get("X-Signature") or request.headers.get("X-Webhook-Signature")
        provider_name = request.args.get("provider", "sandbox")

    provider = payment_service.get_provider(provider_name)
    try:
        event = provider.verify_webhook(payload, signature)
    except PaymentServiceError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    # Process verified event
    event_type = event.get("event")
    order_number = event.get("order_number")
    amount_cents = event.get("amount_cents", 0)
    reference = event.get("payment_reference") or event.get("id")

    if event_type == "payment.succeeded" and order_number and reference:
        try:
            payment = payment_service.process_successful_payment(
                order_number=order_number,
                amount_cents=amount_cents,
                reference_number=reference,
                method=provider_name,
            )
            return success_response(
                data={"processed": True, "payment_id": payment.id},
                message="Payment processed successfully.",
            )
        except PaymentServiceError as exc:
            return error_response(
                message=exc.message,
                status_code=exc.status_code,
                code=exc.code,
            )

    if event_type == "payment.failed" and order_number:
        payment = payment_service.process_failed_payment(
            order_number=order_number,
            reference_number=reference,
        )
        return success_response(
            data={"processed": bool(payment), "event": event_type},
            message="Failed payment event processed.",
        )

    return success_response(
        data={"received": True, "event": event_type},
        message="Webhook event received.",
    )
