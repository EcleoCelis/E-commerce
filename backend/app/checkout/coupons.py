from datetime import datetime, timezone

from backend.app.extensions import db
from backend.app.models.base import utc_now
from backend.app.models.commerce import Coupon, CouponRedemption, DiscountType


def _as_utc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _parse_coupon_datetime(raw_value, *, end_of_day=False):
    if raw_value is None or raw_value == "":
        return None
    if isinstance(raw_value, datetime):
        return _as_utc(raw_value)
    text = str(raw_value).strip()
    if not text:
        return None
    is_date_only = len(text) == 10 and text[4] == "-" and text[7] == "-"
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        raise CouponError("Invalid coupon date format. Use ISO date or datetime (YYYY-MM-DD).", code="invalid_coupon_date", status_code=422)
    if is_date_only and end_of_day:
        parsed = parsed.replace(hour=23, minute=59, second=59)
    return _as_utc(parsed)


class CouponError(Exception):
    def __init__(self, message, code="coupon_error", status_code=400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


def validate_and_calculate_discount(code: str, subtotal_cents: int, user_id: int = None):
    cleaned_code = (code or "").strip().upper()
    if not cleaned_code:
        raise CouponError("Coupon code is required.", code="missing_coupon_code")

    coupon = Coupon.query.filter_by(code=cleaned_code).one_or_none()
    if not coupon:
        raise CouponError("Coupon code is not valid.", code="coupon_not_found", status_code=404)

    if not coupon.is_active:
        raise CouponError("This coupon is no longer active.", code="coupon_inactive")

    now = _as_utc(utc_now())
    valid_from = _as_utc(coupon.valid_from)
    valid_until = _as_utc(coupon.valid_until)
    if valid_from and now < valid_from:
        raise CouponError("This coupon is not active yet.", code="coupon_not_started")
    if valid_until and now > valid_until:
        raise CouponError("This coupon has expired.", code="coupon_expired")

    if coupon.usage_limit is not None and coupon.used_count >= coupon.usage_limit:
        raise CouponError("This coupon has reached its maximum usage limit.", code="coupon_usage_limit_reached")

    if subtotal_cents < coupon.min_spend_cents:
        min_spend_str = f"₱{coupon.min_spend_cents / 100:,.2f}"
        raise CouponError(
            f"Order subtotal must be at least {min_spend_str} to use this coupon.",
            code="coupon_min_spend_not_met",
        )

    if user_id:
        # Check single-use per buyer if configured
        previous_use = CouponRedemption.query.filter_by(coupon_id=coupon.id, user_id=user_id).first()
        if previous_use and coupon.usage_limit == 1:
            raise CouponError("You have already redeemed this coupon.", code="coupon_already_redeemed")

    # Calculate discount
    if coupon.discount_type == DiscountType.PERCENTAGE.value:
        # discount_value_cents is percentage in basis points (e.g. 1000 = 10%)
        # or stored as percentage integer 10 -> 10%
        pct = coupon.discount_value_cents / 100.0  # e.g. 15 for 15%
        raw_discount = int(round(subtotal_cents * (pct / 100.0)))
        if coupon.max_discount_cents:
            discount_cents = min(raw_discount, coupon.max_discount_cents)
        else:
            discount_cents = raw_discount
    else:
        # Fixed discount
        discount_cents = min(subtotal_cents, coupon.discount_value_cents)

    return {
        "coupon_id": coupon.id,
        "code": coupon.code,
        "discount_type": coupon.discount_type,
        "discount_cents": discount_cents,
        "discount_amount": discount_cents / 100,
        "new_subtotal_cents": max(0, subtotal_cents - discount_cents),
    }


def record_coupon_redemption(coupon_code: str, order_id: int, user_id: int, discount_cents: int, *, commit: bool = True):
    cleaned_code = (coupon_code or "").strip().upper()
    if not cleaned_code:
        return None

    coupon = Coupon.query.filter_by(code=cleaned_code).one_or_none()
    if not coupon:
        return None

    updated = Coupon.query.filter(
        Coupon.id == coupon.id,
        db.or_(Coupon.usage_limit.is_(None), Coupon.used_count < Coupon.usage_limit),
    ).update({Coupon.used_count: Coupon.used_count + 1}, synchronize_session=False)
    if updated == 0:
        raise CouponError("This coupon has reached its maximum usage limit.", code="coupon_usage_limit_reached", status_code=409)

    redemption = CouponRedemption(
        coupon_id=coupon.id,
        order_id=order_id,
        user_id=user_id,
        discount_cents=discount_cents,
    )
    db.session.add(redemption)
    if commit:
        db.session.commit()
    else:
        db.session.flush()
    return redemption


def _extract_coupon_fields(data: dict, *, partial: bool = False):
    fields = {}

    if not partial or "code" in data:
        code = (data.get("code") or "").strip().upper()
        if not code:
            raise CouponError("Coupon code is required.", code="missing_code", status_code=422)
        fields["code"] = code

    discount_type = (data.get("discount_type") or DiscountType.FIXED.value).strip().lower()
    if not partial or "discount_type" in data:
        if discount_type not in {DiscountType.FIXED.value, DiscountType.PERCENTAGE.value}:
            raise CouponError("Discount type must be fixed or percentage.", code="invalid_discount_type", status_code=422)
        fields["discount_type"] = discount_type

    if not partial or "discount_value" in data:
        try:
            raw_value = float(data.get("discount_value", 0))
        except (TypeError, ValueError):
            raise CouponError("Discount value must be a valid number.", code="invalid_discount_value", status_code=422)
        if raw_value <= 0:
            raise CouponError("Discount value must be greater than zero.", code="invalid_discount_value", status_code=422)
        if discount_type == DiscountType.PERCENTAGE.value and raw_value > 100:
            raise CouponError("Percentage discount cannot exceed 100%.", code="invalid_discount_value", status_code=422)
        fields["discount_value_cents"] = int(round(raw_value * 100))

    if not partial or "min_spend" in data:
        try:
            raw_min = float(data.get("min_spend") or 0)
        except (TypeError, ValueError):
            raise CouponError("Minimum spend must be a valid number.", code="invalid_min_spend", status_code=422)
        if raw_min < 0:
            raise CouponError("Minimum spend cannot be negative.", code="invalid_min_spend", status_code=422)
        fields["min_spend_cents"] = int(round(raw_min * 100))

    if not partial or "max_discount" in data:
        raw_max = data.get("max_discount")
        if raw_max is None or raw_max == "":
            fields["max_discount_cents"] = None
        else:
            try:
                parsed_max = float(raw_max)
            except (TypeError, ValueError):
                raise CouponError("Max discount cap must be a valid number.", code="invalid_max_discount", status_code=422)
            if parsed_max <= 0:
                raise CouponError("Max discount cap must be greater than zero.", code="invalid_max_discount", status_code=422)
            fields["max_discount_cents"] = int(round(parsed_max * 100))

    if not partial or "usage_limit" in data:
        raw_limit = data.get("usage_limit")
        if raw_limit is None or raw_limit == "":
            fields["usage_limit"] = None
        else:
            try:
                parsed_limit = int(raw_limit)
            except (TypeError, ValueError):
                raise CouponError("Usage limit must be a whole number.", code="invalid_usage_limit", status_code=422)
            if parsed_limit < 1:
                raise CouponError("Usage limit must be at least 1.", code="invalid_usage_limit", status_code=422)
            fields["usage_limit"] = parsed_limit

    if not partial or "valid_from" in data:
        fields["valid_from"] = _parse_coupon_datetime(data.get("valid_from"), end_of_day=False)

    if not partial or "valid_until" in data:
        fields["valid_until"] = _parse_coupon_datetime(data.get("valid_until"), end_of_day=True)

    if not partial or "is_active" in data:
        fields["is_active"] = bool(data.get("is_active", True))

    return fields


def create_coupon(data: dict) -> Coupon:
    fields = _extract_coupon_fields(data, partial=False)
    existing = Coupon.query.filter_by(code=fields["code"]).one_or_none()
    if existing:
        raise CouponError("A coupon with this code already exists.", code="duplicate_code")

    if fields.get("valid_from") and fields.get("valid_until") and fields["valid_from"] > fields["valid_until"]:
        raise CouponError("Start date cannot be after expiration date.", code="invalid_coupon_window", status_code=422)

    coupon = Coupon(**fields)
    db.session.add(coupon)
    db.session.commit()
    return coupon


def update_coupon(coupon_id: int, data: dict) -> Coupon:
    coupon = Coupon.query.filter_by(id=coupon_id).one_or_none()
    if not coupon:
        raise CouponError("Coupon was not found.", code="coupon_not_found", status_code=404)

    effective_data = dict(data or {})
    if "discount_type" not in effective_data:
        effective_data["discount_type"] = coupon.discount_type
    fields = _extract_coupon_fields(effective_data, partial=True)

    if "code" in fields and fields["code"] != coupon.code:
        duplicate = Coupon.query.filter_by(code=fields["code"]).one_or_none()
        if duplicate:
            raise CouponError("A coupon with this code already exists.", code="duplicate_code")

    if "usage_limit" in fields and fields["usage_limit"] is not None and fields["usage_limit"] < (coupon.used_count or 0):
        raise CouponError(
            f"Usage limit cannot be lower than current redemptions ({coupon.used_count}).",
            code="invalid_usage_limit",
            status_code=422,
        )

    next_from = _as_utc(fields["valid_from"] if "valid_from" in fields else coupon.valid_from)
    next_until = _as_utc(fields["valid_until"] if "valid_until" in fields else coupon.valid_until)
    if next_from and next_until and next_from > next_until:
        raise CouponError("Start date cannot be after expiration date.", code="invalid_coupon_window", status_code=422)

    for key, val in fields.items():
        setattr(coupon, key, val)

    db.session.commit()
    return coupon


def delete_coupon(coupon_id: int):
    coupon = Coupon.query.filter_by(id=coupon_id).one_or_none()
    if not coupon:
        raise CouponError("Coupon was not found.", code="coupon_not_found", status_code=404)

    if (coupon.used_count or 0) > 0 or len(coupon.redemptions or []) > 0:
        raise CouponError(
            "Coupons with existing redemptions cannot be deleted; deactivate instead.",
            code="coupon_in_use",
            status_code=409,
        )

    code = coupon.code
    db.session.delete(coupon)
    db.session.commit()
    return {"id": coupon_id, "code": code, "deleted": True}


def get_coupon_redemptions(coupon_id: int) -> dict:
    coupon = Coupon.query.filter_by(id=coupon_id).one_or_none()
    if not coupon:
        raise CouponError("Coupon was not found.", code="coupon_not_found", status_code=404)

    redemptions = (
        CouponRedemption.query.filter_by(coupon_id=coupon.id)
        .order_by(CouponRedemption.created_at.desc())
        .all()
    )
    return {
        "coupon": coupon.to_dict(),
        "redemptions": [
            {
                "id": r.id,
                "order_number": r.order.order_number if r.order else None,
                "buyer_name": f"{r.user.first_name} {r.user.last_name}".strip() if r.user else "Guest",
                "buyer_email": r.user.email if r.user else None,
                "discount_amount": round((r.discount_cents or 0) / 100, 2),
                "redeemed_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in redemptions
        ],
    }


def list_coupons(active_only=False):
    query = Coupon.query
    if active_only:
        query = query.filter_by(is_active=True)
    return query.order_by(Coupon.created_at.desc()).all()


def toggle_coupon_status(coupon_id: int, is_active: bool) -> Coupon:
    coupon = Coupon.query.filter_by(id=coupon_id).one_or_none()
    if not coupon:
        raise CouponError("Coupon was not found.", code="coupon_not_found", status_code=404)
    coupon.is_active = is_active
    db.session.commit()
    return coupon
