"""Strip /api prefix on Cloud Run (VM nginx does this in production)."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class ApiPrefixStripMiddleware(BaseHTTPMiddleware):
    """Rewrite /api/foo → /foo so split UI builds with VITE_API_BASE_URL=…/api still work."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path.startswith("/api/"):
            request.scope["path"] = path[4:] or "/"
        elif path == "/api":
            request.scope["path"] = "/"
        return await call_next(request)
