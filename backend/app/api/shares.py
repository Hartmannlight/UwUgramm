"""Expiring, revocable project snapshots and private copies."""

import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import Project, Share, database, now
from ..schema import ShareCode
from ..security import authenticated, digest, rate_limit
from ..services.projects import capacity, owned, project_data

router = APIRouter(prefix="/api")


@router.get("/projects/{project_id}/shares")
async def list_shares(project_id: str, request: Request, db: AsyncSession = Depends(database)):
    await owned(project_id, request, db)
    shares = (
        await db.execute(select(Share).where(Share.project_id == project_id, Share.expires_at > now()))
    ).scalars()
    return [{"id": s.id, "expires_at": s.expires_at.isoformat()} for s in shares]


@router.post("/projects/{project_id}/shares", status_code=201)
async def share(project_id: str, request: Request, db: AsyncSession = Depends(database)):
    project = await owned(project_id, request, db)
    await rate_limit(request, db, "share", 10)
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    code = "".join(secrets.choice(alphabet) for _ in range(8))
    # One active snapshot per project keeps revocation simple.
    await db.execute(delete(Share).where(Share.project_id == project.id))
    snapshot = Share(
        project_id=project.id,
        code_hash=digest(code),
        title=project.title,
        document=project.document,
        expires_at=now() + timedelta(hours=24),
    )
    db.add(snapshot)
    await db.commit()
    return {
        "id": snapshot.id,
        "code": code[:4] + "-" + code[4:],
        "expires_at": snapshot.expires_at.isoformat(),
    }


@router.delete("/projects/{project_id}/shares")
async def revoke(project_id: str, request: Request, db: AsyncSession = Depends(database)):
    await owned(project_id, request, db)
    await db.execute(delete(Share).where(Share.project_id == project_id))
    await db.commit()
    return {"ok": True}


@router.post("/shares/copy", status_code=201)
async def copy_share(payload: ShareCode, request: Request, db: AsyncSession = Depends(database)):
    user = await authenticated(request, db)
    await rate_limit(request, db, "redeem", 8)
    code = payload.code.replace("-", "").upper()
    snapshot = (
        await db.execute(select(Share).where(Share.code_hash == digest(code), Share.expires_at > now()))
    ).scalar_one_or_none()
    if not snapshot:
        raise HTTPException(404, "Code ungültig, abgelaufen oder widerrufen.")
    await capacity(user, db)
    project = Project(owner_id=user, title=(snapshot.title[:90] + " · Kopie"), document=snapshot.document)
    db.add(project)
    await db.commit()
    return project_data(project)
