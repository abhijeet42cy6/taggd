import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  queries,
  type Project,
  type RevenueForecastWeeklyRow,
  type RevenueVisibilitySnapshotRow,
  type RevenueWeeklyPackResponse,
} from "@/lib/api";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AuthUser } from "@/lib/auth";
import { UserPickerDropdown, type PlatformUserLite } from "@/components/platform/NewContractOrgFlow";
import "@/styles/new-contract-panel.css";

const LAKHS = 100_000;

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

/** Normalize any date to the Monday of that week (YYYY-MM-DD). */
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

function shiftWeekMonday(mondayYmd: string, deltaWeeks: number): string {
  return mondayOfYmd(addDaysYmd(mondayYmd, deltaWeeks * 7));
}

function formatWeekRangeLabel(mondayYmd: string): string {
  const start = parseYmd(mondayYmd);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${start.toLocaleDateString("en-IN", opt)} – ${end.toLocaleDateString("en-IN", opt)}`;
}

const VISIBILITY_STATUS_OPTIONS = [
  { value: "On track", label: "On track" },
  { value: "At risk", label: "At risk" },
  { value: "Pipeline risk", label: "Pipeline risk" },
  { value: "Closed", label: "Closed" },
  { value: "Other", label: "Other" },
] as const;

function projectLabel(p: Project): string {
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

function defaultPracticeHeadFromUser(u: AuthUser | null | undefined): string {
  return u?.email?.trim() ?? "";
}

/** Month anchors YYYY-MM-01 for a window around today. */
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

function visibilityStatusPillClass(v: string): string {
  switch (v) {
    case "On track":
      return "ncp-st-active";
    case "At risk":
    case "Pipeline risk":
      return "ncp-st-pending";
    case "Closed":
      return "ncp-st-inactive";
    default:
      return "ncp-st-inactive";
  }
}

export type WeeklyPackNcpSheetProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projects: Project[];
  projectId: number;
  governanceWeek: string;
  onGovernanceWeekChange: (w: string) => void;
  onSaved: () => void;
  /** When user has a single project in scope */
  lockProject?: boolean;
  /** Used to default practice head and to seed the user picker. */
  currentUser?: AuthUser | null;
};

export function WeeklyPackNcpSheet({
  open,
  onOpenChange,
  projects,
  projectId: initialProjectId,
  governanceWeek,
  onGovernanceWeekChange,
  onSaved,
  lockProject = false,
  currentUser = null,
}: WeeklyPackNcpSheetProps) {
  const defaultPracticeHead = useMemo(() => defaultPracticeHeadFromUser(currentUser), [currentUser]);

  const [step, setStep] = useState(0);
  const [projDdOpen, setProjDdOpen] = useState(false);
  const [projSearch, setProjSearch] = useState("");
  const [projDdRect, setProjDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const projWrapRef = useRef<HTMLDivElement>(null);
  const projBtnRef = useRef<HTMLButtonElement>(null);
  const projPortalRef = useRef<HTMLDivElement>(null);
  const [forecastDatesCollapsed, setForecastDatesCollapsed] = useState(false);

  const [sheetWeek, setSheetWeek] = useState(() => mondayYmd());
  const [projectId, setProjectId] = useState(initialProjectId);
  const [packLoading, setPackLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [platformUsers, setPlatformUsers] = useState<PlatformUserLite[]>([]);

  // Forecast
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

  // Visibility
  const [asOf, setAsOf] = useState(todayYmd());
  const [practiceHead, setPracticeHead] = useState("");
  const [mmfInr, setMmfInr] = useState("0");
  const [visOpenReq, setVisOpenReq] = useState("0");
  const [openingFee, setOpeningFee] = useState("0");
  const [joiners, setJoiners] = useState("0");
  const [joiningFee, setJoiningFee] = useState("0");
  const [ytj, setYtj] = useState("0");
  const [ytjFee, setYtjFee] = useState("0");
  const [convPct, setConvPct] = useState("");
  const [realPct, setRealPct] = useState("");
  const [gapMmf, setGapMmf] = useState("0");
  const [status, setStatus] = useState("");

  const selectedProject = useMemo(() => projects.find((p) => p.id === projectId) ?? null, [projects, projectId]);

  const filteredProjects = useMemo(() => {
    const q = projSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const lab = projectLabel(p).toLowerCase();
      return lab.includes(q) || String(p.id).includes(q);
    });
  }, [projects, projSearch]);

  const practiceHeadUserId = useMemo(() => {
    const ph = practiceHead.trim();
    if (!ph) return "";
    const byEmail = platformUsers.find((u) => u.email.toLowerCase() === ph.toLowerCase());
    return byEmail ? String(byEmail.id) : "";
  }, [practiceHead, platformUsers]);

  const monthOptions = useMemo(() => monthAnchorOptions(), []);

  useEffect(() => {
    if (open) {
      setSheetWeek(mondayOfYmd(governanceWeek || mondayYmd()));
      setProjectId(initialProjectId);
      setStep(0);
    }
  }, [open, governanceWeek, initialProjectId]);

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

  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    void (async () => {
      const raw = await queries.taskAssignableUsers({ project_id: projectId }).catch(() => [] as PlatformUserLite[]);
      if (cancelled) return;
      const map = new Map<number, PlatformUserLite>();
      for (const u of raw) map.set(u.id, u);
      if (currentUser && !map.has(currentUser.id)) {
        map.set(currentUser.id, { id: currentUser.id, email: currentUser.email, role: currentUser.role });
      }
      setPlatformUsers(Array.from(map.values()));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId, currentUser]);

  useEffect(() => {
    if (initialProjectId && initialProjectId !== projectId && open) setProjectId(initialProjectId);
  }, [initialProjectId, open]);

  const applyForecast = useCallback((r: RevenueForecastWeeklyRow) => {
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

  const resetForecast = useCallback(() => {
    setMonthAnchor(sheetWeek.slice(0, 7) + "-01");
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
  }, [sheetWeek]);

  const applyVisibility = useCallback(
    (r: RevenueVisibilitySnapshotRow) => {
      setAsOf(r.as_of_date ?? todayYmd());
      const ph = r.practice_head?.trim();
      setPracticeHead(ph ? ph : defaultPracticeHead);
      setMmfInr(String(r.mmf_inr ?? 0));
      setVisOpenReq(String(r.open_req ?? 0));
      setOpeningFee(String(r.opening_fee_inr ?? 0));
      setJoiners(String(r.joiners_as_on_date ?? 0));
      setJoiningFee(String(r.joining_fee_inr ?? 0));
      setYtj(String(r.yet_to_join ?? 0));
      setYtjFee(String(r.ytj_fee_inr ?? 0));
      setConvPct(r.conversion_rate_pct != null ? String(r.conversion_rate_pct) : "");
      setRealPct(r.revenue_realised_pct != null ? String(r.revenue_realised_pct) : "");
      setGapMmf(String(r.gap_to_mmf_inr ?? 0));
      setStatus(r.status ?? "");
    },
    [defaultPracticeHead],
  );

  const resetVisibility = useCallback(() => {
    setAsOf(todayYmd());
    setPracticeHead(defaultPracticeHead);
    setMmfInr("0");
    setVisOpenReq("0");
    setOpeningFee("0");
    setJoiners("0");
    setJoiningFee("0");
    setYtj("0");
    setYtjFee("0");
    setConvPct("");
    setRealPct("");
    setGapMmf("0");
    setStatus("");
  }, [defaultPracticeHead]);

  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    setPackLoading(true);
    void queries
      .revenueWeeklyPack(projectId, sheetWeek)
      .then((p: RevenueWeeklyPackResponse) => {
        if (cancelled) return;
        if (p.forecast) applyForecast(p.forecast);
        else resetForecast();
        if (p.visibility) applyVisibility(p.visibility);
        else resetVisibility();
      })
      .catch(() => {
        if (!cancelled) {
          resetForecast();
          resetVisibility();
        }
      })
      .finally(() => {
        if (!cancelled) setPackLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, sheetWeek, applyForecast, applyVisibility, resetForecast, resetVisibility]);

  const bumpWeek = (delta: number) => {
    const w = shiftWeekMonday(sheetWeek, delta);
    setSheetWeek(w);
    onGovernanceWeekChange(w);
  };

  const onWeekInput = (v: string) => {
    const w = mondayOfYmd(v || sheetWeek);
    setSheetWeek(w);
    onGovernanceWeekChange(w);
  };

  const saveAll = async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      await queries.upsertRevenueForecastWeekly({
        project_id: projectId,
        week_start_date: sheetWeek,
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
      await queries.upsertRevenueVisibility({
        project_id: projectId,
        as_of_date: asOf,
        week_start_date: sheetWeek,
        practice_head: practiceHead || null,
        mmf_inr: parseFloat(mmfInr) || 0,
        open_req: parseInt(visOpenReq, 10) || 0,
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

  const section = (icon: string, colorCls: string, label: string, desc: string, body: React.ReactNode) => (
    <div className="ncp-section" style={{ marginBottom: 12 }}>
      <div className="ncp-section-header" style={{ cursor: "default" }}>
        <div className={cn("ncp-section-icon", colorCls)}>{icon}</div>
        <div>
          <div className="ncp-section-label">{label}</div>
          <div className="ncp-section-desc">{desc}</div>
        </div>
      </div>
      <div className="ncp-section-body" style={{ maxHeight: "none" }}>
        {body}
      </div>
    </div>
  );

  const stepLabels = ["Week & project", "Forecast", "Visibility"] as const;
  const goToStep = (i: number) => {
    if (i >= 1 && !projectId) return;
    setStep(i);
  };

  const weekEndYmd = addDaysYmd(sheetWeek, 6);

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
                    Enter weekly forecast (₹ Lakhs) and pipeline visibility (INR) for one governance week. Saving updates your
                    draft pack for finance.
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
                    disabled={i >= 1 && !projectId}
                  >
                    <span className="ncp-step-num">{step > i ? "✓" : i + 1}</span>
                    {label}
                  </button>
                ))}
              </div>

              {step === 0 && !projectId ? (
                <div className="ncp-req-note" style={{ marginBottom: 12 }}>
                  <span>●</span> Project selection is required to continue
                </div>
              ) : null}

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
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <div className="flex flex-col gap-1 min-w-[200px] flex-1">
                        <span className="text-[10px] uppercase text-muted-foreground font-mono">Week of (Mon)</span>
                        <input
                          type="date"
                          className="ncp-prop-input rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
                          value={sheetWeek}
                          onChange={(e) => onWeekInput(e.target.value)}
                        />
                        <span className="text-xs font-semibold text-foreground">{formatWeekRangeLabel(sheetWeek)}</span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={() => bumpWeek(1)}
                        aria-label="Next week"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="ncp-project-wrap mt-4" ref={projWrapRef} style={{ borderTop: "1px solid var(--ncp-border, #e8e6e1)", paddingTop: 12 }}>
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
                            <span className="ncp-project-icon">{projInitials(projectLabel(selectedProject))}</span>
                            <div className="ncp-project-meta">
                              <strong>{projectLabel(selectedProject)}</strong>
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
                                      <span className="ncp-proj-ico">{projInitials(projectLabel(p))}</span>
                                      <div>
                                        <div style={{ fontWeight: 500, color: "var(--ncp-text-primary)" }}>{projectLabel(p)}</div>
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

                    {packLoading ? (
                      <p className="text-xs font-mono text-muted-foreground mt-3">Loading saved rows for this week…</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className={cn("ncp-panel", step === 1 && "ncp-panel-active")}>
                {section(
                  "₹",
                  "ncp-orange",
                  "Weekly revenue forecast",
                  "Amounts in ₹ Lakhs. Updates the forecast half of your weekly pack.",
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
                            <select
                              className="ncp-prop-input"
                              value={monthAnchor}
                              onChange={(e) => setMonthAnchor(e.target.value)}
                            >
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
                            <input
                              type="date"
                              value={updateDate}
                              onChange={(e) => setUpdateDate(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="ncp-date-grid">
                          <div className="ncp-date-cell">
                            <label>Week start (Mon)</label>
                            <input type="date" readOnly value={sheetWeek} />
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
                  </div>,
                )}
              </div>

              <div className={cn("ncp-panel", step === 2 && "ncp-panel-active")}>
                <div className="ncp-section" style={{ marginBottom: 12 }}>
                  <div className="ncp-section-body" style={{ maxHeight: "none", paddingTop: 14 }}>
                    <div className="ncp-prop-row" style={{ borderTop: "none" }}>
                      <div className="ncp-prop-label">Practice head</div>
                      <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
                        <UserPickerDropdown
                          value={practiceHeadUserId}
                          onChange={(id) => {
                            const u = platformUsers.find((x) => String(x.id) === id);
                            setPracticeHead(u ? u.email : "");
                          }}
                          users={platformUsers}
                          placeholder="Search or select practice head…"
                        />
                      </div>
                    </div>
                    <p className="ncp-hint" style={{ marginTop: 4 }}>
                      Defaults to your account email. Change if another lead owns this week&apos;s visibility.
                    </p>
                  </div>
                </div>

                {section(
                  "◇",
                  "ncp-blue",
                  "Revenue visibility snapshot",
                  "Pipeline KPIs in INR. Linked to the same governance week on save.",
                  <div className="grid gap-0">
                    <p className="text-[11px] font-mono text-primary mb-2">
                      Link to governance week: <strong>{sheetWeek}</strong>
                    </p>
                    <div className="grid gap-0 sm:grid-cols-2">
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">As-of date</div>
                        <input className="ncp-prop-input" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-3 mt-2">
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">MMF (INR)</div>
                        <input className="ncp-prop-input" value={mmfInr} onChange={(e) => setMmfInr(e.target.value)} inputMode="decimal" />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Open req</div>
                        <input className="ncp-prop-input" value={visOpenReq} onChange={(e) => setVisOpenReq(e.target.value)} />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Opening fee (INR)</div>
                        <input className="ncp-prop-input" value={openingFee} onChange={(e) => setOpeningFee(e.target.value)} />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Joiners</div>
                        <input className="ncp-prop-input" value={joiners} onChange={(e) => setJoiners(e.target.value)} />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Joining fee (INR)</div>
                        <input className="ncp-prop-input" value={joiningFee} onChange={(e) => setJoiningFee(e.target.value)} />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Yet to join</div>
                        <input className="ncp-prop-input" value={ytj} onChange={(e) => setYtj(e.target.value)} />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">YTJ fee (INR)</div>
                        <input className="ncp-prop-input" value={ytjFee} onChange={(e) => setYtjFee(e.target.value)} />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Conversion %</div>
                        <input className="ncp-prop-input" value={convPct} onChange={(e) => setConvPct(e.target.value)} />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Revenue realised %</div>
                        <input className="ncp-prop-input" value={realPct} onChange={(e) => setRealPct(e.target.value)} />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Gap to MMF (INR)</div>
                        <input className="ncp-prop-input" value={gapMmf} onChange={(e) => setGapMmf(e.target.value)} />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Status</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "6px 0" }}>
                          <button
                            type="button"
                            className={cn("ncp-status-pill", status === "" && "ncp-st-inactive")}
                            onClick={() => setStatus("")}
                          >
                            Unset
                          </button>
                          {VISIBILITY_STATUS_OPTIONS.map((o) => (
                            <button
                              key={o.value}
                              type="button"
                              className={cn("ncp-status-pill", status === o.value && visibilityStatusPillClass(o.value))}
                              onClick={() => setStatus(o.value)}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>,
                )}
              </div>
            </div>
          </div>

          <div className="ncp-footer">
            <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="ncp-btn ncp-btn-primary"
              onClick={() => void saveAll()}
              disabled={saving || !projectId || packLoading}
            >
              {saving ? "Saving…" : "Save forecast & visibility"}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
