import hashlib
import hmac
import time
from datetime import timedelta

from fastapi import HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from .db import RateBucket, Session, Share, now
from .settings import settings


def digest(value: str):
    return hashlib.sha256(value.encode()).hexdigest()


def keyed(value: str, identity=False):
    key = settings().identity_key if identity else settings().secret_key
    return hmac.new(key.encode(), value.encode(), hashlib.sha256).hexdigest()


def csrf(raw: str):
    return keyed("csrf:" + raw)


async def authenticated(request: Request, db):
    raw = request.cookies.get(settings().cookie_name, "")
    session = (
        (
            await db.execute(
                select(Session).where(Session.token_hash == digest(raw), Session.expires_at > now())
            )
        ).scalar_one_or_none()
        if raw
        else None
    )
    if not session:
        raise HTTPException(401, "Bitte melde dich an.")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if request.headers.get("origin") != settings().app_origin:
            raise HTTPException(403, "Die Herkunft der Anfrage stimmt nicht.")
        if not hmac.compare_digest(request.headers.get("x-csrf-token", ""), csrf(raw)):
            raise HTTPException(403, "Die Sitzung muss neu geladen werden.")
    return session.user_id


async def rate_limit(request: Request, db, scope: str, limit: int, seconds=60):
    # Nginx overwrites the proxy header. Uvicorn trusts only the configured proxy network.
    client = request.client.host if request.client else "unknown"
    window = int(time.time()) // seconds
    key = keyed(f"rate:{scope}:{client}:{window}")
    insert = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    query = insert(RateBucket).values(key=key, hits=1, expires_at=now() + timedelta(seconds=seconds * 2))
    statement = query.on_conflict_do_update(
        index_elements=[RateBucket.key], set_={"hits": RateBucket.hits + 1}
    ).returning(RateBucket.hits)
    hits = (await db.execute(statement)).scalar_one()
    await db.execute(delete(RateBucket).where(RateBucket.expires_at < now()))
    await db.execute(delete(Session).where(Session.expires_at < now()))
    await db.execute(delete(Share).where(Share.expires_at < now()))
    await db.commit()
    if hits > limit:
        raise HTTPException(
            429, "Zu viele Versuche. Bitte warte eine Minute.", headers={"Retry-After": str(seconds)}
        )
