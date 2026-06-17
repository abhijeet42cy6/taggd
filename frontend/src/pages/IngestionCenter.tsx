import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, invalidateCache, queries, columnMappingEntryCount, type IngestionEventRow, type Project } from "@/lib/api";
import { isPlatformAdminRole, isRecruiterUser, useAuth } from "@/lib/auth";
import { PlatformSection, Tabs } from "@/components/platform/PlatformBlocks";
import { ColumnMappingDisplay } from "@/components/ColumnMappingDisplay";
import "@/styles/ingestion-center.css";

// ─── TYPES ────────────────────────────────────────────────────────────────────

type LogLevel = "info" | "success" | "warning" | "error";
type LogEntry = { id: string; message: string; level: LogLevel; ts: string };
type JobStatus = "idle" | "running" | "done" | "error" | "review" | "preview";

type Step = { label: string; status: "pending" | "running" | "done" | "error" };

const EXPRESS_STEPS: string[] = [
  "Saving file",
  "AI: Identify Sheets",
  "AI: Map Columns",
  "AI: Synthesize Revenue Logic",
  "Processing Records",
  "Committing to DB",
];

const PRO_INSPECT_STEPS: string[] = [
  "Saving file",
  "AI: Classify Sheets",
  "AI: Match to Account",
  "Awaiting user review",
];

const SLA_STEPS: string[] = [
  "Saving file",
  "Parsing SLA basefile",
  "Validating months & metrics",
  "Committing to DB",
];

const WFM_STEPS: string[] = [
  "Saving file",
  "Parsing WFM headcount data",
  "Validating bench & gaps",
  "Committing to DB",
];

const FINANCE_STEPS: string[] = [
  "Saving file",
  "Parsing finance ledger",
  "Validating Lacs values",
  "Committing to DB",
];

const CANDIDATES_STEPS: string[] = [
  "Saving file",
  "Detecting Candidate Tracker sheet",
  "Mapping columns & upserting rows",
  "Linking mandates & master records",
];

const REVENUE_TRACKERS_STEPS: string[] = [
  "Saving workbook(s)",
  "Parsing forecast & visibility sheets",
  "Resolving projects & upserting rows",
  "Committing to DB",
];

// ─── UTILS ────────────────────────────────────────────────────────────────────

function makeId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }
function tsNow() { return new Date().toLocaleTimeString("en-IN", { hour12: false }); }

const TAG_COLOR: Record<string, string> = {
  success: "var(--green)", warning: "var(--amber)", error: "var(--red)", info: "var(--text-subtle)",
};

// ─── HOOK ─────────────────────────────────────────────────────────────────────

function useIngestionRun(stepLabels: string[]) {
  const [job, setJob] = useState<JobStatus>("idle");
  const [steps, setSteps] = useState<Step[]>(stepLabels.map((l) => ({ label: l, status: "pending" })));
  const [log, setLog] = useState<LogEntry[]>([]);
  const [percent, setPercent] = useState(0);

  const reset = () => {
    setJob("idle");
    setSteps(stepLabels.map((l) => ({ label: l, status: "pending" })));
    setLog([]);
    setPercent(0);
  };

  const appendLog = useCallback((message: string, level: LogLevel = "info") => {
    setLog((p) => [...p, { id: makeId(), message, level, ts: tsNow() }]);
  }, []);

  const setStep = useCallback((idx: number, status: Step["status"]) => {
    setSteps((p) => {
      const n = [...p];
      n[idx] = { ...n[idx], status };
      return n;
    });
    setPercent(Math.round(((idx + (status === "done" ? 1 : 0.5)) / stepLabels.length) * 100));
  }, [stepLabels.length]);

  return { job, setJob, steps, log, percent, appendLog, setStep, reset };
}

// ─── STEP TRACKER ─────────────────────────────────────────────────────────────

function StepTracker({ steps, percent }: { steps: Step[]; percent: number }) {
  const stepColor = (s: Step["status"]) =>
    s === "done" ? "var(--green)" : s === "running" ? "var(--accent)" : s === "error" ? "var(--red)" : "var(--text-muted)";

  const stepIcon = (s: Step["status"]) =>
    s === "done" ? "✓" : s === "running" ? "●" : s === "error" ? "✗" : "○";

  return (
    <div>
      {/* PROGRESS BAR */}
      <div style={{ height: 4, background: "var(--bg3)", borderRadius: 2, overflow: "hidden", marginBottom: 14 }}>
        <div style={{
          height: "100%", borderRadius: 2, transition: "width .5s",
          background: `linear-gradient(90deg, var(--accent), var(--accent2))`,
          width: `${percent}%`,
        }} />
      </div>
      {/* STEP LIST */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: `${stepColor(step.status)}18`,
              border: `1.5px solid ${stepColor(step.status)}`,
              fontSize: 10, fontFamily: "'DM Mono',monospace",
              color: stepColor(step.status),
              ...(step.status === "running" ? { animation: "pulse 1.2s infinite" } : {}),
            }}>{stepIcon(step.status)}</div>
            <span style={{
              fontSize: 11.5,
              color: step.status === "running" ? "var(--text)" : step.status === "done" ? "var(--text-subtle)" : step.status === "error" ? "var(--red)" : "var(--text-muted)",
            }}>{step.label}</span>
            {step.status === "running" && (
              <span style={{ fontSize: 9.5, color: "var(--accent)", fontFamily: "'DM Mono',monospace", animation: "pulse 1.2s infinite" }}>
                running...
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── LOG PANEL ────────────────────────────────────────────────────────────────

function LogPanel({ log }: { log: LogEntry[] }) {
  if (!log.length) return null;
  return (
    <div style={{
      marginTop: 14, background: "var(--bg)", border: "1px solid var(--border)",
      borderRadius: 7, padding: 10, maxHeight: 160, overflowY: "auto",
      fontFamily: "'DM Mono',monospace", fontSize: 10.5,
    }}>
      {log.map((e) => (
        <div key={e.id} style={{ display: "flex", gap: 8, marginBottom: 3 }}>
          <span style={{ color: "var(--text-muted)" }}>{e.ts}</span>
          <span style={{ color: TAG_COLOR[e.level] }}>{e.message}</span>
        </div>
      ))}
    </div>
  );
}

// ─── RESULT CARD (Agent Output) ───────────────────────────────────────────────

function AgentOutputCard({
  result, filename, onCommit, onReject,
}: {
  result: Record<string, any>;
  filename: string;
  onCommit?: () => void;
  onReject?: () => void;
}) {
  const sheets = result?.sheets || {};
  const mapping = result?.mapping;
  const mappedCount = columnMappingEntryCount(mapping);

  return (
    <div className="platform-card" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace" }}>
          Agent Output — {filename}
        </div>
        {result.status === "success"
          ? <span className="platform-badge green">Complete</span>
          : <span className="platform-badge amber">Needs Review</span>
        }
      </div>
      <div className="platform-grid-3">
        {/* SHEETS */}
        <div>
          <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 8, letterSpacing: ".1em" }}>
            Identified Sheets
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {Object.entries(sheets).map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 8px", background: "var(--bg2)", borderRadius: 5, fontSize: 11.5 }}>
                <span style={{ textTransform: "capitalize" }}>{k}</span>
                <span className="platform-badge blue">{String(v)}</span>
              </div>
            ))}
            {Object.keys(sheets).length === 0 && Array.isArray(result.data_sheets) && result.data_sheets.length > 0 && (
              <div style={{ padding: "6px 8px", background: "var(--bg2)", borderRadius: 5, fontSize: 11 }}>
                <span style={{ color: "var(--text-muted)", fontSize: 9, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Data sheets</span>
                {result.data_sheets.map((s: string) => (
                  <div key={s} style={{ fontFamily: "'DM Mono',monospace", marginBottom: 2 }}>{s}</div>
                ))}
              </div>
            )}
            {result.all_sheets && result.all_sheets.map((s: string) => (
              <div key={s} style={{ display: "flex", justifyContent: "space-between", padding: "5px 8px", background: "var(--bg2)", borderRadius: 5, fontSize: 11.5 }}>
                <span>{s}</span>
                <span className="platform-badge blue">sheet</span>
              </div>
            ))}
          </div>
        </div>

        {/* SUMMARY + LOGIC SNIPPET (mapping moved below full-width) */}
        <div>
          <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 8, letterSpacing: ".1em" }}>
            Ingest summary
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-subtle)", lineHeight: 1.5, marginBottom: 8 }}>
            <strong style={{ color: "var(--accent)" }}>{mappedCount}</strong> column links
            (core + requisition fields when schema v2).
          </div>
            {result.logic_explanation && (
              <div style={{ marginTop: 8, padding: "6px 8px", background: "rgba(79,143,255,0.07)", borderRadius: 5, color: "var(--text-subtle)", fontSize: 10, lineHeight: 1.5 }}>
                <span style={{ color: "var(--accent)" }}>Logic:</span> {result.logic_explanation?.slice(0, 120)}…
              </div>
            )}
            {result.suggested && (
              <div style={{ marginTop: 6, padding: "6px 8px", background: "rgba(0,229,160,0.06)", borderRadius: 5, color: "var(--text-subtle)", fontSize: 10, lineHeight: 1.5 }}>
                <span style={{ color: "var(--green)" }}>AI Reasoning:</span> {result.suggested?.reasoning?.slice(0, 120)}…
              </div>
            )}
        </div>

        {/* PRE-COMMIT SUMMARY */}
        <div>
          <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 8, letterSpacing: ".1em" }}>
            Pre-Commit Summary
          </div>
          <div className="kv-row"><span className="kv-key">Project ID</span>
            <span className="kv-val" style={{ color: "var(--accent)", fontFamily: "'DM Mono',monospace" }}>
              {result.project_id ? `PRJ-${result.project_id}` : "—"}
            </span>
          </div>
          <div className="kv-row"><span className="kv-key">Headers Found</span>
            <span className="kv-val">{result.headers_found?.length ?? "—"}</span>
          </div>
          <div className="kv-row"><span className="kv-key">Mapped Fields</span>
            <span className="kv-val" style={{ color: "var(--green)" }}>{mappedCount}</span>
          </div>
          <div className="kv-row"><span className="kv-key">Status</span>
            <span className="kv-val" style={{ color: result.status === "success" ? "var(--green)" : "var(--amber)" }}>
              {result.status}
            </span>
          </div>
          {(onCommit || onReject) && (
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              {onCommit && (
                <button onClick={onCommit} style={{
                  flex: 1, padding: "7px 0", borderRadius: 7, cursor: "pointer",
                  background: "rgba(0,229,160,0.1)", border: "1px solid var(--green)",
                  color: "var(--green)", fontSize: 11, fontFamily: "'DM Mono',monospace",
                }}>✓ Commit</button>
              )}
              {onReject && (
                <button onClick={onReject} style={{
                  flex: 1, padding: "7px 0", borderRadius: 7, cursor: "pointer",
                  background: "rgba(255,79,107,0.1)", border: "1px solid var(--red)",
                  color: "var(--red)", fontSize: 11, fontFamily: "'DM Mono',monospace",
                }}>✗ Reject</button>
              )}
            </div>
          )}
        </div>
      </div>

      {mappedCount > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <ColumnMappingDisplay mapping={mapping} variant="card" scrollMaxClass="max-h-[min(50vh,480px)]" />
        </div>
      )}
    </div>
  );
}

// ─── PRO PATH CONFIRM PANEL ────────────────────────────────────────────────────

function ProConfirmPanel({
  inspectResult, onConfirm, onReject,
}: {
  inspectResult: Record<string, any>;
  onConfirm: (sheets: string[], contractSheet: string) => void;
  onReject: () => void;
}) {
  const allSheets: string[] = inspectResult.all_sheets || [];
  const suggested = inspectResult.suggested || {};
  const [dataSheets, setDataSheets] = useState<string[]>(suggested.data_sheets || []);
  const [contractSheet, setContractSheet] = useState<string>(suggested.contract_sheet || allSheets[0] || "");

  const toggle = (sheet: string) =>
    setDataSheets((p) => p.includes(sheet) ? p.filter((s) => s !== sheet) : [...p, sheet]);

  return (
    <div style={{ marginTop: 14 }}>
      <div className="alert-banner amber" style={{ marginBottom: 12 }}>
        ⚠ Pro Path — Review sheet assignments before committing to database
      </div>
      <div className="platform-grid-3">
        {/* DATA SHEETS */}
        <div>
          <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 8, letterSpacing: ".1em" }}>
            Select Data Sheets
          </div>
          {allSheets.map((s) => (
            <label key={s} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--bg2)", borderRadius: 5, marginBottom: 5, cursor: "pointer" }}>
              <input type="checkbox" checked={dataSheets.includes(s)} onChange={() => toggle(s)}
                style={{ accentColor: "var(--accent)" }} />
              <span style={{ fontSize: 11.5 }}>{s}</span>
              {suggested.data_sheets?.includes(s) && (
                <span className="platform-badge blue" style={{ marginLeft: "auto" }}>AI suggest</span>
              )}
            </label>
          ))}
        </div>

        {/* CONTRACT SHEET */}
        <div>
          <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 8, letterSpacing: ".1em" }}>
            Contract / Revenue Sheet
          </div>
          {allSheets.map((s) => (
            <label key={s} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--bg2)", borderRadius: 5, marginBottom: 5, cursor: "pointer" }}>
              <input type="radio" name="contract" value={s} checked={contractSheet === s} onChange={() => setContractSheet(s)}
                style={{ accentColor: "var(--accent2)" }} />
              <span style={{ fontSize: 11.5 }}>{s}</span>
              {suggested.contract_sheet === s && (
                <span className="platform-badge teal" style={{ marginLeft: "auto" }}>AI suggest</span>
              )}
            </label>
          ))}
        </div>

        {/* AI REASONING + CONFIRM */}
        <div>
          <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 8, letterSpacing: ".1em" }}>
            AI Reasoning
          </div>
          {suggested.reasoning && (
            <div style={{ padding: "8px 10px", background: "rgba(79,143,255,0.07)", borderRadius: 7, color: "var(--text-subtle)", fontSize: 10.5, lineHeight: 1.6, marginBottom: 14 }}>
              {suggested.reasoning}
            </div>
          )}
          <div className="kv-row"><span className="kv-key">Project ID</span>
            <span className="kv-val" style={{ color: "var(--accent)", fontFamily: "'DM Mono',monospace" }}>
              PRJ-{inspectResult.project_id}
            </span>
          </div>
          <div className="kv-row"><span className="kv-key">Data Sheets</span>
            <span className="kv-val" style={{ color: "var(--green)" }}>{dataSheets.length} selected</span>
          </div>
          <div className="kv-row"><span className="kv-key">Contract Sheet</span>
            <span className="kv-val" style={{ color: "var(--accent2)" }}>{contractSheet || "—"}</span>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button onClick={() => onConfirm(dataSheets, contractSheet)} disabled={!dataSheets.length || !contractSheet}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 7, cursor: dataSheets.length && contractSheet ? "pointer" : "not-allowed",
                background: dataSheets.length && contractSheet ? "rgba(0,229,160,0.1)" : "rgba(0,229,160,0.04)",
                border: "1px solid var(--green)", color: "var(--green)", fontSize: 11, fontFamily: "'DM Mono',monospace",
              }}>▶ Run Pipeline</button>
            <button onClick={onReject} style={{
              flex: 1, padding: "8px 0", borderRadius: 7, cursor: "pointer",
              background: "rgba(255,79,107,0.1)", border: "1px solid var(--red)",
              color: "var(--red)", fontSize: 11, fontFamily: "'DM Mono',monospace",
            }}>✗ Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── UPLOAD DROP ZONE ──────────────────────────────────────────────────────────

function DropZone({
  title, subtitle, icon, accent, accept = ".xlsx,.xls,.csv",
  onFile, disabled = false,
}: {
  title: string; subtitle: string; icon: string; accent: string;
  accept?: string; onFile: (f: File) => void; disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  return (
    <label style={{ cursor: disabled ? "not-allowed" : "pointer" }}>
      <input ref={inputRef} type="file" hidden accept={accept}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { onFile(f); e.target.value = ""; } }}
        disabled={disabled} />
      <div
        className="ingestion-center__drop"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `1.5px dashed ${dragOver ? accent : `${accent}60`}`,
          padding: "24px 16px", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 8,
          background: dragOver
            ? `color-mix(in srgb, ${accent} 14%, var(--surface-raised))`
            : "color-mix(in srgb, var(--accent) 6%, var(--surface-muted))",
          transition: "all var(--t-fast)", opacity: disabled ? 0.5 : 1,
          minHeight: 140, textAlign: "center",
        }}
      >
        <div style={{ fontSize: 30, color: accent }}>{icon}</div>
        <div className="ingestion-center__drop-title">{title}</div>
        <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.55 }}>{subtitle}</div>
        <div style={{ fontSize: "10px", color: accent, fontFamily: "var(--mono)", marginTop: 4, fontWeight: 500 }}>
          Click or drag & drop
        </div>
      </div>
    </label>
  );
}

function InfoCallout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <aside className="ingestion-center__callout" aria-label={title}>
      <h3 className="ingestion-center__callout-title">{title}</h3>
      <div className="ingestion-center__callout-body">{children}</div>
    </aside>
  );
}

// ─── RECENT ACTIVITY (server — role-scoped) ───────────────────────────────────

const KIND_LABEL: Record<string, string> = {
  express: "Express",
  direct: "Direct Upload",
  pro_inspect: "Pro · inspect",
  pro_confirm: "Pro · run",
  sla: "SLA",
  wfm: "WFM",
  finance: "Finance",
  revenue_trackers: "Revenue trackers",
  candidates: "Candidates",
};

const INGESTION_TABS = [
  "Direct Upload",
  "Express",
  "Pro Path",
  "SLA",
  "WFM",
  "Finance",
  "Candidates",
  "Run Log",
] as const;
type IngestionTab = (typeof INGESTION_TABS)[number];

function IngestionActivitySection({
  events,
  loading,
  role,
}: {
  events: IngestionEventRow[];
  loading: boolean;
  role: string | undefined;
}) {
  const scopeHint =
    isPlatformAdminRole(role) || role === "executive"
      ? "Portfolio-wide: all users’ uploads and ingest runs."
      : "Your runs and teammates’ activity on projects you share (project-scoped).";
  return (
    <div className="ingestion-center__activity">
    <PlatformSection title="Recent ingestion activity">
      <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 16px", lineHeight: 1.55, maxWidth: "40rem" }}>
        {scopeHint}
      </p>
      {loading ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "12px 0" }}>Loading activity…</div>
      ) : events.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "16px 12px", textAlign: "center", borderRadius: 10, border: "1px dashed var(--border)", background: "var(--surface-muted)" }}>
          No recorded runs yet. Uploads from Express, Pro, SLA, WFM, Finance, and Candidates appear here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {events.map((ev) => {
            const st = ev.status === "success" ? "success" : ev.status === "error" ? "error" : "warning";
            const color =
              st === "success" ? "var(--green)" : st === "error" ? "var(--red)" : "var(--amber)";
            const when = ev.created_at
              ? new Date(ev.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
              : "—";
            return (
              <div
                key={ev.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) auto",
                  gap: 10,
                  alignItems: "start",
                  padding: "10px 12px",
                  background: "var(--surface-raised, #fff)",
                  borderRadius: 10,
                  border: "1px solid color-mix(in srgb, var(--border) 80%, transparent)",
                  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>
                      {ev.public_id}
                    </span>
                    <span style={{ fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>{when}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-subtle)", lineHeight: 1.4 }}>
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>{ev.actor_email || "—"}</span>
                    {" · "}
                    <span>{KIND_LABEL[ev.kind] ?? ev.kind}</span>
                    {ev.project_id != null ? (
                      <span style={{ color: "var(--text-muted)" }}>{` · PRJ-${ev.project_id}`}</span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 11.5, marginTop: 4, wordBreak: "break-word" }}>{ev.filename || "—"}</div>
                </div>
                <span
                  style={{
                    fontSize: 9.5,
                    background: `${color}18`,
                    color,
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontFamily: "'DM Mono',monospace",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ev.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </PlatformSection>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function IngestionCenter() {
  const { user } = useAuth();
  const recruiterView = isRecruiterUser(user);
  const [tab, setTab] = useState<IngestionTab>("Direct Upload");

  const [ingestionEvents, setIngestionEvents] = useState<IngestionEventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const refreshIngestionEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const data = await queries.ingestionEvents(50);
      setIngestionEvents(data.events ?? []);
    } catch {
      setIngestionEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshIngestionEvents();
  }, [refreshIngestionEvents]);

  useEffect(() => {
    let cancelled = false;
    void queries.projects().then((rows) => {
      if (!cancelled) setProjectOptions(rows ?? []);
    }).catch(() => {
      if (!cancelled) setProjectOptions([]);
    });
    return () => { cancelled = true; };
  }, []);

  // ── express ──
  const express = useIngestionRun(EXPRESS_STEPS);
  const [expressResult, setExpressResult] = useState<Record<string, any> | null>(null);

  // ── pro ──
  const proInspect = useIngestionRun(PRO_INSPECT_STEPS);
  const proRun = useIngestionRun(EXPRESS_STEPS);
  const [proInspectResult, setProInspectResult] = useState<Record<string, any> | null>(null);
  const [proRunResult, setProRunResult] = useState<Record<string, any> | null>(null);

  // ── sla ──
  const sla = useIngestionRun(SLA_STEPS);
  const [slaResult, setSlaResult] = useState<Record<string, any> | null>(null);

  // ── wfm ──
  const wfm = useIngestionRun(WFM_STEPS);
  const [wfmResult, setWfmResult] = useState<Record<string, any> | null>(null);

  // ── finance ──
  const finance = useIngestionRun(FINANCE_STEPS);
  const [financeResult, setFinanceResult] = useState<Record<string, any> | null>(null);

  // ── candidates ──
  const candidates = useIngestionRun(CANDIDATES_STEPS);
  const [candidatesResult, setCandidatesResult] = useState<Record<string, any> | null>(null);
  const [candidateProjectId, setCandidateProjectId] = useState<number | "">("");
  const [projectOptions, setProjectOptions] = useState<Project[]>([]);

  // ── revenue forecast + visibility (Express tab) ──
  const revenueTrackers = useIngestionRun(REVENUE_TRACKERS_STEPS);
  const [revForecastFile, setRevForecastFile] = useState<File | null>(null);
  const [revVisibilityFile, setRevVisibilityFile] = useState<File | null>(null);
  const [revenueIngestResult, setRevenueIngestResult] = useState<Record<string, any> | null>(null);

  // ── SIMULATE STEPS with actual API call ──────────────────────────────────────
  async function simulateSteps(
    run: ReturnType<typeof useIngestionRun>,
    stepsToSteps: string[],
    apiCallAtStep: number,
    doCall: () => Promise<any>,
  ) {
    run.reset();
    run.setJob("running");
    // run first few steps quickly
    for (let i = 0; i < apiCallAtStep; i++) {
      run.setStep(i, "running");
      await delay(400 + Math.random() * 200);
      run.setStep(i, "done");
    }
    // real API step
    run.setStep(apiCallAtStep, "running");
    try {
      const result = await doCall();
      run.setStep(apiCallAtStep, "done");
      // remaining steps
      for (let i = apiCallAtStep + 1; i < stepsToSteps.length; i++) {
        run.setStep(i, "running");
        await delay(500 + Math.random() * 300);
        run.setStep(i, "done");
      }
      run.setJob("done");
      return result;
    } catch (err: any) {
      run.setStep(apiCallAtStep, "error");
      run.setJob("error");
      throw err;
    }
  }

  // ── EXPRESS UPLOAD ────────────────────────────────────────────────────────────
  async function handleExpress(file: File) {
    express.appendLog(`[${tsNow()}] Starting Express ingestion for ${file.name}`);
    express.appendLog(`[${tsNow()}] Invoking AI pipeline…`);
    try {
      const form = new FormData(); form.append("file", file);
      const result = await simulateSteps(
        express, EXPRESS_STEPS, 2,
        async () => {
          const r = await api.post("/upload", form);
          return r.data;
        }
      );
      setExpressResult(result);
      express.appendLog(`[${tsNow()}] ✓ Done — Project ${result.project_id}, ${columnMappingEntryCount(result.mapping)} column links mapped`, "success");
    } catch (err: any) {
      express.appendLog(`[${tsNow()}] ✗ Error: ${err?.response?.data?.detail || err.message}`, "error");
    } finally {
      void refreshIngestionEvents();
    }
  }

  // ── PRO INSPECT ────────────────────────────────────────────────────────────
  async function handleProInspect(file: File) {
    proInspect.appendLog(`[${tsNow()}] Starting Pro inspection for ${file.name}`);
    setProInspectResult(null); setProRunResult(null);
    proRun.reset();
    try {
      const form = new FormData(); form.append("file", file);
      const result = await simulateSteps(
        proInspect, PRO_INSPECT_STEPS, 1,
        async () => {
          const r = await api.post("/upload/pro/inspect", form);
          return r.data;
        }
      );
      setProInspectResult(result);
      proInspect.appendLog(`[${tsNow()}] ✓ Inspection done — ${result.all_sheets?.length} sheets found. Awaiting review.`, "success");
    } catch (err: any) {
      proInspect.appendLog(`[${tsNow()}] ✗ Error: ${err?.response?.data?.detail || err.message}`, "error");
    } finally {
      void refreshIngestionEvents();
    }
  }

  // ── PRO CONFIRM ────────────────────────────────────────────────────────────
  async function handleProConfirm(dataSheets: string[], contractSheet: string) {
    if (!proInspectResult) return;
    proRun.appendLog(`[${tsNow()}] Confirming Pro pipeline with ${dataSheets.length} data sheets`);
    proRun.appendLog(`[${tsNow()}] Contract sheet: ${contractSheet}`);
    setProRunResult(null);
    try {
      const result = await simulateSteps(
        proRun, EXPRESS_STEPS, 2,
        async () => {
          const r = await api.post("/upload/pro/confirm", {
            project_id: proInspectResult.project_id,
            data_sheets: dataSheets,
            contract_sheet: contractSheet,
          });
          return r.data;
        }
      );
      setProRunResult(result);
      proRun.appendLog(`[${tsNow()}] ✓ Pro pipeline complete — Project ${result.project_id}`, "success");
    } catch (err: any) {
      proRun.appendLog(`[${tsNow()}] ✗ Error: ${err?.response?.data?.detail || err.message}`, "error");
    } finally {
      void refreshIngestionEvents();
    }
  }

  // ── SPECIALIZED INGEST ────────────────────────────────────────────────────────
  async function handleSla(file: File) {
    sla.appendLog(`[${tsNow()}] Starting SLA ingestion: ${file.name}`);
    try {
      const form = new FormData(); form.append("file", file);
      const result = await simulateSteps(
        sla, SLA_STEPS, 2,
        async () => { const r = await api.post("/sla/upload", form); return r.data; }
      );
      setSlaResult(result);
      if (Array.isArray(result?.logs)) {
        for (const line of result.logs as string[]) {
          sla.appendLog(line, "info");
        }
      }
      sla.appendLog(`[${tsNow()}] ✓ SLA data committed`, "success");
    } catch (err: any) {
      sla.appendLog(`[${tsNow()}] ✗ ${err?.response?.data?.detail || err.message}`, "error");
    } finally {
      void refreshIngestionEvents();
    }
  }

  async function handleWfm(file: File) {
    wfm.appendLog(`[${tsNow()}] Starting WFM ingestion: ${file.name}`);
    try {
      const form = new FormData(); form.append("file", file);
      const result = await simulateSteps(
        wfm, WFM_STEPS, 2,
        async () => { const r = await api.post("/wfm/upload", form); return r.data; }
      );
      setWfmResult(result);
      if (Array.isArray(result?.logs)) {
        for (const line of result.logs as string[]) {
          wfm.appendLog(line, "info");
        }
      }
      wfm.appendLog(`[${tsNow()}] ✓ WFM data committed`, "success");
      invalidateCache("wfm");
    } catch (err: any) {
      wfm.appendLog(`[${tsNow()}] ✗ ${err?.response?.data?.detail || err.message}`, "error");
    } finally {
      void refreshIngestionEvents();
    }
  }

  async function handleFinance(file: File) {
    finance.appendLog(`[${tsNow()}] Starting Finance ingestion: ${file.name} (values in Lacs)`);
    try {
      const form = new FormData(); form.append("file", file);
      const result = await simulateSteps(
        finance, FINANCE_STEPS, 2,
        async () => { const r = await api.post("/finance/upload", form); return r.data; }
      );
      setFinanceResult(result);
      finance.appendLog(`[${tsNow()}] ✓ Finance ledger committed`, "success");
    } catch (err: any) {
      finance.appendLog(`[${tsNow()}] ✗ ${err?.response?.data?.detail || err.message}`, "error");
    } finally {
      void refreshIngestionEvents();
    }
  }

  async function handleCandidates(file: File) {
    candidates.appendLog(`[${tsNow()}] Starting candidate tracker ingest: ${file.name}`);
    if (candidateProjectId !== "") {
      candidates.appendLog(`[${tsNow()}] Target project: PRJ-${candidateProjectId}`);
    } else {
      candidates.appendLog(`[${tsNow()}] No project selected — matching from filename`);
    }
    setCandidatesResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (candidateProjectId !== "") form.append("project_id", String(candidateProjectId));
      const result = await simulateSteps(
        candidates, CANDIDATES_STEPS, 2,
        async () => { const r = await api.post("/candidates/ingest", form); return r.data; },
      );
      setCandidatesResult(result);
      if (Array.isArray(result?.logs)) {
        for (const line of result.logs as string[]) {
          candidates.appendLog(line, "info");
        }
      }
      const pass3 = result?.offer_onboarding_pass as Record<string, unknown> | undefined;
      if (pass3 && !pass3.skipped) {
        candidates.appendLog(
          `[${tsNow()}] Pass 3 — matched ${pass3.matched ?? 0}, patched ${pass3.patched ?? 0}, no match ${pass3.skipped_no_match ?? 0}`,
          "info",
        );
      } else if (pass3?.reason === "no_sheet") {
        candidates.appendLog(`[${tsNow()}] Pass 3 — no Offer & Onboarding sheet in workbook`, "info");
      }
      candidates.appendLog(
        `[${tsNow()}] ✓ ${result.message || "Candidate rows committed"}`,
        "success",
      );
      invalidateCache("candidates");
    } catch (err: any) {
      candidates.appendLog(`[${tsNow()}] ✗ ${err?.response?.data?.detail || err.message}`, "error");
    } finally {
      void refreshIngestionEvents();
    }
  }

  async function handleRevenueTrackersIngest() {
    if (!revForecastFile && !revVisibilityFile) return;
    const desc = [revForecastFile?.name, revVisibilityFile?.name].filter(Boolean).join(" + ");
    revenueTrackers.appendLog(`[${tsNow()}] Revenue templates: ${desc}`);
    revenueTrackers.appendLog(`[${tsNow()}] Posting to /revenue-trackers/ingest-upload…`);
    setRevenueIngestResult(null);
    try {
      const form = new FormData();
      if (revForecastFile) form.append("forecast_file", revForecastFile);
      if (revVisibilityFile) form.append("visibility_file", revVisibilityFile);
      const result = await simulateSteps(
        revenueTrackers,
        REVENUE_TRACKERS_STEPS,
        2,
        async () => {
          const r = await api.post("/revenue-trackers/ingest-upload", form);
          return r.data;
        },
      );
      setRevenueIngestResult(result);
      const fc = result?.forecast?.rows_upserted;
      const vis = result?.visibility?.rows_upserted;
      const parts: string[] = [];
      if (fc != null) parts.push(`forecast ${fc} rows`);
      if (vis != null) parts.push(`visibility ${vis} rows`);
      revenueTrackers.appendLog(`[${tsNow()}] ✓ Done — ${parts.join(", ") || "committed"}`, "success");
      invalidateCache("revenue-trackers/");
      setRevForecastFile(null);
      setRevVisibilityFile(null);
    } catch (err: any) {
      revenueTrackers.appendLog(`[${tsNow()}] ✗ ${err?.response?.data?.detail || err.message}`, "error");
    } finally {
      void refreshIngestionEvents();
    }
  }

  // ── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <div className="ingestion-center">
      <header className="ingestion-center__hero">
        <p className="ingestion-center__eyebrow">Data operations</p>
        <h1 className="ingestion-center__title">Ingestion Center</h1>
        <p className="ingestion-center__lede">
          {recruiterView
            ? "Run uploads for your assigned projects. The activity feed shows ingestion you triggered; project scope still applies to matching and commits."
            : "Upload client trackers using the standard template (recommended), or use Express / Pro Path for other workbook formats."}
        </p>
      </header>

      <div className="ingestion-center__tabs">
        <div className="ingestion-center__tabRail">
          <Tabs tabs={[...INGESTION_TABS]} active={tab} onChange={(t) => setTab(t as IngestionTab)} />
        </div>
      </div>

      {/* ── DIRECT UPLOAD TAB ────────────────────────────────────────────────── */}
      {tab === "Direct Upload" && (
        <DirectUploadTab onUploadDone={refreshIngestionEvents} />
      )}

      {/* ── EXPRESS TAB ──────────────────────────────────────────────────────── */}
      {tab === "Express" && (
        <PlatformSection title="Express">
          <p className="ingestion-center__tabIntro">
            For client-specific Excel formats that don&apos;t use the standard template. If you have the Taggd template,
            use <strong>Direct Upload</strong> instead — it is faster and more reliable.
          </p>
          {express.job === "idle" && (
            <div className="ingestion-center__grid2">
              <DropZone
                title="Express upload"
                subtitle={"Tracking sheet (Req / Placement)\nAI auto-maps columns & synthesizes revenue logic"}
                icon="⬆"
                accent="var(--accent)"
                onFile={handleExpress}
                disabled={false}
              />
              <InfoCallout title="How express works">
                <ul>
                  <li>Supports Requisitions, Placement, and Offer trackers (this drop zone).</li>
                  <li>
                    <strong>Revenue weekly templates</strong> (below): forecast + visibility workbooks use the same ingest as
                    the CLI script.
                  </li>
                  <li>AI identifies sheets, maps columns, and synthesizes revenue logic for tracker uploads.</li>
                  <li>Progress and logs appear below after you upload.</li>
                </ul>
              </InfoCallout>
            </div>
          )}
          {express.job !== "idle" && (
            <>
              <StepTracker steps={express.steps} percent={express.percent} />
              <LogPanel log={express.log} />
            </>
          )}
          {express.job === "done" && expressResult && (
            <AgentOutputCard result={expressResult} filename={expressResult.filename || "file.xlsx"}
              onCommit={() => express.reset()}
              onReject={() => { express.reset(); setExpressResult(null); }}
            />
          )}
          {express.job === "error" && (
            <div style={{ marginTop: 10 }}>
              <div className="alert-banner red">Upload failed — see log above for details</div>
              <button onClick={express.reset} style={{ marginTop: 8, background: "none", border: "1px solid var(--red)", color: "var(--red)", padding: "5px 14px", borderRadius: 7, cursor: "pointer", fontSize: 11 }}>
                ← Try Again
              </button>
            </div>
          )}

          <div className="ingestion-center__subsection">
            <h2 className="ingestion-center__subsection-title">Revenue weekly templates</h2>
            {revenueTrackers.job === "idle" && (
              <div className="ingestion-center__grid2">
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <DropZone
                    title="Weekly forecast workbook"
                    subtitle={"Sheet: Revenue Forecast Data\nRevenue_Forecast_Template*.xlsx"}
                    icon="📊"
                    accent="#c2410c"
                    onFile={(f) => setRevForecastFile(f)}
                    disabled={false}
                  />
                  <DropZone
                    title="Revenue visibility workbook"
                    subtitle={"Sheet: Revenue Tracker\nRevenue_Visibility_Tracker.xlsx"}
                    icon="👁"
                    accent="#0d9488"
                    onFile={(f) => setRevVisibilityFile(f)}
                    disabled={false}
                  />
                  {(revForecastFile || revVisibilityFile) && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
                        {revForecastFile ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>Forecast: {revForecastFile.name}</span>
                            <button
                              type="button"
                              onClick={() => setRevForecastFile(null)}
                              style={{ flexShrink: 0, fontSize: 10, border: "none", background: "none", color: "var(--accent)", cursor: "pointer" }}
                            >
                              Clear
                            </button>
                          </div>
                        ) : null}
                        {revVisibilityFile ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>Visibility: {revVisibilityFile.name}</span>
                            <button
                              type="button"
                              onClick={() => setRevVisibilityFile(null)}
                              style={{ flexShrink: 0, fontSize: 10, border: "none", background: "none", color: "var(--accent)", cursor: "pointer" }}
                            >
                              Clear
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRevenueTrackersIngest()}
                        disabled={!revForecastFile && !revVisibilityFile}
                        style={{
                          padding: "10px 16px",
                          borderRadius: "var(--radius-base)",
                          border: "none",
                          cursor: revForecastFile || revVisibilityFile ? "pointer" : "not-allowed",
                          background: revForecastFile || revVisibilityFile ? "var(--accent)" : "var(--surface-muted)",
                          color: revForecastFile || revVisibilityFile ? "var(--text-on-accent)" : "var(--text-muted)",
                          fontSize: 12,
                          fontWeight: 600,
                          fontFamily: "var(--font)",
                        }}
                      >
                        Run revenue ingest
                      </button>
                    </div>
                  )}
                </div>
                <InfoCallout title="Revenue templates">
                  <ul>
                    <li>
                      Requires the <strong>revenue_forecast</strong> module on your account (same as Revenue trackers).
                    </li>
                    <li>
                      Upload <strong>one or both</strong> workbooks; the server uses the same parser as{" "}
                      <code>backend/scripts/ingest_revenue_trackers.py</code>.
                    </li>
                    <li>
                      Data lands in <code>revenue_forecast_weekly</code> and <code>revenue_visibility_snapshot</code>.
                    </li>
                    <li>
                      Runs appear in <strong>Recent ingestion activity</strong> below as Revenue trackers.
                    </li>
                  </ul>
                </InfoCallout>
              </div>
            )}
            {revenueTrackers.job !== "idle" && (
              <>
                <StepTracker steps={revenueTrackers.steps} percent={revenueTrackers.percent} />
                <LogPanel log={revenueTrackers.log} />
              </>
            )}
            {revenueTrackers.job === "done" && revenueIngestResult && (
              <div className="platform-card" style={{ marginTop: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Revenue ingest complete</div>
                <div style={{ fontSize: 10.5, color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace", lineHeight: 1.6 }}>
                  {revenueIngestResult.forecast != null && (
                    <div>
                      Forecast: {revenueIngestResult.forecast.rows_upserted} rows (
                      {revenueIngestResult.forecast.sheet})
                    </div>
                  )}
                  {revenueIngestResult.visibility != null && (
                    <div>
                      Visibility: {revenueIngestResult.visibility.rows_upserted} rows (
                      {revenueIngestResult.visibility.sheet})
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    revenueTrackers.reset();
                    setRevenueIngestResult(null);
                  }}
                  style={{
                    marginTop: 10,
                    background: "none",
                    border: "1px solid var(--border)",
                    padding: "5px 14px",
                    borderRadius: 7,
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  Dismiss
                </button>
              </div>
            )}
            {revenueTrackers.job === "error" && (
              <div style={{ marginTop: 10 }}>
                <div className="alert-banner red">Revenue ingest failed — see log above</div>
                <button
                  type="button"
                  onClick={() => {
                    revenueTrackers.reset();
                    setRevenueIngestResult(null);
                  }}
                  style={{
                    marginTop: 8,
                    background: "none",
                    border: "1px solid var(--red)",
                    color: "var(--red)",
                    padding: "5px 14px",
                    borderRadius: 7,
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </PlatformSection>
      )}

      {/* ── PRO PATH TAB ──────────────────────────────────────────────────────── */}
      {tab === "Pro Path" && (
        <PlatformSection title="Pro path">
          <p className="ingestion-center__tabIntro">
            For complex workbooks: inspect AI sheet picks, then run the full pipeline with explicit confirmation.
          </p>
          {proInspect.job === "idle" && proRun.job === "idle" && (
            <div className="ingestion-center__grid2">
              <DropZone
                title="Pro upload"
                subtitle={"Multi-sheet Excel\nReview AI sheet suggestions before committing"}
                icon="⬆⬆"
                accent="var(--accent2)"
                onFile={handleProInspect}
                disabled={false}
              />
              <InfoCallout title="Two-step flow">
                <ul>
                  <li>Best for complex multi-sheet workbooks.</li>
                  <li>Step 1: AI classifies sheets — you review selections.</li>
                  <li>Step 2: Confirm contract + data sheets, then the full pipeline runs.</li>
                </ul>
              </InfoCallout>
            </div>
          )}

          {/* STEP 1: INSPECT */}
          {(proInspect.job === "running" || proInspect.job === "error") && (
            <>
              <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 10 }}>
                Step 1 — Sheet Inspection
              </div>
              <StepTracker steps={proInspect.steps} percent={proInspect.percent} />
              <LogPanel log={proInspect.log} />
            </>
          )}

          {/* STEP 1 DONE — show review UI */}
          {proInspect.job === "done" && proInspectResult && proRun.job === "idle" && (
            <>
              <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--green)", fontFamily: "'DM Mono',monospace", marginBottom: 10 }}>
                ✓ Inspection Complete — Review sheet assignments below
              </div>
              <ProConfirmPanel
                inspectResult={proInspectResult}
                onConfirm={handleProConfirm}
                onReject={() => { proInspect.reset(); setProInspectResult(null); }}
              />
            </>
          )}

          {/* STEP 2: PIPELINE RUNNING */}
          {proRun.job === "running" && (
            <>
              <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 10 }}>
                Step 2 — Running Full Pipeline
              </div>
              <StepTracker steps={proRun.steps} percent={proRun.percent} />
              <LogPanel log={proRun.log} />
            </>
          )}

          {/* STEP 2 DONE */}
          {proRun.job === "done" && proRunResult && (
            <>
              <AgentOutputCard result={proRunResult} filename={proInspectResult?.filename || "file.xlsx"}
                onCommit={() => { proInspect.reset(); proRun.reset(); setProInspectResult(null); setProRunResult(null); }}
                onReject={() => { proInspect.reset(); proRun.reset(); setProInspectResult(null); setProRunResult(null); }}
              />
              <LogPanel log={proRun.log} />
            </>
          )}

          {proRun.job === "error" && (
            <div>
              <div className="alert-banner red">Pipeline failed — see log for details</div>
              <LogPanel log={proRun.log} />
              <button onClick={() => { proRun.reset(); }} style={{ marginTop: 8, background: "none", border: "1px solid var(--amber)", color: "var(--amber)", padding: "5px 14px", borderRadius: 7, cursor: "pointer", fontSize: 11 }}>
                ← Retry Confirm
              </button>
            </div>
          )}
        </PlatformSection>
      )}

      {/* ── SLA TAB ──────────────────────────────────────────────────────────── */}
      {tab === "SLA" && (
        <SpecializedIngestTab
          title="SLA basefile"
          subtitle="Upload the Raw SLA Basefile (Master SLA Performance sheet). Validates metric definitions, month labels, and client linkage."
          icon="📊"
          accent="var(--accent2)"
          hint="File: Raw Data SLA Basefile.xlsx"
          steps={sla.steps}
          percent={sla.percent}
          job={sla.job}
          log={sla.log}
          result={slaResult}
          onFile={handleSla}
          onReset={() => { sla.reset(); setSlaResult(null); }}
        />
      )}

      {/* ── WFM TAB ──────────────────────────────────────────────────────────── */}
      {tab === "WFM" && (
        <SpecializedIngestTab
          title="WFM headcount"
          subtitle="Upload the WFM Projected Headcount & Revenue file. Maps HC benchmarks, resource gaps, WL distribution, and productivity targets."
          icon="👥"
          accent="var(--green)"
          hint="File: WFM (Projected Headcount & Revenue).xlsx"
          steps={wfm.steps}
          percent={wfm.percent}
          job={wfm.job}
          log={wfm.log}
          result={wfmResult}
          onFile={handleWfm}
          onReset={() => { wfm.reset(); setWfmResult(null); }}
        />
      )}

      {/* ── FINANCE TAB ──────────────────────────────────────────────────────── */}
      {tab === "Finance" && (
        <SpecializedIngestTab
          title="Finance ledger"
          subtitle="Upload the Corporate Finance Data master file. All monetary values are expected in Lacs (₹ × 100,000) — normalized automatically."
          icon="₹"
          accent="var(--amber)"
          hint="File: FY24-25_Finance Data.xlsx · values in Lacs"
          steps={finance.steps}
          percent={finance.percent}
          job={finance.job}
          log={finance.log}
          result={financeResult}
          onFile={handleFinance}
          onReset={() => { finance.reset(); setFinanceResult(null); }}
        />
      )}

      {/* ── CANDIDATES TAB ──────────────────────────────────────────────────────── */}
      {tab === "Candidates" && (
        <CandidateIngestTab
          title="Candidate tracker"
          subtitle="Upload client candidate tracker workbooks (sheet: Candidate Tracker). Maps headers heuristically, upserts into Candidates, creates mandate stubs when Req No is present, then runs Offer & Onboarding pass 3 from the same file (gap-fill only)."
          icon="👤"
          accent="#7c3aed"
          hint="Files: Ud Trucks.xlsx · Bridgestone Position Tracker*.xlsx"
          steps={candidates.steps}
          percent={candidates.percent}
          job={candidates.job}
          log={candidates.log}
          result={candidatesResult}
          projectOptions={projectOptions}
          projectId={candidateProjectId}
          onProjectChange={setCandidateProjectId}
          onFile={handleCandidates}
          onReset={() => { candidates.reset(); setCandidatesResult(null); }}
        />
      )}

      {/* ── RUN LOG TAB ──────────────────────────────────────────────────────── */}
      {tab === "Run Log" && (
        <PlatformSection title="Run log">
          <p className="ingestion-center__tabIntro">
            In-browser step logs from your current session. Switch tabs and run uploads to populate each block.
          </p>
          {[
            { label: "Express", log: express.log },
            { label: "Revenue trackers", log: revenueTrackers.log },
            { label: "Pro Inspect", log: proInspect.log },
            { label: "Pro Pipeline", log: proRun.log },
            { label: "SLA", log: sla.log },
            { label: "WFM", log: wfm.log },
            { label: "Finance", log: finance.log },
            { label: "Candidates", log: candidates.log },
          ].map(({ label, log }) => log.length > 0 && (
            <div key={label} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 6, letterSpacing: ".1em" }}>{label}</div>
              <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 7, padding: 10, fontFamily: "'DM Mono',monospace", fontSize: 10.5 }}>
                {log.map((e) => (
                  <div key={e.id} style={{ display: "flex", gap: 8, marginBottom: 3 }}>
                    <span style={{ color: "var(--text-muted)" }}>{e.ts}</span>
                    <span style={{ color: TAG_COLOR[e.level] }}>{e.message}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {[express.log, revenueTrackers.log, proInspect.log, proRun.log, sla.log, wfm.log, finance.log, candidates.log].every((l) => !l.length) && (
            <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>
              No run events yet — start an upload from Express (trackers or revenue templates), Pro, SLA, WFM, Finance,
              or Candidates tabs to see logs here.
            </div>
          )}
        </PlatformSection>
      )}

      <IngestionActivitySection events={ingestionEvents} loading={eventsLoading} role={user?.role} />
    </div>
  );
}

// ─── SPECIALIZED TAB ──────────────────────────────────────────────────────────

function CandidateIngestTab({
  title, subtitle, icon, accent, hint,
  steps, percent, job, log, result,
  projectOptions, projectId, onProjectChange,
  onFile, onReset,
}: {
  title: string; subtitle: string; icon: string; accent: string; hint: string;
  steps: Step[]; percent: number; job: JobStatus; log: LogEntry[];
  result: Record<string, any> | null;
  projectOptions: Project[];
  projectId: number | "";
  onProjectChange: (id: number | "") => void;
  onFile: (f: File) => void;
  onReset: () => void;
}) {
  return (
    <PlatformSection title={title}>
      <p className="ingestion-center__tabIntro">{subtitle}</p>
      <div
        style={{
          padding: "8px 14px",
          background: `color-mix(in srgb, ${accent} 10%, var(--surface-muted))`,
          border: `1px solid color-mix(in srgb, ${accent} 28%, var(--border))`,
          borderRadius: "var(--radius-base)",
          fontSize: "11px",
          color: accent,
          fontFamily: "var(--mono)",
          marginBottom: 16,
        }}
      >
        {hint}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 10, textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "var(--mono)", marginBottom: 6, letterSpacing: ".08em" }}>
          Target project (recommended)
        </label>
        <select
          value={projectId === "" ? "" : String(projectId)}
          onChange={(e) => onProjectChange(e.target.value ? Number(e.target.value) : "")}
          disabled={job === "running"}
          style={{
            width: "100%",
            maxWidth: 420,
            padding: "8px 10px",
            borderRadius: "var(--radius-base)",
            border: "1px solid var(--border)",
            background: "var(--surface-raised, #fff)",
            fontSize: 12,
          }}
        >
          <option value="">Auto-match from filename</option>
          {projectOptions.map((p) => (
            <option key={p.id} value={p.id}>
              PRJ-{p.id} — {p.account_name || p.engagement_name || p.filename || "Project"}
            </option>
          ))}
        </select>
      </div>

      <div className="ingestion-center__grid2" style={{ gap: 14 }}>
        <DropZone
          title={title}
          subtitle={hint}
          icon={icon}
          accent={accent}
          onFile={onFile}
          disabled={job === "running"}
        />
        <div>
          <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 10, letterSpacing: ".1em" }}>
            Pipeline Steps
          </div>
          <StepTracker steps={steps} percent={percent} />
        </div>
      </div>

      <LogPanel log={log} />

      {job === "done" && result && (
        <div className="platform-card" style={{ marginTop: 14, border: "1px solid rgba(0,229,160,0.25)", background: "rgba(0,229,160,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontWeight: 600, color: "var(--green)" }}>✓ Ingestion Complete</span>
            <button onClick={onReset} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Upload Another →</button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>
            {result.message || "Candidate rows committed."}
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-subtle)", fontFamily: "var(--mono)", lineHeight: 1.7 }}>
            {result.project_id != null ? <div>Project: PRJ-{result.project_id}</div> : null}
            {result.sheet ? <div>Sheet: {String(result.sheet)}</div> : null}
            {result.inserted != null ? <div>Inserted: {result.inserted}</div> : null}
            {result.updated != null ? <div>Updated: {result.updated}</div> : null}
            {result.skipped != null ? <div>Skipped: {result.skipped}</div> : null}
            {result.stubs_created != null ? <div>Mandate stubs: {result.stubs_created}</div> : null}
            {result.masters_linked != null ? <div>Master links: {result.masters_linked}</div> : null}
          </div>
        </div>
      )}

      {job === "error" && (
        <div style={{ marginTop: 14 }}>
          <div className="alert-banner red">Ingestion failed — check the run log for details</div>
          <button onClick={onReset} style={{ marginTop: 8, background: "none", border: "1px solid var(--red)", color: "var(--red)", padding: "5px 14px", borderRadius: 7, cursor: "pointer", fontSize: 11 }}>
            ← Try Again
          </button>
        </div>
      )}
    </PlatformSection>
  );
}

function SpecializedIngestTab({
  title, subtitle, icon, accent, hint,
  steps, percent, job, log, result,
  onFile, onReset,
}: {
  title: string; subtitle: string; icon: string; accent: string; hint: string;
  steps: Step[]; percent: number; job: JobStatus; log: LogEntry[];
  result: Record<string, any> | null;
  onFile: (f: File) => void;
  onReset: () => void;
}) {
  return (
    <PlatformSection title={title}>
      <p className="ingestion-center__tabIntro">{subtitle}</p>
      <div
        style={{
          padding: "8px 14px",
          background: `color-mix(in srgb, ${accent} 10%, var(--surface-muted))`,
          border: `1px solid color-mix(in srgb, ${accent} 28%, var(--border))`,
          borderRadius: "var(--radius-base)",
          fontSize: "11px",
          color: accent,
          fontFamily: "var(--mono)",
          marginBottom: 16,
        }}
      >
        {hint}
      </div>

      <div className="ingestion-center__grid2" style={{ gap: 14 }}>
        {/* LEFT — drop zone */}
        <DropZone
          title={title.split("Ingestion")[0].trim()}
          subtitle={hint}
          icon={icon}
          accent={accent}
          onFile={onFile}
          disabled={job === "running"}
        />

        {/* RIGHT — progress */}
        <div>
          <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 10, letterSpacing: ".1em" }}>
            Pipeline Steps
          </div>
          <StepTracker steps={steps} percent={percent} />
        </div>
      </div>

      <LogPanel log={log} />

      {/* SUCCESS STATE */}
      {job === "done" && result && (
        <div className="platform-card" style={{ marginTop: 14, border: "1px solid rgba(0,229,160,0.25)", background: "rgba(0,229,160,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontWeight: 600, color: "var(--green)" }}>✓ Ingestion Complete</span>
            <button onClick={onReset} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Upload Another →</button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>
            {result.message || `Data successfully committed to database.`}
          </div>
          {(result.rows_processed != null || result.performance_cells_written != null) && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-subtle)", fontFamily: "var(--mono)" }}>
              {result.rows_processed != null ? (
                <span>
                  Metric rows: <strong style={{ color: "var(--text)" }}>{result.rows_processed}</strong>
                </span>
              ) : null}
              {result.performance_cells_written != null ? (
                <span style={{ marginLeft: result.rows_processed != null ? 14 : 0 }}>
                  Score cells: <strong style={{ color: "var(--text)" }}>{result.performance_cells_written}</strong>
                </span>
              ) : null}
            </div>
          )}
          {(result.benchmarks_saved != null || result.gap_rows_written != null) && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-subtle)", fontFamily: "var(--mono)" }}>
              {result.benchmarks_saved != null ? (
                <span>
                  Benchmark rows: <strong style={{ color: "var(--text)" }}>{result.benchmarks_saved}</strong>
                </span>
              ) : null}
              {result.gap_rows_written != null ? (
                <span style={{ marginLeft: result.benchmarks_saved != null ? 14 : 0 }}>
                  Open-position rows: <strong style={{ color: "var(--text)" }}>{result.gap_rows_written}</strong>
                </span>
              ) : null}
              {result.sheet_used ? (
                <span style={{ marginLeft: 14 }}>
                  Sheet: <strong style={{ color: "var(--text)" }}>{String(result.sheet_used)}</strong>
                </span>
              ) : null}
            </div>
          )}
          {result.rows_written && (
            <div style={{ marginTop: 6, fontSize: 11.5 }}>
              Rows written: <strong style={{ color: "var(--green)" }}>{result.rows_written}</strong>
            </div>
          )}
        </div>
      )}

      {/* ERROR STATE */}
      {job === "error" && (
        <div style={{ marginTop: 14 }}>
          <div className="alert-banner red">Ingestion failed — check the run log for details</div>
          <button onClick={onReset} style={{ marginTop: 8, background: "none", border: "1px solid var(--red)", color: "var(--red)", padding: "5px 14px", borderRadius: 7, cursor: "pointer", fontSize: 11 }}>
            ← Try Again
          </button>
        </div>
      )}
    </PlatformSection>
  );
}

// ─── DIRECT UPLOAD TAB ────────────────────────────────────────────────────────

const DIRECT_STEPS: string[] = [
  "Saving your file",
  "Reading Position Tracker & Contractual sheets",
  "Matching columns to the system",
  "Calculating fee rules from your contract",
  "Previewing rows (no database write)",
  "Finishing validation",
];

const DIRECT_COMMIT_STEPS: string[] = [
  "Saving your file",
  "Reading Position Tracker & Contractual sheets",
  "Matching columns to the system",
  "Calculating fee rules from your contract",
  "Loading rows into the database",
  "Finishing up",
];

type ValidationRowDetail = {
  row: number;
  req_id?: string | null;
  position_title?: string | null;
  candidate_name?: string | null;
  status?: string | null;
  global_status?: string | null;
  reason?: string;
  issue?: string;
  fix?: string;
  kept_row?: number;
  kept_req_id?: string | null;
  field?: string;
  field_label?: string;
  raw?: string;
  resolved?: string;
};

type ValidationPreview = {
  rows_total?: number;
  rows_valid?: number;
  rows_skipped?: number;
  warnings?: ValidationRowDetail[];
  errors?: ValidationRowDetail[];
  skipped_rows?: ValidationRowDetail[];
  valid_rows?: ValidationRowDetail[];
  global_status_preview?: Record<string, number>;
  pipeline_status_preview?: Record<string, number>;
  field_coverage?: Record<string, number>;
  position_id_column?: string | null;
  project_id?: number | null;
  project_will_be_created?: boolean;
};

type ValidationDetailTab = "total" | "valid" | "skipped" | "warnings" | "errors";

function defaultValidationDetailTab(preview: ValidationPreview): ValidationDetailTab {
  const errorCount = preview.errors?.length ?? 0;
  const skippedCount = preview.skipped_rows?.length ?? preview.rows_skipped ?? 0;
  const warningCount = preview.warnings?.length ?? 0;
  if (errorCount > 0) return "errors";
  if (skippedCount > 0) return "skipped";
  if (warningCount > 0) return "warnings";
  return "valid";
}

function groupSkippedByReason(
  items: ValidationRowDetail[],
): Array<{ label: string; count: number; reason: string }> {
  const counts = new Map<string, { label: string; count: number }>();
  for (const item of items) {
    const reason = item.reason ?? "other";
    const label = item.issue ?? reason.replace(/_/g, " ");
    const existing = counts.get(reason);
    if (existing) existing.count += 1;
    else counts.set(reason, { label, count: 1 });
  }
  return [...counts.entries()]
    .map(([reason, { label, count }]) => ({ reason, label, count }))
    .sort((a, b) => b.count - a.count);
}

const PIPELINE_STATUS_ORDER = ["Open", "Offered", "Joined", "On Hold", "Cancelled", "Interview", "Screening"];

function pipelineStatusChipClass(label: string): string {
  const key = label.toLowerCase();
  if (key.includes("open")) return "direct-upload__status-chip--open";
  if (key.includes("offer")) return "direct-upload__status-chip--offer";
  if (key.includes("join")) return "direct-upload__status-chip--joined";
  if (key.includes("hold")) return "direct-upload__status-chip--hold";
  if (key.includes("cancel")) return "direct-upload__status-chip--cancelled";
  return "";
}

function validationRowHint(row: number): string | null {
  if (row <= 3) {
    return "This looks like a template or header row in Excel (rows 1–3 are instructions). Delete example/hint rows and keep data from row 4 onward with a real Req ID.";
  }
  return null;
}

function validationIssueFixHint(
  item: { field?: string; issue?: string; fix?: string },
  kind: "error" | "warning",
): string {
  if (item.fix?.trim()) return item.fix.trim();
  const field = (item.field ?? "").toLowerCase();
  const issue = (item.issue ?? "").toLowerCase();
  if (kind === "error") {
    if (field === "joining_date" || issue.includes("joining"))
      return "Fill Joining Date on this row, or remove joining_date from Required fields in Clients → Edit account → Config.";
    if (field === "offered_ctc" || issue.includes("ctc"))
      return "Enter Offered CTC (Lakhs), or remove offered_ctc from Required fields in project Config.";
    if (field === "status" || issue.includes("status"))
      return "Set Current Status from the dropdown on this row.";
    if (field === "candidate_name" || issue.includes("candidate_name"))
      return "Fill Candidate Name (use 'Open — REQ-ID' for vacant positions), or remove candidate_name from Required fields in project Config.";
  }
  if (issue.includes("valid_bands"))
    return "Use a Band / Grade from your project Config, or add this value under Config → Valid bands.";
  if (issue.includes("valid_departments"))
    return "Use a Department from your project Config, or add it under Config → Valid departments.";
  if (issue.includes("valid_locations"))
    return "Use a Location from your project Config, or add it under Config → Valid locations.";
  if (issue.includes("source joiner"))
    return "Pick a Source Joiner Type allowed in your project Config.";
  if (issue.includes("tto") || issue.includes("joining_date"))
    return "Fill Joining Date for joined candidates so time-to-offer metrics work.";
  if (issue.includes("ctc"))
    return "Enter a positive Offered CTC (Lakhs) on joined rows for revenue calculation.";
  return kind === "error"
    ? "Fix this row in Excel or relax validation under Clients → Edit account → Config."
    : "Review this value in Excel or update project Config if the value is correct.";
}

function groupIssuesByField(
  items: Array<{ field?: string; field_label?: string }>,
): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = item.field_label || item.field || "other";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function ValidationPreviewPanel({
  preview,
  onConfirm,
  onCancel,
  confirming,
}: {
  preview: ValidationPreview;
  onConfirm: () => void;
  onCancel: () => void;
  confirming: boolean;
}) {
  const warnings = preview.warnings ?? [];
  const errors = preview.errors ?? [];
  const skippedRows = preview.skipped_rows ?? [];
  const validRows = preview.valid_rows ?? [];
  const statusPreview = preview.global_status_preview ?? {};
  const pipelinePreview = preview.pipeline_status_preview ?? {};
  const totalStatus = Object.values(statusPreview).reduce((a, b) => a + b, 0);
  const totalPipeline = Object.values(pipelinePreview).reduce((a, b) => a + b, 0);
  const errorGroups = groupIssuesByField(errors);
  const templateRowErrors = errors.filter((e) => e.row <= 3).length;
  const skipGroups = groupSkippedByReason(skippedRows);
  const [detailTab, setDetailTab] = useState<ValidationDetailTab>(() => defaultValidationDetailTab(preview));

  const statItems: Array<{
    key: ValidationDetailTab;
    label: string;
    value: number | string;
    tone?: "neutral" | "good" | "warn" | "skip" | "bad";
    hint?: string;
  }> = [
    {
      key: "total",
      label: "Total rows",
      value: preview.rows_total ?? "—",
      tone: "neutral",
      hint: "Every data row read from Position Tracker before filtering.",
    },
    {
      key: "valid",
      label: "Valid rows",
      value: preview.rows_valid ?? validRows.length ?? "—",
      tone: "good",
      hint: "Rows that will be written or updated on upload.",
    },
    {
      key: "skipped",
      label: "Skipped",
      value: preview.rows_skipped ?? skippedRows.length,
      tone: (preview.rows_skipped ?? skippedRows.length) > 0 ? "skip" : "neutral",
      hint: "Rows ignored — template junk, blanks, totals, or duplicates in the file.",
    },
    {
      key: "warnings",
      label: "Warnings",
      value: warnings.length,
      tone: warnings.length > 0 ? "warn" : "neutral",
      hint: "Non-blocking issues — upload is allowed but metrics may be affected.",
    },
    {
      key: "errors",
      label: "Errors",
      value: errors.length,
      tone: errors.length > 0 ? "bad" : "neutral",
      hint: "Blocking issues — fix in Excel or project Config before uploading.",
    },
  ];

  const detailTitle: Record<ValidationDetailTab, string> = {
    total: "Row breakdown",
    valid: "Valid rows — will be uploaded",
    skipped: "Skipped rows — not uploaded",
    warnings: "Warnings — review before upload",
    errors: "Errors — upload blocked",
  };

  const detailDescription: Record<ValidationDetailTab, string> = {
    total: "Click any summary number above to inspect that category. Skipped and error rows never reach the database.",
    valid: "These rows passed validation and will be created or updated when you proceed.",
    skipped: "Each skipped row is listed with the reason and how to fix it in Excel or project Config.",
    warnings: "Warnings do not block upload. Fix them when you can so dashboards and revenue stay accurate.",
    errors: "Fix every blocking error below, then re-validate the file.",
  };

  return (
    <div className="direct-upload__preview">
      <div className="direct-upload__preview-title">Validation preview</div>
      <p className="direct-upload__preview-note">
        Review the summary below. Nothing is written to the database until you confirm.
        {errors.length > 0 && (
          <> <strong>Upload is blocked</strong> until all blocking errors are fixed in the Excel file (or in project Config).</>
        )}
        {errors.length === 0 && warnings.length > 0 && (
          <> You can upload with warnings, but metrics may be affected — review them before proceeding.</>
        )}
        {preview.project_will_be_created && (
          <> A <strong>new client project</strong> will be created on upload.</>
        )}
      </p>

      <div className="direct-upload__success-stats direct-upload__success-stats--interactive">
        {statItems.map(({ key, label, value, tone, hint }) => (
          <button
            key={key}
            type="button"
            className={[
              "direct-upload__stat",
              "direct-upload__stat--clickable",
              detailTab === key ? "direct-upload__stat--active" : "",
              tone ? `direct-upload__stat--${tone}` : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setDetailTab(key)}
            title={hint}
            aria-pressed={detailTab === key}
          >
            <div className="direct-upload__stat-value">{value}</div>
            <div className="direct-upload__stat-label">{label}</div>
          </button>
        ))}
      </div>

      {totalPipeline > 0 && (
        <div className="direct-upload__status-bar">
          <div className="direct-upload__status-bar-label">Pipeline status (from Current Status column)</div>
          <div className="direct-upload__status-chips">
            {[...PIPELINE_STATUS_ORDER, ...Object.keys(pipelinePreview).filter((k) => !PIPELINE_STATUS_ORDER.includes(k))]
              .filter((status, idx, arr) => arr.indexOf(status) === idx && (pipelinePreview[status] ?? 0) > 0)
              .map((status) => (
                <span
                  key={status}
                  className={["direct-upload__status-chip", pipelineStatusChipClass(status)].filter(Boolean).join(" ")}
                >
                  {status}: {pipelinePreview[status]}
                </span>
              ))}
          </div>
        </div>
      )}

      {totalStatus > 0 && (
        <div className="direct-upload__status-bar">
          <div className="direct-upload__status-bar-label">Global status preview (valid rows only)</div>
          <div className="direct-upload__status-chips">
            {Object.entries(statusPreview).map(([status, count]) => (
              <span key={status} className="direct-upload__status-chip">
                {status}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {preview.field_coverage && Object.keys(preview.field_coverage).length > 0 && (
        <details className="direct-upload__details" style={{ marginTop: 10 }}>
          <summary className="direct-upload__summary">Field coverage (mapped columns filled)</summary>
          <div className="direct-upload__coverage">
            {Object.entries(preview.field_coverage)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 12)
              .map(([field, pct]) => (
                <div key={field} className="direct-upload__coverage-row">
                  <span className="direct-upload__coverage-label">{field}</span>
                  <div className="direct-upload__coverage-bar">
                    <div className="direct-upload__coverage-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
                  </div>
                  <span className="direct-upload__coverage-pct">{Math.round(pct * 100)}%</span>
                </div>
              ))}
          </div>
        </details>
      )}

      <div className="direct-upload__detail-panel">
        <div className="direct-upload__detail-head">
          <div className="direct-upload__detail-title">{detailTitle[detailTab]}</div>
          <p className="direct-upload__detail-desc">{detailDescription[detailTab]}</p>
        </div>

        {detailTab === "total" && (
          <div className="direct-upload__breakdown">
            <div className="direct-upload__breakdown-grid">
              {statItems
                .filter((s) => s.key !== "total")
                .map(({ key, label, value, tone }) => (
                  <button
                    key={key}
                    type="button"
                    className={[
                      "direct-upload__breakdown-card",
                      tone ? `direct-upload__breakdown-card--${tone}` : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setDetailTab(key)}
                  >
                    <span className="direct-upload__breakdown-value">{value}</span>
                    <span className="direct-upload__breakdown-label">{label}</span>
                  </button>
                ))}
            </div>
            {preview.position_id_column && (
              <p className="direct-upload__detail-meta">
                Position identity column: <strong>{preview.position_id_column}</strong>
                {preview.position_id_column.trim().toLowerCase() !== "req id" && (
                  <> — duplicate open roles with the same title may be skipped unless each has a unique Req ID.</>
                )}
              </p>
            )}
            {skipGroups.length > 0 && (
              <div className="direct-upload__issue-summary">
                {skipGroups.map(({ reason, label, count }) => (
                  <button
                    key={reason}
                    type="button"
                    className="direct-upload__issue-chip direct-upload__issue-chip--skip"
                    onClick={() => setDetailTab("skipped")}
                  >
                    {label}: {count}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {detailTab === "valid" && (
          <>
            {validRows.length === 0 ? (
              <p className="direct-upload__detail-empty">No valid row details returned. Re-validate the file to refresh.</p>
            ) : (
              <div className="direct-upload__table-wrap">
                <table className="direct-upload__warnings-table direct-upload__detail-table direct-upload__detail-table--valid">
                  <thead>
                    <tr>
                      <th>Excel row</th>
                      <th>Req ID</th>
                      <th>Position</th>
                      <th>Candidate</th>
                      <th>Status</th>
                      <th>Global</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 100).map((row) => (
                      <tr key={`valid-${row.row}`}>
                        <td>{row.row}</td>
                        <td>{row.req_id ?? "—"}</td>
                        <td>{row.position_title ?? "—"}</td>
                        <td>{row.candidate_name ?? "—"}</td>
                        <td>{row.status ?? "—"}</td>
                        <td>
                          <span className="direct-upload__pill direct-upload__pill--valid">{row.global_status ?? "—"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validRows.length > 100 && (
                  <p className="direct-upload__detail-more">Showing first 100 of {validRows.length} valid rows.</p>
                )}
              </div>
            )}
          </>
        )}

        {detailTab === "skipped" && (
          <>
            {skippedRows.length === 0 ? (
              <p className="direct-upload__detail-empty">No rows were skipped.</p>
            ) : (
              <>
                {skipGroups.length > 0 && (
                  <div className="direct-upload__issue-summary">
                    {skipGroups.map(({ reason, label, count }) => (
                      <span key={reason} className="direct-upload__issue-chip direct-upload__issue-chip--skip">
                        {label}: {count}
                      </span>
                    ))}
                  </div>
                )}
                {preview.position_id_column &&
                  skipGroups.some((g) => g.reason === "duplicate_fingerprint") &&
                  preview.position_id_column.trim().toLowerCase() !== "req id" && (
                    <div className="direct-upload__fix-callout direct-upload__fix-callout--skip">
                      <strong>Many duplicates detected:</strong> this project identifies positions by «
                      {preview.position_id_column}». Open roles that share the same title look identical — set Config →
                      Position ID column to <strong>Req ID</strong> if each requisition has its own ID.
                    </div>
                  )}
                <div className="direct-upload__table-wrap">
                  <table className="direct-upload__warnings-table direct-upload__detail-table direct-upload__detail-table--skip">
                    <thead>
                      <tr>
                        <th>Excel row</th>
                        <th>Req ID</th>
                        <th>Position</th>
                        <th>Candidate</th>
                        <th>Why skipped</th>
                        <th>How to fix</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skippedRows.slice(0, 80).map((row, i) => {
                        const rowHint = validationRowHint(row.row);
                        return (
                          <tr key={`skip-${row.row}-${i}`} className="direct-upload__row--skip">
                            <td>{row.row}</td>
                            <td>{row.req_id ?? "—"}</td>
                            <td>{row.position_title ?? "—"}</td>
                            <td>{row.candidate_name ?? "—"}</td>
                            <td>
                              {row.issue ?? row.reason ?? "—"}
                              {row.kept_row ? (
                                <div className="direct-upload__row-hint">First seen on row {row.kept_row}</div>
                              ) : null}
                              {rowHint ? <div className="direct-upload__row-hint">{rowHint}</div> : null}
                            </td>
                            <td className="direct-upload__fix-cell">{row.fix ?? "Review this row in Excel."}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {skippedRows.length > 80 && (
                    <p className="direct-upload__detail-more">Showing first 80 of {skippedRows.length} skipped rows.</p>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {detailTab === "warnings" && (
          <>
            {warnings.length === 0 ? (
              <p className="direct-upload__detail-empty">No warnings.</p>
            ) : (
              <div className="direct-upload__table-wrap">
                <table className="direct-upload__warnings-table direct-upload__detail-table direct-upload__detail-table--warn">
                  <thead>
                    <tr>
                      <th>Excel row</th>
                      <th>Column</th>
                      <th>Raw value</th>
                      <th>Issue</th>
                      <th>How to fix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warnings.slice(0, 50).map((w, i) => (
                      <tr key={`${w.row}-${w.field}-${i}`} className="direct-upload__row--warn">
                        <td>{w.row}</td>
                        <td>{w.field}</td>
                        <td>{w.raw ?? w.resolved ?? "—"}</td>
                        <td>{w.issue ?? (w.resolved ? `→ ${w.resolved}` : "—")}</td>
                        <td className="direct-upload__fix-cell">{validationIssueFixHint(w, "warning")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {detailTab === "errors" && (
          <>
            {errors.length === 0 ? (
              <p className="direct-upload__detail-empty">No blocking errors.</p>
            ) : (
              <div className="direct-upload__errors">
                <div className="alert-banner red" style={{ margin: "0 0 10px" }}>
                  {errors.length} blocking error{errors.length === 1 ? "" : "s"} — fix these in Excel before uploading.
                </div>

                {templateRowErrors > 0 && (
                  <div className="direct-upload__fix-callout direct-upload__fix-callout--error">
                    <strong>Template rows detected:</strong> {templateRowErrors} error{templateRowErrors === 1 ? "" : "s"} on Excel rows 1–3.
                    Delete the grey example/instruction rows in Position Tracker and keep real data from row 4 with real Req IDs (e.g. REQ-001).
                  </div>
                )}

                {errorGroups.length > 0 && (
                  <div className="direct-upload__issue-summary">
                    {errorGroups.map(({ label, count }) => (
                      <span key={label} className="direct-upload__issue-chip direct-upload__issue-chip--error">
                        {label}: {count}
                      </span>
                    ))}
                  </div>
                )}

                <div className="direct-upload__table-wrap">
                  <table className="direct-upload__warnings-table direct-upload__errors-table direct-upload__detail-table direct-upload__detail-table--error">
                    <thead>
                      <tr>
                        <th>Excel row</th>
                        <th>Column</th>
                        <th>Problem</th>
                        <th>How to fix</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.slice(0, 80).map((e, i) => {
                        const rowHint = validationRowHint(e.row);
                        const fix = validationIssueFixHint(e, "error");
                        return (
                          <tr key={`${e.row}-${e.field}-${i}`} className="direct-upload__row--error">
                            <td>{e.row}</td>
                            <td>{e.field_label ?? e.field}</td>
                            <td>
                              {e.issue ?? "—"}
                              {rowHint ? <div className="direct-upload__row-hint">{rowHint}</div> : null}
                            </td>
                            <td className="direct-upload__fix-cell">{fix}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="direct-upload__fix-callout">
                  <strong>Quick paths:</strong>
                  <ul className="direct-upload__fix-list">
                    <li>Fix values in the Excel file, then drop the file here again to re-validate.</li>
                    <li>Or open <strong>Clients → Edit account → Config</strong> to change allowed bands/departments/locations or Required fields.</li>
                    <li>Download the client template from Direct Upload to get pre-filled dropdowns matching your Config.</li>
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="direct-upload__preview-actions">
        <button type="button" className="direct-upload__resetBtn" onClick={onCancel} disabled={confirming}>
          Cancel
        </button>
        <button
          type="button"
          className="direct-upload__download-btn"
          onClick={onConfirm}
          disabled={confirming || errors.length > 0}
        >
          {confirming ? "Uploading…" : "Proceed to upload"}
        </button>
      </div>
    </div>
  );
}

type DirectGuideSection = {
  title: string;
  color: string;
  why: string;
  fields: { name: string; required?: boolean; note: string }[];
};

const DIRECT_GUIDE_SECTIONS: DirectGuideSection[] = [
  {
    title: "Must fill on every row",
    color: "#EF5350",
    why: "Without these, the row is skipped. Req ID links the same position across monthly uploads.",
    fields: [
      { name: "Req ID", required: true, note: "Client reference number — e.g. REQ-001 or 35525" },
      { name: "Position Title", required: true, note: "Job title — e.g. Senior Manager – Finance" },
      { name: "Current Status", required: true, note: "Open · Interview · Offered · Joined · On Hold · Cancelled" },
      { name: "Candidate Name", note: "Leave blank for open positions with no candidate yet" },
    ],
  },
  {
    title: "Key dates (drive ageing & time-to-fill)",
    color: "#4CAF50",
    why: "Joining Date is the most important — it marks the hire as complete and calculates the closing fee.",
    fields: [
      { name: "Req Created Date", note: "When the position was opened — start of ageing" },
      { name: "Offered Date", note: "When the offer was released — used for Time-to-Offer" },
      { name: "Joining Date", required: true, note: "Day 1 on the job — triggers closing fee & joiner count" },
      { name: "First CV Share Date", note: "First CV sent to client — used in SLA reports" },
    ],
  },
  {
    title: "Salary & revenue",
    color: "#FF9800",
    why: "Offered CTC × fee % from your Contractual sheet = Taggd fee in the revenue dashboard.",
    fields: [
      { name: "Offered CTC (Lakhs)", required: true, note: "Always in Lakhs — enter 45 for ₹45 Lakh. NOT full rupees." },
      { name: "CTC Budget (LPA)", note: "Max budget for the role in Lakhs" },
    ],
  },
  {
    title: "Who found the candidate",
    color: "#9C27B0",
    why: "Taggd RPO/Direct = % of CTC fee. ER / IJP = flat fee from Contractual sheet.",
    fields: [
      { name: "Source Joiner Type", note: "Taggd RPO · Taggd Direct · ER – Employee Referral · IJP · Campus" },
      { name: "Source of Hire", note: "e.g. LinkedIn, Naukri, Employee Referral" },
    ],
  },
  {
    title: "Recruitment funnel counts",
    color: "#FF7043",
    why: "Powers Hit Ratio, Offer Drop Rate, and Offer Acceptance Rate in client dashboards.",
    fields: [
      { name: "Profiles Sourced", note: "Total CVs collected" },
      { name: "Profiles Submitted", note: "CVs shared with the client" },
      { name: "Offers Released", note: "Offers made" },
      { name: "Offers Accepted", note: "Offers accepted by candidates" },
    ],
  },
];

const DIRECT_MISTAKES = [
  { title: "CTC entered in full rupees", fix: "Enter 45 for ₹45 Lakhs — not 4500000. Wrong unit makes revenue 100,000× too high." },
  { title: "Joining Date missing for joiners", fix: "Even if Status = Joined, without Joining Date the closing fee is not calculated." },
  { title: "Wrong file name", fix: "Name the file after the client — e.g. Maruti Suzuki Tracker.xlsx — not Tracker.xlsx." },
  { title: "Example rows left in the file", fix: "Delete rows 4–8 (the grey example rows) before uploading your real data." },
  { title: "Adding Revenue or Global Status columns", fix: "These are calculated by the system — do not add them to your Excel." },
];

function DirectUploadTab({ onUploadDone }: { onUploadDone: () => void }) {
  const [searchParams] = useSearchParams();
  const [job, setJob] = useState<JobStatus>("idle");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const [validationPreview, setValidationPreview] = useState<ValidationPreview | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [steps, setSteps] = useState<Step[]>(DIRECT_STEPS.map((l) => ({ label: l, status: "pending" })));

  // Project selection
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | "">("");
  const [loadingProjects, setLoadingProjects] = useState(false);

  const selectedProject = allProjects.find((p) => p.id === selectedProjectId) ?? null;
  const trackerConfig = selectedProject?.tracker_config ?? null;

  useEffect(() => {
    setLoadingProjects(true);
    queries.projects()
      .then((ps) => {
        setAllProjects(ps);
        const fromUrl = Number(searchParams.get("project_id"));
        if (Number.isFinite(fromUrl) && fromUrl > 0 && ps.some((p) => p.id === fromUrl)) {
          setSelectedProjectId(fromUrl);
        }
      })
      .catch(() => setAllProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [searchParams]);

  const appendLog = (message: string, level: LogLevel = "info") => {
    setLog((prev) => [...prev, { id: Math.random().toString(36).slice(2), message, level, ts: tsNow() }]);
  };

  const reset = () => {
    setJob("idle"); setLog([]); setResult(null);
    setValidationPreview(null);
    setPendingFile(null);
    setSteps(DIRECT_STEPS.map((l) => ({ label: l, status: "pending" })));
  };

  async function runValidate(f: File) {
    setJob("running");
    setSteps(DIRECT_STEPS.map((l) => ({ label: l, status: "pending" })));
    setValidationPreview(null);
    setResult(null);
    setPendingFile(f);
    appendLog(`Validating ${f.name}${selectedProject ? ` against ${selectedProject.account_name || selectedProject.engagement_name}` : ""}…`);
    try {
      let stepIdx = 0;
      const advance = () => {
        setSteps((prev) => prev.map((s, i) =>
          i < stepIdx ? { ...s, status: "done" } : i === stepIdx ? { ...s, status: "running" } : s
        ));
        stepIdx++;
      };
      advance();
      await delay(400); advance();
      const pid = selectedProjectId !== "" ? selectedProjectId : undefined;
      const promise = queries.validateTrackerUpload(f, pid);
      await delay(600); advance();
      await delay(500); advance();
      await delay(400); advance();
      const data = await promise;
      advance();
      setSteps(DIRECT_STEPS.map((l) => ({ label: l, status: "done" })));
      setValidationPreview(data);
      setJob("preview");
      appendLog(
        `Validation complete — ${data.rows_valid ?? 0} valid, ${data.rows_skipped ?? 0} skipped, ${(data.warnings ?? []).length} warnings`,
        "success",
      );
    } catch (err: any) {
      setJob("error");
      setPendingFile(null);
      setSteps((prev) => prev.map((s) => s.status === "running" ? { ...s, status: "error" } : s));
      appendLog(`Validation failed: ${err?.response?.data?.detail || err?.message}`, "error");
    }
  }

  async function runCommit() {
    if (!pendingFile) return;
    setJob("running");
    setSteps(DIRECT_COMMIT_STEPS.map((l) => ({ label: l, status: "pending" })));
    appendLog(`Uploading ${pendingFile.name}…`);
    try {
      let stepIdx = 0;
      const advance = () => {
        setSteps((prev) => prev.map((s, i) =>
          i < stepIdx ? { ...s, status: "done" } : i === stepIdx ? { ...s, status: "running" } : s
        ));
        stepIdx++;
      };
      advance();
      await delay(400); advance();
      const pid = selectedProjectId !== "" ? selectedProjectId : undefined;
      const promise = queries.commitTrackerUpload(pendingFile, pid);
      await delay(600); advance();
      await delay(500); advance();
      await delay(400); advance();
      const data = await promise;
      advance();
      setSteps(DIRECT_COMMIT_STEPS.map((l) => ({ label: l, status: "done" })));
      setResult(data);
      setValidationPreview(null);
      setPendingFile(null);
      setJob("done");
      appendLog(`Upload complete — ${columnMappingEntryCount(data.mapping)} columns matched`, "success");
      onUploadDone();
    } catch (err: any) {
      setJob("error");
      setSteps((prev) => prev.map((s) => s.status === "running" ? { ...s, status: "error" } : s));
      appendLog(`Upload failed: ${err?.response?.data?.detail || err?.message}`, "error");
    }
  }

  return (
    <PlatformSection title="Direct Upload — Standard Tracker">
      <p className="ingestion-center__tabIntro">
        Download the template, fill in your client&apos;s positions, and upload here.
        The template includes step-by-step instructions inside the Excel file — start with the <strong>READ ME FIRST</strong> sheet.
      </p>

      {/* ── CLIENT / PROJECT SELECTOR ─────────────────────────────────────────── */}
      <div className="direct-upload__project-selector">
        <div className="direct-upload__project-selector-label">
          Target client project
          <span className="direct-upload__project-selector-badge">Recommended — loads validation rules</span>
        </div>
        <div className="direct-upload__project-selector-row">
          <select
            className="direct-upload__project-select"
            value={selectedProjectId === "" ? "" : String(selectedProjectId)}
            onChange={(e) => setSelectedProjectId(e.target.value === "" ? "" : Number(e.target.value))}
            disabled={loadingProjects || job !== "idle"}
          >
            <option value="">— Auto-detect from filename —</option>
            {allProjects.map((p) => (
              <option key={p.id} value={p.id}>
                PRJ-{p.id} · {p.account_name || p.engagement_name || p.filename}
              </option>
            ))}
          </select>
          {selectedProject && (
            <button
              type="button"
              className="direct-upload__project-download-btn"
              title="Download client-specific template for this project"
              onClick={() => void queries.downloadProjectTrackerTemplate(
                selectedProject.id,
                `${(selectedProject.account_name || selectedProject.engagement_name || "tracker").trim()} Tracker.xlsx`
              )}
            >
              📥 Client template
            </button>
          )}
        </div>

        {/* Config summary pill row */}
        {selectedProject && trackerConfig && (
          <div className="direct-upload__config-summary">
            {(trackerConfig.valid_bands ?? []).length > 0 && (
              <span className="direct-upload__config-pill">
                <strong>{(trackerConfig.valid_bands!).length}</strong> bands
              </span>
            )}
            {(trackerConfig.valid_departments ?? []).length > 0 && (
              <span className="direct-upload__config-pill">
                <strong>{(trackerConfig.valid_departments!).length}</strong> depts
              </span>
            )}
            {(trackerConfig.valid_locations ?? []).length > 0 && (
              <span className="direct-upload__config-pill">
                <strong>{(trackerConfig.valid_locations!).length}</strong> locations
              </span>
            )}
            {(trackerConfig.valid_source_joiner_types ?? []).length > 0 && (
              <span className="direct-upload__config-pill">
                <strong>{(trackerConfig.valid_source_joiner_types!).length}</strong> SJT types
              </span>
            )}
            {trackerConfig.ctc_unit && (
              <span className="direct-upload__config-pill direct-upload__config-pill--accent">
                CTC in {trackerConfig.ctc_unit === "lakhs" ? "Lakhs" : "INR"}
              </span>
            )}
            {(trackerConfig.required_fields ?? []).length > 0 && (
              <span className="direct-upload__config-pill direct-upload__config-pill--warn">
                {(trackerConfig.required_fields!).length} required fields
              </span>
            )}
          </div>
        )}
        {selectedProject && !trackerConfig && (
          <div className="direct-upload__config-summary">
            <span className="direct-upload__config-pill direct-upload__config-pill--muted">
              No config yet — open Clients → Edit to set up validation rules
            </span>
          </div>
        )}
      </div>

      {/* Step-by-step for non-technical users */}
      <ol className="direct-upload__steps">
        <li><strong>Select</strong> the target project above (or let the system auto-detect from filename)</li>
        <li><strong>Download</strong> the client template below (or click <em>Client template</em> above for a project-specific version)</li>
        <li><strong>Open READ ME FIRST</strong> inside the Excel — it explains every section</li>
        <li><strong>Fill Position Tracker</strong> — one row per open position or candidate (start at row 9; delete the 5 grey example rows first)</li>
        <li><strong>Fill Contractual</strong> — your fee percentages (one row per CTC band)</li>
        <li><strong>Save as</strong> <em>Client Name Tracker.xlsx</em> — e.g. Maruti Suzuki Tracker.xlsx</li>
        <li><strong>Upload</strong> the file using the box below</li>
      </ol>

      {/* Download card */}
      <div className="direct-upload__download">
        <div className="direct-upload__download-icon" aria-hidden>📥</div>
        <div className="direct-upload__download-body">
          <div className="direct-upload__download-title">
            {selectedProject
              ? `${selectedProject.account_name || selectedProject.engagement_name} — Client Tracker Template`
              : "Taggd Standard Tracker Template"}
          </div>
          <div className="direct-upload__download-desc">
            {selectedProject
              ? "Client-specific template with pre-configured dropdowns for bands, departments, locations, and source joiner types."
              : "4 sheets: READ ME FIRST · Position Tracker (colour-coded sections + 5 examples) · Contractual · Reference"}
          </div>
        </div>
        {selectedProject ? (
          <button
            type="button"
            className="direct-upload__download-btn"
            onClick={() => void queries.downloadProjectTrackerTemplate(
              selectedProject.id,
              `${(selectedProject.account_name || selectedProject.engagement_name || "tracker").trim()} Tracker.xlsx`
            )}
          >
            Download client template
          </button>
        ) : (
          <a
            className="direct-upload__download-btn"
            href="/static/taggd_standard_tracker_template.xlsx"
            download="taggd_standard_tracker_template.xlsx"
          >
            Download template
          </a>
        )}
      </div>

      {/* What each section drives */}
      <details className="direct-upload__details" open>
        <summary className="direct-upload__summary">What to fill and why it matters</summary>
        <div className="direct-upload__guide">
          {DIRECT_GUIDE_SECTIONS.map(({ title, color, why, fields }) => (
            <div key={title} className="direct-upload__guide-section">
              <div className="direct-upload__guide-header" style={{ borderLeftColor: color }}>
                <span className="direct-upload__guide-title">{title}</span>
                <span className="direct-upload__guide-why">{why}</span>
              </div>
              <ul className="direct-upload__guide-fields">
                {fields.map(({ name, required, note }) => (
                  <li key={name}>
                    <span className="direct-upload__field-name">
                      {name}
                      {required && <span className="direct-upload__required">Required</span>}
                    </span>
                    <span className="direct-upload__field-note">{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>

      {/* Common mistakes */}
      <details className="direct-upload__details">
        <summary className="direct-upload__summary">Common mistakes to avoid</summary>
        <ul className="direct-upload__mistakes">
          {DIRECT_MISTAKES.map(({ title, fix }) => (
            <li key={title}>
              <strong>{title}</strong> — {fix}
            </li>
          ))}
        </ul>
      </details>

      {/* Upload zone */}
      {job === "idle" && (
        <DropZone
          title="Drop your completed tracker here"
          subtitle={"File must be named after the client — e.g. 'Maruti Suzuki Tracker.xlsx'\nMust include Position Tracker + Contractual sheets"}
          icon="📋"
          accent="var(--accent)"
          onFile={runValidate}
        />
      )}

      {/* Progress */}
      {(job === "running" || job === "done" || job === "error" || job === "preview") && (
        <div className="direct-upload__progress">
          <div className="direct-upload__stepList">
            {steps.map((s, i) => {
              const icon = s.status === "done" ? "✓" : s.status === "running" ? "⟳" : s.status === "error" ? "✗" : "○";
              const col = s.status === "done" ? "var(--green)" : s.status === "running" ? "var(--accent)" : s.status === "error" ? "var(--red)" : "var(--text-muted)";
              return (
                <div key={i} className="direct-upload__stepRow" style={{ opacity: s.status === "pending" ? 0.4 : 1 }}>
                  <span style={{ color: col, minWidth: 16, textAlign: "center" }}>{icon}</span>
                  <span style={{ color: col, fontSize: 12 }}>{s.label}</span>
                </div>
              );
            })}
          </div>

          {validationPreview && job === "preview" && (
            <ValidationPreviewPanel
              preview={validationPreview}
              onConfirm={() => void runCommit()}
              onCancel={reset}
              confirming={false}
            />
          )}

          {result && job === "done" && (
            <div className="direct-upload__success">
              <div className="direct-upload__success-title">Upload complete</div>
              <p className="direct-upload__success-note">
                Your data is now in the system. Check <strong>Requisitions</strong> and the client dashboard to verify pipeline counts and revenue.
              </p>
              <div className="direct-upload__success-stats">
                {[
                  { label: "Client project", value: result.project_id },
                  { label: "Rows loaded", value: result.records_upserted ?? result.records_processed ?? "—" },
                  { label: "Skipped", value: result.rows_skipped ?? "—" },
                  { label: "Columns matched", value: columnMappingEntryCount(result.mapping) },
                ].map(({ label, value }) => (
                  <div key={label} className="direct-upload__stat">
                    <div className="direct-upload__stat-value">{value}</div>
                    <div className="direct-upload__stat-label">{label}</div>
                  </div>
                ))}
              </div>
              {(result.warnings ?? []).length > 0 && (
                <details className="direct-upload__warnings" open={false}>
                  <summary className="direct-upload__warnings-toggle">
                    {(result.warnings ?? []).length} post-upload warning{(result.warnings ?? []).length === 1 ? "" : "s"}
                  </summary>
                  <table className="direct-upload__warnings-table">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Field</th>
                        <th>Raw</th>
                        <th>Issue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.warnings ?? []).slice(0, 30).map((w: any, i: number) => (
                        <tr key={`${w.row}-${w.field}-${i}`}>
                          <td>{w.row}</td>
                          <td>{w.field}</td>
                          <td>{w.raw ?? w.resolved ?? "—"}</td>
                          <td>{w.issue ?? (w.resolved ? `→ ${w.resolved}` : "—")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          )}

          {log.length > 0 && (
            <div className="direct-upload__log">
              {log.map((e) => (
                <div key={e.id} className="direct-upload__logLine">
                  <span className="direct-upload__logTs">{e.ts}</span>
                  <span style={{ color: TAG_COLOR[e.level] }}>{e.message}</span>
                </div>
              ))}
            </div>
          )}

          {(job === "done" || job === "error") && (
            <button type="button" className="direct-upload__resetBtn" onClick={reset}>
              Upload another file
            </button>
          )}
        </div>
      )}

      <InfoCallout title="Updating data later">
        <ul>
          <li>When a candidate joins or status changes, update the row in Excel and upload the same file again.</li>
          <li>Only changed rows are updated — nothing is deleted automatically.</li>
          <li>The <strong>Contractual</strong> sheet is read once per client. Re-upload if fee terms change.</li>
          <li>For non-standard Excel formats (old client trackers), use the <strong>Express</strong> or <strong>Pro Path</strong> tabs instead.</li>
        </ul>
      </InfoCallout>
    </PlatformSection>
  );
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
