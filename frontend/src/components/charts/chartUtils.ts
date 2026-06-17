import type { TooltipComponentOption } from "echarts";

export function mergeTooltipBase(partial: TooltipComponentOption = {}): TooltipComponentOption {
  return {
    appendToBody: true,
    confine: true,
    backgroundColor: "#fff",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    padding: [8, 12],
    extraCssText: "box-shadow:0 4px 16px rgba(0,0,0,0.08);border-radius:8px;",
    textStyle: { color: "#334155", fontSize: 12 },
    ...partial,
  };
}

export function seriesEmphasisCartesian() {
  return {
    emphasis: {
      focus: "series" as const,
      blurScope: "coordinateSystem" as const,
    },
    blur: {
      itemStyle: { opacity: 0.12 },
    },
  };
}

export function rupeesAdaptiveAxisFormatter(maxAbs: number) {
  const cap = Math.max(Number(maxAbs) || 0, 1);
  return (val: number | string) => {
    const v = Number(val);
    if (cap >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
    if (cap >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
    if (cap >= 1e3) return `₹${(v / 1000).toFixed(0)}K`;
    return `₹${Math.round(v)}`;
  };
}

export function countAdaptiveAxisFormatter(maxAbs: number) {
  const cap = Math.max(Number(maxAbs) || 0, 1);
  return (val: number | string) => {
    const v = Number(val);
    if (cap >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
    if (cap >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
    if (cap >= 1e3) return `${(v / 1000).toFixed(1)}k`;
    return `${Math.round(v)}`;
  };
}

export function formatCurrencyINR(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "₹0";
  return `₹${parseFloat(String(value)).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function formatCompactCount(value: number): string {
  const v = Number(value);
  if (v >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
  if (v >= 1e3) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

export function daysAxisFormatter(maxAbs: number) {
  const cap = Math.max(Number(maxAbs) || 0, 0.001);
  return (val: number | string) => {
    const v = Number(val);
    if (cap < 12) return v.toFixed(1);
    if (cap < 40) return `${Math.round(v * 10) / 10}`;
    return `${Math.round(v)}`;
  };
}

export function computeLabelRotate(count: number): number {
  if (count > 16) return 40;
  if (count > 10) return 30;
  return 0;
}

export function computeLabelInterval(count: number): number | "auto" {
  if (count > 24) return Math.floor(count / 12);
  if (count > 16) return 1;
  return "auto";
}

export function truncateLabel(val: string, max = 28): string {
  const s = String(val);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
