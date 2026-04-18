"""Disk storage for contract MSA / document uploads."""
from __future__ import annotations

import os
import re
import time
from typing import Optional

_MAX_BYTES = 50 * 1024 * 1024  # 50 MB
_ALLOWED_EXT = frozenset({".pdf", ".docx", ".doc", ".xlsx", ".xls", ".png", ".jpg", ".jpeg"})


def msa_documents_dir() -> str:
    return os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "msa_documents")
    )


def _ensure_dir() -> None:
    os.makedirs(msa_documents_dir(), exist_ok=True)


def save_msa_file(contract_id: int, raw: bytes, original_filename: str) -> str:
    if len(raw) > _MAX_BYTES:
        raise ValueError("File too large (max 50 MB)")
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in _ALLOWED_EXT:
        raise ValueError(f"Unsupported file type: {ext!r}. Allowed: PDF, Word, Excel, image.")
    _ensure_dir()
    safe_orig = re.sub(r"[^a-zA-Z0-9._-]", "_", original_filename)[:80]
    filename = f"cnt{contract_id}_{int(time.time())}_{safe_orig}"
    path = os.path.join(msa_documents_dir(), filename)
    with open(path, "wb") as f:
        f.write(raw)
    return filename


def resolve_msa_path(filename: str) -> Optional[str]:
    """Return absolute path only if the file exists inside `msa_documents_dir`."""
    base = os.path.basename(filename)
    # Reject path-traversal attempts
    if base != filename.replace("\\", "/").rsplit("/", 1)[-1]:
        return None
    full = os.path.join(msa_documents_dir(), base)
    return full if os.path.isfile(full) else None


def msa_reference_tag(filename: str) -> str:
    """Canonical value stored in project_contracts.sow_msa_reference."""
    return f"msa:{filename}"


def is_msa_reference(ref: str) -> bool:
    return (ref or "").startswith("msa:")


def extract_filename(ref: str) -> str:
    return ref[4:] if is_msa_reference(ref) else ref
