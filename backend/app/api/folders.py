"""Owner-scoped folders and empty-folder deletion."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import Folder, Project, User, database
from ..schema import FolderCreate, FolderWrite
from ..security import authenticated, rate_limit
from ..services.projects import folder_data, owned_folder

router = APIRouter(prefix="/api")


@router.get("/folders")
async def list_folders(request: Request, db: AsyncSession = Depends(database)):
    user = await authenticated(request, db)
    folders = (
        await db.execute(select(Folder).where(Folder.owner_id == user).order_by(Folder.name))
    ).scalars()
    return [folder_data(f) for f in folders]


@router.post("/folders", status_code=201)
async def create_folder(payload: FolderCreate, request: Request, db: AsyncSession = Depends(database)):
    user = await authenticated(request, db)
    await rate_limit(request, db, "folder", 30)
    await db.execute(select(User).where(User.id == user).with_for_update())
    existing = await db.get(Folder, str(payload.id))
    if existing:
        if existing.owner_id != user:
            raise HTTPException(409, "Diese Ordner-ID ist nicht verfügbar.")
        return folder_data(existing)
    count = (
        await db.execute(select(func.count()).select_from(Folder).where(Folder.owner_id == user))
    ).scalar_one()
    if count >= 100:
        raise HTTPException(409, "Maximal 100 Ordner.")
    folder = Folder(id=str(payload.id), owner_id=user, name=payload.name)
    db.add(folder)
    await db.commit()
    return folder_data(folder)


@router.put("/folders/{folder_id}")
async def rename_folder(
    folder_id: str, payload: FolderWrite, request: Request, db: AsyncSession = Depends(database)
):
    user = await authenticated(request, db)
    folder = await owned_folder(folder_id, user, db)
    folder.name = payload.name
    await db.commit()
    return folder_data(folder)


@router.delete("/folders/{folder_id}")
async def remove_folder(folder_id: str, request: Request, db: AsyncSession = Depends(database)):
    user = await authenticated(request, db)
    folder = await owned_folder(folder_id, user, db)
    if (
        await db.execute(select(Project.id).where(Project.folder_id == folder.id).limit(1))
    ).scalar_one_or_none():
        raise HTTPException(409, "Verschiebe zuerst die Projekte aus diesem Ordner.")
    await db.delete(folder)
    await db.commit()
    return {"ok": True}
