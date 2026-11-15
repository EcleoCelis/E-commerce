"""Complete backend modules: notifications, messaging, addresses, coupons, and returns

Revision ID: 20261112_01
Revises: 20261004_01
Create Date: 2026-11-12 21:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "20261112_01"
down_revision = "20261004_01"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Addresses
    op.create_table(
        "addresses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=50), nullable=True),
        sa.Column("recipient_name", sa.String(length=120), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=False),
        sa.Column("street_line1", sa.String(length=255), nullable=False),
        sa.Column("street_line2", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=False),
        sa.Column("state_or_province", sa.String(length=100), nullable=False),
        sa.Column("postal_code", sa.String(length=20), nullable=False),
        sa.Column("country", sa.String(length=60), nullable=False, server_default="Philippines"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("addresses", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_addresses_user_id"), ["user_id"], unique=False)

    # 2. Password Reset Tokens
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("password_reset_tokens", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_password_reset_tokens_token_hash"), ["token_hash"], unique=True)
        batch_op.create_index(batch_op.f("ix_password_reset_tokens_user_id"), ["user_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_password_reset_tokens_expires_at"), ["expires_at"], unique=False)

    # 3. Notifications
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("notifications", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_notifications_user_id"), ["user_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_notifications_is_read"), ["is_read"], unique=False)
        batch_op.create_index(batch_op.f("ix_notifications_type"), ["type"], unique=False)

    # 4. Support Tickets & Messages
    op.create_table(
        "support_tickets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticket_number", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False, server_default="general"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("support_tickets", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_support_tickets_ticket_number"), ["ticket_number"], unique=True)
        batch_op.create_index(batch_op.f("ix_support_tickets_user_id"), ["user_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_support_tickets_status"), ["status"], unique=False)

    op.create_table(
        "support_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticket_id", sa.Integer(), nullable=False),
        sa.Column("sender_id", sa.Integer(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("is_staff", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ticket_id"], ["support_tickets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("support_messages", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_support_messages_ticket_id"), ["ticket_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_support_messages_sender_id"), ["sender_id"], unique=False)

    # 5. Coupons & Redemptions
    op.create_table(
        "coupons",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("discount_type", sa.String(length=20), nullable=False, server_default="fixed"),
        sa.Column("discount_value_cents", sa.Integer(), nullable=False),
        sa.Column("min_spend_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_discount_cents", sa.Integer(), nullable=True),
        sa.Column("usage_limit", sa.Integer(), nullable=True),
        sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("coupons", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_coupons_code"), ["code"], unique=True)

    op.create_table(
        "coupon_redemptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("coupon_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("discount_cents", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["coupon_id"], ["coupons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("coupon_redemptions", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_coupon_redemptions_coupon_id"), ["coupon_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_coupon_redemptions_user_id"), ["user_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_coupon_redemptions_order_id"), ["order_id"], unique=False)

    # 6. Return Requests
    op.create_table(
        "return_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("return_number", sa.String(length=32), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="requested"),
        sa.Column("refund_amount_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("admin_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("return_requests", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_return_requests_return_number"), ["return_number"], unique=True)
        batch_op.create_index(batch_op.f("ix_return_requests_order_id"), ["order_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_return_requests_user_id"), ["user_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_return_requests_status"), ["status"], unique=False)

    # 7. Add discount_cents and coupon_code to orders, and sku to products
    with op.batch_alter_table("orders", schema=None) as batch_op:
        batch_op.add_column(sa.Column("discount_cents", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("coupon_code", sa.String(length=50), nullable=True))

    with op.batch_alter_table("products", schema=None) as batch_op:
        batch_op.add_column(sa.Column("sku", sa.String(length=80), nullable=True))
        batch_op.create_index(batch_op.f("ix_products_sku"), ["sku"], unique=False)


def downgrade():
    with op.batch_alter_table("products", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_products_sku"))
        batch_op.drop_column("sku")

    with op.batch_alter_table("orders", schema=None) as batch_op:
        batch_op.drop_column("coupon_code")
        batch_op.drop_column("discount_cents")

    op.drop_table("return_requests")
    op.drop_table("coupon_redemptions")
    op.drop_table("coupons")
    op.drop_table("support_messages")
    op.drop_table("support_tickets")
    op.drop_table("notifications")
    op.drop_table("password_reset_tokens")
    op.drop_table("addresses")
