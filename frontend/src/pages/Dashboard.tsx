import React, { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatLargeCurrency, formatPercent } from "@/lib/utils";
import { queries, type GlobalMonitor, type GlobalStats, type Project, type RequisitionKpis } from "@/lib/api";
import { financeStatsVm, financeRowsVm, type FinanceRowVm } from "@/lib/view-models/finance";
import { slaStatsVm } from "@/lib/view-models/sla";
import {
  ExecutiveRevenueYoYChart,
  ExecutiveCmYoYChart,
  RegionalRevenueBarChart,
  RiskBar,
} from "@/components/platform/Charts";
import { PlatformDrawer } from "@/components/platform/PlatformDrawer";
import { SkeletonKpiRow } from "@/components/platform/Skeleton";
import { DashboardFilters } from "@/components/platform/DashboardFilters";
import { ProductivityAveragesSection } from "@/components/platform/ProductivityAveragesSection";
import {
  DEFAULT_DASHBOARD_FILTERS,
  filterFinanceRows,
  buildYoYRevenueSeries,
  buildRegionalRevenue,
  buildExecutiveSummary,
  aggregateFinanceFromRows,
  quarterlyPlanActualForFy,
  fiscalYearStart,
  parseMonthSort,
  type DashboardFilters as DF,
} from "@/lib/dashboard-aggregates";
import "@/styles/exec-dashboard.css";

function fyShortLabel(start: number): string {
  return `FY${String(start).slice(2)}–${String(start + 1).slice(2)}`;
}

function yoyDelta(curr: number, prev: number): { label: string; cls: string } {
  if (prev <= 0 || curr <= 0) return { label: "—", cls: "exec-delta-chip--muted" };
  const p = ((curr - prev) / prev) * 100;
  const cls = p > 0.5 ? "exec-delta-chip--green" : p < -0.5 ? "exec-delta-chip--red" : "exec-delta-chip--amber";
  return { label: `${p >= 0 ? "▲" : "▼"} ${Math.abs(p).toFixed(1)}% YoY`, cls };
}

function attainmentCls(pct: number): "green" | "amber" | "red" {
  return pct >= 100 ? "green" : pct >= 70 ? "amber" : "red";
}

function realComposite(p: {
  positions: number; closed: number; active: number; on_hold: number; revenue: number;
}): number {
  const total = Math.max(p.positions, 1);
  const fill = (p.closed / total) * 100;
  const activity = ((p.closed + p.active) / total) * 100;
  const holdFree = Math.max(0, 100 - (p.on_hold / total) * 100);
  const revScore = Math.min(100, ((p.revenue / total) / 200_000) * 100);
  return Math.round(fill * 0.4 + activity * 0.3 + holdFree * 0.2 + revScore * 0.1);
}

function worstDomain(p: { positions: number; closed: number; on_hold: number; revenue: number }): string {
  const total = Math.max(p.positions, 1);
  if ((p.closed / total) * 100 < 40) return "Hiring";
  if ((p.on_hold / total) * 100 > 25) return "SLA";
  if (p.revenue / total < 80_000) return "Finance";
  return "WFM";
}

/* ── Sub-components ── */

function HeroCard({
  eyebrow,
  variant,
  primary,
  deltas,
  attainmentLabel,
  attainmentPct,
  meta,
  children,
}: {
  eyebrow: string;
  variant: "orange" | "teal" | "blue";
  primary: React.ReactNode;
  deltas?: { label: string; cls: string }[];
  attainmentLabel?: string;
  attainmentPct?: number;
  meta?: { label: string; value: React.ReactNode; valueCls?: string }[];
  children?: React.ReactNode;
}) {
  const att = attainmentPct ?? 0;
  const attCls = attainmentCls(att);
  return (
    <div className={`exec-hero-card exec-hero-card--${variant}`}>
      <div className="exec-hero-card__eyebrow">{eyebrow}</div>
      <div className="exec-hero-card__primary">{primary}</div>
      {deltas && deltas.length > 0 && (
        <div className="exec-hero-card__deltas">
          {deltas.map((d, i) => (
            <span key={i} className={`exec-delta-chip ${d.cls}`}>{d.label}</span>
          ))}
        </div>
      )}
      {attainmentLabel != null && (
        <div className="exec-attainment">
          <div className="exec-attainment__header">
            <span className="exec-attainment__label">{attainmentLabel}</span>
            <span className={`exec-attainment__pct exec-attainment__pct--${attCls}`}>
              {att.toFixed(1)}%
            </span>
          </div>
          <div className="exec-attainment__track">
            <div
              className={`exec-attainment__fill exec-attainment__fill--${attCls}`}
              style={{ width: `${Math.min(100, att)}%` }}
            />
          </div>
        </div>
      )}
      {children}
      {meta && meta.length > 0 && (
        <div className="exec-hero-card__meta">
          {meta.map((m, i) => (
            <div key={i} className="exec-hero-card__meta-row">
              <span className="exec-hero-card__meta-label">{m.label}</span>
              <span className={`exec-hero-card__meta-val${m.valueCls ? ` exec-hero-card__meta-val--${m.valueCls}` : ""}`}>
                {m.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PulseCard({
  icon,
  iconVariant,
  label,
  primary,
  sub,
  badge,
}: {
  icon: string;
  iconVariant: "blue" | "green" | "amber" | "red" | "orange" | "teal";
  label: string;
  primary: React.ReactNode;
  sub?: React.ReactNode;
  badge?: { label: string; cls: string };
}) {
  return (
    <div className="exec-pulse-card">
      <div className="exec-pulse-card__icon-row">
        <div className={`exec-pulse-card__icon exec-pulse-card__icon--${iconVariant}`}>{icon}</div>
        {badge && <span className={`exec-delta-chip ${badge.cls}`}>{badge.label}</span>}
      </div>
      <div className="exec-pulse-card__label">{label}</div>
      <div className="exec-pulse-card__primary">{primary}</div>
      {sub && <div className="exec-pulse-card__sub">{sub}</div>}
    </div>
  );
}

function SectionCard({
  tag,
  title,
  action,
  onAction,
  children,
  noPad,
}: {
  tag?: string;
  title: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
  noPad?: boolean;
}) {
  return (
    <div className="exec-section-card">
      <div className="exec-section-card__header">
        <div>
          {tag && <div className="exec-section-card__tag">{tag}</div>}
          <div className="exec-section-card__title">{title}</div>
        </div>
        {action && (
          <button type="button" className="exec-section-card__action" onClick={onAction}>
            {action}
          </button>
        )}
      </div>
      <div className={noPad ? undefined : "exec-section-card__body"}>{children}</div>
    </div>
  );
}

/* ── Main page ── */
export const Dashboard = () => {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [monitor, setMonitor] = useState<GlobalMonitor | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [financeStatsApi, setFinanceStatsApi] = useState<ReturnType<typeof financeStatsVm> | null>(null);
  const [financeRows, setFinanceRows] = useState<FinanceRowVm[]>([]);
  const [slaStats, setSlaStats] = useState<ReturnType<typeof slaStatsVm> | null>(null);
  const [wfmStats, setWfmStats] = useState<any>(null);
  const [reqKpis, setReqKpis] = useState<RequisitionKpis | null>(null);
  const [drilldown, setDrilldown] = useState<Array<{ name: string; revenue: number; count: number }>>([]);
  const [loadingCore, setLoadingCore] = useState(true);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [drawerClient, setDrawerClient] = useState<string | null>(null);
  const [heatmapFullOpen, setHeatmapFullOpen] = useState(false);
  const [filters, setFilters] = useState<DF>(DEFAULT_DASHBOARD_FILTERS);
  const [fyCompare, setFyCompare] = useState(true);
  const [selectedFyStart, setSelectedFyStart] = useState<number>(2025);
  /** null = auto-pick most recent FY in data that is &lt; selected primary FY */
  const [compareFyOverride, setCompareFyOverride] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
        Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

      /** Ledger + monitor endpoints can be slow on large DBs; keep above axios timeout. */
      const T_HEAVY = 90_000;
      const T_STD = 60_000;

      try {
        const [
          sRes,
          mRes,
          proj,
          fStats,
          fRows,
          sStats,
          wfm,
          rk,
          dd,
        ] = await Promise.allSettled([
          withTimeout(queries.globalStats(), T_STD, null),
          withTimeout(queries.globalMonitor(), T_HEAVY, null),
          withTimeout(queries.projects(), T_STD, []),
          withTimeout(queries.financeStats(), T_STD, null),
          withTimeout(queries.financeData(), T_HEAVY, []),
          withTimeout(queries.slaStats(), T_STD, null),
          withTimeout(queries.wfmStats(), T_STD, null),
          withTimeout(queries.requisitionKpis(), T_STD, null),
          withTimeout(queries.globalDrilldown("hiring_manager"), T_STD, []),
        ]);
        if (!mounted) return;

        if (sRes.status === "fulfilled" && sRes.value != null) setStats(sRes.value);
        if (mRes.status === "fulfilled" && mRes.value != null) setMonitor(mRes.value);
        if (sRes.status === "rejected" && mRes.status === "rejected") {
          setCoreError("Unable to load dashboard KPIs — verify API connectivity.");
        }

        if (proj.status === "fulfilled") setProjects(proj.value || []);
        if (fStats.status === "fulfilled" && fStats.value) setFinanceStatsApi(financeStatsVm(fStats.value));
        if (fRows.status === "fulfilled" && fRows.value) setFinanceRows(financeRowsVm(fRows.value as any[]));
        if (sStats.status === "fulfilled" && sStats.value) setSlaStats(slaStatsVm(sStats.value));
        if (wfm.status === "fulfilled") setWfmStats(wfm.value);
        if (rk.status === "fulfilled") setReqKpis(rk.value as RequisitionKpis);
        if (dd.status === "fulfilled") setDrilldown((dd.value as any) || []);
      } catch {
        if (mounted) setCoreError("Unable to load KPIs — check backend connectivity.");
      } finally {
        if (mounted) setLoadingCore(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const fyYears = useMemo(() => {
    const set = new Set<number>();
    for (const r of financeRows) {
      const d = parseMonthSort(r.month_sort);
      if (d) set.add(fiscalYearStart(d));
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [financeRows]);

  useEffect(() => {
    if (fyYears.length && !fyYears.includes(selectedFyStart)) {
      setSelectedFyStart(fyYears[0]);
    }
  }, [fyYears, selectedFyStart]);

  useEffect(() => {
    if (
      compareFyOverride != null &&
      (compareFyOverride === selectedFyStart || !fyYears.includes(compareFyOverride))
    ) {
      setCompareFyOverride(null);
    }
  }, [selectedFyStart, compareFyOverride, fyYears]);

  const filteredRows = useMemo(() => filterFinanceRows(financeRows, projects, filters), [financeRows, projects, filters]);

  const autoCompareFy = useMemo(() => {
    const older = fyYears.filter((y) => y < selectedFyStart).sort((a, b) => b - a);
    if (older.length) return older[0];
    return selectedFyStart - 1;
  }, [fyYears, selectedFyStart]);

  const effectiveCompareFy = useMemo(() => {
    if (
      compareFyOverride != null &&
      fyYears.includes(compareFyOverride) &&
      compareFyOverride !== selectedFyStart
    ) {
      return compareFyOverride;
    }
    return autoCompareFy;
  }, [compareFyOverride, fyYears, selectedFyStart, autoCompareFy]);

  const compareFyLabel = fyShortLabel(effectiveCompareFy);

  const kpiRows = useMemo(() => {
    if (!fyYears.length) return filteredRows;
    return filteredRows.filter((r) => {
      const d = parseMonthSort(r.month_sort);
      return d && fiscalYearStart(d) === selectedFyStart;
    });
  }, [filteredRows, fyYears.length, selectedFyStart]);

  const priorKpiRows = useMemo(() => {
    if (!fyYears.length) return [] as FinanceRowVm[];
    return filteredRows.filter((r) => {
      const d = parseMonthSort(r.month_sort);
      return d && fiscalYearStart(d) === effectiveCompareFy;
    });
  }, [filteredRows, fyYears.length, effectiveCompareFy]);

  const priorFinance = useMemo(() => aggregateFinanceFromRows(priorKpiRows), [priorKpiRows]);

  const displayFinance = useMemo(() => {
    const agg = aggregateFinanceFromRows(kpiRows);
    if (agg) return agg;
    return financeStatsApi ? { ...financeStatsApi, collection_pending_inr: financeStatsApi.collection_pending_inr ?? 0 } : null;
  }, [kpiRows, financeStatsApi]);

  const { revenue: yoyRev, cm: yoyCm } = useMemo(
    () => buildYoYRevenueSeries(filteredRows, selectedFyStart, effectiveCompareFy),
    [filteredRows, selectedFyStart, effectiveCompareFy],
  );

  const priorFYTotalCr = (priorFinance?.revenue_actual_inr ?? 0) / 1e7;

  const revQuarters = useMemo(() => quarterlyPlanActualForFy(kpiRows, selectedFyStart), [kpiRows, selectedFyStart]);

  const regional = useMemo(() => buildRegionalRevenue(filteredRows, projects), [filteredRows, projects]);

  const execRows = useMemo(() => {
    if (!displayFinance) return [];
    return buildExecutiveSummary(
      {
        revenue_budget_inr: displayFinance.revenue_budget_inr,
        revenue_forecast_inr: displayFinance.revenue_forecast_inr ?? 0,
        revenue_actual_inr: displayFinance.revenue_actual_inr,
        total_cm_inr: displayFinance.total_cm_inr,
        total_unbilled_inr: displayFinance.total_unbilled_inr,
        total_bad_debt_inr: displayFinance.total_bad_debt_inr,
        total_collected_inr: displayFinance.total_collected_inr,
        total_collection_target_inr: displayFinance.total_collection_target_inr,
        rev_attainment: displayFinance.rev_attainment,
      },
      priorFYTotalCr,
      priorFinance,
    );
  }, [displayFinance, priorFYTotalCr, priorFinance]);

  const projectStats = monitor?.project_stats || [];
  const riskRows = useMemo(
    () =>
      projectStats
        .map((p) => {
          const score = realComposite(p);
          const risk = score < 50 ? "HIGH" : score < 70 ? "MED" : "OK";
          return { ...p, risk, score };
        })
        .sort((a, b) => a.score - b.score),
    [projectStats],
  );

  const interventions = useMemo(() => riskRows.filter((r) => r.risk !== "OK").slice(0, 5), [riskRows]);
  const selectedClient = riskRows.find((r) => r.name === drawerClient);

  /* ── Derived numbers ── */
  const cmPct =
    displayFinance && displayFinance.revenue_actual_inr > 0
      ? (displayFinance.total_cm_inr / displayFinance.revenue_actual_inr) * 100
      : 0;
  const cmPriorPct =
    priorFinance && priorFinance.revenue_actual_inr > 0
      ? (priorFinance.total_cm_inr / priorFinance.revenue_actual_inr) * 100
      : null;

  const unb = displayFinance?.total_unbilled_inr ?? 0;
  const bd = displayFinance?.total_bad_debt_inr ?? 0;
  const coll = displayFinance?.total_collected_inr ?? 0;
  const ct = displayFinance?.total_collection_target_inr ?? 0;
  const revA = displayFinance?.revenue_actual_inr ?? 0;
  const revBudget = displayFinance?.revenue_budget_inr ?? 0;
  const unbPctRev = revA > 0 ? (unb / revA) * 100 : 0;
  const bdPctColl = coll > 0 ? (bd / coll) * 100 : 0;
  const collAtt = ct > 0 ? (coll / ct) * 100 : 0;
  const revAtt = displayFinance?.rev_attainment ?? 0;

  /* ── Quarter chart ── */
  const maxQPlan = Math.max(...revQuarters.map((q) => q.planInr), 1);

  const quarterBandContent =
    revQuarters.some((q) => q.planInr > 0 || q.actualInr > 0) ? (
      <div className="exec-quarter-band">
        {revQuarters.map((q) => {
          const planH = Math.max(4, (q.planInr / maxQPlan) * 28);
          const actH = Math.max(0, (q.actualInr / maxQPlan) * 28);
          const onTrack = q.actualInr + 1 >= q.planInr;
          return (
            <div key={q.q} className="exec-quarter-col">
              <div className="exec-quarter-col__bars">
                <div className="exec-quarter-col__bar-plan" style={{ height: planH }} />
                {q.actualInr > 0 && (
                  <div
                    className={`exec-quarter-col__bar-actual exec-quarter-col__bar-actual--${onTrack ? "on" : "off"}`}
                    style={{ height: actH }}
                  />
                )}
              </div>
              <div className="exec-quarter-col__label">{q.q}</div>
              <div className="exec-quarter-col__val">{formatLargeCurrency(q.actualInr || q.planInr)}</div>
            </div>
          );
        })}
      </div>
    ) : null;

  /* ── Risk colour helpers ── */
  function riskDotCls(color: "green" | "amber" | "red"): string {
    return `exec-risk-dot exec-risk-dot--${color}`;
  }

  function clientRiskColors(p: { positions: number; closed: number; active: number; on_hold: number; revenue: number }) {
    const total = Math.max(p.positions, 1);
    const revPerReq = p.revenue / total;
    const holdPct = (p.on_hold / total) * 100;
    const actPct = ((p.closed + p.active) / total) * 100;
    const fillPct = (p.closed / total) * 100;
    const fin = revPerReq > 200_000 ? "green" : revPerReq > 80_000 ? "amber" : "red";
    const sla = holdPct < 15 ? "green" : holdPct < 30 ? "amber" : "red";
    const wfm = actPct >= 80 ? "green" : actPct >= 60 ? "amber" : "red";
    const hiring = fillPct >= 70 ? "green" : fillPct >= 45 ? "amber" : "red";
    return { fin, sla, wfm, hiring } as const;
  }

  const riskLabel = { green: "OK", amber: "MED", red: "HIGH" } as const;

  return (
    <div className="exec-dash">
      {/* ── Controls ── */}
      <div className="exec-controls">
        <div className="exec-controls__left">
          <div className="exec-controls__title">Executive Overview</div>
          <div className="exec-controls__meta">
            {stats?.total_projects ?? "—"} clients &nbsp;·&nbsp;{" "}
            {(reqKpis?.total_records ?? stats?.total_records ?? 0).toLocaleString()} requisitions
            &nbsp;·&nbsp; Finance · SLA · WFM
          </div>
        </div>
        <div className="exec-controls__right">
          <span className="exec-fy-label">Compare FY</span>
          <button
            type="button"
            className={`platform-chip${fyCompare ? " active" : ""}`}
            onClick={() => setFyCompare((v) => !v)}
          >
            {fyCompare ? "YoY: On" : "YoY: Off"}
          </button>
          <select
            className="exec-compare-select"
            aria-label="Comparison fiscal year"
            value={compareFyOverride ?? ""}
            onChange={(e) => setCompareFyOverride(e.target.value === "" ? null : Number(e.target.value))}
            disabled={!fyCompare || fyYears.filter((y) => y !== selectedFyStart).length === 0}
          >
            <option value="">Auto ({fyShortLabel(autoCompareFy)})</option>
            {fyYears
              .filter((y) => y !== selectedFyStart)
              .map((y) => (
                <option key={y} value={y}>
                  {fyShortLabel(y)}
                </option>
              ))}
          </select>
          <div style={{ display: "flex", gap: 4 }}>
            {fyYears.map((y) => (
              <button
                key={y}
                type="button"
                className={`platform-chip${selectedFyStart === y ? " active" : ""}`}
                onClick={() => setSelectedFyStart(y)}
              >
                {fyShortLabel(y)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {coreError && <div className="alert-banner red">{coreError}</div>}

      {/* ── Filters ── */}
      <div className="exec-filter-bar">
        <DashboardFilters value={filters} onChange={setFilters} projects={projects} />
      </div>

      {/* ══ SECTION: THE MONEY ══ */}
      <div className="exec-section-label">Financial performance — {fyShortLabel(selectedFyStart)}</div>

      {loadingCore ? (
        <SkeletonKpiRow count={3} />
      ) : (
        <div className="exec-hero">
          {/* Revenue */}
          <HeroCard
            eyebrow="Revenue — Actual"
            variant="orange"
            primary={formatLargeCurrency(revA)}
            deltas={[
              fyCompare && priorFinance && priorFinance.revenue_actual_inr > 0
                ? yoyDelta(revA, priorFinance.revenue_actual_inr)
                : null,
            ].filter(Boolean) as { label: string; cls: string }[]}
            attainmentLabel={`vs ₹ Budget ${formatLargeCurrency(revBudget)}`}
            attainmentPct={revAtt}
            meta={[
              { label: "Full-year forecast", value: formatLargeCurrency(displayFinance?.revenue_forecast_inr ?? 0) },
              ...(fyCompare && priorFinance
                ? [{ label: `${compareFyLabel} Actual`, value: formatLargeCurrency(priorFinance.revenue_actual_inr) }]
                : []),
              ...(drilldown[0] ? [{ label: "Top HM", value: drilldown[0].name }] : []),
            ]}
          >
            {quarterBandContent}
          </HeroCard>

          {/* CM% */}
          <HeroCard
            eyebrow="Contribution Margin"
            variant="teal"
            primary={formatPercent(cmPct)}
            deltas={[
              cmPct >= 35
                ? { label: `+${(cmPct - 35).toFixed(1)} pp vs target`, cls: "exec-delta-chip--green" }
                : { label: `${(cmPct - 35).toFixed(1)} pp vs target`, cls: "exec-delta-chip--red" },
              ...(fyCompare && cmPriorPct != null
                ? [
                    cmPct >= cmPriorPct
                      ? { label: `▲ ${(cmPct - cmPriorPct).toFixed(1)} pp YoY`, cls: "exec-delta-chip--green" }
                      : { label: `▼ ${(cmPriorPct - cmPct).toFixed(1)} pp YoY`, cls: "exec-delta-chip--red" },
                  ]
                : []),
            ]}
            attainmentLabel="vs 35% target"
            attainmentPct={(cmPct / 35) * 100}
            meta={[
              { label: "Target CM%", value: "35.0%" },
              ...(fyCompare && cmPriorPct != null
                ? [{ label: `${compareFyLabel} CM%`, value: formatPercent(cmPriorPct) }]
                : []),
              { label: "CM value", value: formatLargeCurrency(displayFinance?.total_cm_inr ?? 0) },
            ]}
          />

          {/* Collection */}
          <HeroCard
            eyebrow="Collection"
            variant="blue"
            primary={formatLargeCurrency(coll)}
            deltas={[
              fyCompare && priorFinance && priorFinance.total_collected_inr > 0
                ? yoyDelta(coll, priorFinance.total_collected_inr)
                : null,
              collAtt >= 90
                ? { label: "On track", cls: "exec-delta-chip--green" }
                : { label: "Below target", cls: "exec-delta-chip--amber" },
            ].filter(Boolean) as { label: string; cls: string }[]}
            attainmentLabel={`vs ₹ Target ${formatLargeCurrency(ct)}`}
            attainmentPct={collAtt}
            meta={[
              {
                label: "Pending",
                value: formatLargeCurrency(displayFinance?.collection_pending_inr ?? Math.max(0, ct - coll)),
                valueCls: "amber",
              },
              { label: "Unbilled", value: `${formatPercent(unbPctRev)} of rev`, valueCls: unbPctRev > 10 ? "red" : undefined },
              { label: "Bad debt", value: formatLargeCurrency(bd), valueCls: bd > 0 ? "red" : undefined },
              { label: "Bad debt % coll.", value: formatPercent(bdPctColl) },
            ]}
          />
        </div>
      )}

      {/* ══ SECTION: OPERATIONAL PULSE ══ */}
      <div className="exec-section-label">Operational snapshot</div>

      {loadingCore ? (
        <SkeletonKpiRow count={4} />
      ) : (
        <div className="exec-pulse">
          <PulseCard
            icon="◎"
            iconVariant="blue"
            label="SLA Portfolio Health"
            primary={slaStats ? formatPercent(slaStats.portfolio_health) : "—"}
            sub={
              slaStats
                ? `${slaStats.met_count} met · ${slaStats.not_met_count} not met`
                : "No SLA data"
            }
            badge={
              slaStats
                ? slaStats.portfolio_health >= 80
                  ? { label: "Healthy", cls: "exec-delta-chip--green" }
                  : slaStats.portfolio_health >= 60
                    ? { label: "At risk", cls: "exec-delta-chip--amber" }
                    : { label: "Critical", cls: "exec-delta-chip--red" }
                : undefined
            }
          />
          <PulseCard
            icon="◈"
            iconVariant="teal"
            label="Workforce HC"
            primary={wfmStats ? Math.round(wfmStats.total_actual_hc ?? 0).toLocaleString() : "—"}
            sub={
              wfmStats
                ? `Ideal: ${Math.round(wfmStats.total_ideal_hc ?? 0)} · Fill rate: ${formatPercent(wfmStats.capacity_fill_rate ?? 0)}`
                : "No WFM data"
            }
            badge={
              wfmStats
                ? (wfmStats.capacity_fill_rate ?? 0) >= 90
                  ? { label: "Staffed", cls: "exec-delta-chip--green" }
                  : (wfmStats.capacity_fill_rate ?? 0) >= 75
                    ? { label: "Gap", cls: "exec-delta-chip--amber" }
                    : { label: "Understaffed", cls: "exec-delta-chip--red" }
                : undefined
            }
          />
          <PulseCard
            icon="◷"
            iconVariant="amber"
            label="Pipeline — Reqs"
            primary={reqKpis ? `${reqKpis.open_req.toLocaleString()}` : "—"}
            sub={
              reqKpis
                ? `${reqKpis.offer_req.toLocaleString()} at offer · ${reqKpis.joiners.toLocaleString()} joined`
                : "No data"
            }
            badge={
              reqKpis
                ? { label: "Open", cls: "exec-delta-chip--muted" }
                : undefined
            }
          />
          <PulseCard
            icon="⚠"
            iconVariant={unb + bd > 0 ? "red" : "green"}
            label="Unbilled + Bad Debt"
            primary={formatLargeCurrency(unb + bd)}
            sub={
              unb + bd > 0
                ? `Unbilled ${formatPercent(unbPctRev)} rev · Bad debt ${formatLargeCurrency(bd)}`
                : "No exposure"
            }
            badge={
              unb + bd === 0
                ? { label: "Clear", cls: "exec-delta-chip--green" }
                : unbPctRev > 15
                  ? { label: "High risk", cls: "exec-delta-chip--red" }
                  : { label: "Monitor", cls: "exec-delta-chip--amber" }
            }
          />
        </div>
      )}

      {/* ══ SECTION: TRENDS ══ */}
      <div className="exec-section-label">Performance trends</div>

      <div className="exec-charts">
        <SectionCard
          tag="Finance"
          title={`Monthly Revenue — Actual vs Budget vs Forecast${fyCompare ? ` vs ${compareFyLabel}` : ""}`}
          noPad
        >
          <div style={{ padding: "16px 20px" }}>
            {yoyRev.length === 0 || !filteredRows.length ? (
              <div className="exec-empty">No finance data for current filters</div>
            ) : (
              <ExecutiveRevenueYoYChart
                data={fyCompare ? yoyRev : yoyRev.map((p) => ({ ...p, priorActual: 0 }))}
                priorLabel={`${compareFyLabel} Actual`}
              />
            )}
          </div>
        </SectionCard>

        <SectionCard tag="Margin" title={`CM% — ${fyShortLabel(selectedFyStart)}${fyCompare ? ` vs ${compareFyLabel}` : ""}`} noPad>
          <div style={{ padding: "16px 20px" }}>
            {yoyCm.length === 0 || !filteredRows.length ? (
              <div className="exec-empty">No CM data</div>
            ) : (
              <ExecutiveCmYoYChart
                data={fyCompare ? yoyCm : yoyCm.map((p) => ({ ...p, priorActualPct: 0 }))}
                compareLabel={`CM% (${compareFyLabel})`}
              />
            )}
          </div>
        </SectionCard>
      </div>

      {/* ══ SECTION: PRODUCTIVITY ══ */}
      <ProductivityAveragesSection rows={filteredRows} loading={loadingCore} externalFilters />

      {/* ══ SECTION: REGIONAL (finance ledger / filters) ══ */}
      <div className="exec-bottom-grid exec-bottom-grid--single">
        <SectionCard tag="Geography" title="Revenue by region — Actual vs Budget" noPad>
          <div style={{ padding: "16px 20px" }}>
            <RegionalRevenueBarChart data={regional} />
          </div>
        </SectionCard>
      </div>

      {/* ══ SECTION: EXECUTIVE SUMMARY TABLE ══ */}
      <SectionCard tag="Scorecard" title="Executive summary — Budget vs Forecast vs Actual vs YoY">
        {execRows.length === 0 ? (
          <div className="exec-empty">Upload finance data to populate this table</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="exec-summary-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Budget</th>
                  <th>Forecast</th>
                  <th>Actual</th>
                  <th>Var vs Budget</th>
                  <th>Var vs Fcst</th>
                  <th>{compareFyLabel}</th>
                  <th>YoY</th>
                </tr>
              </thead>
              <tbody>
                {execRows.map((row) => {
                  const varBudgetPos = typeof row.varBudget === "string" && row.varBudget.startsWith("+");
                  const varBudgetNeg = typeof row.varBudget === "string" && row.varBudget.startsWith("−");
                  const yoyPos = typeof row.yoy === "string" && row.yoy.startsWith("+");
                  const yoyNeg = typeof row.yoy === "string" && row.yoy.startsWith("−");
                  return (
                    <tr key={row.metric}>
                      <td>{row.metric}</td>
                      <td>{row.budget}</td>
                      <td>{row.forecast}</td>
                      <td style={{ fontWeight: 600, color: "var(--text)" }}>{row.actual}</td>
                      <td className={varBudgetPos ? "exec-summary-table__var-pos" : varBudgetNeg ? "exec-summary-table__var-neg" : ""}>
                        {row.varBudget}
                      </td>
                      <td>{row.varForecast}</td>
                      <td>{row.priorActual}</td>
                      <td className={yoyPos ? "exec-summary-table__var-pos" : yoyNeg ? "exec-summary-table__var-neg" : ""}>
                        {row.yoy}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ══ SECTION: PORTFOLIO MONITOR — requisition / pipeline (not FY ledger) ══ */}
      <div className="exec-monitor-section">
        <div className="exec-section-label">Portfolio monitor and pipeline</div>
        <p className="exec-monitor-section__intro">
          Client risk columns (Finance, SLA, WFM, Hiring), intervention cards, and the hiring-manager table
          use portfolio monitor and requisition heuristics. They are not tied to the fiscal year chips,
          compare-year selector, or finance ledger uploads above.
        </p>

        <div className="exec-intel">
          <SectionCard
            tag="Risk radar"
            title="Client health snapshot"
            action="Full view"
            onAction={() => setHeatmapFullOpen(true)}
            noPad
          >
            <div style={{ overflowX: "auto" }}>
              <table className="exec-risk-table">
                <thead>
                  <tr>
                    <th style={{ width: "30%" }}>Client</th>
                    <th>Finance</th>
                    <th>SLA</th>
                    <th>WFM</th>
                    <th>Hiring</th>
                    <th style={{ textAlign: "right" }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {riskRows.slice(0, 8).map((p) => {
                    const c = clientRiskColors(p);
                    return (
                      <tr key={p.id} onClick={() => setDrawerClient(p.name)}>
                        <td>
                          <div className="exec-risk-table__name" title={p.name}>{p.name}</div>
                        </td>
                        <td><span className={riskDotCls(c.fin)}>{riskLabel[c.fin]}</span></td>
                        <td><span className={riskDotCls(c.sla)}>{riskLabel[c.sla]}</span></td>
                        <td><span className={riskDotCls(c.wfm)}>{riskLabel[c.wfm]}</span></td>
                        <td><span className={riskDotCls(c.hiring)}>{riskLabel[c.hiring]}</span></td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                            <div style={{
                              width: 48, height: 4, background: "var(--border)", borderRadius: 100, overflow: "hidden",
                            }}>
                              <div style={{
                                width: `${Math.min(100, p.score)}%`,
                                height: "100%",
                                background: p.score >= 70 ? "var(--green)" : p.score >= 50 ? "var(--amber)" : "var(--red)",
                                borderRadius: 100,
                              }} />
                            </div>
                            <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-muted)", minWidth: 24 }}>
                              {p.score}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {riskRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="exec-empty">No client data yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard tag="Action needed" title="Accounts requiring attention">
            {interventions.length === 0 ? (
              <div className="exec-empty" style={{ padding: 24 }}>
                ✓ All accounts within normal thresholds
              </div>
            ) : (
              <div className="exec-interventions">
                {interventions.map((p) => {
                  const domain = worstDomain(p);
                  return (
                    <div
                      key={p.id}
                      className="exec-intervention-card"
                      onClick={() => setDrawerClient(p.name)}
                    >
                      <div className="exec-intervention-card__top">
                        <div className="exec-intervention-card__name">{p.name}</div>
                        <span className={`exec-intervention-card__domain exec-intervention-card__domain--${domain}`}>
                          {domain}
                        </span>
                      </div>
                      <div className="exec-intervention-card__score-row">
                        <span className="exec-intervention-card__score-label">
                          {p.risk === "HIGH" ? "High risk" : "Moderate"}
                        </span>
                        <div className="exec-intervention-card__score-track">
                          <div
                            className={`exec-intervention-card__score-fill exec-intervention-card__score-fill--${p.risk === "HIGH" ? "high" : "med"}`}
                            style={{ width: `${Math.min(100, p.score)}%` }}
                          />
                        </div>
                        <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-subtle)", minWidth: 24 }}>
                          {p.score}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="exec-bottom-grid exec-bottom-grid--single exec-monitor-section__drilldown">
          <SectionCard tag="Drilldown" title="Top hiring managers by revenue">
            <table className="exec-drilldown-table">
              <thead>
                <tr><th>Hiring manager</th><th style={{ textAlign: "right" }}>Revenue</th><th style={{ textAlign: "right" }}>Reqs</th></tr>
              </thead>
              <tbody>
                {drilldown.slice(0, 8).map((d) => (
                  <tr key={d.name}>
                    <td>{d.name}</td>
                    <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{formatCurrency(d.revenue)}</td>
                    <td style={{ textAlign: "right" }}>{d.count}</td>
                  </tr>
                ))}
                {drilldown.length === 0 && (
                  <tr><td colSpan={3} className="exec-empty">—</td></tr>
                )}
              </tbody>
            </table>
          </SectionCard>
        </div>
      </div>

      {/* ── Client drawer ── */}
      <PlatformDrawer open={Boolean(drawerClient)} title={`◎ ${drawerClient}`} onClose={() => setDrawerClient(null)}>
        {selectedClient && (
          <div style={{ display: "grid", gap: 12 }}>
            <div className="drawer-section">
              <div className="drawer-section-title">Account</div>
              <div className="kv-row"><span className="kv-key">Client</span><span className="kv-val">{selectedClient.name}</span></div>
              <div className="kv-row"><span className="kv-key">Positions</span><span className="kv-val">{selectedClient.positions}</span></div>
              <div className="kv-row"><span className="kv-key">Revenue</span><span className="kv-val">{formatCurrency(selectedClient.revenue)}</span></div>
              <div className="kv-row"><span className="kv-key">Composite score</span><span className="kv-val">{selectedClient.score} / 100</span></div>
              <div className="kv-row"><span className="kv-key">Risk level</span><span className="kv-val">
                <span className={`exec-risk-dot exec-risk-dot--${selectedClient.risk === "OK" ? "green" : selectedClient.risk === "MED" ? "amber" : "red"}`}>
                  {selectedClient.risk}
                </span>
              </span></div>
              <div className="kv-row"><span className="kv-key">Weakest domain</span><span className="kv-val">{worstDomain(selectedClient)}</span></div>
            </div>
            <div className="drawer-section">
              <div className="drawer-section-title">Hiring pipeline</div>
              <div className="kv-row"><span className="kv-key">Closed</span><span className="kv-val">{selectedClient.closed}</span></div>
              <div className="kv-row"><span className="kv-key">Active</span><span className="kv-val">{selectedClient.active}</span></div>
              <div className="kv-row"><span className="kv-key">On hold</span><span className="kv-val">{selectedClient.on_hold}</span></div>
            </div>
          </div>
        )}
      </PlatformDrawer>

      {/* ── Full heatmap drawer ── */}
      <PlatformDrawer open={heatmapFullOpen} title="Risk heatmap — all clients" onClose={() => setHeatmapFullOpen(false)} width={720}>
        <div style={{ overflowX: "auto", maxHeight: "70vh", overflowY: "auto" }}>
          <table className="exec-risk-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Finance</th>
                <th>SLA</th>
                <th>WFM</th>
                <th>Hiring</th>
                <th style={{ textAlign: "right" }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {riskRows.map((p) => {
                const c = clientRiskColors(p);
                return (
                  <tr
                    key={p.id}
                    onClick={() => { setHeatmapFullOpen(false); setDrawerClient(p.name); }}
                  >
                    <td><div className="exec-risk-table__name" title={p.name}>{p.name}</div></td>
                    <td><span className={riskDotCls(c.fin)}>{riskLabel[c.fin]}</span></td>
                    <td><span className={riskDotCls(c.sla)}>{riskLabel[c.sla]}</span></td>
                    <td><span className={riskDotCls(c.wfm)}>{riskLabel[c.wfm]}</span></td>
                    <td><span className={riskDotCls(c.hiring)}>{riskLabel[c.hiring]}</span></td>
                    <td style={{ textAlign: "right" }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{p.score}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="exec-heatmap-footnote">
          Same scope as the Portfolio monitor and pipeline section at the bottom of this page.
        </p>
      </PlatformDrawer>
    </div>
  );
};
