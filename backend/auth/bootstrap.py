"""One-time bootstrap: first admin from AUTH_BOOTSTRAP_EMAIL + AUTH_BOOTSTRAP_PASSWORD."""
import os
import logging

from backend.db.database import SessionLocal, User
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
