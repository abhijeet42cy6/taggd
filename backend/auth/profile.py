"""Resolved access profile: canonical roles, project scope, optional vertical keys.

See USER_ACCESS_SYSTEM_UPGRADE_PLAN.md. Legacy DB values `admin` and `manager` map to
`platform_admin` and `project_head` without requiring immediate data migration.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, Set

from sqlalchemy.orm import Session

from backend.db.database import User, UserProjectAssignment

# --- Canonical role strings (prefer these in new data) ---
ROLE_PLATFORM_ADMIN = "platform_admin"
ROLE_EXECUTIVE = "executive"
ROLE_OPERATIONS = "operations"
ROLE_PROJECT_HEAD = "project_head"
ROLE_RECRUITER = "recruiter"
ROLE_CLIENT_USER = "client_user"

LEGACY_ROLE_ALIASES: dict[str, str] = {
    "admin": ROLE_PLATFORM_ADMIN,
    "manager": ROLE_PROJECT_HEAD,
}

CANONICAL_ROLES = frozenset(
    {
        ROLE_PLATFORM_ADMIN,
        ROLE_EXECUTIVE,
        ROLE_OPERATIONS,
        ROLE_PROJECT_HEAD,
        ROLE_RECRUITER,
        ROLE_CLIENT_USER,
    }
)

# Documented vertical keys for `users.vertical_access_json` (JSON array of strings).
VERTICAL_KEYS = frozenset(
    {
        "finance",
        "finance_validation",
        "sla",
        "wfm",
        "requisitions",
        "candidates",
        "contracts",
        "meetings",
        "ingestion",
        "revenue_forecast",
        "revenue_kpi_governance",
        "revenue_billing",
        "vendor_licenses",
        "tasks",
        "portfolio",
        "clients",
        "data_operations",
        "admin_users",
        "transitions",
    }
)


def stored_role_normalized(user: User) -> str:
    return (user.role or "").strip().lower()


def effective_role(user: User) -> str:
    raw = stored_role_normalized(user)
    return LEGACY_ROLE_ALIASES.get(raw, raw)


def _assignment_ids(db: Session, user_id: int) -> Set[int]:
    rows = db.query(UserProjectAssignment.project_id).filter(UserProjectAssignment.user_id == user_id).all()
    return {r[0] for r in rows}


def _vertical_keys_from_user(user: User) -> Optional[Set[str]]:
    raw = getattr(user, "vertical_access_json", None)
    if raw is None:
        return None
    if isinstance(raw, list):
        return {str(x).strip().lower() for x in raw if str(x).strip()}
    return None


@dataclass(frozen=True)
class UserAccessProfile:
    stored_role: str
    effective_role: str
    """None = unrestricted project access; empty set = no projects; non-empty = restricted."""
    project_ids: Optional[Set[int]]
    """None = all verticals allowed (for this user). Non-empty = allow-list for operations role."""
    vertical_keys: Optional[Set[str]]
    manager_user_id: Optional[int]

    @property
    def is_platform_admin(self) -> bool:
        return self.effective_role == ROLE_PLATFORM_ADMIN

    @property
    def is_executive(self) -> bool:
        return self.effective_role == ROLE_EXECUTIVE

    @property
    def is_operations(self) -> bool:
        return self.effective_role == ROLE_OPERATIONS

    @property
    def is_project_head(self) -> bool:
        return self.effective_role == ROLE_PROJECT_HEAD

    @property
    def is_recruiter(self) -> bool:
        return self.effective_role == ROLE_RECRUITER

    @property
    def is_client_user(self) -> bool:
        return self.effective_role == ROLE_CLIENT_USER


def resolve_user_profile(user: User, db: Session) -> UserAccessProfile:
    stored = stored_role_normalized(user)
    eff = effective_role(user)
    pids = _assignment_ids(db, user.id)
    mgr_id = getattr(user, "manager_user_id", None)

    if eff == ROLE_PLATFORM_ADMIN:
        return UserAccessProfile(stored, eff, None, _vertical_keys_from_user(user), mgr_id)

    if eff == ROLE_EXECUTIVE:
        if len(pids) == 0:
            return UserAccessProfile(stored, eff, None, _vertical_keys_from_user(user), mgr_id)
        return UserAccessProfile(stored, eff, set(pids), _vertical_keys_from_user(user), mgr_id)

    if eff in (ROLE_PROJECT_HEAD, ROLE_OPERATIONS, ROLE_RECRUITER, ROLE_CLIENT_USER):
        v = _vertical_keys_from_user(user)
        return UserAccessProfile(stored, eff, set(pids), v, mgr_id)

    # Unknown role string: restrictive project scope, no vertical JSON
    return UserAccessProfile(stored, eff, set(pids), _vertical_keys_from_user(user), mgr_id)


def profile_to_me_dict(profile: UserAccessProfile) -> dict[str, Any]:
    v = profile.vertical_keys
    return {
        "effective_role": profile.effective_role,
        "vertical_access": sorted(v) if v is not None else None,
        "manager_user_id": profile.manager_user_id,
        "is_read_only": profile.is_client_user,
    }


def descendant_user_ids(db: Session, manager_id: int) -> Set[int]:
    """Direct and indirect reports via `users.manager_user_id` (BFS, cycle-safe)."""
    out: Set[int] = set()
    frontier = [manager_id]
    seen_managers = {manager_id}
    while frontier:
        mid = frontier.pop()
        children = [r[0] for r in db.query(User.id).filter(User.manager_user_id == mid).all()]
        for cid in children:
            if cid in out:
                continue
            out.add(cid)
            if cid not in seen_managers:
                seen_managers.add(cid)
                frontier.append(cid)
    return out


def _staff_vertical_allow_list_allows(keys: Optional[Set[str]], vertical_key: str) -> bool:
    """None = unrestricted (legacy / not configured); empty = no module access."""
    if keys is None:
        return True
    if len(keys) == 0:
        return False
    return vertical_key.lower() in {k.lower() for k in keys}


def operations_may_access_vertical(profile: UserAccessProfile, vertical_key: str) -> bool:
    if profile.effective_role != ROLE_OPERATIONS:
        return True
    return _staff_vertical_allow_list_allows(profile.vertical_keys, vertical_key)


def profile_may_access_vertical(profile: UserAccessProfile, vertical_key: str) -> bool:
    """Used by `require_vertical`: staff with `vertical_access_json` use it as a module allow-list (same as UI)."""
    if profile.effective_role == ROLE_OPERATIONS:
        return _staff_vertical_allow_list_allows(profile.vertical_keys, vertical_key)
    if profile.effective_role == ROLE_CLIENT_USER:
        keys = profile.vertical_keys
        if keys is None or len(keys) == 0:
            return False
        return vertical_key.lower() in {k.lower() for k in keys}
    if profile.effective_role in (ROLE_EXECUTIVE, ROLE_PROJECT_HEAD, ROLE_RECRUITER):
        return _staff_vertical_allow_list_allows(profile.vertical_keys, vertical_key)
    return True
