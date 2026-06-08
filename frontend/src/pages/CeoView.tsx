/**
 * CEO's View — Strategic board-level dashboard
 *
 * Targets only KPIs we can reliably derive from the database:
 *   • Revenue (actual / budget / forecast, YoY, QoQ quarters)
 *   • Contribution Margin % and value
 *   • Collection, Unbilled, Bad Debt, Collection efficiency
 *   • Revenue-per-hire & Rev/WL1 on the **Taggd_Source_Joiner workbook cohort** + calibrated blends (FY25–26 master)
 *   • PPC — Σ actual cost ÷ Σ overall HC for the FY
 *   • WFM fill rate and pipeline headcount
 *   • SLA % green attainment
 *   • Vertical revenue mix and share
 *   • Account-level revenue vs target (top performers + at-risk)
 *   • Requisition funnel health (pipeline / closed)
 */

import React, { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Flex, Grid, Metric, Select, SelectItem, Text, TextInput, Title } from "@tremor/react";
import { queries, type GlobalStats, type Project, type RequisitionKpis } from "@/lib/api";
import { financeRowsVm, type FinanceRowVm } from "@/lib/view-models/finance";
import { slaStatsVm } from "@/lib/view-models/sla";
import {
  CeoCmYoYTremorChart,
  CeoRegionalRevenueTremorChart,
  CeoRevenueYoYTremorChart,
} from "@/components/tremor-blocks/CeoViewTremorCharts";
import {
  DEFAULT_DASHBOARD_FILTERS,
  filterFinanceRows,
  buildYoYRevenueSeries,
  buildRegionalRevenue,
  buildExecutiveSummary,
  aggregateFinanceFromRows,
  emptyFinanceAggregate,
  quarterlyPlanActualForFy,
  quarterlyCollectionForFy,
  quarterlyCmForFy,
  fiscalYearStart,
  parseMonthSort,
  effectiveHireDenominatorForRph,
  ceoRevPerWl1Inr,
  fyRowsTaggdJoinerSheetCohort,
  sumNonTaggdJoiners,
  type DashboardFilters as DF,
} from "@/lib/dashboard-aggregates";
import { formatLargeCurrency, formatPercent } from "@/lib/utils";
import { DashboardFiltersTremor } from "@/components/tremor-dashboard/DashboardFiltersTremor";
import { ExecSectionTitle } from "@/components/tremor-dashboard/ExecSectionTitle";
import { ExecutiveMetricHeroCard } from "@/components/tremor-dashboard/ExecutiveMetricHeroCard";
import {
  OperationalPulseCard,
  pulseBadgeFromExecCls,
} from "@/components/tremor-dashboard/OperationalPulseCards";
import { TremorDashboardSection } from "@/components/tremor-dashboard/TremorDashboardSection";
import { buildCeoProjectFyRows, CeoProjectsPortfolioModal } from "@/components/tremor-dashboard/CeoProjectsPortfolioModal";
import "@/styles/ceo-view.css";
import "@/styles/exec-dash-premium.css";
import "@/styles/ceo-board-slides.css";
import { CeoBoardSlides } from "@/components/ceo/CeoBoardSlides";
import { CeoSlideDeckStudio } from "@/components/ceo/CeoSlideDeckStudio";
import { loadCeoSlideDeck, type CeoSlideDeckConfig } from "@/lib/ceo-slide-deck";
import { Maximize2, Pencil, Search } from "lucide-react";

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
  if (Math.abs(n) < 1e5) {
    return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }
  return `₹${(n / 1e5).toFixed(1)} L`;
}

function fmtPulseExactInr(n: number): string {
  if (n === 0) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

/** Aligns with Executive Overview (`Dashboard`) YoY chip styling. */
function yoyDeltaChip(curr: number, prev: number): { label: string; cls: string } {
  if (prev <= 0 || curr <= 0) return { label: "—", cls: "exec-delta-chip--muted" };
  const p = ((curr - prev) / prev) * 100;
  const cls = p > 0.5 ? "exec-delta-chip--green" : p < -0.5 ? "exec-delta-chip--red" : "exec-delta-chip--amber";
  return { label: `${p >= 0 ? "▲" : "▼"} ${Math.abs(p).toFixed(1)}% YoY`, cls };
}

// ─── Main ────────────────────────────────────────────────────────────────────

export const CeoView = () => {
  const [slideDeck, setSlideDeck] = useState<CeoSlideDeckConfig>(() => loadCeoSlideDeck());
  const [deckEditorOpen, setDeckEditorOpen] = useState(false);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [financeRows, setFinanceRows] = useState<FinanceRowVm[]>([]);
  const [slaStats, setSlaStats] = useState<ReturnType<typeof slaStatsVm> | null>(null);
  const [wfmStats, setWfmStats] = useState<any>(null);
  const [reqKpis, setReqKpis] = useState<RequisitionKpis | null>(null);
  const [drilldown, setDrilldown] = useState<Array<{ name: string; revenue: number; count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<DF>(DEFAULT_DASHBOARD_FILTERS);
  const [selectedFyStart, setSelectedFyStart] = useState<number>(2025);
  const [accountIntelSearch, setAccountIntelSearch] = useState("");
  const [accountIntelVertical, setAccountIntelVertical] = useState("all");
  const [accountIntelStatus, setAccountIntelStatus] = useState<"all" | "on_track" | "monitor" | "at_risk">("all");
  const [accountProjectsModalOpen, setAccountProjectsModalOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const to = <T,>(p: Promise<T>, ms: number, fb: T): Promise<T> =>
      Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fb), ms))]);

    (async () => {
      const T_HEAVY = 90_000;
      const T_STD = 60_000;
      const [s, proj, fRows, sStats, wfm, rk, dd] = await Promise.allSettled([
        to(queries.globalStats(), T_STD, null),
        to(queries.projects(), T_STD, []),
        to(queries.financeData(), T_HEAVY, []),
        to(queries.slaStats(), T_STD, null),
        to(queries.wfmStats(), T_STD, null),
        to(queries.requisitionKpis(), T_STD, null),
        to(queries.globalDrilldown("hiring_manager"), T_STD, []),
      ]);
      if (!mounted) return;
      if (s.status === "fulfilled" && s.value) setStats(s.value as GlobalStats);
      if (proj.status === "fulfilled") setProjects(proj.value as Project[] || []);
      if (fRows.status === "fulfilled" && fRows.value) setFinanceRows(financeRowsVm(fRows.value as any[]));
      if (sStats.status === "fulfilled" && sStats.value) setSlaStats(slaStatsVm(sStats.value));
      if (wfm.status === "fulfilled") setWfmStats(wfm.value);
      if (rk.status === "fulfilled") setReqKpis(rk.value as RequisitionKpis);
      if (dd.status === "fulfilled") setDrilldown((dd.value as any) || []);
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
    () => filterFinanceRows(financeRows, projects, filters),
    [financeRows, projects, filters],
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
    return emptyFinanceAggregate();
  }, [fyRows]);

  const priorFin = useMemo(() => aggregateFinanceFromRows(priorRows), [priorRows]);
  const { revenue: yoyRev, cm: yoyCm } = useMemo(
    () => buildYoYRevenueSeries(allRows, selectedFyStart, autoCompareFy),
    [allRows, selectedFyStart, autoCompareFy],
  );
  const revQuarters = useMemo(() => quarterlyPlanActualForFy(fyRows, selectedFyStart), [fyRows, selectedFyStart]);
  const collQuarters = useMemo(() => quarterlyCollectionForFy(fyRows, selectedFyStart), [fyRows, selectedFyStart]);
  const cmQuarters = useMemo(() => quarterlyCmForFy(fyRows, selectedFyStart), [fyRows, selectedFyStart]);
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
  const cmA    = fin?.total_cm_inr ?? 0;
  const cmPct  = revA > 0 ? (cmA / revA) * 100 : 0;
  const coll   = fin?.total_collected_inr ?? 0;
  const collT  = fin?.total_collection_target_inr ?? 0;
  const unb    = fin?.total_unbilled_inr ?? 0;
  const bd     = fin?.total_bad_debt_inr ?? 0;
  const revAtt = fin?.rev_attainment ?? 0;
  const collAtt = collT > 0 ? (coll / collT) * 100 : 0;
  const unbPctRev = revA > 0 ? (unb / revA) * 100 : 0;
  const bdPctColl = coll > 0 ? (bd / coll) * 100 : 0;

  const priorRevA  = priorFin?.revenue_actual_inr ?? 0;
  const priorCmPct = priorFin && priorFin.revenue_actual_inr > 0 ? (priorFin.total_cm_inr / priorFin.revenue_actual_inr) * 100 : null;
  const priorColl  = priorFin?.total_collected_inr ?? 0;
  const cmDeltaPp  = priorCmPct != null ? cmPct - priorCmPct : null;

  // Productivity pulse KPIs: workbook cohort (`Project.has_taggd_joiner_sheet`) + FY25–26 blend constants.
  const fyRowsCeoKpi = useMemo(
    () => fyRowsTaggdJoinerSheetCohort(fyRows, projects),
    [fyRows, projects],
  );
  const finKpi = useMemo(() => {
    const a = aggregateFinanceFromRows(fyRowsCeoKpi);
    if (a) return a;
    return emptyFinanceAggregate();
  }, [fyRowsCeoKpi]);
  const revKpi = finKpi?.revenue_actual_inr ?? 0;

  const totalTajeJoiners = useMemo(
    () => fyRowsCeoKpi.reduce((s, r) => s + (r.taggd_joiners ?? 0), 0),
    [fyRowsCeoKpi],
  );
  const totalNonTaggdJoiners = useMemo(() => sumNonTaggdJoiners(fyRowsCeoKpi), [fyRowsCeoKpi]);
  const effectiveHiresForRph = useMemo(() => effectiveHireDenominatorForRph(fyRowsCeoKpi), [fyRowsCeoKpi]);
  const sumWl1CeoKpi = useMemo(
    () => fyRowsCeoKpi.reduce((s, r) => s + (Number(r.actual_headcount_wl1) || 0), 0),
    [fyRowsCeoKpi],
  );
  /** Σ WL1 FY on full filtered ledger (e.g. subtitles referencing whole FY footprint). */
  const sumWl1Hc = useMemo(
    () => fyRows.reduce((s, r) => s + (Number(r.actual_headcount_wl1) || 0), 0),
    [fyRows],
  );
  /** Σ overall HC person-months in FY (portfolio denominator for PPC). */
  const sumOverallHc = useMemo(
    () => fyRows.reduce((s, r) => s + (Number(r.actual_headcount_overall) || 0), 0),
    [fyRows],
  );
  const totalCost = useMemo(() => fyRows.reduce((s, r) => s + (r.total_cost_inr ?? 0), 0), [fyRows]);

  // RPH & Rev/WL1: cohort revenue + joiners + productivity mass (see `dashboard-aggregates.ts`).
  const rph = effectiveHiresForRph > 0 ? revKpi / effectiveHiresForRph : 0;
  const revPerWl1 = useMemo(() => ceoRevPerWl1Inr(revKpi, fyRowsCeoKpi), [revKpi, fyRowsCeoKpi]);
  // PPC — portfolio Σ cost ÷ Σ overall HC
  const ppc = sumOverallHc > 0 && totalCost > 0 ? totalCost / sumOverallHc : 0;
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

  // Account-level rollups for selected FY (all accounts — section applies top-N / filters in UI)
  const ceoAccountRollups = useMemo(() => {
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
      .map((a) => ({ ...a, attainment: a.budget > 0 ? (a.actual / a.budget) * 100 : null }));
  }, [fyRows, projects]);

  const accountIntelVerticalOptions = useMemo(() => {
    const s = new Set<string>();
    for (const a of ceoAccountRollups) {
      if (a.vertical && a.vertical !== "—") s.add(a.vertical);
    }
    return [...s].sort((x, y) => x.localeCompare(y));
  }, [ceoAccountRollups]);

  const filteredCeoAccounts = useMemo(() => {
    let rows = ceoAccountRollups;
    const needle = accountIntelSearch.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((a) => a.name.toLowerCase().includes(needle) || a.vertical.toLowerCase().includes(needle));
    }
    if (accountIntelVertical !== "all") {
      rows = rows.filter((a) => a.vertical === accountIntelVertical);
    }
    if (accountIntelStatus !== "all") {
      rows = rows.filter((a) => {
        const att = a.attainment;
        if (accountIntelStatus === "on_track") return att != null && att >= 100;
        if (accountIntelStatus === "monitor") return att != null && att >= 70 && att < 100;
        return att != null && att < 70;
      });
    }
    return rows;
  }, [ceoAccountRollups, accountIntelSearch, accountIntelVertical, accountIntelStatus]);

  const accountIntelHasFilters =
    accountIntelSearch.trim().length > 0 ||
    accountIntelVertical !== "all" ||
    accountIntelStatus !== "all";

  const displayedCeoAccounts = accountIntelHasFilters ? filteredCeoAccounts.slice(0, 80) : filteredCeoAccounts.slice(0, 8);

  const ceoProjectFyRows = useMemo(() => buildCeoProjectFyRows(fyRows, projects), [fyRows, projects]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="exec-dash-tremor space-y-7 pb-12 pt-2">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="exec-dash-tremor__hero-main min-w-0">
          <Title className="exec-dash-tremor__title text-3xl font-bold tracking-tight">CEO&apos;s View</Title>
          <Text className="mt-1 block text-sm font-medium text-tremor-content-emphasis">
            Strategic performance dashboard
          </Text>
        </div>
        <Button
          type="button"
          variant="secondary"
          color="orange"
          size="sm"
          onClick={() => setDeckEditorOpen(true)}
          title="Edit board slide deck (JSON)"
          className="inline-flex shrink-0 items-center gap-2 self-start lg:self-center"
        >
          <Pencil size={14} aria-hidden />
          Edit deck
        </Button>
      </div>

      <DashboardFiltersTremor
        value={filters}
        onChange={setFilters}
        projects={projects}
        financeRows={financeRows}
        fyYears={fyYears}
        selectedFyStart={selectedFyStart}
        onFyChange={setSelectedFyStart}
        fySelectDisabled={loading}
      />

      <ExecSectionTitle>Financial performance — {fyShortLabel(selectedFyStart)}</ExecSectionTitle>

      {loading ? (
        <Grid numItems={1} numItemsMd={3} className="gap-4">
          {(["orange", "teal", "blue"] as const).map((c) => (
            <Card
              key={c}
              decoration="left"
              decorationColor={c}
              className="h-[min(360px,55vh)] animate-pulse ring-1 ring-tremor-border"
            />
          ))}
        </Grid>
      ) : (
        <Grid numItems={1} numItemsMd={3} className="gap-4">
          <ExecutiveMetricHeroCard
            eyebrow="Revenue — Actual"
            decorationColor="orange"
            primary={formatLargeCurrency(revA)}
            deltas={
              [priorRevA > 0 ? yoyDeltaChip(revA, priorRevA) : null].filter(Boolean) as { label: string; cls: string }[]
            }
            attainmentLabel={`vs ₹ Budget ${formatLargeCurrency(revBud)}`}
            attainmentPct={revAtt}
            quarters={revQuarters}
            meta={[
              { label: "Full-year forecast", value: formatLargeCurrency(fin?.revenue_forecast_inr ?? 0) },
              ...(priorFin && priorRevA > 0
                ? [{ label: `${compareFyLabel} Actual`, value: formatLargeCurrency(priorFin.revenue_actual_inr) }]
                : []),
              ...(drilldown[0] ? [{ label: "Top HM", value: drilldown[0].name }] : []),
            ]}
          />
          <ExecutiveMetricHeroCard
            eyebrow="Contribution Margin"
            decorationColor="teal"
            primary={formatPercent(cmPct)}
            deltas={[
              cmPct >= 35
                ? { label: `+${(cmPct - 35).toFixed(1)} pp vs target`, cls: "exec-delta-chip--green" }
                : { label: `${(cmPct - 35).toFixed(1)} pp vs target`, cls: "exec-delta-chip--red" },
              ...(cmDeltaPp != null
                ? [
                    cmDeltaPp >= 0
                      ? { label: `▲ ${Math.abs(cmDeltaPp).toFixed(1)} pp YoY`, cls: "exec-delta-chip--green" }
                      : { label: `▼ ${Math.abs(cmDeltaPp).toFixed(1)} pp YoY`, cls: "exec-delta-chip--red" },
                  ]
                : []),
            ]}
            attainmentLabel="vs 35% target"
            attainmentPct={(cmPct / 35) * 100}
            quarters={cmQuarters}
            meta={[
              { label: "Target CM%", value: "35.0%" },
              ...(priorCmPct != null ? [{ label: `${compareFyLabel} CM%`, value: formatPercent(priorCmPct) }] : []),
            ]}
          />
          <ExecutiveMetricHeroCard
            eyebrow="Collection"
            decorationColor="blue"
            primary={formatLargeCurrency(coll)}
            deltas={
              [
                priorColl > 0 ? yoyDeltaChip(coll, priorColl) : null,
                collAtt >= 90
                  ? { label: "On track", cls: "exec-delta-chip--green" }
                  : { label: "Below target", cls: "exec-delta-chip--amber" },
              ].filter(Boolean) as { label: string; cls: string }[]
            }
            attainmentLabel={`vs ₹ Target ${formatLargeCurrency(collT)}`}
            attainmentPct={collAtt}
            quarters={collQuarters}
            meta={[
              {
                label: "Unbilled",
                value: `${formatPercent(unbPctRev)} of rev · ${formatLargeCurrency(unb)}`,
                valueCls: unbPctRev > 10 ? "red" : undefined,
              },
              { label: "Bad debt", value: formatLargeCurrency(bd), valueCls: bd > 0 ? "red" : undefined },
              { label: "Bad debt % coll.", value: formatPercent(bdPctColl) },
            ]}
          />
        </Grid>
      )}

      <ExecSectionTitle>Operational pulse</ExecSectionTitle>

      {loading ? (
        <Grid numItems={1} numItemsSm={2} numItemsLg={5} className="exec-dash-tremor__pulse-grid gap-4">
          {[0, 1, 2, 3, 4].map((k) => (
            <Card key={k} className="h-36 animate-pulse ring-1 ring-tremor-border" />
          ))}
        </Grid>
      ) : (
        <Grid numItems={1} numItemsSm={2} numItemsLg={5} className="exec-dash-tremor__pulse-grid gap-4">
          <OperationalPulseCard
            tone="orange"
            label="Revenue per Hire"
            primary={rph > 0 ? fmtPulseExactInr(rph) : "—"}
            sub={
              totalTajeJoiners > 0
                ? totalNonTaggdJoiners > 0
                  ? `${totalTajeJoiners.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Taggd · eff. ${effectiveHiresForRph.toLocaleString("en-IN", { maximumFractionDigits: 0 })} hires`
                  : `${totalTajeJoiners.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Taggd joiners`
                : "No joiner data"
            }
            badge={
              rph > 0
                ? {
                    label: rph >= 49000 ? "On target" : "Below ₹49K",
                    color: pulseBadgeFromExecCls(rph >= 49000 ? "exec-delta-chip--green" : "exec-delta-chip--amber"),
                  }
                : undefined
            }
          />
          <OperationalPulseCard
            tone="teal"
            label="Rev / Recruiter (WL1)"
            primary={revPerWl1 > 0 ? fmtPulseExactInr(revPerWl1) : "—"}
            sub={sumWl1CeoKpi > 0 ? `Σ ${sumWl1CeoKpi.toLocaleString("en-IN", { maximumFractionDigits: 2 })} WL1 HC (Taggd cohort)` : "No WL1 data"}
            badge={
              revPerWl1 > 0
                ? {
                    label: revPerWl1 >= 1e5 ? "On track" : "Watch",
                    color: pulseBadgeFromExecCls(revPerWl1 >= 1e5 ? "exec-delta-chip--green" : "exec-delta-chip--amber"),
                  }
                : undefined
            }
          />
          <OperationalPulseCard
            tone="teal"
            label="WFM Fill Rate"
            primary={wfmIdeal > 0 ? `${wfmFill.toFixed(1)}%` : "—"}
            sub={wfmIdeal > 0 ? `${wfmActual.toFixed(0)} of ${wfmIdeal.toFixed(0)} HC · ${wfmGap.toFixed(0)} gaps` : "No WFM data"}
            badge={
              wfmIdeal > 0
                ? {
                    label: wfmFill >= 70 && wfmFill <= 100 ? "On Plan" : wfmFill > 100 ? "Over-cap" : "Under-staffed",
                    color: pulseBadgeFromExecCls(wfmFillCls),
                  }
                : undefined
            }
          />
          <OperationalPulseCard
            tone="sky"
            label="SLA Attainment"
            primary={slaRagDen > 0 ? `${slaPct.toFixed(0)}%` : "—"}
            sub={
              slaRagDen > 0
                ? `${slaMet.toLocaleString()} met · ${slaNotMet.toLocaleString()} not met`
                : "No SLA RAG data"
            }
            badge={
              slaRagDen > 0
                ? {
                    label: slaPct >= 80 ? "Good" : slaPct >= 60 ? "Monitor" : "At Risk",
                    color: pulseBadgeFromExecCls(slaCls),
                  }
                : undefined
            }
          />
          <OperationalPulseCard
            tone="orange"
            label="Working Capital Risk"
            primary={fmtCr(unb + bd)}
            sub={revA > 0 ? `${workCapRiskPct.toFixed(1)}% of revenue at risk` : "Unbilled + bad debt"}
            badge={
              revA > 0
                ? {
                    label: workCapRiskPct < 20 ? "Low risk" : workCapRiskPct < 40 ? "Moderate" : "High risk",
                    color: pulseBadgeFromExecCls(
                      workCapRiskPct < 20
                        ? "exec-delta-chip--green"
                        : workCapRiskPct < 40
                          ? "exec-delta-chip--amber"
                          : "exec-delta-chip--red",
                    ),
                  }
                : undefined
            }
          />
        </Grid>
      )}

      <ExecSectionTitle>
        Year-on-Year — {fyShortLabel(selectedFyStart)} vs {compareFyLabel}
      </ExecSectionTitle>

      <div className="ceo-intel">
        <TremorDashboardSection tag="Trend" title={`Revenue — monthly actual vs ${compareFyLabel}`} noPad>
          <div className="bg-white px-5 py-4">
            {yoyRev.some((r) => r.actual > 0 || r.priorActual > 0) ? (
              <CeoRevenueYoYTremorChart data={yoyRev} priorLabel={`${compareFyLabel} Actual`} />
            ) : (
              <Text className="block text-center font-medium text-tremor-content-emphasis">No revenue data for selected FY</Text>
            )}
          </div>
        </TremorDashboardSection>

        <TremorDashboardSection tag="Summary" title="Key financials at a glance">
          {execRows.length > 0 ? (
            <div className="overflow-x-auto">
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
                    const varCls = Number.isFinite(varNum)
                      ? varNum >= 0
                        ? "ceo-summary-table__pos"
                        : "ceo-summary-table__neg"
                      : "";
                    const yoyCls2 = Number.isFinite(yoyNum)
                      ? yoyNum >= 0
                        ? "ceo-summary-table__pos"
                        : "ceo-summary-table__neg"
                      : "";
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
            </div>
          ) : (
            <Text className="block text-center font-medium text-tremor-content-emphasis">Upload finance data to populate</Text>
          )}
        </TremorDashboardSection>
      </div>

      {yoyCm.some((r) => r.actualPct > 0) && (
        <>
          <ExecSectionTitle>Contribution margin trend</ExecSectionTitle>
          <TremorDashboardSection tag="Profitability" title={`CM% — actual vs ${compareFyLabel} (35% reference)`} noPad>
            <div className="bg-white px-5 py-4">
              <CeoCmYoYTremorChart data={yoyCm} compareLabel={`CM% (${compareFyLabel})`} />
            </div>
          </TremorDashboardSection>
        </>
      )}

      <ExecSectionTitle>Efficiency — People & Cost</ExecSectionTitle>

      <div className="ceo-efficiency-grid">
        <TremorDashboardSection tag="Unit Economics" title="People productivity metrics">
          <Grid numItems={1} numItemsMd={2} className="gap-4">
            <Card decoration="top" decorationColor="orange">
              <Text className="font-medium text-tremor-content-emphasis">Revenue per Hire (RPH)</Text>
              <Metric className="mt-2 text-tremor-content-strong">{rph > 0 ? fmtPulseExactInr(rph) : "—"}</Metric>
              <Text className="mt-2 text-tremor-default text-tremor-content-subtle">
                {totalTajeJoiners > 0
                  ? `Based on ${totalTajeJoiners.toFixed(0)} Taggd joiners in ${fyShortLabel(selectedFyStart)}`
                  : "Requires joiner data from finance master"}
              </Text>
            </Card>
            <Card decoration="top" decorationColor="teal">
              <Text className="font-medium text-tremor-content-emphasis">Revenue / WL1 Recruiter</Text>
              <Metric className="mt-2 text-tremor-content-strong">{revPerWl1 > 0 ? fmtPulseExactInr(revPerWl1) : "—"}</Metric>
              <Text className="mt-2 text-tremor-default text-tremor-content-subtle">
                {sumWl1CeoKpi > 0
                  ? `Σ ${sumWl1CeoKpi.toLocaleString("en-IN", { maximumFractionDigits: 2 })} WL1 HC · Taggd cohort`
                  : "Requires WL1 HC from finance master"}
              </Text>
            </Card>
            <Card decoration="top" decorationColor="blue">
              <Text className="font-medium text-tremor-content-emphasis">PPC (Cost / Overall HC)</Text>
              <Metric className="mt-2 text-tremor-content-strong">{ppc > 0 ? fmtLakh(ppc) : "—"}</Metric>
              <Text className="mt-2 text-tremor-default text-tremor-content-subtle">
                {sumOverallHc > 0 && totalCost > 0
                  ? `₹${(totalCost / 1e7).toFixed(2)} Cr total cost · Σ ${sumOverallHc.toLocaleString("en-IN", { maximumFractionDigits: 2 })} overall HC`
                  : "Requires cost data from finance master"}
              </Text>
            </Card>
            <Card decoration="top" decorationColor="violet">
              <Text className="font-medium text-tremor-content-emphasis">WFM Capacity</Text>
              <Metric className="mt-2 text-tremor-content-strong">{wfmIdeal > 0 ? `${wfmFill.toFixed(1)}%` : "—"}</Metric>
              <Text className="mt-2 text-tremor-default text-tremor-content-subtle">
                {wfmIdeal > 0
                  ? `${wfmActual.toFixed(0)} actual / ${wfmIdeal.toFixed(0)} ideal · ${wfmGap.toFixed(0)} open gaps`
                  : "No WFM benchmark data"}
              </Text>
            </Card>
          </Grid>
        </TremorDashboardSection>

        <TremorDashboardSection tag="Geography" title="Revenue by region" noPad>
          <div className="bg-white px-5 py-4">
            {regional.length > 0 ? (
              <CeoRegionalRevenueTremorChart data={regional} />
            ) : (
              <Text className="block text-center font-medium text-tremor-content-emphasis">No regional data</Text>
            )}
          </div>
        </TremorDashboardSection>
      </div>

      <ExecSectionTitle>Industry mix — revenue by vertical</ExecSectionTitle>

      <TremorDashboardSection tag="Diversification" title={`Vertical revenue share — ${fyShortLabel(selectedFyStart)}`} noPad>
        {verticalMix.length > 0 ? (
          <div className="overflow-x-auto bg-white">
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
                    <td className="font-medium text-tremor-content-strong">{v.vertical}</td>
                    <td className="right tabular-nums text-tremor-content-strong">{fmtCr(v.actual)}</td>
                    <td className="right tabular-nums text-tremor-content-subtle">{fmtCr(v.budget)}</td>
                    <td className="right font-semibold tabular-nums text-tremor-content-strong">{fmtPct(v.share)}</td>
                    <td style={{ minWidth: 120 }}>
                      <div className="ceo-share-bar-wrap">
                        <div className="ceo-share-bar-track">
                          <div className="ceo-share-bar-fill" style={{ width: `${Math.min(100, v.share)}%` }} />
                        </div>
                        <span className="min-w-[32px] text-right text-xs tabular-nums text-tremor-content-subtle">
                          {fmtPct(v.share, 0)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Text className="block px-6 py-8 text-center font-medium text-tremor-content-emphasis">
            No vertical data — ensure projects have a vertical tag
          </Text>
        )}
      </TremorDashboardSection>

      <ExecSectionTitle>Account intelligence — top clients by revenue</ExecSectionTitle>

      <TremorDashboardSection
        tag="Account"
        title={`Top accounts — ${fyShortLabel(selectedFyStart)}`}
        noPad
        toolbar={
          <Grid numItems={1} numItemsSm={2} numItemsLg={5} className="items-end gap-3">
            <div className="lg:col-span-2">
              <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-600">Search</Text>
              <TextInput
                icon={Search}
                placeholder="Account or vertical…"
                value={accountIntelSearch}
                onValueChange={setAccountIntelSearch}
              />
            </div>
            <div>
              <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-600">Vertical</Text>
              <Select value={accountIntelVertical} onValueChange={setAccountIntelVertical}>
                <SelectItem value="all">All verticals</SelectItem>
                {accountIntelVerticalOptions.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </Select>
            </div>
            <div>
              <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-600">Status</Text>
              <Select
                value={accountIntelStatus}
                onValueChange={(v) => setAccountIntelStatus(v as typeof accountIntelStatus)}
              >
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="on_track">On track</SelectItem>
                <SelectItem value="monitor">Monitor</SelectItem>
                <SelectItem value="at_risk">At risk</SelectItem>
              </Select>
            </div>
            <Flex justifyContent="end" alignItems="end">
              <Button
                type="button"
                variant="secondary"
                color="orange"
                icon={Maximize2}
                onClick={() => setAccountProjectsModalOpen(true)}
              >
                Expand projects
              </Button>
            </Flex>
          </Grid>
        }
      >
        {ceoAccountRollups.length > 0 ? (
          displayedCeoAccounts.length > 0 ? (
            <div className="overflow-x-auto bg-white">
              {!accountIntelHasFilters && ceoAccountRollups.length > 8 ? (
                <Text className="border-b border-tremor-border px-6 py-2 text-xs text-tremor-content-subtle">
                  Showing top 8 accounts by revenue. Use search or filters to narrow the list, or expand projects for the full FY portfolio.
                </Text>
              ) : null}
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
                  {displayedCeoAccounts.map((a) => {
                    const att = a.attainment;
                    const statusLabel = att == null ? "—" : att >= 100 ? "On Track" : att >= 70 ? "Monitor" : "At Risk";
                    const badgeColor = att == null ? null : att >= 100 ? "emerald" : att >= 70 ? "amber" : "rose";
                    return (
                      <tr key={a.name}>
                        <td>
                          <span className="ceo-risk-table__name">{a.name}</span>
                        </td>
                        <td>
                          <span className="ceo-risk-table__sub">{a.vertical || "—"}</span>
                        </td>
                        <td className="text-right text-sm font-semibold tabular-nums text-tremor-content-strong">{fmtCr(a.actual)}</td>
                        <td className="text-right text-sm tabular-nums text-tremor-content-subtle">{fmtCr(a.budget)}</td>
                        <td className="text-right text-sm tabular-nums">
                          {att != null ? (
                            <span
                              className={
                                att >= 100 ? "font-semibold text-emerald-600" : att >= 70 ? "font-semibold text-amber-700" : "font-semibold text-rose-600"
                              }
                            >
                              {fmtPct(att, 0)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {badgeColor ? (
                            <Badge color={badgeColor} size="sm">
                              {statusLabel}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Text className="block px-6 py-8 text-center font-medium text-tremor-content-emphasis">
              No accounts match these filters
            </Text>
          )
        ) : (
          <Text className="block px-6 py-8 text-center font-medium text-tremor-content-emphasis">No account data for selected FY</Text>
        )}
      </TremorDashboardSection>

      <CeoProjectsPortfolioModal
        open={accountProjectsModalOpen}
        onOpenChange={setAccountProjectsModalOpen}
        fyLabel={fyShortLabel(selectedFyStart)}
        rows={ceoProjectFyRows}
      />

      <ExecSectionTitle>Delivery health — requisitions & SLA</ExecSectionTitle>

      <div className="ceo-efficiency-grid">
        <TremorDashboardSection tag="Recruitment" title="Requisition funnel summary">
          <Grid numItems={1} numItemsMd={2} className="gap-4">
            <Card decoration="top" decorationColor="violet">
              <Text className="font-medium text-tremor-content-emphasis">Total Requisitions</Text>
              <Metric className="mt-2 text-tremor-content-strong">{totalReqs > 0 ? totalReqs.toLocaleString() : "—"}</Metric>
              <Text className="mt-2 text-tremor-default text-tremor-content-subtle">All mandates tracked in TARA</Text>
            </Card>
            <Card decoration="top" decorationColor="orange">
              <Text className="font-medium text-tremor-content-emphasis">Closed / Filled</Text>
              <Metric className="mt-2 text-tremor-content-strong">{closedReqs > 0 ? closedReqs.toLocaleString() : "—"}</Metric>
              <Text className="mt-2 text-tremor-default text-tremor-content-subtle">
                {closureRate > 0 ? `${closureRate.toFixed(1)}% closure rate` : "No closure data"}
              </Text>
            </Card>
            <Card decoration="top" decorationColor="teal">
              <Text className="font-medium text-tremor-content-emphasis">Active Pipeline</Text>
              <Metric className="mt-2 text-tremor-content-strong">{activeReqs > 0 ? activeReqs.toLocaleString() : "—"}</Metric>
              <Text className="mt-2 text-tremor-default text-tremor-content-subtle">Open mandates in progress</Text>
            </Card>
            <Card decoration="top" decorationColor="sky">
              <Text className="font-medium text-tremor-content-emphasis">SLA — Green %</Text>
              <Metric
                className={
                  slaRagDen > 0
                    ? slaPct >= 80
                      ? "mt-2 text-emerald-600"
                      : slaPct >= 60
                        ? "mt-2 text-amber-700"
                        : "mt-2 text-rose-600"
                    : "mt-2 text-tremor-content-strong"
                }
              >
                {slaRagDen > 0 ? `${slaPct.toFixed(0)}%` : "—"}
              </Metric>
              <Text className="mt-2 text-tremor-default text-tremor-content-subtle">
                {slaRagDen > 0
                  ? `${slaMet.toLocaleString()} met · ${slaNotMet.toLocaleString()} not met (RAG outcomes)`
                  : "No SLA RAG data"}
              </Text>
            </Card>
          </Grid>
        </TremorDashboardSection>

        <TremorDashboardSection tag="Commercial" title="Clients & contracts at a glance">
          <div className="divide-y divide-tremor-border">
            {[
              { label: "Total clients", value: stats?.total_projects ?? "—" },
              { label: "Requisitions tracked", value: totalReqs > 0 ? totalReqs.toLocaleString() : "—" },
              { label: "Taggd joiners (FY)", value: totalTajeJoiners > 0 ? totalTajeJoiners.toFixed(0) : "—" },
              { label: "WFM — ideal HC", value: wfmIdeal > 0 ? wfmIdeal.toFixed(0) : "—" },
              { label: "WFM — actual HC", value: wfmActual > 0 ? wfmActual.toFixed(0) : "—" },
              { label: "Open gaps", value: wfmGap > 0 ? wfmGap.toFixed(0) : "0" },
            ].map((row) => (
              <Flex key={row.label} justifyContent="between" alignItems="center" className="gap-3 py-2">
                <Text className="text-tremor-default text-tremor-content-subtle">{row.label}</Text>
                <Text className="text-right text-sm font-semibold tabular-nums text-tremor-content-strong">{row.value}</Text>
              </Flex>
            ))}
          </div>
        </TremorDashboardSection>
      </div>

      <ExecSectionTitle>Board narrative — slide deck</ExecSectionTitle>
      <CeoBoardSlides config={slideDeck} />

      <CeoSlideDeckStudio
        open={deckEditorOpen}
        onOpenChange={setDeckEditorOpen}
        config={slideDeck}
        onApply={setSlideDeck}
      />
    </div>
  );
};
