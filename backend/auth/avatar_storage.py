"""Profile avatar storage (local / GCS / S3 via blob_storage)."""

from __future__ import annotations

import os
import re
from typing import Optional

from backend.core import blob_storage

_NS = "user_avatars"
_MAX_BYTES = 2 * 1024 * 1024
_ALLOWED_CT: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def user_avatars_dir() -> str:
    """Legacy path for local dev; prefer blob_storage."""
    return os.path.join(blob_storage._local_root(), _NS)


def delete_stored_avatar(user_id: int) -> None:
    blob_storage.delete_avatar_glob(user_id, _NS)


def save_avatar_bytes(user_id: int, raw: bytes, content_type: Optional[str]) -> str:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct not in _ALLOWED_CT:
        raise ValueError(f"Unsupported image type (use JPEG, PNG, or WebP): {content_type!r}")
    if len(raw) > _MAX_BYTES:
        raise ValueError("Image too large (max 2MB)")
    ext = _ALLOWED_CT[ct]
    delete_stored_avatar(user_id)
    filename = f"{user_id}{ext}"
    blob_storage.put_bytes(_NS, filename, raw, content_type=ct)
    return filename


def resolve_avatar_path(user_id: int, avatar_filename: Optional[str]) -> Optional[str]:
    if not avatar_filename:
        return None
    base = os.path.basename(avatar_filename)
    if not re.match(rf"^{user_id}\.(jpg|jpeg|png|webp)$", base, re.IGNORECASE):
        return None
    return blob_storage.resolve_local_path(_NS, base)


def media_type_for_filename(filename: str) -> str:
    lower = filename.lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    return "image/jpeg"
