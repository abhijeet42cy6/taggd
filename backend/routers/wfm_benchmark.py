"""Manual create/update WFM HR benchmark snapshots (platform UI)."""
from __future__ import annotations

import datetime
import re

from fastapi import APIRouter, Depends, HTTPException
from backend.auth.verticals import require_vertical
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.auth.scope import assert_project_access
from backend.core.activity_log import log_activity
from backend.db.database import User, WFMHRBenchmark, get_db

router = APIRouter(
    prefix="/wfm",
    tags=["wfm"],
    dependencies=[Depends(require_vertical("wfm"))],
)


class WfmBenchmarkUpsertBody(BaseModel):
    project_id: int = Field(..., ge=1)
    reporting_month: str = Field(..., min_length=5, max_length=40)
    lateral_revenue_target: float = 0.0
    lateral_hc_target: float = 0.0
    lateral_productivity_target: float = 0.0
    ideal_hc: float = 0.0
    actual_hc_total: int = 0
    wl1_hires: int = 0
    wl2_hires: int = 0
    wl3_hires: int = 0
    wl4_hires: int = 0


def _parse_month_first_day(s: str) -> datetime.datetime:
    s = s.strip()
    m = re.match(r"^(\d{4})-(\d{2})", s)
    if not m:
        raise HTTPException(status_code=400, detail="reporting_month must be YYYY-MM (e.g. 2025-04)")
    y, mo = int(m.group(1)), int(m.group(2))
    if mo < 1 or mo > 12:
        raise HTTPException(status_code=400, detail="Invalid month in reporting_month")
    return datetime.datetime(y, mo, 1)


@router.post("/benchmark-upsert")
async def wfm_benchmark_upsert(
    body: WfmBenchmarkUpsertBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Upsert one WFM HR benchmark row for (project_id, reporting month).
    Matches ingest compound key: project_id + reporting_date (first day of month).
    """
    assert_project_access(user, db, body.project_id)
    reporting_date = _parse_month_first_day(body.reporting_month)

    row = (
        db.query(WFMHRBenchmark)
        .filter(
            WFMHRBenchmark.project_id == body.project_id,
            WFMHRBenchmark.reporting_date == reporting_date,
        )
        .first()
    )
    if row:
        row.lateral_revenue_target = body.lateral_revenue_target
        row.lateral_hc_target = body.lateral_hc_target
        row.lateral_productivity_target = body.lateral_productivity_target
        row.ideal_hc = body.ideal_hc
        row.actual_hc_total = body.actual_hc_total
        row.wl1_hires = body.wl1_hires
        row.wl2_hires = body.wl2_hires
        row.wl3_hires = body.wl3_hires
        row.wl4_hires = body.wl4_hires
        row.uploaded_by = "platform"
    else:
        db.add(
            WFMHRBenchmark(
                project_id=body.project_id,
                reporting_date=reporting_date,
                lateral_revenue_target=body.lateral_revenue_target,
                lateral_hc_target=body.lateral_hc_target,
                lateral_productivity_target=body.lateral_productivity_target,
                ideal_hc=body.ideal_hc,
                actual_hc_total=body.actual_hc_total,
                wl1_hires=body.wl1_hires,
                wl2_hires=body.wl2_hires,
                wl3_hires=body.wl3_hires,
                wl4_hires=body.wl4_hires,
                uploaded_by="platform",
            )
        )

    db.commit()
    log_activity(
        db,
        user=user,
        action="update",
        resource_type="wfm_benchmark",
        summary=f"WFM benchmark upsert — {body.reporting_month} (PRJ-{body.project_id})",
        project_id=body.project_id,
        resource_id=f"{body.project_id}:{body.reporting_month}",
    )
    return {
        "status": "ok",
        "project_id": body.project_id,
        "reporting_date": reporting_date.isoformat(),
    }
