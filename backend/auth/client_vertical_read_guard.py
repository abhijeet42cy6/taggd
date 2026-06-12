"""For `client_user`, enforce vertical allow-list on legacy `main.py` GET paths (sub-routers already use `require_vertical`)."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from backend.auth.profile import ROLE_CLIENT_USER, effective_role, profile_may_access_vertical, resolve_user_profile
from backend.db.database import SessionLocal, User

_READ_METHODS = frozenset({"GET", "HEAD"})

# Sub-routers attach their own `require_vertical` — do not double-gate here.
_SKIP_PATH_PREFIXES: tuple[str, ...] = (
    "/finance",
    "/sla",
    "/wfm",
    "/revenue-trackers",
    "/revenue-billing",
    "/finance-billing-workflow",
    "/revenue-weekly-submissions",
    "/candidates",
    "/candidate-masters",
    "/contracts",
    "/meetings",
    "/vendor-licenses",
    "/tasks",
    "/transitions",
)

# Longest match wins; (path prefix, vertical key from VERTICAL_KEYS).
_PREFIX_VERTICAL: tuple[tuple[str, str], ...] = (
    ("/ingestion/events", "ingestion"),
    ("/activity/log", "portfolio"),
    ("/data-ops", "data_operations"),
    ("/clients", "clients"),
    ("/projects", "clients"),
    ("/records", "requisitions"),
    ("/stats/requisitions", "requisitions"),
    ("/stats", "portfolio"),
    ("/ceo-deck", "ceo_view"),
)


def _required_vertical_for_path(path: str) -> str | None:
    hit: tuple[int, str] | None = None
    for prefix, vkey in _PREFIX_VERTICAL:
        if path == prefix or path.startswith(prefix + "/"):
            ln = len(prefix)
            if hit is None or ln > hit[0]:
                hit = (ln, vkey)
    return hit[1] if hit else None


def _vertical_keys_for_path(path: str) -> list[str] | None:
    """Vertical keys that may grant read access (client_user allow-list; any match wins)."""
    primary = _required_vertical_for_path(path)
    if primary is None:
        return None
    keys: list[str] = [primary]
    if path.startswith("/stats/global/monitor"):
        for alt in ("requisitions", "executive_dashboard"):
            if alt not in keys:
                keys.append(alt)
    elif path.startswith("/records"):
        if "candidates" not in keys:
            keys.append("candidates")
    return keys


class ClientVerticalReadGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method not in _READ_METHODS:
            return await call_next(request)
        user = getattr(request.state, "user", None)
        if user is None or effective_role(user) != ROLE_CLIENT_USER:
            return await call_next(request)
        path = request.url.path
        if any(path == p or path.startswith(p + "/") for p in _SKIP_PATH_PREFIXES):
            return await call_next(request)
        vertical_keys = _vertical_keys_for_path(path)
        if vertical_keys is None:
            return await call_next(request)
        db = SessionLocal()
        try:
            u = db.query(User).filter(User.id == user.id).first()
            if not u:
                return JSONResponse({"detail": "User not found"}, status_code=401)
            profile = resolve_user_profile(u, db)
            if not any(profile_may_access_vertical(profile, k) for k in vertical_keys):
                denied = vertical_keys[0]
                return JSONResponse(
                    {"detail": f"Module '{denied}' is not enabled for this client portal account"},
                    status_code=403,
                )
        finally:
            db.close()
        return await call_next(request)
