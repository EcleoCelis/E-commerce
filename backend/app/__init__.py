from flask import Flask, abort, send_from_directory
from flask_cors import CORS

from backend.app.api import api_bp
from backend.app.cli import register_cli_commands
from backend.app.core.config import get_config
from backend.app.core.errors import register_error_handlers
from backend.app.core.logging import register_request_logging
from backend.app.core.security.csrf import register_csrf_protection
from backend.app.core.security.headers import register_security_headers
from backend.app.extensions import db, migrate


def create_app(config_object=None):
    app = Flask(
        __name__,
        static_folder="../../frontend/static",
        static_url_path="/static",
    )
    app.config.from_object(config_object or get_config())

    if (
        app.config.get("ENV_NAME") == "production"
        and not app.config.get("TESTING", False)
        and (
            not app.config.get("SECRET_KEY")
            or app.config.get("SECRET_KEY") in {"dev-only-change-me", "change-me-in-production", "production-secure-random-secret-key-replace-me"}
        )
    ):
        raise RuntimeError(
            "Production startup blocked: configure a strong unique SECRET_KEY environment variable."
        )

    db.init_app(app)
    migrate.init_app(app, db)
    import backend.app.models  # noqa: F401

    register_cli_commands(app)
    register_error_handlers(app)
    register_request_logging(app)
    register_security_headers(app)
    register_csrf_protection(app)

    cors_origins = app.config.get("CORS_ORIGINS", [])
    if cors_origins:
        CORS(app, origins=cors_origins, supports_credentials=True)

    app.register_blueprint(api_bp, url_prefix="/api/v1")

    @app.get("/")
    def storefront():
        return send_from_directory(app.config["FRONTEND_ROOT"], "index.html")

    @app.get("/favicon.ico")
    def favicon():
        svg_icon = (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
            '<rect width="32" height="32" rx="8" fill="#4E4638"/>'
            '<circle cx="16" cy="16" r="7" fill="#9A8B74"/>'
            "</svg>"
        )
        return svg_icon, 200, {"Content-Type": "image/svg+xml"}

    @app.get("/admin")
    @app.get("/admin/")
    def admin_frontend():
        return send_from_directory(app.config["FRONTEND_ROOT"], "admin/index.html")

    @app.get("/admin/login")
    @app.get("/admin/login.html")
    def admin_login_frontend():
        return send_from_directory(app.config["FRONTEND_ROOT"], "admin/login.html")

    @app.get("/checkout")
    @app.get("/checkout/")
    def checkout_frontend():
        return send_from_directory(app.config["FRONTEND_ROOT"], "checkout/index.html")

    @app.get("/orders")
    @app.get("/orders/")
    def orders_frontend():
        return send_from_directory(app.config["FRONTEND_ROOT"], "orders/index.html")

    @app.get("/profile")
    @app.get("/profile/")
    @app.get("/account")
    @app.get("/account/")
    def profile_frontend():
        return send_from_directory(app.config["FRONTEND_ROOT"], "index.html")

    @app.get("/<path:path>")
    def frontend_fallback(path):
        if path.startswith("api/"):
            abort(404)
        if "." in path:
            return send_from_directory(app.config["FRONTEND_ROOT"], path)
        return send_from_directory(app.config["FRONTEND_ROOT"], "index.html")

    return app
