"""One bounded conversion process; never executes the submitted program."""

import json
import sys

from ..schema import Document
from .parser import ConversionError, export_python, parse_python
from .protocol import MAX_REQUEST_BYTES, encode_message


def main():
    try:
        # Linux production: bound CPU/address-space in addition to parent timeout.
        try:
            import resource

            resource.setrlimit(resource.RLIMIT_CPU, (2, 2))
            resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
        except ImportError:
            pass
        raw = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
        if len(raw) > MAX_REQUEST_BYTES:
            raise ConversionError("Maximal 256 KB pro Konvertierung.")
        payload = json.loads(raw.decode("utf-8"))
        result = (
            parse_python(payload["source"])
            if "source" in payload
            else {"source": export_python(Document.model_validate(payload["document"]))}
        )
        sys.stdout.buffer.write(encode_message(result))
    except ConversionError as exc:
        sys.stdout.buffer.write(encode_message({"error": str(exc), "line": exc.line}))
    except Exception:
        sys.stdout.buffer.write(
            encode_message({"error": "Die Konvertierung ist für diese Eingabe nicht möglich."})
        )


if __name__ == "__main__":
    main()
