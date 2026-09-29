import os
from datetime import timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

os.environ["ENVIRONMENT"] = "test"
os.environ["APP_ORIGIN"] = "http://test"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite://"

from app.db import Base, Session, User, database, now
from app.main import app
from app.security import csrf, digest
from app.settings import settings


@pytest.fixture
async def setup_db():
    engine = create_async_engine("sqlite+aiosqlite://")

    @event.listens_for(engine.sync_engine, "connect")
    def foreign_keys(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def dependency():
        async with factory() as db:
            yield db

    app.dependency_overrides[database] = dependency
    async with factory() as db:
        db.add_all([User(id="alice", subject_hash="a" * 64), User(id="bob", subject_hash="b" * 64)])
        await db.flush()
        for name in ("alice", "bob"):
            db.add(Session(token_hash=digest(name), user_id=name, expires_at=now() + timedelta(days=1)))
        await db.commit()
    yield factory
    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.fixture
async def clients(setup_db):
    async with AsyncClient(
        transport=ASGITransport(app),
        base_url="http://test",
        headers={"origin": "http://test", "x-csrf-token": csrf("alice")},
        cookies={settings().cookie_name: "alice"},
    ) as alice:
        async with AsyncClient(
            transport=ASGITransport(app),
            base_url="http://test",
            headers={"origin": "http://test", "x-csrf-token": csrf("bob")},
            cookies={settings().cookie_name: "bob"},
        ) as bob:
            yield alice, bob
