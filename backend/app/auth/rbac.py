from enum import StrEnum


class Role(StrEnum):
    BUYER = "buyer"
    ADMIN = "admin"


class StaffRole(StrEnum):
    ADMIN = "admin"
    CATALOG_MANAGER = "catalog_manager"
    FULFILLMENT_STAFF = "fulfillment_staff"
    SUPPORT_AGENT = "support_agent"


PUBLIC_ROLES = tuple(role.value for role in Role)
STAFF_ROLES = tuple(role.value for role in StaffRole)

ROLE_CAPABILITIES = {
    StaffRole.ADMIN.value: {
        "dashboard",
        "products",
        "categories",
        "orders",
        "customers",
        "payments",
        "moderation",
        "returns",
        "coupons",
        "support",
        "reports",
        "settings",
        "staff_rbac",
    },
    StaffRole.CATALOG_MANAGER.value: {
        "dashboard",
        "products",
        "categories",
        "coupons",
        "reports",
    },
    StaffRole.FULFILLMENT_STAFF.value: {
        "dashboard",
        "orders",
        "returns",
        "customers",
        "reports",
    },
    StaffRole.SUPPORT_AGENT.value: {
        "dashboard",
        "orders",
        "customers",
        "moderation",
        "returns",
        "support",
    },
}


def is_valid_role(role):
    return role in PUBLIC_ROLES or role in STAFF_ROLES


def is_staff_role(role):
    return role in STAFF_ROLES


def permissions_for_role(role):
    return sorted(ROLE_CAPABILITIES.get(role, set()))

