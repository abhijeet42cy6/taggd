import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { adminApi, queries, slaMetricsApi, type Project, type SlaMetricRecord } from "@/lib/api";
import {
  SearchableMetricOptionPicker,
  SearchableStringPicker,
  type MetricOption,
} from "@/components/platform/searchable-pickers";
import { UserPickerDropdown, type PlatformUserLite } from "@/components/platform/NewContractOrgFlow";
import "@/styles/new-contract-panel.css";

export type SlaMetricOption = MetricOption;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing metrics from the SLA table (for edit mode). */
  metricOptions: SlaMetricOption[];
  onSaved: () => void;
};

const SLA_TABS = [
  { label: "Scope", num: "1" },
  { label: "Definition", num: "2" },
  { label: "Period snapshot", num: "3" },
] as const;

/** Metric type / nature — fixed vocabulary for SLA catalogue rows. */
const SLA_METRIC_NATURE_OPTIONS = [
  "Contractual",
  "Non-Contratual",
  "Penalty",
  "Non-Penatly",
  "Internal",
] as const;

const emptyForm = {
  projectId: "" as string | number,
  metricLabel: "",
  metricGroup: "",
  metricNature: "",
  targetThreshold: "",
  definition: "",
  calculationMethod: "",
  formula: "",
  sourceSystem: "",
  reportingMonth: "",
  fiscalYearLabel: "",
  score: "",
  ragStatus: "" as string,
};

function defaultMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function SlaMetricFormDialog({ open, onOpenChange, metricOptions, onSaved }: Props) {
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editId, setEditId] = useState<number | null>(null);
  const [editAccount, setEditAccount] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingMetric, setLoadingMetric] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [slaTab, setSlaTab] = useState(0);
  const [assignableUsers, setAssignableUsers] = useState<PlatformUserLite[]>([]);
  const [slaPmUserId, setSlaPmUserId] = useState("");
  const [projDdOpen, setProjDdOpen] = useState(false);
  const [projSearch, setProjSearch] = useState("");
  const [projDdRect, setProjDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const projWrapRef = useRef<HTMLDivElement>(null);
  const projBtnRef = useRef<HTMLButtonElement>(null);
  const projPortalRef = useRef<HTMLDivElement>(null);

  const accountsInMetrics = useMemo(() => {
    const s = new Set<string>();
    for (const o of metricOptions) {
      if (o.account) s.add(o.account);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [metricOptions]);

  const metricsForAccount = useMemo(() => {
    if (!editAccount) return [];
    return metricOptions
      .filter((o) => o.account === editAccount)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [metricOptions, editAccount]);

  const resetForCreate = useCallback(() => {
    setMode("create");
    setEditId(null);
    setEditAccount("");
    setSlaPmUserId("");
    setForm({ ...emptyForm, reportingMonth: defaultMonth() });
  }, []);

  const selectedProject = useMemo(() => {
    const pid = Number(form.projectId);
    return Number.isFinite(pid) && pid > 0 ? projects.find((p) => p.id === pid) ?? null : null;
  }, [form.projectId, projects]);

  const filteredProjects = useMemo(() => {
    const q = projSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const lab = `prj-${p.id} ${p.account_name || p.filename || ""}`.toLowerCase();
      return lab.includes(q);
    });
  }, [projects, projSearch]);

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

  const slaSection = (
    icon: React.ReactNode,
    colorCls: string,
    title: string,
    desc: string,
    body: React.ReactNode,
  ) => (
    <div className="ncp-section" style={{ marginBottom: 12 }}>
      <div className="ncp-section-header" style={{ cursor: "default" }}>
        <div className={cn("ncp-section-icon", colorCls)}>{icon}</div>
        <div>
          <div className="ncp-section-label">{title}</div>
          <div className="ncp-section-desc">{desc}</div>
        </div>
      </div>
      <div className="ncp-section-body" style={{ maxHeight: "none" }}>
        {body}
      </div>
    </div>
  );

  const projectPickerBlock = (
    <div ref={projWrapRef} className="ncp-project-wrap" style={{ borderTop: "none" }}>
      <button
        ref={projBtnRef}
        type="button"
        disabled={loadingProjects}
        className={cn("ncp-project-btn", selectedProject && "ncp-selected")}
        onClick={(e) => {
          e.stopPropagation();
          if (!loadingProjects) setProjDdOpen((o) => !o);
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
            <span>{loadingProjects ? "Loading projects…" : "Search or select a project (PRJ-···)"}</span>
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
                    className={cn(
                      "ncp-project-opt",
                      Number(form.projectId) === p.id && "ncp-selected",
                    )}
                    onClick={() => {
                      setForm((f) => ({ ...f, projectId: p.id }));
                      setProjDdOpen(false);
                      setProjSearch("");
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
                    {projects.length === 0 ? "No projects in scope." : `No projects match “${projSearch.trim()}”.`}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );

  const periodDetailRows = (
    <>
      <div className="ncp-prop-row">
        <div className="ncp-prop-label">Update date</div>
        <input
          type="date"
          className="ncp-prop-input"
          value={form.reportingMonth.length >= 7 ? `${form.reportingMonth.slice(0, 7)}-01` : ""}
          onChange={(e) => {
            const v = e.target.value;
            setForm((f) => ({ ...f, reportingMonth: v.length >= 7 ? v.slice(0, 7) : "" }));
          }}
        />
      </div>
      <div className="ncp-prop-row">
        <div className="ncp-prop-label">Fiscal year</div>
        <input
          className="ncp-prop-input"
          value={form.fiscalYearLabel}
          onChange={(e) => setForm((f) => ({ ...f, fiscalYearLabel: e.target.value }))}
          placeholder="e.g. FY 2025-26"
        />
      </div>
      <div className="ncp-prop-row">
        <div className="ncp-prop-label">Project manager</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <UserPickerDropdown
            value={slaPmUserId}
            onChange={setSlaPmUserId}
            users={assignableUsers}
            placeholder={Number(form.projectId) > 0 ? "— Optional —" : "Select a project first"}
          />
        </div>
      </div>
    </>
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSlaTab(0);
    setMode("create");
    setEditId(null);
    setEditAccount("");
    setForm({ ...emptyForm, reportingMonth: defaultMonth() });
    setSlaPmUserId("");
    setProjDdOpen(false);
    setProjSearch("");
    setLoadingProjects(true);
    queries
      .projects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
      if (!cancelled) setAssignableUsers([...map.values()]);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || mode !== "edit" || !editId) {
      if (mode === "edit" && !editId) {
        setForm({ ...emptyForm, reportingMonth: defaultMonth() });
      }
      return;
    }
    setLoadingMetric(true);
    setError(null);
    slaMetricsApi
      .get(editId)
      .then((m: SlaMetricRecord) => {
        setSlaPmUserId("");
        setForm({
          projectId: m.project_id,
          metricLabel: m.metric_label || "",
          metricGroup: m.metric_group || "",
          metricNature: m.metric_nature || "",
          targetThreshold: m.target_threshold || "",
          definition: m.definition || "",
          calculationMethod: m.calculation_method || "",
          formula: m.formula || "",
          sourceSystem: m.source_system || "",
          reportingMonth: defaultMonth(),
          fiscalYearLabel: "",
          score: "",
          ragStatus: "",
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load metric"))
      .finally(() => setLoadingMetric(false));
  }, [open, mode, editId]);

  const setField = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const buildPerformance = () => {
    const rm = form.reportingMonth.trim();
    const hasPeriod = rm.length >= 7;
    const hasScore = form.score.trim().length > 0;
    const hasRag = form.ragStatus.trim().length > 0;
    if (!hasPeriod && !hasScore && !hasRag) return undefined;
    return {
      reporting_month: hasPeriod ? rm : undefined,
      score: hasScore ? form.score.trim() : undefined,
      rag_status: hasRag ? form.ragStatus.trim() : undefined,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const rm = form.reportingMonth.trim();
    const hasSnap =
      rm.length >= 7 || form.score.trim().length > 0 || form.ragStatus.trim().length > 0;
    if (hasSnap && rm.length < 7) {
      setError("Set reporting month for the period snapshot when you enter score or RAG status.");
      setSlaTab(2);
      return;
    }
    if (mode === "create") {
      const pid = Number(form.projectId);
      if (!pid || Number.isNaN(pid)) {
        setError("Select a client / project from the list.");
        setSlaTab(0);
        return;
      }
      if (!projects.some((p) => p.id === pid)) {
        setError("Choose a valid client from the list.");
        setSlaTab(0);
        return;
      }
      if (!form.metricLabel.trim()) {
        setError("Performance measure (label) is required.");
        setSlaTab(0);
        return;
      }
      setSaving(true);
      try {
        const perf = buildPerformance();
        await slaMetricsApi.create({
          project_id: pid,
          metric_label: form.metricLabel.trim(),
          metric_group: form.metricGroup || undefined,
          metric_nature: form.metricNature || undefined,
          target_threshold: form.targetThreshold || undefined,
          definition: form.definition || undefined,
          calculation_method: form.calculationMethod || undefined,
          formula: form.formula || undefined,
          source_system: form.sourceSystem || undefined,
          performance: perf,
        });
        onSaved();
        onOpenChange(false);
        resetForCreate();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!editAccount.trim()) {
      setError("Select a client first.");
      setSlaTab(0);
      return;
    }
    if (!editId) {
      setError("Select an existing KPI to update.");
      setSlaTab(0);
      return;
    }
    setSaving(true);
    try {
      const perf = buildPerformance();
      await slaMetricsApi.update(editId, {
        metric_label: form.metricLabel.trim() || undefined,
        metric_group: form.metricGroup || undefined,
        metric_nature: form.metricNature || undefined,
        target_threshold: form.targetThreshold || undefined,
        definition: form.definition || undefined,
        calculation_method: form.calculationMethod || undefined,
        formula: form.formula || undefined,
        source_system: form.sourceSystem || undefined,
        performance: perf,
      });
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const scopeBlockedCreate =
    mode === "create" &&
    (!form.projectId || !projects.some((p) => p.id === Number(form.projectId)));

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
        <form
          onSubmit={handleSubmit}
          className="new-contract-sheet flex min-h-0 flex-1 flex-col"
        >
          <div className="ncp-scroll min-h-0 flex-1">
            <div className="ncp-page">
              <div className="ncp-header">
                <div style={{ minWidth: 0 }}>
                  <div className="ncp-breadcrumb">
                    <span>Insights</span>
                    <span className="ncp-breadcrumb-sep">›</span>
                    <span>SLA</span>
                    <span className="ncp-breadcrumb-sep">›</span>
                    <span>Metric</span>
                  </div>
                  <h1 className="ncp-h1">Add or update SLA metric</h1>
                  <p className="ncp-subtitle" style={{ marginTop: 4 }}>
                    Choose a client, then enter the performance measure and optional catalogue fields. Add a month
                    snapshot (reporting month, score, Met / Not Met) to write or upsert period data in the database.
                  </p>
                </div>
                <button
                  type="button"
                  className="ncp-close-btn"
                  aria-label="Close"
                  onClick={() => onOpenChange(false)}
                >
                  ✕
                </button>
              </div>

              <div className="ncp-flow-toggle-row">
                <button
                  type="button"
                  className={cn("ncp-flow-pill", mode === "create" && "ncp-flow-pill--active")}
                  onClick={() => {
                    setMode("create");
                    setEditId(null);
                    setEditAccount("");
                    resetForCreate();
                  }}
                >
                  Create new metric
                </button>
                <button
                  type="button"
                  className={cn("ncp-flow-pill", mode === "edit" && "ncp-flow-pill--active")}
                  onClick={() => {
                    setMode("edit");
                    setEditId(null);
                    setEditAccount("");
                    setSlaPmUserId("");
                    setForm({ ...emptyForm, reportingMonth: defaultMonth() });
                  }}
                  disabled={metricOptions.length === 0}
                >
                  Update existing
                  {metricOptions.length === 0 ? " (no metrics)" : ""}
                </button>
              </div>

              <div className="ncp-steps" role="tablist" style={{ marginBottom: 18 }}>
                {SLA_TABS.map(({ label, num }, i) => (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    aria-selected={slaTab === i}
                    className={cn(
                      "ncp-step",
                      slaTab === i && "ncp-active",
                      slaTab > i && "ncp-done",
                    )}
                    onClick={() => setSlaTab(i)}
                  >
                    <span className="ncp-step-num">{slaTab > i ? "✓" : num}</span>
                    {label}
                  </button>
                ))}
              </div>

              {/* Tab 0 — Scope */}
              <div className={cn("ncp-panel", slaTab === 0 && "ncp-panel-active")}>
                {mode === "create" && scopeBlockedCreate ? (
                  <p className="ncp-hint" style={{ color: "var(--ncp-accent)", marginBottom: 12 }}>
                    <span aria-hidden>●</span> Client / project selection is required to continue.
                  </p>
                ) : null}
                {mode === "edit" && !editAccount ? (
                  <p className="ncp-hint" style={{ color: "var(--ncp-accent)", marginBottom: 12 }}>
                    <span aria-hidden>●</span> Choose a client and KPI to load the catalogue fields.
                  </p>
                ) : null}

                {mode === "edit" &&
                  slaSection(
                    "◇",
                    "ncp-orange",
                    "Client & KPI",
                    "Choose a client and existing KPI to update catalogue fields.",
                    <>
                      <div className="ncp-tag-grid" style={{ borderTop: "none" }}>
                        <div>
                          <span className="ncp-micro-label">Client *</span>
                          <SearchableStringPicker
                            items={accountsInMetrics}
                            value={editAccount}
                            onChange={(acc) => {
                              setEditAccount(acc);
                              setEditId(null);
                            }}
                            placeholder="Type to search clients…"
                            emptyHint={accountsInMetrics.length === 0 ? "No clients in SLA data yet." : undefined}
                          />
                        </div>
                        <div>
                          <span className="ncp-micro-label">Existing KPI *</span>
                          <SearchableMetricOptionPicker
                            options={metricsForAccount}
                            metricId={editId}
                            onMetricIdChange={setEditId}
                            disabled={!editAccount}
                          />
                          {!editAccount ? (
                            <p className="ncp-hint" style={{ marginTop: 6 }}>
                              Choose a client first.
                            </p>
                          ) : metricsForAccount.length === 0 ? (
                            <p className="ncp-hint" style={{ marginTop: 6 }}>
                              No KPIs for this client.
                            </p>
                          ) : null}
                        </div>
                      </div>
                      {periodDetailRows}
                    </>,
                  )}

                {mode === "create" &&
                  slaSection(
                    "◇",
                    "ncp-orange",
                    "Client & project",
                    "Linked project and reporting period",
                    <>
                      {projectPickerBlock}
                      {periodDetailRows}
                    </>,
                  )}

                {mode === "edit" && loadingMetric && (
                  <p className="ncp-hint" style={{ marginBottom: 12 }}>
                    Loading metric…
                  </p>
                )}

                <div className="ncp-stack-card">
                  <div className="ncp-stack-card-head">
                    <span className="ncp-stack-card-title">Metric identity</span>
                  </div>
                  <div className="ncp-section-body" style={{ padding: "0 0 4px", maxHeight: "none" }}>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Performance measure (label) *</div>
                      <input
                        className="ncp-prop-input"
                        value={form.metricLabel}
                        onChange={(e) => setField("metricLabel", e.target.value)}
                        placeholder="e.g. Time to Hire"
                        required
                        disabled={mode === "edit" && loadingMetric}
                      />
                    </div>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Metric group</div>
                      <input
                        className="ncp-prop-input"
                        value={form.metricGroup}
                        onChange={(e) => setField("metricGroup", e.target.value)}
                      />
                    </div>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Metric type / nature</div>
                      <select
                        className="ncp-prop-input"
                        value={form.metricNature}
                        onChange={(e) => setField("metricNature", e.target.value)}
                        disabled={mode === "edit" && loadingMetric}
                      >
                        <option value="">— Select —</option>
                        {SLA_METRIC_NATURE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                        {form.metricNature &&
                        !SLA_METRIC_NATURE_OPTIONS.includes(form.metricNature as (typeof SLA_METRIC_NATURE_OPTIONS)[number]) ? (
                          <option value={form.metricNature}>{form.metricNature} (legacy)</option>
                        ) : null}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tab 1 — Definition */}
              <div className={cn("ncp-panel", slaTab === 1 && "ncp-panel-active")}>
                <div className="ncp-stack-card">
                  <div className="ncp-stack-card-head">
                    <div>
                      <div className="ncp-stack-card-title">Threshold &amp; documentation</div>
                      <div style={{ fontSize: 12, color: "var(--ncp-text-muted)" }}>
                        Target, narrative definition, and how the metric is calculated.
                      </div>
                    </div>
                  </div>
                  <div className="ncp-section-body" style={{ padding: "0 0 4px", maxHeight: "none" }}>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Target</div>
                      <input
                        className="ncp-prop-input"
                        value={form.targetThreshold}
                        onChange={(e) => setField("targetThreshold", e.target.value)}
                        disabled={mode === "edit" && loadingMetric}
                      />
                    </div>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Definition</div>
                      <textarea
                        className="ncp-prop-input"
                        value={form.definition}
                        onChange={(e) => setField("definition", e.target.value)}
                        rows={3}
                        disabled={mode === "edit" && loadingMetric}
                      />
                    </div>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Calculation method</div>
                      <textarea
                        className="ncp-prop-input"
                        value={form.calculationMethod}
                        onChange={(e) => setField("calculationMethod", e.target.value)}
                        rows={2}
                        disabled={mode === "edit" && loadingMetric}
                      />
                    </div>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Formula</div>
                      <textarea
                        className="ncp-prop-input"
                        value={form.formula}
                        onChange={(e) => setField("formula", e.target.value)}
                        rows={2}
                        disabled={mode === "edit" && loadingMetric}
                      />
                    </div>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Measurement system</div>
                      <input
                        className="ncp-prop-input"
                        value={form.sourceSystem}
                        onChange={(e) => setField("sourceSystem", e.target.value)}
                        disabled={mode === "edit" && loadingMetric}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Tab 2 — Period snapshot */}
              <div className={cn("ncp-panel", slaTab === 2 && "ncp-panel-active")}>
                <div className="ncp-stack-card">
                  <div className="ncp-stack-card-head">
                    <div>
                      <div className="ncp-stack-card-title">Period snapshot (optional)</div>
                      <div style={{ fontSize: 12, color: "var(--ncp-text-muted)" }}>
                        Fills or updates one row in SLA performance for the reporting month. Leave empty to only save the
                        metric definition.
                      </div>
                    </div>
                  </div>
                  <div className="ncp-section-body" style={{ padding: "0 0 4px", maxHeight: "none" }}>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Reporting month</div>
                      <input
                        type="month"
                        className="ncp-prop-input"
                        value={form.reportingMonth}
                        onChange={(e) => setField("reportingMonth", e.target.value)}
                      />
                    </div>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Score</div>
                      <input
                        className="ncp-prop-input"
                        value={form.score}
                        onChange={(e) => setField("score", e.target.value)}
                        placeholder="e.g. 90"
                        inputMode="decimal"
                      />
                    </div>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">RAG status</div>
                      <select
                        className="ncp-prop-input"
                        value={form.ragStatus}
                        onChange={(e) => setField("ragStatus", e.target.value)}
                      >
                        <option value="">—</option>
                        <option value="Met">Met</option>
                        <option value="Not Met">Not Met</option>
                        <option value="NOT MET">NOT MET</option>
                        <option value="Not Reported">Not Reported</option>
                      </select>
                    </div>
                  </div>
                </div>
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
              <button
                type="button"
                className="ncp-btn ncp-btn-ghost"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </button>
              {slaTab > 0 ? (
                <button
                  type="button"
                  className="ncp-btn ncp-btn-ghost"
                  onClick={() => setSlaTab((t) => t - 1)}
                  disabled={saving}
                >
                  ← Back
                </button>
              ) : null}
              {slaTab < SLA_TABS.length - 1 ? (
                <button
                  type="button"
                  className="ncp-btn ncp-btn-secondary"
                  onClick={() => setSlaTab((t) => t + 1)}
                  disabled={
                    saving ||
                    (slaTab === 0 &&
                      mode === "create" &&
                      (!form.projectId || !projects.some((p) => p.id === Number(form.projectId)))) ||
                    (slaTab === 0 && mode === "edit" && (!editAccount || !editId || loadingMetric))
                  }
                >
                  Next →
                </button>
              ) : null}
              <button
                type="submit"
                className="ncp-btn ncp-btn-primary"
                disabled={
                  saving ||
                  (mode === "create" &&
                    (!form.projectId || !projects.some((p) => p.id === Number(form.projectId)))) ||
                  (mode === "edit" && (!editAccount || !editId || loadingMetric))
                }
              >
                {saving ? "Saving…" : mode === "create" ? "Create metric" : "Save changes"}
              </button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
