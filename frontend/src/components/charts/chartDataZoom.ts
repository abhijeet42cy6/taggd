import type { DataZoomComponentOption } from "echarts";

export function getInvoiceTrendDataZoom(
  count: number,
  threshold = 40
): DataZoomComponentOption[] {
  if (count <= threshold) return [];
  return [
    {
      type: "inside",
      xAxisIndex: 0,
      start: 0,
      end: 100,
      filterMode: "filter",
      zoomOnMouseWheel: true,
      moveOnMouseMove: true,
      moveOnMouseWheel: true,
    },
  ];
}

export function getWeeklyCategoryDataZoom(weekCount: number): DataZoomComponentOption[] {
  if (weekCount <= 10) return [];
  return [
    {
      type: "slider",
      xAxisIndex: 0,
      height: 24,
      bottom: 2,
      fillerColor: "rgba(148, 163, 184, 0.35)",
      backgroundColor: "#f1f5f9",
      borderColor: "#cbd5e1",
      borderRadius: 4,
    },
    { type: "inside", xAxisIndex: 0 },
  ];
}

export function hasWeeklyZoom(weekCount: number): boolean {
  return weekCount > 10;
}
