import React, { useEffect, useMemo, useRef, useState } from "react";
import { FinanceOverviewBarChart, FinanceCmBarChart } from "@/components/charts/components/FinanceOverviewBarChart";
import { Menu } from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { Project } from "@/lib/api";
import { financeStatsVm, type FinanceRowVm } from "@/lib/view-models/finance";
import {
  DEFAULT_DASHBOARD_FILTERS,
  filterFinanceRows,
  fiscalYearStart,
  parseMonthSort,
  sumUnbilledLatestMonthPerProject,
  type DashboardFilters,
} from "@/lib/dashboard-aggregates";
import {
  avgPpcSigmaRevMinusCmOverSigmaHc,
  avgTaggdSigmaJoinersOverSigmaWl1,
} from "@/components/platform/ProductivityAveragesSection";
import {
  AccountMetricCard,
  type AccountMetricDecoration,
} from "@/components/tremor-dashboard/AccountMetricCard";
import "@/styles/exec-dash-premium.css";
import "@/styles/finance-exec-dashboard.css";

type FinPage =
  | "overview"
  | "pnl"
  | "revenue"
  | "expense"
  | "hiring"
  | "cashflow"
  | "manual"
  | "forecast_packs";

const FY_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"] as const;

function rowFyMonthAbbr(monthRaw: string): string | null {
  const raw = (monthRaw || "").trim();
  if (!raw) return null;
  const abbr = raw.split(" ")[0].split("-")[0];
  const short = abbr.charAt(0).toUpperCase() + abbr.slice(1).toLowerCase();
  return (FY_MONTHS as readonly string[]).includes(short) ? short : null;
}

function cleanDimensionLabel(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s || /^nan$/i.test(s)) return null;
  return s;
}

type FinanceStats = ReturnType<typeof financeStatsVm>;

function aggregateStatsFromRows(rs: FinanceRowVm[]): FinanceStats {
  const revenue_budget_inr = rs.reduce((a, r) => a + (r.rev_budget_inr ?? 0), 0);
  const revenue_forecast_inr = rs.reduce((a, r) => a + (r.rev_forecast_inr ?? 0), 0);
  const revenue_actual_inr = rs.reduce((a, r) => a + (r.rev_actual_inr ?? 0), 0);
  const total_cm_inr = rs.reduce((a, r) => a + (r.cm_actual_inr ?? 0), 0);
  const total_unbilled_inr = sumUnbilledLatestMonthPerProject(rs);
  const total_collected_inr = rs.reduce((a, r) => a + (r.collected_inr ?? 0), 0);
  const total_bad_debt_inr = rs.reduce((a, r) => a + (r.bad_debt_inr ?? 0), 0);
  const total_collection_target_inr = rs.reduce((a, r) => a + (r.collection_target_inr ?? 0), 0);
  const collection_pending_inr = rs.reduce((a, r) => a + (r.collection_pending_inr ?? 0), 0);
  const rev_attainment = revenue_budget_inr > 0 ? (revenue_actual_inr / revenue_budget_inr) * 100 : 0;
  const collection_efficiency =
    total_collection_target_inr > 0 ? (total_collected_inr / total_collection_target_inr) * 100 : 0;
  return {
    revenue_budget_inr,
    revenue_forecast_inr,
    revenue_actual_inr,
    total_cm_inr,
    total_unbilled_inr,
    total_collected_inr,
    total_bad_debt_inr,
    total_collection_target_inr,
    collection_pending_inr,
    rev_attainment,
    collection_efficiency,
  };
}

function trendFromRows(rows: FinanceRowVm[]): { month: string; budget: number; actual: number; forecast: number }[] {
  const monthly: Record<string, { budget: number; actual: number; forecast: number }> = {};
  for (const r of rows) {
    const short = rowFyMonthAbbr(r.month ?? "");
    if (!short) continue;
    if (!monthly[short]) monthly[short] = { budget: 0, actual: 0, forecast: 0 };
    monthly[short].budget += (r.rev_budget_inr ?? 0) / 1e7;
    monthly[short].actual += (r.rev_actual_inr ?? 0) / 1e7;
    monthly[short].forecast += (r.rev_forecast_inr ?? 0) / 1e7;
  }
  return FY_MONTHS.filter((m) => monthly[m]).map((m) => ({
    month: m,
    budget: +monthly[m].budget.toFixed(2),
    actual: +monthly[m].actual.toFixed(2),
    forecast: +monthly[m].forecast.toFixed(2),
  }));
}

const NAV: { id: FinPage; label: string; icon: string }[] = [
  { id: "overview", label: "Executive Overview", icon: "fa-gauge-high" },
  { id: "pnl", label: "P&L Statement", icon: "fa-file-invoice-dollar" },
  { id: "revenue", label: "Revenue Analysis", icon: "fa-chart-line" },
  { id: "expense", label: "Expense & CM", icon: "fa-percent" },
  { id: "hiring", label: "Hiring Analysis", icon: "fa-user-plus" },
  { id: "cashflow", label: "Collections & Cash", icon: "fa-money-bill-trend-up" },
  { id: "manual", label: "User Manual", icon: "fa-book-open" },
  { id: "forecast_packs", label: "Forecast packs", icon: "fa-layer-group" },
];

function fmtCr(inr: number | null | undefined): string {
  const v = (inr ?? 0) / 1e7;
  return `₹${v.toFixed(2)} Cr`;
}

/** Indian FY label: start year 2025 → FY25–26 (Apr–Mar). */
function fyShortLabel(start: number): string {
  return `FY${String(start).slice(2)}–${String(start + 1).slice(2)}`;
}

const FIN_KPI_DECORATION: Record<
  "t-blue" | "t-green" | "t-purple" | "t-teal" | "t-dpurple" | "t-orange" | "t-cyan" | "t-red",
  AccountMetricDecoration
> = {
  "t-blue": "blue",
  "t-green": "emerald",
  "t-purple": "blue",
  "t-teal": "teal",
  "t-dpurple": "amber",
  "t-orange": "orange",
  "t-cyan": "teal",
  "t-red": "rose",
};

function FinanceKpiCard(props: {
  theme: keyof typeof FIN_KPI_DECORATION;
  label: string;
  value: string;
  targetLine: string;
  hint?: string;
}) {
  const { theme, label, value, targetLine, hint } = props;
  const subtext = targetLine && targetLine !== "—" ? targetLine : undefined;
  return (
    <AccountMetricCard
      eyebrow={label}
      decorationColor={FIN_KPI_DECORATION[theme]}
      value={value}
      hint={hint}
      subtext={subtext}
    />
  );
}

export type FinanceExecDashboardProps = {
  stats: ReturnType<typeof financeStatsVm> | null;
  /** Project directory — same as Executive Overview; drives `filterFinanceRows` vertical/account/region resolution. */
  projects: Project[];
  rows: FinanceRowVm[];
  trendData: { month: string; budget: number; actual: number; forecast: number }[];
  waterfallItems: { label: string; value: number; color: string; isTotal: boolean }[];
  loading: boolean;
  onUpload: (file?: File | null) => void;
  onOpenLedgerDialog: () => void;
  onNavigateForecastPacks: () => void;
};

export function FinanceExecDashboard({
  stats,
  projects,
  rows,
  trendData: _trendData,
  waterfallItems,
  loading,
  onUpload,
  onOpenLedgerDialog,
  onNavigateForecastPacks,
}: FinanceExecDashboardProps) {
  const [page, setPage] = useState<FinPage>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [quarter, setQuarter] = useState<"ALL" | "Q1" | "Q2" | "Q3" | "Q4">("ALL");
  /** "all" = every FY in ledger; otherwise Apr–Mar FY start year (calendar year of April). */
  const [fyFilter, setFyFilter] = useState<number | "all">("all");
  const fyAutoPicked = useRef(false);
  const [region, setRegion] = useState<string>("");
  const [vertical, setVertical] = useState<string>("");
  const [account, setAccount] = useState<string>("");
  /** Expense & CM chart: aggregated series only (avoids hundreds of ledger points on one axis). */
  const [cmExpenseView, setCmExpenseView] = useState<"month" | "accounts">("month");

  useEffect(() => {
    const id = "finance-dashboard-fa";
    if (document.getElementById(id)) return;
    const l = document.createElement("link");
    l.id = id;
    l.rel = "stylesheet";
    l.href = "/finance-dashboard/css/fontawesome.min.css";
    document.head.appendChild(l);
    return () => {
      const x = document.getElementById(id);
      if (x) x.remove();
    };
  }, []);

  const fyYears = useMemo(() => {
    const s = new Set<number>();
    for (const r of rows) {
      const d = parseMonthSort(r.month_sort);
      if (d) s.add(fiscalYearStart(d));
    }
    return Array.from(s).sort((a, b) => b - a);
  }, [rows]);

  useEffect(() => {
    if (fyAutoPicked.current || fyYears.length === 0) return;
    setFyFilter(fyYears[0]);
    fyAutoPicked.current = true;
  }, [fyYears]);

  useEffect(() => {
    if (fyFilter !== "all" && fyYears.length > 0 && !fyYears.includes(fyFilter)) {
      setFyFilter(fyYears[0] ?? "all");
    }
  }, [fyYears, fyFilter]);

  /** Same pipeline as Executive Overview `Dashboard.tsx`: `filterFinanceRows` → FY slice (`kpiRows`). */
  const execScopeRows = useMemo(() => {
    const df: DashboardFilters = {
      ...DEFAULT_DASHBOARD_FILTERS,
      vertical: vertical || "all",
      account: account || "all",
      period: quarter === "ALL" ? "all" : quarter,
    };
    let out = filterFinanceRows(rows, projects, df);
    const reg = region.trim();
    if (reg) {
      out = out.filter(
        (r) => (r.practice_head || "") === reg || (r.project_head || "") === reg,
      );
    }
    return out;
  }, [rows, projects, vertical, account, quarter, region]);

  const filteredRows = useMemo(() => {
    return execScopeRows.filter((r) => {
      if (fyFilter !== "all") {
        const d = parseMonthSort(r.month_sort);
        if (!d || fiscalYearStart(d) !== fyFilter) return false;
      }
      return true;
    });
  }, [execScopeRows, fyFilter]);

  const verticalOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const v = cleanDimensionLabel(r.vertical);
      if (v) s.add(v);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const accountOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const a = cleanDimensionLabel(r.account_name);
      if (a) s.add(a);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const regionOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const ph = cleanDimensionLabel(r.practice_head);
      const pj = cleanDimensionLabel(r.project_head);
      if (ph) s.add(ph);
      if (pj) s.add(pj);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const hasActiveFilters =
    fyFilter !== "all" ||
    quarter !== "ALL" ||
    Boolean(vertical.trim()) ||
    Boolean(account.trim()) ||
    Boolean(region.trim());

  const displayStats = useMemo((): FinanceStats | null => {
    if (!hasActiveFilters) return stats;
    if (!filteredRows.length) return null;
    return aggregateStatsFromRows(filteredRows);
  }, [hasActiveFilters, stats, filteredRows]);

  const chartTrendData = useMemo(() => trendFromRows(filteredRows), [filteredRows]);

  const cmPctActual =
    displayStats && displayStats.revenue_actual_inr > 0
      ? ((displayStats.total_cm_inr ?? 0) / displayStats.revenue_actual_inr) * 100
      : null;

  const cmPctMonthlySeries = useMemo(() => {
    const agg: Record<string, { cm: number; rev: number }> = {};
    for (const r of filteredRows) {
      const m = rowFyMonthAbbr(r.month ?? "");
      if (!m) continue;
      if (!agg[m]) agg[m] = { cm: 0, rev: 0 };
      agg[m].cm += r.cm_actual_inr ?? 0;
      agg[m].rev += r.rev_actual_inr ?? 0;
    }
    const out: { label: string; pct: number }[] = [];
    for (const m of FY_MONTHS) {
      const a = agg[m];
      if (!a || a.rev <= 0) continue;
      out.push({ label: m, pct: (a.cm / a.rev) * 100 });
    }
    return out;
  }, [filteredRows]);

  const cmPctByAccountSeries = useMemo(() => {
    const agg: Record<string, { cm: number; rev: number }> = {};
    for (const r of filteredRows) {
      const name = cleanDimensionLabel(r.account_name) || "—";
      if (!agg[name]) agg[name] = { cm: 0, rev: 0 };
      agg[name].cm += r.cm_actual_inr ?? 0;
      agg[name].rev += r.rev_actual_inr ?? 0;
    }
    return Object.entries(agg)
      .map(([name, v]) => ({
        name,
        pct: v.rev > 0 ? (v.cm / v.rev) * 100 : 0,
        rev: v.rev,
      }))
      .filter((x) => x.rev > 0)
      .sort((a, b) => b.rev - a.rev)
      .slice(0, 10);
  }, [filteredRows]);

  /** Identical definitions to `ProductivityAveragesSection` on Executive Overview (FY + toolbar slice). */
  const taggdProd = useMemo(() => avgTaggdSigmaJoinersOverSigmaWl1(filteredRows), [filteredRows]);
  const ppcPortfolio = useMemo(() => avgPpcSigmaRevMinusCmOverSigmaHc(filteredRows), [filteredRows]);
  const revProdMean = useMemo(() => {
    const vals: number[] = [];
    for (const r of filteredRows) {
      const v = r.revenue_productivity_inr;
      if (v != null && Number.isFinite(v)) vals.push(v);
    }
    if (!vals.length) return { mean: null as number | null, count: 0 };
    return { mean: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length };
  }, [filteredRows]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="fin-dash-loading-overlay" style={{ position: "relative", minHeight: 200 }}>
          <div className="spinner" />
          <div className="loading-txt">Loading…</div>
        </div>
      );
    }

    if (page === "overview") {
      return (
        <>
          <div className="kpi-grid-8">
            <FinanceKpiCard
              theme="t-blue"
              label="Revenue — Actual"
              value={displayStats ? fmtCr(displayStats.revenue_actual_inr) : "—"}
              hint={
                displayStats && displayStats.revenue_budget_inr > 0
                  ? `${displayStats.rev_attainment.toFixed(1)}% of budget`
                  : undefined
              }
              targetLine={
                displayStats
                  ? `Budget: ${fmtCr(displayStats.revenue_budget_inr)}${hasActiveFilters ? " · slice" : " · Live ledger"}`
                  : "—"
              }
            />
            <FinanceKpiCard
              theme="t-green"
              label="CM % — Actual"
              value={cmPctActual != null ? `${cmPctActual.toFixed(2)}%` : "—"}
              targetLine={displayStats ? `CM: ${formatCurrency(displayStats.total_cm_inr ?? 0)}` : "—"}
            />
            <FinanceKpiCard
              theme="t-purple"
              label="PPC / Person / Month"
              value={ppcPortfolio.value != null ? formatCurrency(ppcPortfolio.value) : "—"}
              targetLine={
                ppcPortfolio.sumHc > 0
                  ? `Σ(Rev − CM) ÷ Σ HC · ${ppcPortfolio.rowCount} client-months`
                  : "Σ overall HC is 0 in scope"
              }
            />
            <FinanceKpiCard
              theme="t-teal"
              label="Rev productivity"
              value={revProdMean.mean != null ? formatCurrency(revProdMean.mean) : "—"}
              targetLine={
                revProdMean.count
                  ? `Mean of ${revProdMean.count} Rev/WL1 values (Executive Overview)`
                  : "No Rev/WL1 values in scope"
              }
            />
            <FinanceKpiCard
              theme="t-dpurple"
              label="Taggd joiner productivity"
              value={taggdProd.value != null ? `${taggdProd.value.toFixed(2)} J/HC` : "—"}
              targetLine={
                taggdProd.value != null && taggdProd.sumWl1 > 0
                  ? `Σ ${taggdProd.sumJoiners.toLocaleString(undefined, { maximumFractionDigits: 2 })} joiners · Σ ${taggdProd.sumWl1.toLocaleString(undefined, { maximumFractionDigits: 2 })} WL1 · ${taggdProd.rowCount} client-months`
                  : taggdProd.rowCount === 0
                    ? "No rows in scope"
                    : "Σ WL1 HC is 0 in scope"
              }
            />
            <FinanceKpiCard
              theme="t-orange"
              label="Headcount (WL1 Σ)"
              value={
                taggdProd.sumWl1 > 0
                  ? taggdProd.sumWl1.toLocaleString("en-IN", { maximumFractionDigits: 2 })
                  : "—"
              }
              targetLine="Same Σ WL1 as Taggd productivity tile"
            />
            <FinanceKpiCard
              theme="t-cyan"
              label="Collection — Actual"
              value={displayStats ? fmtCr(displayStats.total_collected_inr) : "—"}
              hint={
                displayStats && displayStats.total_collection_target_inr > 0
                  ? `${formatPercent(displayStats.collection_efficiency ?? 0)} collection efficiency`
                  : undefined
              }
              targetLine={
                displayStats
                  ? `Target: ${fmtCr(displayStats.total_collection_target_inr)} · Eff: ${formatPercent(displayStats.collection_efficiency ?? 0)}`
                  : "—"
              }
            />
            <FinanceKpiCard
              theme="t-red"
              label="Unbilled & Bad Debt"
              value={
                displayStats
                  ? fmtCr((displayStats.total_unbilled_inr ?? 0) + (displayStats.total_bad_debt_inr ?? 0))
                  : "—"
              }
              targetLine={
                displayStats
                  ? `Unbilled ${formatCurrency(displayStats.total_unbilled_inr ?? 0)} · Bad debt ${formatCurrency(displayStats.total_bad_debt_inr ?? 0)}`
                  : "—"
              }
            />
          </div>

          <div className="card g1">
            <div className="card-hd">
              <div>
                <div className="card-title">Budget vs Actual (Monthly) — ₹ Lakhs</div>
                <div className="card-sub">
                  {hasActiveFilters ? "Built from filtered ledger rows." : "Same series as legacy Finance Command overview."}
                </div>
              </div>
            </div>
            <div className="card-body" style={{ height: 280 }}>
              {chartTrendData.length ? (
                <FinanceOverviewBarChart
                  months={chartTrendData.map((d) => d.month)}
                  budget={chartTrendData.map((d) => d.budget)}
                  actual={chartTrendData.map((d) => d.actual)}
                  forecast={chartTrendData.map((d) => d.forecast)}
                  height={280}
                />
              ) : (
                <div className="kpi-tile-no-data">
                  {rows.length ? "No rows match these filters." : "No monthly rows — upload Finance Excel."}
                </div>
              )}
            </div>
          </div>

          {waterfallItems.length > 0 ? (
            <div className="card g1">
              <div className="card-hd">
                <div className="card-title">Forecast bridge (₹ Cr)</div>
              </div>
              <div className="card-body">
                <table className="dt">
                  <tbody>
                    {waterfallItems.map((w) => (
                      <tr key={w.label}>
                        <td className="l">{w.label}</td>
                        <td style={{ fontWeight: w.isTotal ? 700 : 400, color: w.color }}>{w.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      );
    }

    if (page === "pnl") {
      return (
        <div className="card g1">
          <div className="card-hd">
            <div className="card-title">P&amp;L — monthly roll-up (filtered)</div>
            <div className="card-sub">Revenue and CM from finance ledger.</div>
          </div>
          <div className="card-body np" style={{ overflowX: "auto" }}>
            <table className="dt" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th className="l">Month</th>
                  <th>Budget ₹</th>
                  <th>Forecast ₹</th>
                  <th>Actual ₹</th>
                  <th>CM ₹</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="l">
                      No rows.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr key={`${r.id}-${r.month}`}>
                      <td className="l">{r.month}</td>
                      <td>{formatCurrency(r.rev_budget_inr)}</td>
                      <td>{formatCurrency(r.rev_forecast_inr)}</td>
                      <td>{formatCurrency(r.rev_actual_inr)}</td>
                      <td>{formatCurrency(r.cm_actual_inr)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (page === "revenue") {
      return (
        <div className="card g1">
          <div className="card-hd">
            <div className="card-title">Revenue by account</div>
          </div>
          <div className="card-body np" style={{ overflowX: "auto" }}>
            <table className="dt">
              <thead>
                <tr>
                  <th className="l">Account</th>
                  <th>Vertical</th>
                  <th>Actual ₹</th>
                  <th>Budget ₹</th>
                </tr>
              </thead>
              <tbody>
                {[...new Map(filteredRows.map((r) => [r.account_name, r])).values()].map((r) => (
                  <tr key={r.account_name}>
                    <td className="l">{r.account_name}</td>
                    <td>{r.vertical}</td>
                    <td>{formatCurrency(r.rev_actual_inr)}</td>
                    <td>{formatCurrency(r.rev_budget_inr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (page === "expense") {
      const monthData = cmPctMonthlySeries;
      const accountData = cmPctByAccountSeries;
      const showMonth = cmExpenseView === "month";
      const labels = showMonth
        ? monthData.map((p) => p.label)
        : accountData.map((p) => (p.name.length > 16 ? `${p.name.slice(0, 14)}…` : p.name));
      const values = showMonth ? monthData.map((p) => p.pct) : accountData.map((p) => p.pct);

      return (
        <div className="card g1">
          <div className="card-hd">
            <div>
              <div className="card-title">Contribution margin</div>
              <div className="card-sub">
                Revenue-weighted CM % (Σ CM ÷ Σ revenue). Respects period, vertical, account, and practice filters above — pick
                an account to drill in.
              </div>
            </div>
            <div className="fin-cm-chart-toggle">
              <span className="fin-cm-chart-toggle__lbl">View</span>
              <button
                type="button"
                className={`btn btn-outline${showMonth ? " active" : ""}`}
                onClick={() => setCmExpenseView("month")}
              >
                By month
              </button>
              <button
                type="button"
                className={`btn btn-outline${!showMonth ? " active" : ""}`}
                onClick={() => setCmExpenseView("accounts")}
              >
                Top accounts
              </button>
            </div>
          </div>
          <div className="card-body" style={{ height: 320 }}>
            {filteredRows.length === 0 ? (
              <div className="kpi-tile-no-data">No rows for these filters.</div>
            ) : labels.length === 0 ? (
              <div className="kpi-tile-no-data">No CM / revenue totals to chart for this slice.</div>
            ) : (
              <FinanceCmBarChart labels={labels} values={values} height={320} />
            )}
          </div>
        </div>
      );
    }

    if (page === "hiring") {
      return (
        <div className="card g1">
          <div className="card-hd">
            <div className="card-title">Hiring / joiners (ledger)</div>
          </div>
          <div className="card-body np">
            <table className="dt">
              <thead>
                <tr>
                  <th className="l">Month</th>
                  <th>Account</th>
                  <th>Taggd joiners</th>
                  <th>WL1 HC</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 200).map((r) => (
                  <tr key={`${r.id}-h`}>
                    <td className="l">{r.month}</td>
                    <td>{r.account_name}</td>
                    <td>{r.taggd_joiners ?? "—"}</td>
                    <td>{r.actual_headcount_wl1 ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (page === "cashflow") {
      return (
        <div className="kpi-grid">
          <FinanceKpiCard
            theme="t-green"
            label="Collected"
            value={displayStats ? formatCurrency(displayStats.total_collected_inr ?? 0) : "—"}
            targetLine={hasActiveFilters ? "Filtered slice" : "From finance stats"}
          />
          <FinanceKpiCard
            theme="t-blue"
            label="Collection target"
            value={displayStats ? formatCurrency(displayStats.total_collection_target_inr ?? 0) : "—"}
            targetLine="—"
          />
          <FinanceKpiCard
            theme="t-orange"
            label="Collection pending"
            value={displayStats ? formatCurrency(displayStats.collection_pending_inr ?? 0) : "—"}
            targetLine="—"
          />
          <FinanceKpiCard
            theme="t-red"
            label="Unbilled"
            value={displayStats ? formatCurrency(displayStats.total_unbilled_inr ?? 0) : "—"}
            targetLine="—"
          />
        </div>
      );
    }

    if (page === "manual") {
      return (
        <div className="info-box">
          <strong>Finance Command</strong> mirrors the Taggd executive finance shell (sidebar, filters, KPI tiles, cards).
          Upload Excel via <strong>Upload Finance</strong> or <strong>Add / edit finance data</strong>. Data is unchanged on the
          server — same APIs as before.
        </div>
      );
    }

    if (page === "forecast_packs") {
      return (
        <div className="card g1">
          <div className="card-hd">
            <div className="card-title">Weekly revenue pack approvals</div>
          </div>
          <div className="card-body">
            <p style={{ marginBottom: 14, color: "var(--g600)", fontSize: 13 }}>
              Project heads submit weekly forecast + visibility from Revenue trackers.
            </p>
            <button type="button" className="btn btn-primary" onClick={onNavigateForecastPacks}>
              Open revenue pack queue
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="finance-exec-scope">
      <div className={`fin-dash-app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <nav className={`fin-dash-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          <div className="fin-dash-nav-section">
            <div className="platform-nav-group-title">Dashboard views</div>
            {NAV.map((item) => (
              <a
                key={item.id}
                href="#"
                className={`platform-nav-item${page === item.id ? " active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  setPage(item.id);
                }}
              >
                <i className={`fas ${item.icon}`} aria-hidden />
                <span className="nav-lbl" style={{ flex: 1, minWidth: 0 }}>
                  {item.label}
                </span>
              </a>
            ))}
          </div>
          <div className="sb-foot">
            <div className="sb-foot-title">Taggd</div>
            <div className="sb-foot-sub">Executive finance UI</div>
          </div>
        </nav>

        <div className="fin-dash-main">
          <header className="fin-dash-topbar">
            <button
              type="button"
              className="fin-dash-tb-toggle"
              title="Toggle sidebar"
              aria-label="Toggle finance sidebar"
              onClick={() => setSidebarCollapsed((c) => !c)}
            >
              <Menu className="fin-dash-tb-toggle-icon" strokeWidth={2} aria-hidden />
            </button>
            <div className="tb-title platform-page-title" id="page-title">
              Finance Command
            </div>
          </header>

          <div className="fin-dash-filterbar">
            <div className="dashboard-filter-bar">
              <label className="dashboard-filter-field" style={{ minWidth: 140 }}>
                <span className="dashboard-filter-label">Fiscal year</span>
                <select
                  className="dashboard-filter-select"
                  value={fyFilter === "all" ? "all" : String(fyFilter)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFyFilter(v === "all" ? "all" : Number(v));
                  }}
                >
                  <option value="all">All FYs</option>
                  {fyYears.map((y) => (
                    <option key={y} value={y}>
                      {fyShortLabel(y)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="dashboard-filter-field fin-filter-period" style={{ flex: "1 1 260px", minWidth: 200 }}>
                <span className="dashboard-filter-label">Period</span>
                <div className="fin-period-strip">
                  {(["ALL", "Q1", "Q2", "Q3", "Q4"] as const).map((q) => (
                    <div
                      key={q}
                      className={`fb-pill q-pill ${quarter === q ? "active" : ""}`}
                      onClick={() => setQuarter(q)}
                      onKeyDown={(e) => e.key === "Enter" && setQuarter(q)}
                      role="button"
                      tabIndex={0}
                    >
                      {q === "ALL" ? "All" : q}
                    </div>
                  ))}
                </div>
              </div>
              <label className="dashboard-filter-field" style={{ minWidth: 130 }}>
                <span className="dashboard-filter-label">Vertical</span>
                <select
                  className="dashboard-filter-select"
                  value={vertical}
                  onChange={(e) => setVertical(e.target.value)}
                >
                  <option value="">All</option>
                  {verticalOptions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dashboard-filter-field" style={{ minWidth: 160, flex: "1 1 140px" }}>
                <span className="dashboard-filter-label">Account</span>
                <select className="dashboard-filter-select" value={account} onChange={(e) => setAccount(e.target.value)}>
                  <option value="">All</option>
                  {accountOptions.map((a) => (
                    <option key={a} value={a}>
                      {a.length > 40 ? `${a.slice(0, 38)}…` : a}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dashboard-filter-field" style={{ minWidth: 160, flex: "1 1 160px" }}>
                <span className="dashboard-filter-label">Practice / Region head</span>
                <select className="dashboard-filter-select" value={region} onChange={(e) => setRegion(e.target.value)}>
                  <option value="">All</option>
                  {regionOptions.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="dashboard-filter-reset"
                onClick={() => {
                  setFyFilter(fyYears[0] ?? "all");
                  setQuarter("ALL");
                  setVertical("");
                  setAccount("");
                  setRegion("");
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <div className="fin-dash-content">
            <div className="fin-dash-inline-actions">
              <button type="button" className="btn btn-primary" onClick={onOpenLedgerDialog}>
                <i className="fas fa-plus" aria-hidden />
                Add / edit finance data
              </button>
              <label className="btn btn-outline" style={{ cursor: "pointer", margin: 0 }}>
                ↑ Upload Finance
                <input type="file" hidden accept=".xlsx,.xls" onChange={(e) => onUpload(e.target.files?.[0])} />
              </label>
            </div>
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
