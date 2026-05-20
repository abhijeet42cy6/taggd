"""LLM-generated SLA KPI overview insights (Gemini)."""
from __future__ import annotations

import json
import os
import re
from typing import Any

import google.generativeai as genai
from fastapi import APIRouter, Depends, HTTPException
from google.generativeai.types import GenerationConfig
from pydantic import BaseModel, Field

from backend.auth.deps import get_current_user
from backend.auth.verticals import require_vertical
from backend.db.database import User

router = APIRouter(
    prefix="/sla",
    tags=["sla"],
    dependencies=[Depends(require_vertical("sla"))],
)


class SlaInsightsGenerateBody(BaseModel):
    """Small JSON snapshot built client-side from scoped KPI / FY aggregates."""

    payload: dict[str, Any] = Field(default_factory=dict, max_length=48_000)


class SlaInsightDto(BaseModel):
    title: str = Field(..., max_length=200)
    description: str = Field(..., max_length=1200)
    tone: str | None = Field(default="info", max_length=16)


class SlaInsightsGenerateResponse(BaseModel):
    insights: list[SlaInsightDto]


def _strip_json_fence(text: str) -> str:
    s = text.strip()
    if not s.startswith("```"):
        return s
    lines = s.split("\n")
    if len(lines) < 2:
        return s
    rest = lines[1:]
    out: list[str] = []
    for line in rest:
        if line.strip().startswith("```"):
            break
        out.append(line)
    return "\n".join(out).strip()


def _parse_insights_array(raw: str) -> list[SlaInsightDto]:
    s = _strip_json_fence(raw)
    data = json.loads(s)
    if not isinstance(data, list):
        raise ValueError("Model output must be a JSON array")
    out: list[SlaInsightDto] = []
    for item in data[:6]:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        desc = str(item.get("description", "")).strip()
        if not title or not desc:
            continue
        tone = str(item.get("tone", "info") or "info").strip().lower()
        if tone not in ("info", "success", "warn"):
            tone = "info"
        out.append(SlaInsightDto(title=title[:200], description=desc[:1200], tone=tone))
    if not out:
        raise ValueError("No valid insight objects in model output")
    return out


@router.post("/insights/generate", response_model=SlaInsightsGenerateResponse)
def generate_sla_insights(
    body: SlaInsightsGenerateBody,
    _user: User = Depends(get_current_user),
) -> SlaInsightsGenerateResponse:
    """
    Turn a compact numeric SLA snapshot into 3–5 executive insight cards.
    Requires GEMINI_API_KEY on the server (same family as CEO deck AI).
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not set on the server; SLA insights AI is unavailable.",
        )

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("models/gemini-flash-latest")

    snap = json.dumps(body.payload, ensure_ascii=False, separators=(",", ":"))[:40_000]
    prompt = f"""You are a concise portfolio analyst for an SLA / KPI compliance dashboard.

Input (JSON, authoritative numbers — do not invent figures not derivable from it):
{snap}

Return ONLY a JSON array (no markdown fences) of 3 to 5 objects. Each object must have:
- "title": short headline (max ~8 words)
- "description": 1–2 sentences referencing specific numbers from the input where possible
- "tone": one of "info", "success", "warn" (use "warn" for risks or reporting gaps, "success" for clear wins)

Themes may include: FY window mix, trajectory vs prior FY, decisive-row met posture, not-reported gaps, effect of any active overview filter (health tier / workspace region) on the slice.
Do not mention internal code names or APIs."""

    try:
        resp = model.generate_content(
            prompt,
            generation_config=GenerationConfig(
                temperature=0.35,
                max_output_tokens=1024,
            ),
        )
        text = (resp.text or "").strip()
    except Exception as exc:  # pragma: no cover - network / quota
        raise HTTPException(status_code=502, detail=f"Gemini request failed: {exc}") from exc

    try:
        insights = _parse_insights_array(text)
    except (json.JSONDecodeError, ValueError) as exc:
        # Retry once with stricter instruction if model returned prose
        m = re.search(r"\[[\s\S]*\]", text)
        if not m:
            raise HTTPException(
                status_code=502,
                detail=f"Insights model returned non-JSON: {text[:400]}",
            ) from exc
        try:
            insights = _parse_insights_array(m.group(0))
        except (json.JSONDecodeError, ValueError) as exc2:
            raise HTTPException(
                status_code=502,
                detail=f"Could not parse insights JSON: {exc2}",
            ) from exc2

    return SlaInsightsGenerateResponse(insights=insights)
