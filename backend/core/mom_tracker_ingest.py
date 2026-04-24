"""
Ingest *MoM Tracker* Excel (sheet `MoM`) into `platform_meetings` + `meeting_action_items`.

- Resolves **Organizer** and **Created By** emails to `users.id` (case-insensitive); unmatched
  use **fallback_user_id** (default: first `platform_admin` / `admin` / then any active user).
- Resolves **Project / Account** to `project_id` via `resolve_project_for_sla` + `ensure_project_client`.
- Provenance in `attachments_json`: `mom_import`, `source_excel_meeting_id`, `source_filename`, `tagged_user_ids`.
- Upserts on re-import: same `source_filename` + Excel **Meeting ID** in `attachments_json`.
"""
from __future__ import annotations

import datetime
import os
import re
from typing import Any, Optional

import pandas as pd
from sqlalchemy.orm import Session

from backend.core.sla_project_resolve import resolve_project_for_sla
from backend.db.database import (
    Meeting,
    MeetingActionItem,
    User,
    ensure_project_client,
)


def _norm_email(s: object) -> str:
    t = str(s or "").strip()
    if not t or t in ("-", "—", "nan", "None"):
        return ""
    return t.lower()


def _load_users_by_email(db: Session) -> dict[str, int]:
    out: dict[str, int] = {}
    for u in db.query(User).filter(User.is_active == True).all():  # noqa: E712
        e = (u.email or "").strip().lower()
        if e:
            out[e] = u.id
    return out


def pick_fallback_user_id(db: Session) -> int | None:
    for role in ("platform_admin", "admin", "executive", "operations"):
        u = (
            db.query(User)
            .filter(User.role == role, User.is_active == True)  # noqa: E712
            .order_by(User.id)
            .first()
        )
        if u:
            return u.id
    u2 = (
        db.query(User).filter(User.is_active == True).order_by(User.id).first()  # noqa: E712
    )
    return u2.id if u2 else None


def _coerce_time(v: object) -> str | None:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, datetime.time):
        return f"{v.hour:02d}:{v.minute:02d}"
    if isinstance(v, datetime.datetime):
        return f"{v.hour:02d}:{v.minute:02d}"
    s = str(v).strip()
    if not s or s == "nan":
        return None
    return s[:8] if len(s) >= 5 else s


def _sql_safe_date(d: object) -> datetime.date | None:
    """Pandas `Timestamp('NaT').date()` is `NaTType` and must not be written to the DB as *date*."""
    if d is None:
        return None
    try:
        if pd.isna(d):
            return None
    except (TypeError, ValueError):
        return None
    if not isinstance(d, datetime.date) or isinstance(d, datetime.datetime):
        return None
    if type(d).__name__ == "NaTType":
        return None
    return d


def _coerce_date(v: object) -> datetime.date | None:
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, float) and pd.isna(v):
        return None
    if isinstance(v, datetime.datetime):
        return _sql_safe_date(v.date())
    if isinstance(v, datetime.date) and not isinstance(v, datetime.datetime):
        return _sql_safe_date(v)
    ts = pd.to_datetime(v, errors="coerce")
    if pd.isna(ts):
        return None
    return _sql_safe_date(ts.to_pydatetime().date())


def _cell(row: pd.Series, *names: str) -> object:
    for n in names:
        if n in row.index:
            v = row.get(n)
            if v is not None and not (isinstance(v, float) and pd.isna(v)):
                return v
    return None


def _text_or_none(v: object) -> str | None:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    if not s or s.lower() in ("nan", "none", "-", "—"):
        return None
    return s


def _split_emails(text: object) -> list[str]:
    if text is None or (isinstance(text, float) and pd.isna(text)):
        return []
    s = str(text).strip()
    if not s or s in ("-", "—", "nan", "None"):
        return []
    parts = re.split(r"[\n,;]+", s)
    return [p.strip() for p in parts if p.strip() and p.strip().lower() not in ("nan", "none", "-", "—")]


def _find_imported_meeting(
    db: Session, source_basename: str, excel_id: int
) -> Optional[Meeting]:
    rows = (
        db.query(Meeting)
        .filter(Meeting.attachments_json.isnot(None))  # type: ignore
        .order_by(Meeting.id.desc())
        .limit(5000)
        .all()
    )
    for m in rows:
        at = m.attachments_json
        if not isinstance(at, list):
            continue
        for a in at:
            if not isinstance(a, dict):
                continue
            if not a.get("mom_import"):
                continue
            if a.get("source_excel_meeting_id") == excel_id and a.get("source_filename") == source_basename:
                return m
    return None


def _build_attachments_meta(
    source_basename: str,
    excel_id: int,
    tagged: list[int],
) -> list[dict[str, Any]]:
    tagged_unique = sorted({i for i in tagged if i})
    return [
        {
            "mom_import": True,
            "source_excel_meeting_id": excel_id,
            "source_filename": source_basename,
            "tagged_user_ids": tagged_unique,
        }
    ]


def ingest_mom_workbook(
    path: str,
    db: Session,
    *,
    dry_run: bool = False,
    fallback_user_id: int | None = None,
) -> dict[str, Any]:
    path = os.path.abspath(path)
    source_basename = os.path.basename(path)
    if not os.path.isfile(path):
        return {"error": f"file not found: {path}"}

    try:
        df = pd.read_excel(path, sheet_name="MoM", header=0)
    except ValueError as e:
        return {"error": f"MoM sheet: {e}"}
    if df is None or df.empty:
        return {"error": "MoM sheet empty"}

    if fallback_user_id is None:
        fallback_user_id = pick_fallback_user_id(db)
    if not fallback_user_id:
        return {"error": "No active users in database for fallback tagging"}

    by_email = _load_users_by_email(db)

    def uid_for(email: object) -> int:
        e = _norm_email(email)
        if e and e in by_email:
            return by_email[e]
        return int(fallback_user_id)

    created = 0
    updated = 0
    skipped = 0
    issues: list[str] = []
    actions_written = 0
    project_misses: list[str] = []

    for _idx, row in df.iterrows():
        mid_raw = row.get("Meeting ID")
        if mid_raw is None or (isinstance(mid_raw, float) and pd.isna(mid_raw)):
            skipped += 1
            continue
        try:
            excel_id = int(float(mid_raw))
        except (TypeError, ValueError):
            skipped += 1
            continue
        if excel_id < 1:
            skipped += 1
            continue

        title = _cell(row, "Meeting Title")
        mtype = _cell(row, "Meeting Type")
        org_raw = _cell(row, "Organizer")
        created_by_raw = _cell(row, "Created By")
        proj_lbl = _cell(row, "Project / Account")

        org_uid = uid_for(org_raw)
        if _norm_email(org_raw) and _norm_email(org_raw) in by_email:
            org_uid = by_email[_norm_email(org_raw)]
        cb_uid = (
            by_email[_norm_email(created_by_raw)]
            if _norm_email(created_by_raw) and _norm_email(created_by_raw) in by_email
            else (uid_for(created_by_raw) if _norm_email(created_by_raw) else org_uid)
        )

        u_org = None if dry_run else db.query(User).filter(User.id == org_uid).first()
        org_name = (u_org.email or "").strip() if u_org and u_org.email else _text_or_none(org_raw)

        tagged: list[int] = [org_uid, cb_uid]
        for em in _split_emails(_cell(row, "Attendees (Internal)")):
            e = _norm_email(em)
            if e in by_email:
                tagged.append(by_email[e])

        proj_id: int | None = None
        acc_snap: str | None = None
        if proj_lbl is not None and not (isinstance(proj_lbl, float) and pd.isna(proj_lbl)):
            acc_snap = " ".join(str(proj_lbl).strip().split()) or None
        if acc_snap:
            p, _reason = resolve_project_for_sla(db, acc_snap)
            if p:
                if p.client_id is None:
                    ensure_project_client(db, p)
                proj_id = p.id
            else:
                project_misses.append(acc_snap)

        meeting_date = _coerce_date(_cell(row, "Date"))
        follow_up = _coerce_date(
            _cell(row, "Follow-Up Date", "Follow-up Date")
        )
        st = _coerce_time(_cell(row, "Start Time"))
        et = _coerce_time(_cell(row, "End Time"))
        attendees_internal = _text_or_none(_cell(row, "Attendees (Internal)"))

        ext = _cell(row, "Attendees (External)")
        attendees_ext = _text_or_none(ext)

        discussion = _text_or_none(_cell(row, "Discussion Summary"))
        agenda = _text_or_none(_cell(row, "Agenda Items"))
        decisions = _text_or_none(_cell(row, "Decisions Taken"))
        act_desc = _cell(
            row,
            "Action Item 1 – Description",
            "Action Item 1 - Description",
        )
        act_desc_s = _text_or_none(act_desc) if act_desc is not None else None
        act_owner = _cell(
            row,
            "Action Item 1 – Owner",
            "Action Item 1 - Owner",
        )
        act_due = _coerce_date(
            _cell(
                row,
                "Action Item 1 – Deadline",
                "Action Item 1 - Deadline",
            )
        )
        act_st = _cell(
            row,
            "Action Item 1 – Status",
            "Action Item 1 - Status",
        )
        act_st_s = _text_or_none(act_st) if act_st is not None else None
        mom_s = _cell(row, "MoM Status", "MOM Status")
        mom_s_s = _text_or_none(mom_s) if mom_s is not None else None

        remark = f"MoM import: Excel ID {excel_id} | {source_basename}"
        if dry_run:
            created += 1
            if act_desc_s:
                actions_written += 1
            continue

        existing = _find_imported_meeting(db, source_basename, excel_id)
        att = _build_attachments_meta(
            source_basename,
            excel_id,
            tagged,
        )

        if existing:
            m = existing
            for ai in list(m.action_items or []):
                db.delete(ai)
            updated += 1
        else:
            cb_u = db.query(User).filter(User.id == cb_uid).first()
            m = Meeting(
                created_by_user_id=cb_uid,
                created_by_email=(cb_u.email if cb_u else None),
            )
            db.add(m)
            created += 1
        db.flush()

        m.meeting_title = _text_or_none(title) or f"MoM {excel_id}"
        m.meeting_type = _text_or_none(mtype)
        m.meeting_date = meeting_date
        m.start_time = st
        m.end_time = et
        m.organizer_user_id = org_uid
        m.organizer_name = org_name
        m.attendees_internal = attendees_internal
        m.attendees_external = attendees_ext
        m.project_id = proj_id
        m.account_name_snapshot = acc_snap
        m.agenda_items = agenda
        m.discussion_summary = discussion
        m.decisions_taken = decisions
        m.key_discussion_points = None
        m.follow_up_date = follow_up
        m.next_meeting_date = None
        m.mom_status = mom_s_s
        m.mom_link_remarks = remark
        m.attachments_json = att
        m.meeting_status = m.meeting_status or "Scheduled"
        m.meeting_mode = m.meeting_mode

        if act_desc_s:
            own_s = _text_or_none(act_owner) if act_owner is not None else None
            db.add(
                MeetingActionItem(
                    meeting_id=m.id,
                    description=act_desc_s,
                    owner=own_s,
                    due_date=act_due,
                    status=act_st_s,
                    sort_order=0,
                )
            )
            actions_written += 1

        db.flush()

    if not dry_run:
        db.commit()

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "action_items": actions_written,
        "source_file": source_basename,
        "dry_run": dry_run,
        "fallback_user_id": fallback_user_id,
        "unmatched_project_accounts": sorted(set(project_misses)),
        "issues": issues,
    }
