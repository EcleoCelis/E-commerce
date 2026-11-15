from enum import StrEnum
from backend.app.extensions import db
from backend.app.models.base import IntPrimaryKeyMixin, TimestampMixin, utc_now


class SupportTicketStatus(StrEnum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class NotificationType(StrEnum):
    ORDER = "order"
    PAYMENT = "payment"
    SHIPPING = "shipping"
    SUPPORT = "support"
    SECURITY = "security"
    OPERATIONAL = "operational"
    PROMOTION = "promotion"


class Notification(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "notifications"

    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type = db.Column(db.String(50), nullable=False, default=NotificationType.ORDER.value, index=True)
    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    data = db.Column(db.JSON, nullable=True)
    is_read = db.Column(db.Boolean, nullable=False, default=False, index=True)
    read_at = db.Column(db.DateTime(timezone=True), nullable=True)

    user = db.relationship("User", backref=db.backref("notifications", cascade="all, delete-orphan", lazy="selectin"))

    def mark_read(self):
        if not self.is_read:
            self.is_read = True
            self.read_at = utc_now()

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "title": self.title,
            "message": self.message,
            "data": self.data or {},
            "is_read": self.is_read,
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SupportTicket(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "support_tickets"

    ticket_number = db.Column(db.String(32), nullable=False, unique=True, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    subject = db.Column(db.String(255), nullable=False)
    category = db.Column(db.String(50), nullable=False, default="general")
    status = db.Column(db.String(32), nullable=False, default=SupportTicketStatus.OPEN.value, index=True)

    user = db.relationship("User", backref=db.backref("support_tickets", cascade="all, delete-orphan", lazy="selectin"))
    messages = db.relationship("SupportMessage", back_populates="ticket", cascade="all, delete-orphan", order_by="SupportMessage.created_at.asc()", lazy="selectin")

    def to_dict(self, include_messages=False):
        data = {
            "id": self.id,
            "ticket_number": self.ticket_number,
            "subject": self.subject,
            "category": self.category,
            "status": self.status,
            "user_id": self.user_id,
            "user_name": f"{self.user.first_name} {self.user.last_name}" if self.user else "Unknown",
            "user_email": self.user.email if self.user else None,
            "message_count": len(self.messages) if self.messages else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_messages:
            data["messages"] = [msg.to_dict() for msg in self.messages]
        return data


class SupportMessage(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "support_messages"

    ticket_id = db.Column(db.Integer, db.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    message = db.Column(db.Text, nullable=False)
    is_staff = db.Column(db.Boolean, nullable=False, default=False)

    ticket = db.relationship("SupportTicket", back_populates="messages")
    sender = db.relationship("User", lazy="selectin")

    def to_dict(self):
        return {
            "id": self.id,
            "ticket_id": self.ticket_id,
            "sender_id": self.sender_id,
            "sender_name": f"{self.sender.first_name} {self.sender.last_name}" if self.sender else "User",
            "message": self.message,
            "is_staff": self.is_staff,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
