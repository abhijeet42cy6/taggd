# CEO’s View — Slide replication analysis & implementation spec

This document analyses the leadership slides provided as reference images and maps them to a **slide-by-slide** UI plan inside `CeoView` (`frontend/src/pages/CeoView.tsx`), aligned with `design_style_guide.html` and existing `ceo-view.css` / platform tokens.

**Scope note:** The current CEO’s View already implements **live** financial and operational KPIs from the database (revenue, CM%, collection, YoY charts, vertical mix, accounts, etc.). The reference slides add **additional narrative layouts** (composition stacks, waterfalls, hiring mix, people/cost stories) that are mostly **presentation / finance-team numbers** unless wired to APIs. The recommended approach is a **configurable “slide deck” layer** with **defaults matching the slides**, editable via UI, with optional **future API** hydration.

**Operational Pulse (live, board-aligned):** **Revenue per hire** and **Rev / Recruiter (WL1)** on the main CEO shell use `GET /finance/data` rows filtered to the **Taggd joiner sheet cohort** (see `fyRowsTaggdJoinerSheetCohort` and constants in `frontend/src/lib/dashboard-aggregates.ts`). Formulas, fallback behaviour, and ingest prerequisites are documented in **`docs/EXECUTIVE_DASHBOARD_DESIGN_STYLE.md`** §9 and **`FINANCE_METRICS_AND_UPDATES_REFERENCE.md`** §7.

---

## Design system alignment

| Slide element | Map to |
|---------------|--------|
| Page background | `--bg` / `var(--surface-page)` from platform / guide |
| Cards & panels | `.section-card` patterns: `border`, `radius-lg`, `shadow-sm` |
| Accent bar (left rail on callouts) | `border-left: 3px solid var(--accent)` or `var(--entity-orange)` |
| Primary blue (charts) | `var(--blue)` (`#3884ff`) |
| Orange highlights | `var(--accent)` / `var(--amber)` per semantic role |
| Green / red deltas | `var(--green)` / `var(--red)` |
| Typography | Syne for hero titles where used today; body `var(--font)`; labels `var(--mono)` uppercase microcopy |
| Buttons / chips | `.btn`, `.platform-chip` (existing) |

New slide-specific classes should live under **`ceo-view.css`** with a prefix e.g. `.ceo-slide-*` to avoid colliding with global utilities.

---

## Editable configuration architecture (recommended)

1. **Single JSON document** `CeoSlideDeckConfig` (TypeScript type) holding all slide-specific numbers, labels, table rows, bullet strings, and chart series.
2. **Persistence:** `localStorage` key e.g. `tgddata_ceo_slide_deck_v1` for overrides; **defaults** imported from `ceoSlideDeck.defaults.ts` matching the reference slides as closely as possible.
3. **UI:** Top-right of `.ceo-view` (or per-section) **`Edit deck`** → opens a **Sheet** or **Dialog** with either:
   - **JSON editor** (textarea + validate) for power users, or
   - **Tabbed forms** per slide (friendlier, more work).
4. **Reset** button restores factory defaults.
5. **Versioning:** Bump a `version` field in JSON when schema changes.

**Optional later:** `GET/PUT /api/ceo-slide-deck` for server-side storage (role-gated: exec/admin).

---

## Slide inventory & component mapping

### Slide A — *Financial Performance: Revenue & Composition* (reference image 1)

| Block | UI pattern | Data |
|-------|------------|------|
| Title | `h2` centered, Syne/bold | Static string |
| Left: Total revenue by FY | Vertical bar chart (Recharts `BarChart`) | FY24/FY25/FY26E totals |
| Middle: Revenue composition | Stacked bar, 3 series: Existing / Ramp-Up / New | Matrix: year × series |
| Right: 3 metric cards | Mini cards: YoY growth %, Ramp-up share %, Revenue per hire | Numbers + subtitles |
| Bottom: Land & Expand | Callout row: left accent bar + bold label + paragraph | Rich text string |

**Exactness:** Store raw numbers from the slide in defaults; chart reads from config.

**Live data overlap:** Total revenue by FY can eventually be derived from `dashboard-aggregates` + FY filter; composition (Existing/Ramp/New) **may not exist** in DB — treat as **deck-only** until a data model exists.

---

### Slide B — *Scale & Efficiency: Volume, Productivity & Economics* (image 2)

| Block | Pattern | Data |
|-------|---------|------|
| Hiring volume | Bar chart + RPH sub-labels under axis | Joiners per FY + RPH text |
| Revenue / Employee | Line chart (`LineChart`) | 3 points |
| Key success indicators | HTML table, navy header (use `background: color-mix(in srgb, var(--blue) 85%, #1e3a5f)` or similar), zebra rows | Rows: RPH, Headcount, Productivity, CM — columns FY24–FY26 + Δ |
| Efficiency Story | Bottom callout | Paragraph |

**Computed:** Δ column = formula from FY26 vs FY24 (or as stored in config).

---

### Slide C — *Industry Diversification: Balanced Revenue Mix* (image 3)

| Block | Pattern | Data |
|-------|---------|------|
| Donut | `PieChart` donut, colors per industry | FY26E shares |
| Table | FY26 vs FY24 + Shift (pp) | Shift = FY26E − FY24 |

**Computed:** Shift column auto from two percentage columns when editing FY columns.

**Overlap:** Current `CeoView` “vertical mix” table is **revenue-weighted from projects** — different from this slide’s **named industries**. Keep both: live table vs **deck slide** for board storytelling.

---

### Slide D — *New Business & Retention: ACV Pipeline & Retention* (image 4)

| Block | Pattern | Data |
|-------|---------|------|
| Row 1 | 4 small KPI cards | ACV growth, RPH improvement, Churn reduction, Productivity surge |
| Row 2 | 3 FY cards | New ACV + client counts |
| Bottom left | Bar chart (New ACV by year) | 3 bars |
| Bottom right | Numbered list “Sales Engine Strengths” | 4 strings |

All config-driven.

---

### Slide E — *Growth Journey* (image 5)

| Block | Pattern | Data |
|-------|---------|------|
| Left 2×2 grid | Four charts: Revenue YoY, EBITDA+margin line, New ACV, Gross margin | Multi-year series FY25–FY30; highlight FY26 with outline via `Cell` or custom `Bar` |
| Right orange rail | 4 KPI tiles + bullet “strategic highlights” | Config |

High complexity (dual-axis EBITDA chart). Phase 2.

---

### Slide F — *Revenue Bridge FY27* (image 6 — waterfall)

| Block | Pattern | Data |
|-------|---------|------|
| Waterfall | Recharts `BarChart` with stacked floating bars **or** custom SVG | Start + deltas + total; final bar full height |

**Computed:** Running sum for bridge positions; validate user inputs.

---

### Slide G — *Evolving Unit Economics* (image 7)

| Block | Pattern | Data |
|-------|---------|------|
| Single table | Orange header row; summary rows with peach background | Metrics × FY columns |

Indent sub-rows (Direct/Indirect costs) via padding-left on first column.

---

### Slide H — *Hiring Source Mix: FY26* (image 8)

| Block | Pattern | Data |
|-------|---------|------|
| Donut | Overall mix | 5 categories |
| Stacked horizontal bars | Sectors × source series | Matrix |

Footer insights: bullet list (editable strings).

---

### Slide I — *People Capability* (image 9)

| Block | Pattern | Data |
|-------|---------|------|
| Orange banner | 5 inline KPIs | Text + value |
| 3 columns | Cards: Delivery grid (2×2 icons), Leadership list, Pie WL1–WL5 | Icons can be Lucide |

---

### Slide J — *Cost Team Structure* (image 10)

| Block | Pattern | Data |
|-------|---------|------|
| 4 KPI cards | Peach + left border | |
| 3 tables | SBU×Region, Tenure by band, Incentive % grid | Large sparse tables — pure config or CSV import later |

---

### Slide K — *Current app: CEO’s View shell* (image 11 / live)

Already implemented: FY selector, financial hero cards, operational pulse, YoY, CM trend, efficiency, vertical mix, accounts, funnel.

**Integration:** Keep this as **Section 0** (live data). Append **Sections 1–N** as “Board slides” below, collapsible **accordion** or **tabs** (`CEO deck` / `Live metrics`) to avoid an infinitely long page — **recommended UX**.

---

## Implementation phases

| Phase | Deliverable |
|-------|-------------|
| **P0** | TypeScript types + `defaultCeoSlideDeck` JSON matching slide numbers; `localStorage` load/save; **Edit deck** modal (JSON + Reset) |
| **P1** | Render Slides A–D as React sections using Recharts + shared `CeoSlideSection` wrapper |
| **P2** | Waterfall (F), Unit economics table (G), Growth Journey (E) |
| **P3** | Hiring mix (H), People (I), Cost structure (J) |
| **P4** | Optional API persistence; wire any series to real aggregates where definitions exist |

---

## Risks & decisions

1. **Data truth:** Slides are **narrative**; live dashboard remains source for operational KPIs. Label deck sections **“Board narrative (configurable)”** to avoid confusion.
2. **Performance:** Large JSON in React state is fine; lazy-load Recharts if bundle grows.
3. **Accessibility:** Charts need `aria-label` summaries; tables need `<th scope>`.
4. **Mobile:** Slide grids should stack to one column under 960px (match existing `ceo-hero` breakpoints).

---

## File plan (when implementing)

| File | Purpose |
|------|---------|
| `frontend/src/lib/ceo-slide-deck/types.ts` | `CeoSlideDeckConfig` types |
| `frontend/src/lib/ceo-slide-deck/defaults.ts` | Default numbers from reference slides |
| `frontend/src/lib/ceo-slide-deck/storage.ts` | load/save localStorage |
| `frontend/src/components/ceo/CeoSlideDeckEditor.tsx` | Edit / Reset UI |
| `frontend/src/components/ceo/slides/*.tsx` | One file per slide block (optional split) |
| `frontend/src/styles/ceo-view.css` | `.ceo-slide-*` additions |
| `frontend/src/pages/CeoView.tsx` | Compose sections + editor entry point |

---

*Document version: 1.0 — analysis only; implementation tracked separately.*
