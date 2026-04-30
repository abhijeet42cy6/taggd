import { BarChart, ScatterChart, Text } from "@tremor/react";
import type { PortfolioRow } from "@/lib/view-models/portfolio";

/** Fill % vs activity %; bubble area scales with revenue (same semantics as legacy BubbleChart). */
export function PortfolioFillActivityScatter({ rows }: { rows: PortfolioRow[] }) {
  const chartRows = rows
    .filter((r) => r.positions > 0)
    .slice(0, 24)
    .map((r) => ({
      project: r.name.length > 28 ? `${r.name.slice(0, 27)}…` : r.name,
      fillPct: r.fillScore,
      activityPct: r.activityScore,
      revenueBubble: Math.max(r.revenue / 80_000, 10),
    }));

  if (!chartRows.length) {
    return (
      <div className="flex min-h-[260px] items-center justify-center px-4">
        <Text className="font-medium text-tremor-content-emphasis">No data yet</Text>
      </div>
    );
  }

  return (
    <ScatterChart
      className="h-[280px]"
      data={chartRows}
      category="project"
      x="fillPct"
      y="activityPct"
      size="revenueBubble"
      minXValue={0}
      minYValue={0}
      maxXValue={100}
      maxYValue={100}
      xAxisLabel="Fill %"
      yAxisLabel="Activity %"
      showLegend={false}
      showOpacity
      yAxisWidth={44}
      valueFormatter={{
        x: (v) => `${Math.round(v)}%`,
        y: (v) => `${Math.round(v)}%`,
        size: () => "∝ revenue",
      }}
      colors={[
        "orange",
        "amber",
        "emerald",
        "blue",
        "violet",
        "cyan",
        "teal",
        "rose",
        "sky",
        "lime",
        "fuchsia",
        "indigo",
      ]}
    />
  );
}

/** Top projects by volume — stacked req statuses (closed / active / pipeline / on hold). */
export function PortfolioReqStatusStackedBar({ rows }: { rows: PortfolioRow[] }) {
  const chartData = rows
    .filter((r) => r.positions > 0)
    .slice(0, 8)
    .map((r) => {
      const label = r.name.length > 14 ? `${r.name.slice(0, 13)}…` : r.name;
      const pipeline = Math.max(0, r.positions - r.closed - r.active - r.on_hold);
      return {
        project: label,
        Closed: r.closed,
        Active: r.active,
        Pipeline: pipeline,
        "On hold": r.on_hold,
      };
    });

  if (!chartData.length) {
    return (
      <div className="flex min-h-[260px] items-center justify-center px-4">
        <Text className="font-medium text-tremor-content-emphasis">No req data</Text>
      </div>
    );
  }

  const categories = ["Closed", "Active", "Pipeline", "On hold"];

  return (
    <BarChart
      className="h-[280px]"
      data={chartData}
      index="project"
      categories={categories}
      colors={["emerald", "orange", "slate", "amber"]}
      stack
      valueFormatter={(v) => v.toLocaleString()}
      yAxisWidth={48}
      barCategoryGap="14%"
      intervalType="preserveStartEnd"
      rotateLabelX={{ angle: -35, verticalShift: 28, xAxisHeight: 72 }}
    />
  );
}
