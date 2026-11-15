import os
import sys
from backend.app import create_app
from backend.app.core.config import ProductionConfig, get_config


# Create application with production config by default if not set
env = os.getenv("FLASK_ENV", "production")
app = create_app(get_config())


def serve_production():
    port = int(os.getenv("PORT", "5000"))
    host = os.getenv("HOST", "0.0.0.0")
    threads = int(os.getenv("WEB_CONCURRENCY", "6"))

    if sys.platform.startswith("win"):
        # On Windows, use Waitress as the production WSGI server
        try:
            from waitress import serve
            print(f"[Waitress] Serving SecondMarket production app on http://{host}:{port} with {threads} threads...")
            serve(app, host=host, port=port, threads=threads)
        except ImportError:
            print("[Warning] Waitress not installed, falling back to Flask server.")
            app.run(host=host, port=port)
    else:
        # On Linux/macOS, Gunicorn is typically run via: gunicorn --config gunicorn.conf.py wsgi:app
        try:
            from waitress import serve
            serve(app, host=host, port=port, threads=threads)
        except ImportError:
            app.run(host=host, port=port)


if __name__ == "__main__":
    serve_production()
