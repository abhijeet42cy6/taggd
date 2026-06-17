/** Taggd-adapted ECharts design tokens (Dashboard ECharts Design Guide). */

export const CHART_COLORS = [
  "#e16f3d",
  "#14b8a6",
  "#f59e0b",
  "#ef4444",
  "#6366f1",
  "#3884ff",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
  "#0f766e",
  "#d97706",
  "#be185d",
] as const;

export const GMV_COLOR = "#e16f3d";
export const PO_COLOR = "#14b8a6";
export const SUCCESS_RATE_COLOR = "#f59e0b";
export const FAIL_COLOR = "#ef4444";
export const BUDGET_COLOR = "#64748b";
export const FORECAST_COLOR = "#f59e0b";
export const ACTUAL_COLOR = "#e16f3d";
export const PRIOR_FY_COLOR = "#3884ff";

export const AXIS_COLOR = "#94a3b8";
export const GRID_COLOR = "#f0f0f0";
export const TEXT_COLOR = "#334155";
export const BORDER_COLOR = "#e2e8f0";

export function successBarColor(pct: number): string {
  if (pct >= 80) return "#14b8a6";
  if (pct >= 60) return "#f59e0b";
  return "#ef4444";
}

export function gaugeArcColor(pct: number): string {
  return successBarColor(pct);
}

export const FONT = {
  axis: 11,
  axisSm: 10,
  legend: 12,
  legendSm: 10,
  tooltip: 12,
  label: 11,
  gauge: 26,
} as const;

export const GRID = {
  default: { left: 8, right: 44, top: 16, bottom: 48, containLabel: true },
  dualAxis: { left: 8, right: 68, top: 16, bottom: 52, containLabel: true },
  hBar: { left: 8, right: 44, top: 12, bottom: 8, containLabel: true },
  vBar: { left: 8, right: 44, top: 12, bottom: 48, containLabel: true },
} as const;

export const CHART_HEIGHT = {
  sm: 220,
  md: 240,
  lg: 260,
  xl: 300,
  hero: 320,
  zoom: 352,
} as const;

export const BAR = {
  maxWidth: 22,
  maxWidthV: 28,
  maxWidthStack: 32,
  maxWidthGroup: 36,
  radiusH: [0, 4, 4, 0] as [number, number, number, number],
  radiusV: [4, 4, 0, 0] as [number, number, number, number],
  radiusStackTop: [4, 4, 0, 0] as [number, number, number, number],
};

export const LINE = {
  width: 2.5,
  widthRate: 2,
  smooth: true,
  symbolSize: 6,
  dotThreshold: 16,
} as const;

export const CARD_STYLE = {
  borderRadius: 12,
  boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
  border: "1px solid #e2e8f0",
  padding: 24,
} as const;

export const AREA_GRADIENT = {
  gmv: [
    { offset: 0, color: "rgba(225,111,61,0.28)" },
    { offset: 1, color: "rgba(225,111,61,0.02)" },
  ],
  po: [
    { offset: 0, color: "rgba(20,184,166,0.22)" },
    { offset: 1, color: "rgba(20,184,166,0.02)" },
  ],
  accent2: [
    { offset: 0, color: "rgba(20,184,166,0.22)" },
    { offset: 1, color: "rgba(20,184,166,0.02)" },
  ],
} as const;

export const FUNNEL_COLORS = ["#e16f3d", "#f59e0b", "#64748b", "#14b8a6"] as const;

export const SLA_STACK_COLORS = {
  met: "#14b8a6",
  notMet: "#ef4444",
  notReported: "#64748b",
} as const;

export const REQ_STATUS_COLORS = {
  joined: "#14b8a6",
  open: "#e16f3d",
  offer: "#f59e0b",
  cancelled: "#ef4444",
} as const;

export const AGEING_COLORS = ["#15803d", "#0f766e", "#f59e0b", "#b91c1c"] as const;

export const WEEK_SERIES_COLORS = CHART_COLORS.slice(0, 8);

export const FIXED_QUAD_COLORS = [BUDGET_COLOR, ACTUAL_COLOR, FORECAST_COLOR, PRIOR_FY_COLOR] as const;
