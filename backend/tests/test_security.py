from datetime import timedelta

import pytest
from sqlalchemy import func, select, update

from app.db import Project, Session, Share, User, now
from app.security import digest
from app.settings import Settings

PAYLOAD = {
    "title": "Mein Projekt",
    "document": {
        "version": 1,
        "nodes": [{"id": "one", "kind": "statement", "text": "x = 1", "children": [], "otherwise": []}],
    },
}


async def create(client):
    response = await client.post("/api/projects", json=PAYLOAD)
    assert response.status_code == 201, response.text
    return response.json()


async def test_owner_isolation_and_optimistic_lock(clients):
    alice, bob = clients
    project = await create(alice)
    assert (await bob.get("/api/projects")).json() == []
    for method, path in [
        ("PUT", ""),
        ("DELETE", ""),
        ("POST", "/shares"),
        ("DELETE", "/shares"),
        ("GET", "/shares"),
    ]:
        response = await bob.request(
            method, "/api/projects/" + project["id"] + path, json=PAYLOAD if method == "PUT" else None
        )
        assert response.status_code == 404
    payload = {**PAYLOAD, "title": "Version 2", "revision": project["revision"]}
    assert (await alice.put("/api/projects/" + project["id"], json=payload)).status_code == 200
    assert (await alice.put("/api/projects/" + project["id"], json=payload)).status_code == 409
    assert (await alice.get("/api/projects")).json()[0]["title"] == "Version 2"


async def test_csrf_and_origin_required(clients):
    alice, _ = clients
    for headers in [{"x-csrf-token": ""}, {"origin": "https://evil.example"}, {"origin": ""}]:
        response = await alice.post("/api/projects", json=PAYLOAD, headers=headers)
        assert response.status_code == 403


async def test_no_session_no_project_access(clients):
    alice, _ = clients
    alice.cookies.clear()
    assert (await alice.get("/api/projects")).status_code == 401
    assert (await alice.post("/api/projects", json=PAYLOAD)).status_code == 401


async def test_share_snapshot_copy_revoke(clients, setup_db):
    alice, bob = clients
    project = await create(alice)
    response = await alice.post("/api/projects/" + project["id"] + "/shares")
    assert response.status_code == 201
    share = response.json()
    assert len(share["code"]) == 9
    async with setup_db() as db:
        stored = (await db.execute(select(Share))).scalar_one()
        assert stored.code_hash == digest(share["code"].replace("-", ""))
        assert share["code"] not in str(stored.__dict__)
    await alice.put("/api/projects/" + project["id"], json={**PAYLOAD, "title": "Changed", "revision": 1})
    copy = await bob.post("/api/shares/copy", json={"code": share["code"].lower()})
    assert copy.status_code == 201
    assert copy.json()["title"] == "Mein Projekt · Kopie"
    assert copy.json()["id"] != project["id"]
    assert "owner_id" not in copy.json()
    assert (await alice.delete("/api/projects/" + project["id"] + "/shares")).status_code == 200
    assert (await bob.post("/api/shares/copy", json={"code": share["code"]})).status_code == 404
    assert len((await bob.get("/api/projects")).json()) == 1


async def test_expired_shares_and_sessions(clients, setup_db):
    alice, bob = clients
    project = await create(alice)
    share = (await alice.post("/api/projects/" + project["id"] + "/shares")).json()
    async with setup_db() as db:
        await db.execute(update(Share).values(expires_at=now() - timedelta(days=1)))
        await db.execute(
            update(Session).where(Session.user_id == "alice").values(expires_at=now() - timedelta(days=1))
        )
        await db.commit()
    assert (await alice.get("/api/projects")).status_code == 401
    assert (await bob.post("/api/shares/copy", json={"code": share["code"]})).status_code == 404


async def test_bruteforce_is_limited(clients):
    alice, _ = clients
    for _ in range(8):
        assert (await alice.post("/api/shares/copy", json={"code": "ABCDEFGH"})).status_code == 404
    response = await alice.post("/api/shares/copy", json={"code": "ABCDEFGH"})
    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"


async def test_account_deletion_cascades(clients, setup_db):
    alice, bob = clients
    project = await create(alice)
    await alice.post("/api/projects/" + project["id"] + "/shares")
    await create(bob)
    assert (await alice.delete("/api/account")).status_code == 200
    async with setup_db() as db:
        assert await db.get(User, "alice") is None
        assert (await db.execute(select(func.count()).select_from(Share))).scalar() == 0
        assert (await db.execute(select(func.count()).select_from(Project))).scalar() == 1
    assert (await alice.get("/api/projects")).status_code == 401


async def test_body_limit_and_no_input_reflection(clients):
    alice, _ = clients
    assert (await alice.post("/api/projects", content="a" * 262145)).status_code == 413
    response = await alice.post("/api/projects", json={**PAYLOAD, "private": "secret text"})
    assert response.status_code == 422
    assert "secret text" not in response.text


async def test_oauth_callback_missing_state_fails_closed(clients):
    alice, _ = clients
    response = await alice.get("/api/auth/callback?code=untrusted&state=wrong", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"].endswith("/?auth=failed")


def test_production_rejects_defaults():
    with pytest.raises(ValueError):
        Settings(environment="production", app_origin="http://example.org")
