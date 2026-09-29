"""Session, Google OIDC and account lifecycle endpoints."""

import secrets
from datetime import timedelta

from authlib.integrations.base_client.errors import OAuthError
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from joserfc.errors import JoseError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import Session, User, database, now
from ..security import authenticated, csrf, digest, keyed, rate_limit
from ..settings import settings

router = APIRouter(prefix="/api")

config = settings()
oauth = OAuth()
oauth.register(
    name="google",
    client_id=config.google_client_id,
    client_secret=config.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid", "code_challenge_method": "S256"},
)


@router.get("/session")
async def session_info(request: Request, db: AsyncSession = Depends(database)):
    if not request.cookies.get(config.cookie_name):
        return {"authenticated": False, "google_available": bool(config.google_client_id)}
    try:
        user = await authenticated(request, db)
    except HTTPException:
        return {"authenticated": False, "google_available": bool(config.google_client_id)}
    return {
        "authenticated": True,
        "user_id": user,
        "csrf": csrf(request.cookies[config.cookie_name]),
        "google_available": True,
    }


@router.get("/auth/google")
async def login(request: Request, db: AsyncSession = Depends(database)):
    if not config.google_client_id or not config.google_client_secret:
        return RedirectResponse(config.app_origin + "/?auth=unconfigured")
    await rate_limit(request, db, "login", 20)
    request.session.clear()
    return await oauth.google.authorize_redirect(request, config.app_origin + "/api/auth/callback")


@router.get("/auth/callback")
async def callback(request: Request, db: AsyncSession = Depends(database)):
    try:
        token = await oauth.google.authorize_access_token(request)
        info = token.get("userinfo")
        if not info or not info.get("sub"):
            raise ValueError("Missing verified subject")
        subject = keyed("google:" + info["sub"], identity=True)
        # Serialize first login races through a unique subject and dialect upsert.
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        from sqlalchemy.dialects.sqlite import insert as sqlite_insert

        insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
        await db.execute(
            insert(User)
            .values(subject_hash=subject)
            .on_conflict_do_nothing(index_elements=[User.subject_hash])
        )
        user = (await db.execute(select(User).where(User.subject_hash == subject))).scalar_one()
        old = request.cookies.get(config.cookie_name)
        if old:
            await db.execute(delete(Session).where(Session.token_hash == digest(old)))
        raw = secrets.token_urlsafe(32)
        db.add(Session(token_hash=digest(raw), user_id=user.id, expires_at=now() + timedelta(days=7)))
        await db.commit()
        response = RedirectResponse(config.app_origin, status_code=303)
        response.set_cookie(
            config.cookie_name,
            raw,
            httponly=True,
            secure=config.production,
            samesite="lax",
            max_age=7 * 86400,
            path="/",
        )
        return response
    except (OAuthError, JoseError, ValueError):
        return RedirectResponse(config.app_origin + "/?auth=failed", status_code=303)
    finally:
        request.session.clear()


@router.post("/auth/logout")
async def logout(request: Request, db: AsyncSession = Depends(database)):
    await authenticated(request, db)
    await db.execute(delete(Session).where(Session.token_hash == digest(request.cookies[config.cookie_name])))
    await db.commit()
    response = JSONResponse({"ok": True})
    response.delete_cookie(
        config.cookie_name, path="/", secure=config.production, httponly=True, samesite="lax"
    )
    return response


@router.delete("/account")
async def delete_account(request: Request, db: AsyncSession = Depends(database)):
    user = await authenticated(request, db)
    await db.execute(delete(User).where(User.id == user))
    await db.commit()
    response = JSONResponse({"ok": True})
    response.delete_cookie(
        config.cookie_name, path="/", secure=config.production, httponly=True, samesite="lax"
    )
    return response
