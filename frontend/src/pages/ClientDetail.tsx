import React, { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import {
  queries,
  columnMappingEntryCount,
  type RecordRow,
  type RecordsPage,
  type Project,
  type ProjectContractRow,
} from "@/lib/api";
import { clientsVm, type ClientVm } from "@/lib/view-models/clients";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import {
  PlatformKpi, PlatformSection, PageHeader, Tabs, StatusTag, KvRow,
} from "@/components/platform/PlatformBlocks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RequisitionRecordDrawer } from "@/components/platform/RequisitionRecordDrawer";
import { RequisitionCreateDrawer } from "@/components/platform/RequisitionCreateDrawer";
import { SkeletonKpiRow, SkeletonTable, Skeleton } from "@/components/platform/Skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ReqStatusStackedBar, AgeingBars, LevelDonutChart } from "@/components/platform/Charts";
import { ColumnMappingDisplay } from "@/components/ColumnMappingDisplay";

const PER_PAGE = 50;

const SLA_WFM_SECTION_INFO = (
  <>
    Pulled from stored uploads: <strong>sla_performances</strong> + <strong>metric_definitions</strong> (monthly % met) and{" "}
    <strong>wfm_hr_benchmarks</strong> (ideal/actual HC, lateral productivity target). Period = latest month row per project.
  </>
);

function scoreColor(s: number) {
  return s >= 70 ? "var(--green)" : s >= 45 ? "var(--amber)" : "var(--red)";
}
function scoreLabel(s: number) {
  return s >= 70 ? "Strong" : s >= 45 ? "Watch" : "At Risk";
}

// ─── STACKED BAR DATA ─────────────────────────────────────────────────────────
type StackedDatum = { name: string; joined: number; open: number; offer: number; cancelled: number };

function buildStackedData(records: RecordRow[]): StackedDatum[] {
  const counts: Record<string, StackedDatum> = {};
  for (const r of records) {
    const proj = `P${String(r.project_id).padStart(2, "0")}`;
    if (!counts[proj]) counts[proj] = { name: proj, joined: 0, open: 0, offer: 0, cancelled: 0 };
    const s = (r.global_status || r.status || "").toLowerCase();
    if (s.includes("clos") || s.includes("join")) counts[proj].joined++;
    else if (s.includes("offer")) counts[proj].offer++;
    else if (s.includes("cancel")) counts[proj].cancelled++;
    else counts[proj].open++;
  }
  return Object.values(counts);
}

// ─── AGEING BUCKETS ───────────────────────────────────────────────────────────
/** Pipeline ageing only: days since creation_date; CLOSED reqs excluded (same rule as /stats/global/monitor). */
function isClosedForAgeing(r: RecordRow): boolean {
  return (r.global_status ?? "").trim().toUpperCase() === "CLOSED";
}

function daysOpenFromCreation(r: RecordRow): number | null {
  if (r.creation_date) {
    const d = new Date(r.creation_date);
    if (!Number.isNaN(d.getTime())) {
      return Math.floor((Date.now() - d.getTime()) / 86_400_000);
    }
  }
  if (r.ageing != null && r.ageing >= 0) return r.ageing;
  return null;
}

function buildAgeingBuckets(records: RecordRow[]) {
  const b = { "0–30d": 0, "31–60d": 0, "61–90d": 0, "90+d": 0 };
  for (const r of records) {
    if (isClosedForAgeing(r)) continue;
    const days = daysOpenFromCreation(r);
    if (days == null || days < 0) continue;
    if (days <= 30) b["0–30d"]++;
    else if (days <= 60) b["31–60d"]++;
    else if (days <= 90) b["61–90d"]++;
    else b["90+d"]++;
  }
  const max = Math.max(...Object.values(b), 1);
  return [
    { label: "0–30 days", count: b["0–30d"], max, color: "var(--green)" },
    { label: "31–60 days", count: b["31–60d"], max, color: "var(--amber)" },
    { label: "61–90 days", count: b["61–90d"], max, color: "var(--red)" },
    { label: "90+ days", count: b["90+d"], max, color: "var(--red)" },
  ];
}

// ─── LEVEL DONUT DATA ─────────────────────────────────────────────────────────
// Real department breakdown — top 8 by frequency, rest grouped as "Other"
function buildLevelData(records: RecordRow[]) {
  const freq: Record<string, number> = {};
  for (const r of records) {
    const dept = (r.department || "").trim();
    if (!dept || dept === "nan") continue;
    freq[dept] = (freq[dept] || 0) + 1;
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 8);
  const otherCount = sorted.slice(8).reduce((s, [, v]) => s + v, 0);
  const result = top.map(([name, value]) => ({ name, value }));
  if (otherCount > 0) result.push({ name: "Other", value: otherCount });
  return result;
}

// ─── STATUS BREAKDOWN TABLE ───────────────────────────────────────────────────
function statusBreakdown(records: RecordRow[]) {
  const map: Record<string, number> = {};
  for (const r of records) {
    const s = r.global_status || r.status || "Unknown";
    map[s] = (map[s] || 0) + 1;
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({ status, count, pct: Math.round((count / records.length) * 100) }));
}

// ─── REVENUE LOGIC CARD ───────────────────────────────────────────────────────

type LogicPreviewContext = {
  savedPath: string;
  contractSheet: string;
  trackerSheet: string;
  originalFilename: string;
  sheetReasoning: string;
  sheetConfidence: number;
  dataSheets: string[];
};

function httpDetail(e: unknown): string {
  const d = e && typeof e === "object" && "response" in e
    ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
    : undefined;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
  return "";
}

function RevenueLogicCard({
  project,
  onProjectsRefresh,
  onRecordsRefresh,
}: {
  project: Project;
  onProjectsRefresh?: () => void | Promise<void>;
  onRecordsRefresh?: () => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewExplanation, setPreviewExplanation] = useState("");
  const [previewCode, setPreviewCode] = useState("");
  const [previewContext, setPreviewContext] = useState<LogicPreviewContext | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [logicError, setLogicError] = useState<string | null>(null);

  const hasLogic = Boolean(project.revenue_logic_code);
  const hasExplanation = Boolean(project.logic_explanation);

  function openUploadModal() {
    setLogicError(null);
    setUploadFile(null);
    setUploadOpen(true);
  }

  function closeUploadModal() {
    setUploadOpen(false);
    setUploadFile(null);
    setDragOver(false);
    setLogicError(null);
  }

  function pickFile(f: File | null) {
    if (!f) return;
    const ext = f.name.toLowerCase();
    if (!ext.endsWith(".xlsx") && !ext.endsWith(".xlsm") && !ext.endsWith(".xls")) {
      setLogicError("Please choose an Excel file (.xlsx, .xlsm, or .xls).");
      return;
    }
    setLogicError(null);
    setUploadFile(f);
  }

  async function runUploadAndPreview() {
    if (!uploadFile) return;
    setLogicError(null);
    setRegenLoading(true);
    try {
      const res = (await queries.regenerateProjectLogicFromUpload(project.id, uploadFile)) as {
        new_explanation?: string;
        new_python_code?: string;
        saved_path?: string;
        contract_sheet?: string;
        tracker_sheet?: string;
        data_sheets?: string[];
        sheet_reasoning?: string;
        sheet_confidence?: number;
        original_filename?: string;
      };
      setPreviewExplanation(res.new_explanation ?? "");
      setPreviewCode(res.new_python_code ?? "");
      setPreviewContext(
        res.saved_path && res.contract_sheet != null && res.tracker_sheet != null
          ? {
              savedPath: res.saved_path,
              contractSheet: res.contract_sheet,
              trackerSheet: res.tracker_sheet,
              originalFilename: res.original_filename ?? uploadFile.name,
              sheetReasoning: res.sheet_reasoning ?? "",
              sheetConfidence: typeof res.sheet_confidence === "number" ? res.sheet_confidence : 0,
              dataSheets: Array.isArray(res.data_sheets) ? res.data_sheets : [],
            }
          : null,
      );
      closeUploadModal();
      setPreviewOpen(true);
    } catch (e: unknown) {
      const msg = httpDetail(e);
      setLogicError(msg || "Could not process the workbook.");
    } finally {
      setRegenLoading(false);
    }
  }

  async function applyPreviewedLogic() {
    if (!previewCode.trim() && !previewExplanation.trim()) return;
    setLogicError(null);
    setApplyLoading(true);
    try {
      await queries.updateProjectLogic(project.id, {
        revenue_logic_code: previewCode,
        logic_explanation: previewExplanation,
        ...(previewContext
          ? {
              source_filename: previewContext.savedPath,
              contract_sheet: previewContext.contractSheet,
              tracker_sheet: previewContext.trackerSheet,
              filename: previewContext.originalFilename,
            }
          : {}),
      });
      await queries.recalculateProject(project.id);
      await Promise.all([
        onProjectsRefresh?.(),
        onRecordsRefresh?.(),
      ]);
      setPreviewOpen(false);
      setPreviewContext(null);
    } catch (e: unknown) {
      const msg = httpDetail(e);
      setLogicError(msg || "Could not apply logic.");
    } finally {
      setApplyLoading(false);
    }
  }

  function closePreview() {
    setPreviewOpen(false);
    setPreviewContext(null);
    setLogicError(null);
  }

  const uploadModal = (
    <Dialog open={uploadOpen} onOpenChange={(o) => { if (!o) closeUploadModal(); }}>
      <DialogContent
        showCloseButton
        className={cn("platform-dialog min-h-0 max-h-[90vh] overflow-hidden")}
      >
        <DialogHeader className="platform-dialog__header">
          <div className="platform-dialog__eyebrow">Revenue logic · PRJ-{project.id}</div>
          <DialogTitle className="platform-dialog__title">Re-upload Excel workbook</DialogTitle>
          <DialogDescription className="platform-dialog__desc">
            Upload the same or updated client workbook. Contract and tracker sheets are identified like ingestion; new logic is generated for your review before applying.
          </DialogDescription>
        </DialogHeader>
        <div className="platform-dialog__body">
          {logicError && uploadOpen && (
            <div className="platform-dialog__alert mb-3" role="alert">
              {logicError}
            </div>
          )}
          <div
            className={cn("platform-dialog__dropzone", dragOver && "is-drag")}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              pickFile(f ?? null);
            }}
            onClick={() => document.getElementById(`logic-upload-${project.id}`)?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                document.getElementById(`logic-upload-${project.id}`)?.click();
              }
            }}
            role="button"
            tabIndex={0}
          >
            <input
              id={`logic-upload-${project.id}`}
              type="file"
              accept=".xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(ev) => pickFile(ev.target.files?.[0] ?? null)}
            />
            <div className="platform-dialog__dropzone-hint">
              Drag and drop an <span className="text-[color:var(--accent)]">.xlsx</span> file here, or click to browse
            </div>
            {uploadFile ? (
              <div className="platform-dialog__dropzone-file">{uploadFile.name}</div>
            ) : (
              <div className="platform-dialog__meta">
                <span className="platform-badge blue">No file selected</span>
              </div>
            )}
          </div>
        </div>
        <div className="platform-dialog__footer">
          <button type="button" className="platform-dialog__btn" onClick={closeUploadModal} disabled={regenLoading}>
            Cancel
          </button>
          <button
            type="button"
            className={cn("platform-dialog__btn", "platform-dialog__btn--primary")}
            onClick={() => void runUploadAndPreview()}
            disabled={!uploadFile || regenLoading}
          >
            {regenLoading ? "Analyzing…" : "Analyze & preview logic"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const previewModal = (
    <Dialog open={previewOpen} onOpenChange={(o) => { if (!o) closePreview(); }}>
      <DialogContent
        showCloseButton
        className={cn("platform-dialog platform-dialog--wide min-h-0 max-h-[90vh] overflow-hidden")}
      >
        <DialogHeader className="platform-dialog__header">
          <div className="platform-dialog__eyebrow">Review · PRJ-{project.id}</div>
          <DialogTitle className="platform-dialog__title">New revenue logic</DialogTitle>
          <DialogDescription className="platform-dialog__desc">
            Sheets were classified automatically. Confirm the explanation and code, then apply to recalculate revenue for all records linked to this client.
          </DialogDescription>
        </DialogHeader>
        <div className="platform-dialog__body platform-dialog__body--tall space-y-3">
          {logicError && (
            <div className="platform-dialog__alert" role="alert">
              {logicError}
            </div>
          )}
          {previewContext && (
            <div className="platform-dialog__panel">
              <div className="platform-dialog__section-label">Sheet identification</div>
              <div className="platform-dialog__panel-row">
                <span className="platform-dialog__panel-k">File</span>
                <span className="platform-dialog__panel-v">{previewContext.originalFilename}</span>
              </div>
              <div className="platform-dialog__panel-row">
                <span className="platform-dialog__panel-k">Contract</span>
                <span className="platform-dialog__panel-v">{previewContext.contractSheet}</span>
              </div>
              <div className="platform-dialog__panel-row">
                <span className="platform-dialog__panel-k">Tracker</span>
                <span className="platform-dialog__panel-v">{previewContext.trackerSheet}</span>
              </div>
              {previewContext.dataSheets.length > 0 && (
                <div className="platform-dialog__panel-row mt-1">
                  <span className="platform-dialog__panel-k">Data sheets</span>
                  <span className="platform-dialog__panel-v">{previewContext.dataSheets.join(", ")}</span>
                </div>
              )}
              <div className="platform-dialog__meta">
                <span className="platform-badge blue">
                  Confidence {Math.round(previewContext.sheetConfidence * 1000) / 1000}
                </span>
              </div>
              {previewContext.sheetReasoning && (
                <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--text-muted)] whitespace-pre-wrap border-t border-[var(--border)] pt-2">
                  {previewContext.sheetReasoning}
                </p>
              )}
            </div>
          )}
          <div>
            <div className="platform-dialog__section-label">Logic explanation</div>
            <div className="platform-dialog__prose">
              {previewExplanation || "—"}
            </div>
          </div>
          <div>
            <div className="platform-dialog__section-label">Python function</div>
            <pre className="platform-dialog__code">
              <code>{previewCode || "—"}</code>
            </pre>
          </div>
        </div>
        <div className="platform-dialog__footer">
          <button type="button" className="platform-dialog__btn" onClick={closePreview} disabled={applyLoading}>
            Discard
          </button>
          <button
            type="button"
            className={cn("platform-dialog__btn", "platform-dialog__btn--primary")}
            onClick={() => void applyPreviewedLogic()}
            disabled={applyLoading || regenLoading}
          >
            {applyLoading ? "Applying…" : "Save & apply to records"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (!hasLogic && !hasExplanation) {
    return (
      <>
        <div className="platform-card" style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>
              Revenue Logic — PRJ-{project.id}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="platform-badge" style={{ background: "rgba(255,79,107,0.12)", color: "var(--red)", border: "1px solid rgba(255,79,107,0.2)" }}>
                Not Generated
              </span>
              <button
                type="button"
                onClick={openUploadModal}
                disabled={regenLoading}
                style={{
                  background: "color-mix(in srgb, var(--accent) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                  color: "var(--accent)", borderRadius: 6, padding: "4px 12px", cursor: regenLoading ? "wait" : "pointer",
                  fontSize: 10.5, fontFamily: "'DM Mono',monospace",
                }}
              >
                {regenLoading ? "Working…" : "Generate logic"}
              </button>
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 6 }}>
            Upload a contract sheet for this project to generate AI revenue logic.
          </div>
          {logicError && !uploadOpen && !previewOpen && (
            <div style={{ fontSize: 11, color: "var(--red)", marginTop: 8 }}>{logicError}</div>
          )}
        </div>
        {uploadModal}
        {previewModal}
      </>
    );
  }

  return (
    <>
    <div className="platform-card" style={{ padding: "14px 16px" }}>
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 600, fontSize: 12 }}>
            Revenue Logic — PRJ-{project.id}
          </div>
          <span className="platform-badge green">AI Generated</span>
          {project.filename && (
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9.5, color: "var(--text-muted)" }}>
              {project.filename}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={openUploadModal}
            disabled={regenLoading}
            style={{
              background: "rgba(255,180,71,0.1)", border: "1px solid rgba(255,180,71,0.35)",
              color: "var(--amber)", borderRadius: 6, padding: "4px 12px", cursor: regenLoading ? "wait" : "pointer",
              fontSize: 10.5, fontFamily: "'DM Mono',monospace",
            }}
          >
            {regenLoading ? "Working…" : "Regenerate logic"}
          </button>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            background: "color-mix(in srgb, var(--accent) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
            color: "var(--accent)", borderRadius: 6, padding: "4px 12px", cursor: "pointer",
            fontSize: 10.5, fontFamily: "'DM Mono',monospace",
          }}
        >
          {expanded ? "Hide Code ↑" : "Show Code ↓"}
        </button>
        </div>
      </div>

      {/* NATURAL LANGUAGE EXPLANATION — always visible */}
      {hasExplanation && (
        <div style={{
          background: "rgba(79,143,255,0.06)", border: "1px solid color-mix(in srgb, var(--accent) 15%, transparent)",
          borderRadius: 8, padding: "10px 14px", marginBottom: expanded ? 12 : 0,
        }}>
          <div style={{ fontSize: 9.5, fontFamily: "'DM Mono',monospace", color: "var(--accent)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Logic Explanation
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
            {project.logic_explanation}
          </div>
        </div>
      )}

      {/* PYTHON CODE — togglable */}
      {expanded && hasLogic && (
        <div style={{ position: "relative" }}>
          <div style={{
            fontSize: 9.5, fontFamily: "'DM Mono',monospace", color: "var(--text-muted)",
            marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ textTransform: "uppercase", letterSpacing: "0.07em" }}>Python Function</span>
            <button
              onClick={() => navigator.clipboard.writeText(project.revenue_logic_code ?? "")}
              style={{
                background: "none", border: "1px solid var(--border)", color: "var(--text-muted)",
                borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 9.5,
              }}
            >
              Copy
            </button>
          </div>
          <pre style={{
            background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
            padding: "14px 16px", fontFamily: "'DM Mono',monospace", fontSize: 11,
            color: "var(--text-muted)", lineHeight: 1.7, overflowX: "auto", whiteSpace: "pre",
            maxHeight: 480, overflowY: "auto", margin: 0,
          }}>
            <code>{project.revenue_logic_code}</code>
          </pre>
        </div>
      )}
      {logicError && !previewOpen && !uploadOpen && (
        <div style={{ fontSize: 11, color: "var(--red)", marginTop: 10 }}>{logicError}</div>
      )}
    </div>
    {uploadModal}
    {previewModal}
    </>
  );
}

// ─── FILTER PILL ──────────────────────────────────────────────────────────────
function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 8px", borderRadius: 4,
      background: "color-mix(in srgb, var(--accent) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
      fontSize: 10, fontFamily: "'DM Mono',monospace", color: "var(--accent)",
    }}>
      {label}
      <span onClick={onRemove} style={{ cursor: "pointer", color: "var(--text-subtle)", fontSize: 11, lineHeight: 1 }}>×</span>
    </div>
  );
}

// ─── SLA / WFM SNAPSHOT (DB: sla_performances + metric_definitions, wfm_hr_benchmarks) ─
type SlaTimeseriesAccount = {
  account_name: string;
  timeline: Array<{ month: string; met: number; not_met: number; not_reported: number; met_pct: number | null; total: number }>;
};

type WfmBenchRow = {
  project_id: number;
  account_name: string;
  reporting_date: string | null;
  ideal_hc: number;
  actual_hc_total: number;
  lateral_productivity_target: number;
};

function pickLatestSlaMetPct(
  series: SlaTimeseriesAccount[],
  accountNames: string[],
): { month: string; metPct: number | null } | null {
  const want = new Set(accountNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  const hits = series.filter((s) => want.has(s.account_name.trim().toLowerCase()));
  if (!hits.length) return null;
  const tails = hits
    .map((h) => {
      const t = h.timeline;
      if (!t.length) return null;
      const last = t[t.length - 1];
      return { month: last.month, metPct: last.met_pct, total: last.total };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (!tails.length) return null;
  let w = 0;
  let s = 0;
  for (const p of tails) {
    if (p.metPct == null || !p.total) continue;
    s += p.metPct * p.total;
    w += p.total;
  }
  if (w > 0) {
    return { month: tails[0].month, metPct: Math.round((s / w) * 10) / 10 };
  }
  const withPct = tails.find((p) => p.metPct != null);
  if (withPct) return { month: withPct.month, metPct: withPct.metPct };
  return { month: tails[0].month, metPct: null };
}

function aggregateLatestWfm(rows: WfmBenchRow[], projectIds: number[]) {
  const filtered = rows.filter((r) => projectIds.includes(r.project_id));
  if (!filtered.length) return null;
  const byPid = new Map<number, WfmBenchRow>();
  for (const r of filtered) {
    const prev = byPid.get(r.project_id);
    const rd = r.reporting_date || "";
    if (!prev || rd > (prev.reporting_date || "")) byPid.set(r.project_id, r);
  }
  const latest = [...byPid.values()];
  const ideal = latest.reduce((a, r) => a + (Number(r.ideal_hc) || 0), 0);
  const actual = latest.reduce((a, r) => a + (Number(r.actual_hc_total) || 0), 0);
  const fillPct = ideal > 0 ? Math.round((actual / ideal) * 1000) / 10 : null;
  const prodW = latest.reduce((a, r) => a + (Number(r.lateral_productivity_target) || 0) * (Number(r.ideal_hc) || 0), 0);
  const prodAvg = ideal > 0 ? prodW / ideal : latest.reduce((a, r) => a + (Number(r.lateral_productivity_target) || 0), 0) / latest.length;
  const reportingDate = latest.map((r) => r.reporting_date).filter(Boolean).sort().reverse()[0] ?? null;
  return { fillPct, prodAvg: Math.round(prodAvg * 100) / 100, ideal, actual, reportingDate, nProjects: latest.length };
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function ClientDetail() {
  const { clientId: clientIdParam } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const rawParam = clientIdParam ?? "";
  const legacyDecoded = decodeURIComponent(rawParam);
  const numericClientId = /^\d+$/.test(rawParam) ? parseInt(rawParam, 10) : null;

  // meta — unified client cockpit (legal client + SBU projects)
  const [clientVm, setClientVm] = useState<ClientVm | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // all records (source of truth — used for both table and charts)
  const [allRecords, setAllRecords] = useState<RecordRow[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);

  // table filter state
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDept, setFilterDept] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterAgeing, setFilterAgeing] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);

  const [activeTab, setActiveTab] = useState("Requisitions");
  const [selectedReq, setSelectedReq] = useState<RecordRow | null>(null);
  const [addReqOpen, setAddReqOpen] = useState(false);

  const [slaTimeseries, setSlaTimeseries] = useState<SlaTimeseriesAccount[]>([]);
  const [wfmRows, setWfmRows] = useState<WfmBenchRow[]>([]);
  const [loadingOps, setLoadingOps] = useState(true);

  const [contractsByProject, setContractsByProject] = useState<Map<number, ProjectContractRow[]>>(new Map());
  const [loadingContracts, setLoadingContracts] = useState(false);

  const displayClientName = clientVm?.officialName ?? legacyDecoded;

  useEffect(() => {
    let cancelled = false;
    setLoadingMeta(true);
    if (numericClientId != null && numericClientId > 0) {
      queries
        .clientDetail(numericClientId)
        .then((g) => {
          if (cancelled) return;
          setClientVm({
            id: g.id,
            officialName: g.official_name,
            shortCode: g.short_code,
            client: g.official_name,
            projects: g.projects,
            projectIds: g.projects.map((p) => p.id),
            split: g.projects.length > 1,
          });
          setLoadingMeta(false);
        })
        .catch(() => {
          if (!cancelled) {
            setClientVm(null);
            setLoadingMeta(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }
    queries.projects().then((ps) => {
      if (cancelled) return;
      const vm = clientsVm(ps).find((c) => c.client === legacyDecoded) ?? null;
      setClientVm(vm);
      setLoadingMeta(false);
    });
    return () => {
      cancelled = true;
    };
  }, [rawParam, numericClientId, legacyDecoded]);

  const projectIds = clientVm?.projectIds ?? [];

  const addRequisitionProjects = useMemo(() => {
    const projs = clientVm?.projects ?? [];
    const multi = projs.length > 1;
    return projs.map((p) => {
      const fn = p.filename || "Project";
      const shortFn = fn.length > 40 ? `${fn.slice(0, 37)}…` : fn;
      const clientName =
        (p.engagement_name && String(p.engagement_name).trim()) ||
        (p.account_name && String(p.account_name).trim()) ||
        displayClientName;
      const base = `${clientName} · PRJ-${p.id}`;
      return {
        id: p.id,
        label: multi ? `${base} · ${shortFn}` : base,
      };
    });
  }, [clientVm?.projects, displayClientName]);

  function refreshProjects() {
    if (numericClientId != null && numericClientId > 0) {
      return queries.clientDetail(numericClientId).then((g) => {
        setClientVm({
          id: g.id,
          officialName: g.official_name,
          shortCode: g.short_code,
          client: g.official_name,
          projects: g.projects,
          projectIds: g.projects.map((p) => p.id),
          split: g.projects.length > 1,
        });
      });
    }
    return queries.projects().then((ps) => {
      const vm = clientsVm(ps).find((c) => c.client === legacyDecoded) ?? null;
      setClientVm(vm);
    });
  }

  function refreshRecords() {
    if (!projectIds.length) return Promise.resolve();
    return Promise.all(
      projectIds.map((pid) => queries.recordsAll({ page: 1, per_page: 500, project_id: pid })),
    ).then((pages) => { setAllRecords(pages.flatMap((p) => p.records)); });
  }

  // Reset page when any filter changes
  useEffect(() => { setPage(1); }, [search, filterStatus, filterDept, filterLocation, filterAgeing, filterDateFrom, filterDateTo]);

  // Load ALL records once per client — used for both table and charts
  useEffect(() => {
    if (!projectIds.length) { setLoadingRecords(false); return; }
    let mounted = true;
    setLoadingRecords(true);
    Promise.all(
      projectIds.map((pid) => queries.recordsAll({ page: 1, per_page: 500, project_id: pid }))
    ).then((pages) => {
      if (!mounted) return;
      setAllRecords(pages.flatMap((p) => p.records));
      setLoadingRecords(false);
    });
    return () => { mounted = false; };
  }, [projectIds.join(",")]);

  useEffect(() => {
    if (!clientVm) return;
    let mounted = true;
    setLoadingOps(true);
    Promise.allSettled([queries.slaTimeseries(), queries.wfmData()]).then(([ts, wf]) => {
      if (!mounted) return;
      if (ts.status === "fulfilled") setSlaTimeseries(ts.value || []);
      if (wf.status === "fulfilled") setWfmRows((wf.value || []) as WfmBenchRow[]);
      setLoadingOps(false);
    });
    return () => { mounted = false; };
  }, [clientVm, displayClientName]);

  useEffect(() => {
    if (!projectIds.length) {
      setContractsByProject(new Map());
      return;
    }
    let cancelled = false;
    setLoadingContracts(true);
    Promise.all(
      projectIds.map((pid) =>
        queries.contractsByProject(pid).then((rows) => [pid, rows] as const),
      ),
    )
      .then((pairs) => {
        if (cancelled) return;
        setContractsByProject(new Map(pairs));
      })
      .catch(() => {
        if (!cancelled) setContractsByProject(new Map());
      })
      .finally(() => {
        if (!cancelled) setLoadingContracts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectIds.join(",")]);

  const accountNamesForSla = useMemo(
    () => Array.from(new Set((clientVm?.projects ?? []).map((p) => (p.account_name || "").trim()).filter(Boolean))),
    [clientVm],
  );

  const slaSnapshot = useMemo(
    () =>
      pickLatestSlaMetPct(
        slaTimeseries,
        accountNamesForSla.length ? accountNamesForSla : [displayClientName],
      ),
    [slaTimeseries, accountNamesForSla, displayClientName],
  );

  const wfmSnapshot = useMemo(
    () => (projectIds.length ? aggregateLatestWfm(wfmRows, projectIds) : null),
    [wfmRows, projectIds],
  );

  // Derive unique filter options from loaded records
  const uniqueStatuses = useMemo(() =>
    Array.from(new Set(allRecords.map((r) => r.global_status || r.status).filter(Boolean))).sort(),
  [allRecords]);

  const uniqueDepts = useMemo(() =>
    Array.from(new Set(allRecords.map((r) => (r.department || "").trim()).filter(Boolean))).sort(),
  [allRecords]);

  const uniqueLocations = useMemo(() =>
    Array.from(new Set(allRecords.map((r) => (r.location || "").trim()).filter((v) => v && v !== "nan"))).sort(),
  [allRecords]);

  // Apply all filters client-side
  const filteredRecords = useMemo(() => {
    const q = search.toLowerCase();
    const dateFrom = filterDateFrom ? new Date(filterDateFrom) : null;
    const dateTo   = filterDateTo   ? new Date(filterDateTo + "T23:59:59") : null;

    return allRecords.filter((r) => {
      if (q && ![r.candidate_name, r.position_title, r.hiring_manager, r.department, r.location]
        .some((f) => (f || "").toLowerCase().includes(q))) return false;

      if (filterStatus !== "all" && (r.global_status || r.status || "") !== filterStatus) return false;

      if (filterDept !== "all" && (r.department || "").trim() !== filterDept) return false;

      if (filterLocation !== "all" && (r.location || "").trim() !== filterLocation) return false;

      if (filterAgeing !== "all") {
        const age = r.ageing ?? null;
        if (age == null) return false;
        if (filterAgeing === "0-30"  && !(age <= 30))          return false;
        if (filterAgeing === "31-60" && !(age > 30 && age <= 60))  return false;
        if (filterAgeing === "61-90" && !(age > 60 && age <= 90))  return false;
        if (filterAgeing === "90+"   && !(age > 90))           return false;
      }

      if (dateFrom && r.creation_date && new Date(r.creation_date) < dateFrom) return false;
      if (dateTo   && r.creation_date && new Date(r.creation_date) > dateTo)   return false;

      return true;
    });
  }, [allRecords, search, filterStatus, filterDept, filterLocation, filterAgeing, filterDateFrom, filterDateTo]);

  const totalRecords = filteredRecords.length;
  const totalPages   = Math.max(1, Math.ceil(totalRecords / PER_PAGE));
  const records      = filteredRecords.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const activeFilterCount = [
    filterStatus !== "all", filterDept !== "all", filterLocation !== "all",
    filterAgeing !== "all", filterDateFrom !== "", filterDateTo !== "",
  ].filter(Boolean).length;

  function clearAllFilters() {
    setSearch(""); setFilterStatus("all"); setFilterDept("all");
    setFilterLocation("all"); setFilterAgeing("all");
    setFilterDateFrom(""); setFilterDateTo("");
  }

  // Derived chart data
  const statusBreakdownData = useMemo(() => statusBreakdown(allRecords), [allRecords]);
  const stackedData = useMemo(() => buildStackedData(allRecords), [allRecords]);
  const ageingBuckets = useMemo(() => buildAgeingBuckets(allRecords), [allRecords]);
  const levelData = useMemo(() => buildLevelData(allRecords), [allRecords]);

  // Revenue stats
  const totalRevenue = useMemo(() =>
    allRecords.reduce((s, r) => s + (r.revenue_results?.revenue ?? 0), 0), [allRecords]);
  const totalOpeningFees = useMemo(() =>
    allRecords.reduce((s, r) => s + (r.revenue_results?.opening_fee ?? 0), 0), [allRecords]);
  const totalClosingFees = useMemo(() =>
    allRecords.reduce((s, r) => s + (r.revenue_results?.closing_fee ?? 0), 0), [allRecords]);
  const closedCount = useMemo(() =>
    allRecords.filter((r) => (r.global_status || "").toUpperCase() === "CLOSED").length, [allRecords]);
  const activeCount = useMemo(() =>
    allRecords.filter((r) => (r.global_status || "").toUpperCase() === "ACTIVE").length, [allRecords]);
  const onHoldCount = useMemo(() =>
    allRecords.filter((r) => (r.global_status || "").toUpperCase() === "ON HOLD").length, [allRecords]);
  const openCount = useMemo(() =>
    allRecords.filter((r) => !["CLOSED", "CANCELLED"].includes((r.global_status || "").toUpperCase())).length, [allRecords]);
  const fillRate = allRecords.length ? Math.round((closedCount / allRecords.length) * 100) : 0;
  const avgAgeing = useMemo(() => {
    const ages = allRecords
      .filter((r) => !isClosedForAgeing(r))
      .map((r) => daysOpenFromCreation(r))
      .filter((d): d is number => d != null && d >= 0);
    return ages.length ? Math.round(ages.reduce((s, d) => s + d, 0) / ages.length) : 0;
  }, [allRecords]);

  // Real composite score — computed from actual record data once allRecords is loaded.
  // Falls back to a project-structure proxy while records are still loading.
  const compositeScore = useMemo(() => {
    const total = allRecords.length;
    if (total === 0) {
      // Loading fallback: neutral score based on project structure only
      const base = 70;
      const splitPenalty = (clientVm?.split ?? false) ? -12 : 0;
      const sizeBonus = Math.min(20, (clientVm?.projects.length ?? 1) * 3);
      return Math.max(40, Math.min(98, base + sizeBonus + splitPenalty));
    }
    // Fill score: % of reqs that are CLOSED (40% weight)
    const fillScore = (closedCount / total) * 100;
    // Activity score: % that are CLOSED or ACTIVE in pipeline (30% weight)
    const activityScore = ((closedCount + activeCount) / total) * 100;
    // Hold-free score: inverse of on-hold rate (20% weight) — high on-hold = poor throughput
    const holdFreeScore = Math.max(0, 100 - (onHoldCount / total) * 100);
    // Revenue quality score: revenue per req normalised 0–100 (10% weight)
    // ₹1L per req = ~60 score, ₹2L+ = 100
    const revPerReq = totalRevenue / total;
    const revenueScore = Math.min(100, (revPerReq / 200000) * 100);

    const raw = fillScore * 0.4 + activityScore * 0.3 + holdFreeScore * 0.2 + revenueScore * 0.1;
    return Math.round(Math.max(0, Math.min(100, raw)));
  }, [allRecords, closedCount, activeCount, onHoldCount, totalRevenue, clientVm]);

  if (!loadingMeta && !clientVm) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
        <div style={{ fontSize: 20, marginBottom: 12 }}>Client not found</div>
        <button onClick={() => navigate("/clients")} style={{
          background: "color-mix(in srgb, var(--accent) 12%, transparent)", border: "1px solid var(--accent)",
          color: "var(--accent)", borderRadius: 8, padding: "7px 18px", cursor: "pointer",
        }}>← Back to Clients</button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* BREADCRUMB HEADER */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => navigate("/clients")} style={{
          background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer",
          fontFamily: "'DM Mono',monospace", fontSize: 10.5, padding: 0,
        }}>← Clients</button>
        <span style={{ color: "var(--text-muted)" }}>/</span>
        {loadingMeta
          ? <Skeleton height={14} width={160} />
          : <span style={{ fontSize: 13, fontWeight: 700 }}>{displayClientName}</span>
        }
        {clientVm?.split && clientVm.id < 0 && (
          <span className="platform-badge amber" style={{ marginLeft: 4 }}>Inferred merge</span>
        )}
        {clientVm?.split && clientVm.id >= 0 && (
          <span className="platform-badge green" style={{ marginLeft: 4 }}>Multi-SBU</span>
        )}
      </div>

      {/* PAGE HEADER */}
      {loadingMeta
        ? <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><Skeleton height={22} width={280} /><Skeleton height={12} width={400} /></div>
        : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <PageHeader
                title={displayClientName}
                subtitle={`${clientVm?.projects[0]?.region ?? ""} · ${clientVm?.projects[0]?.vertical ?? ""} · ${projectIds.length} SBU${projectIds.length > 1 ? "s" : ""} · Composite: ${compositeScore}/100`}
              />
            </div>
            {clientVm && projectIds.length > 0 && (
              <button
                type="button"
                className="req-drawer-btn-edit"
                style={{ flexShrink: 0, marginTop: 2 }}
                onClick={() => setAddReqOpen(true)}
              >
                Add requisition
              </button>
            )}
          </div>
        )
      }

      {/* SPLIT WARNING */}
      {clientVm?.split && clientVm.id < 0 && (
        <div className="alert-banner amber">
          ⚠ This view was inferred from duplicate account names. Create a legal client via API and set{" "}
          <code style={{ fontSize: 10 }}>client_id</code> on each SBU project for a stable rollup.
        </div>
      )}

      {/* SLA + WFM — latest period in DB (uploaded SLA basefile / WFM master) */}
      {!loadingMeta && clientVm && (
        <PlatformSection
          title="SLA & workforce (latest in database)"
          titleAccessory={(
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex shrink-0 rounded p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text)] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    aria-label="Data sources for SLA and workforce metrics"
                  >
                    <Info size={15} strokeWidth={2} aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="max-w-sm text-left text-xs">
                  {SLA_WFM_SECTION_INFO}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        >
          {loadingOps ? (
            <SkeletonKpiRow count={4} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              <PlatformKpi
                label="SLA % met"
                value={slaSnapshot?.metPct != null ? formatPercent(slaSnapshot.metPct) : "—"}
                accent={slaSnapshot?.metPct != null && slaSnapshot.metPct >= 70 ? "green" : slaSnapshot?.metPct != null && slaSnapshot.metPct >= 50 ? "amber" : "blue"}
                subtext={slaSnapshot ? `Month: ${slaSnapshot.month}` : undefined}
                delta={slaSnapshot?.metPct == null ? "No SLA series for this account" : "Met ÷ (met + not met)"}
              />
              <PlatformKpi
                label="WFM capacity fill"
                value={wfmSnapshot?.fillPct != null ? `${wfmSnapshot.fillPct}%` : "—"}
                accent={
                  wfmSnapshot?.fillPct == null
                    ? "blue"
                    : wfmSnapshot.fillPct <= 100
                      ? "teal"
                      : "amber"
                }
                subtext={wfmSnapshot ? `Σ actual / Σ ideal HC (${wfmSnapshot.nProjects} project${wfmSnapshot.nProjects > 1 ? "s" : ""})` : undefined}
                delta={wfmSnapshot ? `Ideal ${formatNumber(wfmSnapshot.ideal)} · Actual ${formatNumber(wfmSnapshot.actual)}` : "No WFM row for these projects"}
              />
              <PlatformKpi
                label="Productivity target"
                value={wfmSnapshot != null && wfmSnapshot.prodAvg > 0 ? `${wfmSnapshot.prodAvg}` : "—"}
                accent="amber"
                subtext="Ideal-weighted lateral productivity target (WFM)"
                delta={wfmSnapshot?.reportingDate ? `As of ${wfmSnapshot.reportingDate.slice(0, 10)}` : undefined}
              />
              <PlatformKpi
                label="HC gap (open)"
                value={wfmSnapshot != null ? formatNumber(Math.round(wfmSnapshot.ideal - wfmSnapshot.actual)) : "—"}
                accent={wfmSnapshot && wfmSnapshot.ideal - wfmSnapshot.actual > 0 ? "red" : "green"}
                subtext="Ideal − actual headcount (latest)"
                delta="From wfm_hr_benchmarks"
              />
            </div>
          )}
        </PlatformSection>
      )}

      {/* KPI RIBBON */}
      {loadingMeta || !allRecords.length
        ? <SkeletonKpiRow count={6} />
        : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 10 }}>
            <PlatformKpi label="Total Reqs" value={allRecords.length} accent="blue" delta="All time" />
            <PlatformKpi label="Open" value={openCount} accent="teal" delta={`${fillRate}% fill rate`} />
            <PlatformKpi label="Closed / Joined" value={closedCount} accent="green" delta="▲ Placed" />
            <PlatformKpi label="Revenue" value={formatCurrency(totalRevenue)} accent="blue"
              delta={`Opening: ${formatCurrency(totalOpeningFees)}`} />
            <PlatformKpi label="Fill Rate" value={`${fillRate}%`}
              accent={fillRate >= 75 ? "green" : fillRate >= 50 ? "amber" : "red"} />
            <PlatformKpi label="Avg Ageing" value={`${avgAgeing}d`}
              accent={avgAgeing <= 45 ? "green" : avgAgeing <= 75 ? "amber" : "red"}
              delta={avgAgeing > 75 ? "⚠ High" : "— Normal"} />
          </div>
        )
      }

      {/* COMPOSITE SCORE BAR */}
      {!loadingMeta && clientVm && (
        <div className="platform-card" style={{ padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>
              Composite Health Score
            </div>
            <div style={{ flex: 1, height: 6, background: "var(--bg3)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, width: `${compositeScore}%`, background: scoreColor(compositeScore), transition: "width .6s" }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: scoreColor(compositeScore), fontFamily: "'DM Mono',monospace", width: 52 }}>
              {compositeScore}/100
            </div>
            <StatusTag status={scoreLabel(compositeScore)} />
            {allRecords.length > 0 && (
              <div style={{ fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>
                Fill {Math.round((closedCount / allRecords.length) * 100)}% · Active {Math.round((activeCount / allRecords.length) * 100)}% · Hold {Math.round((onHoldCount / allRecords.length) * 100)}%
              </div>
            )}
          </div>
          {allRecords.length === 0 && loadingRecords && (
            <div style={{ fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>
              Score will update once records are loaded
            </div>
          )}
        </div>
      )}

      {/* TABS */}
      <Tabs
        tabs={["Requisitions", "Analytics", "Account Info"]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* ── REQUISITIONS TAB ──────────────────────────────────────────────── */}
      {activeTab === "Requisitions" && (
        <PlatformSection title={`All Requisitions — ${totalRecords.toLocaleString()}${activeFilterCount > 0 ? ` filtered (${allRecords.length} total)` : ""} records`} action="Export">

          {/* ── FILTER BAR ──── */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            {/* Search */}
            <input
              className="platform-search"
              placeholder="Search candidate, position, HM…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 220, flexShrink: 0 }}
            />

            {/* Toggle advanced filters */}
            <button onClick={() => setFiltersOpen((v) => !v)} style={{
              padding: "4px 11px", borderRadius: 6, cursor: "pointer",
              fontFamily: "'DM Mono',monospace", fontSize: 10.5,
              background: filtersOpen || activeFilterCount > 0 ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--bg2)",
              border: `1px solid ${activeFilterCount > 0 ? "var(--accent)" : "var(--border)"}`,
              color: activeFilterCount > 0 ? "var(--accent)" : "var(--text-subtle)",
            }}>
              ⊟ Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>

            {activeFilterCount > 0 && (
              <button onClick={clearAllFilters} style={{
                padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                fontFamily: "'DM Mono',monospace", fontSize: 10.5,
                background: "rgba(255,79,107,0.08)", border: "1px solid rgba(255,79,107,0.3)", color: "var(--red)",
              }}>✕ Clear</button>
            )}

            {/* Pagination right-aligned */}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontFamily: "'DM Mono',monospace", fontSize: 10.5 }}>
              <span style={{ color: "var(--text-muted)" }}>
                {totalRecords > 0 ? `${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, totalRecords)} of ${totalRecords.toLocaleString()}` : "—"}
              </span>
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg2)", color: page <= 1 ? "var(--text-muted)" : "var(--text)", cursor: page <= 1 ? "not-allowed" : "pointer" }}>←</button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg2)", color: page >= totalPages ? "var(--text-muted)" : "var(--text)", cursor: page >= totalPages ? "not-allowed" : "pointer" }}>→</button>
            </div>
          </div>

          {/* ── ADVANCED FILTERS (expandable) ── */}
          {filtersOpen && (
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8,
              padding: "10px 12px", background: "var(--bg2)", borderRadius: 8,
              border: "1px solid var(--border)", marginBottom: 10,
            }}>
              {/* Status */}
              <div>
                <div style={{ fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 3, textTransform: "uppercase" }}>Status</div>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                  style={{ width: "100%", padding: "4px 7px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 11, fontFamily: "'DM Mono',monospace" }}>
                  <option value="all">All</option>
                  {uniqueStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Department */}
              <div>
                <div style={{ fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 3, textTransform: "uppercase" }}>Department</div>
                <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
                  style={{ width: "100%", padding: "4px 7px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 11, fontFamily: "'DM Mono',monospace" }}>
                  <option value="all">All</option>
                  {uniqueDepts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* Location */}
              <div>
                <div style={{ fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 3, textTransform: "uppercase" }}>Location</div>
                <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)}
                  style={{ width: "100%", padding: "4px 7px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 11, fontFamily: "'DM Mono',monospace" }}>
                  <option value="all">All</option>
                  {uniqueLocations.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              {/* Ageing bucket */}
              <div>
                <div style={{ fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 3, textTransform: "uppercase" }}>Ageing</div>
                <select value={filterAgeing} onChange={(e) => setFilterAgeing(e.target.value)}
                  style={{ width: "100%", padding: "4px 7px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 11, fontFamily: "'DM Mono',monospace" }}>
                  <option value="all">All</option>
                  <option value="0-30">0–30 days</option>
                  <option value="31-60">31–60 days</option>
                  <option value="61-90">61–90 days</option>
                  <option value="90+">90+ days</option>
                </select>
              </div>

              {/* Date From */}
              <div>
                <div style={{ fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 3, textTransform: "uppercase" }}>Created From</div>
                <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
                  style={{ width: "100%", padding: "4px 7px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: filterDateFrom ? "var(--text)" : "var(--text-muted)", fontSize: 11, fontFamily: "'DM Mono',monospace", boxSizing: "border-box" }} />
              </div>

              {/* Date To */}
              <div>
                <div style={{ fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 3, textTransform: "uppercase" }}>Created To</div>
                <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
                  style={{ width: "100%", padding: "4px 7px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: filterDateTo ? "var(--text)" : "var(--text-muted)", fontSize: 11, fontFamily: "'DM Mono',monospace", boxSizing: "border-box" }} />
              </div>
            </div>
          )}

          {/* ── ACTIVE FILTER PILLS ── */}
          {activeFilterCount > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
              {filterStatus !== "all" && <FilterPill label={`Status: ${filterStatus}`} onRemove={() => setFilterStatus("all")} />}
              {filterDept !== "all" && <FilterPill label={`Dept: ${filterDept}`} onRemove={() => setFilterDept("all")} />}
              {filterLocation !== "all" && <FilterPill label={`Location: ${filterLocation}`} onRemove={() => setFilterLocation("all")} />}
              {filterAgeing !== "all" && <FilterPill label={`Ageing: ${filterAgeing}d`} onRemove={() => setFilterAgeing("all")} />}
              {filterDateFrom && <FilterPill label={`From: ${filterDateFrom}`} onRemove={() => setFilterDateFrom("")} />}
              {filterDateTo && <FilterPill label={`To: ${filterDateTo}`} onRemove={() => setFilterDateTo("")} />}
            </div>
          )}

          {/* TABLE */}
          <div className="platform-table-wrap">
            {loadingRecords ? <SkeletonTable rows={8} cols={10} /> : (
              <table className="platform-table">
                <thead>
                  <tr>
                    <th>Req ID</th><th>Candidate</th><th>Position</th><th>Status</th>
                    <th>HM</th><th>Dept</th><th>Location</th><th>Created</th>
                    <th>Ageing</th><th>CTC</th><th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 && (
                    <tr><td colSpan={11} style={{ color: "var(--text-muted)", textAlign: "center", padding: 24 }}>
                      {allRecords.length === 0 ? "No requisitions found for this client." : "No records match your filters"}
                    </td></tr>
                  )}
                  {records.map((r) => {
                    const reqId = (r.additional_attributes?.position_code as string) || `REQ-${r.id}`;
                    const rev = r.revenue_results?.revenue ?? 0;
                    const ageColor = r.ageing != null ? (r.ageing > 90 ? "var(--red)" : r.ageing > 60 ? "var(--amber)" : "var(--green)") : "var(--text-muted)";
                    const createdDate = r.creation_date ? new Date(r.creation_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
                    return (
                      <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => setSelectedReq(r)}>
                        <td style={{ fontFamily: "'DM Mono',monospace", color: "var(--accent)", fontSize: 10 }}>{reqId}</td>
                        <td>{r.candidate_name || "—"}</td>
                        <td style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.position_title || "—"}</td>
                        <td><StatusTag status={r.global_status || r.status || "Open"} /></td>
                        <td style={{ color: "var(--text-subtle)" }}>{r.hiring_manager || "—"}</td>
                        <td style={{ color: "var(--text-muted)", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.department || "—"}</td>
                        <td style={{ color: "var(--text-muted)" }}>{r.location || "—"}</td>
                        <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--text-muted)" }}>{createdDate}</td>
                        <td style={{ fontFamily: "'DM Mono',monospace", color: ageColor, fontSize: 10 }}>
                          {r.ageing != null ? `${r.ageing}d` : "—"}
                        </td>
                        <td>{r.offered_ctc ? `₹${(r.offered_ctc / 100000).toFixed(1)}L` : "—"}</td>
                        <td style={{ color: rev > 0 ? "var(--green)" : "var(--text-muted)" }}>{rev > 0 ? formatCurrency(rev) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* PAGINATION STRIP */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 12 }}>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => setPage(p)} style={{
                  width: 28, height: 28, borderRadius: 6, border: "1px solid var(--border)",
                  background: page === p ? "color-mix(in srgb, var(--accent) 20%, transparent)" : "var(--bg2)",
                  color: page === p ? "var(--accent)" : "var(--text-subtle)", cursor: "pointer",
                  fontSize: 10.5, fontFamily: "'DM Mono',monospace",
                }}>{p}</button>
              ))}
              {totalPages > 7 && <span style={{ color: "var(--text-muted)", alignSelf: "center", fontSize: 10 }}>…{totalPages} pages</span>}
            </div>
          )}
        </PlatformSection>
      )}

      {/* ── ANALYTICS TAB ────────────────────────────────────────────────── */}
      {activeTab === "Analytics" && (
        <div style={{ display: "grid", gap: 14 }}>
          {/* STATUS BREAKDOWN + CHARTS */}
          <div className="platform-grid-3">
            <PlatformSection title="Status Breakdown">
              {statusBreakdownData.map(({ status, count, pct }) => (
                <div key={status} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 90, fontSize: 10.5, color: "var(--text-subtle)", flexShrink: 0 }}>{status}</div>
                  <div style={{ flex: 1, height: 8, background: "var(--bg3)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 4, background: "var(--accent)", width: `${pct}%`, transition: "width .5s" }} />
                  </div>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--accent)", width: 36, textAlign: "right" }}>{count}</div>
                </div>
              ))}
              {allRecords.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>}
            </PlatformSection>

            <PlatformSection title="Req by Department (Top 8)">
              <LevelDonutChart data={levelData.length > 0 ? levelData : [{ name: "No dept data", value: 1 }]} />
            </PlatformSection>

            <PlatformSection title="Revenue Breakdown">
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                <KvRow label="Total Revenue" value={<span style={{ color: "var(--green)", fontWeight: 700 }}>{formatCurrency(totalRevenue)}</span>} />
                <KvRow label="Opening Fees" value={formatCurrency(totalOpeningFees)} />
                <KvRow label="Closing Fees" value={formatCurrency(totalClosingFees)} />
                <KvRow label="Avg per Req" value={formatCurrency(allRecords.length ? totalRevenue / allRecords.length : 0)} />
                <KvRow label="Fill Rate" value={<span style={{ color: fillRate >= 75 ? "var(--green)" : "var(--amber)" }}>{fillRate}%</span>} />
              </div>
            </PlatformSection>
          </div>

          <div className="platform-grid-2">
            <PlatformSection title="Ageing Distribution">
              <AgeingBars buckets={ageingBuckets} />
              <div style={{ marginTop: 12, fontSize: 10, fontFamily: "'DM Mono',monospace", color: "var(--text-muted)" }}>
                Avg ageing: <span style={{ color: avgAgeing > 75 ? "var(--red)" : "var(--amber)" }}>{avgAgeing} days</span>
              </div>
            </PlatformSection>

            <PlatformSection title="Pipeline by Project">
              {stackedData.length > 0 && allRecords.length > 0
                ? <ReqStatusStackedBar data={stackedData} />
                : <div style={{ color: "var(--text-muted)", fontSize: 11 }}>No project breakdown available</div>
              }
            </PlatformSection>
          </div>

          {/* TOP HIRING MANAGERS */}
          <PlatformSection title="Top Hiring Managers">
            <div className="platform-table-wrap">
              <table className="platform-table">
                <thead><tr><th>Hiring Manager</th><th>Reqs</th><th>Closed</th><th>Fill Rate</th><th>Avg Revenue</th></tr></thead>
                <tbody>
                  {(() => {
                    const hmMap = new Map<string, { total: number; closed: number; revenue: number }>();
                    for (const r of allRecords) {
                      const hm = r.hiring_manager || "Unknown";
                      if (!hmMap.has(hm)) hmMap.set(hm, { total: 0, closed: 0, revenue: 0 });
                      const e = hmMap.get(hm)!;
                      e.total++;
                      if ((r.global_status || "").toUpperCase() === "CLOSED") e.closed++;
                      e.revenue += r.revenue_results?.revenue ?? 0;
                    }
                    return Array.from(hmMap.entries())
                      .sort((a, b) => b[1].total - a[1].total)
                      .slice(0, 10)
                      .map(([hm, d]) => {
                        const fr = Math.round((d.closed / d.total) * 100);
                        return (
                          <tr key={hm}>
                            <td style={{ fontWeight: 500 }}>{hm}</td>
                            <td>{d.total}</td>
                            <td style={{ color: "var(--green)" }}>{d.closed}</td>
                            <td style={{ color: fr >= 60 ? "var(--green)" : fr >= 40 ? "var(--amber)" : "var(--red)" }}>{fr}%</td>
                            <td style={{ color: "var(--accent)" }}>{formatCurrency(d.total ? d.revenue / d.total : 0)}</td>
                          </tr>
                        );
                      });
                  })()}
                  {allRecords.length === 0 && (
                    <tr><td colSpan={5} style={{ color: "var(--text-muted)", textAlign: "center" }}>Loading…</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </PlatformSection>
        </div>
      )}

      {/* ── ACCOUNT INFO TAB ─────────────────────────────────────────────── */}
      {activeTab === "Account Info" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div className="platform-grid-2">
            <PlatformSection title="Account Details">
              {loadingMeta
                ? <SkeletonTable rows={5} cols={2} />
                : (
                  <div>
                    <KvRow label="Legal client" value={displayClientName} />
                    {clientVm && clientVm.id >= 0 && (
                      <KvRow label="Client ID" value={`CLI-${clientVm.id}`} />
                    )}
                    <KvRow label="Charge code" value={clientVm?.projects[0]?.charge_code ?? "—"} />
                    <KvRow label="Account status" value={clientVm?.projects[0]?.account_status ?? "—"} />
                    <KvRow label="Region" value={clientVm?.projects[0]?.region ?? "—"} />
                    <KvRow label="Sub region" value={clientVm?.projects[0]?.sub_region ?? "—"} />
                    <KvRow label="Vertical" value={clientVm?.projects[0]?.vertical ?? "—"} />
                    <KvRow label="Category" value={clientVm?.projects[0]?.category ?? "—"} />
                    <KvRow label="Practice" value={clientVm?.projects[0]?.practice ?? "—"} />
                    <KvRow label="Function head" value={clientVm?.projects[0]?.function_head ?? "—"} />
                    <KvRow label="Regional head" value={clientVm?.projects[0]?.regional_head ?? "—"} />
                    <KvRow label="Practice Head" value={clientVm?.projects[0]?.practice_head ?? "—"} />
                    <KvRow label="Project Head" value={clientVm?.projects[0]?.project_head ?? "—"} />
                    <KvRow label="BE SPOC" value={clientVm?.projects[0]?.be_spoc ?? "—"} />
                    <KvRow label="Tracker Sheet" value={clientVm?.projects[0]?.tracker_sheet ?? "—"} />
                    <KvRow label="Req ID Column" value={clientVm?.projects[0]?.pos_id_column ?? "—"} />
                    <KvRow
                      label="Structure"
                      value={
                        !clientVm
                          ? "—"
                          : clientVm.id >= 0 && clientVm.split
                            ? <span className="platform-badge green">Legal client · {projectIds.length} SBUs</span>
                            : clientVm.id >= 0
                              ? <span className="platform-badge green">Single SBU</span>
                              : clientVm.split
                                ? <span className="platform-badge amber">Inferred · {projectIds.length} project IDs</span>
                                : <span className="platform-badge green">Single project</span>
                      }
                    />
                  </div>
                )
              }
            </PlatformSection>

            <PlatformSection title="SBU / linked projects">
              {(clientVm?.projects ?? []).map((p) => (
                <div key={p.id} style={{
                  padding: "10px 12px", background: "var(--bg2)", borderRadius: 8,
                  border: "1px solid var(--border)", marginBottom: 8,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontFamily: "'DM Mono',monospace", color: "var(--accent)", fontSize: 10.5 }}>
                      PRJ-{p.id}
                      {(p.engagement_name || "").trim()
                        ? ` · ${(p.engagement_name || "").trim()}`
                        : ""}
                    </span>
                    <span style={{ fontSize: 9.5, color: "var(--text-muted)" }}>
                      {p.system_created_at ? new Date(p.system_created_at).toLocaleDateString("en-IN") : "—"}
                    </span>
                  </div>
                  <KvRow label="File" value={p.filename || "—"} />
                  <KvRow label="Tracker Sheet" value={p.tracker_sheet || "—"} />
                  <KvRow label="Contract Sheet" value={p.contract_sheet || "—"} />
                  <KvRow label="Region" value={p.region || "—"} />
                  <KvRow label="Vertical" value={p.vertical || "—"} />
                  {p.column_mapping && columnMappingEntryCount(p.column_mapping) > 0 && (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{
                        cursor: "pointer",
                        fontSize: 10,
                        fontFamily: "'DM Mono',monospace",
                        color: "var(--accent)",
                      }}>
                        Column mapping ({columnMappingEntryCount(p.column_mapping)} links)
                      </summary>
                      <div style={{ marginTop: 10, padding: "10px 8px", background: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)" }}>
                        <ColumnMappingDisplay mapping={p.column_mapping} variant="card" scrollMaxClass="max-h-[320px]" />
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </PlatformSection>
          </div>

          {/* REVENUE LOGIC CARDS — one per project */}
          {(clientVm?.projects ?? []).map((p) => (
            <RevenueLogicCard
              key={p.id}
              project={p}
              onProjectsRefresh={refreshProjects}
              onRecordsRefresh={refreshRecords}
            />
          ))}

          <PlatformSection title="Commercial contracts">
            {loadingContracts ? (
              <div style={{ color: "var(--text-muted)", fontSize: 11 }}>Loading contract rows…</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {(clientVm?.projects ?? []).map((p) => {
                  const rows = contractsByProject.get(p.id) ?? [];
                  return (
                    <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--accent)", marginBottom: 8 }}>
                        PRJ-{p.id}
                        {(p.engagement_name || p.account_name) ? ` · ${p.engagement_name || p.account_name}` : ""}
                      </div>
                      {rows.length === 0 ? (
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No contract record — ingest workbook or POST /contracts.</div>
                      ) : (
                        <div className="platform-table-wrap">
                          <table className="platform-table">
                            <thead>
                              <tr>
                                <th>Customer</th>
                                <th>Status</th>
                                <th>Start</th>
                                <th>End</th>
                                <th>ACV (INR)</th>
                                <th>CM%</th>
                                <th>HC</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((c) => (
                                <tr key={c.id}>
                                  <td>{c.customer_name ?? "—"}</td>
                                  <td>{c.contract_status ?? "—"}</td>
                                  <td style={{ fontSize: 10, fontFamily: "'DM Mono',monospace" }}>{c.contract_start_date?.slice(0, 10) ?? "—"}</td>
                                  <td style={{ fontSize: 10, fontFamily: "'DM Mono',monospace" }}>{c.contract_end_date?.slice(0, 10) ?? "—"}</td>
                                  <td>{c.signed_acv_inr != null ? formatCurrency(c.signed_acv_inr) : "—"}</td>
                                  <td>{c.signed_cm_pct != null ? `${Math.round(c.signed_cm_pct * 10000) / 100}%` : "—"}</td>
                                  <td>{c.headcount_contracted != null ? String(c.headcount_contracted) : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </PlatformSection>
        </div>
      )}

      {/* ── ADD REQUISITION (POST /records) ── */}
      <RequisitionCreateDrawer
        open={addReqOpen}
        onClose={() => setAddReqOpen(false)}
        projects={addRequisitionProjects}
        onCreated={(r) => {
          setAllRecords((prev) => [r, ...prev]);
          setSelectedReq(r);
        }}
      />

      {/* ── REQUISITION DETAIL DRAWER (shared with Requisitions — edit + PATCH) ── */}
      <RequisitionRecordDrawer
        record={selectedReq}
        onClose={() => setSelectedReq(null)}
        onSaved={(updated) => {
          setSelectedReq(updated);
          setAllRecords((rows) => rows.map((r) => (r.id === updated.id ? updated : r)));
        }}
        onDeleted={(id) => {
          setSelectedReq(null);
          setAllRecords((rows) => rows.filter((r) => r.id !== id));
        }}
      />
    </div>
  );
}
