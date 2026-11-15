import io
from PIL import Image
from backend.app import create_app
from backend.app.auth.service import create_auth_session, register_buyer
from backend.app.core.config import TestingConfig
from backend.app.core.security.csrf import generate_csrf_token
from backend.app.core.security.rate_limiter import reset_rate_limits
from backend.app.extensions import db
from backend.app.models import User, UserStatus


def setup_security_fixtures():
    db.drop_all()
    db.create_all()

    buyer = register_buyer({
        "email": "security_test@example.com",
        "password": "SecurePassword123!",
        "first_name": "Sam",
        "last_name": "Security",
        "role": "buyer",
        "phone": "09171234567",
    })
    admin = User(
        email="admin_sec@example.com",
        role="admin",
        status=UserStatus.ACTIVE.value,
        first_name="Admin",
        last_name="Security",
    )
    admin.set_password("AdminSecurePass123!")
    db.session.add(admin)
    db.session.commit()

    buyer_token, _ = create_auth_session(buyer)
    admin_token, _ = create_auth_session(admin)
    return (buyer, buyer_token), (admin, admin_token)


def test_security_headers_present_on_responses():
    app = create_app(TestingConfig)
    client = app.test_client()

    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "SAMEORIGIN"
    assert response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "default-src 'self'" in response.headers.get("Content-Security-Policy", "")


def test_hardened_image_uploads():
    app = create_app(TestingConfig)
    with app.app_context():
        _, (_, admin_token) = setup_security_fixtures()
        client = app.test_client()
        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], admin_token)

        # 1. Non-image file disguised as image rejected
        fake_image = io.BytesIO(b"This is plain text pretending to be a JPG.")
        resp = client.post(
            "/api/v1/admin/categories/upload-image",
            data={"image": (fake_image, "malicious.jpg")},
            content_type="multipart/form-data",
        )
        assert resp.status_code == 422
        assert resp.json["error"]["code"] == "corrupted_image"

        # 2. SVG with malicious script injection rejected
        bad_svg = io.BytesIO(b'<svg><script>alert("xss")</script></svg>')
        resp = client.post(
            "/api/v1/admin/categories/upload-image",
            data={"image": (bad_svg, "exploit.svg")},
            content_type="multipart/form-data",
        )
        assert resp.status_code == 422
        assert resp.json["error"]["code"] == "unsafe_svg_content"

        # 3. Valid raster image processed & re-encoded safely
        img_buffer = io.BytesIO()
        img = Image.new("RGB", (100, 100), color="blue")
        img.save(img_buffer, format="JPEG")
        img_buffer.seek(0)

        resp = client.post(
            "/api/v1/admin/categories/upload-image",
            data={"image": (img_buffer, "clean_category.jpg")},
            content_type="multipart/form-data",
        )
        assert resp.status_code == 201
        data = resp.json["data"]
        assert "image_url" in data
        assert data["filename"].endswith(".jpg")


def test_csrf_protection_and_token_endpoint():
    app = create_app(TestingConfig)
    with app.app_context():
        (buyer, buyer_token), _ = setup_security_fixtures()
        client = app.test_client()

        # 1. CSRF token generation endpoint
        resp = client.get("/api/v1/auth/csrf-token")
        assert resp.status_code == 200
        token = resp.json["data"]["csrf_token"]
        assert token and "." in token

        # 2. State-changing request with X-Test-CSRF header but missing token rejected
        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], buyer_token)
        resp = client.patch(
            "/api/v1/auth/profile",
            json={"first_name": "Attacker"},
            headers={"X-Test-CSRF": "true"},
        )
        assert resp.status_code == 403
        assert resp.json["error"]["code"] == "csrf_token_invalid"

        # 3. State-changing request with valid X-CSRF-Token header accepted
        resp = client.patch(
            "/api/v1/auth/profile",
            json={"first_name": "Verified"},
            headers={"X-Test-CSRF": "true", "X-CSRF-Token": token},
        )
        assert resp.status_code == 200
        assert resp.json["data"]["first_name"] == "Verified"


def test_rate_limiting_enforcement():
    app = create_app(TestingConfig)
    with app.app_context():
        setup_security_fixtures()
        reset_rate_limits()
        client = app.test_client()

        # Repeated login attempts with X-Test-Rate-Limit trigger 429
        for i in range(15):
            resp = client.post(
                "/api/v1/auth/login",
                json={"email": "wrong@example.com", "password": "WrongPassword!"},
                headers={"X-Test-Rate-Limit": "true"},
            )
            if i < 15:
                assert resp.status_code in (401, 422)

        # 16th attempt hits rate limit
        rate_limited_resp = client.post(
            "/api/v1/auth/login",
            json={"email": "wrong@example.com", "password": "WrongPassword!"},
            headers={"X-Test-Rate-Limit": "true"},
        )
        assert rate_limited_resp.status_code == 429
        assert rate_limited_resp.json["error"]["code"] == "rate_limit_exceeded"


def test_account_self_service_workflows():
    app = create_app(TestingConfig)
    with app.app_context():
        (buyer, buyer_token), _ = setup_security_fixtures()
        client = app.test_client()

        # 1. Forgot password request (generic response prevents enumeration)
        resp = client.post("/api/v1/auth/forgot-password", json={"email": "security_test@example.com"})
        assert resp.status_code == 200
        dev_token = resp.json["data"]["dev_token"]
        assert dev_token is not None

        # Unknown email still returns generic success
        resp_unknown = client.post("/api/v1/auth/forgot-password", json={"email": "nobody_here@example.com"})
        assert resp_unknown.status_code == 200

        # 2. Reset password using valid token
        resp_reset = client.post("/api/v1/auth/reset-password", json={
            "token": dev_token,
            "new_password": "BrandNewPassword456!",
        })
        assert resp_reset.status_code == 200
        assert resp_reset.json["data"]["reset"] is True

        # Reusing the token fails
        resp_reuse = client.post("/api/v1/auth/reset-password", json={
            "token": dev_token,
            "new_password": "AnotherPassword789!",
        })
        assert resp_reuse.status_code == 400
        assert resp_reuse.json["error"]["code"] == "invalid_reset_token"

        # 3. Log in with new password
        login_resp = client.post("/api/v1/auth/login", json={
            "email": "security_test@example.com",
            "password": "BrandNewPassword456!",
        })
        assert login_resp.status_code == 200
        new_session_token = login_resp.headers.get("Set-Cookie").split(";")[0].split("=")[1]

        # 4. Change password authenticated
        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], new_session_token)
        change_resp = client.post("/api/v1/auth/change-password", json={
            "current_password": "BrandNewPassword456!",
            "new_password": "EvenNewerPassword999!",
        })
        assert change_resp.status_code == 200

        # Wrong current password fails
        change_fail = client.post("/api/v1/auth/change-password", json={
            "current_password": "WrongPassword!",
            "new_password": "WhateverPassword123!",
        })
        assert change_fail.status_code == 400

        # 5. Profile update (no privilege escalation)
        prof_resp = client.patch("/api/v1/auth/profile", json={
            "first_name": "Samantha",
            "phone": "09189998888",
            "role": "admin",  # Must be ignored / cannot escalate
        })
        assert prof_resp.status_code == 200
        assert prof_resp.json["data"]["first_name"] == "Samantha"
        assert prof_resp.json["data"]["phone"] == "09189998888"
        assert prof_resp.json["data"]["role"] == "buyer"  # Role remained buyer!
