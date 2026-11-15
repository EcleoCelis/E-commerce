from flask import Blueprint, current_app
from sqlalchemy import text

from backend.app.core.responses import error_response, success_response
from backend.app.extensions import db


health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
def health_check():
    return success_response(
        {
            "status": "ok",
            "service": "api",
        }
    )


@health_bp.get("/health/ready")
@health_bp.get("/ready")
def readiness_check():
    try:
        db.session.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as exc:
        current_app.logger.exception("Database readiness check failed", exc_info=exc)
        return error_response(
            message="Database readiness check failed.",
            status_code=503,
            code="service_unavailable",
            details={"database": "disconnected"},
        )

    return success_response(
        {
            "status": "ready",
            "database": db_status,
            "service": "api",
        }
    )

