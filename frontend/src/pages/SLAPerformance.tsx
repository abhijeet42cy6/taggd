import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, adminApi, generateSlaInsights, invalidateCache, queries } from "@/lib/api";
import type { PlatformUserLite } from "@/components/platform/NewContractOrgFlow";
import {
  SlaAccountMultiProjectPicker,
  SlaMultiStringPicker,
  SlaPracticeHeadMultiPicker,
} from "@/components/platform/SlaGlobalFilterPickers";
import { isProjectHeadLike, useAuth } from "@/lib/auth";
import { cn, formatPercent } from "@/lib/utils";
import {
  aggregatePeriod,
  formatPeriodColumnHeaderFromData,
  formatPeriodLabelShortFromData,
  periodMonthSetsFromData,
  type FyMode,
} from "@/lib/sla-fy";
import { slaRagDisplayLabel, slaRagUiBucket } from "@/lib/sla-rag";
import { StatusTag } from "@/components/platform/PlatformBlocks";
import { SkeletonKpiRow, SkeletonTable } from "@/components/platform/Skeleton";
import {
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
import {
  SlaAccountHealthRail,
  SlaBifurcationTiles,
  SlaExportInlineBar,
  SlaInsightsStrip,
  SlaRegionZonesMap,
  regionToZoneFromLabel,
  type SlaBifurcationSlice,
  type SlaHealthBucket,
  type SlaInsight,
  type SlaZoneStat,
} from "@/components/platform/SlaDashInspired";
import { SlaMetricFormDialog } from "@/components/platform/SlaMetricFormDialog";
import { slaRowsVm } from "@/lib/view-models/sla";
import { Calendar, Check, ChevronDown, Filter, MapPin, Menu, Plus, Tags, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import "@/styles/finance-exec-dashboard.css";
import "@/styles/new-contract-panel.css";
import "@/styles/sla-dash-ui.css";

// ─── Colour palette to match SlaTimeSeriesChart ────────────────────────────────
const SERIES_COLORS = [
  "var(--accent)", "var(--green)", "var(--amber)", "var(--red)", "var(--accent2)",
  "#a78bfa", "#fb923c", "#34d399", "#f472b6", "#60a5fa",
];

// rag status → display + filter buckets: `@/lib/sla-rag` (Met/Not Met + template RAG colours)
const statusTagFromRaw = slaRagDisplayLabel;
const statusBucket = slaRagUiBucket;

/** Latest row per account for region / practice head (by reporting month / period). */
function monthSortKey(r: any): string {
  const rm = String(r.reporting_month ?? "").trim();
  if (rm && rm !== "N/A" && /^\d{4}-\d{2}/.test(rm)) return rm.slice(0, 7);
  const ps = r.period_start;
  if (ps && typeof ps === "string" && /^\d{4}-\d{2}/.test(ps)) return ps.slice(0, 7);
  return "";
}

function regionalHeadFromRow(r: any): string {
  const v = r?.regional_head ?? r?.regionalHead;
  const s = v != null ? String(v).trim() : "";
  return s || "—";
}

function accountMetaByAccount(rows: any[]): Map<string, { region: string; practice_head: string; regional_head: string }> {
  const by = new Map<string, any[]>();
  for (const r of rows) {
    const a = r.account_name || "Unknown";
    if (!by.has(a)) by.set(a, []);
    by.get(a)!.push(r);
  }
  const out = new Map<string, { region: string; practice_head: string; regional_head: string }>();
  for (const [acc, list] of by) {
    const sorted = [...list].sort((a, b) => monthSortKey(b).localeCompare(monthSortKey(a)));
    const best = sorted[0];
    out.set(acc, {
      region: (best?.region && String(best.region).trim()) || "—",
      practice_head: (best?.practice_head && String(best.practice_head).trim()) || "—",
      regional_head: regionalHeadFromRow(best),
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

/** Portfolio-wide SLA filters (draft + apply) — scoped to loaded /sla/data + /sla/timeseries. */
type SlaGlobalFilters = {
  fiscalYear: "all" | string;
  regionalHeads: string[];
  regions: string[];
  practiceHeads: string[];
  accounts: string[];
  /** Inclusive month range (`YYYY-MM`), filtered to months present in loaded data on apply. */
  monthFrom: string;
  monthTo: string;
  metricNature: "all" | "contractual" | "internal";
};

const SLA_GF_INITIAL: SlaGlobalFilters = {
  fiscalYear: "all",
  regionalHeads: [],
  regions: [],
  practiceHeads: [],
  accounts: [],
  monthFrom: "",
  monthTo: "",
  metricNature: "all",
};

function indianFyLabelsFromMonths(allMonths: string[]): string[] {
  const s = new Set<string>();
  for (const m of allMonths) {
    const t = indianFyTitleFromMonth(m);
    if (t) s.add(t);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

function monthsMatchingIndianFy(allMonths: string[], fyLabel: string): Set<string> {
  const out = new Set<string>();
  for (const m of allMonths) {
    if (indianFyTitleFromMonth(m) === fyLabel) out.add(m);
  }
  return out;
}

function effectiveGlobalMonthSet(gf: SlaGlobalFilters, allMonths: string[]): Set<string> | null {
  let acc: Set<string> | null = null;
  if (gf.fiscalYear !== "all") {
    acc = monthsMatchingIndianFy(allMonths, gf.fiscalYear);
  }
  const rawFrom = (gf.monthFrom || "").trim();
  const rawTo = (gf.monthTo || "").trim();
  if (rawFrom || rawTo) {
    let lo = rawFrom || rawTo;
    let hi = rawTo || rawFrom;
    if (lo > hi) [lo, hi] = [hi, lo];
    const pick = new Set(allMonths.filter((m) => m >= lo && m <= hi));
    if (acc == null) acc = pick;
    else acc = new Set([...acc].filter((m) => pick.has(m)));
  }
  return acc;
}

function buildAllowedAccountsForGlobalFilters(
  dim: Map<string, { region: string; practice_head: string; regional_head: string }>,
  gf: SlaGlobalFilters,
): Set<string> {
  const out = new Set<string>();
  for (const [acc, d] of dim) {
    if (gf.regionalHeads.length > 0 && !gf.regionalHeads.includes(d.regional_head)) continue;
    if (gf.regions.length > 0 && !gf.regions.includes(d.region)) continue;
    if (gf.practiceHeads.length > 0 && !gf.practiceHeads.includes(d.practice_head)) continue;
    if (gf.accounts.length > 0 && !gf.accounts.includes(acc)) continue;
    out.add(acc);
  }
  return out;
}

function globalFilterRows(rawRows: any[], gf: SlaGlobalFilters, allMonthsFromTs: string[]): any[] {
  const dim = accountMetaByAccount(rawRows);
  const allowed = buildAllowedAccountsForGlobalFilters(dim, gf);
  const monthSet = effectiveGlobalMonthSet(gf, allMonthsFromTs);
  return rawRows.filter((r) => {
    const acc = r.account_name || "Unknown";
    if (!allowed.has(acc)) return false;
    if (gf.metricNature !== "all") {
      const label = kpiTypeLabel(r.metric_nature).toLowerCase();
      if (gf.metricNature === "contractual" && !label.includes("contract")) return false;
      if (gf.metricNature === "internal" && !label.includes("internal")) return false;
    }
    if (monthSet != null) {
      const rm = String((r as any).reporting_month ?? "").trim();
      if (!rm || rm === "N/A" || !monthSet.has(rm)) return false;
    }
    return true;
  });
}

function globalFilterTimeseries(
  rawTs: any[],
  gf: SlaGlobalFilters,
  rawRows: any[],
  allMonthsFromTs: string[],
): any[] {
  const dim = accountMetaByAccount(rawRows);
  const allowed = buildAllowedAccountsForGlobalFilters(dim, gf);
  const monthSet = effectiveGlobalMonthSet(gf, allMonthsFromTs);
  return rawTs
    .filter((a: any) => allowed.has(a.account_name))
    .map((a: any) => ({
      ...a,
      timeline:
        monthSet == null
          ? a.timeline
          : (a.timeline as any[]).filter((t: any) => monthSet.has(t.month)),
    }));
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

function isPenaltyNature(metricNature: string | null | undefined): boolean {
  return !penaltyLabel(metricNature).ok;
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

/** Calendar-year quarter (Jan–Mar = Q1 … Oct–Dec = Q4). */
function monthToCalendarQuarter(ym: string): "Q1" | "Q2" | "Q3" | "Q4" | null {
  if (!ym || ym.length < 7) return null;
  const mo = parseInt(ym.slice(5, 7), 10);
  if (Number.isNaN(mo)) return null;
  if (mo <= 3) return "Q1";
  if (mo <= 6) return "Q2";
  if (mo <= 9) return "Q3";
  return "Q4";
}

function monthToQuarterForMode(ym: string, mode: FyMode): "Q1" | "Q2" | "Q3" | "Q4" | null {
  return mode === "calendar" ? monthToCalendarQuarter(ym) : monthToIndianQuarter(ym);
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
  | "notreported";

const SL_NAV: { id: SlaDashView; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "fa-gauge-high" },
  { id: "executive", label: "Executive View", icon: "fa-wand-magic-sparkles" },
  { id: "monthly", label: "Monthly Performance", icon: "fa-calendar" },
  { id: "quarterly", label: "Quarterly Performance", icon: "fa-calendar-week" },
  { id: "yearly", label: "Year-over-Year", icon: "fa-right-left" },
  { id: "account", label: "Project Analysis", icon: "fa-building" },
  { id: "region", label: "Regional Analysis", icon: "fa-map-location-dot" },
  { id: "practice", label: "Practice Head Analysis", icon: "fa-users" },
  { id: "notreported", label: "Not Reported Analysis", icon: "fa-triangle-exclamation" },
];

const SLA_FIN_SIDEBAR_NARROW_MQ = "(max-width: 900px)";

export function SLAPerformance() {
  const { user } = useAuth();
  const phLike = isProjectHeadLike(user);

  // Core data (API); portfolio filters narrow derived `rows` / `timeseries` below
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [rawTimeseries, setRawTimeseries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [slaGfDraft, setSlaGfDraft] = useState<SlaGlobalFilters>(SLA_GF_INITIAL);
  const [slaGfApplied, setSlaGfApplied] = useState<SlaGlobalFilters>(SLA_GF_INITIAL);
  const [slaAdvFiltersOpen, setSlaAdvFiltersOpen] = useState(false);
  const [slaFilterUsers, setSlaFilterUsers] = useState<PlatformUserLite[]>([]);

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
  /** KPI card → list metrics in drawer (reference SLA Dash drilldown). */
  const [kpiDrillOpen, setKpiDrillOpen] = useState(false);
  const [kpiDrillKind, setKpiDrillKind] = useState<"met" | "breached" | "not_reported" | "all">("all");
  const [bifurDrillKey, setBifurDrillKey] = useState<string | null>(null);
  /** Optional: filter SLA table rows by coarse map zone (North / South / …). */
  const [tableRegionZone, setTableRegionZone] = useState<string | null>(null);
  /** Filter table to accounts in a health tier (red / amber / green). */
  const [healthAccountPick, setHealthAccountPick] = useState<Set<string> | null>(null);
  /** Label for health chip in Advanced filters (set together with `healthAccountPick`). */
  const [healthFilterTier, setHealthFilterTier] = useState<"red" | "amber" | "green" | null>(null);
  /** Gemini-generated overview insights (fallback to `slaDashboardInsights` when null / loading error). */
  const [slaLlmInsights, setSlaLlmInsights] = useState<SlaInsight[] | null>(null);
  const [slaLlmInsightsLoading, setSlaLlmInsightsLoading] = useState(false);
  const [slaView, setSlaView] = useState<SlaDashView>("overview");
  /** On narrow SLA layout the sidebar is off-canvas until opened; start collapsed so the toggle does something useful. */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(SLA_FIN_SIDEBAR_NARROW_MQ).matches;
  });
  const [regionChartKind, setRegionChartKind] = useState<"line" | "bar">("bar");

  const slaMetricOptions = useMemo(() => {
    const seen = new Set<number>();
    const out: { id: number; label: string; account: string }[] = [];
    for (const r of rawRows) {
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
  }, [rawRows]);

  const reloadSla = useCallback(async () => {
    invalidateCache("sla");
    const [d, ts] = await Promise.allSettled([queries.slaData(), queries.slaTimeseries()]);
    if (d.status === "fulfilled") setRawRows(slaRowsVm(d.value || []));
    if (ts.status === "fulfilled") {
      setRawTimeseries(ts.value || []);
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
      const [d, ts] = await Promise.allSettled([queries.slaData(), queries.slaTimeseries()]);
      if (d.status === "fulfilled") setRawRows(slaRowsVm(d.value || []));
      if (ts.status === "fulfilled") {
        setRawTimeseries(ts.value || []);
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
    if (!healthAccountPick || healthAccountPick.size === 0) setHealthFilterTier(null);
  }, [healthAccountPick]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      queries.taskAssignableUsers().catch(() => [] as PlatformUserLite[]),
      adminApi.listUsers().catch(() => []),
    ]).then(([a, b]) => {
      const map = new Map<number, PlatformUserLite>();
      const add = (u: { id: number; email: string; role: string }) =>
        map.set(u.id, { id: u.id, email: u.email, role: u.role });
      a.forEach(add);
      b.forEach((u) => add({ id: u.id, email: u.email, role: u.role }));
      if (!cancelled) setSlaFilterUsers([...map.values()]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  // ─── Sorted month list from raw timeseries (for FY / month filter options) ──
  const allMonths = useMemo<string[]>(() => {
    const monthSet = new Set<string>();
    rawTimeseries.forEach((acc: any) =>
      acc.timeline.forEach((t: any) => monthSet.add(t.month)),
    );
    return Array.from(monthSet).sort((a, b) => a.localeCompare(b));
  }, [rawTimeseries]);

  const onTrendChartMonthFromChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!v) {
      setMonthFrom("all");
      return;
    }
    setMonthFrom(v);
    setMonthTo((prev) => (prev !== "all" && prev < v ? v : prev));
  }, []);

  const onTrendChartMonthToChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!v) {
      setMonthTo("all");
      return;
    }
    setMonthTo(v);
    setMonthFrom((prev) => (prev !== "all" && prev > v ? v : prev));
  }, []);

  const onTableMonthFromChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!v) {
      setTableMonthFrom("all");
      return;
    }
    setTableMonthFrom(v);
    setTableMonthTo((prev) => (prev !== "all" && prev < v ? v : prev));
  }, []);

  const onTableMonthToChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!v) {
      setTableMonthTo("all");
      return;
    }
    setTableMonthTo(v);
    setTableMonthFrom((prev) => (prev !== "all" && prev > v ? v : prev));
  }, []);

  const rows = useMemo(
    () => globalFilterRows(rawRows, slaGfApplied, allMonths),
    [rawRows, slaGfApplied, allMonths],
  );
  const timeseries = useMemo(
    () => globalFilterTimeseries(rawTimeseries, slaGfApplied, rawRows, allMonths),
    [rawTimeseries, slaGfApplied, rawRows, allMonths],
  );

  /** Account health + zone “overview” filters narrow KPIs / charts / LLM payload (table still uses `filtered`). */
  const kpiViewAccountSet = useMemo(() => {
    const z = tableRegionZone;
    const h = healthAccountPick && healthAccountPick.size > 0 ? healthAccountPick : null;
    if (!z && !h) return null;
    const zoneAccounts =
      z == null
        ? null
        : new Set(
            rows
              .filter((r) => regionToZoneFromLabel(String((r as any).region ?? "")) === z)
              .map((r) => String((r as any).account_name || "Unknown")),
          );
    if (h && z && zoneAccounts) return new Set([...h].filter((a) => zoneAccounts.has(a)));
    if (h) return h;
    return zoneAccounts as Set<string>;
  }, [rows, tableRegionZone, healthAccountPick]);

  const slaKpiScopeRows = useMemo(() => {
    if (!kpiViewAccountSet) return rows;
    return rows.filter((r) => kpiViewAccountSet.has(String((r as any).account_name || "Unknown")));
  }, [rows, kpiViewAccountSet]);

  const timeseriesKpiScoped = useMemo(() => {
    if (!kpiViewAccountSet) return timeseries;
    return (timeseries as any[]).filter((a: any) => kpiViewAccountSet!.has(a.account_name));
  }, [timeseries, kpiViewAccountSet]);

  const accountMetaFull = useMemo(() => accountMetaByAccount(rawRows), [rawRows]);
  const slaGfFyOptions = useMemo(() => indianFyLabelsFromMonths(allMonths), [allMonths]);
  const slaGfRegionalHeadOpts = useMemo(() => {
    const s = new Set<string>();
    accountMetaFull.forEach((d) => {
      if (d.regional_head && d.regional_head !== "—") s.add(d.regional_head);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [accountMetaFull]);
  const slaGfRegionOpts = useMemo(() => {
    const s = new Set<string>();
    accountMetaFull.forEach((d) => {
      if (d.region && d.region !== "—") s.add(d.region);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [accountMetaFull]);
  const slaGfPracticeHeadOpts = useMemo(() => {
    const s = new Set<string>();
    accountMetaFull.forEach((d) => {
      if (d.practice_head && d.practice_head !== "—") s.add(d.practice_head);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [accountMetaFull]);
  const slaGfProjects = useMemo(() => {
    const byName = new Map<string, { id: number; account_name: string; engagement_name?: string | null }>();
    for (const r of rawRows) {
      const name = String((r as any).account_name || "").trim();
      if (!name) continue;
      const id = Number((r as any).project_id);
      if (byName.has(name)) continue;
      if (Number.isFinite(id) && id > 0) {
        byName.set(name, { id, account_name: name, engagement_name: null });
      }
    }
    for (const r of rawRows) {
      const name = String((r as any).account_name || "").trim();
      if (!name || byName.has(name)) continue;
      byName.set(name, { id: 0, account_name: name, engagement_name: null });
    }
    return [...byName.values()].sort((a, b) => a.account_name.localeCompare(b.account_name));
  }, [rawRows]);
  const slaGfMonthOpts = useMemo(() => [...allMonths], [allMonths]);

  // ─── Derived: KPI numbers (from filtered metric rows) ────────────────────────
  /** Met % and Not met % use denominator (met + not met) only — Not reported rows excluded. */
  const slaKpiMetNotMet = useMemo(() => {
    let met = 0;
    let breached = 0;
    for (const r of slaKpiScopeRows) {
      const b = statusBucket(r.status);
      if (b === "met") met++;
      else if (b === "breached") breached++;
    }
    const withOutcome = met + breached;
    const metPct = withOutcome > 0 ? Math.round((met / withOutcome) * 1000) / 10 : 0;
    const notMetPct = withOutcome > 0 ? Math.round((breached / withOutcome) * 1000) / 10 : 0;
    return { met, breached, withOutcome, metPct, notMetPct };
  }, [slaKpiScopeRows]);
  const notReportedCount = useMemo(
    () => slaKpiScopeRows.filter((r: any) => statusBucket(r.status) === "not_reported").length,
    [slaKpiScopeRows],
  );
  const notReportedPct =
    slaKpiScopeRows.length > 0 ? Math.round((notReportedCount / slaKpiScopeRows.length) * 100) : 0;
  const scopedAccountCount = useMemo(
    () => new Set(slaKpiScopeRows.map((r: any) => r.account_name || "Unknown")).size,
    [slaKpiScopeRows],
  );

  // ─── All accounts list (full workspace — local table filter) ────────────────
  const allAccounts = useMemo(
    () => [...new Set(rawRows.map((r: any) => r.account_name || "Unknown"))].sort(),
    [rawRows],
  );

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
    for (const r of rawRows) {
      const m = String((r as any).reporting_month ?? "").trim();
      if (m && m !== "N/A" && !seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [allMonths, rawRows]);

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
        const denom = t.met + t.not_met;
        const pct =
          t.met_pct != null && Number.isFinite(Number(t.met_pct))
            ? Number(t.met_pct)
            : denom > 0
              ? Math.round((t.met / denom) * 1000) / 10
              : null;
        lookup[acc.account_name][t.month] = pct;
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
    if (!slaKpiScopeRows.length) return [];
    const byAccount: Record<string, { met: number; notMet: number; notReported: number }> = {};
    for (const r of slaKpiScopeRows) {
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
  }, [slaKpiScopeRows]);

  const accountMetaMap = useMemo(() => accountMetaByAccount(rawRows), [rawRows]);

  const { p1: p1Months, p2: p2Months } = useMemo(
    () => periodMonthSetsFromData(fyMode, allMonths),
    [fyMode, allMonths],
  );
  const fyLabelP1 = useMemo(() => formatPeriodLabelShortFromData(fyMode, "p1", allMonths), [fyMode, allMonths]);
  const fyLabelP2 = useMemo(() => formatPeriodLabelShortFromData(fyMode, "p2", allMonths), [fyMode, allMonths]);
  const fyColH1 = useMemo(() => formatPeriodColumnHeaderFromData(fyMode, "p1", allMonths), [fyMode, allMonths]);
  const fyColH2 = useMemo(() => formatPeriodColumnHeaderFromData(fyMode, "p2", allMonths), [fyMode, allMonths]);

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
    const regions = new Set<string>();
    accountMetaMap.forEach((m) => {
      const reg = (m.region || "").trim();
      if (reg && reg !== "—") regions.add(reg);
    });
    const roll = new Map<string, { met1: number; nm1: number; met2: number; nm2: number }>();
    for (const reg of regions) roll.set(reg, { met1: 0, nm1: 0, met2: 0, nm2: 0 });
    for (const acc of timeseriesKpiScoped) {
      const region = (accountMetaMap.get(acc.account_name)?.region || "").trim();
      if (!region || region === "—") continue;
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
    return [...regions]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const v = roll.get(name) ?? { met1: 0, nm1: 0, met2: 0, nm2: 0 };
        const t1 = v.met1 + v.nm1;
        const t2 = v.met2 + v.nm2;
        return {
          name,
          p1: t1 > 0 ? Math.round((v.met1 / t1) * 1000) / 10 : null,
          p2: t2 > 0 ? Math.round((v.met2 / t2) * 1000) / 10 : null,
        };
      });
  }, [timeseriesKpiScoped, p1Months, p2Months, accountMetaMap]);

  const fyComparisonTableRows = useMemo(() => {
    const names = [...new Set(timeseriesKpiScoped.map((a: any) => a.account_name))].sort((a, b) =>
      String(a).localeCompare(String(b)),
    );
    return names.map((account) => {
      const meta = accountMetaMap.get(account) || { region: "—", practice_head: "—" };
      const ts = timeseriesKpiScoped.find((t: any) => t.account_name === account);
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
  }, [timeseriesKpiScoped, accountMetaMap, p1Months, p2Months]);

  const fyPracticeChartData = useMemo(() => {
    const roll = new Map<string, { met1: number; nm1: number; met2: number; nm2: number }>();
    for (const acc of timeseriesKpiScoped) {
      const ph = (accountMetaMap.get(acc.account_name)?.practice_head || "").trim() || "Unknown";
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
          name,
          p1: t1 > 0 ? Math.round((v.met1 / t1) * 1000) / 10 : null,
          p2: t2 > 0 ? Math.round((v.met2 / t2) * 1000) / 10 : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [timeseriesKpiScoped, p1Months, p2Months, accountMetaMap]);

  const portfolioTrendAllMonths = useMemo((): SlaSeriesPoint[] => {
    return allMonths.map((month) => {
      let met = 0;
      let nm = 0;
      for (const acc of timeseriesKpiScoped) {
        const t = acc.timeline.find((x: any) => x.month === month);
        if (t) {
          met += t.met;
          nm += t.not_met;
        }
      }
      const denom = met + nm;
      return { month, Portfolio: denom > 0 ? Math.round((met / denom) * 1000) / 10 : null };
    });
  }, [allMonths, timeseriesKpiScoped]);

  /** Portfolio Met % limited to the Monthly view month-range picker (for the headline trend). */
  const portfolioMetPctForFilteredMonths = useMemo(() => {
    const allowed = new Set(filteredMonths);
    return portfolioTrendAllMonths.filter((row) => allowed.has(String(row.month)));
  }, [portfolioTrendAllMonths, filteredMonths]);

  /** Same FY windows as YoY (p1 / p2): Met % per quarter within each FY — not a cumulative mix across years. */
  const quarterlyFyQuarterCompare = useMemo(() => {
    const qs = ["Q1", "Q2", "Q3", "Q4"] as const;
    return qs.map((q) => {
      const p1q = new Set(
        [...p1Months].filter((m) => monthToQuarterForMode(m, fyMode) === q),
      );
      const p2q = new Set(
        [...p2Months].filter((m) => monthToQuarterForMode(m, fyMode) === q),
      );
      let p1m = 0;
      let p1nm = 0;
      let p2m = 0;
      let p2nm = 0;
      for (const acc of timeseriesKpiScoped) {
        for (const t of acc.timeline) {
          if (p1q.has(t.month)) {
            p1m += t.met;
            p1nm += t.not_met;
          }
          if (p2q.has(t.month)) {
            p2m += t.met;
            p2nm += t.not_met;
          }
        }
      }
      const t1 = p1m + p1nm;
      const t2 = p2m + p2nm;
      return {
        quarter: q,
        p1_met: p1m,
        p1_not_met: p1nm,
        p2_met: p2m,
        p2_not_met: p2nm,
        p1_pct: t1 > 0 ? Math.round((p1m / t1) * 1000) / 10 : null,
        p2_pct: t2 > 0 ? Math.round((p2m / t2) * 1000) / 10 : null,
      };
    });
  }, [timeseriesKpiScoped, p1Months, p2Months, fyMode]);

  const quarterlyCompareChartData = useMemo(
    () =>
      quarterlyFyQuarterCompare.map((r) => ({
        name: r.quarter,
        p1: r.p1_pct,
        p2: r.p2_pct,
      })),
    [quarterlyFyQuarterCompare],
  );

  /** Account Met % from latest decisive metric rows (same basis as KPI cards / SLA table). */
  const accountMetPctFromLatestRows = useMemo(() => {
    const by = new Map<string, { met: number; nm: number }>();
    for (const r of slaKpiScopeRows) {
      const acc = String((r as any).account_name || "Unknown");
      const b = statusBucket((r as any).status);
      if (!by.has(acc)) by.set(acc, { met: 0, nm: 0 });
      const c = by.get(acc)!;
      if (b === "met") c.met++;
      else if (b === "breached") c.nm++;
    }
    return [...by.entries()]
      .map(([account, c]) => {
        const t = c.met + c.nm;
        return { account, met_pct: t > 0 ? Math.round((c.met / t) * 1000) / 10 : null as number | null };
      })
      .filter((x): x is { account: string; met_pct: number } => x.met_pct != null);
  }, [slaKpiScopeRows]);

  const executiveBest = useMemo(
    () => [...accountMetPctFromLatestRows].sort((a, b) => b.met_pct - a.met_pct).slice(0, 5),
    [accountMetPctFromLatestRows],
  );
  const executiveWorst = useMemo(
    () => [...accountMetPctFromLatestRows].sort((a, b) => a.met_pct - b.met_pct).slice(0, 5),
    [accountMetPctFromLatestRows],
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
    for (const acc of timeseriesKpiScoped) {
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
    const p1Tot = p1m + p1nm;
    const p1_pct = p1Tot > 0 ? Math.round((p1m / p1Tot) * 1000) / 10 : null;
    return {
      bar: [
        { period: fyLabelP1, met: p1m, notMet: p1nm },
        { period: fyLabelP2, met: p2m, notMet: p2nm },
      ],
      p1: { met: p1m, notMet: p1nm },
      p2: { met: p2m, notMet: p2nm },
      p1_pct,
      p2_pct,
    };
  }, [timeseriesKpiScoped, p1Months, p2Months, fyMode, fyLabelP1, fyLabelP2]);

  const slaBifurcationSlices = useMemo((): SlaBifurcationSlice[] => {
    const agg = (pred: (r: any) => boolean) => {
      let met = 0;
      let notMet = 0;
      for (const r of slaKpiScopeRows) {
        if (!pred(r)) continue;
        const b = statusBucket(r.status);
        if (b === "met") met++;
        else if (b === "breached") notMet++;
      }
      const total = met + notMet;
      const pct = total > 0 ? (met / total) * 100 : 0;
      return { met, notMet, total, pct };
    };
    const contractual = (r: any) => kpiTypeLabel(r.metric_nature).toLowerCase().includes("contract");
    const internal = (r: any) => !contractual(r) && kpiTypeLabel(r.metric_nature).toLowerCase().includes("internal");
    const c = agg(contractual);
    const i = agg(internal);
    const p = agg((r) => isPenaltyNature(r.metric_nature));
    const np = agg((r) => !isPenaltyNature(r.metric_nature));
    return [
      {
        key: "contractual",
        label: "Contractual SLA",
        subtitle: "KPI type contains “contract”",
        accent: "blue",
        ...c,
      },
      {
        key: "internal",
        label: "Internal KPI",
        subtitle: "Internal (excl. contractual rows)",
        accent: "violet",
        ...i,
      },
      {
        key: "penalty",
        label: "Penalty",
        subtitle: "Nature mentions penalty",
        accent: "rose",
        ...p,
      },
      {
        key: "non_penalty",
        label: "Non-penalty",
        subtitle: "All other natures",
        accent: "emerald",
        ...np,
      },
    ];
  }, [slaKpiScopeRows]);

  const slaZoneStats = useMemo((): SlaZoneStat[] => {
    const zones = ["North", "South", "West", "East", "Central"] as const;
    const roll = new Map<string, { met: number; notMet: number }>();
    for (const z of zones) roll.set(z, { met: 0, notMet: 0 });
    for (const r of slaKpiScopeRows) {
      const z = regionToZoneFromLabel((r as any).region as string);
      const b = statusBucket(r.status);
      const o = roll.get(z)!;
      if (b === "met") o.met++;
      else if (b === "breached") o.notMet++;
    }
    return zones.map((zone) => {
      const { met, notMet } = roll.get(zone)!;
      const t = met + notMet;
      return {
        zone,
        met,
        notMet,
        metPct: t > 0 ? Math.round((met / t) * 1000) / 10 : null,
      };
    });
  }, [slaKpiScopeRows]);

  const slaAccountHealthBuckets = useMemo((): SlaHealthBucket[] => {
    const by = new Map<string, { met: number; nm: number }>();
    for (const r of rows) {
      const a = (r.account_name as string) || "Unknown";
      if (!by.has(a)) by.set(a, { met: 0, nm: 0 });
      const b = statusBucket(r.status);
      if (b === "met") by.get(a)!.met++;
      else if (b === "breached") by.get(a)!.nm++;
    }
    const scored = [...by.entries()]
      .map(([name, c]) => {
        const total = c.met + c.nm;
        return { name, met: c.met, total, metPct: total > 0 ? (c.met / total) * 100 : 0 };
      })
      .filter((x) => x.total > 0);
    const red = scored.filter((x) => x.metPct < 50).sort((a, b) => a.metPct - b.metPct);
    const amber = scored.filter((x) => x.metPct >= 50 && x.metPct < 75).sort((a, b) => a.metPct - b.metPct);
    const green = scored.filter((x) => x.metPct >= 75).sort((a, b) => b.metPct - a.metPct);
    return [
      { tier: "red", label: "Red", hint: "< 50% Met", accounts: red.slice(0, 40) },
      { tier: "amber", label: "Amber", hint: "50–74%", accounts: amber.slice(0, 40) },
      { tier: "green", label: "Green", hint: "≥ 75%", accounts: green.slice(0, 40) },
    ];
  }, [rows]);

  const slaDashboardInsights = useMemo((): SlaInsight[] => {
    const out: SlaInsight[] = [];
    const p1 = portfolioFySnapshots.p1;
    const p2 = portfolioFySnapshots.p2;
    const t1 = p1.met + p1.notMet;
    const t2 = p2.met + p2.notMet;
    if (t2 > 0) {
      const pct2 = (p2.met / t2) * 100;
      out.push({
        title: `${fyLabelP2} snapshot mix`,
        description: `Across filtered time-series in the current FY window (${t2.toLocaleString()} Met+Not met cells), ${pct2.toFixed(1)}% are Met.`,
        tone: pct2 >= 72 ? "success" : "info",
      });
    }
    if (t1 > 0 && t2 > 0) {
      const d = (p2.met / t2 - p1.met / t1) * 100;
      out.push({
        title: "FY trajectory",
        description:
          d >= 0
            ? `Met share vs ${fyLabelP1} improved by ${d.toFixed(1)} percentage points.`
            : `Met share vs ${fyLabelP1} is ${(-d).toFixed(1)} points lower — worth a portfolio review.`,
        tone: d >= 0 ? "success" : "warn",
      });
    }
    if (slaKpiMetNotMet.withOutcome > 0) {
      out.push({
        title: "Latest metric posture",
        description: `${formatPercent(slaKpiMetNotMet.metPct)} of metrics with a decisive latest row are Met / Green.`,
        tone: "info",
      });
    }
    if (notReportedCount > 0) {
      out.push({
        title: "Reporting gaps",
        description: `${notReportedCount} metric${notReportedCount === 1 ? "" : "s"} still have no Met / Not met outcome on the latest row.`,
        tone: "warn",
      });
    }
    return out.slice(0, 5);
  }, [portfolioFySnapshots, fyLabelP1, fyLabelP2, slaKpiMetNotMet, notReportedCount]);

  const slaInsightsPayload = useMemo(
    () => ({
      fy: { p1: fyLabelP1, p2: fyLabelP2 },
      portfolioFyCells: {
        p1_outcomes: portfolioFySnapshots.p1.met + portfolioFySnapshots.p1.notMet,
        p2_outcomes: portfolioFySnapshots.p2.met + portfolioFySnapshots.p2.notMet,
        p2_met: portfolioFySnapshots.p2.met,
        p2_not_met: portfolioFySnapshots.p2.notMet,
        p2_met_pct: portfolioFySnapshots.p2_pct,
      },
      latest_decisive_row: {
        met: slaKpiMetNotMet.met,
        breached: slaKpiMetNotMet.breached,
        with_outcome: slaKpiMetNotMet.withOutcome,
        met_pct: slaKpiMetNotMet.metPct,
      },
      not_reported_metric_rows: notReportedCount,
      scoped_metric_rows: slaKpiScopeRows.length,
      scoped_distinct_accounts: scopedAccountCount,
      overview_quick_filter:
        kpiViewAccountSet == null
          ? null
          : {
              health_tier: healthFilterTier,
              zone: tableRegionZone,
              matched_accounts: healthAccountPick?.size ?? null,
            },
    }),
    [
      fyLabelP1,
      fyLabelP2,
      portfolioFySnapshots,
      slaKpiMetNotMet,
      notReportedCount,
      slaKpiScopeRows.length,
      scopedAccountCount,
      kpiViewAccountSet,
      healthFilterTier,
      tableRegionZone,
      healthAccountPick,
    ],
  );

  const slaInsightsPayloadKey = useMemo(() => JSON.stringify(slaInsightsPayload), [slaInsightsPayload]);

  const slaInsightsFetchGen = useRef(0);
  const refreshSlaLlmInsights = useCallback(async () => {
    const gen = ++slaInsightsFetchGen.current;
    setSlaLlmInsightsLoading(true);
    try {
      const ins = await generateSlaInsights(slaInsightsPayload);
      if (gen !== slaInsightsFetchGen.current) return;
      setSlaLlmInsights(ins.length ? (ins as SlaInsight[]) : null);
    } catch {
      if (gen !== slaInsightsFetchGen.current) return;
      setSlaLlmInsights(null);
    } finally {
      if (gen === slaInsightsFetchGen.current) {
        setSlaLlmInsightsLoading(false);
      }
    }
  }, [slaInsightsPayload]);

  useEffect(() => {
    if (loading || slaView !== "overview") return;
    const timer = window.setTimeout(() => {
      void refreshSlaLlmInsights();
    }, 900);
    return () => {
      window.clearTimeout(timer);
      slaInsightsFetchGen.current += 1;
      setSlaLlmInsightsLoading(false);
    };
  }, [loading, slaView, slaInsightsPayloadKey, refreshSlaLlmInsights]);

  /** Top accounts by snapshot volume — FY Met % line (HTML account trend). */
  const accountTopFyTrendData = useMemo(() => {
    const ranked = [...timeseriesKpiScoped]
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
      const ts = timeseriesKpiScoped.find((t: any) => t.account_name === account);
      if (!ts) return { name: account, p1: null, p2: null };
      const a1 = aggregatePeriod(ts.timeline, p1Months);
      const a2 = aggregatePeriod(ts.timeline, p2Months);
      const short = account.length > 14 ? `${account.slice(0, 13)}…` : account;
      return { name: short, p1: a1.met_pct, p2: a2.met_pct };
    });
  }, [timeseriesKpiScoped, p1Months, p2Months]);

  const notReportedByAccount = useMemo(() => {
    return timeseriesKpiScoped
      .map((acc: any) => {
        const n = acc.timeline.reduce((s: number, t: any) => s + (t.not_reported ?? 0), 0);
        const name = acc.account_name as string;
        const short = name.length > 12 ? `${name.slice(0, 11)}…` : name;
        return { name: short, count: n };
      })
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [timeseriesKpiScoped]);

  const notReportedByRegion = useMemo(() => {
    const roll = new Map<string, number>();
    for (const acc of timeseriesKpiScoped) {
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
  }, [timeseriesKpiScoped, accountMetaMap]);

  const notReportedByPractice = useMemo(() => {
    const roll = new Map<string, number>();
    for (const acc of timeseriesKpiScoped) {
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
  }, [timeseriesKpiScoped, accountMetaMap]);

  const notReportedMonthlySeries = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const acc of timeseriesKpiScoped) {
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
  }, [timeseriesKpiScoped, allMonths]);

  const notReportedMonthlyChartData = useMemo(() => {
    const nz = notReportedMonthlySeries.filter((x) => x.count > 0);
    if (nz.length) return nz.slice(-24);
    return notReportedMonthlySeries.slice(-12);
  }, [notReportedMonthlySeries]);

  const notReportedSnapshotsTotal = useMemo(
    () =>
      timeseriesKpiScoped.reduce(
        (sum, acc: any) => sum + acc.timeline.reduce((s: number, t: any) => s + (t.not_reported ?? 0), 0),
        0,
      ),
    [timeseriesKpiScoped],
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
    const okZone =
      tableRegionZone === null || regionToZoneFromLabel((r as any).region as string) === tableRegionZone;
    const okHealth =
      healthAccountPick === null || healthAccountPick.has(String((r as any).account_name || "Unknown"));
    return okSearch && okStatus && okAcct && okTime && okZone && okHealth;
  }), [rows, search, statusFilter, acctFilter, tableFilteredMonthSet, tableRegionZone, healthAccountPick]);

  const kpiDrillRows = useMemo(() => {
    if (kpiDrillKind === "all") return slaKpiScopeRows;
    return slaKpiScopeRows.filter((r) => statusBucket(r.status) === kpiDrillKind);
  }, [slaKpiScopeRows, kpiDrillKind]);

  const bifurDrillRows = useMemo(() => {
    if (!bifurDrillKey) return [];
    const contractual = (r: any) => kpiTypeLabel(r.metric_nature).toLowerCase().includes("contract");
    const internal = (r: any) => !contractual(r) && kpiTypeLabel(r.metric_nature).toLowerCase().includes("internal");
    const preds: Record<string, (r: any) => boolean> = {
      contractual,
      internal,
      penalty: (r) => isPenaltyNature(r.metric_nature),
      non_penalty: (r) => !isPenaltyNature(r.metric_nature),
    };
    const pred = preds[bifurDrillKey];
    if (!pred) return [];
    return slaKpiScopeRows.filter(pred);
  }, [slaKpiScopeRows, bifurDrillKey]);

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
    const defNum = (v: unknown) => Number(v);
    const tsByDef = new Map<
      number,
      { timeline: TimelinePt[]; metric_nature?: string | null; metric_label?: string }
    >();
    for (const m of accountMetricsTs?.metrics ?? []) {
      tsByDef.set(defNum(m.definition_id), {
        timeline: (m.timeline ?? []) as TimelinePt[],
        metric_nature: m.metric_nature,
        metric_label: m.metric_label,
      });
    }
    const drillIds = new Set<number>(drillData.metrics.map((r: any) => defNum(r.id)));
    const fromDrill = drillData.metrics.map((r: any) => {
      const id = defNum(r.id);
      const ts = tsByDef.get(id);
      return {
        definition_id: id,
        metric_label: (r.metric_label as string) ?? ts?.metric_label ?? "",
        metric_nature: (r.metric_nature as string | null | undefined) ?? ts?.metric_nature ?? null,
        target: r.target ?? "—",
        timeline: ts?.timeline ?? ([] as TimelinePt[]),
      };
    });
    const extras: typeof fromDrill = [];
    for (const m of accountMetricsTs?.metrics ?? []) {
      const id = defNum(m.definition_id);
      if (drillIds.has(id)) continue;
      extras.push({
        definition_id: id,
        metric_label: m.metric_label ?? "",
        metric_nature: m.metric_nature ?? null,
        target: "—",
        timeline: (m.timeline ?? []) as TimelinePt[],
      });
    }
    return extras.length ? [...fromDrill, ...extras] : fromDrill;
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
              <section className="sla-adv-filters" aria-label="Portfolio filters">
                <div
                  className={cn(
                    "dashboard-filter-bar sla-adv-filters__shell",
                    slaAdvFiltersOpen && "sla-adv-filters__shell--expanded",
                  )}
                >
                  <button
                    type="button"
                    className="sla-adv-filters__head sla-adv-filters__head--toggle"
                    id="sla-adv-filters-trigger"
                    aria-expanded={slaAdvFiltersOpen}
                    aria-controls="sla-adv-filters-panel"
                    onClick={() => setSlaAdvFiltersOpen((o) => !o)}
                  >
                    <span className="sla-adv-filters__head-inner">
                      <Filter className="sla-adv-filters__head-icon" strokeWidth={2} aria-hidden />
                      <span className="sla-adv-filters__head-title">Advanced filters</span>
                    </span>
                    <ChevronDown
                      className={cn("sla-adv-filters__chev", slaAdvFiltersOpen && "sla-adv-filters__chev--open")}
                      strokeWidth={2}
                      aria-hidden
                    />
                  </button>
                  {((healthAccountPick && healthAccountPick.size > 0) || tableRegionZone) && (
                    <div className="sla-adv-filters__kpi-view-strip" aria-label="Active KPI view filters">
                      <span className="sla-adv-filters__kpi-view-strip-lbl">From overview</span>
                      {healthAccountPick && healthAccountPick.size > 0 ? (
                        <button
                          type="button"
                          className={cn(
                            "sla-adv-filters__kpi-chip",
                            healthFilterTier && `sla-adv-filters__kpi-chip--health-${healthFilterTier}`,
                          )}
                          onClick={() => {
                            setHealthAccountPick(null);
                            setHealthFilterTier(null);
                          }}
                        >
                          <span className="sla-adv-filters__kpi-chip-main">
                            Account health
                            {healthFilterTier ? (
                              <span className="sla-adv-filters__kpi-chip-tier">
                                · {healthFilterTier === "red" ? "Red" : healthFilterTier === "amber" ? "Amber" : "Green"}
                              </span>
                            ) : null}
                          </span>
                          <span className="sla-adv-filters__kpi-chip-meta">{healthAccountPick.size} accounts</span>
                          <X className="sla-adv-filters__kpi-chip-x" strokeWidth={2.5} aria-hidden />
                          <span className="sr-only">Remove account health filter</span>
                        </button>
                      ) : null}
                      {tableRegionZone ? (
                        <button
                          type="button"
                          className="sla-adv-filters__kpi-chip sla-adv-filters__kpi-chip--zone"
                          onClick={() => setTableRegionZone(null)}
                        >
                          <MapPin className="sla-adv-filters__kpi-chip-pin" strokeWidth={2} aria-hidden />
                          <span className="sla-adv-filters__kpi-chip-main">Zone</span>
                          <span className="sla-adv-filters__kpi-chip-meta">{tableRegionZone}</span>
                          <X className="sla-adv-filters__kpi-chip-x" strokeWidth={2.5} aria-hidden />
                          <span className="sr-only">Remove zone filter</span>
                        </button>
                      ) : null}
                    </div>
                  )}
                  <div
                    id="sla-adv-filters-panel"
                    className="sla-adv-filters__panel"
                    role="region"
                    aria-labelledby="sla-adv-filters-trigger"
                    hidden={!slaAdvFiltersOpen}
                  >
                  <div className="sla-adv-filters__row sla-adv-filters__row--3col">
                    <div className="dashboard-filter-field sla-adv-filters__field">
                      <span className="dashboard-filter-label sla-adv-filters__label-row">
                        <Calendar className="sla-adv-filters__lbl-icon" strokeWidth={2} aria-hidden />
                        Fiscal year
                      </span>
                      <select
                        className="dashboard-filter-select"
                        value={slaGfDraft.fiscalYear}
                        onChange={(e) =>
                          setSlaGfDraft((d) => ({
                            ...d,
                            fiscalYear: e.target.value as SlaGlobalFilters["fiscalYear"],
                          }))
                        }
                      >
                        <option value="all">All years (comparison)</option>
                        {slaGfFyOptions.map((fy) => (
                          <option key={fy} value={fy}>
                            {fy}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="new-contract-sheet sla-gf-ncp-embed sla-gf-ncp-embed--cell">
                      <SlaMultiStringPicker
                        label="Regional head"
                        options={slaGfRegionalHeadOpts}
                        value={slaGfDraft.regionalHeads}
                        onChange={(regionalHeads) => setSlaGfDraft((d) => ({ ...d, regionalHeads }))}
                        emptyHint="— Select heads —"
                        searchPlaceholder="Search regional heads…"
                        nounPlural="heads"
                        leadingEmptyGlyph="👤"
                      />
                    </div>
                    <div className="new-contract-sheet sla-gf-ncp-embed sla-gf-ncp-embed--cell">
                      <SlaMultiStringPicker
                        label="Region"
                        options={slaGfRegionOpts}
                        value={slaGfDraft.regions}
                        onChange={(regions) => setSlaGfDraft((d) => ({ ...d, regions }))}
                        emptyHint="— Select regions —"
                        searchPlaceholder="Search regions…"
                        nounPlural="regions"
                        leadingEmptyGlyph="📍"
                      />
                    </div>
                  </div>

                  <div className="sla-adv-filters__row sla-adv-filters__row--full" aria-label="Practice head">
                    <div className="new-contract-sheet sla-gf-ncp-embed">
                      <SlaPracticeHeadMultiPicker
                        options={slaGfPracticeHeadOpts}
                        value={slaGfDraft.practiceHeads}
                        onChange={(practiceHeads) => setSlaGfDraft((d) => ({ ...d, practiceHeads }))}
                        users={slaFilterUsers}
                      />
                    </div>
                  </div>

                  <div className="sla-adv-filters__row sla-adv-filters__row--full" aria-label="Project">
                    <div className="new-contract-sheet sla-gf-ncp-embed">
                      <SlaAccountMultiProjectPicker
                        projects={slaGfProjects}
                        value={slaGfDraft.accounts}
                        onChange={(accounts) => setSlaGfDraft((d) => ({ ...d, accounts }))}
                      />
                    </div>
                  </div>

                  <div className="sla-adv-filters__row sla-adv-filters__row--2col">
                    <div className="dashboard-filter-field sla-adv-filters__field sla-adv-filters__field--month-range">
                      <span className="dashboard-filter-label sla-adv-filters__label-row">
                        <Calendar className="sla-adv-filters__lbl-icon" strokeWidth={2} aria-hidden />
                        Reporting period
                      </span>
                      <p className="sla-adv-filters__field-hint">Optional inclusive range; empty uses fiscal year only.</p>
                      <div className="new-contract-sheet sla-gf-ncp-embed">
                        <div className="sla-gf-month-range ncp-date-grid" style={{ borderTop: "none", padding: "4px 0 0" }}>
                          <div className="ncp-date-cell">
                            <label htmlFor="sla-gf-month-from">From</label>
                            <input
                              id="sla-gf-month-from"
                              type="month"
                              min={slaGfMonthOpts[0] || undefined}
                              max={slaGfMonthOpts[slaGfMonthOpts.length - 1] || undefined}
                              value={slaGfDraft.monthFrom}
                              onChange={(e) =>
                                setSlaGfDraft((d) => ({
                                  ...d,
                                  monthFrom: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="ncp-date-cell">
                            <label htmlFor="sla-gf-month-to">To</label>
                            <input
                              id="sla-gf-month-to"
                              type="month"
                              min={slaGfMonthOpts[0] || undefined}
                              max={slaGfMonthOpts[slaGfMonthOpts.length - 1] || undefined}
                              value={slaGfDraft.monthTo}
                              onChange={(e) =>
                                setSlaGfDraft((d) => ({
                                  ...d,
                                  monthTo: e.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="dashboard-filter-field sla-adv-filters__field">
                      <span className="dashboard-filter-label sla-adv-filters__label-row">
                        <Tags className="sla-adv-filters__lbl-icon" strokeWidth={2} aria-hidden />
                        KPI type
                      </span>
                      <select
                        className="dashboard-filter-select"
                        value={slaGfDraft.metricNature}
                        onChange={(e) =>
                          setSlaGfDraft((d) => ({
                            ...d,
                            metricNature: e.target.value as SlaGlobalFilters["metricNature"],
                          }))
                        }
                      >
                        <option value="all">All types</option>
                        <option value="contractual">Contractual KPI</option>
                        <option value="internal">Internal KPI</option>
                      </select>
                    </div>
                  </div>
                      <div className="sla-adv-filters__actions">
                        <button
                          type="button"
                          className="btn btn-primary sla-adv-filters__apply"
                          onClick={() => setSlaGfApplied({ ...slaGfDraft })}
                        >
                          <Check className="sla-adv-filters__btn-ic" strokeWidth={2.5} aria-hidden />
                          Apply filters
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline sla-adv-filters__clear"
                          onClick={() => {
                            setSlaGfDraft(SLA_GF_INITIAL);
                            setSlaGfApplied(SLA_GF_INITIAL);
                            setTableRegionZone(null);
                            setHealthAccountPick(null);
                            setHealthFilterTier(null);
                          }}
                        >
                          <X className="sla-adv-filters__btn-ic" strokeWidth={2.5} aria-hidden />
                          Clear all
                        </button>
                      </div>
                    </div>
                </div>
              </section>

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
                      <div
                        role="button"
                        tabIndex={0}
                        className="sla-metric-card sla-metric-card--drill"
                        onClick={() => {
                          setKpiDrillKind("met");
                          setKpiDrillOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setKpiDrillKind("met");
                            setKpiDrillOpen(true);
                          }
                        }}
                        title="Show metrics counted as Met"
                      >
                        <div className="sla-metric-card-hd">Metrics met</div>
                        <div className="sla-metric-card-body">
                          <div className="sla-metric-val">
                            {rows.length > 0 ? formatPercent(slaKpiMetNotMet.metPct) : "—"}
                          </div>
                          <div className="sla-metric-sub">
                            {rows.length > 0
                              ? slaKpiMetNotMet.withOutcome > 0
                                ? `${slaKpiMetNotMet.met} of ${slaKpiMetNotMet.withOutcome} with outcome (excl. not reported)`
                                : "No Met / Not met data"
                              : "Upload SLA data"}
                          </div>
                        </div>
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        className="sla-metric-card sla-metric-card--drill"
                        onClick={() => {
                          setKpiDrillKind("breached");
                          setKpiDrillOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setKpiDrillKind("breached");
                            setKpiDrillOpen(true);
                          }
                        }}
                        title="Show metrics counted as Not met"
                      >
                        <div className="sla-metric-card-hd">Metrics not met</div>
                        <div className="sla-metric-card-body">
                          <div className="sla-metric-val">
                            {rows.length > 0 ? formatPercent(slaKpiMetNotMet.notMetPct) : "—"}
                          </div>
                          <div className="sla-metric-sub">
                            {rows.length > 0
                              ? slaKpiMetNotMet.withOutcome > 0
                                ? `${slaKpiMetNotMet.breached} of ${slaKpiMetNotMet.withOutcome} with outcome (excl. not reported)`
                                : "—"
                              : "—"}
                          </div>
                        </div>
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        className="sla-metric-card sla-metric-card--drill"
                        onClick={() => {
                          setKpiDrillKind("not_reported");
                          setKpiDrillOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setKpiDrillKind("not_reported");
                            setKpiDrillOpen(true);
                          }
                        }}
                        title="Show metrics with no decisive outcome"
                      >
                        <div className="sla-metric-card-body">
                          <div className="sla-metric-val">{rows.length > 0 ? formatPercent(notReportedPct) : "—"}</div>
                          <div className="sla-metric-sub">{rows.length > 0 ? `${notReportedCount} metrics` : "—"}</div>
                        </div>
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        className="sla-metric-card sla-metric-card--drill"
                        onClick={() => {
                          setKpiDrillKind("all");
                          setKpiDrillOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setKpiDrillKind("all");
                            setKpiDrillOpen(true);
                          }
                        }}
                        title="Show all metrics in current filters"
                      >
                        <div className="sla-metric-card-body">
                          <div className="sla-metric-val">{rows.length || "—"}</div>
                          <div className="sla-metric-sub">
                            {scopedAccountCount > 0 ? `${scopedAccountCount} accounts` : "—"}
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
                      <div className="sla-dash-card-sub">From latest decisive metric rows per account (same basis as KPI tiles).</div>
                    </div>
                    <div className="sla-dash-card-bd">
                      {executiveBest.length === 0 ? (
                        <div className="sla-empty">No account-level outcomes in current filters.</div>
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
                      <div className="sla-dash-card-sub">Lowest Met % on latest decisive rows (met + not met only).</div>
                    </div>
                    <div className="sla-dash-card-bd">
                      {executiveWorst.length === 0 ? (
                        <div className="sla-empty">No account-level outcomes in current filters.</div>
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
                      <div className="sla-dash-card-sub">{fyLabelP2} vs {fyLabelP1}.</div>
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
                      <div className="sla-dash-card-title">Regions — {fyLabelP2}</div>
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
                  <SlaExportInlineBar rows={rows as unknown as Record<string, unknown>[]} />
                  <div className="sla-overview-fy-hero" aria-label="Current FY portfolio Met percent">
                    <div className="sla-overview-fy-hero__tile sla-overview-fy-hero__tile--primary">
                      <div className="sla-overview-fy-hero__eyebrow">Portfolio Met % · {fyLabelP2}</div>
                      <div className="sla-overview-fy-hero__figure">
                        {portfolioFySnapshots.p2_pct == null ? "—" : formatPercent(portfolioFySnapshots.p2_pct)}
                      </div>
                      <div className="sla-overview-fy-hero__meta">
                        {portfolioFySnapshots.p2.met + portfolioFySnapshots.p2.notMet > 0
                          ? `${portfolioFySnapshots.p2.met.toLocaleString()} met · ${portfolioFySnapshots.p2.notMet.toLocaleString()} not met (time-series)`
                          : "No Met / Not met cells in this FY window"}
                      </div>
                    </div>
                    <div className="sla-overview-fy-hero__tile">
                      <div className="sla-overview-fy-hero__eyebrow">Prior FY · {fyLabelP1}</div>
                      <div className="sla-overview-fy-hero__figure">
                        {portfolioFySnapshots.p1_pct == null ? "—" : formatPercent(portfolioFySnapshots.p1_pct)}
                      </div>
                      <div className="sla-overview-fy-hero__meta">
                        {portfolioFySnapshots.p1_pct != null && portfolioFySnapshots.p2_pct != null ? (
                          <span>
                            {(() => {
                              const d = portfolioFySnapshots.p2_pct - portfolioFySnapshots.p1_pct;
                              return `${d >= 0 ? "+" : ""}${d.toFixed(1)} pp vs prior FY`;
                            })()}
                          </span>
                        ) : (
                          "Need both FY windows in loaded data"
                        )}
                      </div>
                    </div>
                  </div>
                  <SlaInsightsStrip
                    insights={slaLlmInsights ?? slaDashboardInsights}
                    loading={slaLlmInsightsLoading}
                    source={slaLlmInsights && slaLlmInsights.length ? "llm" : "heuristic"}
                    onRefresh={() => void refreshSlaLlmInsights()}
                    refreshDisabled={loading}
                  />
                  <SlaBifurcationTiles
                    slices={slaBifurcationSlices}
                    onDrill={(key) => {
                      setBifurDrillKey(key);
                    }}
                  />
                  <div className="sla-rank-grid sla-rank-grid--pair" style={{ marginBottom: 14 }}>
                    <SlaAccountHealthRail
                      buckets={slaAccountHealthBuckets}
                      onPickTier={(tier) => {
                        const b = slaAccountHealthBuckets.find((x) => x.tier === tier);
                        if (b && b.accounts.length) {
                          setHealthFilterTier(tier);
                          setHealthAccountPick(new Set(b.accounts.map((a) => a.name)));
                        } else {
                          setHealthFilterTier(null);
                          setHealthAccountPick(null);
                        }
                      }}
                    />
                    <SlaRegionZonesMap
                      zones={slaZoneStats}
                      activeZone={tableRegionZone}
                      onSelectZone={(z) => setTableRegionZone(z)}
                    />
                  </div>
                </>
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
          <div className="sla-dash-card-title">Monthly SLA % — portfolio & clients</div>
          <div className="sla-dash-card-sub">
            Set the month range first (applies to both charts). Portfolio line is Met ÷ (Met + Not met) rolled across all accounts.
          </div>
        </div>
        <div className="sla-dash-card-bd">
        {/* Month range first so portfolio % respects the same window */}
        {allMonths.length > 2 && (
          <div
            className="sla-period-month-range"
            style={{ marginBottom: 14 }}
            title="Leave a field empty to include all months on that end. The chart uses months present in your loaded time-series."
          >
            <div className="sla-period-month-range__lead">
              <Calendar className="sla-period-month-range__ic" strokeWidth={2} aria-hidden />
              <span className="sla-period-month-range__lead-label">Month range</span>
            </div>
            <div className="sla-period-month-range__fields">
              <div className="sla-period-month-range__cell">
                <label htmlFor="sla-trend-month-from">From</label>
                <input
                  id="sla-trend-month-from"
                  type="month"
                  min={allMonths[0]}
                  max={allMonths[allMonths.length - 1]}
                  value={monthFrom === "all" ? "" : monthFrom}
                  onChange={onTrendChartMonthFromChange}
                />
              </div>
              <div className="sla-period-month-range__cell">
                <label htmlFor="sla-trend-month-to">To</label>
                <input
                  id="sla-trend-month-to"
                  type="month"
                  min={allMonths[0]}
                  max={allMonths[allMonths.length - 1]}
                  value={monthTo === "all" ? "" : monthTo}
                  onChange={onTrendChartMonthToChange}
                />
              </div>
              {(monthFrom !== "all" || monthTo !== "all") && (
                <button
                  type="button"
                  className="sla-period-month-range__reset platform-chip"
                  style={{ fontSize: 10, cursor: "pointer" }}
                  onClick={() => {
                    setMonthFrom("all");
                    setMonthTo("all");
                  }}
                >
                  Reset range
                </button>
              )}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>Portfolio Met %</div>
          {portfolioMetPctForFilteredMonths.length === 0 ? (
            <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>No months in range</span>
            </div>
          ) : (
            <div style={{ height: 240 }}>
              <SlaTimeSeriesChart data={portfolioMetPctForFilteredMonths} accounts={["Portfolio"]} />
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>Selected clients</div>
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
              <div className="sla-dash-card-title">Quarterly Met % — FY vs FY</div>
              <div className="sla-dash-card-sub">
                Each quarter compares the same calendar window inside {fyLabelP1} and {fyLabelP2} (Indian FY or calendar mode
                matches the Year-over-Year toggle). Met ÷ (Met + Not met) within that quarter only.
              </div>
            </div>
            <div className="sla-dash-card-bd">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
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
              <div className="platform-table-wrap" style={{ marginBottom: 14 }}>
                <table className="platform-table" style={{ fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th>Quarter</th>
                      <th>{fyLabelP1} Met %</th>
                      <th>{fyLabelP2} Met %</th>
                      <th>Δ (pp)</th>
                      <th>{fyLabelP1} (M / NM)</th>
                      <th>{fyLabelP2} (M / NM)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quarterlyFyQuarterCompare.map((r) => {
                      const d =
                        r.p1_pct != null && r.p2_pct != null
                          ? `${(r.p2_pct - r.p1_pct) >= 0 ? "+" : ""}${(r.p2_pct - r.p1_pct).toFixed(1)}`
                          : "—";
                      return (
                        <tr key={r.quarter}>
                          <td>{r.quarter}</td>
                          <td style={{ fontFamily: "'DM Mono',monospace" }}>{r.p1_pct == null ? "—" : `${r.p1_pct}%`}</td>
                          <td style={{ fontFamily: "'DM Mono',monospace" }}>{r.p2_pct == null ? "—" : `${r.p2_pct}%`}</td>
                          <td style={{ fontFamily: "'DM Mono',monospace" }}>{d}</td>
                          <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>
                            {r.p1_met + r.p1_not_met === 0 ? "—" : `${r.p1_met} / ${r.p1_not_met}`}
                          </td>
                          <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>
                            {r.p2_met + r.p2_not_met === 0 ? "—" : `${r.p2_met} / ${r.p2_not_met}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {quarterlyCompareChartData.length === 0 ||
              !quarterlyCompareChartData.some((x) => x.p1 != null || x.p2 != null) ? (
                <div className="sla-empty">No quarterly outcomes in the selected FY windows.</div>
              ) : (
                <div style={{ height: 300 }}>
                  <SlaFyComparisonGroupedBar
                    data={quarterlyCompareChartData}
                    labelP1={fyLabelP1}
                    labelP2={fyLabelP2}
                    height={300}
                  />
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
            labelP1={fyLabelP1}
            labelP2={fyLabelP2}
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
                <th>{fyColH1}</th>
                <th>{fyColH2}</th>
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
            labelP1={fyLabelP1}
            labelP2={fyLabelP2}
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
              label={fyLabelP1}
              height={172}
            />
            <SlaMetNotMetDonut
              met={portfolioFySnapshots.p2.met}
              notMet={portfolioFySnapshots.p2.notMet}
              label={fyLabelP2}
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
              labelP1={fyLabelP1}
              labelP2={fyLabelP2}
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
                labelP1={fyLabelP1}
                labelP2={fyLabelP2}
                height={300}
              />
            ) : (
              <SlaFyComparisonLineChart
                data={fyRegionalChartData}
                labelP1={fyLabelP1}
                labelP2={fyLabelP2}
                height={300}
              />
            )}
          </div>
        </div>
      )}

      {(slaView === "practice") && (
        <>
          <div className="sla-dash-card">
            <div className="sla-dash-card-hd">
              <div className="sla-dash-card-title">Practice head analysis</div>
              <div className="sla-dash-card-sub">
                Met % by practice head from time-series — {fyLabelP1} vs {fyLabelP2} (same windows as Year-over-Year).
              </div>
            </div>
            <div className="sla-dash-card-bd">
              {fyPracticeChartData.length === 0 ? (
                <div className="sla-empty">No practice-head rollup.</div>
              ) : (
                <>
                  <div className="platform-table-wrap" style={{ marginBottom: 16 }}>
                    <table className="platform-table" style={{ fontSize: 11 }}>
                      <thead>
                        <tr>
                          <th>Practice head</th>
                          <th>{fyColH1}</th>
                          <th>{fyColH2}</th>
                          <th>Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fyPracticeChartData.map((row) => (
                          <tr key={row.name}>
                            <td style={{ fontWeight: 600 }}>{row.name}</td>
                            <td style={{ fontFamily: "'DM Mono',monospace" }}>{row.p1 == null ? "—" : `${row.p1.toFixed(1)}%`}</td>
                            <td style={{ fontFamily: "'DM Mono',monospace" }}>{row.p2 == null ? "—" : `${row.p2.toFixed(1)}%`}</td>
                            <td style={{ fontFamily: "'DM Mono',monospace" }}>{formatChange(row.p1, row.p2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <SlaFyComparisonGroupedBar
                      data={fyPracticeChartData}
                      labelP1={fyLabelP1}
                      labelP2={fyLabelP2}
                      height={320}
                    />
                  </div>
                  <SlaFyComparisonLineChart
                    data={fyPracticeChartData}
                    labelP1={fyLabelP1}
                    labelP2={fyLabelP2}
                    height={300}
                  />
                </>
              )}
            </div>
          </div>
        </>
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

          {/* Reporting period (matches Reported column) — month inputs */}
          {monthsOrderedForTable.length > 0 && (
            <div
              className="sla-period-month-range sla-period-month-range--inline"
              title="Filter table rows by reporting month. Leave empty for no bound on that side."
            >
              <span className="sla-period-month-range__inline-lbl">Reported period</span>
              <div className="sla-period-month-range__cell">
                <label htmlFor="sla-table-month-from">From</label>
                <input
                  id="sla-table-month-from"
                  type="month"
                  min={monthsOrderedForTable[0]}
                  max={monthsOrderedForTable[monthsOrderedForTable.length - 1]}
                  value={tableMonthFrom === "all" ? "" : tableMonthFrom}
                  onChange={onTableMonthFromChange}
                />
              </div>
              <div className="sla-period-month-range__cell">
                <label htmlFor="sla-table-month-to">To</label>
                <input
                  id="sla-table-month-to"
                  type="month"
                  min={monthsOrderedForTable[0]}
                  max={monthsOrderedForTable[monthsOrderedForTable.length - 1]}
                  value={tableMonthTo === "all" ? "" : tableMonthTo}
                  onChange={onTableMonthToChange}
                />
              </div>
              {(tableMonthFrom !== "all" || tableMonthTo !== "all") && (
                <button
                  type="button"
                  className="sla-period-month-range__reset platform-chip"
                  style={{ fontSize: 10, cursor: "pointer" }}
                  onClick={() => {
                    setTableMonthFrom("all");
                    setTableMonthTo("all");
                  }}
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

      <PlatformDrawer
        open={kpiDrillOpen}
        title={
          kpiDrillKind === "met"
            ? "Metrics — Met / Green"
            : kpiDrillKind === "breached"
              ? "Metrics — Not met / breach"
              : kpiDrillKind === "not_reported"
                ? "Metrics — Not reported"
                : "Metrics — All (filtered)"
        }
        onClose={() => setKpiDrillOpen(false)}
        width={560}
      >
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
          {kpiDrillRows.length} row{kpiDrillRows.length === 1 ? "" : "s"} (KPI portfolio slice: Advanced filters + overview
          health / zone picks; the table may narrow further with search / status / month). Use{" "}
          <strong>Export → CSV</strong> for a full extract.
        </p>
        <div className="platform-table-wrap" style={{ maxHeight: "min(480px, 65vh)", overflow: "auto" }}>
          <table className="platform-table" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th>Client</th>
                <th>Metric</th>
                <th>Status</th>
                <th>Region</th>
              </tr>
            </thead>
            <tbody>
              {kpiDrillRows.slice(0, 200).map((r: any) => (
                <tr key={r.id}>
                  <td>{r.account_name}</td>
                  <td>{r.metric_label}</td>
                  <td>
                    <StatusTag status={statusTagFromRaw(r.status)} />
                  </td>
                  <td style={{ color: "var(--text-subtle)" }}>{r.region ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {kpiDrillRows.length > 200 ? (
            <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>Showing first 200 — narrow filters or export CSV.</p>
          ) : null}
        </div>
      </PlatformDrawer>

      <PlatformDrawer
        open={Boolean(bifurDrillKey)}
        title={
          bifurDrillKey === "contractual"
            ? "Bifurcation — Contractual SLA"
            : bifurDrillKey === "internal"
              ? "Bifurcation — Internal KPI"
              : bifurDrillKey === "penalty"
                ? "Bifurcation — Penalty"
                : bifurDrillKey === "non_penalty"
                  ? "Bifurcation — Non-penalty"
                  : "Bifurcation"
        }
        onClose={() => setBifurDrillKey(null)}
        width={560}
      >
        <div className="platform-table-wrap" style={{ maxHeight: "min(480px, 65vh)", overflow: "auto" }}>
          <table className="platform-table" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th>Client</th>
                <th>Metric</th>
                <th>Nature</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {bifurDrillRows.slice(0, 200).map((r: any) => (
                <tr key={r.id}>
                  <td>{r.account_name}</td>
                  <td>{r.metric_label}</td>
                  <td style={{ color: "var(--text-subtle)" }}>{r.metric_nature ?? "—"}</td>
                  <td>
                    <StatusTag status={statusTagFromRaw(r.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PlatformDrawer>

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
