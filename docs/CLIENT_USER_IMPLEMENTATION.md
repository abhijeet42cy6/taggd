# Client portal user (`client_user`) — implementation record

This document records the **client portal** account type added to the platform: read-only users scoped to **assigned projects** and an explicit **vertical (module) allow-list**, configurable by platform administrators in **Users & access**.

---

## Goals

- Introduce a `**client_user`** role for external stakeholders who should see **only** selected dashboards.
- Enforce **read-only** behavior at the HTTP layer (no writes except safe methods).
- Reuse existing `**users.vertical_access_json`** as the list of allowed module keys (same vocabulary as `**VERTICAL_KEYS**` in `backend/auth/profile.py`).
- Reuse `**user_project_assignments**` for project scope (same resolution path as operations / project head / recruiter for restricted project sets).

---

## Canonical model


| Aspect                    | Behavior                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Stored role**           | `client_user` (string on `users.role`)                                                                                                    |
| **Effective role**        | `client_user` (no legacy alias)                                                                                                           |
| **Project scope**         | `allowed_project_ids` → **non-null set** from `UserProjectAssignment` rows (empty set = no projects until admin assigns)                  |
| **Module scope**          | `vertical_access_json` → **allow-list** of keys from `VERTICAL_KEYS`; empty or missing list denies gated modules                          |
| **Writes**                | Blocked for all non-safe HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`, …)                                                               |
| **Reads (gated modules)** | Sub-routers use `require_vertical("<key>")`; legacy `main.py` GET paths use `ClientVerticalReadGuardMiddleware` prefix → vertical mapping |


---

## Backend changes

### 1. `backend/auth/profile.py`

- Added `**ROLE_CLIENT_USER = "client_user"`**.
- Included `**client_user**` in `**CANONICAL_ROLES**`.
- `**UserAccessProfile**`: new `**is_client_user**` property.
- `**resolve_user_profile**`: `client_user` grouped with project-scoped roles — `**project_ids = set(assignments)**`, `**vertical_keys**` from `_vertical_keys_from_user` (same as operations / project_head / recruiter).
- `**profile_to_me_dict**`: exposes `**is_read_only: true**` when `effective_role == client_user` (for the SPA).
- `**profile_may_access_vertical(profile, vertical_key)**`:
  - `**operations**`: existing `operations_may_access_vertical` rules.
  - `**client_user**`: allow only if `vertical_keys` is non-empty and contains the key (case-insensitive).
  - **All other roles**: `True` (unchanged behavior for `require_vertical` on those roles).

### 2. `backend/auth/verticals.py`

- `**require_vertical`** now calls `**profile_may_access_vertical**` instead of only checking operations.
- Error copy generalized: *“Vertical '…' not enabled for this account”*.

### 3. `backend/auth/client_write_guard.py` (new)

- **ClientWriteGuardMiddleware**: if `request.state.user` exists and `effective_role(user) == client_user`, and the method is not in `{GET, HEAD, OPTIONS}` → **403** *unless* the request matches **`client_user_mutation_allowed`** (self-service profile): **`PATCH /auth/me/profile`**, **`POST /auth/me/avatar`**, **`DELETE /auth/me/avatar`**. Add new path/method pairs to `_CLIENT_USER_WRITE_ALLOWLIST` when introducing other client-safe writes.

### 4. `backend/auth/client_vertical_read_guard.py` (new)

- For `**client_user`** only, on `**GET` / `HEAD**`:
  - Skips paths that are owned by sub-routers (they already enforce `require_vertical`):  
  `/finance`, `/sla`, `/wfm`, `/revenue-trackers`, `/revenue-billing`, `/candidates`, `/contracts`, `/meetings`, `/vendor-licenses`, `/tasks`.
  - For other paths, longest-prefix match against a fixed table, e.g.:
    - `/ingestion/events` → `ingestion`
    - `/activity/log` → `portfolio` (proxy; no dedicated activity vertical key)
    - `/data-ops` → `data_operations`
    - `/clients`, `/projects` → `clients`
    - `/records` → `requisitions`
    - `/stats` → `portfolio`
  - If a match applies and `**profile_may_access_vertical**` fails → **403**.

**Operational note:** New top-level **read** routes in `main.py` that should respect client module keys should either be added to this prefix map or moved under a router with `require_vertical`.

### 5. `backend/main.py`

- Middleware order (first registered = innermost in Starlette; **last** registered runs **first** on the request):
  1. `ClientVerticalReadGuardMiddleware`
  2. `ClientWriteGuardMiddleware`
  3. `AuthMiddleware`
  4. (existing) `CORSMiddleware` — as already configured earlier in the file.

So `**AuthMiddleware` runs first** on the request, attaches `**request.state.user`**, then write guard, then read guard, then CORS/app.

### 6. Sub-routers — `require_vertical` on router `dependencies`

Each of these routers now declares `**dependencies=[Depends(require_vertical("<VERTICAL_KEY>"))]**` so `**client_user**` (and `**operations**`) are gated consistently:


| Router file                           | Prefix              | Vertical key       |
| ------------------------------------- | ------------------- | ------------------ |
| `routers/wfm_benchmark.py`            | `/wfm`              | `wfm`              |
| `routers/revenue_trackers.py`         | `/revenue-trackers` | `revenue_forecast` |
| `routers/revenue_billing.py`          | `/revenue-billing`  | `revenue_billing`  |
| `routers/candidates.py`               | `/candidates`       | `candidates`       |
| `routers/project_contracts.py`        | `/contracts`        | `contracts`        |
| `routers/meetings.py`                 | `/meetings`         | `meetings`         |
| `routers/resume_supplier_licenses.py` | `/vendor-licenses`  | `vendor_licenses`  |
| `routers/tasks.py`                    | `/tasks`            | `tasks`            |


**Already present:** `finance_ledger` (`finance`), `sla_metrics` (`sla`).

### 7. `backend/admin/routes.py`

- `**VALID_ROLES`**: includes `**client_user**`.
- `**UserCreate**`: optional `**vertical_access: Optional[List[str]]**`.
  - On create, if `**vertical_access**` is sent, keys validated against `**VERTICAL_KEYS**`.
  - If normalized role is `**client_user**`, `**vertical_access_json**` must end up **non-empty** or **400**.
- `**patch_user`**: after applying updates, if `**effective_role(u) == client_user**`, `**vertical_access_json**` must be a **non-empty list** or **400**.
- `**set_user_projects`**: if user is `**client_user**`, `**project_ids**` cannot be empty or **400** (*must be assigned to at least one project*).

### 8. `backend/db/database.py`

- `**User` model docstring** updated to mention `**client_user`**.

### 9. `backend/auth/routes.py` (behavioral, not structural)

- `**GET /auth/me**` continues to merge `**profile_to_me_dict**`, which now includes `**is_read_only**` for client portal accounts.

---

## Frontend changes

### 1. `frontend/src/lib/auth.tsx`

- `**AuthRole**`: added `**client_user**`.
- `**AuthUser**`: `**isReadOnly?: boolean**`; `**refreshMe**` maps `**is_read_only**` from the API.
- `**VERTICAL_TO_NAV_PATHS**`: maps each `**VERTICAL_KEYS**` entry used in the product to **app routes** (e.g. `sla` → `/sla-performance`, `portfolio` → `/` and `/portfolio`).
- `**clientPortalNavPaths(verticalAccess)`**: union of allowed paths from keys.
- `**CLIENT_NAV_PRIORITY**`: deterministic order for picking a **default landing route**.
- `**firstAllowedNavPathForClient`**: first match in priority, or `**/no-access**` if no paths.
- `**isReadOnlyClient(user)**`: `**effectiveRole` / `role` == `client_user**` or `**isReadOnly === true**`.
- `**navAllowedForRole(pathname, role, opts?)**`: optional `**NavAllowedOpts**` with `**effectiveRole**` and `**verticalAccess**`; `**client_user**` uses `**clientPortalNavPaths**` instead of `**ROLE_NAV_PATHS**`.
- `**navRoleKey**`: returns `**client_user**` for that stored role (for consistency; primary routing uses `**navAllowedForRole**` branch).

### 2. `frontend/src/App.tsx`

- `**ClientPortalNoAccess**`: small screen when no modules are enabled (`/no-access`).
- `**AppShell**`: for `**effectiveRole === "client_user"**`, if current path is not allowed → `**<Navigate>**` to `**firstAllowedNavPathForClient**`.
- **Nav filtering** passes `**{ effectiveRole, verticalAccess }`** into `**navAllowedForRole**`.
- **Sidebar role line** shows `**effectiveRole`** (fallback to stored `**role**`).
- **Route**: `**/no-access`** registered.

### 3. `frontend/src/pages/AdminUsers.tsx`

- **Create role option**: “Client portal — read-only dashboards (assigned projects + module list)”.
- **Create flow**: when role is `**client_user`**, **checkboxes** for dashboard modules (all `**VERTICAL_MODULES`** except `**admin_users**`); defaults `**portfolio` + `sla**`; `**createUser**` sends `**vertical_access**` sorted array.
- `**openAccessModal**`: if stored role is `**client_user**` and vertical list empty, draft verticals default to `**portfolio` + `sla**` (instead of “all modules” like internal roles).
- `**saveAccess**`: when `**draftRole === client_user**`, strips `**admin_users**` from saved `**vertical_access**`.
- **Intro copy** updated to describe client portal + shared vertical enforcement.

### 4. `frontend/src/lib/api.ts`

- `**adminApi.createUser`**: body type allows `**vertical_access?: string[]**`.

### 5. `frontend/src/pages/Tasks.tsx`

- Uses `**isReadOnlyClient**`: hides **+ New task**, disables **drag / drop / status move / delete**, blocks opening the edit dialog from cards, shows a short **view-only** notice. (Server still returns **403** on mutating calls.)

---

## Administrator checklist

1. **Create user** → role **Client portal**, select **at least one** dashboard module → submit.
2. **Assign projects** → **at least one** project (required; API rejects empty set for `**client_user`**).
3. Optionally open **Access** to adjust **role / verticals / reports-to** (verticals for client must stay non-empty; `**admin_users`** is stripped on save for clients).

---

## Security / product notes

- **Admin APIs** remain `**require_roles("admin")`**; `**client_user**` cannot call them successfully without already being an admin (not a supported configuration).
- **Read defense in depth**: sub-routers + read guard on selected `**main.py`** prefixes; paths **outside** the read-guard table that do not go through `**require_vertical`** may still be reachable by URL if added later without guards — **extend the guard map or use router-level dependencies** when adding features.
- `**/activity/log`** is tied to `**portfolio**` in the read guard (no `**activity**` key in `**VERTICAL_KEYS**`).

---

## Files touched (reference)


| Area                | Files                                                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile / verticals | `backend/auth/profile.py`, `backend/auth/verticals.py`                                                                                                                             |
| Middleware          | `backend/auth/client_write_guard.py`, `backend/auth/client_vertical_read_guard.py`, `backend/main.py`                                                                              |
| Routers             | `backend/routers/wfm_benchmark.py`, `revenue_trackers.py`, `revenue_billing.py`, `candidates.py`, `project_contracts.py`, `meetings.py`, `resume_supplier_licenses.py`, `tasks.py` |
| Admin / DB          | `backend/admin/routes.py`, `backend/db/database.py`                                                                                                                                |
| Frontend            | `frontend/src/lib/auth.tsx`, `frontend/src/App.tsx`, `frontend/src/pages/AdminUsers.tsx`, `frontend/src/pages/Tasks.tsx`, `frontend/src/lib/api.ts`                                |
| User profile (all roles) | `backend/auth/routes.py`, `backend/auth/avatar_storage.py`, `frontend/src/pages/Profile.tsx`, `frontend/src/components/UserAvatarImg.tsx`, `.gitignore` (`user_avatars/`)         |


---

## Possible follow-ups (not implemented)

- Route-level `**require_vertical**` (or read guard entries) for **every** legacy `**main.py`** GET that should be module-gated.
- **Project-head–scoped** admin to create `**client_user`** only for their projects (today only **platform admin** manages users).
- Dedicated `**activity`** vertical key instead of mapping activity log to `**portfolio**`.
- Read-only UX on **all** data-heavy pages (currently **Tasks** is the primary tailored surface; other pages rely on **403** + nav).

---

*Document generated to record the `client_user` / client portal feature set as implemented in the repository.*