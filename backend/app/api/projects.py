"""Private project CRUD with optimistic revision checks."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import Project, database, now
from ..schema import ProjectWrite
from ..security import authenticated, rate_limit
from ..services.projects import capacity, owned, owned_folder, project_data

router = APIRouter(prefix="/api")


@router.get("/projects")
async def list_projects(request: Request, db: AsyncSession = Depends(database)):
    user = await authenticated(request, db)
    projects = (
        await db.execute(select(Project).where(Project.owner_id == user).order_by(Project.updated_at.desc()))
    ).scalars()
    return [project_data(p) for p in projects]


@router.post("/projects", status_code=201)
async def create_project(payload: ProjectWrite, request: Request, db: AsyncSession = Depends(database)):
    user = await authenticated(request, db)
    await rate_limit(request, db, "create", 30)
    await capacity(user, db)
    await owned_folder(payload.folder_id, user, db)
    project = Project(
        owner_id=user,
        title=payload.title,
        document=payload.document.model_dump(),
        folder_id=str(payload.folder_id) if payload.folder_id else None,
    )
    db.add(project)
    await db.commit()
    return project_data(project)


@router.put("/projects/{project_id}")
async def save_project(
    project_id: str, payload: ProjectWrite, request: Request, db: AsyncSession = Depends(database)
):
    project = await owned(project_id, request, db)
    await owned_folder(payload.folder_id, project.owner_id, db)
    result = await db.execute(
        update(Project)
        .where(Project.id == project.id, Project.revision == payload.revision)
        .values(
            title=payload.title,
            document=payload.document.model_dump(),
            revision=Project.revision + 1,
            updated_at=now(),
            folder_id=str(payload.folder_id) if payload.folder_id else None,
        )
        .returning(Project.id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(409, "Das Projekt wurde anderswo geändert. Speichere deine Änderungen als Kopie.")
    await db.commit()
    await db.refresh(project)
    return project_data(project)


@router.delete("/projects/{project_id}")
async def remove_project(project_id: str, request: Request, db: AsyncSession = Depends(database)):
    project = await owned(project_id, request, db)
    await db.delete(project)
    await db.commit()
    return {"ok": True}
