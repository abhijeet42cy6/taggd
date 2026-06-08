import React, { useEffect, useMemo, useState } from "react";
import { Card, Grid, Text, Title } from "@tremor/react";
import { cn, formatCurrency, formatLargeCurrency, formatPercent } from "@/lib/utils";
import { queries, type GlobalMonitor, type GlobalStats, type Project, type RequisitionKpis } from "@/lib/api";
import { buildClientRiskRadarRows, worstDomainName, type ClientRiskRadarRow } from "@/lib/executive-risk-radar";
import { financeRowsVm, type FinanceRowVm } from "@/lib/view-models/finance";
import { slaStatsVm } from "@/lib/view-models/sla";
import { ExecutiveCmYoYChart, RegionalRevenueBarChart, RiskBar } from "@/components/platform/Charts";
import { FinanceRevenueMixedChartBlock } from "@/components/tremor-blocks/FinanceRevenueMixedChartBlock";
import { PlatformDrawer } from "@/components/platform/PlatformDrawer";
import { SkeletonKpiRow } from "@/components/platform/Skeleton";
import { DashboardFiltersTremor } from "@/components/tremor-dashboard/DashboardFiltersTremor";
import { ExecutiveMetricHeroCard } from "@/components/tremor-dashboard/ExecutiveMetricHeroCard";
import { ExecRevenueActualDrilldownModal } from "@/components/tremor-dashboard/ExecRevenueActualDrilldownModal";
import { ExecContributionMarginDrilldownModal } from "@/components/tremor-dashboard/ExecContributionMarginDrilldownModal";
import { ExecCollectionDrilldownModal } from "@/components/tremor-dashboard/ExecCollectionDrilldownModal";
import {
  OperationalPulseCard,
  OperationalPulseGrid,
  pulseBadgeFromExecCls,
} from "@/components/tremor-dashboard/OperationalPulseCards";
import { ExecSectionTitle } from "@/components/tremor-dashboard/ExecSectionTitle";
import { TremorDashboardSection } from "@/components/tremor-dashboard/TremorDashboardSection";
import { ProductivityAveragesSection } from "@/components/platform/ProductivityAveragesSection";
import { ExecAccountScorecardSection } from "@/components/tremor-dashboard/ExecAccountScorecardSection";
import {
  DEFAULT_DASHBOARD_FILTERS,
  filterFinanceRows,
  buildYoYRevenueSeries,
  buildRegionalRevenue,
  buildExecutiveSummary,
  aggregateFinanceFromRows,
  emptyFinanceAggregate,
  isProjectEligibleForFinanceAccountList,
  projectMatchesExecFilters,
  quarterlyPlanActualForFy,
  quarterlyCollectionForFy,
  quarterlyCmForFy,
  fiscalYearStart,
  parseMonthSort,
  type DashboardFilters as DF,
} from "@/lib/dashboard-aggregates";
import "@/styles/exec-dashboard.css";
import "@/styles/exec-dash-premium.css";
import "@/styles/new-contract-panel.css";

function fyShortLabel(start: number): string {
  return `FY${String(start).slice(2)}–${String(start + 1).slice(2)}`;
}

function yoyDelta(curr: number, prev: number): { label: string; cls: string } {
  if (prev <= 0 || curr <= 0) return { label: "—", cls: "exec-delta-chip--muted" };
  const p = ((curr - prev) / prev) * 100;
  const cls = p > 0.5 ? "exec-delta-chip--green" : p < -0.5 ? "exec-delta-chip--red" : "exec-delta-chip--amber";
  return { label: `${p >= 0 ? "▲" : "▼"} ${Math.abs(p).toFixed(1)}% YoY`, cls };
}

/* ── Main page ── */
export const Dashboard = () => {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [monitor, setMonitor] = useState<GlobalMonitor | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [financeRows, setFinanceRows] = useState<FinanceRowVm[]>([]);
  const [slaStats, setSlaStats] = useState<ReturnType<typeof slaStatsVm> | null>(null);
  const [wfmStats, setWfmStats] = useState<any>(null);
  const [reqKpis, setReqKpis] = useState<RequisitionKpis | null>(null);
  /** Per-project rows for Risk Radar (SLA / WFM detail — not portfolio-wide stats). */
  const [slaDataRows, setSlaDataRows] = useState<
    { project_id: number; account_name: string; status: string }[]
  >([]);
  const [wfmDataRows, setWfmDataRows] = useState<
    { project_id: number; ideal_hc: number | null; actual_hc_total: number | null; reporting_date: string | null }[]
  >([]);
  const [loadingCore, setLoadingCore] = useState(true);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [drawerClient, setDrawerClient] = useState<string | null>(null);
  const [clientSheetTab, setClientSheetTab] = useState(0);
  const [heatmapFullOpen, setHeatmapFullOpen] = useState(false);
  const [revenueActualDrillOpen, setRevenueActualDrillOpen] = useState(false);
  const [cmDrillOpen, setCmDrillOpen] = useState(false);
  const [collectionDrillOpen, setCollectionDrillOpen] = useState(false);
  const [filters, setFilters] = useState<DF>(DEFAULT_DASHBOARD_FILTERS);
  const [selectedFyStart, setSelectedFyStart] = useState<number>(2025);

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
          fRows,
          sStats,
          wfm,
          rk,
          slaD,
          wfmD,
        ] = await Promise.allSettled([
          withTimeout(queries.globalStats(), T_STD, null),
          withTimeout(queries.globalMonitor(), T_HEAVY, null),
          withTimeout(queries.projects(), T_STD, []),
          withTimeout(queries.financeData(), T_HEAVY, []),
          withTimeout(queries.slaStats(), T_STD, null),
          withTimeout(queries.wfmStats(), T_STD, null),
          withTimeout(queries.requisitionKpis(), T_STD, null),
          withTimeout(queries.slaData(), T_STD, []),
          withTimeout(queries.wfmData(), T_STD, []),
        ]);
        if (!mounted) return;

        if (sRes.status === "fulfilled" && sRes.value != null) setStats(sRes.value);
        if (mRes.status === "fulfilled" && mRes.value != null) setMonitor(mRes.value);
        if (sRes.status === "rejected" && mRes.status === "rejected") {
          setCoreError("Unable to load dashboard KPIs — verify API connectivity.");
        }

        if (proj.status === "fulfilled") setProjects(proj.value || []);
        if (fRows.status === "fulfilled" && fRows.value) setFinanceRows(financeRowsVm(fRows.value as any[]));
        if (sStats.status === "fulfilled" && sStats.value) setSlaStats(slaStatsVm(sStats.value));
        if (wfm.status === "fulfilled") setWfmStats(wfm.value);
        if (rk.status === "fulfilled") setReqKpis(rk.value as RequisitionKpis);
        if (slaD.status === "fulfilled" && Array.isArray(slaD.value)) {
          setSlaDataRows(
            (slaD.value as { project_id: number; account_name?: string; status: string }[]).map((r) => ({
              project_id: r.project_id,
              account_name: String(r.account_name ?? ""),
              status: String(r.status ?? ""),
            })),
          );
        }
        if (wfmD.status === "fulfilled" && Array.isArray(wfmD.value)) {
          setWfmDataRows(
            wfmD.value as {
              project_id: number;
              ideal_hc: number | null;
              actual_hc_total: number | null;
              reporting_date: string | null;
            }[],
          );
        }
      } catch {
        if (mounted) setCoreError("Unable to load KPIs — check backend connectivity.");
            } finally {
        if (mounted) setLoadingCore(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    setClientSheetTab(0);
  }, [drawerClient]);

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

  const filteredRows = useMemo(() => filterFinanceRows(financeRows, projects, filters), [financeRows, projects, filters]);

  /** Prior FY for YoY (same rule as CEO's View). */
  const autoCompareFy = useMemo(() => {
    const older = fyYears.filter((y) => y < selectedFyStart).sort((a, b) => b - a);
    if (older.length) return older[0];
    return selectedFyStart - 1;
  }, [fyYears, selectedFyStart]);

  const compareFyLabel = fyShortLabel(autoCompareFy);

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
      return d && fiscalYearStart(d) === autoCompareFy;
    });
  }, [filteredRows, fyYears.length, autoCompareFy]);

  const priorFinance = useMemo(() => aggregateFinanceFromRows(priorKpiRows), [priorKpiRows]);

  /** Row-level /finance/data only. Never fall back to GET /finance/stats — when kpiRows is empty
   *  (e.g. account filter, or no FY in ledger for the selected year) the old fallback showed the
   *  same portfolio total (~₹189.96 Cr) for every account. */
  const displayFinance = useMemo(() => {
    const agg = aggregateFinanceFromRows(kpiRows);
    if (agg) return agg;
    return emptyFinanceAggregate();
  }, [kpiRows]);

  const { revenue: yoyRev, cm: yoyCm } = useMemo(
    () => buildYoYRevenueSeries(filteredRows, selectedFyStart, autoCompareFy),
    [filteredRows, selectedFyStart, autoCompareFy],
  );

  const priorFYTotalCr = (priorFinance?.revenue_actual_inr ?? 0) / 1e7;

  const revQuarters = useMemo(() => quarterlyPlanActualForFy(kpiRows, selectedFyStart), [kpiRows, selectedFyStart]);
  const collQuarters = useMemo(
    () => quarterlyCollectionForFy(kpiRows, selectedFyStart),
    [kpiRows, selectedFyStart],
  );
  const cmQuarters = useMemo(() => quarterlyCmForFy(kpiRows, selectedFyStart), [kpiRows, selectedFyStart]);

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
  const pipelineByProjectId = useMemo(() => {
    const m = new Map<
      number,
      { positions: number; closed: number; active: number; on_hold: number; pipeline: number; revenue: number }
    >();
    for (const s of projectStats) {
      m.set(s.id, {
        positions: s.positions,
        closed: s.closed,
        active: s.active,
        on_hold: s.on_hold,
        pipeline: s.pipeline,
        revenue: s.revenue,
      });
    }
    return m;
  }, [projectStats]);

  const riskClients = useMemo(() => {
    return projects
      .filter(isProjectEligibleForFinanceAccountList)
      .filter((p) => projectMatchesExecFilters(p, filters))
      .map((p) => ({
        id: p.id,
        name: (p.engagement_name || p.account_name || p.filename || `Project ${p.id}`).trim() || `Project ${p.id}`,
        accountName: (p.account_name || p.engagement_name || "").trim(),
      }));
  }, [projects, filters]);

  const riskRows = useMemo(
    () =>
      buildClientRiskRadarRows(
        riskClients,
        kpiRows,
        priorKpiRows,
        slaDataRows,
        pipelineByProjectId,
      ),
    [riskClients, kpiRows, priorKpiRows, slaDataRows, pipelineByProjectId],
  );

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

  /* ── Risk radar: budget rev, actual rev YoY, CM%, SLA ── */
  function riskDotCls(color: "green" | "amber" | "red"): string {
    return `exec-risk-dot exec-risk-dot--${color}`;
  }

  function riskDotForLevel(level: "OK" | "MED" | "HIGH") {
    const c = level === "OK" ? "green" : level === "MED" ? "amber" : "red";
    return riskDotCls(c);
  }

  function riskRadarCell(level: "OK" | "MED" | "HIGH" | null) {
    if (level == null) {
      return (
        <span className="text-sm font-semibold text-tremor-content-emphasis">—</span>
      );
    }
    return <span className={riskDotForLevel(level)}>{level}</span>;
  }

  return (
    <div className="exec-dash-tremor space-y-7 pb-12 pt-2">
      <div className="exec-dash-tremor__hero">
        <div className="exec-dash-tremor__hero-main">
          <Title className="exec-dash-tremor__title text-3xl font-bold tracking-tight">Executive Overview</Title>
        </div>
      </div>

      {coreError && <div className="alert-banner red">{coreError}</div>}

      <DashboardFiltersTremor
        value={filters}
        onChange={setFilters}
        projects={projects}
        financeRows={financeRows}
        fyYears={fyYears}
        selectedFyStart={selectedFyStart}
        onFyChange={setSelectedFyStart}
        fySelectDisabled={loadingCore}
      />

      <ExecSectionTitle>Financial performance — {fyShortLabel(selectedFyStart)}</ExecSectionTitle>

      {loadingCore ? (
        <Grid numItems={1} numItemsLg={3} className="gap-4">
          {[0, 1, 2].map((k) => (
            <Card key={k} className="exec-dash-tremor__hero-card h-64 animate-pulse bg-gradient-to-br from-orange-50 to-white ring-1 ring-black/[0.05]" />
          ))}
        </Grid>
      ) : (
        <Grid numItems={1} numItemsLg={3} className="gap-4">
          <ExecutiveMetricHeroCard
            eyebrow="Revenue — Actual"
            decorationColor="orange"
            primary={formatLargeCurrency(revA)}
            deltas={
              [
                priorFinance && priorFinance.revenue_actual_inr > 0
                  ? yoyDelta(revA, priorFinance.revenue_actual_inr)
                  : null,
              ].filter(Boolean) as { label: string; cls: string }[]
            }
            attainmentLabel={`Compared to budget · ${formatLargeCurrency(revBudget)}`}
            attainmentPct={revAtt}
            quarters={revQuarters}
            meta={[
              { label: "Full-year forecast", value: formatLargeCurrency(displayFinance?.revenue_forecast_inr ?? 0) },
              ...(priorFinance
                ? [{ label: `${compareFyLabel} Actual`, value: formatLargeCurrency(priorFinance.revenue_actual_inr) }]
                : []),
            ]}
            onDrillIn={() => setRevenueActualDrillOpen(true)}
            drillAriaLabel="Open actual revenue account breakdown and charts"
          />

          <ExecutiveMetricHeroCard
            eyebrow="Contribution Margin"
            decorationColor="amber"
            primary={formatPercent(cmPct)}
            deltas={[
              cmPct >= 35
                ? { label: `+${(cmPct - 35).toFixed(1)} pp vs target`, cls: "exec-delta-chip--green" }
                : { label: `${(cmPct - 35).toFixed(1)} pp vs target`, cls: "exec-delta-chip--red" },
              ...(cmPriorPct != null
                ? [
                    cmPct >= cmPriorPct
                      ? { label: `▲ ${(cmPct - cmPriorPct).toFixed(1)} pp YoY`, cls: "exec-delta-chip--green" }
                      : { label: `▼ ${(cmPriorPct - cmPct).toFixed(1)} pp YoY`, cls: "exec-delta-chip--red" },
                  ]
                : []),
            ]}
            attainmentLabel="Compared to 35% CM target"
            attainmentPct={(cmPct / 35) * 100}
            quarters={cmQuarters}
            meta={[
              { label: "Target CM%", value: "35.0%" },
              ...(cmPriorPct != null ? [{ label: `${compareFyLabel} CM%`, value: formatPercent(cmPriorPct) }] : []),
            ]}
            onDrillIn={() => setCmDrillOpen(true)}
            drillAriaLabel="Open contribution margin account breakdown and charts"
          />

          <ExecutiveMetricHeroCard
            eyebrow="Collection"
            decorationColor="orange"
            primary={formatLargeCurrency(coll)}
            deltas={
              [
                priorFinance && priorFinance.total_collected_inr > 0
                  ? yoyDelta(coll, priorFinance.total_collected_inr)
                  : null,
                collAtt >= 90
                  ? { label: "On track", cls: "exec-delta-chip--green" }
                  : { label: "Below target", cls: "exec-delta-chip--amber" },
              ].filter(Boolean) as { label: string; cls: string }[]
            }
            attainmentLabel={`Compared to collection target · ${formatLargeCurrency(ct)}`}
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
            onDrillIn={() => setCollectionDrillOpen(true)}
            drillAriaLabel="Open collection and unbilled account breakdown and charts"
          />
        </Grid>
      )}

      <ExecSectionTitle>Operational snapshot</ExecSectionTitle>

      {loadingCore ? (
        <SkeletonKpiRow count={4} />
      ) : (
        <OperationalPulseGrid>
          <OperationalPulseCard
            tone="sky"
            label="SLA portfolio health"
            primary={slaStats ? formatPercent(slaStats.portfolio_health) : "—"}
            sub={
              slaStats
                ? `${slaStats.met_count} met · ${slaStats.not_met_count} not met`
                : "No SLA data"
            }
            badge={
              slaStats
                ? {
                    label:
                      slaStats.portfolio_health >= 80
                        ? "Healthy"
                        : slaStats.portfolio_health >= 60
                          ? "At risk"
                          : "Critical",
                    color: pulseBadgeFromExecCls(
                      slaStats.portfolio_health >= 80
                        ? "exec-delta-chip--green"
                        : slaStats.portfolio_health >= 60
                          ? "exec-delta-chip--amber"
                          : "exec-delta-chip--red",
                    ),
                  }
                : undefined
            }
          />
          <OperationalPulseCard
            tone="teal"
            label="Workforce HC"
            primary={wfmStats ? Math.round(wfmStats.total_actual_hc ?? 0).toLocaleString() : "—"}
            sub={
              wfmStats
                ? `Ideal: ${Math.round(wfmStats.total_ideal_hc ?? 0)} · Fill rate: ${formatPercent(wfmStats.capacity_fill_rate ?? 0)}`
                : "No WFM data"
            }
            badge={
              wfmStats
                ? {
                    label:
                      (wfmStats.capacity_fill_rate ?? 0) >= 90
                        ? "Staffed"
                        : (wfmStats.capacity_fill_rate ?? 0) >= 75
                          ? "Gap"
                          : "Understaffed",
                    color: pulseBadgeFromExecCls(
                      (wfmStats.capacity_fill_rate ?? 0) >= 90
                        ? "exec-delta-chip--green"
                        : (wfmStats.capacity_fill_rate ?? 0) >= 75
                          ? "exec-delta-chip--amber"
                          : "exec-delta-chip--red",
                    ),
                  }
                : undefined
            }
          />
          <OperationalPulseCard
            tone="violet"
            label="Pipeline — reqs"
            primary={reqKpis ? `${reqKpis.open_req.toLocaleString()}` : "—"}
            sub={
              reqKpis
                ? `${reqKpis.offer_req.toLocaleString()} at offer · ${reqKpis.joiners.toLocaleString()} joined`
                : "No data"
            }
            badge={reqKpis ? { label: "Open", color: "slate" } : undefined}
          />
          <OperationalPulseCard
            tone="orange"
            label="Unbilled + bad debt"
            primary={formatLargeCurrency(unb + bd)}
            sub={
              unb + bd > 0
                ? `Unbilled ${formatPercent(unbPctRev)} rev · Bad debt ${formatLargeCurrency(bd)}`
                : "No exposure"
            }
            badge={
              unb + bd === 0
                ? { label: "Clear", color: "emerald" }
                : unbPctRev > 15
                  ? { label: "High risk", color: "rose" }
                  : { label: "Monitor", color: "amber" }
            }
          />
        </OperationalPulseGrid>
      )}

      <ExecSectionTitle>Performance trends</ExecSectionTitle>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <FinanceRevenueMixedChartBlock
          tag="Finance"
          title={`Monthly Revenue — Actual vs Budget vs Forecast vs ${compareFyLabel}`}
          data={yoyRev}
          priorLabel={`${compareFyLabel} Actual`}
          showChart={filteredRows.length > 0}
        />

        <TremorDashboardSection tag="Margin" title={`CM% — ${fyShortLabel(selectedFyStart)} vs ${compareFyLabel}`} noPad>
          <div className="bg-white px-5 py-4">
            {yoyCm.length === 0 || !filteredRows.length ? (
              <Text className="font-medium text-tremor-content-emphasis">No CM data</Text>
            ) : (
              <ExecutiveCmYoYChart data={yoyCm} compareLabel={`CM% (${compareFyLabel})`} />
            )}
          </div>
        </TremorDashboardSection>
      </div>

      <ProductivityAveragesSection
        rows={kpiRows}
        loading={loadingCore}
        externalFilters
        fyLabel={fyShortLabel(selectedFyStart)}
      />

      <TremorDashboardSection tag="Geography" title="Revenue by region — Actual vs Budget" noPad>
        <div className="bg-white px-5 py-4">
          <RegionalRevenueBarChart data={regional} />
        </div>
      </TremorDashboardSection>

      <TremorDashboardSection tag="Scorecard" title="Executive summary — Budget vs Forecast vs Actual vs YoY">
        {execRows.length === 0 ? (
          <Text className="font-medium text-tremor-content-emphasis">Upload finance data to populate this table</Text>
        ) : (
          <div className="overflow-x-auto">
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
      </TremorDashboardSection>

      <div className="space-y-4">
        <ExecSectionTitle>Portfolio monitor and pipeline</ExecSectionTitle>
        <Text className="block font-medium leading-relaxed text-tremor-content-emphasis">
          <span className="font-semibold text-tremor-content-strong">Risk radar</span> uses{" "}
          <span className="font-semibold text-tremor-content-strong">finance ledger + SLA</span> for the selected FY and
          account filters. Domains:{" "}
          <span className="font-semibold text-orange-700">Budget rev</span> (actual ÷ budget),{" "}
          <span className="font-semibold text-orange-700">Actual rev</span> (YoY vs prior FY actual),{" "}
          <span className="font-semibold text-orange-700">CM%</span> (vs 35% target),{" "}
          <span className="font-semibold text-orange-700">SLA</span> (Met ÷ Met+Not met). Missing data is excluded from
          the composite score. Requisition counts appear in the client drawer only.
        </Text>

        <TremorDashboardSection
          tag="Risk radar"
          title="Client health snapshot"
          action="Full view"
          onAction={() => setHeatmapFullOpen(true)}
          noPad
        >
          <div className="overflow-x-auto bg-white">
            <table className="exec-risk-table">
              <thead>
                <tr>
                  <th style={{ width: "20%" }}>Client</th>
                  <th>Budget rev</th>
                  <th>Actual rev</th>
                  <th>CM%</th>
                  <th>SLA</th>
                  <th style={{ textAlign: "right" }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {riskRows.slice(0, 8).map((p) => (
                  <tr key={p.id} onClick={() => setDrawerClient(p.name)}>
                    <td>
                      <div className="exec-risk-table__name" title={p.name}>{p.name}</div>
                    </td>
                    <td>{riskRadarCell(p.levels.budgetRev)}</td>
                    <td>{riskRadarCell(p.levels.actualRev)}</td>
                    <td>{riskRadarCell(p.levels.cm)}</td>
                    <td>{riskRadarCell(p.levels.sla)}</td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                        {p.composite == null ? (
                          <Text className="text-sm font-semibold text-tremor-content-emphasis">—</Text>
                        ) : (
                          <>
                            <div style={{
                              width: 48, height: 4, background: "var(--border)", borderRadius: 100, overflow: "hidden",
                            }}>
                              <div style={{
                                width: `${Math.min(100, p.composite)}%`,
                                height: "100%",
                                background: p.composite >= 70 ? "var(--green)" : p.composite >= 50 ? "var(--amber)" : "var(--red)",
                                borderRadius: 100,
                              }} />
                            </div>
                            <Text className="min-w-[24px] text-sm font-semibold tabular-nums text-tremor-content-strong">
                              {p.composite}
                            </Text>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {riskRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="exec-empty">No client data yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TremorDashboardSection>

        <ExecAccountScorecardSection
          fyLabel={fyShortLabel(selectedFyStart)}
          kpiRows={kpiRows}
          projects={projects}
        />
      </div>

      {/* ── Client drawer (new-contract-sheet chrome) ── */}
      <PlatformDrawer
        open={Boolean(drawerClient)}
        embeddedChrome
        className="platform-drawer--ncp-embed"
        title=""
        onClose={() => setDrawerClient(null)}
      >
        {selectedClient && (
          <div className="new-contract-sheet flex min-h-0 flex-1 flex-col">
            <div className="ncp-scroll min-h-0 flex-1">
              <div className="ncp-page">
                <div className="ncp-header">
                  <div style={{ minWidth: 0 }}>
                    <div className="ncp-breadcrumb">
                      <span>Dashboard</span>
                      <span className="ncp-breadcrumb-sep">›</span>
                      <span>Client</span>
                    </div>
                    <h1 className="ncp-h1">{selectedClient.name}</h1>
                    <p className="ncp-subtitle" style={{ marginTop: 4 }}>
                      Portfolio snapshot for this client — revenue, composite health score, domain mix, and hiring
                      pipeline counts. Data respects your dashboard filters and fiscal context.
                    </p>
                  </div>
                  <button type="button" className="ncp-close-btn" aria-label="Close" onClick={() => setDrawerClient(null)}>
                    ✕
                  </button>
                </div>

                <div className="ncp-steps" role="tablist" style={{ marginBottom: 18 }}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={clientSheetTab === 0}
                    className={cn("ncp-step", clientSheetTab === 0 && "ncp-active")}
                    onClick={() => setClientSheetTab(0)}
                  >
                    <span className="ncp-step-num">◇</span>
                    Overview
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={clientSheetTab === 1}
                    className={cn("ncp-step", clientSheetTab === 1 && "ncp-active")}
                    onClick={() => setClientSheetTab(1)}
                  >
                    <span className="ncp-step-num">📊</span>
                    Hiring pipeline
                  </button>
                </div>

                <div className={cn("ncp-panel", clientSheetTab === 0 && "ncp-panel-active")}>
                  <div className="ncp-section">
                    <div className="ncp-section-header" style={{ cursor: "default", pointerEvents: "none" }}>
                      <span className="ncp-section-icon ncp-orange">◇</span>
                      <div>
                        <div className="ncp-section-label">Account</div>
                        <div className="ncp-section-desc">Commercial and health signals for this client.</div>
                      </div>
                    </div>
                    <div className="ncp-section-body">
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Client</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ncp-text-primary)", padding: "6px 8px" }}>
                          {selectedClient.name}
                        </div>
                    </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Positions</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ncp-text-primary)", padding: "6px 8px" }}>
                          {selectedClient.positions}
                </div>
            </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Revenue</div>
                        <div style={{ fontSize: 13, fontWeight: 500, fontFamily: "var(--ncp-mono)", padding: "6px 8px" }}>
                          {formatCurrency(selectedClient.revenue)}
            </div>
                            </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Composite score</div>
                        <div style={{ fontSize: 13, fontWeight: 500, fontFamily: "var(--ncp-mono)", padding: "6px 8px" }}>
                          {selectedClient.composite == null ? "—" : `${selectedClient.composite} / 100`}
                                            </div>
                                        </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Risk level</div>
                        <div style={{ padding: "6px 8px" }}>
                          {selectedClient.risk == null ? (
                            <span style={{ fontSize: 13, color: "var(--ncp-text-muted)" }}>—</span>
                          ) : (
                            <span
                              className={cn(
                                "ncp-status-pill",
                                selectedClient.risk === "OK" && "ncp-st-active",
                                selectedClient.risk === "MED" && "ncp-st-pending",
                                selectedClient.risk === "HIGH" && "ncp-st-risk-high",
                              )}
                              style={{ cursor: "default", pointerEvents: "none" }}
                              role="status"
                            >
                              <span
                                className={`exec-risk-dot exec-risk-dot--${
                                  selectedClient.risk === "OK" ? "green" : selectedClient.risk === "MED" ? "amber" : "red"
                                }`}
                              />
                              {selectedClient.risk}
                            </span>
                          )}
                            </div>
                            </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Weakest domain</div>
                        <div style={{ fontSize: 13, fontWeight: 500, padding: "6px 8px" }}>{worstDomainName(selectedClient)}</div>
                                            </div>
                      <div className="ncp-prop-row ncp-prop-row--tall-value">
                        <div className="ncp-prop-label">Domain scores (0–100)</div>
                        <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--ncp-text-primary)", padding: "6px 8px" }}>
                          Rev (budget) {selectedClient.scores.budgetRev ?? "—"} · Rev (actual YoY){" "}
                          {selectedClient.scores.actualRev ?? "—"} · CM% {selectedClient.scores.cm ?? "—"} · SLA{" "}
                          {selectedClient.scores.sla ?? "—"}
                            </div>
                                            </div>
                                        </div>
                            </div>
                </div>

                <div className={cn("ncp-panel", clientSheetTab === 1 && "ncp-panel-active")}>
                  <div className="ncp-section">
                    <div className="ncp-section-header" style={{ cursor: "default", pointerEvents: "none" }}>
                      <span className="ncp-section-icon ncp-blue">📊</span>
                      <div>
                        <div className="ncp-section-label">Hiring pipeline</div>
                        <div className="ncp-section-desc">Requisition lifecycle counts for this client.</div>
                      </div>
                    </div>
                    <div className="ncp-section-body">
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Closed</div>
                        <div style={{ fontSize: 13, fontWeight: 500, padding: "6px 8px" }}>{selectedClient.closed}</div>
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Active</div>
                        <div style={{ fontSize: 13, fontWeight: 500, padding: "6px 8px" }}>{selectedClient.active}</div>
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">On hold</div>
                        <div style={{ fontSize: 13, fontWeight: 500, padding: "6px 8px" }}>{selectedClient.on_hold}</div>
                                </div>
                                </div>
                            </div>
                </div>
                </div>
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
                <th>Budget rev</th>
                <th>Actual rev</th>
                <th>CM%</th>
                <th>SLA</th>
                <th style={{ textAlign: "right" }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {riskRows.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => { setHeatmapFullOpen(false); setDrawerClient(p.name); }}
                >
                  <td><div className="exec-risk-table__name" title={p.name}>{p.name}</div></td>
                  <td>{riskRadarCell(p.levels.budgetRev)}</td>
                  <td>{riskRadarCell(p.levels.actualRev)}</td>
                  <td>{riskRadarCell(p.levels.cm)}</td>
                  <td>{riskRadarCell(p.levels.sla)}</td>
                  <td style={{ textAlign: "right" }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{p.composite ?? "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="exec-heatmap-footnote">
          Budget rev (actual ÷ budget), actual rev (YoY vs prior FY), CM% (35% target), and SLA. Missing domains are
          excluded from the composite, not treated as failing.
        </p>
      </PlatformDrawer>

      <ExecRevenueActualDrilldownModal
        open={revenueActualDrillOpen}
        onOpenChange={setRevenueActualDrillOpen}
        fyLabel={fyShortLabel(selectedFyStart)}
        kpiRows={kpiRows}
        projects={projects}
        quarters={revQuarters}
        totalActualInr={revA}
        totalBudgetInr={revBudget}
        attainmentPct={revAtt}
        compareFyLabel={compareFyLabel}
        priorActualInr={priorFinance?.revenue_actual_inr}
      />

      <ExecContributionMarginDrilldownModal
        open={cmDrillOpen}
        onOpenChange={setCmDrillOpen}
        fyLabel={fyShortLabel(selectedFyStart)}
        kpiRows={kpiRows}
        projects={projects}
        quarters={cmQuarters}
        portfolioCmPct={cmPct}
        totalCmInr={displayFinance?.total_cm_inr ?? 0}
        totalRevInr={revA}
        targetAttainmentPct={(cmPct / 35) * 100}
        compareFyLabel={compareFyLabel}
        priorPortfolioCmPct={cmPriorPct ?? undefined}
      />

      <ExecCollectionDrilldownModal
        open={collectionDrillOpen}
        onOpenChange={setCollectionDrillOpen}
        fyLabel={fyShortLabel(selectedFyStart)}
        kpiRows={kpiRows}
        projects={projects}
        quarters={collQuarters}
        totalCollectedInr={coll}
        totalCollectionTargetInr={ct}
        collectionAttainmentPct={collAtt}
        totalUnbilledInr={unb}
        totalBadDebtInr={bd}
        totalRevInr={revA}
        portfolioUnbPctRev={unbPctRev}
        compareFyLabel={compareFyLabel}
        priorCollectedInr={priorFinance?.total_collected_inr}
      />
        </div>
    );
};
