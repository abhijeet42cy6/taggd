import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  queries,
  adminApi,
  CONTRACT_PIPELINE_STAGES,
  type Project,
  type ProjectContractRow,
} from "@/lib/api";
import "@/styles/new-contract-panel.css";
import {
  NewContractOrgFlow,
  makeEngagementRow,
  orgSetupValid,
  type NewContractOrgBundle,
  type EngagementRow,
  type OrgClientDraft,
} from "@/components/platform/NewContractOrgFlow";

const ACCOUNT_TYPE_OPTIONS = [
  "RPO",
  "Staff Augmentation",
  "Managed Services",
  "Project-based",
  "Retainer",
];

function distinctFromContracts(rows: ProjectContractRow[], key: keyof ProjectContractRow): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    const v = r[key];
    if (typeof v === "string" && v.trim()) s.add(v.trim());
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

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

function statusPillClass(status: string): "ncp-st-active" | "ncp-st-pending" | "ncp-st-inactive" {
  const s = (status || "").toLowerCase();
  if (s.includes("pend") || s.includes("draft")) return "ncp-st-pending";
  if (s.includes("active") || s.includes("live") || s.includes("sign")) return "ncp-st-active";
  return "ncp-st-inactive";
}

export type PlatformUserOption = { id: number; email: string; role: string };

export type NewContractSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  contracts: ProjectContractRow[];
  createProjectId: string;
  setCreateProjectId: (v: string) => void;
  createForm: Record<string, string>;
  setCreateForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  createProspectName: string;
  setCreateProspectName: (v: string) => void;
  onSubmitCreate: () => void | Promise<void>;
  creating: boolean;
  /** When set, enables “New client + projects” flow with stacked engagements. */
  makeEmptyContractForm?: () => Record<string, string>;
  onSubmitClientWithEngagements?: (bundle: NewContractOrgBundle) => void | Promise<void>;
  clientGroups?: import("@/lib/api").ClientGroup[];
};

export function NewContractSheet({
  open,
  onOpenChange,
  projects,
  contracts,
  createProjectId,
  setCreateProjectId,
  createForm,
  setCreateForm,
  createProspectName,
  setCreateProspectName,
  onSubmitCreate,
  creating,
  makeEmptyContractForm,
  onSubmitClientWithEngagements,
  clientGroups = [],
}: NewContractSheetProps) {
  const [step, setStep] = useState(0);
  const [projDdOpen, setProjDdOpen] = useState(false);
  const [projSearch, setProjSearch] = useState("");
  const projWrapRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ adv: true });
  const [platformUsers, setPlatformUsers] = useState<PlatformUserOption[]>([]);
  type FlowMode = "existing_prj" | "new_client_org";
  const [flowMode, setFlowMode] = useState<FlowMode>("existing_prj");
  const [orgClient, setOrgClient] = useState<OrgClientDraft>({
    official_name: "",
    short_code: "",
    lifecycle: "prospect",
    tag_level: "",
    tag_value: "",
  });
  const [engagements, setEngagements] = useState<EngagementRow[]>([]);

  const toggleSection = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setProjDdOpen(false);
    setProjSearch("");
    setFlowMode("existing_prj");
    if (makeEmptyContractForm) {
      setOrgClient({
        official_name: "",
        short_code: "",
        lifecycle: "prospect",
        tag_level: "",
        tag_value: "",
      });
      setEngagements([makeEngagementRow(makeEmptyContractForm)]);
    }
  }, [open, makeEmptyContractForm]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([queries.taskAssignableUsers().catch(() => []), adminApi.listUsers().catch(() => [])]).then(([a, b]) => {
      if (cancelled) return;
      const m = new Map<number, PlatformUserOption>();
      for (const u of a as { id: number; email: string; role: string }[]) {
        m.set(u.id, { id: u.id, email: u.email, role: u.role });
      }
      for (const u of b) {
        if (!m.has(u.id)) m.set(u.id, { id: u.id, email: u.email, role: u.role });
      }
      setPlatformUsers(Array.from(m.values()).sort((x, y) => x.email.localeCompare(y.email)));
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!projWrapRef.current?.contains(e.target as Node)) setProjDdOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const selectedProject = useMemo(() => {
    const pid = parseInt(createProjectId, 10);
    if (!pid || Number.isNaN(pid)) return null;
    return projects.find((p) => p.id === pid) ?? null;
  }, [createProjectId, projects]);

  const filteredProjects = useMemo(() => {
    const q = projSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const lab = `${p.id} ${projectLabel(p)} ${p.filename || ""}`.toLowerCase();
      return lab.includes(q);
    });
  }, [projects, projSearch]);

  const renewalOptions = useMemo(() => {
    const d = distinctFromContracts(contracts, "renewal_status");
    const base = ["Auto-renew", "Manual review", "In negotiation", "Do not renew"];
    return Array.from(new Set([...base, ...d])).sort((a, b) => a.localeCompare(b));
  }, [contracts]);

  const pricingOptions = useMemo(() => {
    const d = distinctFromContracts(contracts, "pricing_model");
    return ["", ...d];
  }, [contracts]);

  const accountTypeMerged = useMemo(() => {
    const d = distinctFromContracts(contracts, "account_type");
    return Array.from(new Set([...ACCOUNT_TYPE_OPTIONS, ...d])).sort((a, b) => a.localeCompare(b));
  }, [contracts]);

  const practiceHeadOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of contracts) {
      if (c.practice_head_snapshot?.trim()) s.add(c.practice_head_snapshot.trim());
    }
    for (const p of projects) {
      if (p.practice_head?.trim()) s.add(p.practice_head.trim());
      if (p.project_head?.trim()) s.add(p.project_head.trim());
    }
    for (const u of platformUsers) s.add(u.email);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [contracts, projects, platformUsers]);

  const onField = useCallback(
    (key: string, value: string) => {
      setCreateForm((f) => ({ ...f, [key]: value }));
    },
    [setCreateForm],
  );

  const durationLabel = useMemo(() => {
    const s = createForm.contract_start_date?.trim();
    const e = createForm.contract_end_date?.trim();
    if (!s || !e) return "— months";
    const start = new Date(s);
    const end = new Date(e);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "— months";
    const months = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
    if (months < 0) return "⚠ Check dates";
    return `${months} month${months !== 1 ? "s" : ""}`;
  }, [createForm.contract_start_date, createForm.contract_end_date]);

  const grossMarginPreview = useMemo(() => {
    const acv = parseFloat(String(createForm.signed_acv_inr || "").replace(/,/g, "")) || 0;
    const cm = parseFloat(String(createForm.signed_cm_pct || "")) || 0;
    const cmReal = cm > 1 ? cm / 100 : cm;
    if (!acv) return "₹ —";
    return `₹ ${Math.round(acv * cmReal).toLocaleString("en-IN")}`;
  }, [createForm.signed_acv_inr, createForm.signed_cm_pct]);

  const mrrPreview = useMemo(() => {
    const acv = parseFloat(String(createForm.signed_acv_inr || "").replace(/,/g, "")) || 0;
    if (!acv) return "₹ —";
    return `₹ ${Math.round(acv / 12).toLocaleString("en-IN")} / mo`;
  }, [createForm.signed_acv_inr]);

  function goTo(next: number) {
    if (flowMode === "new_client_org") {
      if (next >= 1 && !orgSetupValid(orgClient, engagements)) return;
      setStep(next);
      return;
    }
    if (next >= 1 && !createProjectId) return;
    setStep(next);
  }

  function onDatesChange(key: "contract_start_date" | "contract_end_date", value: string) {
    setCreateForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "contract_end_date" && value && !f.renewal_reminder_date?.trim()) {
        const end = new Date(value);
        if (!Number.isNaN(end.getTime())) {
          const rem = new Date(end);
          rem.setDate(rem.getDate() - 60);
          next.renewal_reminder_date = rem.toISOString().slice(0, 10);
        }
      }
      return next;
    });
  }

  const secBody = (id: string, maxH: number, children: React.ReactNode) => (
    <div className="ncp-section-body" style={{ maxHeight: collapsed[id] ? 0 : maxH }}>
      {children}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          "flex h-full max-h-[100dvh] flex-col gap-0 border-l p-0",
          /* Override ui/sheet defaults (data-[side=right]:w-3/4 + sm:max-w-sm ≈384px) — same variant chain so tailwind-merge replaces them */
          "data-[side=right]:w-full data-[side=right]:max-w-[calc(100vw-1rem)]",
          "sm:data-[side=right]:w-[min(calc(100vw-2rem),52rem)] sm:data-[side=right]:max-w-[min(calc(100vw-2rem),52rem)]",
          "bg-[#f7f6f3] shadow-xl",
        )}
      >
        <div className="new-contract-sheet flex min-h-0 flex-1 flex-col">
          <div className="ncp-scroll min-h-0 flex-1">
            <div className="ncp-page">
              <div className="ncp-header">
                <div>
                  <div className="ncp-breadcrumb">
                    <span>Portfolio</span>
                    <span className="ncp-breadcrumb-sep">›</span>
                    <span>Contracts</span>
                    <span className="ncp-breadcrumb-sep">›</span>
                    <span>New</span>
                  </div>
                  <h1 className="ncp-h1">New contract</h1>
                  <p className="ncp-subtitle">
                    Link to a project (SBU), set pipeline and commercial terms. Use{" "}
                    <strong style={{ fontWeight: 600 }}>New client + projects</strong> when you need to create a legal
                    client and engagements first.
                  </p>
                </div>
                <button type="button" className="ncp-close-btn" aria-label="Close" onClick={() => onOpenChange(false)}>
                  ✕
                </button>
              </div>

              {onSubmitClientWithEngagements && makeEmptyContractForm ? (
                <div className="ncp-flow-toggle-row">
                  <button
                    type="button"
                    className={cn("ncp-flow-pill", flowMode === "existing_prj" && "ncp-flow-pill--active")}
                    onClick={() => {
                      setFlowMode("existing_prj");
                      setStep(0);
                    }}
                  >
                    Existing PRJ
                  </button>
                  <button
                    type="button"
                    className={cn("ncp-flow-pill", flowMode === "new_client_org" && "ncp-flow-pill--active")}
                    onClick={() => {
                      setFlowMode("new_client_org");
                      setStep(0);
                    }}
                  >
                    New client + projects
                  </button>
                </div>
              ) : null}

              <div className="ncp-steps" role="tablist">
                {(flowMode === "new_client_org"
                  ? (["Client", "Identity", "Dates", "Commercial", "Review"] as const)
                  : (["Project", "Identity", "Dates", "Commercial"] as const)
                ).map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    className={cn(
                      "ncp-step",
                      step === i && "ncp-active",
                      step > i && "ncp-done",
                    )}
                    onClick={() => goTo(i)}
                    disabled={
                      flowMode === "new_client_org"
                        ? i >= 1 && !orgSetupValid(orgClient, engagements)
                        : i >= 1 && !createProjectId
                    }
                  >
                    <span className="ncp-step-num">{step > i ? "✓" : i + 1}</span>
                    {label}
                  </button>
                ))}
              </div>

              {flowMode === "existing_prj" ? (
              <>
              {/* Panel 0 */}
              <div className={cn("ncp-panel", step === 0 && "ncp-panel-active")}>
                <div className="ncp-req-note">
                  <span>●</span> Project selection is required to continue
                </div>

                <div className="ncp-project-wrap" ref={projWrapRef}>
                  <button
                    type="button"
                    className={cn("ncp-project-btn", selectedProject && "ncp-selected")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setProjDdOpen((o) => !o);
                    }}
                  >
                    {selectedProject ? (
                      <>
                        <span className="ncp-project-icon">{projInitials(projectLabel(selectedProject))}</span>
                        <div className="ncp-project-meta">
                          <strong>{projectLabel(selectedProject)}</strong>
                          <span>PRJ-{selectedProject.id}</span>
                        </div>
                        <span style={{ color: "var(--ncp-accent)" }}>▾</span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 20 }}>＋</span>
                        <span>Search or select a project (PRJ-···)</span>
                        <span style={{ color: "var(--ncp-text-muted)" }}>▾</span>
                      </>
                    )}
                  </button>
                  <div className={cn("ncp-project-dd", projDdOpen && "ncp-open")} onClick={(e) => e.stopPropagation()}>
                    <div className="ncp-project-search">
                      <span style={{ opacity: 0.5 }}>🔍</span>
                      <input
                        type="search"
                        placeholder="Search projects…"
                        value={projSearch}
                        onChange={(e) => setProjSearch(e.target.value)}
                      />
                    </div>
                    <div style={{ maxHeight: 280, overflowY: "auto" }}>
                      {filteredProjects.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="ncp-project-opt"
                          onClick={() => {
                            setCreateProjectId(String(p.id));
                            setProjDdOpen(false);
                            setProjSearch("");
                          }}
                        >
                          <span className="ncp-proj-ico">{projInitials(projectLabel(p))}</span>
                          <div>
                            <div style={{ fontWeight: 500, color: "var(--ncp-text-primary)" }}>{projectLabel(p)}</div>
                            <div style={{ fontSize: 11, color: "var(--ncp-text-muted)", fontFamily: "var(--ncp-mono)" }}>
                              PRJ-{p.id}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="ncp-section" style={{ marginBottom: 12 }}>
                  <div className="ncp-section-body" style={{ maxHeight: 200, paddingTop: 8 }}>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Prospect shortcut</div>
                      <input
                        className="ncp-prop-input"
                        placeholder="Optional — one-step prospect name on contract create"
                        value={createProspectName}
                        onChange={(e) => setCreateProspectName(e.target.value)}
                      />
                    </div>
                    <p className="ncp-hint">Optional label on this contract row; leave empty if not needed.</p>
                  </div>
                </div>

                <div className={cn("ncp-section", collapsed.pipe && "ncp-collapsed")} style={{ marginBottom: 12 }}>
                  <button type="button" className="ncp-section-header" onClick={() => toggleSection("pipe")}>
                    <div className="ncp-section-icon ncp-orange">⏱</div>
                    <div>
                      <div className="ncp-section-label">Closing pipeline</div>
                      <div className="ncp-section-desc">Commercial pursuit stage for this row</div>
                    </div>
                    <span className="ncp-section-toggle">▾</span>
                  </button>
                  {secBody(
                    "pipe",
                    120,
                    <div className="ncp-prop-row" style={{ borderTop: "none" }}>
                      <div className="ncp-prop-label">Pipeline stage</div>
                      <select
                        className="ncp-prop-input"
                        value={createForm.pipeline_stage || "discovery"}
                        onChange={(e) => onField("pipeline_stage", e.target.value)}
                      >
                        {CONTRACT_PIPELINE_STAGES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>,
                  )}
                </div>

                <div className="ncp-footer" style={{ borderTop: "none", paddingLeft: 0, paddingRight: 0, background: "transparent" }}>
                  <span className="ncp-hint">
                    <kbd className="ncp-kbd">Esc</kbd> to cancel
                  </span>
                  <button type="button" className="ncp-btn ncp-btn-primary" disabled={!createProjectId} onClick={() => goTo(1)}>
                    Continue →
                  </button>
                </div>
              </div>

              {/* Panel 1 */}
              <div className={cn("ncp-panel", step === 1 && "ncp-panel-active")}>
                <div className={cn("ncp-section", collapsed.id1 && "ncp-collapsed")}>
                  <button type="button" className="ncp-section-header" onClick={() => toggleSection("id1")}>
                    <div className="ncp-section-icon ncp-orange">👤</div>
                    <div>
                      <div className="ncp-section-label">Identity &amp; classification</div>
                      <div className="ncp-section-desc">Who is this contract with, and how is it classified?</div>
                    </div>
                    <span className="ncp-section-toggle">▾</span>
                  </button>
                  {secBody(
                    "id1",
                    520,
                    <>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Customer name</div>
                        <input
                          className="ncp-prop-input"
                          placeholder="e.g. Accenture India Pvt Ltd"
                          value={createForm.customer_name}
                          onChange={(e) => onField("customer_name", e.target.value)}
                        />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Contract type</div>
                        <select
                          className="ncp-prop-input"
                          value={createForm.account_type}
                          onChange={(e) => onField("account_type", e.target.value)}
                        >
                          <option value="">Choose type…</option>
                          {accountTypeMerged.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Practice head</div>
                        <select
                          className="ncp-prop-input"
                          value={
                            practiceHeadOptions.includes(createForm.practice_head_snapshot)
                              ? createForm.practice_head_snapshot
                              : ""
                          }
                          onChange={(e) => onField("practice_head_snapshot", e.target.value)}
                        >
                          <option value="">Select or type below…</option>
                          {practiceHeadOptions.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Practice head (custom)</div>
                        <input
                          className="ncp-prop-input"
                          placeholder="If not in list, enter name"
                          value={
                            practiceHeadOptions.includes(createForm.practice_head_snapshot)
                              ? ""
                              : createForm.practice_head_snapshot
                          }
                          onChange={(e) => onField("practice_head_snapshot", e.target.value)}
                        />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Current status</div>
                        <div style={{ padding: "6px 0" }}>
                          <select
                            className={cn("ncp-status-pill", statusPillClass(createForm.contract_status))}
                            value={createForm.contract_status || "Active"}
                            onChange={(e) => onField("contract_status", e.target.value)}
                          >
                            <option value="Active">Active</option>
                            <option value="Pending">Pending</option>
                            <option value="Inactive">Inactive</option>
                            <option value="renewed">Renewed</option>
                            <option value="expired">Expired</option>
                          </select>
                        </div>
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Renewal status</div>
                        <select
                          className="ncp-prop-input"
                          value={createForm.renewal_status}
                          onChange={(e) => onField("renewal_status", e.target.value)}
                        >
                          <option value="">Not set</option>
                          {renewalOptions.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>,
                  )}
                </div>

                <div className="ncp-footer" style={{ borderTop: "none", paddingLeft: 0, paddingRight: 0, background: "transparent" }}>
                  <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => goTo(0)}>
                    ← Back
                  </button>
                  <button type="button" className="ncp-btn ncp-btn-primary" onClick={() => goTo(2)}>
                    Continue →
                  </button>
                </div>
              </div>

              {/* Panel 2 */}
              <div className={cn("ncp-panel", step === 2 && "ncp-panel-active")}>
                <div className={cn("ncp-section", collapsed.dt && "ncp-collapsed")}>
                  <button type="button" className="ncp-section-header" onClick={() => toggleSection("dt")}>
                    <div className="ncp-section-icon ncp-blue">📅</div>
                    <div>
                      <div className="ncp-section-label">Contract dates</div>
                      <div className="ncp-section-desc">Duration auto-calculates from start and end</div>
                    </div>
                    <span className="ncp-section-toggle">▾</span>
                  </button>
                  {secBody(
                    "dt",
                    400,
                    <>
                      <div className="ncp-date-grid">
                        <div className="ncp-date-cell">
                          <label>Contract start</label>
                          <input
                            type="date"
                            value={createForm.contract_start_date}
                            onChange={(e) => onDatesChange("contract_start_date", e.target.value)}
                          />
                        </div>
                        <div className="ncp-date-cell">
                          <label>Contract end / renewal</label>
                          <input
                            type="date"
                            value={createForm.contract_end_date}
                            onChange={(e) => onDatesChange("contract_end_date", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="ncp-prop-row" style={{ marginTop: 4 }}>
                        <div className="ncp-prop-label">Duration</div>
                        <div className="ncp-computed-field">
                          <span className="ncp-computed-label">AUTO</span>
                          <span>{durationLabel}</span>
                        </div>
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Renewal reminder</div>
                        <input
                          className="ncp-prop-input"
                          type="date"
                          value={createForm.renewal_reminder_date}
                          onChange={(e) => onField("renewal_reminder_date", e.target.value)}
                        />
                      </div>
                      <p className="ncp-hint" style={{ paddingTop: 8 }}>
                        Tip — reminder is typically set 60–90 days before contract end.
                      </p>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Duration (months)</div>
                        <input
                          className="ncp-prop-input"
                          inputMode="numeric"
                          placeholder="Override auto if needed"
                          value={createForm.duration_months}
                          onChange={(e) => onField("duration_months", e.target.value)}
                        />
                      </div>
                    </>,
                  )}
                </div>

                <div className="ncp-footer" style={{ borderTop: "none", paddingLeft: 0, paddingRight: 0, background: "transparent" }}>
                  <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => goTo(1)}>
                    ← Back
                  </button>
                  <button type="button" className="ncp-btn ncp-btn-primary" onClick={() => goTo(3)}>
                    Continue →
                  </button>
                </div>
              </div>

              {/* Panel 3 */}
              <div className={cn("ncp-panel", step === 3 && "ncp-panel-active")}>
                <div className={cn("ncp-section", collapsed.cm && "ncp-collapsed")}>
                  <button type="button" className="ncp-section-header" onClick={() => toggleSection("cm")}>
                    <div className="ncp-section-icon ncp-green">₹</div>
                    <div>
                      <div className="ncp-section-label">Commercial terms (INR)</div>
                      <div className="ncp-section-desc">Annual contract value and margin details</div>
                    </div>
                    <span className="ncp-section-toggle">▾</span>
                  </button>
                  {secBody(
                    "cm",
                    560,
                    <>
                      <div className="ncp-commercial-row">
                        <div className="ncp-amount-wrap">
                          <label>Signed ACV</label>
                          <div className="ncp-amount-row">
                            <span className="ncp-currency-badge">₹</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0"
                              value={createForm.signed_acv_inr}
                              onChange={(e) => onField("signed_acv_inr", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="ncp-amount-wrap">
                          <label>Signed CM%</label>
                          <div className="ncp-amount-row">
                            <span className="ncp-currency-badge">%</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0.32 or 32"
                              value={createForm.signed_cm_pct}
                              onChange={(e) => onField("signed_cm_pct", e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="ncp-prop-row" style={{ marginTop: 12 }}>
                        <div className="ncp-prop-label">Gross margin</div>
                        <div className="ncp-computed-field">
                          <span className="ncp-computed-label">AUTO</span>
                          <span>{grossMarginPreview}</span>
                        </div>
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Monthly run rate</div>
                        <div className="ncp-computed-field">
                          <span className="ncp-computed-label">AUTO</span>
                          <span>{mrrPreview}</span>
                        </div>
                      </div>
                      <div className="ncp-commercial-row" style={{ marginTop: 10 }}>
                        <div className="ncp-amount-wrap">
                          <label>Agreed rate / fee</label>
                          <div className="ncp-amount-row">
                            <span className="ncp-currency-badge">₹</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={createForm.agreed_rate_fee_inr}
                              onChange={(e) => onField("agreed_rate_fee_inr", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="ncp-amount-wrap">
                          <label>Est. annual value</label>
                          <div className="ncp-amount-row">
                            <span className="ncp-currency-badge">₹</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={createForm.est_annual_value_inr}
                              onChange={(e) => onField("est_annual_value_inr", e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="ncp-commercial-row">
                        <div className="ncp-amount-wrap">
                          <label>Run rate / mo</label>
                          <div className="ncp-amount-row">
                            <span className="ncp-currency-badge">₹</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={createForm.revenue_run_rate_inr}
                              onChange={(e) => onField("revenue_run_rate_inr", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="ncp-amount-wrap">
                          <label>Pricing model</label>
                          <div className="ncp-amount-row" style={{ paddingTop: 4 }}>
                            <select
                              className="ncp-prop-input"
                              style={{ border: "none", padding: 0 }}
                              value={createForm.pricing_model}
                              onChange={(e) => onField("pricing_model", e.target.value)}
                            >
                              {pricingOptions.map((pm) => (
                                <option key={pm || "none"} value={pm}>
                                  {pm || "— Choose —"}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                      <div className="ncp-prop-row" style={{ marginTop: 10 }}>
                        <div className="ncp-prop-label">Payment terms</div>
                        <textarea
                          className="ncp-prop-input"
                          rows={2}
                          value={createForm.payment_terms}
                          onChange={(e) => onField("payment_terms", e.target.value)}
                        />
                      </div>
                    </>,
                  )}
                </div>

                <div className={cn("ncp-section", collapsed.dl && "ncp-collapsed")}>
                  <button type="button" className="ncp-section-header" onClick={() => toggleSection("dl")}>
                    <div className="ncp-section-icon ncp-blue">📊</div>
                    <div>
                      <div className="ncp-section-label">Delivery &amp; sources</div>
                      <div className="ncp-section-desc">Volumes, positions, mixes</div>
                    </div>
                    <span className="ncp-section-toggle">▾</span>
                  </button>
                  {secBody(
                    "dl",
                    480,
                    <>
                      <div className="ncp-commercial-row">
                        <div className="ncp-amount-wrap">
                          <label>HC contracted</label>
                          <div className="ncp-amount-row">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={createForm.headcount_contracted}
                              onChange={(e) => onField("headcount_contracted", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="ncp-amount-wrap">
                          <label>Hiring volume</label>
                          <div className="ncp-amount-row">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={createForm.hiring_volume}
                              onChange={(e) => onField("hiring_volume", e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="ncp-commercial-row">
                        <div className="ncp-amount-wrap">
                          <label>Positions contracted</label>
                          <div className="ncp-amount-row">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={createForm.positions_contracted}
                              onChange={(e) => onField("positions_contracted", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="ncp-amount-wrap">
                          <label>Positions filled</label>
                          <div className="ncp-amount-row">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={createForm.positions_filled}
                              onChange={(e) => onField("positions_filled", e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Taggd source mix</div>
                        <input
                          className="ncp-prop-input"
                          value={createForm.taggd_source_mix}
                          onChange={(e) => onField("taggd_source_mix", e.target.value)}
                        />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Other source mix</div>
                        <input
                          className="ncp-prop-input"
                          value={createForm.other_source_mix}
                          onChange={(e) => onField("other_source_mix", e.target.value)}
                        />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Overall RPH</div>
                        <input
                          className="ncp-prop-input"
                          inputMode="decimal"
                          value={createForm.overall_rph}
                          onChange={(e) => onField("overall_rph", e.target.value)}
                        />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">MMF applicable</div>
                        <select
                          className="ncp-prop-input"
                          value={createForm.mmf_applicable}
                          onChange={(e) => onField("mmf_applicable", e.target.value)}
                        >
                          <option value="">—</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Opening fee applicable</div>
                        <select
                          className="ncp-prop-input"
                          value={createForm.opening_fee_applicable}
                          onChange={(e) => onField("opening_fee_applicable", e.target.value)}
                        >
                          <option value="">—</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </div>
                    </>,
                  )}
                </div>

                <div className={cn("ncp-section", collapsed.lg && "ncp-collapsed")}>
                  <button type="button" className="ncp-section-header" onClick={() => toggleSection("lg")}>
                    <div className="ncp-section-icon ncp-amber">⚖</div>
                    <div>
                      <div className="ncp-section-label">Legal &amp; SLA</div>
                      <div className="ncp-section-desc">SOW, SLA, client sign-off (platform user)</div>
                    </div>
                    <span className="ncp-section-toggle">▾</span>
                  </button>
                  {secBody(
                    "lg",
                    420,
                    <>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">SOW / MSA ref</div>
                        <input
                          className="ncp-prop-input"
                          value={createForm.sow_msa_reference}
                          onChange={(e) => onField("sow_msa_reference", e.target.value)}
                        />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">SLA summary</div>
                        <textarea
                          className="ncp-prop-input"
                          rows={2}
                          value={createForm.sla_terms_summary}
                          onChange={(e) => onField("sla_terms_summary", e.target.value)}
                        />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Client sign-off</div>
                        <select
                          className="ncp-prop-input"
                          value={
                            platformUsers.some((u) => u.email === createForm.client_signoff_authority)
                              ? createForm.client_signoff_authority
                              : ""
                          }
                          onChange={(e) => onField("client_signoff_authority", e.target.value)}
                        >
                          <option value="">— Select user —</option>
                          {platformUsers.map((u) => (
                            <option key={u.id} value={u.email}>
                              {u.email} ({u.role})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Sign-off (custom)</div>
                        <input
                          className="ncp-prop-input"
                          placeholder="If authority is not a platform user"
                          value={
                            platformUsers.some((u) => u.email === createForm.client_signoff_authority)
                              ? ""
                              : createForm.client_signoff_authority
                          }
                          onChange={(e) => onField("client_signoff_authority", e.target.value)}
                        />
                      </div>
                    </>,
                  )}
                </div>

                <div className={cn("ncp-section", collapsed.adv && "ncp-collapsed")}>
                  <button type="button" className="ncp-section-header" onClick={() => toggleSection("adv")}>
                    <div className="ncp-section-icon ncp-amber">＋</div>
                    <div>
                      <div className="ncp-section-label">Optional &amp; notes</div>
                      <div className="ncp-section-desc">Lapse reason, scope detail, remarks</div>
                    </div>
                    <span className="ncp-section-toggle">▾</span>
                  </button>
                  {secBody(
                    "adv",
                    320,
                    <>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Reason for lapse</div>
                        <textarea
                          className="ncp-prop-input"
                          rows={2}
                          placeholder="Optional"
                          value={createForm.reason_for_lapse}
                          onChange={(e) => onField("reason_for_lapse", e.target.value)}
                        />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Detail / scope</div>
                        <textarea
                          className="ncp-prop-input"
                          rows={2}
                          value={createForm.contract_detail}
                          onChange={(e) => onField("contract_detail", e.target.value)}
                        />
                      </div>
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Remarks</div>
                        <textarea
                          className="ncp-prop-input"
                          rows={2}
                          value={createForm.remarks}
                          onChange={(e) => onField("remarks", e.target.value)}
                        />
                      </div>
                    </>,
                  )}
                </div>

                <div
                  className="ncp-section"
                  style={{ borderStyle: "dashed", borderColor: "var(--ncp-border-focus)", marginBottom: 16 }}
                >
                  <div className="ncp-section-header" style={{ cursor: "default" }}>
                    <div className="ncp-section-icon ncp-amber">✅</div>
                    <div>
                      <div className="ncp-section-label">Review summary</div>
                      <div className="ncp-section-desc">Confirm project and key fields before create</div>
                    </div>
                  </div>
                  <div className="ncp-section-body" style={{ maxHeight: 220, paddingTop: 4 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--ncp-text-secondary)",
                        lineHeight: 1.75,
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "4px 20px",
                      }}
                    >
                      <div>
                        <span style={{ color: "var(--ncp-text-muted)" }}>Project</span>
                        <br />
                        <strong>{selectedProject ? projectLabel(selectedProject) : "—"}</strong>
                        <br />
                        <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 11, color: "var(--ncp-accent)" }}>
                          {createProjectId ? `PRJ-${createProjectId}` : "—"}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: "var(--ncp-text-muted)" }}>Pipeline</span>
                        <br />
                        <strong>
                          {CONTRACT_PIPELINE_STAGES.find((s) => s.value === (createForm.pipeline_stage || "discovery"))
                            ?.label ?? createForm.pipeline_stage}
                        </strong>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <span style={{ color: "var(--ncp-text-muted)" }}>Customer</span>
                        <br />
                        <strong>{createForm.customer_name?.trim() || "—"}</strong>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <span style={{ color: "var(--ncp-text-muted)" }}>Status</span>
                        <br />
                        <strong>{createForm.contract_status || "—"}</strong>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <span style={{ color: "var(--ncp-text-muted)" }}>Term</span>
                        <br />
                        <strong>
                          {createForm.contract_start_date || "—"} → {createForm.contract_end_date || "—"}
                        </strong>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <span style={{ color: "var(--ncp-text-muted)" }}>Duration</span>
                        <br />
                        <strong>{durationLabel}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="ncp-footer" style={{ borderTop: "none", paddingLeft: 0, paddingRight: 0, background: "transparent" }}>
                  <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => goTo(2)}>
                    ← Back
                  </button>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="ncp-btn ncp-btn-secondary" onClick={() => onOpenChange(false)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="ncp-btn ncp-btn-primary"
                      disabled={creating || !createProjectId}
                      onClick={() => void onSubmitCreate()}
                    >
                      {creating ? "Creating…" : "Create contract ✓"}
                    </button>
                  </div>
                </div>
              </div>
              </>
              ) : makeEmptyContractForm && onSubmitClientWithEngagements ? (
                <NewContractOrgFlow
                  step={step}
                  setStep={setStep}
                  creating={creating}
                  onOpenChange={onOpenChange}
                  orgClient={orgClient}
                  setOrgClient={setOrgClient}
                  engagements={engagements}
                  setEngagements={setEngagements}
                  makeEmptyContractForm={makeEmptyContractForm}
                  platformUsers={platformUsers}
                  accountTypeMerged={accountTypeMerged}
                  renewalOptions={renewalOptions}
                  pricingOptions={pricingOptions}
                  clientGroups={clientGroups}
                  onSubmitBundle={onSubmitClientWithEngagements}
                />
              ) : null}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
