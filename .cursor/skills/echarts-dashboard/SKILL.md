---
name: echarts-dashboard
description: >-
  Build and migrate dashboard charts with Apache ECharts 5 and Taggd design tokens.
  Use when adding charts to frontend React pages, dashboard_exp static HTML dashboards,
  or migrating from Recharts/Chart.js to ECharts.
---

# ECharts dashboard charts

## Source of truth

| Layer | Path |
|-------|------|
| **Design tokens** | `frontend/src/components/charts/chartTokens.ts` |
| **Tooltip / axis helpers** | `frontend/src/components/charts/chartUtils.ts`, `chartAxis.ts` |
| **Option builders** | `frontend/src/components/charts/optionBuilders/` |
| **React wrapper** | `frontend/src/components/charts/EChartsCanvas.tsx` |
| **Card shell** | `frontend/src/components/charts/ChartCard.tsx` |
| **Platform charts** | `frontend/src/components/platform/Charts.tsx` |
| **Static HTML mirror** | `dashboard_exp/shared/chart-tokens.js`, `echarts-theme.js` |

## React (frontend) workflow

1. Import tokens from `@/components/charts/chartTokens`.
2. Build options via `optionBuilders/*` (e.g. `buildMultiLineTimeseriesOption`, `buildDonutPieOption`).
3. Render inside `ChartCard` + `EChartsCanvas` for loading/empty states and consistent card chrome.
4. Prefer existing builders over ad-hoc options — they encode Taggd colors, grid, tooltip, and emphasis.

## Static HTML (`dashboard_exp`) workflow

1. Load ECharts 5 CDN + `../shared/chart-tokens.js` + `../shared/echarts-theme.js`.
2. Use `mkELine`, `mkEBar`, `mkEDonut` in `dashboard_exp/finance/js/app.js` (parallel to Chart.js `mk*` helpers).
3. Access tokens via `window.TaggdChartTokens`, theme via `window.TaggdEchartsTheme`.

## Migration notes

- **Recharts → ECharts**: Replace `ResponsiveContainer` + Recharts primitives with `EChartsCanvas` + option builders. Tremor `Card` bodies can wrap `ChartCard`.
- **Chart.js → ECharts** (dashboard_exp): Swap `mkBar`/`mkLine`/`mkDoughnut` calls for `mkEBar`/`mkELine`/`mkEDonut` incrementally; canvas hosts are auto-converted to div hosts.
- Keep semantic colors (`ACTUAL_COLOR`, `BUDGET_COLOR`, `successBarColor`) — do not hardcode one-off hex values.

## Do not

- Add new Recharts or Chart.js charts in production frontend paths.
- Duplicate token values outside `chartTokens.ts` / `chart-tokens.js`.
