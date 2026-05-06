---
name: redesign
description: >-
  Redesigns tgddata frontend pages to Tremor NPM dashboards (@tremor/react): analyze DOM,
  actively replace legacy tables, charts, and buttons with Tremor + tremor-blocks Path A,
  map data to Tremor primitives, apply orange brand accents and Inter typography, refactor
  composition into tremor-dashboard/tremor-blocks, and track work with the task manager.
  Use when migrating or redesigning dashboard pages, Role Home, SLA views, or when the user
  asks to replicate the Executive Overview Tremor approach on another page.
---

# Dashboard redesign (Tremor replication skill)

This skill captures **how Executive Overview was redesigned** so the same approach applies to **other pages**. It complements **`tremor-blocks`** (installation + Tailwind Path A/B). For visual tokens and file index, read **`docs/EXECUTIVE_DASHBOARD_DESIGN_STYLE.md`** when depth is needed.

---

## 1. What we standardized on (Executive Overview)

| Area | Decision |
|------|----------|
| **Component library** | **`@tremor/react`** (Path A — see **`tremor-blocks`** skill). Depend on Tremor for **`Card`**, **`Title`**, **`Text`**, **`Metric`**, **`Badge`**, **`ProgressBar`**, **`Select`** / **`SelectItem`**, **`Button`**, **`Grid`**, **`Flex`**, **`Table`** family (**`TableHead`**, **`TableBody`**, **`TableRow`**, **`TableHeaderCell`**, **`TableCell`**), **`Dialog`** / **`DialogPanel`** for expanded views. Charts may stay Recharts inside Tremor **`Card`** bodies until migrated to Tremor charts. |
| **Tailwind** | Tremor **`content`** glob, **theme extend** (tremor colors, shadows, radii, font sizes), **safelist**, **`@tailwindcss/forms`**. **`tremor.brand`** → **orange** so default Tremor brand accents match product. |
| **Layout code** | **`frontend/src/components/tremor-dashboard/`** — page-specific shells (filters, heroes, pulse grid, **`TremorDashboardSection`**). **`frontend/src/components/tremor-blocks/`** — reusable chart/section wrappers. |
| **Page-only polish** | Scoped CSS under **`.exec-dash-tremor`** in **`frontend/src/styles/exec-dash-premium.css`** (wash, filter shell, hero hover, section rails). Other pages get their own scope class if they need similar polish—do not leak global overrides. |
| **Data** | Props from pages / **`frontend/src/lib/api.ts`** / view-models—no demo fixture arrays in production paths. |

---

## 2. Accent colors (thought process)

1. **Orange = brand spine** — primary actions, section rails, filter top bar, revenue-themed heroes, and “commercial” pulse tiles. Mapped via **`decorationColor="orange"`**, **`Button color="orange"`**, and premium CSS gradients—not one-off hex sprinkled in JSX.
2. **Secondary hues = meaning** — teal / sky / violet / blue distinguish domains (WFM, SLA, pipeline, portfolio metrics) without competing with orange. Pulse cards use a **`tone`** map (left border + label color); KPI rows use **`decoration="top"`** or **`left`** with **`decorationColor`** (`teal`, `blue`, `orange`, etc.).
3. **Semantic health** — emerald / amber / rose (Tremor **`Badge`**, **`ProgressBar`** colors) encode attainment and risk, not decorative palette noise.
4. **Prefer Tremor tokens** — `text-tremor-content-strong`, `shadow-tremor-card`, `ring-tremor-ring` so upgrades and dark mode stay coherent.

---

## 3. Fonts (thought process)

1. **Body / dashboard type** — **Inter (variable)** via app base (`font-sans`). Aligns with Tremor defaults and keeps KPIs readable.
2. **Tremor typography primitives** — Use **`Title`**, **`Text`**, **`Metric`** with **`text-tremor-*`** classes instead of custom faint gray utilities or monospace for primary numbers.
3. **Tables & alignment** — Prefer **`font-variant-numeric: tabular-nums`** with **sans** (`var(--font)` / DM Sans where platform vars apply) rather than **`font-mono`** for executive financial tables.
4. **Decorative exceptions only** — Gradient hero title (`.exec-dash-tremor__title`) is intentional and **scoped**; do not copy that pattern to every page.

---

## 4. How we “depend on” Tremor (avoid brittle one-offs)

- **Import surface** — `@tremor/react` only in **`tremor-dashboard`** / **`tremor-blocks`** (and page wiring), so churn is localized.
- **Shell pattern** — **`TremorDashboardSection`** wraps repeated header rows (**`tag`**, **`Title`**, **`titleAccessory`**, action **`Button`**) so pages stay thin.
- **Vanilla KPI refinement** — Replace custom heavy chrome (e.g. solid full-width header bars) with **`Card`** + **`decoration="top"`** + **`decorationColor`** + **`Metric`** (**`ProductivityAveragesSection`** is the reference).
- **Verification** — After refactors, run **`npm run build`** in **`frontend/`**; missing Tremor classes usually mean incomplete Tailwind merge or **`content`** paths.

---

## 5. Tables, charts, and buttons — explicit Tremor targets (tremor-blocks)

During **Phase A**, deliberately **inventory every table, chart, and button cluster** on the target page (including modals and filter toolbars). During **Phase B/C**, **replace or wrap** them using **`@tremor/react`** per **[tremor-blocks](../tremor-blocks/SKILL.md) Path A**—same pattern as Executive Overview and CEO View (e.g. account intelligence toolbar + **`Dialog`** + **`Table`**).

### Tables

| Look for | Migrate toward |
|----------|----------------|
| Raw **`<table>`** / bespoke **`*.css`** table classes on dashboard routes | Tremor **`Table`** primitives inside **`Card`** or **`TremorDashboardSection`**; **`Text`** / **`Badge`** for status columns; **`text-tremor-*`** + **`tabular-nums`** |
| “Spreadsheet” layouts without a Tremor shell | At minimum: Tremor **`Card`** + header **`Title`**/**`Text`**; toolbars via **`toolbar`** on **`TremorDashboardSection`** or **`Grid`** + **`TextInput`**/**`Select`** |
| Full-screen / “expand” drill-downs | Tremor **`Dialog`** + **`DialogPanel`** + scrollable body + **`Table`** (see **`CeoProjectsPortfolioModal`** pattern in **`tremor-dashboard/`**) |

Extract reusable table compositions into **`frontend/src/components/tremor-blocks/`** or **`tremor-dashboard/`** when the same layout appears more than once.

### Charts

| Look for | Migrate toward |
|----------|----------------|
| Recharts (or other libs) **floating without Tremor chrome** | **`Card`** with **`decoration`** / **`decorationColor`**; chart as child — keeps tokens and section rhythm aligned |
| Page-local chart JSX blobs | Move to **`frontend/src/components/tremor-blocks/`** (e.g. **`CeoViewTremorCharts`**) and pass **props** from the page |
| Opportunity to use Tremor charts | Prefer Tremor chart components when data shape fits; otherwise Recharts-inside-**`Card`** remains valid until migrated |

### Buttons

| Look for | Migrate toward |
|----------|----------------|
| Raw **`<button>`**, ad-hoc classes, or non-Tremor **`Button`** on migrated dashboard surfaces | **`@tremor/react`** **`Button`** — **`color="orange"`** for brand-primary actions, **`variant`** (**`primary`**, **`secondary`**, **`light`**) for hierarchy |
| Icon-only controls | Tremor **`Button`** + **`icon`** when supported; otherwise wrap Lucide icon + **`aria-label`** |
| Toolbar actions (expand, export, reset filters) | **`Flex`**/**`Grid`** alignment with Tremor **`Button`**/**`Select`**/**`TextInput`** so spacing and focus rings stay consistent |

Do **not** leave half-migrated strips (e.g. Tremor **`Card`** but legacy **`button`** or raw **`<table>`** without a deliberate exception).

---

## 6. Thought process summary (why this order)

1. **Freeze data contracts** — Know which props / API fields each block needs before swapping UI.
2. **Match density** — Executives scan filters → money KPIs → ops → trends; mirror that order in layout.
3. **Token-first styling** — Tremor semantic colors before arbitrary Tailwind grays.
4. **Scope premium CSS** — Page wrapper class prevents platform-wide regressions.
5. **Iterate blocks** — Section-by-section replacement preserves shippable increments.
6. **Tables / charts / buttons** — Treat as first-class migration work (section 5), not optional polish.

---

## 7. Agent workflow: replicate on another page

Use the **task manager** (**`TodoWrite`**) for every non-trivial migration: one todo per major section or risk area (**filters**, **KPI row**, **tables**, **charts**, **buttons/toolbars**, **modals**, **empty states**). Mark items **completed** as soon as done; do not leave stale **in_progress**.

### Phase A — Analyze (read-only)

1. Open the **target page** (e.g. `frontend/src/pages/*.tsx`) and list **UI regions**: filters, **tables**, **charts**, **buttons**, cards, modals, empty states.
2. **Explicit pass:** enumerate each **`<table>`** (or table-like component), each **chart** root (Recharts **`ResponsiveContainer`**, etc.), and each **button group** / **`onClick`** control in the route — these are **mandatory migration candidates** for Tremor (section 5, **`tremor-blocks`** Path A).
3. For each region, note **data sources**: hooks, props, **`api.ts`** calls, view-model types.
4. Note **legacy patterns** to retire: inline styles with DM Mono, custom **`PlatformSection`** / **`PlatformKpi`**, ad-hoc borders, non-token colors.

### Phase B — Map to Tremor

| Legacy pattern | Prefer Tremor / convention |
|----------------|---------------------------|
| Filter row | **`Grid`** + **`Select`** / **`SelectItem`** + **`Button`**; optional local shell component |
| Section with title + body | **`TremorDashboardSection`** or **`Card`** + **`Title`** |
| Big number + caption | **`Metric`** + **`Text`** |
| Status / threshold | **`Badge`**, **`ProgressBar`** |
| KPI grid | **`Grid`** + **`numItems`** / **`numItemsSm`** / **`numItemsLg`** |
| Multi-metric cards | **`Card`** + **`decoration`** + **`decorationColor`**; optional **`Flex`** |
| Data table | **`Table`** + **`TableHead`** / **`TableBody`** / **`TableRow`** / **`TableHeaderCell`** / **`TableCell`**; scoped CSS only when Tremor cannot express layout |
| Chart | **`Card`** + chart child; shared charts in **`tremor-blocks/`** |
| Primary / secondary actions | **`Button`** from **`@tremor/react`** with **`color`** / **`variant`**; orange spine for brand actions |

Consult **`docs/EXECUTIVE_DASHBOARD_DESIGN_STYLE.md`** and live references: **`Dashboard.tsx`**, **`DashboardFiltersTremor.tsx`**, **`ExecutiveMetricHeroCard.tsx`**, **`OperationalPulseCards.tsx`**, **`ProductivityAveragesSection.tsx`**, **`CeoView.tsx`**, **`CeoProjectsPortfolioModal.tsx`**, **`CeoViewTremorCharts.tsx`**.

### Phase C — Refactor

1. Extract new compositions into **`tremor-dashboard/`** or **`tremor-blocks/`** when reused or heavy.
2. Keep pages as **wiring**: data fetch + pass props; avoid embedding large JSX blobs.
3. Add scoped CSS only under a **page-specific** wrapper class if Executive-style polish is required.
4. Preserve accessibility: labels on **`Select`s**, **`aria-label`** on icon-only controls, keyboard focus rings.

### Phase D — Verify

- **`npm run build`** in **`frontend/`**
- Quick visual pass: accent hierarchy (orange spine + semantic hues), typography (no accidental mono on primary metrics), responsive **`Grid`** breakpoints.
- Confirm **no stray legacy tables/charts/buttons** on the migrated route unless documented exceptions.

---

## 8. Related docs & skills

| Resource | Role |
|----------|------|
| [tremor-blocks](../tremor-blocks/SKILL.md) | Install checklist, Path A vs B, Tailwind merge |
| **`docs/TREMOR_BLOCKS_CURSOR_AGENT.md`** | Longer agent-oriented Tremor notes |
| **`docs/EXECUTIVE_DASHBOARD_DESIGN_STYLE.md`** | Fonts, accents, files—canonical style reference |

---

## 9. Checklist (copy into conversation when starting a page migration)

```text
- [ ] TodoWrite: sections broken into trackable tasks (include tables, charts, buttons)
- [ ] Phase A: regions + data sources documented; explicit list of tables, charts, button clusters
- [ ] Phase B: Tremor mapping chosen per region (section 5 for tables/charts/buttons)
- [ ] Phase C: new code in tremor-dashboard/ or tremor-blocks/ as appropriate
- [ ] Scoped CSS only if needed (wrapper class)
- [ ] npm run build (frontend) passes
- [ ] No half-migrated tables/charts/buttons left on the page
```
