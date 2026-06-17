import type { EChartsOption } from "echarts";
import { GRID } from "../chartTokens";
import { colorForSeries } from "../chartColorRules";
import { getChartToolbox } from "../chartToolbox";
import { mergeTooltipBase, seriesEmphasisCartesian } from "../chartUtils";

export type ScatterPoint = { name: string; x: number; y: number; z?: number; color?: string };

export function buildScatterChartOption(
  points: ScatterPoint[],
  xName: string,
  yName: string,
  zName?: string
): EChartsOption {
  return {
    toolbox: getChartToolbox("minimal"),
    grid: GRID.default,
    tooltip: mergeTooltipBase({
      trigger: "item",
      formatter: (p) => {
        const params = p as { data?: ScatterPoint; color?: string };
        const d = params.data;
        if (!d) return "";
        const zLine = zName && d.z != null ? `<br/>${zName}: ${d.z}` : "";
        return `<b>${d.name}</b><br/>${xName}: ${d.x}<br/>${yName}: ${d.y}${zLine}`;
      },
    }),
    xAxis: {
      type: "value",
      name: xName,
      nameTextStyle: { fontSize: 10, color: "#94a3b8" },
      axisLabel: { color: "#94a3b8", fontSize: 11 },
      splitLine: { lineStyle: { color: "#f0f0f0" } },
    },
    yAxis: {
      type: "value",
      name: yName,
      nameTextStyle: { fontSize: 10, color: "#94a3b8" },
      axisLabel: { color: "#94a3b8", fontSize: 11 },
      splitLine: { lineStyle: { color: "#f0f0f0" } },
    },
    series: [
      {
        type: "scatter",
        symbolSize: (val) => {
          const arr = val as number[];
          const z = arr[2];
          return z != null ? Math.max(8, Math.min(40, z / 10)) : 12;
        },
        data: points.map((p, i) => ({
          name: p.name,
          value: [p.x, p.y, p.z ?? 10],
          itemStyle: { color: p.color ?? colorForSeries(i), opacity: 0.75 },
        })),
        ...seriesEmphasisCartesian(),
      },
    ],
  };
}
