from flask import has_app_context
from sqlalchemy.exc import SQLAlchemyError

from backend.app.auth.rbac import ROLE_CAPABILITIES, STAFF_ROLES, StaffRole, permissions_for_role
from backend.app.extensions import db
from backend.app.models.admin import AdminAuditLog, StoreSetting
from backend.app.models.identity import User, UserStatus


STORE_CONFIG_KEY = "store_config"
SUPPORTED_STORE_PAYMENT_METHODS = ("cash_on_delivery", "gcash_pending", "credit_debit_card")

DEFAULT_STORE_CONFIG = {
    "store_name": "SecondMarket",
    "support_email": "support@secondmarket.local",
    "free_shipping_threshold_cents": 300000,
    "standard_shipping_cents": 4500,
    "default_low_stock_threshold": 2,
    "return_window_days": 14,
    "enabled_payment_methods": list(SUPPORTED_STORE_PAYMENT_METHODS),
}


class SettingsAdminError(Exception):
    def __init__(self, message, code="settings_error", status_code=400, details=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}


def get_store_config() -> dict:
    config = dict(DEFAULT_STORE_CONFIG)
    if not has_app_context():
        return config
    try:
        row = StoreSetting.query.filter_by(setting_key=STORE_CONFIG_KEY).one_or_none()
        if row and isinstance(row.value_json, dict):
            config.update(row.value_json)
    except SQLAlchemyError:
        return config
    return {
        **config,
        "free_shipping_threshold": round(int(config["free_shipping_threshold_cents"]) / 100, 2),
        "standard_shipping_fee": round(int(config["standard_shipping_cents"]) / 100, 2),
    }


def update_store_config(payload: dict, actor: User = None) -> dict:
    current = get_store_config()
    store_name = str(payload.get("store_name") if "store_name" in payload else current["store_name"]).strip()
    if not store_name or len(store_name) > 80:
        raise SettingsAdminError("Store name must be between 1 and 80 characters.", code="invalid_store_name", status_code=422)

    support_email = str(payload.get("support_email") if "support_email" in payload else current["support_email"]).strip()
    if "@" not in support_email or "." not in support_email:
        raise SettingsAdminError("Please enter a valid support email address.", code="invalid_support_email", status_code=422)

    try:
        free_threshold_php = float(
            payload.get("free_shipping_threshold")
            if "free_shipping_threshold" in payload
            else current["free_shipping_threshold_cents"] / 100
        )
        standard_shipping_php = float(
            payload.get("standard_shipping_fee")
            if "standard_shipping_fee" in payload
            else current["standard_shipping_cents"] / 100
        )
        low_stock_threshold = int(
            payload.get("default_low_stock_threshold")
            if "default_low_stock_threshold" in payload
            else current["default_low_stock_threshold"]
        )
        return_window_days = int(
            payload.get("return_window_days")
            if "return_window_days" in payload
            else current["return_window_days"]
        )
    except (TypeError, ValueError):
        raise SettingsAdminError("Numeric configuration fields must be valid numbers.", code="invalid_numeric_setting", status_code=422)

    if free_threshold_php < 0 or standard_shipping_php < 0 or low_stock_threshold < 0 or return_window_days < 1:
        raise SettingsAdminError("Shipping fees and thresholds must be non-negative (return window >= 1 day).", code="invalid_setting_bounds", status_code=422)

    raw_methods = payload.get("enabled_payment_methods")
    if raw_methods is None:
        enabled_methods = list(current["enabled_payment_methods"])
    else:
        if not isinstance(raw_methods, list):
            raise SettingsAdminError("enabled_payment_methods must be a list.", code="invalid_payment_methods", status_code=422)
        enabled_methods = [m for m in raw_methods if m in SUPPORTED_STORE_PAYMENT_METHODS]
        if not enabled_methods:
            raise SettingsAdminError("At least one checkout payment method must remain enabled.", code="empty_payment_methods", status_code=422)

    next_value = {
        "store_name": store_name,
        "support_email": support_email,
        "free_shipping_threshold_cents": int(round(free_threshold_php * 100)),
        "standard_shipping_cents": int(round(standard_shipping_php * 100)),
        "default_low_stock_threshold": low_stock_threshold,
        "return_window_days": return_window_days,
        "enabled_payment_methods": enabled_methods,
    }

    row = StoreSetting.query.filter_by(setting_key=STORE_CONFIG_KEY).one_or_none()
    if row is None:
        row = StoreSetting(
            setting_key=STORE_CONFIG_KEY,
            value_json=next_value,
            updated_by_id=actor.id if actor else None,
        )
        db.session.add(row)
    else:
        row.value_json = next_value
        row.updated_by_id = actor.id if actor else None

    record_admin_audit(
        actor=actor,
        action="settings.update",
        entity_type="store_setting",
        entity_id=STORE_CONFIG_KEY,
        summary=f"Updated store config (Shipping ₱{standard_shipping_php:.2f}, Free threshold ₱{free_threshold_php:.2f}, Methods: {', '.join(enabled_methods)})",
        metadata=next_value,
        commit=False,
    )
    db.session.commit()
    return get_store_config()


def record_admin_audit(
    *,
    actor: User = None,
    action: str,
    entity_type: str,
    entity_id: str | int = None,
    summary: str,
    metadata: dict = None,
    commit: bool = True,
):
    entry = AdminAuditLog(
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else "system@secondmarket.local",
        actor_role=actor.role if actor else "system",
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        summary=summary[:500],
        metadata_json=metadata or {},
    )
    db.session.add(entry)
    if commit:
        db.session.commit()
    return entry


def list_admin_audit_logs(page: int = 1, per_page: int = 30, action_filter: str = None) -> dict:
    query = AdminAuditLog.query
    if action_filter and action_filter != "all":
        query = query.filter(AdminAuditLog.action.ilike(f"%{action_filter}%"))
    query = query.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    return {
        "logs": [item.to_dict() for item in items],
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": max(1, (total + per_page - 1) // per_page),
        },
    }


def list_staff_accounts() -> dict:
    staff = (
        User.query.filter(User.role.in_(STAFF_ROLES))
        .order_by(User.created_at.asc(), User.id.asc())
        .all()
    )
    roles_catalog = [
        {
            "role": role,
            "label": {
                StaffRole.ADMIN.value: "Owner / Full Admin",
                StaffRole.CATALOG_MANAGER.value: "Catalog Manager",
                StaffRole.FULFILLMENT_STAFF.value: "Fulfillment Staff",
                StaffRole.SUPPORT_AGENT.value: "Support & Moderation Agent",
            }.get(role, role.replace("_", " ").title()),
            "capabilities": sorted(ROLE_CAPABILITIES.get(role, set())),
        }
        for role in STAFF_ROLES
    ]
    return {
        "staff": [
            {
                "id": u.id,
                "email": u.email,
                "name": f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email,
                "role": u.role,
                "status": u.status,
                "capabilities": permissions_for_role(u.role),
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in staff
        ],
        "roles": roles_catalog,
    }


def update_staff_role_or_create(payload: dict, actor: User) -> dict:
    target_role = (payload.get("role") or "").strip().lower()
    if target_role not in STAFF_ROLES and target_role != "buyer":
        raise SettingsAdminError(
            f"Unsupported role '{target_role}'. Must be one of: {', '.join(STAFF_ROLES)}, buyer.",
            code="invalid_role",
            status_code=422,
        )

    user_id = payload.get("user_id")
    email = (payload.get("email") or "").strip().lower()

    user = None
    if user_id is not None:
        user = User.query.filter_by(id=int(user_id)).one_or_none()
    elif email:
        user = User.query.filter_by(email=email).one_or_none()

    if user is None:
        if not email or "@" not in email:
            raise SettingsAdminError("Provide an existing user or a valid email address.", code="missing_staff_email", status_code=422)
        password = str(payload.get("password") or "")
        if len(password) < 8:
            raise SettingsAdminError("A temporary password (at least 8 characters) is required for new staff accounts.", code="weak_password", status_code=422)
        first_name = (payload.get("first_name") or "Staff").strip()
        last_name = (payload.get("last_name") or "Member").strip()
        user = User(
            email=email,
            role=target_role,
            first_name=first_name,
            last_name=last_name,
            status=UserStatus.ACTIVE.value,
            email_verified=True,
        )
        user.set_password(password)
        db.session.add(user)
        db.session.flush()
        summary = f"Created staff account {user.email} with role {target_role}"
    else:
        if actor and user.id == actor.id and target_role != StaffRole.ADMIN.value:
            raise SettingsAdminError("You cannot demote your own Owner Admin role.", code="self_demotion_forbidden", status_code=409)
        old_role = user.role
        user.role = target_role
        summary = f"Updated role for {user.email}: {old_role} -> {target_role}"

    record_admin_audit(
        actor=actor,
        action="staff.role_update",
        entity_type="user",
        entity_id=user.id,
        summary=summary,
        metadata={"email": user.email, "role": target_role},
        commit=False,
    )
    db.session.commit()
    return {
        "id": user.id,
        "email": user.email,
        "name": f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email,
        "role": user.role,
        "status": user.status,
        "capabilities": permissions_for_role(user.role),
    }
