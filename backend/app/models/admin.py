from backend.app.extensions import db
from backend.app.models.base import IntPrimaryKeyMixin, TimestampMixin


class StoreSetting(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "store_settings"

    setting_key = db.Column(db.String(64), nullable=False, unique=True, index=True)
    value_json = db.Column(db.JSON, nullable=False)
    updated_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    updated_by = db.relationship("User")


class AdminAuditLog(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "admin_audit_logs"

    actor_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    actor_email = db.Column(db.String(255), nullable=False)
    actor_role = db.Column(db.String(32), nullable=False, default="admin")
    action = db.Column(db.String(80), nullable=False, index=True)
    entity_type = db.Column(db.String(64), nullable=False, index=True)
    entity_id = db.Column(db.String(80), nullable=True)
    summary = db.Column(db.String(500), nullable=False)
    metadata_json = db.Column(db.JSON, nullable=True)

    actor = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "actor_id": self.actor_id,
            "actor_email": self.actor_email,
            "actor_role": self.actor_role,
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "summary": self.summary,
            "metadata": self.metadata_json or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class InventoryMovement(IntPrimaryKeyMixin, TimestampMixin, db.Model):
    __tablename__ = "inventory_movements"

    product_id = db.Column(db.Integer, db.ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    delta = db.Column(db.Integer, nullable=False)
    previous_quantity = db.Column(db.Integer, nullable=False)
    new_quantity = db.Column(db.Integer, nullable=False)
    reason = db.Column(db.String(120), nullable=False)
    reference = db.Column(db.String(100), nullable=True)

    product = db.relationship("Product", backref=db.backref("inventory_movements", cascade="all, delete-orphan", lazy="selectin"))
    actor = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "product_id": self.product_id,
            "product_title": self.product.title if self.product else None,
            "product_slug": self.product.slug if self.product else None,
            "actor_email": self.actor.email if self.actor else "System",
            "delta": self.delta,
            "previous_quantity": self.previous_quantity,
            "new_quantity": self.new_quantity,
            "reason": self.reason,
            "reference": self.reference,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
