from uuid import uuid4

from sqlalchemy import select
from test_security import PAYLOAD

from app.db import Folder, Project


async def test_folder_ownership_and_project_moves(clients):
    alice, bob = clients
    folder = {"id": str(uuid4()), "name": "Prüfungen"}
    assert (await alice.post("/api/folders", json=folder)).status_code == 201
    assert (await alice.post("/api/folders", json=folder)).json() == folder
    assert (await bob.get("/api/folders")).json() == []
    assert (await bob.post("/api/folders", json=folder)).status_code == 409
    assert (await bob.put("/api/folders/" + folder["id"], json={"name": "Fremd"})).status_code == 404
    assert (await bob.delete("/api/folders/" + folder["id"])).status_code == 404
    assert (await bob.post("/api/projects", json={**PAYLOAD, "folder_id": folder["id"]})).status_code == 404
    project = (await alice.post("/api/projects", json={**PAYLOAD, "folder_id": folder["id"]})).json()
    assert project["folder_id"] == folder["id"]
    assert (await alice.delete("/api/folders/" + folder["id"])).status_code == 409
    renamed = await alice.put("/api/folders/" + folder["id"], json={"name": "  Abitur  "})
    assert renamed.json()["name"] == "Abitur"
    moved = await alice.put(
        "/api/projects/" + project["id"], json={**PAYLOAD, "revision": project["revision"], "folder_id": None}
    )
    assert moved.status_code == 200
    assert moved.json()["folder_id"] is None
    assert (await alice.delete("/api/folders/" + folder["id"])).status_code == 200
    assert len((await alice.get("/api/projects")).json()) == 1


async def test_foreign_folder_cannot_be_assigned_to_existing_project(clients):
    alice, bob = clients
    folder = {"id": str(uuid4()), "name": "Bob"}
    await bob.post("/api/folders", json=folder)
    project = (await alice.post("/api/projects", json=PAYLOAD)).json()
    response = await alice.put(
        "/api/projects/" + project["id"], json={**PAYLOAD, "revision": 1, "folder_id": folder["id"]}
    )
    assert response.status_code == 404
    unchanged = (await alice.get("/api/projects")).json()[0]
    assert unchanged["revision"] == 1 and unchanged["folder_id"] is None


async def test_folder_validation_csrf_and_account_cleanup(clients, setup_db):
    alice, _ = clients
    folder = {"id": str(uuid4()), "name": "A"}
    assert (await alice.post("/api/folders", json=folder, headers={"x-csrf-token": ""})).status_code == 403
    assert (await alice.post("/api/folders", json={**folder, "name": "  "})).status_code == 422
    assert (await alice.post("/api/folders", json={**folder, "owner_id": "bob"})).status_code == 422
    await alice.post("/api/folders", json=folder)
    await alice.post("/api/projects", json={**PAYLOAD, "folder_id": folder["id"]})
    await alice.delete("/api/account")
    async with setup_db() as db:
        assert (await db.execute(select(Folder))).scalars().all() == []
        assert (await db.execute(select(Project))).scalars().all() == []
