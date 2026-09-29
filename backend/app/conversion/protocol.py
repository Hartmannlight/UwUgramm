"""Shared byte limit and UTF-8 wire format for HTTP and parser subprocesses."""

import json
from typing import Any

MAX_REQUEST_BYTES = 262_144


def encode_message(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
