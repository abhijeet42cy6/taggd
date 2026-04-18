"""Disk storage for transition tracker resource uploads (per project)."""
from __future__ import annotations

import os
import re
import time
from typing import Optional

_MAX_BYTES = 50 * 1024 * 1024  # 50 MB
_ALLOWED_EXT = frozenset({".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".png", ".jpg", ".jpeg", ".txt"})


def transition_documents_dir() -> str:
    return os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "transition_documents"),
    )


def _ensure_dir() -> None:
    os.makedirs(transition_documents_dir(), exist_ok=True)


def save_transition_file(project_id: int, raw: bytes, original_filename: str) -> str:
    if len(raw) > _MAX_BYTES:
        raise ValueError("File too large (max 50 MB)")
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in _ALLOWED_EXT:
        raise ValueError(
            f"Unsupported file type: {ext!r}. Allowed: PDF, Word, Excel, PowerPoint, images, .txt.",
        )
    _ensure_dir()
    safe_orig = re.sub(r"[^a-zA-Z0-9._-]", "_", original_filename)[:80]
    filename = f"trn{project_id}_{int(time.time())}_{safe_orig}"
    path = os.path.join(transition_documents_dir(), filename)
    with open(path, "wb") as f:
        f.write(raw)
    return filename


def resolve_transition_path(filename: str) -> Optional[str]:
    base = os.path.basename(filename)
    if base != filename.replace("\\", "/").rsplit("/", 1)[-1]:
        return None
    full = os.path.join(transition_documents_dir(), base)
    return full if os.path.isfile(full) else None


def try_delete_file(filename: str) -> None:
    path = resolve_transition_path(filename)
    if path:
        try:
            os.remove(path)
        except OSError:
            pass
