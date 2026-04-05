# Analysis Agent (Nexus Intelligence)

This document describes the **interactive chat agent** in this codebase (distinct from the **ingestion** sheet-mapping agents used during Excel upload). It also explains how to **restore the Agent entry in the sidebar** if it was hidden.

---

## What it is

- **Product name in UI:** “Taggd Intelligence Agent” / Nexus-style analyst (see `backend/agents/analysis_agent.py` system prompt).
- **Purpose:** Multi-turn **read-only** Q&A over the live database: clients/projects, requisitions, SLA, WFM, finance, portfolio KPIs.
- **Model:** Google **Gemini** (`models/gemini-flash-latest`) with **function calling** (tools), not the Instructor-based pipeline used elsewhere.
- **Tools:** Implemented in `backend/agent_tools/` and invoked via `execute_tool()` — e.g. `resolve_client`, `get_project_summary`, `portfolio_overview`, and other DB-backed helpers.

The agent **does not** create, update, or delete data; it only queries and explains.

---

## Architecture (where the code lives)

| Layer | Location |
|--------|-----------|
| **UI** | `frontend/src/pages/Agent.tsx` — chat UI, markdown rendering, session handling |
| **HTTP client** | `frontend/src/lib/agent-api.ts` — `POST /api/agent/chat`, `DELETE /api/agent/session/:id` |
| **API routes** | `backend/main.py` — `POST /agent/chat`, `GET /agent/session/{id}`, `DELETE /agent/session/{id}` |
| **Orchestrator** | `backend/agents/analysis_agent.py` — `AnalysisAgent`, Gemini loop, tool execution |
| **Tool implementations** | `backend/agent_tools/tools.py` (and related modules) |

**Auth:** Chat requires a logged-in user (`get_current_user` on `POST /agent/chat`).

**Sessions:** Conversation history is stored **in memory** on the API process (`_agent_sessions` in `main.py`). Restarting the backend clears sessions. History is capped (last 50 message turns server-side).

---

## Requirements to run

1. **`GEMINI_API_KEY`** must be set in the environment used by the FastAPI process. If it is missing, `AnalysisAgent` raises `RuntimeError("GEMINI_API_KEY not set")` and the API returns **503** on `/agent/chat`.
2. Frontend must reach the backend (same as the rest of the app: Vite proxy `/api` → API).
3. User must be authenticated (JWT) so `/api/agent/chat` succeeds.

---

## Restoring the “Agent” sidebar link

The **Agent** page and route are kept in the app; only the **navigation item** was removed so the link is not shown to any role.

**Route (unchanged):** `GET` app → `/agent` → `frontend/src/pages/Agent.tsx`

To **show Agent again** in the sidebar for everyone who already has route access:

1. Open **`frontend/src/App.tsx`**.
2. In **`ALL_NAV_GROUPS`**, under the **Platform** group, add the nav item back next to the other entries, for example after **Activity log**:

```ts
{ label: "Activity log", path: "/activity" },
{ label: "Agent", path: "/agent" },
{ label: "Users & access", path: "/admin/users" },
```

3. Remove or replace the comment that says the Agent link is hidden (if still present).
4. Rebuild / restart the frontend as you normally do.

**Route access by role** is controlled in **`frontend/src/lib/auth.tsx`** (`ROLE_NAV_PATHS`). `/agent` is already listed for `admin`, `executive`, and `manager`. If a role should not see Agent even after restoring the link, adjust `ROLE_NAV_PATHS` accordingly.

---

## Quick verification

1. Set `GEMINI_API_KEY`, start backend and frontend.
2. Sign in, open **`/agent`** (manually or via sidebar after restore).
3. Send a short message; you should get a reply or a clear API error (503 if the key is missing).

---

## Related (not the same “agent”)

- **Ingestion pipeline agents** (`SheetIdentifierAgent`, `ColumnMapperAgent`, `LogicGeneratorAgent`, etc.) run during Excel uploads — separate from this chat agent.
- **`frontend/src/components/AgentChat.tsx`** / **`AgentConsole.tsx`** may be legacy or alternate UIs; the primary full-page experience is **`Agent.tsx`**.
