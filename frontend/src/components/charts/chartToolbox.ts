import type { ToolboxComponentOption } from "echarts";

const TB_BASE = {
  orient: "vertical" as const,
  right: 2,
  top: 4,
  itemSize: 15,
  itemGap: 6,
  iconStyle: { borderColor: "#94a3b8" },
  emphasis: { iconStyle: { borderColor: "#475569" } },
  z: 100,
};

const TB_SAVE = {
  type: "png" as const,
  pixelRatio: 2,
  backgroundColor: "#fff",
  title: "Save",
};

export type ChartToolboxKind =
  | "timeseries"
  | "stacked"
  | "bar"
  | "pie"
  | "funnel"
  | "gauge"
  | "minimal";

export function getChartToolbox(kind: ChartToolboxKind): ToolboxComponentOption {
  const restore = { show: true, title: "Reset" };
  const save = { show: true, ...TB_SAVE };

  switch (kind) {
    case "minimal":
      return { ...TB_BASE, feature: { saveAsImage: save } };
    case "gauge":
      return { ...TB_BASE, feature: { saveAsImage: save } };
    case "pie":
    case "funnel":
      return {
        ...TB_BASE,
        feature: { saveAsImage: save, restore },
      };
    case "stacked":
    case "bar":
      return {
        ...TB_BASE,
        feature: {
          saveAsImage: save,
          restore,
          magicType: { type: ["line", "bar", "stack"] as ("line" | "bar" | "stack")[] },
        },
      };
    case "timeseries":
    default:
      return {
        ...TB_BASE,
        feature: {
          saveAsImage: save,
          restore,
          magicType: { type: ["line", "bar"] as ("line" | "bar")[] },
        },
      };
  }
}

/** Dual-axis hero trend — save + reset only (no magicType). */
export function getGmvTrendToolbox(): ToolboxComponentOption {
  return {
    ...TB_BASE,
    feature: {
      saveAsImage: { show: true, ...TB_SAVE },
      restore: { show: true, title: "Reset" },
    },
  };
}
