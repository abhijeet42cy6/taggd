/**
 * ClientOnboardingDrawer — 5-step wizard for admins to set up a brand-new client
 * before uploading any tracker data, so filenames, configs, and validation rules
 * are all correct from day one.
 *
 * Steps:
 *   0  Client       — legal client name, lifecycle, short code
 *   1  Project      — first SBU/project under that client
 *   2  Config       — tracker_config: bands, depts, locations, SJT subset, CTC unit
 *   3  Template     — download the client-specific Excel template
 *   4  Done         — link to Ingestion Center
 */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { queries, type Project } from "@/lib/api";
import {
  buildTrackerConfigPayload,
  COLUMN_ALIAS_FIELDS,
  emptyColumnAliasesDraft,
  emptyFeeModelDraft,
  type ColumnAliasesDraft,
  type FeeModelDraft,
} from "@/lib/trackerConfigDraft";
import { cn } from "@/lib/utils";
import "@/styles/new-contract-panel.css";

const STEPS = [
  { icon: "🏢", label: "Client" },
  { icon: "◇", label: "Project" },
  { icon: "⚙", label: "Config" },
  { icon: "📥", label: "Template" },
  { icon: "✓", label: "Done" },
] as const;

const SOURCE_JOINER_OPTIONS = [
  { value: "taggd_rpo", label: "Taggd RPO" },
  { value: "taggd_direct", label: "Taggd Direct" },
  { value: "nontaggd_employee_referral", label: "ER – Employee Referral" },
  { value: "nontaggd_internal_job_portal", label: "IJP – Internal Job Posting" },
  { value: "nontaggd_campus", label: "Campus" },
  { value: "nontaggd_transferred", label: "Internal Transfer" },
] as const;

const REQUIRED_FIELD_OPTIONS = [
  { value: "joining_date", label: "Joining Date" },
  { value: "offered_ctc", label: "Offered CTC" },
  { value: "status", label: "Current Status" },
  { value: "position_title", label: "Position Title" },
  { value: "candidate_name", label: "Candidate Name" },
  { value: "department", label: "Department" },
  { value: "location", label: "Location" },
] as const;

function parseTagList(raw: string): string[] {
  return raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "4px 0 14px", fontSize: 12, color: "var(--ncp-text-secondary)", lineHeight: 1.55 }}>
      {children}
    </p>
  );
}

function Field({
  label, required, children, error,
}: {
  label: string; required?: boolean; children: React.ReactNode; error?: string | null;
}) {
  return (
    <div className="ncp-prop-row" style={{ alignItems: error ? "flex-start" : undefined }}>
      <div className="ncp-prop-label" style={error ? { paddingTop: 10 } : undefined}>
        {label}
        {required && <span style={{ color: "var(--red)", marginLeft: 3 }}>*</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
        {error ? (
          <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "#b91c1c", lineHeight: 1.4 }}>{error}</p>
        ) : null}
      </div>
    </div>
  );
}

function TagArea({
  label, value, onChange, placeholder, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean;
}) {
  return (
    <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
      <div className="ncp-prop-label" style={{ paddingTop: 10 }}>{label}</div>
      <div style={{ flex: 1 }}>
        <textarea
          className="ncp-prop-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder ?? "Comma-separated — e.g. L1, L2, M1"}
          style={{ minHeight: 52, fontSize: 12 }}
        />
        {value.trim() && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
            {parseTagList(value).map((t) => (
              <span key={t} style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 999,
                background: "rgba(0,0,0,.06)", color: "var(--ncp-text-secondary)",
              }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export type ClientOnboardingDrawerProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: (clientId: number, projectId: number) => void | Promise<void>;
};

type ClientDraft = { official_name: string; short_code: string; lifecycle_state: "active" | "prospect" };
type ProjectDraft = { engagement_name: string; account_name: string };
type ConfigDraft = {
  valid_bands: string;
  valid_departments: string;
  valid_locations: string;
  valid_source_joiner_types: string[];
  ctc_unit: "lakhs" | "inr";
  required_fields: string[];
  status_vocabulary_text: string;
  column_aliases: ColumnAliasesDraft;
  fee_model: FeeModelDraft;
};

const emptyClient = (): ClientDraft => ({ official_name: "", short_code: "", lifecycle_state: "active" });
const emptyProject = (): ProjectDraft => ({ engagement_name: "", account_name: "" });
const emptyConfig = (): ConfigDraft => ({
  valid_bands: "",
  valid_departments: "",
  valid_locations: "",
  valid_source_joiner_types: ["taggd_rpo", "taggd_direct", "nontaggd_employee_referral"],
  ctc_unit: "lakhs",
  required_fields: ["joining_date", "offered_ctc", "status"],
  status_vocabulary_text: "",
  column_aliases: emptyColumnAliasesDraft(),
  fee_model: emptyFeeModelDraft(),
});

export function ClientOnboardingDrawer({ open, onClose, onSuccess }: ClientOnboardingDrawerProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [clientDraft, setClientDraft] = useState<ClientDraft>(emptyClient);
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(emptyProject);
  const [configDraft, setConfigDraft] = useState<ConfigDraft>(emptyConfig);
  const [createdClientId, setCreatedClientId] = useState<number | null>(null);
  const [createdProject, setCreatedProject] = useState<Project | null>(null);
  const [downloading, setDownloading] = useState(false);

  const reset = () => {
    setStep(0); setSaving(false); setError(null); setFieldErrors({});
    setClientDraft(emptyClient()); setProjectDraft(emptyProject());
    setConfigDraft(emptyConfig());
    setCreatedClientId(null); setCreatedProject(null);
  };

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setError(null);
  };

  const setC = <K extends keyof ClientDraft>(k: K, v: ClientDraft[K]) => {
    if (k === "official_name") clearFieldError("official_name");
    setClientDraft((d) => ({ ...d, [k]: v }));
  };
  const setP = <K extends keyof ProjectDraft>(k: K, v: ProjectDraft[K]) => {
    if (k === "engagement_name") clearFieldError("engagement_name");
    setProjectDraft((d) => ({ ...d, [k]: v }));
  };
  const setCfg = <K extends keyof ConfigDraft>(k: K, v: ConfigDraft[K]) =>
    setConfigDraft((d) => ({ ...d, [k]: v }));

  function httpErr(e: unknown): string {
    const d = e && typeof e === "object" && "response" in e
      ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
      : undefined;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
    return e instanceof Error ? e.message : "An error occurred";
  }

  // ── STEP HANDLERS ────────────────────────────────────────────────────────────

  async function saveClient() {
    const name = clientDraft.official_name.trim();
    if (!name) {
      setFieldErrors({ official_name: "Official name is required to continue." });
      setError("Fill in the Official name field, then click Create client.");
      return;
    }
    setSaving(true); setError(null); setFieldErrors({});
    try {
      const c = await queries.createClient({
        official_name: name,
        short_code: clientDraft.short_code.trim() || null,
        lifecycle_state: clientDraft.lifecycle_state,
      });
      setCreatedClientId(c.id);
      setStep(1);
    } catch (e) { setError(httpErr(e)); }
    finally { setSaving(false); }
  }

  async function saveProject() {
    if (!createdClientId) {
      setError("Client was not created yet. Go back to step 1 and try again.");
      return;
    }
    const en = projectDraft.engagement_name.trim();
    if (!en) {
      setFieldErrors({ engagement_name: "SBU / engagement name is required to continue." });
      setError("Fill in the SBU / Engagement name field, then click Create project.");
      return;
    }
    setSaving(true); setError(null); setFieldErrors({});
    try {
      const p = await queries.createClientProject(createdClientId, {
        engagement_name: en,
        account_name: projectDraft.account_name.trim() || en,
      });
      setCreatedProject(p);
      setStep(2);
    } catch (e) { setError(httpErr(e)); }
    finally { setSaving(false); }
  }

  async function saveConfig() {
    if (!createdProject) return;
    setSaving(true); setError(null);
    const cfg = buildTrackerConfigPayload(configDraft);
    try {
      await queries.patchProjectMetadata(createdProject.id, { tracker_config: cfg });
      setStep(3);
    } catch (e) { setError(httpErr(e)); }
    finally { setSaving(false); }
  }

  async function downloadTemplate() {
    if (!createdProject) return;
    setDownloading(true);
    try {
      const name = (createdProject.account_name || createdProject.engagement_name || "tracker").trim();
      await queries.downloadProjectTrackerTemplate(createdProject.id, `${name} Tracker.xlsx`);
    } catch {
      // non-fatal — user can download later
    } finally {
      setDownloading(false);
      setStep(4);
    }
  }

  async function finish() {
    const clientId = createdClientId;
    const projectId = createdProject?.id;
    reset();
    onClose();
    if (clientId != null && projectId != null) {
      if (onSuccess) {
        await onSuccess(clientId, projectId);
      } else {
        navigate(`/ingestion?project_id=${projectId}`);
      }
    }
  }

  function handleStepSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step === 0) void saveClient();
    else if (step === 1) void saveProject();
    else if (step === 2) void saveConfig();
  }

  const canSaveClient = clientDraft.official_name.trim().length > 0;
  const canSaveProject = projectDraft.engagement_name.trim().length > 0;

  // ── STEP CONTENT ─────────────────────────────────────────────────────────────

  function renderStep() {
    switch (step) {
      case 0:
        return (
          <form id="onboarding-step-form" onSubmit={handleStepSubmit}>
            <Hint>
              Start by naming the legal client entity. The short code appears in reports and reference numbers.
            </Hint>
            <Field label="Official name" required error={fieldErrors.official_name}>
              <input className="ncp-prop-input" value={clientDraft.official_name}
                onChange={(e) => setC("official_name", e.target.value)} disabled={saving}
                placeholder="e.g. Maruti Suzuki India Limited" autoFocus />
            </Field>
            <Field label="Short code">
              <input className="ncp-prop-input" value={clientDraft.short_code}
                onChange={(e) => setC("short_code", e.target.value)} disabled={saving}
                placeholder="e.g. MSIL" />
            </Field>
            <Field label="Lifecycle">
              <select className="ncp-prop-input" value={clientDraft.lifecycle_state}
                onChange={(e) => setC("lifecycle_state", e.target.value as "active" | "prospect")}
                disabled={saving}>
                <option value="active">Active</option>
                <option value="prospect">Prospect</option>
              </select>
            </Field>
          </form>
        );

      case 1:
        return (
          <form id="onboarding-step-form" onSubmit={handleStepSubmit}>
            <Hint>
              Create the first project (SBU/engagement) under <strong>{clientDraft.official_name}</strong>. Each project maps to one tracker workbook.
            </Hint>
            <Field label="SBU / Engagement name" required error={fieldErrors.engagement_name}>
              <input className="ncp-prop-input" value={projectDraft.engagement_name}
                onChange={(e) => setP("engagement_name", e.target.value)} disabled={saving}
                placeholder="e.g. Maruti Suzuki – RPO FY26" autoFocus />
            </Field>
            <Field label="Account name">
              <input className="ncp-prop-input" value={projectDraft.account_name}
                onChange={(e) => setP("account_name", e.target.value)} disabled={saving}
                placeholder="Defaults to engagement name if blank" />
            </Field>
            <div style={{ fontSize: 11.5, color: "var(--ncp-text-secondary)", marginTop: 6, padding: "8px 12px", background: "rgba(0,0,0,.03)", borderRadius: "var(--ncp-radius)", lineHeight: 1.55 }}>
              <strong>Tip:</strong> Ask the hiring manager to save their Excel as <em>{"<"}Account name{">"} Tracker.xlsx</em> — e.g. <em>Maruti Suzuki Tracker.xlsx</em>. The system will match it automatically when uploading.
            </div>
          </form>
        );

      case 2:
        return (
          <form id="onboarding-step-form" onSubmit={handleStepSubmit}>
            <Hint>
              Define the allowed values for this client. These power validation warnings on upload and populate Excel dropdown lists in the client template. Leave blank to skip any check.
            </Hint>
            <TagArea label="Valid bands" value={configDraft.valid_bands}
              onChange={(v) => setCfg("valid_bands", v)} disabled={saving}
              placeholder="e.g. VP, DGM, AGM, M3, L1" />
            <TagArea label="Valid departments" value={configDraft.valid_departments}
              onChange={(v) => setCfg("valid_departments", v)} disabled={saving}
              placeholder="e.g. Finance, Manufacturing, HR" />
            <TagArea label="Valid locations" value={configDraft.valid_locations}
              onChange={(v) => setCfg("valid_locations", v)} disabled={saving}
              placeholder="e.g. Gurgaon, Mumbai, Pune, Manesar" />

            <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
              <div className="ncp-prop-label" style={{ paddingTop: 8 }}>Source joiner types</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                {SOURCE_JOINER_OPTIONS.map(({ value, label }) => {
                  const checked = configDraft.valid_source_joiner_types.includes(value);
                  return (
                    <label key={value} style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                      <input type="checkbox" checked={checked} disabled={saving}
                        onChange={(e) => {
                          const cur = configDraft.valid_source_joiner_types;
                          setCfg("valid_source_joiner_types", e.target.checked
                            ? [...cur, value]
                            : cur.filter((x) => x !== value));
                        }} />
                      {label}
                    </label>
                  );
                })}
              </div>
            </div>

            <Field label="CTC unit">
              <select className="ncp-prop-input" value={configDraft.ctc_unit}
                onChange={(e) => setCfg("ctc_unit", e.target.value as "lakhs" | "inr")} disabled={saving}>
                <option value="lakhs">Lakhs (default — e.g. enter 45 for ₹45 L)</option>
                <option value="inr">INR absolute (e.g. enter 4500000)</option>
              </select>
            </Field>

            <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
              <div className="ncp-prop-label" style={{ paddingTop: 8 }}>Required fields</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                {REQUIRED_FIELD_OPTIONS.map(({ value, label }) => {
                  const checked = configDraft.required_fields.includes(value);
                  return (
                    <label key={value} style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                      <input type="checkbox" checked={checked} disabled={saving}
                        onChange={(e) => {
                          const cur = configDraft.required_fields;
                          setCfg("required_fields", e.target.checked
                            ? [...cur, value]
                            : cur.filter((x) => x !== value));
                        }} />
                      {label}
                    </label>
                  );
                })}
                <p className="ncp-hint" style={{ margin: "6px 0 0" }}>
                  Rows missing required fields are flagged as errors in the validation preview (not skipped — they can still be committed by ignoring errors).
                </p>
              </div>
            </div>

            <TagArea
              label="Status vocabulary"
              value={configDraft.status_vocabulary_text}
              onChange={(v) => setCfg("status_vocabulary_text", v)}
              disabled={saving}
              placeholder={"One per line — client label → system status\nWIP → Open\nTBO → Offered\nL1 Interview → Interview"}
            />

            <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
              <div className="ncp-prop-label" style={{ paddingTop: 8 }}>Column aliases</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                <p className="ncp-hint" style={{ margin: 0 }}>
                  Exact Excel headers from the client workbook (optional — skips AI column mapping when set).
                </p>
                {COLUMN_ALIAS_FIELDS.map(({ key, label }) => (
                  <Field key={key} label={label}>
                    <input
                      className="ncp-prop-input"
                      value={configDraft.column_aliases[key]}
                      onChange={(e) =>
                        setCfg("column_aliases", { ...configDraft.column_aliases, [key]: e.target.value })
                      }
                      disabled={saving}
                      placeholder={key === "req_id" ? "e.g. TARA ID" : ""}
                    />
                  </Field>
                ))}
              </div>
            </div>

            <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
              <div className="ncp-prop-label" style={{ paddingTop: 8 }}>Fee model</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                <select
                  className="ncp-prop-input"
                  value={configDraft.fee_model.type}
                  onChange={(e) =>
                    setCfg("fee_model", {
                      ...configDraft.fee_model,
                      type: e.target.value as "percentage" | "flat_fee",
                    })
                  }
                  disabled={saving}
                >
                  <option value="percentage">Percentage of CTC</option>
                  <option value="flat_fee">Flat fee per joiner</option>
                </select>
                {configDraft.fee_model.type === "percentage" ? (
                  <>
                    <Field label="Opening fee %">
                      <input
                        className="ncp-prop-input"
                        type="number"
                        step="any"
                        value={configDraft.fee_model.opening_fee_pct}
                        onChange={(e) =>
                          setCfg("fee_model", { ...configDraft.fee_model, opening_fee_pct: e.target.value })
                        }
                        disabled={saving}
                        placeholder="e.g. 0.011 or 1.1"
                      />
                    </Field>
                    <Field label="Closing fee %">
                      <input
                        className="ncp-prop-input"
                        type="number"
                        step="any"
                        value={configDraft.fee_model.closing_fee_pct}
                        onChange={(e) =>
                          setCfg("fee_model", { ...configDraft.fee_model, closing_fee_pct: e.target.value })
                        }
                        disabled={saving}
                        placeholder="e.g. 0.024 or 2.4"
                      />
                    </Field>
                  </>
                ) : (
                  <Field label="Flat fee (INR)">
                    <input
                      className="ncp-prop-input"
                      type="number"
                      step="any"
                      value={configDraft.fee_model.flat_fee_per_joiner}
                      onChange={(e) =>
                        setCfg("fee_model", { ...configDraft.fee_model, flat_fee_per_joiner: e.target.value })
                      }
                      disabled={saving}
                      placeholder="e.g. 19800"
                    />
                  </Field>
                )}
              </div>
            </div>
          </form>
        );

      case 3:
        return (
          <>
            <Hint>
              Download a pre-configured Excel template for <strong>{createdProject?.account_name || projectDraft.engagement_name}</strong>. The dropdowns will only show the values you just configured — so HMs cannot enter invalid data.
            </Hint>
            <div style={{
              padding: "16px 18px", border: "1px solid var(--ncp-border)",
              borderRadius: "var(--ncp-radius)", background: "var(--ncp-bg)", marginBottom: 14,
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                {createdProject?.account_name || projectDraft.engagement_name} Tracker.xlsx
              </div>
              <div style={{ fontSize: 12, color: "var(--ncp-text-secondary)", marginBottom: 12 }}>
                Contains READ ME FIRST · Position Tracker · Contractual · Reference sheets.
                Dropdowns for bands, departments, locations, and source joiner types are pre-filled with your configuration.
              </div>
              <button
                type="button"
                className="ncp-btn ncp-btn-primary"
                onClick={() => void downloadTemplate()}
                disabled={downloading || !createdProject}
                style={{ fontSize: 12 }}
              >
                {downloading ? "Generating…" : "Download client template"}
              </button>
            </div>
            <Hint>
              You can skip this and download the template later from <strong>Clients → Edit account → Tracker tab</strong>.
            </Hint>
            <button
              type="button"
              className="ncp-btn ncp-btn-ghost"
              onClick={() => setStep(4)}
              style={{ fontSize: 12 }}
            >
              Skip — go to next step
            </button>
          </>
        );

      case 4:
        return (
          <>
            <div style={{
              padding: "20px 22px", background: "rgba(34,197,94,.06)",
              border: "1px solid rgba(34,197,94,.25)", borderRadius: "var(--ncp-radius)", marginBottom: 16,
            }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--green)", marginBottom: 6 }}>
                Client setup complete
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                <strong>{clientDraft.official_name}</strong> has been created with project{" "}
                <strong>{projectDraft.engagement_name}</strong>
                {createdProject && <span style={{ fontFamily: "'DM Mono',monospace", color: "var(--accent)", fontSize: 11 }}> (PRJ-{createdProject.id})</span>}
                {" "}and tracker configuration saved.
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--ncp-text-secondary)", lineHeight: 1.65 }}>
              <strong>Next steps:</strong>
              <ol style={{ margin: "8px 0 0 16px", padding: 0 }}>
                <li>Send the downloaded template to the hiring manager to fill out.</li>
                <li>
                  Tell the HM to save their Excel as{" "}
                  <strong>{(projectDraft.account_name || projectDraft.engagement_name).trim()} Tracker.xlsx</strong> exactly.
                </li>
                <li>
                  Go to <strong>Ingestion Center → Direct Upload</strong>, select{" "}
                  <strong>{projectDraft.engagement_name}</strong> as the target project,
                  drop the filled Excel, review the validation preview, then upload.
                </li>
              </ol>
            </div>
          </>
        );
    }
  }

  function renderFooter() {
    if (step === 0) {
      return (
        <button
          type="submit"
          form="onboarding-step-form"
          className="ncp-btn ncp-btn-primary"
          disabled={saving || !canSaveClient}
          title={!canSaveClient ? "Enter the official client name first" : undefined}
        >
          {saving ? "Creating…" : "Create client →"}
        </button>
      );
    }
    if (step === 1) {
      return (
        <>
          <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => { setError(null); setFieldErrors({}); setStep(0); }} disabled={saving}>← Back</button>
          <button
            type="submit"
            form="onboarding-step-form"
            className="ncp-btn ncp-btn-primary"
            disabled={saving || !canSaveProject}
            title={!canSaveProject ? "Enter the SBU / engagement name first" : undefined}
          >
            {saving ? "Creating…" : "Create project →"}
          </button>
        </>
      );
    }
    if (step === 2) {
      return (
        <>
          <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => { setError(null); setFieldErrors({}); setStep(1); }} disabled={saving}>← Back</button>
          <button
            type="submit"
            form="onboarding-step-form"
            className="ncp-btn ncp-btn-primary"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save config →"}
          </button>
        </>
      );
    }
    if (step === 3) return null;
    return (
      <button type="button" className="ncp-btn ncp-btn-primary" onClick={finish}>
        Go to Ingestion Center
      </button>
    );
  }

  return (
    <Sheet modal={false} open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        showOverlay={false}
        className={cn(
          "flex h-full max-h-[100dvh] flex-col gap-0 border-l p-0 z-[60]",
          "data-[side=right]:w-full data-[side=right]:max-w-[calc(100vw-1rem)]",
          "sm:data-[side=right]:w-[min(calc(100vw-2rem),48rem)] sm:data-[side=right]:max-w-[min(calc(100vw-2rem),48rem)]",
          "bg-[#f7f6f3] shadow-xl",
        )}
      >
        <div className="new-contract-sheet flex min-h-0 flex-1 flex-col">
          <div className="ncp-scroll min-h-0 flex-1">
            <div className="ncp-page">

              {/* HEADER */}
              <div className="ncp-header">
                <div style={{ minWidth: 0 }}>
                  <div className="ncp-breadcrumb">
                    <span>Clients</span>
                    <span className="ncp-breadcrumb-sep">›</span>
                    <span>New client setup</span>
                  </div>
                  <h1 className="ncp-h1">Set up a new client</h1>
                  <p className="ncp-subtitle" style={{ marginTop: 4 }}>
                    Create the client, configure upload rules, then download their custom Excel template — all before the first upload.
                  </p>
                </div>
                <button type="button" className="ncp-close-btn" aria-label="Close" onClick={() => { reset(); onClose(); }}>✕</button>
              </div>

              {/* STEP TABS */}
              <div className="ncp-steps" role="tablist" style={{ marginBottom: 18 }}>
                {STEPS.map(({ icon, label }, i) => (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    aria-selected={step === i}
                    className={cn("ncp-step", step === i && "ncp-active", i < step && "ncp-done")}
                    onClick={() => { if (i < step) { setError(null); setFieldErrors({}); setStep(i); } }}
                    disabled={i > step}
                    title={i > step ? "Complete the current step first" : i < step ? `Go back to ${label}` : undefined}
                    style={{ cursor: i < step ? "pointer" : i > step ? "not-allowed" : "default" }}
                  >
                    <span className="ncp-step-num" style={{
                      fontSize: 14,
                      background: step === i ? "rgba(255,255,255,0.22)" : i < step ? "var(--ncp-green)" : "var(--ncp-border)",
                      color: i < step && step !== i ? "#fff" : undefined,
                    }}>
                      {i < step ? "✓" : icon}
                    </span>
                    {label}
                  </button>
                ))}
              </div>

              {/* STEP BODY */}
              <div className="ncp-panel ncp-panel-active">
                <div className="ncp-section">
                  <div className="ncp-section-body" style={{ maxHeight: "none", overflow: "visible" }}>
                    {step < 3 && (
                      <div style={{
                        marginBottom: 12, padding: "8px 12px", borderRadius: "var(--ncp-radius)",
                        background: "rgba(225,111,61,.08)", border: "1px solid rgba(225,111,61,.2)",
                        fontSize: 11.5, color: "var(--ncp-text-secondary)", lineHeight: 1.5,
                      }}>
                        {step === 0 && <>Step 1 of 5 — Enter the <strong>Official name</strong> (required), then click <strong>Create client →</strong> at the bottom.</>}
                        {step === 1 && <>Step 2 of 5 — Enter the <strong>SBU / Engagement name</strong> (required), then click <strong>Create project →</strong>.</>}
                        {step === 2 && <>Step 3 of 5 — Set validation rules (optional fields can be left blank), then click <strong>Save config →</strong>.</>}
                      </div>
                    )}
                    {renderStep()}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="ncp-footer" style={{ position: "relative", zIndex: 2 }}>
            {error && (
              <div style={{
                flex: "1 1 100%",
                margin: "0 0 4px",
                padding: "8px 12px",
                background: "rgba(239,68,68,.07)",
                border: "1px solid rgba(239,68,68,.25)",
                borderRadius: "var(--ncp-radius)",
                fontSize: 12,
                color: "#b91c1c",
              }}>
                {error}
              </div>
            )}
            <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => { reset(); onClose(); }} disabled={saving}>
              Cancel
            </button>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {renderFooter()}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
