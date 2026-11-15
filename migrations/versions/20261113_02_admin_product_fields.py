"""Add pricing, cost, inventory threshold, and variants columns to products

Revision ID: 20261113_02
Revises: 20261113_01
Create Date: 2026-11-13 12:25:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "20261113_02"
down_revision = "20261113_01"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("products", schema=None) as batch_op:
        batch_op.add_column(sa.Column("compare_at_price_cents", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("cost_cents", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("low_stock_threshold", sa.Integer(), nullable=False, server_default="5"))
        batch_op.add_column(sa.Column("track_inventory", sa.Boolean(), nullable=False, server_default="true"))
        batch_op.add_column(sa.Column("variants_json", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("products", schema=None) as batch_op:
        batch_op.drop_column("variants_json")
        batch_op.drop_column("track_inventory")
        batch_op.drop_column("low_stock_threshold")
        batch_op.drop_column("cost_cents")
        batch_op.drop_column("compare_at_price_cents")
