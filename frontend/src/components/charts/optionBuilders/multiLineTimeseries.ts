import type { EChartsOption } from "echarts";
import { CHART_COLORS, GRID, LINE, TEXT_COLOR } from "../chartTokens";
import { colorForSeries } from "../chartColorRules";
import { categoryXAxis, valueYAxis } from "../chartAxis";
import { legendScroll } from "../chartLegend";
import { getChartToolbox } from "../chartToolbox";
import { getWeeklyCategoryDataZoom, hasWeeklyZoom } from "../chartDataZoom";
import {
  computeLabelRotate,
  countAdaptiveAxisFormatter,
  mergeTooltipBase,
  seriesEmphasisCartesian,
} from "../chartUtils";

export type MultiLineSeries = { name: string; data: (number | null)[]; color?: string };

export function buildMultiLineTimeseriesOption(
  labels: string[],
  seriesList: MultiLineSeries[],
  yAxisName?: string
): EChartsOption {
  const hasZoom = hasWeeklyZoom(labels.length);
  const maxVol = Math.max(
    1,
    ...seriesList.flatMap((s) => s.data.map((v) => Number(v) || 0))
  );

  return {
    color: seriesList.map((s, i) => s.color ?? colorForSeries(i)),
    animationDuration: 600,
    toolbox: getChartToolbox("timeseries"),
    dataZoom: getWeeklyCategoryDataZoom(labels.length),
    tooltip: mergeTooltipBase({
      trigger: "axis",
      axisPointer: { type: "cross", crossStyle: { color: "#cbd5e1" } },
      formatter: (params) => {
        const items = Array.isArray(params) ? params : [params];
        const head = `<div style="font-weight:600;margin-bottom:4px">${String((items[0] as { axisValue?: string })?.axisValue ?? "")}</div>`;
        const rows = items
          .map(
            (p) =>
              `<div style="margin-top:3px">${p.marker} ${p.seriesName}: <b>${p.value ?? "—"}</b></div>`
          )
          .join("");
        return head + rows;
      },
    }),
    legend: legendScroll(hasZoom),
    grid: {
      left: 48,
      right: 44,
      top: 16,
      bottom: hasZoom ? 88 : 56,
      containLabel: false,
    },
    xAxis: categoryXAxis(labels, {
      boundaryGap: false,
      rotate: computeLabelRotate(labels.length),
    }),
    yAxis: [
      valueYAxis(countAdaptiveAxisFormatter(maxVol), {
        min: 0,
        minInterval: 1,
        name: yAxisName,
      }),
    ],
    series: seriesList.map((s, i) => ({
      name: s.name,
      type: "line" as const,
      smooth: 0.2,
      symbolSize: LINE.symbolSize,
      showSymbol: labels.length <= LINE.dotThreshold,
      data: s.data,
      lineStyle: { width: LINE.width, color: s.color ?? colorForSeries(i) },
      itemStyle: { color: s.color ?? colorForSeries(i) },
      ...seriesEmphasisCartesian(),
    })),
  };
}

/** CM% YoY with reference line */
export function buildCmYoYLineOption(
  months: string[],
  actual: number[],
  prior: number[],
  priorLabel: string,
  targetPct = 35
): EChartsOption {
  const seriesList: MultiLineSeries[] = [
    { name: "CM% Actual", data: actual, color: CHART_COLORS[0] },
    { name: priorLabel, data: prior, color: CHART_COLORS[5] },
    { name: `Target ${targetPct}%`, data: months.map(() => targetPct), color: CHART_COLORS[8] },
  ];
  const opt = buildMultiLineTimeseriesOption(months, seriesList, "%");
  if (opt.yAxis && Array.isArray(opt.yAxis)) {
    opt.yAxis[0] = {
      ...opt.yAxis[0],
      axisLabel: { color: "#94a3b8", fontSize: 10, formatter: "{value}%" },
    };
  }
  return opt;
}
