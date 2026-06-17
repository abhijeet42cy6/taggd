import {
  AGEING_COLORS,
  CHART_COLORS,
  FIXED_QUAD_COLORS,
  FUNNEL_COLORS,
  GMV_COLOR,
  PO_COLOR,
  successBarColor,
} from "./chartTokens";

export type ColorMode =
  | "categoricalRotate"
  | "fixedPair"
  | "fixedTriple"
  | "fixedQuad"
  | "semanticThreshold"
  | "semanticAgeing"
  | "funnelStages";

export function colorForSeries(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

export function colorForBar(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

export function colorsForCategories(count: number, mode: ColorMode = "categoricalRotate"): string[] {
  if (mode === "fixedPair") return [GMV_COLOR, PO_COLOR];
  if (mode === "fixedTriple") return [FIXED_QUAD_COLORS[0], FIXED_QUAD_COLORS[1], FIXED_QUAD_COLORS[2]];
  if (mode === "fixedQuad") return [...FIXED_QUAD_COLORS];
  if (mode === "funnelStages") return [...FUNNEL_COLORS];
  if (mode === "semanticAgeing") return [...AGEING_COLORS].slice(0, count);
  return Array.from({ length: count }, (_, i) => colorForSeries(i));
}

export function thresholdColor(value: number): string {
  return successBarColor(value);
}

export function topNPlusOther<T extends { name: string; value: number }>(
  items: T[],
  n = 8
): { top: T[]; other: T | null } {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  if (sorted.length <= n) return { top: sorted, other: null };
  const top = sorted.slice(0, n);
  const rest = sorted.slice(n);
  const otherValue = rest.reduce((s, x) => s + x.value, 0);
  return {
    top,
    other: otherValue > 0 ? ({ name: "Other", value: otherValue } as T) : null,
  };
}

export const OTHER_BUCKET_COLOR = "#64748b";
