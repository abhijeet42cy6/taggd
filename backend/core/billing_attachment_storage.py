"""Revenue billing attachments (local / GCS / S3)."""
from __future__ import annotations

import os
import re
import time
from typing import Optional

from backend.core import blob_storage

_NS = "billing_documents"
_MAX_BYTES = 50 * 1024 * 1024
_ALLOW_EXT = frozenset({".pdf", ".docx", ".doc", ".xlsx", ".xls", ".png", ".jpg", ".jpeg"})


def billing_documents_dir() -> str:
    return os.path.join(blob_storage._local_root(), _NS)


def save_billing_attachment_file(row_id: int, raw: bytes, original_filename: str) -> str:
    if len(raw) > _MAX_BYTES:
        raise ValueError("File too large (max 50 MB)")
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in _ALLOW_EXT:
        raise ValueError(f"Unsupported file type: {ext!r}. Allowed: PDF, Word, Excel, image.")
    safe_orig = re.sub(r"[^a-zA-Z0-9._-]", "_", original_filename)[:80]
    filename = f"bil{row_id}_{int(time.time())}_{safe_orig}"
    blob_storage.put_bytes(_NS, filename, raw)
    return filename


def resolve_billing_attachment_path(filename: str) -> Optional[str]:
    base = os.path.basename(filename)
    if base != filename.replace("\\", "/").rsplit("/", 1)[-1]:
        return None
    return blob_storage.resolve_local_path(_NS, base)


def billing_reference_tag(filename: str) -> str:
    return f"billing:{filename}"


def is_billing_disk_ref_line(s: str) -> bool:
    return (s or "").strip().lower().startswith("billing:")


def extract_billing_basename(line: str) -> str:
    s = (line or "").strip()
    if not is_billing_disk_ref_line(s):
        return ""
    return os.path.basename(s[8:].strip())


def extract_billing_filename(ref: str) -> str:
    return ref[8:] if is_billing_disk_ref_line(ref) else ref


def parse_billing_file_basenames(ref: str | None) -> list[str]:
    if not ref or not str(ref).strip():
        return []
    out: list[str] = []
    for line in str(ref).replace("\r\n", "\n").split("\n"):
        s = line.strip()
        if not s:
            continue
        fn = extract_basename_from_tag_line(s)
        if fn:
            out.append(fn)
    return out


def extract_basename_from_tag_line(s: str) -> str:
    if is_billing_disk_ref_line(s):
        return extract_billing_basename(s)
    base = os.path.basename(s.strip())
    if re.match(r"^bil\d+_\d+_", base):
        return base
    return ""


def non_billing_lines(ref: str | None) -> list[str]:
    if not ref or not str(ref).strip():
        return []
    out: list[str] = []
    for line in str(ref).replace("\r\n", "\n").split("\n"):
        if not line.strip():
            continue
        if extract_basename_from_tag_line(line.strip()):
            continue
        out.append(line.rstrip())
    return out


def append_billing_upload_to_ref(existing: str | None, new_filename: str) -> str:
    urls = non_billing_lines(existing)
    cur = parse_billing_file_basenames(existing)
    if new_filename not in cur:
        cur.append(new_filename)
    tags = [billing_reference_tag(f) for f in cur]
    parts = [*urls, *tags]
    return "\n".join(parts) if parts else ""


def pick_latest_billing_filename(filenames: list[str]) -> str:
    if not filenames:
        raise ValueError("empty filenames")
    if len(filenames) == 1:
        return filenames[0]

    def ts_key(fn: str) -> int:
        m = re.match(r"^bil\d+_(\d+)_", os.path.basename(fn))
        return int(m.group(1)) if m else 0

    return max(filenames, key=ts_key)
