import { BarChart, LineChart, Text } from "@tremor/react";
import type { YoYCmPoint, YoYRevPoint, RegionBarDatum } from "@/lib/dashboard-aggregates";

function revenueRows(data: YoYRevPoint[], priorLabel: string): Record<string, string | number>[] {
  return data.map((d) => ({
    month: d.month,
    Budget: d.budget,
    Actual: d.actual,
    Forecast: d.forecast,
    [priorLabel]: d.priorActual,
  }));
}

/** Monthly revenue vs budget / forecast / prior FY — Tremor grouped bars (₹ Cr). */
export function CeoRevenueYoYTremorChart({
  data,
  priorLabel,
}: {
  data: YoYRevPoint[];
  priorLabel: string;
}) {
  if (!data.length) {
    return (
      <div className="flex min-h-[220px] items-center justify-center px-4 text-center">
        <Text className="font-medium text-tremor-content-emphasis">
          No finance rows for filters — upload Finance data or widen filters
        </Text>
      </div>
    );
  }
  const chartData = revenueRows(data, priorLabel);
  const categories = ["Budget", "Actual", "Forecast", priorLabel];
  return (
    <BarChart
      className="h-[260px]"
      data={chartData}
      index="month"
      categories={categories}
      colors={["slate", "orange", "amber", "blue"]}
      valueFormatter={(v) => `₹${Number(v).toFixed(2)} Cr`}
      yAxisWidth={52}
      intervalType="preserveStartEnd"
      barCategoryGap="12%"
      enableLegendSlider={categories.length > 3}
    />
  );
}

function cmRows(data: YoYCmPoint[], compareLabel: string): Record<string, string | number>[] {
  return data.map((d) => ({
    month: d.month,
    "CM% Actual": d.actualPct,
    [compareLabel]: d.priorActualPct,
    "Target 35%": d.budgetRefPct,
  }));
}

/** CM% actual vs comparison FY + flat 35% target — Tremor LineChart. */
export function CeoCmYoYTremorChart({
  data,
  compareLabel = "Comparison FY",
}: {
  data: YoYCmPoint[];
  compareLabel?: string;
}) {
  if (!data.length) {
    return (
      <div className="flex min-h-[220px] items-center justify-center px-4 text-center">
        <Text className="font-medium text-tremor-content-emphasis">No CM data for filters</Text>
      </div>
    );
  }
  const chartData = cmRows(data, compareLabel);
  const categories = ["CM% Actual", compareLabel, "Target 35%"];
  return (
    <LineChart
      className="h-[260px]"
      data={chartData}
      index="month"
      categories={categories}
      colors={["orange", "blue", "slate"]}
      valueFormatter={(v) => `${Number(v).toFixed(1)}%`}
      yAxisWidth={44}
      minValue={0}
      curveType="monotone"
      connectNulls
      intervalType="preserveStartEnd"
    />
  );
}

/** Regional actual vs budget — horizontal bars for scan-friendly region labels. */
export function CeoRegionalRevenueTremorChart({ data }: { data: RegionBarDatum[] }) {
  if (!data.length) {
    return (
      <div className="flex min-h-[200px] items-center justify-center px-4 text-center">
        <Text className="font-medium text-tremor-content-emphasis">No regional breakdown — check filters</Text>
      </div>
    );
  }
  const chartData = data.map((d) => ({
    region: d.region,
    Budget: d.budget,
    Actual: d.actual,
  }));
  return (
    <BarChart
      className="h-[min(420px,70vh)]"
      data={chartData}
      index="region"
      categories={["Budget", "Actual"]}
      colors={["slate", "orange"]}
      layout="vertical"
      valueFormatter={(v) => `₹${Number(v).toFixed(2)} Cr`}
      yAxisWidth={96}
      barCategoryGap="16%"
    />
  );
}
