from pathlib import Path
from backend.app import create_app
from backend.app.core.config import TestingConfig


def test_health_and_readiness_endpoints():
    app = create_app(TestingConfig)
    client = app.test_client()

    # Liveness check
    health_resp = client.get("/api/v1/health")
    assert health_resp.status_code == 200
    assert health_resp.json["success"] is True
    assert health_resp.json["data"]["status"] == "ok"

    # Readiness check
    ready_resp = client.get("/api/v1/health/ready")
    assert ready_resp.status_code == 200
    assert ready_resp.json["success"] is True
    assert ready_resp.json["data"]["database"] == "connected"


def test_deployment_artifacts_exist_and_configured():
    base_dir = Path(__file__).resolve().parents[1]

    # wsgi.py
    wsgi_file = base_dir / "wsgi.py"
    assert wsgi_file.exists()
    content = wsgi_file.read_text(encoding="utf-8")
    assert "app = create_app" in content
    assert "waitress" in content

    # gunicorn.conf.py
    gunicorn_file = base_dir / "gunicorn.conf.py"
    assert gunicorn_file.exists()
    content = gunicorn_file.read_text(encoding="utf-8")
    assert "bind" in content
    assert "workers" in content

    # Dockerfile
    dockerfile = base_dir / "Dockerfile"
    assert dockerfile.exists()
    docker_content = dockerfile.read_text(encoding="utf-8")
    assert "python:3.12-slim" in docker_content
    assert "gunicorn" in docker_content
    assert "HEALTHCHECK" in docker_content
    assert "USER appuser" in docker_content

    # .dockerignore
    dockerignore = base_dir / ".dockerignore"
    assert dockerignore.exists()
    ignore_content = dockerignore.read_text(encoding="utf-8")
    assert ".venv" in ignore_content
    assert ".git" in ignore_content

    # docker-compose.yml
    compose_file = base_dir / "docker-compose.yml"
    assert compose_file.exists()
    compose_content = compose_file.read_text(encoding="utf-8")
    assert "services:" in compose_content
    assert "postgres:16-alpine" in compose_content

    # Database scripts
    backup_script = base_dir / "scripts" / "backup_db.py"
    restore_script = base_dir / "scripts" / "restore_db.py"
    verify_script = base_dir / "scripts" / "verify_deployment.py"
    assert backup_script.exists()
    assert restore_script.exists()
    assert verify_script.exists()
