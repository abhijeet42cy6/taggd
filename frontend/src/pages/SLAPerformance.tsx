import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, invalidateCache, queries } from "@/lib/api";
import { isProjectHeadLike, useAuth } from "@/lib/auth";
import { formatPercent } from "@/lib/utils";
import {
  aggregatePeriod,
  formatPeriodColumnHeader,
  formatPeriodLabelShort,
  periodMonthSet,
  type FyMode,
} from "@/lib/sla-fy";
import { StatusTag } from "@/components/platform/PlatformBlocks";
import { SkeletonKpiRow, SkeletonTable } from "@/components/platform/Skeleton";
import {
  SlaBenchmarkGroupedBar,
  SlaComplianceBar,
  SlaExecutiveDeltaBar,
  SlaExecutiveMetPctBar,
  SlaFyComparisonGroupedBar,
  SlaFyComparisonLineChart,
  SlaFyPortfolioMetNotMetBar,
  SlaMetNotMetDonut,
  SlaNotReportedCountBar,
  SlaTimeSeriesChart,
  type SlaSeriesPoint,
} from "@/components/platform/Charts";
import { PlatformDrawer } from "@/components/platform/PlatformDrawer";
import { SlaMetricFormDialog } from "@/components/platform/SlaMetricFormDialog";
import { slaRowsVm, slaStatsVm } from "@/lib/view-models/sla";
import { Menu, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import "@/styles/finance-exec-dashboard.css";
import "@/styles/sla-dash-ui.css";

// ─── Colour palette to match SlaTimeSeriesChart ────────────────────────────────
const SERIES_COLORS = [
  "var(--accent)", "var(--green)", "var(--amber)", "var(--red)", "var(--accent2)",
  "#a78bfa", "#fb923c", "#34d399", "#f472b6", "#60a5fa",
];

// ─── Normalise raw rag_status string into a display-safe label ─────────────────
function statusTagFromRaw(rawStatus: unknown): string {
  const s = String(rawStatus ?? "").trim();
  const lower = s.toLowerCase();
  if (lower === "met") return "Met";
  if (lower.includes("not met")) return "Breached";
  if (
    lower === "not reported" ||
    lower.includes("not reported") ||
    lower === "n/a" || lower === "na" ||
    lower === "-" || lower === "" || lower === "nan" || lower === "none"
  ) return "Not Reported";
  return "Not Reported";
}

// ─── Bucket raw status into the filter keys ────────────────────────────────────
function statusBucket(rawStatus: unknown): "met" | "breached" | "not_reported" {
  const s = String(rawStatus ?? "").trim().toLowerCase();
  if (s === "met") return "met";
  if (s.includes("not met")) return "breached";
  return "not_reported";
}

/** Latest row per account for region / practice head (by reporting month / period). */
function monthSortKey(r: any): string {
  const rm = String(r.reporting_month ?? "").trim();
  if (rm && rm !== "N/A" && /^\d{4}-\d{2}/.test(rm)) return rm.slice(0, 7);
  const ps = r.period_start;
  if (ps && typeof ps === "string" && /^\d{4}-\d{2}/.test(ps)) return ps.slice(0, 7);
  return "";
}

function accountMetaByAccount(rows: any[]): Map<string, { region: string; practice_head: string }> {
  const by = new Map<string, any[]>();
  for (const r of rows) {
    const a = r.account_name || "Unknown";
    if (!by.has(a)) by.set(a, []);
    by.get(a)!.push(r);
  }
  const out = new Map<string, { region: string; practice_head: string }>();
  for (const [acc, list] of by) {
    const sorted = [...list].sort((a, b) => monthSortKey(b).localeCompare(monthSortKey(a)));
    const best = sorted[0];
    out.set(acc, {
      region: (best?.region && String(best.region).trim()) || "—",
      practice_head: (best?.practice_head && String(best.practice_head).trim()) || "—",
    });
  }
  return out;
}

function kpiTypeLabel(raw: string | null | undefined): string {
  if (!raw) return "—";
  const s = raw.toLowerCase();
  if (s.includes("contract")) return "Contractual KPI";
  if (s.includes("internal")) return "Internal KPI";
  return String(raw);
}

function formatChange(p1: number | null, p2: number | null): string {
  if (p1 == null || p2 == null) return "—";
  const d = Math.round((p2 - p1) * 10) / 10;
  const sign = d >= 0 ? "+" : "";
  return `${sign}${d.toFixed(1)}%`;
}

/** e.g. 2025-10 → Oct'25 */
function formatMonthColHeader(ym: string): string {
  const parts = ym.split("-");
  if (parts.length < 2) return ym;
  const y = parseInt(parts[0], 10);
  const mo = parseInt(parts[1], 10);
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (mo < 1 || mo > 12 || Number.isNaN(y)) return ym;
  return `${labels[mo - 1]}'${String(y).slice(2)}`;
}

/** Latest month in list → Indian FY label, e.g. FY 25–26 */
function indianFyTitleFromMonth(ym: string): string {
  const parts = ym.split("-");
  if (parts.length < 2) return "";
  const y = parseInt(parts[0], 10);
  const mo = parseInt(parts[1], 10);
  if (Number.isNaN(y) || Number.isNaN(mo)) return "";
  const fyStart = mo >= 4 ? y : y - 1;
  return `FY ${String(fyStart).slice(2)}–${String(fyStart + 1).slice(2)}`;
}

type TimelinePt = {
  month: string;
  met: number;
  not_met: number;
  not_reported: number;
  met_pct: number | null;
  total: number;
};

function cellState(t: TimelinePt | undefined): "met" | "not_met" | "not_reported" | "empty" {
  if (!t) return "empty";
  if (t.not_met > 0) return "not_met";
  if (t.met > 0) return "met";
  if (t.not_reported > 0) return "not_reported";
  return "empty";
}

function ytdRollup(timeline: TimelinePt[], months: string[]): { state: ReturnType<typeof cellState>; met_pct: number | null } {
  let met = 0;
  let nm = 0;
  for (const mo of months) {
    const pt = timeline.find((x) => x.month === mo);
    if (pt) {
      met += pt.met;
      nm += pt.not_met;
    }
  }
  const tot = met + nm;
  const met_pct = tot > 0 ? Math.round((met / tot) * 1000) / 10 : null;
  const fake: TimelinePt = { month: "ytd", met, not_met: nm, not_reported: 0, met_pct, total: tot };
  return { state: cellState(fake), met_pct };
}

function penaltyLabel(metricNature: string | null | undefined): { label: string; ok: boolean } {
  const s = (metricNature || "").toLowerCase();
  if (s.includes("penalty") && !s.includes("non")) return { label: "Penalty", ok: false };
  return { label: "Non-Penalty", ok: true };
}

/** Indian FY quarter from calendar month in YYYY-MM. */
function monthToIndianQuarter(ym: string): "Q1" | "Q2" | "Q3" | "Q4" | null {
  if (!ym || ym.length < 7) return null;
  const mo = parseInt(ym.slice(5, 7), 10);
  if (Number.isNaN(mo)) return null;
  if (mo >= 4 && mo <= 6) return "Q1";
  if (mo >= 7 && mo <= 9) return "Q2";
  if (mo >= 10) return "Q3";
  if (mo >= 1 && mo <= 3) return "Q4";
  return null;
}

type SlaDashView =
  | "overview"
  | "executive"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "account"
  | "region"
  | "practice"
  | "benchmarking"
  | "notreported"
  | "manual";

const SL_NAV: { id: SlaDashView; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "fa-gauge-high" },
  { id: "executive", label: "Executive View", icon: "fa-wand-magic-sparkles" },
  { id: "monthly", label: "Monthly Performance", icon: "fa-calendar" },
  { id: "quarterly", label: "Quarterly Performance", icon: "fa-calendar-week" },
  { id: "yearly", label: "Year-over-Year", icon: "fa-right-left" },
  { id: "account", label: "Project Analysis", icon: "fa-building" },
  { id: "region", label: "Regional Analysis", icon: "fa-map-location-dot" },
  { id: "practice", label: "Practice Head Analysis", icon: "fa-users" },
  { id: "benchmarking", label: "Industry Benchmarking", icon: "fa-trophy" },
  { id: "notreported", label: "Not Reported Analysis", icon: "fa-triangle-exclamation" },
  { id: "manual", label: "User Manual", icon: "fa-book-open" },
];

export function SLAPerformance() {
  const { user } = useAuth();
  const phLike = isProjectHeadLike(user);

  // Core data
  const [stats,      setStats]      = useState<any>(null);
  const [rows,       setRows]       = useState<any[]>([]);
  const [timeseries, setTimeseries] = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);

  // Table filters
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "met" | "breached" | "not_reported">("all");
  const [acctFilter,   setAcctFilter]   = useState<string>("all");

  // Trend chart: selected accounts (+ picker drawer)
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [monthFrom, setMonthFrom] = useState<string>("all");
  const [monthTo,   setMonthTo]   = useState<string>("all");
  const [chartPickerOpen, setChartPickerOpen] = useState(false);
  const [chartPickerSearch, setChartPickerSearch] = useState("");

  // Table: reporting period filter (independent from trend chart range)
  const [tableMonthFrom, setTableMonthFrom] = useState<string>("all");
  const [tableMonthTo,   setTableMonthTo]   = useState<string>("all");

  // Drilldown
  const [metric,        setMetric]        = useState<any>(null);
  const [drillAccount,  setDrillAccount]  = useState<string | null>(null);
  const [accountMetricsTs, setAccountMetricsTs] = useState<{
    account_name: string;
    metrics: Array<{
      definition_id: number;
      metric_label: string;
      metric_nature: string | null;
      timeline: Array<{ month: string; met: number; not_met: number; not_reported: number }>;
    }>;
  } | null>(null);
  const [accountMetricsLoading, setAccountMetricsLoading] = useState(false);

  // FY comparison (independent account picker from trend chart)
  const [fyMode, setFyMode] = useState<FyMode>("indian");
  const [fySelectedAccounts, setFySelectedAccounts] = useState<Set<string>>(new Set());
  const [fyPickerOpen, setFyPickerOpen] = useState(false);
  const [fyChartPickerSearch, setFyChartPickerSearch] = useState("");
  const [fyRegionFilter, setFyRegionFilter] = useState<string>("all");

  const [slaMetricDialogOpen, setSlaMetricDialogOpen] = useState(false);
  const [slaView, setSlaView] = useState<SlaDashView>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [regionChartKind, setRegionChartKind] = useState<"line" | "bar">("bar");

  const slaMetricOptions = useMemo(() => {
    const seen = new Set<number>();
    const out: { id: number; label: string; account: string }[] = [];
    for (const r of rows) {
      const id = Number((r as any).id);
      if (!Number.isFinite(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        label: String((r as any).metric_label ?? "Metric"),
        account: String((r as any).account_name ?? "—"),
      });
    }
    out.sort((a, b) => a.label.localeCompare(b.label) || a.account.localeCompare(b.account));
    return out;
  }, [rows]);

  const reloadSla = useCallback(async () => {
    invalidateCache("sla");
    const [s, d, ts] = await Promise.allSettled([
      queries.slaStats(),
      queries.slaData(),
      queries.slaTimeseries(),
    ]);
    if (s.status === "fulfilled") setStats(slaStatsVm(s.value));
    if (d.status === "fulfilled") setRows(slaRowsVm(d.value || []));
    if (ts.status === "fulfilled") {
      setTimeseries(ts.value || []);
      const top5 = (ts.value || [])
        .sort((a: any, b: any) => {
          const aSnaps = a.timeline.reduce((n: number, t: any) => n + t.met + t.not_met + t.not_reported, 0);
          const bSnaps = b.timeline.reduce((n: number, t: any) => n + t.met + t.not_met + t.not_reported, 0);
          return bSnaps - aSnaps;
        })
        .slice(0, 5)
        .map((a: any) => a.account_name);
      setFySelectedAccounts(new Set(top5));
    }
  }, []);

  // ─── Fetch data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [s, d, ts] = await Promise.allSettled([
        queries.slaStats(),
        queries.slaData(),
        queries.slaTimeseries(),
      ]);
      if (s.status === "fulfilled") setStats(slaStatsVm(s.value));
      if (d.status === "fulfilled") setRows(slaRowsVm(d.value || []));
      if (ts.status === "fulfilled") {
        setTimeseries(ts.value || []);
        // Default: top 5 accounts by snapshot count
        const top5 = (ts.value || [])
          .sort((a: any, b: any) => {
            const aSnaps = a.timeline.reduce((n: number, t: any) => n + t.met + t.not_met + t.not_reported, 0);
            const bSnaps = b.timeline.reduce((n: number, t: any) => n + t.met + t.not_met + t.not_reported, 0);
            return bSnaps - aSnaps;
          })
          .slice(0, 5)
          .map((a: any) => a.account_name);
        setSelectedAccounts(new Set(top5));
        setFySelectedAccounts(new Set(top5));
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (slaView === "notreported") setStatusFilter("not_reported");
    else setStatusFilter((prev) => (prev === "not_reported" ? "all" : prev));
  }, [slaView]);

  useEffect(() => {
    if (!drillAccount) {
      setAccountMetricsTs(null);
      return;
    }
    let cancelled = false;
    setAccountMetricsLoading(true);
    queries
      .slaAccountMetricsTimeseries(drillAccount)
      .then((data) => {
        if (!cancelled) setAccountMetricsTs(data);
      })
      .finally(() => {
        if (!cancelled) setAccountMetricsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [drillAccount]);

  useEffect(() => {
    const id = "sla-kpi-dashboard-fa";
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

  const onUpload = async (file?: File | null) => {
    if (!file) return;
    const form = new FormData(); form.append("file", file);
    await api.post("/sla/upload", form);
    await reloadSla();
  };

  // ─── Derived: KPI numbers ─────────────────────────────────────────────────────
  const metPct = stats?.portfolio_health ?? 0;
  const notMetPct = stats && (stats.met_count + stats.not_met_count) > 0
    ? Math.round((stats.not_met_count / (stats.met_count + stats.not_met_count)) * 100) : 0;
  const notReportedCount = useMemo(
    () => rows.filter((r: any) => statusBucket(r.status) === "not_reported").length, [rows]);
  const notReportedPct = rows.length > 0 ? Math.round((notReportedCount / rows.length) * 100) : 0;

  // ─── All accounts list ────────────────────────────────────────────────────────
  const allAccounts = useMemo(
    () => [...new Set(rows.map((r: any) => r.account_name || "Unknown"))].sort(),
    [rows]
  );

  // ─── Sorted month list from timeseries ───────────────────────────────────────
  const allMonths = useMemo<string[]>(() => {
    const monthSet = new Set<string>();
    timeseries.forEach((acc: any) =>
      acc.timeline.forEach((t: any) => monthSet.add(t.month))
    );
    // Canonical YYYY-MM from API sorts chronologically by string compare
    return Array.from(monthSet).sort((a, b) => a.localeCompare(b));
  }, [timeseries]);

  /** Union of timeline months + any reporting_month on SLA rows (for table time filter). */
  const monthsOrderedForTable = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of allMonths) {
      if (m && !seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
    }
    for (const r of rows) {
      const m = String((r as any).reporting_month ?? "").trim();
      if (m && m !== "N/A" && !seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [allMonths, rows]);

  /** When non-null, only rows whose reporting_month is in this set pass the table time filter. */
  const tableFilteredMonthSet = useMemo(() => {
    if (tableMonthFrom === "all" && tableMonthTo === "all") return null;
    const ordered = monthsOrderedForTable;
    if (!ordered.length) return null;
    const fi = tableMonthFrom === "all" ? 0 : ordered.indexOf(tableMonthFrom);
    const ti = tableMonthTo === "all" ? ordered.length - 1 : ordered.indexOf(tableMonthTo);
    const start = fi < 0 ? 0 : fi;
    const end = ti < 0 ? ordered.length - 1 : ti;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    return new Set(ordered.slice(lo, hi + 1));
  }, [monthsOrderedForTable, tableMonthFrom, tableMonthTo]);

  // ─── Trend chart data ─────────────────────────────────────────────────────────
  const trendAccounts = useMemo(
    () => timeseries.filter((a: any) => selectedAccounts.has(a.account_name)),
    [timeseries, selectedAccounts]
  );

  // Filtered months (from → to)
  const filteredMonths = useMemo(() => {
    if (monthFrom === "all" && monthTo === "all") return allMonths;
    const fromIdx = monthFrom === "all" ? 0 : allMonths.indexOf(monthFrom);
    const toIdx   = monthTo   === "all" ? allMonths.length - 1 : allMonths.indexOf(monthTo);
    return allMonths.slice(
      fromIdx < 0 ? 0 : fromIdx,
      toIdx   < 0 ? allMonths.length : toIdx + 1,
    );
  }, [allMonths, monthFrom, monthTo]);

  const trendChartData = useMemo(() => {
    if (!trendAccounts.length) return [];
    // Build lookup: account → month → met_pct
    const lookup: Record<string, Record<string, number | null>> = {};
    for (const acc of trendAccounts) {
      lookup[acc.account_name] = {};
      for (const t of acc.timeline) {
        lookup[acc.account_name][t.month] = t.met_pct;
      }
    }
    return filteredMonths.map((month): SlaSeriesPoint => {
      const point: SlaSeriesPoint = { month };
      for (const acc of trendAccounts) {
        const val = lookup[acc.account_name]?.[month];
        point[acc.account_name] = val !== undefined ? val : null;
      }
      return point;
    });
  }, [trendAccounts, filteredMonths]);

  const chartAccountNames = useMemo(
    () => trendAccounts.map((a: any) => a.account_name),
    [trendAccounts]
  );

  // ─── Compliance by account bar ────────────────────────────────────────────────
  const accountComplianceData = useMemo(() => {
    if (!rows.length) return [];
    const byAccount: Record<string, { met: number; notMet: number; notReported: number }> = {};
    for (const r of rows) {
      const acc = r.account_name || "Unknown";
      if (!byAccount[acc]) byAccount[acc] = { met: 0, notMet: 0, notReported: 0 };
      const bucket = statusBucket(r.status);
      if (bucket === "met") byAccount[acc].met++;
      else if (bucket === "breached") byAccount[acc].notMet++;
      else byAccount[acc].notReported++;
    }
    return Object.entries(byAccount)
      .map(([account, counts]) => ({
        month: account.length > 12 ? account.slice(0, 11) + "…" : account,
        ...counts,
      }))
      .sort((a, b) => b.met - a.met)
      .slice(0, 12);
  }, [rows]);

  const accountMetaMap = useMemo(() => accountMetaByAccount(rows), [rows]);

  const p1Months = useMemo(() => periodMonthSet(fyMode, "p1"), [fyMode]);
  const p2Months = useMemo(() => periodMonthSet(fyMode, "p2"), [fyMode]);

  const fyAccountsForChart = useMemo(() => {
    const list = timeseries
      .filter((a: any) => fySelectedAccounts.has(a.account_name))
      .map((a: any) => a.account_name as string);
    return list.sort((x, y) => x.localeCompare(y));
  }, [timeseries, fySelectedAccounts]);

  const fyAccountChartData = useMemo(() => {
    return fyAccountsForChart
      .filter((account) => {
        if (fyRegionFilter === "all") return true;
        return (accountMetaMap.get(account)?.region || "—") === fyRegionFilter;
      })
      .map((account) => {
        const ts = timeseries.find((t: any) => t.account_name === account);
        if (!ts) return { name: account.length > 14 ? account.slice(0, 13) + "…" : account, p1: null, p2: null };
        const a1 = aggregatePeriod(ts.timeline, p1Months);
        const a2 = aggregatePeriod(ts.timeline, p2Months);
        return {
          name: account.length > 14 ? account.slice(0, 13) + "…" : account,
          p1: a1.met_pct,
          p2: a2.met_pct,
        };
      });
  }, [fyAccountsForChart, timeseries, p1Months, p2Months, fyRegionFilter, accountMetaMap]);

  const fyRegionalChartData = useMemo(() => {
    const roll = new Map<string, { met1: number; nm1: number; met2: number; nm2: number }>();
    for (const acc of timeseries) {
      const region = accountMetaMap.get(acc.account_name)?.region || "Unknown";
      if (!roll.has(region)) roll.set(region, { met1: 0, nm1: 0, met2: 0, nm2: 0 });
      const b = roll.get(region)!;
      for (const t of acc.timeline) {
        if (p1Months.has(t.month)) {
          b.met1 += t.met;
          b.nm1 += t.not_met;
        }
        if (p2Months.has(t.month)) {
          b.met2 += t.met;
          b.nm2 += t.not_met;
        }
      }
    }
    return Array.from(roll.entries())
      .map(([name, v]) => {
        const t1 = v.met1 + v.nm1;
        const t2 = v.met2 + v.nm2;
        return {
          name: name.length > 16 ? name.slice(0, 15) + "…" : name,
          p1: t1 > 0 ? Math.round((v.met1 / t1) * 1000) / 10 : null,
          p2: t2 > 0 ? Math.round((v.met2 / t2) * 1000) / 10 : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [timeseries, p1Months, p2Months, accountMetaMap]);

  const fyComparisonTableRows = useMemo(() => {
    const names = [...new Set(timeseries.map((a: any) => a.account_name))].sort((a, b) =>
      String(a).localeCompare(String(b))
    );
    return names.map((account) => {
      const meta = accountMetaMap.get(account) || { region: "—", practice_head: "—" };
      const ts = timeseries.find((t: any) => t.account_name === account);
      const a1 = ts ? aggregatePeriod(ts.timeline, p1Months) : { met_pct: null as number | null };
      const a2 = ts ? aggregatePeriod(ts.timeline, p2Months) : { met_pct: null as number | null };
      const p1 = a1.met_pct ?? null;
      const p2 = a2.met_pct ?? null;
      return {
        account,
        region: meta.region,
        practice_head: meta.practice_head,
        p1,
        p2,
        change: formatChange(p1, p2),
      };
    });
  }, [timeseries, accountMetaMap, p1Months, p2Months]);

  const fyPracticeChartData = useMemo(() => {
    const roll = new Map<string, { met1: number; nm1: number; met2: number; nm2: number }>();
    for (const acc of timeseries) {
      const ph = accountMetaMap.get(acc.account_name)?.practice_head || "Unknown";
      if (!roll.has(ph)) roll.set(ph, { met1: 0, nm1: 0, met2: 0, nm2: 0 });
      const b = roll.get(ph)!;
      for (const t of acc.timeline) {
        if (p1Months.has(t.month)) {
          b.met1 += t.met;
          b.nm1 += t.not_met;
        }
        if (p2Months.has(t.month)) {
          b.met2 += t.met;
          b.nm2 += t.not_met;
        }
      }
    }
    return Array.from(roll.entries())
      .map(([name, v]) => {
        const t1 = v.met1 + v.nm1;
        const t2 = v.met2 + v.nm2;
        return {
          name: name.length > 18 ? `${name.slice(0, 17)}…` : name,
          p1: t1 > 0 ? Math.round((v.met1 / t1) * 1000) / 10 : null,
          p2: t2 > 0 ? Math.round((v.met2 / t2) * 1000) / 10 : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [timeseries, p1Months, p2Months, accountMetaMap]);

  const portfolioTrendAllMonths = useMemo((): SlaSeriesPoint[] => {
    return allMonths.map((month) => {
      let met = 0;
      let nm = 0;
      for (const acc of timeseries) {
        const t = acc.timeline.find((x: any) => x.month === month);
        if (t) {
          met += t.met;
          nm += t.not_met;
        }
      }
      const denom = met + nm;
      return { month, Portfolio: denom > 0 ? Math.round((met / denom) * 1000) / 10 : null };
    });
  }, [allMonths, timeseries]);

  const quarterlyRollup = useMemo(() => {
    const qs = ["Q1", "Q2", "Q3", "Q4"] as const;
    const roll: Record<(typeof qs)[number], { met: number; nm: number }> = {
      Q1: { met: 0, nm: 0 },
      Q2: { met: 0, nm: 0 },
      Q3: { met: 0, nm: 0 },
      Q4: { met: 0, nm: 0 },
    };
    for (const acc of timeseries) {
      for (const t of acc.timeline) {
        const q = monthToIndianQuarter(t.month);
        if (!q) continue;
        roll[q].met += t.met;
        roll[q].nm += t.not_met;
      }
    }
    return qs.map((q) => {
      const { met, nm } = roll[q];
      const tot = met + nm;
      return {
        quarter: q,
        met,
        not_met: nm,
        met_pct: tot > 0 ? Math.round((met / tot) * 1000) / 10 : null,
      };
    });
  }, [timeseries]);

  const quarterlyChartData = useMemo(
    () =>
      quarterlyRollup.map((r) => ({
        month: r.quarter,
        "Portfolio Met %": r.met_pct,
      })) as SlaSeriesPoint[],
    [quarterlyRollup],
  );

  const accountOverallMetPct = useMemo(() => {
    const monthSet = new Set(allMonths);
    return timeseries
      .map((acc: any) => {
        const a = aggregatePeriod(acc.timeline, monthSet);
        return { account: acc.account_name as string, met_pct: a.met_pct };
      })
      .filter((x) => x.met_pct != null) as { account: string; met_pct: number }[];
  }, [timeseries, allMonths]);

  const executiveBest = useMemo(
    () => [...accountOverallMetPct].sort((a, b) => b.met_pct - a.met_pct).slice(0, 5),
    [accountOverallMetPct],
  );
  const executiveWorst = useMemo(
    () => [...accountOverallMetPct].sort((a, b) => a.met_pct - b.met_pct).slice(0, 5),
    [accountOverallMetPct],
  );

  const executiveImproved = useMemo(() => {
    return [...fyComparisonTableRows]
      .filter((r) => r.p1 != null && r.p2 != null)
      .map((r) => ({ ...r, delta: (r.p2 ?? 0) - (r.p1 ?? 0) }))
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5);
  }, [fyComparisonTableRows]);

  const executiveDeclined = useMemo(() => {
    return [...fyComparisonTableRows]
      .filter((r) => r.p1 != null && r.p2 != null)
      .map((r) => ({ ...r, delta: (r.p2 ?? 0) - (r.p1 ?? 0) }))
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 5);
  }, [fyComparisonTableRows]);

  /** Portfolio met / not-met snapshot counts for the two FY windows (timeseries). */
  const portfolioFySnapshots = useMemo(() => {
    let p1m = 0;
    let p1nm = 0;
    let p2m = 0;
    let p2nm = 0;
    for (const acc of timeseries) {
      for (const t of acc.timeline) {
        if (p1Months.has(t.month)) {
          p1m += t.met;
          p1nm += t.not_met;
        }
        if (p2Months.has(t.month)) {
          p2m += t.met;
          p2nm += t.not_met;
        }
      }
    }
    const p2Tot = p2m + p2nm;
    const p2_pct = p2Tot > 0 ? Math.round((p2m / p2Tot) * 1000) / 10 : null;
    return {
      bar: [
        { period: formatPeriodLabelShort(fyMode, "p1"), met: p1m, notMet: p1nm },
        { period: formatPeriodLabelShort(fyMode, "p2"), met: p2m, notMet: p2nm },
      ],
      p1: { met: p1m, notMet: p1nm },
      p2: { met: p2m, notMet: p2nm },
      p2_pct,
    };
  }, [timeseries, p1Months, p2Months, fyMode]);

  /** Top accounts by snapshot volume — FY Met % line (HTML account trend). */
  const accountTopFyTrendData = useMemo(() => {
    const ranked = [...timeseries]
      .map((acc: any) => ({
        account: acc.account_name as string,
        vol: acc.timeline.reduce(
          (n: number, t: any) => n + t.met + t.not_met + (t.not_reported ?? 0),
          0,
        ),
      }))
      .sort((a, b) => b.vol - a.vol)
      .slice(0, 10);
    return ranked.map(({ account }) => {
      const ts = timeseries.find((t: any) => t.account_name === account);
      if (!ts) return { name: account, p1: null, p2: null };
      const a1 = aggregatePeriod(ts.timeline, p1Months);
      const a2 = aggregatePeriod(ts.timeline, p2Months);
      const short = account.length > 14 ? `${account.slice(0, 13)}…` : account;
      return { name: short, p1: a1.met_pct, p2: a2.met_pct };
    });
  }, [timeseries, p1Months, p2Months]);

  const benchmarkVsPortfolioData = useMemo(() => {
    const bench = portfolioFySnapshots.p2_pct;
    if (bench == null) return [];
    return [...fyComparisonTableRows]
      .filter((r) => r.p2 != null)
      .sort((a, b) => (b.p2 ?? 0) - (a.p2 ?? 0))
      .slice(0, 10)
      .map((r) => ({
        name: r.account.length > 12 ? `${r.account.slice(0, 11)}…` : r.account,
        client: r.p2 as number,
        benchmark: bench,
      }));
  }, [fyComparisonTableRows, portfolioFySnapshots.p2_pct]);

  const notReportedByAccount = useMemo(() => {
    return timeseries
      .map((acc: any) => {
        const n = acc.timeline.reduce((s: number, t: any) => s + (t.not_reported ?? 0), 0);
        const name = acc.account_name as string;
        const short = name.length > 12 ? `${name.slice(0, 11)}…` : name;
        return { name: short, count: n };
      })
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [timeseries]);

  const notReportedByRegion = useMemo(() => {
    const roll = new Map<string, number>();
    for (const acc of timeseries) {
      const region = accountMetaMap.get(acc.account_name)?.region || "Unknown";
      const n = acc.timeline.reduce((s: number, t: any) => s + (t.not_reported ?? 0), 0);
      roll.set(region, (roll.get(region) ?? 0) + n);
    }
    return Array.from(roll.entries())
      .map(([name, count]) => ({
        name: name.length > 14 ? `${name.slice(0, 13)}…` : name,
        count,
      }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [timeseries, accountMetaMap]);

  const notReportedByPractice = useMemo(() => {
    const roll = new Map<string, number>();
    for (const acc of timeseries) {
      const ph = accountMetaMap.get(acc.account_name)?.practice_head || "Unknown";
      const n = acc.timeline.reduce((s: number, t: any) => s + (t.not_reported ?? 0), 0);
      roll.set(ph, (roll.get(ph) ?? 0) + n);
    }
    return Array.from(roll.entries())
      .map(([name, count]) => ({
        name: name.length > 16 ? `${name.slice(0, 15)}…` : name,
        count,
      }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [timeseries, accountMetaMap]);

  const notReportedMonthlySeries = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const acc of timeseries) {
      for (const t of acc.timeline) {
        const nr = t.not_reported ?? 0;
        if (nr <= 0) continue;
        byMonth.set(t.month, (byMonth.get(t.month) ?? 0) + nr);
      }
    }
    return allMonths.map((m) => ({
      name: formatMonthColHeader(m),
      count: byMonth.get(m) ?? 0,
    }));
  }, [timeseries, allMonths]);

  const notReportedMonthlyChartData = useMemo(() => {
    const nz = notReportedMonthlySeries.filter((x) => x.count > 0);
    if (nz.length) return nz.slice(-24);
    return notReportedMonthlySeries.slice(-12);
  }, [notReportedMonthlySeries]);

  const notReportedSnapshotsTotal = useMemo(
    () => timeseries.reduce((sum, acc: any) => sum + acc.timeline.reduce((s: number, t: any) => s + (t.not_reported ?? 0), 0), 0),
    [timeseries],
  );

  const regionalRankP2 = useMemo(() => {
    return [...fyRegionalChartData]
      .filter((r) => r.p2 != null)
      .map((r) => ({ name: r.name, p2: r.p2 as number }))
      .sort((a, b) => b.p2 - a.p2);
  }, [fyRegionalChartData]);

  const regionsForFilter = useMemo(() => {
    const s = new Set<string>();
    accountMetaMap.forEach((v) => s.add(v.region || "—"));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [accountMetaMap]);

  // ─── Table filtering ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => rows.filter((r) => {
    const okSearch = `${r.account_name} ${r.metric_label}`.toLowerCase().includes(search.toLowerCase());
    const okStatus = statusFilter === "all" || statusBucket(r.status) === statusFilter;
    const okAcct   = acctFilter   === "all" || r.account_name === acctFilter;
    const rm = String((r as any).reporting_month ?? "").trim();
    const okTime =
      tableFilteredMonthSet === null
        ? true
        : rm && rm !== "N/A" && tableFilteredMonthSet.has(rm);
    return okSearch && okStatus && okAcct && okTime;
  }), [rows, search, statusFilter, acctFilter, tableFilteredMonthSet]);

  // ─── Account drilldown data ───────────────────────────────────────────────────
  const drillData = useMemo(() => {
    if (!drillAccount) return null;
    const ts = timeseries.find((a: any) => a.account_name === drillAccount);
    const metrics = rows.filter((r: any) => r.account_name === drillAccount);
    return { ts, metrics };
  }, [drillAccount, timeseries, rows]);

  const drillMonthColumns = useMemo(() => {
    if (!accountMetricsTs?.metrics?.length) return [];
    const s = new Set<string>();
    for (const m of accountMetricsTs.metrics) {
      for (const t of m.timeline) s.add(t.month);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [accountMetricsTs]);

  const drillFyTitle = useMemo(() => {
    if (!drillMonthColumns.length) return "";
    return indianFyTitleFromMonth(drillMonthColumns[drillMonthColumns.length - 1]);
  }, [drillMonthColumns]);

  const drillMatrixRows = useMemo(() => {
    if (!drillData?.metrics) return [];
    const targetByDef = new Map<number, any>();
    for (const r of drillData.metrics) {
      targetByDef.set(r.id, r);
    }
    const fromTs = accountMetricsTs?.metrics;
    if (fromTs?.length) {
      return fromTs.map((m) => ({
        definition_id: m.definition_id,
        metric_label: m.metric_label,
        metric_nature: m.metric_nature ?? targetByDef.get(m.definition_id)?.metric_nature ?? null,
        target: targetByDef.get(m.definition_id)?.target ?? "—",
        timeline: m.timeline as TimelinePt[],
      }));
    }
    return drillData.metrics.map((r: any) => ({
      definition_id: r.id,
      metric_label: r.metric_label,
      metric_nature: r.metric_nature,
      target: r.target ?? "—",
      timeline: [] as TimelinePt[],
    }));
  }, [drillData, accountMetricsTs]);

  const drillAccountMeta = useMemo(() => {
    if (!drillAccount) return { region: "—", practice_head: "—" };
    return accountMetaMap.get(drillAccount) ?? { region: "—", practice_head: "—" };
  }, [drillAccount, accountMetaMap]);

  // ─── Account selector helpers ─────────────────────────────────────────────────
  const removeChartAccount = (name: string) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
  };

  const addChartAccount = (name: string) => {
    setSelectedAccounts((prev) => new Set(prev).add(name));
    setChartPickerSearch("");
  };

  /** All clients that have timeseries data (can be added to the chart). */
  const chartAvailableAccounts = useMemo(
    () => timeseries.map((a: any) => a.account_name as string).sort((a, b) => a.localeCompare(b)),
    [timeseries]
  );

  const chartPickerCandidates = useMemo(() => {
    const q = chartPickerSearch.trim().toLowerCase();
    return chartAvailableAccounts.filter(
      (name) => !selectedAccounts.has(name) && (!q || name.toLowerCase().includes(q))
    );
  }, [chartAvailableAccounts, chartPickerSearch, selectedAccounts]);

  const removeFyAccount = (name: string) => {
    setFySelectedAccounts((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
  };

  const addFyAccount = (name: string) => {
    setFySelectedAccounts((prev) => new Set(prev).add(name));
    setFyChartPickerSearch("");
  };

  const fyChartPickerCandidates = useMemo(() => {
    const q = fyChartPickerSearch.trim().toLowerCase();
    return chartAvailableAccounts.filter(
      (name) => !fySelectedAccounts.has(name) && (!q || name.toLowerCase().includes(q))
    );
  }, [chartAvailableAccounts, fyChartPickerSearch, fySelectedAccounts]);

  /** Stable order for selected chips (for colour index). */
  const selectedAccountsList = useMemo(
    () => Array.from(selectedAccounts).sort((a, b) => a.localeCompare(b)),
    [selectedAccounts]
  );

  const fySelectedAccountsList = useMemo(
    () => Array.from(fySelectedAccounts).sort((a, b) => a.localeCompare(b)),
    [fySelectedAccounts]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  const slaNavTitle = SL_NAV.find((x) => x.id === slaView)?.label ?? "SLA";

  return (
    <>
      <div className="finance-exec-scope sla-kpi-fin-bridge">
        <div className={`fin-dash-app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
          <nav className={`fin-dash-sidebar ${sidebarCollapsed ? "collapsed" : ""}`} aria-label="SLA dashboard views">
            <div className="fin-dash-nav-section">
              <div className="platform-nav-group-title">Dashboard views</div>
              {SL_NAV.map((item) => (
                <a
                  key={item.id}
                  href="#"
                  className={`platform-nav-item${slaView === item.id ? " active" : ""}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setSlaView(item.id);
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
              <div className="sb-foot-sub">SLA & KPI performance</div>
              <p className="sla-kpi-foot-note">Data from /sla/stats, /sla/data, /sla/timeseries.</p>
            </div>
          </nav>

          <div className="fin-dash-main">
            <header className="fin-dash-topbar sla-kpi-topbar">
              <button
                type="button"
                className="fin-dash-tb-toggle self-center"
                title="Toggle sidebar"
                aria-label="Toggle SLA sidebar"
                onClick={() => setSidebarCollapsed((c) => !c)}
              >
                <Menu className="fin-dash-tb-toggle-icon" strokeWidth={2} aria-hidden />
              </button>
              <div className="sla-kpi-topbar-heading">
                <div className="tb-title platform-page-title" id="sla-page-title">
                  SLA <span>KPI</span>
                </div>
                <div className="sla-kpi-page-subtitle" aria-label="Page summary">
                  <span className="sla-kpi-page-subtitle-lead">Taggd SLA / KPI performance</span>
                  <span className="sla-kpi-page-subtitle-desc">
                    Portfolio compliance, trends, and account drill-downs — wired to your workspace SLA ingestion.
                  </span>
                </div>
              </div>
              <span className="sr-only">Current view: {slaNavTitle}</span>
            </header>

            <div className="fin-dash-content">
              <div className="fin-dash-inline-actions">
                <button type="button" className="btn btn-primary" onClick={() => setSlaMetricDialogOpen(true)}>
                  <i className="fas fa-plus" aria-hidden />
                  Add / edit SLA metric
                </button>
                <label className="btn btn-outline" style={{ cursor: "pointer", margin: 0 }}>
                  ↑ Upload SLA
                  <input type="file" hidden accept=".xlsx,.xls" onChange={(e) => onUpload(e.target.files?.[0])} />
                </label>
              </div>
              {phLike ? (
                <div className="sla-dash-card" style={{ marginBottom: 14 }}>
                  <div className="sla-dash-card-hd">
                    <div className="sla-dash-card-title">Your SLA KPI submissions</div>
                    <div className="sla-dash-card-sub">Project heads — add or edit metric rows for your accounts.</div>
                  </div>
                  <div className="sla-dash-card-bd">
                    <p className="text-[11px] font-mono text-muted-foreground max-w-2xl leading-relaxed">
                      Saved values appear in the portfolio views and SLA table for everyone with SLA access.
                    </p>
                    <div className="mt-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="font-mono text-[11px]"
                        onClick={() => setSlaMetricDialogOpen(true)}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Add / edit SLA metric
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {(slaView === "overview" || slaView === "executive") && (
                <>
                  {loading ? (
                    <SkeletonKpiRow count={4} />
                  ) : (
                    <div className="sla-metric-grid">
                      <div className="sla-metric-card">
                        <div className="sla-metric-card-hd">Metrics met</div>
                        <div className="sla-metric-card-body">
                          <div className="sla-metric-val">{rows.length > 0 ? formatPercent(metPct) : "—"}</div>
                          <div className="sla-metric-sub">
                            {rows.length > 0 ? `${stats?.met_count ?? 0} of ${rows.length} metrics` : "Upload SLA data"}
                          </div>
                        </div>
                      </div>
                      <div className="sla-metric-card">
                        <div className="sla-metric-card-hd">Not met</div>
                        <div className="sla-metric-card-body">
                          <div className="sla-metric-val">{rows.length > 0 ? formatPercent(notMetPct) : "—"}</div>
                          <div className="sla-metric-sub">{rows.length > 0 ? `${stats?.not_met_count ?? 0} metrics` : "—"}</div>
                        </div>
                      </div>
                      <div className="sla-metric-card">
                        <div className="sla-metric-card-hd">Not reported</div>
                        <div className="sla-metric-card-body">
                          <div className="sla-metric-val">{rows.length > 0 ? formatPercent(notReportedPct) : "—"}</div>
                          <div className="sla-metric-sub">{rows.length > 0 ? `${notReportedCount} metrics` : "—"}</div>
                        </div>
                      </div>
                      <div className="sla-metric-card">
                        <div className="sla-metric-card-hd">Total metrics</div>
                        <div className="sla-metric-card-body">
                          <div className="sla-metric-val">{stats?.total_metrics ?? (rows.length || "—")}</div>
                          <div className="sla-metric-sub">
                            {stats?.total_accounts ? `${stats.total_accounts} accounts` : "—"}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {slaView === "executive" && (
                <div className="sla-rank-grid" style={{ marginBottom: 14 }}>
                  <div className="sla-dash-card">
                    <div className="sla-dash-card-hd">
                      <div className="sla-dash-card-title">Top accounts (Met %)</div>
                      <div className="sla-dash-card-sub">Across all months in the loaded timeseries.</div>
                    </div>
                    <div className="sla-dash-card-bd">
                      {executiveBest.length === 0 ? (
                        <div className="sla-empty">No timeseries data.</div>
                      ) : (
                        <SlaExecutiveMetPctBar
                          data={executiveBest.map((r) => ({
                            name: r.account.length > 14 ? `${r.account.slice(0, 13)}…` : r.account,
                            value: r.met_pct,
                          }))}
                          height={132}
                        />
                      )}
                    </div>
                  </div>
                  <div className="sla-dash-card">
                    <div className="sla-dash-card-hd">
                      <div className="sla-dash-card-title">Bottom accounts (Met %)</div>
                      <div className="sla-dash-card-sub">Lowest portfolio Met % (reported met + not met only).</div>
                    </div>
                    <div className="sla-dash-card-bd">
                      {executiveWorst.length === 0 ? (
                        <div className="sla-empty">No timeseries data.</div>
                      ) : (
                        <SlaExecutiveMetPctBar
                          data={executiveWorst.map((r) => ({
                            name: r.account.length > 14 ? `${r.account.slice(0, 13)}…` : r.account,
                            value: r.met_pct,
                          }))}
                          height={132}
                        />
                      )}
                    </div>
                  </div>
                  <div className="sla-dash-card">
                    <div className="sla-dash-card-hd">
                      <div className="sla-dash-card-title">Most improved (FY)</div>
                      <div className="sla-dash-card-sub">{formatPeriodLabelShort(fyMode, "p2")} vs {formatPeriodLabelShort(fyMode, "p1")}.</div>
                    </div>
                    <div className="sla-dash-card-bd">
                      {executiveImproved.length === 0 ? (
                        <div className="sla-empty">Need both periods in data.</div>
                      ) : (
                        <SlaExecutiveDeltaBar
                          data={executiveImproved.map((r) => ({
                            name: r.account.length > 14 ? `${r.account.slice(0, 13)}…` : r.account,
                            delta: (r.p2 ?? 0) - (r.p1 ?? 0),
                          }))}
                          height={132}
                        />
                      )}
                    </div>
                  </div>
                  <div className="sla-dash-card">
                    <div className="sla-dash-card-hd">
                      <div className="sla-dash-card-title">Most declined (FY)</div>
                      <div className="sla-dash-card-sub">Largest drop in Met % between FY windows.</div>
                    </div>
                    <div className="sla-dash-card-bd">
                      {executiveDeclined.length === 0 ? (
                        <div className="sla-empty">Need both periods in data.</div>
                      ) : (
                        <SlaExecutiveDeltaBar
                          data={executiveDeclined.map((r) => ({
                            name: r.account.length > 14 ? `${r.account.slice(0, 13)}…` : r.account,
                            delta: (r.p2 ?? 0) - (r.p1 ?? 0),
                          }))}
                          height={132}
                        />
                      )}
                    </div>
                  </div>
                  <div className="sla-dash-card">
                    <div className="sla-dash-card-hd">
                      <div className="sla-dash-card-title">Regions — {formatPeriodLabelShort(fyMode, "p2")}</div>
                      <div className="sla-dash-card-sub">Met % by region (rolled up).</div>
                    </div>
                    <div className="sla-dash-card-bd">
                      {regionalRankP2.length === 0 ? (
                        <div className="sla-empty">No regional rollup.</div>
                      ) : (
                        <ul className="sla-rank-list">
                          {regionalRankP2.slice(0, 3).map((r) => (
                            <li key={`t-${r.name}`}>
                              <span className="sla-rank-name">Top · {r.name}</span>
                              <span className="sla-rank-val">{formatPercent(r.p2)}</span>
                            </li>
                          ))}
                          {regionalRankP2.slice(-3).map((r) => (
                            <li key={`b-${r.name}`}>
                              <span className="sla-rank-name">Bottom · {r.name}</span>
                              <span className="sla-rank-val">{formatPercent(r.p2)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {slaView === "overview" && (
                <>
                  <div className="sla-dash-card">
                    <div className="sla-dash-card-hd">
                      <div className="sla-dash-card-title">FY portfolio — Met vs Not met (counts)</div>
                      <div className="sla-dash-card-sub">
                        Snapshot totals from time-series in each FY window (same presets as Year-over-Year).
                      </div>
                    </div>
                    <div className="sla-dash-card-bd">
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
                        <span style={{ fontSize: 10, color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace" }}>FY basis:</span>
                        <button
                          type="button"
                          className={`platform-chip${fyMode === "indian" ? " active" : ""}`}
                          style={{ fontSize: 10.5, cursor: "pointer" }}
                          onClick={() => setFyMode("indian")}
                        >
                          Indian FY
                        </button>
                        <button
                          type="button"
                          className={`platform-chip${fyMode === "calendar" ? " active" : ""}`}
                          style={{ fontSize: 10.5, cursor: "pointer" }}
                          onClick={() => setFyMode("calendar")}
                        >
                          Calendar years
                        </button>
                      </div>
                      {portfolioFySnapshots.bar.every((b) => b.met + b.notMet === 0) ? (
                        <div className="sla-empty">No snapshots in the configured FY windows.</div>
                      ) : (
                        <SlaFyPortfolioMetNotMetBar data={portfolioFySnapshots.bar} height={200} />
                      )}
                    </div>
                  </div>
                  <div className="sla-dash-card">
                    <div className="sla-dash-card-hd">
                      <div className="sla-dash-card-title">Portfolio Met % — by month</div>
                      <div className="sla-dash-card-sub">All accounts combined (met ÷ met + not met).</div>
                    </div>
                    <div className="sla-dash-card-bd">
                      {portfolioTrendAllMonths.length === 0 ? (
                        <div className="sla-empty">No SLA time-series yet.</div>
                      ) : (
                        <div style={{ height: 260 }}>
                          <SlaTimeSeriesChart data={portfolioTrendAllMonths} accounts={["Portfolio"]} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="sla-dash-card">
                    <div className="sla-dash-card-hd">
                      <div className="sla-dash-card-title">Compliance by account</div>
                      <div className="sla-dash-card-sub">Met vs not met (latest metric rows).</div>
                    </div>
                    <div className="sla-dash-card-bd">
                      {accountComplianceData.length === 0 ? (
                        <div className="sla-empty">No SLA data yet.</div>
                      ) : (
                        <div style={{ width: "100%", minHeight: 220 }}>
                          <SlaComplianceBar data={accountComplianceData} height={220} />
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

      {/* ─── TIME SERIES TREND (monthly view) ─────────────────────────────── */}
      {(slaView === "monthly") && (
      <>
      <div className="sla-dash-card">
        <div className="sla-dash-card-hd">
          <div className="sla-dash-card-title">SLA compliance trend — % met over time</div>
          <div className="sla-dash-card-sub">Pick clients and month range; same chart as the legacy SLA tab.</div>
        </div>
        <div className="sla-dash-card-bd">
        {/* Selected clients + Add / Search (no long client list) */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
          {selectedAccountsList.length === 0 && (
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
              No clients on chart — use Add or Search to pick clients.
            </span>
          )}
          {selectedAccountsList.map((name, i) => (
            <span
              key={name}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 8px 2px 10px",
                borderRadius: 12,
                fontSize: 10,
                fontFamily: "'DM Mono',monospace",
                border: `1.5px solid ${SERIES_COLORS[i % SERIES_COLORS.length]}`,
                background: `${SERIES_COLORS[i % SERIES_COLORS.length]}22`,
                color: SERIES_COLORS[i % SERIES_COLORS.length],
              }}
            >
              <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={name}>
                {name}
              </span>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => removeChartAccount(name)}
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "none",
                  borderRadius: 8,
                  width: 18,
                  height: 18,
                  lineHeight: 1,
                  cursor: "pointer",
                  color: "var(--text)",
                  fontSize: 12,
                  padding: 0,
                }}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className="platform-chip active"
            style={{ fontSize: 10.5, cursor: "pointer" }}
            onClick={() => { setChartPickerOpen(true); setChartPickerSearch(""); }}
          >
            + Add
          </button>
          <button
            type="button"
            className="platform-chip"
            style={{ fontSize: 10.5, cursor: "pointer" }}
            title="Search and add clients"
            onClick={() => { setChartPickerOpen(true); }}
          >
            ⌕ Search
          </button>
        </div>

        {/* Month range filter */}
        {allMonths.length > 2 && (
          <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace" }}>Range:</span>
            <select
              value={monthFrom}
              onChange={(e) => setMonthFrom(e.target.value)}
              style={{ background: "var(--surface-raised)", border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)", color: "var(--text)", borderRadius: 4, padding: "2px 6px", fontSize: 10, fontFamily: "'DM Mono',monospace" }}
            >
              <option value="all">From (all)</option>
              {allMonths.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select
              value={monthTo}
              onChange={(e) => setMonthTo(e.target.value)}
              style={{ background: "var(--surface-raised)", border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)", color: "var(--text)", borderRadius: 4, padding: "2px 6px", fontSize: 10, fontFamily: "'DM Mono',monospace" }}
            >
              <option value="all">To (all)</option>
              {allMonths.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            {(monthFrom !== "all" || monthTo !== "all") && (
              <button
                className="platform-chip"
                style={{ fontSize: 10, cursor: "pointer" }}
                onClick={() => { setMonthFrom("all"); setMonthTo("all"); }}
              >
                Reset
              </button>
            )}
          </div>
        )}

        {trendChartData.length === 0 || chartAccountNames.length === 0 ? (
          <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {timeseries.length === 0 ? "No SLA time-series data yet" : "Select accounts above to see their trend"}
            </div>
          </div>
        ) : (
          <SlaTimeSeriesChart data={trendChartData} accounts={chartAccountNames} />
        )}
        </div>
      </div>
      <div className="sla-dash-card">
        <div className="sla-dash-card-hd">
          <div className="sla-dash-card-title">Compliance by account (met vs not met)</div>
          <div className="sla-dash-card-sub">Stacked view of current metric rows.</div>
        </div>
        <div className="sla-dash-card-bd">
          {accountComplianceData.length === 0 ? (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No SLA data yet</div>
            </div>
          ) : (
            <div style={{ width: "100%", minHeight: 220 }}>
              <SlaComplianceBar data={accountComplianceData} height={220} />
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {(slaView === "quarterly") && (
        <>
          <div className="sla-dash-card">
            <div className="sla-dash-card-hd">
              <div className="sla-dash-card-title">Quarterly portfolio Met %</div>
              <div className="sla-dash-card-sub">Indian FY quarters — all accounts rolled up (met ÷ met + not met).</div>
            </div>
            <div className="sla-dash-card-bd">
              <div className="platform-table-wrap" style={{ marginBottom: 14 }}>
                <table className="platform-table" style={{ fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th>Quarter</th>
                      <th>Met</th>
                      <th>Not met</th>
                      <th>Met %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quarterlyRollup.map((r) => (
                      <tr key={r.quarter}>
                        <td>{r.quarter}</td>
                        <td>{r.met}</td>
                        <td>{r.not_met}</td>
                        <td style={{ fontFamily: "'DM Mono',monospace" }}>{r.met_pct == null ? "—" : `${r.met_pct}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {quarterlyChartData.length === 0 ? (
                <div className="sla-empty">No quarterly data.</div>
              ) : (
                <div style={{ height: 240 }}>
                  <SlaTimeSeriesChart data={quarterlyChartData} accounts={["Portfolio Met %"]} />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {(slaView === "yearly" || slaView === "account") && (
      <>
      <div className="sla-dash-card">
        <div className="sla-dash-card-hd">
          <div className="sla-dash-card-title">FY comparison — Met % by client</div>
          <div className="sla-dash-card-sub">Compare two FY windows; add clients with + Add.</div>
        </div>
        <div className="sla-dash-card-bd">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 10, color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace" }}>Period:</span>
          <button
            type="button"
            className={`platform-chip${fyMode === "indian" ? " active" : ""}`}
            style={{ fontSize: 10.5, cursor: "pointer" }}
            onClick={() => setFyMode("indian")}
          >
            Indian FY (Apr–Mar)
          </button>
          <button
            type="button"
            className={`platform-chip${fyMode === "calendar" ? " active" : ""}`}
            style={{ fontSize: 10.5, cursor: "pointer" }}
            onClick={() => setFyMode("calendar")}
          >
            Calendar years
          </button>
          <span style={{ fontSize: 10, color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace", marginLeft: 8 }}>Region:</span>
          <select
            value={fyRegionFilter}
            onChange={(e) => setFyRegionFilter(e.target.value)}
            style={{
              background: "var(--surface-raised)",
              border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
              color: "var(--text)",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 10,
              fontFamily: "'DM Mono',monospace",
              maxWidth: 200,
            }}
          >
            <option value="all">All regions</option>
            {regionsForFilter.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
          {fySelectedAccountsList.length === 0 && (
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
              Add clients to compare Met % across the two periods.
            </span>
          )}
          {fySelectedAccountsList.map((name, i) => (
            <span
              key={name}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 8px 2px 10px",
                borderRadius: 12,
                fontSize: 10,
                fontFamily: "'DM Mono',monospace",
                border: `1.5px solid ${SERIES_COLORS[i % SERIES_COLORS.length]}`,
                background: `${SERIES_COLORS[i % SERIES_COLORS.length]}22`,
                color: SERIES_COLORS[i % SERIES_COLORS.length],
              }}
            >
              <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={name}>
                {name}
              </span>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => removeFyAccount(name)}
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "none",
                  borderRadius: 8,
                  width: 18,
                  height: 18,
                  lineHeight: 1,
                  cursor: "pointer",
                  color: "var(--text)",
                  fontSize: 12,
                  padding: 0,
                }}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className="platform-chip active"
            style={{ fontSize: 10.5, cursor: "pointer" }}
            onClick={() => { setFyPickerOpen(true); setFyChartPickerSearch(""); }}
          >
            + Add
          </button>
          <button
            type="button"
            className="platform-chip"
            style={{ fontSize: 10.5, cursor: "pointer" }}
            title="Search and add clients"
            onClick={() => { setFyPickerOpen(true); }}
          >
            ⌕ Search
          </button>
        </div>

        {fyAccountChartData.length === 0 ? (
          <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {timeseries.length === 0 ? "No SLA time-series data yet" : "Select clients above (or widen region filter)"}
            </div>
          </div>
        ) : (
          <SlaFyComparisonLineChart
            data={fyAccountChartData}
            labelP1={formatPeriodLabelShort(fyMode, "p1")}
            labelP2={formatPeriodLabelShort(fyMode, "p2")}
            height={280}
          />
        )}
        </div>
      </div>

      <div className="sla-dash-card">
        <div className="sla-dash-card-hd">
          <div className="sla-dash-card-title">Account-wise FY comparison</div>
          <div className="sla-dash-card-sub">Click a row to open the account drill-down.</div>
        </div>
        <div className="sla-dash-card-bd">
        <div className="platform-table-wrap">
          <table className="platform-table" style={{ fontSize: 10 }}>
            <thead>
              <tr>
                <th>Account</th>
                <th>Region</th>
                <th>Practice Head</th>
                <th>{formatPeriodColumnHeader(fyMode, "p1")}</th>
                <th>{formatPeriodColumnHeader(fyMode, "p2")}</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {fyComparisonTableRows.length === 0 ? (
                <tr><td colSpan={6} style={{ color: "var(--text-muted)", textAlign: "center" }}>No accounts in time-series</td></tr>
              ) : (
                fyComparisonTableRows.map((row) => (
                  <tr
                    key={row.account}
                    style={{ cursor: "pointer" }}
                    onClick={() => setDrillAccount(row.account)}
                  >
                    <td style={{ color: "var(--accent)" }}>{row.account}</td>
                    <td>{row.region}</td>
                    <td>{row.practice_head}</td>
                    <td style={{ fontFamily: "'DM Mono',monospace" }}>{row.p1 == null ? "—" : `${row.p1.toFixed(1)}%`}</td>
                    <td style={{ fontFamily: "'DM Mono',monospace" }}>{row.p2 == null ? "—" : `${row.p2.toFixed(1)}%`}</td>
                    <td style={{ fontFamily: "'DM Mono',monospace" }}>{row.change}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        </div>
      </div>

      {slaView === "yearly" && (
      <>
      <div className="sla-dash-card">
        <div className="sla-dash-card-hd">
          <div className="sla-dash-card-title">Regional FY comparison — Met %</div>
          <div className="sla-dash-card-sub">Rolled up by region for the two FY windows.</div>
        </div>
        <div className="sla-dash-card-bd">
        {fyRegionalChartData.length === 0 ? (
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 11 }}>
            No regional data
          </div>
        ) : (
          <SlaFyComparisonLineChart
            data={fyRegionalChartData}
            labelP1={formatPeriodLabelShort(fyMode, "p1")}
            labelP2={formatPeriodLabelShort(fyMode, "p2")}
            height={280}
          />
        )}
        </div>
      </div>
      <div className="sla-dash-card">
        <div className="sla-dash-card-hd">
          <div className="sla-dash-card-title">Portfolio mix — FY doughnuts</div>
          <div className="sla-dash-card-sub">Met vs not-met snapshot counts per FY window (same denominator as Met %).</div>
        </div>
        <div className="sla-dash-card-bd">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 16,
              alignItems: "start",
            }}
          >
            <SlaMetNotMetDonut
              met={portfolioFySnapshots.p1.met}
              notMet={portfolioFySnapshots.p1.notMet}
              label={formatPeriodLabelShort(fyMode, "p1")}
              height={172}
            />
            <SlaMetNotMetDonut
              met={portfolioFySnapshots.p2.met}
              notMet={portfolioFySnapshots.p2.notMet}
              label={formatPeriodLabelShort(fyMode, "p2")}
              height={172}
            />
          </div>
        </div>
      </div>
      </>
      )}

      {slaView === "account" && (
      <div className="sla-dash-card">
        <div className="sla-dash-card-hd">
          <div className="sla-dash-card-title">Top accounts — FY Met % trend</div>
          <div className="sla-dash-card-sub">Ten clients with the most SLA snapshots in time-series (both FY windows).</div>
        </div>
        <div className="sla-dash-card-bd">
          {accountTopFyTrendData.length === 0 ? (
            <div className="sla-empty">No time-series accounts.</div>
          ) : (
            <SlaFyComparisonLineChart
              data={accountTopFyTrendData}
              labelP1={formatPeriodLabelShort(fyMode, "p1")}
              labelP2={formatPeriodLabelShort(fyMode, "p2")}
              height={280}
            />
          )}
        </div>
      </div>
      )}
      </>
      )}

      {(slaView === "region") && (
        <div className="sla-dash-card">
          <div className="sla-dash-card-hd">
            <div className="sla-dash-card-title">Regional analysis</div>
            <div className="sla-dash-card-sub">FY Met % by region — toggle line vs grouped bars (reference dashboard used bars).</div>
          </div>
          <div className="sla-dash-card-bd">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace" }}>Chart:</span>
              <button
                type="button"
                className={`platform-chip${regionChartKind === "bar" ? " active" : ""}`}
                style={{ fontSize: 10.5, cursor: "pointer" }}
                onClick={() => setRegionChartKind("bar")}
              >
                Grouped bars
              </button>
              <button
                type="button"
                className={`platform-chip${regionChartKind === "line" ? " active" : ""}`}
                style={{ fontSize: 10.5, cursor: "pointer" }}
                onClick={() => setRegionChartKind("line")}
              >
                Line
              </button>
            </div>
            {fyRegionalChartData.length === 0 ? (
              <div className="sla-empty">No regional data</div>
            ) : regionChartKind === "bar" ? (
              <SlaFyComparisonGroupedBar
                data={fyRegionalChartData}
                labelP1={formatPeriodLabelShort(fyMode, "p1")}
                labelP2={formatPeriodLabelShort(fyMode, "p2")}
                height={300}
              />
            ) : (
              <SlaFyComparisonLineChart
                data={fyRegionalChartData}
                labelP1={formatPeriodLabelShort(fyMode, "p1")}
                labelP2={formatPeriodLabelShort(fyMode, "p2")}
                height={300}
              />
            )}
          </div>
        </div>
      )}

      {(slaView === "practice") && (
        <div className="sla-dash-card">
          <div className="sla-dash-card-hd">
            <div className="sla-dash-card-title">Practice head analysis</div>
            <div className="sla-dash-card-sub">Met % by practice head — FY {formatPeriodLabelShort(fyMode, "p1")} vs {formatPeriodLabelShort(fyMode, "p2")}.</div>
          </div>
          <div className="sla-dash-card-bd">
            {fyPracticeChartData.length === 0 ? (
              <div className="sla-empty">No practice-head rollup.</div>
            ) : (
              <SlaFyComparisonLineChart
                data={fyPracticeChartData}
                labelP1={formatPeriodLabelShort(fyMode, "p1")}
                labelP2={formatPeriodLabelShort(fyMode, "p2")}
                height={300}
              />
            )}
          </div>
        </div>
      )}

      {(slaView === "benchmarking") && (
        <>
          <div className="sla-dash-card">
            <div className="sla-dash-card-hd">
              <div className="sla-dash-card-title">Client vs portfolio benchmark</div>
              <div className="sla-dash-card-sub">
                Top clients by {formatPeriodLabelShort(fyMode, "p2")} Met % vs portfolio Met % in the same window (proxy until
                external benchmark feeds exist).
              </div>
            </div>
            <div className="sla-dash-card-bd">
              {benchmarkVsPortfolioData.length === 0 ? (
                <div className="sla-empty">Need FY time-series with Met % in period 2 and a non-empty portfolio rollup.</div>
              ) : (
                <SlaBenchmarkGroupedBar
                  data={benchmarkVsPortfolioData}
                  benchmarkLabel={`Portfolio ${formatPeriodLabelShort(fyMode, "p2")}`}
                  height={280}
                />
              )}
            </div>
          </div>
          <div className="sla-info-box" style={{ marginTop: 12 }}>
            Replace the portfolio proxy with industry benchmarks when benchmark sheets or API feeds are connected.
          </div>
        </>
      )}

      {(slaView === "manual") && (
        <div className="sla-info-box">
          <strong>Using this dashboard:</strong> pick a view in the left rail. Upload SLA Excel from the toolbar or use{" "}
          <strong>Add / edit SLA metric</strong> (role-gated). Click an account in the FY table or a client name in the SLA
          table to open drill-downs. Monthly view supports multi-client trend lines; Year-over-Year uses the Indian FY or
          calendar toggle.
        </div>
      )}

      {slaView === "notreported" && (
        <div className="sla-rank-grid" style={{ marginBottom: 14 }}>
          <div className="sla-dash-card" style={{ gridColumn: "1 / -1" }}>
            <div className="sla-dash-card-hd">
              <div className="sla-dash-card-title">Not reported — summary</div>
              <div className="sla-dash-card-sub">
                {notReportedSnapshotsTotal} not-reported snapshots in time-series; {notReportedCount} metric rows marked not
                reported in the table.
              </div>
            </div>
          </div>
          <div className="sla-dash-card">
            <div className="sla-dash-card-hd">
              <div className="sla-dash-card-title">By account (snapshots)</div>
              <div className="sla-dash-card-sub">Sum of not-reported cells per client across all months.</div>
            </div>
            <div className="sla-dash-card-bd">
              {notReportedByAccount.length === 0 ? (
                <div className="sla-empty">No not-reported snapshots in time-series.</div>
              ) : (
                <SlaNotReportedCountBar data={notReportedByAccount} height={200} />
              )}
            </div>
          </div>
          <div className="sla-dash-card">
            <div className="sla-dash-card-hd">
              <div className="sla-dash-card-title">By region</div>
              <div className="sla-dash-card-sub">Rolled from account → region metadata on SLA rows.</div>
            </div>
            <div className="sla-dash-card-bd">
              {notReportedByRegion.length === 0 ? (
                <div className="sla-empty">No regional not-reported volume.</div>
              ) : (
                <SlaNotReportedCountBar data={notReportedByRegion} height={200} />
              )}
            </div>
          </div>
          <div className="sla-dash-card">
            <div className="sla-dash-card-hd">
              <div className="sla-dash-card-title">By practice head</div>
              <div className="sla-dash-card-sub">Same roll-up using latest practice head per account.</div>
            </div>
            <div className="sla-dash-card-bd">
              {notReportedByPractice.length === 0 ? (
                <div className="sla-empty">No practice-level not-reported volume.</div>
              ) : (
                <SlaNotReportedCountBar data={notReportedByPractice} height={200} />
              )}
            </div>
          </div>
          <div className="sla-dash-card">
            <div className="sla-dash-card-hd">
              <div className="sla-dash-card-title">Monthly trend</div>
              <div className="sla-dash-card-sub">Portfolio not-reported snapshots by month.</div>
            </div>
            <div className="sla-dash-card-bd">
              {notReportedMonthlyChartData.length === 0 ? (
                <div className="sla-empty">No months in time-series.</div>
              ) : (
                <SlaNotReportedCountBar data={notReportedMonthlyChartData} height={200} />
              )}
            </div>
          </div>
        </div>
      )}

      {(slaView === "overview" || slaView === "account" || slaView === "notreported") && (
      <div className="sla-dash-card">
        <div className="sla-dash-card-hd">
          <div className="sla-dash-card-title">SLA performance table</div>
          <div className="sla-dash-card-sub">Metric-level rows — filter by client, period, and status.</div>
        </div>
        <div className="sla-dash-card-bd">
        {/* Filter bar */}
        <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="platform-search"
            placeholder="Filter client / metric..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: "1 1 220px" }}
          />

          {/* Client filter */}
          <select
            value={acctFilter}
            onChange={(e) => setAcctFilter(e.target.value)}
            style={{ background: "var(--surface-raised)", border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)", color: "var(--text)", borderRadius: 4, padding: "3px 8px", fontSize: 10, fontFamily: "'DM Mono',monospace", flex: "0 0 auto", maxWidth: 220 }}
            title="Filter by client"
          >
            <option value="all">All clients</option>
            {allAccounts.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          {/* Reporting period (matches Reported column) */}
          {monthsOrderedForTable.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap" }}>
                Reported period:
              </span>
              <select
                value={tableMonthFrom}
                onChange={(e) => setTableMonthFrom(e.target.value)}
                style={{ background: "var(--surface-raised)", border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)", color: "var(--text)", borderRadius: 4, padding: "3px 8px", fontSize: 10, fontFamily: "'DM Mono',monospace", maxWidth: 160 }}
              >
                <option value="all">From (all)</option>
                {monthsOrderedForTable.map((m) => (
                  <option key={`tf-${m}`} value={m}>{m}</option>
                ))}
              </select>
              <select
                value={tableMonthTo}
                onChange={(e) => setTableMonthTo(e.target.value)}
                style={{ background: "var(--surface-raised)", border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)", color: "var(--text)", borderRadius: 4, padding: "3px 8px", fontSize: 10, fontFamily: "'DM Mono',monospace", maxWidth: 160 }}
              >
                <option value="all">To (all)</option>
                {monthsOrderedForTable.map((m) => (
                  <option key={`tt-${m}`} value={m}>{m}</option>
                ))}
              </select>
              {(tableMonthFrom !== "all" || tableMonthTo !== "all") && (
                <button
                  type="button"
                  className="platform-chip"
                  style={{ fontSize: 10, cursor: "pointer" }}
                  onClick={() => { setTableMonthFrom("all"); setTableMonthTo("all"); }}
                >
                  Clear period
                </button>
              )}
            </div>
          )}

          {/* Status filter chips */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { key: "all",          label: "All" },
              { key: "met",          label: "Met" },
              { key: "breached",     label: "Not Met" },
              { key: "not_reported", label: "Not Reported" },
            ].map((t) => (
              <button
                key={t.key}
                className={`platform-chip${statusFilter === t.key ? " active" : ""}`}
                style={{ fontSize: 10.5, cursor: "pointer" }}
                onClick={() => setStatusFilter(t.key as typeof statusFilter)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginLeft: "auto" }}>
            {filtered.length} rows
          </span>
        </div>

        <div className="platform-table-wrap">
          {loading ? <SkeletonTable rows={6} cols={8} /> : null}
          <table className="platform-table" style={{ display: loading ? "none" : undefined }}>
            <thead>
              <tr><th>Client</th><th>Metric</th><th>Target</th><th>Score</th><th>Reported</th><th>Status</th><th>Group</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ color: "var(--text-muted)", textAlign: "center" }}>
                  {rows.length === 0 ? "Upload SLA data to populate this table" : "No matching records"}
                </td></tr>
              )}
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => setMetric(r)}
                >
                  <td
                    style={{ color: "var(--accent)", cursor: "pointer" }}
                    onClick={(e) => { e.stopPropagation(); setDrillAccount(r.account_name); }}
                  >
                    {r.account_name}
                  </td>
                  <td>{r.metric_label}</td>
                  <td>{r.target ?? "—"}</td>
                  <td>{r.latest_score ?? "—"}</td>
                  <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--text-subtle)" }}>
                    {r.reporting_month && r.reporting_month !== "N/A"
                      ? String(r.reporting_month).slice(0, 10) : "—"}
                  </td>
                  <td><StatusTag status={statusTagFromRaw(r.status)} /></td>
                  <td style={{ color: "var(--text-subtle)", fontSize: 10 }}>{r.metric_group ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </div>
      )}

            </div>
          </div>
        </div>
      </div>

      <PlatformDrawer open={Boolean(metric)} title="SLA Metric Drilldown" onClose={() => setMetric(null)}>
        {metric && (
          <div style={{ display: "grid", gap: 12 }}>
            <div className="platform-card">
              <div style={{ fontSize: 16, fontWeight: 700 }}>{metric.metric_label}</div>
              <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 6 }}>Client: {metric.account_name}</div>
            </div>
            <div className="drawer-section">
              <div className="drawer-section-title">Performance Details</div>
              <div className="kv-row"><span className="kv-key">Target</span><span className="kv-val">{metric.target ?? "—"}</span></div>
              <div className="kv-row"><span className="kv-key">Latest Score</span><span className="kv-val">{metric.latest_score ?? "—"}</span></div>
              <div className="kv-row"><span className="kv-key">Reported</span><span className="kv-val">{metric.reporting_month && metric.reporting_month !== "N/A" ? String(metric.reporting_month).slice(0, 10) : "—"}</span></div>
              <div className="kv-row"><span className="kv-key">Status</span><span className="kv-val">
                <StatusTag status={statusTagFromRaw(metric.status)} />
              </span></div>
              <div className="kv-row"><span className="kv-key">Metric Group</span><span className="kv-val">{metric.metric_group ?? "—"}</span></div>
              {metric.definition && (
                <div className="kv-row"><span className="kv-key">Definition</span><span className="kv-val" style={{ fontSize: 10 }}>{metric.definition}</span></div>
              )}
              {metric.formula && (
                <div className="kv-row"><span className="kv-key">Formula</span><span className="kv-val" style={{ fontSize: 10, fontFamily: "'DM Mono',monospace" }}>{metric.formula}</span></div>
              )}
            </div>
          </div>
        )}
      </PlatformDrawer>

      {/* ─── CHART: ADD / SEARCH CLIENTS ─────────────────────────────────────── */}
      <PlatformDrawer
        open={chartPickerOpen}
        title="Add clients to trend chart"
        onClose={() => { setChartPickerOpen(false); setChartPickerSearch(""); }}
        width={440}
      >
        <div style={{ display: "grid", gap: 12 }}>
          <input
            className="platform-search"
            placeholder="Search clients…"
            value={chartPickerSearch}
            onChange={(e) => setChartPickerSearch(e.target.value)}
            autoFocus
          />
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
            {chartPickerCandidates.length} available
            {selectedAccounts.size > 0 ? ` · ${selectedAccounts.size} on chart` : ""}
          </div>
          <div
            className="platform-table-wrap"
            style={{ maxHeight: "min(360px, 50vh)", borderRadius: 6 }}
          >
            {chartPickerCandidates.length === 0 ? (
              <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 11, textAlign: "center" }}>
                {chartAvailableAccounts.length === 0
                  ? "No timeseries data loaded."
                  : "No matches — try another search or all clients may already be on the chart."}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 4 }}>
                {chartPickerCandidates.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => addChartAccount(name)}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid color-mix(in srgb, var(--accent) 15%, transparent)",
                      background: "var(--bg2)",
                      color: "var(--text)",
                      fontSize: 11,
                      fontFamily: "'DM Mono',monospace",
                      cursor: "pointer",
                    }}
                  >
                    + {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </PlatformDrawer>

      {/* ─── FY CHART: ADD CLIENTS ───────────────────────────────────────────── */}
      <PlatformDrawer
        open={fyPickerOpen}
        title="Add clients to FY comparison chart"
        onClose={() => { setFyPickerOpen(false); setFyChartPickerSearch(""); }}
        width={440}
      >
        <div style={{ display: "grid", gap: 12 }}>
          <input
            className="platform-search"
            placeholder="Search clients…"
            value={fyChartPickerSearch}
            onChange={(e) => setFyChartPickerSearch(e.target.value)}
            autoFocus
          />
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
            {fyChartPickerCandidates.length} available
            {fySelectedAccounts.size > 0 ? ` · ${fySelectedAccounts.size} on chart` : ""}
          </div>
          <div style={{ maxHeight: "min(360px, 50vh)", borderRadius: 6 }} className="platform-table-wrap">
            {fyChartPickerCandidates.length === 0 ? (
              <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 11, textAlign: "center" }}>
                {chartAvailableAccounts.length === 0
                  ? "No timeseries data loaded."
                  : "No matches — try another search or all clients may already be on the chart."}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 4 }}>
                {fyChartPickerCandidates.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => addFyAccount(name)}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid color-mix(in srgb, var(--accent) 15%, transparent)",
                      background: "var(--bg2)",
                      color: "var(--text)",
                      fontSize: 11,
                      fontFamily: "'DM Mono',monospace",
                      cursor: "pointer",
                    }}
                  >
                    + {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </PlatformDrawer>

      {/* ─── ACCOUNT DRILLDOWN DRAWER (monthly matrix + summary) ───────────── */}
      <PlatformDrawer
        open={Boolean(drillAccount)}
        title={
          drillAccount
            ? `Account Drilldown — ${drillAccount}${drillFyTitle ? ` · ${drillFyTitle}` : ""}`
            : "Account Drilldown"
        }
        onClose={() => setDrillAccount(null)}
        width="min(1120px, 96vw)"
      >
        {drillAccount && drillData && (
          <div style={{ display: "grid", gap: 12 }}>
            {/* Orange summary strip — Total measures, Region, Practice Head */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 10,
                background: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 88%, #171717), color-mix(in srgb, var(--accent) 65%, #f97316))",
                color: "#fff",
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
              }}
            >
              <div>
                <div style={{ fontSize: 9, opacity: 0.9, letterSpacing: "0.06em", textTransform: "uppercase" }}>Total measures</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{drillMatrixRows.length || drillData.metrics.length}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, opacity: 0.9, letterSpacing: "0.06em", textTransform: "uppercase" }}>Region</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{drillAccountMeta.region}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, opacity: 0.9, letterSpacing: "0.06em", textTransform: "uppercase" }}>Practice head</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{drillAccountMeta.practice_head}</div>
              </div>
            </div>

            {/* Compact KPI strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {(() => {
                const acctRows = rows.filter((r: any) => r.account_name === drillAccount);
                const metCount = acctRows.filter((r: any) => statusBucket(r.status) === "met").length;
                const notMetCount = acctRows.filter((r: any) => statusBucket(r.status) === "breached").length;
                const total = acctRows.length;
                const denom = metCount + notMetCount;
                return (
                  <>
                    <div className="platform-card" style={{ padding: "8px 10px" }}>
                      <div style={{ fontSize: 9, color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace" }}>MET</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--green)" }}>{metCount}</div>
                    </div>
                    <div className="platform-card" style={{ padding: "8px 10px" }}>
                      <div style={{ fontSize: 9, color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace" }}>NOT MET</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--red)" }}>{notMetCount}</div>
                    </div>
                    <div className="platform-card" style={{ padding: "8px 10px" }}>
                      <div style={{ fontSize: 9, color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace" }}>MET RATE</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>
                        {total > 0 && denom > 0 ? `${Math.round((metCount / denom) * 100)}%` : "—"}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Monthly performance matrix — first 3 cols frozen; months + YTD scroll horizontally */}
            <div className="sla-drill-matrix-section">
              <div style={{ fontSize: 9, color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace", marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Performance by month
              </div>
              {accountMetricsLoading ? (
                <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 16 }}>Loading monthly matrix…</div>
              ) : (
                <div className="sla-drill-matrix-wrap">
                  <table className="sla-drill-matrix">
                    <thead>
                      <tr>
                        <th className="sla-drill-th-name">Performance measure</th>
                        <th className="sla-drill-th-penalty">Penalty</th>
                        <th className="sla-drill-th-target">Target</th>
                        {drillMonthColumns.map((ym) => (
                          <th key={ym}>{formatMonthColHeader(ym)}</th>
                        ))}
                        <th className="sla-drill-th-ytd">YTD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillMatrixRows.map((row) => {
                        const pen = penaltyLabel(row.metric_nature);
                        const ytd = ytdRollup(row.timeline, drillMonthColumns);
                        return (
                          <tr key={row.definition_id}>
                            <td className="sla-drill-td-name">{row.metric_label}</td>
                            <td className="sla-drill-td-penalty">
                              {pen.ok ? (
                                <span style={{ color: "var(--green)" }}>✓</span>
                              ) : (
                                <span style={{ color: "var(--amber)" }}>⚠</span>
                              )}{" "}
                              {pen.label}
                            </td>
                            <td className="sla-drill-td-target">{row.target != null ? String(row.target) : "—"}</td>
                            {drillMonthColumns.map((ym) => {
                              const pt = row.timeline.find((t) => t.month === ym);
                              const st = cellState(pt);
                              const cls =
                                st === "met"
                                  ? "sla-drill-cell--met"
                                  : st === "not_met"
                                    ? "sla-drill-cell--not_met"
                                    : st === "not_reported"
                                      ? "sla-drill-cell--nr"
                                      : "sla-drill-cell--empty";
                              return (
                                <td key={ym} className={cls}>
                                  {st === "empty" && (
                                    <>
                                      <div>—</div>
                                      <div className="sla-drill-cell-sub">Not Reported</div>
                                    </>
                                  )}
                                  {st === "met" && (
                                    <>
                                      <div className="sla-drill-cell-icon">✓ Met</div>
                                      {pt?.met_pct != null && <div className="sla-drill-cell-val">{formatPercent(pt.met_pct)}</div>}
                                    </>
                                  )}
                                  {st === "not_met" && (
                                    <>
                                      <div className="sla-drill-cell-icon sla-drill-cell-icon--bad">✗ Not Met</div>
                                      {pt?.met_pct != null && <div className="sla-drill-cell-val">{formatPercent(pt.met_pct)}</div>}
                                    </>
                                  )}
                                  {st === "not_reported" && (
                                    <>
                                      <div>—</div>
                                      <div className="sla-drill-cell-sub">Not Reported</div>
                                    </>
                                  )}
                                </td>
                              );
                            })}
                            <td className="sla-drill-cell--ytd">
                              {ytd.state === "empty" || drillMonthColumns.length === 0 ? (
                                <>
                                  <div>—</div>
                                  <div className="sla-drill-cell-sub">—</div>
                                </>
                              ) : (
                                <>
                                  <div className="sla-drill-cell-ytd-pct">
                                    {ytd.met_pct != null ? formatPercent(ytd.met_pct) : "—"}
                                  </div>
                                  <div className="sla-drill-cell-sub">
                                    {ytd.state === "met" ? "✓ Met" : ytd.state === "not_met" ? "✗ Not Met" : "Not Reported"}
                                  </div>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Trend for this account (compact) */}
            {drillData.ts && drillData.ts.timeline.length > 1 && (
              <div>
                <div style={{ fontSize: 9, color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace", marginBottom: 8, textTransform: "uppercase" }}>
                  Met % over time
                </div>
                <SlaTimeSeriesChart
                  data={drillData.ts.timeline.map((t: any) => ({
                    month: t.month,
                    [drillAccount as string]: t.met_pct,
                  }))}
                  accounts={[drillAccount as string]}
                />
              </div>
            )}
          </div>
        )}
      </PlatformDrawer>

      <SlaMetricFormDialog
        open={slaMetricDialogOpen}
        onOpenChange={setSlaMetricDialogOpen}
        metricOptions={slaMetricOptions}
        onSaved={reloadSla}
      />
    </>
  );
}
