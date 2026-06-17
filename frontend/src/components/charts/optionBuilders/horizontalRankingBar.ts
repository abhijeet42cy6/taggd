import type { EChartsOption } from "echarts";
import { BAR, GRID, TEXT_COLOR } from "../chartTokens";
import { colorForBar } from "../chartColorRules";
import { valueYAxis, horizontalCategoryYAxis } from "../chartAxis";
import { getChartToolbox } from "../chartToolbox";
import { countAdaptiveAxisFormatter, mergeTooltipBase, seriesEmphasisCartesian } from "../chartUtils";

export function buildHorizontalRankingBarOption(
  names: string[],
  values: number[],
  perBarColors?: string[]
): EChartsOption {
  const maxCount = Math.max(...values, 1);
  return {
    toolbox: getChartToolbox("bar"),
    grid: GRID.hBar,
    tooltip: mergeTooltipBase({
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        return `<b>${p?.name ?? ""}</b><br/>Count: <b>${p?.value ?? ""}</b>`;
      },
    }),
    xAxis: {
      type: "value",
      min: 0,
      minInterval: 1,
      splitNumber: 5,
      axisLabel: {
        color: "#94a3b8",
        fontSize: 11,
        hideOverlap: true,
        formatter: countAdaptiveAxisFormatter(maxCount),
      },
      splitLine: { lineStyle: { color: "#f0f0f0" } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: horizontalCategoryYAxis(names),
    series: [
      {
        type: "bar",
        data: values.map((v, i) => ({
          value: v,
          itemStyle: {
            color: perBarColors?.[i] ?? colorForBar(i),
            borderRadius: BAR.radiusH,
          },
        })),
        barMaxWidth: BAR.maxWidth,
        label: { show: false },
        emphasis: {
          ...seriesEmphasisCartesian().emphasis,
          label: {
            show: true,
            position: "right",
            fontSize: 10,
            color: TEXT_COLOR,
            formatter: (p) => String(p.value),
          },
        },
        blur: seriesEmphasisCartesian().blur,
      },
    ],
  };
}
