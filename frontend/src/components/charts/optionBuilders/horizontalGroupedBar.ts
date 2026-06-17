import type { EChartsOption } from "echarts";
import type { CallbackDataParams } from "echarts/types/dist/shared";
import { BAR, GRID, TEXT_COLOR } from "../chartTokens";
import { horizontalCategoryYAxis, valueYAxis } from "../chartAxis";
import { legendBottom } from "../chartLegend";
import { getChartToolbox } from "../chartToolbox";
import { formatCurrencyINR, mergeTooltipBase, rupeesAdaptiveAxisFormatter, seriesEmphasisCartesian } from "../chartUtils";

export type GroupedBarSeries = { name: string; data: number[]; color: string };

export function buildHorizontalGroupedBarOption(
  names: string[],
  series: GroupedBarSeries[],
  currency = false
): EChartsOption {
  const maxMoney = Math.max(1, ...series.flatMap((s) => s.data));
  const fmt = currency ? rupeesAdaptiveAxisFormatter(maxMoney) : (v: number | string) => String(v);
  const fmtVal = currency ? formatCurrencyINR : (v: number) => String(v);

  return {
    color: series.map((s) => s.color),
    toolbox: getChartToolbox("bar"),
    grid: { ...GRID.hBar, bottom: 40 },
    legend: { ...legendBottom, textStyle: { fontSize: 11, color: TEXT_COLOR } },
    tooltip: mergeTooltipBase({
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) => {
        const items = Array.isArray(params) ? params : [params];
        const lines = items
          .map((p) => `${p.marker} ${p.seriesName}: ${fmtVal(Number(p.value))}`)
          .join("<br/>");
        return `<b>${items[0]?.name ?? ""}</b><br/>${lines}`;
      },
    }),
    xAxis: {
      type: "value",
      min: 0,
      splitNumber: 5,
      axisLabel: { color: "#94a3b8", fontSize: 10, hideOverlap: true, formatter: fmt },
      splitLine: { lineStyle: { color: "#f0f0f0" } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: horizontalCategoryYAxis(names),
    series: series.map((s) => ({
      name: s.name,
      type: "bar" as const,
      data: s.data,
      barMaxWidth: BAR.maxWidth,
      itemStyle: { borderRadius: BAR.radiusH, color: s.color },
      emphasis: {
        ...seriesEmphasisCartesian().emphasis,
        label: {
          show: true,
          position: "right",
          fontSize: 10,
          color: TEXT_COLOR,
          formatter: (p: CallbackDataParams) => fmtVal(Number(p.value)),
        },
      },
      blur: seriesEmphasisCartesian().blur,
    })),
  };
}

/** Vertical grouped bar variant (counts by default; pass currency=true for ₹ axes). */
export function buildVerticalGroupedBarOption(
  categories: string[],
  series: GroupedBarSeries[],
  currency = false,
): EChartsOption {
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const fmt = currency ? rupeesAdaptiveAxisFormatter(max) : (v: number | string) => String(v);
  const fmtVal = currency ? formatCurrencyINR : (v: number) => String(v);
  return {
    color: series.map((s) => s.color),
    toolbox: getChartToolbox("bar"),
    grid: GRID.vBar,
    legend: legendBottom,
    tooltip: mergeTooltipBase({
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) => {
        const items = Array.isArray(params) ? params : [params];
        const lines = items
          .map((p) => `${p.marker} ${p.seriesName}: ${fmtVal(Number(p.value))}`)
          .join("<br/>");
        return `<b>${items[0]?.name ?? ""}</b><br/>${lines}`;
      },
    }),
    xAxis: {
      type: "category",
      data: categories,
      axisLine: { lineStyle: { color: "#94a3b8" } },
      axisTick: { show: false },
      axisLabel: { color: "#94a3b8", fontSize: 11 },
    },
    yAxis: valueYAxis(fmt, { minInterval: currency ? undefined : 1 }),
    series: series.map((s) => ({
      name: s.name,
      type: "bar" as const,
      data: s.data,
      barMaxWidth: BAR.maxWidthGroup,
      itemStyle: { borderRadius: BAR.radiusV, color: s.color },
      ...seriesEmphasisCartesian(),
    })),
  };
}
