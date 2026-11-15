from datetime import timedelta
from pathlib import Path
import secrets

from flask import current_app
from sqlalchemy.exc import IntegrityError

from backend.app.auth.rbac import Role
from backend.app.core.security.uploads import ImageUploadError, process_and_save_image
from backend.app.extensions import db
from backend.app.models import Address, AuthSession, Order, OrderStatus, PasswordResetToken, User, UserStatus, WishlistItem
from backend.app.models.base import utc_now


class AuthError(Exception):
    def __init__(self, message, code="auth_error", status_code=400, details=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}


def register_buyer(data):
    if data["role"] != Role.BUYER.value:
        raise AuthError(
            "Only buyer registration is available publicly.",
            code="role_not_allowed",
            status_code=403,
            details={"role": ["Admin accounts must be created through an administrative workflow."]},
        )

    user = User(
        email=data["email"],
        role=Role.BUYER.value,
        status=UserStatus.ACTIVE.value,
        first_name=data["first_name"],
        last_name=data["last_name"],
        phone=data.get("phone"),
    )
    user.set_password(data["password"])

    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        raise AuthError(
            "An account with this email already exists.",
            code="email_already_registered",
            status_code=409,
            details={"email": ["An account with this email already exists."]},
        ) from exc

    return user


def authenticate_user(email, password):
    user = User.query.filter_by(email=email).one_or_none()
    if user is None or not user.check_password(password):
        raise AuthError("Invalid email or password.", code="invalid_credentials", status_code=401)

    if not user.is_active:
        raise AuthError("This account is not active.", code="account_not_active", status_code=403)

    return user


def create_auth_session(user, *, user_agent=None, ip_address=None, duration_days=7):
    token = secrets.token_urlsafe(48)
    session = AuthSession.from_token(
        token,
        user=user,
        user_agent=(user_agent or "")[:255] or None,
        ip_address=ip_address,
        expires_at=utc_now() + timedelta(days=duration_days),
    )
    db.session.add(session)
    db.session.commit()
    return token, session


def find_session_by_token(token):
    if not token:
        return None

    token_hash = AuthSession.hash_token(token)
    session = AuthSession.query.filter_by(token_hash=token_hash).one_or_none()
    if session is None or not session.is_valid or not session.user.is_active:
        return None

    return session


def revoke_session(session):
    session.revoke()
    db.session.commit()


def request_password_reset(email, expires_in_minutes=60):
    user = User.query.filter_by(email=email.strip().lower()).one_or_none()
    if user is None or not user.is_active:
        return None, None

    raw_token = secrets.token_urlsafe(32)
    expires_at = utc_now() + timedelta(minutes=expires_in_minutes)
    token_record = PasswordResetToken.from_token(
        raw_token,
        user=user,
        expires_at=expires_at,
    )
    db.session.add(token_record)
    db.session.commit()
    return raw_token, user


def reset_password_with_token(raw_token, new_password):
    token_hash = PasswordResetToken.hash_token(raw_token)
    token_record = PasswordResetToken.query.filter_by(token_hash=token_hash).one_or_none()
    if token_record is None or not token_record.is_valid:
        raise AuthError(
            "Password reset token is invalid or has expired.",
            code="invalid_reset_token",
            status_code=400,
        )

    user = token_record.user
    user.set_password(new_password)
    token_record.mark_used()

    # Invalidate all existing active sessions for security
    for session in user.sessions:
        session.revoke()

    db.session.commit()
    return user


def change_user_password(user, current_password, new_password, current_session=None):
    if not user.check_password(current_password):
        raise AuthError(
            "Current password is incorrect.",
            code="invalid_current_password",
            status_code=400,
        )

    user.set_password(new_password)

    # Invalidate other sessions
    for session in user.sessions:
        if current_session is None or session.id != current_session.id:
            session.revoke()

    db.session.commit()
    return user


def update_user_profile(user, data):
    if "email" in data and data["email"] != user.email:
        existing = User.query.filter(User.email == data["email"], User.id != user.id).one_or_none()
        if existing is not None:
            raise AuthError(
                "An account with this email already exists.",
                code="email_already_registered",
                status_code=409,
                details={"email": ["An account with this email already exists."]},
            )
        user.email = data["email"]

    if "first_name" in data:
        user.first_name = data["first_name"]
    if "last_name" in data:
        user.last_name = data["last_name"]
    if "phone" in data:
        user.phone = data["phone"]
    if "theme_preference" in data:
        user.theme_preference = data["theme_preference"]
    if "preferred_payment_method" in data:
        user.preferred_payment_method = data["preferred_payment_method"]

    if "payment_preferences" in data and isinstance(data["payment_preferences"], dict):
        merged_pay = user.resolved_payment_preferences()
        pay_in = data["payment_preferences"]
        if "preferred_payment_method" in pay_in:
            user.preferred_payment_method = pay_in["preferred_payment_method"]
        if "enabled_methods" in pay_in:
            merged_pay["enabled_methods"] = pay_in["enabled_methods"]
        if "gcash_mobile" in pay_in:
            merged_pay["gcash_mobile"] = pay_in["gcash_mobile"]
        if user.preferred_payment_method not in merged_pay["enabled_methods"]:
            merged_pay["enabled_methods"].append(user.preferred_payment_method)
        user.payment_preferences = merged_pay

    if "notification_preferences" in data and isinstance(data["notification_preferences"], dict):
        merged_notif = user.resolved_notification_preferences()
        for k, v in data["notification_preferences"].items():
            if k in merged_notif:
                merged_notif[k] = bool(v)
        merged_notif["security_alerts"] = True
        user.notification_preferences = merged_notif

    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        raise AuthError(
            "An account with this email already exists.",
            code="email_already_registered",
            status_code=409,
            details={"email": ["An account with this email already exists."]},
        ) from exc

    return user


def update_user_payment_preferences(user, data):
    merged_pay = user.resolved_payment_preferences()
    if "preferred_payment_method" in data:
        user.preferred_payment_method = data["preferred_payment_method"]
    if "enabled_methods" in data:
        merged_pay["enabled_methods"] = data["enabled_methods"]
    if "gcash_mobile" in data:
        merged_pay["gcash_mobile"] = data["gcash_mobile"]

    if user.preferred_payment_method not in merged_pay["enabled_methods"]:
        merged_pay["enabled_methods"].append(user.preferred_payment_method)

    user.payment_preferences = merged_pay
    db.session.commit()
    return user


def _delete_local_avatar_file(avatar_url):
    if not avatar_url or not str(avatar_url).startswith("/static/uploads/avatars/"):
        return
    try:
        frontend_root = Path(current_app.config.get("FRONTEND_ROOT", "frontend")).resolve()
        avatars_root = (frontend_root / "static" / "uploads" / "avatars").resolve()
        relative_part = str(avatar_url).lstrip("/")
        file_path = (frontend_root / relative_part).resolve()
        if str(file_path).startswith(str(avatars_root)) and file_path.is_file():
            file_path.unlink(missing_ok=True)
    except Exception:
        pass


def upload_user_avatar(user, file_storage):
    if not file_storage or not file_storage.filename:
        raise AuthError(
            "Please select an image file to upload.",
            code="missing_image_file",
            status_code=400,
        )

    ext = Path(file_storage.filename).suffix.lower()
    allowed_avatar_exts = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    if ext not in allowed_avatar_exts:
        raise AuthError(
            "Profile picture must be a JPEG, PNG, WebP, or GIF image.",
            code="invalid_image_type",
            status_code=422,
            details={"avatar": ["Profile picture must be a JPEG, PNG, WebP, or GIF image."]},
        )

    # Check size <= 30MB before processing
    stream = file_storage.stream
    stream.seek(0, 2)
    size_bytes = stream.tell()
    stream.seek(0)
    max_avatar_bytes = 30 * 1024 * 1024
    if size_bytes > max_avatar_bytes:
        raise AuthError(
            "Profile picture exceeds the 30 MB maximum file size.",
            code="file_too_large",
            status_code=413,
            details={"avatar": ["Profile picture exceeds the 30 MB maximum file size."]},
        )

    old_avatar_url = user.avatar_url
    try:
        upload_result = process_and_save_image(
            file_storage,
            subfolder="avatars",
            base_stem=f"user_{user.id}",
        )
    except ImageUploadError as exc:
        raise AuthError(
            exc.message,
            code=exc.code,
            status_code=exc.status_code,
            details={"avatar": [exc.message]},
        ) from exc

    user.avatar_url = upload_result["image_url"]
    db.session.commit()

    if old_avatar_url and old_avatar_url != user.avatar_url:
        _delete_local_avatar_file(old_avatar_url)

    return user


def remove_user_avatar(user):
    old_avatar_url = user.avatar_url
    user.avatar_url = None
    db.session.commit()

    if old_avatar_url:
        _delete_local_avatar_file(old_avatar_url)

    return user


def list_user_addresses(user_id):
    return Address.query.filter_by(user_id=user_id).order_by(Address.is_default.desc(), Address.created_at.desc()).all()


def create_user_address(user_id, data):
    existing_count = Address.query.filter_by(user_id=user_id).count()
    is_default = data.get("is_default", False) or existing_count == 0

    if is_default and existing_count > 0:
        Address.query.filter_by(user_id=user_id).update({"is_default": False})

    address = Address(
        user_id=user_id,
        label=data.get("label") or "Home",
        recipient_name=data["recipient_name"],
        phone=data["phone"],
        street_line1=data["street_line1"],
        street_line2=data.get("street_line2"),
        city=data["city"],
        state_or_province=data["state_or_province"],
        postal_code=data["postal_code"],
        country=data.get("country") or "Philippines",
        delivery_instructions=data.get("delivery_instructions"),
        is_default=is_default,
    )
    db.session.add(address)
    db.session.commit()
    return address


def update_user_address(address_id, user_id, data):
    address = Address.query.filter_by(id=address_id, user_id=user_id).one_or_none()
    if address is None:
        raise AuthError("Address was not found.", code="address_not_found", status_code=404)

    if data.get("is_default") and not address.is_default:
        Address.query.filter_by(user_id=user_id).update({"is_default": False})
        address.is_default = True
    elif "is_default" in data and data["is_default"] is False and address.is_default:
        # Keep at least one default if possible
        other = Address.query.filter(Address.user_id == user_id, Address.id != address.id).order_by(Address.created_at.desc()).first()
        if other:
            address.is_default = False
            other.is_default = True

    for field in [
        "label",
        "recipient_name",
        "phone",
        "street_line1",
        "street_line2",
        "city",
        "state_or_province",
        "postal_code",
        "country",
        "delivery_instructions",
    ]:
        if field in data:
            if field in ("street_line2", "delivery_instructions") or data[field] is not None:
                setattr(address, field, data[field])

    db.session.commit()
    return address


def delete_user_address(address_id, user_id):
    address = Address.query.filter_by(id=address_id, user_id=user_id).one_or_none()
    if address is None:
        raise AuthError("Address was not found.", code="address_not_found", status_code=404)

    was_default = address.is_default
    db.session.delete(address)
    db.session.flush()

    if was_default:
        next_address = Address.query.filter_by(user_id=user_id).order_by(Address.created_at.desc()).first()
        if next_address:
            next_address.is_default = True

    db.session.commit()
    return True


def set_default_user_address(address_id, user_id):
    address = Address.query.filter_by(id=address_id, user_id=user_id).one_or_none()
    if address is None:
        raise AuthError("Address was not found.", code="address_not_found", status_code=404)

    Address.query.filter_by(user_id=user_id).update({"is_default": False})
    address.is_default = True
    db.session.commit()
    return address


def list_active_user_sessions(user, current_session=None):
    current_id = current_session.id if current_session else None
    active = [s for s in user.sessions if s.is_valid]
    active.sort(key=lambda s: (s.id != current_id, -(s.created_at.timestamp() if s.created_at else 0)))
    return [s.to_dict(current_session_id=current_id) for s in active]


def revoke_other_user_sessions(user, current_session=None):
    revoked_count = 0
    for session in user.sessions:
        if session.is_valid and (current_session is None or session.id != current_session.id):
            session.revoke()
            revoked_count += 1
    db.session.commit()
    return revoked_count


def revoke_user_session_by_id(user, session_id, current_session=None):
    target = AuthSession.query.filter_by(id=session_id, user_id=user.id).one_or_none()
    if target is None:
        raise AuthError("Session was not found.", code="session_not_found", status_code=404)
    target.revoke()
    db.session.commit()
    return target


def deactivate_user_account(user, password):
    if not user.check_password(password):
        raise AuthError(
            "Current password is incorrect.",
            code="invalid_current_password",
            status_code=400,
            details={"password": ["Current password is incorrect."]},
        )

    user.status = UserStatus.DISABLED.value
    for session in user.sessions:
        if not session.is_revoked:
            session.revoke()
    db.session.commit()
    return user


def get_payment_methods_catalog():
    return [
        {
            "code": "cash_on_delivery",
            "label": "Cash on Delivery (COD)",
            "description": "Pay in cash directly to the courier upon physical delivery of your inspected secondhand item.",
            "supported": True,
            "badge": "Supported at Checkout",
        },
        {
            "code": "gcash_pending",
            "label": "GCash e-Wallet Reference",
            "description": "Pay via GCash transfer/sandbox gateway with verified payment reference confirmation.",
            "supported": True,
            "badge": "Supported at Checkout",
        },
        {
            "code": "credit_debit_card",
            "label": "Credit / Debit Card (Stripe)",
            "description": "Pay securely via Stripe hosted Checkout (cards stay on Stripe; test cards supported in Test Mode).",
            "supported": True,
            "badge": "Supported at Checkout",
        },
        {
            "code": "maya_wallet",
            "label": "Maya e-Wallet",
            "description": "Maya direct checkout integration is not enabled for this storefront.",
            "supported": False,
            "badge": "Unavailable in Checkout",
        },
    ]


def get_user_profile_summary(user, current_session=None):
    from backend.app.communication import get_user_unread_notification_count
    from backend.app.orders.serializers import serialize_order_summary

    addresses = list_user_addresses(user.id)
    orders_query = Order.query.filter_by(user_id=user.id).order_by(Order.placed_at.desc(), Order.id.desc())
    all_orders = orders_query.all()
    recent_orders = [serialize_order_summary(order) for order in all_orders[:5]]
    active_orders_count = sum(
        1 for o in all_orders if o.status in {OrderStatus.PENDING.value, OrderStatus.CONFIRMED.value, OrderStatus.PROCESSING.value, OrderStatus.SHIPPED.value}
    )
    wishlist_count = WishlistItem.query.filter_by(user_id=user.id).count()
    unread_notifications = get_user_unread_notification_count(user.id)

    return {
        "user": user.to_public_dict(),
        "stats": {
            "orders_count": len(all_orders),
            "active_orders_count": active_orders_count,
            "addresses_count": len(addresses),
            "wishlist_count": wishlist_count,
            "unread_notifications_count": unread_notifications,
        },
        "addresses": [a.to_dict() for a in addresses],
        "recent_orders": recent_orders,
        "active_sessions": list_active_user_sessions(user, current_session=current_session),
        "payment_methods_catalog": get_payment_methods_catalog(),
    }

