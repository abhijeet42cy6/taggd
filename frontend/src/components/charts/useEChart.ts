import { useCallback, useEffect, useRef } from "react";
import type { EChartsOption } from "echarts";
import type { ECharts } from "echarts/core";
import { echarts } from "./echartsSetup";
import { registerDataZoomSync } from "./chartDataZoomSync";

export type UseEChartOptions = {
  syncDataZoomGroup?: string;
};

export function useEChart(
  option: EChartsOption | null,
  chartOpts: UseEChartOptions = {}
) {
  const chartRef = useRef<ECharts | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const syncCleanupRef = useRef<(() => void) | null>(null);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    syncCleanupRef.current?.();
    syncCleanupRef.current = null;
    chartRef.current?.dispose();
    chartRef.current = null;

    if (!node) return;

    const chart = echarts.init(node, null, {
      renderer: "canvas",
      useDirtyRect: true,
    });
    chartRef.current = chart;

    if (chartOpts.syncDataZoomGroup) {
      syncCleanupRef.current = registerDataZoomSync(chartOpts.syncDataZoomGroup, chart);
    }

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(node);
    resizeObserverRef.current = ro;
  }, [chartOpts.syncDataZoomGroup]);

  useEffect(() => {
    if (!chartRef.current || option == null) return;
    const replaceMerge: string[] = ["series"];
    if (option.xAxis !== undefined) replaceMerge.push("xAxis");
    if (option.yAxis !== undefined) replaceMerge.push("yAxis");
    if (option.grid !== undefined) replaceMerge.push("grid");
    if (option.dataZoom !== undefined) replaceMerge.push("dataZoom");
    if (option.toolbox !== undefined) replaceMerge.push("toolbox");
    if (option.legend !== undefined) replaceMerge.push("legend");
    chartRef.current.setOption(option, { lazyUpdate: false, replaceMerge });
  }, [option]);

  return [containerRef, chartRef] as const;
}
