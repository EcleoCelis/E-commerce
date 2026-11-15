from threading import Lock
from uuid import uuid4

from backend.app.cart.service import get_or_create_active_cart, sync_cart_item_prices
from backend.app.extensions import db
from backend.app.models import (
    CartStatus,
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    PaymentStatus,
    Product,
    ProductStatus,
    ShippingRecord,
    ShippingStatus,
)


FREE_SHIPPING_THRESHOLD_CENTS = 300000
STANDARD_SHIPPING_CENTS = 4500

# In-memory bounded idempotency registry: (user_id, key) -> order_number
_CHECKOUT_IDEMPOTENCY_KEYS = {}
_CHECKOUT_IDEMPOTENCY_LOCK = Lock()
_MAX_IDEMPOTENCY_CACHE_SIZE = 2000


class CheckoutError(Exception):
    def __init__(self, message, status_code=400, code="checkout_error", details=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details or {}


def shipping_cents_for_subtotal(subtotal_cents):
    from backend.app.admin.settings import get_store_config

    config = get_store_config()
    threshold = int(config.get("free_shipping_threshold_cents", FREE_SHIPPING_THRESHOLD_CENTS))
    standard = int(config.get("standard_shipping_cents", STANDARD_SHIPPING_CENTS))
    if subtotal_cents >= threshold:
        return 0
    return standard


def validate_cart_for_checkout(cart):
    if not cart.items:
        raise CheckoutError(
            message="Your cart is empty.",
            status_code=409,
            code="cart_empty",
        )

    errors = {}
    for item in cart.items:
        product = item.product
        field_name = product.slug
        is_category_active = product.category is not None and bool(product.category.is_active)
        if not product.is_available or not is_category_active:
            errors.setdefault(field_name, []).append("Product is no longer available.")
        elif item.quantity > product.quantity:
            errors.setdefault(field_name, []).append(f"Only {product.quantity} item(s) are available.")

    if errors:
        raise CheckoutError(
            message="Some cart items are no longer available for checkout.",
            status_code=409,
            code="cart_not_checkout_ready",
            details={"items": errors},
        )


def build_checkout_draft(user, checkout_data):
    cart = get_or_create_active_cart(user)
    validate_cart_for_checkout(cart)

    subtotal_cents = cart.subtotal_cents
    shipping_cents = shipping_cents_for_subtotal(subtotal_cents)
    discount_cents = 0
    coupon_code = None

    raw_coupon = checkout_data.get("coupon_code")
    if raw_coupon:
        from backend.app.checkout.coupons import CouponError, validate_and_calculate_discount
        try:
            discount_result = validate_and_calculate_discount(raw_coupon, subtotal_cents, user_id=user.id)
            discount_cents = discount_result["discount_cents"]
            coupon_code = discount_result["code"]
        except CouponError as exc:
            raise CheckoutError(message=exc.message, status_code=exc.status_code, code=exc.code)

    total_cents = max(0, subtotal_cents - discount_cents) + shipping_cents

    return {
        "cart": cart,
        "shipping_address": checkout_data["shipping_address"],
        "payment_method": checkout_data["payment_method"],
        "subtotal_cents": subtotal_cents,
        "shipping_cents": shipping_cents,
        "discount_cents": discount_cents,
        "coupon_code": coupon_code,
        "total_cents": total_cents,
    }


def generate_order_number():
    return f"SM-{uuid4().hex[:10].upper()}"


def place_checkout_order(user, checkout_data, idempotency_key=None):
    key = (idempotency_key or checkout_data.get("idempotency_key") or "").strip()
    if key:
        with _CHECKOUT_IDEMPOTENCY_LOCK:
            existing_order_number = _CHECKOUT_IDEMPOTENCY_KEYS.get((user.id, key))
        if existing_order_number:
            existing_order = Order.query.filter_by(
                order_number=existing_order_number,
                user_id=user.id,
            ).one_or_none()
            if existing_order is not None:
                return existing_order

    draft = build_checkout_draft(user, checkout_data)
    if checkout_data["payment_method"] == "credit_debit_card":
        from backend.app.checkout.payment_service import is_stripe_configured

        if not is_stripe_configured():
            raise CheckoutError(
                "Stripe Test Mode is not configured yet. Set STRIPE_SECRET_KEY in your environment to enable card payments.",
                status_code=503,
                code="stripe_not_configured",
            )

    cart = draft["cart"]
    sync_cart_item_prices(cart)
    shipping_address = draft["shipping_address"]

    order = Order(
        user=user,
        order_number=generate_order_number(),
        status=OrderStatus.CONFIRMED.value,
        payment_status=PaymentStatus.PENDING.value,
        shipping_status=ShippingStatus.NOT_READY.value,
        subtotal_cents=draft["subtotal_cents"],
        shipping_cents=draft["shipping_cents"],
        discount_cents=draft["discount_cents"],
        coupon_code=draft["coupon_code"],
        total_cents=draft["total_cents"],
    )
    order.mark_placed()

    with db.session.no_autoflush:
        for cart_item in cart.items:
            product = cart_item.product
            updated_rows = Product.query.filter(
                Product.id == product.id,
                Product.quantity >= cart_item.quantity,
                Product.status == ProductStatus.AVAILABLE.value,
            ).update(
                {
                    Product.quantity: Product.quantity - cart_item.quantity,
                    Product.status: db.case(
                        (Product.quantity - cart_item.quantity <= 0, ProductStatus.SOLD.value),
                        else_=ProductStatus.AVAILABLE.value,
                    ),
                },
                synchronize_session=False,
            )
            if updated_rows == 0:
                db.session.rollback()
                raise CheckoutError(
                    message="Some cart items are no longer available for checkout.",
                    status_code=409,
                    code="cart_not_checkout_ready",
                    details={"items": {product.slug: ["Requested quantity is no longer available."]}},
                )
            db.session.expire(product)

            order.items.append(
                OrderItem(
                    product_id=product.id,
                    product_title=product.title,
                    quantity=cart_item.quantity,
                    unit_price_cents=cart_item.unit_price_cents,
                )
            )

    order.payments.append(
        Payment(
            method=checkout_data["payment_method"],
            status=PaymentStatus.PENDING.value,
            amount_cents=draft["total_cents"],
            reference_number=f"PAY-{uuid4().hex[:12].upper()}",
        )
    )
    order.shipping_record = ShippingRecord(
        recipient_name=shipping_address["recipient_name"],
        phone=shipping_address["phone"],
        address_line1=shipping_address["address_line1"],
        address_line2=shipping_address.get("address_line2"),
        city=shipping_address["city"],
        province=shipping_address["province"],
        postal_code=shipping_address["postal_code"],
        country=shipping_address.get("country") or "Philippines",
        status=ShippingStatus.NOT_READY.value,
    )
    cart.status = CartStatus.CHECKED_OUT.value

    db.session.add(order)
    db.session.flush()

    if draft["coupon_code"] and draft["discount_cents"] > 0:
        from backend.app.checkout.coupons import CouponError, record_coupon_redemption

        try:
            record_coupon_redemption(
                draft["coupon_code"],
                order.id,
                user.id,
                draft["discount_cents"],
                commit=False,
            )
        except CouponError as exc:
            db.session.rollback()
            raise CheckoutError(exc.message, status_code=exc.status_code, code=exc.code) from exc

    if checkout_data["payment_method"] == "credit_debit_card":
        from backend.app.checkout.payment_service import PaymentServiceError, payment_service

        try:
            payment_service.create_payment_intent(order, "credit_debit_card", commit=False)
        except PaymentServiceError as exc:
            db.session.rollback()
            raise CheckoutError(exc.message, status_code=exc.status_code, code=exc.code) from exc

    db.session.commit()

    if key:
        with _CHECKOUT_IDEMPOTENCY_LOCK:
            if len(_CHECKOUT_IDEMPOTENCY_KEYS) >= _MAX_IDEMPOTENCY_CACHE_SIZE:
                _CHECKOUT_IDEMPOTENCY_KEYS.clear()
            _CHECKOUT_IDEMPOTENCY_KEYS[(user.id, key)] = order.order_number

    from backend.app.communication import create_notification, email_service, notify_admins
    formatted_total = f"₱{order.total_cents / 100:,.2f}"
    create_notification(
        user_id=user.id,
        title="Order Confirmed",
        message=f"Your order #{order.order_number} has been placed successfully for {formatted_total}.",
        notif_type="order",
        data={"order_number": order.order_number},
    )
    notify_admins(
        title="New Order Placed",
        message=f"Order #{order.order_number} ({formatted_total}) placed by {user.first_name} {user.last_name}.",
        notif_type="operational",
        data={"order_number": order.order_number},
    )
    if user.email:
        email_service.send_order_confirmation(user.email, order.order_number, formatted_total)

    return order
