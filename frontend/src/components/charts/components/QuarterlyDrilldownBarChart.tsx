import { useMemo } from "react";
import { EChartsCanvas } from "@/components/charts/EChartsCanvas";
import { buildSingleVerticalBarOption } from "@/components/charts/optionBuilders";
import { ACTUAL_COLOR } from "@/components/charts/chartTokens";

export type QuarterlyBarPoint = { label: string; value: number };

/** Quarterly drill-down bar chart for executive modals. */
export function QuarterlyDrilldownBarChart({
  data,
  seriesName = "Actual",
  height = 220,
  color = ACTUAL_COLOR,
}: {
  data: QuarterlyBarPoint[];
  seriesName?: string;
  height?: number;
  color?: string;
}) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildSingleVerticalBarOption(
      data.map((d) => d.label),
      data.map((d) => d.value),
      seriesName,
      color
    );
  }, [data, seriesName, color]);

  return <EChartsCanvas option={option} height={height} emptyMessage="No quarterly data" />;
}
