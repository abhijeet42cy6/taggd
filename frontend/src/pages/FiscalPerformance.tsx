import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { api, invalidateCache, queries } from "@/lib/api";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { PlatformKpi, PlatformSection, PageHeader, Tabs, KvRow } from "@/components/platform/PlatformBlocks";
import { SkeletonKpiRow, SkeletonTable } from "@/components/platform/Skeleton";
import { FinanceTrendChart, WaterfallChart } from "@/components/platform/Charts";
import { FinanceLedgerFormDialog } from "@/components/platform/FinanceLedgerFormDialog";
import { financeRowsVm, financeStatsVm, type FinanceRowVm } from "@/lib/view-models/finance";
import { ProductivityAveragesSection, fmtFinInrMetric, fmtFinRatio } from "@/components/platform/ProductivityAveragesSection";

const FY_MONTHS = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];

export function FiscalPerformance() {
  const [stats, setStats] = useState<any>(null);
  const [rows, setRows] = useState<FinanceRowVm[]>([]);
  const [waterfall, setWaterfall] = useState<any>(null);
  const [loading,   setLoading]   = useState(true);
  const [search, setSearch] = useState("");
  /** Finance Ledger tab only — scoped filters + text search */
  const [ledgerClient, setLedgerClient] = useState<string>("all");
  const [ledgerVertical, setLedgerVertical] = useState<string>("all");
  const [ledgerMonth, setLedgerMonth] = useState<string>("all");
  const [tab, setTab] = useState("Overview");
  const [financeDialogOpen, setFinanceDialogOpen] = useState(false);

  const reloadFinance = useCallback(async () => {
    invalidateCache("finance/");
    const [s, d, w] = await Promise.allSettled([
      queries.financeStats(),
      queries.financeData(),
      queries.budgetForecastWaterfall(),
    ]);
    if (s.status === "fulfilled") setStats(financeStatsVm(s.value));
    if (d.status === "fulfilled") setRows(financeRowsVm(d.value || []));
    if (w.status === "fulfilled") setWaterfall(w.value);
  }, []);

  useEffect(() => {
    (async () => {
      const [s, d, w] = await Promise.allSettled([
        queries.financeStats(),
        queries.financeData(),
        queries.budgetForecastWaterfall(),
      ]);
      if (s.status === "fulfilled") setStats(financeStatsVm(s.value));
      if (d.status === "fulfilled") setRows(financeRowsVm(d.value || []));
      if (w.status === "fulfilled") setWaterfall(w.value);
      setLoading(false);
    })();
  }, []);

  const onUpload = async (file?: File | null) => {
    if (!file) return;
    const form = new FormData(); form.append("file", file);
    await api.post("/finance/upload", form);
    await reloadFinance();
  };

  const ledgerAccountOptions = useMemo(
    () => [...new Set(rows.map((r) => r.account_name).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b))),
    [rows],
  );
  const ledgerVerticalOptions = useMemo(
    () => [...new Set(rows.map((r) => r.vertical).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b))),
    [rows],
  );
  const ledgerMonthOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: { label: string; sortKey: string }[] = [];
    for (const r of rows) {
      const label = String(r.month ?? "").trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      list.push({ label, sortKey: String(r.month_sort ?? r.month ?? label) });
    }
    list.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return list.map((x) => x.label);
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const q = search.trim().toLowerCase();
        const textOk =
          !q ||
          `${r.account_name} ${r.vertical} ${r.project_head ?? ""} ${r.practice_head ?? ""} ${r.month} ${r.month_sort ?? ""} ${r.actual_headcount_wl1 ?? ""}`
            .toLowerCase()
            .includes(q);
        const clientOk = ledgerClient === "all" || r.account_name === ledgerClient;
        const vertOk = ledgerVertical === "all" || r.vertical === ledgerVertical;
        const monthOk = ledgerMonth === "all" || r.month === ledgerMonth;
        return textOk && clientOk && vertOk && monthOk;
      }),
    [rows, search, ledgerClient, ledgerVertical, ledgerMonth],
  );

  const selectLedgerStyle: React.CSSProperties = {
    background: "var(--surface-raised)",
    border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
    color: "var(--text)",
    borderRadius: 4,
    padding: "4px 8px",
    fontSize: 10,
    fontFamily: "'DM Mono',monospace",
    maxWidth: 200,
    flex: "0 1 auto",
  };

  // Build monthly budget vs actual trend from real ledger rows
  const trendData = useMemo(() => {
    if (!rows.length) return [];
    const monthly: Record<string, { budget: number; actual: number; forecast: number }> = {};
    for (const r of rows) {
      const raw = (r.month || "").trim();
      // Backend returns month like "Mar-25" (strftime("%b-%y")).
      const abbr = raw.split(" ")[0].split("-")[0]; // => "Mar"
      const short = abbr.charAt(0).toUpperCase() + abbr.slice(1).toLowerCase();
      if (!FY_MONTHS.includes(short)) continue;
      if (!monthly[short]) monthly[short] = { budget: 0, actual: 0, forecast: 0 };
      monthly[short].budget += (r.rev_budget_inr ?? 0) / 1e7;
      monthly[short].actual += (r.rev_actual_inr  ?? 0) / 1e7;
      monthly[short].forecast += (r.rev_forecast_inr ?? 0) / 1e7;
    }
    return FY_MONTHS
      .filter((m) => monthly[m])
      .map((m) => ({
        month:    m,
        budget:   +monthly[m].budget.toFixed(2),
        actual:   +monthly[m].actual.toFixed(2),
        forecast: +monthly[m].forecast.toFixed(2),
      }));
  }, [rows]);

  // Waterfall items from real API
  const waterfallItems = useMemo(() => {
    if (!waterfall) return [];
    return [
      { label: "Opening Forecast", value: +(waterfall.opening / 1e7).toFixed(2),   color: "var(--accent)", isTotal: false },
      { label: "New Additions",    value: +(waterfall.additions / 1e7).toFixed(2),  color: "var(--green)", isTotal: false },
      { label: "Closures",         value: -(waterfall.closures  / 1e7).toFixed(2),  color: "var(--red)", isTotal: false },
      { label: "Leakage",          value: -(waterfall.leakage   / 1e7).toFixed(2),  color: "var(--red)", isTotal: false },
      { label: "Revised Forecast", value: +(waterfall.total     / 1e7).toFixed(2),  color: "var(--accent2)", isTotal: true  },
    ];
  }, [waterfall]);

  // KPI: Forecast Full-Yr = waterfall total (if available), else FY budget plan
  const forecastCr  = waterfall ? waterfall.total / 1e7 : (stats?.revenue_budget_inr ?? 0) / 1e7;
  const forecastGap = stats ? (forecastCr - (stats.revenue_budget_inr ?? 0) / 1e7) : null;

  const kpis = [
    {
      label: "Budget FY25",
      value: formatCurrency(stats?.revenue_budget_inr ?? 0),
      accent: "blue" as const,
      delta: "— Plan",
    },
    {
      label: "Actual YTD",
      value: formatCurrency(stats?.revenue_actual_inr ?? 0),
      accent: "green" as const,
      delta: "▲ Live",
    },
    {
      label: "Forecast Full-Yr",
      value: waterfall ? `₹${forecastCr.toFixed(1)}Cr` : (stats ? `₹${((stats.revenue_budget_inr ?? 0) / 1e7).toFixed(1)}Cr` : "—"),
      accent: "amber" as const,
      delta: forecastGap !== null
        ? (forecastGap >= 0 ? `▲ ₹${Math.abs(forecastGap).toFixed(1)}Cr above plan` : `▼ ₹${Math.abs(forecastGap).toFixed(1)}Cr gap`)
        : "Upload Finance",
    },
    {
      label: "Unbilled",
      value: stats ? formatCurrency(stats.total_unbilled_inr ?? 0) : "—",
      accent: "red" as const,
      delta: stats ? "Outstanding (Unbilled sheet)" : "Upload Finance",
    },
    {
      label: "Bad debt",
      value: stats ? formatCurrency(stats.total_bad_debt_inr ?? 0) : "—",
      accent: "red" as const,
      delta: stats ? "Bad Debt sheet" : "Upload Finance",
    },
    {
      label: "Collection pending",
      value: stats ? formatCurrency(stats.collection_pending_inr ?? 0) : "—",
      accent: "amber" as const,
      delta: stats ? "Target − collected" : "Upload Finance",
    },
    {
      label: "Attainment %",
      value: formatPercent(stats?.rev_attainment ?? 0),
      accent: "teal" as const,
    },
    {
      label: "Collection Eff.",
      value: formatPercent(stats?.collection_efficiency ?? 0),
      accent: "blue" as const,
    },
  ];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <PageHeader title="Finance Command" subtitle="Budget · Forecast · Actual · Contribution Margin · Cashflow" />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-0 bg-[var(--accent)] px-3 py-1.5 text-[10.5px] font-semibold text-[var(--accent-foreground)] shadow-sm transition-colors hover:bg-[var(--accent-hover)]"
            onClick={() => setFinanceDialogOpen(true)}
          >
            <Plus className="shrink-0" size={14} strokeWidth={2.5} aria-hidden />
            Add / edit finance data
          </button>
          <label className="platform-chip active" style={{ cursor: "pointer" }}>
            ↑ Upload Finance
            <input type="file" hidden accept=".xlsx,.xls" onChange={(e) => onUpload(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      {/* KPI RIBBON */}
      {loading
        ? <SkeletonKpiRow count={8} />
        : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
            {kpis.map((k) => <PlatformKpi key={k.label} {...k} />)}
          </div>
        )
      }

      <ProductivityAveragesSection rows={rows} loading={loading} />

      {/* TABS */}
      <Tabs tabs={["Overview", "Ledger", "Cashflow"]} active={tab} onChange={setTab} />

      {tab === "Overview" && (
        <div className="platform-grid-2">
          <PlatformSection title="Budget vs Actual (Monthly)">
            {trendData.length === 0
              ? (
                <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No monthly finance data</div>
                  <div style={{ fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
                    Upload a Finance Excel file to populate this chart
                  </div>
                </div>
              )
              : <FinanceTrendChart data={trendData} />
            }
          </PlatformSection>

          <PlatformSection title="Forecast Bridge Waterfall">
            {waterfallItems.length === 0
              ? (
                <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No forecast bridge data</div>
                  <div style={{ fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
                    Upload Budget Forecast file via Ingestion Center
                  </div>
                </div>
              )
              : <WaterfallChart items={waterfallItems} />
            }

            {/* Cashflow Panel — from real stats */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace", marginBottom: 8 }}>
                Finance Summary
              </div>
              <table className="platform-table">
                <thead><tr><th>Metric</th><th>Value</th></tr></thead>
                <tbody>
                  <tr>
                    <td>Revenue Budget (FY)</td>
                    <td style={{ color: "var(--accent)" }}>{formatCurrency(stats?.revenue_budget_inr ?? 0)}</td>
                  </tr>
                  <tr>
                    <td>Revenue Actual (YTD)</td>
                    <td style={{ color: "var(--green)" }}>{formatCurrency(stats?.revenue_actual_inr ?? 0)}</td>
                  </tr>
                  <tr>
                    <td>Contribution Margin</td>
                    <td>{formatCurrency(stats?.total_cm_inr ?? 0)}</td>
                  </tr>
                  <tr>
                    <td>Unbilled</td>
                    <td style={{ color: "var(--amber)" }}>{formatCurrency(stats?.total_unbilled_inr ?? 0)}</td>
                  </tr>
                  <tr>
                    <td>Bad debt</td>
                    <td style={{ color: "var(--red)" }}>{formatCurrency(stats?.total_bad_debt_inr ?? 0)}</td>
                  </tr>
                  <tr>
                    <td>Collection target</td>
                    <td>{formatCurrency(stats?.total_collection_target_inr ?? 0)}</td>
                  </tr>
                  <tr>
                    <td>Collection pending</td>
                    <td style={{ color: (stats?.collection_pending_inr ?? 0) > 0 ? "var(--amber)" : "var(--green)" }}>
                      {formatCurrency(stats?.collection_pending_inr ?? 0)}
                    </td>
                  </tr>
                  {stats?.total_collected_inr != null && stats.total_collected_inr > 0 && (
                    <tr>
                      <td>Collected</td>
                      <td style={{ color: "var(--green)" }}>{formatCurrency(stats.total_collected_inr)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PlatformSection>
        </div>
      )}

      {tab === "Ledger" && (
        <PlatformSection title="Finance Ledger">
          <p style={{ fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", lineHeight: 1.45, margin: "0 0 12px" }}>
            One row per client · month — revenue (budget / forecast / actual), CM actual, and cashflow merged from the ledger.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <input
              className="platform-search"
              placeholder="Search client, vertical, month…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: "1 1 200px", minWidth: 160, maxWidth: 360 }}
            />
            <select
              value={ledgerClient}
              onChange={(e) => setLedgerClient(e.target.value)}
              style={selectLedgerStyle}
              title="Filter by client"
            >
              <option value="all">All clients</option>
              {ledgerAccountOptions.map((a) => (
                <option key={a} value={a}>{a.length > 42 ? `${a.slice(0, 40)}…` : a}</option>
              ))}
            </select>
            <select
              value={ledgerVertical}
              onChange={(e) => setLedgerVertical(e.target.value)}
              style={selectLedgerStyle}
              title="Filter by vertical"
            >
              <option value="all">All verticals</option>
              {ledgerVerticalOptions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <select
              value={ledgerMonth}
              onChange={(e) => setLedgerMonth(e.target.value)}
              style={selectLedgerStyle}
              title="Filter by month"
            >
              <option value="all">All months</option>
              {ledgerMonthOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {(search.trim() || ledgerClient !== "all" || ledgerVertical !== "all" || ledgerMonth !== "all") && (
              <button
                type="button"
                className="platform-chip"
                style={{ fontSize: 10, cursor: "pointer" }}
                onClick={() => {
                  setSearch("");
                  setLedgerClient("all");
                  setLedgerVertical("all");
                  setLedgerMonth("all");
                }}
              >
                Clear filters
              </button>
            )}
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginLeft: "auto" }}>
              {filtered.length} row{filtered.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="platform-table-wrap">
            {loading ? <SkeletonTable rows={6} cols={26} /> : null}
            <table className="platform-table" style={{ display: loading ? "none" : undefined }}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Client</th>
                  <th title="projects.project_head">Proj. head</th>
                  <th>Vertical</th>
                  <th>Budget</th>
                  <th>Forecast</th>
                  <th>Actual</th>
                  <th>CM</th>
                  <th title="Actual CM ÷ actual revenue">CM %</th>
                  <th>WL1 HC</th>
                  <th title="Overall headcount (finance)">Ovl HC</th>
                  <th title="Taggd joiners ÷ WL1 HC">Taggd src</th>
                  <th title="Actual cost ÷ overall HC (INR per HC)">PPC</th>
                  <th title="Target PPC (INR per HC)">Tgt PPC</th>
                  <th title="Actual PPC ÷ target PPC × 100">PPC %</th>
                  <th title="Revenue actual ÷ WL1 HC">Rev / WL1</th>
                  <th title="Target rev productivity (INR)">Tgt rev prod</th>
                  <th title="Actual ÷ target × 100">Rev prod %</th>
                  <th>Unbilled</th>
                  <th>Bad debt</th>
                  <th>Coll. pending</th>
                  <th>Collected</th>
                  <th>Δ%</th>
                  <th>Metrics by</th>
                  <th>Updated</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={26} style={{ color: "var(--text-muted)", textAlign: "center" }}>No finance rows yet — upload a Finance Excel file.</td></tr>
                )}
                {filtered.map((r) => {
                  const delta = r.rev_budget_inr ? ((r.rev_actual_inr - r.rev_budget_inr) / r.rev_budget_inr) * 100 : 0;
                  const deltaColor = delta >= 0 ? "var(--green)" : "var(--red)";
                  const rowKey = `${r.project_id ?? r.id}-${r.month_sort ?? r.month}-${r.id}`;
                  return (
                    <tr key={rowKey}>
                      <td>{r.month}</td>
                      <td>{r.account_name}</td>
                      <td style={{ fontSize: 10, maxWidth: 100 }} className="truncate" title={r.project_head || ""}>
                        {r.project_head || "—"}
                      </td>
                      <td>{r.vertical}</td>
                      <td>{formatCurrency(r.rev_budget_inr)}</td>
                      <td>{formatCurrency(r.rev_forecast_inr)}</td>
                      <td style={{ color: deltaColor }}>{formatCurrency(r.rev_actual_inr)}</td>
                      <td>{formatCurrency(r.cm_actual_inr)}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }} title="CM ÷ revenue">
                        {r.cm_pct != null && Number.isFinite(r.cm_pct) ? `${r.cm_pct.toFixed(1)}%` : "—"}
                      </td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }}>
                        {Number(r.actual_headcount_wl1 ?? 0).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }} title="Overall HC">
                        {r.actual_headcount_overall != null && Number.isFinite(r.actual_headcount_overall)
                          ? Math.round(r.actual_headcount_overall).toLocaleString()
                          : "—"}
                      </td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }} title="Taggd joiners ÷ WL1 HC">
                        {fmtFinRatio(r.taggd_source_productivity ?? r.taggd_joiner_productivity ?? null)}
                      </td>
                      <td style={{ fontSize: 11 }} title="Ledger cost ÷ overall HC">
                        {fmtFinInrMetric(r.ppc_inr ?? null)}
                      </td>
                      <td style={{ fontSize: 11 }}>{fmtFinInrMetric(r.target_ppc_inr ?? null)}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }}>
                        {r.ppc_ach_pct != null && Number.isFinite(r.ppc_ach_pct) ? `${r.ppc_ach_pct.toFixed(1)}%` : "—"}
                      </td>
                      <td style={{ fontSize: 11 }} title="Revenue actual ÷ WL1 HC">
                        {fmtFinInrMetric(r.revenue_productivity_inr ?? null)}
                      </td>
                      <td style={{ fontSize: 11 }} title="Target rev productivity">
                        {fmtFinInrMetric(r.target_revenue_per_recruiter ?? null)}
                      </td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11 }}>
                        {r.rev_prod_ach_pct != null && Number.isFinite(r.rev_prod_ach_pct) ? `${r.rev_prod_ach_pct.toFixed(1)}%` : "—"}
                      </td>
                      <td>{formatCurrency(r.unbilled_inr)}</td>
                      <td>{formatCurrency(r.bad_debt_inr)}</td>
                      <td>{formatCurrency(r.collection_pending_inr)}</td>
                      <td>{formatCurrency(r.collected_inr ?? 0)}</td>
                      <td style={{ color: deltaColor }}>{delta >= 0 ? "+" : ""}{delta.toFixed(1)}%</td>
                      <td style={{ fontSize: 10, color: "var(--text-muted)", maxWidth: 120 }} className="truncate" title={r.metrics_updated_by_email || ""}>
                        {r.metrics_updated_by_email || (r.metrics_updated_by_user_id != null ? `User #${r.metrics_updated_by_user_id}` : "—")}
                      </td>
                      <td style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "var(--text-muted)" }}>
                        {r.metrics_updated_at ? new Date(r.metrics_updated_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </td>
                      <td>{r.unbilled_inr > 2_000_000 ? <span className="platform-badge red">⚠ High</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PlatformSection>
      )}

      {tab === "Cashflow" && (
        <PlatformSection title="Cashflow Panel">
          {!stats
            ? (
              <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
                No cashflow data — upload a Finance Excel file
              </div>
            )
            : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                <PlatformKpi
                  label="Collected"
                  value={formatCurrency(stats.total_collected_inr ?? 0)}
                  accent="green"
                  delta={stats.revenue_actual_inr > 0
                    ? formatPercent((stats.total_collected_inr ?? 0) / stats.revenue_actual_inr * 100) + " of actual"
                    : "—"}
                />
                <PlatformKpi
                  label="Collection target"
                  value={formatCurrency(stats.total_collection_target_inr ?? 0)}
                  accent="blue"
                  delta="Collection Target sheet"
                />
                <PlatformKpi
                  label="Collection pending"
                  value={formatCurrency(stats.collection_pending_inr ?? 0)}
                  accent="amber"
                  delta="Target − collected"
                />
                <PlatformKpi
                  label="Unbilled"
                  value={formatCurrency(stats.total_unbilled_inr ?? 0)}
                  accent="red"
                  delta={stats.total_unbilled_inr > 0 ? "▲ Outstanding" : "— Clear"}
                />
                <PlatformKpi
                  label="Bad debt"
                  value={formatCurrency(stats.total_bad_debt_inr ?? 0)}
                  accent="red"
                  delta="Bad Debt sheet"
                />
                <PlatformKpi
                  label="Contribution Margin"
                  value={formatCurrency(stats.total_cm_inr ?? 0)}
                  accent="amber"
                  delta={stats.revenue_actual_inr > 0
                    ? formatPercent((stats.total_cm_inr ?? 0) / stats.revenue_actual_inr * 100) + " margin"
                    : "—"}
                />
              </div>
            )
          }
        </PlatformSection>
      )}

      <FinanceLedgerFormDialog
        open={financeDialogOpen}
        onOpenChange={setFinanceDialogOpen}
        ledgerRows={rows}
        onSaved={reloadFinance}
      />
    </div>
  );
}
