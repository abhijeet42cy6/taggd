"""
Database engine factory — SQLite (legacy) or PostgreSQL (local dev, Cloud SQL, AWS RDS).

Set DATABASE_URL, e.g.:
  postgresql+psycopg://user:pass@localhost:5432/tgddata?sslmode=prefer
  sqlite:///./revenue_generator.db
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# Local `uvicorn` does not load `.env` automatically; read repo-root env before DATABASE_URL.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

DEFAULT_SQLITE_URL = "sqlite:///./revenue_generator.db"


def get_database_url() -> str:
    return os.getenv("DATABASE_URL", DEFAULT_SQLITE_URL).strip()


def is_sqlite_url(url: str | None = None) -> bool:
    u = (url or get_database_url()).lower()
    return u.startswith("sqlite:")


def is_postgres_url(url: str | None = None) -> bool:
    u = (url or get_database_url()).lower()
    return (
        u.startswith("postgresql:")
        or u.startswith("postgresql+")
        or u.startswith("postgres:")
        or u.startswith("postgres+")
    )


def create_app_engine(url: str | None = None, **kwargs: Any) -> Engine:
    """Build SQLAlchemy engine with dialect-appropriate options."""
    db_url = url or get_database_url()
    opts: dict[str, Any] = dict(kwargs)

    if is_sqlite_url(db_url):
        opts.setdefault("connect_args", {"check_same_thread": False})
    elif is_postgres_url(db_url):
        # Cloud SQL / RDS: avoid stale connections after idle timeouts.
        opts.setdefault("pool_pre_ping", True)
        opts.setdefault("pool_size", int(os.getenv("DB_POOL_SIZE", "5")))
        opts.setdefault("max_overflow", int(os.getenv("DB_MAX_OVERFLOW", "10")))
    else:
        raise ValueError(f"Unsupported DATABASE_URL scheme: {db_url.split(':', 1)[0]}")

    return create_engine(db_url, **opts)
