import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { adminApi, queries, wfmBenchmarkApi, type Project } from "@/lib/api";
import type { WfmBenchmarkRowVm } from "@/lib/view-models/wfm";
import {
  emptyWfmOrgMetadataDraft,
  wfmOrgDraftFromSources,
  wfmOrgMetadataPatchBody,
  type RegionalHeadCandidate,
  type WfmOrgMetadataDraft,
} from "@/lib/wfm-org-metadata";
import { WfmProjectOrgFields } from "@/components/platform/WfmProjectOrgFields";
import "@/styles/new-contract-panel.css";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wfmRows: WfmBenchmarkRowVm[];
  onSaved: () => void;
};

const WFM_TABS = [
  { icon: "◇", label: "Scope" },
  { icon: "🎯", label: "Targets & HC" },
  { icon: "📊", label: "WL hire mix" },
] as const;

function defaultMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthFromReportingDate(iso: string | null | undefined): string {
  const s = String(iso ?? "").trim();
  if (s.length >= 7 && /^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  return defaultMonth();
}

function parseNum(s: string): number {
  const t = s.trim().replace(/,/g, "");
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function parseIntSafe(s: string): number {
  const n = Math.round(parseNum(s));
  return Number.isFinite(n) ? n : 0;
}

const emptyForm = {
  lateralRevenue: "",
  lateralHcTarget: "",
  lateralProductivity: "",
  idealHc: "",
  actualHcTotal: "",
  wl1: "",
  wl2: "",
  wl3: "",
  wl4: "",
};

function wfmSection(icon: string, colorCls: string, title: string, desc: string, body: React.ReactNode) {
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

export function WfmBenchmarkFormDialog({ open, onOpenChange, wfmRows, onSaved }: Props) {
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  const [projectId, setProjectId] = useState<number | "">("");
  const [reportingMonth, setReportingMonth] = useState(defaultMonth());
  const [form, setForm] = useState(emptyForm);
  const [org, setOrg] = useState<WfmOrgMetadataDraft>(emptyWfmOrgMetadataDraft);
  const [orgUsers, setOrgUsers] = useState<RegionalHeadCandidate[]>([]);
  const [loadingOrgUsers, setLoadingOrgUsers] = useState(false);

  const [projDdOpen, setProjDdOpen] = useState(false);
  const [projSearch, setProjSearch] = useState("");
  const [projDdRect, setProjDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const projWrapRef = useRef<HTMLDivElement>(null);
  const projBtnRef = useRef<HTMLButtonElement>(null);
  const projPortalRef = useRef<HTMLDivElement>(null);

  const projectIdsWithWfm = useMemo(() => {
    const s = new Set<number>();
    for (const r of wfmRows) {
      if (r.project_id != null && r.project_id > 0) s.add(r.project_id);
    }
    return s;
  }, [wfmRows]);

  const wfmAccounts = useMemo(() => {
    const s = new Set<string>();
    for (const r of wfmRows) {
      if (r.account_name) s.add(r.account_name);
    }
    return s;
  }, [wfmRows]);

  /** Projects that already have at least one WFM snapshot (for edit mode). */
  const projectsForEdit = useMemo(() => {
    const byId = projects.filter((p) => projectIdsWithWfm.has(p.id));
    if (byId.length > 0) return byId;
    return projects.filter((p) => wfmAccounts.has(p.account_name || ""));
  }, [projects, projectIdsWithWfm, wfmAccounts]);

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
    if (mode !== "edit" || !projectId) return [];
    const pid = Number(projectId);
    const p = projects.find((x) => x.id === pid);
    const acc = p?.account_name || "";
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of wfmRows) {
      const ym = r.reporting_date ? String(r.reporting_date).slice(0, 7) : "";
      if (!ym || seen.has(ym)) continue;
      const match = r.project_id === pid || (acc && r.account_name === acc);
      if (match) {
        seen.add(ym);
        out.push(ym);
      }
    }
    return out.sort((a, b) => b.localeCompare(a));
  }, [mode, projectId, wfmRows, projects]);

  const applyRow = useCallback(
    (r: WfmBenchmarkRowVm) => {
      setProjectId(r.project_id ?? "");
      setReportingMonth(monthFromReportingDate(r.reporting_date));
      setForm({
        lateralRevenue: String(r.lateral_revenue_target ?? 0),
        lateralHcTarget: String(r.lateral_hc_target ?? 0),
        lateralProductivity: String(r.lateral_productivity_target ?? 0),
        idealHc: String(r.ideal_hc ?? 0),
        actualHcTotal: String(r.actual_hc_total ?? 0),
        wl1: String(r.wl1_hires ?? 0),
        wl2: String(r.wl2_hires ?? 0),
        wl3: String(r.wl3_hires ?? 0),
        wl4: String(r.wl4_hires ?? 0),
      });
      const p = r.project_id != null ? projects.find((x) => x.id === r.project_id) : undefined;
      setOrg(
        wfmOrgDraftFromSources(
          {
            region: r.region ?? p?.region,
            practice_head: r.practice_head ?? p?.practice_head,
            function_head: p?.function_head,
            regional_head: r.regional_head ?? p?.regional_head,
          },
          orgUsers,
        ),
      );
    },
    [projects, orgUsers],
  );

  const hydrateOrgFromProject = useCallback(
    (p: Project) => {
      setOrg(wfmOrgDraftFromSources(p, orgUsers));
    },
    [orgUsers],
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMode("create");
    setTab(0);
    setProjectId("");
    setReportingMonth(defaultMonth());
    setForm(emptyForm);
    setOrg(emptyWfmOrgMetadataDraft());
    setProjDdOpen(false);
    setProjSearch("");
    setLoadingProjects(true);
    setLoadingOrgUsers(true);
    Promise.all([
      queries.projects(),
      queries.taskAssignableUsers().catch(() => []),
      adminApi.listUsers().catch(() => []),
    ])
      .then(([projList, scopedUsers, adminUsers]) => {
        setProjects(projList);
        const map = new Map<number, RegionalHeadCandidate>();
        const add = (u: RegionalHeadCandidate) => map.set(u.id, u);
        scopedUsers.forEach((u) => add(u as RegionalHeadCandidate));
        adminUsers.forEach((u) => add({ id: u.id, email: u.email, role: u.role }));
        setOrgUsers([...map.values()]);
      })
      .catch(() => {
        setProjects([]);
        setOrgUsers([]);
      })
      .finally(() => {
        setLoadingProjects(false);
        setLoadingOrgUsers(false);
      });
  }, [open]);

  useEffect(() => {
    if (!open || loadingOrgUsers || !selectedProject) return;
    hydrateOrgFromProject(selectedProject);
  }, [open, loadingOrgUsers, selectedProject?.id, hydrateOrgFromProject]);

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
    if (!open || mode !== "edit" || !projectId || !reportingMonth || reportingMonth.length < 7) return;
    const pid = Number(projectId);
    const p = projects.find((x) => x.id === pid);
    const acc = p?.account_name || "";
    const ym = reportingMonth.slice(0, 7);
    const row = wfmRows.find((r) => {
      const ry = r.reporting_date ? String(r.reporting_date).slice(0, 7) : "";
      if (ry !== ym) return false;
      if (r.project_id === pid) return true;
      return Boolean(acc && r.account_name === acc);
    });
    if (row) applyRow(row);
  }, [open, mode, projectId, reportingMonth, wfmRows, projects, applyRow]);

  useEffect(() => {
    if (mode !== "edit" || !projectId) return;
    if (monthOptionsForProject.length === 0) return;
    if (!monthOptionsForProject.includes(reportingMonth.slice(0, 7))) {
      setReportingMonth(monthOptionsForProject[0]);
    }
  }, [mode, projectId, monthOptionsForProject, reportingMonth]);

  const setField = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const scopeComplete =
    mode === "create"
      ? Boolean(projectId && reportingMonth.length >= 7)
      : Boolean(projectId && reportingMonth.length >= 7 && monthOptionsForProject.includes(reportingMonth.slice(0, 7)));

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
    if (mode === "edit" && monthOptionsForProject.length > 0 && !monthOptionsForProject.includes(reportingMonth.slice(0, 7))) {
      setError("Pick a reporting period that exists for this project.");
      setTab(0);
      return;
    }
    setSaving(true);
    try {
      await queries.patchProjectMetadata(pid, wfmOrgMetadataPatchBody(org, orgUsers));
      await wfmBenchmarkApi.upsert({
        project_id: pid,
        reporting_month: reportingMonth.slice(0, 7),
        lateral_revenue_target: parseNum(form.lateralRevenue),
        lateral_hc_target: parseNum(form.lateralHcTarget),
        lateral_productivity_target: parseNum(form.lateralProductivity),
        ideal_hc: parseNum(form.idealHc),
        actual_hc_total: parseIntSafe(form.actualHcTotal),
        wl1_hires: parseIntSafe(form.wl1),
        wl2_hires: parseIntSafe(form.wl2),
        wl3_hires: parseIntSafe(form.wl3),
        wl4_hires: parseIntSafe(form.wl4),
      });
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const monthLocked = mode === "edit" && Boolean(projectId) && monthOptionsForProject.length > 0;

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
                  ? "No projects with WFM snapshots yet"
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
                  onKeyDown={(e) => e.stopPropagation()}
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
                      hydrateOrgFromProject(p);
                      if (mode === "edit") {
                        setForm(emptyForm);
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
    <Sheet modal={false} open={open} onOpenChange={onOpenChange}>
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
                    <span>Workforce</span>
                    <span className="ncp-breadcrumb-sep">›</span>
                    <span>Benchmark</span>
                  </div>
                  <h1 className="ncp-h1">Add or update WFM data</h1>
                  <p className="ncp-subtitle" style={{ marginTop: 4 }}>
                    One snapshot per project and reporting month: ideal vs actual HC, lateral targets, productivity, and WL
                    hire counts. Matches the WFM upload pipeline (wfm_hr_benchmarks).
                  </p>
                </div>
                <button type="button" className="ncp-close-btn" aria-label="Close" onClick={() => onOpenChange(false)}>
                  ✕
                </button>
              </div>

              {!scopeComplete && tab > 0 ? (
                <p className="ncp-hint" style={{ marginBottom: 12 }}>
                  <span aria-hidden>●</span> Complete <strong>Scope</strong> (project + month) before editing targets.
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
                    setForm(emptyForm);
                    setOrg(emptyWfmOrgMetadataDraft());
                    setTab(0);
                  }}
                >
                  New snapshot
                </button>
                <button
                  type="button"
                  className={cn("ncp-flow-pill", mode === "edit" && "ncp-flow-pill--active")}
                  onClick={() => {
                    setMode("edit");
                    setProjectId("");
                    setReportingMonth("");
                    setForm(emptyForm);
                    setOrg(emptyWfmOrgMetadataDraft());
                    setTab(0);
                  }}
                  disabled={wfmRows.length === 0}
                >
                  Update existing
                  {wfmRows.length === 0 ? " (no data)" : ""}
                </button>
              </div>

              <div className="ncp-steps" role="tablist" style={{ marginBottom: 18 }}>
                {WFM_TABS.map(({ icon, label }, i) => (
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

              <div className={cn("ncp-panel", tab === 0 && "ncp-panel-active")}>
                {wfmSection(
                  "◇",
                  "ncp-orange",
                  "Project & period",
                  mode === "edit"
                    ? "Only projects that already have a WFM benchmark row. Then pick the snapshot month."
                    : "Link this benchmark to a project and reporting month.",
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
                          {monthOptionsForProject.map((ym) => (
                            <option key={ym} value={ym}>
                              {ym}
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
                          disabled={monthLocked}
                        />
                      </div>
                    )}
                    <p className="ncp-hint" style={{ marginTop: 8, marginBottom: 0 }}>
                      Stored as the first day of the month. Update mode locks the month to existing snapshots for the project.
                    </p>
                  </>,
                )}
                {selectedProject ? (
                  wfmSection(
                    "👤",
                    "ncp-teal",
                    "Account leadership",
                    "Region and heads saved on the project record — used for regional / practice rollups on the WFM dashboard.",
                    <WfmProjectOrgFields
                      draft={org}
                      onChange={(patch) => setOrg((prev) => ({ ...prev, ...patch }))}
                      users={orgUsers}
                      loadingUsers={loadingOrgUsers}
                      disabled={saving}
                    />,
                  )
                ) : (
                  <p className="ncp-hint" style={{ marginTop: 4 }}>
                    Select a project to edit region, regional head, practice head, and function head.
                  </p>
                )}
              </div>

              <div className={cn("ncp-panel", tab === 1 && "ncp-panel-active")}>
                {wfmSection(
                  "🎯",
                  "ncp-teal",
                  "Targets & headcount",
                  "Lateral revenue / HC / productivity targets and ideal vs actual HC.",
                  <>
                    {(
                      [
                        ["lateralRevenue", "Lateral revenue target (INR)"] as const,
                        ["lateralHcTarget", "Lateral HC target"] as const,
                        ["lateralProductivity", "Lateral productivity target (lacs)"] as const,
                        ["idealHc", "Ideal HC"] as const,
                        ["actualHcTotal", "Actual HC (total)"] as const,
                      ] as const
                    ).map(([key, lab]) => (
                      <div key={key} className="ncp-prop-row">
                        <div className="ncp-prop-label">{lab}</div>
                        <input
                          className="ncp-prop-input font-mono"
                          inputMode="decimal"
                          value={form[key]}
                          onChange={(e) => setField(key, e.target.value)}
                        />
                      </div>
                    ))}
                  </>,
                )}
              </div>

              <div className={cn("ncp-panel", tab === 2 && "ncp-panel-active")}>
                {wfmSection(
                  "📊",
                  "ncp-blue",
                  "WL hire mix (counts)",
                  "Whole-line hire counts by band (WL1–WL4).",
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                      gap: 12,
                    }}
                  >
                    {(["wl1", "wl2", "wl3", "wl4"] as const).map((key, i) => {
                      const id = `wfm-wl-${key}`;
                      return (
                        <div key={key} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                          <label
                            htmlFor={id}
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              color: "var(--ncp-text-muted)",
                            }}
                          >
                            WL{i + 1}
                          </label>
                          <input
                            id={id}
                            className="ncp-wl-count-field"
                            inputMode="numeric"
                            autoComplete="off"
                            value={form[key]}
                            onChange={(e) => setField(key, e.target.value)}
                          />
                        </div>
                      );
                    })}
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
              {tab < WFM_TABS.length - 1 ? (
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
                {saving ? "Saving…" : "Save benchmark ✓"}
              </button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
