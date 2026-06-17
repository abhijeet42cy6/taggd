import { useMemo } from "react";
import { EChartsCanvas } from "@/components/charts/EChartsCanvas";
import { LevelDonutChart } from "@/components/platform/Charts";
import { formatLargeCurrency } from "@/lib/utils";
import { buildHorizontalRankingBarOption } from "@/components/charts/optionBuilders";
import { CHART_COLORS } from "@/components/charts/chartTokens";
import { colorForSeries } from "@/components/charts/chartColorRules";

export type BillingSummaryStats = {
  rowCount: number;
  netRevenue: number;
  revenueBooked: number;
  totalJoiningFee: number;
  mmf: number;
  totalJoiners: number;
  taggdJoiner: number;
  otherJoiner: number;
  rphAvg: number | null;
};

function pct(part: number, whole: number): string {
  if (whole <= 0 || part <= 0) return "0%";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

export function BillingSummaryVisuals({ summary }: { summary: BillingSummaryStats }) {
  const revenueBars = useMemo(() => {
    const items = [
      { name: "Revenue booked", value: summary.revenueBooked },
      { name: "Joining fees", value: summary.totalJoiningFee },
      { name: "MMF", value: summary.mmf },
      { name: "Net revenue", value: summary.netRevenue },
    ];
    return items.filter((d) => d.value > 0);
  }, [summary]);

  const revenueOption = useMemo(() => {
    if (!revenueBars.length) return null;
    return buildHorizontalRankingBarOption(
      revenueBars.map((d) => d.name),
      revenueBars.map((d) => d.value),
      revenueBars.map((_, i) => colorForSeries(i))
    );
  }, [revenueBars]);

  const joinerDonut = useMemo(() => {
    const slices = [
      { name: "Taggd joiner", value: summary.taggdJoiner },
      { name: "Other joiner", value: summary.otherJoiner },
    ].filter((d) => d.value > 0);
    if (slices.length === 0 && summary.totalJoiners > 0) {
      return [{ name: "Total joiners", value: summary.totalJoiners }];
    }
    return slices;
  }, [summary]);

  const feeStack = useMemo(() => {
    const joining = summary.totalJoiningFee;
    const mmf = summary.mmf;
    const total = joining + mmf;
    if (total <= 0) return null;
    return {
      joining,
      mmf,
      total,
      joiningPct: pct(joining, total),
      mmfPct: pct(mmf, total),
    };
  }, [summary]);

  const impliedRph =
    summary.totalJoiners > 0 && summary.revenueBooked > 0
      ? summary.revenueBooked / summary.totalJoiners
      : null;

  const hasRevenue = revenueBars.length > 0;
  const hasJoiners = joinerDonut.length > 0;
  const hasFeeStack = feeStack != null;

  if (!hasRevenue && !hasJoiners && !hasFeeStack) {
    return (
      <p className="billing-ds-summary-viz-empty">Add billing rows with amounts to see summary charts.</p>
    );
  }

  return (
    <div className="billing-ds-summary-viz">
      {hasRevenue ? (
        <div className="billing-ds-summary-viz-card">
          <div className="billing-ds-summary-viz-head">
            <span className="billing-ds-summary-viz-title">Revenue comparison</span>
            <span className="billing-ds-summary-viz-sub">INR totals for filtered rows</span>
          </div>
          <div className="billing-ds-summary-viz-chart billing-ds-summary-viz-chart--tall">
            <EChartsCanvas option={revenueOption} height={200} />
          </div>
        </div>
      ) : null}

      {hasJoiners ? (
        <div className="billing-ds-summary-viz-card">
          <div className="billing-ds-summary-viz-head">
            <span className="billing-ds-summary-viz-title">Joiner mix</span>
            <span className="billing-ds-summary-viz-sub">{summary.totalJoiners.toLocaleString()} total joiners</span>
          </div>
          <div className="billing-ds-summary-viz-chart">
            <LevelDonutChart data={joinerDonut} maxLegendItems={4} />
          </div>
        </div>
      ) : null}

      {hasFeeStack ? (
        <div className="billing-ds-summary-viz-card billing-ds-summary-viz-card--stack">
          <div className="billing-ds-summary-viz-head">
            <span className="billing-ds-summary-viz-title">Fee composition</span>
            <span className="billing-ds-summary-viz-sub">{formatLargeCurrency(feeStack.total)} combined</span>
          </div>
          <div className="billing-ds-fee-stack">
            <div className="billing-ds-fee-stack__bar">
              <div
                className="billing-ds-fee-stack__seg billing-ds-fee-stack__seg--joining"
                style={{ width: feeStack.joiningPct }}
              />
              <div
                className="billing-ds-fee-stack__seg billing-ds-fee-stack__seg--mmf"
                style={{ width: feeStack.mmfPct }}
              />
            </div>
            <div className="billing-ds-fee-stack__legend">
              <span><i style={{ background: CHART_COLORS[0] }} /> Joining {feeStack.joiningPct}</span>
              <span><i style={{ background: CHART_COLORS[1] }} /> MMF {feeStack.mmfPct}</span>
            </div>
          </div>
          {impliedRph != null ? (
            <p className="billing-ds-summary-viz-foot">
              Implied RPH: {formatLargeCurrency(impliedRph)} / joiner
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
