import { useMemo } from "react";
import { EChartsCanvas } from "@/components/charts/EChartsCanvas";
import { buildVerticalGroupedBarOption, type GroupedBarSeries } from "@/components/charts/optionBuilders";

/** Quarterly grouped bar chart for executive drill-down modals. */
export function QuarterlyGroupedBarChart({
  categories,
  series,
  height = 260,
  emptyMessage = "No quarterly data",
}: {
  categories: string[];
  series: GroupedBarSeries[];
  height?: number;
  emptyMessage?: string;
}) {
  const option = useMemo(() => {
    if (!categories.length || !series.length) return null;
    return buildVerticalGroupedBarOption(categories, series);
  }, [categories, series]);

  return <EChartsCanvas option={option} height={height} emptyMessage={emptyMessage} />;
}
