# Project head resolution and FK sync

This document describes how **accountable project head** is determined for API consumers, and how **`projects.project_head_user_id`** stays aligned when admins change **user ↔ project** assignments.

## Goals

- Prefer a **typed link**: `projects.project_head_user_id` → `users` (display name from profile).
- Use **`user_project_assignments`** as a secondary signal: users whose **effective role** is `project_head` and who are assigned to the project.
- Treat **`projects.project_head`** (string) as **legacy / optional fallback** from ingest or older data.

## Resolution order (display label)

Implemented in `backend/core/project_head_resolution.py`.

| Priority | Source | Condition |
|----------|--------|-------------|
| 1 | `Project.project_head_user` | Linked user exists and `is_active`. Label: `given_name` + `family_name`, else `email`. |
| 2 | Assignments | Exactly **one** active user assigned to the project with `effective_role(user) == "project_head"`. Same display-name rule. |
| 3 | Legacy | Non-empty trimmed `Project.project_head` string. |

If nothing applies, the resolved label is `None`.

### Helpers

- **`user_display_name(user)`** — Builds the display string from name or email.
- **`assigned_project_heads_by_project(db, project_ids)`** — One query over `UserProjectAssignment` + `User`; returns `dict[project_id, list[User]]` for active users with effective role `project_head`.
- **`resolve_project_head_label(project, assigned_heads=None)`** — Applies the table above; `assigned_heads` should be the list from the map for `project.id`.

## ORM

`backend/db/database.py` on **`Project`**:

- Column: `project_head_user_id` (FK to `users.id`, `ON DELETE SET NULL`).
- Relationship: `project_head_user = relationship("User", foreign_keys=[project_head_user_id])` so eager loads can pull the linked user in one graph.

## Finance ledger API

**`GET /finance/data`** (`backend/main.py`):

- Revenue ledger query uses **`joinedload(FinanceMonthlyLedger.project).joinedload(Project.project_head_user)`** so the FK user is available without N+1 queries.
- After revenue rows are keyed by project, **`assigned_project_heads_by_project`** is called once with all distinct `project_id`s in that result set.
- Each serialized row sets **`project_head`** to **`resolve_project_head_label(project, assigned_heads_for_that_project)`**.
- **`practice_head`** remains the raw **`project.practice_head`** string (unchanged by this work).

## Admin: assignment changes sync the FK

**`PUT /admin/users/{user_id}/projects`** (`backend/admin/routes.py` → `set_user_projects`):

Before replacing assignment rows, the handler records **previous** `project_id`s for that user. After inserting the new set, it computes **`removed`** and **`added`** relative to the previous set.

| Change | Action on `projects` |
|--------|----------------------|
| Project **removed** from the user | If `project_head_user_id == user_id`, set **`project_head_user_id` to `NULL`**. |
| Project **newly assigned** to the user | If `effective_role(user) == "project_head"` **and** (`project_head_user_id` is **`NULL`** **or** already **`user_id`**), set **`project_head_user_id = user_id`**. |

If `project_head_user_id` points at **another** user, it is **not** overwritten on assign—treating the FK as an explicit override.

## Operational notes

- Multiple assignment-based “project heads” on one project: resolution **does not** pick one arbitrarily; it falls through to the **legacy string** unless the FK user or **exactly one** assigned head supplies a label.
- **`manager`** is mapped to **`project_head`** in `effective_role` (see `backend/auth/profile.py`); assignment-based discovery uses that effective role.

## Possible extensions

- Reuse **`resolve_project_head_label`** + the same bulk assignment map on other list endpoints (e.g. projects catalog) if the UI should show the same label everywhere.
- Backfill **`project_head_user_id`** from directory data or admin UI where the legacy string is still the only source.
