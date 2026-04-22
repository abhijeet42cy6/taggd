"""
Resolve SLA Base File \"Project\" labels to existing Project rows (case/typo/SBU aware).
"""
from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from typing import Optional

from sqlalchemy.orm import Session

from backend.db.database import Client, Project


def _norm_key(s: str) -> str:
    return re.sub(r"\s+", " ", str(s).strip().lower())


def _fold_for_match(s: str) -> str:
    """Lowercase, collapse space, strip accents for loose comparison."""
    s = _norm_key(unicodedata.normalize("NFKD", str(s or "")))
    return "".join(ch for ch in s if not unicodedata.combining(ch))


def _directory_group_matches_sheet(sheet_group: str, project_account: str) -> bool:
    """Sheet label is client/group; DB row is same name or SBU under it (same rules as account mapping)."""
    gn = _norm_key(sheet_group)
    pn = _norm_key(project_account or "")
    if not gn or not pn:
        return False
    if pn == gn:
        return True
    if pn.startswith(gn + " -") or pn.startswith(gn + " –"):
        return True
    if pn.startswith(gn + " ") and len(pn) > len(gn):
        return True
    return False


def _directory_group_matches_reverse(db_account: str, sheet_label: str) -> bool:
    """DB account acts as group name; sheet row is an SBU-style label under it."""
    return _directory_group_matches_sheet(db_account, sheet_label)


def _pick_best_project(candidates: list[Project]) -> Project:
    if len(candidates) == 1:
        return candidates[0]

    def rank(p: Project) -> tuple:
        has_cc = 1 if (p.charge_code or "").strip() else 0
        fn = (p.filename or "").lower()
        sla_hint = 1 if any(x in fn for x in ("sla", "basefile", "raw data")) else 0
        # Prefer SBU / leaf rows (more specific for SLA) when names collide
        child = 1 if p.parent_project_id else 0
        return (has_cc, sla_hint, child, -len(p.account_name or ""), -p.id)

    return max(candidates, key=rank)


def _fuzzy_match_project(key: str, projects: list[Project], *, min_ratio: float = 0.88) -> Optional[Project]:
    key_f = _fold_for_match(key)
    if len(key_f) < 3:
        return None
    best: list[Project] = []
    best_r = 0.0
    for p in projects:
        for attr in (p.account_name, p.engagement_name):
            if not attr:
                continue
            cand = _fold_for_match(attr)
            if not cand:
                continue
            r = SequenceMatcher(None, key_f, cand).ratio()
            if r < min_ratio:
                continue
            if r > best_r + 0.005:
                best_r = r
                best = [p]
            elif abs(r - best_r) <= 0.02:
                best.append(p)
    if not best:
        return None
    uniq = {p.id: p for p in best}
    return _pick_best_project(list(uniq.values()))


def resolve_project_for_sla(db: Session, sheet_label: str) -> tuple[Optional[Project], str]:
    """
    Map a Base File \"Project\" cell to a Project.

    Returns (project_or_none, reason) where reason is one of:
    account_norm, engagement_norm, sbu_sheet_to_db, sbu_db_to_sheet,
    client_singleton, fuzzy, none
    """
    raw = (sheet_label or "").strip()
    if not raw or raw.lower() in ("nan", "none", "-", "project", "metrics"):
        return None, "none"
    key = _norm_key(raw)
    if not key:
        return None, "none"

    projects: list[Project] = db.query(Project).order_by(Project.id).all()
    clients: list[Client] = db.query(Client).order_by(Client.id).all()

    # 1) Normalized account_name
    acc_hits = [p for p in projects if _norm_key(p.account_name or "") == key]
    if acc_hits:
        return _pick_best_project(acc_hits), "account_norm"

    # 2) Normalized engagement_name
    eng_hits = [p for p in projects if _norm_key(p.engagement_name or "") == key]
    if eng_hits:
        return _pick_best_project(eng_hits), "engagement_norm"

    # 3) Sheet group name → DB SBU (e.g. sheet \"Siemens\" → \"Siemens - GBS\")
    sbu_a = [p for p in projects if _directory_group_matches_sheet(raw, p.account_name or "")]
    if sbu_a:
        return _pick_best_project(sbu_a), "sbu_sheet_to_db"

    # 4) DB shorter group → sheet SBU label (e.g. DB \"Pfizer\" vs sheet \"Pfizer (FS)\" — rare)
    sbu_b = [p for p in projects if _directory_group_matches_reverse(p.account_name or "", raw)]
    if sbu_b:
        return _pick_best_project(sbu_b), "sbu_db_to_sheet"

    # 5) Client official name → project(s) under that client
    client_hits = [c for c in clients if _norm_key(c.official_name or "") == key]
    if len(client_hits) == 1:
        cid = client_hits[0].id
        under = [p for p in projects if p.client_id == cid]
        if len(under) == 1:
            return under[0], "client_singleton"
        if len(under) > 1:
            fz2 = _fuzzy_match_project(raw, under, min_ratio=0.82)
            if fz2:
                return fz2, "client_child_fuzzy"

    # 6) Folded fuzzy on account / engagement
    fz = _fuzzy_match_project(raw, projects, min_ratio=0.86)
    if fz:
        return fz, "fuzzy"

    return None, "none"
