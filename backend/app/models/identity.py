import hashlib
import re
from enum import StrEnum

from sqlalchemy.orm import validates

from backend.app.auth.rbac import Role, is_staff_role, is_valid_role, permissions_for_role
from backend.app.auth.security import hash_password, verify_password
from backend.app.extensions import db
from backend.app.models.base import IntPrimaryKeyMixin, TimestampMixin, coerce_aware, utc_now


EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class UserStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"
    PENDING_VERIFICATION = "pending_verification"


DEFAULT_NOTIFICATION_PREFERENCES = {
    "order_updates": True,
    "shipping_alerts": True,
    "promotional_emails": False,
    "security_alerts": True,
}

DEFAULT_PAYMENT_PREFERENCES = {
    "enabled_methods": ["cash_on_delivery", "gcash_pending", "credit_debit_card"],
    "gcash_mobile": None,
}


class User(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "users"

    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(32), nullable=False, default=Role.BUYER.value, index=True)
    status = db.Column(db.String(32), nullable=False, default=UserStatus.ACTIVE.value, index=True)
    first_name = db.Column(db.String(80), nullable=False)
    last_name = db.Column(db.String(80), nullable=False)
    phone = db.Column(db.String(40), nullable=True)
    avatar_url = db.Column(db.String(500), nullable=True)
    email_verified = db.Column(db.Boolean, nullable=False, default=True, server_default="true")
    theme_preference = db.Column(db.String(20), nullable=False, default="light", server_default="light")
    preferred_payment_method = db.Column(
        db.String(40),
        nullable=False,
        default="cash_on_delivery",
        server_default="cash_on_delivery",
    )
    payment_preferences = db.Column(db.JSON, nullable=True)
    notification_preferences = db.Column(db.JSON, nullable=True)

    sessions = db.relationship(
        "AuthSession",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    addresses = db.relationship(
        "Address",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    password_reset_tokens = db.relationship(
        "PasswordResetToken",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    products = db.relationship("Product", back_populates="seller", lazy="selectin")
    wishlist_items = db.relationship("WishlistItem", back_populates="user", cascade="all, delete-orphan", lazy="selectin")
    carts = db.relationship("Cart", back_populates="user", cascade="all, delete-orphan", lazy="selectin")
    orders = db.relationship("Order", back_populates="user", lazy="selectin")
    reviews = db.relationship("Review", back_populates="user", cascade="all, delete-orphan", lazy="selectin")
    product_reports = db.relationship(
        "ProductReport",
        foreign_keys="ProductReport.reporter_id",
        back_populates="reporter",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    @validates("email")
    def validate_email(self, key, value):
        normalized = (value or "").strip().lower()
        if not EMAIL_PATTERN.match(normalized):
            raise ValueError("A valid email address is required.")
        return normalized

    @validates("role")
    def validate_role(self, key, value):
        if not is_valid_role(value):
            raise ValueError("User role is not supported.")
        return value

    @validates("status")
    def validate_status(self, key, value):
        if value not in {status.value for status in UserStatus}:
            raise ValueError("User status is not supported.")
        return value

    def set_password(self, password):
        self.password_hash = hash_password(password)

    def check_password(self, password):
        return verify_password(self.password_hash, password)

    def has_role(self, role):
        return self.role == role

    @property
    def is_active(self):
        return self.status == UserStatus.ACTIVE.value

    def resolved_notification_preferences(self):
        merged = dict(DEFAULT_NOTIFICATION_PREFERENCES)
        if isinstance(self.notification_preferences, dict):
            for key in DEFAULT_NOTIFICATION_PREFERENCES:
                if key in self.notification_preferences:
                    merged[key] = bool(self.notification_preferences[key])
        merged["security_alerts"] = True
        return merged

    def resolved_payment_preferences(self):
        merged = dict(DEFAULT_PAYMENT_PREFERENCES)
        if isinstance(self.payment_preferences, dict):
            enabled = self.payment_preferences.get("enabled_methods")
            if isinstance(enabled, list) and enabled:
                merged["enabled_methods"] = [
                    str(m) for m in enabled if m in {"cash_on_delivery", "gcash_pending", "credit_debit_card"}
                ]
                if not merged["enabled_methods"]:
                    merged["enabled_methods"] = ["cash_on_delivery"]
            if "gcash_mobile" in self.payment_preferences:
                merged["gcash_mobile"] = self.payment_preferences.get("gcash_mobile")
        return merged

    def to_public_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "role": self.role,
            "is_staff": is_staff_role(self.role),
            "capabilities": permissions_for_role(self.role),
            "status": self.status,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "full_name": f"{self.first_name} {self.last_name}".strip(),
            "phone": self.phone,
            "avatar_url": self.avatar_url,
            "email_verified": bool(self.email_verified if self.email_verified is not None else True),
            "theme_preference": self.theme_preference or "light",
            "preferred_payment_method": self.preferred_payment_method or "cash_on_delivery",
            "payment_preferences": self.resolved_payment_preferences(),
            "notification_preferences": self.resolved_notification_preferences(),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class AuthSession(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "auth_sessions"

    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    user_agent = db.Column(db.String(255), nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False, index=True)
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=True)

    user = db.relationship("User", back_populates="sessions")

    @staticmethod
    def hash_token(token):
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @classmethod
    def from_token(cls, token, **kwargs):
        return cls(token_hash=cls.hash_token(token), **kwargs)

    @property
    def is_revoked(self):
        return self.revoked_at is not None

    @property
    def is_expired(self):
        return coerce_aware(self.expires_at) <= utc_now()

    @property
    def is_valid(self):
        return not self.is_revoked and not self.is_expired

    def revoke(self):
        self.revoked_at = utc_now()

    def to_dict(self, current_session_id=None):
        return {
            "id": self.id,
            "user_agent": self.user_agent or "Browser Session",
            "ip_address": self.ip_address or "127.0.0.1",
            "is_current": self.id == current_session_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }


class Address(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "addresses"

    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    label = db.Column(db.String(50), nullable=True, default="Home")
    recipient_name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(40), nullable=False)
    street_line1 = db.Column(db.String(255), nullable=False)
    street_line2 = db.Column(db.String(255), nullable=True)
    city = db.Column(db.String(100), nullable=False)
    state_or_province = db.Column(db.String(100), nullable=False)
    postal_code = db.Column(db.String(20), nullable=False)
    country = db.Column(db.String(60), nullable=False, default="Philippines")
    delivery_instructions = db.Column(db.String(500), nullable=True)
    is_default = db.Column(db.Boolean, nullable=False, default=False)

    user = db.relationship("User", back_populates="addresses")

    def to_dict(self):
        return {
            "id": self.id,
            "label": self.label or "Home",
            "recipient_name": self.recipient_name,
            "phone": self.phone,
            "street_line1": self.street_line1,
            "street_line2": self.street_line2,
            "address_line1": self.street_line1,
            "address_line2": self.street_line2,
            "city": self.city,
            "state_or_province": self.state_or_province,
            "province": self.state_or_province,
            "postal_code": self.postal_code,
            "country": self.country or "Philippines",
            "delivery_instructions": self.delivery_instructions,
            "is_default": self.is_default,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class PasswordResetToken(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "password_reset_tokens"

    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False, index=True)
    used_at = db.Column(db.DateTime(timezone=True), nullable=True)

    user = db.relationship("User", back_populates="password_reset_tokens")

    @staticmethod
    def hash_token(token):
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @classmethod
    def from_token(cls, token, **kwargs):
        return cls(token_hash=cls.hash_token(token), **kwargs)

    @property
    def is_used(self):
        return self.used_at is not None

    @property
    def is_expired(self):
        return coerce_aware(self.expires_at) <= utc_now()

    @property
    def is_valid(self):
        return not self.is_used and not self.is_expired

    def mark_used(self):
        self.used_at = utc_now()

