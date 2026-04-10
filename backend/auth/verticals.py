"""Vertical (module) access for `operations` role — router dependencies."""
from __future__ import annotations

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.auth.profile import operations_may_access_vertical, resolve_user_profile
from backend.db.database import User, get_db


def require_vertical(vertical_key: str):
    """Dependency factory: 403 if `operations` user lacks this vertical in `vertical_access_json`."""

    def _check(
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> None:
        u = db.query(User).filter(User.id == user.id).first()
        if not u:
            raise HTTPException(status_code=401, detail="User not found")
        profile = resolve_user_profile(u, db)
        if not profile.is_operations:
            return
        if not operations_may_access_vertical(profile, vertical_key):
            raise HTTPException(
                status_code=403,
                detail=f"Vertical '{vertical_key}' not enabled for this operations user",
            )

    return _check
