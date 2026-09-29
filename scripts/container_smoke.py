"""Exercise candidate images in an isolated production-like PostgreSQL stack."""

import argparse
import json
import re
import secrets
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

POSTGRES = "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24"
ORIGIN = "https://uwugramm-ci.example"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="candidate-api:gate")
    parser.add_argument("--web", default="candidate-web:gate")
    args = parser.parse_args()
    password = secrets.token_hex(24)
    environment = {
        "ENVIRONMENT": "production",
        "APP_ORIGIN": ORIGIN,
        "SECRET_KEY": secrets.token_hex(32),
        "IDENTITY_KEY": secrets.token_hex(32),
        "DATABASE_URL": f"postgresql+psycopg://uwugramm:{password}@db:5432/uwugramm",
    }
    restricted = {
        "read_only": True,
        "tmpfs": ["/tmp"],
        "cap_drop": ["ALL"],
        "security_opt": ["no-new-privileges:true"],
    }
    api = {
        **restricted,
        "image": args.api,
        "environment": environment,
        "depends_on": {"migrate": {"condition": "service_completed_successfully"}},
        "healthcheck": {
            "test": [
                "CMD",
                "python",
                "-c",
                "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=3)",
            ],
            "interval": "2s",
            "timeout": "5s",
            "retries": 30,
        },
    }
    config = {
        "services": {
            "db": {
                "image": POSTGRES,
                "environment": {
                    "POSTGRES_USER": "uwugramm",
                    "POSTGRES_DB": "uwugramm",
                    "POSTGRES_PASSWORD": password,
                },
                "volumes": ["data:/var/lib/postgresql/data"],
                "healthcheck": {
                    "test": ["CMD", "pg_isready", "-U", "uwugramm"],
                    "interval": "2s",
                    "timeout": "3s",
                    "retries": 30,
                },
            },
            "migrate": {
                **restricted,
                "image": args.api,
                "environment": environment,
                "command": ["alembic", "upgrade", "head"],
                "depends_on": {"db": {"condition": "service_healthy"}},
            },
            "api": api,
            "web": {
                **restricted,
                "image": args.web,
                "ports": ["127.0.0.1::8080"],
                "depends_on": {"api": {"condition": "service_healthy"}},
                "healthcheck": {
                    "test": ["CMD", "wget", "-q", "--spider", "http://127.0.0.1:8080/"],
                    "interval": "2s",
                    "timeout": "3s",
                    "retries": 30,
                },
            },
        },
        "volumes": {"data": {}},
    }
    project = "uwugramm-ci-" + secrets.token_hex(6)
    artifacts = Path("artifacts")
    artifacts.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="uwugramm-ci-") as temporary:
        compose_file = Path(temporary) / "compose.json"
        compose_file.write_text(json.dumps(config), encoding="utf-8")
        compose = [
            "docker",
            "compose",
            "--project-name",
            project,
            "--file",
            str(compose_file),
        ]

        def run(*command):
            return subprocess.check_output(
                [*compose, *command], text=True, encoding="utf-8", timeout=240
            ).strip()

        try:
            run("up", "--detach", "--wait", "--wait-timeout", "180")
            address = run("port", "web", "8080")
            base = "http://" + address
            # Ignore host proxy variables for this loopback-only integration test.
            client = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            auth = {}

            def request(path, payload=None, status=200, origin=ORIGIN, method=None):
                headers = {"Origin": origin, **auth}
                data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
                if data is not None:
                    headers["Content-Type"] = "application/json"
                req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
                try:
                    response = client.open(req, timeout=20)
                except urllib.error.HTTPError as error:
                    response = error
                with response:
                    body = response.read().decode("utf-8")
                    if response.status != status:
                        raise AssertionError(
                            f"{path}: expected {status}, got {response.status}: {body[:200]}"
                        )
                    return body, response.headers

            html, headers = request("/")
            assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
            assert headers["X-Content-Type-Options"] == "nosniff"
            for asset in re.findall(r'(?:src|href)="(/assets/[^\"]+)"', html):
                request(asset)
            assert json.loads(request("/api/health")[0]) == {"status": "ok"}
            assert json.loads(request("/api/session")[0])["authenticated"] is False
            request("/api/projects", status=401)
            request("/api/docs", status=404)
            source = "# ä漢🐾\nx = 3\n"
            document = json.loads(request("/api/convert/from-python", {"source": source})[0])["document"]
            converted = json.loads(request("/api/convert/to-python", document)[0])
            assert "ä漢🐾" in converted["source"] and "x = 3" in converted["source"]
            request(
                "/api/convert/from-python",
                {"source": source},
                status=403,
                origin="https://other.example",
            )
            request("/api/convert/from-python", {"source": "x ="}, status=422)

            # Seed a local fixture session through the installed app; no external OIDC credentials.
            seed = """
import asyncio, json, secrets
from datetime import timedelta
from app.db import User, Session, session_factory, now
from app.security import digest, csrf, keyed
async def seed():
    token = secrets.token_hex(32)
    async with session_factory() as db:
        user = User(subject_hash=keyed('ci-fixture', identity=True))
        db.add(user)
        await db.flush()
        db.add(Session(token_hash=digest(token), user_id=user.id, expires_at=now()+timedelta(minutes=5)))
        await db.commit()
    print(json.dumps({'Cookie': '__Host-uwu-session='+token, 'X-CSRF-Token': csrf(token)}))
asyncio.run(seed())
"""
            auth.update(json.loads(run("exec", "-T", "api", "python", "-c", seed)))
            project_body = {"title": "Container smoke", "document": document}
            saved = json.loads(request("/api/projects", project_body, status=201)[0])
            path = "/api/projects/" + saved["id"]
            update = {**project_body, "revision": saved["revision"], "title": "Updated"}
            assert json.loads(request(path, update, method="PUT")[0])["revision"] == saved["revision"] + 1
            request(path, update, method="PUT", status=409)
            assert len(json.loads(request("/api/projects")[0])) == 1
            request(path, method="DELETE")
            assert json.loads(request("/api/projects")[0]) == []
            print(
                "Container smoke passed: assets, headers, PostgreSQL migrations, Unicode conversion, auth, CRUD and revision conflicts"
            )
        finally:
            logs = subprocess.run(
                [*compose, "logs", "--no-color"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=30,
            )
            sanitized = logs.stdout
            for secret in (
                password,
                environment["SECRET_KEY"],
                environment["IDENTITY_KEY"],
            ):
                sanitized = sanitized.replace(secret, "[redacted]")
            (artifacts / "container-smoke.log").write_text(sanitized, encoding="utf-8")
            subprocess.run(
                [*compose, "down", "--volumes", "--remove-orphans"],
                check=True,
                timeout=90,
            )


if __name__ == "__main__":
    main()
