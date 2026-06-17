import type { EChartsOption } from "echarts";
import { GRID, TEXT_COLOR } from "../chartTokens";
import { thresholdColor } from "../chartColorRules";
import { horizontalCategoryYAxis } from "../chartAxis";
import { getChartToolbox } from "../chartToolbox";
import { mergeTooltipBase, seriesEmphasisCartesian } from "../chartUtils";

export function buildSemanticHorizontalBarOption(names: string[], pcts: number[]): EChartsOption {
  return {
    toolbox: getChartToolbox("minimal"),
    grid: { ...GRID.hBar, right: 40 },
    tooltip: mergeTooltipBase({
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        return `<b>${p?.name ?? ""}</b><br/>Success: ${p?.value}%`;
      },
    }),
    xAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: { color: "#94a3b8", fontSize: 10, formatter: "{value}%" },
      splitLine: { lineStyle: { color: "#f0f0f0" } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      ...horizontalCategoryYAxis(names),
      axisLabel: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: "Success rate",
        type: "bar",
        data: pcts.map((v) => ({
          value: v,
          itemStyle: { color: thresholdColor(v) },
        })),
        barMaxWidth: 20,
        label: {
          show: true,
          position: "right",
          formatter: "{c}%",
          fontSize: 10,
          color: TEXT_COLOR,
        },
        ...seriesEmphasisCartesian(),
      },
    ],
  };
}
