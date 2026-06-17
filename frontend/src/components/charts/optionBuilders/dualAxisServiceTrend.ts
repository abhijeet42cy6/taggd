import type { EChartsOption } from "echarts";
import { GRID, LINE } from "../chartTokens";
import { categoryXAxis, valueYAxis, percentYAxis } from "../chartAxis";
import { legendBottom } from "../chartLegend";
import { getChartToolbox } from "../chartToolbox";
import { getWeeklyCategoryDataZoom, hasWeeklyZoom } from "../chartDataZoom";
import { daysAxisFormatter, mergeTooltipBase, seriesEmphasisCartesian } from "../chartUtils";

const DAYS_COLOR = "#14b8a6";
const FILL_COLOR = "#7C3AED";

export function buildDualAxisServiceTrendOption(
  labels: string[],
  daySeries: (number | null)[],
  fillSeries: (number | null)[],
  dayName = "Avg delivery (days)",
  fillName = "Avg fill rate"
): EChartsOption {
  const hasZoom = hasWeeklyZoom(labels.length);
  const maxDays = Math.max(...daySeries.map((v) => Number(v) || 0), 1);

  return {
    color: [DAYS_COLOR, FILL_COLOR],
    animationDuration: 600,
    toolbox: getChartToolbox("timeseries"),
    dataZoom: getWeeklyCategoryDataZoom(labels.length),
    grid: {
      left: 52,
      right: 52,
      top: 16,
      bottom: hasZoom ? 88 : 56,
      containLabel: true,
    },
    tooltip: mergeTooltipBase({
      trigger: "axis",
      axisPointer: { type: "cross", crossStyle: { color: "#cbd5e1" } },
    }),
    legend: legendBottom,
    xAxis: categoryXAxis(labels, { boundaryGap: false }),
    yAxis: [
      valueYAxis(daysAxisFormatter(maxDays), { name: "Days" }),
      percentYAxis(0, 100, FILL_COLOR),
    ],
    series: [
      {
        name: dayName,
        type: "line",
        yAxisIndex: 0,
        smooth: 0.2,
        symbolSize: LINE.symbolSize,
        data: daySeries,
        lineStyle: { width: LINE.width, color: DAYS_COLOR },
        ...seriesEmphasisCartesian(),
      },
      {
        name: fillName,
        type: "line",
        yAxisIndex: 1,
        smooth: 0.2,
        symbolSize: LINE.symbolSize,
        data: fillSeries,
        lineStyle: { width: LINE.width, color: FILL_COLOR },
        itemStyle: { color: FILL_COLOR },
        ...seriesEmphasisCartesian(),
      },
    ],
  };
}

/** WFM: fill % bars + productivity line */
export function buildWfmProductivityFillOption(
  names: string[],
  fillPct: number[],
  productivity: number[]
): EChartsOption {
  return {
    color: ["#e16f3d", "#14b8a6"],
    animationDuration: 600,
    toolbox: getChartToolbox("timeseries"),
    grid: GRID.dualAxis,
    tooltip: mergeTooltipBase({ trigger: "axis" }),
    legend: legendBottom,
    xAxis: categoryXAxis(names, { rotate: names.length > 6 ? 38 : 0 }),
    yAxis: [
      { ...percentYAxis(0, "auto" as unknown as number), name: "Fill %" },
      valueYAxis((v) => `${Number(v).toFixed(1)}`),
    ],
    series: [
      {
        name: "Fill rate %",
        type: "bar",
        yAxisIndex: 0,
        data: fillPct,
        barMaxWidth: 28,
        itemStyle: { borderRadius: [4, 4, 0, 0], color: "#e16f3d" },
        ...seriesEmphasisCartesian(),
      },
      {
        name: "Productivity target (lacs)",
        type: "line",
        yAxisIndex: 1,
        data: productivity,
        smooth: 0.2,
        lineStyle: { width: 2.5, color: "#14b8a6" },
        ...seriesEmphasisCartesian(),
      },
    ],
  };
}
