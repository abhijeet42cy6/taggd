import React, { useCallback, useEffect, useState } from "react";
import { queries, type RecordCreate, type RecordRow } from "@/lib/api";
import { PlatformDrawer } from "@/components/platform/PlatformDrawer";

const GLOBAL_STATUS_OPTIONS = ["ACTIVE", "CLOSED", "PIPELINE", "ON HOLD", "UNPROCESSED", "CANCELLED"] as const;

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
};

function emptyForm(defaultProjectId: number): CreateForm {
  return {
    project_id: defaultProjectId,
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
  };
}

export type RequisitionCreateDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** At least one project required to submit */
  projects: Array<{ id: number; label: string }>;
  onCreated: (record: RecordRow) => void;
};

export function RequisitionCreateDrawer({ open, onClose, projects, onCreated }: RequisitionCreateDrawerProps) {
  const defaultPid = projects[0]?.id ?? 0;
  const [form, setForm] = useState<CreateForm>(() => emptyForm(defaultPid));
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm(projects[0]?.id ?? 0));
    setError(null);
  }, [open, projects]);

  const submit = useCallback(async () => {
    if (!projects.length) {
      setError("No project available for this client.");
      return;
    }
    const pid = form.project_id || projects[0].id;
    if (!form.candidate_name.trim() || !form.position_title.trim()) {
      setError("Candidate and position are required.");
      return;
    }
    const lakhs = form.offered_lakhs.trim();
    if (lakhs !== "") {
      const n = Number(lakhs);
      if (Number.isNaN(n)) {
        setError("Offered CTC (₹L) must be a number.");
        return;
      }
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
      return;
    }

    const body: RecordCreate = {
      project_id: pid,
      candidate_name: form.candidate_name.trim(),
      position_title: form.position_title.trim(),
      position_code: form.position_code.trim() || null,
      status: form.status.trim() || null,
      global_status: form.global_status.trim() || null,
      hiring_manager: form.hiring_manager.trim() || null,
      department: form.department.trim() || null,
      location: form.location.trim() || null,
      offered_ctc: lakhs === "" ? null : Number(lakhs) * 100000,
      creation_date: form.creation_date.trim() || null,
      joining_date: form.joining_date.trim() || null,
      additional_attributes: Object.keys(extra).length ? extra : undefined,
    };

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
  }, [form, projects, onCreated, onClose]);

  return (
    <PlatformDrawer
      open={open}
      className="platform-drawer--req platform-drawer--req-edit"
      title="Add requisition"
      subtitle="Creates a new tracker row on the selected project. Revenue is recalculated on the next logic run / upload if applicable."
      onClose={onClose}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {error ? <div style={{ fontSize: 12, color: "var(--red)", lineHeight: 1.4 }}>{error}</div> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="req-drawer-btn-ghost" onClick={onClose} disabled={creating}>
              Cancel
            </button>
            <button type="button" className="req-drawer-btn-primary" onClick={() => void submit()} disabled={creating || !projects.length}>
              {creating ? "Creating…" : "Create requisition"}
            </button>
          </div>
        </div>
      }
    >
      <div className="req-drawer req-drawer-form-grid">
        {!projects.length ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
            No projects are linked to this client. Upload a tracker first.
          </p>
        ) : (
          <>
            <div>
              <label className="req-drawer-field-label">Project</label>
              <select
                className="platform-search"
                value={form.project_id || projects[0].id}
                onChange={(e) => setForm((f) => ({ ...f, project_id: Number(e.target.value) }))}
                style={{ width: "100%", boxSizing: "border-box" }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="req-drawer-field-label">Req ID / position code (optional)</label>
              <input
                className="platform-search"
                value={form.position_code}
                onChange={(e) => setForm((f) => ({ ...f, position_code: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box" }}
                placeholder="e.g. REQ-97100"
              />
            </div>

            <div>
              <label className="req-drawer-field-label">Candidate</label>
              <input
                className="platform-search"
                value={form.candidate_name}
                onChange={(e) => setForm((f) => ({ ...f, candidate_name: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box" }}
                placeholder="Full name"
              />
            </div>

            <div>
              <label className="req-drawer-field-label">Position</label>
              <input
                className="platform-search"
                value={form.position_title}
                onChange={(e) => setForm((f) => ({ ...f, position_title: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box" }}
                placeholder="Role title"
              />
            </div>

            <div>
              <label className="req-drawer-field-label">Hiring manager</label>
              <input
                className="platform-search"
                value={form.hiring_manager}
                onChange={(e) => setForm((f) => ({ ...f, hiring_manager: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </div>

            <div>
              <label className="req-drawer-field-label">Department</label>
              <input
                className="platform-search"
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </div>

            <div>
              <label className="req-drawer-field-label">Location</label>
              <input
                className="platform-search"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </div>

            <div>
              <label className="req-drawer-field-label">Pipeline status (text)</label>
              <input
                className="platform-search"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box" }}
                placeholder="e.g. Screening"
              />
            </div>

            <div>
              <label className="req-drawer-field-label">Global status</label>
              <select
                className="platform-search"
                value={form.global_status}
                onChange={(e) => setForm((f) => ({ ...f, global_status: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box" }}
              >
                {GLOBAL_STATUS_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="req-drawer-field-label">Offered CTC (₹ lakhs)</label>
              <input
                className="platform-search"
                inputMode="decimal"
                value={form.offered_lakhs}
                onChange={(e) => setForm((f) => ({ ...f, offered_lakhs: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box" }}
                placeholder="Optional"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="req-drawer-field-label">Created (optional)</label>
                <input
                  className="platform-search"
                  type="date"
                  value={form.creation_date}
                  onChange={(e) => setForm((f) => ({ ...f, creation_date: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label className="req-drawer-field-label">Joining (optional)</label>
                <input
                  className="platform-search"
                  type="date"
                  value={form.joining_date}
                  onChange={(e) => setForm((f) => ({ ...f, joining_date: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
            </div>

            <div>
              <label className="req-drawer-field-label">Additional attributes (JSON)</label>
              <textarea
                className="platform-search"
                value={form.additional_json}
                onChange={(e) => setForm((f) => ({ ...f, additional_json: e.target.value }))}
                spellCheck={false}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  minHeight: 100,
                  resize: "vertical",
                  fontFamily: "'DM Mono',monospace",
                  fontSize: 11,
                  lineHeight: 1.5,
                }}
                placeholder="{}"
              />
            </div>
          </>
        )}
      </div>
    </PlatformDrawer>
  );
}
