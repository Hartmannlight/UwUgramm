"""Public syntax conversion endpoints; submitted Python is never executed."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..conversion.service import run_conversion
from ..db import database
from ..schema import Document, PythonSource
from ..security import rate_limit

router = APIRouter(prefix="/api")


@router.post("/convert/from-python")
async def from_python(payload: PythonSource, request: Request, db: AsyncSession = Depends(database)):
    await rate_limit(request, db, "convert", 90)
    return await run_conversion(payload.model_dump())


@router.post("/convert/to-python")
async def to_python(payload: Document, request: Request, db: AsyncSession = Depends(database)):
    await rate_limit(request, db, "convert", 90)
    return await run_conversion({"document": payload.model_dump()})
