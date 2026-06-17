import { useMemo } from "react";
import { EChartsCanvas } from "@/components/charts/EChartsCanvas";
import { buildSingleVerticalBarOption, buildVerticalGroupedBarOption } from "@/components/charts/optionBuilders";
import { ACTUAL_COLOR, BUDGET_COLOR, FORECAST_COLOR } from "@/components/charts/chartTokens";

/** Finance overview: Budget / Actual / Forecast monthly grouped bars (₹ Lakhs). */
export function FinanceOverviewBarChart({
  months,
  budget,
  actual,
  forecast,
  height = 280,
}: {
  months: string[];
  budget: number[];
  actual: number[];
  forecast: number[];
  height?: number;
}) {
  const option = useMemo(() => {
    if (!months.length) return null;
    return buildVerticalGroupedBarOption(
      months,
      [
        { name: "Budget (₹ L)", data: budget, color: BUDGET_COLOR },
        { name: "Actual (₹ L)", data: actual, color: ACTUAL_COLOR },
        { name: "Forecast (₹ L)", data: forecast, color: FORECAST_COLOR },
      ],
      true,
    );
  }, [months, budget, actual, forecast]);

  return <EChartsCanvas option={option} height={height} emptyMessage="No monthly rows — upload Finance Excel." />;
}

/** CM contribution margin bar chart. */
export function FinanceCmBarChart({
  labels,
  values,
  height = 280,
}: {
  labels: string[];
  values: number[];
  height?: number;
}) {
  const option = useMemo(() => {
    if (!labels.length) return null;
    return buildSingleVerticalBarOption(labels, values, "CM %", "#14b8a6");
  }, [labels, values]);

  return <EChartsCanvas option={option} height={height} />;
}
