import re

from backend.app.auth.rbac import Role, is_valid_role
from backend.app.auth.security import validate_password_strength
from backend.app.models.identity import DEFAULT_NOTIFICATION_PREFERENCES, EMAIL_PATTERN


PHONE_PATTERN = re.compile(r"^[0-9+\-\s()]{7,25}$")
POSTAL_CODE_PATTERN = re.compile(r"^[0-9A-Za-z\-\s]{3,16}$")
VALID_THEMES = {"light", "dark", "system"}
SUPPORTED_PROFILE_PAYMENT_METHODS = {"cash_on_delivery", "gcash_pending", "credit_debit_card"}
FORBIDDEN_RAW_CARD_FIELDS = {"card_number", "cvv", "cvc", "pan", "card_cvv", "security_code"}


def is_valid_phone(phone_value):
    if not phone_value:
        return False
    cleaned = str(phone_value).strip()
    if not PHONE_PATTERN.match(cleaned):
        return False
    digits = re.sub(r"\D", "", cleaned)
    return 7 <= len(digits) <= 15


def require_json_object(payload):
    if not isinstance(payload, dict):
        return {}, {"body": ["Request body must be a JSON object."]}

    return payload, {}


def validate_register_payload(payload):
    payload, errors = require_json_object(payload)
    if errors:
        return {}, errors

    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    first_name = (payload.get("first_name") or "").strip()
    last_name = (payload.get("last_name") or "").strip()
    role = (payload.get("role") or Role.BUYER.value).strip()
    phone = (payload.get("phone") or "").strip() or None
    errors = {}

    if not EMAIL_PATTERN.match(email):
        errors.setdefault("email", []).append("A valid email address is required.")

    password_result = validate_password_strength(password)
    if not password_result.is_valid:
        errors["password"] = list(password_result.errors)

    if not first_name:
        errors.setdefault("first_name", []).append("First name is required.")
    if not last_name:
        errors.setdefault("last_name", []).append("Last name is required.")
    if not is_valid_role(role):
        errors.setdefault("role", []).append("Role must be buyer or admin.")
    elif role != Role.BUYER.value:
        errors.setdefault("role", []).append("Only buyer registration is available publicly.")

    data = {
        "email": email,
        "password": password,
        "first_name": first_name,
        "last_name": last_name,
        "role": role,
        "phone": phone,
    }
    return data, errors


def validate_login_payload(payload):
    payload, errors = require_json_object(payload)
    if errors:
        return {}, errors

    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    errors = {}

    if not EMAIL_PATTERN.match(email):
        errors.setdefault("email", []).append("A valid email address is required.")
    if not password:
        errors.setdefault("password", []).append("Password is required.")

    return {"email": email, "password": password}, errors


def validate_forgot_password_payload(payload):
    payload, errors = require_json_object(payload)
    if errors:
        return {}, errors

    email = (payload.get("email") or "").strip().lower()
    errors = {}
    if not EMAIL_PATTERN.match(email):
        errors.setdefault("email", []).append("A valid email address is required.")

    return {"email": email}, errors


def validate_reset_password_payload(payload):
    payload, errors = require_json_object(payload)
    if errors:
        return {}, errors

    token = (payload.get("token") or "").strip()
    new_password = payload.get("new_password") or payload.get("password") or ""
    errors = {}

    if not token:
        errors.setdefault("token", []).append("Reset token is required.")

    password_result = validate_password_strength(new_password)
    if not password_result.is_valid:
        errors["new_password"] = list(password_result.errors)

    return {"token": token, "new_password": new_password}, errors


def validate_change_password_payload(payload):
    payload, errors = require_json_object(payload)
    if errors:
        return {}, errors

    current_password = payload.get("current_password") or ""
    new_password = payload.get("new_password") or ""
    confirm_password = payload.get("confirm_password")
    errors = {}

    if not current_password:
        errors.setdefault("current_password", []).append("Current password is required.")

    password_result = validate_password_strength(new_password)
    if not password_result.is_valid:
        errors["new_password"] = list(password_result.errors)

    if confirm_password is not None and confirm_password != new_password:
        errors.setdefault("confirm_password", []).append("Password confirmation does not match the new password.")

    return {"current_password": current_password, "new_password": new_password}, errors


def _validate_raw_card_fields(payload_dict, errors):
    if not isinstance(payload_dict, dict):
        return
    for forbidden_key in FORBIDDEN_RAW_CARD_FIELDS:
        if forbidden_key in payload_dict and payload_dict.get(forbidden_key) not in (None, ""):
            errors.setdefault("payment_preferences", []).append(
                "Raw card numbers or CVV security codes are never stored directly by SecondMarket."
            )
            break


def validate_payment_preferences_payload(payload):
    payload, errors = require_json_object(payload)
    if errors:
        return {}, errors

    data = {}
    errors = {}
    _validate_raw_card_fields(payload, errors)

    if "preferred_payment_method" in payload:
        preferred = str(payload.get("preferred_payment_method") or "").strip()
        if preferred not in SUPPORTED_PROFILE_PAYMENT_METHODS:
            errors.setdefault("preferred_payment_method", []).append(
                "Preferred payment method must be a supported checkout option (cash_on_delivery, gcash_pending, or credit_debit_card)."
            )
        else:
            data["preferred_payment_method"] = preferred

    enabled_methods = payload.get("enabled_methods")
    if enabled_methods is not None:
        if not isinstance(enabled_methods, list) or not enabled_methods:
            errors.setdefault("enabled_methods", []).append("At least one supported payment method must remain enabled.")
        else:
            cleaned_methods = []
            for method in enabled_methods:
                m = str(method or "").strip()
                if m not in SUPPORTED_PROFILE_PAYMENT_METHODS:
                    errors.setdefault("enabled_methods", []).append(
                        f"Payment method '{m}' is not supported by checkout."
                    )
                elif m not in cleaned_methods:
                    cleaned_methods.append(m)
            if cleaned_methods:
                data["enabled_methods"] = cleaned_methods

    if "gcash_mobile" in payload:
        gcash_mobile = str(payload.get("gcash_mobile") or "").strip() or None
        if gcash_mobile and not is_valid_phone(gcash_mobile):
            errors.setdefault("gcash_mobile", []).append("Enter a valid mobile number for GCash reference.")
        else:
            data["gcash_mobile"] = gcash_mobile

    if (
        "preferred_payment_method" in data
        and "enabled_methods" in data
        and data["preferred_payment_method"] not in data["enabled_methods"]
    ):
        data["enabled_methods"].append(data["preferred_payment_method"])

    return data, errors


def validate_profile_payload(payload):
    payload, errors = require_json_object(payload)
    if errors:
        return {}, errors

    data = {}
    errors = {}
    _validate_raw_card_fields(payload, errors)

    if "first_name" in payload:
        first_name = str(payload.get("first_name") or "").strip()
        if not first_name:
            errors.setdefault("first_name", []).append("First name cannot be empty.")
        elif len(first_name) > 80:
            errors.setdefault("first_name", []).append("First name must be 80 characters or fewer.")
        else:
            data["first_name"] = first_name

    if "last_name" in payload:
        last_name = str(payload.get("last_name") or "").strip()
        if not last_name:
            errors.setdefault("last_name", []).append("Last name cannot be empty.")
        elif len(last_name) > 80:
            errors.setdefault("last_name", []).append("Last name must be 80 characters or fewer.")
        else:
            data["last_name"] = last_name

    if "email" in payload:
        email = str(payload.get("email") or "").strip().lower()
        if not email or not EMAIL_PATTERN.match(email):
            errors.setdefault("email", []).append("A valid email address is required.")
        else:
            data["email"] = email

    if "phone" in payload:
        phone = str(payload.get("phone") or "").strip() or None
        if phone is not None and not is_valid_phone(phone):
            errors.setdefault("phone", []).append("Enter a valid contact or mobile number (7 to 15 digits).")
        else:
            data["phone"] = phone

    if "theme_preference" in payload:
        theme = str(payload.get("theme_preference") or "").strip().lower()
        if theme not in VALID_THEMES:
            errors.setdefault("theme_preference", []).append("Theme preference must be light, dark, or system.")
        else:
            data["theme_preference"] = theme

    if "preferred_payment_method" in payload:
        pref_pay = str(payload.get("preferred_payment_method") or "").strip()
        if pref_pay not in SUPPORTED_PROFILE_PAYMENT_METHODS:
            errors.setdefault("preferred_payment_method", []).append(
                "Preferred payment method must be cash_on_delivery, gcash_pending, or credit_debit_card."
            )
        else:
            data["preferred_payment_method"] = pref_pay

    if "payment_preferences" in payload:
        pay_prefs = payload.get("payment_preferences")
        if not isinstance(pay_prefs, dict):
            errors.setdefault("payment_preferences", []).append("Payment preferences must be an object.")
        else:
            _validate_raw_card_fields(pay_prefs, errors)
            parsed_pay, pay_errors = validate_payment_preferences_payload(pay_prefs)
            if pay_errors:
                for k, v in pay_errors.items():
                    errors.setdefault(k, []).extend(v)
            else:
                data["payment_preferences"] = parsed_pay

    if "notification_preferences" in payload:
        notif_prefs = payload.get("notification_preferences")
        if not isinstance(notif_prefs, dict):
            errors.setdefault("notification_preferences", []).append("Notification preferences must be an object.")
        else:
            cleaned_notif = {}
            for key in DEFAULT_NOTIFICATION_PREFERENCES:
                if key in notif_prefs:
                    cleaned_notif[key] = bool(notif_prefs[key])
            cleaned_notif["security_alerts"] = True
            data["notification_preferences"] = cleaned_notif

    return data, errors


def validate_address_payload(payload, partial=False):
    payload, errors = require_json_object(payload)
    if errors:
        return {}, errors

    normalized = dict(payload)
    if "address_line1" in normalized and "street_line1" not in normalized:
        normalized["street_line1"] = normalized["address_line1"]
    if "address_line2" in normalized and "street_line2" not in normalized:
        normalized["street_line2"] = normalized["address_line2"]
    if "province" in normalized and "state_or_province" not in normalized:
        normalized["state_or_province"] = normalized["province"]

    data = {}
    errors = {}

    fields = [
        ("recipient_name", True, "Recipient name is required."),
        ("phone", True, "Phone number is required."),
        ("street_line1", True, "Street address line 1 is required."),
        ("street_line2", False, None),
        ("city", True, "City is required."),
        ("state_or_province", True, "State or province is required."),
        ("postal_code", True, "Postal code is required."),
        ("country", False, None),
        ("label", False, None),
        ("delivery_instructions", False, None),
    ]

    for field, required, msg in fields:
        if field in normalized or not partial:
            val = str(normalized.get(field) or "").strip()
            if required and not val:
                errors.setdefault(field, []).append(msg)
            data[field] = val or (None if not required else "")

    if "phone" in data and data["phone"]:
        if not is_valid_phone(data["phone"]):
            errors.setdefault("phone", []).append("Enter a valid mobile or phone number (7 to 15 digits).")

    if "postal_code" in data and data["postal_code"]:
        if not POSTAL_CODE_PATTERN.match(data["postal_code"]):
            errors.setdefault("postal_code", []).append("Enter a valid postal code.")

    if "delivery_instructions" in data and data["delivery_instructions"]:
        if len(data["delivery_instructions"]) > 500:
            errors.setdefault("delivery_instructions", []).append("Delivery instructions must be 500 characters or fewer.")

    if "is_default" in normalized:
        data["is_default"] = bool(normalized.get("is_default"))
    elif not partial:
        data["is_default"] = False

    if not partial and not data.get("country"):
        data["country"] = "Philippines"
    elif "country" in data and not data["country"]:
        data["country"] = "Philippines"

    return data, errors


def validate_deactivate_payload(payload):
    payload, errors = require_json_object(payload)
    if errors:
        return {}, errors

    password = payload.get("password") or payload.get("current_password") or ""
    reason = str(payload.get("reason") or "").strip() or None
    errors = {}

    if not password:
        errors.setdefault("password", []).append("Current password is required to confirm account deactivation.")

    return {"password": password, "reason": reason}, errors
