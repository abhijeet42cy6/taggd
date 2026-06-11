"""Apply manager project scope to SQLAlchemy queries."""
from __future__ import annotations

from typing import Type

from fastapi import HTTPException
from sqlalchemy import and_, false, func, or_
from sqlalchemy.orm import Query, Session

from backend.auth.deps import allowed_project_ids
from backend.core.debug_agent_log import debug_agent_log
from backend.auth.profile import ROLE_RECRUITER, effective_role
from backend.db.database import Candidate, Client, Project, Record, User


def apply_project_scope(q: Query, user: User, db: Session, model: Type) -> Query:
    """Narrow query to assigned projects for executive/manager; admin unchanged."""
    ids = allowed_project_ids(user, db)
    if ids is None:
        return q
    if len(ids) == 0:
        return q.filter(false())
    if model is Project:
        return q.filter(Project.id.in_(ids))
    if hasattr(model, "project_id"):
        return q.filter(model.project_id.in_(ids))
    return q


def assert_project_access(user: User, db: Session, project_id: int) -> None:
    ids = allowed_project_ids(user, db)
    if ids is not None and project_id not in ids:
        # #region agent log
        debug_agent_log(
            hypothesis_id="H2",
            location="auth/scope.py:assert_project_access",
            message="project_scope_denied_403",
            data={
                "user_id": getattr(user, "id", None),
                "project_id": project_id,
                "scope_size": len(ids),
            },
        )
        # #endregion
        raise HTTPException(status_code=403, detail="Access denied for this project")


def assert_client_access(user: User, db: Session, client_id: int) -> None:
    """Full-access users, scoped users with any project on this client, or bootstrap when client has no projects yet."""
    ids = allowed_project_ids(user, db)
    if ids is None:
        return
    ok = (
        db.query(Project.id)
        .filter(Project.client_id == client_id, Project.id.in_(ids))
        .first()
    )
    if ok:
        return
    nproj = db.query(func.count(Project.id)).filter(Project.client_id == client_id).scalar() or 0
    if nproj == 0:
        return
    raise HTTPException(status_code=403, detail="Access denied for this client")


def account_accessible(user: User, db: Session, account_name: str) -> bool:
    """Whether user may load SLA drilldown for this account_name."""
    ids = allowed_project_ids(user, db)
    if ids is None:
        return True
    want = (account_name or "").strip()
    if not want:
        return False
    rows = db.query(Project.id).filter(Project.account_name == want).all()
    pids = {r[0] for r in rows}
    rows_c = (
        db.query(Project.id)
        .join(Client, Project.client_id == Client.id)
        .filter(func.lower(Client.official_name) == want.lower())
        .all()
    )
    pids |= {r[0] for r in rows_c}
    return bool(pids & set(ids))


def scoped_clause_record(user: User, db: Session):
    """Optional SQLAlchemy clause for Record.project_id scope (None = no extra filter)."""
    ids = allowed_project_ids(user, db)
    if ids is None:
        return None
    if len(ids) == 0:
        return false()
    return Record.project_id.in_(ids)


def apply_record_access_scope(q: Query, user: User, db: Session) -> Query:
    """Project assignments plus recruiter assignment rules (same scope as GET /records/all)."""
    q = apply_project_scope(q, user, db, Record)
    return apply_recruiter_record_scope(q, user, db)


def apply_recruiter_record_scope(q: Query, user: User, db: Session) -> Query:
    """Recruiters: only requisitions assigned to them (FK) or legacy string match on email/local-part."""
    if effective_role(user) != ROLE_RECRUITER:
        return q
    u = db.query(User).filter(User.id == user.id).first()
    if not u:
        return q.filter(false())
    email = (u.email or "").strip()
    local = email.split("@")[0].lower() if "@" in email else email.lower()
    parts = [Record.assigned_recruiter_user_id == user.id, Record.hiring_manager_user_id == user.id]
    if email:
        parts.append(
            and_(
                Record.assigned_recruiter_user_id.is_(None),
                or_(
                    Record.assigned_recruiter_rpo.ilike(f"%{email}%"),
                    Record.hiring_manager.ilike(f"%{email}%"),
                    Record.assigned_recruiter_rpo.ilike(f"%{local}%"),
                    Record.hiring_manager.ilike(f"%{local}%"),
                ),
            )
        )
    return q.filter(or_(*parts))


def apply_recruiter_candidate_scope(q: Query, user: User, db: Session) -> Query:
    if effective_role(user) != ROLE_RECRUITER:
        return q
    u = db.query(User).filter(User.id == user.id).first()
    if not u:
        return q.filter(false())
    email = (u.email or "").strip()
    local = email.split("@")[0].lower() if "@" in email else email.lower()
    parts = [Candidate.assigned_recruiter_user_id == user.id, Candidate.hiring_manager_user_id == user.id]
    if email:
        parts.append(
            and_(
                Candidate.assigned_recruiter_user_id.is_(None),
                or_(
                    Candidate.assigned_recruiter.ilike(f"%{email}%"),
                    Candidate.hiring_manager.ilike(f"%{email}%"),
                    Candidate.assigned_recruiter.ilike(f"%{local}%"),
                    Candidate.hiring_manager.ilike(f"%{local}%"),
                ),
            )
        )
    return q.filter(or_(*parts))
