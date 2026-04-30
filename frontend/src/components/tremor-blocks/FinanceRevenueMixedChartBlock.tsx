import type { YoYRevPoint } from "@/lib/dashboard-aggregates";
import { ExecutiveRevenueYoYChart } from "@/components/platform/Charts";
import { TremorDashboardSection } from "@/components/tremor-dashboard/TremorDashboardSection";
import { Text } from "@tremor/react";

/** Mixed bar + multi-line revenue chart inside Tremor NPM `Card` chrome. */
export function FinanceRevenueMixedChartBlock({
  tag = "Finance",
  title,
  data,
  priorLabel,
  showChart,
}: {
  tag?: string;
  title: string;
  data: YoYRevPoint[];
  priorLabel: string;
  showChart: boolean;
}) {
  return (
    <TremorDashboardSection tag={tag} title={title} noPad>
      <div className="bg-white px-4 pb-4 pt-2">
        {!showChart || data.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center px-4 text-center">
            <Text className="font-medium text-tremor-content-emphasis">No finance data for current filters</Text>
          </div>
        ) : (
          <ExecutiveRevenueYoYChart data={data} priorLabel={priorLabel} />
        )}
      </div>
    </TremorDashboardSection>
  );
}
