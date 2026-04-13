import React, { useCallback, useEffect, useState } from "react";
import {
  queries,
  type CandidateCreate,
  type CandidatePatch,
  type CandidateRow,
  type Project,
  type RecordRow,
} from "@/lib/api";
import { PlatformDrawer } from "@/components/platform/PlatformDrawer";

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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="req-drawer-field-label">{label}</label>
      {children}
    </div>
  );
}

const inp = { width: "100%", boxSizing: "border-box" as const };

export function CandidateFormDrawer({
  open,
  onClose,
  mode,
  candidateId,
  projects,
  defaultProjectId,
  onSuccess,
}: CandidateFormDrawerProps) {
  const firstPid = projects[0]?.id != null ? String(projects[0].id) : "";
  const [form, setForm] = useState<Form>(() => emptyForm(firstPid));
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [loadingCandidate, setLoadingCandidate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (mode === "create") {
      const dp =
        defaultProjectId != null && projects.some((p) => p.id === defaultProjectId)
          ? String(defaultProjectId)
          : firstPid;
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
  }, [open, mode, candidateId, projects, defaultProjectId, firstPid, loadRecords]);

  const onProjectChange = (pid: string) => {
    setForm((f) => ({ ...f, project_id: pid, record_id: "" }));
    if (pid) void loadRecords(Number(pid));
    else setRecords([]);
  };

  const submit = useCallback(async () => {
    setError(null);
    setSaving(true);
    try {
      if (mode === "create") {
        const body = buildCreateBody(form);
        await queries.createCandidate(body);
      } else {
        if (candidateId == null) throw new Error("Missing candidate");
        const body = buildPatchBody(form);
        await queries.patchCandidate(candidateId, body);
      }
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [mode, form, candidateId, onSuccess, onClose]);

  const title = mode === "create" ? "Add candidate" : `Edit candidate #${candidateId ?? ""}`;
  const subtitle =
    mode === "create"
      ? "Creates a pipeline row on the selected project and requisition. Client candidate ID must be unique per project."
      : "Update mandate-level fields. Project and client candidate ID cannot be changed here.";

  return (
    <PlatformDrawer
      open={open}
      className="platform-drawer--req platform-drawer--req-edit"
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      width={Math.min(560, typeof window !== "undefined" ? window.innerWidth - 24 : 560)}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {error ? <div style={{ fontSize: 12, color: "var(--red)", lineHeight: 1.4 }}>{error}</div> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="req-drawer-btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="req-drawer-btn-primary"
              onClick={() => void submit()}
              disabled={saving || loadingCandidate || !projects.length}
            >
              {saving ? "Saving…" : mode === "create" ? "Create candidate" : "Save changes"}
            </button>
          </div>
        </div>
      }
    >
      <div className="req-drawer req-drawer-form-grid">
        {!projects.length ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>No projects available.</p>
        ) : loadingCandidate ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Loading candidate…</p>
        ) : (
          <>
            <Row label="Project *">
              <select
                className="platform-search"
                value={form.project_id}
                onChange={(e) => onProjectChange(e.target.value)}
                disabled={mode === "edit"}
                style={inp}
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    PRJ-{p.id} {p.account_name || p.filename || ""}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Requisition (record) *">
              <select
                className="platform-search"
                value={form.record_id}
                onChange={(e) => setForm((f) => ({ ...f, record_id: e.target.value }))}
                disabled={!form.project_id || loadingRecords}
                style={inp}
              >
                <option value="">{loadingRecords ? "Loading…" : "Select mandate row"}</option>
                {records.map((r) => (
                  <option key={r.id} value={r.id}>
                    REQ-{r.id} — {r.position_title || "Position"}{r.candidate_name ? ` (${r.candidate_name})` : ""}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Client candidate ID *">
              <input
                className="platform-search"
                value={form.client_candidate_id}
                onChange={(e) => setForm((f) => ({ ...f, client_candidate_id: e.target.value }))}
                disabled={mode === "edit"}
                style={inp}
                placeholder="Unique per project, e.g. CLI-001"
              />
            </Row>

            <h4 className="req-drawer-section-title" style={{ margin: "12px 0 4px", fontSize: 12, opacity: 0.85 }}>
              Identity & contact
            </h4>
            <Row label="Full name">
              <input
                className="platform-search"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                style={inp}
              />
            </Row>
            <Row label="Email">
              <input
                className="platform-search"
                type="email"
                value={form.email_id}
                onChange={(e) => setForm((f) => ({ ...f, email_id: e.target.value }))}
                style={inp}
              />
            </Row>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Row label="Phone">
                <input
                  className="platform-search"
                  value={form.contact_no}
                  onChange={(e) => setForm((f) => ({ ...f, contact_no: e.target.value }))}
                  style={inp}
                />
              </Row>
              <Row label="Alt. phone">
                <input
                  className="platform-search"
                  value={form.alternate_contact_no}
                  onChange={(e) => setForm((f) => ({ ...f, alternate_contact_no: e.target.value }))}
                  style={inp}
                />
              </Row>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Row label="Gender">
                <input
                  className="platform-search"
                  value={form.gender}
                  onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                  style={inp}
                />
              </Row>
              <Row label="Location">
                <input
                  className="platform-search"
                  value={form.current_location}
                  onChange={(e) => setForm((f) => ({ ...f, current_location: e.target.value }))}
                  style={inp}
                />
              </Row>
            </div>

            <h4 className="req-drawer-section-title" style={{ margin: "12px 0 4px", fontSize: 12, opacity: 0.85 }}>
              Role & compensation
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Row label="Current organization">
                <input
                  className="platform-search"
                  value={form.current_organization}
                  onChange={(e) => setForm((f) => ({ ...f, current_organization: e.target.value }))}
                  style={inp}
                />
              </Row>
              <Row label="Current designation">
                <input
                  className="platform-search"
                  value={form.current_designation}
                  onChange={(e) => setForm((f) => ({ ...f, current_designation: e.target.value }))}
                  style={inp}
                />
              </Row>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Row label="Total exp. (yrs)">
                <input
                  className="platform-search"
                  inputMode="decimal"
                  value={form.total_experience_yrs}
                  onChange={(e) => setForm((f) => ({ ...f, total_experience_yrs: e.target.value }))}
                  style={inp}
                />
              </Row>
              <Row label="Notice (days)">
                <input
                  className="platform-search"
                  inputMode="numeric"
                  value={form.notice_period_days}
                  onChange={(e) => setForm((f) => ({ ...f, notice_period_days: e.target.value }))}
                  style={inp}
                />
              </Row>
              <Row label="Current CTC (₹L)">
                <input
                  className="platform-search"
                  inputMode="decimal"
                  value={form.current_ctc_lpa}
                  onChange={(e) => setForm((f) => ({ ...f, current_ctc_lpa: e.target.value }))}
                  style={inp}
                />
              </Row>
            </div>
            <Row label="Expected CTC (₹L)">
              <input
                className="platform-search"
                inputMode="decimal"
                value={form.expected_ctc_lpa}
                onChange={(e) => setForm((f) => ({ ...f, expected_ctc_lpa: e.target.value }))}
                style={inp}
              />
            </Row>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Row label="Qualification">
                <input
                  className="platform-search"
                  value={form.qualification}
                  onChange={(e) => setForm((f) => ({ ...f, qualification: e.target.value }))}
                  style={inp}
                />
              </Row>
              <Row label="Specialization">
                <input
                  className="platform-search"
                  value={form.specialization}
                  onChange={(e) => setForm((f) => ({ ...f, specialization: e.target.value }))}
                  style={inp}
                />
              </Row>
            </div>

            <h4 className="req-drawer-section-title" style={{ margin: "12px 0 4px", fontSize: 12, opacity: 0.85 }}>
              Professional profile
            </h4>
            <Row label="Professional summary">
              <textarea
                className="platform-search"
                value={form.professional_summary}
                onChange={(e) => setForm((f) => ({ ...f, professional_summary: e.target.value }))}
                style={{ ...inp, minHeight: 88, resize: "vertical" }}
                placeholder="Narrative / headline profile"
              />
            </Row>
            <Row label='Experience (JSON array, e.g. [{"company":"…","title":"…","start_date":"2020-01"}])'>
              <textarea
                className="platform-search"
                value={form.professional_experience_json}
                onChange={(e) => setForm((f) => ({ ...f, professional_experience_json: e.target.value }))}
                style={{ ...inp, minHeight: 120, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: 11 }}
              />
            </Row>

            <h4 className="req-drawer-section-title" style={{ margin: "12px 0 4px", fontSize: 12, opacity: 0.85 }}>
              Assignment
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Row label="Assigned recruiter (text)">
                <input
                  className="platform-search"
                  value={form.assigned_recruiter}
                  onChange={(e) => setForm((f) => ({ ...f, assigned_recruiter: e.target.value }))}
                  style={inp}
                />
              </Row>
              <Row label="Hiring manager (text)">
                <input
                  className="platform-search"
                  value={form.hiring_manager}
                  onChange={(e) => setForm((f) => ({ ...f, hiring_manager: e.target.value }))}
                  style={inp}
                />
              </Row>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Row label="Recruiter user ID">
                <input
                  className="platform-search"
                  inputMode="numeric"
                  value={form.assigned_recruiter_user_id}
                  onChange={(e) => setForm((f) => ({ ...f, assigned_recruiter_user_id: e.target.value }))}
                  style={inp}
                  placeholder="Platform user id"
                />
              </Row>
              <Row label="Hiring manager user ID">
                <input
                  className="platform-search"
                  inputMode="numeric"
                  value={form.hiring_manager_user_id}
                  onChange={(e) => setForm((f) => ({ ...f, hiring_manager_user_id: e.target.value }))}
                  style={inp}
                />
              </Row>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Row label="Source of hire">
                <input
                  className="platform-search"
                  value={form.source_of_hire}
                  onChange={(e) => setForm((f) => ({ ...f, source_of_hire: e.target.value }))}
                  style={inp}
                />
              </Row>
              <Row label="Sub-source">
                <input
                  className="platform-search"
                  value={form.sub_source}
                  onChange={(e) => setForm((f) => ({ ...f, sub_source: e.target.value }))}
                  style={inp}
                />
              </Row>
            </div>

            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                Pipeline, offer & dates
              </summary>
              <div className="req-drawer-form-grid" style={{ marginTop: 10 }}>
                <Row label="Current stage">
                  <input
                    className="platform-search"
                    value={form.current_stage}
                    onChange={(e) => setForm((f) => ({ ...f, current_stage: e.target.value }))}
                    style={inp}
                  />
                </Row>
                <Row label="Global status">
                  <input
                    className="platform-search"
                    value={form.global_status}
                    onChange={(e) => setForm((f) => ({ ...f, global_status: e.target.value }))}
                    style={inp}
                  />
                </Row>
                <Row label="Resume screening">
                  <input
                    className="platform-search"
                    value={form.resume_screening}
                    onChange={(e) => setForm((f) => ({ ...f, resume_screening: e.target.value }))}
                    style={inp}
                  />
                </Row>
                <Row label="Offer CTC (₹L)">
                  <input
                    className="platform-search"
                    inputMode="decimal"
                    value={form.offer_ctc_lpa}
                    onChange={(e) => setForm((f) => ({ ...f, offer_ctc_lpa: e.target.value }))}
                    style={inp}
                  />
                </Row>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Row label="Offer release">
                    <input
                      className="platform-search"
                      type="datetime-local"
                      value={form.offer_release_date}
                      onChange={(e) => setForm((f) => ({ ...f, offer_release_date: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                  <Row label="Expected DOJ">
                    <input
                      className="platform-search"
                      type="datetime-local"
                      value={form.expected_doj}
                      onChange={(e) => setForm((f) => ({ ...f, expected_doj: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Row label="Actual DOJ">
                    <input
                      className="platform-search"
                      type="datetime-local"
                      value={form.actual_doj}
                      onChange={(e) => setForm((f) => ({ ...f, actual_doj: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                  <Row label="Selection date">
                    <input
                      className="platform-search"
                      type="datetime-local"
                      value={form.selection_date}
                      onChange={(e) => setForm((f) => ({ ...f, selection_date: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Row label="LOI issue">
                    <input
                      className="platform-search"
                      type="datetime-local"
                      value={form.loi_issue_date}
                      onChange={(e) => setForm((f) => ({ ...f, loi_issue_date: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                  <Row label="CB closure">
                    <input
                      className="platform-search"
                      type="datetime-local"
                      value={form.cb_closure_date}
                      onChange={(e) => setForm((f) => ({ ...f, cb_closure_date: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                </div>
                <Row label="Offer acceptance">
                  <input
                    className="platform-search"
                    value={form.offer_acceptance}
                    onChange={(e) => setForm((f) => ({ ...f, offer_acceptance: e.target.value }))}
                    style={inp}
                  />
                </Row>
                <Row label="Offer date">
                  <input
                    className="platform-search"
                    type="datetime-local"
                    value={form.offer_date}
                    onChange={(e) => setForm((f) => ({ ...f, offer_date: e.target.value }))}
                    style={inp}
                  />
                </Row>
                <Row label="Offer accepted flag">
                  <input
                    className="platform-search"
                    value={form.offer_accepted_flag}
                    onChange={(e) => setForm((f) => ({ ...f, offer_accepted_flag: e.target.value }))}
                    style={inp}
                  />
                </Row>
                <Row label="Decline reason">
                  <input
                    className="platform-search"
                    value={form.decline_reason}
                    onChange={(e) => setForm((f) => ({ ...f, decline_reason: e.target.value }))}
                    style={inp}
                  />
                </Row>
                <Row label="Joining status">
                  <input
                    className="platform-search"
                    value={form.joining_status}
                    onChange={(e) => setForm((f) => ({ ...f, joining_status: e.target.value }))}
                    style={inp}
                  />
                </Row>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <Row label="Check-in 30d">
                    <input
                      className="platform-search"
                      value={form.checkin_30_day}
                      onChange={(e) => setForm((f) => ({ ...f, checkin_30_day: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                  <Row label="Check-in 60d">
                    <input
                      className="platform-search"
                      value={form.checkin_60_day}
                      onChange={(e) => setForm((f) => ({ ...f, checkin_60_day: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                  <Row label="Check-in 90d">
                    <input
                      className="platform-search"
                      value={form.checkin_90_day}
                      onChange={(e) => setForm((f) => ({ ...f, checkin_90_day: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                </div>
                <Row label="Early exit risk">
                  <input
                    className="platform-search"
                    value={form.early_exit_risk}
                    onChange={(e) => setForm((f) => ({ ...f, early_exit_risk: e.target.value }))}
                    style={inp}
                  />
                </Row>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <Row label="Offered gross CTC">
                    <input
                      className="platform-search"
                      inputMode="decimal"
                      value={form.offered_gross_ctc}
                      onChange={(e) => setForm((f) => ({ ...f, offered_gross_ctc: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                  <Row label="Offered STVs">
                    <input
                      className="platform-search"
                      inputMode="decimal"
                      value={form.offered_stvs}
                      onChange={(e) => setForm((f) => ({ ...f, offered_stvs: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                  <Row label="Hike % offered">
                    <input
                      className="platform-search"
                      inputMode="decimal"
                      value={form.hike_pct_offered}
                      onChange={(e) => setForm((f) => ({ ...f, hike_pct_offered: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                </div>
              </div>
            </details>

            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600 }}>BGV, IDs &amp; extras</summary>
              <div className="req-drawer-form-grid" style={{ marginTop: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Row label="BGV date">
                    <input
                      className="platform-search"
                      type="datetime-local"
                      value={form.bgv_date}
                      onChange={(e) => setForm((f) => ({ ...f, bgv_date: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                  <Row label="BGV status">
                    <input
                      className="platform-search"
                      value={form.bgv_status}
                      onChange={(e) => setForm((f) => ({ ...f, bgv_status: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                </div>
                <Row label="Medical initiation">
                  <input
                    className="platform-search"
                    type="datetime-local"
                    value={form.medical_initiation_date}
                    onChange={(e) => setForm((f) => ({ ...f, medical_initiation_date: e.target.value }))}
                    style={inp}
                  />
                </Row>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Row label="Candidate staff no.">
                    <input
                      className="platform-search"
                      value={form.candidate_staff_no}
                      onChange={(e) => setForm((f) => ({ ...f, candidate_staff_no: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                  <Row label="MSIL staff no.">
                    <input
                      className="platform-search"
                      value={form.msil_staff_no}
                      onChange={(e) => setForm((f) => ({ ...f, msil_staff_no: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Row label="Sourcer">
                    <input
                      className="platform-search"
                      value={form.sourcer_name}
                      onChange={(e) => setForm((f) => ({ ...f, sourcer_name: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                  <Row label="Taggd PM">
                    <input
                      className="platform-search"
                      value={form.taggd_pm}
                      onChange={(e) => setForm((f) => ({ ...f, taggd_pm: e.target.value }))}
                      style={inp}
                    />
                  </Row>
                </div>
                <Row label="Fingerprint">
                  <input
                    className="platform-search"
                    value={form.fingerprint}
                    onChange={(e) => setForm((f) => ({ ...f, fingerprint: e.target.value }))}
                    style={inp}
                  />
                </Row>
                <Row label="Excel row index">
                  <input
                    className="platform-search"
                    inputMode="numeric"
                    value={form.excel_row_index}
                    onChange={(e) => setForm((f) => ({ ...f, excel_row_index: e.target.value }))}
                    style={inp}
                  />
                </Row>
              </div>
            </details>

            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Advanced JSON</summary>
              <div className="req-drawer-form-grid" style={{ marginTop: 10 }}>
                <Row label="candidate_extras (object)">
                  <textarea
                    className="platform-search"
                    value={form.candidate_extras_json}
                    onChange={(e) => setForm((f) => ({ ...f, candidate_extras_json: e.target.value }))}
                    style={{ ...inp, minHeight: 72, fontFamily: "ui-monospace, monospace", fontSize: 11 }}
                  />
                </Row>
                <Row label="revenue_results (object)">
                  <textarea
                    className="platform-search"
                    value={form.revenue_results_json}
                    onChange={(e) => setForm((f) => ({ ...f, revenue_results_json: e.target.value }))}
                    style={{ ...inp, minHeight: 72, fontFamily: "ui-monospace, monospace", fontSize: 11 }}
                  />
                </Row>
                <Row label="offer_onboarding_extras (object)">
                  <textarea
                    className="platform-search"
                    value={form.offer_onboarding_extras_json}
                    onChange={(e) => setForm((f) => ({ ...f, offer_onboarding_extras_json: e.target.value }))}
                    style={{ ...inp, minHeight: 72, fontFamily: "ui-monospace, monospace", fontSize: 11 }}
                  />
                </Row>
              </div>
            </details>
          </>
        )}
      </div>
    </PlatformDrawer>
  );
}
