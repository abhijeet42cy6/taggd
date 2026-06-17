import { AXIS_COLOR, FONT, GRID_COLOR } from "./chartTokens";

export function categoryXAxis(
  data: string[],
  opts: { boundaryGap?: boolean; rotate?: number; interval?: number | "auto" } = {}
) {
  return {
    type: "category" as const,
    data,
    boundaryGap: opts.boundaryGap ?? true,
    axisLine: { lineStyle: { color: AXIS_COLOR } },
    axisTick: { show: false },
    axisLabel: {
      color: AXIS_COLOR,
      fontSize: FONT.axis,
      hideOverlap: true,
      interval: opts.interval ?? "auto",
      rotate: opts.rotate ?? 0,
    },
    splitLine: { show: false },
  };
}

export function valueYAxis(
  formatter?: (val: number | string) => string,
  opts: { min?: number; max?: number; minInterval?: number; name?: string } = {}
) {
  return {
    type: "value" as const,
    min: opts.min,
    max: opts.max,
    minInterval: opts.minInterval,
    name: opts.name,
    nameTextStyle: { fontSize: FONT.axisSm, color: AXIS_COLOR },
    axisLabel: {
      color: AXIS_COLOR,
      fontSize: FONT.axis,
      hideOverlap: true,
      formatter: formatter ?? ((v: number | string) => String(v)),
    },
    splitLine: { lineStyle: { color: GRID_COLOR } },
    axisLine: { show: false },
    axisTick: { show: false },
  };
}

export function percentYAxis(min = 0, max = 100, labelColor = AXIS_COLOR) {
  return {
    type: "value" as const,
    min,
    max,
    axisLabel: { color: labelColor, fontSize: FONT.axis, formatter: "{value}%" },
    splitLine: { show: false },
    axisLine: { show: false },
    axisTick: { show: false },
  };
}

export function horizontalCategoryYAxis(names: string[]) {
  return {
    type: "category" as const,
    data: names,
    inverse: true,
    axisLine: { lineStyle: { color: AXIS_COLOR } },
    axisTick: { show: false },
    axisLabel: {
      color: AXIS_COLOR,
      fontSize: FONT.axis,
      formatter: (val: string) => (String(val).length > 28 ? `${String(val).slice(0, 26)}…` : val),
    },
  };
}
