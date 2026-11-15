from backend.app.communication.email_service import email_service
from backend.app.communication.service import (
    CommunicationError,
    add_ticket_message,
    create_notification,
    create_support_ticket,
    get_ticket_by_number,
    get_user_unread_notification_count,
    list_admin_tickets,
    list_user_notifications,
    list_user_tickets,
    mark_all_notifications_as_read,
    mark_notification_as_read,
    notify_admins,
    update_ticket_status,
)


__all__ = [
    "CommunicationError",
    "add_ticket_message",
    "create_notification",
    "create_support_ticket",
    "email_service",
    "get_ticket_by_number",
    "get_user_unread_notification_count",
    "list_admin_tickets",
    "list_user_notifications",
    "list_user_tickets",
    "mark_all_notifications_as_read",
    "mark_notification_as_read",
    "notify_admins",
    "update_ticket_status",
]
