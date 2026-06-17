import type { EChartsOption } from "echarts";
import { CHART_COLORS, TEXT_COLOR } from "../chartTokens";
import { colorForSeries } from "../chartColorRules";
import { getChartToolbox } from "../chartToolbox";
import { formatCompactCount, mergeTooltipBase } from "../chartUtils";
import { legendScroll } from "../chartLegend";

export type DonutSlice = { name: string; value: number; fullName?: string };

export function buildDonutPieOption(
  slices: DonutSlice[],
  colors?: string[]
): EChartsOption {
  const data = slices.filter((d) => d.value > 0);
  if (!data.length) return {};

  return {
    color: [...(colors ?? CHART_COLORS)],
    toolbox: getChartToolbox("pie"),
    tooltip: mergeTooltipBase({
      trigger: "item",
      formatter: (p) => {
        const params = p as { marker?: string; name?: string; value?: number; percent?: number; data?: DonutSlice };
        const label = params.data?.fullName ?? params.name ?? "";
        return `${params.marker ?? ""}${label}: ${formatCompactCount(Number(params.value))} (${Number(params.percent).toFixed(1)}%)`;
      },
    }),
    legend: legendScroll(false),
    series: [
      {
        type: "pie",
        radius: ["42%", "68%"],
        center: ["50%", "46%"],
        selectedMode: "single",
        selectedOffset: 8,
        avoidLabelOverlap: true,
        itemStyle: { borderColor: "#fff", borderWidth: 2 },
        label: {
          fontSize: 11,
          color: TEXT_COLOR,
          formatter: (p) => {
            const params = p as { name?: string; value?: number; percent?: number };
            return `${params.name ?? ""}\n${formatCompactCount(Number(params.value))} (${Number(params.percent).toFixed(0)}%)`;
          },
        },
        emphasis: {
          scale: true,
          scaleSize: 6,
          itemStyle: { shadowBlur: 14, shadowColor: "rgba(15,23,42,0.15)" },
        },
        data: data.map((d, i) => ({
          ...d,
          itemStyle: { color: colors?.[i] ?? colorForSeries(i) },
        })),
      },
    ],
  };
}
