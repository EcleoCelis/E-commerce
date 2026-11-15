import uuid
from backend.app.auth.rbac import Role
from backend.app.extensions import db
from backend.app.models import User
from backend.app.models.communication import (
    Notification,
    NotificationType,
    SupportMessage,
    SupportTicket,
    SupportTicketStatus,
)


class CommunicationError(Exception):
    def __init__(self, message, code="communication_error", status_code=400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


# ==========================================
# NOTIFICATIONS
# ==========================================

def create_notification(user_id: int, title: str, message: str, notif_type: str = NotificationType.ORDER.value, data: dict = None) -> Notification:
    notif = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=notif_type,
        data=data or {},
    )
    db.session.add(notif)
    db.session.commit()
    return notif


def notify_admins(title: str, message: str, notif_type: str = NotificationType.OPERATIONAL.value, data: dict = None):
    admins = User.query.filter_by(role=Role.ADMIN.value, status="active").all()
    created = []
    for admin in admins:
        notif = Notification(
            user_id=admin.id,
            title=title,
            message=message,
            type=notif_type,
            data=data or {},
        )
        db.session.add(notif)
        created.append(notif)
    db.session.commit()
    return created


def list_user_notifications(user_id: int, page: int = 1, per_page: int = 20, unread_only: bool = False):
    query = Notification.query.filter_by(user_id=user_id)
    if unread_only:
        query = query.filter_by(is_read=False)
    query = query.order_by(Notification.created_at.desc())

    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    return {
        "notifications": [item.to_dict() for item in items],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


def get_user_unread_notification_count(user_id: int) -> int:
    return Notification.query.filter_by(user_id=user_id, is_read=False).count()


def mark_notification_as_read(notification_id: int, user_id: int) -> Notification:
    notif = Notification.query.filter_by(id=notification_id, user_id=user_id).one_or_none()
    if not notif:
        raise CommunicationError("Notification was not found.", code="notification_not_found", status_code=404)
    notif.mark_read()
    db.session.commit()
    return notif


def mark_all_notifications_as_read(user_id: int) -> int:
    unread = Notification.query.filter_by(user_id=user_id, is_read=False).all()
    for notif in unread:
        notif.mark_read()
    db.session.commit()
    return len(unread)


# ==========================================
# SUPPORT TICKETS & MESSAGING
# ==========================================

def create_support_ticket(user_id: int, subject: str, category: str, message: str) -> SupportTicket:
    ticket_number = f"TICK-{uuid.uuid4().hex[:8].upper()}"
    ticket = SupportTicket(
        ticket_number=ticket_number,
        user_id=user_id,
        subject=subject.strip(),
        category=category.strip() if category else "general",
        status=SupportTicketStatus.OPEN.value,
    )
    db.session.add(ticket)
    db.session.flush()

    first_message = SupportMessage(
        ticket_id=ticket.id,
        sender_id=user_id,
        message=message.strip(),
        is_staff=False,
    )
    db.session.add(first_message)
    db.session.commit()

    # Notify admins about new support ticket
    notify_admins(
        title="New Support Inquiry",
        message=f"Buyer submitted a support ticket: {subject}",
        notif_type=NotificationType.SUPPORT.value,
        data={"ticket_number": ticket_number},
    )

    return ticket


def list_user_tickets(user_id: int):
    tickets = SupportTicket.query.filter_by(user_id=user_id).order_by(SupportTicket.updated_at.desc()).all()
    return [t.to_dict(include_messages=False) for t in tickets]


def get_ticket_by_number(ticket_number: str, user_id: int = None, is_admin: bool = False) -> SupportTicket:
    query = SupportTicket.query.filter_by(ticket_number=ticket_number)
    if not is_admin and user_id is not None:
        query = query.filter_by(user_id=user_id)
    ticket = query.one_or_none()
    if not ticket:
        raise CommunicationError("Support ticket was not found.", code="ticket_not_found", status_code=404)
    return ticket


def add_ticket_message(ticket: SupportTicket, sender_id: int, message: str, is_staff: bool = False) -> SupportMessage:
    msg = SupportMessage(
        ticket_id=ticket.id,
        sender_id=sender_id,
        message=message.strip(),
        is_staff=is_staff,
    )
    db.session.add(msg)

    # Status update based on who replied
    if is_staff and ticket.status == SupportTicketStatus.OPEN.value:
        ticket.status = SupportTicketStatus.IN_PROGRESS.value
    elif not is_staff and ticket.status == SupportTicketStatus.RESOLVED.value:
        ticket.status = SupportTicketStatus.OPEN.value

    db.session.commit()

    # If staff replied, notify the buyer
    if is_staff:
        create_notification(
            user_id=ticket.user_id,
            title="Support Response Received",
            message=f"Support agent replied to ticket #{ticket.ticket_number}: {ticket.subject}",
            notif_type=NotificationType.SUPPORT.value,
            data={"ticket_number": ticket.ticket_number},
        )
    else:
        notify_admins(
            title="Support Ticket Updated",
            message=f"Buyer sent a message on ticket #{ticket.ticket_number}",
            notif_type=NotificationType.SUPPORT.value,
            data={"ticket_number": ticket.ticket_number},
        )

    return msg


def update_ticket_status(ticket: SupportTicket, status: str) -> SupportTicket:
    valid_statuses = {s.value for s in SupportTicketStatus}
    if status not in valid_statuses:
        raise CommunicationError(f"Invalid status '{status}'. Valid: {', '.join(valid_statuses)}", code="invalid_status")

    ticket.status = status
    db.session.commit()

    # Notify buyer when ticket is resolved or closed
    create_notification(
        user_id=ticket.user_id,
        title=f"Support Ticket {status.title()}",
        message=f"Ticket #{ticket.ticket_number} ({ticket.subject}) has been marked as {status}.",
        notif_type=NotificationType.SUPPORT.value,
        data={"ticket_number": ticket.ticket_number},
    )

    return ticket


def list_admin_tickets(status: str = None, page: int = 1, per_page: int = 20):
    query = SupportTicket.query
    if status and status != "all":
        query = query.filter_by(status=status)
    query = query.order_by(SupportTicket.updated_at.desc())

    total = query.count()
    tickets = query.offset((page - 1) * per_page).limit(per_page).all()
    return {
        "tickets": [t.to_dict(include_messages=False) for t in tickets],
        "total": total,
        "page": page,
        "per_page": per_page,
    }
