from flask import Blueprint, g, request

from backend.app.auth.decorators import login_required
from backend.app.communication import (
    CommunicationError,
    get_user_unread_notification_count,
    list_user_notifications,
    mark_all_notifications_as_read,
    mark_notification_as_read,
)
from backend.app.core.responses import error_response, success_response


notifications_bp = Blueprint("notifications", __name__, url_prefix="/notifications")


@notifications_bp.get("")
@login_required
def get_notifications():
    unread_only = request.args.get("unread", "").lower() in ("true", "1")
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(50, max(1, int(request.args.get("per_page", 20))))

    result = list_user_notifications(g.current_user.id, page=page, per_page=per_page, unread_only=unread_only)
    return success_response(
        data=result,
        message="Notifications retrieved successfully.",
    )


@notifications_bp.get("/unread-count")
@login_required
def get_unread_count():
    count = get_user_unread_notification_count(g.current_user.id)
    return success_response(
        data={"unread_count": count},
        message="Unread notification count retrieved.",
    )


@notifications_bp.patch("/<int:notification_id>/read")
@login_required
def mark_read(notification_id):
    try:
        notif = mark_notification_as_read(notification_id, g.current_user.id)
    except CommunicationError as exc:
        return error_response(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
        )

    return success_response(
        data=notif.to_dict(),
        message="Notification marked as read.",
    )


@notifications_bp.post("/mark-all-read")
@login_required
def mark_all_read():
    count = mark_all_notifications_as_read(g.current_user.id)
    return success_response(
        data={"updated_count": count},
        message=f"{count} notification(s) marked as read.",
    )
