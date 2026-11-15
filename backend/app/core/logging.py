import json
import logging
import time
import uuid
from flask import g, request


class JsonLogFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if hasattr(record, "request_id"):
            log_record["request_id"] = record.request_id
        if hasattr(record, "path"):
            log_record["path"] = record.path
        if hasattr(record, "method"):
            log_record["method"] = record.method
        if hasattr(record, "status_code"):
            log_record["status_code"] = record.status_code
        if hasattr(record, "duration_ms"):
            log_record["duration_ms"] = record.duration_ms

        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_record)


def register_request_logging(app):
    @app.before_request
    def start_timer():
        g.request_start_time = time.time()
        g.request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]

    @app.after_request
    def log_request(response):
        duration_ms = 0
        if hasattr(g, "request_start_time"):
            duration_ms = round((time.time() - g.request_start_time) * 1000, 2)

        request_id = getattr(g, "request_id", "-")
        response.headers["X-Request-ID"] = request_id

        # Skip logging static asset spam during local dev if desired
        if not request.path.startswith("/static/"):
            app.logger.info(
                f"{request.method} {request.path} {response.status_code} ({duration_ms}ms)",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.path,
                    "status_code": response.status_code,
                    "duration_ms": duration_ms,
                    "client_ip": request.headers.get("X-Forwarded-For", request.remote_addr),
                },
            )

        return response
