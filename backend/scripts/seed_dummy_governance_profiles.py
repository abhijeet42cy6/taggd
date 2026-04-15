"""
Seed demo users for weekly revenue pack governance:

  - proj@taggd.in  — project_head, revenue_forecast (+ common nav verticals), assigned to first projects
  - fin@taggd.in   — executive (finance-style org access) so queue + approvals work without ops vertical juggling

Run from repo root:

  python3 -m backend.scripts.seed_dummy_governance_profiles
  python3 -m backend.scripts.seed_dummy_governance_profiles --reset-password

Env:
  TAGGD_DUMMY_PASSWORD — password for both accounts (default: ChangeMe!Taggd1)
"""
from __future__ import annotations

import argparse
import datetime
import os
import sys

from sqlalchemy.orm import Session

from backend.auth.security import hash_password
from backend.db.database import Project, SessionLocal, User, UserProjectAssignment

PROJ_EMAIL = "proj@taggd.in"
FIN_EMAIL = "fin@taggd.in"
DEFAULT_PASSWORD = "ChangeMe!Taggd1"

# Verticals project head needs for Revenue trackers + related nav (operations-style list, narrowed for PH)
PROJ_VERTICALS = [
    "revenue_forecast",
    "revenue_billing",
    "clients",
    "portfolio",
    "finance",
    "meetings",
    "transitions",
    "ingestion",
    "tasks",
    "activity",
]

# Stored on fin user for /auth/me clarity; executive bypasses vertical checks anyway
FIN_VERTICALS = [
    "revenue_forecast",
    "revenue_kpi_governance",
    "finance",
    "finance_validation",
    "revenue_billing",
    "clients",
    "portfolio",
    "data_operations",
    "ingestion",
    "activity",
]


def _upsert_user(
    db: Session,
    *,
    email: str,
    password_plain: str,
    role: str,
    verticals: list[str],
    given: str | None,
    family: str | None,
    reset_password: bool,
) -> tuple[User, str]:
    """Returns (user, action) where action is 'created' or 'updated'."""
    email_l = email.strip().lower()
    u = db.query(User).filter(User.email == email_l).first()
    if u is None:
        u = User(
            email=email_l,
            password_hash=hash_password(password_plain),
            role=role,
            is_active=True,
            vertical_access_json=list(verticals),
            given_name=given,
            family_name=family,
        )
        db.add(u)
        db.flush()
        return u, "created"
    u.role = role
    u.is_active = True
    u.vertical_access_json = list(verticals)
    u.given_name = given
    u.family_name = family
    if reset_password:
        u.password_hash = hash_password(password_plain)
    return u, "updated"


def _sync_project_assignments(db: Session, user_id: int, project_ids: list[int]) -> int:
    """Replace assignments for this user with the given project ids (deduped, in order)."""
    db.query(UserProjectAssignment).filter(UserProjectAssignment.user_id == user_id).delete(
        synchronize_session=False
    )
    n = 0
    seen: set[int] = set()
    for pid in project_ids:
        if pid in seen:
            continue
        seen.add(pid)
        db.add(UserProjectAssignment(user_id=user_id, project_id=pid))
        n += 1
    return n


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed proj@taggd.in and fin@taggd.in demo users.")
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Set password to TAGGD_DUMMY_PASSWORD even if the user already exists.",
    )
    args = parser.parse_args()

    pwd = (os.getenv("TAGGD_DUMMY_PASSWORD") or DEFAULT_PASSWORD).strip()
    if len(pwd) < 8:
        print("TAGGD_DUMMY_PASSWORD must be at least 8 characters.", file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        projects = db.query(Project).order_by(Project.id.asc()).limit(12).all()
        pids = [p.id for p in projects]
        if not pids:
            print("No projects in database — create a project first, then re-run this script.", file=sys.stderr)
            return 1

        proj_user, proj_action = _upsert_user(
            db,
            email=PROJ_EMAIL,
            password_plain=pwd,
            role="project_head",
            verticals=PROJ_VERTICALS,
            given="Project",
            family="Head Demo",
            reset_password=args.reset_password,
        )

        fin_user, fin_action = _upsert_user(
            db,
            email=FIN_EMAIL,
            password_plain=pwd,
            role="executive",
            verticals=FIN_VERTICALS,
            given="Finance",
            family="Head Demo",
            reset_password=args.reset_password,
        )

        db.flush()

        assign_n = _sync_project_assignments(db, proj_user.id, pids[: min(5, len(pids))])

        db.commit()

        print("--- seed_dummy_governance_profiles ---")
        print(f"Password (from env or default): use TAGGD_DUMMY_PASSWORD or '{DEFAULT_PASSWORD}'")
        print()
        print(f"{PROJ_EMAIL}  [{proj_action}]  role=project_head  assignments={assign_n} projects")
        print(f"  vertical_access: {PROJ_VERTICALS[:4]} ...")
        print()
        print(f"{FIN_EMAIL}  [{fin_action}]  role=executive  (org-wide project scope when no assignments)")
        print(f"  vertical_access includes revenue_kpi_governance for UI labels")
        print()
        print("Login at /login with the password above (use --reset-password to rotate).")
        print()
        print("For Finance validation queue + approval demo rows, also run:")
        print("  python3 -m backend.scripts.seed_billing_dummy")
        print("  (Creates taggd_revenue_billing + finance_billing_workflow per project.)")
        return 0
    except Exception as e:
        db.rollback()
        print(f"Error: {e}", file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
