"""AI-assisted edits for CEO board deck JSON (browser-local config)."""
from __future__ import annotations

import json
import os
from typing import Any

import google.generativeai as genai
from fastapi import APIRouter, Depends, HTTPException
from google.generativeai.types import GenerationConfig
from pydantic import BaseModel, Field

from backend.auth.deps import get_current_user
from backend.db.database import User

router = APIRouter(prefix="/ceo-deck", tags=["ceo-deck"])


class CeoDeckAiEditBody(BaseModel):
    current_json: str = Field(..., min_length=2, max_length=500_000)
    instruction: str = Field(..., min_length=1, max_length=12_000)


class CeoDeckAiEditResponse(BaseModel):
    deck_json: str


def _validate_deck(obj: Any) -> None:
    if not isinstance(obj, dict):
        raise ValueError("Response is not a JSON object")
    if obj.get("version") != 1:
        raise ValueError('Deck must include top-level "version": 1')


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

    prompt = f"""You edit a CEO board slide deck configuration JSON.

STRICT RULES:
1. Output a single JSON object only — no markdown, no code fences, no commentary before or after.
2. The object MUST include "version": 1 (integer) at the top level.
3. Preserve the same top-level keys and nested structure as the input unless the user explicitly asks to remove a section (then omit only that part).
4. Apply ONLY the user's instruction; keep unrelated numbers and strings unchanged when possible.
5. All string values must stay valid JSON strings; numbers must be JSON numbers (not quoted unless they are labels).
6. The deck is used by a React app — do not rename keys or change types (arrays stay arrays, objects stay objects).

USER INSTRUCTION:
{body.instruction.strip()}

CURRENT DECK JSON:
{body.current_json}
"""

    try:
        resp = model.generate_content(
            prompt,
            generation_config=GenerationConfig(
                response_mime_type="application/json",
                temperature=0.15,
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini request failed: {e!s}") from e

    raw = (resp.text or "").strip()
    if not raw:
        raise HTTPException(status_code=502, detail="Empty response from model")

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Model did not return valid JSON: {e}; first 200 chars: {raw[:200]!r}",
        ) from e

    try:
        _validate_deck(parsed)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return CeoDeckAiEditResponse(deck_json=json.dumps(parsed, ensure_ascii=False, indent=2))
