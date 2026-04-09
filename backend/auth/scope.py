"""Apply manager project scope to SQLAlchemy queries."""
from __future__ import annotations

from typing import Type

from fastapi import HTTPException
from sqlalchemy import false, func
from sqlalchemy.orm import Query, Session

from backend.db.database import Client, Project, Record, User
from backend.auth.deps import allowed_project_ids


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
        raise HTTPException(status_code=403, detail="Access denied for this project")


def assert_client_access(user: User, db: Session, client_id: int) -> None:
    """User must have at least one assigned project under this client."""
    ids = allowed_project_ids(user, db)
    if ids is None:
        return
    ok = (
        db.query(Project.id)
        .filter(Project.client_id == client_id, Project.id.in_(ids))
        .first()
    )
    if not ok:
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
