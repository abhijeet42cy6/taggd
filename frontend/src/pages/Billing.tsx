import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  api,
  invalidateCache,
  queries,
  type Project,
  type RevenueBillingRow,
  type RevenueBillingCreate,
  type RevenueBillingPatch,
} from "@/lib/api";
import {
  UserPickerDropdown,
  type PlatformUserLite,
} from "@/components/platform/NewContractOrgFlow";
import {
  canPracticeSubmitBilling,
  isPlatformAdminRole,
  useAuth,
  type AuthUser,
} from "@/lib/auth";
import { cn, formatLargeCurrency } from "@/lib/utils";
import { PageHeader, PlatformSection } from "@/components/platform/PlatformBlocks";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw, Plus, PencilLine, Trash2, FilterX } from "lucide-react";
import "@/styles/new-contract-panel.css";
import "@/styles/billing-ds-table.css";

const PM_NONE = "__pm_none__";
const FY_NONE = "__fy_none__";

/** Matches backend `workflow_allows_billing_row_edit` (draft + disputed only). */
function billingRowLocked(r: RevenueBillingRow): boolean {
  const w = r.workflow;
  if (!w?.validation_status) return false;
  const st = String(w.validation_status).trim().toLowerCase();
  return !["draft", "disputed"].includes(st);
}

/** Practice users are blocked when workflow is past draft; platform admins are not (backend logs overrides). */
function billingSheetLockedForCurrentUser(r: RevenueBillingRow, user: AuthUser | null): boolean {
  if (!billingRowLocked(r)) return false;
  if (!user) return true;
  const s = (user.role ?? "").trim().toLowerCase();
  const e = (user.effectiveRole ?? "").trim().toLowerCase();
  if (isPlatformAdminRole(s) || isPlatformAdminRole(e)) return false;
  return true;
}

function canSubmitBilling(r: RevenueBillingRow): boolean {
  const st = r.workflow?.validation_status;
  if (!st) return true;
  return st === "draft" || st === "disputed";
}

function rowMatchesBillingTableFilters(
  r: RevenueBillingRow,
  f: { search: string; fy: string; pm: string; invoice: "all" | "has" | "none" }
): boolean {
  if (f.fy !== "all") {
    const label = (r.fiscal_year_label || "").trim();
    if (f.fy === FY_NONE) {
      if (label) return false;
    } else if (label !== f.fy) return false;
  }
  if (f.pm !== "all") {
    const pm = (r.project_manager || "").trim();
    if (f.pm === PM_NONE) {
      if (pm) return false;
    } else if (pm !== f.pm) return false;
  }
  if (f.invoice === "has" && !(r.invoice_number && r.invoice_number.trim())) return false;
  if (f.invoice === "none" && r.invoice_number && r.invoice_number.trim()) return false;
  const q = f.search.trim().toLowerCase();
  if (q) {
    const hay = [
      String(r.id),
      r.account_name,
      r.project_manager,
      r.invoice_number,
      r.fiscal_year_label,
      `prj-${r.project_id}`,
      String(r.project_id),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function sumNumeric(rows: RevenueBillingRow[], pick: (r: RevenueBillingRow) => number | null | undefined): number {
  let t = 0;
  for (const r of rows) {
    const v = pick(r);
    if (typeof v === "number" && Number.isFinite(v)) t += v;
  }
  return t;
}

function avgNumeric(rows: RevenueBillingRow[], pick: (r: RevenueBillingRow) => number | null | undefined): number | null {
  const vals: number[] = [];
  for (const r of rows) {
    const v = pick(r);
    if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
  }
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** UTF-8 CSV with BOM — opens cleanly in Excel. */
function downloadBillingExcel(rows: RevenueBillingRow[]) {
  const headers = [
    "id",
    "project_id",
    "account_name",
    "update_date",
    "fiscal_year_label",
    "project_manager",
    "revenue_booked_inr",
    "mmf_inr",
    "net_revenue_inr",
    "total_joiners",
    "taggd_joiner",
    "er_ijp_other_count",
    "other_joiner_fee_inr",
    "rph_inr",
    "total_joining_fee_inr",
    "opening_req",
    "opening_fee_inr",
    "taggd_joiner_fee_inr",
    "invoice_number",
    "invoice_amount_inr",
    "collection_received_inr",
    "workflow_status",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.id),
        csvCell(r.project_id),
        csvCell(r.account_name),
        csvCell(r.update_date),
        csvCell(r.fiscal_year_label),
        csvCell(r.project_manager),
        csvCell(r.revenue_booked_inr),
        csvCell(r.mmf_inr),
        csvCell(r.net_revenue_inr),
        csvCell(r.total_joiners),
        csvCell(r.taggd_joiner),
        csvCell(r.er_ijp_other_count),
        csvCell(r.er_ijp_other_fee_inr),
        csvCell(r.rph_inr),
        csvCell(r.total_joining_fee_inr),
        csvCell(r.opening_req),
        csvCell(r.opening_fee_inr),
        csvCell(r.taggd_joiner_fee_inr),
        csvCell(r.invoice_number),
        csvCell(r.invoice_amount_inr),
        csvCell(r.collection_received_inr),
        csvCell(r.workflow?.validation_status ?? ""),
      ].join(","),
    );
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `billing-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatWorkflowLabel(raw: string | null | undefined): string {
  const s = (raw || "draft").trim();
  if (!s) return "Draft";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function lineIsBillingStoredRef(line: string): boolean {
  const s = line.trim();
  if (!s) return false;
  if (s.toLowerCase().startsWith("billing:")) return true;
  const base = (s.split("/").pop() || s).trim();
  return /^bil\d+_\d+_/.test(base);
}

function nonBillingAttachmentLines(ref: string | null | undefined): string[] {
  if (!ref || !String(ref).trim()) return [];
  return String(ref)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => l.trim() && !lineIsBillingStoredRef(l))
    .map((l) => l.trimEnd());
}

function parseBillingStoredBasenames(ref: string | null | undefined): string[] {
  if (!ref || !String(ref).trim()) return [];
  const out: string[] = [];
  for (const line of String(ref).replace(/\r\n/g, "\n").split("\n")) {
    const s = line.trim();
    if (!s) continue;
    if (s.toLowerCase().startsWith("billing:")) {
      const fn = s.slice(8).trim();
      if (fn) out.push(fn);
      continue;
    }
    const base = (s.split("/").pop() || s).trim();
    if (/^bil\d+_\d+_/.test(base)) out.push(base);
  }
  return out;
}

function sortBillingBasenamesNewestFirst(fns: string[]): string[] {
  return [...fns].sort((a, b) => {
    const ta = /^bil\d+_(\d+)_/.exec(a)?.[1];
    const tb = /^bil\d+_(\d+)_/.exec(b)?.[1];
    return (Number(tb) || 0) - (Number(ta) || 0);
  });
}

function displayBillingStoredName(basename: string): string {
  return basename.replace(/^bil\d+_\d+_/, "") || basename;
}

function mergeUrlTextWithBillingBasenames(urlText: string, basenames: string[]): string {
  const urlLines = urlText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
  const tags = basenames.map((b) => `billing:${b}`);
  return [...urlLines, ...tags].join("\n");
}

function BillingWorkflowCell({ row }: { row: RevenueBillingRow }) {
  const raw = (row.workflow?.validation_status || "draft").toLowerCase();
  const label = formatWorkflowLabel(row.workflow?.validation_status || "draft");
  const dot = <span className="billing-ds-badge-dot" aria-hidden />;
  if (raw === "fully_approved") {
    return (
      <span className="billing-ds-badge billing-ds-badge-green">
        {dot}
        {label}
      </span>
    );
  }
  if (raw === "rejected") {
    return (
      <span className="billing-ds-badge billing-ds-badge-red">
        {dot}
        {label}
      </span>
    );
  }
  if (raw === "submitted" || raw === "under_review") {
    return (
      <span className="billing-ds-badge billing-ds-badge-blue">
        {dot}
        {label}
      </span>
    );
  }
  if (raw === "cfo_pending") {
    return (
      <span className="billing-ds-badge billing-ds-badge-teal">
        {dot}
        {label}
      </span>
    );
  }
  if (raw === "disputed") {
    return (
      <span className="billing-ds-badge billing-ds-badge-amber">
        {dot}
        {label}
      </span>
    );
  }
  return (
    <span className="billing-ds-badge billing-ds-badge-gray">
      {dot}
      {label}
    </span>
  );
}

type Draft = Record<string, string>;

const DRAFT_KEYS: string[] = [
  "project_id",
  "update_date",
  "fiscal_year_label",
  "project_manager",
  "revenue_booked_inr",
  "mmf_inr",
  "opening_req",
  "opening_fee_inr",
  "total_joiners",
  "taggd_joiner",
  "taggd_joiner_fee_inr",
  "er_ijp_other_count",
  "er_ijp_other_fee_inr",
  "campus_count",
  "campus_fee_inr",
  "total_joining_fee_inr",
  "adjustment_reason",
  "adjustment_amt_inr",
  "net_revenue_inr",
  "rph_inr",
  "pct_of_target",
  "attachment_ref",
  "approver_name",
  "invoice_number",
  "invoice_amount_inr",
  "invoice_raised_date",
  "payment_due_date",
  "actual_payment_received_date",
  "collection_received_inr",
  "notes",
];

function emptyDraft(projectId: number): Draft {
  const d: Draft = {};
  for (const k of DRAFT_KEYS) {
    d[k] = k === "project_id" ? String(projectId) : "";
  }
  return d;
}

function rowToDraft(r: RevenueBillingRow): Draft {
  const str = (v: string | number | null | undefined) =>
    v === null || v === undefined ? "" : String(v);
  return {
    project_id: String(r.project_id),
    update_date: str(r.update_date),
    fiscal_year_label: str(r.fiscal_year_label),
    project_manager: str(r.project_manager),
    revenue_booked_inr: str(r.revenue_booked_inr),
    mmf_inr: str(r.mmf_inr),
    opening_req: str(r.opening_req),
    opening_fee_inr: str(r.opening_fee_inr),
    total_joiners: str(r.total_joiners),
    taggd_joiner: str(r.taggd_joiner),
    taggd_joiner_fee_inr: str(r.taggd_joiner_fee_inr),
    er_ijp_other_count: str(r.er_ijp_other_count),
    er_ijp_other_fee_inr: str(r.er_ijp_other_fee_inr),
    campus_count: str(r.campus_count),
    campus_fee_inr: str(r.campus_fee_inr),
    total_joining_fee_inr: str(r.total_joining_fee_inr),
    adjustment_reason: str(r.adjustment_reason),
    adjustment_amt_inr: str(r.adjustment_amt_inr),
    net_revenue_inr: str(r.net_revenue_inr),
    rph_inr: str(r.rph_inr),
    pct_of_target: str(r.pct_of_target),
    attachment_ref: str(r.attachment_ref),
    approver_name: str(r.approver_name),
    invoice_number: str(r.invoice_number),
    invoice_amount_inr: str(r.invoice_amount_inr),
    invoice_raised_date: str(r.invoice_raised_date),
    payment_due_date: str(r.payment_due_date),
    actual_payment_received_date: str(r.actual_payment_received_date),
    collection_received_inr: str(r.collection_received_inr),
    notes: str(r.notes),
  };
}

function parseOptFloat(s: string): number | null | undefined {
  const t = s.trim().replace(/,/g, "");
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function parseOptInt(s: string): number | null | undefined {
  const t = s.trim().replace(/,/g, "");
  if (!t) return undefined;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : undefined;
}

function draftToCreate(d: Draft): RevenueBillingCreate {
  const pid = parseInt(d.project_id, 10);
  if (!Number.isFinite(pid) || pid < 1) {
    throw new Error("Select a valid project");
  }
  const body: RevenueBillingCreate = { project_id: pid };
  const setStr = (k: keyof RevenueBillingCreate, key: string) => {
    const v = d[key]?.trim();
    if (v) (body as Record<string, unknown>)[k] = v;
  };
  const setFl = (k: keyof RevenueBillingCreate, key: string) => {
    const n = parseOptFloat(d[key] ?? "");
    if (n !== undefined) (body as Record<string, unknown>)[k] = n;
  };
  const setInt = (k: keyof RevenueBillingCreate, key: string) => {
    const n = parseOptInt(d[key] ?? "");
    if (n !== undefined) (body as Record<string, unknown>)[k] = n;
  };

  setStr("update_date", "update_date");
  setStr("fiscal_year_label", "fiscal_year_label");
  setStr("project_manager", "project_manager");
  setFl("revenue_booked_inr", "revenue_booked_inr");
  setFl("mmf_inr", "mmf_inr");
  setInt("opening_req", "opening_req");
  setFl("opening_fee_inr", "opening_fee_inr");
  setInt("total_joiners", "total_joiners");
  setInt("taggd_joiner", "taggd_joiner");
  setFl("taggd_joiner_fee_inr", "taggd_joiner_fee_inr");
  setInt("er_ijp_other_count", "er_ijp_other_count");
  setFl("er_ijp_other_fee_inr", "er_ijp_other_fee_inr");
  setInt("campus_count", "campus_count");
  setFl("campus_fee_inr", "campus_fee_inr");
  setFl("total_joining_fee_inr", "total_joining_fee_inr");
  if (d.adjustment_reason?.trim()) body.adjustment_reason = d.adjustment_reason.trim();
  setFl("adjustment_amt_inr", "adjustment_amt_inr");
  setFl("net_revenue_inr", "net_revenue_inr");
  setFl("rph_inr", "rph_inr");
  setFl("pct_of_target", "pct_of_target");
  setStr("attachment_ref", "attachment_ref");
  setStr("approver_name", "approver_name");
  setStr("invoice_number", "invoice_number");
  setFl("invoice_amount_inr", "invoice_amount_inr");
  setStr("invoice_raised_date", "invoice_raised_date");
  setStr("payment_due_date", "payment_due_date");
  setStr("actual_payment_received_date", "actual_payment_received_date");
  setFl("collection_received_inr", "collection_received_inr");
  if (d.notes?.trim()) body.notes = d.notes.trim();
  return body;
}

/** PATCH only keys whose string form changed vs baseline (avoids wiping columns). */
function draftToPatchDelta(baseline: Draft, current: Draft): RevenueBillingPatch {
  const body: RevenueBillingPatch = {};
  const changed = (k: string) => (baseline[k] ?? "") !== (current[k] ?? "");

  const setStr = (k: keyof RevenueBillingPatch, key: string) => {
    if (!changed(key)) return;
    const v = current[key]?.trim();
    (body as Record<string, unknown>)[k] = v === "" ? null : v;
  };
  const setNum = (k: keyof RevenueBillingPatch, key: string) => {
    if (!changed(key)) return;
    const t = current[key]?.trim().replace(/,/g, "");
    if (!t) {
      (body as Record<string, unknown>)[k] = null;
      return;
    }
    const n = Number(t);
    (body as Record<string, unknown>)[k] = Number.isFinite(n) ? n : null;
  };
  const setInt = (k: keyof RevenueBillingPatch, key: string) => {
    if (!changed(key)) return;
    const t = current[key]?.trim().replace(/,/g, "");
    if (!t) {
      (body as Record<string, unknown>)[k] = null;
      return;
    }
    const n = parseInt(t, 10);
    (body as Record<string, unknown>)[k] = Number.isFinite(n) ? n : null;
  };

  setStr("update_date", "update_date");
  setStr("fiscal_year_label", "fiscal_year_label");
  setStr("project_manager", "project_manager");
  setStr("adjustment_reason", "adjustment_reason");
  setStr("attachment_ref", "attachment_ref");
  setStr("approver_name", "approver_name");
  setStr("invoice_number", "invoice_number");
  setStr("invoice_raised_date", "invoice_raised_date");
  setStr("payment_due_date", "payment_due_date");
  setStr("actual_payment_received_date", "actual_payment_received_date");
  setStr("notes", "notes");
  setNum("revenue_booked_inr", "revenue_booked_inr");
  setNum("mmf_inr", "mmf_inr");
  setInt("opening_req", "opening_req");
  setNum("opening_fee_inr", "opening_fee_inr");
  setInt("total_joiners", "total_joiners");
  setInt("taggd_joiner", "taggd_joiner");
  setNum("taggd_joiner_fee_inr", "taggd_joiner_fee_inr");
  setInt("er_ijp_other_count", "er_ijp_other_count");
  setNum("er_ijp_other_fee_inr", "er_ijp_other_fee_inr");
  setInt("campus_count", "campus_count");
  setNum("campus_fee_inr", "campus_fee_inr");
  setNum("total_joining_fee_inr", "total_joining_fee_inr");
  setNum("adjustment_amt_inr", "adjustment_amt_inr");
  setNum("net_revenue_inr", "net_revenue_inr");
  setNum("rph_inr", "rph_inr");
  setNum("pct_of_target", "pct_of_target");
  setNum("invoice_amount_inr", "invoice_amount_inr");
  setNum("collection_received_inr", "collection_received_inr");
  return body;
}

const BILLING_TABS = [
  { icon: "◇", label: "Project" },
  { icon: "₹", label: "Revenue" },
  { icon: "👥", label: "Joiners" },
  { icon: "📄", label: "Invoice" },
  { icon: "📝", label: "Notes" },
] as const;

function BillingFormNCP({
  draft,
  setDraft,
  projectLocked,
  projects,
  assignableUsers,
  tab,
  setTab,
  /** In-sheet mount target so Radix Sheet focus scope includes the portaled dropdown. */
  projectDropdownPortalEl,
  billingRowId,
  attachmentsLocked,
  pendingAttachmentFiles,
  setPendingAttachmentFiles,
  onBillingAttachmentRefSynced,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  projectLocked: boolean;
  projects: Project[];
  assignableUsers: PlatformUserLite[];
  tab: number;
  setTab: (n: number) => void;
  projectDropdownPortalEl: HTMLDivElement | null;
  billingRowId: number | null;
  attachmentsLocked: boolean;
  pendingAttachmentFiles: File[];
  setPendingAttachmentFiles: React.Dispatch<React.SetStateAction<File[]>>;
  onBillingAttachmentRefSynced: (attachmentRef: string | null) => void;
}) {
  const [projDdOpen, setProjDdOpen] = useState(false);
  const [projSearch, setProjSearch] = useState("");
  const [approverUserId, setApproverUserId] = useState("");
  const [pmUserId, setPmUserId] = useState("");
  const [projDdRect, setProjDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const projWrapRef = useRef<HTMLDivElement>(null);
  const projBtnRef = useRef<HTMLButtonElement>(null);
  const projPortalRef = useRef<HTMLDivElement>(null);
  const billingFileRef = useRef<HTMLInputElement | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentErr, setAttachmentErr] = useState<string | null>(null);

  // Sync pickers with draft text (email) when assignable list loads
  useEffect(() => {
    const an = (draft.approver_name || "").trim().toLowerCase();
    if (!assignableUsers.length || !an) {
      setApproverUserId("");
      return;
    }
    const match = assignableUsers.find((u) => u.email.toLowerCase() === an);
    setApproverUserId(match ? String(match.id) : "");
  }, [assignableUsers, draft.approver_name]);

  useEffect(() => {
    const pm = (draft.project_manager || "").trim().toLowerCase();
    if (!assignableUsers.length || !pm) {
      setPmUserId("");
      return;
    }
    const match = assignableUsers.find((u) => u.email.toLowerCase() === pm);
    setPmUserId(match ? String(match.id) : "");
  }, [assignableUsers, draft.project_manager]);

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

  const set = (k: string, v: string) => setDraft((prev) => ({ ...prev, [k]: v }));

  const billingBasenames = useMemo(
    () => sortBillingBasenamesNewestFirst(parseBillingStoredBasenames(draft.attachment_ref)),
    [draft.attachment_ref],
  );
  const urlAttachmentText = useMemo(
    () => nonBillingAttachmentLines(draft.attachment_ref).join("\n"),
    [draft.attachment_ref],
  );
  const billingAttachmentProjectId = (() => {
    const n = parseInt(draft.project_id, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();

  function billingAttachmentErrFromCatch(e: unknown, fallback: string): string {
    let msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : fallback;
    const status =
      e && typeof e === "object" && "response" in e
        ? (e as { response?: { status?: number } }).response?.status
        : undefined;
    if (status === 403 || /access denied/i.test(msg)) {
      msg = `${msg} If this is wrong, ask an admin to assign you to project PRJ-${billingAttachmentProjectId}.`;
    }
    if (status === 423 || /locked/i.test(msg)) {
      msg = `${msg} This row may be in finance review — dispute or wait until it returns to draft.`;
    }
    return msg;
  }

  async function onBillingFilesPicked(files: FileList | null) {
    if (!files?.length || attachmentsLocked) return;
    const list = Array.from(files);
    if (billingRowId === null) {
      setPendingAttachmentFiles((prev) => [...prev, ...list]);
      setAttachmentErr(null);
      if (billingFileRef.current) billingFileRef.current.value = "";
      return;
    }
    setAttachmentErr(null);
    setAttachmentUploading(true);
    try {
      let lastRef: string | null = draft.attachment_ref?.trim() ? draft.attachment_ref : null;
      for (const file of list) {
        const row = await queries.uploadRevenueBillingAttachment(billingRowId, file);
        lastRef = row.attachment_ref ?? null;
      }
      if (lastRef != null) onBillingAttachmentRefSynced(lastRef);
    } catch (e: unknown) {
      setAttachmentErr(billingAttachmentErrFromCatch(e, "Upload failed"));
    } finally {
      setAttachmentUploading(false);
      if (billingFileRef.current) billingFileRef.current.value = "";
    }
  }

  async function onDownloadBillingAttachment(storedBasename: string) {
    if (!billingRowId || !storedBasename) return;
    setAttachmentErr(null);
    try {
      const res = await api.get(`revenue-billing/${billingRowId}/billing-attachment`, {
        params: { f: storedBasename },
        responseType: "blob",
      });
      const dispo = res.headers["content-disposition"] as string | undefined;
      let name = displayBillingStoredName(storedBasename);
      const m = dispo && /filename\*?=(?:UTF-8''|")?([^";\n]+)/i.exec(dispo);
      if (m?.[1]) name = decodeURIComponent(m[1].replace(/"/g, "").trim());
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setAttachmentErr(billingAttachmentErrFromCatch(e, "Download failed"));
    }
  }

  const selectedProject = useMemo(() => {
    const pid = parseInt(draft.project_id, 10);
    return Number.isFinite(pid) && pid > 0 ? projects.find((p) => p.id === pid) ?? null : null;
  }, [draft.project_id, projects]);

  const filteredProjects = useMemo(() => {
    const q = projSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const lab = `prj-${p.id} ${p.account_name || p.filename || ""}`.toLowerCase();
      return lab.includes(q);
    });
  }, [projects, projSearch]);

  const pr = (label: string, key: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="ncp-prop-row">
      <div className="ncp-prop-label">{label}</div>
      <input
        className="ncp-prop-input"
        value={draft[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
        {...extra}
      />
    </div>
  );

  const dateGrid = (cells: Array<{ label: string; key: string }>) => (
    <div className="ncp-date-grid" style={{ borderTop: "none" }}>
      {cells.map(({ label, key }) => (
        <div key={key} className="ncp-date-cell">
          <label>{label}</label>
          <input
            type="date"
            value={draft[key] ?? ""}
            onChange={(e) => set(key, e.target.value)}
          />
        </div>
      ))}
    </div>
  );

  const amtField = (label: string, key: string, symbol = "₹", isCount = false) => (
    <div className="ncp-amount-wrap">
      <label>{label}</label>
      <div className="ncp-amount-row">
        <span className="ncp-currency-badge">{symbol}</span>
        <input
          type="text"
          inputMode={isCount ? "numeric" : "decimal"}
          placeholder="0"
          value={draft[key] ?? ""}
          onChange={(e) => set(key, e.target.value)}
        />
      </div>
    </div>
  );

  const section = (
    icon: React.ReactNode,
    colorCls: string,
    label: string,
    desc: string,
    body: React.ReactNode,
  ) => (
    <div className="ncp-section" style={{ marginBottom: 12 }}>
      <div className="ncp-section-header" style={{ cursor: "default" }}>
        <div className={cn("ncp-section-icon", colorCls)}>{icon}</div>
        <div>
          <div className="ncp-section-label">{label}</div>
          <div className="ncp-section-desc">{desc}</div>
        </div>
      </div>
      <div
        className="ncp-section-body"
        style={{ maxHeight: 520, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
      >
        {body}
      </div>
    </div>
  );

  return (
    <>
      {/* ── Tabs ─────────────────────────────────────────── */}
      <div className="ncp-steps" role="tablist" style={{ marginBottom: 18 }}>
        {BILLING_TABS.map(({ icon, label }, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={tab === i}
            className={cn("ncp-step", tab === i && "ncp-active")}
            onClick={() => setTab(i)}
          >
            <span
              className="ncp-step-num"
              style={{
                fontSize: 14,
                background: tab === i ? "rgba(255,255,255,0.22)" : "var(--ncp-border)",
              }}
            >
              {i < tab ? "✓" : icon}
            </span>
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab 0: Project & Period ─────────────────────── */}
      <div className={cn("ncp-panel", tab === 0 && "ncp-panel-active")}>
        {section(
          "◇",
          "ncp-orange",
          "Project & period",
          "Linked project and reporting period",
          <>
            <div ref={projWrapRef} className="ncp-project-wrap" style={{ borderTop: "none" }}>
              <button
                ref={projBtnRef}
                type="button"
                className={cn("ncp-project-btn", selectedProject && "ncp-selected")}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!projectLocked) setProjDdOpen((o) => !o);
                }}
                disabled={projectLocked}
              >
                {selectedProject ? (
                  <>
                    <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 11, color: "var(--ncp-accent)" }}>
                      PRJ-{selectedProject.id}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ncp-text-primary)" }}>
                      {selectedProject.account_name || selectedProject.filename || "—"}
                    </span>
                  </>
                ) : (
                  <>
                    <span>＋</span>
                    <span>Search or select a project (PRJ-···)</span>
                  </>
                )}
                {!projectLocked && (
                  <span style={{ marginLeft: "auto", color: "var(--ncp-text-muted)" }}>▾</span>
                )}
              </button>
              {projDdOpen &&
                projDdRect &&
                projectDropdownPortalEl &&
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
                    <div
                      className="ncp-project-dd ncp-open ncp-project-dd--portal"
                      onClick={(e) => e.stopPropagation()}
                    >
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
                      <div
                        className="ncp-dd-scroll"
                        onWheel={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                      >
                        {filteredProjects.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className={cn("ncp-project-opt", String(p.id) === draft.project_id && "ncp-selected")}
                            onClick={() => {
                              set("project_id", String(p.id));
                              setProjDdOpen(false);
                              setProjSearch("");
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "var(--ncp-mono)",
                                fontSize: 11,
                                color: "var(--ncp-accent)",
                                minWidth: 52,
                              }}
                            >
                              PRJ-{p.id}
                            </span>
                            <span>{p.account_name || p.filename || `Project ${p.id}`}</span>
                          </button>
                        ))}
                        {filteredProjects.length === 0 && (
                          <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ncp-text-muted)" }}>
                            No projects match "{projSearch}"
                          </div>
                        )}
                      </div>
                    </div>
                  </div>,
                  projectDropdownPortalEl,
                )}
            </div>
            {pr("Update date", "update_date", { placeholder: "YYYY-MM-DD" })}
            {pr("Fiscal year", "fiscal_year_label", { placeholder: "e.g. FY 2025-26" })}
            <div className="ncp-prop-row">
              <div className="ncp-prop-label">Project manager</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <UserPickerDropdown
                  value={pmUserId}
                  onChange={(v) => {
                    setPmUserId(v);
                    const u = assignableUsers.find((x) => String(x.id) === v);
                    set("project_manager", u ? u.email : "");
                  }}
                  users={assignableUsers}
                  placeholder={selectedProject ? "— Optional —" : "Select a project first"}
                />
              </div>
            </div>
          </>,
        )}
      </div>

      {/* ── Tab 1: Revenue & MMF ───────────────────────── */}
      <div className={cn("ncp-panel", tab === 1 && "ncp-panel-active")}>
        {section(
          "₹",
          "ncp-green",
          "Revenue & MMF",
          "Booking, MMF deduction, net revenue and productivity",
          <>
            <div className="ncp-commercial-row" style={{ borderTop: "none", padding: "12px" }}>
              {amtField("Revenue booked", "revenue_booked_inr")}
              {amtField("MMF", "mmf_inr")}
            </div>
            {pr("Net revenue (INR)", "net_revenue_inr", { inputMode: "decimal", placeholder: "0" })}
            <div className="ncp-commercial-row" style={{ padding: "0 12px 12px" }}>
              {amtField("RPH", "rph_inr")}
              {amtField("% of target", "pct_of_target", "%")}
            </div>
          </>,
        )}
      </div>

      {/* ── Tab 2: Openings & Joiners ──────────────────── */}
      <div className={cn("ncp-panel", tab === 2 && "ncp-panel-active")}>
        {section(
          "👥",
          "ncp-blue",
          "Openings",
          "Opening requisitions and fees",
          <>
            {pr("Opening req (count)", "opening_req", { inputMode: "numeric", placeholder: "0", style: { borderTopWidth: 0 } })}
            {pr("Opening fee (INR)", "opening_fee_inr", { inputMode: "decimal", placeholder: "0" })}
          </>,
        )}
        {section(
          "⬥",
          "ncp-amber",
          "Joiners",
          "Taggd, ER/IJP/Other and campus",
          <>
            {pr("Total joiners", "total_joiners", { inputMode: "numeric", placeholder: "0", style: { borderTopWidth: 0 } })}
            {pr("Taggd joiners", "taggd_joiner", { inputMode: "numeric", placeholder: "0" })}
            {pr("Taggd joiner fee (INR)", "taggd_joiner_fee_inr", { inputMode: "decimal", placeholder: "0" })}
            {pr("Total joining fee (INR)", "total_joining_fee_inr", { inputMode: "decimal", placeholder: "0" })}
            {pr("ER/IJP/Other (count)", "er_ijp_other_count", { inputMode: "numeric", placeholder: "0" })}
            {pr("ER/IJP/Other fee (INR)", "er_ijp_other_fee_inr", { inputMode: "decimal", placeholder: "0" })}
            {pr("Campus (count)", "campus_count", { inputMode: "numeric", placeholder: "0" })}
            {pr("Campus fee (INR)", "campus_fee_inr", { inputMode: "decimal", placeholder: "0" })}
          </>,
        )}
      </div>

      {/* ── Tab 3: Invoice & Collection ────────────────── */}
      <div className={cn("ncp-panel", tab === 3 && "ncp-panel-active")}>
        {section(
          "📄",
          "ncp-blue",
          "Invoice",
          "Invoice details, payment tracking and approvals",
          <>
            <div className="ncp-commercial-row" style={{ borderTop: "none", padding: "12px" }}>
              {amtField("Invoice amount", "invoice_amount_inr")}
              {amtField("Collection received", "collection_received_inr")}
            </div>
            {pr("Invoice number", "invoice_number", { placeholder: "INV-XXXX" })}
            {/* Date grid: raised + due */}
            {dateGrid([
              { label: "Invoice raised date", key: "invoice_raised_date" },
              { label: "Payment due date", key: "payment_due_date" },
            ])}
            {/* Standalone: payment received */}
            <div className="ncp-date-grid">
              <div className="ncp-date-cell">
                <label>Payment received date</label>
                <input
                  type="date"
                  value={draft.actual_payment_received_date ?? ""}
                  onChange={(e) => set("actual_payment_received_date", e.target.value)}
                />
              </div>
            </div>
            {/* Approver — platform user picker */}
            <div className="ncp-prop-row">
              <div className="ncp-prop-label">Approver</div>
              <div style={{ flex: 1 }}>
                <UserPickerDropdown
                  value={approverUserId}
                  onChange={(v) => {
                    setApproverUserId(v);
                    const u = assignableUsers.find((x) => String(x.id) === v);
                    set("approver_name", u ? u.email : "");
                  }}
                  users={assignableUsers}
                  placeholder={selectedProject ? "— Not assigned —" : "Select a project first"}
                />
              </div>
            </div>
            <div className="ncp-prop-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <div className="ncp-prop-label">Attachment (URL / ref)</div>
              <textarea
                className="ncp-prop-input"
                rows={2}
                placeholder="HTTPS link or internal reference (optional)"
                disabled={attachmentsLocked}
                value={urlAttachmentText}
                onChange={(e) => {
                  const merged = mergeUrlTextWithBillingBasenames(
                    e.target.value,
                    parseBillingStoredBasenames(draft.attachment_ref),
                  );
                  setDraft((prev) => ({ ...prev, attachment_ref: merged }));
                }}
              />
            </div>
            <div
              style={{
                borderTop: "1px solid var(--ncp-border)",
                marginTop: 4,
                paddingTop: 12,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ncp-text-secondary)", marginBottom: 6 }}>
                Invoice &amp; supporting files
              </div>
              <p className="ncp-hint" style={{ margin: "0 0 8px" }}>
                PDF, Word, Excel, or an image — same as contract MSA uploads. Multiple files are kept; URLs stay in the
                field above.
                {billingRowId === null ? " Queued files upload automatically after you create the row." : ""}
              </p>
              {billingBasenames.length > 0 && billingRowId !== null && (
                <ul
                  className="ncp-hint"
                  style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 13, color: "var(--ncp-text-primary)" }}
                >
                  {billingBasenames.map((fn) => (
                    <li
                      key={fn}
                      style={{ marginBottom: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}
                    >
                      <span
                        style={{
                          flex: "1 1 140px",
                          minWidth: 0,
                          wordBreak: "break-all",
                          fontFamily: "var(--ncp-mono)",
                          fontSize: 12,
                        }}
                      >
                        {displayBillingStoredName(fn)}
                      </span>
                      <button
                        type="button"
                        className="ncp-btn ncp-btn-ghost"
                        style={{ flexShrink: 0 }}
                        onClick={() => void onDownloadBillingAttachment(fn)}
                      >
                        Download
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {pendingAttachmentFiles.length > 0 && billingRowId === null && (
                <ul
                  className="ncp-hint"
                  style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 13, color: "var(--ncp-text-primary)" }}
                >
                  {pendingAttachmentFiles.map((f, i) => (
                    <li
                      key={`${f.name}-${i}-${f.size}`}
                      style={{ marginBottom: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}
                    >
                      <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>{f.name}</span>
                      <button
                        type="button"
                        className="ncp-btn ncp-btn-ghost"
                        style={{ flexShrink: 0 }}
                        onClick={() => setPendingAttachmentFiles((prev) => prev.filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <input
                  ref={billingFileRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xlsx,.xls,.png,.jpg,.jpeg"
                  className="sr-only"
                  disabled={attachmentUploading || attachmentsLocked}
                  onChange={(e) => void onBillingFilesPicked(e.target.files)}
                />
                <button
                  type="button"
                  className="ncp-btn ncp-btn-secondary"
                  disabled={attachmentUploading || attachmentsLocked}
                  onClick={() => billingFileRef.current?.click()}
                >
                  {attachmentUploading ? "Uploading…" : "Upload files…"}
                </button>
              </div>
              {attachmentErr && (
                <div
                  className="ncp-hint"
                  style={{ marginTop: 8, color: "var(--ncp-amber, #b45309)", fontSize: 12 }}
                  role="alert"
                >
                  {attachmentErr}
                </div>
              )}
            </div>
          </>,
        )}
        {section(
          "⚖",
          "ncp-amber",
          "Adjustments",
          "Revenue adjustments and reason",
          <>
            <div className="ncp-prop-row" style={{ borderTop: "none" }}>
              <div className="ncp-prop-label">Reason</div>
              <textarea
                className="ncp-prop-input"
                rows={2}
                placeholder="Describe the adjustment…"
                value={draft.adjustment_reason ?? ""}
                onChange={(e) => set("adjustment_reason", e.target.value)}
              />
            </div>
            {pr("Adjustment amount (INR)", "adjustment_amt_inr", { inputMode: "decimal", placeholder: "0" })}
          </>,
        )}
      </div>

      {/* ── Tab 4: Notes ───────────────────────────────── */}
      <div className={cn("ncp-panel", tab === 4 && "ncp-panel-active")}>
        {section(
          "📝",
          "ncp-blue",
          "Notes",
          "Free-form notes for this billing row",
          <div className="ncp-prop-row" style={{ borderTop: "none" }}>
            <textarea
              className="ncp-prop-input"
              rows={8}
              placeholder="Any notes, context, or commentary…"
              value={draft.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>,
        )}
      </div>
    </>
  );
}

export function Billing() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<RevenueBillingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [filterProjDdOpen, setFilterProjDdOpen] = useState(false);
  const [filterProjSearch, setFilterProjSearch] = useState("");
  const [filterProjDdRect, setFilterProjDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const filterProjWrapRef = useRef<HTMLDivElement>(null);
  const filterProjBtnRef = useRef<HTMLButtonElement>(null);
  const filterProjPortalRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(0));
  const [baselineDraft, setBaselineDraft] = useState<Draft | null>(null);
  const [billingTab, setBillingTab] = useState(0);
  const [assignableUsers, setAssignableUsers] = useState<PlatformUserLite[]>([]);
  /** In-sheet DOM node for BillingFormNCP project dropdown portal (Radix focus trap). */
  const [billingSheetPortalEl, setBillingSheetPortalEl] = useState<HTMLDivElement | null>(null);
  const [pendingAttachmentFiles, setPendingAttachmentFiles] = useState<File[]>([]);

  /** Client-side filters for the loaded table (API still uses project + limit). */
  const [tableSearch, setTableSearch] = useState("");
  const [tableFy, setTableFy] = useState<string>("all");
  const [tablePm, setTablePm] = useState<string>("all");
  const [tableInvoice, setTableInvoice] = useState<"all" | "has" | "none">("all");

  const pid = projectFilter === "all" ? undefined : Number(projectFilter);

  const selectedFilterProject = useMemo(() => {
    if (projectFilter === "all") return null;
    const id = Number(projectFilter);
    return Number.isFinite(id) && id > 0 ? projects.find((p) => p.id === id) ?? null : null;
  }, [projectFilter, projects]);

  const filteredFilterProjects = useMemo(() => {
    const q = filterProjSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const lab = `prj-${p.id} ${p.account_name || p.filename || ""}`.toLowerCase();
      return lab.includes(q);
    });
  }, [projects, filterProjSearch]);

  useLayoutEffect(() => {
    if (!filterProjDdOpen) {
      setFilterProjDdRect(null);
      return;
    }
    const measure = () => {
      const btn = filterProjBtnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setFilterProjDdRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (filterProjBtnRef.current) ro.observe(filterProjBtnRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [filterProjDdOpen]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (filterProjWrapRef.current?.contains(t) || filterProjPortalRef.current?.contains(t)) return;
      setFilterProjDdOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const reload = useCallback(async () => {
    setErr(null);
    invalidateCache("revenue-billing");
    try {
      const res = await queries.revenueBillingList({
        project_id: pid,
        limit: 500,
        offset: 0,
      });
      setRows(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (e: unknown) {
      setErr(String(e instanceof Error ? e.message : e));
    }
  }, [pid]);

  useEffect(() => {
    void queries.projects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!dialogOpen) {
      setAssignableUsers([]);
      return;
    }
    const n = parseInt(draft.project_id, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setAssignableUsers([]);
      return;
    }
    let cancelled = false;
    void queries
      .taskAssignableUsers({ project_id: n })
      .then((list) => {
        if (!cancelled) setAssignableUsers(list);
      })
      .catch(() => {
        if (!cancelled) setAssignableUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [dialogOpen, draft.project_id]);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      await reload();
      setLoading(false);
    })();
  }, [reload]);

  const defaultProjectId = useMemo(() => {
    if (projectFilter !== "all") return Number(projectFilter);
    return projects[0]?.id ?? 0;
  }, [projectFilter, projects]);

  const distinctFiscalYears = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const v = (r.fiscal_year_label || "").trim();
      if (v) s.add(v);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const distinctPMs = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const v = (r.project_manager || "").trim();
      if (v) s.add(v);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const hasEmptyFy = useMemo(() => rows.some((r) => !(r.fiscal_year_label || "").trim()), [rows]);
  const hasEmptyPm = useMemo(() => rows.some((r) => !(r.project_manager || "").trim()), [rows]);

  const editingBillingRow = useMemo(
    () => (editId != null ? rows.find((r) => r.id === editId) : null),
    [editId, rows],
  );
  const attachmentsLocked = editingBillingRow ? billingSheetLockedForCurrentUser(editingBillingRow, user) : false;

  const filteredRows = useMemo(
    () =>
      rows.filter((r) =>
        rowMatchesBillingTableFilters(r, {
          search: tableSearch,
          fy: tableFy,
          pm: tablePm,
          invoice: tableInvoice,
        })
      ),
    [rows, tableSearch, tableFy, tablePm, tableInvoice]
  );

  const billingSummary = useMemo(() => {
    const list = filteredRows;
    return {
      rowCount: list.length,
      netRevenue: sumNumeric(list, (r) => r.net_revenue_inr),
      revenueBooked: sumNumeric(list, (r) => r.revenue_booked_inr),
      totalJoiningFee: sumNumeric(list, (r) => r.total_joining_fee_inr),
      mmf: sumNumeric(list, (r) => r.mmf_inr),
      totalJoiners: sumNumeric(list, (r) => r.total_joiners),
      taggdJoiner: sumNumeric(list, (r) => r.taggd_joiner),
      otherJoiner: sumNumeric(list, (r) => r.er_ijp_other_count),
      rphAvg: avgNumeric(list, (r) => r.rph_inr),
    };
  }, [filteredRows]);

  const tableFiltersActive =
    tableSearch.trim() !== "" || tableFy !== "all" || tablePm !== "all" || tableInvoice !== "all";

  function clearTableFilters() {
    setTableSearch("");
    setTableFy("all");
    setTablePm("all");
    setTableInvoice("all");
  }

  function openCreate() {
    setErr(null);
    setEditId(null);
    setBaselineDraft(null);
    setDraft(emptyDraft(0));
    setBillingTab(0);
    setPendingAttachmentFiles([]);
    setDialogOpen(true);
  }

  function openEdit(r: RevenueBillingRow) {
    setErr(null);
    const d = rowToDraft(r);
    setEditId(r.id);
    setBaselineDraft({ ...d });
    setDraft(d);
    setBillingTab(0);
    setPendingAttachmentFiles([]);
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setErr(null);
    try {
      if (editId === null) {
        const body = draftToCreate(draft);
        const created = await queries.createRevenueBilling(body);
        for (const f of pendingAttachmentFiles) {
          await queries.uploadRevenueBillingAttachment(created.id, f);
        }
        setPendingAttachmentFiles([]);
      } else {
        if (!baselineDraft) {
          setErr("Could not load this row for editing. Close the panel and choose Edit again.");
          return;
        }
        const delta = draftToPatchDelta(baselineDraft, draft);
        if (Object.keys(delta).length > 0) {
          await queries.patchRevenueBilling(editId, delta);
        }
      }
      setDialogOpen(false);
      await reload();
    } catch (e: unknown) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitForFinance(r: RevenueBillingRow) {
    if (!canSubmitBilling(r)) return;
    setErr(null);
    try {
      await queries.financeBillingWorkflowSubmit(r.id);
      await reload();
    } catch (e: unknown) {
      setErr(String(e instanceof Error ? e.message : e));
    }
  }

  async function handleDelete(id: number, row?: RevenueBillingRow) {
    if (row && billingSheetLockedForCurrentUser(row, user)) {
      setErr(
        "This billing row cannot be deleted while finance validation is in progress. Only draft or disputed rows can be removed.",
      );
      return;
    }
    if (!window.confirm(`Delete billing row #${id}?`)) return;
    setErr(null);
    try {
      await queries.deleteRevenueBilling(id);
      await reload();
    } catch (e: unknown) {
      setErr(String(e instanceof Error ? e.message : e));
    }
  }

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="Billing"
        subtitle="TAGGD revenue tracker rows — amounts in INR. Link rows to a project; fill fields over time."
      />

      <PlatformSection title="Filters & actions">
        <div className="billing-toolbar">
          <div className="billing-toolbar-field billing-toolbar-field--project">
            <span id="billing-project-filter-label" className="billing-toolbar-label">
              Project
            </span>
            <div
              className="new-contract-sheet billing-toolbar-project-embed"
              ref={filterProjWrapRef}
              style={{
                minHeight: 0,
                display: "block",
                background: "transparent",
                padding: 0,
                margin: 0,
                fontFamily: "inherit",
                color: "inherit",
              }}
            >
              <div className="ncp-project-wrap" style={{ borderTop: "none", marginBottom: 0 }}>
                <button
                  ref={filterProjBtnRef}
                  type="button"
                  className={cn(
                    "ncp-project-btn",
                    (projectFilter === "all" || selectedFilterProject) && "ncp-selected",
                  )}
                  aria-haspopup="listbox"
                  aria-expanded={filterProjDdOpen}
                  aria-labelledby="billing-project-filter-label"
                  disabled={!projects.length}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (projects.length) setFilterProjDdOpen((o) => !o);
                  }}
                >
                  {projectFilter === "all" ? (
                    <>
                      <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 11, color: "var(--ncp-text-muted)" }}>
                        All
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ncp-text-primary)" }}>
                        All projects
                      </span>
                    </>
                  ) : selectedFilterProject ? (
                    <>
                      <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 11, color: "var(--ncp-accent)" }}>
                        PRJ-{selectedFilterProject.id}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ncp-text-primary)" }}>
                        {selectedFilterProject.account_name || selectedFilterProject.filename || "—"}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>＋</span>
                      <span>Pick a project</span>
                    </>
                  )}
                  <span style={{ marginLeft: "auto", color: "var(--ncp-text-muted)" }}>▾</span>
                </button>
                {filterProjDdOpen &&
                  filterProjDdRect &&
                  createPortal(
                    <div
                      ref={filterProjPortalRef}
                      className="new-contract-sheet"
                      style={{
                        position: "fixed",
                        top: filterProjDdRect.top,
                        left: filterProjDdRect.left,
                        width: filterProjDdRect.width,
                        zIndex: 200,
                        pointerEvents: "auto",
                        minHeight: 0,
                        height: "auto",
                        display: "block",
                        background: "transparent",
                      }}
                    >
                      <div
                        className="ncp-project-dd ncp-open ncp-project-dd--portal"
                        onClick={(e) => e.stopPropagation()}
                        role="listbox"
                        aria-labelledby="billing-project-filter-label"
                      >
                        <div className="ncp-project-search">
                          <span style={{ opacity: 0.5 }}>🔍</span>
                          <input
                            type="search"
                            placeholder="Search projects…"
                            value={filterProjSearch}
                            onChange={(e) => setFilterProjSearch(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <div
                          className="ncp-dd-scroll"
                          onWheel={(e) => e.stopPropagation()}
                          onTouchMove={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            role="option"
                            aria-selected={projectFilter === "all"}
                            className={cn("ncp-project-opt", projectFilter === "all" && "ncp-selected")}
                            onClick={() => {
                              setProjectFilter("all");
                              setFilterProjDdOpen(false);
                              setFilterProjSearch("");
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "var(--ncp-mono)",
                                fontSize: 11,
                                color: "var(--ncp-text-muted)",
                                minWidth: 52,
                              }}
                            >
                              —
                            </span>
                            <span>All projects</span>
                          </button>
                          {filteredFilterProjects.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              role="option"
                              aria-selected={projectFilter === String(p.id)}
                              className={cn("ncp-project-opt", projectFilter === String(p.id) && "ncp-selected")}
                              onClick={() => {
                                setProjectFilter(String(p.id));
                                setFilterProjDdOpen(false);
                                setFilterProjSearch("");
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: "var(--ncp-mono)",
                                  fontSize: 11,
                                  color: "var(--ncp-accent)",
                                  minWidth: 52,
                                }}
                              >
                                PRJ-{p.id}
                              </span>
                              <span>{p.account_name || p.filename || `Project ${p.id}`}</span>
                            </button>
                          ))}
                          {filteredFilterProjects.length === 0 && (
                            <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ncp-text-muted)" }}>
                              {projects.length === 0
                                ? "No projects."
                                : `No projects match “${filterProjSearch.trim()}”.`}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>,
                    document.body,
                  )}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="billing-toolbar-btn"
            onClick={() => void reload()}
            disabled={loading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 shrink-0", loading && "animate-spin")} aria-hidden />
            Refresh
          </button>
          <button
            type="button"
            className="billing-toolbar-btn"
            onClick={() => downloadBillingExcel(filteredRows)}
            disabled={loading}
            title="Download UTF-8 CSV (opens in Microsoft Excel). Exports rows that match the table filters below."
          >
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Download Excel
          </button>
          <button
            type="button"
            className="billing-toolbar-btn billing-toolbar-btn--primary"
            onClick={openCreate}
            disabled={!projects.length}
          >
            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            New billing row
          </button>
          <span className="billing-toolbar-count">{total} row(s)</span>
        </div>
        {err && (
          <div
            className="mt-3 rounded-md border px-3 py-2 text-xs font-mono"
            style={{
              borderColor: "rgba(239, 68, 68, 0.25)",
              background: "var(--red-soft)",
              color: "#b91c1c",
            }}
            role="alert"
          >
            {err}
          </div>
        )}
      </PlatformSection>

      <PlatformSection title="Summary">
        <div className="billing-ds px-1 pb-1 pt-0">
          <div className="billing-ds-section-card billing-ds-summary-wrap">
            <p className="billing-ds-summary-hint">
              Totals across <strong>{billingSummary.rowCount}</strong> row
              {billingSummary.rowCount === 1 ? "" : "s"} currently shown in the table (search, fiscal year, PM, and
              invoice filters). Project filter above still applies to the loaded set.
            </p>
            <div className="billing-ds-summary-grid">
              <div className="billing-ds-summary-tile">
                <div className="billing-ds-summary-label">Total net revenue</div>
                <div className="billing-ds-summary-value">{formatLargeCurrency(billingSummary.netRevenue)}</div>
              </div>
              <div className="billing-ds-summary-tile">
                <div className="billing-ds-summary-label">Revenue booked (month)</div>
                <div className="billing-ds-summary-sub">Σ revenue_booked_inr</div>
                <div className="billing-ds-summary-value">{formatLargeCurrency(billingSummary.revenueBooked)}</div>
              </div>
              <div className="billing-ds-summary-tile">
                <div className="billing-ds-summary-label">Total</div>
                <div className="billing-ds-summary-sub">Σ joining fees</div>
                <div className="billing-ds-summary-value">{formatLargeCurrency(billingSummary.totalJoiningFee)}</div>
              </div>
              <div className="billing-ds-summary-tile">
                <div className="billing-ds-summary-label">MMF</div>
                <div className="billing-ds-summary-value">{formatLargeCurrency(billingSummary.mmf)}</div>
              </div>
              <div className="billing-ds-summary-tile">
                <div className="billing-ds-summary-label">Total joiners</div>
                <div className="billing-ds-summary-value">{billingSummary.totalJoiners.toLocaleString()}</div>
              </div>
              <div className="billing-ds-summary-tile">
                <div className="billing-ds-summary-label">RPH</div>
                <div className="billing-ds-summary-sub">Mean of row RPH (INR)</div>
                <div className="billing-ds-summary-value">
                  {billingSummary.rphAvg != null ? formatLargeCurrency(billingSummary.rphAvg) : "—"}
                </div>
              </div>
              <div className="billing-ds-summary-tile">
                <div className="billing-ds-summary-label">Taggd joiner</div>
                <div className="billing-ds-summary-value">{billingSummary.taggdJoiner.toLocaleString()}</div>
              </div>
              <div className="billing-ds-summary-tile">
                <div className="billing-ds-summary-label">Other joiner</div>
                <div className="billing-ds-summary-sub">ER / IJP other count</div>
                <div className="billing-ds-summary-value">{billingSummary.otherJoiner.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      </PlatformSection>

      <PlatformSection title="All billing rows" action="Refresh" onAction={() => void reload()}>
        {loading ? (
          <div className="text-sm text-muted-foreground font-mono py-8 text-center">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center space-y-2 max-w-lg mx-auto">
            <p>
              No billing rows for this filter. Use <strong>New billing row</strong> to add one.
            </p>
            {projects.length > 0 ? (
              <p className="text-[11px] text-muted-foreground/90">
                The list only includes rows for <strong>projects you can access</strong> (same scope as Clients). If you expected demo data, re-run the billing seed on the database the API uses, then refresh.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground/90">
                You do not have any projects assigned. Ask an admin to assign projects to your account, or sign in as a user with broader access.
              </p>
            )}
          </div>
        ) : (
          <div className="billing-ds">
            <div className="billing-ds-section-card">
              <div className="billing-ds-filters">
                <input
                  className="billing-ds-input"
                  placeholder="Search ID, account, PM, invoice, FY, PRJ…"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                />
                <select className="billing-ds-select" style={{ minWidth: 140 }} value={tableFy} onChange={(e) => setTableFy(e.target.value)}>
                  <option value="all">All years</option>
                  {hasEmptyFy ? (
                    <option value={FY_NONE}>No FY set</option>
                  ) : null}
                  {distinctFiscalYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <select className="billing-ds-select" style={{ minWidth: 160 }} value={tablePm} onChange={(e) => setTablePm(e.target.value)}>
                  <option value="all">All PMs</option>
                  {hasEmptyPm ? (
                    <option value={PM_NONE}>No PM set</option>
                  ) : null}
                  {distinctPMs.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  className="billing-ds-select"
                  style={{ minWidth: 130 }}
                  value={tableInvoice}
                  onChange={(e) => setTableInvoice(e.target.value as "all" | "has" | "none")}
                >
                  <option value="all">All invoices</option>
                  <option value="has">Has invoice #</option>
                  <option value="none">No invoice</option>
                </select>
                <span className="billing-ds-meta">
                  {tableFiltersActive ? `${filteredRows.length} of ${rows.length} shown` : `${rows.length} loaded`}
                  {total > rows.length ? ` · ${total} total` : ""}
                </span>
                {tableFiltersActive ? (
                  <button type="button" className="billing-ds-filter-btn" onClick={clearTableFilters}>
                    <FilterX className="h-3 w-3" />
                    Clear filters
                  </button>
                ) : null}
              </div>

              {filteredRows.length === 0 ? (
                <div className="billing-ds-empty-msg">
                  No rows match these filters.{" "}
                  <button type="button" className="billing-ds-link-btn" onClick={clearTableFilters}>
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="billing-ds-table-scroll">
                  <table className="billing-ds-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Project</th>
                        <th>Update</th>
                        <th>FY</th>
                        <th>PM</th>
                        <th className="billing-ds-th-end">Net rev</th>
                        <th className="billing-ds-th-end">MMF</th>
                        <th>Invoice</th>
                        <th>Workflow</th>
                        <th className="billing-ds-th-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((r) => (
                        <tr key={r.id}>
                          <td className="billing-ds-id">{r.id}</td>
                          <td style={{ maxWidth: 220 }}>
                            <div className="billing-ds-project-name">{r.account_name || "—"}</div>
                            <div className="billing-ds-project-sub">PRJ-{r.project_id}</div>
                          </td>
                          <td className="billing-ds-mono" style={{ fontSize: 12 }}>
                            {r.update_date?.slice(0, 10) || "—"}
                          </td>
                          <td className="billing-ds-fy">{r.fiscal_year_label || "—"}</td>
                          <td className="billing-ds-pm" title={r.project_manager || ""}>
                            {r.project_manager || "—"}
                          </td>
                          <td className="billing-ds-td-end billing-ds-num">
                            {r.net_revenue_inr != null ? formatLargeCurrency(r.net_revenue_inr) : "—"}
                          </td>
                          <td className="billing-ds-td-end billing-ds-num">
                            {r.mmf_inr != null ? formatLargeCurrency(r.mmf_inr) : "—"}
                          </td>
                          <td
                            className={cn("billing-ds-invoice", r.invoice_number?.trim() ? "billing-ds-invoice--set" : "billing-ds-invoice--empty")}
                            title={r.invoice_number || ""}
                          >
                            {r.invoice_number || "—"}
                          </td>
                          <td>
                            <BillingWorkflowCell row={r} />
                          </td>
                          <td className="billing-ds-actions">
                            {canSubmitBilling(r) && canPracticeSubmitBilling(user) ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[10px] mr-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleSubmitForFinance(r);
                                }}
                                title="Submit to finance for validation"
                              >
                                Submit
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={cn(
                                "h-7 px-2",
                                billingSheetLockedForCurrentUser(r, user) && "opacity-45",
                              )}
                              onClick={() => {
                                if (billingSheetLockedForCurrentUser(r, user)) {
                                  setErr(
                                    "This row is locked under the finance workflow. Only draft or disputed rows can be edited — ask finance to return it to draft or mark it disputed.",
                                  );
                                  return;
                                }
                                openEdit(r);
                              }}
                              title={
                                billingSheetLockedForCurrentUser(r, user)
                                  ? "Locked under finance workflow (click for details)"
                                  : billingRowLocked(r)
                                    ? "Edit (platform admin — changes are logged)"
                                    : "Edit"
                              }
                            >
                              <PencilLine className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={cn(
                                "h-7 px-2 text-destructive hover:text-destructive",
                                billingSheetLockedForCurrentUser(r, user) && "opacity-45",
                              )}
                              onClick={() => {
                                if (billingSheetLockedForCurrentUser(r, user)) {
                                  setErr(
                                    "This row cannot be deleted while finance validation is in progress. Only draft or disputed rows can be removed.",
                                  );
                                  return;
                                }
                                void handleDelete(r.id, r);
                              }}
                              title={
                                billingSheetLockedForCurrentUser(r, user)
                                  ? "Locked (click for details)"
                                  : billingRowLocked(r)
                                    ? "Delete (platform admin — logged)"
                                    : "Delete"
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </PlatformSection>

      <Sheet
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) {
            setEditId(null);
            setBaselineDraft(null);
            setPendingAttachmentFiles([]);
          }
        }}
      >
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
          <div ref={setBillingSheetPortalEl} className="new-contract-sheet flex min-h-0 flex-1 flex-col">
            {/* ── Scrollable content ──────────────────────── */}
            <div className="ncp-scroll min-h-0 flex-1">
              <div className="ncp-page">
                {/* Header */}
                <div className="ncp-header">
                  <div style={{ minWidth: 0 }}>
                    <div className="ncp-breadcrumb">
                      <span>Billing</span>
                      <span className="ncp-breadcrumb-sep">›</span>
                      {editId !== null ? (
                        <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 10 }}>
                          BIL-{editId}
                        </span>
                      ) : (
                        <span>New row</span>
                      )}
                    </div>
                    <h1 className="ncp-h1">
                      {editId === null ? "New billing row" : `Edit billing #${editId}`}
                    </h1>
                    <p className="ncp-subtitle" style={{ marginTop: 4 }}>
                      All amounts are INR. Only project is required to create.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ncp-close-btn"
                    aria-label="Close"
                    onClick={() => setDialogOpen(false)}
                  >
                    ✕
                  </button>
                </div>

                {/* Form tabs + panels */}
                <BillingFormNCP
                  draft={draft}
                  setDraft={setDraft}
                  projectLocked={editId !== null}
                  projects={projects}
                  assignableUsers={assignableUsers}
                  tab={billingTab}
                  setTab={setBillingTab}
                  projectDropdownPortalEl={billingSheetPortalEl}
                  billingRowId={editId}
                  attachmentsLocked={attachmentsLocked}
                  pendingAttachmentFiles={pendingAttachmentFiles}
                  setPendingAttachmentFiles={setPendingAttachmentFiles}
                  onBillingAttachmentRefSynced={(ref) => {
                    const s = ref ?? "";
                    setDraft((d) => ({ ...d, attachment_ref: s }));
                    setBaselineDraft((b) => (b ? { ...b, attachment_ref: s } : b));
                  }}
                />

                {/* Error */}
                {err && (
                  <div
                    style={{
                      margin: "0 0 12px",
                      padding: "10px 14px",
                      background: "rgba(239,68,68,0.07)",
                      border: "1px solid rgba(239,68,68,0.25)",
                      borderRadius: "var(--ncp-radius)",
                      fontSize: 12,
                      color: "#b91c1c",
                    }}
                  >
                    {err}
                  </div>
                )}
              </div>
            </div>

            {/* ── Footer ─────────────────────────────────── */}
            <div className="ncp-footer">
              <button
                type="button"
                className="ncp-btn ncp-btn-ghost"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                {billingTab > 0 && (
                  <button
                    type="button"
                    className="ncp-btn ncp-btn-ghost"
                    onClick={() => setBillingTab((t) => t - 1)}
                  >
                    ← Back
                  </button>
                )}
                {billingTab < BILLING_TABS.length - 1 ? (
                  <button
                    type="button"
                    className="ncp-btn ncp-btn-secondary"
                    onClick={() => setBillingTab((t) => t + 1)}
                  >
                    Next →
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ncp-btn ncp-btn-primary"
                  disabled={saving || !draft.project_id}
                  onClick={() => void handleSave()}
                >
                  {saving ? "Saving…" : editId === null ? "Create row ✓" : "Save changes ✓"}
                </button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
