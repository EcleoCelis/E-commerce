from flask import Blueprint, g, request

from backend.app.auth.decorators import login_required, roles_required
from backend.app.auth.rbac import Role, StaffRole
from backend.app.core.responses import error_response, success_response
from backend.app.orders.returns import (
    ReturnError,
    create_return_request,
    get_buyer_order_return,
    list_admin_returns,
    list_buyer_returns,
    update_return_status,
)


returns_bp = Blueprint("returns", __name__)


@returns_bp.post("/orders/<order_number>/returns")
@login_required
def request_order_return(order_number):
    payload = request.get_json(silent=True) or {}
    reason = payload.get("reason")
    description = payload.get("description")

    try:
        return_req = create_return_request(order_number, g.current_user.id, reason, description)
    except ReturnError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    return success_response(
        data=return_req.to_dict(),
        message="Return request submitted successfully.",
        status_code=201,
    )


@returns_bp.get("/orders/<order_number>/returns")
@login_required
def get_order_return(order_number):
    ret = get_buyer_order_return(order_number, g.current_user.id)
    return success_response(
        data={"return_request": ret},
        message="Return request details retrieved.",
    )


@returns_bp.get("/admin/returns")
@roles_required(Role.ADMIN.value, StaffRole.FULFILLMENT_STAFF.value, StaffRole.SUPPORT_AGENT.value)
def admin_list_returns():
    status = request.args.get("status")
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(50, max(1, int(request.args.get("per_page", 20))))

    result = list_admin_returns(status=status, page=page, per_page=per_page)
    return success_response(
        data=result,
        message="Admin returns retrieved.",
    )


@returns_bp.patch("/admin/returns/<return_number>/status")
@roles_required(Role.ADMIN.value, StaffRole.FULFILLMENT_STAFF.value)
def admin_update_return(return_number):
    payload = request.get_json(silent=True) or {}
    status = (payload.get("status") or "").strip().lower()
    admin_notes = payload.get("admin_notes")
    raw_refund = payload.get("refund_amount")
    refund_amount_cents = None
    if raw_refund is not None and raw_refund != "":
        try:
            refund_amount_cents = int(round(float(raw_refund) * 100))
        except (TypeError, ValueError):
            return error_response(
                message="Refund amount must be a valid number.",
                status_code=422,
                code="validation_error",
                details={"refund_amount": ["Refund amount must be a valid number."]},
            )

    if not status:
        return error_response(
            message="Status is required.",
            status_code=422,
            code="validation_error",
            details={"status": ["Status is required."]},
        )

    try:
        updated = update_return_status(
            return_number,
            status=status,
            admin_notes=admin_notes,
            refund_amount_cents=refund_amount_cents,
        )
    except ReturnError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    return success_response(
        data=updated.to_dict(),
        message=f"Return request status updated to {status.upper()}.",
    )
