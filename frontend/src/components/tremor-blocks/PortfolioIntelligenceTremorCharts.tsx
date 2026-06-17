import { useMemo } from "react";
import { Text } from "@tremor/react";
import type { PortfolioRow } from "@/lib/view-models/portfolio";
import { EChartsCanvas } from "@/components/charts/EChartsCanvas";
import { CHART_COLORS } from "@/components/charts/chartTokens";
import { buildScatterChartOption, buildStackedVerticalBarOption } from "@/components/charts/optionBuilders";
import { colorForSeries } from "@/components/charts/chartColorRules";

/** Fill % vs activity %; bubble area scales with revenue. */
export function PortfolioFillActivityScatter({ rows }: { rows: PortfolioRow[] }) {
  const option = useMemo(() => {
    const chartRows = rows
      .filter((r) => r.positions > 0)
      .slice(0, 24)
      .map((r, i) => ({
        name: r.name.length > 28 ? `${r.name.slice(0, 27)}…` : r.name,
        x: r.fillScore,
        y: r.activityScore,
        z: Math.max(r.revenue / 80_000, 10),
        color: colorForSeries(i),
      }));
    if (!chartRows.length) return null;
    return buildScatterChartOption(chartRows, "Fill %", "Activity %", "Revenue");
  }, [rows]);

  if (!option) {
    return (
      <div className="flex min-h-[260px] items-center justify-center px-4">
        <Text className="font-medium text-tremor-content-emphasis">No data yet</Text>
      </div>
    );
  }
  return <EChartsCanvas option={option} height={280} />;
}

/** Top projects by volume — stacked req statuses. */
export function PortfolioReqStatusStackedBar({ rows }: { rows: PortfolioRow[] }) {
  const option = useMemo(() => {
    const chartData = rows
      .filter((r) => r.positions > 0)
      .slice(0, 8)
      .map((r) => {
        const pipeline = Math.max(0, r.positions - r.closed - r.active - r.on_hold);
        return {
          label: r.name.length > 14 ? `${r.name.slice(0, 13)}…` : r.name,
          closed: r.closed,
          active: r.active,
          pipeline,
          onHold: r.on_hold,
        };
      });
    if (!chartData.length) return null;
    return buildStackedVerticalBarOption(
      chartData.map((d) => d.label),
      [
        { name: "Closed", data: chartData.map((d) => d.closed), color: CHART_COLORS[1] },
        { name: "Active", data: chartData.map((d) => d.active), color: CHART_COLORS[0] },
        { name: "Pipeline", data: chartData.map((d) => d.pipeline), color: CHART_COLORS[8] },
        { name: "On hold", data: chartData.map((d) => d.onHold), color: CHART_COLORS[2], roundTop: true },
      ]
    );
  }, [rows]);

  if (!option) {
    return (
      <div className="flex min-h-[260px] items-center justify-center px-4">
        <Text className="font-medium text-tremor-content-emphasis">No req data</Text>
      </div>
    );
  }
  return <EChartsCanvas option={option} height={280} />;
}
