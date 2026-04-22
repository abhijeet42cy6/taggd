/**
 * CEO's View — Strategic board-level dashboard
 *
 * Targets only KPIs we can reliably derive from the database:
 *   • Revenue (actual / budget / forecast, YoY, QoQ quarters)
 *   • Contribution Margin % and value
 *   • Collection, Unbilled, Bad Debt, Collection efficiency
 *   • Revenue-per-hire (derived: revenue / taggd_joiners)
 *   • Revenue productivity per recruiter (revenue / WL1 HC)
 *   • PPC — cost per headcount (actual cost / overall HC)
 *   • WFM fill rate and pipeline headcount
 *   • SLA % green attainment
 *   • Vertical revenue mix and share
 *   • Account-level revenue vs target (top performers + at-risk)
 *   • Requisition funnel health (pipeline / closed)
 */

import React, { useEffect, useMemo, useState } from "react";
import { queries, type GlobalStats, type Project, type RequisitionKpis } from "@/lib/api";
import { financeStatsVm, financeRowsVm, type FinanceRowVm } from "@/lib/view-models/finance";
import { slaStatsVm } from "@/lib/view-models/sla";
import { ExecutiveRevenueYoYChart, ExecutiveCmYoYChart, RegionalRevenueBarChart } from "@/components/platform/Charts";
import { SkeletonKpiRow } from "@/components/platform/Skeleton";
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
import "@/styles/ceo-view.css";
import "@/styles/ceo-board-slides.css";
import { CeoBoardSlides } from "@/components/ceo/CeoBoardSlides";
import { CeoSlideDeckEditor } from "@/components/ceo/CeoSlideDeckEditor";
import { loadCeoSlideDeck, saveCeoSlideDeck, type CeoSlideDeckConfig } from "@/lib/ceo-slide-deck";
import { Pencil } from "lucide-react";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fyShortLabel(start: number): string {
  return `FY${String(start).slice(2)}–${String(start + 1).slice(2)}`;
}

function fmtCr(n: number): string {
  if (n === 0) return "—";
  return `₹${(n / 1e7).toFixed(2)} Cr`;
}

function fmtLakh(n: number): string {
  if (n === 0) return "—";
  return `₹${(n / 1e5).toFixed(1)} L`;
}

function fmtPct(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

function attCls(pct: number): "green" | "amber" | "red" {
  return pct >= 100 ? "green" : pct >= 70 ? "amber" : "red";
}

function chipCls(val: number, goodIfPositive = true): string {
  if (Math.abs(val) < 0.01) return "ceo-chip--muted";
  const good = goodIfPositive ? val > 0 : val < 0;
  return good ? "ceo-chip--green" : "ceo-chip--red";
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  eyebrow, variant, primary, chips, attainmentLabel, attainmentPct, meta, children,
}: {
  eyebrow: string;
  variant: "orange" | "teal" | "blue" | "green" | "amber" | "red";
  primary: React.ReactNode;
  chips?: { label: string; cls: string }[];
  attainmentLabel?: string;
  attainmentPct?: number;
  meta?: { label: string; value: React.ReactNode; cls?: string }[];
  children?: React.ReactNode;
}) {
  const att = attainmentPct ?? 0;
  const ac = attCls(att);
  return (
    <div className={`ceo-kpi-card ceo-kpi-card--${variant}`}>
      <div className="ceo-kpi-card__eyebrow">{eyebrow}</div>
      <div className="ceo-kpi-card__primary">{primary}</div>
      {chips && chips.length > 0 && (
        <div className="ceo-kpi-card__chips">
          {chips.map((c, i) => <span key={i} className={`ceo-chip ${c.cls}`}>{c.label}</span>)}
        </div>
      )}
      {attainmentLabel != null && (
        <div className="ceo-attainment">
          <div className="ceo-attainment__header">
            <span className="ceo-attainment__label">{attainmentLabel}</span>
            <span className={`ceo-attainment__pct ceo-attainment__pct--${ac}`}>{att.toFixed(1)}%</span>
          </div>
          <div className="ceo-attainment__track">
            <div
              className={`ceo-attainment__fill ceo-attainment__fill--${variant}`}
              style={{ width: `${Math.min(100, att)}%` }}
            />
          </div>
        </div>
      )}
      {children}
      {meta && meta.length > 0 && (
        <div className="ceo-kpi-card__meta">
          {meta.map((m, i) => (
            <div key={i} className="ceo-kpi-card__meta-row">
              <span className="ceo-kpi-card__meta-label">{m.label}</span>
              <span className={`ceo-kpi-card__meta-val${m.cls ? ` ceo-kpi-card__meta-val--${m.cls}` : ""}`}>
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
  icon, iconVariant, label, primary, sub, chip,
}: {
  icon: string;
  iconVariant: "blue" | "green" | "amber" | "red" | "orange" | "teal";
  label: string;
  primary: React.ReactNode;
  sub?: React.ReactNode;
  chip?: { label: string; cls: string };
}) {
  return (
    <div className="ceo-pulse-card">
      <div className="ceo-pulse-card__icon-row">
        <div className={`ceo-pulse-card__icon ceo-pulse-card__icon--${iconVariant}`}>{icon}</div>
        {chip && <span className={`ceo-chip ${chip.cls}`}>{chip.label}</span>}
      </div>
      <div className="ceo-pulse-card__label">{label}</div>
      <div className="ceo-pulse-card__primary">{primary}</div>
      {sub && <div className="ceo-pulse-card__sub">{sub}</div>}
    </div>
  );
}

function SectionCard({
  tag, title, children, noPad,
}: {
  tag?: string;
  title: string;
  children: React.ReactNode;
  noPad?: boolean;
}) {
  return (
    <div className="ceo-section-card">
      <div className="ceo-section-card__header">
        <div>
          {tag && <div className="ceo-section-card__tag">{tag}</div>}
          <div className="ceo-section-card__title">{title}</div>
        </div>
      </div>
      <div className={noPad ? undefined : "ceo-section-card__body"}>{children}</div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export const CeoView = () => {
  const [slideDeck, setSlideDeck] = useState<CeoSlideDeckConfig>(() => loadCeoSlideDeck());
  const [deckEditorOpen, setDeckEditorOpen] = useState(false);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [financeStatsApi, setFinanceStatsApi] = useState<ReturnType<typeof financeStatsVm> | null>(null);
  const [financeRows, setFinanceRows] = useState<FinanceRowVm[]>([]);
  const [slaStats, setSlaStats] = useState<ReturnType<typeof slaStatsVm> | null>(null);
  const [wfmStats, setWfmStats] = useState<any>(null);
  const [reqKpis, setReqKpis] = useState<RequisitionKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFyStart, setSelectedFyStart] = useState<number>(2025);

  useEffect(() => {
    let mounted = true;
    const to = <T,>(p: Promise<T>, ms: number, fb: T): Promise<T> =>
      Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fb), ms))]);

    (async () => {
      const T_HEAVY = 90_000;
      const T_STD = 60_000;
      const [s, proj, fStats, fRows, sStats, wfm, rk] = await Promise.allSettled([
        to(queries.globalStats(), T_STD, null),
        to(queries.projects(), T_STD, []),
        to(queries.financeStats(), T_STD, null),
        to(queries.financeData(), T_HEAVY, []),
        to(queries.slaStats(), T_STD, null),
        to(queries.wfmStats(), T_STD, null),
        to(queries.requisitionKpis(), T_STD, null),
      ]);
      if (!mounted) return;
      if (s.status === "fulfilled" && s.value) setStats(s.value as GlobalStats);
      if (proj.status === "fulfilled") setProjects(proj.value as Project[] || []);
      if (fStats.status === "fulfilled" && fStats.value) setFinanceStatsApi(financeStatsVm(fStats.value));
      if (fRows.status === "fulfilled" && fRows.value) setFinanceRows(financeRowsVm(fRows.value as any[]));
      if (sStats.status === "fulfilled" && sStats.value) setSlaStats(slaStatsVm(sStats.value));
      if (wfm.status === "fulfilled") setWfmStats(wfm.value);
      if (rk.status === "fulfilled") setReqKpis(rk.value as RequisitionKpis);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  // ── FY list ──────────────────────────────────────────────────────────────
  const fyYears = useMemo(() => {
    const s = new Set<number>();
    for (const r of financeRows) {
      const d = parseMonthSort(r.month_sort);
      if (d) s.add(fiscalYearStart(d));
    }
    return Array.from(s).sort((a, b) => b - a);
  }, [financeRows]);

  useEffect(() => {
    if (fyYears.length && !fyYears.includes(selectedFyStart)) setSelectedFyStart(fyYears[0]);
  }, [fyYears, selectedFyStart]);

  /** Prior FY for YoY / bridge: newest FY in data that is strictly before the selected FY (fallback: selected − 1). */
  const autoCompareFy = useMemo(() => {
    const older = fyYears.filter((y) => y < selectedFyStart).sort((a, b) => b - a);
    if (older.length) return older[0];
    return selectedFyStart - 1;
  }, [fyYears, selectedFyStart]);

  const compareFyLabel = fyShortLabel(autoCompareFy);

  // ── Filtered + FY rows ───────────────────────────────────────────────────
  const allRows = useMemo(
    () => filterFinanceRows(financeRows, projects, DEFAULT_DASHBOARD_FILTERS),
    [financeRows, projects],
  );

  const fyRows = useMemo(
    () => allRows.filter((r) => { const d = parseMonthSort(r.month_sort); return d && fiscalYearStart(d) === selectedFyStart; }),
    [allRows, selectedFyStart],
  );

  const priorRows = useMemo(
    () => allRows.filter((r) => { const d = parseMonthSort(r.month_sort); return d && fiscalYearStart(d) === autoCompareFy; }),
    [allRows, autoCompareFy],
  );

  const fin = useMemo(() => {
    const agg = aggregateFinanceFromRows(fyRows);
    if (agg) return agg;
    return financeStatsApi ? { ...financeStatsApi, collection_pending_inr: financeStatsApi.collection_pending_inr ?? 0 } : null;
  }, [fyRows, financeStatsApi]);

  const priorFin = useMemo(() => aggregateFinanceFromRows(priorRows), [priorRows]);
  const { revenue: yoyRev, cm: yoyCm } = useMemo(
    () => buildYoYRevenueSeries(allRows, selectedFyStart, autoCompareFy),
    [allRows, selectedFyStart, autoCompareFy],
  );
  const quarters = useMemo(() => quarterlyPlanActualForFy(fyRows, selectedFyStart), [fyRows, selectedFyStart]);
  const regional = useMemo(() => buildRegionalRevenue(allRows, projects), [allRows, projects]);
  const execRows = useMemo(() => {
    if (!fin) return [];
    return buildExecutiveSummary(
      {
        revenue_budget_inr: fin.revenue_budget_inr,
        revenue_forecast_inr: fin.revenue_forecast_inr ?? 0,
        revenue_actual_inr: fin.revenue_actual_inr,
        total_cm_inr: fin.total_cm_inr,
        total_unbilled_inr: fin.total_unbilled_inr,
        total_bad_debt_inr: fin.total_bad_debt_inr,
        total_collected_inr: fin.total_collected_inr,
        total_collection_target_inr: fin.total_collection_target_inr,
        rev_attainment: fin.rev_attainment,
      },
      (priorFin?.revenue_actual_inr ?? 0) / 1e7,
      priorFin,
    );
  }, [fin, priorFin]);

  // ── Core KPI derivations ─────────────────────────────────────────────────
  const revA   = fin?.revenue_actual_inr ?? 0;
  const revBud = fin?.revenue_budget_inr ?? 0;
  const revFor = fin?.revenue_forecast_inr ?? 0;
  const cmA    = fin?.total_cm_inr ?? 0;
  const cmPct  = revA > 0 ? (cmA / revA) * 100 : 0;
  const coll   = fin?.total_collected_inr ?? 0;
  const collT  = fin?.total_collection_target_inr ?? 0;
  const unb    = fin?.total_unbilled_inr ?? 0;
  const bd     = fin?.total_bad_debt_inr ?? 0;
  const revAtt = fin?.rev_attainment ?? 0;
  const collAtt = collT > 0 ? (coll / collT) * 100 : 0;
  const collEff = fin?.collection_efficiency ?? 0;

  const priorRevA  = priorFin?.revenue_actual_inr ?? 0;
  const priorCmPct = priorFin && priorFin.revenue_actual_inr > 0 ? (priorFin.total_cm_inr / priorFin.revenue_actual_inr) * 100 : null;
  const priorColl  = priorFin?.total_collected_inr ?? 0;
  const yoyRevPct  = priorRevA > 0 ? ((revA - priorRevA) / priorRevA) * 100 : 0;
  const yoyCollPct = priorColl > 0 ? ((coll - priorColl) / priorColl) * 100 : 0;
  const cmDeltaPp  = priorCmPct != null ? cmPct - priorCmPct : null;

  // Productivity: sum from fyRows
  const totalTajeJoiners = useMemo(
    () => fyRows.reduce((s, r) => s + (r.taggd_joiners ?? 0), 0),
    [fyRows],
  );
  const totalWl1Hc = useMemo(
    () => fyRows.reduce((s, r) => s + (r.actual_headcount_wl1 ?? 0), 0) /
      Math.max(fyRows.filter((r) => (r.actual_headcount_wl1 ?? 0) > 0).length, 1),
    [fyRows],
  );
  const totalOverallHc = useMemo(
    () => fyRows.reduce((s, r) => s + (r.actual_headcount_overall ?? 0), 0) /
      Math.max(fyRows.filter((r) => (r.actual_headcount_overall ?? 0) > 0).length, 1),
    [fyRows],
  );
  const totalCost = useMemo(() => fyRows.reduce((s, r) => s + (r.total_cost_inr ?? 0), 0), [fyRows]);

  // RPH: net revenue / taggd joiners
  const rph = totalTajeJoiners > 0 ? revA / totalTajeJoiners : 0;
  // Productivity per WL1 recruiter (monthly average HC basis)
  const revPerWl1 = totalWl1Hc > 0 ? revA / totalWl1Hc : 0;
  // PPC (cost per overall HC)
  const ppc = totalOverallHc > 0 && totalCost > 0 ? totalCost / totalOverallHc : 0;
  // Working capital risk: unbilled + bad debt as % of revenue
  const workCapRiskPct = revA > 0 ? ((unb + bd) / revA) * 100 : 0;

  // WFM
  const wfmFill    = Number(wfmStats?.capacity_fill_rate ?? 0);
  const wfmActual  = Number(wfmStats?.total_actual_hc ?? 0);
  const wfmIdeal   = Number(wfmStats?.total_ideal_hc ?? 0);
  const wfmGap     = Math.max(0, wfmIdeal - wfmActual);
  const wfmFillCls = wfmFill >= 70 && wfmFill <= 100 ? "ceo-chip--green" : wfmFill > 100 ? "ceo-chip--amber" : "ceo-chip--red";

  // SLA — use portfolio_health (Met / (Met + Not Met)); do NOT divide met_count by total_metrics
  // (met_count = # of performance snapshots with RAG Met; total_metrics = # of metric definitions — different grains).
  const slaMet = Number(slaStats?.met_count ?? 0);
  const slaNotMet = Number(slaStats?.not_met_count ?? 0);
  const slaRagDen = slaMet + slaNotMet;
  const slaPct = Number(slaStats?.portfolio_health ?? 0);
  const slaCls = slaPct >= 80 ? "ceo-chip--green" : slaPct >= 60 ? "ceo-chip--amber" : "ceo-chip--red";

  // Requisition funnel
  const totalReqs   = reqKpis?.total_records ?? stats?.total_records ?? 0;
  const closedReqs  = Number(reqKpis?.joiners ?? 0);   // joiners = filled/closed mandates
  const activeReqs  = Number(reqKpis?.open_req ?? 0);  // open = active pipeline
  const closureRate = totalReqs > 0 ? (closedReqs / totalReqs) * 100 : 0;

  // Quarter chart
  const maxQPlan = Math.max(...quarters.map((q) => q.planInr), 1);
  const quarterBand = quarters.some((q) => q.planInr > 0 || q.actualInr > 0) ? (
    <div className="ceo-quarter-band">
      {quarters.map((q) => {
        const planH = Math.max(4, (q.planInr / maxQPlan) * 24);
        const actH  = Math.max(0, (q.actualInr / maxQPlan) * 24);
        const onTrack = q.actualInr + 1 >= q.planInr;
        return (
          <div key={q.q} className="ceo-quarter-col">
            <div className="ceo-quarter-col__bars">
              <div className="ceo-quarter-col__bar-plan" style={{ height: planH }} />
              {q.actualInr > 0 && (
                <div
                  className={`ceo-quarter-col__bar-actual ceo-quarter-col__bar-actual--${onTrack ? "on" : "off"}`}
                  style={{ height: actH }}
                />
              )}
            </div>
            <div className="ceo-quarter-col__label">{q.q}</div>
            <div className="ceo-quarter-col__val">
              {((q.actualInr || q.planInr) / 1e7).toFixed(1)} Cr
            </div>
          </div>
        );
      })}
    </div>
  ) : null;

  // Vertical revenue mix
  const verticalMix = useMemo(() => {
    const pmap = new Map(projects.map((p) => [p.id, p]));
    const by: Record<string, { actual: number; budget: number }> = {};
    for (const r of fyRows) {
      const p = r.project_id != null ? pmap.get(r.project_id) : undefined;
      const v = (p?.vertical ?? r.vertical ?? "Other").trim() || "Other";
      if (!by[v]) by[v] = { actual: 0, budget: 0 };
      by[v].actual += r.rev_actual_inr;
      by[v].budget += r.rev_budget_inr;
    }
    const total = Object.values(by).reduce((s, b) => s + b.actual, 0) || 1;
    return Object.entries(by)
      .map(([vertical, v]) => ({ vertical, actual: v.actual, budget: v.budget, share: (v.actual / total) * 100 }))
      .sort((a, b) => b.actual - a.actual)
      .slice(0, 8);
  }, [fyRows, projects]);

  // Top 8 accounts by actual revenue
  const topAccounts = useMemo(() => {
    const pmap = new Map(projects.map((p) => [p.id, p]));
    const by: Record<string, { name: string; vertical: string; actual: number; budget: number }> = {};
    for (const r of fyRows) {
      const p = r.project_id != null ? pmap.get(r.project_id) : undefined;
      const name = (p?.account_name ?? r.account_name ?? "Unknown").trim();
      const vert = (p?.vertical ?? r.vertical ?? "—").trim();
      if (!by[name]) by[name] = { name, vertical: vert, actual: 0, budget: 0 };
      by[name].actual += r.rev_actual_inr;
      by[name].budget += r.rev_budget_inr;
    }
    return Object.values(by)
      .sort((a, b) => b.actual - a.actual)
      .slice(0, 8)
      .map((a) => ({ ...a, attainment: a.budget > 0 ? (a.actual / a.budget) * 100 : null }));
  }, [fyRows, projects]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="ceo-view">

      {/* ── Controls ── */}
      <div className="ceo-controls">
        <div className="ceo-controls__left">
          <div className="ceo-controls__title">CEO's View</div>
          <div className="ceo-controls__subtitle">
            Strategic performance dashboard · {stats?.total_projects ?? "—"} clients · {fyShortLabel(selectedFyStart)}
          </div>
        </div>
        <div className="ceo-controls__right">
          <button
            type="button"
            className="platform-chip"
            onClick={() => setDeckEditorOpen(true)}
            title="Edit board slide deck (JSON)"
          >
            <Pencil size={14} aria-hidden />
            <span style={{ marginLeft: 6 }}>Edit deck</span>
          </button>
          <span className="ceo-fy-label">Fiscal year</span>
          <select
            className="ceo-fy-select"
            aria-label="Fiscal year"
            value={
              fyYears.length === 0
                ? ""
                : fyYears.includes(selectedFyStart)
                  ? selectedFyStart
                  : fyYears[0]
            }
            onChange={(e) => setSelectedFyStart(Number(e.target.value))}
            disabled={loading || fyYears.length === 0}
          >
            {fyYears.length === 0 ? (
              <option value="">No fiscal years in ledger</option>
            ) : (
              fyYears.map((y) => (
                <option key={y} value={y}>
                  {fyShortLabel(y)}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* ══ SECTION 1: FINANCIAL SCORECARDS ══ */}
      <div className="ceo-section-label">Financial performance — {fyShortLabel(selectedFyStart)}</div>

      {loading ? (
        <SkeletonKpiRow count={3} />
      ) : (
        <div className="ceo-hero">

          {/* Revenue */}
          <KpiCard
            eyebrow="Revenue — Actual"
            variant="orange"
            primary={fmtCr(revA)}
            chips={[
              yoyRevPct !== 0
                ? { label: `${yoyRevPct >= 0 ? "▲" : "▼"} ${Math.abs(yoyRevPct).toFixed(1)}% YoY`, cls: chipCls(yoyRevPct) }
                : { label: "No prior FY", cls: "ceo-chip--muted" },
              revAtt >= 100
                ? { label: "On target", cls: "ceo-chip--green" }
                : { label: `${revAtt.toFixed(1)}% attained`, cls: revAtt >= 70 ? "ceo-chip--amber" : "ceo-chip--red" },
            ]}
            attainmentLabel={`vs ₹ Budget ${fmtCr(revBud)}`}
            attainmentPct={revAtt}
            meta={[
              { label: "Full-year forecast", value: fmtCr(revFor > 0 ? revFor : revBud) },
              { label: "Budget", value: fmtCr(revBud) },
              ...(priorRevA > 0 ? [{ label: `${compareFyLabel} actual`, value: fmtCr(priorRevA) }] : []),
            ]}
          >
            {quarterBand}
          </KpiCard>

          {/* CM% */}
          <KpiCard
            eyebrow="Contribution Margin"
            variant="teal"
            primary={fmtPct(cmPct)}
            chips={[
              cmPct >= 35
                ? { label: `+${(cmPct - 35).toFixed(1)} pp vs 35% target`, cls: "ceo-chip--green" }
                : { label: `${(cmPct - 35).toFixed(1)} pp vs target`, cls: "ceo-chip--red" },
              ...(cmDeltaPp != null
                ? [{ label: `${cmDeltaPp >= 0 ? "▲" : "▼"} ${Math.abs(cmDeltaPp).toFixed(1)} pp YoY`, cls: chipCls(cmDeltaPp) }]
                : []),
            ]}
            attainmentLabel="vs 35% target"
            attainmentPct={(cmPct / 35) * 100}
            meta={[
              { label: "CM value", value: fmtCr(cmA) },
              { label: "Target CM%", value: "35.0%" },
              ...(priorCmPct != null ? [{ label: `${compareFyLabel} CM%`, value: fmtPct(priorCmPct) }] : []),
            ]}
          />

          {/* Collection */}
          <KpiCard
            eyebrow="Collection"
            variant="blue"
            primary={fmtCr(coll)}
            chips={[
              collAtt >= 100
                ? { label: "Above target", cls: "ceo-chip--green" }
                : { label: "Below target", cls: "ceo-chip--amber" },
              yoyCollPct !== 0
                ? { label: `${yoyCollPct >= 0 ? "▲" : "▼"} ${Math.abs(yoyCollPct).toFixed(1)}% YoY`, cls: chipCls(yoyCollPct) }
                : { label: "No prior FY", cls: "ceo-chip--muted" },
            ]}
            attainmentLabel={`vs ₹ Target ${fmtCr(collT)}`}
            attainmentPct={collAtt}
            meta={[
              { label: "Pending", value: fmtCr(Math.max(0, collT - coll)), cls: collT - coll > 0 ? "amber" : "green" },
              { label: "Collection efficiency", value: fmtPct(collEff), cls: collEff >= 80 ? "green" : collEff >= 60 ? "amber" : "red" },
              { label: "Unbilled exposure", value: fmtCr(unb), cls: unb / Math.max(revA, 1) > 0.3 ? "red" : "amber" },
              { label: "Bad debt", value: fmtCr(bd), cls: bd > 0 ? "red" : "green" },
            ]}
          />
        </div>
      )}

      {/* ══ SECTION 2: OPERATIONAL PULSE — 5 cards ══ */}
      <div className="ceo-section-label">Operational pulse</div>

      {loading ? <SkeletonKpiRow count={5} /> : (
        <div className="ceo-pulse">

          {/* RPH */}
          <PulseCard
            icon="₹"
            iconVariant="orange"
            label="Revenue per Hire"
            primary={rph > 0 ? fmtLakh(rph) : "—"}
            sub={totalTajeJoiners > 0 ? `${totalTajeJoiners.toFixed(0)} Taggd joiners` : "No joiner data"}
            chip={rph > 0
              ? { label: rph >= 49000 ? "On target" : "Below ₹49K", cls: rph >= 49000 ? "ceo-chip--green" : "ceo-chip--amber" }
              : undefined}
          />

          {/* Productivity */}
          <PulseCard
            icon="⚡"
            iconVariant="teal"
            label="Rev / Recruiter (WL1)"
            primary={revPerWl1 > 0 ? fmtLakh(revPerWl1) : "—"}
            sub={totalWl1Hc > 0 ? `Avg ${totalWl1Hc.toFixed(0)} WL1 HC` : "No WL1 data"}
            chip={revPerWl1 > 0
              ? { label: revPerWl1 >= 1e5 ? "On track" : "Watch", cls: revPerWl1 >= 1e5 ? "ceo-chip--green" : "ceo-chip--amber" }
              : undefined}
          />

          {/* WFM Fill Rate */}
          <PulseCard
            icon="👥"
            iconVariant={wfmFill >= 70 && wfmFill <= 100 ? "green" : wfmFill > 100 ? "amber" : "red"}
            label="WFM Fill Rate"
            primary={wfmIdeal > 0 ? `${wfmFill.toFixed(1)}%` : "—"}
            sub={wfmIdeal > 0 ? `${wfmActual.toFixed(0)} of ${wfmIdeal.toFixed(0)} HC · ${wfmGap.toFixed(0)} gaps` : "No WFM data"}
            chip={wfmIdeal > 0 ? { label: wfmFill >= 70 && wfmFill <= 100 ? "On Plan" : wfmFill > 100 ? "Over-cap" : "Under-staffed", cls: wfmFillCls } : undefined}
          />

          {/* SLA Attainment */}
          <PulseCard
            icon="📊"
            iconVariant={slaPct >= 80 ? "green" : slaPct >= 60 ? "amber" : "red"}
            label="SLA Attainment"
            primary={slaRagDen > 0 ? `${slaPct.toFixed(0)}%` : "—"}
            sub={
              slaRagDen > 0
                ? `${slaMet.toLocaleString()} met · ${slaNotMet.toLocaleString()} not met`
                : "No SLA RAG data"
            }
            chip={slaRagDen > 0 ? { label: slaPct >= 80 ? "Good" : slaPct >= 60 ? "Monitor" : "At Risk", cls: slaCls } : undefined}
          />

          {/* Working Capital Risk */}
          <PulseCard
            icon="⚠"
            iconVariant={workCapRiskPct < 20 ? "green" : workCapRiskPct < 40 ? "amber" : "red"}
            label="Working Capital Risk"
            primary={fmtCr(unb + bd)}
            sub={revA > 0 ? `${workCapRiskPct.toFixed(1)}% of revenue at risk` : "Unbilled + bad debt"}
            chip={revA > 0
              ? { label: workCapRiskPct < 20 ? "Low risk" : workCapRiskPct < 40 ? "Moderate" : "High risk",
                  cls: workCapRiskPct < 20 ? "ceo-chip--green" : workCapRiskPct < 40 ? "ceo-chip--amber" : "ceo-chip--red" }
              : undefined}
          />
        </div>
      )}

      {/* ══ SECTION 3: STRATEGIC NARRATIVE — Summary table + YoY ══ */}
      <div className="ceo-section-label">Year-on-Year — {fyShortLabel(selectedFyStart)} vs {compareFyLabel}</div>

      <div className="ceo-intel">
        {/* YoY Revenue chart */}
        <SectionCard tag="Trend" title={`Revenue — monthly actual vs ${compareFyLabel}`}>
          {yoyRev.some((r) => r.actual > 0 || r.priorActual > 0) ? (
            <ExecutiveRevenueYoYChart data={yoyRev} priorLabel={`${compareFyLabel} Actual`} />
          ) : (
            <div className="ceo-empty">No revenue data for selected FY</div>
          )}
        </SectionCard>

        {/* Executive summary table */}
        <SectionCard tag="Summary" title="Key financials at a glance">
          {execRows.length > 0 ? (
            <table className="ceo-summary-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Actual</th>
                  <th>Budget</th>
                  <th>vs Bud</th>
                  <th>YoY</th>
                </tr>
              </thead>
              <tbody>
                {execRows.map((row) => {
                  const varNum = parseFloat(row.varBudget);
                  const yoyNum = parseFloat(row.yoy);
                  const varCls = Number.isFinite(varNum) ? (varNum >= 0 ? "ceo-summary-table__pos" : "ceo-summary-table__neg") : "";
                  const yoyCls2 = Number.isFinite(yoyNum) ? (yoyNum >= 0 ? "ceo-summary-table__pos" : "ceo-summary-table__neg") : "";
                  return (
                    <tr key={row.metric}>
                      <td>{row.metric}</td>
                      <td>{row.actual}</td>
                      <td>{row.budget}</td>
                      <td className={varCls}>{row.varBudget}</td>
                      <td className={yoyCls2}>{row.yoy}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="ceo-empty">Upload finance data to populate</div>
          )}
        </SectionCard>
      </div>

      {/* ══ SECTION 4: CM% TREND ══ */}
      {yoyCm.some((r) => r.actualPct > 0) && (
        <>
          <div className="ceo-section-label">Contribution margin trend</div>
          <SectionCard tag="Profitability" title={`CM% — actual vs ${compareFyLabel} (35% reference)`}>
            <ExecutiveCmYoYChart data={yoyCm} compareLabel={`CM% (${compareFyLabel})`} />
          </SectionCard>
        </>
      )}

      {/* ══ SECTION 5: EFFICIENCY DEEP DIVE ══ */}
      <div className="ceo-section-label">Efficiency — People & Cost</div>

      <div className="ceo-efficiency-grid">
        {/* Productivity KPIs */}
        <SectionCard tag="Unit Economics" title="People productivity metrics">
          <div className="ceo-narrative-grid">
            <div className="ceo-narrative-item">
              <div className="ceo-narrative-item__label">Revenue per Hire (RPH)</div>
              <div className="ceo-narrative-item__value">{rph > 0 ? fmtLakh(rph) : "—"}</div>
              <div className="ceo-narrative-item__sub">
                {totalTajeJoiners > 0
                  ? `Based on ${totalTajeJoiners.toFixed(0)} Taggd joiners in ${fyShortLabel(selectedFyStart)}`
                  : "Requires joiner data from finance master"}
              </div>
            </div>
            <div className="ceo-narrative-item">
              <div className="ceo-narrative-item__label">Revenue / WL1 Recruiter</div>
              <div className="ceo-narrative-item__value">{revPerWl1 > 0 ? fmtLakh(revPerWl1) : "—"}</div>
              <div className="ceo-narrative-item__sub">
                {totalWl1Hc > 0
                  ? `Avg ${totalWl1Hc.toFixed(0)} WL1 HC · target ₹1.57L`
                  : "Requires WL1 HC from finance master"}
              </div>
            </div>
            <div className="ceo-narrative-item">
              <div className="ceo-narrative-item__label">PPC (Cost / Overall HC)</div>
              <div className="ceo-narrative-item__value">{ppc > 0 ? fmtLakh(ppc) : "—"}</div>
              <div className="ceo-narrative-item__sub">
                {totalOverallHc > 0 && totalCost > 0
                  ? `₹${(totalCost / 1e7).toFixed(2)} Cr total cost · ${totalOverallHc.toFixed(0)} avg HC`
                  : "Requires cost data from finance master"}
              </div>
            </div>
            <div className="ceo-narrative-item">
              <div className="ceo-narrative-item__label">WFM Capacity</div>
              <div className="ceo-narrative-item__value">{wfmIdeal > 0 ? `${wfmFill.toFixed(1)}%` : "—"}</div>
              <div className="ceo-narrative-item__sub">
                {wfmIdeal > 0
                  ? `${wfmActual.toFixed(0)} actual / ${wfmIdeal.toFixed(0)} ideal · ${wfmGap.toFixed(0)} open gaps`
                  : "No WFM benchmark data"}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Regional revenue */}
        <SectionCard tag="Geography" title="Revenue by region">
          {regional.length > 0 ? (
            <RegionalRevenueBarChart data={regional} />
          ) : (
            <div className="ceo-empty">No regional data</div>
          )}
        </SectionCard>
      </div>

      {/* ══ SECTION 6: VERTICAL MIX ══ */}
      <div className="ceo-section-label">Industry mix — revenue by vertical</div>

      <SectionCard tag="Diversification" title={`Vertical revenue share — ${fyShortLabel(selectedFyStart)}`} noPad>
        {verticalMix.length > 0 ? (
          <table className="ceo-mix-table">
            <thead>
              <tr>
                <th>Vertical / Industry</th>
                <th className="right">Actual</th>
                <th className="right">Budget</th>
                <th className="right">Share</th>
                <th>Mix</th>
              </tr>
            </thead>
            <tbody>
              {verticalMix.map((v) => (
                <tr key={v.vertical}>
                  <td style={{ fontWeight: 500 }}>{v.vertical}</td>
                  <td className="right">{fmtCr(v.actual)}</td>
                  <td className="right" style={{ color: "var(--text-muted)" }}>{fmtCr(v.budget)}</td>
                  <td className="right" style={{ fontWeight: 600 }}>{fmtPct(v.share)}</td>
                  <td style={{ minWidth: 120 }}>
                    <div className="ceo-share-bar-wrap">
                      <div className="ceo-share-bar-track">
                        <div className="ceo-share-bar-fill" style={{ width: `${Math.min(100, v.share)}%` }} />
                      </div>
                      <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-muted)", minWidth: 32, textAlign: "right" }}>
                        {fmtPct(v.share, 0)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="ceo-empty">No vertical data — ensure projects have a vertical tag</div>
        )}
      </SectionCard>

      {/* ══ SECTION 7: ACCOUNT REVENUE INTELLIGENCE ══ */}
      <div className="ceo-section-label">Account intelligence — top clients by revenue</div>

      <SectionCard tag="Account" title={`Top accounts — ${fyShortLabel(selectedFyStart)}`} noPad>
        {topAccounts.length > 0 ? (
          <table className="ceo-risk-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Vertical</th>
                <th style={{ textAlign: "right" }}>Revenue</th>
                <th style={{ textAlign: "right" }}>Budget</th>
                <th style={{ textAlign: "right" }}>Attainment</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {topAccounts.map((a) => {
                const att = a.attainment;
                const statusLabel = att == null ? "—" : att >= 100 ? "On Track" : att >= 70 ? "Monitor" : "At Risk";
                const statusCls = att == null ? "" : att >= 100 ? "green" : att >= 70 ? "amber" : "red";
                return (
                  <tr key={a.name}>
                    <td>
                      <span className="ceo-risk-table__name">{a.name}</span>
                    </td>
                    <td>
                      <span className="ceo-risk-table__sub">{a.vertical || "—"}</span>
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>{fmtCr(a.actual)}</td>
                    <td style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-muted)" }}>
                      {fmtCr(a.budget)}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>
                      {att != null ? (
                        <span style={{ color: att >= 100 ? "#1a7a47" : att >= 70 ? "#92600a" : "#b91c1c", fontWeight: 600 }}>
                          {fmtPct(att, 0)}
                        </span>
                      ) : "—"}
                    </td>
                    <td>
                      {statusCls ? (
                        <span className={`ceo-status ceo-status--${statusCls}`}>{statusLabel}</span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="ceo-empty">No account data for selected FY</div>
        )}
      </SectionCard>

      {/* ══ SECTION 8: DELIVERY HEALTH ══ */}
      <div className="ceo-section-label">Delivery health — requisitions & SLA</div>

      <div className="ceo-efficiency-grid">
        <SectionCard tag="Recruitment" title="Requisition funnel summary">
          <div className="ceo-narrative-grid">
            <div className="ceo-narrative-item">
              <div className="ceo-narrative-item__label">Total Requisitions</div>
              <div className="ceo-narrative-item__value">{totalReqs > 0 ? totalReqs.toLocaleString() : "—"}</div>
              <div className="ceo-narrative-item__sub">All mandates tracked in TARA</div>
            </div>
            <div className="ceo-narrative-item">
              <div className="ceo-narrative-item__label">Closed / Filled</div>
              <div className="ceo-narrative-item__value">{closedReqs > 0 ? closedReqs.toLocaleString() : "—"}</div>
              <div className="ceo-narrative-item__sub">
                {closureRate > 0 ? `${closureRate.toFixed(1)}% closure rate` : "No closure data"}
              </div>
            </div>
            <div className="ceo-narrative-item">
              <div className="ceo-narrative-item__label">Active Pipeline</div>
              <div className="ceo-narrative-item__value">{activeReqs > 0 ? activeReqs.toLocaleString() : "—"}</div>
              <div className="ceo-narrative-item__sub">Open mandates in progress</div>
            </div>
            <div className="ceo-narrative-item">
              <div className="ceo-narrative-item__label">SLA — Green %</div>
              <div className="ceo-narrative-item__value" style={{ color: slaPct >= 80 ? "#1a7a47" : slaPct >= 60 ? "#92600a" : "#b91c1c" }}>
                {slaRagDen > 0 ? `${slaPct.toFixed(0)}%` : "—"}
              </div>
              <div className="ceo-narrative-item__sub">
                {slaRagDen > 0
                  ? `${slaMet.toLocaleString()} met · ${slaNotMet.toLocaleString()} not met (RAG outcomes)`
                  : "No SLA RAG data"}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Commercial overview */}
        <SectionCard tag="Commercial" title="Clients & contracts at a glance">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Total clients", value: stats?.total_projects ?? "—" },
              { label: "Requisitions tracked", value: totalReqs > 0 ? totalReqs.toLocaleString() : "—" },
              { label: "Taggd joiners (FY)", value: totalTajeJoiners > 0 ? totalTajeJoiners.toFixed(0) : "—" },
              { label: "WFM — ideal HC", value: wfmIdeal > 0 ? wfmIdeal.toFixed(0) : "—" },
              { label: "WFM — actual HC", value: wfmActual > 0 ? wfmActual.toFixed(0) : "—" },
              { label: "Open gaps", value: wfmGap > 0 ? wfmGap.toFixed(0) : "0" },
            ].map((row) => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{row.label}</span>
                <span style={{ fontSize: 13, fontFamily: "var(--mono)", fontWeight: 500, color: "var(--text)" }}>{row.value}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* ══ BOARD SLIDE DECK (reference narrative) ══ */}
      <div className="ceo-section-label">Board narrative — slide deck</div>
      <CeoBoardSlides config={slideDeck} />

      <CeoSlideDeckEditor
        open={deckEditorOpen}
        onOpenChange={setDeckEditorOpen}
        config={slideDeck}
        onApply={setSlideDeck}
      />
    </div>
  );
};
