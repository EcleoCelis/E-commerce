from flask import Blueprint, current_app, g, request

from backend.app.auth.decorators import login_required
from backend.app.auth.service import (
    AuthError,
    authenticate_user,
    change_user_password,
    create_auth_session,
    deactivate_user_account,
    find_session_by_token,
    get_payment_methods_catalog,
    get_user_profile_summary,
    list_active_user_sessions,
    register_buyer,
    remove_user_avatar,
    request_password_reset,
    reset_password_with_token,
    revoke_other_user_sessions,
    revoke_session,
    revoke_user_session_by_id,
    update_user_payment_preferences,
    update_user_profile,
    upload_user_avatar,
)
from backend.app.auth.validation import (
    validate_change_password_payload,
    validate_deactivate_payload,
    validate_forgot_password_payload,
    validate_login_payload,
    validate_payment_preferences_payload,
    validate_profile_payload,
    validate_register_payload,
    validate_reset_password_payload,
)
from backend.app.core.responses import error_response, success_response
from backend.app.core.security.csrf import generate_csrf_token
from backend.app.core.security.rate_limiter import rate_limit


auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


def validation_error_response(errors):
    return error_response(
        message="Request validation failed.",
        status_code=422,
        code="validation_error",
        details=errors,
    )


def not_implemented_response(next_step):
    return error_response(
        message="Authentication persistence is not wired yet.",
        status_code=501,
        code="auth_workflow_not_implemented",
        details={"next_step": next_step},
    )


def auth_error_response(error):
    return error_response(
        message=error.message,
        status_code=error.status_code,
        code=error.code,
        details=error.details,
    )


def session_cookie_name():
    return current_app.config["AUTH_SESSION_COOKIE_NAME"]


def get_current_session():
    token = request.cookies.get(session_cookie_name())
    return find_session_by_token(token)


def attach_session_cookie(response, token, session):
    response.set_cookie(
        session_cookie_name(),
        token,
        httponly=True,
        secure=not current_app.config["DEBUG"] and not current_app.config["TESTING"],
        samesite="Lax",
        expires=session.expires_at,
        path="/",
    )
    return response


@auth_bp.post("/register")
@rate_limit(limit=10, window_seconds=60)
def register():
    data, errors = validate_register_payload(request.get_json(silent=True))
    if errors:
        return validation_error_response(errors)

    try:
        user = register_buyer(data)
        token, session = create_auth_session(
            user,
            user_agent=request.headers.get("User-Agent"),
            ip_address=request.remote_addr,
            duration_days=current_app.config["AUTH_SESSION_DAYS"],
        )
    except AuthError as error:
        return auth_error_response(error)

    response, status_code = success_response(
        data={"authenticated": True, "user": user.to_public_dict()},
        message="Registration successful.",
        status_code=201,
    )
    attach_session_cookie(response, token, session)
    return response, status_code


@auth_bp.post("/login")
@rate_limit(limit=15, window_seconds=60)
def login():
    data, errors = validate_login_payload(request.get_json(silent=True))
    if errors:
        return validation_error_response(errors)

    try:
        user = authenticate_user(data["email"], data["password"])
        token, session = create_auth_session(
            user,
            user_agent=request.headers.get("User-Agent"),
            ip_address=request.remote_addr,
            duration_days=current_app.config["AUTH_SESSION_DAYS"],
        )
    except AuthError as error:
        return auth_error_response(error)

    response, status_code = success_response(
        data={"authenticated": True, "user": user.to_public_dict()},
        message="Login successful.",
    )
    attach_session_cookie(response, token, session)
    return response, status_code


@auth_bp.post("/logout")
def logout():
    session = get_current_session()
    if session is not None:
        revoke_session(session)

    response, status_code = success_response(data={"authenticated": False}, message="Logout successful.")
    response.delete_cookie(session_cookie_name(), path="/")
    return response, status_code


@auth_bp.get("/me")
def current_user():
    session = get_current_session()
    if session is not None:
        return success_response(
            data={"authenticated": True, "user": session.user.to_public_dict()},
            message="Authenticated user loaded.",
        )

    return success_response(
        data={"authenticated": False, "user": None},
        message="No authenticated user is available.",
    )


@auth_bp.post("/forgot-password")
@rate_limit(limit=5, window_seconds=60)
def forgot_password():
    data, errors = validate_forgot_password_payload(request.get_json(silent=True))
    if errors:
        return validation_error_response(errors)

    raw_token, user = request_password_reset(data["email"])
    if raw_token and user and user.email:
        from backend.app.communication import email_service

        email_service.send_password_reset(user.email, raw_token)

    # Generic response prevents account enumeration
    response_data = {"requested": True}
    if current_app.config.get("TESTING") or current_app.config.get("DEBUG"):
        # Include token in testing/debug environments to facilitate automated verification
        response_data["dev_token"] = raw_token

    return success_response(
        data=response_data,
        message="If an account matches that email address, password reset instructions have been sent.",
    )


@auth_bp.post("/reset-password")
@rate_limit(limit=5, window_seconds=60)
def reset_password():
    data, errors = validate_reset_password_payload(request.get_json(silent=True))
    if errors:
        return validation_error_response(errors)

    try:
        user = reset_password_with_token(data["token"], data["new_password"])
    except AuthError as error:
        return auth_error_response(error)

    return success_response(
        data={"reset": True, "email": user.email},
        message="Password has been reset successfully. Please log in with your new password.",
    )


@auth_bp.post("/change-password")
@login_required
def change_password():
    data, errors = validate_change_password_payload(request.get_json(silent=True))
    if errors:
        return validation_error_response(errors)

    try:
        user = change_user_password(
            g.current_user,
            data["current_password"],
            data["new_password"],
            current_session=g.current_session,
        )
    except AuthError as error:
        return auth_error_response(error)

    return success_response(
        data={"updated": True},
        message="Password changed successfully.",
    )


@auth_bp.patch("/profile")
@auth_bp.patch("/me")
@login_required
def update_profile():
    data, errors = validate_profile_payload(request.get_json(silent=True))
    if errors:
        return validation_error_response(errors)

    try:
        user = update_user_profile(g.current_user, data)
    except AuthError as error:
        return auth_error_response(error)

    return success_response(
        data=user.to_public_dict(),
        message="Profile updated successfully.",
    )


@auth_bp.get("/profile-summary")
@login_required
def profile_summary():
    summary = get_user_profile_summary(g.current_user, current_session=g.current_session)
    return success_response(
        data=summary,
        message="Profile summary loaded.",
    )


@auth_bp.post("/profile/avatar")
@auth_bp.post("/me/avatar")
@login_required
def upload_avatar():
    file_storage = (
        request.files.get("avatar")
        or request.files.get("file")
        or request.files.get("image")
    )
    try:
        user = upload_user_avatar(g.current_user, file_storage)
    except AuthError as error:
        return auth_error_response(error)

    return success_response(
        data={
            "avatar_url": user.avatar_url,
            "user": user.to_public_dict(),
        },
        message="Profile picture updated successfully.",
    )


@auth_bp.delete("/profile/avatar")
@auth_bp.delete("/me/avatar")
@login_required
def delete_avatar():
    user = remove_user_avatar(g.current_user)
    return success_response(
        data={
            "avatar_url": None,
            "user": user.to_public_dict(),
        },
        message="Profile picture removed and default avatar restored.",
    )


@auth_bp.get("/payment-preferences")
@login_required
def get_payment_preferences():
    user = g.current_user
    return success_response(
        data={
            "preferred_payment_method": user.preferred_payment_method or "cash_on_delivery",
            "payment_preferences": user.resolved_payment_preferences(),
            "supported_methods": get_payment_methods_catalog(),
        },
        message="Payment preferences loaded.",
    )


@auth_bp.patch("/payment-preferences")
@login_required
def patch_payment_preferences():
    data, errors = validate_payment_preferences_payload(request.get_json(silent=True))
    if errors:
        return validation_error_response(errors)

    try:
        user = update_user_payment_preferences(g.current_user, data)
    except AuthError as error:
        return auth_error_response(error)

    return success_response(
        data={
            "preferred_payment_method": user.preferred_payment_method,
            "payment_preferences": user.resolved_payment_preferences(),
            "user": user.to_public_dict(),
        },
        message="Payment preferences saved.",
    )


@auth_bp.get("/sessions")
@login_required
def get_sessions():
    sessions = list_active_user_sessions(g.current_user, current_session=g.current_session)
    return success_response(
        data={"sessions": sessions},
        message="Active sessions loaded.",
    )


@auth_bp.post("/sessions/revoke-others")
@login_required
def revoke_other_sessions():
    revoked_count = revoke_other_user_sessions(g.current_user, current_session=g.current_session)
    return success_response(
        data={
            "revoked_count": revoked_count,
            "sessions": list_active_user_sessions(g.current_user, current_session=g.current_session),
        },
        message=f"Signed out of {revoked_count} other active session(s).",
    )


@auth_bp.delete("/sessions/<int:session_id>")
@login_required
def revoke_single_session(session_id):
    try:
        target = revoke_user_session_by_id(g.current_user, session_id, current_session=g.current_session)
    except AuthError as error:
        return auth_error_response(error)

    is_current = g.current_session is not None and target.id == g.current_session.id
    response, status_code = success_response(
        data={"revoked": True, "revoked_current": is_current},
        message="Session revoked successfully.",
    )
    if is_current:
        response.delete_cookie(session_cookie_name(), path="/")
    return response, status_code


@auth_bp.post("/deactivate")
@login_required
def deactivate_account():
    data, errors = validate_deactivate_payload(request.get_json(silent=True))
    if errors:
        return validation_error_response(errors)

    try:
        deactivate_user_account(g.current_user, data["password"])
    except AuthError as error:
        return auth_error_response(error)

    response, status_code = success_response(
        data={"deactivated": True, "authenticated": False},
        message="Your account has been deactivated and signed out.",
    )
    response.delete_cookie(session_cookie_name(), path="/")
    return response, status_code


@auth_bp.get("/csrf-token")
def csrf_token():
    token = generate_csrf_token()
    response, status_code = success_response(
        data={"csrf_token": token},
        message="CSRF token generated.",
    )
    response.set_cookie(
        "csrf_token",
        token,
        httponly=False,  # Accessible to JavaScript for X-CSRF-Token header
        secure=not current_app.config["DEBUG"] and not current_app.config["TESTING"],
        samesite="Lax",
        path="/",
    )
    return response, status_code
