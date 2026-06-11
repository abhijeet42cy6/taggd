import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, invalidateCache, queries, columnMappingEntryCount, type IngestionEventRow, type Project } from "@/lib/api";
import { isPlatformAdminRole, isRecruiterUser, useAuth } from "@/lib/auth";
import { PlatformSection, Tabs } from "@/components/platform/PlatformBlocks";
import { ColumnMappingDisplay } from "@/components/ColumnMappingDisplay";
import "@/styles/ingestion-center.css";

// ─── TYPES ────────────────────────────────────────────────────────────────────

type LogLevel = "info" | "success" | "warning" | "error";
type LogEntry = { id: string; message: string; level: LogLevel; ts: string };
type JobStatus = "idle" | "running" | "done" | "error" | "review";

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
  pro_inspect: "Pro · inspect",
  pro_confirm: "Pro · run",
  sla: "SLA",
  wfm: "WFM",
  finance: "Finance",
  revenue_trackers: "Revenue trackers",
  candidates: "Candidates",
};

const INGESTION_TABS = [
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
  const [tab, setTab] = useState<IngestionTab>("Express");

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
            : "Bring workbooks into the live database — AI-assisted column mapping, validation gates, and clear paths for trackers, revenue templates, SLA, WFM, and finance."}
        </p>
      </header>

      <div className="ingestion-center__tabs">
        <div className="ingestion-center__tabRail">
          <Tabs tabs={[...INGESTION_TABS]} active={tab} onChange={(t) => setTab(t as IngestionTab)} />
        </div>
      </div>

      {/* ── EXPRESS TAB ──────────────────────────────────────────────────────── */}
      {tab === "Express" && (
        <PlatformSection title="Express">
          <p className="ingestion-center__tabIntro">
            Upload requisition or placement trackers. AI identifies sheets, maps columns, and prepares revenue logic before you
            commit.
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
          subtitle="Upload client candidate tracker workbooks (sheet: Candidate Tracker). Maps headers heuristically, upserts into Candidates, and creates mandate stubs when Req No is present."
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

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
