"""Disk storage for user profile avatars (per-user file under `user_avatars/`)."""

from __future__ import annotations

import os
import re
from typing import Optional

_MAX_BYTES = 2 * 1024 * 1024
_ALLOWED_CT: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def user_avatars_dir() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "user_avatars"))


def _ensure_dir() -> None:
    os.makedirs(user_avatars_dir(), exist_ok=True)


def delete_stored_avatar(user_id: int) -> None:
    d = user_avatars_dir()
    if not os.path.isdir(d):
        return
    for name in os.listdir(d):
        if not name.startswith(f"{user_id}."):
            continue
        p = os.path.join(d, name)
        if os.path.isfile(p):
            try:
                os.remove(p)
            except OSError:
                pass


def save_avatar_bytes(user_id: int, raw: bytes, content_type: Optional[str]) -> str:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct not in _ALLOWED_CT:
        raise ValueError(f"Unsupported image type (use JPEG, PNG, or WebP): {content_type!r}")
    if len(raw) > _MAX_BYTES:
        raise ValueError("Image too large (max 2MB)")
    ext = _ALLOWED_CT[ct]
    delete_stored_avatar(user_id)
    _ensure_dir()
    filename = f"{user_id}{ext}"
    path = os.path.join(user_avatars_dir(), filename)
    with open(path, "wb") as f:
        f.write(raw)
    return filename


def resolve_avatar_path(user_id: int, avatar_filename: Optional[str]) -> Optional[str]:
    if not avatar_filename:
        return None
    base = os.path.basename(avatar_filename)
    if not re.match(rf"^{user_id}\.(jpg|jpeg|png|webp)$", base, re.IGNORECASE):
        return None
    full = os.path.join(user_avatars_dir(), base)
    return full if os.path.isfile(full) else None


def media_type_for_filename(filename: str) -> str:
    lower = filename.lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    return "image/jpeg"
