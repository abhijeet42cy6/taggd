"""Resolve display label for accountable project head: FK user → assignments → legacy string."""
from __future__ import annotations

from collections import defaultdict
from typing import Dict, List, Optional, TYPE_CHECKING

from sqlalchemy.orm import Session

from backend.auth.profile import ROLE_PROJECT_HEAD, effective_role

if TYPE_CHECKING:
    from backend.db.database import Project, User


def user_display_name(user: "User") -> Optional[str]:
    gn = (getattr(user, "given_name", None) or "").strip()
    fn = (getattr(user, "family_name", None) or "").strip()
    if gn or fn:
        return f"{gn} {fn}".strip()
    em = (getattr(user, "email", None) or "").strip()
    return em or None


def assigned_project_heads_by_project(db: Session, project_ids: List[int]) -> Dict[int, List["User"]]:
    """Users with effective role project_head assigned to each project_id (active only)."""
    if not project_ids:
        return {}
    from backend.db.database import User, UserProjectAssignment

    rows = (
        db.query(UserProjectAssignment, User)
        .join(User, User.id == UserProjectAssignment.user_id)
        .filter(UserProjectAssignment.project_id.in_(project_ids), User.is_active.is_(True))
        .all()
    )
    m: Dict[int, List[User]] = defaultdict(list)
    for a, usr in rows:
        if effective_role(usr) == ROLE_PROJECT_HEAD:
            m[a.project_id].append(usr)
    return dict(m)


def resolve_project_head_label(
    project: Optional["Project"],
    assigned_heads: Optional[List["User"]] = None,
) -> Optional[str]:
    """
    1) Linked user (project_head_user_id) if active.
    2) If exactly one active project_head assigned via user_project_assignments.
    3) Legacy projects.project_head string.
    """
    if project is None:
        return None

    u = getattr(project, "project_head_user", None)
    if u is not None and getattr(u, "is_active", True):
        d = user_display_name(u)
        if d:
            return d

    heads = assigned_heads or []
    active = [h for h in heads if getattr(h, "is_active", True)]
    if len(active) == 1:
        d = user_display_name(active[0])
        if d:
            return d

    s = (getattr(project, "project_head", None) or "").strip()
    return s or None
