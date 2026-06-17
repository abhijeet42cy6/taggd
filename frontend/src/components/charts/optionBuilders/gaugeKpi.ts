import type { EChartsOption } from "echarts";
import { GRID_COLOR, TEXT_COLOR, gaugeArcColor } from "../chartTokens";
import { getChartToolbox } from "../chartToolbox";
import { mergeTooltipBase } from "../chartUtils";

export function buildGaugeKpiOption(pct: number, label = "Fill rate"): EChartsOption {
  const v = Math.min(100, Math.max(0, pct));
  const arcColor = gaugeArcColor(v);

  return {
    toolbox: getChartToolbox("gauge"),
    tooltip: mergeTooltipBase({
      trigger: "item",
      formatter: () =>
        `<div style="font-weight:600">${label}</div><div style="margin-top:4px"><b>${v.toFixed(1)}%</b></div>`,
    }),
    series: [
      {
        type: "gauge",
        radius: "88%",
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 100,
        splitNumber: 5,
        progress: {
          show: true,
          width: 14,
          roundCap: true,
          itemStyle: { color: arcColor },
        },
        axisLine: {
          lineStyle: { width: 14, color: [[1, GRID_COLOR]] },
        },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        title: { show: false },
        detail: {
          valueAnimation: true,
          fontSize: 26,
          fontWeight: 700,
          color: TEXT_COLOR,
          formatter: "{value}%",
          offsetCenter: [0, "5%"],
        },
        data: [{ value: Number(v.toFixed(1)) }],
      },
    ],
  };
}
