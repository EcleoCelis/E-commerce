from enum import StrEnum

from sqlalchemy import CheckConstraint, UniqueConstraint
from sqlalchemy.orm import validates

from backend.app.extensions import db
from backend.app.models.base import IntPrimaryKeyMixin, TimestampMixin, utc_now


class CartStatus(StrEnum):
    ACTIVE = "active"
    CHECKED_OUT = "checked_out"
    ABANDONED = "abandoned"


class OrderStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PROCESSING = "processing"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class PaymentStatus(StrEnum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"


class ShippingStatus(StrEnum):
    NOT_READY = "not_ready"
    READY = "ready"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    RETURNED = "returned"


def validate_nonnegative_amount(value, field_name):
    if value < 0:
        raise ValueError(f"{field_name} cannot be negative.")
    return value


def validate_positive_quantity(value):
    if value < 1:
        raise ValueError("Quantity must be at least 1.")
    return value


class Cart(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "carts"

    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = db.Column(db.String(32), nullable=False, default=CartStatus.ACTIVE.value, index=True)

    user = db.relationship("User", back_populates="carts")
    items = db.relationship("CartItem", back_populates="cart", cascade="all, delete-orphan", lazy="selectin")

    @validates("status")
    def validate_status(self, key, value):
        if value not in {status.value for status in CartStatus}:
            raise ValueError("Cart status is not supported.")
        return value

    @property
    def subtotal_cents(self):
        return sum(item.line_total_cents for item in self.items)


class CartItem(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "cart_items"
    __table_args__ = (
        CheckConstraint("quantity >= 1", name="ck_cart_items_quantity_positive"),
        UniqueConstraint("cart_id", "product_id", name="uq_cart_items_cart_product"),
    )

    cart_id = db.Column(db.Integer, db.ForeignKey("carts.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    unit_price_cents = db.Column(db.Integer, nullable=False)

    cart = db.relationship("Cart", back_populates="items")
    product = db.relationship("Product")

    @validates("quantity")
    def validate_quantity(self, key, value):
        return validate_positive_quantity(value)

    @validates("unit_price_cents")
    def validate_unit_price(self, key, value):
        return validate_nonnegative_amount(value, "Unit price")

    @property
    def line_total_cents(self):
        return self.quantity * self.unit_price_cents


class Order(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint("subtotal_cents >= 0", name="ck_orders_subtotal_nonnegative"),
        CheckConstraint("shipping_cents >= 0", name="ck_orders_shipping_nonnegative"),
        CheckConstraint("discount_cents >= 0", name="ck_orders_discount_nonnegative"),
        CheckConstraint("total_cents >= 0", name="ck_orders_total_nonnegative"),
    )

    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    order_number = db.Column(db.String(40), nullable=False, unique=True, index=True)
    status = db.Column(db.String(32), nullable=False, default=OrderStatus.PENDING.value, index=True)
    payment_status = db.Column(db.String(32), nullable=False, default=PaymentStatus.PENDING.value, index=True)
    shipping_status = db.Column(db.String(32), nullable=False, default=ShippingStatus.NOT_READY.value, index=True)
    subtotal_cents = db.Column(db.Integer, nullable=False, default=0)
    shipping_cents = db.Column(db.Integer, nullable=False, default=0)
    discount_cents = db.Column(db.Integer, nullable=False, default=0)
    total_cents = db.Column(db.Integer, nullable=False, default=0)
    coupon_code = db.Column(db.String(50), nullable=True)
    admin_notes = db.Column(db.Text, nullable=True)
    placed_at = db.Column(db.DateTime(timezone=True), nullable=True)

    user = db.relationship("User", back_populates="orders")
    items = db.relationship("OrderItem", back_populates="order", cascade="all, delete-orphan", lazy="selectin")
    payments = db.relationship("Payment", back_populates="order", cascade="all, delete-orphan", lazy="selectin")
    shipping_record = db.relationship("ShippingRecord", back_populates="order", uselist=False, cascade="all, delete-orphan")
    reviews = db.relationship("Review", back_populates="order", lazy="selectin")

    @validates("status")
    def validate_order_status(self, key, value):
        if value not in {status.value for status in OrderStatus}:
            raise ValueError("Order status is not supported.")
        return value

    @validates("payment_status")
    def validate_payment_status(self, key, value):
        if value not in {status.value for status in PaymentStatus}:
            raise ValueError("Payment status is not supported.")
        return value

    @validates("shipping_status")
    def validate_shipping_status(self, key, value):
        if value not in {status.value for status in ShippingStatus}:
            raise ValueError("Shipping status is not supported.")
        return value

    @validates("subtotal_cents", "shipping_cents", "total_cents")
    def validate_amount(self, key, value):
        return validate_nonnegative_amount(value, key)

    def mark_placed(self):
        self.placed_at = utc_now()

    def recalculate_totals(self):
        self.subtotal_cents = sum(item.line_total_cents for item in self.items)
        discount = self.discount_cents or 0
        self.total_cents = max(0, self.subtotal_cents - discount) + self.shipping_cents


class OrderItem(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity >= 1", name="ck_order_items_quantity_positive"),
        CheckConstraint("unit_price_cents >= 0", name="ck_order_items_unit_price_nonnegative"),
    )

    order_id = db.Column(db.Integer, db.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    product_title = db.Column(db.String(180), nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    unit_price_cents = db.Column(db.Integer, nullable=False)

    order = db.relationship("Order", back_populates="items")
    product = db.relationship("Product")

    @validates("product_title")
    def validate_product_title(self, key, value):
        cleaned = (value or "").strip()
        if not cleaned:
            raise ValueError("Order item product title is required.")
        return cleaned

    @validates("quantity")
    def validate_quantity(self, key, value):
        return validate_positive_quantity(value)

    @validates("unit_price_cents")
    def validate_unit_price(self, key, value):
        return validate_nonnegative_amount(value, "Unit price")

    @property
    def line_total_cents(self):
        return self.quantity * self.unit_price_cents


class Payment(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "payments"

    order_id = db.Column(db.Integer, db.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    method = db.Column(db.String(40), nullable=False)
    status = db.Column(db.String(32), nullable=False, default=PaymentStatus.PENDING.value, index=True)
    amount_cents = db.Column(db.Integer, nullable=False)
    reference_number = db.Column(db.String(120), nullable=True, unique=True)

    order = db.relationship("Order", back_populates="payments")

    @validates("method")
    def validate_method(self, key, value):
        cleaned = (value or "").strip()
        if not cleaned:
            raise ValueError("Payment method is required.")
        return cleaned

    @validates("status")
    def validate_status(self, key, value):
        if value not in {status.value for status in PaymentStatus}:
            raise ValueError("Payment status is not supported.")
        return value

    @validates("amount_cents")
    def validate_amount(self, key, value):
        return validate_nonnegative_amount(value, "Payment amount")


class ShippingRecord(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "shipping_records"

    order_id = db.Column(db.Integer, db.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, unique=True)
    recipient_name = db.Column(db.String(160), nullable=False)
    phone = db.Column(db.String(40), nullable=False)
    address_line1 = db.Column(db.String(180), nullable=False)
    address_line2 = db.Column(db.String(180), nullable=True)
    city = db.Column(db.String(120), nullable=False)
    province = db.Column(db.String(120), nullable=False)
    postal_code = db.Column(db.String(20), nullable=False)
    country = db.Column(db.String(80), nullable=False, default="Philippines")
    tracking_number = db.Column(db.String(120), nullable=True, unique=True)
    carrier = db.Column(db.String(80), nullable=True)
    tracking_url = db.Column(db.String(500), nullable=True)
    status = db.Column(db.String(32), nullable=False, default=ShippingStatus.NOT_READY.value, index=True)

    order = db.relationship("Order", back_populates="shipping_record")

    @validates("recipient_name", "phone", "address_line1", "city", "province", "postal_code", "country")
    def validate_required_text(self, key, value):
        cleaned = (value or "").strip()
        if not cleaned:
            raise ValueError(f"Shipping {key} is required.")
        return cleaned

    @validates("status")
    def validate_status(self, key, value):
        if value not in {status.value for status in ShippingStatus}:
            raise ValueError("Shipping status is not supported.")
        return value


class DiscountType(StrEnum):
    FIXED = "fixed"
    PERCENTAGE = "percentage"


class Coupon(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "coupons"
    __table_args__ = (
        CheckConstraint("discount_value_cents > 0", name="ck_coupons_discount_positive"),
        CheckConstraint("min_spend_cents >= 0", name="ck_coupons_min_spend_nonnegative"),
    )

    code = db.Column(db.String(50), nullable=False, unique=True, index=True)
    discount_type = db.Column(db.String(20), nullable=False, default=DiscountType.FIXED.value)
    discount_value_cents = db.Column(db.Integer, nullable=False)
    min_spend_cents = db.Column(db.Integer, nullable=False, default=0)
    max_discount_cents = db.Column(db.Integer, nullable=True)
    usage_limit = db.Column(db.Integer, nullable=True)
    used_count = db.Column(db.Integer, nullable=False, default=0)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    valid_from = db.Column(db.DateTime(timezone=True), nullable=True)
    valid_until = db.Column(db.DateTime(timezone=True), nullable=True)

    redemptions = db.relationship("CouponRedemption", back_populates="coupon", cascade="all, delete-orphan", lazy="selectin")

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "discount_type": self.discount_type,
            "discount_value": self.discount_value_cents / 100,
            "min_spend": self.min_spend_cents / 100,
            "max_discount": (self.max_discount_cents / 100) if self.max_discount_cents else None,
            "usage_limit": self.usage_limit,
            "used_count": self.used_count,
            "is_active": self.is_active,
            "valid_from": self.valid_from.isoformat() if self.valid_from else None,
            "valid_until": self.valid_until.isoformat() if self.valid_until else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class CouponRedemption(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "coupon_redemptions"

    coupon_id = db.Column(db.Integer, db.ForeignKey("coupons.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    discount_cents = db.Column(db.Integer, nullable=False)

    coupon = db.relationship("Coupon", back_populates="redemptions")
    order = db.relationship("Order", backref=db.backref("coupon_redemption", uselist=False, lazy="selectin"))
    user = db.relationship("User", backref=db.backref("coupon_redemptions", lazy="selectin"))


class ReturnStatus(StrEnum):
    REQUESTED = "requested"
    APPROVED = "approved"
    REJECTED = "rejected"
    REFUNDED = "refunded"
    COMPLETED = "completed"


class ReturnRequest(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "return_requests"

    return_number = db.Column(db.String(32), nullable=False, unique=True, index=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reason = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(32), nullable=False, default=ReturnStatus.REQUESTED.value, index=True)
    refund_amount_cents = db.Column(db.Integer, nullable=False, default=0)
    admin_notes = db.Column(db.Text, nullable=True)

    order = db.relationship("Order", backref=db.backref("return_requests", cascade="all, delete-orphan", lazy="selectin"))
    user = db.relationship("User", backref=db.backref("return_requests", cascade="all, delete-orphan", lazy="selectin"))

    def to_dict(self):
        payments = list(self.order.payments or []) if self.order else []
        primary_payment = next((p for p in payments if p.method != "refund"), None)
        refund_payment = next(
            (
                p
                for p in reversed(payments)
                if p.method == "refund" or p.status == PaymentStatus.REFUNDED.value
            ),
            None,
        )
        refund_ref = refund_payment.reference_number if refund_payment else None
        return {
            "id": self.id,
            "return_number": self.return_number,
            "order_number": self.order.order_number if self.order else None,
            "order_total": (self.order.total_cents / 100) if self.order else None,
            "order_payment_status": self.order.payment_status if self.order else None,
            "payment_method": primary_payment.method if primary_payment else None,
            "refund_reference": refund_ref,
            "refund_gateway": "stripe" if (refund_ref or "").startswith("re_") else ("manual" if refund_ref else None),
            "user_id": self.user_id,
            "user_email": self.user.email if self.user else None,
            "reason": self.reason,
            "description": self.description,
            "status": self.status,
            "refund_amount": self.refund_amount_cents / 100,
            "admin_notes": self.admin_notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

