import React, { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LevelDonutChart } from "@/components/platform/Charts";
import { formatLargeCurrency } from "@/lib/utils";

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

const REVENUE_COLORS = ["#3884ff", "#e16f3d", "#14b8a6", "#2ecc71"] as const;

function pct(part: number, whole: number): string {
  if (whole <= 0 || part <= 0) return "0%";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

function currencyTooltip(v: number | string | undefined): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return formatLargeCurrency(n);
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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={revenueBars}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(55,53,47,0.08)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "rgba(55,53,47,0.55)" }}
                  tickFormatter={(v) => formatLargeCurrency(Number(v))}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={92}
                  tick={{ fontSize: 10, fill: "rgba(55,53,47,0.65)" }}
                />
                <Tooltip formatter={(v: number) => [currencyTooltip(v), "Amount"]} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {revenueBars.map((_, i) => (
                    <Cell key={i} fill={REVENUE_COLORS[i % REVENUE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {hasJoiners ? (
        <div className="billing-ds-summary-viz-card">
          <div className="billing-ds-summary-viz-head">
            <span className="billing-ds-summary-viz-title">Joiner mix</span>
            <span className="billing-ds-summary-viz-sub">
              {summary.totalJoiners.toLocaleString()} total joiners
            </span>
          </div>
          <div className="billing-ds-summary-viz-donut-wrap">
            <div className="billing-ds-summary-viz-donut">
              <LevelDonutChart data={joinerDonut} maxLegendItems={4} />
            </div>
            <ul className="billing-ds-summary-viz-legend">
              {joinerDonut.map((d) => (
                <li key={d.name}>
                  <span className="billing-ds-summary-viz-legend-label">{d.name}</span>
                  <span className="billing-ds-summary-viz-legend-value">
                    {d.value.toLocaleString()}
                    <span className="billing-ds-summary-viz-legend-pct">
                      ({pct(d.value, summary.totalJoiners || d.value)})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {hasFeeStack ? (
        <div className="billing-ds-summary-viz-card billing-ds-summary-viz-card--wide">
          <div className="billing-ds-summary-viz-head">
            <span className="billing-ds-summary-viz-title">Fee composition</span>
            <span className="billing-ds-summary-viz-sub">Joining fees vs MMF</span>
          </div>
          <div className="billing-ds-summary-viz-stack">
            <div
              className="billing-ds-summary-viz-stack-seg billing-ds-summary-viz-stack-seg--joining"
              style={{ width: feeStack.joiningPct }}
              title={`Joining fees ${feeStack.joiningPct}`}
            />
            <div
              className="billing-ds-summary-viz-stack-seg billing-ds-summary-viz-stack-seg--mmf"
              style={{ width: feeStack.mmfPct }}
              title={`MMF ${feeStack.mmfPct}`}
            />
          </div>
          <div className="billing-ds-summary-viz-stack-labels">
            <span>
              <i className="billing-ds-summary-viz-dot billing-ds-summary-viz-dot--joining" />
              Joining {formatLargeCurrency(feeStack.joining)} ({feeStack.joiningPct})
            </span>
            <span>
              <i className="billing-ds-summary-viz-dot billing-ds-summary-viz-dot--mmf" />
              MMF {formatLargeCurrency(feeStack.mmf)} ({feeStack.mmfPct})
            </span>
          </div>
          {summary.rphAvg != null || impliedRph != null ? (
            <div className="billing-ds-summary-viz-rph">
              {summary.rphAvg != null ? (
                <div>
                  <span className="billing-ds-summary-viz-rph-label">Mean RPH</span>
                  <span className="billing-ds-summary-viz-rph-value">{formatLargeCurrency(summary.rphAvg)}</span>
                </div>
              ) : null}
              {impliedRph != null ? (
                <div>
                  <span className="billing-ds-summary-viz-rph-label">Revenue ÷ joiners</span>
                  <span className="billing-ds-summary-viz-rph-value">{formatLargeCurrency(impliedRph)}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
