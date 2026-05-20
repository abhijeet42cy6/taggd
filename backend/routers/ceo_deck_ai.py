"""AI-assisted edits for CEO board deck JSON (browser-local config)."""
from __future__ import annotations

import copy
import json
import os
from typing import Any

import google.generativeai as genai
from fastapi import APIRouter, Depends, HTTPException
from google.generativeai.types import GenerationConfig
from pydantic import BaseModel, Field

from backend.auth.deps import get_current_user
from backend.auth.verticals import require_vertical
from backend.db.database import User

router = APIRouter(
    prefix="/ceo-deck",
    tags=["ceo-deck"],
    dependencies=[Depends(require_vertical("ceo_view"))],
)


class CeoDeckAiEditBody(BaseModel):
    current_json: str = Field(..., min_length=2, max_length=500_000)
    instruction: str = Field(..., min_length=1, max_length=12_000)
    focus_paths: list[str] | None = Field(
        default=None,
        max_length=64,
        description="Dotted paths (e.g. financialPerformance.metricCards). When set, only that JSON fragment is edited and merged back.",
    )


class CeoDeckAiEditResponse(BaseModel):
    deck_json: str


def _validate_deck(obj: Any) -> None:
    if not isinstance(obj, dict):
        raise ValueError("Response is not a JSON object")
    if obj.get("version") != 1:
        raise ValueError('Deck must include top-level "version": 1')


def _strip_json_markdown_fence(text: str) -> str:
    """Model sometimes wraps JSON in ``` fences despite instructions."""
    s = text.strip()
    if not s.startswith("```"):
        return s
    lines = s.split("\n")
    if len(lines) < 2:
        return s
    # Drop opening ``` or ```json
    rest = lines[1:]
    if rest and lines[-1].strip() == "```":
        rest = rest[:-1]
    return "\n".join(rest).strip()


def _response_text_best_effort(resp: Any) -> str:
    t = getattr(resp, "text", None) or ""
    t = _strip_json_markdown_fence(t.strip())
    if t:
        return t
    try:
        cand = resp.candidates[0]
        parts = cand.content.parts
        raw = "".join(getattr(p, "text", "") or "" for p in parts)
        return _strip_json_markdown_fence(raw.strip())
    except (AttributeError, IndexError, TypeError):
        return ""


def _get_in(d: Any, parts: list[str]) -> Any:
    cur = d
    for p in parts:
        if not isinstance(cur, dict) or p not in cur:
            return None
        cur = cur[p]
    return cur


def _ensure_set_in(out: dict[str, Any], parts: list[str], leaf: Any) -> None:
    cur: dict[str, Any] = out
    for p in parts[:-1]:
        nxt = cur.get(p)
        if nxt is None or not isinstance(nxt, dict):
            cur[p] = {}
        cur = cur[p]
    cur[parts[-1]] = copy.deepcopy(leaf)


def _bundle_paths(full: dict[str, Any], dotted_paths: list[str]) -> dict[str, Any]:
    """Build a nested dict containing only the leaves referenced by dotted paths."""
    frag: dict[str, Any] = {}
    for dotted in dotted_paths:
        parts = [x for x in dotted.strip().split(".") if x]
        if not parts:
            continue
        val = _get_in(full, parts)
        if val is None:
            continue
        _ensure_set_in(frag, parts, val)
    return frag


def _deep_merge_inplace(base: Any, patch: Any) -> None:
    if isinstance(base, dict) and isinstance(patch, dict):
        for k, pv in patch.items():
            if k in base and isinstance(base[k], dict) and isinstance(pv, dict):
                _deep_merge_inplace(base[k], pv)
            else:
                base[k] = copy.deepcopy(pv)


def _finish_reason_truncated(resp: Any) -> bool:
    """True when Gemini stopped because of output length (incomplete JSON)."""
    try:
        fr = resp.candidates[0].finish_reason
        name = getattr(fr, "name", str(fr))
        return "MAX_TOKEN" in name.upper()
    except (AttributeError, IndexError, TypeError):
        return False


@router.post("/ai-edit", response_model=CeoDeckAiEditResponse)
def ai_edit_ceo_deck(
    body: CeoDeckAiEditBody,
    _user: User = Depends(get_current_user),
) -> CeoDeckAiEditResponse:
    """
    Apply a natural-language instruction to the current deck JSON using Gemini.
    Requires GEMINI_API_KEY. Does not persist — the client replaces the textarea and user clicks Save.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not set on the server; AI deck edit is unavailable.",
        )

    try:
        json.loads(body.current_json)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"current_json is not valid JSON: {e}") from e

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("models/gemini-flash-latest")

    full_obj = json.loads(body.current_json)
    fp = [x.strip() for x in (body.focus_paths or []) if x and x.strip()]

    if fp:
        frag = _bundle_paths(full_obj, fp)
        if not frag:
            raise HTTPException(status_code=400, detail="focus_paths did not match any keys in the current deck JSON.")
        frag_json = json.dumps(frag, ensure_ascii=False, indent=2)
        paths_line = ", ".join(fp)
        prompt = f"""You edit a **partial** CEO board slide deck JSON fragment. The full deck is version 1; your output will be **deep-merged** into the saved deck.

STRICT RULES:
1. Output a single JSON object only — no markdown, no code fences, no commentary before or after.
2. Your output MUST use the **same nesting and keys** as INPUT_FRAGMENT. Only change values the user asked for; keep other fields in the fragment identical when still appropriate.
3. Do NOT include keys outside INPUT_FRAGMENT. Do NOT add "version" unless it appears in INPUT_FRAGMENT.
4. All strings/numbers/types must remain valid JSON and match React expectations (arrays stay arrays, objects stay objects).
5. NEVER truncate mid-value — finish the fragment as valid JSON.

TARGET PATHS (for context — user selected these spots in the UI):
{paths_line}

USER INSTRUCTION:
{body.instruction.strip()}

INPUT_FRAGMENT_JSON:
{frag_json}
"""
    else:
        prompt = f"""You edit a CEO board slide deck configuration JSON.

STRICT RULES:
1. Output a single JSON object only — no markdown, no code fences, no commentary before or after.
2. The object MUST include "version": 1 (integer) at the top level.
3. Preserve the same top-level keys and nested structure as the input unless the user explicitly asks to remove a section (then omit only that part).
4. Apply ONLY the user's instruction; keep unrelated numbers and strings unchanged when possible.
5. All string values must stay valid JSON strings; numbers must be JSON numbers (not quoted unless they are labels).
6. The deck is used by a React app — do not rename keys or change types (arrays stay arrays, objects stay objects).
7. The response MUST be complete, syntactically valid JSON from first opening brace to final closing brace — never truncate mid-key or mid-string.

USER INSTRUCTION:
{body.instruction.strip()}

CURRENT DECK JSON:
{body.current_json}
"""

    # Without an explicit max_output_tokens, some SDK/model defaults are ~2048 output tokens — the model
    # then cuts off mid-object and json.loads fails (e.g. "Expecting value" at line ~300 of the string).
    try:
        resp = model.generate_content(
            prompt,
            generation_config=GenerationConfig(
                response_mime_type="application/json",
                temperature=0.15,
                max_output_tokens=8192,
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini request failed: {e!s}") from e

    raw = _response_text_best_effort(resp)
    if not raw:
        raise HTTPException(status_code=502, detail="Empty response from model")

    truncated_finish = _finish_reason_truncated(resp)

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        truncated_hint = (
            " Likely causes: output was cut off before the closing braces — try again or shorten inputs;"
            " optional tweaks-only edits reduce regenerated JSON size."
        )
        if truncated_finish:
            truncated_hint = (
                " The response stopped early due to output length; shorten instructions,"
                " edit Advanced JSON to shrink placeholders first or tweak fewer slides per prompt."
            )
        raise HTTPException(
            status_code=502,
            detail=(
                f"Model did not return valid JSON: {e}. {truncated_hint}"
            ),
        ) from e

    if fp:
        _deep_merge_inplace(full_obj, parsed)
        merged = full_obj
        try:
            _validate_deck(merged)
        except ValueError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e
        return CeoDeckAiEditResponse(deck_json=json.dumps(merged, ensure_ascii=False, indent=2))

    try:
        _validate_deck(parsed)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return CeoDeckAiEditResponse(deck_json=json.dumps(parsed, ensure_ascii=False, indent=2))
