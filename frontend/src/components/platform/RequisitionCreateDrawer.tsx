import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { queries, type CandidateRow, type Project, type RecordCreate, type RecordRow } from "@/lib/api";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import "@/styles/new-contract-panel.css";

const GLOBAL_STATUS_OPTIONS = ["ACTIVE", "CLOSED", "PIPELINE", "ON HOLD", "UNPROCESSED", "CANCELLED"] as const;

/** Mirrors backend `RECORD_SOURCE_JOINER_TYPES`. */
const SOURCE_JOINER_OPTIONS: { value: string; label: string; group: "taggd" | "nontaggd" }[] = [
  { value: "taggd_rpo", label: "RPO", group: "taggd" },
  { value: "taggd_direct", label: "Direct", group: "taggd" },
  { value: "nontaggd_employee_referral", label: "Employee referral", group: "nontaggd" },
  { value: "nontaggd_internal_job_portal", label: "Internal job portal", group: "nontaggd" },
  { value: "nontaggd_campus", label: "Campus", group: "nontaggd" },
  { value: "nontaggd_transferred", label: "Transferred", group: "nontaggd" },
];

const REQ_TABS = [
  { icon: "◇", label: "Project" },
  { icon: "👤", label: "Candidate" },
  { icon: "🏢", label: "Role & org" },
  { icon: "📊", label: "Pipeline" },
] as const;

type CandidateMode = "none" | "manual" | "pool";

type CreateForm = {
  project_id: number;
  position_code: string;
  candidate_name: string;
  position_title: string;
  hiring_manager: string;
  department: string;
  location: string;
  offered_lakhs: string;
  status: string;
  global_status: string;
  creation_date: string;
  joining_date: string;
  additional_json: string;
  source_joiner_type: string;
};

function emptyForm(): CreateForm {
  return {
    project_id: 0,
    position_code: "",
    candidate_name: "",
    position_title: "",
    hiring_manager: "",
    department: "",
    location: "",
    offered_lakhs: "",
    status: "Open",
    global_status: "ACTIVE",
    creation_date: "",
    joining_date: "",
    additional_json: "{}",
    source_joiner_type: "",
  };
}

const OPEN_POSITION_LABEL = "Open position";

export type RequisitionCreateDrawerProps = {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  onCreated: (record: RecordRow) => void;
};

export function RequisitionCreateDrawer({ open, onClose, projects, onCreated }: RequisitionCreateDrawerProps) {
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<CreateForm>(() => emptyForm());
  const [candidateMode, setCandidateMode] = useState<CandidateMode>("manual");
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateRow | null>(null);
  const [poolRows, setPoolRows] = useState<CandidateRow[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [projDdOpen, setProjDdOpen] = useState(false);
  const [projSearch, setProjSearch] = useState("");
  const [projDdRect, setProjDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const projWrapRef = useRef<HTMLDivElement>(null);
  const projBtnRef = useRef<HTMLButtonElement>(null);
  const projPortalRef = useRef<HTMLDivElement>(null);

  const [candDdOpen, setCandDdOpen] = useState(false);
  const [candSearch, setCandSearch] = useState("");
  const [candDdRect, setCandDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const candWrapRef = useRef<HTMLDivElement>(null);
  const candBtnRef = useRef<HTMLButtonElement>(null);
  const candPortalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm());
    setTab(0);
    setCandidateMode("manual");
    setSelectedCandidate(null);
    setError(null);
    setProjDdOpen(false);
    setCandDdOpen(false);
    setProjSearch("");
    setCandSearch("");
  }, [open, projects]);

  const selectedProject = useMemo(() => {
    const pid = form.project_id;
    return projects.find((p) => p.id === pid) ?? null;
  }, [form.project_id, projects]);

  const filteredProjects = useMemo(() => {
    const q = projSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const lab = `prj-${p.id} ${p.account_name || p.filename || ""}`.toLowerCase();
      return lab.includes(q);
    });
  }, [projects, projSearch]);

  useEffect(() => {
    if (!open || !form.project_id || form.project_id <= 0) {
      setPoolRows([]);
      return;
    }
    setPoolLoading(true);
    queries
      .candidatesList({ project_id: form.project_id, limit: 200 })
      .then((r) => setPoolRows(r.items ?? []))
      .catch(() => setPoolRows([]))
      .finally(() => setPoolLoading(false));
  }, [open, form.project_id]);

  useEffect(() => {
    if (form.project_id && selectedCandidate && selectedCandidate.project_id !== form.project_id) {
      setSelectedCandidate(null);
    }
  }, [form.project_id, selectedCandidate]);

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

  useLayoutEffect(() => {
    if (!candDdOpen) {
      setCandDdRect(null);
      return;
    }
    const measure = () => {
      const btn = candBtnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setCandDdRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (candBtnRef.current) ro.observe(candBtnRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [candDdOpen]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (projWrapRef.current?.contains(t) || projPortalRef.current?.contains(t)) return;
      setProjDdOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (candWrapRef.current?.contains(t) || candPortalRef.current?.contains(t)) return;
      setCandDdOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const filteredCandidates = useMemo(() => {
    const q = candSearch.trim().toLowerCase();
    if (!q) return poolRows;
    return poolRows.filter((c) => {
      const blob = [c.full_name, c.client_candidate_id, c.email_id].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(q);
    });
  }, [poolRows, candSearch]);

  const resolvedCandidateName = useMemo(() => {
    if (candidateMode === "none") return OPEN_POSITION_LABEL;
    if (candidateMode === "pool" && selectedCandidate) {
      return (selectedCandidate.full_name || "").trim() || selectedCandidate.client_candidate_id || "Candidate";
    }
    return form.candidate_name.trim();
  }, [candidateMode, selectedCandidate, form.candidate_name]);

  const submit = useCallback(async () => {
    if (!projects.length) {
      setError("No project available.");
      return;
    }
    if (!form.project_id || form.project_id <= 0 || !projects.some((p) => p.id === form.project_id)) {
      setError("Select a project (Project tab).");
      setTab(0);
      return;
    }
    const pid = form.project_id;
    if (!form.position_title.trim()) {
      setError("Position title is required (Role & org tab).");
      setTab(2);
      return;
    }
    if (candidateMode === "manual" && !form.candidate_name.trim()) {
      setError("Enter a candidate name or switch to pool / no candidate.");
      setTab(1);
      return;
    }
    if (candidateMode === "pool" && !selectedCandidate) {
      setError("Select a candidate from the pool or change mode.");
      setTab(1);
      return;
    }
    const lakhs = form.offered_lakhs.trim();
    if (lakhs !== "") {
      const n = Number(lakhs);
      if (Number.isNaN(n)) {
        setError("Offered CTC (₹L) must be a number.");
        setTab(3);
        return;
      }
    }
    if (!form.source_joiner_type.trim()) {
      setError("Select a source joiner (Pipeline tab).");
      setTab(3);
      return;
    }
    let extra: Record<string, unknown>;
    try {
      const j = JSON.parse(form.additional_json);
      if (j === null || typeof j !== "object" || Array.isArray(j)) {
        throw new Error("Additional attributes must be a JSON object.");
      }
      extra = j as Record<string, unknown>;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
      setTab(3);
      return;
    }

    const body: RecordCreate = {
      project_id: pid,
      candidate_name: resolvedCandidateName,
      position_title: form.position_title.trim(),
      source_joiner_type: form.source_joiner_type.trim(),
      position_code: form.position_code.trim() || null,
      status: form.status.trim() || null,
      global_status: form.global_status.trim() || null,
      hiring_manager: form.hiring_manager.trim() || null,
      department: form.department.trim() || null,
      location: form.location.trim() || null,
      offered_ctc: lakhs === "" ? null : Number(lakhs) * 100000,
      creation_date: form.creation_date.trim() || null,
      joining_date: form.joining_date.trim() || null,
      additional_attributes: {
        ...Object.keys(extra).length ? extra : {},
        ...(candidateMode === "pool" && selectedCandidate
          ? { linked_candidate_id: selectedCandidate.id, linked_client_candidate_id: selectedCandidate.client_candidate_id }
          : {}),
        ...(candidateMode === "none" ? { candidate_pending: true } : {}),
      },
    };
    if (Object.keys(body.additional_attributes ?? {}).length === 0) {
      delete body.additional_attributes;
    }

    setCreating(true);
    setError(null);
    try {
      const created = await queries.createRecord(body);
      onCreated(created);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create requisition");
    } finally {
      setCreating(false);
    }
  }, [form, projects, candidateMode, selectedCandidate, resolvedCandidateName, onCreated, onClose]);

  const setF = <K extends keyof CreateForm>(k: K, v: CreateForm[K]) => setForm((f) => ({ ...f, [k]: v }));

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

  const propRow = (lbl: string, key: keyof CreateForm, placeholder?: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="ncp-prop-row">
      <div className="ncp-prop-label">{lbl}</div>
      <input className="ncp-prop-input" value={form[key] ?? ""} onChange={(e) => setF(key, e.target.value)} placeholder={placeholder} {...extra} />
    </div>
  );

  const projectPicker = (
    <div ref={projWrapRef} className="ncp-project-wrap" style={{ borderTop: "none" }}>
      <button
        ref={projBtnRef}
        type="button"
        className={cn("ncp-project-btn", selectedProject && "ncp-selected")}
        onClick={(e) => {
          e.stopPropagation();
          setProjDdOpen((o) => !o);
        }}
      >
        {selectedProject ? (
          <>
            <span className="ncp-project-icon" style={{ fontSize: 12 }}>
              PRJ
            </span>
            <div className="ncp-project-meta">
              <strong>{selectedProject.account_name || selectedProject.filename || `Project ${selectedProject.id}`}</strong>
              <span style={{ fontFamily: "var(--ncp-mono)", color: "var(--ncp-accent)" }}>PRJ-{selectedProject.id}</span>
            </div>
          </>
        ) : (
          <>
            <span>＋</span>
            <span>Search or select a project (PRJ-···)</span>
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
              <div className="ncp-dd-scroll" onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
                {filteredProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={cn("ncp-project-opt", p.id === form.project_id && "ncp-selected")}
                    onClick={() => {
                      setF("project_id", p.id);
                      setProjDdOpen(false);
                      setProjSearch("");
                    }}
                  >
                    <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 11, color: "var(--ncp-accent)", minWidth: 52 }}>PRJ-{p.id}</span>
                    <span>{p.account_name || p.filename || `Project ${p.id}`}</span>
                  </button>
                ))}
                {filteredProjects.length === 0 && (
                  <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ncp-text-muted)" }}>No projects match “{projSearch}”</div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );

  const candidatePoolButton = (
    <div ref={candWrapRef} className="ncp-project-wrap" style={{ borderTop: "none", marginTop: 8 }}>
      <button
        ref={candBtnRef}
        type="button"
        className={cn("ncp-project-btn", selectedCandidate && "ncp-selected")}
        onClick={(e) => {
          e.stopPropagation();
          if (!form.project_id) return;
          setCandDdOpen((o) => !o);
        }}
        disabled={!form.project_id || form.project_id <= 0}
        style={!form.project_id || form.project_id <= 0 ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
      >
        {selectedCandidate ? (
          <>
            <span className="ncp-project-icon" style={{ fontSize: 11, background: "var(--ncp-blue)" }}>
              {(selectedCandidate.full_name || selectedCandidate.client_candidate_id || "?").slice(0, 2).toUpperCase()}
            </span>
            <div className="ncp-project-meta">
              <strong>{selectedCandidate.full_name || "—"}</strong>
              <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 11, color: "var(--ncp-accent)" }}>
                {selectedCandidate.client_candidate_id}
              </span>
            </div>
          </>
        ) : (
          <>
            <span>＋</span>
            <span>{form.project_id > 0 ? "Search or select a candidate on this project" : "Select a project first"}</span>
          </>
        )}
        <span style={{ marginLeft: "auto", color: "var(--ncp-text-muted)" }}>▾</span>
      </button>
      {candDdOpen &&
        candDdRect &&
        createPortal(
          <div
            ref={candPortalRef}
            className="new-contract-sheet"
            style={{
              position: "fixed",
              top: candDdRect.top,
              left: candDdRect.left,
              width: candDdRect.width,
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
                  placeholder="Search by name, ID, email…"
                  value={candSearch}
                  onChange={(e) => setCandSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="ncp-dd-scroll" style={{ maxHeight: 280 }} onWheel={(e) => e.stopPropagation()}>
                {poolLoading && <div style={{ padding: 12, fontSize: 12, color: "var(--ncp-text-muted)" }}>Loading candidates…</div>}
                {!poolLoading &&
                  filteredCandidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={cn("ncp-project-opt", selectedCandidate?.id === c.id && "ncp-selected")}
                      onClick={() => {
                        setSelectedCandidate(c);
                        setCandDdOpen(false);
                        setCandSearch("");
                      }}
                    >
                      <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 11, color: "var(--ncp-accent)", minWidth: 72 }}>{c.client_candidate_id}</span>
                      <span>{c.full_name || "—"}</span>
                    </button>
                  ))}
                {!poolLoading && filteredCandidates.length === 0 && (
                  <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ncp-text-muted)" }}>
                    {poolRows.length === 0 ? "No candidates on this project yet." : `No matches for “${candSearch}”`}
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
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
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
                    <span>Requisitions</span>
                    <span className="ncp-breadcrumb-sep">›</span>
                    <span>New</span>
                  </div>
                  <h1 className="ncp-h1">Add requisition</h1>
                  <p className="ncp-subtitle" style={{ marginTop: 4 }}>
                    Creates a new tracker row on the selected project. Revenue is recalculated on the next logic run / upload if applicable.
                  </p>
                </div>
                <button type="button" className="ncp-close-btn" aria-label="Close" onClick={onClose}>
                  ✕
                </button>
              </div>

              {!projects.length ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--ncp-text-secondary)" }}>
                  No projects are linked. Upload a tracker first.
                </p>
              ) : (
                <>
                  <div className="ncp-steps" role="tablist" style={{ marginBottom: 18 }}>
                    {REQ_TABS.map(({ icon, label }, i) => (
                      <button
                        key={label}
                        type="button"
                        role="tab"
                        aria-selected={tab === i}
                        className={cn("ncp-step", tab === i && "ncp-active", i < tab && "ncp-done")}
                        onClick={() => setTab(i)}
                      >
                        <span
                          className="ncp-step-num"
                          style={{
                            fontSize: 14,
                            background: tab === i ? "rgba(255,255,255,0.22)" : i < tab ? "var(--ncp-green)" : "var(--ncp-border)",
                            color: i < tab && tab !== i ? "#fff" : undefined,
                          }}
                        >
                          {i < tab ? "✓" : icon}
                        </span>
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className={cn("ncp-panel", tab === 0 && "ncp-panel-active")}>
                    {section("◇", "ncp-orange", "Project & scope", "Link this requisition to a project and optional req ID.", (
                      <>
                        {projectPicker}
                        {propRow("Req ID / position code (optional)", "position_code", "e.g. REQ-97100")}
                      </>
                    ))}
                  </div>

                  <div className={cn("ncp-panel", tab === 1 && "ncp-panel-active")}>
                    {section("👤", "ncp-blue", "Candidate", "Leave empty for an open position, type a name, or pick someone already in the project pool.", (
                      <>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                          {(
                            [
                              { id: "none" as const, title: "No candidate yet", sub: "Open role" },
                              { id: "manual" as const, title: "Enter name", sub: "Free text" },
                              { id: "pool" as const, title: "From pool", sub: "Existing profile" },
                            ] as const
                          ).map(({ id, title, sub }) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => {
                                setCandidateMode(id);
                                if (id !== "pool") setSelectedCandidate(null);
                              }}
                              style={{
                                flex: "1 1 140px",
                                textAlign: "left" as const,
                                padding: "10px 12px",
                                borderRadius: "var(--ncp-radius)",
                                border: `1px solid ${candidateMode === id ? "var(--ncp-accent)" : "var(--ncp-border)"}`,
                                background: candidateMode === id ? "var(--ncp-accent-soft)" : "var(--ncp-surface)",
                                cursor: "pointer",
                                transition: "border-color 0.15s, background 0.15s",
                              }}
                            >
                              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ncp-text-primary)" }}>{title}</div>
                              <div style={{ fontSize: 11, color: "var(--ncp-text-muted)", marginTop: 2 }}>{sub}</div>
                            </button>
                          ))}
                        </div>
                        {candidateMode === "manual" && (
                          <div className="ncp-prop-row" style={{ borderTop: "none" }}>
                            <div className="ncp-prop-label">Full name</div>
                            <input
                              className="ncp-prop-input"
                              value={form.candidate_name}
                              onChange={(e) => setF("candidate_name", e.target.value)}
                              placeholder="Candidate full name"
                            />
                          </div>
                        )}
                        {candidateMode === "none" && (
                          <div
                            style={{
                              padding: "12px 14px",
                              borderRadius: "var(--ncp-radius)",
                              background: "var(--ncp-amber-soft)",
                              border: "1px solid rgba(245, 158, 11, 0.25)",
                              fontSize: 13,
                              color: "#92600a",
                              lineHeight: 1.5,
                            }}
                          >
                            The requisition will be created with candidate name “{OPEN_POSITION_LABEL}”. You can assign someone later from the tracker.
                          </div>
                        )}
                        {candidateMode === "pool" && candidatePoolButton}
                      </>
                    ))}
                  </div>

                  <div className={cn("ncp-panel", tab === 2 && "ncp-panel-active")}>
                    {section("🏢", "ncp-green", "Role & organisation", "Position title and internal routing fields.", (
                      <>
                        {propRow("Position title *", "position_title", "e.g. Senior Engineer")}
                        {propRow("Hiring manager", "hiring_manager")}
                        {propRow("Department", "department")}
                        {propRow("Location", "location")}
                      </>
                    ))}
                  </div>

                  <div className={cn("ncp-panel", tab === 3 && "ncp-panel-active")}>
                    {section("📊", "ncp-amber", "Pipeline & commercial", "Status, offer amount, dates, and extra JSON.", (
                      <>
                        {propRow("Pipeline status (text)", "status", "e.g. Open, Screening")}
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Source joiner *</div>
                          <select
                            className="ncp-prop-input"
                            value={form.source_joiner_type}
                            onChange={(e) => setF("source_joiner_type", e.target.value)}
                            required
                          >
                            <option value="">Select source…</option>
                            <optgroup label="Taggd source joiner (RPO / Direct — external)">
                              {SOURCE_JOINER_OPTIONS.filter((o) => o.group === "taggd").map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Non-Taggd source joiner">
                              {SOURCE_JOINER_OPTIONS.filter((o) => o.group === "nontaggd").map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Global status</div>
                          <select
                            className="ncp-prop-input"
                            value={form.global_status}
                            onChange={(e) => setF("global_status", e.target.value)}
                          >
                            {GLOBAL_STATUS_OPTIONS.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Offered CTC (₹ lakhs)</div>
                          <input
                            className="ncp-prop-input"
                            inputMode="decimal"
                            value={form.offered_lakhs}
                            onChange={(e) => setF("offered_lakhs", e.target.value)}
                            placeholder="Optional"
                          />
                        </div>
                        <div className="ncp-date-grid" style={{ borderTop: "1px solid var(--ncp-border)", paddingTop: 8 }}>
                          <div className="ncp-date-cell">
                            <label>Created (optional)</label>
                            <input type="date" value={form.creation_date} onChange={(e) => setF("creation_date", e.target.value)} />
                          </div>
                          <div className="ncp-date-cell">
                            <label>Joining (optional)</label>
                            <input type="date" value={form.joining_date} onChange={(e) => setF("joining_date", e.target.value)} />
                          </div>
                        </div>
                        <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
                          <div className="ncp-prop-label" style={{ paddingTop: 10 }}>
                            Additional attributes (JSON)
                          </div>
                          <textarea
                            className="ncp-prop-input"
                            value={form.additional_json}
                            onChange={(e) => setF("additional_json", e.target.value)}
                            spellCheck={false}
                            style={{ minHeight: 100, resize: "vertical", fontFamily: "var(--ncp-mono)", fontSize: 12 }}
                            placeholder="{}"
                          />
                        </div>
                      </>
                    ))}
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
                    >
                      {error}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="ncp-footer">
            <button type="button" className="ncp-btn ncp-btn-ghost" onClick={onClose} disabled={creating}>
              Cancel
            </button>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {tab > 0 && (
                <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => setTab((t) => t - 1)} disabled={creating}>
                  ← Back
                </button>
              )}
              {tab < REQ_TABS.length - 1 && (
                <button type="button" className="ncp-btn ncp-btn-secondary" onClick={() => setTab((t) => t + 1)} disabled={creating}>
                  Next →
                </button>
              )}
              <button
                type="button"
                className="ncp-btn ncp-btn-primary"
                onClick={() => void submit()}
                disabled={creating || !projects.length || !form.project_id || form.project_id <= 0}
              >
                {creating ? "Creating…" : "Create requisition ✓"}
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
