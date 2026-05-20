"""Transition tracker uploads (local / GCS / S3)."""
from __future__ import annotations

import os
import re
import time
from typing import Optional

from backend.core import blob_storage

_NS = "transition_documents"
_MAX_BYTES = 50 * 1024 * 1024
_ALLOWED_EXT = frozenset({".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".png", ".jpg", ".jpeg", ".txt"})


def transition_documents_dir() -> str:
    return os.path.join(blob_storage._local_root(), _NS)


def save_transition_file(project_id: int, raw: bytes, original_filename: str) -> str:
    if len(raw) > _MAX_BYTES:
        raise ValueError("File too large (max 50 MB)")
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in _ALLOWED_EXT:
        raise ValueError(
            f"Unsupported file type: {ext!r}. Allowed: PDF, Word, Excel, PowerPoint, images, .txt.",
        )
    safe_orig = re.sub(r"[^a-zA-Z0-9._-]", "_", original_filename)[:80]
    filename = f"trn{project_id}_{int(time.time())}_{safe_orig}"
    blob_storage.put_bytes(_NS, filename, raw)
    return filename


def resolve_transition_path(filename: str) -> Optional[str]:
    base = os.path.basename(filename)
    if base != filename.replace("\\", "/").rsplit("/", 1)[-1]:
        return None
    return blob_storage.resolve_local_path(_NS, base)


def try_delete_file(filename: str) -> None:
    blob_storage.delete_file(_NS, os.path.basename(filename))
