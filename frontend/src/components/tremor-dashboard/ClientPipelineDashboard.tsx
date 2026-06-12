import React, { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Text } from "@tremor/react";
import { LevelDonutChart } from "@/components/platform/Charts";
import { AccountMetricCard, ClientMetricGrid } from "@/components/tremor-dashboard/AccountMetricCard";
import {
  ageingBucketsForChart,
  formatDeltaPts,
  formatPipelineDelta,
  monthLabel,
  quarterLabel,
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
    { label: "Total offers", value: String(snap.offered), sub: `${period.offered} in ${metrics.period_label}`, decoration: "teal" as const, delta: d.offered_pct, deltaIsPct: true },
    { label: "Total joiners", value: String(snap.joiners), sub: `${period.joiners} in period`, decoration: "emerald" as const, delta: d.joiners_pct, deltaIsPct: true },
    { label: "Offer drop ratio", value: snap.offer_drop_pct == null ? "—" : formatPercent(snap.offer_drop_pct), sub: `${snap.offer_drops} drops`, decoration: "rose" as const, delta: d.offer_drop_pct_delta, deltaIsPts: true },
    { label: "Avg time to fill", value: fmtDays(snap.median_ttf_days ?? snap.avg_ttf_days), sub: "Target 45d", decoration: "blue" as const, delta: d.avg_ttf_days_delta, deltaIsPts: true, suffix: "d" },
    { label: "Avg time to offer", value: fmtDays(snap.median_tto_days ?? snap.avg_tto_days), sub: "Target 30d", decoration: "teal" as const, delta: d.avg_tto_days_delta, deltaIsPts: true, suffix: "d" },
    { label: "Join confirmation", value: snap.oar_pct == null ? "—" : formatPercent(snap.oar_pct), sub: "Joiners ÷ offers", decoration: "emerald" as const, delta: d.oar_pct_delta, deltaIsPts: true },
    { label: "Diversity %", value: snap.diversity_pct == null ? "—" : formatPercent(snap.diversity_pct), sub: "Female joiners / total", decoration: "rose" as const, delta: d.diversity_pct_delta, deltaIsPts: true },
  ];

  return (
    <div className="cd-pipeline-panel">
      <SectionTitle>Pipeline snapshot</SectionTitle>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="cd-compare-badge">Period {metrics.period_label} · compare {cmp.toUpperCase()}</span>
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

function OverviewTab({ metrics, flowMode, setFlowMode }: { metrics: ClientPipelineMetrics; flowMode: PeriodMode; setFlowMode: (m: PeriodMode) => void }) {
  const flow = useFlowData(metrics, flowMode);
  const qData = (metrics.quarterly_series ?? []).map((r) => ({
    label: quarterLabel(r.quarter),
    OAR: r.oar_pct ?? 0,
    JCR: r.joiners && r.offered ? Math.round((r.joiners / Math.max(r.offered, 1)) * 100) : 0,
  }));

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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flow}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={32} />
                <Tooltip />
                <Bar dataKey="Open" fill={CHART_COLORS.navy} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Cancelled" fill={CHART_COLORS.orange} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Hold" fill={CHART_COLORS.amber} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Offer & joiner trend"
          subtitle="Offers made vs joinings confirmed"
          toolbar={<PeriodToggle value={flowMode} onChange={setFlowMode} />}
        >
          <div className="cd-chart-h-240">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={flow}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={32} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="Offers" stroke={CHART_COLORS.teal} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Joiners" stroke={CHART_COLORS.orange} strokeWidth={2} strokeDasharray="6 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <SectionTitle>Offer &amp; joiner detail — quarterly view</SectionTitle>
      <div className="cd-chart-grid-3">
        <ChartCard title="Offer acceptance rate" subtitle="% joiners of total offers">
          <div className="cd-chart-h-220">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={qData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={36} />
                <Tooltip formatter={(v: number) => [`${v}%`, "OAR"]} />
                <Bar dataKey="OAR" fill={CHART_COLORS.navy} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Joining confirmation rate" subtitle="Joiners as % of offers (period)">
          <div className="cd-chart-h-220">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={qData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={36} />
                <Tooltip formatter={(v: number) => [`${v}%`, "JCR"]} />
                <Bar dataKey="JCR" fill={CHART_COLORS.teal} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Offer drop ratio" subtitle="Drops ÷ offers × 100" toolbar={<PeriodToggle value={flowMode} onChange={setFlowMode} />}>
          <div className="cd-chart-h-220">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={flow}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} width={28} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} domain={[0, "auto"]} tickFormatter={(v) => `${v}%`} width={36} />
                <Tooltip />
                <Bar yAxisId="left" dataKey="Drops" fill={CHART_COLORS.red} radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="ODR" stroke={CHART_COLORS.amber} strokeDasharray="5 4" dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
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

  return (
    <>
      <SectionTitle>Time to fill &amp; time to offer</SectionTitle>
      <div className="cd-chart-grid-2">
        <ChartCard title="Time to fill (days)" subtitle="Avg days from req open to joining" toolbar={<PeriodToggle value={flowMode} onChange={setFlowMode} />}>
          <div className="cd-chart-h-240">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={flow}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={32} />
                <Tooltip />
                <Line type="monotone" dataKey="TTF" stroke={CHART_COLORS.navy} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="TTFTarget" stroke={CHART_COLORS.orange} strokeDasharray="6 4" dot={false} name="Target (45d)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Time to offer (days)" subtitle="Avg days from req open to offer" toolbar={<PeriodToggle value={flowMode} onChange={setFlowMode} />}>
          <div className="cd-chart-h-240">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={flow}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={32} />
                <Tooltip />
                <Line type="monotone" dataKey="TTO" stroke={CHART_COLORS.teal} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="TTOTarget" stroke={CHART_COLORS.amber} strokeDasharray="6 4" dot={false} name="Target (30d)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {funnelChart.length > 0 ? (
        <>
          <SectionTitle>Stage-wise funnel breakdown — quarterly</SectionTitle>
          <ChartCard title="Hiring funnel — stage conversion" subtitle="Profile counts aggregated by quarter">
            <div className="cd-chart-h-260">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" />
                  <XAxis dataKey="stage" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={40} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {quarters.map((q, i) => (
                    <Bar key={q} dataKey={q} fill={SRC_PALETTE[i % SRC_PALETTE.length]} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
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

  return (
    <>
      <SectionTitle>WIP requisition ageing</SectionTitle>
      <div className="cd-chart-grid-2">
        <ChartCard title="Ageing bucket distribution" subtitle="Open WIP reqs by days in pipeline">
          <div className="cd-chart-h-240">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fine.map((b) => ({ label: b.label, count: b.count }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={32} />
                <Tooltip />
                <Bar dataKey="count" fill={CHART_COLORS.teal} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Ageing trend — monthly" subtitle="Reqs aging &gt;30 days over time">
          <div className="cd-chart-h-240">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={32} />
                <Tooltip />
                <Line type="monotone" dataKey="Aged30" stroke={CHART_COLORS.red} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
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
                <th>0–15 days</th>
                <th>16–30 days</th>
                <th>31–45 days</th>
                <th>&gt;45 days</th>
                <th>Oldest (days)</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-tremor-content-subtle">No open requisitions with ageing data.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.account}>
                  <td>{r.account}</td>
                  <td>{r.open}</td>
                  <td>{r.b_0_15}</td>
                  <td>{r.b_16_30}</td>
                  <td>{r.b_31_45}</td>
                  <td>{r.b_45_plus}</td>
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
  const srcDonut = srcMap.filter((d) => d.count > 0).map((d) => ({ name: d.label, value: d.count }));
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
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={flow}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={36} />
                <Tooltip formatter={(v: number) => [`${v ?? "—"}%`, "Female %"]} />
                <Line type="monotone" dataKey="FemalePct" stroke={CHART_COLORS.orange} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
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
            <div className="cd-chart-h-240">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={srcMonthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={32} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {channels.map((ch, i) => (
                    <Bar key={ch} dataKey={ch} stackId="a" fill={SRC_PALETTE[i % SRC_PALETTE.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
        <ChartCard title="Source mix — offer wise" subtitle="Offers extended by source channel">
          {(metrics.source_breakdown_offers ?? []).length === 0 ? (
            <Text className="text-xs text-tremor-content-subtle">No offer source data.</Text>
          ) : (
            <div className="cd-chart-h-200">
              <LevelDonutChart data={(metrics.source_breakdown_offers ?? []).map((d) => ({ name: d.label, value: d.count }))} />
            </div>
          )}
        </ChartCard>
        <ChartCard title="Source effectiveness" subtitle="Offer-to-join ratio by channel">
          {eff.length === 0 ? (
            <Text className="text-xs text-tremor-content-subtle">Not enough source linkage for effectiveness.</Text>
          ) : (
            <div className="cd-chart-h-240">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eff} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [`${v ?? "—"}%`, "OTJ"]} />
                  <Bar dataKey="otj_pct" fill={CHART_COLORS.teal} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
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
