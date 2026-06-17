import type { EChartsOption } from "echarts";
import { BAR, GRID } from "../chartTokens";
import { categoryXAxis, valueYAxis } from "../chartAxis";
import { legendBottom } from "../chartLegend";
import { getChartToolbox } from "../chartToolbox";
import { countAdaptiveAxisFormatter, mergeTooltipBase, seriesEmphasisCartesian } from "../chartUtils";

export type StackSeries = { name: string; data: number[]; color: string; roundTop?: boolean };

export function buildStackedVerticalBarOption(
  categories: string[],
  series: StackSeries[],
  stackId = "items"
): EChartsOption {
  const maxStack = Math.max(
    1,
    ...categories.map((_, i) => series.reduce((s, ser) => s + (ser.data[i] ?? 0), 0))
  );
  const colors = series.map((s) => s.color);
  return {
    color: colors,
    toolbox: getChartToolbox("stacked"),
    grid: { ...GRID.vBar, bottom: 52 },
    legend: legendBottom,
    tooltip: mergeTooltipBase({
      trigger: "axis",
      axisPointer: { type: "cross", crossStyle: { color: "#cbd5e1" } },
      formatter: (params) => {
        const items = Array.isArray(params) ? params : [params];
        const title = String((items[0] as { axisValue?: string })?.axisValue ?? "");
        const rows = items
          .map((p) => `<div style="margin-top:4px">${p.marker} ${p.seriesName}: <b>${p.value}</b></div>`)
          .join("");
        return `<div style="font-weight:600;margin-bottom:4px">${title}</div>${rows}`;
      },
    }),
    xAxis: categoryXAxis(categories),
    yAxis: valueYAxis(countAdaptiveAxisFormatter(maxStack), { minInterval: 1 }),
    series: series.map((s, idx) => ({
      name: s.name,
      type: "bar" as const,
      stack: stackId,
      data: s.data,
      barMaxWidth: BAR.maxWidthStack,
      itemStyle: {
        borderRadius: s.roundTop ? BAR.radiusStackTop : ([0, 0, 0, 0] as [number, number, number, number]),
        color: s.color,
      },
      ...seriesEmphasisCartesian(),
    })),
  };
}
