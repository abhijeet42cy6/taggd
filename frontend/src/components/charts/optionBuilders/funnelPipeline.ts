import type { EChartsOption } from "echarts";
import { FUNNEL_COLORS, TEXT_COLOR } from "../chartTokens";
import { getChartToolbox } from "../chartToolbox";
import { formatCompactCount, mergeTooltipBase } from "../chartUtils";
import { legendBottom } from "../chartLegend";

export type FunnelStage = { name: string; value: number };

export function buildFunnelPipelineOption(stages: FunnelStage[]): EChartsOption {
  const values = stages.map((s) => s.value);
  return {
    color: [...FUNNEL_COLORS],
    toolbox: getChartToolbox("funnel"),
    tooltip: mergeTooltipBase({
      trigger: "item",
      formatter: (p) => {
        const params = p as { marker?: string; name?: string; value?: number };
        return `${params.marker ?? ""}${params.name ?? ""}: ${formatCompactCount(Number(params.value))}`;
      },
    }),
    legend: { ...legendBottom, bottom: 4 },
    series: [
      {
        name: "Pipeline",
        type: "funnel",
        left: "8%",
        top: 16,
        bottom: 40,
        width: "84%",
        min: 0,
        max: Math.max(...values, 1),
        sort: "none",
        gap: 6,
        label: {
          show: true,
          position: "inside",
          formatter: (p) => {
            const params = p as { name?: string; value?: number };
            return `${params.name ?? ""}\n${formatCompactCount(Number(params.value))}`;
          },
          fontSize: 11,
          color: "#fff",
        },
        itemStyle: { borderColor: "#fff", borderWidth: 1 },
        emphasis: {
          focus: "self",
          label: { fontSize: 13, fontWeight: "bold" },
          itemStyle: { shadowBlur: 14, shadowColor: "rgba(15,23,42,0.18)" },
        },
        data: stages.map((s, i) => ({
          ...s,
          itemStyle: { color: FUNNEL_COLORS[i % FUNNEL_COLORS.length] },
        })),
      },
    ],
  };
}
