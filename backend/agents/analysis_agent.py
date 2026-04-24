"""
Analysis Agent — Gemini Function-Calling Orchestrator

Uses google.generativeai with native function calling (NOT instructor).
Pattern:
  1. Receive messages + optional session context.
  2. Build Gemini chat history.
  3. Loop up to MAX_ITERATIONS: send → check for fn calls → execute → feed results back.
  4. Return final answer text + tool_calls log + updated history for session storage.
"""

from __future__ import annotations

import json
import os
from typing import Any

import google.generativeai as genai
from sqlalchemy.orm import Session

from backend.agent_tools.tools import execute_tool
from backend.db.database import User

# ─────────────────────────────────────────────────────────────────────────────
# SYSTEM PROMPT
# ─────────────────────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """
You are **Taggy** — the user's personal **Taggd** intelligence, **powered by Aparatus**. You are not "Nexus Intelligence" or any other name. Introduce yourself in first person when it helps: e.g. "I'm Taggy, your personal Taggd intelligence powered by Aparatus."

## Persona
- **Warm and empathetic:** Acknowledge what the user is trying to do; be encouraging. A short friendly line at the start or end is fine when it feels natural — but never pad when they need a fast number.
- **Flavour, not fluff:** You can use light, human phrasing and personality. Stay professional; avoid sarcasm, slang overload, or talking down to the user.
- **Accurate first:** Every figure must come from tools. Warmth never replaces truthfulness.

## Your capabilities
You can query the live database to answer questions about:
- **Clients / Projects**: requisition counts, fill rates, revenue, account metadata
- **Requisitions**: individual records, status, ageing, departments, candidates
- **SLA Performance**: metric compliance, trends, RAG status by account and time
- **Workforce Management**: headcount benchmarks vs actuals, resource gaps
- **Finance**: monthly ledger (budget vs forecast vs actual), cash flow, budget forecasts
- **Portfolio Overview**: cross-client KPIs, top performers, risk signals

## Tool usage rules
1. ALWAYS use tools to retrieve data — never invent or guess numbers.
2. Start with `resolve_client` when the user mentions a client name to get the correct `project_id`.
3. If multiple project_ids exist for one account name, list them and ask the user to clarify — or aggregate across all.
4. Use `portfolio_overview` for org-wide questions without a specific client context.
5. For follow-up questions, reuse already-resolved `project_id` from earlier in the conversation.
6. Always cite the `project_id`, `record_id`, or data scope in your response so the user can trust the numbers.

## Response style
- Lead with the answer or key insight, then support with detail. A one-line empathetic or cheerful opener is optional when the question is open-ended; skip it for "just the number" requests.
- Use bullet points and tables (markdown) for comparisons.
- For financial figures, use ₹ and Cr (crore) notation where appropriate.
- For percentages, round to 1 decimal place.
- When data is truncated (meta.truncated = true), say "showing top N results".
- If a tool returns an error, explain kindly and suggest what to try next.
- End with an optional "💡 Suggested next steps" if it would help the user.

## Scope and limits
- You are read-only — you can explain, analyse, and surface data, but cannot modify records.
- If asked to make changes, explain that write operations are out of scope for you.
- The user's administrator controls which **projects** and **data modules** (finance, SLA, WFM, requisitions, etc.) they may see.
  Tool results may be empty, partial, or include `scope_notes` / `error` when a question is outside that access — explain that clearly and empathetically instead of guessing.
"""

# ─────────────────────────────────────────────────────────────────────────────
# TOOL DECLARATIONS (JSON schema format for Gemini)
# ─────────────────────────────────────────────────────────────────────────────
TOOL_DECLARATIONS = [
    {
        "name": "resolve_client",
        "description": "Find project(s) in the database matching a client or account name. Always call this first when the user mentions a client name. Returns a list of matching projects with their project_ids.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "The client or account name to search for, e.g. 'Honeywell' or 'Wipro'",
                }
            },
            "required": ["name"],
        },
    },
    {
        "name": "get_project_summary",
        "description": "Get a comprehensive summary of a single project: account metadata, record count, fill rate, total revenue, and the revenue logic explanation.",
        "parameters": {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "integer",
                    "description": "The numeric project ID (obtain via resolve_client first)",
                }
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "search_records",
        "description": "Search and filter requisition records for a specific project. Supports filters: global_status (e.g. CLOSED, ACTIVE, HOLD), department, location, hiring_manager, keyword (matches candidate name or position), excel_provided_id (req ID substring).",
        "parameters": {
            "type": "object",
            "properties": {
                "project_id": {"type": "integer", "description": "Project ID"},
                "global_status": {"type": "string", "description": "Filter by global_status e.g. CLOSED, ACTIVE, HOLD, CANCELLED"},
                "department": {"type": "string", "description": "Filter by department name (partial match)"},
                "location": {"type": "string", "description": "Filter by location (partial match)"},
                "hiring_manager": {"type": "string", "description": "Filter by hiring manager name (partial match)"},
                "keyword": {"type": "string", "description": "Keyword to search in candidate name or position title"},
                "excel_provided_id": {"type": "string", "description": "Requisition ID substring to search for"},
                "limit": {"type": "integer", "description": "Max rows to return (default 20, max 50)"},
                "offset": {"type": "integer", "description": "Pagination offset (default 0)"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "get_record_by_id",
        "description": "Fetch a single requisition record by its database ID, returning all fields including revenue_results.",
        "parameters": {
            "type": "object",
            "properties": {
                "record_id": {"type": "integer", "description": "The database record ID"},
            },
            "required": ["record_id"],
        },
    },
    {
        "name": "aggregate_records",
        "description": "Get aggregated KPIs for a project: status breakdown, fill rate, total revenue, ageing buckets (open reqs), department breakdown, top hiring managers.",
        "parameters": {
            "type": "object",
            "properties": {
                "project_id": {"type": "integer", "description": "Project ID"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "get_sla_metrics",
        "description": "Retrieve SLA metric definitions and their time-series performance data for a project. Optionally filter by metric_label or month range.",
        "parameters": {
            "type": "object",
            "properties": {
                "project_id": {"type": "integer", "description": "Project ID"},
                "metric_label": {"type": "string", "description": "Optional: specific SLA metric label to filter (partial match)"},
                "month_from": {"type": "string", "description": "Optional: start month (canonical YYYY-MM, e.g. '2024-04'); legacy labels still accepted as string compare"},
                "month_to": {"type": "string", "description": "Optional: end month (YYYY-MM inclusive)"},
                "limit": {"type": "integer", "description": "Max performance rows (default 30)"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "get_wfm_snapshot",
        "description": "Get Workforce Management data for a project: headcount benchmarks (ideal vs actual, WL hires) and open resource gaps.",
        "parameters": {
            "type": "object",
            "properties": {
                "project_id": {"type": "integer", "description": "Project ID"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "get_finance_ledger",
        "description": "Retrieve finance monthly ledger data (budget vs forecast vs actual) and cash flow for a project. Filter by metric_category (e.g. Revenue, CM) or month range.",
        "parameters": {
            "type": "object",
            "properties": {
                "project_id": {"type": "integer", "description": "Project ID"},
                "metric_category": {"type": "string", "description": "Finance metric category e.g. Revenue, CM, Gross Profit"},
                "month_from": {"type": "string", "description": "Start month filter"},
                "month_to": {"type": "string", "description": "End month filter"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "get_budget_forecast",
        "description": "Get quarterly budget allocations (Q1-Q4) and monthly forecast rows for a project.",
        "parameters": {
            "type": "object",
            "properties": {
                "project_id": {"type": "integer", "description": "Project ID"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "portfolio_overview",
        "description": "Get a portfolio-wide snapshot across all clients: total projects, requisition KPIs, total revenue, top clients, SLA RAG distribution, WFM summary. Use for questions about the whole organisation.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]


# ─────────────────────────────────────────────────────────────────────────────
# AGENT CLASS
# ─────────────────────────────────────────────────────────────────────────────
class AnalysisAgent:
    MAX_ITERATIONS = 6

    def __init__(self, api_key: str | None = None):
        key = api_key or os.getenv("GEMINI_API_KEY")
        if not key:
            raise RuntimeError("GEMINI_API_KEY not set")
        genai.configure(api_key=key)

        self.model = genai.GenerativeModel(
            # Keep consistent with existing agents in this repo.
            # This avoids model-id mismatch errors across environments.
            model_name="models/gemini-flash-latest",
            system_instruction=SYSTEM_PROMPT,
            tools=[{"function_declarations": TOOL_DECLARATIONS}],
        )

    # ── public entry-point ────────────────────────────────────────────────────
    def chat(
        self,
        messages: list[dict],  # [{role: "user"|"assistant", content: str}, ...]
        db: Session,
        user: User,
    ) -> dict:
        """
        Run one full agent turn.
        messages: full conversation so far, INCLUDING the latest user message.
        Returns {response_text, tool_calls, updated_messages}.
        """
        # Build Gemini history (all but last message)
        genai_history = []
        for msg in messages[:-1]:
            role = "model" if msg["role"] == "assistant" else "user"
            genai_history.append({"role": role, "parts": [msg["content"]]})

        last_user_msg = messages[-1]["content"]
        chat_session = self.model.start_chat(history=genai_history)

        # First model call
        response = chat_session.send_message(last_user_msg)

        tool_calls_log: list[dict] = []

        for _iteration in range(self.MAX_ITERATIONS):
            # Collect all function calls in this response
            fn_calls = [
                part.function_call
                for part in response.candidates[0].content.parts
                if hasattr(part, "function_call") and part.function_call.name
            ]
            if not fn_calls:
                break

            # Execute all function calls
            fn_parts = []
            for fc in fn_calls:
                tool_name = fc.name
                tool_args = dict(fc.args)
                tool_calls_log.append({"tool": tool_name, "args": tool_args})

                result = execute_tool(tool_name, tool_args, db, user)
                fn_parts.append(
                    genai.protos.Part(
                        function_response=genai.protos.FunctionResponse(
                            name=tool_name,
                            response={"result": json.dumps(result, default=str)},
                        )
                    )
                )

            # Feed all results back together
            response = chat_session.send_message(
                genai.protos.Content(parts=fn_parts)
            )

        # Extract final text
        final_text = _extract_text(response)

        # Build updated messages (append assistant turn)
        updated = list(messages) + [
            {"role": "assistant", "content": final_text}
        ]

        return {
            "response": final_text,
            "tool_calls": tool_calls_log,
            "updated_messages": updated,
        }


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def _extract_text(response: Any) -> str:
    """Safely extract text from a Gemini response object."""
    try:
        return response.text
    except Exception:
        pass
    try:
        parts = response.candidates[0].content.parts
        return " ".join(p.text for p in parts if hasattr(p, "text") and p.text)
    except Exception:
        return "I was unable to generate a response. Please try again."
