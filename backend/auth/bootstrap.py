"""One-time bootstrap: first admin from AUTH_BOOTSTRAP_EMAIL + AUTH_BOOTSTRAP_PASSWORD."""
import os
import logging

from sqlalchemy import func

from backend.db.database import SessionLocal, User
from backend.auth.profile import ROLE_PLATFORM_ADMIN, effective_role
from backend.auth.security import hash_password

logger = logging.getLogger(__name__)


def bootstrap_default_admin() -> None:
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            return
        email = (os.getenv("AUTH_BOOTSTRAP_EMAIL") or "").strip().lower()
        password = os.getenv("AUTH_BOOTSTRAP_PASSWORD") or ""
        if not email or not password:
            logger.warning(
                "No users in DB and AUTH_BOOTSTRAP_EMAIL/PASSWORD not set — login disabled until an admin is created."
            )
            return
        u = User(
            email=email,
            password_hash=hash_password(password),
            role="admin",
            is_active=True,
        )
        db.add(u)
        db.commit()
        logger.info("Bootstrap admin user created: %s", email)
    except Exception as e:
        db.rollback()
        logger.warning("bootstrap admin: %s", e)
    finally:
        db.close()


def normalize_platform_admin_emails() -> None:
    """Idempotent: emails listed in AUTH_PLATFORM_ADMIN_EMAILS are stored as platform_admin.

    Default includes admin@test.local so the conventional local admin account always has
    full project scope (unknown/mis-set roles otherwise resolve to an empty assignment set).
    Comma-separated, case-insensitive. Set AUTH_PLATFORM_ADMIN_EMAILS to empty to skip.
    """
    raw = (os.getenv("AUTH_PLATFORM_ADMIN_EMAILS") or "admin@test.local").strip()
    if raw.lower() in ("", "none", "false", "0"):
        return
    emails = {e.strip().lower() for e in raw.split(",") if e.strip()}
    if not emails:
        return
    db = SessionLocal()
    try:
        changed = False
        for em in emails:
            u = db.query(User).filter(func.lower(func.trim(User.email)) == em).first()
            if u is None:
                continue
            if effective_role(u) == ROLE_PLATFORM_ADMIN:
                continue
            u.role = ROLE_PLATFORM_ADMIN
            changed = True
        if changed:
            db.commit()
            logger.info("Normalized listed emails to %s (full org access).", ROLE_PLATFORM_ADMIN)
    except Exception as e:
        db.rollback()
        logger.warning("normalize platform admin emails: %s", e)
    finally:
        db.close()
