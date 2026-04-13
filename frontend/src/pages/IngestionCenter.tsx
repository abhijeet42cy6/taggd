import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, queries, columnMappingEntryCount, type IngestionEventRow } from "@/lib/api";
import { isPlatformAdminRole, isRecruiterUser, useAuth } from "@/lib/auth";
import { PlatformSection, PageHeader, Tabs } from "@/components/platform/PlatformBlocks";
import { ColumnMappingDisplay } from "@/components/ColumnMappingDisplay";

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
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `1.5px dashed ${dragOver ? accent : `${accent}60`}`,
          borderRadius: 10, padding: "24px 16px", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 8,
          background: dragOver
            ? `color-mix(in srgb, ${accent} 14%, var(--surface-raised, #fff))`
            : "color-mix(in srgb, var(--accent) 5%, var(--surface-muted, #f4f4f5))",
          transition: "all .15s", opacity: disabled ? 0.5 : 1,
          minHeight: 130, textAlign: "center",
        }}>
        <div style={{ fontSize: 30, color: accent }}>{icon}</div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13 }}>{title}</div>
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", lineHeight: 1.5 }}>{subtitle}</div>
        <div style={{ fontSize: 9.5, color: accent, fontFamily: "'DM Mono',monospace", marginTop: 2 }}>
          Click or drag & drop
        </div>
      </div>
    </label>
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
};

const INGESTION_TABS = [
  "Express",
  "Pro Path",
  "SLA",
  "WFM",
  "Finance",
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
    <PlatformSection title="Recent ingestion activity">
      <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 14px", lineHeight: 1.45, maxWidth: 640 }}>
        {scopeHint}
      </p>
      {loading ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "12px 0" }}>Loading activity…</div>
      ) : events.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "16px 12px", textAlign: "center", borderRadius: 10, border: "1px dashed var(--border)", background: "var(--surface-muted)" }}>
          No recorded runs yet. Uploads from Express, Pro, SLA, WFM, and Finance appear here.
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
      wfm.appendLog(`[${tsNow()}] ✓ WFM data committed`, "success");
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

  // ── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        title="Ingestion Center"
        subtitle={
          recruiterView
            ? "Run uploads for your assigned projects. The activity feed shows ingestion you triggered; project scope still applies to matching and commits."
            : "Data onboarding · AI-assisted schema mapping · Validation gates · Multi-path ingestion"
        }
      />

      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 6,
          margin: "0 -4px",
          padding: "8px 10px 10px",
          background: "linear-gradient(180deg, var(--surface-page, #fafafa) 70%, transparent)",
          borderBottom: "1px solid color-mix(in srgb, var(--border) 70%, transparent)",
        }}
      >
        <Tabs tabs={[...INGESTION_TABS]} active={tab} onChange={(t) => setTab(t as IngestionTab)} />
      </div>

      {/* ── EXPRESS TAB ──────────────────────────────────────────────────────── */}
      {tab === "Express" && (
        <PlatformSection title="Express Path — AI Ingestion Pipeline">
          {express.job === "idle" && (
            <div className="platform-grid-2" style={{ gap: 16, alignItems: "stretch" }}>
              <DropZone
                title="Express upload"
                subtitle={"Tracking sheet (Req / Placement)\nAI auto-maps columns & synthesizes revenue logic"}
                icon="⬆"
                accent="var(--accent)"
                onFile={handleExpress}
                disabled={false}
              />
              <div
                style={{
                  padding: "18px 16px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--surface-raised, #fff)",
                  boxShadow: "0 2px 12px rgba(15, 23, 42, 0.06)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, fontFamily: "'Syne',sans-serif" }}>How it works</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: "var(--text-subtle)", lineHeight: 1.65 }}>
                  <li>Supports Requisitions, Placement, and Offer trackers.</li>
                  <li>AI identifies sheets, maps columns, and synthesizes revenue logic.</li>
                  <li>Progress and logs appear below after you upload.</li>
                </ul>
              </div>
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
        </PlatformSection>
      )}

      {/* ── PRO PATH TAB ──────────────────────────────────────────────────────── */}
      {tab === "Pro Path" && (
        <PlatformSection title="Pro Path — Review & Confirm">
          {proInspect.job === "idle" && proRun.job === "idle" && (
            <div className="platform-grid-2" style={{ gap: 16, alignItems: "stretch" }}>
              <DropZone
                title="Pro upload"
                subtitle={"Multi-sheet Excel\nReview AI sheet suggestions before committing"}
                icon="⬆⬆"
                accent="var(--accent2)"
                onFile={handleProInspect}
                disabled={false}
              />
              <div
                style={{
                  padding: "18px 16px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--surface-raised, #fff)",
                  boxShadow: "0 2px 12px rgba(15, 23, 42, 0.06)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, fontFamily: "'Syne',sans-serif" }}>Pro path</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: "var(--text-subtle)", lineHeight: 1.65 }}>
                  <li>Best for complex multi-sheet workbooks.</li>
                  <li>Step 1: AI classifies sheets — you review selections.</li>
                  <li>Step 2: Confirm contract + data sheets, then the full pipeline runs.</li>
                </ul>
              </div>
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
          title="SLA Performance Ingestion"
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
          title="Workforce Management Ingestion"
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
          title="Finance Ledger Ingestion"
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

      {/* ── RUN LOG TAB ──────────────────────────────────────────────────────── */}
      {tab === "Run Log" && (
        <PlatformSection title="All Run Logs">
          {[
            { label: "Express", log: express.log },
            { label: "Pro Inspect", log: proInspect.log },
            { label: "Pro Pipeline", log: proRun.log },
            { label: "SLA", log: sla.log },
            { label: "WFM", log: wfm.log },
            { label: "Finance", log: finance.log },
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
          {[express.log, proInspect.log, proRun.log, sla.log, wfm.log, finance.log].every((l) => !l.length) && (
            <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>No run events yet — start an upload from Express, Pro, SLA, WFM, or Finance tabs to see logs here.</div>
          )}
        </PlatformSection>
      )}

      <IngestionActivitySection events={ingestionEvents} loading={eventsLoading} role={user?.role} />
    </div>
  );
}

// ─── SPECIALIZED TAB ──────────────────────────────────────────────────────────

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
      {/* HINT */}
      <div style={{ padding: "7px 12px", background: `${accent}0d`, border: `1px solid ${accent}30`, borderRadius: 7, fontSize: 10.5, color: accent, fontFamily: "'DM Mono',monospace", marginBottom: 14 }}>
        {hint}
      </div>

      <div className="platform-grid-2" style={{ gap: 14 }}>
        {/* LEFT — drop zone */}
        <DropZone
          title={title.split("Ingestion")[0].trim()}
          subtitle={subtitle}
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
