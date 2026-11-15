from flask import Blueprint, g, request

from backend.app.auth.decorators import login_required, roles_required
from backend.app.auth.rbac import Role
from backend.app.checkout.coupons import (
    CouponError,
    create_coupon,
    delete_coupon,
    get_coupon_redemptions,
    list_coupons,
    toggle_coupon_status,
    update_coupon,
    validate_and_calculate_discount,
)
from backend.app.core.responses import error_response, success_response


coupons_bp = Blueprint("coupons", __name__)


@coupons_bp.post("/checkout/coupons/apply")
def apply_coupon():
    payload = request.get_json(silent=True) or {}
    code = payload.get("code")
    raw_subtotal = payload.get("subtotal")

    if raw_subtotal is None:
        return error_response(
            message="Subtotal amount is required to calculate coupon discount.",
            status_code=422,
            code="validation_error",
            details={"subtotal": ["Subtotal amount is required."]},
        )

    try:
        subtotal_cents = int(round(float(raw_subtotal) * 100))
    except (ValueError, TypeError):
        return error_response(
            message="Invalid subtotal amount.",
            status_code=422,
            code="validation_error",
            details={"subtotal": ["Must be a valid numeric amount."]},
        )

    user_id = g.current_user.id if getattr(g, "current_user", None) else None

    try:
        result = validate_and_calculate_discount(code, subtotal_cents, user_id=user_id)
    except CouponError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    return success_response(
        data=result,
        message=f"Coupon '{result['code']}' applied successfully.",
    )


@coupons_bp.get("/admin/coupons")
@roles_required(Role.ADMIN.value)
def admin_list_coupons():
    active_only = request.args.get("active", "").lower() in ("true", "1")
    coupons = list_coupons(active_only=active_only)
    return success_response(
        data={"coupons": [c.to_dict() for c in coupons]},
        message="Coupons retrieved.",
    )


@coupons_bp.post("/admin/coupons")
@roles_required(Role.ADMIN.value)
def admin_create_coupon():
    payload = request.get_json(silent=True) or {}
    try:
        coupon = create_coupon(payload)
    except CouponError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    return success_response(
        data=coupon.to_dict(),
        message="Coupon created successfully.",
        status_code=201,
    )


@coupons_bp.patch("/admin/coupons/<int:coupon_id>/status")
@roles_required(Role.ADMIN.value)
def admin_toggle_coupon(coupon_id):
    payload = request.get_json(silent=True) or {}
    is_active = bool(payload.get("is_active", True))

    try:
        coupon = toggle_coupon_status(coupon_id, is_active)
    except CouponError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    return success_response(
        data=coupon.to_dict(),
        message=f"Coupon status updated to {'active' if is_active else 'inactive'}.",
    )


@coupons_bp.patch("/admin/coupons/<int:coupon_id>")
@roles_required(Role.ADMIN.value)
def admin_update_coupon(coupon_id):
    payload = request.get_json(silent=True) or {}
    try:
        coupon = update_coupon(coupon_id, payload)
    except CouponError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    return success_response(
        data=coupon.to_dict(),
        message=f"Coupon '{coupon.code}' updated successfully.",
    )


@coupons_bp.delete("/admin/coupons/<int:coupon_id>")
@roles_required(Role.ADMIN.value)
def admin_delete_coupon(coupon_id):
    try:
        result = delete_coupon(coupon_id)
    except CouponError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    return success_response(
        data=result,
        message=f"Coupon '{result['code']}' deleted.",
    )


@coupons_bp.get("/admin/coupons/<int:coupon_id>/redemptions")
@roles_required(Role.ADMIN.value)
def admin_coupon_redemptions(coupon_id):
    try:
        data = get_coupon_redemptions(coupon_id)
    except CouponError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    return success_response(
        data=data,
        message="Coupon redemptions retrieved.",
    )
