"""
Requisition status column detection, unique-value inventory, and Excel→system status mapping.

Applied at ingest time only; does not alter revenue logic execution or `revenue_results` content.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import pandas as pd

from .tracker_sheet_io import read_tracker_sheet_dataframe

logger = logging.getLogger(__name__)

BLANK_KEY = "__blank__"
UNKNOWN_KEY = "__unknown__"

GLOBAL_STATUS_VALUES = ("ACTIVE", "CLOSED", "PIPELINE", "ON HOLD", "CANCELLED", "UNPROCESSED")

# Recruitment vocabulary used to score columns and rule-map values.
_PIPELINE_TERMS = (
    "sourc", "screen", "cv ", "cv_", "interview", "l1", "l2", "l3", "offer", "ytj",
    "yet to join", "pipeline", "progress", "submitted", "shortlist", "assessment",
    "documentation", "processed", "intake", "tbo", "wip",
)
_HOLD_TERMS = ("cancel", "hold", "void", "drop", "reject", "withdraw", "closed req", "inactive")
_CLOSED_TERMS = ("joined", "hired", "selected", "closure", "closed hire", "joinee")
_ACTIVE_TERMS = ("open", "new", "active", "live", "released", "posted")

MANDATE_HEADER_HINTS = (
    "job requisition", "req status", "req. status", "mandate", "requisition status",
    "req current", "position status", "count as open",
)
CANDIDATE_HEADER_HINTS = (
    "final status", "current status", "candidate", "offer status", "selection",
    "current stage", "stage",
)


def normalize_status_key(raw: Any) -> str:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return BLANK_KEY
    s = str(raw).strip()
    if not s or s.lower() in ("nan", "nat", "none", "n/a", "na", "-", "—"):
        return BLANK_KEY
    s = unicodedata.normalize("NFKD", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s or BLANK_KEY


def _header_score(header: str, sample_values: List[str]) -> float:
    h = (header or "").strip().lower()
    score = 0.0
    if "status" in h:
        score += 4.0
    if "stage" in h or "phase" in h:
        score += 2.5
    for hint in MANDATE_HEADER_HINTS:
        if hint in h:
            score += 3.0
    for hint in CANDIDATE_HEADER_HINTS:
        if hint in h:
            score += 3.5
    if h in ("status", "final status", "current status"):
        score += 5.0

    vocab = 0
    for v in sample_values[:200]:
        k = normalize_status_key(v)
        if k == BLANK_KEY:
            continue
        if any(t in k for t in _CLOSED_TERMS + _ACTIVE_TERMS + _PIPELINE_TERMS + _HOLD_TERMS):
            vocab += 1
    if sample_values:
        ratio = vocab / max(len(sample_values), 1)
        score += min(ratio * 8.0, 8.0)

    # Penalize ID-like columns
    uniq = {normalize_status_key(v) for v in sample_values if normalize_status_key(v) != BLANK_KEY}
    if len(uniq) > 80:
        score -= 6.0
    if len(uniq) <= 2 and all(str(v).isdigit() for v in sample_values[:20] if str(v).strip()):
        score -= 4.0
    return score


def detect_status_columns(headers: List[str], df: pd.DataFrame) -> Dict[str, Any]:
    """Pick mandate vs candidate status columns from headers and column data."""
    ranked: List[Tuple[float, str]] = []
    for h in headers:
        if h not in df.columns:
            continue
        col_vals = df[h].dropna().astype(str).tolist()[:500]
        if not col_vals and df[h].isna().all():
            col_vals = [""]
        ranked.append((_header_score(h, col_vals), h))
    ranked.sort(key=lambda x: (-x[0], x[1]))
    ranked = [(s, h) for s, h in ranked if s > 2.0]
    if not ranked:
        # Fallback: universal mapping may name a status header elsewhere
        return {
            "primary_column": None,
            "candidate_status_column": None,
            "mandate_status_column": None,
            "row_selection_rule": "primary_only",
        }

    primary = ranked[0][1]
    candidate_col: Optional[str] = None
    mandate_col: Optional[str] = None

    for _, h in ranked[:6]:
        hl = h.lower()
        if candidate_col is None and any(x in hl for x in CANDIDATE_HEADER_HINTS):
            candidate_col = h
        if mandate_col is None and any(x in hl for x in MANDATE_HEADER_HINTS):
            mandate_col = h

    if candidate_col is None and len(ranked) > 1:
        candidate_col = ranked[0][1]
    if mandate_col is None:
        mandate_col = ranked[1][1] if len(ranked) > 1 else primary
    if candidate_col == mandate_col:
        mandate_col = ranked[1][1] if len(ranked) > 1 else None

    return {
        "primary_column": primary,
        "candidate_status_column": candidate_col,
        "mandate_status_column": mandate_col,
        "row_selection_rule": "candidate_if_named_else_mandate",
    }


def build_value_inventory(series: pd.Series) -> Dict[str, Dict[str, Any]]:
    inv: Dict[str, Dict[str, Any]] = {}
    for raw in series:
        key = normalize_status_key(raw)
        if key not in inv:
            inv[key] = {"count": 0, "raw_examples": []}
        inv[key]["count"] += 1
        raw_s = "" if raw is None or (isinstance(raw, float) and pd.isna(raw)) else str(raw).strip()
        examples: List[str] = inv[key]["raw_examples"]
        if raw_s and raw_s not in examples and len(examples) < 5:
            examples.append(raw_s)
    return inv


def _rule_map_key(key: str) -> Optional[Dict[str, str]]:
    if key == BLANK_KEY:
        return {"global_status": "ACTIVE", "canonical_status": "Open", "source": "default"}

    if any(t in key for t in _CLOSED_TERMS) or key in ("joined", "closed"):
        return {"global_status": "CLOSED", "canonical_status": "Joined", "source": "rule"}
    if key in ("cancelled", "canceled") or ("cancel" in key and "hold" not in key):
        return {"global_status": "CANCELLED", "canonical_status": "Cancelled", "source": "rule"}
    if key == "on hold" or key.startswith("on hold") or (key != "cancelled" and "hold" in key):
        return {"global_status": "ON HOLD", "canonical_status": "On Hold", "source": "rule"}
    if any(t in key for t in ("reject", "void", "withdraw", "drop", "inactive")):
        return {"global_status": "CANCELLED", "canonical_status": "Cancelled", "source": "rule"}
    if "offer" in key:
        return {"global_status": "PIPELINE", "canonical_status": "Offered", "source": "rule"}
    if "interview" in key or "l1" in key or "l2" in key:
        return {"global_status": "PIPELINE", "canonical_status": "Interview", "source": "rule"}
    if any(t in key for t in _PIPELINE_TERMS) or key in ("sourcing", "screening", "cv sent"):
        label = "Screening"
        if "interview" in key:
            label = "Interview"
        elif "offer" in key or "ytj" in key:
            label = "Offered"
        return {"global_status": "PIPELINE", "canonical_status": label, "source": "rule"}
    if any(t in key for t in _ACTIVE_TERMS) or key in ("open", "new", "wip"):
        return {"global_status": "ACTIVE", "canonical_status": "Open", "source": "rule"}
    return None


def _llm_map_keys(keys: List[str], inventory: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, str]]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or not keys:
        return {}

    try:
        import instructor
        import google.generativeai as genai
        from pydantic import BaseModel, Field

        class StatusMappingEntry(BaseModel):
            global_status: str = Field(..., description="One of ACTIVE, CLOSED, PIPELINE, ON HOLD, CANCELLED")
            canonical_status: str = Field(
                ...,
                description="Display label: Open, Joined, Offered, Screening, Interview, On Hold, Cancelled, Closed, Rejected",
            )

        class StatusMappingBatch(BaseModel):
            mappings: Dict[str, StatusMappingEntry] = Field(
                ...,
                description="Keys are normalized status keys exactly as provided",
            )

        lines = []
        for k in keys:
            ex = inventory.get(k, {}).get("raw_examples", [])
            lines.append(f"- {k!r} (examples: {ex[:3]}, count={inventory.get(k, {}).get('count', 0)})")

        prompt = f"""
Map each recruitment tracker status value to our system buckets.

System global_status (use exactly one): ACTIVE, CLOSED, PIPELINE, ON HOLD, CANCELLED.
canonical_status: short UI label (Open, Joined, Offered, Screening, Interview, On Hold, Cancelled, etc.).

Values to map (keys must match exactly):
{chr(10).join(lines)}

Rules:
- Joined/hired/selected → CLOSED / Joined
- Open/new/active mandate → ACTIVE / Open
- Sourcing/interview/offer pipeline → PIPELINE
- Cancel/hold/void → ON HOLD / Cancelled
- Return every key listed; no omissions.
"""

        genai.configure(api_key=api_key)
        client = instructor.from_gemini(
            client=genai.GenerativeModel(model_name="models/gemini-flash-latest"),
        )
        result = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You map client recruitment status strings to a fixed enum."},
                {"role": "user", "content": prompt},
            ],
            response_model=StatusMappingBatch,
        )
        out: Dict[str, Dict[str, str]] = {}
        for k, entry in (result.mappings or {}).items():
            gs = (entry.global_status or "PIPELINE").strip().upper()
            if gs not in GLOBAL_STATUS_VALUES:
                gs = "PIPELINE"
            out[k] = {
                "global_status": gs,
                "canonical_status": (entry.canonical_status or "Open").strip(),
                "source": "llm",
            }
        return out
    except Exception as e:
        logger.warning("Status LLM mapper skipped: %s", e)
        return {}


def build_value_map(inventory: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, str]]:
    value_map: Dict[str, Dict[str, str]] = {}
    for key in inventory:
        ruled = _rule_map_key(key)
        if ruled:
            value_map[key] = ruled

    unmapped = [k for k in inventory if k not in value_map]
    if unmapped:
        llm_part = _llm_map_keys(unmapped, inventory)
        value_map.update(llm_part)

    for key in inventory:
        if key in value_map:
            continue
        value_map[key] = {
            "global_status": "PIPELINE",
            "canonical_status": "Open",
            "source": "fallback",
        }

    return value_map


def _sheet_header_fingerprint(headers: List[str]) -> str:
    norm = sorted({(h or "").strip().lower() for h in headers if h})
    return hashlib.sha256("|".join(norm).encode()).hexdigest()[:24]


def build_status_lexicon_from_workbook(
    file_path: str,
    sheet_names: List[str],
    *,
    universal_map: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    Scan tracker sheet(s), detect status column(s), inventory unique values, build value_map.
    """
    universal_map = universal_map or {}
    frames: List[pd.DataFrame] = []
    all_headers: List[str] = []
    for s in sheet_names:
        try:
            df, _data_start = read_tracker_sheet_dataframe(file_path, s)
            frames.append(df)
            all_headers.extend([str(c) for c in df.columns])
        except Exception as e:
            logger.warning("Status lexicon: skip sheet %s: %s", s, e)

    if not frames:
        return {}

    combined = pd.concat(frames, ignore_index=True) if len(frames) > 1 else frames[0]
    headers = list(dict.fromkeys(all_headers))

    detection = detect_status_columns(headers, combined)

    # Prefer column mapper's universal `status` header when present
    mapped_status_header = (universal_map.get("status") or "").strip()
    if mapped_status_header and mapped_status_header in combined.columns:
        detection["primary_column"] = mapped_status_header
        detection["candidate_status_column"] = mapped_status_header
        detection["mandate_status_column"] = mapped_status_header
        detection["row_selection_rule"] = "primary_only"

    primary = detection.get("primary_column")
    if not primary or primary not in combined.columns:
        return {}

    inventory = build_value_inventory(combined[primary])
    # Also merge values from secondary columns if distinct
    for extra_col in (
        detection.get("candidate_status_column"),
        detection.get("mandate_status_column"),
    ):
        if extra_col and extra_col in combined.columns and extra_col != primary:
            for k, meta in build_value_inventory(combined[extra_col]).items():
                if k not in inventory:
                    inventory[k] = meta
                else:
                    inventory[k]["count"] += meta["count"]
                    for ex in meta.get("raw_examples", []):
                        if ex not in inventory[k]["raw_examples"] and len(inventory[k]["raw_examples"]) < 5:
                            inventory[k]["raw_examples"].append(ex)

    value_map = build_value_map(inventory)
    unmapped = [k for k in inventory if k not in value_map]

    return {
        "header_fingerprint": _sheet_header_fingerprint(headers),
        "built_at": datetime.now(timezone.utc).isoformat(),
        "primary_column": primary,
        "candidate_status_column": detection.get("candidate_status_column"),
        "mandate_status_column": detection.get("mandate_status_column"),
        "row_selection_rule": detection.get("row_selection_rule", "candidate_if_named_else_mandate"),
        "inventory": inventory,
        "value_map": value_map,
        "unmapped_values": unmapped,
        "coverage_pct": 100.0 if not unmapped else round(100.0 * (len(inventory) - len(unmapped)) / max(len(inventory), 1), 1),
    }


def get_status_lexicon(column_mapping: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(column_mapping, dict):
        return None
    lex = column_mapping.get("status_lexicon")
    return lex if isinstance(lex, dict) and lex.get("value_map") else None


def pick_status_column_for_row(
    lexicon: Dict[str, Any],
    *,
    candidate_name: Optional[str],
) -> str:
    primary = lexicon.get("primary_column") or ""
    candidate_col = lexicon.get("candidate_status_column")
    mandate_col = lexicon.get("mandate_status_column")
    rule = lexicon.get("row_selection_rule", "candidate_if_named_else_mandate")

    name = (candidate_name or "").strip().lower()
    has_candidate = bool(name) and name not in ("unknown", "nan", "none", "")

    if rule == "candidate_if_named_else_mandate":
        if has_candidate and candidate_col:
            return candidate_col
        if not has_candidate and mandate_col:
            return mandate_col
    if rule == "primary_only" and primary:
        return primary
    return primary


def resolve_row_status(
    row_dict: dict,
    lexicon: Dict[str, Any],
    *,
    candidate_name: Optional[str],
) -> Tuple[str, str, str]:
    """
    Returns (raw_excel_value, canonical_status, global_status).
    """
    col = pick_status_column_for_row(lexicon, candidate_name=candidate_name)
    raw = row_dict.get(col)
    raw_display = "" if raw is None or (isinstance(raw, float) and pd.isna(raw)) else str(raw).strip()
    key = normalize_status_key(raw)
    entry = (lexicon.get("value_map") or {}).get(key)
    if not entry:
        entry = (lexicon.get("value_map") or {}).get(UNKNOWN_KEY) or {
            "global_status": "PIPELINE",
            "canonical_status": "Open",
        }
    gs = (entry.get("global_status") or "PIPELINE").strip().upper()
    if gs not in GLOBAL_STATUS_VALUES:
        gs = "PIPELINE"
    canonical = (entry.get("canonical_status") or "Open").strip()
    return raw_display, canonical, gs


def lookup_status_entry(lexicon: Dict[str, Any], raw_value: Any) -> Dict[str, str]:
    key = normalize_status_key(raw_value)
    entry = (lexicon.get("value_map") or {}).get(key)
    if entry:
        return entry
    return {"global_status": "PIPELINE", "canonical_status": "Open", "source": "fallback"}


def merge_global_status_with_revenue(
    lexicon_global: str,
    revenue_results: Optional[dict],
) -> str:
    """
    Revenue fees still authoritative for CLOSED (hire billed); otherwise use status lexicon.
    """
    results = revenue_results if isinstance(revenue_results, dict) else {}
    closing = float(results.get("closing_fee") or 0)
    if closing > 0:
        return "CLOSED"
    gs = (lexicon_global or "PIPELINE").strip().upper()
    if gs not in GLOBAL_STATUS_VALUES or gs == "UNPROCESSED":
        return "PIPELINE"
    return gs
