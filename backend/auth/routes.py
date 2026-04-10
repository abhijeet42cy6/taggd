from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.db.database import User, get_db
from backend.auth.security import verify_password, create_access_token
from backend.auth.deps import get_current_user, allowed_project_ids
from backend.auth.profile import profile_to_me_dict, resolve_user_profile

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=1)


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
    # Re-load user in this session so ORM state is clean for assignments query
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
    }
