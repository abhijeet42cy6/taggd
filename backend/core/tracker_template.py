"""Generate client-specific tracker Excel templates (production-safe import path)."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Optional


def _masters_dir() -> Path:
    """Resolve excel_upload_masters in dev checkout or Docker image (/app/excel_upload_masters)."""
    here = Path(__file__).resolve()
    candidates = [
        here.parent.parent.parent / "excel_upload_masters",
        Path("/app/excel_upload_masters"),
        here.parent.parent / "excel_upload_masters",
    ]
    for path in candidates:
        if (path / "generate_taggd_tracker_template.py").is_file():
            return path
    raise FileNotFoundError(
        "excel_upload_masters/generate_taggd_tracker_template.py not found. "
        "Ensure excel_upload_masters is copied into the backend Docker image."
    )


def _load_generator_module():
    cached = getattr(_load_generator_module, "_cached", None)
    if cached is not None:
        return cached

    masters = _masters_dir()
    mod_path = masters / "generate_taggd_tracker_template.py"
    module_name = "taggd_generate_tracker_template"
    spec = importlib.util.spec_from_file_location(module_name, mod_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load tracker template generator from {mod_path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    _load_generator_module._cached = mod  # type: ignore[attr-defined]
    return mod


def generate_project_tracker_bytes(config: Optional[dict] = None) -> bytes:
    """Build standard tracker workbook bytes with optional client-specific dropdown overrides."""
    mod = _load_generator_module()
    generate_fn = getattr(mod, "generate_tracker_workbook_bytes", None)
    if not callable(generate_fn):
        raise RuntimeError("generate_tracker_workbook_bytes missing from template generator module")
    return generate_fn(config or {})
