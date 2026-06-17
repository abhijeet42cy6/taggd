import type { EChartsOption } from "echarts";
import { BAR, TEXT_COLOR } from "../chartTokens";
import { categoryXAxis, valueYAxis } from "../chartAxis";
import { mergeTooltipBase } from "../chartUtils";

export type WaterfallItem = { name: string; value: number; isTotal?: boolean };

export function buildWaterfallChartOption(items: WaterfallItem[]): EChartsOption {
  let running = 0;
  const placeholders: number[] = [];
  const values: number[] = [];
  const colors: string[] = [];

  items.forEach((item) => {
    if (item.isTotal) {
      placeholders.push(0);
      values.push(running);
      colors.push("#64748b");
    } else if (item.value >= 0) {
      placeholders.push(running);
      values.push(item.value);
      running += item.value;
      colors.push("#14b8a6");
    } else {
      running += item.value;
      placeholders.push(running);
      values.push(Math.abs(item.value));
      colors.push("#ef4444");
    }
  });

  const categories = items.map((i) => i.name);

  return {
    grid: { left: 8, right: 44, top: 16, bottom: 48, containLabel: true },
    tooltip: mergeTooltipBase({ trigger: "axis", axisPointer: { type: "shadow" } }),
    xAxis: categoryXAxis(categories, { rotate: categories.length > 8 ? 30 : 0 }),
    yAxis: valueYAxis(),
    series: [
      {
        name: "Placeholder",
        type: "bar",
        stack: "waterfall",
        itemStyle: { borderColor: "transparent", color: "transparent" },
        emphasis: { itemStyle: { borderColor: "transparent", color: "transparent" } },
        data: placeholders,
      },
      {
        name: "Value",
        type: "bar",
        stack: "waterfall",
        barMaxWidth: BAR.maxWidthV,
        label: {
          show: true,
          position: "top",
          fontSize: 10,
          color: TEXT_COLOR,
        },
        data: values.map((v, i) => ({
          value: v,
          itemStyle: { color: colors[i], borderRadius: BAR.radiusV },
        })),
      },
    ],
  };
}
