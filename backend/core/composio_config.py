"""Composio integration configuration helpers."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import dotenv_values


@dataclass(frozen=True)
class ComposioConfig:
    api_key: str | None
    webhook_secret: str | None
    base_url: str
    env: str
    auth_config_id: str | None
    public_base_url: str | None
    user_id_prefix: str

    @property
    def configured(self) -> bool:
        return bool(self.api_key)


def load_composio_config() -> ComposioConfig:
    api_key = (os.getenv("COMPOSIO_API_KEY") or "").strip()
    webhook_secret = (os.getenv("COMPOSIO_WEBHOOK_SECRET") or "").strip()
    base_url = (os.getenv("COMPOSIO_BASE_URL") or "").strip()
    env = (os.getenv("COMPOSIO_ENV") or "").strip().lower()
    auth_config_id = (
        os.getenv("COMPOSIO_OUTLOOK_AUTH_CONFIG_ID")
        or os.getenv("COMPOSIO_AUTH_CONFIG_ID")
        or ""
    ).strip()
    public_base_url = (os.getenv("COMPOSIO_PUBLIC_BASE_URL") or "").strip() or None
    user_id_prefix = (os.getenv("COMPOSIO_USER_ID_PREFIX") or "").strip()

    # Fallback for local dev where server was started without shell env propagation.
    if not api_key or not base_url or not env or not auth_config_id:
        env_path = Path(__file__).resolve().parents[2] / ".env"
        if env_path.exists():
            vals = dotenv_values(env_path)
            api_key = api_key or str(vals.get("COMPOSIO_API_KEY") or "").strip()
            webhook_secret = webhook_secret or str(vals.get("COMPOSIO_WEBHOOK_SECRET") or "").strip()
            base_url = base_url or str(vals.get("COMPOSIO_BASE_URL") or "").strip()
            env = env or str(vals.get("COMPOSIO_ENV") or "").strip().lower()
            auth_config_id = auth_config_id or str(vals.get("COMPOSIO_OUTLOOK_AUTH_CONFIG_ID") or "").strip()
            auth_config_id = auth_config_id or str(vals.get("COMPOSIO_AUTH_CONFIG_ID") or "").strip()
            public_base_url = public_base_url or str(vals.get("COMPOSIO_PUBLIC_BASE_URL") or "").strip() or None
            user_id_prefix = user_id_prefix or str(vals.get("COMPOSIO_USER_ID_PREFIX") or "").strip()

    return ComposioConfig(
        api_key=api_key or None,
        webhook_secret=webhook_secret or None,
        base_url=base_url or "https://backend.composio.dev",
        env=env or "prod",
        auth_config_id=auth_config_id or None,
        public_base_url=public_base_url,
        user_id_prefix=user_id_prefix,
    )


def build_composio_user_id(cfg: ComposioConfig, *, email: str | None, user_id: int) -> str:
    """Stable per-user identifier sent to Composio (visible as `user_id` in dashboard).

    Defaults to the user's email so the connection clearly maps to the platform account.
    Falls back to the numeric platform id if the email is missing.
    """
    ident = (email or "").strip().lower() or str(user_id)
    prefix = (cfg.user_id_prefix or "").strip()
    return f"{prefix}:{ident}" if prefix else ident
