from flask import Blueprint

from backend.app.api.addresses import addresses_bp
from backend.app.api.admin import admin_bp
from backend.app.api.auth import auth_bp
from backend.app.api.cart import cart_bp
from backend.app.api.checkout import checkout_bp
from backend.app.api.coupons import coupons_bp
from backend.app.api.health import health_bp
from backend.app.api.marketplace import marketplace_bp
from backend.app.api.notifications import notifications_bp
from backend.app.api.orders import admin_orders_bp, orders_bp
from backend.app.api.payments import payments_bp
from backend.app.api.reports import admin_analytics_bp, admin_reports_bp
from backend.app.api.returns import returns_bp
from backend.app.api.support import admin_support_bp, support_bp
from backend.app.api.system import system_bp


api_bp = Blueprint("api", __name__)
api_bp.register_blueprint(admin_bp)
api_bp.register_blueprint(addresses_bp)
api_bp.register_blueprint(auth_bp)
api_bp.register_blueprint(cart_bp)
api_bp.register_blueprint(checkout_bp)
api_bp.register_blueprint(coupons_bp)
api_bp.register_blueprint(health_bp)
api_bp.register_blueprint(marketplace_bp)
api_bp.register_blueprint(notifications_bp)
api_bp.register_blueprint(orders_bp)
api_bp.register_blueprint(admin_orders_bp)
api_bp.register_blueprint(payments_bp)
api_bp.register_blueprint(admin_reports_bp)
api_bp.register_blueprint(admin_analytics_bp)
api_bp.register_blueprint(returns_bp)
api_bp.register_blueprint(support_bp)
api_bp.register_blueprint(admin_support_bp)
api_bp.register_blueprint(system_bp, url_prefix="/system")
