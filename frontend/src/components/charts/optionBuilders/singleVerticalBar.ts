import type { EChartsOption } from "echarts";
import { BAR, GMV_COLOR, GRID, TEXT_COLOR } from "../chartTokens";
import { categoryXAxis, percentYAxis, valueYAxis } from "../chartAxis";
import { getChartToolbox } from "../chartToolbox";
import { getInvoiceTrendDataZoom } from "../chartDataZoom";
import { countAdaptiveAxisFormatter, mergeTooltipBase, seriesEmphasisCartesian } from "../chartUtils";

export function buildPercentVerticalBarOption(
  categories: string[],
  values: (number | null)[],
  seriesName = "Rate",
  color = GMV_COLOR,
): EChartsOption {
  const nums = values.map((v) => (v == null || Number.isNaN(v) ? 0 : v));
  return {
    color: [color],
    toolbox: getChartToolbox("timeseries"),
    grid: GRID.vBar,
    tooltip: mergeTooltipBase({
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        const raw = p?.value;
        const label = raw == null || raw === "" ? "—" : `${raw}%`;
        return `<div style="font-weight:600;margin-bottom:4px">${String((p as { axisValue?: string })?.axisValue ?? "")}</div>
          ${p?.marker ?? ""} ${seriesName}: <b>${label}</b>`;
      },
    }),
    xAxis: categoryXAxis(categories),
    yAxis: percentYAxis(0, 100),
    series: [
      {
        name: seriesName,
        type: "bar",
        data: nums,
        barMaxWidth: BAR.maxWidthV,
        itemStyle: { borderRadius: BAR.radiusV, color },
        ...seriesEmphasisCartesian(),
      },
    ],
  };
}

export function buildSingleVerticalBarOption(
  categories: string[],
  values: number[],
  seriesName = "Count",
  color = GMV_COLOR
): EChartsOption {
  const maxCount = Math.max(...values, 1);
  return {
    color: [color],
    toolbox: getChartToolbox("timeseries"),
    grid: GRID.vBar,
    dataZoom: getInvoiceTrendDataZoom(categories.length),
    tooltip: mergeTooltipBase({
      trigger: "axis",
      axisPointer: { type: "cross", crossStyle: { color: "#cbd5e1" } },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        return `<div style="font-weight:600;margin-bottom:4px">${String((p as { axisValue?: string })?.axisValue ?? "")}</div>
          ${p?.marker ?? ""} ${seriesName}: <b>${p?.value ?? ""}</b>`;
      },
    }),
    xAxis: categoryXAxis(categories),
    yAxis: valueYAxis(countAdaptiveAxisFormatter(maxCount), { minInterval: 1 }),
    series: [
      {
        name: seriesName,
        type: "bar",
        data: values,
        barMaxWidth: BAR.maxWidthV,
        itemStyle: { borderRadius: BAR.radiusV, color },
        label: { show: false },
        emphasis: {
          ...seriesEmphasisCartesian().emphasis,
          label: {
            show: true,
            position: "top",
            fontSize: 11,
            color: TEXT_COLOR,
            formatter: (p) => String(p.value),
          },
        },
        blur: seriesEmphasisCartesian().blur,
      },
    ],
  };
}
