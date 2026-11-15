import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[3]
DEFAULT_DATABASE_URL = "postgresql+psycopg://postgres:2005@localhost:5432/secondhand"


def load_environment_file(path=BASE_DIR / ".env"):
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def normalize_database_url(database_url):
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return database_url


load_environment_file()


class BaseConfig:
    APP_NAME = os.getenv("APP_NAME", "SecondMarket")
    APP_VERSION = os.getenv("APP_VERSION", "0.1.0")
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-me")
    SQLALCHEMY_DATABASE_URI = normalize_database_url(os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    AUTH_SESSION_COOKIE_NAME = os.getenv("AUTH_SESSION_COOKIE_NAME", "secondmarket_session")
    AUTH_SESSION_DAYS = int(os.getenv("AUTH_SESSION_DAYS", "7"))
    FRONTEND_ROOT = str(BASE_DIR / "frontend")
    JSON_SORT_KEYS = False
    TESTING = False
    DEBUG = False
    ENV_NAME = "production"

    # Security Hardening (Module 11)
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", str(30 * 1024 * 1024)))  # 30 MB payload limit
    CORS_ORIGINS = [
        o.strip()
        for o in (
            os.getenv("CORS_ORIGINS")
            or os.getenv("CORS_ALLOWED_ORIGINS")
            or "http://localhost:5000,http://127.0.0.1:5000"
        ).split(",")
        if o.strip()
    ]
    CSRF_PROTECTION_ENABLED = os.getenv("CSRF_PROTECTION_ENABLED", "false").lower() == "true"
    RATE_LIMITING_ENABLED = os.getenv("RATE_LIMITING_ENABLED", "true").lower() == "true"
    UPLOAD_FOLDER = str(BASE_DIR / "frontend" / "static" / "uploads")
    ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".svg", ".gif"}
    MAX_IMAGE_DIMENSION = 8192

    # Stripe Checkout Integration (Test Mode / Live Mode via sk_test_ / sk_live_)
    STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
    STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", "").strip()
    STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
    APP_PUBLIC_BASE_URL = os.getenv("APP_PUBLIC_BASE_URL", "").strip()


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    ENV_NAME = "development"


class TestingConfig(BaseConfig):
    TESTING = True
    ENV_NAME = "testing"
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"


class ProductionConfig(BaseConfig):
    ENV_NAME = "production"


def get_config():
    env_name = os.getenv("FLASK_ENV", "development").lower()

    if env_name == "testing":
        return TestingConfig
    if env_name == "production":
        return ProductionConfig
    return DevelopmentConfig
