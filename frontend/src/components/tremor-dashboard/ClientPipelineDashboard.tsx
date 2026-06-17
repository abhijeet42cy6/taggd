import React, { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { Text } from "@tremor/react";
import { EChartsCanvas } from "@/components/charts/EChartsCanvas";
import {
  buildHorizontalRankingBarOption,
  buildMultiLineTimeseriesOption,
  buildPercentVerticalBarOption,
  buildSingleVerticalBarOption,
  buildStackedCategoryOverTimeOption,
  buildVerticalGroupedBarOption,
} from "@/components/charts/optionBuilders";
import { percentYAxis } from "@/components/charts/chartAxis";
import { GRID, LINE } from "@/components/charts/chartTokens";
import { legendBottom } from "@/components/charts/chartLegend";
import { mergeTooltipBase, seriesEmphasisCartesian } from "@/components/charts/chartUtils";
import { LevelDonutChart } from "@/components/platform/Charts";
import { AccountMetricCard, ClientMetricGrid } from "@/components/tremor-dashboard/AccountMetricCard";
import {
  ageingBucketsForChart,
  formatDeltaPts,
  formatPipelineDelta,
  monthLabel,
  quarterLabel,
  shortSourceChannelLabel,
  sourceDonutRows,
  type ClientPipelineMetrics,
} from "@/lib/client-pipeline-metrics";
import { cn, formatPercent } from "@/lib/utils";

type PeriodMode = "monthly" | "quarterly";
type PipelineTab = "overview" | "timings" | "ageing" | "diversity";
type SrcView = "joiners" | "offers" | "pipeline";

const CHART_COLORS = {
  navy: "#1e3a5f",
  orange: "#ea580c",
  teal: "#0f766e",
  amber: "#d97706",
  green: "#15803d",
  red: "#b91c1c",
  violet: "#7c3aed",
  pink: "#be185d",
};

const SRC_PALETTE = [CHART_COLORS.navy, CHART_COLORS.teal, CHART_COLORS.orange, CHART_COLORS.amber, CHART_COLORS.violet, CHART_COLORS.pink];

function fmtDays(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${Math.round(v)}d`;
}

function PeriodToggle({ value, onChange }: { value: PeriodMode; onChange: (v: PeriodMode) => void }) {
  return (
    <div className="cd-period-toggle">
      <button type="button" className={cn(value === "monthly" && "cd-period-toggle__btn--active")} onClick={() => onChange("monthly")}>M</button>
      <button type="button" className={cn(value === "quarterly" && "cd-period-toggle__btn--active")} onClick={() => onChange("quarterly")}>Q</button>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  toolbar,
  legend,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  toolbar?: React.ReactNode;
  legend?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("cd-chart-card", className)}>
      <div className="cd-chart-card__header">
        <div>
          <div className="cd-chart-card__title">{title}</div>
          {subtitle ? <div className="cd-chart-card__sub">{subtitle}</div> : null}
        </div>
        {toolbar}
      </div>
      {legend}
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="cd-section-title">{children}</div>;
}

function RiskPill({ risk }: { risk: "low" | "medium" | "high" }) {
  const cls =
    risk === "high" ? "cd-pill cd-pill--red" : risk === "medium" ? "cd-pill cd-pill--amber" : "cd-pill cd-pill--green";
  const label = risk === "high" ? "High" : risk === "medium" ? "Medium" : "Low";
  return <span className={cls}>{label}</span>;
}

function useFlowData(metrics: ClientPipelineMetrics, mode: PeriodMode) {
  return useMemo(() => {
    if (mode === "quarterly") {
      return (metrics.quarterly_series ?? []).map((r) => ({
        label: quarterLabel(r.quarter),
        Open: r.open_wip,
        Cancelled: r.cancelled,
        Hold: r.hold,
        Offers: r.offered,
        Joiners: r.joiners,
        Drops: r.offer_drops,
        ODR: r.odr_pct,
        TTF: r.avg_ttf_days,
        TTO: r.avg_tto_days,
        TTFTarget: 45,
        TTOTarget: 30,
        Aged30: r.aged_over_30,
        FemalePct: r.female_hire_pct,
        OAR: r.oar_pct,
      }));
    }
    return metrics.series.map((r) => ({
      label: monthLabel(r.month),
      Open: r.open_wip,
      Cancelled: r.cancelled,
      Hold: r.hold,
      Offers: r.offered,
      Joiners: r.joiners,
      Drops: r.offer_drops,
      ODR: r.odr_pct,
      TTF: r.avg_ttf_days,
      TTO: r.avg_tto_days,
      TTFTarget: 45,
      TTOTarget: 30,
      Aged30: r.aged_over_30,
      FemalePct: r.female_hire_pct,
      OAR: r.oar_pct,
    }));
  }, [metrics, mode]);
}

function PipelineKpiGrid({ metrics }: { metrics: ClientPipelineMetrics }) {
  const snap = metrics.snapshot;
  const period = metrics.period;
  const cmp = metrics.compare;
  const d = metrics.deltas;

  const cards = [
    { label: "Total demand", value: String(snap.total_demand || snap.wip), sub: "Open + hold + cancelled", decoration: "blue" as const, delta: d.total_demand_pct, deltaIsPct: true },
    { label: "Open reqs", value: String(snap.open), sub: `${period.open} created in period`, decoration: "blue" as const, delta: d.open_pct, deltaIsPct: true },
    { label: "Cancelled reqs", value: String(snap.cancelled), sub: `${period.cancelled} in period`, decoration: "rose" as const, delta: d.cancelled_pct, deltaIsPct: true },
    { label: "Hold reqs", value: String(snap.hold), sub: "On hold (current)", decoration: "amber" as const, delta: d.hold_pct, deltaIsPct: true },
    { label: "Active offers", value: String(snap.offered), sub: `${snap.offered_total ?? snap.offered} lifetime · ${period.offered} in ${metrics.period_label}`, decoration: "teal" as const, delta: d.offered_pct, deltaIsPct: true },
    { label: "Total joiners", value: String(snap.joiners), sub: `${period.joiners} joined in ${metrics.period_label}`, decoration: "emerald" as const, delta: d.joiners_pct, deltaIsPct: true },
    { label: "Offer drop ratio", value: snap.offer_drop_pct == null ? "—" : formatPercent(snap.offer_drop_pct), sub: `${snap.offer_drops} drops`, decoration: "rose" as const, delta: d.offer_drop_pct_delta, deltaIsPts: true },
    { label: "Avg time to fill", value: fmtDays(snap.median_ttf_days ?? snap.avg_ttf_days), sub: "Target 45 business days", decoration: "blue" as const, delta: d.avg_ttf_days_delta, deltaIsPts: true, suffix: "d" },
    { label: "Avg time to offer", value: fmtDays(snap.median_tto_days ?? snap.avg_tto_days), sub: "Target 30 business days", decoration: "teal" as const, delta: d.avg_tto_days_delta, deltaIsPts: true, suffix: "d" },
    { label: "Join confirmation", value: snap.oar_pct == null ? "—" : formatPercent(snap.oar_pct), sub: `${snap.joiners} joiners ÷ ${snap.offered_total ?? snap.offered} offers`, decoration: "emerald" as const, delta: d.oar_pct_delta, deltaIsPts: true },
    { label: "Diversity %", value: snap.diversity_pct == null ? "—" : formatPercent(snap.diversity_pct), sub: "Female joiners / total", decoration: "rose" as const, delta: d.diversity_pct_delta, deltaIsPts: true },
  ];

  return (
    <div className="cd-pipeline-panel">
      <SectionTitle>Pipeline snapshot</SectionTitle>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="cd-compare-badge">Period {metrics.period_label}</span>
        {metrics.updated_at ? (
          <Text className="text-[10px] text-tremor-content-subtle">Updated {metrics.updated_at}</Text>
        ) : null}
      </div>
      <ClientMetricGrid count={6} className="cd-kpi-grid">
        {cards.map((c) => (
          <AccountMetricCard
            key={c.label}
            eyebrow={c.label}
            value={c.value}
            subtext={c.sub}
            decorationColor={c.decoration}
            hint={
              c.deltaIsPts
                ? formatDeltaPts(c.delta, c.suffix ?? " pts")
                : formatPipelineDelta(c.delta, cmp)?.label
            }
          />
        ))}
      </ClientMetricGrid>
    </div>
  );
}

function CdChart({ option, height = 240, className = "cd-chart-h-240" }: { option: EChartsOption | null; height?: number; className?: string }) {
  return (
    <div className={className}>
      <EChartsCanvas option={option} height={height} />
    </div>
  );
}

function buildPercentLineOption(labels: string[], series: { name: string; data: (number | null)[]; color: string; dashed?: boolean }[]): EChartsOption {
  const opt = buildMultiLineTimeseriesOption(labels, series);
  if (opt.yAxis && Array.isArray(opt.yAxis)) {
    opt.yAxis[0] = { ...percentYAxis(0, 100), name: "%" };
  }
  if (Array.isArray(opt.series)) {
    const seriesArr = opt.series;
    series.forEach((s, i) => {
      if (s.dashed && seriesArr[i]) {
        seriesArr[i] = {
          ...seriesArr[i],
          lineStyle: { width: LINE.width, color: s.color, type: "dashed" },
        };
      }
    });
  }
  return opt;
}

function buildDualAxisBarLineOption(
  labels: string[],
  barName: string,
  barData: number[],
  barColor: string,
  lineName: string,
  lineData: (number | null)[],
  lineColor: string,
): EChartsOption {
  return {
    color: [barColor, lineColor],
    grid: GRID.vBar,
    legend: legendBottom,
    tooltip: mergeTooltipBase({ trigger: "axis" }),
    xAxis: { type: "category", data: labels, axisLabel: { fontSize: 10, color: "#94a3b8" } },
    yAxis: [
      { type: "value", min: 0, axisLabel: { fontSize: 10, color: "#94a3b8" }, splitLine: { lineStyle: { color: "#f0f0f0" } } },
      { type: "value", min: 0, axisLabel: { fontSize: 10, color: "#94a3b8", formatter: "{value}%" }, splitLine: { show: false } },
    ],
    series: [
      { name: barName, type: "bar", yAxisIndex: 0, data: barData, itemStyle: { color: barColor, borderRadius: [3, 3, 0, 0] }, ...seriesEmphasisCartesian() },
      { name: lineName, type: "line", yAxisIndex: 1, data: lineData, smooth: 0.2, lineStyle: { width: LINE.width, color: lineColor, type: "dashed" }, ...seriesEmphasisCartesian() },
    ],
  };
}

function OverviewTab({ metrics, flowMode, setFlowMode }: { metrics: ClientPipelineMetrics; flowMode: PeriodMode; setFlowMode: (m: PeriodMode) => void }) {
  const flow = useFlowData(metrics, flowMode);
  const qData = (metrics.quarterly_series ?? []).map((r) => ({
    label: quarterLabel(r.quarter),
    OAR: r.oar_stock_pct ?? r.oar_pct,
    JCR: r.jcr_stock_pct ?? null,
  }));

  const flowBarOption = useMemo(
    () =>
      buildVerticalGroupedBarOption(
        flow.map((f) => f.label),
        [
          { name: "Open", data: flow.map((f) => f.Open), color: CHART_COLORS.navy },
          { name: "Cancelled", data: flow.map((f) => f.Cancelled), color: CHART_COLORS.orange },
          { name: "Hold", data: flow.map((f) => f.Hold), color: CHART_COLORS.amber },
        ],
      ),
    [flow],
  );

  const offerJoinerOption = useMemo(
    () =>
      buildMultiLineTimeseriesOption(
        flow.map((f) => f.label),
        [
          { name: "Offers", data: flow.map((f) => f.Offers), color: CHART_COLORS.teal },
          { name: "Joiners", data: flow.map((f) => f.Joiners), color: CHART_COLORS.orange },
        ],
      ),
    [flow],
  );

  const oarOption = useMemo(
    () => buildPercentVerticalBarOption(qData.map((d) => d.label), qData.map((d) => d.OAR), "OAR", CHART_COLORS.navy),
    [qData],
  );

  const jcrOption = useMemo(
    () => buildPercentVerticalBarOption(qData.map((d) => d.label), qData.map((d) => d.JCR), "JCR", CHART_COLORS.teal),
    [qData],
  );

  const odrOption = useMemo(
    () =>
      buildDualAxisBarLineOption(
        flow.map((f) => f.label),
        "Drops",
        flow.map((f) => f.Drops),
        CHART_COLORS.red,
        "ODR",
        flow.map((f) => f.ODR),
        CHART_COLORS.amber,
      ),
    [flow],
  );

  return (
    <>
      <SectionTitle>Requisitions — monthly &amp; quarterly</SectionTitle>
      <div className="cd-chart-grid-2">
        <ChartCard
          title="Requisition flow"
          subtitle="Open · Cancelled · Hold"
          toolbar={<PeriodToggle value={flowMode} onChange={setFlowMode} />}
          legend={
            <div className="cd-legend-row">
              <span className="cd-leg"><span className="cd-leg-sq" style={{ background: CHART_COLORS.navy }} />Open</span>
              <span className="cd-leg"><span className="cd-leg-sq" style={{ background: CHART_COLORS.orange }} />Cancelled</span>
              <span className="cd-leg"><span className="cd-leg-sq" style={{ background: CHART_COLORS.amber }} />Hold</span>
            </div>
          }
        >
          <div className="cd-chart-h-240">
            <CdChart option={flowBarOption} height={240} />
          </div>
        </ChartCard>

        <ChartCard
          title="Offer & joiner trend"
          subtitle="Offers made vs joinings confirmed"
          toolbar={<PeriodToggle value={flowMode} onChange={setFlowMode} />}
        >
          <div className="cd-chart-h-240">
            <CdChart option={offerJoinerOption} height={240} />
          </div>
        </ChartCard>
      </div>

      <SectionTitle>Offer &amp; joiner detail — quarterly view</SectionTitle>
      <div className="cd-chart-grid-3">
        <ChartCard title="Offer acceptance rate" subtitle="Cumulative joiners ÷ offers at quarter end">
          <div className="cd-chart-h-220">
            <CdChart option={oarOption} height={220} className="cd-chart-h-220" />
          </div>
        </ChartCard>
        <ChartCard title="Joining confirmation rate" subtitle="Cumulative joiners ÷ accepted offers at quarter end">
          <div className="cd-chart-h-220">
            <CdChart option={jcrOption} height={220} className="cd-chart-h-220" />
          </div>
        </ChartCard>
        <ChartCard title="Offer drop ratio" subtitle="Drops ÷ offers × 100" toolbar={<PeriodToggle value={flowMode} onChange={setFlowMode} />}>
          <div className="cd-chart-h-220">
            <CdChart option={odrOption} height={220} className="cd-chart-h-220" />
          </div>
        </ChartCard>
      </div>
    </>
  );
}

function TimingsTab({ metrics, flowMode, setFlowMode }: { metrics: ClientPipelineMetrics; flowMode: PeriodMode; setFlowMode: (m: PeriodMode) => void }) {
  const flow = useFlowData(metrics, flowMode);
  const funnel = metrics.funnel_by_quarter ?? [];
  const funnelData = funnel.flatMap((q) => [
    { stage: "Sourced", quarter: quarterLabel(q.quarter), value: q.sourced },
    { stage: "Screened", quarter: quarterLabel(q.quarter), value: q.screened },
    { stage: "Interviewed", quarter: quarterLabel(q.quarter), value: q.interviewed },
    { stage: "Offered", quarter: quarterLabel(q.quarter), value: q.offered },
    { stage: "Joined", quarter: quarterLabel(q.quarter), value: q.joined },
  ]);
  const stages = ["Sourced", "Screened", "Interviewed", "Offered", "Joined"];
  const quarters = [...new Set(funnel.map((q) => quarterLabel(q.quarter)))];
  const funnelChart = stages.map((stage) => {
    const row: Record<string, string | number> = { stage };
    for (const q of quarters) {
      const hit = funnelData.find((d) => d.stage === stage && d.quarter === q);
      row[q] = hit?.value ?? 0;
    }
    return row;
  });

  const ttfOption = useMemo(
    () =>
      buildMultiLineTimeseriesOption(
        flow.map((f) => f.label),
        [
          { name: "TTF", data: flow.map((f) => f.TTF), color: CHART_COLORS.navy },
          { name: "Target (45d)", data: flow.map((f) => f.TTFTarget), color: CHART_COLORS.orange },
        ],
      ),
    [flow],
  );

  const ttoOption = useMemo(
    () =>
      buildMultiLineTimeseriesOption(
        flow.map((f) => f.label),
        [
          { name: "TTO", data: flow.map((f) => f.TTO), color: CHART_COLORS.teal },
          { name: "Target (30d)", data: flow.map((f) => f.TTOTarget), color: CHART_COLORS.amber },
        ],
      ),
    [flow],
  );

  const funnelOption = useMemo(() => {
    if (!funnelChart.length || !quarters.length) return null;
    return buildVerticalGroupedBarOption(
      funnelChart.map((r) => String(r.stage)),
      quarters.map((q, i) => ({
        name: q,
        data: funnelChart.map((r) => Number(r[q] ?? 0)),
        color: SRC_PALETTE[i % SRC_PALETTE.length],
      })),
    );
  }, [funnelChart, quarters]);

  return (
    <>
      <SectionTitle>Time to fill &amp; time to offer</SectionTitle>
      <div className="cd-chart-grid-2">
        <ChartCard title="Time to fill (days)" subtitle="Avg days from req open to joining" toolbar={<PeriodToggle value={flowMode} onChange={setFlowMode} />}>
          <div className="cd-chart-h-240">
            <CdChart option={ttfOption} height={240} />
          </div>
        </ChartCard>
        <ChartCard title="Time to offer (days)" subtitle="Avg days from req open to offer" toolbar={<PeriodToggle value={flowMode} onChange={setFlowMode} />}>
          <div className="cd-chart-h-240">
            <CdChart option={ttoOption} height={240} />
          </div>
        </ChartCard>
      </div>

      {funnelChart.length > 0 ? (
        <>
          <SectionTitle>Stage-wise funnel breakdown — quarterly</SectionTitle>
          <ChartCard title="Hiring funnel — stage conversion" subtitle="Profile counts aggregated by quarter">
            <div className="cd-chart-h-260">
              <CdChart option={funnelOption} height={260} className="cd-chart-h-260" />
            </div>
          </ChartCard>
        </>
      ) : (
        <Text className="text-sm text-tremor-content-subtle">Funnel stage data not yet populated on requisitions in scope.</Text>
      )}
    </>
  );
}

function AgeingTab({ metrics }: { metrics: ClientPipelineMetrics }) {
  const fine = ageingBucketsForChart(metrics.fine_ageing_buckets ?? [], true);
  const trend = metrics.series.map((r) => ({ label: monthLabel(r.month), Aged30: r.aged_over_30 }));
  const rows = metrics.account_ageing_rows ?? [];

  const bucketOption = useMemo(
    () => buildSingleVerticalBarOption(fine.map((b) => b.label), fine.map((b) => b.count), "Count", CHART_COLORS.teal),
    [fine],
  );

  const trendOption = useMemo(
    () =>
      buildMultiLineTimeseriesOption(
        trend.map((t) => t.label),
        [{ name: "Aged >30d", data: trend.map((t) => t.Aged30), color: CHART_COLORS.red }],
      ),
    [trend],
  );

  return (
    <>
      <SectionTitle>WIP requisition ageing</SectionTitle>
      <div className="cd-chart-grid-2">
        <ChartCard title="Ageing bucket distribution" subtitle="Open WIP reqs by days in pipeline">
          <div className="cd-chart-h-240">
            <CdChart option={bucketOption} height={240} />
          </div>
        </ChartCard>
        <ChartCard title="Ageing trend — monthly" subtitle="Reqs aging &gt;30 days over time">
          <div className="cd-chart-h-240">
            <CdChart option={trendOption} height={240} />
          </div>
        </ChartCard>
      </div>

      <SectionTitle>Account-level WIP ageing detail</SectionTitle>
      <div className="cd-chart-card cd-ageing-table-wrap">
        <div className="overflow-x-auto">
          <table className="cd-ageing-table">
            <thead>
              <tr>
                <th>Account / SBU</th>
                <th>Open reqs</th>
                <th>0–30 days</th>
                <th>30–45 days</th>
                <th>45–60 days</th>
                <th>60–90 days</th>
                <th>&gt;90 days</th>
                <th>Oldest (days)</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={10} className="text-center text-tremor-content-subtle">No open requisitions with ageing data.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.account}>
                  <td>{r.account}</td>
                  <td>{r.open}</td>
                  <td>{r.b_0_30}</td>
                  <td>{r.b_31_45}</td>
                  <td>{r.b_46_60}</td>
                  <td>{r.b_61_90}</td>
                  <td>{r.b_90_plus}</td>
                  <td>{r.oldest_days}</td>
                  <td><RiskPill risk={r.risk} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function DiversityTab({ metrics, flowMode, setFlowMode }: { metrics: ClientPipelineMetrics; flowMode: PeriodMode; setFlowMode: (m: PeriodMode) => void }) {
  const [srcView, setSrcView] = useState<SrcView>("joiners");
  const divData = metrics.diversity_breakdown.filter((d) => d.count > 0).map((d) => ({ name: d.label, value: d.count }));
  const srcMap =
    srcView === "offers"
      ? metrics.source_breakdown_offers
      : srcView === "pipeline"
        ? metrics.source_breakdown_pipeline
        : metrics.source_breakdown;
  const srcDonut = sourceDonutRows(srcMap);
  const eff = metrics.source_effectiveness ?? [];
  const flow = useFlowData(metrics, flowMode);

  const srcMonthly = useMemo(() => {
    const rows = metrics.source_monthly ?? [];
    const channels = new Set<string>();
    for (const r of rows) {
      const bag = srcView === "offers" ? r.offers : r.joiners;
      Object.keys(bag).forEach((k) => channels.add(k));
    }
    const top = [...channels].slice(0, 6);
    if (flowMode === "quarterly") {
      const qmap: Record<string, Record<string, number>> = {};
      for (const r of rows) {
        const y = parseInt(r.month.slice(0, 4), 10);
        const m = parseInt(r.month.slice(5, 7), 10);
        const q = `${y}-Q${Math.ceil(m / 3)}`;
        qmap[q] ??= {};
        const bag = srcView === "offers" ? r.offers : r.joiners;
        for (const ch of top) qmap[q][ch] = (qmap[q][ch] ?? 0) + (bag[ch] ?? 0);
      }
      return Object.keys(qmap).sort().map((q) => ({ label: quarterLabel(q), ...qmap[q] }));
    }
    return rows.map((r) => {
      const bag = srcView === "offers" ? r.offers : r.joiners;
      const row: Record<string, string | number> = { label: monthLabel(r.month) };
      for (const ch of top) row[ch] = bag[ch] ?? 0;
      return row;
    });
  }, [metrics.source_monthly, srcView, flowMode]);

  const channels = srcMonthly.length > 0 ? Object.keys(srcMonthly[0]).filter((k) => k !== "label") : [];

  const femalePctOption = useMemo(
    () =>
      buildPercentLineOption(
        flow.map((f) => f.label),
        [{ name: "Female %", data: flow.map((f) => f.FemalePct), color: CHART_COLORS.orange }],
      ),
    [flow],
  );

  const srcMonthlyOption = useMemo(() => {
    if (!srcMonthly.length || !channels.length) return null;
    return buildStackedCategoryOverTimeOption(
      srcMonthly.map((r) => String(r.label)),
      channels.map((ch, i) => ({
        name: shortSourceChannelLabel(ch),
        data: srcMonthly.map((r) => Number((r as Record<string, string | number>)[ch] ?? 0)),
        color: SRC_PALETTE[i % SRC_PALETTE.length],
        fullName: ch,
      })),
    );
  }, [srcMonthly, channels]);

  const effOption = useMemo(
    () =>
      buildHorizontalRankingBarOption(
        eff.map((e) => shortSourceChannelLabel(e.label)),
        eff.map((e) => e.otj_pct ?? 0),
        eff.map(() => CHART_COLORS.teal),
      ),
    [eff],
  );

  return (
    <>
      <SectionTitle>Diversity hiring</SectionTitle>
      <div className="cd-chart-grid-3">
        <ChartCard title="Gender mix — joiners" subtitle="Current scope overall">
          {divData.length === 0 ? (
            <Text className="text-xs text-tremor-content-subtle">No diversity tags on joiners yet.</Text>
          ) : (
            <div className="cd-chart-h-200"><LevelDonutChart data={divData} /></div>
          )}
        </ChartCard>
        <ChartCard
          title="Source mix — by selection"
          subtitle={`Channel share · ${srcView}`}
          toolbar={
            <div className="cd-period-toggle">
              {(["joiners", "offers", "pipeline"] as SrcView[]).map((v) => (
                <button key={v} type="button" className={cn(srcView === v && "cd-period-toggle__btn--active")} onClick={() => setSrcView(v)}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          }
        >
          {srcDonut.length === 0 ? (
            <Text className="text-xs text-tremor-content-subtle">No source tags in scope.</Text>
          ) : (
            <div className="cd-chart-h-200"><LevelDonutChart data={srcDonut} /></div>
          )}
        </ChartCard>
        <ChartCard title="Diversity trend — monthly" subtitle="Female hire % over time">
          <div className="cd-chart-h-200">
            <CdChart option={femalePctOption} height={200} className="cd-chart-h-200" />
          </div>
        </ChartCard>
      </div>

      <SectionTitle>Source mix</SectionTitle>
      <div className="cd-chart-grid-2">
        <ChartCard
          title="Source channel — trend"
          subtitle={`By channel · ${srcView}`}
          toolbar={
            <div className="flex gap-2">
              <div className="cd-period-toggle">
                {(["joiners", "offers"] as SrcView[]).map((v) => (
                  <button key={v} type="button" className={cn(srcView === v && "cd-period-toggle__btn--active")} onClick={() => setSrcView(v)}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
              <PeriodToggle value={flowMode} onChange={setFlowMode} />
            </div>
          }
        >
          {srcMonthly.length === 0 ? (
            <Text className="text-xs text-tremor-content-subtle">No monthly source breakdown available.</Text>
          ) : (
            <div className="cd-chart-h-260">
              <CdChart option={srcMonthlyOption} height={260} />
            </div>
          )}
        </ChartCard>
        <ChartCard title="Source mix — offer wise" subtitle="Offers extended by source channel">
          {(metrics.source_breakdown_offers ?? []).filter((d) => d.count > 0).length === 0 ? (
            <Text className="text-xs text-tremor-content-subtle">No offer source data.</Text>
          ) : (
            <div className="cd-chart-h-260">
              <LevelDonutChart
                maxLegendItems={10}
                data={sourceDonutRows(metrics.source_breakdown_offers ?? [])}
              />
            </div>
          )}
        </ChartCard>
        <ChartCard title="Source effectiveness" subtitle="Offer-to-join ratio by channel">
          {eff.length === 0 ? (
            <Text className="text-xs text-tremor-content-subtle">Not enough source linkage for effectiveness.</Text>
          ) : (
            <div className="cd-chart-h-240">
              <CdChart option={effOption} height={240} />
            </div>
          )}
        </ChartCard>
      </div>
    </>
  );
}

export function ClientPipelineDashboard({ metrics }: { metrics: ClientPipelineMetrics | null }) {
  const [tab, setTab] = useState<PipelineTab>("overview");
  const [flowMode, setFlowMode] = useState<PeriodMode>("monthly");

  if (!metrics) {
    return (
      <div className="cd-pipeline-panel">
        <Text className="text-sm text-tremor-content-subtle">No pipeline data in scope.</Text>
      </div>
    );
  }

  const tabs: Array<{ id: PipelineTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "timings", label: "Time metrics" },
    { id: "ageing", label: "WIP ageing" },
    { id: "diversity", label: "Diversity & source mix" },
  ];

  return (
    <div className="cd-pipeline-dashboard">
      <PipelineKpiGrid metrics={metrics} />
      <div className="cd-tab-row">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cn("cd-tab", tab === t.id && "cd-tab--active")}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="cd-tab-panel">
        {tab === "overview" ? <OverviewTab metrics={metrics} flowMode={flowMode} setFlowMode={setFlowMode} /> : null}
        {tab === "timings" ? <TimingsTab metrics={metrics} flowMode={flowMode} setFlowMode={setFlowMode} /> : null}
        {tab === "ageing" ? <AgeingTab metrics={metrics} /> : null}
        {tab === "diversity" ? <DiversityTab metrics={metrics} flowMode={flowMode} setFlowMode={setFlowMode} /> : null}
      </div>
    </div>
  );
}

export function PipelineAnalyticsPanel({ metrics }: { metrics: ClientPipelineMetrics | null }) {
  return <ClientPipelineDashboard metrics={metrics} />;
}
