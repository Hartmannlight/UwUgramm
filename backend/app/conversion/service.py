"""Concurrency, timeout and lifecycle bounds for syntax-only parser processes."""

import asyncio
import json
import sys

from fastapi import HTTPException

from .protocol import encode_message

conversion_slots = asyncio.Semaphore(4)


async def run_conversion(payload):
    try:
        await asyncio.wait_for(conversion_slots.acquire(), timeout=1)
    except TimeoutError:
        raise HTTPException(429, "Die Konvertierung ist gerade ausgelastet.")
    process = None
    try:
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "app.conversion.worker",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        output, _ = await asyncio.wait_for(process.communicate(encode_message(payload)), timeout=5)
        if process.returncode or not output:
            raise HTTPException(422, "Die Eingabe ist zu komplex.")
        result = json.loads(output)
        if "error" in result:
            raise HTTPException(422, result)
        return result
    except TimeoutError:
        raise HTTPException(422, "Die Konvertierung hat zu lange gedauert. Bitte vereinfache den Code.")
    finally:
        if process and process.returncode is None:
            process.kill()
            await process.wait()
        conversion_slots.release()
