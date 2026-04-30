# Tremor Blocks (`tremor_ui`) — Cursor agent guide

**tgddata `frontend/` primary approach:** The main app integrates **[Tremor NPM](https://npm.tremor.so/)** via **`@tremor/react`** (see `.cursor/skills/tremor-blocks/SKILL.md` — Path A). Use this document when working with an optional **local `tremor_ui/` gallery clone** (Path B) or when copying specific blocks from it.

This document explains the **tremor-blocks** clone under `tremor_ui/`, how to **find** a UI block, and how to **reuse its code** inside **tgddata_C1** (`frontend/`: Vite + React + Tailwind), including practical steps for an automated coding agent.

---

## 1. What this repo is

- **Stack:** Next.js 14 (`next`), React 18, TypeScript, Tailwind CSS 3, MDX-related tooling (`next-mdx-remote`), charts (`recharts`), Radix primitives, TanStack Table, etc. (see `tremor_ui/package.json`).
- **Purpose:** A **gallery of pre-built “blocks”** (dashboard cards, charts, filter bars, tables, logins, empty states, …) implemented as **self-contained TSX files** plus small **shared building blocks** in `src/components/` and utilities in `src/lib/utils.ts`.
- **Official README:** The root `README.md` is mostly the generic Next.js starter text. The **real structure** is under `src/content/` and `src/components/`.

**Local install (already done once with npm):**

```bash
cd tremor_ui
pnpm install   # preferred if you use pnpm (lockfile is pnpm-lock.yaml)
# or
npm install
```

**Run the gallery locally:**

```bash
cd tremor_ui
pnpm dev   # or npm run dev
# → http://localhost:3000 (default Next port; stop tgddata Vite if it also uses 3000)
```

---

## 2. Repository map (where everything lives)


| Area                      | Path                                                   | Role                                                                                                                         |
| ------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Block registry**        | `tremor_ui/src/content/blocks-components.ts`           | Maps string IDs (`'kpi-card-02'`, `'filterbar-01'`, …) to React components. **Start here to resolve an ID to a component.**  |
| **Block implementations** | `tremor_ui/src/content/components/<category>/`         | One folder per category (`kpi-cards`, `line-charts`, `filterbar`, …). Files follow `<name>-NN.tsx` (e.g. `kpi-card-02.tsx`). |
| **Category barrels**      | `tremor_ui/src/content/components/<category>/index.ts` | Re-exports that category’s blocks.                                                                                           |
| **Global barrel**         | `tremor_ui/src/content/components/index.ts`            | Re-exports **all** categories.                                                                                               |
| **Shared UI primitives**  | `tremor_ui/src/components/*.tsx`                       | Tremor-style **Card**, **Button**, chart wrappers, **Select**, **Dialog**, etc. Blocks import these via `@/components/...`.  |
| **Utilities**             | `tremor_ui/src/lib/utils.ts`                           | `**cx()`** (`clsx` + `tailwind-merge`), focus ring class fragments, etc.                                                     |
| **Preview shell**         | `tremor_ui/src/app/ui/blocks-preview.tsx`              | Looks up `blocksComponents[blocksId]` and renders the block inside a padded preview. Shows how IDs are used at runtime.      |
| **Path aliases**          | `tremor_ui/tsconfig.json`                              | `@/*` → `./src/*`. Blocks always use `@/components/...` and `@/lib/utils`.                                                   |
| **Markdown helper**       | `tremor_ui/utils/generate-markdown.js`                 | Script for generating markdown from `src/content/components/` (optional for agents copying TSX only).                        |


**Naming convention:** Block file `kpi-card-02.tsx` ↔ registry key `**kpi-card-02`** ↔ folder `**kpi-cards**`.

---

## 3. How a Cursor agent should **find** the right block

### 3.1 By category (browse)

1. List directories: `tremor_ui/src/content/components/`.
2. Open the category that matches the product need (e.g. `kpi-cards`, `bar-charts`, `tables`, `filterbar`).
3. Open candidate files (`*-01.tsx`, `*-02.tsx`, …) and skim the default `export default function Example()`.

### 3.2 By registry ID (precise)

1. Open `tremor_ui/src/content/blocks-components.ts`.
2. Search for a pattern: `kpi-card`, `filterbar`, `line-chart`, etc.
3. Each key (e.g. `'kpi-card-02'`) maps to `components.KpiCard02` — the **PascalCase** export comes from the category’s `index.ts` re-export of the file’s default component.

### 3.3 Semantic search (Cursor)

Use the codebase tool or grep from repo root:

- *“KPI card grid with change badges”* → search under `tremor_ui/src/content/components/kpi-cards/`.
- *“Table with pagination”* → `tables/`, `table-pagination/`, `table-actions/`.

### 3.4 After picking a file

Note every import line starting with `@/`:

- `@/lib/utils` → `cx`, `focusInput`, …
- `@/components/Card` (and similar) → copy or adapt from `tremor_ui/src/components/`.

---

## 4. How to **use block code** in tgddata (`frontend/`)

The main app is **not** Next.js; it is **Vite + React**. You **do not** mount the whole `tremor_ui` app inside tgddata. You **copy** (or selectively symlink) **the TSX and any shared helpers** you need, then wire data and routes.

### 4.1 Recommended workflow

1. **Pick one block file** (e.g. `tremor_ui/src/content/components/kpi-cards/kpi-card-02.tsx`).
2. **Copy** it into tgddata, e.g. `frontend/src/components/tremor-blocks/KpiCard02.tsx` (create a namespace folder to avoid collisions).
3. **Fix imports:**
  - Replace `@/lib/utils` with either:
    - a small local `cx` helper using `clsx` + `tailwind-merge` (tgddata may already use `cn` from `@/lib/utils` — **prefer reusing `cn`** and delete duplicate `cx` if behavior matches), or
    - copy `cx` from `tremor_ui/src/lib/utils.ts` into a shared `frontend/src/lib/tremor-cx.ts` if you need Tremor’s exact helpers (`focusInput`, etc.).
  - Replace `@/components/Card` (etc.) with:
    - the copied `Card` from `tremor_ui/src/components/Card.tsx`, or
    - your existing **Card** / layout primitives if visuals align.
4. **Replace demo data** inside the block: Tremor blocks usually define a **static `data` array** or constants in-file. Swap for **props** (`interface Props { items: ... }`) and pass data from the parent page or API layer (`frontend/src/lib/api.ts`, etc.).
5. **Tailwind:** Blocks rely on **Tailwind utility classes** (including `dark:`). Ensure `frontend/tailwind.config` content globs include the new file path so classes are not purged.
6. `**'use client'`:** If the block file starts with `'use client'`, keep it for any file that uses hooks or browser-only APIs. In Vite, this directive is **harmless** (ignored); hooks still work in `.tsx` components.

### 4.2 What **not** to do blindly

- Do not copy `**src/app/`** routes from tremor_ui into tgddata unless you intentionally adopt Next App Router.
- **`@tremor/react`:** tgddata **`frontend/`** uses Tremor NPM for dashboard surfaces (Executive Overview, etc.). When **copying gallery-only blocks** from `tremor_ui/`, map `@/components/*` to **`@tremor/react`** where it matches, or copy primitives — check imports in the block file.

### 4.3 Optional: shared primitive package inside the monorepo

If many blocks are adopted, consider a single folder:

- `frontend/src/components/tremor-primitives/` — `Card`, `Button`, `cx`, chart shells copied once from `tremor_ui/src/components/` and `lib/utils.ts`.

Then each block only imports from `@/components/tremor-primitives/...` and stays small.

---

## 5. Agent checklist (copy-paste integration)

- Resolved block ID in `blocks-components.ts` → opened matching `*.tsx` under `content/components/<category>/`.
- Listed all `@/` imports and decided copy vs reuse vs map to existing tgddata UI.
- Replaced static demo data with props or store/API data.
- Verified Tailwind content paths include new files.
- Ran `npm run build` or `npm run dev` in `frontend/` and fixed type/import errors.
- Checked **dark mode** and **responsive** classes if the target page supports them.

---

## 6. Quick reference — useful grep commands

From repository root (`tgddata_C1/`):

```bash
# List block categories
ls tremor_ui/src/content/components

# Find all KPI card variants
ls tremor_ui/src/content/components/kpi-cards

# Find registry entries for filter bars
rg "filterbar-" tremor_ui/src/content/blocks-components.ts

# Find imports of Card in blocks
rg "@/components/Card" tremor_ui/src/content/components --glob "*.tsx"
```

---

## 7. Security / maintenance notes

- `npm install` reported **deprecated Next** and **audit** issues inside `tremor_ui`; that matters if you deploy the gallery. For **copy-only** usage into tgddata, prioritize aligning **React + Tailwind** versions with `frontend/` rather than upgrading the whole tremor_ui app unless needed.
- Treat `tremor_ui` as a **vendor-style reference**: pin or document the git SHA when upgrading the clone.

---

## 8. Summary


| Goal                              | Action                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| Find block by **visual category** | Explore `tremor_ui/src/content/components/<category>/`.                                      |
| Find block by **ID**              | Search `tremor_ui/src/content/blocks-components.ts`.                                         |
| Understand **preview behavior**   | Read `tremor_ui/src/app/ui/blocks-preview.tsx`.                                              |
| Use in **tgddata**                | Copy TSX + dependencies; map `@/` imports; replace demo data; align Tailwind and primitives. |


This gives a Cursor (or human) agent a **repeatable path**: registry → file → imports → copy → adapt → integrate.