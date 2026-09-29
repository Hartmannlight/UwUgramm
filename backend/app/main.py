"""Application composition and shared HTTP boundaries."""

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.sessions import SessionMiddleware

from .api import auth, conversion, folders, projects, shares
from .conversion.protocol import MAX_REQUEST_BYTES
from .db import database
from .settings import settings

config = settings()
app = FastAPI(title="UwUgramm API", docs_url=None if config.production else "/api/docs", redoc_url=None)
app.add_middleware(
    SessionMiddleware,
    secret_key=config.secret_key,
    session_cookie="__Host-uwu-oauth" if config.production else "uwu-oauth",
    max_age=600,
    same_site="lax",
    https_only=config.production,
)


@app.middleware("http")
async def boundaries(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        if request.headers.get("origin") != config.app_origin:
            return JSONResponse({"detail": "Die Herkunft der Anfrage stimmt nicht."}, status_code=403)
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_REQUEST_BYTES:
                return JSONResponse({"detail": "Maximal 256 KB pro Anfrage."}, status_code=413)
        request._body = bytes(body)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Avoid reflecting raw project contents or inputs into diagnostics/logging.
    return JSONResponse(
        {"detail": "Ungültige Daten. Prüfe Textlänge, Diagrammtiefe und Blockstruktur."}, status_code=422
    )


@app.get("/api/health")
async def health(db: AsyncSession = Depends(database)):
    await db.execute(select(1))
    return {"status": "ok"}


for router in (auth.router, projects.router, folders.router, shares.router, conversion.router):
    app.include_router(router)
