import hashlib
import hmac
import json
import os
import re
import uuid
from flask import current_app, has_app_context, has_request_context, request
from backend.app.communication import create_notification, email_service, notify_admins
from backend.app.extensions import db
from backend.app.models.commerce import Order, OrderStatus, Payment, PaymentStatus

try:
    import stripe
except ImportError:  # pragma: no cover
    stripe = None


def _stripe_field(obj, key, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def resolve_stripe_credentials():
    config = current_app.config if has_app_context() else {}
    secret_key = (config.get("STRIPE_SECRET_KEY") or os.getenv("STRIPE_SECRET_KEY") or "").strip()
    webhook_secret = (config.get("STRIPE_WEBHOOK_SECRET") or os.getenv("STRIPE_WEBHOOK_SECRET") or "").strip()
    publishable_key = (config.get("STRIPE_PUBLISHABLE_KEY") or os.getenv("STRIPE_PUBLISHABLE_KEY") or "").strip()
    return secret_key, webhook_secret, publishable_key


def is_stripe_configured() -> bool:
    secret_key, _, _ = resolve_stripe_credentials()
    return bool(stripe is not None and secret_key)


def _resolve_public_base_url() -> str:
    config = current_app.config if has_app_context() else {}
    configured = (config.get("APP_PUBLIC_BASE_URL") or os.getenv("APP_PUBLIC_BASE_URL") or "").strip()
    if configured:
        return configured.rstrip("/")
    if has_request_context():
        return request.url_root.rstrip("/")
    return "http://127.0.0.1:5000"


class PaymentServiceError(Exception):
    def __init__(self, message, code="payment_error", status_code=400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class BasePaymentProvider:
    provider_name = "base"

    def create_intent(self, order: Order) -> dict:
        raise NotImplementedError

    def verify_webhook(self, payload: bytes, signature: str) -> dict:
        raise NotImplementedError


class CashOnDeliveryProvider(BasePaymentProvider):
    provider_name = "cash_on_delivery"

    def create_intent(self, order: Order) -> dict:
        return {
            "provider": self.provider_name,
            "status": "pending_delivery",
            "requires_action": False,
            "payment_url": None,
            "instructions": "Pay in cash upon physical delivery of your secondhand items.",
        }


class SandboxGatewayProvider(BasePaymentProvider):
    provider_name = "sandbox_gateway"

    def __init__(self, secret: str = None, provider_name: str = "sandbox_gateway"):
        self.secret = (secret or os.getenv("PAYMENT_GATEWAY_SECRET") or "sandbox_secret_key").encode("utf-8")
        self.provider_name = provider_name

    def create_intent(self, order: Order) -> dict:
        existing_ref = order.payments[0].reference_number if order.payments else None
        ref = existing_ref or f"INT-{uuid.uuid4().hex[:12].upper()}"
        is_paid = order.payment_status == PaymentStatus.PAID.value
        return {
            "provider": self.provider_name,
            "status": "paid" if is_paid else "requires_payment",
            "payment_reference": ref,
            "amount_cents": order.total_cents,
            "requires_action": not is_paid and order.status != OrderStatus.CANCELLED.value,
            "checkout_url": f"/orders?order={order.order_number}",
            "instructions": (
                "Payment confirmed via GCash."
                if is_paid
                else "Complete GCash payment using your order reference number to confirm settlement."
            ),
        }

    def verify_webhook(self, payload: bytes, signature: str) -> dict:
        if not signature:
            raise PaymentServiceError("Missing webhook signature.", code="missing_signature", status_code=401)

        expected = hmac.new(self.secret, payload, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise PaymentServiceError("Invalid webhook signature.", code="invalid_signature", status_code=401)

        import json
        try:
            data = json.loads(payload.decode("utf-8"))
        except Exception:
            raise PaymentServiceError("Invalid JSON in webhook payload.", code="malformed_payload")

        return data


class StripeCheckoutProvider(BasePaymentProvider):
    provider_name = "credit_debit_card"

    def _require_secret_key(self) -> str:
        secret_key, _, _ = resolve_stripe_credentials()
        if stripe is None or not secret_key:
            raise PaymentServiceError(
                "Stripe Test Mode is not configured. Set STRIPE_SECRET_KEY to accept card payments.",
                code="stripe_not_configured",
                status_code=503,
            )
        return secret_key

    def create_intent(self, order: Order, commit: bool = True) -> dict:
        cached = getattr(order, "_cached_payment_intent", None)
        if cached:
            return cached

        primary_payment = order.payments[0] if order.payments else None
        existing_ref = primary_payment.reference_number if primary_payment else None

        if order.payment_status == PaymentStatus.PAID.value:
            return {
                "provider": "stripe",
                "status": "paid",
                "payment_reference": existing_ref,
                "amount_cents": order.total_cents,
                "requires_action": False,
                "redirect_required": False,
                "checkout_url": None,
                "instructions": "Card payment verified via Stripe Checkout.",
            }

        if order.status == OrderStatus.CANCELLED.value:
            return {
                "provider": "stripe",
                "status": "cancelled",
                "payment_reference": existing_ref,
                "amount_cents": order.total_cents,
                "requires_action": False,
                "redirect_required": False,
                "checkout_url": None,
                "instructions": "This order was cancelled.",
            }

        secret_key = self._require_secret_key()
        stripe_error_cls = getattr(stripe, "StripeError", Exception)

        if existing_ref and existing_ref.startswith("cs_"):
            try:
                existing_session = stripe.checkout.Session.retrieve(existing_ref, api_key=secret_key)
                session_status = _stripe_field(existing_session, "status")
                payment_status = _stripe_field(existing_session, "payment_status")
                session_url = _stripe_field(existing_session, "url")
                if payment_status == "paid":
                    return {
                        "provider": "stripe",
                        "status": "paid",
                        "payment_reference": _stripe_field(existing_session, "payment_intent") or existing_ref,
                        "session_id": existing_ref,
                        "amount_cents": order.total_cents,
                        "requires_action": False,
                        "redirect_required": False,
                        "checkout_url": None,
                        "instructions": "Stripe payment completed; verifying order status.",
                    }
                if session_status == "open" and session_url:
                    intent = {
                        "provider": "stripe",
                        "status": "requires_payment",
                        "payment_reference": existing_ref,
                        "session_id": existing_ref,
                        "amount_cents": order.total_cents,
                        "requires_action": True,
                        "redirect_required": True,
                        "checkout_url": session_url,
                        "instructions": "Complete your card payment securely on Stripe Checkout.",
                    }
                    order._cached_payment_intent = intent
                    return intent
            except stripe_error_cls:
                pass

        base_url = _resolve_public_base_url()
        item_summary = ", ".join(
            f"{item.product_title} x{item.quantity}" for item in (order.items or [])
        )[:450] or f"SecondMarket Order #{order.order_number}"

        session_params = {
            "api_key": secret_key,
            "mode": "payment",
            "payment_method_types": ["card"],
            "client_reference_id": order.order_number,
            "line_items": [
                {
                    "price_data": {
                        "currency": "php",
                        "unit_amount": int(order.total_cents),
                        "product_data": {
                            "name": f"SecondMarket Order #{order.order_number}",
                            "description": item_summary,
                        },
                    },
                    "quantity": 1,
                }
            ],
            "metadata": {
                "order_number": order.order_number,
                "user_id": str(order.user_id),
            },
            "payment_intent_data": {
                "metadata": {
                    "order_number": order.order_number,
                    "user_id": str(order.user_id),
                }
            },
            "success_url": f"{base_url}/checkout?confirmed={order.order_number}&stripe_session_id={{CHECKOUT_SESSION_ID}}",
            "cancel_url": f"{base_url}/checkout?confirmed={order.order_number}&stripe_cancelled=1",
        }
        if order.user and order.user.email:
            session_params["customer_email"] = order.user.email

        try:
            session = stripe.checkout.Session.create(**session_params)
        except stripe_error_cls as exc:
            raise PaymentServiceError(
                getattr(exc, "user_message", None) or f"Unable to initialize Stripe Checkout: {exc}",
                code="stripe_session_failed",
                status_code=502,
            )

        session_id = _stripe_field(session, "id")
        session_url = _stripe_field(session, "url")
        if not session_id or not session_url:
            raise PaymentServiceError(
                "Stripe did not return a valid Checkout Session URL.",
                code="stripe_session_failed",
                status_code=502,
            )

        if primary_payment:
            primary_payment.reference_number = session_id
            if commit:
                db.session.commit()

        intent = {
            "provider": "stripe",
            "status": "requires_payment",
            "payment_reference": session_id,
            "session_id": session_id,
            "amount_cents": order.total_cents,
            "requires_action": True,
            "redirect_required": True,
            "checkout_url": session_url,
            "instructions": "Complete your card payment securely on Stripe Checkout.",
        }
        order._cached_payment_intent = intent
        return intent

    def verify_session(self, order: Order, session_id: str = None) -> tuple[int, str]:
        secret_key = self._require_secret_key()
        primary_payment = order.payments[0] if order.payments else None
        target_session_id = (session_id or (primary_payment.reference_number if primary_payment else "") or "").strip()
        if not target_session_id or not target_session_id.startswith("cs_"):
            raise PaymentServiceError(
                "Missing or invalid Stripe Checkout session ID.",
                code="invalid_stripe_session",
                status_code=400,
            )

        stripe_error_cls = getattr(stripe, "StripeError", Exception)
        try:
            session = stripe.checkout.Session.retrieve(target_session_id, api_key=secret_key)
        except stripe_error_cls as exc:
            raise PaymentServiceError(
                getattr(exc, "user_message", None) or f"Unable to verify Stripe Checkout session: {exc}",
                code="stripe_verification_failed",
                status_code=502,
            )

        metadata = _stripe_field(session, "metadata", {}) or {}
        metadata_order = _stripe_field(metadata, "order_number") or _stripe_field(session, "client_reference_id")
        if metadata_order and metadata_order != order.order_number:
            raise PaymentServiceError(
                "Stripe Checkout session does not match this order.",
                code="stripe_order_mismatch",
                status_code=400,
            )

        if _stripe_field(session, "payment_status") != "paid":
            raise PaymentServiceError(
                "Stripe card payment has not been completed yet.",
                code="stripe_payment_incomplete",
                status_code=402,
            )

        amount_cents = int(_stripe_field(session, "amount_total") or order.total_cents)
        reference = _stripe_field(session, "payment_intent") or target_session_id
        return amount_cents, reference

    def verify_webhook(self, payload: bytes, signature: str) -> dict:
        _, webhook_secret, _ = resolve_stripe_credentials()
        if stripe is None or not webhook_secret:
            raise PaymentServiceError(
                "Stripe webhook secret is not configured.",
                code="stripe_webhook_not_configured",
                status_code=503,
            )
        if not signature:
            raise PaymentServiceError("Missing Stripe webhook signature.", code="missing_signature", status_code=401)

        sig_error_cls = getattr(stripe, "SignatureVerificationError", ValueError)
        try:
            event = stripe.Webhook.construct_event(payload=payload, sig_header=signature, secret=webhook_secret)
        except sig_error_cls:
            raise PaymentServiceError("Invalid Stripe webhook signature.", code="invalid_signature", status_code=401)
        except ValueError:
            raise PaymentServiceError("Invalid JSON in Stripe webhook payload.", code="malformed_payload", status_code=400)

        event_type = _stripe_field(event, "type")
        data_wrapper = _stripe_field(event, "data", {}) or {}
        obj = _stripe_field(data_wrapper, "object", {}) or {}
        metadata = _stripe_field(obj, "metadata", {}) or {}
        order_number = _stripe_field(metadata, "order_number") or _stripe_field(obj, "client_reference_id")
        reference = _stripe_field(obj, "payment_intent") or _stripe_field(obj, "id")

        if event_type in {"checkout.session.completed", "checkout.session.async_payment_succeeded"}:
            if _stripe_field(obj, "payment_status") == "paid":
                return {
                    "event": "payment.succeeded",
                    "order_number": order_number,
                    "amount_cents": int(_stripe_field(obj, "amount_total") or 0),
                    "payment_reference": reference,
                }
            return {"event": event_type, "order_number": order_number, "payment_reference": reference}

        if event_type in {"checkout.session.async_payment_failed", "checkout.session.expired", "payment_intent.payment_failed"}:
            return {
                "event": "payment.failed",
                "order_number": order_number,
                "amount_cents": int(_stripe_field(obj, "amount_total") or _stripe_field(obj, "amount") or 0),
                "payment_reference": reference,
            }

        return {"event": event_type, "order_number": order_number, "payment_reference": reference}

    def refund_payment(
        self,
        order: Order,
        amount_cents: int | None = None,
        reason: str = "requested_by_customer",
        source_payment: Payment | None = None,
    ) -> dict:
        secret_key = self._require_secret_key()
        stripe_error_cls = getattr(stripe, "StripeError", Exception)

        payment = source_payment or next(
            (
                p
                for p in (order.payments or [])
                if p.method in {"credit_debit_card", "stripe"}
                and p.status == PaymentStatus.PAID.value
            ),
            None,
        )
        if not payment:
            payment = next(
                (
                    p
                    for p in (order.payments or [])
                    if p.method in {"credit_debit_card", "stripe"} and p.reference_number
                ),
                None,
            )

        raw_ref = (payment.reference_number if payment else "") or ""
        payment_intent_id = None
        if raw_ref.startswith("pi_"):
            payment_intent_id = raw_ref
        elif raw_ref.startswith("cs_"):
            try:
                session = stripe.checkout.Session.retrieve(raw_ref, api_key=secret_key)
                payment_intent_id = _stripe_field(session, "payment_intent")
            except stripe_error_cls as exc:
                raise PaymentServiceError(
                    getattr(exc, "user_message", None)
                    or f"Unable to retrieve Stripe session for refund: {exc}",
                    code="stripe_refund_lookup_failed",
                    status_code=502,
                )

        if not payment_intent_id:
            raise PaymentServiceError(
                "No Stripe PaymentIntent reference was found for this order.",
                code="stripe_payment_intent_missing",
                status_code=400,
            )

        refund_params = {
            "api_key": secret_key,
            "payment_intent": payment_intent_id,
            "reason": reason or "requested_by_customer",
            "metadata": {"order_number": order.order_number},
        }
        if amount_cents is not None:
            refund_params["amount"] = int(amount_cents)

        try:
            refund_obj = stripe.Refund.create(**refund_params)
        except stripe_error_cls as exc:
            raise PaymentServiceError(
                getattr(exc, "user_message", None) or f"Stripe refund failed: {exc}",
                code="stripe_refund_failed",
                status_code=502,
            )

        refund_id = _stripe_field(refund_obj, "id")
        if not refund_id:
            raise PaymentServiceError(
                "Stripe did not return a valid refund reference.",
                code="stripe_refund_failed",
                status_code=502,
            )

        return {
            "gateway": "stripe",
            "refund_id": refund_id,
            "payment_intent": payment_intent_id,
            "amount_cents": int(_stripe_field(refund_obj, "amount") or amount_cents or order.total_cents),
            "status": _stripe_field(refund_obj, "status") or "succeeded",
        }


class PaymentService:
    def __init__(self):
        stripe_provider = StripeCheckoutProvider()
        self.providers = {
            "cash_on_delivery": CashOnDeliveryProvider(),
            "gcash_pending": SandboxGatewayProvider(provider_name="gcash_pending"),
            "gcash": SandboxGatewayProvider(provider_name="gcash"),
            "credit_debit_card": stripe_provider,
            "stripe": stripe_provider,
            "card": SandboxGatewayProvider(provider_name="card"),
            "sandbox": SandboxGatewayProvider(provider_name="sandbox"),
        }

    def get_provider(self, method: str) -> BasePaymentProvider:
        clean_method = (method or "").strip().lower()
        if clean_method in self.providers:
            return self.providers[clean_method]
        return self.providers["cash_on_delivery"]

    def create_payment_intent(self, order: Order, method: str, commit: bool = True) -> dict:
        provider = self.get_provider(method)
        if isinstance(provider, StripeCheckoutProvider):
            return provider.create_intent(order, commit=commit)
        return provider.create_intent(order)

    def confirm_buyer_payment(self, user, order_number: str, reference_number: str = None) -> Payment:
        order = Order.query.filter_by(order_number=order_number, user_id=user.id).one_or_none()
        if not order:
            raise PaymentServiceError(f"Order #{order_number} not found.", code="order_not_found", status_code=404)

        if order.status == OrderStatus.CANCELLED.value:
            raise PaymentServiceError("Cancelled orders cannot be paid.", code="order_cancelled", status_code=409)

        if order.payment_status == PaymentStatus.PAID.value:
            existing_paid = next((p for p in order.payments if p.status == PaymentStatus.PAID.value), None)
            if existing_paid:
                return existing_paid
            raise PaymentServiceError("Order has already been paid.", code="already_paid", status_code=409)

        if order.payment_status == PaymentStatus.REFUNDED.value:
            raise PaymentServiceError("Refunded orders cannot be paid.", code="order_refunded", status_code=409)

        primary_payment = order.payments[0] if order.payments else None
        method = primary_payment.method if primary_payment else "gcash_pending"
        if method == "cash_on_delivery":
            raise PaymentServiceError(
                "Cash on Delivery orders are settled upon physical delivery.",
                code="cod_not_payable_online",
                status_code=409,
            )
        if method in {"credit_debit_card", "stripe"}:
            raise PaymentServiceError(
                "Card payments must be verified automatically through Stripe Checkout.",
                code="online_verification_required",
                status_code=409,
            )

        clean_ref = (reference_number or "").strip().upper()
        if clean_ref:
            if not re.fullmatch(r"[A-Z0-9_-]{4,64}", clean_ref):
                raise PaymentServiceError(
                    "GCash reference number must be 4-64 letters, numbers, dashes, or underscores.",
                    code="invalid_payment_reference",
                    status_code=422,
                )
        else:
            clean_ref = (primary_payment.reference_number if primary_payment else None) or f"GCASH-{uuid.uuid4().hex[:10].upper()}"

        return self.process_successful_payment(
            order_number=order.order_number,
            amount_cents=order.total_cents,
            reference_number=clean_ref,
            method=method,
        )

    def verify_stripe_payment(self, user, order_number: str, session_id: str = None) -> Payment:
        order = Order.query.filter_by(order_number=order_number, user_id=user.id).one_or_none()
        if not order:
            raise PaymentServiceError(f"Order #{order_number} not found.", code="order_not_found", status_code=404)

        primary_payment = order.payments[0] if order.payments else None
        method = primary_payment.method if primary_payment else None
        if method not in {"credit_debit_card", "stripe"}:
            raise PaymentServiceError(
                "Order does not use Stripe card checkout.",
                code="invalid_payment_method",
                status_code=400,
            )

        if order.payment_status == PaymentStatus.PAID.value:
            existing_paid = next((p for p in order.payments if p.status == PaymentStatus.PAID.value), None)
            if existing_paid:
                return existing_paid

        stripe_provider = self.get_provider("credit_debit_card")
        amount_cents, reference = stripe_provider.verify_session(order, session_id=session_id)
        return self.process_successful_payment(
            order_number=order.order_number,
            amount_cents=amount_cents,
            reference_number=reference,
            method="credit_debit_card",
        )

    def process_failed_payment(self, order_number: str, reference_number: str = None) -> Payment | None:
        order = Order.query.filter_by(order_number=order_number).one_or_none()
        if not order:
            return None
        if order.payment_status in {PaymentStatus.PAID.value, PaymentStatus.REFUNDED.value}:
            return next((p for p in order.payments if p.status == PaymentStatus.PAID.value), None)

        order.payment_status = PaymentStatus.FAILED.value
        pending_payment = next(
            (p for p in order.payments if p.status in {PaymentStatus.PENDING.value, PaymentStatus.FAILED.value}),
            None,
        )
        if pending_payment:
            pending_payment.status = PaymentStatus.FAILED.value
            if reference_number:
                pending_payment.reference_number = reference_number
            payment = pending_payment
        else:
            payment = Payment(
                order_id=order.id,
                method="credit_debit_card",
                status=PaymentStatus.FAILED.value,
                amount_cents=order.total_cents,
                reference_number=reference_number,
            )
            db.session.add(payment)
        db.session.commit()

        create_notification(
            user_id=order.user_id,
            title="Payment Failed",
            message=f"Card payment for order #{order_number} could not be completed. You can retry payment from Order Details.",
            notif_type="payment",
            data={"order_number": order_number},
        )
        return payment

    def process_successful_payment(self, order_number: str, amount_cents: int, reference_number: str, method: str = "sandbox") -> Payment:
        order = Order.query.filter_by(order_number=order_number).one_or_none()
        if not order:
            raise PaymentServiceError(f"Order #{order_number} not found.", code="order_not_found", status_code=404)

        # Idempotency check: if already paid with this reference or order already paid, return existing payment
        existing = Payment.query.filter_by(reference_number=reference_number, status=PaymentStatus.PAID.value).first()
        if existing:
            return existing
        if order.payment_status == PaymentStatus.PAID.value:
            existing_order_paid = next((p for p in order.payments if p.status == PaymentStatus.PAID.value), None)
            if existing_order_paid:
                return existing_order_paid

        if order.status == OrderStatus.CANCELLED.value:
            raise PaymentServiceError("Cancelled orders cannot accept payment.", code="order_cancelled", status_code=409)

        if order.payment_status == PaymentStatus.REFUNDED.value:
            raise PaymentServiceError("Refunded orders cannot accept payment.", code="order_refunded", status_code=409)

        # Server-side amount verification
        if amount_cents < order.total_cents:
            raise PaymentServiceError("Paid amount is less than order total.", code="insufficient_payment_amount")

        order.payment_status = PaymentStatus.PAID.value

        # Update existing pending/failed payment row rather than leaving a phantom pending row
        pending_payment = next(
            (p for p in order.payments if p.status in {PaymentStatus.PENDING.value, PaymentStatus.FAILED.value}),
            None,
        )
        if pending_payment:
            pending_payment.status = PaymentStatus.PAID.value
            pending_payment.amount_cents = amount_cents
            pending_payment.reference_number = reference_number
            if method:
                pending_payment.method = method
            payment = pending_payment
        else:
            payment = Payment(
                order_id=order.id,
                method=method,
                status=PaymentStatus.PAID.value,
                amount_cents=amount_cents,
                reference_number=reference_number,
            )
            db.session.add(payment)
        db.session.commit()

        # Create buyer notification & email
        formatted_total = f"₱{amount_cents / 100:,.2f}"
        create_notification(
            user_id=order.user_id,
            title="Payment Confirmed",
            message=f"Payment of {formatted_total} for order #{order_number} was successfully received.",
            notif_type="payment",
            data={"order_number": order_number, "payment_ref": reference_number},
        )

        notify_admins(
            title="Order Paid",
            message=f"Order #{order_number} paid in full ({formatted_total}) via {method.upper()}.",
            notif_type="operational",
            data={"order_number": order_number},
        )

        if order.user and order.user.email:
            email_service.send_email(
                to_email=order.user.email,
                subject=f"Payment Received for Order #{order_number} | SecondMarket",
                body_text=f"Your payment of {formatted_total} for Order #{order_number} has been verified and confirmed.",
            )

        return payment

    def issue_refund(
        self,
        order: Order,
        amount_cents: int | None = None,
        reason: str = "requested_by_customer",
        commit: bool = True,
    ) -> dict:
        if not order:
            raise PaymentServiceError("Order not found.", code="order_not_found", status_code=404)

        target_amount = int(order.total_cents if amount_cents is None else amount_cents)
        if target_amount < 0 or target_amount > int(order.total_cents or 0):
            raise PaymentServiceError(
                f"Refund amount cannot exceed order total (₱{(order.total_cents or 0) / 100:,.2f}).",
                code="invalid_refund_amount",
                status_code=422,
            )

        existing_refund = next(
            (
                p
                for p in (order.payments or [])
                if p.method == "refund" and p.status == PaymentStatus.REFUNDED.value
            ),
            None,
        )
        if existing_refund or order.payment_status == PaymentStatus.REFUNDED.value:
            existing_ref = existing_refund.reference_number if existing_refund else None
            return {
                "already_refunded": True,
                "gateway": "stripe" if (existing_ref or "").startswith("re_") else "manual",
                "status": "succeeded",
                "refund_id": existing_ref,
                "amount_cents": existing_refund.amount_cents if existing_refund else target_amount,
                "payment": existing_refund,
            }

        stripe_paid_payment = next(
            (
                p
                for p in (order.payments or [])
                if p.method in {"credit_debit_card", "stripe"}
                and p.status == PaymentStatus.PAID.value
            ),
            None,
        )

        gateway = "manual"
        gateway_status = "succeeded"
        refund_ref = f"REF-{uuid.uuid4().hex[:10].upper()}"

        if stripe_paid_payment and target_amount > 0:
            stripe_provider = self.get_provider("credit_debit_card")
            stripe_result = stripe_provider.refund_payment(
                order,
                amount_cents=target_amount,
                reason=reason,
                source_payment=stripe_paid_payment,
            )
            gateway = "stripe"
            gateway_status = stripe_result["status"]
            refund_ref = stripe_result["refund_id"]

        order.payment_status = PaymentStatus.REFUNDED.value
        for payment in (order.payments or []):
            if payment.status == PaymentStatus.PAID.value:
                payment.status = PaymentStatus.REFUNDED.value

        refund_payment = Payment(
            order_id=order.id,
            method="refund",
            status=PaymentStatus.REFUNDED.value,
            amount_cents=target_amount,
            reference_number=refund_ref,
        )
        db.session.add(refund_payment)
        if commit:
            db.session.commit()

        return {
            "already_refunded": False,
            "gateway": gateway,
            "status": gateway_status,
            "refund_id": refund_ref,
            "amount_cents": target_amount,
            "payment": refund_payment,
        }


payment_service = PaymentService()
