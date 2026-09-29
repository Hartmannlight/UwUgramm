"""Ownership checks, quotas and public project/folder representations."""

from fastapi import HTTPException
from sqlalchemy import func, select

from ..db import Folder, Project, User
from ..security import authenticated


def project_data(project):
    return {
        "id": project.id,
        "title": project.title,
        "document": project.document,
        "revision": project.revision,
        "updated_at": project.updated_at.isoformat(),
        "folder_id": project.folder_id,
    }


async def owned(project_id, request, db):
    user = await authenticated(request, db)
    project = (
        await db.execute(select(Project).where(Project.id == project_id, Project.owner_id == user))
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Projekt nicht gefunden.")
    return project


async def capacity(user, db):
    await db.execute(select(User).where(User.id == user).with_for_update())
    count = (
        await db.execute(select(func.count()).select_from(Project).where(Project.owner_id == user))
    ).scalar_one()
    if count >= 100:
        raise HTTPException(409, "Maximal 100 Projekte. Lösche zuerst ein altes Projekt.")


async def owned_folder(folder_id, user, db):
    if folder_id is None:
        return None
    folder = (
        await db.execute(
            select(Folder).where(Folder.id == str(folder_id), Folder.owner_id == user).with_for_update()
        )
    ).scalar_one_or_none()
    if folder is None:
        raise HTTPException(404, "Ordner nicht gefunden.")
    return folder


def folder_data(folder):
    return {"id": folder.id, "name": folder.name}
