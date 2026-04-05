import React, { useCallback, useEffect, useState } from "react";
import { queries, type RecordPatch, type RecordRow } from "@/lib/api";
import { PlatformDrawer } from "@/components/platform/PlatformDrawer";
import { StatusTag } from "@/components/platform/PlatformBlocks";
import { formatCurrency } from "@/lib/utils";

const GLOBAL_STATUS_OPTIONS = ["ACTIVE", "CLOSED", "PIPELINE", "ON HOLD", "UNPROCESSED", "CANCELLED"] as const;

type ReqEditForm = {
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

function buildEditForm(r: RecordRow): ReqEditForm {
  return {
    candidate_name: r.candidate_name ?? "",
    position_title: r.position_title ?? "",
    hiring_manager: r.hiring_manager ?? "",
    department: r.department ?? "",
    location: r.location ?? "",
    offered_lakhs: r.offered_ctc != null && !Number.isNaN(r.offered_ctc) ? String(r.offered_ctc / 100000) : "",
    status: r.status ?? "",
    global_status: r.global_status ?? "",
    creation_date: r.creation_date ? r.creation_date.slice(0, 10) : "",
    joining_date: r.joining_date ? r.joining_date.slice(0, 10) : "",
    additional_json: JSON.stringify(r.additional_attributes ?? {}, null, 2),
  };
}

export type RequisitionRecordDrawerProps = {
  record: RecordRow | null;
  onClose: () => void;
  /** Update list state + keep drawer row in sync */
  onSaved: (updated: RecordRow) => void;
  /** After successful DELETE /records/:id — e.g. remove from list */
  onDeleted?: (recordId: number) => void;
};

/**
 * Side drawer: view requisition, edit via PATCH /records/:id (used on Requisitions + Client Detail).
 */
export function RequisitionRecordDrawer({ record, onClose, onSaved, onDeleted }: RequisitionRecordDrawerProps) {
  const [drawerEdit, setDrawerEdit] = useState(false);
  const [editForm, setEditForm] = useState<ReqEditForm | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setDrawerEdit(false);
    setEditForm(null);
    setSaveError(null);
    setDeleting(false);
  }, [record?.id]);

  const startDrawerEdit = useCallback(() => {
    if (!record) return;
    setEditForm(buildEditForm(record));
    setDrawerEdit(true);
    setSaveError(null);
  }, [record]);

  const discardDrawerEdit = useCallback(() => {
    setDrawerEdit(false);
    setEditForm(null);
    setSaveError(null);
  }, []);

  const saveRequisition = useCallback(async () => {
    if (!record || !editForm) return;
    setSaving(true);
    setSaveError(null);
    const lakhs = editForm.offered_lakhs.trim();
    if (lakhs !== "") {
      const n = Number(lakhs);
      if (Number.isNaN(n)) {
        setSaveError("Offered CTC (₹L) must be a number.");
        setSaving(false);
        return;
      }
    }
    let parsed: Record<string, unknown>;
    try {
      const j = JSON.parse(editForm.additional_json);
      if (j === null || typeof j !== "object" || Array.isArray(j)) {
        throw new Error("Additional attributes must be a JSON object.");
      }
      parsed = j as Record<string, unknown>;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Invalid JSON");
      setSaving(false);
      return;
    }
    const body: RecordPatch = {
      candidate_name: editForm.candidate_name.trim() || null,
      position_title: editForm.position_title.trim() || null,
      hiring_manager: editForm.hiring_manager.trim() || null,
      department: editForm.department.trim() || null,
      location: editForm.location.trim() || null,
      status: editForm.status.trim() || null,
      global_status: editForm.global_status.trim() || null,
      offered_ctc: lakhs === "" ? null : Number(lakhs) * 100000,
      creation_date: editForm.creation_date.trim() || null,
      joining_date: editForm.joining_date.trim() || null,
      additional_attributes: parsed,
    };
    try {
      const updated = await queries.patchRecord(record.id, body);
      onSaved(updated);
      setDrawerEdit(false);
      setEditForm(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [record, editForm, onSaved]);

  const deleteRequisition = useCallback(async () => {
    if (!record) return;
    const label = (record.additional_attributes?.position_code as string) || `REQ-${record.id}`;
    if (!window.confirm(`Delete requisition ${label} (record #${record.id})? This cannot be undone.`)) return;
    setDeleting(true);
    setSaveError(null);
    try {
      await queries.deleteRecord(record.id);
      onDeleted?.(record.id);
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }, [record, onDeleted, onClose]);

  const reqCode = (record?.additional_attributes?.position_code as string) ?? (record ? `REQ-${record.id}` : "");

  return (
    <PlatformDrawer
      open={Boolean(record)}
      className={`platform-drawer--req${drawerEdit ? " platform-drawer--req-edit" : ""}`}
      title={
        <>
          <span className="req-drawer-id-emoji" aria-hidden>
            📋
          </span>
          {reqCode}
        </>
      }
      subtitle={
        record ? (
          <>
            Project <strong>#{record.project_id}</strong>
            <span style={{ opacity: 0.65 }}> · </span>
            Record #{record.id}
          </>
        ) : null
      }
      onClose={onClose}
      headerActions={
        record && !drawerEdit ? (
          <>
            <button type="button" className="req-drawer-btn-edit" onClick={startDrawerEdit} disabled={deleting}>
              Edit requisition
            </button>
            <button type="button" className="req-drawer-btn-danger" onClick={() => void deleteRequisition()} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </>
        ) : undefined
      }
      footer={
        drawerEdit && editForm ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {saveError ? <div style={{ fontSize: 12, color: "var(--red)", lineHeight: 1.4 }}>{saveError}</div> : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="req-drawer-btn-ghost" onClick={discardDrawerEdit} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="req-drawer-btn-primary" onClick={() => void saveRequisition()} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      {record && (
        <div className="req-drawer">
          {saveError && !drawerEdit ? (
            <div
              role="alert"
              style={{
                fontSize: 12,
                color: "var(--red)",
                marginBottom: 12,
                padding: "8px 10px",
                background: "color-mix(in srgb, var(--red) 10%, transparent)",
                borderRadius: 8,
                lineHeight: 1.4,
              }}
            >
              {saveError}
            </div>
          ) : null}
          {!drawerEdit && (
            <div className="drawer-section">
              <div className="drawer-section-title">Lifecycle</div>
              <div className="timeline">
                {record.creation_date && (
                  <div className="timeline-item">
                    <div className="timeline-dot" />
                    <div className="timeline-date">{new Date(record.creation_date).toLocaleDateString("en-IN")}</div>
                    <div className="timeline-label">Requisition created</div>
                  </div>
                )}
                {(record.status || "").toLowerCase().includes("screen") && (
                  <div className="timeline-item">
                    <div className="timeline-dot" style={{ background: "var(--accent)" }} />
                    <div className="timeline-date">Screening</div>
                    <div className="timeline-label">Candidate in screening</div>
                  </div>
                )}
                {(record.status || "").toLowerCase().includes("offer") && (
                  <div className="timeline-item">
                    <div className="timeline-dot amber" />
                    <div className="timeline-date">Offer extended</div>
                    <div className="timeline-label">
                      {record.offered_ctc ? `₹${(record.offered_ctc / 100000).toFixed(1)}L` : "Amount TBD"}
                    </div>
                  </div>
                )}
                {record.joining_date && (
                  <div className="timeline-item">
                    <div className="timeline-dot green" />
                    <div className="timeline-date">{new Date(record.joining_date).toLocaleDateString("en-IN")}</div>
                    <div className="timeline-label">Candidate joined</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {drawerEdit && editForm ? (
            <div className="req-drawer-form-grid">
              <div className="drawer-section" style={{ marginBottom: 0 }}>
                <div className="drawer-section-title">Edit fields</div>
                <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.45 }}>
                  Update pipeline status, req details, or merge keys into additional attributes (JSON). Revenue stays computed from project logic.
                </p>
              </div>

              {(
                [
                  ["candidate_name", "Candidate", "text"],
                  ["position_title", "Position", "text"],
                  ["hiring_manager", "Hiring manager", "text"],
                  ["department", "Department", "text"],
                  ["location", "Location", "text"],
                ] as const
              ).map(([key, label, kind]) => (
                <div key={key}>
                  <label className="req-drawer-field-label">{label}</label>
                  <input
                    className="platform-search"
                    type={kind}
                    value={editForm[key]}
                    onChange={(e) => setEditForm((f) => (f ? { ...f, [key]: e.target.value } : f))}
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </div>
              ))}

              <div>
                <label className="req-drawer-field-label">Pipeline status (text)</label>
                <input
                  className="platform-search"
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, status: e.target.value } : f))}
                  style={{ width: "100%", boxSizing: "border-box" }}
                  placeholder="e.g. Offered, Screening"
                />
              </div>

              <div>
                <label className="req-drawer-field-label">Global status</label>
                <select
                  className="platform-search"
                  value={editForm.global_status}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, global_status: e.target.value } : f))}
                  style={{ width: "100%", boxSizing: "border-box" }}
                >
                  <option value="">— Select —</option>
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
                  value={editForm.offered_lakhs}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, offered_lakhs: e.target.value } : f))}
                  style={{ width: "100%", boxSizing: "border-box" }}
                  placeholder="e.g. 26"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label className="req-drawer-field-label">Created</label>
                  <input
                    className="platform-search"
                    type="date"
                    value={editForm.creation_date}
                    onChange={(e) => setEditForm((f) => (f ? { ...f, creation_date: e.target.value } : f))}
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label className="req-drawer-field-label">Joining</label>
                  <input
                    className="platform-search"
                    type="date"
                    value={editForm.joining_date}
                    onChange={(e) => setEditForm((f) => (f ? { ...f, joining_date: e.target.value } : f))}
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              <div>
                <label className="req-drawer-field-label">Additional attributes (JSON — merged on save)</label>
                <textarea
                  className="platform-search"
                  value={editForm.additional_json}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, additional_json: e.target.value } : f))}
                  spellCheck={false}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    minHeight: 140,
                    resize: "vertical",
                    fontFamily: "'DM Mono',monospace",
                    fontSize: 11,
                    lineHeight: 1.5,
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="drawer-section">
              <div className="drawer-section-title">Requisition details</div>
              <div className="kv-row">
                <span className="kv-key">Candidate</span>
                <span className="kv-val">{record.candidate_name || "—"}</span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Position</span>
                <span className="kv-val">{record.position_title || "—"}</span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Hiring manager</span>
                <span className="kv-val">{record.hiring_manager ?? "—"}</span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Department</span>
                <span className="kv-val">{record.department ?? "—"}</span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Location</span>
                <span className="kv-val">{record.location ?? "—"}</span>
              </div>
              {record.ageing != null && (
                <div className="kv-row">
                  <span className="kv-key">Ageing</span>
                  <span
                    className="kv-val"
                    style={{
                      color: record.ageing > 90 ? "var(--red)" : record.ageing > 60 ? "var(--amber)" : "var(--green)",
                    }}
                  >
                    {record.ageing} days
                  </span>
                </div>
              )}
              <div className="kv-row">
                <span className="kv-key">Offered CTC</span>
                <span className="kv-val" style={{ color: "var(--green)" }}>
                  {record.offered_ctc ? `₹${(record.offered_ctc / 100000).toFixed(1)}L` : "—"}
                </span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Pipeline status</span>
                <span className="kv-val">{record.status || "—"}</span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Global status</span>
                <span className="kv-val">
                  <StatusTag status={record.global_status ?? record.status ?? "Open"} />
                </span>
              </div>
            </div>
          )}

          {record.revenue_results && !drawerEdit && (
            <div className="drawer-section">
              <div className="drawer-section-title">Revenue logic</div>
              <div className="kv-row">
                <span className="kv-key">Opening fee</span>
                <span className="kv-val" style={{ color: "var(--accent)" }}>
                  {formatCurrency(record.revenue_results.opening_fee ?? 0)}
                </span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Closing fee</span>
                <span className="kv-val" style={{ color: "var(--accent)" }}>
                  {formatCurrency(record.revenue_results.closing_fee ?? 0)}
                </span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Total revenue</span>
                <span className="kv-val" style={{ color: "var(--green)", fontWeight: 700 }}>
                  {formatCurrency(record.revenue_results.revenue ?? 0)}
                </span>
              </div>
            </div>
          )}

          {!drawerEdit && record.additional_attributes && Object.keys(record.additional_attributes).length > 0 && (
            <div className="drawer-section">
              <div className="drawer-section-title">Extra attributes</div>
              <pre className="req-drawer-json">{JSON.stringify(record.additional_attributes, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </PlatformDrawer>
  );
}
