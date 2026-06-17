/**
 * Platform chart components — Apache ECharts 5.x with Taggd design tokens.
 */
import React, { useMemo } from "react";
import { formatNumber, formatPercent } from "@/lib/utils";
import type { YoYRevPoint, YoYCmPoint, RegionBarDatum } from "@/lib/dashboard-aggregates";
import { EChartsCanvas } from "@/components/charts/EChartsCanvas";
import { EmptyChartState } from "@/components/charts/EmptyChartState";
import { CHART_HEIGHT, CHART_COLORS, SLA_STACK_COLORS, REQ_STATUS_COLORS, AGEING_COLORS, ACTUAL_COLOR, BUDGET_COLOR, PO_COLOR, GMV_COLOR, FAIL_COLOR } from "@/components/charts/chartTokens";
import { colorForSeries } from "@/components/charts/chartColorRules";
import {
  buildExecutiveRevenueYoYOption,
  buildDualAxisAreaLineOption,
  buildSingleVerticalBarOption,
  buildStackedVerticalBarOption,
  buildHorizontalRankingBarOption,
  buildHorizontalGroupedBarOption,
  buildVerticalGroupedBarOption,
  buildSemanticHorizontalBarOption,
  buildDonutPieOption,
  buildGaugeKpiOption,
  buildMultiLineTimeseriesOption,
  buildCmYoYLineOption,
  buildWfmProductivityFillOption,
  buildStackedCategoryOverTimeOption,
  buildScatterChartOption,
  buildWaterfallChartOption,
  buildComplianceHeatmapOption,
  buildFunnelPipelineOption,
} from "@/components/charts/optionBuilders";
import type { EChartsOption } from "echarts";

function formatSlaYmAxis(ym: string): string {
  if (!ym || ym.length < 7) return String(ym);
  const y = parseInt(ym.slice(0, 4), 10);
  const mo = parseInt(ym.slice(5, 7), 10);
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (mo < 1 || mo > 12 || Number.isNaN(y)) return ym;
  return `${labels[mo - 1]} '${String(y).slice(2)}`;
}

function prepareDonutSlices(data: { name: string; value: number; fullName?: string }[], maxItems: number) {
  const sorted = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= maxItems) return sorted;
  const top = sorted.slice(0, maxItems - 1);
  const other = sorted.slice(maxItems - 1).reduce((sum, d) => sum + d.value, 0);
  return [...top, { name: "Other", value: other }];
}

// ─── TREND CHART ──────────────────────────────────────────────────────────────
type TrendPoint = { month: string; revenue: number; budget: number; sla: number; fillRate: number };

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const option = useMemo(() => {
    if (!data.length) return null;
    const dates = data.map((d) => d.month);
    return buildDualAxisAreaLineOption(
      dates,
      data.map((d) => d.revenue),
      data.map((d) => d.budget),
      data.map((d) => d.sla),
      Math.max(...data.map((d) => Math.max(d.revenue, d.budget)), 1),
      Math.max(...data.map((d) => d.fillRate), 100)
    );
  }, [data]);
  return <EChartsCanvas option={option} height={180} />;
}

// ─── BUBBLE CHART ─────────────────────────────────────────────────────────────
type BubblePoint = { name: string; x: number; y: number; z: number; color: string };

export function BubbleChart({ data }: { data: BubblePoint[] }) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildScatterChartOption(
      data.map((d, i) => ({ name: d.name, x: d.x, y: d.y, z: d.z, color: d.color || colorForSeries(i) })),
      "Budget Attainment %",
      "SLA Met %",
      "Revenue"
    );
  }, [data]);
  return <EChartsCanvas option={option} height={220} />;
}

// ─── STACKED BAR ──────────────────────────────────────────────────────────────
type StackedBarDatum = { name: string; joined: number; open: number; offer: number; cancelled: number };

export function ReqStatusStackedBar({ data }: { data: StackedBarDatum[] }) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildStackedVerticalBarOption(
      data.map((d) => d.name),
      [
        { name: "Joined", data: data.map((d) => d.joined), color: REQ_STATUS_COLORS.joined },
        { name: "Open", data: data.map((d) => d.open), color: REQ_STATUS_COLORS.open },
        { name: "Offer", data: data.map((d) => d.offer), color: REQ_STATUS_COLORS.offer },
        { name: "Cancelled", data: data.map((d) => d.cancelled), color: REQ_STATUS_COLORS.cancelled, roundTop: true },
      ]
    );
  }, [data]);
  return <EChartsCanvas option={option} height={220} />;
}

// ─── DONUT CHART ──────────────────────────────────────────────────────────────
type DonutDatum = { name: string; value: number; fullName?: string };

export function LevelDonutChart({
  data,
  maxLegendItems = 8,
}: {
  data: DonutDatum[];
  maxLegendItems?: number;
}) {
  const slices = useMemo(() => prepareDonutSlices(data, maxLegendItems), [data, maxLegendItems]);
  const option = useMemo(() => {
    if (!slices.length) return null;
    return buildDonutPieOption(slices);
  }, [slices]);

  if (!slices.length) return null;
  return (
    <div className="level-donut-chart" style={{ width: "100%", minHeight: 200 }}>
      <EChartsCanvas option={option} height={200} />
    </div>
  );
}

// ─── FINANCE BAR+LINE CHART ────────────────────────────────────────────────────
type FinancePoint = { month: string; budget: number; actual: number; forecast: number };

export function FinanceTrendChart({ data }: { data: FinancePoint[] }) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildExecutiveRevenueYoYOption(
      data.map((d) => d.month),
      data.map((d) => d.budget),
      data.map((d) => d.actual),
      data.map((d) => d.forecast),
      data.map(() => 0),
      "Prior"
    );
  }, [data]);
  return <EChartsCanvas option={option} height={180} />;
}

// ─── SLA STACKED COMPLIANCE BAR ───────────────────────────────────────────────
type SlaPoint = { month: string; met: number; notMet: number; notReported: number };

export function SlaComplianceBar({ data, height = 220 }: { data: SlaPoint[]; height?: number }) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildStackedVerticalBarOption(
      data.map((d) => d.month),
      [
        { name: "Met", data: data.map((d) => d.met), color: SLA_STACK_COLORS.met },
        { name: "Not Met", data: data.map((d) => d.notMet), color: SLA_STACK_COLORS.notMet },
        { name: "Not Reported", data: data.map((d) => d.notReported), color: SLA_STACK_COLORS.notReported, roundTop: true },
      ]
    );
  }, [data]);
  return <EChartsCanvas option={option} height={height} />;
}

// ─── WFM ──────────────────────────────────────────────────────────────────────
export type WfmProdFillPoint = { name: string; fillPct: number; productivity: number; fullName?: string };

export function WfmProductivityFillChart({ data }: { data: WfmProdFillPoint[] }) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildWfmProductivityFillOption(
      data.map((d) => d.name),
      data.map((d) => d.fillPct),
      data.map((d) => d.productivity)
    );
  }, [data]);
  if (!data.length) {
    return <EmptyChartState height={200} message="Upload WFM data with ideal HC to compare" />;
  }
  return <EChartsCanvas option={option} height={300} />;
}

// ─── WL STACKED BAR ───────────────────────────────────────────────────────────
type WlDatum = { name: string; wl1: number; wl2: number; wl3: number; wl4: number };

export function WlDistributionBar({ data }: { data: WlDatum[] }) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildStackedVerticalBarOption(
      data.map((d) => d.name),
      [
        { name: "WL1", data: data.map((d) => d.wl1), color: CHART_COLORS[0] },
        { name: "WL2", data: data.map((d) => d.wl2), color: CHART_COLORS[1] },
        { name: "WL3", data: data.map((d) => d.wl3), color: CHART_COLORS[2] },
        { name: "WL4+", data: data.map((d) => d.wl4), color: CHART_COLORS[3], roundTop: true },
      ]
    );
  }, [data]);
  return <EChartsCanvas option={option} height={140} />;
}

// ─── GAUGE RING ───────────────────────────────────────────────────────────────
export function GaugeRing({ value, label, sublabel, color }: {
  value: number; label: string; sublabel: string; color?: string;
}) {
  const option = useMemo(() => buildGaugeKpiOption(Number(value), label), [value, label]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 120, height: 120 }}>
        <EChartsCanvas option={option} height={120} />
      </div>
      <div>
        <div style={{ fontSize: 10, color: "var(--text-subtle)", marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: color ?? "var(--text-muted)" }}>{sublabel}</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: color ?? "var(--accent)" }}>{formatPercent(Number(value))}</div>
      </div>
    </div>
  );
}

// ─── BULLET CHART ─────────────────────────────────────────────────────────────
type BulletItem = { name: string; actual: number; ideal: number; color: string };

export function HcBulletChart({ items }: { items: BulletItem[] }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((item) => {
        const pct = Math.min(100, Math.round((item.actual / Math.max(item.ideal, 1)) * 100));
        return (
          <div key={item.name}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
              <span>{item.name}</span>
              <span style={{ color: item.color }}>{formatNumber(item.actual)} / {formatNumber(item.ideal)}</span>
            </div>
            <div style={{ height: 8, background: "var(--surface-sunken)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: item.color, borderRadius: 4 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function HcIdealActualGroupedChart({ items }: { items: BulletItem[] }) {
  const option = useMemo(() => {
    if (!items.length) return null;
    const names = items.map((i) => i.name);
    return buildHorizontalGroupedBarOption(names, [
      { name: "Ideal HC", data: items.map((i) => i.ideal), color: PO_COLOR },
      { name: "Actual HC", data: items.map((i) => i.actual), color: ACTUAL_COLOR },
    ]);
  }, [items]);
  if (!items.length) return null;
  const height = Math.min(440, Math.max(200, 56 + items.length * 36));
  return <EChartsCanvas option={option} height={height} />;
}

// ─── AGEING BARS ──────────────────────────────────────────────────────────────
type AgeingBucket = { label: string; count: number; max: number; color: string };

export function AgeingBars({ buckets }: { buckets: AgeingBucket[] }) {
  const option = useMemo(() => {
    if (!buckets.length) return null;
    return buildHorizontalRankingBarOption(
      buckets.map((b) => b.label),
      buckets.map((b) => b.count),
      buckets.map((b, i) => b.color || AGEING_COLORS[i % AGEING_COLORS.length])
    );
  }, [buckets]);
  return <EChartsCanvas option={option} height={Math.max(120, buckets.length * 36)} />;
}

// ─── WATERFALL ────────────────────────────────────────────────────────────────
type WaterfallItem = { label: string; value: number; color: string; isTotal?: boolean };

export function WaterfallChart({ items }: { items: WaterfallItem[] }) {
  const option = useMemo(() => {
    if (!items.length) return null;
    return buildWaterfallChartOption(items.map((i) => ({ name: i.label, value: i.value, isTotal: i.isTotal })));
  }, [items]);
  return <EChartsCanvas option={option} height={Math.max(160, items.length * 32)} />;
}

// ─── RISK BAR ─────────────────────────────────────────────────────────────────
export function RiskBar({ score, color }: { score: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{ flex: 1, height: 3, background: "var(--surface-sunken)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 2, background: color, width: `${score}%` }} />
      </div>
      <span style={{ fontFamily: "var(--mono)", fontSize: 10, color }}>{score}</span>
    </div>
  );
}

// ─── SPARKLINE ────────────────────────────────────────────────────────────────
export function Sparkline({ data, color = GMV_COLOR }: { data: number[]; color?: string }) {
  const option = useMemo(() => {
    if (!data || data.length < 2) return null;
    return buildMultiLineTimeseriesOption(
      data.map((_, i) => String(i)),
      [{ name: "trend", data, color }]
    );
  }, [data, color]);
  if (!data || data.length < 2) return null;
  return <EChartsCanvas option={option} height={22} />;
}

// ─── SLA TIME SERIES ──────────────────────────────────────────────────────────
export type SlaSeriesPoint = { month: string; [account: string]: number | string | null };

export function SlaTimeSeriesChart({
  data,
  accounts,
  syncDataZoomGroup,
}: {
  data: SlaSeriesPoint[];
  accounts: string[];
  syncDataZoomGroup?: string;
}) {
  const option = useMemo(() => {
    if (!data.length || !accounts.length) return null;
    const labels = data.map((d) => formatSlaYmAxis(String(d.month)));
    const seriesList = accounts.map((acc, i) => ({
      name: acc,
      data: data.map((d) => (d[acc] != null ? Number(d[acc]) : null)),
      color: colorForSeries(i),
    }));
    const opt = buildMultiLineTimeseriesOption(labels, seriesList, "Met %");
    if (opt.yAxis && Array.isArray(opt.yAxis)) {
      opt.yAxis[0] = { ...opt.yAxis[0], max: 100, axisLabel: { color: "#94a3b8", fontSize: 10, formatter: "{value}%" } };
    }
    return opt;
  }, [data, accounts]);

  if (!data.length || !accounts.length) return null;
  return <EChartsCanvas option={option} height={220} syncDataZoomGroup={syncDataZoomGroup} />;
}

// ─── SLA FY COMPARISON ────────────────────────────────────────────────────────
export type SlaFyComparePoint = { name: string; p1: number | null; p2: number | null };

export function SlaFyComparisonLineChart({
  data,
  labelP1,
  labelP2,
  height = 260,
}: {
  data: SlaFyComparePoint[];
  labelP1: string;
  labelP2: string;
  height?: number;
}) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildMultiLineTimeseriesOption(
      data.map((d) => d.name),
      [
        { name: labelP1, data: data.map((d) => d.p1), color: ACTUAL_COLOR },
        { name: labelP2, data: data.map((d) => d.p2), color: PO_COLOR },
      ]
    );
  }, [data, labelP1, labelP2]);
  if (!data.length) return <EmptyChartState height={height} message="No data for this period" />;
  return <EChartsCanvas option={option} height={height} />;
}

export type SlaFyCountDatum = { period: string; met: number; notMet: number };

export function SlaFyPortfolioMetNotMetBar({ data, height = 200 }: { data: SlaFyCountDatum[]; height?: number }) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildVerticalGroupedBarOption(
      data.map((d) => d.period),
      [
        { name: "Met", data: data.map((d) => d.met), color: SLA_STACK_COLORS.met },
        { name: "Not met", data: data.map((d) => d.notMet), color: SLA_STACK_COLORS.notMet },
      ]
    );
  }, [data]);
  if (!data.length) return null;
  return <EChartsCanvas option={option} height={height} />;
}

export function SlaFyComparisonGroupedBar({
  data,
  labelP1,
  labelP2,
  height = 260,
}: {
  data: SlaFyComparePoint[];
  labelP1: string;
  labelP2: string;
  height?: number;
}) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildVerticalGroupedBarOption(
      data.map((d) => d.name),
      [
        { name: labelP1, data: data.map((d) => d.p1 ?? 0), color: ACTUAL_COLOR },
        { name: labelP2, data: data.map((d) => d.p2 ?? 0), color: PO_COLOR },
      ]
    );
  }, [data, labelP1, labelP2]);
  if (!data.length) return <EmptyChartState height={height} message="No data for this period" />;
  return <EChartsCanvas option={option} height={height} />;
}

export type SlaRankBarDatum = { name: string; value: number };

export function SlaExecutiveMetPctBar({ data, height = 140 }: { data: SlaRankBarDatum[]; height?: number }) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildSemanticHorizontalBarOption(
      data.map((d) => d.name),
      data.map((d) => d.value)
    );
  }, [data]);
  if (!data.length) return null;
  return <EChartsCanvas option={option} height={height} />;
}

export type SlaDeltaBarDatum = {
  name: string;
  delta: number;
  p1?: number | null;
  p2?: number | null;
  account?: string;
};

export function SlaExecutiveDeltaBar({
  data,
  height = 140,
  onSelectAccount,
}: {
  data: SlaDeltaBarDatum[];
  height?: number;
  onSelectAccount?: (account: string) => void;
}) {
  const option = useMemo((): EChartsOption | null => {
    if (!data.length) return null;
    const names = data.map((d) => d.name);
    const values = data.map((d) => d.delta);
    const colors = values.map((v) => (v >= 0 ? PO_COLOR : FAIL_COLOR));
    return buildHorizontalRankingBarOption(names, values.map(Math.abs), colors);
  }, [data]);

  if (!data.length) return null;
  return (
    <div
      onClick={(e) => {
        if (!onSelectAccount) return;
        const target = e.target as HTMLElement;
        if (target.closest(".echarts-canvas-wrapper")) {
          /* chart click handled by echarts if wired */
        }
      }}
    >
      <EChartsCanvas option={option} height={height} />
    </div>
  );
}

export function SlaMetNotMetDonut({
  met,
  notMet,
  label,
  height = 168,
}: {
  met: number;
  notMet: number;
  label: string;
  height?: number;
}) {
  const total = met + notMet;
  const option = useMemo(() => {
    if (total <= 0) return null;
    return buildDonutPieOption(
      [
        { name: "Met", value: met },
        { name: "Not met", value: notMet },
      ],
      [SLA_STACK_COLORS.met, SLA_STACK_COLORS.notMet]
    );
  }, [met, notMet, total]);

  if (total <= 0) {
    return <EmptyChartState height={height} message="No met / not-met snapshots in window" />;
  }
  return (
    <div style={{ width: "100%" }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginBottom: 4 }}>{label}</div>
      <EChartsCanvas option={option} height={height} />
    </div>
  );
}

export type SlaBenchmarkDatum = { name: string; client: number; benchmark: number };

export function SlaBenchmarkGroupedBar({ data, benchmarkLabel, height = 260 }: { data: SlaBenchmarkDatum[]; benchmarkLabel: string; height?: number }) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildVerticalGroupedBarOption(
      data.map((d) => d.name),
      [
        { name: "Client Met %", data: data.map((d) => d.client), color: ACTUAL_COLOR },
        { name: benchmarkLabel, data: data.map((d) => d.benchmark), color: BUDGET_COLOR },
      ]
    );
  }, [data, benchmarkLabel]);
  if (!data.length) return <EmptyChartState height={height} message="No comparison data" />;
  return <EChartsCanvas option={option} height={height} />;
}

export type SlaCountDatum = { name: string; count: number };

export function SlaNotReportedCountBar({ data, height = 200 }: { data: SlaCountDatum[]; height?: number }) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildSingleVerticalBarOption(
      data.map((d) => d.name),
      data.map((d) => d.count),
      "Not reported",
      CHART_COLORS[2]
    );
  }, [data]);
  if (!data.length) return null;
  return <EChartsCanvas option={option} height={height} />;
}

export type SlaMetricMonthStackDatum = { month: string; met: number; notMet: number; notReported: number };

export function SlaMetricMonthStackedBar({ data, height = 160 }: { data: SlaMetricMonthStackDatum[]; height?: number }) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildStackedVerticalBarOption(
      data.map((d) => d.month),
      [
        { name: "Met", data: data.map((d) => d.met), color: SLA_STACK_COLORS.met },
        { name: "Not Met", data: data.map((d) => d.notMet), color: SLA_STACK_COLORS.notMet },
        { name: "Not Reported", data: data.map((d) => d.notReported), color: SLA_STACK_COLORS.notReported, roundTop: true },
      ]
    );
  }, [data]);
  if (!data.length) return null;
  return <EChartsCanvas option={option} height={height} />;
}

type MatrixRow = { metric: string; scores: Array<"met" | "near" | "breached" | "none"> };

export function ComplianceMatrix({ months, rows }: { months: string[]; rows: MatrixRow[] }) {
  const option = useMemo(() => {
    const cells: { month: string; row: string; value: number }[] = [];
    const scoreVal = (s: string) => (s === "met" ? 100 : s === "near" ? 70 : s === "breached" ? 30 : 0);
    rows.forEach((r) => {
      r.scores.forEach((s, i) => {
        cells.push({ month: months[i], row: r.metric, value: scoreVal(s) });
      });
    });
    return buildComplianceHeatmapOption(months, rows.map((r) => r.metric), cells);
  }, [months, rows]);
  return <EChartsCanvas option={option} height={Math.max(160, rows.length * 28 + 60)} />;
}

// ─── EXECUTIVE DASHBOARD ──────────────────────────────────────────────────────
export function ExecutiveRevenueYoYChart({
  data,
  priorLabel,
}: {
  data: YoYRevPoint[];
  priorLabel: string;
}) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildExecutiveRevenueYoYOption(
      data.map((d) => d.month),
      data.map((d) => d.budget),
      data.map((d) => d.actual),
      data.map((d) => d.forecast),
      data.map((d) => d.priorActual),
      priorLabel
    );
  }, [data, priorLabel]);
  if (!data.length) {
    return <EmptyChartState height={220} message="No finance rows for filters — upload Finance data or widen filters" />;
  }
  return <EChartsCanvas option={option} height={CHART_HEIGHT.md} />;
}

export function ExecutiveCmYoYChart({
  data,
  compareLabel = "Comparison FY",
}: {
  data: YoYCmPoint[];
  compareLabel?: string;
}) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildCmYoYLineOption(
      data.map((d) => d.month),
      data.map((d) => d.actualPct),
      data.map((d) => d.priorActualPct),
      compareLabel,
      35
    );
  }, [data, compareLabel]);
  if (!data.length) return <EmptyChartState height={220} message="No CM data for filters" />;
  return <EChartsCanvas option={option} height={CHART_HEIGHT.md} />;
}

export function RegionalRevenueBarChart({ data }: { data: RegionBarDatum[] }) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildVerticalGroupedBarOption(
      data.map((d) => d.region),
      [
        { name: "Budget", data: data.map((d) => d.budget), color: BUDGET_COLOR },
        { name: "Actual", data: data.map((d) => d.actual), color: ACTUAL_COLOR },
      ]
    );
  }, [data]);
  if (!data.length) return <EmptyChartState height={200} message="No regional breakdown — check filters" />;
  return <EChartsCanvas option={option} height={280} />;
}

export type GovernanceGroupedBarSeries = { dataKey: string; name: string; fill: string };

export function GovernanceForecastGroupedBarChart({
  data,
  series,
  height = 320,
}: {
  data: Array<Record<string, string | number | undefined>>;
  series: GovernanceGroupedBarSeries[];
  height?: number;
}) {
  const option = useMemo(() => {
    if (!data.length || !series.length) return null;
    const categories = data.map((d) => String(d.name ?? ""));
    const stackedSeries = series.map((s, idx) => ({
      name: s.name,
      data: data.map((row) => Number(row[s.dataKey]) || 0),
      color: s.fill || colorForSeries(idx),
    }));
    return buildStackedCategoryOverTimeOption(categories, stackedSeries);
  }, [data, series]);

  if (!data.length || !series.length) {
    return (
      <EmptyChartState
        height={height}
        message="Select at least one project and week with tracker forecast data."
      />
    );
  }
  return <EChartsCanvas option={option} height={height} />;
}

/** Re-export funnel builder for client pipeline */
export { buildFunnelPipelineOption };
