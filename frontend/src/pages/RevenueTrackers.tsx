import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  invalidateCache,
  queries,
  type Project,
  type RevenueForecastWeeklyRow,
  type RevenueVisibilitySnapshotRow,
  type RevenueWeeklyPackResponse,
  type RevenueWeeklySubmissionDto,
} from "@/lib/api";
import { canPracticeSubmitBilling, isProjectHeadLike, useAuth } from "@/lib/auth";
import { formatCurrency, formatLargeCurrency, formatPercent } from "@/lib/utils";
import { ExecutiveKpiCard } from "@/components/platform/ExecutiveKpiCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import "@/styles/new-contract-panel.css";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
} from "recharts";
import { Calendar, ChevronLeft, ChevronRight, RefreshCw, Plus, PencilLine } from "lucide-react";
import { WeeklyPackNcpSheet } from "@/components/platform/WeeklyPackNcpSheet";

const LAKHS = 100_000;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtLakhs(inr: number): string {
  return `${((inr || 0) / LAKHS).toFixed(2)}`;
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mondayYmd(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  const y = mon.getFullYear();
  const m = String(mon.getMonth() + 1).padStart(2, "0");
  const dd = String(mon.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDaysYmd(ymd: string, days: number): string {
  const dt = parseYmd(ymd);
  dt.setDate(dt.getDate() + days);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function mondayOfYmd(ymd: string): string {
  const dt = parseYmd(ymd);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  dt.setDate(diff);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function shiftWeekMonday(mondayYmdVal: string, deltaWeeks: number): string {
  return mondayOfYmd(addDaysYmd(mondayYmdVal, deltaWeeks * 7));
}

function formatWeekRangeLabel(mondayYmdVal: string): string {
  const start = parseYmd(mondayYmdVal);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${start.toLocaleDateString("en-IN", opt)} – ${end.toLocaleDateString("en-IN", opt)}`;
}

function projectDisplayNameFromProject(p: Project): string {
  return (
    (p.engagement_name && String(p.engagement_name).trim()) ||
    (p.account_name && String(p.account_name).trim()) ||
    p.filename ||
    `PRJ-${p.id}`
  );
}

function projInitials(label: string): string {
  const t = label.replace(/[^a-zA-Z0-9\s]/g, " ").trim();
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return t.slice(0, 2).toUpperCase() || "PR";
}

function monthAnchorOptions(): string[] {
  const out: string[] = [];
  const start = new Date();
  start.setMonth(start.getMonth() - 30);
  for (let i = 0; i < 72; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    out.push(`${y}-${m}-01`);
  }
  return out;
}

function monthAnchorLabel(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  if (!y || !m) return ymd;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function formatMonthLabel(ym: string): string {
  const [ys, ms] = ym.split("-");
  const y = Number(ys);
  const mo = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return ym;
  return `${MONTHS_SHORT[mo - 1]}-${String(y).slice(2)}`;
}

function forecastMonthKey(r: RevenueForecastWeeklyRow): string {
  const src = r.month_anchor || r.week_start_date;
  if (!src) return "unknown";
  return src.slice(0, 7);
}

function statusDisplay(status: string | null | undefined): React.ReactNode {
  const s = (status || "").trim();
  if (!s) return "—";
  const lower = s.toLowerCase();
  if (lower.includes("risk") || lower.includes("red") || lower.includes("at risk")) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span aria-hidden>🔴</span>
        <span>{s}</span>
      </span>
    );
  }
  if (lower.includes("on track") || lower.includes("green") || lower.includes("good")) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span aria-hidden>🟢</span>
        <span>{s}</span>
      </span>
    );
  }
  return s;
}

const CHART_TOOLTIP = {
  backgroundColor: "var(--surface-raised)",
  border: "1px solid color-mix(in srgb, var(--accent) 15%, transparent)",
  borderRadius: 8,
  fontSize: 11,
  color: "var(--text)",
  fontFamily: "'DM Mono',monospace",
};

type KpiProps = {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  accent?: "default" | "amber" | "teal";
};

function KpiTile({ icon, label, value, sub, accent = "default" }: KpiProps) {
  return (
    <div
      className="platform-card"
      style={{
        padding: "14px 16px",
        minHeight: 96,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        borderLeft: `3px solid ${accent === "amber" ? "var(--amber)" : accent === "teal" ? "var(--accent2)" : "var(--accent)"}`,
        boxShadow: "0 1px 0 color-mix(in srgb, var(--accent) 8%, transparent)",
      }}
    >
      <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", lineHeight: 1.35 }}>
        <span aria-hidden style={{ marginRight: 6 }}>
          {icon}
        </span>
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "'Syne',sans-serif",
          letterSpacing: "-0.02em",
          color: "var(--text)",
          marginTop: 8,
        }}
      >
        {value}
      </div>
      {sub ? (
        <div style={{ fontSize: 9.5, color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>{sub}</div>
      ) : null}
    </div>
  );
}

export function RevenueTrackers() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [forecast, setForecast] = useState<RevenueForecastWeeklyRow[]>([]);
  const [visibility, setVisibility] = useState<RevenueVisibilitySnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [asOfFilter, setAsOfFilter] = useState<string>("");

  const [forecastModalOpen, setForecastModalOpen] = useState(false);
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [editForecastRow, setEditForecastRow] = useState<RevenueForecastWeeklyRow | null>(null);
  const [editVisibilityRow, setEditVisibilityRow] = useState<RevenueVisibilitySnapshotRow | null>(null);

  const [mainTab, setMainTab] = useState<"Revenue visibility" | "Revenue forecast" | "My weekly packs">("Revenue visibility");
  const [governanceWeek, setGovernanceWeek] = useState(() => mondayYmd());
  const [weeklyPack, setWeeklyPack] = useState<RevenueWeeklyPackResponse | null>(null);

  const pid = projectFilter ? Number(projectFilter) : undefined;
  const governancePid = pid ?? projects[0]?.id;

  const ph = isProjectHeadLike(user);
  const [minePacks, setMinePacks] = useState<RevenueWeeklySubmissionDto[]>([]);
  const [minePacksLoading, setMinePacksLoading] = useState(false);
  const [forecastWizard, setForecastWizard] = useState<{ projectId: number; week: string } | null>(null);
  const [weeklyPackSheetOpen, setWeeklyPackSheetOpen] = useState(false);

  const [scopeProjDdOpen, setScopeProjDdOpen] = useState(false);
  const [scopeProjSearch, setScopeProjSearch] = useState("");
  const [scopeProjDdRect, setScopeProjDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const scopeProjWrapRef = useRef<HTMLDivElement>(null);
  const scopeProjBtnRef = useRef<HTMLButtonElement>(null);
  const scopeProjPortalRef = useRef<HTMLDivElement>(null);

  const governanceWeekMon = mondayOfYmd(governanceWeek);

  const reload = useCallback(async () => {
    setErr(null);
    invalidateCache("revenue-trackers/");
    try {
      const [f, v] = await Promise.all([
        queries.revenueForecastWeekly({ project_id: pid, limit: 500 }),
        queries.revenueVisibilitySnapshots({ project_id: pid, limit: 500 }),
      ]);
      setForecast(f.items ?? []);
      setVisibility(v.items ?? []);
      if (governancePid) {
        try {
          setWeeklyPack(await queries.revenueWeeklyPack(governancePid, governanceWeekMon));
        } catch {
          setWeeklyPack(null);
        }
      } else {
        setWeeklyPack(null);
      }
      setLastRefresh(new Date());
    } catch (e: unknown) {
      setErr(String(e instanceof Error ? e.message : e));
    }
  }, [pid, governancePid, governanceWeekMon]);

  useEffect(() => {
    void queries.projects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      await reload();
      setLoading(false);
    })();
  }, [reload]);

  const loadMinePacks = useCallback(async () => {
    setMinePacksLoading(true);
    try {
      const r = await queries.revenueWeeklyMinePacks();
      setMinePacks(r.items ?? []);
    } catch {
      setMinePacks([]);
    } finally {
      setMinePacksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ph && mainTab === "My weekly packs") void loadMinePacks();
  }, [ph, mainTab, loadMinePacks]);

  useEffect(() => {
    if (!ph && mainTab === "My weekly packs") setMainTab("Revenue visibility");
  }, [ph, mainTab]);

  const scopeSelectedProject = useMemo(
    () => (projectFilter ? projects.find((p) => String(p.id) === projectFilter) ?? null : null),
    [projects, projectFilter],
  );

  const scopeFilteredProjects = useMemo(() => {
    const q = scopeProjSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const lab = projectDisplayNameFromProject(p).toLowerCase();
      return lab.includes(q) || String(p.id).includes(q);
    });
  }, [projects, scopeProjSearch]);

  useLayoutEffect(() => {
    if (!scopeProjDdOpen) {
      setScopeProjDdRect(null);
      return;
    }
    const measure = () => {
      const btn = scopeProjBtnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setScopeProjDdRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (scopeProjBtnRef.current) ro.observe(scopeProjBtnRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [scopeProjDdOpen]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (scopeProjWrapRef.current?.contains(t) || scopeProjPortalRef.current?.contains(t)) return;
      setScopeProjDdOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const asOfDates = useMemo(() => {
    const s = new Set<string>();
    for (const r of visibility) {
      if (r.as_of_date) s.add(r.as_of_date);
    }
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [visibility]);

  const effectiveAsOf = asOfFilter || asOfDates[0] || "";

  const visibilityForCut = useMemo(() => {
    if (!effectiveAsOf) return [];
    return visibility.filter((r) => r.as_of_date === effectiveAsOf);
  }, [visibility, effectiveAsOf]);

  const visibilityTotals = useMemo(() => {
    const rows = visibilityForCut;
    let mmf = 0,
      openFee = 0,
      joinFee = 0,
      openReq = 0,
      joiners = 0,
      ytj = 0,
      ytjFee = 0,
      gap = 0;
    let convN = 0,
      convSum = 0,
      revN = 0,
      revSum = 0;
    for (const r of rows) {
      mmf += r.mmf_inr || 0;
      openFee += r.opening_fee_inr || 0;
      joinFee += r.joining_fee_inr || 0;
      openReq += r.open_req || 0;
      joiners += r.joiners_as_on_date || 0;
      ytj += r.yet_to_join || 0;
      ytjFee += r.ytj_fee_inr || 0;
      gap += r.gap_to_mmf_inr || 0;
      if (r.conversion_rate_pct != null) {
        convSum += r.conversion_rate_pct;
        convN++;
      }
      if (r.revenue_realised_pct != null) {
        revSum += r.revenue_realised_pct;
        revN++;
      }
    }
    return {
      mmf,
      openFee,
      joinFee,
      openReq,
      joiners,
      ytj,
      ytjFee,
      gap,
      convPct: convN ? convSum / convN : null,
      revPct: revN ? revSum / revN : null,
    };
  }, [visibilityForCut]);

  const forecastMonthly = useMemo(() => {
    type Agg = {
      rev: number;
      mmf: number;
      openReq: number;
      openFee: number;
      joiners: number;
      joinerFee: number;
      achSum: number;
      achN: number;
    };
    const map = new Map<string, Agg>();
    for (const r of forecast) {
      const k = forecastMonthKey(r);
      if (k === "unknown") continue;
      if (!map.has(k))
        map.set(k, { rev: 0, mmf: 0, openReq: 0, openFee: 0, joiners: 0, joinerFee: 0, achSum: 0, achN: 0 });
      const a = map.get(k)!;
      a.rev += r.revenue_forecast_inr || 0;
      a.mmf += r.mmf_inr || 0;
      a.openReq += r.open_req || 0;
      a.openFee += r.open_fee_inr || 0;
      a.joiners += r.joiner_count || 0;
      a.joinerFee += r.joiner_fee_inr || 0;
      if (r.achievement_pct != null) {
        a.achSum += r.achievement_pct;
        a.achN++;
      }
    }
    const keys = [...map.keys()].sort();
    return keys.map((k) => {
      const a = map.get(k)!;
      return {
        key: k,
        label: formatMonthLabel(k),
        revenueL: a.rev / LAKHS,
        mmfL: a.mmf / LAKHS,
        openReq: a.openReq,
        openFeeL: a.openFee / LAKHS,
        joiners: a.joiners,
        joinerFeeL: a.joinerFee / LAKHS,
        achPct: a.achN ? a.achSum / a.achN : null,
      };
    });
  }, [forecast]);

  const forecastTotals = useMemo(() => {
    let rev = 0,
      mmf = 0,
      openReq = 0,
      joiners = 0,
      joinerFee = 0,
      openFee = 0;
    let achSum = 0,
      achN = 0;
    for (const r of forecast) {
      rev += r.revenue_forecast_inr || 0;
      mmf += r.mmf_inr || 0;
      openReq += r.open_req || 0;
      joiners += r.joiner_count || 0;
      joinerFee += r.joiner_fee_inr || 0;
      openFee += r.open_fee_inr || 0;
      if (r.achievement_pct != null) {
        achSum += r.achievement_pct;
        achN++;
      }
    }
    return {
      revL: rev / LAKHS,
      mmfL: mmf / LAKHS,
      openReq,
      joiners,
      joinerFeeL: joinerFee / LAKHS,
      openFeeL: openFee / LAKHS,
      achPct: achN ? achSum / achN : null,
    };
  }, [forecast]);

  const chartVisibilityMmF = useMemo(
    () =>
      visibilityForCut.map((r) => ({
        name: (r.account_name || `PRJ-${r.project_id}`).slice(0, 18),
        mmf: (r.mmf_inr || 0) / LAKHS,
        gap: (r.gap_to_mmf_inr || 0) / LAKHS,
      })),
    [visibilityForCut],
  );

  const chartForecastTrend = useMemo(
    () =>
      forecastMonthly.map((m) => ({
        month: m.label,
        forecast: +m.revenueL.toFixed(2),
        mmf: +m.mmfL.toFixed(2),
      })),
    [forecastMonthly],
  );

  const projectLabel = useCallback(
    (id: number) => {
      const p = projects.find((x) => x.id === id);
      return (p?.account_name || p?.filename || `PRJ-${id}`) as string;
    },
    [projects],
  );

  const toolbarSelect: React.CSSProperties = {
    background: "var(--surface-raised)",
    border: "1px solid color-mix(in srgb, var(--accent) 22%, transparent)",
    color: "var(--text)",
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 11,
    fontFamily: "'DM Mono',monospace",
    minWidth: 180,
  };

  return (
    <div style={{ display: "grid", gap: 0, paddingBottom: 48 }}>
      {/* ── Page header ── */}
      <div className="rt-page-header-row">
        <div>
          <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.4px", color: "var(--text)", lineHeight: 1.2 }}>
            Revenue trackers
          </div>
          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
            {lastRefresh ? (
              <span style={{ fontSize: 11, color: "var(--text-subtle)", fontFamily: "var(--mono)" }}>
                Last refresh {lastRefresh.toLocaleTimeString()}
              </span>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="font-mono text-[11px]"
          onClick={() => void reload()}
          disabled={loading}
        >
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* ── Filter bar: scope (week + project) + PH pack rail + as-of ── */}
      <div className="rt-filter-bar rt-filter-bar--scope">
        <div className="rt-filter-bar__top">
        <div className="new-contract-sheet rt-scope-ncp-host">
          <div
            className="ncp-section"
            style={{
              marginBottom: 0,
              border: "1px solid color-mix(in srgb, var(--ncp-accent, #e16f3d) 18%, transparent)",
              borderRadius: "var(--ncp-radius-lg, 10px)",
            }}
          >
            <div className="ncp-section-body" style={{ maxHeight: "none", paddingTop: 12 }}>
              <div className="text-[11px] font-mono text-muted-foreground mb-3">
                Governance week (Monday). Use arrows to move week by week.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setGovernanceWeek(shiftWeekMonday(governanceWeekMon, -1))}
                  aria-label="Previous week"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex flex-col gap-1 min-w-[200px] flex-1">
                  <span className="text-[10px] uppercase text-muted-foreground font-mono">Week of (Mon)</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="date"
                      className="ncp-prop-input rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono flex-1 min-w-0"
                      value={governanceWeekMon}
                      onChange={(e) => setGovernanceWeek(mondayOfYmd(e.target.value || governanceWeekMon))}
                    />
                    <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </div>
                  <span className="text-xs font-semibold text-foreground">{formatWeekRangeLabel(governanceWeekMon)}</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setGovernanceWeek(shiftWeekMonday(governanceWeekMon, 1))}
                  aria-label="Next week"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div
                className="ncp-project-wrap mt-4"
                ref={scopeProjWrapRef}
                style={{ borderTop: "1px solid var(--ncp-border, #e8e6e1)", paddingTop: 12 }}
              >
                <button
                  ref={scopeProjBtnRef}
                  type="button"
                  className={cn("ncp-project-btn", (scopeSelectedProject || !projectFilter) && "ncp-selected")}
                  onClick={(e) => {
                    e.stopPropagation();
                    setScopeProjDdOpen((o) => !o);
                  }}
                >
                  {scopeSelectedProject ? (
                    <>
                      <span className="ncp-project-icon">{projInitials(projectDisplayNameFromProject(scopeSelectedProject))}</span>
                      <div className="ncp-project-meta">
                        <strong>{projectDisplayNameFromProject(scopeSelectedProject)}</strong>
                        <span>PRJ-{scopeSelectedProject.id}</span>
                      </div>
                      <span style={{ color: "var(--ncp-accent)" }}>▾</span>
                    </>
                  ) : (
                    <>
                      <span className="ncp-project-icon" style={{ fontSize: 11, fontWeight: 700 }}>
                        ∑
                      </span>
                      <div className="ncp-project-meta">
                        <strong>All assigned projects</strong>
                        <span>Aggregate scope</span>
                      </div>
                      <span style={{ color: "var(--ncp-accent)" }}>▾</span>
                    </>
                  )}
                </button>
                {scopeProjDdOpen && scopeProjDdRect
                  ? createPortal(
                      <div
                        ref={scopeProjPortalRef}
                        className="new-contract-sheet"
                        style={{
                          position: "fixed",
                          top: scopeProjDdRect.top,
                          left: scopeProjDdRect.left,
                          width: scopeProjDdRect.width,
                          zIndex: 200,
                          pointerEvents: "auto",
                          minHeight: 0,
                          height: "auto",
                          display: "block",
                          background: "transparent",
                        }}
                      >
                        <div className="ncp-project-dd ncp-open ncp-project-dd--portal" onClick={(e) => e.stopPropagation()}>
                          <div className="ncp-project-search">
                            <span style={{ opacity: 0.5 }}>🔍</span>
                            <input
                              type="search"
                              placeholder="Search projects…"
                              value={scopeProjSearch}
                              onChange={(e) => setScopeProjSearch(e.target.value)}
                              autoFocus
                            />
                          </div>
                          <div
                            className="ncp-dd-scroll"
                            style={{ maxHeight: 280 }}
                            onWheel={(e) => e.stopPropagation()}
                            onTouchMove={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="ncp-project-opt"
                              onClick={() => {
                                setProjectFilter("");
                                setScopeProjDdOpen(false);
                                setScopeProjSearch("");
                              }}
                            >
                              <span className="ncp-proj-ico" style={{ fontSize: 11, fontWeight: 700 }}>
                                ∑
                              </span>
                              <div>
                                <div style={{ fontWeight: 500, color: "var(--ncp-text-primary)" }}>All assigned projects</div>
                                <div style={{ fontSize: 11, color: "var(--ncp-text-muted)", fontFamily: "var(--ncp-mono)" }}>
                                  Aggregate scope
                                </div>
                              </div>
                            </button>
                            {scopeFilteredProjects.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="ncp-project-opt"
                                onClick={() => {
                                  setProjectFilter(String(p.id));
                                  setScopeProjDdOpen(false);
                                  setScopeProjSearch("");
                                }}
                              >
                                <span className="ncp-proj-ico">{projInitials(projectDisplayNameFromProject(p))}</span>
                                <div>
                                  <div style={{ fontWeight: 500, color: "var(--ncp-text-primary)" }}>{projectDisplayNameFromProject(p)}</div>
                                  <div
                                    style={{ fontSize: 11, color: "var(--ncp-text-muted)", fontFamily: "var(--ncp-mono)" }}
                                  >
                                    PRJ-{p.id}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>,
                      document.body,
                    )
                  : null}
              </div>
            </div>
          </div>
        </div>

        {ph && governancePid ? (
          <div className="rt-command-inline">
            <div className="rt-pack-status">
              <div className="rt-pack-status__head">
                <div
                  className={cn(
                    "rt-pack-status__dot",
                    `rt-pack-status__dot--${weeklyPack?.submission?.status ?? "none"}`,
                  )}
                />
                <span className="rt-pack-status__label">Pack status</span>
              </div>
              <div className="rt-pack-status__value">
                {weeklyPack?.submission?.status ? (
                  <span style={{ textTransform: "capitalize" }}>{weeklyPack.submission.status.replace(/_/g, " ")}</span>
                ) : (
                  <span style={{ color: "var(--text-subtle)", fontWeight: 400, fontSize: 12 }}>No draft yet</span>
                )}
              </div>
              {weeklyPack?.submission?.submitted_by?.email && weeklyPack.submission.status !== "draft" ? (
                <div className="rt-pack-status__meta">
                  Submitted by {weeklyPack.submission.submitted_by.email}
                </div>
              ) : null}
              {weeklyPack?.submission?.approved_by?.email ? (
                <div className="rt-pack-status__meta">
                  Approved by {weeklyPack.submission.approved_by.email}
                </div>
              ) : null}
              {weeklyPack?.submission?.review_notes ? (
                <div className="rt-pack-status__meta" style={{ color: "var(--amber)" }}>
                  {weeklyPack.submission.review_notes}
                </div>
              ) : null}
            </div>

            <div className="rt-pack-completeness">
              <div className={cn("rt-pack-completeness__row", weeklyPack?.forecast && "rt-pack-completeness__row--done")}>
                <span>{weeklyPack?.forecast ? "✓" : "○"}</span>
                <span>Forecast</span>
              </div>
              <div className={cn("rt-pack-completeness__row", weeklyPack?.visibility && "rt-pack-completeness__row--done")}>
                <span>{weeklyPack?.visibility ? "✓" : "○"}</span>
                <span>Visibility</span>
              </div>
            </div>

            <div className="rt-cta-area">
              {weeklyPack?.submission &&
              ["draft", "changes_requested", "rejected"].includes(String(weeklyPack.submission.status)) &&
              canPracticeSubmitBilling(user) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="font-mono text-[11px]"
                  onClick={async () => {
                    try {
                      await queries.revenueWeeklySubmissionSubmit(weeklyPack.submission!.id);
                      await reload();
                      void loadMinePacks();
                    } catch (e: unknown) {
                      window.alert(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  Submit to finance
                </Button>
              ) : null}
              <button
                type="button"
                className="rt-cta-primary"
                disabled={!governancePid}
                onClick={() => setWeeklyPackSheetOpen(true)}
              >
                <span className="rt-cta-primary__icon" aria-hidden>
                  <PencilLine strokeWidth={2} />
                </span>
                Open weekly pack
              </button>
            </div>
          </div>
        ) : null}
        </div>

        <div className="rt-filter-bar__bottom">
          {mainTab === "Revenue visibility" ? (
            <div className="rt-filter-group rt-filter-group--asof">
              <span className="rt-filter-label">Visibility as-of</span>
              <select
                className="rt-filter-select"
                value={effectiveAsOf}
                onChange={(e) => setAsOfFilter(e.target.value)}
              >
                {asOfDates.length === 0 ? <option value="">No snapshots yet</option> : null}
                {asOfDates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {err ? <span style={{ fontSize: 11, color: "var(--red)", fontFamily: "var(--mono)" }}>{err}</span> : null}
        </div>
      </div>

      {/* ── View tabs ── */}
      <div className="rt-tabs-bar" role="tablist">
        {(ph
          ? (["Revenue visibility", "Revenue forecast", "My weekly packs"] as const)
          : (["Revenue visibility", "Revenue forecast"] as const)
        ).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={mainTab === t}
            className={cn("rt-tab", mainTab === t && "rt-tab--active")}
            onClick={() => setMainTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ─────────── Revenue visibility ─────────── */}
      {mainTab === "Revenue visibility" ? (
        <section>
          {/* KPIs */}
          <div className="rt-kpi-grid">
            <ExecutiveKpiCard
              title="Total MMF"
              accent="orange"
              primary={formatLargeCurrency(visibilityTotals.mmf)}
              sublines={[{ label: "In scope (₹)", value: visibilityTotals.mmf > 0 ? "—" : "No data" }]}
            />
            <ExecutiveKpiCard
              title="Opening fee"
              accent="teal"
              primary={formatLargeCurrency(visibilityTotals.openFee)}
              sublines={[{ label: "Open reqs", value: String(visibilityTotals.openReq) }]}
            />
            <ExecutiveKpiCard
              title="Joining fee"
              accent="green"
              primary={formatLargeCurrency(visibilityTotals.joinFee)}
              sublines={[{ label: "Joiners", value: String(visibilityTotals.joiners) }]}
            />
            <ExecutiveKpiCard
              title="Yet to join"
              accent="blue"
              primary={String(visibilityTotals.ytj)}
              sublines={[{ label: "YTJ fee (₹)", value: formatLargeCurrency(visibilityTotals.ytjFee) }]}
            />
            <ExecutiveKpiCard
              title="Conversion %"
              accent="amber"
              primary={visibilityTotals.convPct != null ? formatPercent(visibilityTotals.convPct, 1) : "—"}
              sublines={[
                {
                  label: "Rev realised",
                  value: visibilityTotals.revPct != null ? formatPercent(visibilityTotals.revPct, 1) : "—",
                },
              ]}
            />
            <ExecutiveKpiCard
              title="Gap to MMF"
              accent="red"
              primary={formatLargeCurrency(visibilityTotals.gap)}
              sublines={[{ label: "vs MMF target", value: "↑ fill gap" }]}
            />
          </div>

          {/* Charts */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 24 }}>
            <div className="platform-card" style={{ padding: 14 }}>
              <div className="rt-section-hd" style={{ marginTop: 0 }}>
                <div>
                  <div className="rt-section-title">MMF vs gap</div>
                  <div className="rt-section-sub">₹ Lakhs by project</div>
                </div>
              </div>
              <div style={{ width: "100%", height: 200 }}>
                {chartVisibilityMmF.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartVisibilityMmF} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, var(--accent) 12%, transparent)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: "var(--text-subtle)", fontSize: 9 }} axisLine={false} tickLine={false} interval={0} angle={-25} textAnchor="end" height={52} />
                      <YAxis tick={{ fill: "var(--text-subtle)", fontSize: 9 }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v: number | string, name: string) => [`${Number(v).toFixed(2)} L`, name === "mmf" ? "MMF" : "Gap"]} />
                      <Bar dataKey="mmf" name="MMF" fill="color-mix(in srgb, var(--accent) 70%, transparent)" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="gap" name="Gap" fill="color-mix(in srgb, var(--amber) 55%, transparent)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 200, display: "grid", placeItems: "center", color: "var(--text-subtle)", fontSize: 11 }}>No data</div>
                )}
              </div>
            </div>
            <div className="platform-card" style={{ padding: 14 }}>
              <div className="rt-section-hd" style={{ marginTop: 0 }}>
                <div>
                  <div className="rt-section-title">Pipeline mix</div>
                  <div className="rt-section-sub">Joiners vs yet-to-join</div>
                </div>
              </div>
              <div style={{ width: "100%", height: 200 }}>
                {visibilityForCut.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={visibilityForCut.map((r) => ({
                        name: (r.account_name || `P${r.project_id}`).slice(0, 14),
                        joiners: r.joiners_as_on_date || 0,
                        ytj: r.yet_to_join || 0,
                      }))}
                      margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, var(--accent) 12%, transparent)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: "var(--text-subtle)", fontSize: 9 }} axisLine={false} tickLine={false} interval={0} angle={-25} textAnchor="end" height={52} />
                      <YAxis tick={{ fill: "var(--text-subtle)", fontSize: 9 }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip contentStyle={CHART_TOOLTIP} />
                      <Legend wrapperStyle={{ fontSize: 10, fontFamily: "var(--mono)" }} />
                      <Bar dataKey="joiners" name="Joiners" stackId="a" fill="color-mix(in srgb, var(--green) 65%, transparent)" />
                      <Bar dataKey="ytj" name="YTJ" stackId="a" fill="color-mix(in srgb, var(--accent2) 55%, transparent)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 200, display: "grid", placeItems: "center", color: "var(--text-subtle)", fontSize: 11 }}>No data</div>
                )}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="rt-section-hd">
            <div>
              <div className="rt-section-title">Project-wise revenue summary</div>
              <div className="rt-section-sub">As-of {effectiveAsOf || "latest"}</div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="font-mono text-[11px]"
              onClick={() => { setEditVisibilityRow(null); setVisibilityModalOpen(true); }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add / update
            </Button>
          </div>
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Project</th>
                  <th>Open req</th>
                  <th>Opening fee (₹)</th>
                  <th>Joiners</th>
                  <th>Joining fee (₹)</th>
                  <th>YTJ</th>
                  <th>YTJ fee (₹)</th>
                  <th>Conv %</th>
                  <th>Rev %</th>
                  <th>Gap to MMF (₹)</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibilityForCut.map((r, i) => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: "var(--mono)", color: "var(--text-subtle)" }}>{i + 1}</td>
                    <td>{r.account_name || projectLabel(r.project_id)}</td>
                    <td>{r.open_req}</td>
                    <td>{formatCurrency(r.opening_fee_inr)}</td>
                    <td>{r.joiners_as_on_date}</td>
                    <td>{formatCurrency(r.joining_fee_inr)}</td>
                    <td>{r.yet_to_join}</td>
                    <td>{formatCurrency(r.ytj_fee_inr)}</td>
                    <td>{r.conversion_rate_pct != null ? formatPercent(r.conversion_rate_pct, 1) : "—"}</td>
                    <td>{r.revenue_realised_pct != null ? formatPercent(r.revenue_realised_pct, 1) : "—"}</td>
                    <td>{formatCurrency(r.gap_to_mmf_inr)}</td>
                    <td>{statusDisplay(r.status)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button
                          type="button"
                          title="Edit"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", padding: 4 }}
                          onClick={() => { setEditVisibilityRow(r); setVisibilityModalOpen(true); }}
                        >
                          <PencilLine className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontSize: 10, fontFamily: "var(--mono)" }}
                          onClick={async () => {
                            if (!window.confirm("Delete this visibility snapshot?")) return;
                            await queries.deleteRevenueVisibility(r.id);
                            await reload();
                          }}
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {visibilityForCut.length ? (
                <tfoot>
                  <tr style={{ fontWeight: 700, background: "color-mix(in srgb, var(--accent) 6%, transparent)" }}>
                    <td colSpan={2}>TOTAL</td>
                    <td>{visibilityTotals.openReq}</td>
                    <td>{formatCurrency(visibilityTotals.openFee)}</td>
                    <td>{visibilityTotals.joiners}</td>
                    <td>{formatCurrency(visibilityTotals.joinFee)}</td>
                    <td>{visibilityTotals.ytj}</td>
                    <td>{formatCurrency(visibilityTotals.ytjFee)}</td>
                    <td>{visibilityTotals.convPct != null ? formatPercent(visibilityTotals.convPct, 1) : "—"}</td>
                    <td>{visibilityTotals.revPct != null ? formatPercent(visibilityTotals.revPct, 1) : "—"}</td>
                    <td>{formatCurrency(visibilityTotals.gap)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              ) : null}
            </table>
            {!visibilityForCut.length && !loading ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-subtle)", fontSize: 12, fontFamily: "var(--mono)" }}>
                No visibility rows for this as-of date.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ─────────── Revenue forecast ─────────── */}
      {mainTab === "Revenue forecast" ? (
        <section>
          {/* KPIs */}
          <div className="rt-kpi-grid">
            <ExecutiveKpiCard
              title="Revenue forecast"
              accent="orange"
              primary={fmtLakhs(forecastTotals.revL * LAKHS)}
              sublines={[{ label: "₹ Lakhs", value: "total" }]}
            />
            <ExecutiveKpiCard
              title="Total MMF"
              accent="teal"
              primary={fmtLakhs(forecastTotals.mmfL * LAKHS)}
              sublines={[{ label: "₹ Lakhs", value: "target" }]}
            />
            <ExecutiveKpiCard
              title="Open reqs"
              accent="blue"
              primary={String(forecastTotals.openReq)}
              sublines={[{ label: "Open fee (L)", value: fmtLakhs(forecastTotals.openFeeL * LAKHS) }]}
            />
            <ExecutiveKpiCard
              title="Total joiners"
              accent="green"
              primary={String(forecastTotals.joiners)}
              sublines={[{ label: "Joiner fee (L)", value: fmtLakhs(forecastTotals.joinerFeeL * LAKHS) }]}
            />
            <ExecutiveKpiCard
              title="Avg achievement"
              accent="amber"
              primary={forecastTotals.achPct != null ? formatPercent(forecastTotals.achPct, 1) : "—"}
              sublines={[{ label: "vs MMF", value: "weekly avg" }]}
            />
          </div>

          {/* Chart */}
          <div className="platform-card" style={{ padding: 14, marginBottom: 24 }}>
            <div className="rt-section-hd" style={{ marginTop: 0 }}>
              <div>
                <div className="rt-section-title">Revenue forecast vs MMF</div>
                <div className="rt-section-sub">₹ Lakhs · monthly roll-up from weekly entries</div>
              </div>
            </div>
            <div style={{ width: "100%", height: 240 }}>
              {chartForecastTrend.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartForecastTrend} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, var(--accent) 12%, transparent)" />
                    <XAxis dataKey="month" tick={{ fill: "var(--text-subtle)", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "var(--text-subtle)", fontSize: 9 }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                    <Legend wrapperStyle={{ fontSize: 10, fontFamily: "var(--mono)" }} />
                    <Bar dataKey="forecast" name="Revenue forecast" fill="color-mix(in srgb, var(--accent) 45%, transparent)" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="mmf" name="MMF" stroke="var(--accent2)" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 240, display: "grid", placeItems: "center", color: "var(--text-subtle)", fontSize: 11, fontFamily: "var(--mono)" }}>No monthly roll-up yet</div>
              )}
            </div>
          </div>

          {/* Monthly roll-up table */}
          <div className="rt-section-hd">
            <div>
              <div className="rt-section-title">Monthly roll-up</div>
              <div className="rt-section-sub">Aggregated from weekly entries</div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="font-mono text-[11px]"
              onClick={() => { setForecastWizard(null); setEditForecastRow(null); setForecastModalOpen(true); }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add weekly row
            </Button>
          </div>
          <div className="platform-table-wrap" style={{ marginBottom: 24 }}>
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Revenue forecast (L)</th>
                  <th>MMF (L)</th>
                  <th>Open req</th>
                  <th>Open fee (L)</th>
                  <th>Joiners</th>
                  <th>Joiner fee (L)</th>
                  <th>Achievement %</th>
                </tr>
              </thead>
              <tbody>
                {forecastMonthly.map((m) => (
                  <tr key={m.key}>
                    <td style={{ fontWeight: 600 }}>{m.label}</td>
                    <td>{m.revenueL.toFixed(2)}</td>
                    <td>{m.mmfL.toFixed(2)}</td>
                    <td>{m.openReq}</td>
                    <td>{m.openFeeL.toFixed(2)}</td>
                    <td>{m.joiners}</td>
                    <td>{m.joinerFeeL.toFixed(2)}</td>
                    <td>{m.achPct != null ? formatPercent(m.achPct, 1) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              {forecastMonthly.length ? (
                <tfoot>
                  <tr style={{ fontWeight: 700, background: "color-mix(in srgb, var(--accent) 6%, transparent)" }}>
                    <td>TOTAL</td>
                    <td>{forecastTotals.revL.toFixed(2)}</td>
                    <td>{forecastTotals.mmfL.toFixed(2)}</td>
                    <td>{forecastTotals.openReq}</td>
                    <td>{forecastTotals.openFeeL.toFixed(2)}</td>
                    <td>{forecastTotals.joiners}</td>
                    <td>{forecastTotals.joinerFeeL.toFixed(2)}</td>
                    <td>{forecastTotals.achPct != null ? formatPercent(forecastTotals.achPct, 1) : "—"}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
            {!forecastMonthly.length && !loading ? (
              <div style={{ padding: 16, color: "var(--text-subtle)", fontSize: 12, fontFamily: "var(--mono)" }}>No forecast rows in scope.</div>
            ) : null}
          </div>

          {/* Weekly entries */}
          <div className="rt-section-hd">
            <div>
              <div className="rt-section-title">Weekly entries</div>
              <div className="rt-section-sub">Raw rows · edit or delete individual submissions</div>
            </div>
          </div>
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Week start</th>
                  <th>Account</th>
                  <th>Net revenue (L)</th>
                  <th>Open req</th>
                  <th>Achievement %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {forecast.map((r) => (
                  <tr key={r.id}>
                    <td>{r.week_start_date}</td>
                    <td>{r.account_name || projectLabel(r.project_id)}</td>
                    <td>{fmtLakhs(r.net_revenue_inr)}</td>
                    <td>{r.open_req}</td>
                    <td>{r.achievement_pct != null ? formatPercent(r.achievement_pct, 1) : "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          style={{ fontSize: 10, background: "none", border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)", color: "var(--accent)", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontFamily: "var(--mono)" }}
                          onClick={() => { setForecastWizard(null); setEditForecastRow(r); setForecastModalOpen(true); }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          style={{ fontSize: 10, color: "var(--red)", background: "none", border: "none", cursor: "pointer" }}
                          onClick={async () => {
                            if (!window.confirm("Delete this weekly forecast row?")) return;
                            await queries.deleteRevenueForecastWeekly(r.id);
                            await reload();
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!forecast.length && !loading ? (
              <div style={{ padding: 16, color: "var(--text-subtle)", fontSize: 12, fontFamily: "var(--mono)" }}>No weekly rows.</div>
            ) : null}
          </div>
        </section>
      ) : null}

      {mainTab === "My weekly packs" && ph ? (
        <section>
          <div className="rt-section-hd" style={{ marginTop: 0 }}>
            <div>
              <div className="rt-section-title">My weekly packs</div>
              <div className="rt-section-sub">Draft &amp; submitted history · open a row to jump to Revenue forecast with that week</div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="font-mono text-[11px]"
              onClick={() => void loadMinePacks()}
              disabled={minePacksLoading}
            >
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", minePacksLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Week (Mon)</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {minePacks.map((r) => (
                  <tr key={r.id}>
                    <td>{r.account_name || `Project ${r.project_id}`}</td>
                    <td>{r.week_start_date ?? "—"}</td>
                    <td>{r.status}</td>
                    <td className="text-[10px] font-mono">{r.updated_at ?? "—"}</td>
                    <td>
                      {r.week_start_date ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="font-mono text-[10px] h-7"
                          onClick={() => {
                            setProjectFilter(String(r.project_id));
                            setGovernanceWeek(mondayOfYmd(r.week_start_date!));
                            setMainTab("Revenue forecast");
                          }}
                        >
                          Open in workspace
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!minePacks.length && !minePacksLoading ? (
              <div className="p-4 text-muted-foreground text-xs font-mono">
                No packs yet. Open a weekly pack from the command bar above to create a draft.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ── Dialogs ── */}
      <ForecastFormDialog
        open={forecastModalOpen}
        onOpenChange={(o) => {
          setForecastModalOpen(o);
          if (!o) { setEditForecastRow(null); setForecastWizard(null); }
        }}
        projects={projects}
        defaultProjectId={pid}
        initialRow={editForecastRow}
        wizardWeekStart={forecastWizard?.week ?? null}
        wizardProjectId={forecastWizard?.projectId ?? null}
        governanceFieldsLocked={!!forecastWizard}
        onSaved={reload}
      />
      <VisibilityFormDialog
        open={visibilityModalOpen}
        onOpenChange={(o) => {
          setVisibilityModalOpen(o);
          if (!o) setEditVisibilityRow(null);
        }}
        projects={projects}
        defaultProjectId={pid}
        defaultAsOf={effectiveAsOf}
        governanceWeekStart={governancePid ? governanceWeekMon : null}
        initialRow={editVisibilityRow}
        onSaved={reload}
      />
      {ph && governancePid ? (
        <WeeklyPackNcpSheet
          open={weeklyPackSheetOpen}
          onOpenChange={setWeeklyPackSheetOpen}
          projects={projects}
          projectId={governancePid}
          governanceWeek={governanceWeekMon}
          onGovernanceWeekChange={(w) => setGovernanceWeek(mondayOfYmd(w))}
          onSaved={() => {
            void reload();
            void loadMinePacks();
          }}
          lockProject={!!projectFilter}
          currentUser={user}
        />
      ) : null}
    </div>
  );
}

function ForecastFormDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
  initialRow,
  wizardWeekStart,
  wizardProjectId,
  governanceFieldsLocked,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projects: Project[];
  defaultProjectId?: number;
  initialRow: RevenueForecastWeeklyRow | null;
  wizardWeekStart?: string | null;
  wizardProjectId?: number | null;
  governanceFieldsLocked?: boolean;
  onSaved: () => void;
}) {
  const lockProject = !!governanceFieldsLocked;
  const [projectId, setProjectId] = useState<number>(defaultProjectId ?? projects[0]?.id ?? 0);
  const [weekStart, setWeekStart] = useState(mondayYmd());
  const [monthAnchor, setMonthAnchor] = useState(() => todayYmd().slice(0, 7) + "-01");
  const [updateDate, setUpdateDate] = useState(todayYmd());
  const [weekLabel, setWeekLabel] = useState("");
  const [remarks, setRemarks] = useState("");
  const [revenueForecastLakhs, setRevenueForecastLakhs] = useState("0");
  const [adjustmentLakhs, setAdjustmentLakhs] = useState("0");
  const [penaltyLakhs, setPenaltyLakhs] = useState("0");
  const [badDebtsLakhs, setBadDebtsLakhs] = useState("0");
  const [mmfLakhs, setMmfLakhs] = useState("0");
  const [openFeeLakhs, setOpenFeeLakhs] = useState("0");
  const [joinerFeeLakhs, setJoinerFeeLakhs] = useState("0");
  const [tboFeeLakhs, setTboFeeLakhs] = useState("0");
  const [netRevLakhs, setNetRevLakhs] = useState("0");
  const [openReq, setOpenReq] = useState("0");
  const [joinerCount, setJoinerCount] = useState("0");
  const [tboCount, setTboCount] = useState("0");
  const [achPct, setAchPct] = useState("");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [forecastDatesCollapsed, setForecastDatesCollapsed] = useState(false);
  const [projDdOpen, setProjDdOpen] = useState(false);
  const [projSearch, setProjSearch] = useState("");
  const [projDdRect, setProjDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const projWrapRef = useRef<HTMLDivElement>(null);
  const projBtnRef = useRef<HTMLButtonElement>(null);
  const projPortalRef = useRef<HTMLDivElement>(null);

  const monthOptions = useMemo(() => monthAnchorOptions(), []);
  const selectedProject = useMemo(() => projects.find((p) => p.id === projectId) ?? null, [projects, projectId]);
  const filteredProjects = useMemo(() => {
    const q = projSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const lab = projectDisplayNameFromProject(p).toLowerCase();
      return lab.includes(q) || String(p.id).includes(q);
    });
  }, [projects, projSearch]);

  const weekMonday = mondayOfYmd(weekStart);
  const weekEndYmd = addDaysYmd(weekMonday, 6);

  useEffect(() => {
    if (defaultProjectId) setProjectId(defaultProjectId);
  }, [defaultProjectId]);

  useEffect(() => {
    if (!projectId && projects.length) setProjectId(projects[0].id);
  }, [projects, projectId]);

  useLayoutEffect(() => {
    if (!projDdOpen) {
      setProjDdRect(null);
      return;
    }
    const measure = () => {
      const btn = projBtnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setProjDdRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (projBtnRef.current) ro.observe(projBtnRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [projDdOpen]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (projWrapRef.current?.contains(t) || projPortalRef.current?.contains(t)) return;
      setProjDdOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const resetEmpty = useCallback(() => {
    setWeekStart(mondayYmd());
    setMonthAnchor(todayYmd().slice(0, 7) + "-01");
    setUpdateDate(todayYmd());
    setWeekLabel("");
    setRemarks("");
    setRevenueForecastLakhs("0");
    setAdjustmentLakhs("0");
    setPenaltyLakhs("0");
    setBadDebtsLakhs("0");
    setMmfLakhs("0");
    setOpenFeeLakhs("0");
    setJoinerFeeLakhs("0");
    setTboFeeLakhs("0");
    setNetRevLakhs("0");
    setOpenReq("0");
    setJoinerCount("0");
    setTboCount("0");
    setAchPct("");
  }, []);

  const fillFromRow = useCallback((r: RevenueForecastWeeklyRow) => {
    setProjectId(r.project_id);
    setWeekStart(mondayOfYmd(r.week_start_date ?? mondayYmd()));
    setMonthAnchor(r.month_anchor ?? todayYmd().slice(0, 7) + "-01");
    setUpdateDate(r.update_date ?? todayYmd());
    setWeekLabel(r.week_label ?? "");
    setRemarks(r.remarks ?? "");
    setRevenueForecastLakhs(String((r.revenue_forecast_inr || 0) / LAKHS));
    setAdjustmentLakhs(String((r.adjustment_inr || 0) / LAKHS));
    setPenaltyLakhs(String((r.penalty_inr || 0) / LAKHS));
    setBadDebtsLakhs(String((r.bad_debts_inr || 0) / LAKHS));
    setMmfLakhs(String((r.mmf_inr || 0) / LAKHS));
    setOpenFeeLakhs(String((r.open_fee_inr || 0) / LAKHS));
    setJoinerFeeLakhs(String((r.joiner_fee_inr || 0) / LAKHS));
    setTboFeeLakhs(String((r.to_be_offer_fee_inr || 0) / LAKHS));
    setNetRevLakhs(String((r.net_revenue_inr || 0) / LAKHS));
    setOpenReq(String(r.open_req ?? 0));
    setJoinerCount(String(r.joiner_count ?? 0));
    setTboCount(String(r.to_be_offer_count ?? 0));
    setAchPct(r.achievement_pct != null ? String(r.achievement_pct) : "");
  }, []);

  useEffect(() => {
    if (!open) return;
    setProjDdOpen(false);
    setProjSearch("");
    if (initialRow) {
      fillFromRow(initialRow);
      setStep(1);
    } else {
      resetEmpty();
      const wPid = wizardProjectId != null && wizardProjectId > 0 ? wizardProjectId : null;
      if (wPid) setProjectId(wPid);
      else if (defaultProjectId) setProjectId(defaultProjectId);
      if (wizardWeekStart) setWeekStart(mondayOfYmd(wizardWeekStart));
      setStep(lockProject ? 1 : 0);
    }
  }, [open, initialRow, fillFromRow, resetEmpty, defaultProjectId, wizardWeekStart, wizardProjectId, lockProject]);

  const stepLabels = ["Week & project", "Forecast", "Visibility"] as const;
  const goToStep = (i: number) => {
    if (i === 2) return;
    if (i >= 1 && !projectId) return;
    setStep(i);
  };

  const bumpWeek = (delta: number) => {
    if (lockProject) return;
    setWeekStart(shiftWeekMonday(weekMonday, delta));
  };

  const onWeekInput = (v: string) => {
    if (lockProject) return;
    setWeekStart(mondayOfYmd(v || weekMonday));
  };

  const forecastFormId = "revenue-forecast-sheet-form";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    setSaving(true);
    try {
      await queries.upsertRevenueForecastWeekly({
        project_id: projectId,
        week_start_date: weekMonday,
        month_anchor: monthAnchor,
        update_date: updateDate || undefined,
        week_label: weekLabel || null,
        remarks: remarks || null,
        revenue_forecast_lakhs: parseFloat(revenueForecastLakhs) || 0,
        adjustment_lakhs: parseFloat(adjustmentLakhs) || 0,
        penalty_lakhs: parseFloat(penaltyLakhs) || 0,
        bad_debts_lakhs: parseFloat(badDebtsLakhs) || 0,
        mmf_lakhs: parseFloat(mmfLakhs) || 0,
        open_fee_lakhs: parseFloat(openFeeLakhs) || 0,
        joiner_fee_lakhs: parseFloat(joinerFeeLakhs) || 0,
        to_be_offer_fee_lakhs: parseFloat(tboFeeLakhs) || 0,
        net_revenue_lakhs: parseFloat(netRevLakhs) || 0,
        open_req: parseInt(openReq, 10) || 0,
        joiner_count: parseInt(joinerCount, 10) || 0,
        to_be_offer_count: parseInt(tboCount, 10) || 0,
        achievement_pct: achPct.trim() === "" ? null : parseFloat(achPct),
      });
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          "flex h-full max-h-[100dvh] flex-col gap-0 border-l p-0",
          "data-[side=right]:w-full data-[side=right]:max-w-[calc(100vw-1rem)]",
          "sm:data-[side=right]:w-[min(calc(100vw-2rem),52rem)] sm:data-[side=right]:max-w-[min(calc(100vw-2rem),52rem)]",
          "bg-[#f7f6f3] shadow-xl",
        )}
      >
        <div className="new-contract-sheet flex min-h-0 flex-1 flex-col">
          <div className="ncp-scroll min-h-0 flex-1">
            <div className="ncp-page">
              <div className="ncp-header">
                <div style={{ minWidth: 0 }}>
                  <div className="ncp-breadcrumb">
                    <span>Revenue</span>
                    <span className="ncp-breadcrumb-sep">›</span>
                    <span>Weekly pack</span>
                  </div>
                  <h1 className="ncp-h1">Forecast &amp; visibility</h1>
                  <p className="ncp-subtitle" style={{ marginTop: 4 }}>
                    Enter weekly forecast (₹ Lakhs) and pipeline visibility (INR) for one governance week. This sheet saves
                    forecast numbers only; open the full weekly pack to edit visibility alongside forecast.
                  </p>
                </div>
                <button type="button" className="ncp-close-btn" aria-label="Close" onClick={() => onOpenChange(false)}>
                  ✕
                </button>
              </div>

              <div className="ncp-steps" role="tablist">
                {stepLabels.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    className={cn("ncp-step", step === i && "ncp-active", step > i && "ncp-done")}
                    onClick={() => goToStep(i)}
                    disabled={i === 2 || (i >= 1 && !projectId)}
                  >
                    <span className="ncp-step-num">{step > i ? "✓" : i + 1}</span>
                    {label}
                  </button>
                ))}
              </div>

              {step >= 1 && !projectId ? (
                <div className="ncp-req-note" style={{ marginBottom: 12 }}>
                  <span>●</span> Project selection is required to continue
                </div>
              ) : null}

              <form id={forecastFormId} onSubmit={onSubmit}>
                <div className={cn("ncp-panel", step === 0 && "ncp-panel-active")}>
                  <div
                    className="ncp-section"
                    style={{
                      marginBottom: 14,
                      border: "1px solid color-mix(in srgb, var(--ncp-accent, #e16f3d) 18%, transparent)",
                      borderRadius: "var(--ncp-radius, 10px)",
                    }}
                  >
                    <div className="ncp-section-body" style={{ maxHeight: "none", paddingTop: 12 }}>
                      <div className="text-[11px] font-mono text-muted-foreground mb-3">
                        Governance week (Monday). Use arrows to move week by week.
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => bumpWeek(-1)}
                          aria-label="Previous week"
                          disabled={lockProject}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex flex-col gap-1 min-w-[200px] flex-1">
                          <span className="text-[10px] uppercase text-muted-foreground font-mono">Week of (Mon)</span>
                          <input
                            type="date"
                            className="ncp-prop-input rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
                            value={weekMonday}
                            onChange={(e) => onWeekInput(e.target.value)}
                            disabled={lockProject}
                          />
                          <span className="text-xs font-semibold text-foreground">{formatWeekRangeLabel(weekMonday)}</span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => bumpWeek(1)}
                          aria-label="Next week"
                          disabled={lockProject}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>

                      <div
                        className="ncp-project-wrap mt-4"
                        ref={projWrapRef}
                        style={{ borderTop: "1px solid var(--ncp-border, #e8e6e1)", paddingTop: 12 }}
                      >
                        <button
                          ref={projBtnRef}
                          type="button"
                          className={cn("ncp-project-btn", selectedProject && "ncp-selected")}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (lockProject) return;
                            setProjDdOpen((o) => !o);
                          }}
                          disabled={lockProject}
                        >
                          {selectedProject ? (
                            <>
                              <span className="ncp-project-icon">{projInitials(projectDisplayNameFromProject(selectedProject))}</span>
                              <div className="ncp-project-meta">
                                <strong>{projectDisplayNameFromProject(selectedProject)}</strong>
                                <span>PRJ-{selectedProject.id}</span>
                              </div>
                              <span style={{ color: lockProject ? "var(--ncp-text-muted)" : "var(--ncp-accent)" }}>▾</span>
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: 20 }}>＋</span>
                              <span>Search or select a project (PRJ-···)</span>
                              <span style={{ color: "var(--ncp-text-muted)" }}>▾</span>
                            </>
                          )}
                        </button>
                        {!lockProject && projDdOpen && projDdRect
                          ? createPortal(
                              <div
                                ref={projPortalRef}
                                className="new-contract-sheet"
                                style={{
                                  position: "fixed",
                                  top: projDdRect.top,
                                  left: projDdRect.left,
                                  width: projDdRect.width,
                                  zIndex: 200,
                                  pointerEvents: "auto",
                                  minHeight: 0,
                                  height: "auto",
                                  display: "block",
                                  background: "transparent",
                                }}
                              >
                                <div className="ncp-project-dd ncp-open ncp-project-dd--portal" onClick={(e) => e.stopPropagation()}>
                                  <div className="ncp-project-search">
                                    <span style={{ opacity: 0.5 }}>🔍</span>
                                    <input
                                      type="search"
                                      placeholder="Search projects…"
                                      value={projSearch}
                                      onChange={(e) => setProjSearch(e.target.value)}
                                      autoFocus
                                    />
                                  </div>
                                  <div
                                    className="ncp-dd-scroll"
                                    style={{ maxHeight: 280 }}
                                    onWheel={(e) => e.stopPropagation()}
                                    onTouchMove={(e) => e.stopPropagation()}
                                  >
                                    {filteredProjects.map((p) => (
                                      <button
                                        key={p.id}
                                        type="button"
                                        className="ncp-project-opt"
                                        onClick={() => {
                                          setProjectId(p.id);
                                          setProjDdOpen(false);
                                          setProjSearch("");
                                        }}
                                      >
                                        <span className="ncp-proj-ico">{projInitials(projectDisplayNameFromProject(p))}</span>
                                        <div>
                                          <div style={{ fontWeight: 500, color: "var(--ncp-text-primary)" }}>{projectDisplayNameFromProject(p)}</div>
                                          <div
                                            style={{ fontSize: 11, color: "var(--ncp-text-muted)", fontFamily: "var(--ncp-mono)" }}
                                          >
                                            PRJ-{p.id}
                                          </div>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>,
                              document.body,
                            )
                          : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={cn("ncp-panel", step === 1 && "ncp-panel-active")}>
                  <div className="ncp-section" style={{ marginBottom: 12 }}>
                    <div className="ncp-section-header" style={{ cursor: "default" }}>
                      <div className="ncp-section-icon ncp-orange">₹</div>
                      <div>
                        <div className="ncp-section-label">Weekly revenue forecast</div>
                        <div className="ncp-section-desc">Amounts in ₹ Lakhs. Updates the forecast half of your weekly pack.</div>
                      </div>
                    </div>
                    <div className="ncp-section-body" style={{ maxHeight: "none" }}>
                      <div className="grid gap-0">
                        <div className={cn("ncp-section", forecastDatesCollapsed && "ncp-collapsed")} style={{ marginBottom: 12 }}>
                          <button
                            type="button"
                            className="ncp-section-header"
                            onClick={() => setForecastDatesCollapsed((c) => !c)}
                          >
                            <div className="ncp-section-icon ncp-blue">📅</div>
                            <div>
                              <div className="ncp-section-label">Forecast period</div>
                              <div className="ncp-section-desc">Month anchor, governance week, update date, and optional week label</div>
                            </div>
                            <span className="ncp-section-toggle">▾</span>
                          </button>
                          <div
                            className="ncp-section-body"
                            style={{ maxHeight: forecastDatesCollapsed ? 0 : 520, transition: "max-height 0.2s ease" }}
                          >
                            <div className="ncp-date-grid">
                              <div className="ncp-date-cell">
                                <label>Month anchor</label>
                                <select className="ncp-prop-input" value={monthAnchor} onChange={(e) => setMonthAnchor(e.target.value)}>
                                  {!monthOptions.includes(monthAnchor) ? (
                                    <option value={monthAnchor}>{monthAnchorLabel(monthAnchor)}</option>
                                  ) : null}
                                  {monthOptions.map((m) => (
                                    <option key={m} value={m}>
                                      {monthAnchorLabel(m)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="ncp-date-cell">
                                <label>Update date</label>
                                <input type="date" value={updateDate} onChange={(e) => setUpdateDate(e.target.value)} />
                              </div>
                            </div>
                            <div className="ncp-date-grid">
                              <div className="ncp-date-cell">
                                <label>Week start (Mon)</label>
                                <input type="date" readOnly value={weekMonday} />
                              </div>
                              <div className="ncp-date-cell">
                                <label>Week end (Sun)</label>
                                <input type="date" readOnly value={weekEndYmd} />
                              </div>
                            </div>
                            <div className="ncp-prop-row" style={{ marginTop: 4 }}>
                              <div className="ncp-prop-label">Duration</div>
                              <div className="ncp-computed-field">
                                <span className="ncp-computed-label">AUTO</span>
                                <span>7 days (governance week)</span>
                              </div>
                            </div>
                            <div className="ncp-prop-row" style={{ borderTop: "none" }}>
                              <div className="ncp-prop-label">Week label</div>
                              <input
                                className="ncp-prop-input"
                                value={weekLabel}
                                onChange={(e) => setWeekLabel(e.target.value)}
                                placeholder="Optional"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-3 mt-2">
                          {(
                            [
                              ["Revenue forecast (L)", revenueForecastLakhs, setRevenueForecastLakhs],
                              ["Adjustment (L)", adjustmentLakhs, setAdjustmentLakhs],
                              ["Penalty (L)", penaltyLakhs, setPenaltyLakhs],
                              ["Bad debts (L)", badDebtsLakhs, setBadDebtsLakhs],
                              ["MMF (L)", mmfLakhs, setMmfLakhs],
                              ["Open fee (L)", openFeeLakhs, setOpenFeeLakhs],
                              ["Joiner fee (L)", joinerFeeLakhs, setJoinerFeeLakhs],
                              ["TBO fee (L)", tboFeeLakhs, setTboFeeLakhs],
                              ["Net revenue (L)", netRevLakhs, setNetRevLakhs],
                              ["Open req", openReq, setOpenReq],
                              ["Joiners", joinerCount, setJoinerCount],
                              ["TBO count", tboCount, setTboCount],
                              ["Achievement %", achPct, setAchPct],
                            ] as const
                          ).map(([label, val, set]) => (
                            <div key={label} className="ncp-prop-row">
                              <div className="ncp-prop-label">{label}</div>
                              <input className="ncp-prop-input" value={val} onChange={(e) => set(e.target.value)} inputMode="decimal" />
                            </div>
                          ))}
                        </div>
                        <div className="ncp-prop-row mt-2" style={{ alignItems: "flex-start" }}>
                          <div className="ncp-prop-label" style={{ paddingTop: 10 }}>
                            Remarks
                          </div>
                          <textarea
                            className="ncp-prop-input"
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            rows={3}
                            style={{ minHeight: 72, resize: "vertical" }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>

          <div className="ncp-footer">
            <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form={forecastFormId} className="ncp-btn ncp-btn-primary" disabled={saving || !projectId}>
              {saving ? "Saving…" : "Save forecast"}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VisibilityFormDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
  defaultAsOf,
  governanceWeekStart,
  initialRow,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projects: Project[];
  defaultProjectId?: number;
  defaultAsOf: string;
  /** When set, POST includes week_start_date to link this snapshot to the weekly governance pack. */
  governanceWeekStart: string | null;
  initialRow: RevenueVisibilitySnapshotRow | null;
  onSaved: () => void;
}) {
  const [projectId, setProjectId] = useState<number>(defaultProjectId ?? projects[0]?.id ?? 0);
  const [asOf, setAsOf] = useState(todayYmd());
  const [practiceHead, setPracticeHead] = useState("");
  const [mmfInr, setMmfInr] = useState("0");
  const [openReq, setOpenReq] = useState("0");
  const [openingFee, setOpeningFee] = useState("0");
  const [joiners, setJoiners] = useState("0");
  const [joiningFee, setJoiningFee] = useState("0");
  const [ytj, setYtj] = useState("0");
  const [ytjFee, setYtjFee] = useState("0");
  const [convPct, setConvPct] = useState("");
  const [realPct, setRealPct] = useState("");
  const [gapMmf, setGapMmf] = useState("0");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (defaultProjectId) setProjectId(defaultProjectId);
  }, [defaultProjectId]);

  useEffect(() => {
    if (!projectId && projects.length) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const fillFromRow = useCallback((r: RevenueVisibilitySnapshotRow) => {
    setProjectId(r.project_id);
    setAsOf(r.as_of_date ?? todayYmd());
    setPracticeHead(r.practice_head ?? "");
    setMmfInr(String(r.mmf_inr ?? 0));
    setOpenReq(String(r.open_req ?? 0));
    setOpeningFee(String(r.opening_fee_inr ?? 0));
    setJoiners(String(r.joiners_as_on_date ?? 0));
    setJoiningFee(String(r.joining_fee_inr ?? 0));
    setYtj(String(r.yet_to_join ?? 0));
    setYtjFee(String(r.ytj_fee_inr ?? 0));
    setConvPct(r.conversion_rate_pct != null ? String(r.conversion_rate_pct) : "");
    setRealPct(r.revenue_realised_pct != null ? String(r.revenue_realised_pct) : "");
    setGapMmf(String(r.gap_to_mmf_inr ?? 0));
    setStatus(r.status ?? "");
  }, []);

  const resetEmptyVis = useCallback(() => {
    setAsOf(defaultAsOf || todayYmd());
    setPracticeHead("");
    setMmfInr("0");
    setOpenReq("0");
    setOpeningFee("0");
    setJoiners("0");
    setJoiningFee("0");
    setYtj("0");
    setYtjFee("0");
    setConvPct("");
    setRealPct("");
    setGapMmf("0");
    setStatus("");
  }, [defaultAsOf]);

  useEffect(() => {
    if (!open) return;
    if (initialRow) fillFromRow(initialRow);
    else {
      resetEmptyVis();
      if (defaultProjectId) setProjectId(defaultProjectId);
    }
  }, [open, initialRow, fillFromRow, resetEmptyVis, defaultProjectId]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-raised)",
    border: "1px solid color-mix(in srgb, var(--accent) 18%, transparent)",
    color: "var(--text)",
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 11,
    fontFamily: "'DM Mono',monospace",
  };

  const gridForm: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 12,
    marginTop: 8,
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    setSaving(true);
    try {
      await queries.upsertRevenueVisibility({
        project_id: projectId,
        as_of_date: asOf,
        week_start_date: governanceWeekStart?.trim() || undefined,
        practice_head: practiceHead || null,
        mmf_inr: parseFloat(mmfInr) || 0,
        open_req: parseInt(openReq, 10) || 0,
        opening_fee_inr: parseFloat(openingFee) || 0,
        joiners_as_on_date: parseInt(joiners, 10) || 0,
        joining_fee_inr: parseFloat(joiningFee) || 0,
        yet_to_join: parseInt(ytj, 10) || 0,
        ytj_fee_inr: parseFloat(ytjFee) || 0,
        conversion_rate_pct: convPct.trim() === "" ? null : parseFloat(convPct),
        revenue_realised_pct: realPct.trim() === "" ? null : parseFloat(realPct),
        gap_to_mmf_inr: parseFloat(gapMmf) || 0,
        status: status || null,
      });
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "max-h-[min(90vh,800px)] overflow-y-auto border border-[color-mix(in_srgb,var(--accent)_15%,transparent)] bg-[var(--surface-raised)] p-6 sm:max-w-2xl"
        )}
      >
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-syne)] text-lg">Revenue visibility snapshot</DialogTitle>
          <DialogDescription className="text-xs font-mono text-[var(--text-muted)]">
            Amounts in INR · same project + as-of date replaces an existing row
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          {governanceWeekStart ? (
            <p className="text-[10px] font-mono text-primary mb-2">
              Link to governance week: <strong>{governanceWeekStart}</strong> (included on save)
            </p>
          ) : null}
          <div style={gridForm}>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Project
              <select value={projectId || ""} onChange={(e) => setProjectId(Number(e.target.value))} required style={inputStyle}>
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.account_name || p.filename || p.id}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              As-of date
              <input style={inputStyle} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Practice head
              <input style={inputStyle} value={practiceHead} onChange={(e) => setPracticeHead(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              MMF (INR)
              <input style={inputStyle} value={mmfInr} onChange={(e) => setMmfInr(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Open req
              <input style={inputStyle} value={openReq} onChange={(e) => setOpenReq(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Opening fee (INR)
              <input style={inputStyle} value={openingFee} onChange={(e) => setOpeningFee(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Joiners
              <input style={inputStyle} value={joiners} onChange={(e) => setJoiners(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Joining fee (INR)
              <input style={inputStyle} value={joiningFee} onChange={(e) => setJoiningFee(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Yet to join
              <input style={inputStyle} value={ytj} onChange={(e) => setYtj(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              YTJ fee (INR)
              <input style={inputStyle} value={ytjFee} onChange={(e) => setYtjFee(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Conversion %
              <input style={inputStyle} value={convPct} onChange={(e) => setConvPct(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Revenue realised %
              <input style={inputStyle} value={realPct} onChange={(e) => setRealPct(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Gap to MMF (INR)
              <input style={inputStyle} value={gapMmf} onChange={(e) => setGapMmf(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Status
              <input style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)} placeholder="e.g. At Risk" />
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !projectId}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
