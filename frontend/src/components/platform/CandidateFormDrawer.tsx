import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  queries,
  type CandidateCreate,
  type CandidatePatch,
  type CandidateRow,
  type Project,
  type RecordRow,
} from "@/lib/api";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { UserPickerDropdown, type PlatformUserLite } from "@/components/platform/NewContractOrgFlow";
import { cn } from "@/lib/utils";
import "@/styles/new-contract-panel.css";

const CANDIDATE_TABS = [
  { icon: "◇", label: "Mandate" },
  { icon: "👤", label: "Person" },
  { icon: "📋", label: "Profile" },
  { icon: "📊", label: "Pipeline" },
  { icon: "⚙", label: "More" },
] as const;

export type CandidateFormDrawerProps = {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  candidateId: number | null;
  projects: Project[];
  /** Pre-filled project when opening create from filtered list */
  defaultProjectId?: number | null;
  onSuccess: () => void;
};

type Form = {
  project_id: string;
  record_id: string;
  client_candidate_id: string;
  full_name: string;
  contact_no: string;
  email_id: string;
  gender: string;
  current_location: string;
  qualification: string;
  specialization: string;
  total_experience_yrs: string;
  current_organization: string;
  current_designation: string;
  notice_period_days: string;
  alternate_contact_no: string;
  source_of_hire: string;
  sub_source: string;
  current_ctc_lpa: string;
  expected_ctc_lpa: string;
  resume_screening: string;
  assigned_recruiter: string;
  hiring_manager: string;
  assigned_recruiter_user_id: string;
  hiring_manager_user_id: string;
  current_stage: string;
  global_status: string;
  fingerprint: string;
  excel_row_index: string;
  offer_ctc_lpa: string;
  offer_release_date: string;
  offer_acceptance: string;
  expected_doj: string;
  actual_doj: string;
  selection_date: string;
  loi_issue_date: string;
  cb_closure_date: string;
  offer_date: string;
  offer_accepted_flag: string;
  decline_reason: string;
  joining_status: string;
  checkin_30_day: string;
  checkin_60_day: string;
  checkin_90_day: string;
  early_exit_risk: string;
  offered_gross_ctc: string;
  offered_stvs: string;
  hike_pct_offered: string;
  bgv_date: string;
  bgv_status: string;
  medical_initiation_date: string;
  candidate_staff_no: string;
  msil_staff_no: string;
  sourcer_name: string;
  taggd_pm: string;
  professional_summary: string;
  professional_experience_json: string;
  candidate_extras_json: string;
  revenue_results_json: string;
  offer_onboarding_extras_json: string;
};

function emptyForm(projectId: string): Form {
  return {
    project_id: projectId,
    record_id: "",
    client_candidate_id: "",
    full_name: "",
    contact_no: "",
    email_id: "",
    gender: "",
    current_location: "",
    qualification: "",
    specialization: "",
    total_experience_yrs: "",
    current_organization: "",
    current_designation: "",
    notice_period_days: "",
    alternate_contact_no: "",
    source_of_hire: "",
    sub_source: "",
    current_ctc_lpa: "",
    expected_ctc_lpa: "",
    resume_screening: "",
    assigned_recruiter: "",
    hiring_manager: "",
    assigned_recruiter_user_id: "",
    hiring_manager_user_id: "",
    current_stage: "",
    global_status: "",
    fingerprint: "",
    excel_row_index: "",
    offer_ctc_lpa: "",
    offer_release_date: "",
    offer_acceptance: "",
    expected_doj: "",
    actual_doj: "",
    selection_date: "",
    loi_issue_date: "",
    cb_closure_date: "",
    offer_date: "",
    offer_accepted_flag: "",
    decline_reason: "",
    joining_status: "",
    checkin_30_day: "",
    checkin_60_day: "",
    checkin_90_day: "",
    early_exit_risk: "",
    offered_gross_ctc: "",
    offered_stvs: "",
    hike_pct_offered: "",
    bgv_date: "",
    bgv_status: "",
    medical_initiation_date: "",
    candidate_staff_no: "",
    msil_staff_no: "",
    sourcer_name: "",
    taggd_pm: "",
    professional_summary: "",
    professional_experience_json: "[]",
    candidate_extras_json: "{}",
    revenue_results_json: "{}",
    offer_onboarding_extras_json: "{}",
  };
}

function s(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") return v;
  return String(v);
}

function isoish(v: unknown): string {
  if (v == null || typeof v !== "string") return "";
  return v.length >= 16 ? v.slice(0, 16) : v;
}

function candidateToForm(c: CandidateRow): Form {
  return {
    project_id: String(c.project_id),
    record_id: String(c.record_id),
    client_candidate_id: c.client_candidate_id,
    full_name: s(c.full_name),
    contact_no: s(c.contact_no),
    email_id: s(c.email_id),
    gender: s(c.gender),
    current_location: s(c.current_location),
    qualification: s(c.qualification),
    specialization: s(c.specialization),
    total_experience_yrs: s(c.total_experience_yrs),
    current_organization: s(c.current_organization),
    current_designation: s(c.current_designation),
    notice_period_days: s(c.notice_period_days),
    alternate_contact_no: s(c.alternate_contact_no),
    source_of_hire: s(c.source_of_hire),
    sub_source: s(c.sub_source),
    current_ctc_lpa: s(c.current_ctc_lpa),
    expected_ctc_lpa: s(c.expected_ctc_lpa),
    resume_screening: s(c.resume_screening),
    assigned_recruiter: s(c.assigned_recruiter),
    hiring_manager: s(c.hiring_manager),
    assigned_recruiter_user_id: s(c.assigned_recruiter_user_id),
    hiring_manager_user_id: s(c.hiring_manager_user_id),
    current_stage: s(c.current_stage),
    global_status: s(c.global_status),
    fingerprint: s(c.fingerprint),
    excel_row_index: s(c.excel_row_index),
    offer_ctc_lpa: s(c.offer_ctc_lpa),
    offer_release_date: isoish(c.offer_release_date),
    offer_acceptance: s(c.offer_acceptance),
    expected_doj: isoish(c.expected_doj),
    actual_doj: isoish(c.actual_doj),
    selection_date: isoish(c.selection_date),
    loi_issue_date: isoish(c.loi_issue_date),
    cb_closure_date: isoish(c.cb_closure_date),
    offer_date: isoish(c.offer_date),
    offer_accepted_flag: s(c.offer_accepted_flag),
    decline_reason: s(c.decline_reason),
    joining_status: s(c.joining_status),
    checkin_30_day: s(c.checkin_30_day),
    checkin_60_day: s(c.checkin_60_day),
    checkin_90_day: s(c.checkin_90_day),
    early_exit_risk: s(c.early_exit_risk),
    offered_gross_ctc: s(c.offered_gross_ctc),
    offered_stvs: s(c.offered_stvs),
    hike_pct_offered: s(c.hike_pct_offered),
    bgv_date: isoish(c.bgv_date),
    bgv_status: s(c.bgv_status),
    medical_initiation_date: isoish(c.medical_initiation_date),
    candidate_staff_no: s(c.candidate_staff_no),
    msil_staff_no: s(c.msil_staff_no),
    sourcer_name: s(c.sourcer_name),
    taggd_pm: s(c.taggd_pm),
    professional_summary: s(c.professional_summary),
    professional_experience_json: JSON.stringify(c.professional_experience_json ?? [], null, 2),
    candidate_extras_json: JSON.stringify(c.candidate_extras ?? {}, null, 2),
    revenue_results_json: JSON.stringify(c.revenue_results ?? {}, null, 2),
    offer_onboarding_extras_json: JSON.stringify(c.offer_onboarding_extras ?? {}, null, 2),
  };
}

function trimU(x: string): string | undefined {
  const t = x.trim();
  return t === "" ? undefined : t;
}

function numU(x: string): number | undefined {
  const t = x.trim();
  if (t === "") return undefined;
  const n = Number(t);
  if (Number.isNaN(n)) throw new Error(`Not a valid number: ${t}`);
  return n;
}

function intU(x: string): number | undefined {
  const t = x.trim();
  if (t === "") return undefined;
  const n = parseInt(t, 10);
  if (Number.isNaN(n)) throw new Error(`Not a valid integer: ${t}`);
  return n;
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> | undefined {
  const t = raw.trim();
  if (t === "" || t === "{}") return undefined;
  const v = JSON.parse(t) as unknown;
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return v as Record<string, unknown>;
}

function parseJsonArray(raw: string, label: string): unknown[] | undefined {
  const t = raw.trim();
  if (t === "" || t === "[]") return undefined;
  const v = JSON.parse(t) as unknown;
  if (!Array.isArray(v)) throw new Error(`${label} must be a JSON array`);
  return v;
}

function buildCreateBody(f: Form): CandidateCreate {
  const project_id = intU(f.project_id);
  const record_id = intU(f.record_id);
  if (project_id == null) throw new Error("Project is required");
  if (record_id == null) throw new Error("Requisition (record) is required");
  const client_candidate_id = f.client_candidate_id.trim();
  if (!client_candidate_id) throw new Error("Client candidate ID is required");

  let professional_experience_json: unknown[] | undefined;
  try {
    professional_experience_json = parseJsonArray(f.professional_experience_json, "Professional experience") as
      | unknown[]
      | undefined;
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }

  let candidate_extras: Record<string, unknown> | undefined;
  let revenue_results: Record<string, unknown> | undefined;
  let offer_onboarding_extras: Record<string, unknown> | undefined;
  try {
    candidate_extras = parseJsonObject(f.candidate_extras_json, "Candidate extras");
    revenue_results = parseJsonObject(f.revenue_results_json, "Revenue results");
    offer_onboarding_extras = parseJsonObject(f.offer_onboarding_extras_json, "Offer / onboarding extras");
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }

  const body: CandidateCreate = {
    project_id,
    record_id,
    client_candidate_id,
    full_name: trimU(f.full_name),
    contact_no: trimU(f.contact_no),
    email_id: trimU(f.email_id),
    gender: trimU(f.gender),
    current_location: trimU(f.current_location),
    qualification: trimU(f.qualification),
    specialization: trimU(f.specialization),
    total_experience_yrs: numU(f.total_experience_yrs),
    current_organization: trimU(f.current_organization),
    current_designation: trimU(f.current_designation),
    notice_period_days: intU(f.notice_period_days),
    alternate_contact_no: trimU(f.alternate_contact_no),
    source_of_hire: trimU(f.source_of_hire),
    sub_source: trimU(f.sub_source),
    current_ctc_lpa: numU(f.current_ctc_lpa),
    expected_ctc_lpa: numU(f.expected_ctc_lpa),
    resume_screening: trimU(f.resume_screening),
    assigned_recruiter: trimU(f.assigned_recruiter),
    hiring_manager: trimU(f.hiring_manager),
    assigned_recruiter_user_id: intU(f.assigned_recruiter_user_id),
    hiring_manager_user_id: intU(f.hiring_manager_user_id),
    current_stage: trimU(f.current_stage),
    global_status: trimU(f.global_status),
    fingerprint: trimU(f.fingerprint),
    excel_row_index: intU(f.excel_row_index),
    offer_ctc_lpa: numU(f.offer_ctc_lpa),
    offer_release_date: trimU(f.offer_release_date),
    offer_acceptance: trimU(f.offer_acceptance),
    expected_doj: trimU(f.expected_doj),
    actual_doj: trimU(f.actual_doj),
    selection_date: trimU(f.selection_date),
    loi_issue_date: trimU(f.loi_issue_date),
    cb_closure_date: trimU(f.cb_closure_date),
    offer_date: trimU(f.offer_date),
    offer_accepted_flag: trimU(f.offer_accepted_flag),
    decline_reason: trimU(f.decline_reason),
    joining_status: trimU(f.joining_status),
    checkin_30_day: trimU(f.checkin_30_day),
    checkin_60_day: trimU(f.checkin_60_day),
    checkin_90_day: trimU(f.checkin_90_day),
    early_exit_risk: trimU(f.early_exit_risk),
    offered_gross_ctc: numU(f.offered_gross_ctc),
    offered_stvs: numU(f.offered_stvs),
    hike_pct_offered: numU(f.hike_pct_offered),
    bgv_date: trimU(f.bgv_date),
    bgv_status: trimU(f.bgv_status),
    medical_initiation_date: trimU(f.medical_initiation_date),
    candidate_staff_no: trimU(f.candidate_staff_no),
    msil_staff_no: trimU(f.msil_staff_no),
    sourcer_name: trimU(f.sourcer_name),
    taggd_pm: trimU(f.taggd_pm),
    professional_summary: trimU(f.professional_summary),
    professional_experience_json: professional_experience_json as CandidateCreate["professional_experience_json"],
    candidate_extras,
    revenue_results,
    offer_onboarding_extras,
  };
  return body;
}

function buildPatchBody(f: Form): CandidatePatch {
  const b = buildCreateBody(f);
  const { project_id: _p, client_candidate_id: _c, ...rest } = b;
  return rest as CandidatePatch;
}

/** Apply server-side resume parse into form state (does not change project / mandate fields). */
function mergeResumeFieldsIntoForm(prev: Form, fields: Record<string, unknown>): Form {
  const next: Form = { ...prev };
  const putStr = (key: keyof Form, v: unknown) => {
    if (typeof v === "string" && v.trim()) (next as Record<string, string>)[key] = v.trim();
  };
  const putNumStr = (key: keyof Form, v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) (next as Record<string, string>)[key] = String(v);
    else if (typeof v === "string" && v.trim()) (next as Record<string, string>)[key] = v.trim();
  };
  putStr("full_name", fields.full_name);
  putStr("email_id", fields.email_id);
  putStr("contact_no", fields.contact_no);
  putStr("alternate_contact_no", fields.alternate_contact_no);
  putStr("current_location", fields.current_location);
  putStr("gender", fields.gender);
  putStr("qualification", fields.qualification);
  putStr("specialization", fields.specialization);
  putNumStr("total_experience_yrs", fields.total_experience_yrs);
  putStr("current_organization", fields.current_organization);
  putStr("current_designation", fields.current_designation);
  putNumStr("notice_period_days", fields.notice_period_days);
  putNumStr("current_ctc_lpa", fields.current_ctc_lpa);
  putNumStr("expected_ctc_lpa", fields.expected_ctc_lpa);
  putStr("professional_summary", fields.professional_summary);
  if (Array.isArray(fields.professional_experience_json)) {
    try {
      next.professional_experience_json = JSON.stringify(fields.professional_experience_json, null, 2);
    } catch {
      /* ignore */
    }
  }
  return next;
}

export function CandidateFormDrawer({
  open,
  onClose,
  mode,
  candidateId,
  projects,
  defaultProjectId,
  onSuccess,
}: CandidateFormDrawerProps) {
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<Form>(() => emptyForm(""));
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [loadingCandidate, setLoadingCandidate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assignableUsers, setAssignableUsers] = useState<PlatformUserLite[]>([]);

  const [projDdOpen, setProjDdOpen] = useState(false);
  const [projSearch, setProjSearch] = useState("");
  const [projDdRect, setProjDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const projWrapRef = useRef<HTMLDivElement>(null);
  const projBtnRef = useRef<HTMLButtonElement>(null);
  const projPortalRef = useRef<HTMLDivElement>(null);
  const cvFileRef = useRef<HTMLInputElement>(null);
  const [pendingCvFile, setPendingCvFile] = useState<File | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeHint, setResumeHint] = useState<string | null>(null);

  const loadRecords = useCallback(async (pid: number) => {
    setLoadingRecords(true);
    try {
      const list = await queries.projectRecords(pid);
      setRecords(Array.isArray(list) ? list : []);
    } catch {
      setRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTab(0);
    setProjDdOpen(false);
    setProjSearch("");
    setPendingCvFile(null);
    setResumeHint(null);
    setResumeBusy(false);
    if (mode === "create") {
      const dp =
        defaultProjectId != null && projects.some((p) => p.id === defaultProjectId) ? String(defaultProjectId) : "";
      setForm(emptyForm(dp));
      if (dp) void loadRecords(Number(dp));
      else setRecords([]);
      return;
    }
    if (mode === "edit" && candidateId != null) {
      setLoadingCandidate(true);
      void queries
        .candidate(candidateId)
        .then((c) => {
          setForm(candidateToForm(c));
          void loadRecords(c.project_id);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load candidate"))
        .finally(() => setLoadingCandidate(false));
    }
  }, [open, mode, candidateId, projects, defaultProjectId, loadRecords]);

  useEffect(() => {
    if (!open) return;
    const pid = parseInt(form.project_id, 10);
    if (!Number.isFinite(pid) || pid <= 0) {
      setAssignableUsers([]);
      return;
    }
    let cancelled = false;
    void queries
      .taskAssignableUsers({ project_id: pid })
      .then((list) => {
        if (!cancelled) setAssignableUsers(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setAssignableUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, form.project_id]);

  const selectedProject = useMemo(() => {
    const t = form.project_id.trim();
    if (!t) return null;
    const pid = parseInt(t, 10);
    if (!Number.isFinite(pid)) return null;
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
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (projWrapRef.current?.contains(t) || projPortalRef.current?.contains(t)) return;
      setProjDdOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const onProjectChange = (pid: string) => {
    setForm((f) => ({
      ...f,
      project_id: pid,
      record_id: "",
      assigned_recruiter_user_id: "",
      assigned_recruiter: "",
      hiring_manager_user_id: "",
      hiring_manager: "",
    }));
    if (pid) void loadRecords(Number(pid));
    else setRecords([]);
  };

  const submit = useCallback(async () => {
    setError(null);
    setSaving(true);
    try {
      if (mode === "create") {
        const body = buildCreateBody(form);
        const created = await queries.createCandidate(body);
        if (pendingCvFile) {
          await queries.candidateUploadCv(created.id, pendingCvFile);
        }
      } else {
        if (candidateId == null) throw new Error("Missing candidate");
        const body = buildPatchBody(form);
        await queries.patchCandidate(candidateId, body);
        if (pendingCvFile) {
          await queries.candidateUploadCv(candidateId, pendingCvFile);
        }
      }
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [mode, form, candidateId, onSuccess, onClose, pendingCvFile]);

  const setF = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const title = mode === "create" ? "Add candidate" : `Edit candidate #${candidateId ?? ""}`;
  const subtitle =
    mode === "create"
      ? "Creates a pipeline row on the selected project and requisition. Client candidate ID must be unique per project."
      : "Update mandate-level fields. Project and client candidate ID cannot be changed here.";

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

  const projectPicker = (
    <div ref={projWrapRef} className="ncp-project-wrap" style={{ borderTop: "none" }}>
      <button
        ref={projBtnRef}
        type="button"
        className={cn("ncp-project-btn", selectedProject && "ncp-selected")}
        disabled={mode === "edit"}
        style={mode === "edit" ? { opacity: 0.92, cursor: "default" } : undefined}
        onClick={(e) => {
          e.stopPropagation();
          if (mode === "edit") return;
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
      {mode === "create" &&
        projDdOpen &&
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
                    className={cn("ncp-project-opt", String(p.id) === form.project_id && "ncp-selected")}
                    onClick={() => {
                      onProjectChange(String(p.id));
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

  const canSave = projects.length > 0 && !loadingCandidate;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          "flex h-full max-h-[100dvh] flex-col gap-0 border-l p-0",
          "data-[side=right]:w-full data-[side=right]:max-w-[calc(100vw-1rem)]",
          "sm:data-[side=right]:w-[min(calc(100vw-2rem),56rem)] sm:data-[side=right]:max-w-[min(calc(100vw-2rem),56rem)]",
          "bg-[#f7f6f3] shadow-xl",
        )}
      >
        <div className="new-contract-sheet flex min-h-0 flex-1 flex-col">
          <div className="ncp-scroll min-h-0 flex-1">
            <div className="ncp-page">
              <div className="ncp-header">
                <div style={{ minWidth: 0 }}>
                  <div className="ncp-breadcrumb">
                    <span>Candidates</span>
                    <span className="ncp-breadcrumb-sep">›</span>
                    <span>{mode === "create" ? "New" : `CAN-${candidateId ?? "—"}`}</span>
                  </div>
                  <h1 className="ncp-h1">{title}</h1>
                  <p className="ncp-subtitle" style={{ marginTop: 4 }}>
                    {subtitle}
                  </p>
                </div>
                <button type="button" className="ncp-close-btn" aria-label="Close" onClick={onClose}>
                  ✕
                </button>
              </div>

              {projects.length > 0 && !loadingCandidate ? (
                <div className="ncp-section" style={{ marginBottom: 14 }}>
                  <div className="ncp-section-header" style={{ cursor: "default" }}>
                    <div className={cn("ncp-section-icon", "ncp-blue")}>📄</div>
                    <div>
                      <div className="ncp-section-label">Resume / CV</div>
                      <div className="ncp-section-desc">
                        Upload PDF or Word. We extract text to autofill Person, Role &amp; compensation, and Profile (including
                        experience JSON). The same file is stored on the candidate when you save.
                      </div>
                    </div>
                  </div>
                  <div className="ncp-section-body" style={{ maxHeight: "none" }}>
                    <input
                      ref={cvFileRef}
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        setPendingCvFile(f);
                        setResumeHint(null);
                        setResumeBusy(true);
                        void queries
                          .parseResumePreview(f)
                          .then((res) => {
                            if (res.fields && typeof res.fields === "object") {
                              setForm((prev) => mergeResumeFieldsIntoForm(prev, res.fields as Record<string, unknown>));
                            }
                            setResumeHint(`Parsed “${f.name}”. Review every tab before saving.`);
                          })
                          .catch((err) => {
                            setResumeHint(
                              `${err instanceof Error ? err.message : "Could not parse resume"}. The file will still be attached when you save.`,
                            );
                          })
                          .finally(() => setResumeBusy(false));
                      }}
                    />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                      <button
                        type="button"
                        className="ncp-btn ncp-btn-secondary"
                        disabled={resumeBusy}
                        onClick={() => cvFileRef.current?.click()}
                      >
                        {resumeBusy ? "Reading…" : pendingCvFile ? "Replace CV & re-parse" : "Upload resume / CV"}
                      </button>
                      {pendingCvFile ? (
                        <span style={{ fontSize: 12, color: "var(--ncp-text-secondary)" }}>
                          {pendingCvFile.name}
                          {pendingCvFile.size > 0 ? ` (${Math.round(pendingCvFile.size / 1024)} KB)` : ""}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="ncp-btn ncp-btn-ghost"
                        style={{ fontSize: 12 }}
                        disabled={!pendingCvFile}
                        onClick={() => {
                          setPendingCvFile(null);
                          setResumeHint(null);
                        }}
                      >
                        Clear file
                      </button>
                    </div>
                    {resumeHint ? (
                      <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--ncp-text-secondary)", lineHeight: 1.45 }}>
                        {resumeHint}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {!projects.length ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--ncp-text-secondary)" }}>No projects available.</p>
              ) : loadingCandidate ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--ncp-text-secondary)" }}>Loading candidate…</p>
              ) : (
                <>
                  <div className="ncp-steps" role="tablist" style={{ marginBottom: 18 }}>
                    {CANDIDATE_TABS.map(({ icon, label }, i) => (
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
                    {section("◇", "ncp-orange", "Project & mandate", "Choose the project, requisition row, and a unique client candidate ID.", (
                      <>
                        {projectPicker}
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Requisition (record) *</div>
                          <select
                            className="ncp-prop-input"
                            value={form.record_id}
                            onChange={(e) => setF("record_id", e.target.value)}
                            disabled={!form.project_id || loadingRecords}
                          >
                            <option value="">{loadingRecords ? "Loading…" : "Select mandate row"}</option>
                            {records.map((r) => (
                              <option key={r.id} value={String(r.id)}>
                                REQ-{r.id} — {r.position_title || "Position"}
                                {r.candidate_name ? ` (${r.candidate_name})` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Client candidate ID *</div>
                          <input
                            className="ncp-prop-input"
                            value={form.client_candidate_id}
                            onChange={(e) => setF("client_candidate_id", e.target.value)}
                            disabled={mode === "edit"}
                            placeholder="Unique per project, e.g. CLI-001"
                          />
                        </div>
                      </>
                    ))}
                  </div>

                  <div className={cn("ncp-panel", tab === 1 && "ncp-panel-active")}>
                    {section("👤", "ncp-blue", "Identity & contact", "Basics used for search and comms.", (
                      <>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Full name</div>
                          <input className="ncp-prop-input" value={form.full_name} onChange={(e) => setF("full_name", e.target.value)} />
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Email</div>
                          <input
                            className="ncp-prop-input"
                            type="email"
                            value={form.email_id}
                            onChange={(e) => setF("email_id", e.target.value)}
                          />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                          <div className="ncp-prop-row" style={{ gridColumn: "span 1" }}>
                            <div className="ncp-prop-label">Phone</div>
                            <input className="ncp-prop-input" value={form.contact_no} onChange={(e) => setF("contact_no", e.target.value)} />
                          </div>
                          <div className="ncp-prop-row" style={{ gridColumn: "span 1" }}>
                            <div className="ncp-prop-label">Alt. phone</div>
                            <input
                              className="ncp-prop-input"
                              value={form.alternate_contact_no}
                              onChange={(e) => setF("alternate_contact_no", e.target.value)}
                            />
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Gender</div>
                            <input className="ncp-prop-input" value={form.gender} onChange={(e) => setF("gender", e.target.value)} />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Location</div>
                            <input
                              className="ncp-prop-input"
                              value={form.current_location}
                              onChange={(e) => setF("current_location", e.target.value)}
                            />
                          </div>
                        </div>
                      </>
                    ))}
                    {section("🏢", "ncp-green", "Role & compensation", "Current role, notice, and pay bands (₹ lakhs).", (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Current organization</div>
                            <input
                              className="ncp-prop-input"
                              value={form.current_organization}
                              onChange={(e) => setF("current_organization", e.target.value)}
                            />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Current designation</div>
                            <input
                              className="ncp-prop-input"
                              value={form.current_designation}
                              onChange={(e) => setF("current_designation", e.target.value)}
                            />
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 12px" }}>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Total exp. (yrs)</div>
                            <input
                              className="ncp-prop-input"
                              inputMode="decimal"
                              value={form.total_experience_yrs}
                              onChange={(e) => setF("total_experience_yrs", e.target.value)}
                            />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Notice (days)</div>
                            <input
                              className="ncp-prop-input"
                              inputMode="numeric"
                              value={form.notice_period_days}
                              onChange={(e) => setF("notice_period_days", e.target.value)}
                            />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Current CTC (₹L)</div>
                            <input
                              className="ncp-prop-input"
                              inputMode="decimal"
                              value={form.current_ctc_lpa}
                              onChange={(e) => setF("current_ctc_lpa", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Expected CTC (₹L)</div>
                          <input
                            className="ncp-prop-input"
                            inputMode="decimal"
                            value={form.expected_ctc_lpa}
                            onChange={(e) => setF("expected_ctc_lpa", e.target.value)}
                          />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Qualification</div>
                            <input className="ncp-prop-input" value={form.qualification} onChange={(e) => setF("qualification", e.target.value)} />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Specialization</div>
                            <input
                              className="ncp-prop-input"
                              value={form.specialization}
                              onChange={(e) => setF("specialization", e.target.value)}
                            />
                          </div>
                        </div>
                      </>
                    ))}
                  </div>

                  <div className={cn("ncp-panel", tab === 2 && "ncp-panel-active")}>
                    {section("📋", "ncp-amber", "Professional narrative", "Summary and structured experience JSON.", (
                      <>
                        <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
                          <div className="ncp-prop-label" style={{ paddingTop: 10 }}>
                            Professional summary
                          </div>
                          <textarea
                            className="ncp-prop-input"
                            value={form.professional_summary}
                            onChange={(e) => setF("professional_summary", e.target.value)}
                            placeholder="Narrative / headline profile"
                            style={{ minHeight: 88, resize: "vertical" }}
                          />
                        </div>
                        <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
                          <div className="ncp-prop-label" style={{ paddingTop: 10 }}>
                            Experience (JSON array)
                          </div>
                          <textarea
                            className="ncp-prop-input"
                            value={form.professional_experience_json}
                            onChange={(e) => setF("professional_experience_json", e.target.value)}
                            spellCheck={false}
                            placeholder='e.g. [{"company":"…","title":"…","start_date":"2020-01"}]'
                            style={{ minHeight: 120, resize: "vertical", fontFamily: "var(--ncp-mono)", fontSize: 12 }}
                          />
                        </div>
                      </>
                    ))}
                    {section(
                      "👥",
                      "ncp-blue",
                      "Assignment & sourcing",
                      "Choose recruiter and hiring manager from users assigned to this project. Emails are stored for legacy display; user IDs drive access and reporting.",
                      <>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Assigned recruiter</div>
                          <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
                            <UserPickerDropdown
                              value={form.assigned_recruiter_user_id}
                              onChange={(v) => {
                                const u = assignableUsers.find((x) => String(x.id) === v);
                                setForm((f) => ({
                                  ...f,
                                  assigned_recruiter_user_id: v,
                                  assigned_recruiter: v === "" ? "" : u ? u.email : f.assigned_recruiter,
                                }));
                              }}
                              users={assignableUsers}
                              placeholder={form.project_id.trim() ? "— None / not assigned —" : "Select a project first"}
                            />
                          </div>
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Hiring manager</div>
                          <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
                            <UserPickerDropdown
                              value={form.hiring_manager_user_id}
                              onChange={(v) => {
                                const u = assignableUsers.find((x) => String(x.id) === v);
                                setForm((f) => ({
                                  ...f,
                                  hiring_manager_user_id: v,
                                  hiring_manager: v === "" ? "" : u ? u.email : f.hiring_manager,
                                }));
                              }}
                              users={assignableUsers}
                              placeholder={form.project_id.trim() ? "— None / not assigned —" : "Select a project first"}
                            />
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Source of hire</div>
                            <input className="ncp-prop-input" value={form.source_of_hire} onChange={(e) => setF("source_of_hire", e.target.value)} />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Sub-source</div>
                            <input className="ncp-prop-input" value={form.sub_source} onChange={(e) => setF("sub_source", e.target.value)} />
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className={cn("ncp-panel", tab === 3 && "ncp-panel-active")}>
                    {section("📊", "ncp-orange", "Pipeline & screening", "Stage, status, and screening notes.", (
                      <>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Current stage</div>
                          <input className="ncp-prop-input" value={form.current_stage} onChange={(e) => setF("current_stage", e.target.value)} />
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Global status</div>
                          <input className="ncp-prop-input" value={form.global_status} onChange={(e) => setF("global_status", e.target.value)} />
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Resume screening</div>
                          <input
                            className="ncp-prop-input"
                            value={form.resume_screening}
                            onChange={(e) => setF("resume_screening", e.target.value)}
                          />
                        </div>
                      </>
                    ))}
                    {section("💼", "ncp-green", "Offer & compensation", "Offer amounts and commercial follow-ups.", (
                      <>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Offer CTC (₹L)</div>
                          <input
                            className="ncp-prop-input"
                            inputMode="decimal"
                            value={form.offer_ctc_lpa}
                            onChange={(e) => setF("offer_ctc_lpa", e.target.value)}
                          />
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Offer acceptance</div>
                          <input
                            className="ncp-prop-input"
                            value={form.offer_acceptance}
                            onChange={(e) => setF("offer_acceptance", e.target.value)}
                          />
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Offer accepted flag</div>
                          <input
                            className="ncp-prop-input"
                            value={form.offer_accepted_flag}
                            onChange={(e) => setF("offer_accepted_flag", e.target.value)}
                          />
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Decline reason</div>
                          <input className="ncp-prop-input" value={form.decline_reason} onChange={(e) => setF("decline_reason", e.target.value)} />
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Joining status</div>
                          <input className="ncp-prop-input" value={form.joining_status} onChange={(e) => setF("joining_status", e.target.value)} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 12px" }}>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Offered gross CTC</div>
                            <input
                              className="ncp-prop-input"
                              inputMode="decimal"
                              value={form.offered_gross_ctc}
                              onChange={(e) => setF("offered_gross_ctc", e.target.value)}
                            />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Offered STVs</div>
                            <input
                              className="ncp-prop-input"
                              inputMode="decimal"
                              value={form.offered_stvs}
                              onChange={(e) => setF("offered_stvs", e.target.value)}
                            />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Hike % offered</div>
                            <input
                              className="ncp-prop-input"
                              inputMode="decimal"
                              value={form.hike_pct_offered}
                              onChange={(e) => setF("hike_pct_offered", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Early exit risk</div>
                          <input className="ncp-prop-input" value={form.early_exit_risk} onChange={(e) => setF("early_exit_risk", e.target.value)} />
                        </div>
                      </>
                    ))}
                    {section("📅", "ncp-amber", "Dates & milestones", "Datetime fields for offer cycle and joining.", (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Offer release</div>
                            <input
                              className="ncp-prop-input"
                              type="datetime-local"
                              value={form.offer_release_date}
                              onChange={(e) => setF("offer_release_date", e.target.value)}
                            />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Expected DOJ</div>
                            <input
                              className="ncp-prop-input"
                              type="datetime-local"
                              value={form.expected_doj}
                              onChange={(e) => setF("expected_doj", e.target.value)}
                            />
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Actual DOJ</div>
                            <input
                              className="ncp-prop-input"
                              type="datetime-local"
                              value={form.actual_doj}
                              onChange={(e) => setF("actual_doj", e.target.value)}
                            />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Selection date</div>
                            <input
                              className="ncp-prop-input"
                              type="datetime-local"
                              value={form.selection_date}
                              onChange={(e) => setF("selection_date", e.target.value)}
                            />
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">LOI issue</div>
                            <input
                              className="ncp-prop-input"
                              type="datetime-local"
                              value={form.loi_issue_date}
                              onChange={(e) => setF("loi_issue_date", e.target.value)}
                            />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">CB closure</div>
                            <input
                              className="ncp-prop-input"
                              type="datetime-local"
                              value={form.cb_closure_date}
                              onChange={(e) => setF("cb_closure_date", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Offer date</div>
                          <input
                            className="ncp-prop-input"
                            type="datetime-local"
                            value={form.offer_date}
                            onChange={(e) => setF("offer_date", e.target.value)}
                          />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 12px" }}>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Check-in 30d</div>
                            <input className="ncp-prop-input" value={form.checkin_30_day} onChange={(e) => setF("checkin_30_day", e.target.value)} />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Check-in 60d</div>
                            <input className="ncp-prop-input" value={form.checkin_60_day} onChange={(e) => setF("checkin_60_day", e.target.value)} />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Check-in 90d</div>
                            <input className="ncp-prop-input" value={form.checkin_90_day} onChange={(e) => setF("checkin_90_day", e.target.value)} />
                          </div>
                        </div>
                      </>
                    ))}
                  </div>

                  <div className={cn("ncp-panel", tab === 4 && "ncp-panel-active")}>
                    {section("🛡", "ncp-blue", "BGV & medical", "Compliance checkpoints.", (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">BGV date</div>
                            <input
                              className="ncp-prop-input"
                              type="datetime-local"
                              value={form.bgv_date}
                              onChange={(e) => setF("bgv_date", e.target.value)}
                            />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">BGV status</div>
                            <input className="ncp-prop-input" value={form.bgv_status} onChange={(e) => setF("bgv_status", e.target.value)} />
                          </div>
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Medical initiation</div>
                          <input
                            className="ncp-prop-input"
                            type="datetime-local"
                            value={form.medical_initiation_date}
                            onChange={(e) => setF("medical_initiation_date", e.target.value)}
                          />
                        </div>
                      </>
                    ))}
                    {section("🏷", "ncp-green", "IDs & tracking", "Internal references and upload metadata.", (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Candidate staff no.</div>
                            <input
                              className="ncp-prop-input"
                              value={form.candidate_staff_no}
                              onChange={(e) => setF("candidate_staff_no", e.target.value)}
                            />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">MSIL staff no.</div>
                            <input className="ncp-prop-input" value={form.msil_staff_no} onChange={(e) => setF("msil_staff_no", e.target.value)} />
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Sourcer</div>
                            <input className="ncp-prop-input" value={form.sourcer_name} onChange={(e) => setF("sourcer_name", e.target.value)} />
                          </div>
                          <div className="ncp-prop-row">
                            <div className="ncp-prop-label">Taggd PM</div>
                            <input className="ncp-prop-input" value={form.taggd_pm} onChange={(e) => setF("taggd_pm", e.target.value)} />
                          </div>
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Fingerprint</div>
                          <input className="ncp-prop-input" value={form.fingerprint} onChange={(e) => setF("fingerprint", e.target.value)} />
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Excel row index</div>
                          <input
                            className="ncp-prop-input"
                            inputMode="numeric"
                            value={form.excel_row_index}
                            onChange={(e) => setF("excel_row_index", e.target.value)}
                          />
                        </div>
                      </>
                    ))}
                    {section("🧩", "ncp-amber", "Advanced JSON", "Optional structured payloads for integrations.", (
                      <>
                        <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
                          <div className="ncp-prop-label" style={{ paddingTop: 10 }}>
                            candidate_extras
                          </div>
                          <textarea
                            className="ncp-prop-input"
                            value={form.candidate_extras_json}
                            onChange={(e) => setF("candidate_extras_json", e.target.value)}
                            spellCheck={false}
                            style={{ minHeight: 72, fontFamily: "var(--ncp-mono)", fontSize: 12 }}
                          />
                        </div>
                        <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
                          <div className="ncp-prop-label" style={{ paddingTop: 10 }}>
                            revenue_results
                          </div>
                          <textarea
                            className="ncp-prop-input"
                            value={form.revenue_results_json}
                            onChange={(e) => setF("revenue_results_json", e.target.value)}
                            spellCheck={false}
                            style={{ minHeight: 72, fontFamily: "var(--ncp-mono)", fontSize: 12 }}
                          />
                        </div>
                        <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
                          <div className="ncp-prop-label" style={{ paddingTop: 10 }}>
                            offer_onboarding_extras
                          </div>
                          <textarea
                            className="ncp-prop-input"
                            value={form.offer_onboarding_extras_json}
                            onChange={(e) => setF("offer_onboarding_extras_json", e.target.value)}
                            spellCheck={false}
                            style={{ minHeight: 72, fontFamily: "var(--ncp-mono)", fontSize: 12 }}
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
            <button type="button" className="ncp-btn ncp-btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {tab > 0 && (
                <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => setTab((t) => t - 1)} disabled={saving}>
                  ← Back
                </button>
              )}
              {tab < CANDIDATE_TABS.length - 1 && (
                <button type="button" className="ncp-btn ncp-btn-secondary" onClick={() => setTab((t) => t + 1)} disabled={saving}>
                  Next →
                </button>
              )}
              <button
                type="button"
                className="ncp-btn ncp-btn-primary"
                onClick={() => void submit()}
                disabled={saving || !canSave}
              >
                {saving ? "Saving…" : mode === "create" ? "Create candidate ✓" : "Save changes ✓"}
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
