from backend.app import create_app
from backend.app.auth.service import create_auth_session, register_buyer
from backend.app.communication import create_notification, create_support_ticket, get_user_unread_notification_count
from backend.app.core.config import TestingConfig
from backend.app.extensions import db
from backend.app.models import User, UserStatus


def setup_test_users():
    db.drop_all()
    db.create_all()

    buyer_a = register_buyer({
        "email": "buyer_a@example.com",
        "password": "Password123!",
        "first_name": "Alice",
        "last_name": "Buyer",
        "role": "buyer",
    })
    buyer_b = register_buyer({
        "email": "buyer_b@example.com",
        "password": "Password123!",
        "first_name": "Bob",
        "last_name": "Buyer",
        "role": "buyer",
    })
    admin = User(
        email="admin_notif@example.com",
        role="admin",
        status=UserStatus.ACTIVE.value,
        first_name="Admin",
        last_name="Seller",
    )
    admin.set_password("AdminPass123!")
    db.session.add(admin)
    db.session.commit()

    token_a, _ = create_auth_session(buyer_a)
    token_b, _ = create_auth_session(buyer_b)
    token_admin, _ = create_auth_session(admin)

    return (buyer_a, token_a), (buyer_b, token_b), (admin, token_admin)


def test_notifications_lifecycle_and_ownership():
    app = create_app(TestingConfig)
    with app.app_context():
        (buyer_a, token_a), (buyer_b, token_b), (admin, _) = setup_test_users()
        client = app.test_client()

        # Create notifications for Buyer A
        notif1 = create_notification(buyer_a.id, "Order Confirmed", "Your order #1 has been confirmed.", notif_type="order")
        notif2 = create_notification(buyer_a.id, "Shipping Update", "Your item has shipped.", notif_type="shipping")

        # Create notification for Buyer B
        notif_b = create_notification(buyer_b.id, "Secret Notif", "For Bob only.", notif_type="order")

        # Unauthenticated request rejected
        resp = client.get("/api/v1/notifications")
        assert resp.status_code == 401

        # Buyer A lists notifications
        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], token_a)
        resp = client.get("/api/v1/notifications")
        assert resp.status_code == 200
        data = resp.json["data"]
        assert data["total"] == 2
        notif_ids = [n["id"] for n in data["notifications"]]
        assert notif1.id in notif_ids
        assert notif2.id in notif_ids
        assert notif_b.id not in notif_ids

        # Unread count
        resp = client.get("/api/v1/notifications/unread-count")
        assert resp.status_code == 200
        assert resp.json["data"]["unread_count"] == 2

        # Mark notif1 as read
        resp = client.patch(f"/api/v1/notifications/{notif1.id}/read")
        assert resp.status_code == 200
        assert resp.json["data"]["is_read"] is True

        # Unread count decremented
        resp = client.get("/api/v1/notifications/unread-count")
        assert resp.json["data"]["unread_count"] == 1

        # Ownership violation: Buyer A tries to mark Buyer B's notification as read
        resp = client.patch(f"/api/v1/notifications/{notif_b.id}/read")
        assert resp.status_code == 404
        assert resp.json["error"]["code"] == "notification_not_found"

        # Mark all as read
        resp = client.post("/api/v1/notifications/mark-all-read")
        assert resp.status_code == 200
        assert resp.json["data"]["updated_count"] == 1

        resp = client.get("/api/v1/notifications/unread-count")
        assert resp.json["data"]["unread_count"] == 0


def test_support_messaging_workflow():
    app = create_app(TestingConfig)
    with app.app_context():
        (buyer_a, token_a), (buyer_b, token_b), (admin, token_admin) = setup_test_users()
        client = app.test_client()

        # Buyer A opens a support ticket
        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], token_a)
        resp = client.post("/api/v1/support/tickets", json={
            "subject": "Damaged vintage chair leg",
            "category": "item_condition",
            "message": "When the package arrived, the front left chair leg had a visible hairline fracture.",
        })
        assert resp.status_code == 201
        ticket = resp.json["data"]
        ticket_number = ticket["ticket_number"]
        assert ticket["status"] == "open"
        assert len(ticket["messages"]) == 1

        # Buyer A views ticket list
        resp = client.get("/api/v1/support/tickets")
        assert resp.status_code == 200
        assert len(resp.json["data"]["tickets"]) == 1
        assert resp.json["data"]["tickets"][0]["ticket_number"] == ticket_number

        # Buyer B cannot access Buyer A's ticket
        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], token_b)
        resp = client.get(f"/api/v1/support/tickets/{ticket_number}")
        assert resp.status_code == 404

        # Admin views all support tickets
        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], token_admin)
        resp = client.get("/api/v1/admin/support/tickets")
        assert resp.status_code == 200
        assert resp.json["data"]["total"] >= 1

        # Admin replies to ticket
        resp = client.post(f"/api/v1/admin/support/tickets/{ticket_number}/messages", json={
            "message": "We sincerely apologize. We can arrange a full courier pickup and immediate refund.",
        })
        assert resp.status_code == 201
        assert resp.json["data"]["is_staff"] is True

        # Admin resolves ticket
        resp = client.patch(f"/api/v1/admin/support/tickets/{ticket_number}/status", json={
            "status": "resolved",
        })
        assert resp.status_code == 200
        assert resp.json["data"]["status"] == "resolved"

        # Buyer A checks ticket and sees admin message & status
        client.set_cookie(app.config["AUTH_SESSION_COOKIE_NAME"], token_a)
        resp = client.get(f"/api/v1/support/tickets/{ticket_number}")
        assert resp.status_code == 200
        assert resp.json["data"]["status"] == "resolved"
        assert len(resp.json["data"]["messages"]) == 2
