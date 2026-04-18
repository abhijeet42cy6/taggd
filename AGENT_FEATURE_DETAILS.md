# Analysis Agent (Nexus Intelligence)

This document describes the **interactive chat agent** in this codebase (distinct from the **ingestion** sheet-mapping agents used during Excel upload). It covers **who can open it**, **how data access is enforced**, and where the code lives.

---

## What it is

- **Product name in UI:** “Taggd Intelligence Agent” / Nexus-style analyst (see `backend/agents/analysis_agent.py` system prompt).
- **Purpose:** Multi-turn **read-only** Q&A over the live database: clients/projects, requisitions, SLA, WFM, finance, portfolio KPIs.
- **Model:** Google **Gemini** (`models/gemini-flash-latest`) with **function calling** (tools), not the Instructor-based pipeline used elsewhere.
- **Tools:** Implemented in `backend/agent_tools/tools.py` and invoked via `**execute_tool(name, args, db, user)`**. Each tool receives the authenticated `**User**` so queries respect admin-assigned **projects** and **vertical modules** (and recruiter requisition scoping where applicable).

The agent **does not** create, update, or delete business data; it only queries and explains.

---

## Architecture (where the code lives)


| Layer                    | Location                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| **UI**                   | `frontend/src/pages/Agent.tsx` — chat UI, markdown rendering, session handling                        |
| **HTTP client**          | `frontend/src/lib/agent-api.ts` — `POST /api/agent/chat`, `DELETE /api/agent/session/:id`             |
| **API routes**           | `backend/main.py` — `POST /agent/chat`, session helpers                                               |
| **Orchestrator**         | `backend/agents/analysis_agent.py` — `AnalysisAgent.chat(..., db, user)`, Gemini loop, tool execution |
| **Tool implementations** | `backend/agent_tools/tools.py` — DB reads gated by auth profile and project scope                     |


**Auth:** Chat requires a logged-in user (`Depends(get_current_user)` on `POST /agent/chat`).

**Sessions:** Conversation history is stored **in memory** on the API process (`_agent_sessions` in `main.py`). Restarting the backend clears sessions. History is capped (last 50 message turns server-side). Session IDs are not bound to user IDs in storage; treat deep links to old session IDs as best-effort only.

---

## Access: who sees the Assistant in the UI


| Audience                                                                                  | Navigation                                                                                                                                                     | Route guard (`navAllowedForRole`)                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Staff** (admin, executive, operations, project_head/manager, recruiter, platform_admin) | **Assistant** link: recruiters under **Data & tools** (`RECRUITER_NAV_GROUPS`); everyone else under **Platform** in `ALL_NAV_GROUPS` (`frontend/src/App.tsx`). | `/agent` must appear in `ROLE_NAV_PATHS` for the resolved role (`frontend/src/lib/auth.tsx`). `/agent` is **not** tied to a single vertical prefix in `STAFF_PATH_VERTICAL_PREFIXES`, so module-restricted staff still get the Assistant; **individual tools** enforce vertical access. |
| **Client portal (`client_user`)**                                                         | Same sidebar groups as above; **Assistant** appears only if the account has **at least one** assigned portal module (non-empty vertical/dashboard assignment). | If `clientPortalNavPaths` is empty, only `/no-access` is allowed (no Assistant).                                                                                                                                                                                                        |


Deep link: `**/agent`** is registered in the app router regardless of role; guards above still apply.

---

## Access: backend data boundaries (admin configuration)

All tool handlers use the resolved access profile (effective role, `vertical_access_json`, allowed projects, recruiter flags) so the model cannot widen scope beyond what **Users & access** grants.

- **Vertical modules:** `profile_may_access_vertical` (`backend/auth/profile.py`) — client users and staff with explicit module lists only see tool paths for allowed keys (e.g. finance, SLA, WFM, requisitions).
- **Projects:** `allowed_project_ids`, `assert_project_access`, `apply_project_scope`, and related helpers in `backend/agent_tools/tools.py` restrict joins and filters to assigned projects.
- **Recruiters:** Requisition/record-style tools apply `**apply_recruiter_record_scope`** so row-level data matches recruiter rules.
- **Tool responses:** The system prompt in `analysis_agent.py` notes that tools may return `**error`** or `**scope_notes**` when the question asks for data outside the user’s scope.

**Client portal writes:** `client_user` accounts are read-only by default (`backend/auth/client_write_guard.py`). `**POST /agent/chat`** is allowlisted so portal users can use the Assistant without opening generic mutating APIs; the agent remains read-only at the DB layer.

---

## Requirements to run

1. `**GEMINI_API_KEY**` must be set in the environment used by the FastAPI process. If it is missing, `AnalysisAgent` raises `RuntimeError("GEMINI_API_KEY not set")` and the API returns **503** on `/agent/chat`.
2. Frontend must reach the backend (same as the rest of the app: Vite proxy `/api` → API).
3. User must be authenticated (JWT) so `/api/agent/chat` succeeds.

---

## Quick verification

1. Set `GEMINI_API_KEY`, start backend and frontend.
2. Sign in as a **narrow** role (e.g. one vertical + one project); open **Assistant** and ask for data **inside** and **outside** that scope — inside should return facts; outside should error or explain scope.
3. Sign in as `**client_user`** with modules assigned — confirm **POST** chat works; with no modules, confirm `/agent` redirects away and chat is not needed.

---

## Related documents

- `**docs/ANALYSIS_AGENT_IMPLEMENTATION.md`** — Deeper DB model and original implementation plan (ingestion agents are a separate subsystem).

## Related code (not the same “agent”)

- **Ingestion pipeline agents** (`SheetIdentifierAgent`, `ColumnMapperAgent`, `LogicGeneratorAgent`, etc.) run during Excel uploads — separate from this chat agent.
- `**frontend/src/components/AgentChat.tsx`** / `**AgentConsole.tsx**` may be legacy or alternate UIs; the primary full-page experience is `**Agent.tsx**`.

---

## Changelog (recent)


| Area                   | Change                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Tools**              | `execute_tool(..., db, user)`; implementations are `fn(db, user, **kwargs)` with project + vertical + recruiter scoping.                 |
| **Orchestrator**       | `AnalysisAgent.chat(..., db, user)` passes `user` into `execute_tool`.                                                                   |
| **API**                | `agent_chat` in `main.py` passes `get_current_user` into the agent.                                                                      |
| **Frontend**           | Assistant link restored for staff in `ALL_NAV_GROUPS`; `client_user` may open `/agent` only when at least one portal module is assigned. |
| **Client write guard** | Allowlist `**POST /agent/chat`** for `client_user`.                                                                                      |
