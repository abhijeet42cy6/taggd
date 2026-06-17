import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { useEChart, type UseEChartOptions } from "./useEChart";
import { EmptyChartState } from "./EmptyChartState";

export function EChartsCanvas({
  option,
  height = 260,
  emptyMessage = "No data available",
  syncDataZoomGroup,
  className,
}: {
  option: EChartsOption | null;
  height?: number;
  emptyMessage?: string;
  syncDataZoomGroup?: string;
  className?: string;
}) {
  const chartOpts: UseEChartOptions = useMemo(
    () => ({ syncDataZoomGroup }),
    [syncDataZoomGroup]
  );
  const [ref] = useEChart(option, chartOpts);

  if (!option) {
    return <EmptyChartState height={height} message={emptyMessage} />;
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: "100%", height }}
    />
  );
}
