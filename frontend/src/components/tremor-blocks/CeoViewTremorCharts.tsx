import type { YoYCmPoint, YoYRevPoint, RegionBarDatum } from "@/lib/dashboard-aggregates";
import {
  ExecutiveRevenueYoYChart,
  ExecutiveCmYoYChart,
  RegionalRevenueBarChart,
} from "@/components/platform/Charts";

/** Monthly revenue vs budget / forecast / prior FY — ECharts grouped bars (₹ Cr). */
export function CeoRevenueYoYTremorChart({
  data,
  priorLabel,
}: {
  data: YoYRevPoint[];
  priorLabel: string;
}) {
  return <ExecutiveRevenueYoYChart data={data} priorLabel={priorLabel} />;
}

/** CM% actual vs comparison FY + flat 35% target — ECharts multi-line. */
export function CeoCmYoYTremorChart({
  data,
  compareLabel = "Comparison FY",
}: {
  data: YoYCmPoint[];
  compareLabel?: string;
}) {
  return <ExecutiveCmYoYChart data={data} compareLabel={compareLabel} />;
}

/** Regional actual vs budget — ECharts grouped vertical bars. */
export function CeoRegionalRevenueTremorChart({ data }: { data: RegionBarDatum[] }) {
  return <RegionalRevenueBarChart data={data} />;
}
