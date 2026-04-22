"""
Map SLA Base File \"Project\" labels to canonical Project rows (handles casing,
spacing, SBU vs client-group lines, and light fuzzy typos). Used by ingest_sla.
"""
from __future__ import annotations

from dataclasses import dataclass
from difflib import get_close_matches
from typing import Optional, Sequence

from sqlalchemy.orm import Session

from backend.db.database import MetricDefinition, Project
from backend.scripts.ingest_project_master import _norm_key, directory_group_matches_project_account


@dataclass
class SLAResolution:
    project: Optional[Project]
    """How the row was matched; useful for audits."""
    method: str


def _pick_among_duplicates(db: Session, candidates: list[Project]) -> Project:
    """Prefer charge-code project, then one that already holds SLA metrics, else lowest id."""
    if len(candidates) == 1:
        return candidates[0]
    with_cc = [p for p in candidates if (p.charge_code or "").strip()]
    if len(with_cc) == 1:
        return with_cc[0]

    def metric_count(pid: int) -> int:
        return db.query(MetricDefinition).filter(MetricDefinition.project_id == pid).count()

    pool = with_cc if with_cc else candidates
    return max(pool, key=lambda p: (metric_count(p.id), -(p.id or 0)))


def resolve_sla_sheet_project(
    db: Session,
    sheet_label: str,
    projects: Sequence[Project],
) -> SLAResolution:
    """
    Resolve a Base File \"Project\" cell to an existing Project when possible.

    Order: exact account_name → normalized account_name → normalized engagement_name
    → sheet label is a single client group matching exactly one SBU account
    → DB account is a single prefix-group of an SBU-style sheet label
    → fuzzy normalized account_name (typos)
    """
    raw = (sheet_label or "").strip()
    if not raw or raw.lower() in ("nan", "none", "-", "project", "metrics", "sr."):
        return SLAResolution(None, "none")

    plist = list(projects)
    sn = _norm_key(raw)

    # 1–2: exact / normalized account_name
    by_exact = [p for p in plist if p.account_name and p.account_name.strip() == raw]
    if by_exact:
        return SLAResolution(_pick_among_duplicates(db, by_exact), "exact_account_name")

    by_norm = [p for p in plist if p.account_name and _norm_key(p.account_name) == sn]
    if by_norm:
        return SLAResolution(_pick_among_duplicates(db, by_norm), "normalized_account_name")

    # 3: engagement_name (directory SBU tag)
    by_eng = [p for p in plist if p.engagement_name and _norm_key(p.engagement_name) == sn]
    if by_eng:
        return SLAResolution(_pick_among_duplicates(db, by_eng), "engagement_name")

    # 4: Sheet is client-style group; exactly one SBU in DB sits under it
    group_hits = [p for p in plist if p.account_name and directory_group_matches_project_account(raw, p.account_name)]
    if len(group_hits) == 1:
        return SLAResolution(group_hits[0], "sheet_group_unique_sbu")

    # 5: DB row is a shorter group / prefix; sheet is the SBU line — use when unambiguous (incl. no SBU row in DB)
    parent_hits = [
        p for p in plist if p.account_name and directory_group_matches_project_account(p.account_name, raw)
    ]
    if len(parent_hits) == 1:
        return SLAResolution(parent_hits[0], "sheet_sbu_unique_parent")

    # 6: Fuzzy on normalized account names (typos)
    norm_to_projects: dict[str, list[Project]] = {}
    for p in plist:
        if not p.account_name:
            continue
        k = _norm_key(p.account_name)
        norm_to_projects.setdefault(k, []).append(p)

    keys = list(norm_to_projects.keys())
    if keys:
        close = get_close_matches(sn, keys, n=1, cutoff=0.86)
        if close:
            cands = norm_to_projects[close[0]]
            return SLAResolution(_pick_among_duplicates(db, cands), "fuzzy_account_name")

    return SLAResolution(None, "unresolved")


def load_project_resolver_cache(db: Session) -> list[Project]:
    """All projects with an account label (small DB — single query)."""
    return db.query(Project).filter(Project.account_name.isnot(None)).order_by(Project.id).all()
