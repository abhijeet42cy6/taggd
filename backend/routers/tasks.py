"""Central task management: deadlines, multi-assignee, optional project + resource link."""
from __future__ import annotations

import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import exists, or_
from sqlalchemy.orm import Session

from backend.auth.deps import allowed_project_ids, get_current_user, normalized_role
from backend.auth.scope import assert_project_access
from backend.core.activity_log import log_activity
from backend.db.database import Task, TaskAssignee, User, UserProjectAssignment, get_db

router = APIRouter(prefix="/tasks", tags=["tasks"])

VALID_STATUSES = frozenset({"open", "in_progress", "blocked", "done", "cancelled"})


def _apply_task_scope(q, user: User, db: Session):
    if normalized_role(user) == "admin":
        return q
    sub_assigned = exists().where(TaskAssignee.task_id == Task.id, TaskAssignee.user_id == user.id)
    mine = or_(Task.created_by_user_id == user.id, sub_assigned)
    pids = allowed_project_ids(user, db)
    if pids is None:
        return q
    if len(pids) == 0:
        return q.filter(mine)
    return q.filter(or_(mine, Task.project_id.in_(pids)))


def _assert_task_access(db: Session, user: User, task: Task) -> None:
    if normalized_role(user) == "admin":
        return
    if task.created_by_user_id == user.id:
        return
    if db.query(TaskAssignee).filter(TaskAssignee.task_id == task.id, TaskAssignee.user_id == user.id).first():
        return
    pids = allowed_project_ids(user, db)
    if pids is None:
        return
    if task.project_id is not None and task.project_id in pids:
        return
    raise HTTPException(status_code=403, detail="Access denied for this task")


def _parse_dt(s: Optional[str]) -> Optional[datetime.datetime]:
    if s is None or not str(s).strip():
        return None
    t = str(s).strip().replace("Z", "+00:00")
    try:
        return datetime.datetime.fromisoformat(t)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid datetime: {s!r} (use ISO-8601)")


def _dt_out(v: Optional[datetime.datetime]) -> Optional[str]:
    if v is None:
        return None
    if v.tzinfo is not None:
        v = v.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return v.isoformat() + "Z"


def _task_to_dict(db: Session, task: Task) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for col in Task.__table__.columns:
        v = getattr(task, col.name, None)
        if isinstance(v, datetime.datetime):
            out[col.name] = _dt_out(v)
        else:
            out[col.name] = v
    rows = (
        db.query(TaskAssignee, User.email)
        .join(User, User.id == TaskAssignee.user_id)
        .filter(TaskAssignee.task_id == task.id)
        .all()
    )
    out["assignees"] = [
        {"user_id": a.user_id, "email": email, "assignee_role": a.assignee_role, "assigned_at": _dt_out(a.assigned_at)}
        for a, email in rows
    ]
    return out


def _validate_manager_assignees(db: Session, user: User, assignee_ids: List[int]) -> None:
    if normalized_role(user) != "manager":
        return
    pids = allowed_project_ids(user, db)
    if pids is None or len(pids) == 0:
        return
    for uid in assignee_ids:
        if uid == user.id:
            continue
        ok = (
            db.query(UserProjectAssignment)
            .filter(
                UserProjectAssignment.user_id == uid,
                UserProjectAssignment.project_id.in_(pids),
            )
            .first()
        )
        if not ok:
            raise HTTPException(
                status_code=400,
                detail=f"User {uid} is not on a shared project — managers cannot assign them",
            )


def _replace_assignees(db: Session, task: Task, user_ids: List[int]) -> None:
    task.assignments.clear()
    seen: set[int] = set()
    for uid in user_ids:
        if uid in seen:
            continue
        seen.add(uid)
        u = db.query(User).filter(User.id == uid, User.is_active.is_(True)).first()
        if not u:
            raise HTTPException(status_code=400, detail=f"Invalid or inactive user id: {uid}")
        task.assignments.append(TaskAssignee(user_id=uid, assignee_role="assignee"))


def _sync_completion(task: Task, new_status: str, actor_id: int) -> None:
    if new_status == "done":
        if task.completed_at is None:
            task.completed_at = datetime.datetime.utcnow()
        task.completed_by_user_id = actor_id
    elif task.status == "done" and new_status != "done":
        task.completed_at = None
        task.completed_by_user_id = None


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    description: Optional[str] = None
    status: str = "open"
    priority: Optional[str] = None
    task_category: Optional[str] = None
    task_subtype: Optional[str] = None
    linked_resource_type: Optional[str] = None
    linked_resource_id: Optional[str] = None
    project_id: Optional[int] = None
    due_at: Optional[str] = None
    assignee_user_ids: List[int] = Field(default_factory=list)
    meta_json: Optional[dict[str, Any]] = None


class TaskPatch(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=512)
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    task_category: Optional[str] = None
    task_subtype: Optional[str] = None
    linked_resource_type: Optional[str] = None
    linked_resource_id: Optional[str] = None
    project_id: Optional[int] = None
    due_at: Optional[str] = None
    assignee_user_ids: Optional[List[int]] = None
    meta_json: Optional[dict[str, Any]] = None


@router.get("/meta/assignable-users")
def list_assignable_users(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Users the current operator may assign tasks to (scoped for managers)."""
    role = normalized_role(user)
    q = db.query(User).filter(User.is_active.is_(True)).order_by(User.email)
    if role == "admin":
        rows = q.all()
    else:
        pids = allowed_project_ids(user, db)
        if pids is None:
            rows = q.all()
        elif len(pids) == 0:
            rows = db.query(User).filter(User.id == user.id).all()
        else:
            uids = (
                db.query(UserProjectAssignment.user_id)
                .filter(UserProjectAssignment.project_id.in_(pids))
                .distinct()
                .all()
            )
            id_set = {r[0] for r in uids}
            id_set.add(user.id)
            rows = q.filter(User.id.in_(id_set)).all()
    return [{"id": u.id, "email": u.email, "role": u.role} for u in rows]


@router.get("")
def list_tasks(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    status: Optional[str] = Query(None),
    project_id: Optional[int] = Query(None),
    mine: bool = Query(False),
    overdue: bool = Query(False),
):
    q = db.query(Task)
    q = _apply_task_scope(q, user, db)
    if status:
        q = q.filter(Task.status == status.strip().lower())
    if project_id is not None:
        q = q.filter(Task.project_id == project_id)
    if mine:
        sub = exists().where(TaskAssignee.task_id == Task.id, TaskAssignee.user_id == user.id)
        q = q.filter(or_(Task.created_by_user_id == user.id, sub))
    if overdue:
        now = datetime.datetime.utcnow()
        q = q.filter(
            Task.due_at.isnot(None),
            Task.due_at < now,
            Task.status.notin_(["done", "cancelled"]),
        )
    rows = q.order_by(Task.id.desc()).limit(2000).all()
    rows.sort(key=lambda t: (t.due_at is None, t.due_at or datetime.datetime.max, -t.id))
    return [_task_to_dict(db, t) for t in rows]


@router.get("/{task_id}")
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _assert_task_access(db, user, task)
    return _task_to_dict(db, task)


@router.post("")
def create_task(
    body: TaskCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    st = (body.status or "open").strip().lower()
    if st not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {st}")
    if body.project_id is not None:
        assert_project_access(user, db, body.project_id)
    task = Task(
        title=body.title.strip(),
        description=(body.description or "").strip() or None,
        status=st,
        priority=(body.priority or "").strip() or None,
        task_category=(body.task_category or "").strip() or None,
        task_subtype=(body.task_subtype or "").strip() or None,
        linked_resource_type=(body.linked_resource_type or "").strip() or None,
        linked_resource_id=(body.linked_resource_id or "").strip() or None,
        project_id=body.project_id,
        due_at=_parse_dt(body.due_at),
        created_by_user_id=user.id,
        updated_by_user_id=user.id,
        meta_json=body.meta_json,
    )
    if st == "done":
        task.completed_at = datetime.datetime.utcnow()
        task.completed_by_user_id = user.id
    db.add(task)
    db.flush()
    _validate_manager_assignees(db, user, body.assignee_user_ids)
    _replace_assignees(db, task, body.assignee_user_ids)
    db.commit()
    db.refresh(task)
    log_activity(
        db,
        user=user,
        action="create",
        resource_type="task",
        summary=f"Task: {task.title[:200]}",
        project_id=task.project_id,
        resource_id=str(task.id),
    )
    return _task_to_dict(db, task)


@router.patch("/{task_id}")
def patch_task(
    task_id: int,
    body: TaskPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _assert_task_access(db, user, task)
    try:
        data = body.model_dump(exclude_unset=True)
    except AttributeError:
        data = body.dict(exclude_unset=True)
    assignee_ids = data.pop("assignee_user_ids", None)

    if "project_id" in data and data["project_id"] is not None:
        assert_project_access(user, db, int(data["project_id"]))

    if "due_at" in data:
        task.due_at = _parse_dt(data.pop("due_at"))

    if "status" in data and data["status"] is not None:
        st = str(data["status"]).strip().lower()
        if st not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {st}")
        _sync_completion(task, st, user.id)
        task.status = st
        data.pop("status", None)

    for k in ("title", "description", "priority", "task_category", "task_subtype", "linked_resource_type", "linked_resource_id"):
        if k in data:
            v = data.pop(k)
            setattr(task, k, (v.strip() if isinstance(v, str) else v) or None)

    if "project_id" in data:
        task.project_id = data.pop("project_id")
    if "meta_json" in data:
        task.meta_json = data.pop("meta_json")

    task.updated_by_user_id = user.id

    if assignee_ids is not None:
        _validate_manager_assignees(db, user, assignee_ids)
        _replace_assignees(db, task, assignee_ids)

    db.commit()
    db.refresh(task)
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="task",
        summary=f"Task updated (TSK-{task_id})",
        project_id=task.project_id,
        resource_id=str(task_id),
    )
    return _task_to_dict(db, task)


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _assert_task_access(db, user, task)
    if normalized_role(user) not in ("admin", "executive") and task.created_by_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only creator or admin/executive may delete")
    title = task.title
    pid = task.project_id
    db.delete(task)
    db.commit()
    log_activity(
        db,
        user=user,
        action="delete",
        resource_type="task",
        summary=f"Task deleted: {title[:200]}",
        project_id=pid,
        resource_id=str(task_id),
    )
    return {"status": "ok", "id": task_id}
