"""Block mutating HTTP methods for read-only `client_user` accounts, with allowlisted self-service routes."""

from __future__ import annotations

from typing import FrozenSet

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from backend.auth.profile import ROLE_CLIENT_USER, effective_role

_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

# (path prefix for equality match, allowed HTTP methods) — only for `client_user`.
# Paths are as seen by the app (e.g. `/auth/me/profile`), no `/api` prefix.
_CLIENT_USER_WRITE_ALLOWLIST: tuple[tuple[str, FrozenSet[str]], ...] = (
    ("/auth/me/profile", frozenset({"PATCH"})),
    ("/auth/me/avatar", frozenset({"POST", "DELETE"})),
)


def _normalize_path(path: str) -> str:
    p = path or "/"
    if len(p) > 1 and p.endswith("/"):
        p = p[:-1]
    return p


def client_user_mutation_allowed(path: str, method: str) -> bool:
    """True if this path+method is permitted for client portal accounts (self-service profile)."""
    p = _normalize_path(path)
    m = (method or "").upper()
    for prefix, methods in _CLIENT_USER_WRITE_ALLOWLIST:
        if p == prefix or p.startswith(prefix + "/"):
            return m in methods
    return False


class ClientWriteGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in _SAFE_METHODS:
            return await call_next(request)
        user = getattr(request.state, "user", None)
        if user is None:
            return await call_next(request)
        if effective_role(user) == ROLE_CLIENT_USER:
            if client_user_mutation_allowed(request.url.path, request.method):
                return await call_next(request)
            return JSONResponse(
                {"detail": "Client portal accounts are read-only."},
                status_code=403,
            )
        return await call_next(request)
