import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { financeLedgerApi, queries, type FinanceLedgerUpsertPayload, type Project } from "@/lib/api";
import type { FinanceRowVm } from "@/lib/view-models/finance";
import "@/styles/new-contract-panel.css";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledgerRows: FinanceRowVm[];
  onSaved: () => void;
};

const FINANCE_TABS = [
  { icon: "◇", label: "Scope" },
  { icon: "₹", label: "Revenue & margin" },
  { icon: "◎", label: "Headcount & KPIs" },
  { icon: "◈", label: "Cashflow" },
] as const;

function defaultMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function ymFromRow(r: FinanceRowVm): string {
  const ms = r.month_sort?.trim();
  if (ms && /^\d{4}-\d{2}/.test(ms)) return ms.slice(0, 7);
  const m = r.month?.trim();
  if (m && /^\d{4}-\d{2}/.test(m)) return m.slice(0, 7);
  return "";
}

function monthInputFromRow(r: FinanceRowVm): string {
  const y = ymFromRow(r);
  if (y) return y;
  return defaultMonth();
}

function parseNum(s: string): number {
  const t = s.trim().replace(/,/g, "");
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

const emptyAmounts = {
  revBudget: "",
  revForecast: "",
  revActual: "",
  cmActual: "",
  actualHeadcountWl1: "",
  overallHc: "",
  taggdJoiners: "",
  targetRevPerRecruiter: "",
  targetPpcInr: "",
  unbilled: "",
  collectionTarget: "",
  collected: "",
  badDebt: "",
  adjustments: "",
};

function finSection(icon: string, colorCls: string, title: string, desc: string, body: React.ReactNode) {
  return (
    <div className="ncp-section" style={{ marginBottom: 12 }}>
      <div className="ncp-section-header" style={{ cursor: "default" }}>
        <div className={cn("ncp-section-icon", colorCls)}>{icon}</div>
        <div style={{ minWidth: 0 }}>
          <div className="ncp-section-label">{title}</div>
          <div className="ncp-section-desc">{desc}</div>
        </div>
      </div>
      <div className="ncp-section-body" style={{ maxHeight: "none" }}>
        {body}
      </div>
    </div>
  );
}

export function FinanceLedgerFormDialog({ open, onOpenChange, ledgerRows, onSaved }: Props) {
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  const [projectId, setProjectId] = useState<number | "">("");
  const [reportingMonth, setReportingMonth] = useState(defaultMonth());
  const [form, setForm] = useState(emptyAmounts);

  const [projDdOpen, setProjDdOpen] = useState(false);
  const [projSearch, setProjSearch] = useState("");
  const [projDdRect, setProjDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const projWrapRef = useRef<HTMLDivElement>(null);
  const projBtnRef = useRef<HTMLButtonElement>(null);
  const projPortalRef = useRef<HTMLDivElement>(null);

  const projectIdsWithLedger = useMemo(() => {
    const s = new Set<number>();
    for (const r of ledgerRows) {
      if (r.project_id != null && r.project_id > 0) s.add(r.project_id);
    }
    return s;
  }, [ledgerRows]);

  const ledgerAccounts = useMemo(() => {
    const s = new Set<string>();
    for (const r of ledgerRows) {
      if (r.account_name) s.add(r.account_name);
    }
    return s;
  }, [ledgerRows]);

  const projectsForEdit = useMemo(() => {
    const byId = projects.filter((p) => projectIdsWithLedger.has(p.id));
    if (byId.length > 0) return byId;
    return projects.filter((p) => ledgerAccounts.has(p.account_name || ""));
  }, [projects, projectIdsWithLedger, ledgerAccounts]);

  const projectsForPicker = mode === "edit" ? projectsForEdit : projects;

  const selectedProject = useMemo(() => {
    const pid = Number(projectId);
    return Number.isFinite(pid) && pid > 0 ? projectsForPicker.find((p) => p.id === pid) ?? null : null;
  }, [projectId, projectsForPicker]);

  const filteredProjects = useMemo(() => {
    const q = projSearch.trim().toLowerCase();
    if (!q) return projectsForPicker;
    return projectsForPicker.filter((p) => {
      const lab = `prj-${p.id} ${p.account_name || p.filename || ""}`.toLowerCase();
      return lab.includes(q);
    });
  }, [projectsForPicker, projSearch]);

  const monthOptionsForProject = useMemo(() => {
    if (mode !== "edit" || !projectId) return [] as { value: string; label: string }[];
    const pid = Number(projectId);
    const p = projects.find((x) => x.id === pid);
    const acc = p?.account_name || "";
    const map = new Map<string, string>();
    for (const r of ledgerRows) {
      const ym = ymFromRow(r);
      if (!ym) continue;
      const match = r.project_id === pid || (acc && r.account_name === acc);
      if (match) {
        const label = (r.month?.trim() && r.month) || ym;
        if (!map.has(ym)) map.set(ym, label);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([value, label]) => ({ value, label }));
  }, [mode, projectId, ledgerRows, projects]);

  const applyRow = useCallback((r: FinanceRowVm) => {
    setProjectId(r.project_id ?? "");
    setReportingMonth(monthInputFromRow(r));
    setForm({
      revBudget: String(r.rev_budget_inr ?? 0),
      revForecast: String(r.rev_forecast_inr ?? 0),
      revActual: String(r.rev_actual_inr ?? 0),
      cmActual: String(r.cm_actual_inr ?? 0),
      actualHeadcountWl1: String(r.actual_headcount_wl1 ?? 0),
      overallHc: r.actual_headcount_overall != null ? String(r.actual_headcount_overall) : "",
      taggdJoiners: r.taggd_joiners != null ? String(r.taggd_joiners) : "",
      targetRevPerRecruiter: r.target_revenue_per_recruiter != null ? String(r.target_revenue_per_recruiter) : "",
      targetPpcInr: r.target_ppc_inr != null ? String(r.target_ppc_inr) : "",
      unbilled: String(r.unbilled_inr ?? 0),
      collectionTarget: String(r.collection_target_inr ?? 0),
      collected: String(r.collected_inr ?? 0),
      badDebt: String(r.bad_debt_inr ?? 0),
      adjustments: "0",
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMode("create");
    setTab(0);
    setProjectId("");
    setReportingMonth(defaultMonth());
    setForm(emptyAmounts);
    setProjDdOpen(false);
    setProjSearch("");
    setLoadingProjects(true);
    queries
      .projects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [open]);

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
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (projWrapRef.current?.contains(t) || projPortalRef.current?.contains(t)) return;
      setProjDdOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open || mode !== "edit" || !projectId || reportingMonth.length < 7) return;
    const pid = Number(projectId);
    const p = projects.find((x) => x.id === pid);
    const acc = p?.account_name || "";
    const ym = reportingMonth.slice(0, 7);
    const row = ledgerRows.find((r) => {
      const ry = ymFromRow(r);
      if (ry !== ym) return false;
      if (r.project_id === pid) return true;
      return Boolean(acc && r.account_name === acc);
    });
    if (row) applyRow(row);
  }, [open, mode, projectId, reportingMonth, ledgerRows, projects, applyRow]);

  useEffect(() => {
    if (mode !== "edit" || !projectId) return;
    if (monthOptionsForProject.length === 0) return;
    const ym = reportingMonth.slice(0, 7);
    if (!monthOptionsForProject.some((o) => o.value === ym)) {
      setReportingMonth(monthOptionsForProject[0].value);
    }
  }, [mode, projectId, monthOptionsForProject, reportingMonth]);

  const setField = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const scopeComplete =
    mode === "create"
      ? Boolean(projectId && reportingMonth.length >= 7)
      : Boolean(
          projectId &&
            reportingMonth.length >= 7 &&
            (monthOptionsForProject.length === 0 || monthOptionsForProject.some((o) => o.value === reportingMonth.slice(0, 7))),
        );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const pid = Number(projectId);
    if (!pid || Number.isNaN(pid)) {
      setError("Select a project.");
      setTab(0);
      return;
    }
    if (!projects.some((p) => p.id === pid)) {
      setError("Choose a valid project.");
      setTab(0);
      return;
    }
    if (!reportingMonth || reportingMonth.length < 7) {
      setError("Set reporting month.");
      setTab(0);
      return;
    }
    if (
      mode === "edit" &&
      monthOptionsForProject.length > 0 &&
      !monthOptionsForProject.some((o) => o.value === reportingMonth.slice(0, 7))
    ) {
      setError("Pick a reporting period that exists for this project.");
      setTab(0);
      return;
    }
    setSaving(true);
    try {
      const base = {
        project_id: pid,
        reporting_month: reportingMonth.slice(0, 7),
        rev_budget: parseNum(form.revBudget),
        rev_forecast: parseNum(form.revForecast),
        rev_actual: parseNum(form.revActual),
        cm_actual: parseNum(form.cmActual),
        unbilled: parseNum(form.unbilled),
        collection_target: parseNum(form.collectionTarget),
        collected: parseNum(form.collected),
        bad_debt: parseNum(form.badDebt),
        adjustments: parseNum(form.adjustments),
        actual_headcount_wl1: parseNum(form.actualHeadcountWl1),
      };
      const extra: Partial<FinanceLedgerUpsertPayload> = {};
      if (form.overallHc.trim() !== "") extra.actual_headcount_finance = Math.round(parseNum(form.overallHc));
      if (form.taggdJoiners.trim() !== "") extra.taggd_joiners = parseNum(form.taggdJoiners);
      if (form.targetRevPerRecruiter.trim() !== "") extra.target_revenue_per_recruiter = parseNum(form.targetRevPerRecruiter);
      if (form.targetPpcInr.trim() !== "") extra.target_ppc_inr = parseNum(form.targetPpcInr);
      await financeLedgerApi.upsert({ ...base, ...extra });
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const projectPicker = (
    <div ref={projWrapRef} className="ncp-project-wrap" style={{ borderTop: "none" }}>
      <button
        ref={projBtnRef}
        type="button"
        disabled={loadingProjects || (mode === "edit" && projectsForEdit.length === 0)}
        className={cn("ncp-project-btn", selectedProject && "ncp-selected")}
        onClick={(e) => {
          e.stopPropagation();
          if (!loadingProjects && !(mode === "edit" && projectsForEdit.length === 0)) {
            setProjDdOpen((o) => !o);
          }
        }}
      >
        {selectedProject ? (
          <>
            <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 11, color: "var(--ncp-accent)" }}>
              PRJ-{selectedProject.id}
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ncp-text-primary)" }}>
              {selectedProject.account_name || selectedProject.filename || "—"}
            </span>
          </>
        ) : (
          <>
            <span>＋</span>
            <span>
              {loadingProjects
                ? "Loading projects…"
                : mode === "edit" && projectsForEdit.length === 0
                  ? "No projects with ledger rows yet"
                  : "Search or select a project (PRJ-···)"}
            </span>
          </>
        )}
        <span style={{ marginLeft: "auto", color: "var(--ncp-text-muted)" }}>▾</span>
      </button>
      {projDdOpen &&
        projDdRect &&
        createPortal(
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
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
              >
                {filteredProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={cn("ncp-project-opt", Number(projectId) === p.id && "ncp-selected")}
                    onClick={() => {
                      setProjectId(p.id);
                      setProjDdOpen(false);
                      setProjSearch("");
                      if (mode === "edit") {
                        setForm(emptyAmounts);
                      }
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--ncp-mono)",
                        fontSize: 11,
                        color: "var(--ncp-accent)",
                        minWidth: 52,
                      }}
                    >
                      PRJ-{p.id}
                    </span>
                    <span>{p.account_name || p.filename || `Project ${p.id}`}</span>
                  </button>
                ))}
                {filteredProjects.length === 0 && (
                  <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ncp-text-muted)" }}>
                    {projectsForPicker.length === 0
                      ? "No projects in scope."
                      : `No projects match “${projSearch.trim()}”.`}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );

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
        <form className="new-contract-sheet flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="ncp-scroll min-h-0 flex-1">
            <div className="ncp-page">
              <div className="ncp-header">
                <div style={{ minWidth: 0 }}>
                  <div className="ncp-breadcrumb">
                    <span>Finance</span>
                    <span className="ncp-breadcrumb-sep">›</span>
                    <span>Ledger</span>
                  </div>
                  <h1 className="ncp-h1">Add or update finance data</h1>
                  <p className="ncp-subtitle" style={{ marginTop: 4 }}>
                    One client-month row: revenue (ledger), contribution margin (ledger), cashflow (unbilled,
                    collections, bad debt), headcount and KPI targets (WL1, overall HC, Tag joiners, target rev
                    productivity, target PPC). Actual PPC is computed from ledger cost ÷ overall HC when both exist.
                  </p>
                </div>
                <button type="button" className="ncp-close-btn" aria-label="Close" onClick={() => onOpenChange(false)}>
                  ✕
                </button>
              </div>

              {!scopeComplete && tab > 0 ? (
                <p className="ncp-hint" style={{ marginBottom: 12 }}>
                  <span aria-hidden>●</span> Complete <strong>Scope</strong> (project + reporting month) before editing
                  amounts.
                </p>
              ) : null}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                <button
                  type="button"
                  className={cn("ncp-flow-pill", mode === "create" && "ncp-flow-pill--active")}
                  onClick={() => {
                    setMode("create");
                    setProjectId("");
                    setReportingMonth(defaultMonth());
                    setForm(emptyAmounts);
                    setTab(0);
                  }}
                >
                  New client-month
                </button>
                <button
                  type="button"
                  className={cn("ncp-flow-pill", mode === "edit" && "ncp-flow-pill--active")}
                  onClick={() => {
                    setMode("edit");
                    setProjectId("");
                    setReportingMonth("");
                    setForm(emptyAmounts);
                    setTab(0);
                  }}
                  disabled={ledgerRows.length === 0}
                >
                  Update existing row
                  {ledgerRows.length === 0 ? " (no data)" : ""}
                </button>
              </div>

              <div className="ncp-steps" role="tablist" style={{ marginBottom: 18 }}>
                {FINANCE_TABS.map(({ icon, label }, i) => (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    aria-selected={tab === i}
                    className={cn("ncp-step", tab === i && "ncp-active")}
                    onClick={() => setTab(i)}
                  >
                    <span className="ncp-step-num">{i + 1}</span>
                    {label}
                  </button>
                ))}
              </div>

              {/* Tab 0 — Scope */}
              <div className={cn("ncp-panel", tab === 0 && "ncp-panel-active")}>
                {finSection(
                  "◇",
                  "ncp-orange",
                  "Project & period",
                  mode === "edit"
                    ? "Only projects that already have a finance ledger row. Then pick the snapshot month."
                    : "Link this row to a project and reporting month.",
                  <>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Project *</div>
                      <div style={{ flex: 1, minWidth: 0 }}>{projectPicker}</div>
                    </div>
                    {mode === "edit" && projectId && monthOptionsForProject.length > 0 ? (
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Reporting month *</div>
                        <select
                          className="ncp-prop-input"
                          value={reportingMonth.slice(0, 7)}
                          onChange={(e) => setReportingMonth(e.target.value)}
                        >
                          {monthOptionsForProject.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label} ({o.value})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Reporting month *</div>
                        <input
                          type="month"
                          className="ncp-prop-input"
                          value={reportingMonth.length >= 7 ? reportingMonth.slice(0, 7) : ""}
                          onChange={(e) => setReportingMonth(e.target.value)}
                          disabled={mode === "edit" && Boolean(projectId) && monthOptionsForProject.length > 0}
                        />
                      </div>
                    )}
                    <p className="ncp-hint" style={{ marginTop: 8, marginBottom: 0 }}>
                      Stored as the first day of the month. Update mode locks the month to existing ledger months for the
                      project.
                    </p>
                  </>,
                )}
              </div>

              {/* Tab 1 — Revenue & margin */}
              <div className={cn("ncp-panel", tab === 1 && "ncp-panel-active")}>
                {finSection(
                  "₹",
                  "ncp-orange",
                  "Revenue (ledger)",
                  "Budget, forecast, and actual revenue for this client-month.",
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {(
                      [
                        ["revBudget", "Budget (INR)"] as const,
                        ["revForecast", "Forecast (INR)"] as const,
                        ["revActual", "Actual (INR)"] as const,
                      ] as const
                    ).map(([key, lab]) => (
                      <div key={key} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: "var(--ncp-text-muted)",
                          }}
                        >
                          {lab}
                        </span>
                        <input
                          className="ncp-prop-input font-mono"
                          inputMode="decimal"
                          value={form[key]}
                          onChange={(e) => setField(key, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>,
                )}
                {finSection(
                  "◆",
                  "ncp-teal",
                  "Contribution margin (ledger)",
                  "CM actual in INR for the month.",
                  <div className="ncp-prop-row">
                    <div className="ncp-prop-label">CM actual (INR)</div>
                    <input
                      className="ncp-prop-input font-mono"
                      inputMode="decimal"
                      value={form.cmActual}
                      onChange={(e) => setField("cmActual", e.target.value)}
                    />
                  </div>,
                )}
              </div>

              {/* Tab 2 — Headcount & KPIs */}
              <div className={cn("ncp-panel", tab === 2 && "ncp-panel-active")}>
                {finSection(
                  "◎",
                  "ncp-blue",
                  "Headcount & KPI targets",
                  "WL1 drives revenue productivity; overall HC drives PPC when cost exists.",
                  <>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Actual WL1 HC</div>
                      <input
                        className="ncp-prop-input font-mono"
                        inputMode="decimal"
                        value={form.actualHeadcountWl1}
                        onChange={(e) => setField("actualHeadcountWl1", e.target.value)}
                      />
                    </div>
                    <p className="ncp-hint" style={{ marginTop: -4, marginBottom: 8 }}>
                      Rev productivity = revenue actual ÷ WL1 HC. Tag productivity = Tag joiners ÷ WL1 HC.
                    </p>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Overall HC (optional)</div>
                      <input
                        className="ncp-prop-input font-mono"
                        inputMode="numeric"
                        placeholder="For PPC = cost ÷ overall HC"
                        value={form.overallHc}
                        onChange={(e) => setField("overallHc", e.target.value)}
                      />
                    </div>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Taggd joiners (optional)</div>
                      <input
                        className="ncp-prop-input font-mono"
                        inputMode="decimal"
                        value={form.taggdJoiners}
                        onChange={(e) => setField("taggdJoiners", e.target.value)}
                      />
                    </div>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Target rev productivity (INR)</div>
                      <input
                        className="ncp-prop-input font-mono"
                        inputMode="decimal"
                        value={form.targetRevPerRecruiter}
                        onChange={(e) => setField("targetRevPerRecruiter", e.target.value)}
                      />
                    </div>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Target PPC (INR / HC)</div>
                      <input
                        className="ncp-prop-input font-mono"
                        inputMode="decimal"
                        value={form.targetPpcInr}
                        onChange={(e) => setField("targetPpcInr", e.target.value)}
                      />
                    </div>
                    <p className="ncp-hint" style={{ marginTop: 8, marginBottom: 0 }}>
                      Actual PPC is always from ledger cost ÷ overall HC — not from Excel Actual_PPC.
                    </p>
                  </>,
                )}
              </div>

              {/* Tab 3 — Cashflow */}
              <div className={cn("ncp-panel", tab === 3 && "ncp-panel-active")}>
                {finSection(
                  "◈",
                  "ncp-teal",
                  "Cashflow",
                  "Unbilled, collection target, collected, bad debt, and adjustments.",
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {(
                      [
                        ["unbilled", "Unbilled (INR)"] as const,
                        ["collectionTarget", "Collection target (INR)"] as const,
                        ["collected", "Collected (INR)"] as const,
                        ["badDebt", "Bad debt (INR)"] as const,
                        ["adjustments", "Adjustments (INR)"] as const,
                      ] as const
                    ).map(([key, lab]) => (
                      <div key={key} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: "var(--ncp-text-muted)",
                          }}
                        >
                          {lab}
                        </span>
                        <input
                          className="ncp-prop-input font-mono"
                          inputMode="decimal"
                          value={form[key]}
                          onChange={(e) => setField(key, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>,
                )}
              </div>

              {error ? (
                <div
                  style={{
                    margin: "12px 0 0",
                    padding: "10px 14px",
                    background: "rgba(239,68,68,0.07)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    borderRadius: "var(--ncp-radius)",
                    fontSize: 12,
                    color: "#b91c1c",
                  }}
                  role="alert"
                >
                  {error}
                </div>
              ) : null}
            </div>
          </div>

          <div className="ncp-footer">
            <span style={{ fontSize: 12, color: "var(--ncp-text-muted)" }}>Esc to cancel</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </button>
              {tab > 0 ? (
                <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => setTab((t) => t - 1)} disabled={saving}>
                  ← Back
                </button>
              ) : null}
              {tab < FINANCE_TABS.length - 1 ? (
                <button
                  type="button"
                  className="ncp-btn ncp-btn-secondary"
                  onClick={() => setTab((t) => t + 1)}
                  disabled={saving || !scopeComplete}
                >
                  Next →
                </button>
              ) : null}
              <button type="submit" className="ncp-btn ncp-btn-primary" disabled={saving || !scopeComplete}>
                {saving ? "Saving…" : "Save to ledger ✓"}
              </button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
