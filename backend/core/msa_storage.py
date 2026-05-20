"""Contract MSA / document uploads (local / GCS / S3)."""
from __future__ import annotations

import os
import re
import time
from typing import Optional

from backend.core import blob_storage

_NS = "msa_documents"
_MAX_BYTES = 50 * 1024 * 1024
_ALLOWED_EXT = frozenset({".pdf", ".docx", ".doc", ".xlsx", ".xls", ".png", ".jpg", ".jpeg"})


def msa_documents_dir() -> str:
    return os.path.join(blob_storage._local_root(), _NS)


def save_msa_file(contract_id: int, raw: bytes, original_filename: str) -> str:
    if len(raw) > _MAX_BYTES:
        raise ValueError("File too large (max 50 MB)")
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in _ALLOWED_EXT:
        raise ValueError(f"Unsupported file type: {ext!r}. Allowed: PDF, Word, Excel, image.")
    safe_orig = re.sub(r"[^a-zA-Z0-9._-]", "_", original_filename)[:80]
    filename = f"cnt{contract_id}_{int(time.time())}_{safe_orig}"
    blob_storage.put_bytes(_NS, filename, raw)
    return filename


def resolve_msa_path(filename: str) -> Optional[str]:
    base = os.path.basename(filename)
    if base != filename.replace("\\", "/").rsplit("/", 1)[-1]:
        return None
    return blob_storage.resolve_local_path(_NS, base)


def msa_reference_tag(filename: str) -> str:
    return f"msa:{filename}"


def is_msa_reference(ref: str) -> bool:
    return (ref or "").startswith("msa:")


def extract_filename(ref: str) -> str:
    return ref[4:] if is_msa_reference(ref) else ref


def parse_msa_reference_list(ref: str | None) -> list[str]:
    if not ref or not str(ref).strip():
        return []
    out: list[str] = []
    for line in str(ref).replace("\r\n", "\n").split("\n"):
        s = line.strip()
        if not s:
            continue
        if is_msa_reference(s):
            out.append(extract_filename(s))
    return out


def serialize_msa_reference_tags(filenames: list[str]) -> str:
    return "\n".join(msa_reference_tag(f) for f in filenames if f)


def pick_latest_msa_filename(filenames: list[str]) -> str:
    if not filenames:
        raise ValueError("empty filenames")
    if len(filenames) == 1:
        return filenames[0]

    def ts_key(fn: str) -> int:
        m = re.match(r"^cnt\d+_(\d+)_", os.path.basename(fn))
        return int(m.group(1)) if m else 0

    return max(filenames, key=ts_key)
