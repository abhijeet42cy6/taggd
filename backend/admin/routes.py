from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth.profile import ROLE_CLIENT_USER, ROLE_PROJECT_HEAD, VERTICAL_KEYS, effective_role
from backend.db.database import Project, User, UserProjectAssignment, get_db
from backend.auth.security import hash_password
from backend.auth.deps import require_roles

router = APIRouter(prefix="/admin", tags=["admin"])

VALID_ROLES = frozenset(
    {
        "admin",
        "platform_admin",
        "executive",
        "manager",
        "project_head",
        "operations",
        "recruiter",
        "client_user",
    }
)


def _normalize_role_input(role: str) -> str:
    r = role.strip().lower()
    aliases = {"admin": "platform_admin", "manager": "project_head"}
    return aliases.get(r, r)


class UserCreate(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=6)
    role: str
    vertical_access: Optional[List[str]] = None


class UserPatch(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None
    manager_user_id: Optional[int] = None
    vertical_access: Optional[List[str]] = None


class ProjectsBody(BaseModel):
    project_ids: List[int] = []


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
):
    users = db.query(User).order_by(User.id).all()
    out = []
    for u in users:
        pids = (
            db.query(UserProjectAssignment.project_id)
            .filter(UserProjectAssignment.user_id == u.id)
            .all()
        )
        va = getattr(u, "vertical_access_json", None)
        out.append(
            {
                "id": u.id,
                "email": u.email,
                "role": u.role,
                "is_active": u.is_active,
                "project_ids": [r[0] for r in pids],
                "manager_user_id": getattr(u, "manager_user_id", None),
                "vertical_access": list(va) if isinstance(va, list) else va,
            }
        )
    return out


@router.post("/users")
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
):
    role_in = body.role.strip().lower()
    if role_in not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    role = _normalize_role_input(body.role)
    email = body.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    u = User(
        email=email,
        password_hash=hash_password(body.password),
        role=role,
        is_active=True,
    )
    if body.vertical_access is not None:
        keys = [str(x).strip().lower() for x in body.vertical_access if str(x).strip()]
        unknown = [k for k in keys if k not in VERTICAL_KEYS]
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown vertical keys: {unknown}")
        u.vertical_access_json = keys
    if role == ROLE_CLIENT_USER:
        va = getattr(u, "vertical_access_json", None)
        if not isinstance(va, list) or len(va) == 0:
            raise HTTPException(
                status_code=400,
                detail="client_user requires non-empty vertical_access (which dashboards this account may open)",
            )
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"id": u.id, "email": u.email, "role": u.role, "is_active": u.is_active}


@router.patch("/users/{user_id}")
def patch_user(
    user_id: int,
    body: UserPatch,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if u.id == admin.id and body.is_active is False:
        raise HTTPException(status_code=400, detail="Cannot disable yourself")
    if body.role is not None:
        r_in = body.role.strip().lower()
        if r_in not in VALID_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")
        u.role = _normalize_role_input(body.role)
    if body.is_active is not None:
        u.is_active = body.is_active
    if body.password:
        u.password_hash = hash_password(body.password)
    patch_raw = body.model_dump(exclude_unset=True)
    if "manager_user_id" in patch_raw:
        mid = patch_raw["manager_user_id"]
        if mid is not None:
            if mid == user_id:
                raise HTTPException(status_code=400, detail="manager_user_id cannot equal self")
            if not db.query(User).filter(User.id == mid).first():
                raise HTTPException(status_code=400, detail="manager_user_id not found")
        u.manager_user_id = mid
    if body.vertical_access is not None:
        keys = [str(x).strip().lower() for x in body.vertical_access if str(x).strip()]
        unknown = [k for k in keys if k not in VERTICAL_KEYS]
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown vertical keys: {unknown}")
        u.vertical_access_json = keys
    if effective_role(u) == ROLE_CLIENT_USER:
        va = getattr(u, "vertical_access_json", None)
        if not isinstance(va, list) or len(va) == 0:
            raise HTTPException(
                status_code=400,
                detail="client_user requires non-empty vertical_access (assign at least one module)",
            )
    db.commit()
    db.refresh(u)
    return {
        "id": u.id,
        "email": u.email,
        "role": u.role,
        "is_active": u.is_active,
        "manager_user_id": getattr(u, "manager_user_id", None),
        "vertical_access": u.vertical_access_json if isinstance(u.vertical_access_json, list) else None,
    }


@router.put("/users/{user_id}/projects")
def set_user_projects(
    user_id: int,
    body: ProjectsBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if effective_role(u) == ROLE_CLIENT_USER and len(body.project_ids) == 0:
        raise HTTPException(
            status_code=400,
            detail="client_user must be assigned to at least one project",
        )
    prev_ids = {
        r[0]
        for r in db.query(UserProjectAssignment.project_id)
        .filter(UserProjectAssignment.user_id == user_id)
        .all()
    }
    db.query(UserProjectAssignment).filter(UserProjectAssignment.user_id == user_id).delete(
        synchronize_session=False
    )
    seen = set()
    for pid in body.project_ids:
        if pid in seen:
            continue
        seen.add(pid)
        db.add(UserProjectAssignment(user_id=user_id, project_id=pid))

    removed = prev_ids - seen
    added = seen - prev_ids
    for pid in removed:
        p = db.query(Project).filter(Project.id == pid).first()
        if p and p.project_head_user_id == user_id:
            p.project_head_user_id = None
    if effective_role(u) == ROLE_PROJECT_HEAD and added:
        for pid in added:
            p = db.query(Project).filter(Project.id == pid).first()
            if not p:
                continue
            if p.project_head_user_id is None or p.project_head_user_id == user_id:
                p.project_head_user_id = user_id

    db.commit()
    return {"user_id": user_id, "project_ids": sorted(seen)}
