# Client onboarding & transition tracker

This document describes the **transition / client onboarding** capability in the platform: how it fits the business process, what is stored, which APIs and UI exist, and how it connects to **Meetings (MoM)** and **Tasks**.

---

## 1. Business process (intended flow)

1. **Commercial / directory** — A project exists under a client; **project head** is assigned (`projects.project_head_user_id` / directory fields). Commercial “signed” context may also live in `**project_contracts`** (`contract_start_date`, etc.).
2. **Transition period** — Several meetings occur (kickoff, workshops, closure). These should be captured as **Minutes of Meeting (MoM)** in `**platform_meetings`** (see **Meetings** in the app). Recommended convention: use `**meeting_type`** values such as `transition_kickoff`, `transition_workshop`, or similar so lists and filters stay consistent.
3. **Transition document** — Operations / project teams maintain **URLs** to the formal transition pack (e.g. SharePoint) in the tracker row (`transition_document_url`). Optional **RPO solution deck** URL (`rpo_solution_deck_url`).
4. **Milestone tracking** — One **tracker row per project** holds dates (signed, kickoff, as-is study, to-be / closure call, soft launch, go-live), attendee summaries, delay reason, and optional **links to MoM rows** via `linked_meeting_ids_json`.
5. **Follow-up work** — Day-to-day actions use the existing **Tasks** module; the Transition UI calls this out explicitly in a checklist (no automatic task generation in v1).

---

## 2. Data model

**Table:** `project_transitions`  
**ORM:** `ProjectTransition` in `backend/db/database.py`  
**Cardinality:** **One row per `project_id`** (`UniqueConstraint` on `project_id`). Deleting a project cascades to its transition row.


| Column                                                                               | Purpose                                                                 |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `project_id`                                                                         | FK → `projects.id`                                                      |
| `status`                                                                             | `draft`, `in_progress`, `soft_launched`, `live`, `delayed`, `cancelled` |
| `project_signed_date` … `go_live_date`                                               | Milestone dates (nullable until known)                                  |
| `transition_done_by_user_id`                                                         | FK → `users.id` (who completed / owns closure)                          |
| `attendees_internal`, `attendees_external`                                           | Free-text rollups                                                       |
| `external_attendees_names`, `external_attendees_contact`, `external_attendees_email` | External stakeholder capture                                            |
| `rpo_solution_deck_url`, `transition_document_url`                                   | Document / deck links (URLs)                                            |
| `dead_days`, `ageing_days`                                                           | Optional **manual overrides**                                           |
| `reason_for_delay`                                                                   | Text                                                                    |
| `linked_meeting_ids_json`                                                            | JSON array of `**platform_meetings.id`** integers                       |
| `created_by_user_id`, `updated_by_user_id`, `system_*`                               | Audit                                                                   |


`**Project.transition_record`** — SQLAlchemy one-to-one from project to its transition row.

**SQLite:** New table is created when the app runs `**init_db()`** / metadata sync on startup (existing deployments pick up the table on next backend start).

---

## 3. Derived metrics (API read)

On **GET**, each row includes:

- `**dead_days_effective`** — Uses stored `dead_days` if set; otherwise calendar days from `**project_signed_date`** to `**go_live_date`** when both exist.
- `**ageing_days_effective**` — Uses stored `ageing_days` if set; otherwise if `**go_live_date**` is set → `0`; else days from **today** to `**kickoff_date`** or `**project_signed_date`** (first available anchor).

List/detail responses also include `**account_name`** / `**engagement_name**` from the parent project for display.

---

## 4. HTTP API

**Router:** `backend/routers/transitions.py`  
**Prefix:** `/transitions`  
**Guard:** Every route uses `**require_vertical("transitions")`** (same pattern as Finance, SLA, Tasks, etc.).


| Method  | Path                                   | Description                                                                    |
| ------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| `GET`   | `/transitions`                         | List transition rows for projects the user may access (`apply_project_scope`). |
| `GET`   | `/transitions/by-project/{project_id}` | Single row; `**assert_project_access`**                                        |
| `POST`  | `/transitions`                         | Body `{ "project_id", "status?"}`. Creates row if none exists for project.     |
| `PATCH` | `/transitions/by-project/{project_id}` | Partial update; logs **activity_log**                                          |


**Activity log:** `resource_type` = `transition`; summaries reference project id.

**Vertical key:** `transitions` is listed in `**VERTICAL_KEYS`** (`backend/auth/profile.py`). Admins enable it per user in **Users & access** (same JSON list as other modules).

**Client read guard:** `GET` traffic under `/transitions` is excluded from the legacy `**ClientVerticalReadGuardMiddleware`** prefix map because the transitions router applies `**require_vertical`** itself (`backend/auth/client_vertical_read_guard.py`).

---

## 5. Frontend


| Piece               | Location                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page                | `frontend/src/pages/Transitions.tsx`                                                                                                               |
| Route               | `/transitions` (registered in `frontend/src/App.tsx`)                                                                                              |
| Nav label           | **Client onboarding** (Operations group)                                                                                                           |
| API helpers         | `queries.transitionsList`, `transitionByProject`, `createTransition`, `patchTransition` + type `ProjectTransitionRow` in `frontend/src/lib/api.ts` |
| Nav / client portal | `transitions` → `/transitions` in `VERTICAL_TO_NAV_PATHS`, `ROLE_NAV_PATHS`, `CLIENT_NAV_PRIORITY` (`frontend/src/lib/auth.tsx`)                   |
| Admin module label  | **Client onboarding (transition)** in `frontend/src/pages/AdminUsers.tsx`                                                                          |
| Project drill-in    | **Transition** button on project detail → `/transitions?project={id}` opens the editor when a tracker already exists                               |


**UX highlights**

- **Checklist** at top: project head → **Meetings** → create tracker → **Tasks**.
- **Start tracker:** dropdown of projects **without** a row yet + **Create tracker**.
- **Pipeline table:** project label, status, key dates, effective dead days / ageing, **Edit** / **View**.
- **Edit dialog:** all milestone and text fields, URLs, overrides, comma-separated **linked MoM meeting IDs**.

`**client_user`:** Treated as **view-only** in the UI (`isReadOnlyClient`); mutating API calls remain blocked by `**ClientWriteGuardMiddleware`** except allowlisted profile routes.

---

## 6. RBAC summary


| Role                           | Typical access                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Platform admin / executive** | Full org or scoped projects; needs `transitions` vertical if enforced like operations.                     |
| **Project head / operations**  | Assigned projects only; must have `**transitions`** in `vertical_access` when vertical allow-list applies. |
| **Recruiter**                  | Only if given the vertical and project scope; often omitted.                                               |
| **Client portal**              | Read-only if `transitions` is in their allow-list; no PATCH/POST to tracker.                               |


---

## 7. Gaps & follow-ups (not in v1)

- **No file upload** for transition PDFs in-app — URLs only.
- **No validation** that `linked_meeting_ids_json` ids belong to the same `project_id`.
- **No auto-sync** from `project_contracts.contract_start_date` to `project_signed_date`.
- **No wizard** that creates Meetings or Tasks automatically.
- **Meeting type** taxonomy (`transition`_*) is a **convention**, not enforced in DB.

---

## 8. Related files (reference)


| Layer             | Files                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Model             | `backend/db/database.py` (`ProjectTransition`, `Project.transition_record`)                          |
| API               | `backend/routers/transitions.py`                                                                     |
| Vertical / keys   | `backend/auth/profile.py`                                                                            |
| App wiring        | `backend/main.py`                                                                                    |
| Client read guard | `backend/auth/client_vertical_read_guard.py`                                                         |
| UI                | `frontend/src/pages/Transitions.tsx`, `frontend/src/App.tsx`, `frontend/src/pages/ProjectDetail.tsx` |
| API client / nav  | `frontend/src/lib/api.ts`, `frontend/src/lib/auth.tsx`, `frontend/src/pages/AdminUsers.tsx`          |


---

## 9. Enabling for a user

1. Open **Users & access** (admin).
2. Edit **vertical access** for the user and include `**transitions`** (alongside `meetings` if they should log MoMs).
3. Ensure **project assignments** cover the engagements they should track.
4. User opens **Client onboarding** from the sidebar (or **Transition** from a project vault page).

---

*This document reflects the implementation as of the `project_transitions` / `/transitions` feature set.*