from functools import wraps
import threading
import time
from flask import current_app, request
from backend.app.core.responses import error_response


_lock = threading.Lock()
_request_records = {}


def clean_old_records(records, window_seconds, now):
    cutoff = now - window_seconds
    return [t for t in records if t > cutoff]


def is_rate_limited(key: str, limit: int, window_seconds: int) -> bool:
    now = time.time()
    with _lock:
        records = _request_records.get(key, [])
        records = clean_old_records(records, window_seconds, now)
        if len(records) >= limit:
            _request_records[key] = records
            return True
        records.append(now)
        _request_records[key] = records
        return False


def reset_rate_limits():
    with _lock:
        _request_records.clear()


def rate_limit(limit: int = 20, window_seconds: int = 60, key_func=None):
    def decorator(view_func):
        @wraps(view_func)
        def wrapped(*args, **kwargs):
            # Check testing exemption
            if current_app.config.get("TESTING", False) and not request.headers.get("X-Test-Rate-Limit"):
                return view_func(*args, **kwargs)

            if not current_app.config.get("RATE_LIMITING_ENABLED", True):
                return view_func(*args, **kwargs)

            client_ip = request.headers.get("X-Forwarded-For", request.remote_addr or "127.0.0.1").split(",")[0].strip()
            endpoint = request.endpoint or view_func.__name__
            key = key_func(request) if key_func else f"{client_ip}:{endpoint}"

            if is_rate_limited(key, limit=limit, window_seconds=window_seconds):
                return error_response(
                    message="Rate limit exceeded. Please try again later.",
                    status_code=429,
                    code="rate_limit_exceeded",
                )

            return view_func(*args, **kwargs)

        return wrapped

    return decorator
