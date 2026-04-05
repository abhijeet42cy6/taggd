import React, { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatLargeCurrency, formatPercent } from "@/lib/utils";
import { queries, type GlobalMonitor, type GlobalStats, type Project, type RequisitionKpis } from "@/lib/api";
import { financeStatsVm, financeRowsVm, type FinanceRowVm } from "@/lib/view-models/finance";
import { slaStatsVm } from "@/lib/view-models/sla";
import { PlatformSection, PageHeader, StatusTag } from "@/components/platform/PlatformBlocks";
import {
  ExecutiveRevenueYoYChart,
  ExecutiveCmYoYChart,
  RegionalRevenueBarChart,
  RiskBar,
} from "@/components/platform/Charts";
import { PlatformDrawer } from "@/components/platform/PlatformDrawer";
import { SkeletonKpiRow, SkeletonTable } from "@/components/platform/Skeleton";
import { DashboardFilters } from "@/components/platform/DashboardFilters";
import { ExecutiveKpiCard } from "@/components/platform/ExecutiveKpiCard";
import { ProductivityAveragesSection } from "@/components/platform/ProductivityAveragesSection";
import {
  DEFAULT_DASHBOARD_FILTERS,
  filterFinanceRows,
  buildYoYRevenueSeries,
  buildRegionalRevenue,
  buildExecutiveSummary,
  sumPriorFYActual,
  aggregateFinanceFromRows,
  fiscalYearStart,
  parseMonthSort,
  type DashboardFilters as DF,
} from "@/lib/dashboard-aggregates";

function fyShortLabel(start: number): string {
  return `FY${String(start).slice(2)}–${String(start + 1).slice(2)}`;
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
  const fillPct = (p.closed / total) * 100;
  const holdPct = (p.on_hold / total) * 100;
  const revPerReq = p.revenue / total;
  if (fillPct < 40) return "Hiring";
  if (holdPct > 25) return "SLA";
  if (revPerReq < 80_000) return "Finance";
  return "WFM";
}

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [sRes, mRes] = await Promise.allSettled([queries.globalStats(), queries.globalMonitor()]);
        if (!mounted) return;
        if (sRes.status === "fulfilled") setStats(sRes.value);
        if (mRes.status === "fulfilled") setMonitor(mRes.value);
        if (sRes.status === "rejected" && mRes.status === "rejected")
          setCoreError("Unable to load dashboard KPIs. Please verify backend/API connectivity.");
      } catch {
        if (mounted) setCoreError("Unable to load KPIs — check backend connectivity.");
      } finally {
        if (mounted) setLoadingCore(false);
      }

      const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
        Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

      const [proj, fStats, fRows, sStats, wfm, rk, dd] = await Promise.allSettled([
        withTimeout(queries.projects(), 8_000, []),
        withTimeout(queries.financeStats(), 8_000, null),
        withTimeout(queries.financeData(), 8_000, []),
        withTimeout(queries.slaStats(), 8_000, null),
        withTimeout(queries.wfmStats(), 8_000, null),
        withTimeout(queries.requisitionKpis(), 8_000, null),
        withTimeout(queries.globalDrilldown("hiring_manager"), 8_000, []),
      ]);
      if (!mounted) return;
      if (proj.status === "fulfilled") setProjects(proj.value || []);
      if (fStats.status === "fulfilled" && fStats.value) setFinanceStatsApi(financeStatsVm(fStats.value));
      if (fRows.status === "fulfilled" && fRows.value) setFinanceRows(financeRowsVm(fRows.value as any[]));
      if (sStats.status === "fulfilled" && sStats.value) setSlaStats(slaStatsVm(sStats.value));
      if (wfm.status === "fulfilled") setWfmStats(wfm.value);
      if (rk.status === "fulfilled") setReqKpis(rk.value as RequisitionKpis);
      if (dd.status === "fulfilled") setDrilldown((dd.value as any) || []);
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

  const filteredRows = useMemo(
    () => filterFinanceRows(financeRows, projects, filters),
    [financeRows, projects, filters],
  );

  const displayFinance = useMemo(() => {
    const agg = aggregateFinanceFromRows(filteredRows);
    if (agg) return agg;
    return financeStatsApi
      ? {
          ...financeStatsApi,
          collection_pending_inr: financeStatsApi.collection_pending_inr ?? 0,
        }
      : null;
  }, [filteredRows, financeStatsApi]);

  const { revenue: yoyRev, cm: yoyCm } = useMemo(
    () => buildYoYRevenueSeries(filteredRows, selectedFyStart),
    [filteredRows, selectedFyStart],
  );

  const priorFYTotalCr = useMemo(() => sumPriorFYActual(yoyRev), [yoyRev]);

  const regional = useMemo(
    () => buildRegionalRevenue(filteredRows, projects),
    [filteredRows, projects],
  );

  const execRows = useMemo(() => {
    if (!displayFinance) return [];
    const f = {
      revenue_budget_inr: displayFinance.revenue_budget_inr,
      revenue_actual_inr: displayFinance.revenue_actual_inr,
      total_cm_inr: displayFinance.total_cm_inr,
      total_unbilled_inr: displayFinance.total_unbilled_inr,
      total_bad_debt_inr: displayFinance.total_bad_debt_inr,
      total_collected_inr: displayFinance.total_collected_inr,
      total_collection_target_inr: displayFinance.total_collection_target_inr,
      rev_attainment: displayFinance.rev_attainment,
    };
    return buildExecutiveSummary(f, priorFYTotalCr);
  }, [displayFinance, priorFYTotalCr]);

  const projectStats = monitor?.project_stats || [];
  const riskRows = useMemo(
    () =>
      projectStats
        .map((p) => {
          const score = realComposite(p);
          const risk = score < 50 ? "HIGH" : score < 70 ? "MED" : "OK";
          return { ...p, risk, score };
        })
        .sort((a, b) => b.score - a.score),
    [projectStats],
  );

  const interventions = useMemo(() => riskRows.filter((r) => r.risk !== "OK").slice(0, 5), [riskRows]);
  const outliers = useMemo(() => riskRows.filter((r) => r.risk === "OK").slice(0, 4), [riskRows]);
  const selectedClient = riskRows.find((r) => r.name === drawerClient);

  const revActualCr = (displayFinance?.revenue_actual_inr ?? 0) / 1e7;
  const revBudgetCr = (displayFinance?.revenue_budget_inr ?? 0) / 1e7;
  const cmPct =
    displayFinance && displayFinance.revenue_actual_inr > 0
      ? (displayFinance.total_cm_inr / displayFinance.revenue_actual_inr) * 100
      : 0;
  const unb = displayFinance?.total_unbilled_inr ?? 0;
  const bd = displayFinance?.total_bad_debt_inr ?? 0;
  const coll = displayFinance?.total_collected_inr ?? 0;
  const ct = displayFinance?.total_collection_target_inr ?? 0;
  const revA = displayFinance?.revenue_actual_inr ?? 0;
  const unbPctRev = revA > 0 ? (unb / revA) * 100 : 0;
  const bdPctColl = coll > 0 ? (bd / coll) * 100 : 0;
  const collAtt = ct > 0 ? (coll / ct) * 100 : 0;

  const priorFyLabel = `${fyShortLabel(selectedFyStart - 1)} Actual`;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <PageHeader
          title="Executive Overview"
          subtitle={`Live view · ${stats?.total_projects ?? "—"} clients · ${reqKpis?.total_records?.toLocaleString() ?? stats?.total_records?.toLocaleString() ?? "—"} requisitions · Finance · SLA · WFM`}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Compare FY</span>
          <button
            type="button"
            className={`platform-chip${fyCompare ? " active" : ""}`}
            onClick={() => setFyCompare(!fyCompare)}
          >
            {fyCompare ? "YoY: On" : "YoY: Off"}
          </button>
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
            {fyYears.length === 0 && (
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Upload finance data for FY chips</span>
            )}
          </div>
        </div>
      </div>

      {coreError && <div className="alert-banner red">{coreError}</div>}

      <DashboardFilters value={filters} onChange={setFilters} projects={projects} />

      {/* KPI DECK — match exec reference cards */}
      {loadingCore ? (
        <SkeletonKpiRow count={8} />
      ) : (
        <div className="exec-kpi-deck">
          <ExecutiveKpiCard
            title="Revenue — Actual"
            accent="orange"
            primary={formatLargeCurrency(displayFinance?.revenue_actual_inr ?? 0)}
            sublines={[
              { label: "Budget", value: formatLargeCurrency(displayFinance?.revenue_budget_inr ?? 0) },
              { label: "Attainment", value: formatPercent(displayFinance?.rev_attainment ?? 0), tone: (displayFinance?.rev_attainment ?? 0) >= 100 ? "green" : "amber" },
            ]}
            footer={drilldown[0] ? [{ label: "Top HM (rev)", value: drilldown[0].name }] : []}
          />
          <ExecutiveKpiCard
            title="CM % — Actual"
            accent="teal"
            primary={formatPercent(cmPct)}
            sublines={[
              { label: "vs ref 35%", value: formatPercent(cmPct - 35), tone: cmPct >= 35 ? "green" : "amber" },
            ]}
          />
          <ExecutiveKpiCard
            title="Collection — Actual"
            accent="teal"
            primary={formatLargeCurrency(coll)}
            sublines={[
              { label: "Target", value: formatLargeCurrency(ct) },
              { label: "Attainment", value: formatPercent(collAtt), tone: collAtt >= 90 ? "green" : "amber" },
            ]}
            footer={[{ label: "Pending", value: formatLargeCurrency(displayFinance?.collection_pending_inr ?? Math.max(0, ct - coll)) }]}
          />
          <ExecutiveKpiCard
            title="Unbilled & Bad debt"
            accent="red"
            primary={formatLargeCurrency(unb + bd)}
            sublines={[
              { label: "Unbilled", value: `${formatPercent(unbPctRev)} of Rev` },
              { label: "Bad debt", value: formatLargeCurrency(bd) },
            ]}
            footer={[
              { label: "Bad debt", value: formatLargeCurrency(bd) },
              { label: "% of Coll.", value: formatPercent(bdPctColl) },
            ]}
          />
          <ExecutiveKpiCard
            title="SLA portfolio"
            accent="blue"
            primary={slaStats ? formatPercent(slaStats.portfolio_health) : "—"}
            sublines={[{ label: "Met / not met", value: `${slaStats?.met_count ?? "—"} / ${slaStats?.not_met_count ?? "—"}` }]}
          />
          <ExecutiveKpiCard
            title="Headcount — WFM"
            accent="green"
            primary={wfmStats ? `${Math.round(wfmStats.total_actual_hc ?? 0)}` : "—"}
            sublines={[
              { label: "Ideal HC", value: wfmStats ? String(Math.round(wfmStats.total_ideal_hc ?? 0)) : "—" },
              { label: "Fill rate", value: wfmStats ? formatPercent(wfmStats.capacity_fill_rate ?? 0) : "—" },
            ]}
          />
          <ExecutiveKpiCard
            title="Pipeline — Reqs"
            accent="amber"
            primary={reqKpis ? `${reqKpis.open_req.toLocaleString()} open` : "—"}
            sublines={[
              { label: "Offer stage", value: reqKpis ? reqKpis.offer_req.toLocaleString() : "—" },
              { label: "Joiners (closed)", value: reqKpis ? reqKpis.joiners.toLocaleString() : "—", tone: "green" },
            ]}
          />
          <ExecutiveKpiCard
            title="Active clients"
            accent="blue"
            primary={stats?.total_projects ?? "—"}
            sublines={[{ label: "Total positions", value: monitor?.total_positions?.toLocaleString() ?? "—" }]}
          />
        </div>
      )}

      <ProductivityAveragesSection rows={filteredRows} loading={loadingCore} externalFilters />

      {/* CHARTS — YoY */}
      <div className="platform-grid-2">
        <PlatformSection title={`Monthly Revenue — Actual vs Budget vs Forecast${fyCompare ? ` vs ${priorFyLabel}` : ""}`}>
          {yoyRev.length === 0 || !filteredRows.length ? (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 11 }}>
              No finance rows for current filters
            </div>
          ) : (
            <ExecutiveRevenueYoYChart
              data={fyCompare ? yoyRev : yoyRev.map((p) => ({ ...p, priorActual: 0 }))}
              priorLabel={priorFyLabel}
            />
          )}
        </PlatformSection>
        <PlatformSection title={`CM% — Actual vs ${priorFyLabel.replace(" Actual", "")}`}>
          {yoyCm.length === 0 || !filteredRows.length ? (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 11 }}>
              No CM data
            </div>
          ) : (
            <ExecutiveCmYoYChart data={fyCompare ? yoyCm : yoyCm.map((p) => ({ ...p, priorActualPct: 0 }))} />
          )}
        </PlatformSection>
      </div>

      <div className="platform-grid-2">
        <PlatformSection title="Revenue by Region — Actual vs Budget">
          <RegionalRevenueBarChart data={regional} />
        </PlatformSection>
        <PlatformSection title="Hiring pipeline (tracker)">
          {reqKpis ? (
            <div style={{ padding: "8px 0" }}>
              {(() => {
                const maxBar = Math.max(reqKpis.open_req, reqKpis.offer_req, reqKpis.joiners, 1);
                return (
              <div style={{ display: "flex", gap: 12, alignItems: "flex-end", height: 160, justifyContent: "space-around" }}>
                {[
                  { k: "Open", v: reqKpis.open_req, c: "var(--accent)" },
                  { k: "Offer", v: reqKpis.offer_req, c: "var(--amber)" },
                  { k: "Joiners", v: reqKpis.joiners, c: "var(--green)" },
                ].map((b) => (
                  <div key={b.k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div style={{
                      width: 56,
                      height: Math.max(8, Math.min(120, (b.v / maxBar) * 120)),
                      background: b.c,
                      borderRadius: 6,
                      opacity: 0.85,
                    }} />
                    <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "var(--text-muted)" }}>{b.k}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{b.v.toLocaleString()}</div>
                  </div>
                ))}
              </div>
                );
              })()}
              <div style={{ fontSize: 9, color: "var(--text-subtle)", marginTop: 8, fontFamily: "'DM Mono',monospace" }}>
                Taggd vs non-Taggd monthly joiners require finance sheet ingest (future).
              </div>
            </div>
          ) : (
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
          )}
        </PlatformSection>
      </div>

      {/* Executive summary table */}
      <PlatformSection title="Executive summary" action="Export">
        {execRows.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 11 }}>
            Upload finance data to populate this table
          </div>
        ) : (
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Budget</th>
                  <th>Forecast</th>
                  <th>Actual</th>
                  <th>Var vs Budget</th>
                  <th>Var vs Fcst</th>
                  <th>{priorFyLabel}</th>
                  <th>YoY</th>
                </tr>
              </thead>
              <tbody>
                {execRows.map((row) => (
                  <tr key={row.metric}>
                    <td style={{ fontWeight: 600 }}>{row.metric}</td>
                    <td>{row.budget}</td>
                    <td>{row.forecast}</td>
                    <td>{row.actual}</td>
                    <td>{row.varBudget}</td>
                    <td>{row.varForecast}</td>
                    <td>{row.priorActual}</td>
                    <td>{row.yoy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PlatformSection>

      {/* Risk + drilldown */}
      <div className="platform-grid-7-5">
        <PlatformSection title="Key insights — Drilldown (HM)" action="Clients">
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8, fontFamily: "'DM Mono',monospace" }}>
            Top hiring managers by revenue (tracker)
          </div>
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead><tr><th>HM</th><th>Revenue</th><th>Reqs</th></tr></thead>
              <tbody>
                {drilldown.slice(0, 8).map((d) => (
                  <tr key={d.name}>
                    <td>{d.name}</td>
                    <td style={{ fontFamily: "'DM Mono',monospace" }}>{formatCurrency(d.revenue)}</td>
                    <td>{d.count}</td>
                  </tr>
                ))}
                {drilldown.length === 0 && (
                  <tr><td colSpan={3} style={{ color: "var(--text-muted)", textAlign: "center" }}>—</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </PlatformSection>

        <PlatformSection title="Risk heatmap · Client" action="Full view" onAction={() => setHeatmapFullOpen(true)}>
          <div className="platform-table-wrap">
            {loadingCore ? <SkeletonTable rows={6} cols={5} /> : null}
            <table className="platform-table" style={{ display: loadingCore ? "none" : undefined }}>
              <thead>
                <tr><th>Client</th><th>Finance</th><th>SLA</th><th>WFM</th><th>Hiring</th></tr>
              </thead>
              <tbody>
                {riskRows.slice(0, 7).map((p) => {
                  const revPerReq = p.positions > 0 ? p.revenue / p.positions : 0;
                  const fin = revPerReq > 200_000 ? "green" : revPerReq > 80_000 ? "amber" : "red";
                  const holdPct = p.positions > 0 ? (p.on_hold / p.positions) * 100 : 0;
                  const sla = holdPct < 15 ? "green" : holdPct < 30 ? "amber" : "red";
                  const actPct = p.positions > 0 ? ((p.closed + p.active) / p.positions) * 100 : 0;
                  const wfm = actPct >= 80 ? "green" : actPct >= 60 ? "amber" : "red";
                  const fillPct = p.positions > 0 ? (p.closed / p.positions) * 100 : 0;
                  const hiring = fillPct >= 70 ? "green" : fillPct >= 45 ? "amber" : "red";
                  return (
                    <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setDrawerClient(p.name)}>
                      <td>{p.name}</td>
                      {[fin, sla, wfm, hiring].map((c, i) => (
                        <td key={i}>
                          <span className={`platform-badge ${c}`}>{c === "green" ? "OK" : c === "amber" ? "MED" : "HIGH"}</span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {riskRows.length === 0 && (
                  <tr><td colSpan={5} style={{ color: "var(--text-muted)", textAlign: "center", padding: 20 }}>No client data yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </PlatformSection>
      </div>

      <div className="platform-grid-2">
        <PlatformSection title="Interventions" onAction={() => setHeatmapFullOpen(true)}>
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead><tr><th>Client</th><th>Score</th><th>Weak</th></tr></thead>
              <tbody>
                {interventions.map((p) => (
                  <tr key={p.id} onClick={() => setDrawerClient(p.name)} style={{ cursor: "pointer" }}>
                    <td>{p.name}</td>
                    <td><RiskBar score={p.score} color={p.score < 50 ? "var(--red)" : "var(--amber)"} /></td>
                    <td><StatusTag status={worstDomain(p)} /></td>
                  </tr>
                ))}
                {interventions.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)" }}>None</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </PlatformSection>
        <PlatformSection title="Outliers">
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead><tr><th>Client</th><th>Score</th></tr></thead>
              <tbody>
                {outliers.map((p) => (
                  <tr key={p.id} onClick={() => setDrawerClient(p.name)} style={{ cursor: "pointer" }}>
                    <td>{p.name}</td>
                    <td><RiskBar score={p.score} color="var(--green)" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PlatformSection>
      </div>

      <PlatformDrawer open={Boolean(drawerClient)} title={`◎ ${drawerClient}`} onClose={() => setDrawerClient(null)}>
        {selectedClient && (
          <div style={{ display: "grid", gap: 12 }}>
            <div className="drawer-section">
              <div className="drawer-section-title">Account</div>
              <div className="kv-row"><span className="kv-key">Client</span><span className="kv-val">{selectedClient.name}</span></div>
              <div className="kv-row"><span className="kv-key">Positions</span><span className="kv-val">{selectedClient.positions}</span></div>
              <div className="kv-row"><span className="kv-key">Revenue</span><span className="kv-val">{formatCurrency(selectedClient.revenue)}</span></div>
            </div>
          </div>
        )}
      </PlatformDrawer>

      <PlatformDrawer open={heatmapFullOpen} title="Risk heatmap — all clients" onClose={() => setHeatmapFullOpen(false)} width={720}>
        <div className="platform-table-wrap" style={{ maxHeight: "70vh" }}>
          <table className="platform-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Composite</th>
              </tr>
            </thead>
            <tbody>
              {riskRows.map((p) => (
                <tr key={p.id} onClick={() => { setHeatmapFullOpen(false); setDrawerClient(p.name); }} style={{ cursor: "pointer" }}>
                  <td>{p.name}</td>
                  <td>{p.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PlatformDrawer>
    </div>
  );
};
