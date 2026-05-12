"""Debug-mode NDJSON logger: workspace file when path exists, else stdout (Docker)."""
from __future__ import annotations

import json
import os
import time
from typing import Any

_DEFAULT_PATH = "/Users/arjun/Software/tgddata_C1/.cursor/debug-c4a2fb.log"


def debug_agent_log(
    *,
    hypothesis_id: str,
    location: str,
    message: str,
    data: dict[str, Any],
    session_id: str = "c4a2fb",
) -> None:
    payload = {
        "sessionId": session_id,
        "hypothesisId": hypothesis_id,
        "location": location,
        "message": message,
        "data": data,
        "timestamp": int(time.time() * 1000),
    }
    line = json.dumps(payload, default=str)[:16000]
    path = (os.environ.get("TGDDATA_DEBUG_AGENT_LOG") or "").strip() or _DEFAULT_PATH
    try:
        parent = os.path.dirname(path)
        if parent and os.path.isdir(parent):
            with open(path, "a", encoding="utf-8") as f:
                f.write(line + "\n")
            return
    except OSError:
        pass
    print("AGENT_DBG " + line, flush=True)
