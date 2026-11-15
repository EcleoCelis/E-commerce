"""Customer profile management columns for users and addresses

Revision ID: 20261113_01
Revises: 20261112_01
Create Date: 2026-11-13 08:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "20261113_01"
down_revision = "20261112_01"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("avatar_url", sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column("email_verified", sa.Boolean(), nullable=False, server_default="true"))
        batch_op.add_column(sa.Column("theme_preference", sa.String(length=20), nullable=False, server_default="light"))
        batch_op.add_column(
            sa.Column(
                "preferred_payment_method",
                sa.String(length=40),
                nullable=False,
                server_default="cash_on_delivery",
            )
        )
        batch_op.add_column(sa.Column("payment_preferences", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("notification_preferences", sa.JSON(), nullable=True))

    with op.batch_alter_table("addresses", schema=None) as batch_op:
        batch_op.add_column(sa.Column("delivery_instructions", sa.String(length=500), nullable=True))


def downgrade():
    with op.batch_alter_table("addresses", schema=None) as batch_op:
        batch_op.drop_column("delivery_instructions")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("notification_preferences")
        batch_op.drop_column("payment_preferences")
        batch_op.drop_column("preferred_payment_method")
        batch_op.drop_column("theme_preference")
        batch_op.drop_column("email_verified")
        batch_op.drop_column("avatar_url")
