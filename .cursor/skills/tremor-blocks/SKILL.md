---
name: tremor-blocks
description: >-
  Integrates Tremor dashboard UI into tgddata frontend (Vite + React + Tailwind):
  primary path uses @tremor/react (Tremor NPM) with Tailwind theme merge; optional path
  copies blocks from a local tremor_ui/ gallery clone when present. Use when the user
  mentions Tremor, tremor blocks, tremor_ui, @tremor/react, dashboard cards/charts,
  or wiring tremor-style components into frontend/src.
---

# Tremor blocks & Tremor NPM

## When this applies

Use this skill when adding or changing **Tremor-style dashboard UI** in **`frontend/`** (Vite + React + Tailwind).

**Choose an integration path:**

| Path | When | Source |
|------|------|--------|
| **A — Tremor NPM** | Default for tgddata; production components, official tokens | **`@tremor/react`** + [installation / theming](https://npm.tremor.so/docs/getting-started/installation) |
| **B — tremor_ui gallery** | A full **`tremor_ui/`** clone exists under the repo with `src/content/components/` | Copy TSX from [tremorlabs/tremor-blocks](https://github.com/tremorlabs/tremor-blocks) |

**Before Path B:** Verify `tremor_ui/src/content/` exists. This repo often has **`tremor_ui/` incomplete** (lockfiles only) — then **use Path A only**.

Long-form agent notes: **[docs/TREMOR_BLOCKS_CURSOR_AGENT.md](docs/TREMOR_BLOCKS_CURSOR_AGENT.md)**.

---

## Path A — `@tremor/react` (tgddata standard)

### Packages (frontend)

- **`@tremor/react`** — `Card`, `Title`, `Text`, `Metric`, `Badge`, `ProgressBar`, `Select`, `SelectItem`, `Button`, `Grid`, charts, `Table`, etc.
- **`@tailwindcss/forms`** — required by Tremor’s Tailwind setup (forms plugin).
- **`@headlessui/react`** — peer for `Select` / listbox (keep version compatible with Tremor; see Tremor’s install doc).

Install and versions: follow **current** [Tremor NPM installation](https://npm.tremor.so/docs/getting-started/installation).

### Tailwind (`frontend/tailwind.config.cjs`)

1. **`content`**: include app sources **and** Tremor’s distribution:

   ```text
   "./index.html",
   "./src/**/*.{js,ts,jsx,tsx}",
   "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}",
   ```

2. **`theme.extend`**: merge Tremor’s **`tremor`** and **`dark-tremor`** color palettes, **`boxShadow`** (`tremor-card`, `tremor-input`, …), **`borderRadius`** (`tremor-default`, …), and **`fontSize`** (`tremor-metric`, `tremor-default`, …) from the official snippet — **do not omit** or charts/selects lose styles.

3. **`safelist`**: paste Tremor’s regex **`safelist`** for dynamic `bg-*` / `text-*` / chart colors (required).

4. **`plugins`**: `[require("@tailwindcss/forms")]`.

5. **Product theming:** Extend **`tremor.brand`** (e.g. map to **orange** instead of default blue) while keeping semantic token names so `ProgressBar` / `Card` decoration colors still resolve.

6. Preserve existing **shadcn / CSS variable** colors in **`extend.colors`** alongside Tremor keys so the rest of the app keeps working.

### Where to put components

| Folder | Purpose |
|--------|---------|
| **`frontend/src/components/tremor-dashboard/`** | Page-specific compositions: filter bars, KPI hero cards, section shells wired to app data |
| **`frontend/src/components/tremor-blocks/`** | Reusable chart or block wrappers (e.g. mixed revenue chart inside Tremor `Card` chrome) |

Import from `@tremor/react` in those files; pass **real data via props** from pages or `frontend/src/lib/api.ts` / aggregates — no demo-only arrays in production paths.

### Page wiring pattern

- Wrap dashboard sections in **`Card`** or a small local shell (e.g. `TremorDashboardSection`: header row + `Title` + optional `Button`, then children).
- Prefer **`Text`** / **`Title`** / **`Metric`** for typography instead of custom mono or faint gray utility classes — aligns with Tremor readability defaults.
- **`Grid`** + **`numItems` / `numItemsSm` / `numItemsLg`** for responsive KPI rows.
- Legacy **Recharts** charts can stay inside Tremor **`Card`** bodies until migrated to Tremor charts.

### Verification

- **`npm run build`** in **`frontend/`** (and fix any missing Tremor classes — usually means incomplete Tailwind merge or missing `content` path for `@tremor`).

---

## Path B — Local `tremor_ui/` blocks gallery (optional)

Use only when **`tremor_ui/src/content/`** exists and you need a **specific block** from the gallery.

### Repo map (workspace-relative)

| Role | Path |
|------|------|
| ID → component registry | `tremor_ui/src/content/blocks-components.ts` |
| Block source files | `tremor_ui/src/content/components/<category>/*.tsx` |
| Shared primitives | `tremor_ui/src/components/` |
| `cx` helper | `tremor_ui/src/lib/utils.ts` |

**Naming:** `kpi-card-02.tsx` ↔ registry **`kpi-card-02`** ↔ folder **`kpi-cards`**.

### Find a block

1. **By ID:** Search `blocks-components.ts` for `kpi-card-`, `filterbar-`, `line-chart-`, etc.
2. **By category:** List `tremor_ui/src/content/components/`.
3. List **every `@/` import** in the block — map to **`frontend/`** (`cn` from `@/lib/utils`, or copy primitives).

### Integrate

1. **Copy** into `frontend/src/components/tremor-blocks/` (or `tremor-primitives/` if shared).
2. Replace **`@/lib/utils`** with **`cn`** where equivalent; otherwise add a small **`tremor-cx`** helper.
3. Replace **`@/components/*`** with copied primitives **or** **`@tremor/react`** equivalents if the gallery block overlaps NPM components.
4. Replace demo **`data`** with **props**.
5. Ensure Tailwind **`content`** includes the new files.
6. **Do not** copy `tremor_ui/src/app/` into tgddata unless adopting Next App Router.

Optional gallery dev server: `cd tremor_ui && pnpm dev` (port **3000** — avoid clashing with Vite).

---

## Quick checks (repo root)

```bash
# Path B available?
test -d tremor_ui/src/content/components && echo "tremor_ui blocks present" || echo "use @tremor/react only"

# Find gallery block IDs (when Path B exists)
rg "kpi-card-" tremor_ui/src/content/blocks-components.ts 2>/dev/null || true
```

---

## Verification checklist (either path)

- [ ] **Path chosen:** NPM (`@tremor/react`) vs gallery copy — verified `tremor_ui` presence for Path B.
- [ ] Tailwind: **`@tremor` in `content`**, full **`tremor` theme + safelist + forms** (Path A).
- [ ] Imports resolved; demo data replaced with props / API data.
- [ ] **`npm run build`** in **`frontend/`** passes.
