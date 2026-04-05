from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.db.database import User, UserProjectAssignment, get_db
from backend.auth.security import hash_password
from backend.auth.deps import require_roles

router = APIRouter(prefix="/admin", tags=["admin"])

VALID_ROLES = frozenset({"admin", "executive", "manager"})


class UserCreate(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=6)
    role: str


class UserPatch(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


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
        out.append(
            {
                "id": u.id,
                "email": u.email,
                "role": u.role,
                "is_active": u.is_active,
                "project_ids": [r[0] for r in pids],
            }
        )
    return out


@router.post("/users")
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
):
    role = body.role.strip().lower()
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    email = body.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    u = User(
        email=email,
        password_hash=hash_password(body.password),
        role=role,
        is_active=True,
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
        r = body.role.strip().lower()
        if r not in VALID_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")
        u.role = r
    if body.is_active is not None:
        u.is_active = body.is_active
    if body.password:
        u.password_hash = hash_password(body.password)
    db.commit()
    db.refresh(u)
    return {"id": u.id, "email": u.email, "role": u.role, "is_active": u.is_active}


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
    db.query(UserProjectAssignment).filter(UserProjectAssignment.user_id == user_id).delete(
        synchronize_session=False
    )
    seen = set()
    for pid in body.project_ids:
        if pid in seen:
            continue
        seen.add(pid)
        db.add(UserProjectAssignment(user_id=user_id, project_id=pid))
    db.commit()
    return {"user_id": user_id, "project_ids": sorted(seen)}
