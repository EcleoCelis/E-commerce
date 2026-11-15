import io
from pathlib import Path
from PIL import Image

from backend.app import create_app
from backend.app.auth.rbac import Role
from backend.app.core.config import TestingConfig
from backend.app.extensions import db
from backend.app.seed import seed_development_data


def setup_test_app():
    app = create_app(TestingConfig)
    with app.app_context():
        db.create_all()
        seed_development_data()
    return app


def teardown_test_app(app):
    with app.app_context():
        db.session.remove()
        db.drop_all()


def register_buyer(client, email="buyer@example.com", password="Secondhand2026", first_name="Second", last_name="Buyer"):
    return client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "first_name": first_name,
            "last_name": last_name,
            "phone": "+63 917 123 4567",
            "role": Role.BUYER.value,
        },
    )


def make_test_image_bytes(fmt="PNG", size=(240, 240), color=(78, 70, 56)):
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=color)
    img.save(buf, format=fmt)
    buf.seek(0)
    return buf


# ==========================================
# A. PROFILE INFORMATION & SUMMARY TESTS
# ==========================================

def test_profile_overview_and_personal_info_update_persistence():
    app = setup_test_app()
    client = app.test_client()
    try:
        reg_res = register_buyer(client, email="profile.buyer@example.com")
        assert reg_res.status_code == 201

        # Fetch profile summary
        summary_res = client.get("/api/v1/auth/profile-summary")
        assert summary_res.status_code == 200
        summary_data = summary_res.get_json()["data"]
        assert summary_data["user"]["email"] == "profile.buyer@example.com"
        assert summary_data["user"]["full_name"] == "Second Buyer"
        assert summary_data["stats"]["orders_count"] == 0
        assert summary_data["stats"]["addresses_count"] == 0
        assert len(summary_data["payment_methods_catalog"]) >= 2

        # Update personal information via /api/v1/auth/profile
        patch_res = client.patch(
            "/api/v1/auth/profile",
            json={
                "first_name": "Maria",
                "last_name": "Santos",
                "email": "maria.santos@example.com",
                "phone": "+63 918 555 1234",
            },
        )
        assert patch_res.status_code == 200
        updated_user = patch_res.get_json()["data"]
        assert updated_user["first_name"] == "Maria"
        assert updated_user["last_name"] == "Santos"
        assert updated_user["full_name"] == "Maria Santos"
        assert updated_user["email"] == "maria.santos@example.com"
        assert updated_user["phone"] == "+63 918 555 1234"

        # Verify persistence across /api/v1/auth/me fetch
        me_res = client.get("/api/v1/auth/me")
        assert me_res.status_code == 200
        me_user = me_res.get_json()["data"]["user"]
        assert me_user["email"] == "maria.santos@example.com"
        assert me_user["full_name"] == "Maria Santos"
    finally:
        teardown_test_app(app)


def test_profile_validation_and_duplicate_email_handling():
    app = setup_test_app()
    client_a = app.test_client()
    client_b = app.test_client()
    try:
        register_buyer(client_a, email="user.a@example.com")
        register_buyer(client_b, email="user.b@example.com")

        # Duplicate email check (User B tries to claim User A's email)
        dup_res = client_b.patch(
            "/api/v1/auth/profile",
            json={"email": "user.a@example.com"},
        )
        assert dup_res.status_code == 409
        assert dup_res.get_json()["error"]["code"] == "email_already_registered"

        # Invalid email & invalid phone check
        invalid_res = client_b.patch(
            "/api/v1/auth/profile",
            json={
                "first_name": "",
                "email": "not-an-email",
                "phone": "abc-invalid",
            },
        )
        assert invalid_res.status_code == 422
        details = invalid_res.get_json()["error"]["details"]
        assert "first_name" in details
        assert "email" in details
        assert "phone" in details
    finally:
        teardown_test_app(app)


# ==========================================
# B. PROFILE PICTURE UPLOAD & MANAGEMENT TESTS
# ==========================================

def test_profile_avatar_upload_replace_remove_and_validation(tmp_path):
    app = setup_test_app()
    app.config["FRONTEND_ROOT"] = str(tmp_path)
    client = app.test_client()
    anon_client = app.test_client()
    try:
        # Unauthenticated upload blocked
        anon_res = anon_client.post(
            "/api/v1/auth/profile/avatar",
            data={"file": (make_test_image_bytes("PNG"), "avatar.png")},
            content_type="multipart/form-data",
        )
        assert anon_res.status_code == 401

        register_buyer(client, email="avatar.buyer@example.com")

        # 1. Upload valid PNG avatar
        upload_res = client.post(
            "/api/v1/auth/profile/avatar",
            data={"file": (make_test_image_bytes("PNG"), "profile_photo.png")},
            content_type="multipart/form-data",
        )
        assert upload_res.status_code == 200
        first_avatar_url = upload_res.get_json()["data"]["avatar_url"]
        assert first_avatar_url.startswith("/static/uploads/avatars/")
        first_filename = first_avatar_url.split("/static/uploads/avatars/", 1)[1]
        first_file_path = Path(tmp_path) / "static" / "uploads" / "avatars" / first_filename
        assert first_file_path.is_file()

        # 2. Replace with valid JPEG avatar and verify old avatar is cleaned up
        replace_res = client.post(
            "/api/v1/auth/profile/avatar",
            data={"file": (make_test_image_bytes("JPEG"), "new_photo.jpg")},
            content_type="multipart/form-data",
        )
        assert replace_res.status_code == 200
        second_avatar_url = replace_res.get_json()["data"]["avatar_url"]
        assert second_avatar_url != first_avatar_url
        second_filename = second_avatar_url.split("/static/uploads/avatars/", 1)[1]
        second_file_path = Path(tmp_path) / "static" / "uploads" / "avatars" / second_filename
        assert second_file_path.is_file()
        assert not first_file_path.exists()

        # 3. Reject unsupported file format (.txt / .exe)
        bad_ext_res = client.post(
            "/api/v1/auth/profile/avatar",
            data={"file": (io.BytesIO(b"not an image"), "malicious.exe")},
            content_type="multipart/form-data",
        )
        assert bad_ext_res.status_code in (400, 422)

        # 4. Reject corrupted image payload pretending to be PNG
        corrupt_res = client.post(
            "/api/v1/auth/profile/avatar",
            data={"file": (io.BytesIO(b"corrupted-binary-payload"), "fake.png")},
            content_type="multipart/form-data",
        )
        assert corrupt_res.status_code in (400, 422)

        # 5. Remove avatar and restore default
        remove_res = client.delete("/api/v1/auth/profile/avatar")
        assert remove_res.status_code == 200
        assert remove_res.get_json()["data"]["avatar_url"] is None
        assert not second_file_path.exists()
    finally:
        teardown_test_app(app)


# ==========================================
# C. THEME / APPEARANCE & NOTIFICATION PREFERENCES TESTS
# ==========================================

def test_theme_and_notification_preferences_persistence():
    app = setup_test_app()
    client = app.test_client()
    try:
        register_buyer(client, email="theme.buyer@example.com")

        # Initial theme preference is valid (light/system)
        me_res = client.get("/api/v1/auth/me")
        assert me_res.get_json()["data"]["user"]["theme_preference"] in ("light", "system")

        # Switch to dark mode + update notification preferences
        dark_res = client.patch(
            "/api/v1/auth/profile",
            json={
                "theme_preference": "dark",
                "notification_preferences": {
                    "order_updates": True,
                    "shipping_alerts": True,
                    "promotional_emails": False,
                    "security_alerts": True,
                },
            },
        )
        assert dark_res.status_code == 200
        user_payload = dark_res.get_json()["data"]
        assert user_payload["theme_preference"] == "dark"
        assert user_payload["notification_preferences"]["promotional_emails"] is False

        # Switch to system mode
        sys_res = client.patch("/api/v1/auth/profile", json={"theme_preference": "system"})
        assert sys_res.status_code == 200
        assert sys_res.get_json()["data"]["theme_preference"] == "system"

        # Switch to light mode
        light_res = client.patch("/api/v1/auth/profile", json={"theme_preference": "light"})
        assert light_res.status_code == 200
        assert light_res.get_json()["data"]["theme_preference"] == "light"

        # Reject invalid theme value
        bad_theme_res = client.patch("/api/v1/auth/profile", json={"theme_preference": "neon-cyberpunk"})
        assert bad_theme_res.status_code == 422
        assert "theme_preference" in bad_theme_res.get_json()["error"]["details"]
    finally:
        teardown_test_app(app)


# ==========================================
# D. PAYMENT PREFERENCES TESTS
# ==========================================

def test_payment_preferences_supported_methods_and_raw_card_rejection():
    app = setup_test_app()
    client = app.test_client()
    try:
        register_buyer(client, email="payment.buyer@example.com")

        # Get payment catalog & current preferences
        get_res = client.get("/api/v1/auth/payment-preferences")
        assert get_res.status_code == 200
        data = get_res.get_json()["data"]
        assert data["preferred_payment_method"] == "cash_on_delivery"
        available_codes = [m["code"] for m in data["supported_methods"] if m["supported"]]
        assert "cash_on_delivery" in available_codes
        assert "gcash_pending" in available_codes

        # Update preferred payment method to gcash_pending with GCash mobile number
        patch_res = client.patch(
            "/api/v1/auth/payment-preferences",
            json={
                "preferred_payment_method": "gcash_pending",
                "gcash_mobile": "09171234567",
                "enabled_methods": ["cash_on_delivery", "gcash_pending"],
            },
        )
        assert patch_res.status_code == 200
        updated = patch_res.get_json()["data"]
        assert updated["preferred_payment_method"] == "gcash_pending"
        assert updated["payment_preferences"]["gcash_mobile"] == "09171234567"

        # Reject unsupported payment method
        unsupported_res = client.patch(
            "/api/v1/auth/payment-preferences",
            json={"preferred_payment_method": "credit_card"},
        )
        assert unsupported_res.status_code == 422
        assert "preferred_payment_method" in unsupported_res.get_json()["error"]["details"]

        # Reject raw card numbers or CVV fields for security compliance
        raw_card_res = client.patch(
            "/api/v1/auth/payment-preferences",
            json={
                "preferred_payment_method": "cash_on_delivery",
                "card_number": "4111222233334444",
                "cvv": "123",
            },
        )
        assert raw_card_res.status_code == 422
        details = raw_card_res.get_json()["error"]["details"]
        assert "payment_preferences" in details
        assert "Raw card numbers or CVV" in details["payment_preferences"][0]
    finally:
        teardown_test_app(app)


# ==========================================
# E. DELIVERY ADDRESS MANAGEMENT TESTS
# ==========================================

def test_delivery_address_crud_default_toggle_and_ownership_isolation():
    app = setup_test_app()
    client_a = app.test_client()
    client_b = app.test_client()
    try:
        register_buyer(client_a, email="addr.a@example.com")
        register_buyer(client_b, email="addr.b@example.com")

        # Create first address (auto-default)
        create_1 = client_a.post(
            "/api/v1/addresses",
            json={
                "label": "Home",
                "recipient_name": "Second Buyer",
                "phone": "09171234567",
                "street_line1": "123 Mabini St",
                "street_line2": "Apt 4B",
                "city": "Tagbilaran",
                "state_or_province": "Bohol",
                "postal_code": "6300",
                "country": "Philippines",
                "delivery_instructions": "Green gate beside bakery",
            },
        )
        assert create_1.status_code == 201
        addr1 = create_1.get_json()["data"]
        assert addr1["is_default"] is True
        assert addr1["delivery_instructions"] == "Green gate beside bakery"
        assert addr1["address_line1"] == "123 Mabini St"
        assert addr1["province"] == "Bohol"

        # Create second address and mark as default
        create_2 = client_a.post(
            "/api/v1/addresses",
            json={
                "label": "Office",
                "recipient_name": "Second Buyer",
                "phone": "09189998888",
                "street_line1": "88 Carlos P. Garcia Ave",
                "city": "Tagbilaran",
                "state_or_province": "Bohol",
                "postal_code": "6300",
                "country": "Philippines",
                "is_default": True,
            },
        )
        assert create_2.status_code == 201
        addr2 = create_2.get_json()["data"]
        assert addr2["is_default"] is True

        # Switch default back to addr1 via /set-default
        set_def = client_a.post(f"/api/v1/addresses/{addr1['id']}/set-default")
        assert set_def.status_code == 200
        assert set_def.get_json()["data"]["is_default"] is True

        # Edit addr2
        edit_res = client_a.patch(
            f"/api/v1/addresses/{addr2['id']}",
            json={
                "label": "Studio Office",
                "recipient_name": "Second Buyer",
                "phone": "09189998888",
                "street_line1": "99 CPG North Ave",
                "city": "Tagbilaran",
                "state_or_province": "Bohol",
                "postal_code": "6300",
                "country": "Philippines",
                "delivery_instructions": "Leave with lobby guard",
            },
        )
        assert edit_res.status_code == 200
        assert edit_res.get_json()["data"]["label"] == "Studio Office"
        assert edit_res.get_json()["data"]["delivery_instructions"] == "Leave with lobby guard"

        # Ownership isolation: User B cannot edit, set-default, or delete User A's address
        b_edit = client_b.patch(
            f"/api/v1/addresses/{addr1['id']}",
            json={
                "recipient_name": "Intruder",
                "phone": "09170000000",
                "street_line1": "1 Hack St",
                "city": "Cebu",
                "state_or_province": "Cebu",
                "postal_code": "6000",
                "country": "Philippines",
            },
        )
        assert b_edit.status_code == 404

        b_delete = client_b.delete(f"/api/v1/addresses/{addr1['id']}")
        assert b_delete.status_code == 404

        # Delete default address (addr1) and verify addr2 automatically becomes default
        del_res = client_a.delete(f"/api/v1/addresses/{addr1['id']}")
        assert del_res.status_code == 200
        remaining = client_a.get("/api/v1/addresses").get_json()["data"]["addresses"]
        assert len(remaining) == 1
        assert remaining[0]["id"] == addr2["id"]
        assert remaining[0]["is_default"] is True
    finally:
        teardown_test_app(app)


# ==========================================
# F. SECURITY, SESSIONS & DEACTIVATION TESTS
# ==========================================

def test_password_change_session_management_and_account_deactivation():
    app = setup_test_app()
    client_1 = app.test_client()
    client_2 = app.test_client()
    try:
        register_buyer(client_1, email="security.buyer@example.com", password="OldPassword123")

        # Sign in from a second device/client
        login_2 = client_2.post(
            "/api/v1/auth/login",
            json={"email": "security.buyer@example.com", "password": "OldPassword123"},
        )
        assert login_2.status_code == 200

        # List active sessions (should have 2 active sessions)
        sessions_res = client_1.get("/api/v1/auth/sessions")
        assert sessions_res.status_code == 200
        sessions_list = sessions_res.get_json()["data"]["sessions"]
        assert len(sessions_list) == 2
        assert sum(1 for s in sessions_list if s["is_current"]) == 1

        # Revoke all other sessions from client_1
        revoke_res = client_1.post("/api/v1/auth/sessions/revoke-others")
        assert revoke_res.status_code == 200
        assert revoke_res.get_json()["data"]["revoked_count"] == 1

        # Verify client_2 is now logged out while client_1 remains authenticated
        assert client_2.get("/api/v1/auth/me").get_json()["data"]["authenticated"] is False
        assert client_2.get("/api/v1/auth/profile-summary").status_code == 401
        assert client_1.get("/api/v1/auth/me").get_json()["data"]["authenticated"] is True

        # Reject password change with wrong current password
        wrong_pw = client_1.post(
            "/api/v1/auth/change-password",
            json={
                "current_password": "WrongPassword999",
                "new_password": "NewSecurePassword456",
                "confirm_password": "NewSecurePassword456",
            },
        )
        assert wrong_pw.status_code in (400, 401)

        # Change password with valid current password
        change_pw = client_1.post(
            "/api/v1/auth/change-password",
            json={
                "current_password": "OldPassword123",
                "new_password": "NewSecurePassword456",
                "confirm_password": "NewSecurePassword456",
            },
        )
        assert change_pw.status_code == 200

        # Protected account deactivation: reject wrong password
        bad_deact = client_1.post(
            "/api/v1/auth/deactivate",
            json={"password": "OldPassword123", "reason": "Testing"},
        )
        assert bad_deact.status_code in (400, 401)

        # Protected account deactivation: succeed with valid password
        ok_deact = client_1.post(
            "/api/v1/auth/deactivate",
            json={"password": "NewSecurePassword456", "reason": "Taking a break"},
        )
        assert ok_deact.status_code == 200
        assert ok_deact.get_json()["data"]["deactivated"] is True

        # Subsequent authenticated access or login is blocked
        assert client_1.get("/api/v1/auth/profile-summary").status_code == 401
        relogin = client_1.post(
            "/api/v1/auth/login",
            json={"email": "security.buyer@example.com", "password": "NewSecurePassword456"},
        )
        assert relogin.status_code == 403
    finally:
        teardown_test_app(app)


def test_profile_routes_and_frontend_assets_rendered():
    app = setup_test_app()
    client = app.test_client()
    try:
        for path in ("/profile", "/account"):
            res = client.get(path)
            assert res.status_code == 200
            assert b"SecondMarket" in res.data

        auth_client_js = Path(app.static_folder) / "js" / "auth-client.js"
        auth_views_js = Path(app.static_folder) / "js" / "auth-views.js"
        marketplace_css = Path(app.static_folder) / "css" / "marketplace" / "base.css"

        assert "SecondMarketTheme" in auth_client_js.read_text(encoding="utf-8")
        assert "renderAccountView" in auth_views_js.read_text(encoding="utf-8")
        assert 'html[data-theme="dark"]' in marketplace_css.read_text(encoding="utf-8")
    finally:
        teardown_test_app(app)
