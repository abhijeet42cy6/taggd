import React, { useCallback, useEffect, useMemo, useState } from "react";
import { queries, type RecordPatch, type RecordRpoPatch, type RecordRow } from "@/lib/api";
import {
  CANDIDATE_NAME_PRESETS,
  DIVERSITY_OPTIONS,
  candidateNameSelectOptions,
  readDiversity,
} from "@/lib/requisition-form-options";
import {
  REQ_ORG_FIELD_LABELS,
  mergeRpoPatches,
  orgFieldsToRpoPatch,
  readReqOrgFields,
  type ReqOrgFormFields,
} from "@/lib/requisition-org-fields";
import { StatusTag } from "@/components/platform/PlatformBlocks";
import { cn, displayRecordReqId, formatCurrency, formatOfferedCtc, normalizeOfferedCtcInr } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import "@/styles/new-contract-panel.css";

const GLOBAL_STATUS_OPTIONS = ["ACTIVE", "CLOSED", "PIPELINE", "ON HOLD", "UNPROCESSED", "CANCELLED"] as const;

const PIPELINE_STATUS_PRESETS = [
  "Open",
  "WIP",
  "Screening",
  "Documents Pending",
  "Offered",
  "Offer Accepted",
  "Joined",
  "On Hold",
  "Cancelled",
  "Closed",
] as const;

const REQ_TABS = [
  { icon: "◇", label: "Overview" },
  { icon: "👤", label: "Role" },
  { icon: "📊", label: "Pipeline" },
  { icon: "₹", label: "Revenue" },
  { icon: "📝", label: "Extra" },
] as const;

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
  req_offered_date: string;
  offered_accept_date: string;
  req_cancelled_date: string;
  selection_date_req: string;
  diversity: string;
  additional_json: string;
} & ReqOrgFormFields;

function recordDateIso(r: RecordRow, key: keyof RecordRpoPatch): string {
  const v = r[key];
  return typeof v === "string" && v ? v.slice(0, 10) : "";
}

function formatRecordDate(val?: string | null): string {
  if (!val) return "—";
  return new Date(val).toLocaleDateString("en-IN");
}

function buildEditForm(r: RecordRow): ReqEditForm {
  return {
    candidate_name: r.candidate_name ?? "",
    position_title: r.position_title ?? "",
    hiring_manager: r.hiring_manager ?? "",
    department: r.department ?? "",
    location: r.location ?? "",
    offered_lakhs: r.offered_ctc != null && !Number.isNaN(r.offered_ctc)
      ? String(normalizeOfferedCtcInr(r.offered_ctc) / 100000)
      : "",
    status: r.status ?? "",
    global_status: r.global_status ?? "",
    creation_date: r.creation_date ? r.creation_date.slice(0, 10) : "",
    joining_date: r.joining_date ? r.joining_date.slice(0, 10) : "",
    req_offered_date: recordDateIso(r, "req_offered_date"),
    offered_accept_date: recordDateIso(r, "offered_accept_date"),
    req_cancelled_date: recordDateIso(r, "req_cancelled_date"),
    selection_date_req: recordDateIso(r, "selection_date_req"),
    diversity: readDiversity(r.additional_attributes),
    additional_json: JSON.stringify(r.additional_attributes ?? {}, null, 2),
    ...readReqOrgFields(r),
  };
}

type PipelineDateField = "req_offered_date" | "offered_accept_date" | "req_cancelled_date" | "selection_date_req";

function pipelineDatesToRpo(form: ReqEditForm): RecordRpoPatch | undefined {
  const rpo: RecordRpoPatch = {};
  const set = (key: PipelineDateField, val: string) => {
    const t = val.trim();
    if (t) rpo[key] = t;
  };
  set("req_offered_date", form.req_offered_date);
  set("offered_accept_date", form.offered_accept_date);
  set("req_cancelled_date", form.req_cancelled_date);
  set("selection_date_req", form.selection_date_req);
  return Object.keys(rpo).length ? rpo : undefined;
}

function pipelineStatusOptions(current: string): string[] {
  const set = new Set<string>(PIPELINE_STATUS_PRESETS);
  const cur = current.trim();
  if (cur && !set.has(cur)) set.add(cur);
  return Array.from(set);
}

export type RequisitionRecordDrawerProps = {
  record: RecordRow | null;
  onClose: () => void;
  onSaved: (updated: RecordRow) => void;
  onDeleted?: (recordId: number) => void;
};

export function RequisitionRecordDrawer({ record, onClose, onSaved, onDeleted }: RequisitionRecordDrawerProps) {
  const [tab, setTab] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<ReqEditForm | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setTab(0);
    setEditing(false);
    setEditForm(null);
    setSaveError(null);
    setDeleting(false);
  }, [record?.id]);

  const reqCode = useMemo(
    () => (record ? displayRecordReqId(record) : ""),
    [record],
  );

  const pipelineOpts = useMemo(
    () => pipelineStatusOptions(editing && editForm ? editForm.status : record?.status ?? ""),
    [editing, editForm, record?.status],
  );

  const startEdit = useCallback(() => {
    if (!record) return;
    setEditForm(buildEditForm(record));
    setEditing(true);
    setSaveError(null);
    setTab(1);
  }, [record]);

  const discardEdit = useCallback(() => {
    setEditing(false);
    setEditForm(null);
    setSaveError(null);
  }, []);

  const setF = <K extends keyof ReqEditForm>(k: K, v: ReqEditForm[K]) =>
    setEditForm((f) => (f ? { ...f, [k]: v } : f));

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
    const div = editForm.diversity.trim();
    if (div) parsed.diversity = div;
    else delete parsed.diversity;
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
    const rpo = mergeRpoPatches(pipelineDatesToRpo(editForm), orgFieldsToRpoPatch(editForm));
    if (rpo) body.rpo = rpo;
    try {
      const updated = await queries.patchRecord(record.id, body);
      onSaved(updated);
      setEditing(false);
      setEditForm(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [record, editForm, onSaved]);

  const deleteRequisition = useCallback(async () => {
    if (!record) return;
    if (!window.confirm(`Delete requisition ${reqCode} (record #${record.id})? This cannot be undone.`)) return;
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
  }, [record, reqCode, onDeleted, onClose]);

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

  const readRow = (lbl: string, val: React.ReactNode, valStyle?: React.CSSProperties) => (
    <div className="ncp-prop-row">
      <div className="ncp-prop-label">{lbl}</div>
      <div className="ncp-computed-field" style={{ border: "none", background: "transparent", minHeight: 36 }}>
        <span style={valStyle}>{val ?? "—"}</span>
      </div>
    </div>
  );

  const editTextRow = (lbl: string, key: keyof ReqEditForm, placeholder?: string) =>
    editForm ? (
      <div className="ncp-prop-row">
        <div className="ncp-prop-label">{lbl}</div>
        <input
          className="ncp-prop-input"
          value={editForm[key] ?? ""}
          onChange={(e) => setF(key, e.target.value)}
          placeholder={placeholder}
        />
      </div>
    ) : null;

  const lifecycleBlock = record ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {record.creation_date && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ncp-accent)", marginTop: 5, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ncp-text-primary)" }}>
              {new Date(record.creation_date).toLocaleDateString("en-IN")}
            </div>
            <div style={{ fontSize: 11, color: "var(--ncp-text-muted)" }}>Requisition created</div>
          </div>
        </div>
      )}
      {(record.status || "").toLowerCase().includes("screen") && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ncp-accent)", marginTop: 5, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Screening</div>
            <div style={{ fontSize: 11, color: "var(--ncp-text-muted)" }}>Candidate in screening</div>
          </div>
        </div>
      )}
      {(record.status || "").toLowerCase().includes("offer") && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", marginTop: 5, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Offer extended</div>
            <div style={{ fontSize: 11, color: "var(--ncp-text-muted)" }}>
              {record.offered_ctc ? formatOfferedCtc(record.offered_ctc) : "Amount TBD"}
            </div>
          </div>
        </div>
      )}
      {record.joining_date && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ncp-green)", marginTop: 5, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{new Date(record.joining_date).toLocaleDateString("en-IN")}</div>
            <div style={{ fontSize: 11, color: "var(--ncp-text-muted)" }}>Candidate joined</div>
          </div>
        </div>
      )}
      {!record.creation_date && !record.joining_date && (
        <p className="ncp-hint" style={{ margin: 0 }}>
          No lifecycle dates recorded yet.
        </p>
      )}
    </div>
  ) : null;

  return (
    <Sheet open={Boolean(record)} onOpenChange={(o) => !o && onClose()}>
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
        {record && (
          <div className="new-contract-sheet flex min-h-0 flex-1 flex-col">
            <div className="ncp-scroll min-h-0 flex-1">
              <div className="ncp-page">
                <div className="ncp-header">
                  <div style={{ minWidth: 0 }}>
                    <div className="ncp-breadcrumb">
                      <span>Requisitions</span>
                      <span className="ncp-breadcrumb-sep">›</span>
                      <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 10 }}>{reqCode}</span>
                    </div>
                    <h1 className="ncp-h1">{reqCode}</h1>
                    <p className="ncp-subtitle" style={{ marginTop: 4 }}>
                      Project <strong>PRJ-{record.project_id}</strong>
                      <span style={{ opacity: 0.55 }}> · </span>
                      Record #{record.id}
                      {editing ? (
                        <>
                          <span style={{ opacity: 0.55 }}> · </span>
                          <span style={{ color: "var(--ncp-accent)" }}>Editing</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <button type="button" className="ncp-close-btn" aria-label="Close" onClick={onClose}>
                    ✕
                  </button>
                </div>

                <div className="ncp-steps" role="tablist" style={{ marginBottom: 18 }}>
                  {REQ_TABS.map(({ icon, label }, i) => (
                    <button
                      key={label}
                      type="button"
                      role="tab"
                      aria-selected={tab === i}
                      className={cn("ncp-step", tab === i && "ncp-active")}
                      onClick={() => setTab(i)}
                    >
                      <span className="ncp-step-num" style={{ fontSize: 14 }}>
                        {icon}
                      </span>
                      {label}
                    </button>
                  ))}
                </div>

                {/* ── Tab 0: Overview ── */}
                <div className={cn("ncp-panel", tab === 0 && "ncp-panel-active")}>
                  {section(
                    "◇",
                    "ncp-orange",
                    "Project & identity",
                    "Linked project and tracker identifiers.",
                    <>
                      <div
                        className="ncp-project-btn ncp-selected"
                        style={{ cursor: "default", marginBottom: 4, pointerEvents: "none" }}
                      >
                        <span className="ncp-project-icon" style={{ fontSize: 12 }}>
                          PRJ
                        </span>
                        <div className="ncp-project-meta">
                          <strong>Project #{record.project_id}</strong>
                          <span style={{ fontFamily: "var(--ncp-mono)", color: "var(--ncp-accent)" }}>PRJ-{record.project_id}</span>
                        </div>
                      </div>
                      {readRow("Req code", reqCode)}
                      {readRow(
                        "Global status",
                        <StatusTag status={record.global_status ?? record.status ?? "Open"} />,
                      )}
                      {record.ageing != null &&
                        readRow(
                          "Ageing",
                          `${record.ageing} days`,
                          {
                            color:
                              record.ageing > 90 ? "var(--red)" : record.ageing > 60 ? "var(--amber)" : "var(--green)",
                            fontWeight: 600,
                          },
                        )}
                    </>,
                  )}
                  {section("🕐", "ncp-blue", "Lifecycle", "Key dates and pipeline milestones.", lifecycleBlock)}
                </div>

                {/* ── Tab 1: Role ── */}
                <div className={cn("ncp-panel", tab === 1 && "ncp-panel-active")}>
                  {section(
                    "👤",
                    "ncp-blue",
                    "Candidate & role",
                    editing ? "Update candidate and position details." : "Person and position on this requisition.",
                    editing && editForm ? (
                      <>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Candidate</div>
                          <select
                            className="ncp-prop-input"
                            value={
                              CANDIDATE_NAME_PRESETS.includes(
                                editForm.candidate_name as (typeof CANDIDATE_NAME_PRESETS)[number],
                              )
                                ? editForm.candidate_name
                                : ""
                            }
                            onChange={(e) => {
                              if (e.target.value) setF("candidate_name", e.target.value);
                            }}
                          >
                            <option value="">— Custom name below —</option>
                            {CANDIDATE_NAME_PRESETS.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Candidate name</div>
                          <input
                            className="ncp-prop-input"
                            list="req-edit-candidate-presets"
                            value={editForm.candidate_name}
                            onChange={(e) => setF("candidate_name", e.target.value)}
                            placeholder="Full name or pick YTJ / Offered Drop in"
                          />
                          <datalist id="req-edit-candidate-presets">
                            {candidateNameSelectOptions(editForm.candidate_name).map((n) => (
                              <option key={n} value={n} />
                            ))}
                          </datalist>
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Diversity</div>
                          <select
                            className="ncp-prop-input"
                            value={editForm.diversity}
                            onChange={(e) => setF("diversity", e.target.value)}
                          >
                            <option value="">— Select —</option>
                            {DIVERSITY_OPTIONS.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        </div>
                        {editTextRow("Position", "position_title")}
                        {editTextRow("Hiring manager", "hiring_manager")}
                        {editTextRow("Department", "department")}
                        {editTextRow("Location", "location")}
                        {REQ_ORG_FIELD_LABELS.map(({ key, label }) =>
                          editTextRow(label, key),
                        )}
                      </>
                    ) : (
                      <>
                        {readRow("Candidate", record.candidate_name || "—")}
                        {readRow("Diversity", readDiversity(record.additional_attributes) || "—")}
                        {readRow("Position", record.position_title || "—")}
                        {readRow("Hiring manager", record.hiring_manager)}
                        {readRow("Department", record.department)}
                        {readRow("Location", record.location)}
                        {REQ_ORG_FIELD_LABELS.map(({ key, label }) =>
                          readRow(label, readReqOrgFields(record)[key] || "—"),
                        )}
                      </>
                    ),
                  )}
                </div>

                {/* ── Tab 2: Pipeline ── */}
                <div className={cn("ncp-panel", tab === 2 && "ncp-panel-active")}>
                  {section(
                    "📊",
                    "ncp-amber",
                    "Pipeline & status",
                    editing ? "Change pipeline and global status, offer, and dates." : "Current pipeline state and commercial fields.",
                    editing && editForm ? (
                      <>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Pipeline status</div>
                          <select
                            className="ncp-prop-input"
                            value={editForm.status}
                            onChange={(e) => setF("status", e.target.value)}
                          >
                            <option value="">— Select —</option>
                            {pipelineOpts.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Global status</div>
                          <select
                            className="ncp-prop-input"
                            value={editForm.global_status}
                            onChange={(e) => setF("global_status", e.target.value)}
                          >
                            <option value="">— Select —</option>
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
                            value={editForm.offered_lakhs}
                            onChange={(e) => setF("offered_lakhs", e.target.value)}
                            placeholder="e.g. 26"
                          />
                        </div>
                        <div className="ncp-date-grid" style={{ borderTop: "1px solid var(--ncp-border)", paddingTop: 8 }}>
                          <div className="ncp-date-cell">
                            <label>Created</label>
                            <input
                              type="date"
                              value={editForm.creation_date}
                              onChange={(e) => setF("creation_date", e.target.value)}
                            />
                          </div>
                          <div className="ncp-date-cell">
                            <label>Joining</label>
                            <input
                              type="date"
                              value={editForm.joining_date}
                              onChange={(e) => setF("joining_date", e.target.value)}
                            />
                          </div>
                          <div className="ncp-date-cell">
                            <label>Req offered</label>
                            <input
                              type="date"
                              value={editForm.req_offered_date}
                              onChange={(e) => setF("req_offered_date", e.target.value)}
                            />
                          </div>
                          <div className="ncp-date-cell">
                            <label>Offered accept</label>
                            <input
                              type="date"
                              value={editForm.offered_accept_date}
                              onChange={(e) => setF("offered_accept_date", e.target.value)}
                            />
                          </div>
                          <div className="ncp-date-cell">
                            <label>Req cancelled</label>
                            <input
                              type="date"
                              value={editForm.req_cancelled_date}
                              onChange={(e) => setF("req_cancelled_date", e.target.value)}
                            />
                          </div>
                          <div className="ncp-date-cell">
                            <label>Candidate selection</label>
                            <input
                              type="date"
                              value={editForm.selection_date_req}
                              onChange={(e) => setF("selection_date_req", e.target.value)}
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {readRow("Pipeline status", record.status || "—")}
                        {readRow("Global status", <StatusTag status={record.global_status ?? record.status ?? "Open"} />)}
                        {readRow(
                          "Offered CTC",
                          formatOfferedCtc(record.offered_ctc),
                          record.offered_ctc ? { color: "var(--ncp-green)", fontWeight: 600 } : undefined,
                        )}
                        {readRow("Created", formatRecordDate(record.creation_date))}
                        {readRow(
                          "Joining",
                          formatRecordDate(record.joining_date),
                        )}
                        {readRow("Req offered date", formatRecordDate(record.req_offered_date))}
                        {readRow("Offered accept date", formatRecordDate(record.offered_accept_date))}
                        {readRow("Req cancelled date", formatRecordDate(record.req_cancelled_date))}
                        {readRow("Candidate selection date", formatRecordDate(record.selection_date_req))}
                      </>
                    ),
                  )}
                </div>

                {/* ── Tab 3: Revenue ── */}
                <div className={cn("ncp-panel", tab === 3 && "ncp-panel-active")}>
                  {section(
                    "₹",
                    "ncp-teal",
                    "Revenue logic",
                    "Computed from project revenue rules (read-only).",
                    record.revenue_results ? (
                      <>
                        {readRow("Opening fee", formatCurrency(record.revenue_results.opening_fee ?? 0), {
                          color: "var(--ncp-accent)",
                          fontWeight: 600,
                        })}
                        {readRow("Closing fee", formatCurrency(record.revenue_results.closing_fee ?? 0), {
                          color: "var(--ncp-accent)",
                          fontWeight: 600,
                        })}
                        {readRow("Total revenue", formatCurrency(record.revenue_results.revenue ?? 0), {
                          color: "var(--ncp-green)",
                          fontWeight: 700,
                        })}
                      </>
                    ) : (
                      <p className="ncp-hint" style={{ margin: 0 }}>
                        No revenue results on this row yet. Upload tracker logic or recalculate the project.
                      </p>
                    ),
                  )}
                </div>

                {/* ── Tab 4: Extra ── */}
                <div className={cn("ncp-panel", tab === 4 && "ncp-panel-active")}>
                  {section(
                    "📝",
                    "ncp-green",
                    "Additional attributes",
                    editing ? "JSON merged into the record on save." : "Extra fields from the tracker ingest.",
                    editing && editForm ? (
                      <textarea
                        className="ncp-prop-input"
                        value={editForm.additional_json}
                        onChange={(e) => setF("additional_json", e.target.value)}
                        spellCheck={false}
                        style={{
                          width: "100%",
                          minHeight: 200,
                          resize: "vertical",
                          fontFamily: "var(--ncp-mono)",
                          fontSize: 12,
                          lineHeight: 1.5,
                        }}
                      />
                    ) : record.additional_attributes && Object.keys(record.additional_attributes).length > 0 ? (
                      <pre
                        style={{
                          margin: 0,
                          padding: "12px 14px",
                          borderRadius: "var(--ncp-radius)",
                          background: "var(--ncp-surface-hover)",
                          fontSize: 11,
                          lineHeight: 1.5,
                          fontFamily: "var(--ncp-mono)",
                          overflow: "auto",
                          maxHeight: 320,
                        }}
                      >
                        {JSON.stringify(record.additional_attributes, null, 2)}
                      </pre>
                    ) : (
                      <p className="ncp-hint" style={{ margin: 0 }}>
                        No extra attributes stored.
                      </p>
                    ),
                  )}
                </div>

                {saveError ? (
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
                    {saveError}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="ncp-footer">
              {editing ? (
                <>
                  <button type="button" className="ncp-btn ncp-btn-ghost" onClick={discardEdit} disabled={saving}>
                    Cancel
                  </button>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {tab > 0 && (
                      <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => setTab((t) => t - 1)} disabled={saving}>
                        ← Back
                      </button>
                    )}
                    {tab < REQ_TABS.length - 1 && (
                      <button type="button" className="ncp-btn ncp-btn-secondary" onClick={() => setTab((t) => t + 1)} disabled={saving}>
                        Next →
                      </button>
                    )}
                    <button type="button" className="ncp-btn ncp-btn-primary" onClick={() => void saveRequisition()} disabled={saving}>
                      {saving ? "Saving…" : "Save changes ✓"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="ncp-btn ncp-btn-ghost"
                    onClick={() => void deleteRequisition()}
                    disabled={deleting}
                    style={{ color: "#b91c1c" }}
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="ncp-btn ncp-btn-secondary" onClick={startEdit}>
                      Edit requisition
                    </button>
                    <button type="button" className="ncp-btn ncp-btn-primary" onClick={onClose}>
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
