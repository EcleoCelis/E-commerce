from flask import Blueprint, g, request

from backend.app.auth.decorators import login_required, roles_required
from backend.app.auth.rbac import Role, StaffRole
from backend.app.communication import (
    CommunicationError,
    add_ticket_message,
    create_support_ticket,
    get_ticket_by_number,
    list_admin_tickets,
    list_user_tickets,
    update_ticket_status,
)
from backend.app.core.responses import error_response, success_response
from backend.app.core.security.rate_limiter import rate_limit


support_bp = Blueprint("support", __name__, url_prefix="/support")
admin_support_bp = Blueprint("admin_support", __name__, url_prefix="/admin/support")


# ==========================================
# BUYER SUPPORT ENDPOINTS
# ==========================================

@support_bp.get("/tickets")
@login_required
def get_user_tickets():
    tickets = list_user_tickets(g.current_user.id)
    return success_response(
        data={"tickets": tickets},
        message="Support tickets retrieved.",
    )


@support_bp.post("/tickets")
@login_required
@rate_limit(limit=10, window_seconds=60)
def open_ticket():
    payload = request.get_json(silent=True) or {}
    subject = (payload.get("subject") or "").strip()
    category = (payload.get("category") or "general").strip()
    message = (payload.get("message") or "").strip()

    errors = {}
    if not subject:
        errors.setdefault("subject", []).append("Subject is required.")
    if not message:
        errors.setdefault("message", []).append("Message cannot be empty.")

    if errors:
        return error_response(
            message="Support ticket validation failed.",
            status_code=422,
            code="validation_error",
            details=errors,
        )

    ticket = create_support_ticket(
        user_id=g.current_user.id,
        subject=subject,
        category=category,
        message=message,
    )
    return success_response(
        data=ticket.to_dict(include_messages=True),
        message="Support ticket submitted successfully.",
        status_code=201,
    )


@support_bp.get("/tickets/<ticket_number>")
@login_required
def get_ticket_detail(ticket_number):
    try:
        ticket = get_ticket_by_number(ticket_number, user_id=g.current_user.id, is_admin=False)
    except CommunicationError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    return success_response(
        data=ticket.to_dict(include_messages=True),
        message="Support ticket retrieved.",
    )


@support_bp.post("/tickets/<ticket_number>/messages")
@login_required
@rate_limit(limit=20, window_seconds=60)
def send_buyer_message(ticket_number):
    try:
        ticket = get_ticket_by_number(ticket_number, user_id=g.current_user.id, is_admin=False)
    except CommunicationError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    payload = request.get_json(silent=True) or {}
    message = (payload.get("message") or "").strip()
    if not message:
        return error_response(
            message="Message cannot be empty.",
            status_code=422,
            code="validation_error",
            details={"message": ["Message cannot be empty."]},
        )

    msg = add_ticket_message(ticket, sender_id=g.current_user.id, message=message, is_staff=False)
    return success_response(
        data=msg.to_dict(),
        message="Message sent successfully.",
        status_code=201,
    )


# ==========================================
# ADMIN SUPPORT ENDPOINTS
# ==========================================

@admin_support_bp.get("/tickets")
@roles_required(Role.ADMIN.value, StaffRole.SUPPORT_AGENT.value)
def admin_get_tickets():
    status = request.args.get("status")
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(50, max(1, int(request.args.get("per_page", 20))))

    result = list_admin_tickets(status=status, page=page, per_page=per_page)
    return success_response(
        data=result,
        message="Admin support tickets retrieved.",
    )


@admin_support_bp.get("/tickets/<ticket_number>")
@roles_required(Role.ADMIN.value, StaffRole.SUPPORT_AGENT.value)
def admin_get_ticket_detail(ticket_number):
    try:
        ticket = get_ticket_by_number(ticket_number, is_admin=True)
    except CommunicationError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    return success_response(
        data=ticket.to_dict(include_messages=True),
        message="Admin support ticket retrieved.",
    )


@admin_support_bp.post("/tickets/<ticket_number>/messages")
@roles_required(Role.ADMIN.value, StaffRole.SUPPORT_AGENT.value)
def admin_send_message(ticket_number):
    try:
        ticket = get_ticket_by_number(ticket_number, is_admin=True)
    except CommunicationError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    payload = request.get_json(silent=True) or {}
    message = (payload.get("message") or "").strip()
    if not message:
        return error_response(
            message="Message cannot be empty.",
            status_code=422,
            code="validation_error",
            details={"message": ["Message cannot be empty."]},
        )

    msg = add_ticket_message(ticket, sender_id=g.current_user.id, message=message, is_staff=True)
    return success_response(
        data=msg.to_dict(),
        message="Reply sent to buyer.",
        status_code=201,
    )


@admin_support_bp.patch("/tickets/<ticket_number>/status")
@roles_required(Role.ADMIN.value, StaffRole.SUPPORT_AGENT.value)
def admin_update_status(ticket_number):
    try:
        ticket = get_ticket_by_number(ticket_number, is_admin=True)
    except CommunicationError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    payload = request.get_json(silent=True) or {}
    status = (payload.get("status") or "").strip().lower()
    if not status:
        return error_response(
            message="Status is required.",
            status_code=422,
            code="validation_error",
            details={"status": ["Status is required."]},
        )

    try:
        updated = update_ticket_status(ticket, status)
    except CommunicationError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    return success_response(
        data=updated.to_dict(include_messages=False),
        message=f"Support ticket status updated to {status}.",
    )
