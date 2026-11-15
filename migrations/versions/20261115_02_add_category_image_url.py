"""Add image_url column to categories table.

Revision ID: 20261115_02
Revises: 20261115_01
Create Date: 2026-11-15
"""

from alembic import op
import sqlalchemy as sa


revision = "20261115_02"
down_revision = "20261115_01"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("categories")}
    if "image_url" not in columns:
        op.add_column("categories", sa.Column("image_url", sa.String(length=500), nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("categories")}
    if "image_url" in columns:
        op.drop_column("categories", "image_url")
