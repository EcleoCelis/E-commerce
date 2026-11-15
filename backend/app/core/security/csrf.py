import hmac
import hashlib
import secrets
from flask import current_app, request
from backend.app.core.responses import error_response


CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"
CSRF_EXEMPT_PATHS = {
    "/api/v1/checkout/payments/webhook",
}


def generate_csrf_token() -> str:
    secret = current_app.config.get("SECRET_KEY", "default-csrf-secret").encode("utf-8")
    random_bytes = secrets.token_bytes(32)
    sig = hmac.new(secret, random_bytes, hashlib.sha256).hexdigest()
    return f"{random_bytes.hex()}.{sig}"


def is_valid_csrf_token(token: str) -> bool:
    if not token or "." not in token:
        return False
    parts = token.split(".", 1)
    if len(parts) != 2:
        return False
    raw_hex, signature = parts
    try:
        raw_bytes = bytes.fromhex(raw_hex)
    except ValueError:
        return False

    secret = current_app.config.get("SECRET_KEY", "default-csrf-secret").encode("utf-8")
    expected_sig = hmac.new(secret, raw_bytes, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected_sig, signature)


def register_csrf_protection(app):
    @app.before_request
    def check_csrf():
        if request.method in {"GET", "HEAD", "OPTIONS"}:
            return None

        if request.path in CSRF_EXEMPT_PATHS:
            return None

        # Exemption for testing unless explicitly tested
        if app.config.get("TESTING", False) and not request.headers.get("X-Test-CSRF"):
            return None

        if not app.config.get("CSRF_PROTECTION_ENABLED", False) and not request.headers.get("X-Test-CSRF"):
            return None

        # Extract submitted token from headers or form data
        submitted_token = request.headers.get(CSRF_HEADER_NAME) or request.form.get("csrf_token")
        if not submitted_token and request.is_json:
            json_data = request.get_json(silent=True) or {}
            submitted_token = json_data.get("csrf_token")

        if not submitted_token or not is_valid_csrf_token(submitted_token):
            return error_response(
                message="CSRF verification failed. Missing or invalid token.",
                status_code=403,
                code="csrf_token_invalid",
            )

        return None
