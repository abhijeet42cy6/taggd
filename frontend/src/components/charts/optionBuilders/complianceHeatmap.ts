import type { EChartsOption } from "echarts";
import { mergeTooltipBase } from "../chartUtils";

export type HeatmapCell = { month: string; row: string; value: number };

export function buildComplianceHeatmapOption(
  months: string[],
  rows: string[],
  cells: HeatmapCell[]
): EChartsOption {
  const data = cells.map((c) => [
    months.indexOf(c.month),
    rows.indexOf(c.row),
    c.value,
  ]);

  return {
    tooltip: mergeTooltipBase({
      position: "top",
      formatter: (p) => {
        const params = p as { data?: number[] };
        const [mx, ry, val] = params.data ?? [0, 0, 0];
        return `${rows[ry] ?? ""} · ${months[mx] ?? ""}: <b>${val}%</b>`;
      },
    }),
    grid: { left: 80, right: 24, top: 16, bottom: 48 },
    xAxis: {
      type: "category",
      data: months,
      splitArea: { show: true },
      axisLabel: { color: "#94a3b8", fontSize: 10 },
    },
    yAxis: {
      type: "category",
      data: rows,
      splitArea: { show: true },
      axisLabel: { color: "#94a3b8", fontSize: 10 },
    },
    visualMap: {
      min: 0,
      max: 100,
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      inRange: {
        color: ["#ef4444", "#f59e0b", "#14b8a6"],
      },
      textStyle: { color: "#334155", fontSize: 10 },
    },
    series: [
      {
        type: "heatmap",
        data,
        label: {
          show: true,
          fontSize: 9,
          formatter: (p) => {
            const d = p.data as number[] | undefined;
            return `${d?.[2] ?? ""}%`;
          },
        },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.2)" },
        },
      },
    ],
  };
}
