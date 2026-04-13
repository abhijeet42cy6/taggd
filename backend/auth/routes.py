from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth.avatar_storage import delete_stored_avatar, media_type_for_filename, resolve_avatar_path, save_avatar_bytes
from backend.auth.security import verify_password, create_access_token
from backend.auth.deps import get_current_user, allowed_project_ids
from backend.auth.profile import profile_to_me_dict, resolve_user_profile
from backend.db.database import User, get_db

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=1)


class MeProfilePatch(BaseModel):
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    phone: Optional[str] = None


def _profile_fields(u: User) -> dict:
    return {
        "given_name": getattr(u, "given_name", None),
        "family_name": getattr(u, "family_name", None),
        "phone": getattr(u, "phone", None),
        "has_avatar": bool(getattr(u, "avatar_filename", None)),
    }


def _clip(s: Optional[str], max_len: int) -> Optional[str]:
    if s is None:
        return None
    t = str(s).strip()
    if not t:
        return None
    return t[:max_len]


@router.post("/login")
def login(body: LoginBody, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User disabled")
    token = create_access_token(str(user.id))
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email, "role": user.role},
    }


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user.id).first()
    if not u:
        raise HTTPException(status_code=401, detail="User not found")
    ids = allowed_project_ids(u, db)
    profile = resolve_user_profile(u, db)
    return {
        "id": u.id,
        "email": u.email,
        "role": u.role,
        "project_ids": sorted(ids) if ids is not None else None,
        **profile_to_me_dict(profile),
        **_profile_fields(u),
    }


@router.patch("/me/profile")
def patch_me_profile(
    body: MeProfilePatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    u = db.query(User).filter(User.id == user.id).first()
    if not u:
        raise HTTPException(status_code=401, detail="User not found")
    raw = body.model_dump(exclude_unset=True)
    if "given_name" in raw:
        u.given_name = _clip(body.given_name, 120)
    if "family_name" in raw:
        u.family_name = _clip(body.family_name, 120)
    if "phone" in raw:
        u.phone = _clip(body.phone, 64)
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"status": "ok", **_profile_fields(u)}


@router.post("/me/avatar")
async def post_me_avatar(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
):
    u = db.query(User).filter(User.id == user.id).first()
    if not u:
        raise HTTPException(status_code=401, detail="User not found")
    raw = await file.read()
    try:
        fn = save_avatar_bytes(u.id, raw, file.content_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    u.avatar_filename = fn
    db.add(u)
    db.commit()
    return {"status": "ok", "has_avatar": True}


@router.delete("/me/avatar")
def delete_me_avatar(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user.id).first()
    if not u:
        raise HTTPException(status_code=401, detail="User not found")
    delete_stored_avatar(u.id)
    u.avatar_filename = None
    db.add(u)
    db.commit()
    return {"status": "ok", "has_avatar": False}


@router.get("/me/avatar")
def get_me_avatar(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user.id).first()
    if not u:
        raise HTTPException(status_code=401, detail="User not found")
    path = resolve_avatar_path(u.id, getattr(u, "avatar_filename", None))
    if not path:
        raise HTTPException(status_code=404, detail="No avatar")
    fn = u.avatar_filename or ""
    return FileResponse(path, media_type=media_type_for_filename(fn), filename=os.path.basename(path))
