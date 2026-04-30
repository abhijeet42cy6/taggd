# Executive Overview — Tremor dashboard design style

This document describes the **visual and interaction language** for the Executive Overview (Role Home / Dashboard) after migration to **[Tremor NPM](https://npm.tremor.so/)** (`@tremor/react`). It aligns with the **tremor-blocks** Cursor skill **Path A** (production Tremor components + Tailwind theme merge)—see `.cursor/skills/tremor-blocks/SKILL.md` at the repo root—not the optional `tremor_ui/` gallery clone unless that tree exists.

---

## 1. Principles


| Principle               | Application                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Token-first**         | Prefer Tremor semantic classes (`text-tremor-content-strong`, `border-tremor-border`, `shadow-tremor-card`) so charts and controls stay consistent.                |
| **Accent with intent**  | Orange is the **brand spine**; blue, violet, teal, emerald signal **different domains** (clients, reqs, SLA, WFM, etc.). Red/rose/amber/emerald encode **health**. |
| **Depth without noise** | Soft gradients, single accent bars, and restrained shadows—premium but data-forward.                                                                               |
| **Scannability**        | Section rails, pills, and KPI cards chunk information so executives read top → filters → money → ops → trends in order.                                            |


---

## 2. Typography & fonts


| Layer               | Choice                                                                  | Notes                                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Primary UI font** | **Inter (variable)**                                                    | Loaded via `@fontsource-variable/inter` in `frontend/src/index.css`; `font-sans` on `body`. Matches Tremor’s default reading style.                           |
| **Weights**         | 600–700 for headings and KPI values; 500–600 for labels and filter copy | Avoid ultra-light weights for dashboard metrics.                                                                                                              |
| **Hero page title** | **Gradient clip title** (`.exec-dash-tremor__title`)                    | Decorative gradient text on “Executive Overview” only—warm charcoal → brown → orange. Use sparingly.                                                          |
| **Section titles**  | Tremor `Title` + custom rail                                            | `.exec-dash-tremor__section-head` pairs a short **orange gradient accent bar** with `Title` (`text-lg` / `sm:text-xl`, `tracking-tight`, `text-neutral-900`). |
| **Mono**            | Avoid for primary KPIs                                                  | Legacy mono was removed from hero attainment labels; use **tabular nums** on Tremor `Metric` where alignment matters.                                         |


**Do not** rely on Syne or DM Mono for Executive Overview hero metrics; reserve mono for code-heavy tooling elsewhere if needed.

---

## 3. How Tremor is used (Path A)

### 3.1 Packages

- `**@tremor/react`** — `Card`, `Title`, `Text`, `Metric`, `Badge`, `ProgressBar`, `Select`, `SelectItem`, `Button`, `Grid`, etc.
- `**@tailwindcss/forms`** — required by Tremor’s Tailwind setup (`tailwind.config.cjs`).
- `**@headlessui/react**` — peer for listbox-based `Select`.

### 3.2 Tailwind integration

`frontend/tailwind.config.cjs` includes:

- `**content**`: `./node_modules/@tremor/**/*.{js,ts,jsx,tsx}` alongside `./src/**`.
- **Extended theme**: `tremor` / `dark-tremor` colors, `tremor-*` shadows, radii, and `fontSize` tokens (`tremor-metric`, `tremor-default`, …).
- `**safelist`**: Tremor’s regex safelist for dynamic chart/select colors.
- **Brand override**: `tremor.brand` mapped to **orange** so default Tremor accents match product branding.

### 3.3 File layout (tgddata convention)


| Location                                    | Role                                                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/components/tremor-dashboard/` | Page compositions: filters, KPI heroes, section shells, pulse grid.                                                                    |
| `frontend/src/components/tremor-blocks/`    | Reusable chart shells (e.g. finance mixed chart inside Tremor section chrome).                                                         |
| `frontend/src/styles/exec-dash-premium.css` | **Executive Overview–only** polish: page wash, meta pills, filter shell, hero hover, section rails (scoped under `.exec-dash-tremor`). |


### 3.4 Composition patterns

1. **Outer page**: `Dashboard.tsx` root uses `exec-dash-tremor` + spacing utilities; premium shell styles apply only here.
2. **Filters**: `DashboardFiltersTremor` — `Grid` of `Select`s + `Button`; wrapped in `.exec-dash-tremor__filters-shell` for top orange bar and frosted panel.
3. **Financial KPI row**: `ExecutiveMetricHeroCard` — Tremor `Card` with `decoration="left"` + `decorationColor`, `Metric`, `Badge`, `ProgressBar`, mini quarter bars.
4. **Operational snapshot**: `OperationalPulseCard` / `OperationalPulseGrid` — Tremor `Card` + `Metric` + `Badge`, with `**tone`** (`sky` | `teal` | `violet` | `orange`) for left-border and label color.
5. **Deeper sections**: `TremorDashboardSection` — shared header (optional `tag`, `title`, `titleAccessory`, action `Button`) + body slot.
6. **Charts**: Recharts compositions may remain inside Tremor `Card` / section bodies until migrated to Tremor charts.

---

## 4. Accent colors & semantics

### 4.1 Brand spine — orange

- **Usage**: Primary CTAs (`Button color="orange"`), filter panel **top accent**, section **accent rail**, revenue/collection hero decorations, “modules” meta dot, pulse card for financial risk (unbilled + bad debt).
- **CSS / Tailwind**: Tremor `decorationColor="orange"`, `text-orange-*`, `border-orange-*`, gradients in `exec-dash-premium.css`.

### 4.2 Meta pills (hero strip)

Each pill uses a **colored dot + soft white pill** for quick scanning:


| Dot class            | Meaning                             |
| -------------------- | ----------------------------------- |
| Blue gradient dot    | Client count                        |
| Violet gradient dot  | Requisitions                        |
| Orange gradient dot  | Active fiscal year                  |
| Emerald gradient dot | Modules strip (Finance · SLA · WFM) |


### 4.3 Operational pulse `tone`


| `tone`   | Border / label emphasis | Suggested meaning                     |
| -------- | ----------------------- | ------------------------------------- |
| `sky`    | Sky                     | SLA / observability                   |
| `teal`   | Teal                    | Workforce / capacity                  |
| `violet` | Violet                  | Pipeline / volume                     |
| `orange` | Orange                  | Commercial exposure (unbilled + debt) |


### 4.4 Attainment & badges (financial heroes)

- **Progress bar + % text** (derived from attainment %):  
  - **≥100%** → emerald (on/above plan)  
  - **70–99%** → amber / orange band (watch)  
  - **<70%** → rose (critical gap)
- **YoY / target badges**: Tremor `Badge` with `emerald` | `rose` | `amber` | `slate` mapped from legacy delta chip classes.

### 4.5 Quarter spark bars

- **Plan**: cool **slate** gradient (context).
- **Actual**: **orange** gradient (performance).

---

## 5. Surfaces & motion

- **Page wash**: `.exec-dash-tremor` uses layered **radial gradients** (warm peach / amber) over stone white—see `exec-dash-premium.css`.
- **Filter card**: Frosted white-to-warm gradient, subtle shadow, **3px orange gradient top bar**.
- **Hero KPI cards**: White/orange-tinted gradient body, light ring, **hover lift** + warmer shadow (`.exec-dash-tremor__hero-card`).
- **Pulse cards**: Light gradient fill, colored **left border**, shared hover lift.

Keep motion to **hover feedback** only; no distracting entrance animations on data tiles.

---

## 6. Relationship to tremor-blocks skill


| Skill path                      | Use on Executive Overview                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Path A — `@tremor/react`**    | **Primary.** All dashboard UI described here.                                                                                                      |
| **Path B — `tremor_ui/` clone** | Optional; copy individual blocks only if the gallery exists locally. Map `@/` imports to `@tremor/react` or shared primitives per skill checklist. |


For integration workflow and Tailwind checklist, see `**docs/TREMOR_BLOCKS_CURSOR_AGENT.md`** and `**.cursor/skills/tremor-blocks/SKILL.md`** (repo root).

---

## 7. File reference (implementation)


| Artifact                | Path                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| Premium scoped CSS      | `frontend/src/styles/exec-dash-premium.css`                            |
| Dashboard page          | `frontend/src/pages/Dashboard.tsx`                                     |
| Filters                 | `frontend/src/components/tremor-dashboard/DashboardFiltersTremor.tsx`  |
| Financial heroes        | `frontend/src/components/tremor-dashboard/ExecutiveMetricHeroCard.tsx` |
| Operational pulse       | `frontend/src/components/tremor-dashboard/OperationalPulseCards.tsx`   |
| Section shell           | `frontend/src/components/tremor-dashboard/TremorDashboardSection.tsx`  |
| Tailwind + Tremor theme | `frontend/tailwind.config.cjs`                                         |
| Global font / base      | `frontend/src/index.css`                                               |


---

*Last aligned with Executive Overview Tremor migration (Path A) and `exec-dash-premium` styling.*