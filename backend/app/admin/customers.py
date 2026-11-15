from datetime import timezone
from sqlalchemy.orm import selectinload

from backend.app.auth.rbac import Role
from backend.app.extensions import db
from backend.app.models.base import utc_now
from backend.app.models.commerce import Order, OrderStatus, PaymentStatus, ReturnRequest
from backend.app.models.communication import SupportTicket
from backend.app.models.identity import AuthSession, User, UserStatus


class CustomerAdminError(Exception):
    def __init__(self, message, code="customer_error", status_code=400, details=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}


def _is_active_session(session_row: AuthSession) -> bool:
    if session_row.revoked_at is not None:
        return False
    if session_row.expires_at is None:
        return True
    now = utc_now()
    exp = session_row.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp > now


def _compute_customer_stats(user: User) -> dict:
    orders = list(user.orders or [])
    paid_orders = [
        o
        for o in orders
        if o.status != OrderStatus.CANCELLED.value and o.payment_status != PaymentStatus.REFUNDED.value
    ]
    lifetime_spend_cents = sum(int(o.total_cents or 0) for o in paid_orders)
    sorted_orders = sorted(
        orders,
        key=lambda o: (o.placed_at or o.created_at or utc_now()),
        reverse=True,
    )
    last_order_at = None
    if sorted_orders:
        dt = sorted_orders[0].placed_at or sorted_orders[0].created_at
        last_order_at = dt.isoformat() if dt else None

    active_sessions = sum(1 for s in (user.sessions or []) if _is_active_session(s))
    return {
        "order_count": len(orders),
        "completed_orders": len(paid_orders),
        "lifetime_spend_cents": lifetime_spend_cents,
        "lifetime_spend": round(lifetime_spend_cents / 100, 2),
        "last_order_at": last_order_at,
        "active_session_count": active_sessions,
    }


def serialize_admin_customer_summary(user: User) -> dict:
    stats = _compute_customer_stats(user)
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "name": f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email,
        "phone": user.phone,
        "role": user.role,
        "status": user.status,
        "email_verified": bool(user.email_verified),
        "preferred_payment_method": user.preferred_payment_method,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        **stats,
    }


def list_admin_customers(filters: dict = None) -> dict:
    filters = filters or {}
    q = (filters.get("q") or "").strip()
    status_filter = (filters.get("status") or "").strip().lower()
    sort = (filters.get("sort") or "recent").strip().lower()
    page = max(1, int(filters.get("page") or 1))
    per_page = min(100, max(1, int(filters.get("per_page") or 20)))

    base_query = User.query.options(
        selectinload(User.orders),
        selectinload(User.sessions),
    ).filter(User.role == Role.BUYER.value)

    all_buyers = base_query.all()
    summary = {
        "total_customers": len(all_buyers),
        "active_customers": sum(1 for u in all_buyers if u.status == UserStatus.ACTIVE.value),
        "suspended_customers": sum(1 for u in all_buyers if u.status == UserStatus.DISABLED.value),
        "repeat_buyers": sum(1 for u in all_buyers if len(u.orders or []) >= 2),
    }

    query = base_query
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            db.or_(
                User.email.ilike(pattern),
                User.first_name.ilike(pattern),
                User.last_name.ilike(pattern),
                User.phone.ilike(pattern),
            )
        )

    if status_filter and status_filter != "all":
        query = query.filter(User.status == status_filter)

    users = query.order_by(User.created_at.desc(), User.id.desc()).all()
    serialized = [serialize_admin_customer_summary(u) for u in users]

    if sort == "oldest":
        serialized.sort(key=lambda item: (item["created_at"] or "", item["id"]))
    elif sort == "spend_desc":
        serialized.sort(key=lambda item: (item["lifetime_spend_cents"], item["order_count"]), reverse=True)
    elif sort == "orders_desc":
        serialized.sort(key=lambda item: (item["order_count"], item["lifetime_spend_cents"]), reverse=True)

    total = len(serialized)
    start = (page - 1) * per_page
    paged = serialized[start : start + per_page]

    return {
        "customers": paged,
        "summary": summary,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": max(1, (total + per_page - 1) // per_page),
        },
    }


def get_admin_customer_detail(customer_id: int) -> dict:
    user = (
        User.query.options(
            selectinload(User.orders),
            selectinload(User.addresses),
            selectinload(User.sessions),
        )
        .filter_by(id=customer_id)
        .one_or_none()
    )
    if not user:
        raise CustomerAdminError("Customer account was not found.", code="customer_not_found", status_code=404)

    base = serialize_admin_customer_summary(user)
    orders = sorted(
        list(user.orders or []),
        key=lambda o: (o.placed_at or o.created_at or utc_now()),
        reverse=True,
    )[:20]
    returns = (
        ReturnRequest.query.filter_by(user_id=user.id)
        .order_by(ReturnRequest.created_at.desc())
        .limit(10)
        .all()
    )
    tickets = (
        SupportTicket.query.filter_by(user_id=user.id)
        .order_by(SupportTicket.created_at.desc())
        .limit(10)
        .all()
    )

    return {
        **base,
        "addresses": [
            {
                **addr.to_dict(),
                "street_address": addr.street_line1,
            }
            for addr in (user.addresses or [])
        ],
        "orders": [
            {
                "order_number": o.order_number,
                "status": o.status,
                "payment_status": o.payment_status,
                "shipping_status": o.shipping_status,
                "total": round((o.total_cents or 0) / 100, 2),
                "placed_at": o.placed_at.isoformat() if o.placed_at else None,
            }
            for o in orders
        ],
        "returns": [r.to_dict() for r in returns],
        "support_tickets": [t.to_dict() for t in tickets],
    }


def update_admin_customer_status(customer_id: int, new_status: str, admin_user: User) -> dict:
    clean_status = (new_status or "").strip().lower()
    if clean_status not in {UserStatus.ACTIVE.value, UserStatus.DISABLED.value}:
        raise CustomerAdminError(
            "Status must be 'active' or 'disabled'.",
            code="invalid_customer_status",
            status_code=422,
        )

    user = User.query.filter_by(id=customer_id).one_or_none()
    if not user:
        raise CustomerAdminError("Customer account was not found.", code="customer_not_found", status_code=404)

    if admin_user and user.id == admin_user.id:
        raise CustomerAdminError(
            "You cannot modify your own account status here.",
            code="self_modification_forbidden",
            status_code=409,
        )

    if user.role != Role.BUYER.value:
        raise CustomerAdminError(
            "Staff accounts must be managed under Staff & Roles in Settings.",
            code="not_a_customer_account",
            status_code=409,
        )

    user.status = clean_status
    if clean_status == UserStatus.DISABLED.value:
        now = utc_now()
        for session_row in (user.sessions or []):
            if session_row.revoked_at is None:
                session_row.revoked_at = now

    from backend.app.admin.settings import record_admin_audit

    record_admin_audit(
        actor=admin_user,
        action=f"customer.{clean_status}",
        entity_type="customer",
        entity_id=user.id,
        summary=f"Set customer {user.email} status to {clean_status}",
        commit=False,
    )
    db.session.commit()
    return serialize_admin_customer_summary(user)


def revoke_admin_customer_sessions(customer_id: int, admin_user: User) -> dict:
    user = User.query.options(selectinload(User.sessions)).filter_by(id=customer_id).one_or_none()
    if not user:
        raise CustomerAdminError("Customer account was not found.", code="customer_not_found", status_code=404)

    if admin_user and user.id == admin_user.id:
        raise CustomerAdminError(
            "Cannot revoke your own active admin session from customer controls.",
            code="self_session_revoke_forbidden",
            status_code=409,
        )

    now = utc_now()
    revoked_count = 0
    for session_row in (user.sessions or []):
        if session_row.revoked_at is None:
            session_row.revoked_at = now
            revoked_count += 1

    from backend.app.admin.settings import record_admin_audit

    record_admin_audit(
        actor=admin_user,
        action="customer.revoke_sessions",
        entity_type="customer",
        entity_id=user.id,
        summary=f"Revoked {revoked_count} active session(s) for {user.email}",
        commit=False,
    )
    db.session.commit()
    return {
        "customer_id": user.id,
        "email": user.email,
        "revoked_count": revoked_count,
    }
