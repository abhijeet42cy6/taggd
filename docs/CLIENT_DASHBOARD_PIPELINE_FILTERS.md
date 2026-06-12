# Client dashboard — pipeline org filters

This document describes how organisation-level filters work on the **Client dashboard** pipeline panel: what appears in the UI, where values come from in the database, how they are scoped to the displayed client, and how the API applies them.

Reference mock: `excel_files_imp/Client Dashboard UI Interface.html`.

---

## Goals

- Match the HTML mock’s org filter model: **BU/SBU as tabs below the toolbar**, not as a dropdown in the filter bar.
- Provide **Division, SBG, SBU, BHR, and Band** as dropdowns inside the collapsible **Pipeline filters** section.
- Populate every dropdown from **data that exists for the currently displayed client** (and the user’s project access scope).
- Always render all five dropdowns; disable a control when no values are available for that client.

---

## UI layout

```
┌─────────────────────────────────────────────────────────────┐
│  Organisation picker (admin only, multiple clients)           │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Filters & scope (collapsed by default)                     │
│  · SLA reporting range                                      │
│  · Requisition period (period / granularity / compare)        │
│  · Pipeline filters: Division | SBG | SBU | BHR | Band        │
│  · Date ranges: req creation, offer accept, joiner            │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  [ All ] [ BU tag 1 ] [ BU tag 2 ] …   ← BU/SBU tabs          │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Pipeline analytics panel (KPIs, charts, ageing, etc.)      │
└─────────────────────────────────────────────────────────────┘
```

| Surface | Control type | Purpose |
| -------- | ------------- | -------- |
| **Business unit / SBU** | Horizontal tabs below toolbar | Quick slice by project hierarchy tag (`hierarchy_tag_bu` or `hierarchy_tag_sbu`) |
| **Division** | Dropdown in filter bar | Requisition-level division |
| **SBG** | Dropdown in filter bar | Project-level strategic business group |
| **SBU** | Dropdown in filter bar | Project hierarchy tag and/or requisition-level SBU |
| **BHR** | Dropdown in filter bar | Requisition-level business HRBP |
| **Band** | Dropdown in filter bar | Requisition-level grade band |

BU is intentionally **not** duplicated as a filter-bar dropdown. Tabs and dropdowns compose: server applies the five dropdown filters; the active BU tab further scopes pipeline metrics client-side.

---

## Filter inventory

| HTML label | Status | UI control | Data source | Level |
| ----------- | ------ | ----------- | ------------ | ----- |
| All Business Units | Partial | BU/SBU tabs (not dropdown) | `projects.hierarchy_tag_bu`, `projects.hierarchy_tag_sbu` | Project |
| All Divisions | Partial | Dropdown | `records.rpo_division` | Requisition |
| All SBGs | Implemented | Dropdown | `projects.hierarchy_tag_sbg` | Project |
| All SBUs | Partial | Dropdown | `projects.hierarchy_tag_sbu` **or** `records.rpo_bu_sbu` | Project + requisition |
| All BHRs | Partial | Dropdown | `records.rpo_business_hrbp` | Requisition |
| All Bands | Partial | Dropdown | `records.rpo_grade_band` | Requisition |

“Partial” means the control exists and is wired, but coverage depends on whether those fields are populated in ingested data for a given client.

---

## Client scoping

Filter **options** and filtered **metrics** both respect the same scope:

1. **User access** — projects and records are limited by role, assignments, and record access rules (`apply_project_scope`, `apply_record_access_scope`).
2. **Selected organisation** — when an admin picks a client in the org picker, `client_id` is sent to the summary API; projects, records, and filter options are limited to that client.
3. **Client portal users** — automatically scoped to their single client; no org picker.
4. **Config filters** — saved dashboard config may further restrict by vertical/region before records are loaded.

When the org picker changes, pipeline filter state is **reset** and options are recomputed for the new client.

Dropdown values are built from the **full scoped dataset** (all matching projects + requisitions), not from the already-filtered subset. This lets users change or clear a selection without options disappearing.

---

## BU / SBU tabs

Implemented in `backend/routers/client_dashboard.py` as `_bu_tabs()`.

- Groups projects by `hierarchy_tag_bu`, falling back to `hierarchy_tag_sbu` when BU is empty.
- Returns `[]` when no project has either tag (tabs are hidden).
- First tab is always **All** with every scoped project id.
- Subsequent tabs are sorted alphabetically by tag label.

On the frontend (`ClientDashboard.tsx`):

- Tab selection sets `activeTabKey`.
- Pipeline KPIs/charts use `mergePipelineForProjects()` on `pipeline_by_project` for the tab’s `project_ids`.
- SLA blocks use the same project id set for engagement-level metrics.

Tabs do **not** trigger a new API call; dropdown filters do.

---

## Pipeline filter dropdowns

### Option collection

`collect_pipeline_filter_options(projects, records)` in `backend/core/client_pipeline_metrics.py`:

```python
{
  "business_unit": [...],  # from projects.hierarchy_tag_bu (returned for reference; not shown as dropdown)
  "division":      [...],  # records.rpo_division
  "sbg":           [...],  # projects.hierarchy_tag_sbg
  "sbu":           [...],  # union of projects.hierarchy_tag_sbu and records.rpo_bu_sbu
  "bhr":           [...],  # records.rpo_business_hrbp
  "band":          [...],  # records.rpo_grade_band
}
```

Returned on `GET /client-dashboard/summary` as `pipeline_filter_options`.

### Record filtering

`filter_pipeline_records(records, projects_by_id, ...)` applies:

| Parameter | Matches |
| ---------- | -------- |
| `division` | `records.rpo_division` |
| `sbg` | `projects.hierarchy_tag_sbg` on the record’s project |
| `sbu` | `projects.hierarchy_tag_sbu` **or** `records.rpo_bu_sbu` |
| `bhr` | `records.rpo_business_hrbp` |
| `band` | `records.rpo_grade_band` |

Project-level filters require a resolvable `record.project_id` in `projects_by_id`. Records without a project are excluded when an SBG (or SBU-only-on-project) filter is active.

Date-range filters (req creation, offer accept, joiner) are unchanged and combine with org filters using AND logic.

---

## API

### Endpoint

`GET /client-dashboard/summary`

### Pipeline org query parameters

| Parameter | Maps to |
| ---------- | -------- |
| `pipeline_division` | Division |
| `pipeline_sbg` | SBG |
| `pipeline_sbu` | SBU |
| `pipeline_bhr` | BHR |
| `pipeline_band` | Band |

Legacy aliases still accepted for backward compatibility:

- `rpo_division` → division
- `rpo_bu_sbu` → sbu
- `rpo_business_hrbp` → bhr
- `rpo_grade_band` → band

Other pipeline params (unchanged): `pipeline_period`, `pipeline_granularity`, `pipeline_compare`, `req_created_from` / `to`, `offer_from` / `to`, `join_from` / `to`.

### Response fields (filter-related)

```json
{
  "pipeline_filter_options": {
    "business_unit": ["..."],
    "division": ["..."],
    "sbg": ["..."],
    "sbu": ["..."],
    "bhr": ["..."],
    "band": ["..."]
  },
  "bu_tabs": [
    { "key": "all", "label": "All", "project_ids": [1, 2, 3] },
    { "key": "Retail", "label": "Retail", "project_ids": [1, 2] }
  ],
  "pipeline_metrics": { "...": "filtered aggregate" },
  "pipeline_by_project": { "...": "per-project metrics after filter" }
}
```

---

## Frontend

| File | Role |
| ----- | ----- |
| `frontend/src/pages/ClientDashboard.tsx` | Org picker, collapsible filter toolbar, dropdown state, BU tabs, load/reset |
| `frontend/src/lib/client-pipeline-metrics.ts` | `PipelineFilterOptions` type, `mergePipelineForProjects()` |
| `frontend/src/lib/api.ts` | `clientDashboardSummary()` query param wiring |
| `frontend/src/components/tremor-dashboard/ClientPipelineDashboard.tsx` | Pipeline KPIs and charts (consumes filtered `pipeline_metrics`) |

### Filter state shape

```typescript
{
  pipeline_division: "",
  pipeline_sbg: "",
  pipeline_sbu: "",
  pipeline_bhr: "",
  pipeline_band: "",
  req_created_from: "",
  req_created_to: "",
  offer_from: "",
  offer_to: "",
  join_from: "",
  join_to: "",
}
```

Changing a dropdown triggers an immediate summary reload with the new params. Date fields reload on blur. **Reset filters** clears all of the above.

When a dropdown has no options for the current client, the control is **disabled** and shows only the “All …” placeholder.

---

## Backend files

| File | Role |
| ----- | ----- |
| `backend/core/client_pipeline_metrics.py` | `collect_pipeline_filter_options`, `filter_pipeline_records`, `compute_pipeline_metrics` |
| `backend/routers/client_dashboard.py` | Summary route, `_bu_tabs`, scope + filter wiring |
| `backend/db/database.py` | `Project.hierarchy_tag_*`, `Record.rpo_*` columns |

---

## Behaviour notes

- **Admin “all organisations” view** — if no single `client_id` is selected, filter options may span multiple clients. Pick a client in the org picker for client-specific dropdown values.
- **SLA vs pipeline scope** — dropdown filters affect **pipeline metrics** on the server. BU tabs additionally scope both pipeline (client merge) and SLA engagement rows by project id.
- **Empty data** — a filter that has no populated source fields for a client shows a disabled dropdown; it is not hidden.
- **Vertical / Zone** — removed from the pipeline filter bar; they are not part of the HTML org filter spec (config-level vertical/region restrictions still apply via saved dashboard config).

---

## Related docs

- `docs/CLIENT_USER_IMPLEMENTATION.md` — client portal access and scoping
- `docs/CLIENT_AND_PROJECT_STORAGE.md` — project / client storage model
- `DATABASE_SCHEMA.md` — full column reference for `projects` and `records`
