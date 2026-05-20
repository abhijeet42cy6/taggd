"""Normalize JSON columns that may be dict (SQLite) or str (Postgres migration)."""

from __future__ import annotations

import json
from typing import Any


def as_json_dict(value: Any) -> dict:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}
