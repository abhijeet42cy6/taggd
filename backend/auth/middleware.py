import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from backend.db.database import SessionLocal, User
from backend.auth.security import decode_token_safe

logger = logging.getLogger(__name__)

PUBLIC_PREFIXES = (
    "/docs",
    "/openapi.json",
    "/redoc",
)
PUBLIC_PATHS = frozenset(
    {
        "/",
        "/auth/login",
        "/favicon.ico",
    }
)


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        if path in PUBLIC_PATHS or any(path.startswith(p) for p in PUBLIC_PREFIXES):
            return await call_next(request)

        auth = request.headers.get("authorization") or ""
        if not auth.lower().startswith("bearer "):
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)
        token = auth[7:].strip()
        payload = decode_token_safe(token)
        if not payload:
            return JSONResponse({"detail": "Invalid or expired token"}, status_code=401)
        sub = payload.get("sub")
        if sub is None:
            return JSONResponse({"detail": "Invalid token payload"}, status_code=401)
        try:
            user_id = int(sub)
        except (TypeError, ValueError):
            return JSONResponse({"detail": "Invalid token subject"}, status_code=401)

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                return JSONResponse({"detail": "User not found"}, status_code=401)
            if not user.is_active:
                return JSONResponse({"detail": "User disabled"}, status_code=403)
            db.expunge(user)
            request.state.user = user
        finally:
            db.close()

        return await call_next(request)
