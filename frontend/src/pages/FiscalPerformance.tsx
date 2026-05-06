import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, invalidateCache, queries, type Project } from "@/lib/api";
import { FinanceLedgerFormDialog } from "@/components/platform/FinanceLedgerFormDialog";
import { FinanceExecDashboard } from "@/components/finance/FinanceExecDashboard";
import { financeRowsVm, financeStatsVm, type FinanceRowVm } from "@/lib/view-models/finance";

const FY_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

export function FiscalPerformance() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<ReturnType<typeof financeStatsVm> | null>(null);
  const [rows, setRows] = useState<FinanceRowVm[]>([]);
  const [waterfall, setWaterfall] = useState<{
    opening: number;
    additions: number;
    closures: number;
    leakage: number;
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [financeDialogOpen, setFinanceDialogOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  const reloadFinance = useCallback(async () => {
    invalidateCache("finance/");
    const [s, d, w, p] = await Promise.allSettled([
      queries.financeStats(),
      queries.financeData(),
      queries.budgetForecastWaterfall(),
      queries.projects(),
    ]);
    if (s.status === "fulfilled") setStats(financeStatsVm(s.value));
    if (d.status === "fulfilled") setRows(financeRowsVm(d.value || []));
    if (w.status === "fulfilled") setWaterfall(w.value);
    if (p.status === "fulfilled") setProjects(p.value || []);
  }, []);

  useEffect(() => {
    (async () => {
      const [s, d, w, p] = await Promise.allSettled([
        queries.financeStats(),
        queries.financeData(),
        queries.budgetForecastWaterfall(),
        queries.projects(),
      ]);
      if (s.status === "fulfilled") setStats(financeStatsVm(s.value));
      if (d.status === "fulfilled") setRows(financeRowsVm(d.value || []));
      if (w.status === "fulfilled") setWaterfall(w.value);
      if (p.status === "fulfilled") setProjects(p.value || []);
      setLoading(false);
    })();
  }, []);

  const onUpload = async (file?: File | null) => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    await api.post("/finance/upload", form);
    await reloadFinance();
  };

  const trendData = useMemo(() => {
    if (!rows.length) return [];
    const monthly: Record<string, { budget: number; actual: number; forecast: number }> = {};
    for (const r of rows) {
      const raw = (r.month || "").trim();
      const abbr = raw.split(" ")[0].split("-")[0];
      const short = abbr.charAt(0).toUpperCase() + abbr.slice(1).toLowerCase();
      if (!FY_MONTHS.includes(short)) continue;
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
  }, [rows]);

  const waterfallItems = useMemo(() => {
    if (!waterfall) return [];
    return [
      { label: "Opening Forecast", value: +(waterfall.opening / 1e7).toFixed(2), color: "var(--accent)", isTotal: false },
      { label: "New Additions", value: +(waterfall.additions / 1e7).toFixed(2), color: "var(--green)", isTotal: false },
      { label: "Closures", value: -(waterfall.closures / 1e7).toFixed(2), color: "var(--red)", isTotal: false },
      { label: "Leakage", value: -(waterfall.leakage / 1e7).toFixed(2), color: "var(--red)", isTotal: false },
      { label: "Revised Forecast", value: +(waterfall.total / 1e7).toFixed(2), color: "var(--accent2)", isTotal: true },
    ];
  }, [waterfall]);

  return (
    <>
      <FinanceExecDashboard
        stats={stats}
        projects={projects}
        rows={rows}
        trendData={trendData}
        waterfallItems={waterfallItems}
        loading={loading}
        onUpload={onUpload}
        onOpenLedgerDialog={() => setFinanceDialogOpen(true)}
        onNavigateForecastPacks={() => navigate("/revenue-governance")}
      />
      <FinanceLedgerFormDialog
        open={financeDialogOpen}
        onOpenChange={setFinanceDialogOpen}
        ledgerRows={rows}
        onSaved={reloadFinance}
      />
    </>
  );
}
