"""Status helpers for weekly revenue pack (forecast + visibility) governance."""

from __future__ import annotations

ST_DRAFT = "draft"
ST_SUBMITTED = "submitted"
ST_UNDER_REVIEW = "under_review"
ST_APPROVED = "approved"
ST_CHANGES_REQUESTED = "changes_requested"
ST_REJECTED = "rejected"


def submission_allows_child_edit(status: str | None) -> bool:
    """Practice may edit linked forecast/visibility rows."""
    s = (status or "").strip().lower()
    return s in (ST_DRAFT, ST_CHANGES_REQUESTED, ST_REJECTED)


def submission_locked_for_practice(status: str | None) -> bool:
    """No practice-side edits to linked rows."""
    return not submission_allows_child_edit(status)
