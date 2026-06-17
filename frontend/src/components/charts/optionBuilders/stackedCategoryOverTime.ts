import type { EChartsOption } from "echarts";
import { BAR, TEXT_COLOR } from "../chartTokens";
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
  truncateLabel,
} from "../chartUtils";

export type StackedCategorySeries = { name: string; data: number[]; color?: string; fullName?: string };

export function buildStackedCategoryOverTimeOption(
  weekLabels: string[],
  series: StackedCategorySeries[],
  options?: { showLegend?: boolean },
): EChartsOption {
  const showLegend = options?.showLegend !== false;
  const hasZoom = hasWeeklyZoom(weekLabels.length);
  const maxStack = Math.max(
    1,
    ...weekLabels.map((_, i) => series.reduce((s, ser) => s + (ser.data[i] ?? 0), 0))
  );
  const gridBottom = showLegend ? (hasZoom ? 100 : 72) : hasZoom ? 48 : 28;

  return {
    color: series.map((s, i) => s.color ?? colorForSeries(i)),
    toolbox: getChartToolbox("stacked"),
    dataZoom: getWeeklyCategoryDataZoom(weekLabels.length),
    legend: showLegend
      ? {
          ...legendScroll(hasZoom),
          textStyle: { fontSize: 9, color: TEXT_COLOR },
          bottom: hasZoom ? 34 : 0,
        }
      : { show: false },
    grid: {
      left: 42,
      right: 44,
      top: 12,
      bottom: gridBottom,
      containLabel: true,
    },
    tooltip: mergeTooltipBase({
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const rows = (Array.isArray(params) ? params : [params]) as Array<{
          axisValue?: string;
          seriesName?: string;
          value?: number;
          color?: string;
          seriesIndex?: number;
          marker?: string;
        }>;
        if (!rows.length) return "";
        const header = rows[0].axisValue ?? "";
        const lines = rows
          .filter((p) => (p.value ?? 0) > 0)
          .map((p) => {
            const ser = series[p.seriesIndex ?? 0];
            const label = ser?.fullName ?? ser?.name ?? p.seriesName ?? "";
            return `${p.marker ?? ""}${label}: ${p.value ?? 0}`;
          });
        return [header, ...lines].join("<br/>");
      },
    }),
    xAxis: categoryXAxis(weekLabels, { rotate: weekLabels.length > 10 ? 30 : 0 }),
    yAxis: valueYAxis(countAdaptiveAxisFormatter(maxStack), { minInterval: 1 }),
    series: series.map((s, idx) => ({
      name: truncateLabel(s.name, 28),
      type: "bar" as const,
      stack: "mix",
      barMaxWidth: BAR.maxWidthGroup,
      data: s.data,
      itemStyle: { color: s.color ?? colorForSeries(idx) },
      ...seriesEmphasisCartesian(),
    })),
  };
}
