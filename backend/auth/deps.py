from __future__ import annotations

from typing import Callable, Optional, Set

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from backend.db.database import User, UserProjectAssignment, get_db


def normalized_role(user: User) -> str:
    """Lowercase trimmed role string — DB/UI may vary in casing."""
    return (user.role or "").strip().lower()


def get_current_user(request: Request) -> User:
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User disabled")
    return user


def require_roles(*roles: str) -> Callable:
    allowed = {r.strip().lower() for r in roles}

    def _inner(user: User = Depends(get_current_user)) -> User:
        if normalized_role(user) not in allowed:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return _inner


def allowed_project_ids(user: User, db: Session) -> Optional[Set[int]]:
    """
    None = unrestricted (admin only).
    Set of project_ids for executive and manager from user_project_assignments (may be empty).
    """
    role = normalized_role(user)
    if role == "admin":
        return None
    if role in ("executive", "manager"):
        rows = (
            db.query(UserProjectAssignment.project_id)
            .filter(UserProjectAssignment.user_id == user.id)
            .all()
        )
        ids = {r[0] for r in rows}
        # Executive with no explicit assignments = org-wide (same as admin for reads).
        # Managers with no assignments stay empty (assignment-only role).
        if role == "executive" and len(ids) == 0:
            return None
        return ids
    raise HTTPException(status_code=403, detail="Unknown role")


def can_create_unmatched_project(user: User) -> bool:
    """
    Who may create a new Project row when upload does not match an existing client/file.
    Admin and executive: yes. Managers are assignment-scoped and must not create new accounts.
    """
    return normalized_role(user) in ("admin", "executive")


def project_scope_filter(user: User, db: Session):
    """Returns SQLAlchemy filter for Project.id, or None for no filter."""
    ids = allowed_project_ids(user, db)
    if ids is None:
        return None
    return ids
