from __future__ import annotations

from typing import Callable, Optional, Set

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from backend.db.database import User

from backend.auth.profile import (
    ROLE_PLATFORM_ADMIN,
    ROLE_EXECUTIVE,
    effective_role,
    resolve_user_profile,
    stored_role_normalized,
)


def normalized_role(user: User) -> str:
    """Lowercase trimmed role string as stored in DB (may be legacy `admin` / `manager`)."""
    return stored_role_normalized(user)


def get_current_user(request: Request) -> User:
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User disabled")
    return user


def require_roles(*roles: str) -> Callable:
    allowed = {r.strip().lower() for r in roles}
    expanded = set(allowed)
    if "admin" in allowed:
        expanded.add("platform_admin")
    if "platform_admin" in allowed:
        expanded.add("admin")
    if "manager" in allowed:
        expanded.add("project_head")
    if "project_head" in allowed:
        expanded.add("manager")

    def _inner(user: User = Depends(get_current_user)) -> User:
        if stored_role_normalized(user) not in expanded:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return _inner


def is_platform_admin(user: User) -> bool:
    return effective_role(user) == ROLE_PLATFORM_ADMIN


def allowed_project_ids(user: User, db: Session) -> Optional[Set[int]]:
    """
    None = unrestricted (full org).
    Set = allowed project ids (may be empty).
    Unknown / unrecognised roles: empty set (restrictive), not HTTP 403.
    """
    profile = resolve_user_profile(user, db)
    return profile.project_ids


def can_create_unmatched_project(user: User) -> bool:
    """Who may create a new Project when upload does not match an existing client/file."""
    er = effective_role(user)
    return er in (ROLE_PLATFORM_ADMIN, ROLE_EXECUTIVE)


def project_scope_filter(user: User, db: Session):
    """Returns SQLAlchemy filter for Project.id, or None for no filter."""
    ids = allowed_project_ids(user, db)
    if ids is None:
        return None
    return ids
