from flask import current_app, request


def register_security_headers(app):
    @app.after_request
    def set_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "geolocation=(), camera=(), microphone=()")

        csp_policy = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob: https:; "
            "font-src 'self' data: https:; "
            "connect-src 'self'; "
            "frame-ancestors 'self';"
        )
        response.headers.setdefault("Content-Security-Policy", csp_policy)

        # Apply HSTS only for genuine HTTPS / production requests
        if request.is_secure or (app.config.get("ENV_NAME") == "production" and request.headers.get("X-Forwarded-Proto") == "https"):
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

        if app.config.get("ENV_NAME") != "production" and not request.path.startswith("/static/productImages/"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"

        return response
