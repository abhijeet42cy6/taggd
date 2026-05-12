import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  queries,
  adminApi,
  CONTRACT_PIPELINE_STAGES,
  type ClientGroup,
  type Project,
  type ProjectContractRow,
} from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import {
  PageHeader,
  PlatformKpi,
  PlatformSection,
  Tabs,
  StatusTag,
} from "@/components/platform/PlatformBlocks";
import { Skeleton } from "@/components/platform/Skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { NewContractSheet } from "@/components/platform/NewContractSheet";
import type { NewContractOrgBundle } from "@/components/platform/NewContractOrgFlow";
import { cn } from "@/lib/utils";
import "@/styles/new-contract-panel.css";

type EnrichedContract = ProjectContractRow & {
  sbuLabel: string;
  clientLabel: string | null;
};

function parseDay(d: string | null | undefined): Date | null {
  if (!d) return null;
  const x = new Date(d.slice(0, 10));
  return Number.isNaN(x.getTime()) ? null : x;
}

function daysUntilEnd(end: string | null | undefined): number | null {
  const d = parseDay(end);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

function normStatus(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase();
}

function fmtCmPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  const p = v > 1 ? v : v * 100;
  return `${Math.round(p * 100) / 100}%`;
}

/** Disk basenames from `sow_msa_reference` (newline-separated `msa:cnt…` lines). */
function parseSowMsaFilenames(ref: string | null | undefined): string[] {
  if (!ref || !String(ref).trim()) return [];
  const out: string[] = [];
  for (const line of String(ref).replace(/\r\n/g, "\n").split("\n")) {
    const s = line.trim();
    if (!s.toLowerCase().startsWith("msa:")) continue;
    const fn = s.slice(4).trim();
    if (fn) out.push(fn);
  }
  return out;
}

function sortMsaFilenamesNewestFirst(fns: string[]): string[] {
  return [...fns].sort((a, b) => {
    const ta = /^cnt\d+_(\d+)_/.exec(a)?.[1];
    const tb = /^cnt\d+_(\d+)_/.exec(b)?.[1];
    return (Number(tb) || 0) - (Number(ta) || 0);
  });
}

function displayMsaStoredName(basename: string): string {
  return basename.replace(/^cnt\d+_\d+_/, "") || basename;
}

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(s: string): number | null {
  const n = numOrNull(s);
  if (n == null) return null;
  return Math.round(n);
}

function cmPctForApi(s: string): number | null {
  const n = numOrNull(s);
  if (n == null) return null;
  if (n > 1) return n / 100;
  return n;
}

function triBoolParse(s: string): boolean | null {
  const t = s.trim().toLowerCase();
  if (t === "yes" || t === "true" || t === "1") return true;
  if (t === "no" || t === "false" || t === "0") return false;
  return null;
}

function triBoolLabel(v: boolean | null | undefined): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

function contractRowToForm(row: ProjectContractRow): Record<string, string> {
  const d = (x: string | null | undefined) => (x ? x.slice(0, 10) : "");
  const n = (x: number | null | undefined) => (x != null ? String(x) : "");
  const tri = (x: boolean | null | undefined) =>
    x === true ? "yes" : x === false ? "no" : "";
  return {
    customer_name: row.customer_name ?? "",
    account_type: row.account_type ?? "",
    contract_start_date: d(row.contract_start_date),
    contract_end_date: d(row.contract_end_date),
    renewal_reminder_date: d(row.renewal_reminder_date),
    duration_months: n(row.duration_months),
    signed_acv_inr: n(row.signed_acv_inr),
    contract_status: row.contract_status ?? "",
    signed_cm_pct: n(row.signed_cm_pct),
    headcount_contracted: n(row.headcount_contracted),
    hiring_volume: n(row.hiring_volume),
    taggd_source_mix: row.taggd_source_mix ?? "",
    other_source_mix: row.other_source_mix ?? "",
    overall_rph: n(row.overall_rph),
    mmf_applicable: tri(row.mmf_applicable),
    opening_fee_applicable: tri(row.opening_fee_applicable),
    payment_terms: row.payment_terms ?? "",
    pricing_model: row.pricing_model ?? "",
    contract_detail: row.contract_detail ?? "",
    remarks: row.remarks ?? "",
    agreed_rate_fee_inr: n(row.agreed_rate_fee_inr),
    est_annual_value_inr: n(row.est_annual_value_inr),
    sow_msa_reference: row.sow_msa_reference ?? "",
    sla_terms_summary: row.sla_terms_summary ?? "",
    positions_contracted: n(row.positions_contracted),
    positions_filled: n(row.positions_filled),
    renewal_status: row.renewal_status ?? "",
    reason_for_lapse: row.reason_for_lapse ?? "",
    client_signoff_authority: row.client_signoff_authority ?? "",
    revenue_run_rate_inr: n(row.revenue_run_rate_inr),
    practice_head_snapshot: row.practice_head_snapshot ?? "",
    pipeline_stage: row.pipeline_stage ?? "",
  };
}

function emptyContractForm(): Record<string, string> {
  return contractRowToForm({
    id: 0,
    project_id: 0,
    client_id: null,
    customer_name: null,
    account_type: null,
    contract_start_date: null,
    contract_end_date: null,
    renewal_reminder_date: null,
    duration_months: null,
    signed_acv_inr: null,
    contract_status: null,
    signed_cm_pct: null,
    headcount_contracted: null,
    hiring_volume: null,
    taggd_source_mix: null,
    other_source_mix: null,
    overall_rph: null,
    mmf_applicable: null,
    opening_fee_applicable: null,
    payment_terms: null,
    pricing_model: null,
    contract_detail: null,
    remarks: null,
    agreed_rate_fee_inr: null,
    est_annual_value_inr: null,
    sow_msa_reference: null,
    sla_terms_summary: null,
    positions_contracted: null,
    positions_filled: null,
    renewal_status: null,
    reason_for_lapse: null,
    client_signoff_authority: null,
    internal_signoff: null,
    revenue_run_rate_inr: null,
    practice_head_snapshot: null,
    pipeline_stage: "discovery",
  });
}

function formToContractPayload(form: Record<string, string>): Record<string, unknown> {
  const str = (k: string) => {
    const v = (form[k] ?? "").trim();
    return v ? v : null;
  };
  return {
    customer_name: str("customer_name"),
    account_type: str("account_type"),
    contract_start_date: str("contract_start_date") || null,
    contract_end_date: str("contract_end_date") || null,
    renewal_reminder_date: str("renewal_reminder_date") || null,
    duration_months: intOrNull(form.duration_months ?? ""),
    signed_acv_inr: numOrNull(form.signed_acv_inr ?? ""),
    contract_status: str("contract_status"),
    signed_cm_pct: cmPctForApi(form.signed_cm_pct ?? ""),
    headcount_contracted: numOrNull(form.headcount_contracted ?? ""),
    hiring_volume: numOrNull(form.hiring_volume ?? ""),
    taggd_source_mix: str("taggd_source_mix"),
    other_source_mix: str("other_source_mix"),
    overall_rph: numOrNull(form.overall_rph ?? ""),
    mmf_applicable: triBoolParse(form.mmf_applicable ?? ""),
    opening_fee_applicable: triBoolParse(form.opening_fee_applicable ?? ""),
    payment_terms: str("payment_terms"),
    pricing_model: str("pricing_model"),
    contract_detail: str("contract_detail"),
    remarks: str("remarks"),
    agreed_rate_fee_inr: numOrNull(form.agreed_rate_fee_inr ?? ""),
    est_annual_value_inr: numOrNull(form.est_annual_value_inr ?? ""),
    sow_msa_reference: str("sow_msa_reference"),
    sla_terms_summary: str("sla_terms_summary"),
    positions_contracted: intOrNull(form.positions_contracted ?? ""),
    positions_filled: intOrNull(form.positions_filled ?? ""),
    renewal_status: str("renewal_status"),
    reason_for_lapse: str("reason_for_lapse"),
    client_signoff_authority: str("client_signoff_authority"),
    revenue_run_rate_inr: numOrNull(form.revenue_run_rate_inr ?? ""),
    practice_head_snapshot: str("practice_head_snapshot"),
    pipeline_stage: (form.pipeline_stage || "discovery").trim().toLowerCase(),
  };
}

function ContractFormFields({
  form,
  onField,
}: {
  form: Record<string, string>;
  onField: (key: string, value: string) => void;
}) {
  const triSelect = (key: string, label: string) => (
    <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
      <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>{label}</span>
      <select
        className="platform-search"
        value={form[key] ?? ""}
        onChange={(e) => onField(key, e.target.value)}
        style={{ width: "100%" }}
      >
        <option value="">—</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );

  const inp = (key: string, label: string, type: "text" | "date" | "number" = "text", placeholder?: string) => (
    <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
      <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>{label}</span>
      <input
        className="platform-search"
        type={type === "number" ? "text" : type}
        inputMode={type === "number" ? "decimal" : undefined}
        placeholder={placeholder}
        value={form[key] ?? ""}
        onChange={(e) => onField(key, e.target.value)}
        style={{ width: "100%" }}
      />
    </label>
  );

  const ta = (key: string, label: string, rows = 2) => (
    <label key={key} style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
      <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>{label}</span>
      <textarea
        className="platform-search"
        rows={rows}
        value={form[key] ?? ""}
        onChange={(e) => onField(key, e.target.value)}
        style={{ width: "100%", resize: "vertical" }}
      />
    </label>
  );

  return (
    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
      <div style={{ gridColumn: "1 / -1", fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>
        Closing pipeline
      </div>
      <label style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
        <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Pipeline stage</span>
        <select
          className="platform-search"
          value={form.pipeline_stage || "discovery"}
          onChange={(e) => onField("pipeline_stage", e.target.value)}
          style={{ width: "100%" }}
        >
          {CONTRACT_PIPELINE_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <div style={{ gridColumn: "1 / -1", fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>
        Identity &amp; classification
      </div>
      {inp("customer_name", "Customer name")}
      {inp("account_type", "Account / contract type (e.g. RPO)")}
      {inp("practice_head_snapshot", "Practice head")}
      {inp("contract_status", "Current status")}
      {inp("renewal_status", "Renewal status")}

      <div style={{ gridColumn: "1 / -1", fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>
        Dates
      </div>
      {inp("contract_start_date", "Contract start", "date")}
      {inp("contract_end_date", "Contract end / renewal", "date")}
      {inp("renewal_reminder_date", "Renewal reminder", "date")}
      {inp("duration_months", "Duration (months)", "number")}

      <div style={{ gridColumn: "1 / -1", fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>
        Commercial (INR)
      </div>
      {inp("signed_acv_inr", "Signed ACV (INR)", "number")}
      {inp("signed_cm_pct", "Signed CM% (e.g. 32 or 0.32)", "number")}
      {inp("agreed_rate_fee_inr", "Agreed rate / fee (INR)", "number")}
      {inp("est_annual_value_inr", "Est. annual value (INR)", "number")}
      {inp("revenue_run_rate_inr", "Revenue run rate / month (INR)", "number")}
      {inp("pricing_model", "Pricing model")}
      {ta("payment_terms", "Payment terms", 2)}

      <div style={{ gridColumn: "1 / -1", fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>
        Delivery &amp; sources
      </div>
      {inp("headcount_contracted", "HC / headcount contracted", "number")}
      {inp("hiring_volume", "Hiring volume", "number")}
      {inp("positions_contracted", "Positions contracted", "number")}
      {inp("positions_filled", "Positions filled", "number")}
      {inp("taggd_source_mix", "Taggd source mix")}
      {inp("other_source_mix", "Other source mix")}
      {inp("overall_rph", "Overall RPH", "number")}
      {triSelect("mmf_applicable", "MMF applicable")}
      {triSelect("opening_fee_applicable", "Opening fee applicable")}

      <div style={{ gridColumn: "1 / -1", fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>
        Legal &amp; SLA
      </div>
      {inp("sow_msa_reference", "SOW / MSA reference")}
      {ta("sla_terms_summary", "SLA terms summary", 3)}
      {inp("client_signoff_authority", "Client sign-off authority")}
      {ta("reason_for_lapse", "Reason for lapse / loss", 3)}
      {ta("contract_detail", "Detail (SOW / scope notes)", 3)}
      {ta("remarks", "Remarks", 3)}
    </div>
  );
}

// ─── Contract Detail + Edit Sheet ────────────────────────────────────────────

type ContractDetailSheetProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: EnrichedContract | null;
  contracts: ProjectContractRow[];
  projects: Project[];
  saving: boolean;
  canRealise: boolean;
  realising: boolean;
  onRealise: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onSave: (form: Record<string, string>) => void | Promise<void>;
  /** After MSA/contract file upload, parent refreshes `contracts` / `row`. */
  onMsaUploadComplete: (row: ProjectContractRow) => void;
  goClient: (clientId: number | null) => void;
};

// Pretty-print ISO date string → "01 Mar 2024"
function fmtDatePretty(d: string | null | undefined): string {
  if (!d) return "—";
  const parsed = parseDay(d);
  if (!parsed) return d.slice(0, 10);
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const DETAIL_TABS = [
  { icon: "◇", label: "Overview" },
  { icon: "📅", label: "Dates" },
  { icon: "₹", label: "Commercial" },
  { icon: "📊", label: "Delivery" },
  { icon: "⚖", label: "Legal" },
] as const;

type PlatformUserLite = { id: number; email: string; role: string };

function headInitialsFromEmail(email: string): string {
  const local = email.split("@")[0];
  const parts = local.split(/[._-]/);
  if (parts.length >= 2 && parts[0] && parts[1])
    return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

/** Resolve project head string / FK to a row in the merged assignable+admin user list. */
function matchHeadUser(
  projectHeadUserId: number | null | undefined,
  headStr: string | null | undefined,
  users: PlatformUserLite[],
): PlatformUserLite | null {
  if (projectHeadUserId != null && Number.isFinite(projectHeadUserId)) {
    const byId = users.find((u) => u.id === projectHeadUserId);
    if (byId) return byId;
  }
  const h = (headStr || "").trim();
  if (!h) return null;
  const hl = h.toLowerCase();
  if (h.includes("@")) {
    const exact = users.find((u) => u.email.toLowerCase() === hl);
    if (exact) return exact;
  }
  let u = users.find((x) => x.email.toLowerCase().split("@")[0] === hl);
  if (u) return u;
  u = users.find((x) => x.email.toLowerCase().startsWith(`${hl}@`));
  if (u) return u;
  u = users.find((x) => {
    const local = x.email.toLowerCase().split("@")[0];
    const first = local.split(/[._-]/)[0];
    return first === hl;
  });
  return u ?? null;
}

function ProjectHeadBadge({
  headLabel,
  matchedUser,
  compact,
}: {
  headLabel: string | null;
  matchedUser: PlatformUserLite | null;
  /** Slightly smaller circle for dense summary bar */
  compact?: boolean;
}) {
  const display =
    (headLabel && headLabel.trim()) ||
    (matchedUser ? matchedUser.email.split("@")[0].replace(/[._-]/g, " ").trim() : "") ||
    "—";
  const sz = compact ? 24 : 28;
  const fs = compact ? 10 : 11;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: compact ? 6 : 8, minWidth: 0 }}>
      <span
        title={matchedUser ? matchedUser.email : undefined}
        style={{
          width: sz,
          height: sz,
          borderRadius: 999,
          fontSize: fs,
          fontWeight: 700,
          fontFamily: "var(--ncp-font)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          lineHeight: 1,
          ...(matchedUser
            ? {
                background: "var(--ncp-accent-soft)",
                color: "var(--ncp-accent)",
                border: "1px solid var(--ncp-accent-mid)",
              }
            : {
                background: "var(--ncp-surface-hover)",
                color: "var(--ncp-text-muted)",
                border: "1px solid var(--ncp-border)",
              }),
        }}
      >
        {matchedUser ? headInitialsFromEmail(matchedUser.email) : (
          <span style={{ fontSize: compact ? 8 : 9, letterSpacing: "-0.5px" }}>--</span>
        )}
      </span>
      <span
        style={{
          fontSize: compact ? 12 : 13,
          fontWeight: 500,
          color: "var(--ncp-text-primary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: compact ? 140 : undefined,
        }}
      >
        {display}
      </span>
    </span>
  );
}

/** PRJ + engagement label + legal client, omitting duplicate labels when SBU text matches client name. */
function ContractSubtitle({
  row,
  onClientNav,
}: {
  row: EnrichedContract;
  onClientNav: () => void;
}) {
  const sbu = (row.sbuLabel || "").trim();
  const hasClient = row.client_id != null;
  const same = sbu && hasClient && sbu.toLowerCase() === (row.clientLabel || "").trim().toLowerCase();
  const clientLink = (key: string) =>
    hasClient ? (
      <button
        key={key}
        type="button"
        style={{
          background: "none",
          border: "none",
          color: "var(--ncp-accent)",
          cursor: "pointer",
          padding: 0,
          fontSize: 14,
          fontFamily: "var(--ncp-font)",
          textDecoration: "underline",
          textUnderlineOffset: "2px",
        }}
        onClick={onClientNav}
      >
        {row.clientLabel ?? `Client ${row.client_id}`}
      </button>
    ) : null;

  const children: React.ReactNode[] = [
    <span key="prj" style={{ fontFamily: "var(--ncp-mono)", fontSize: 11 }}>
      PRJ-{row.project_id}
    </span>,
  ];
  if (same && hasClient) {
    children.push(<span key="dot-a" style={{ opacity: 0.35 }}>·</span>, clientLink("cl")!);
  } else {
    if (sbu) children.push(<span key="dot-b" style={{ opacity: 0.35 }}>·</span>, <span key="sbu">{sbu}</span>);
    if (hasClient) children.push(<span key="dot-c" style={{ opacity: 0.35 }}>·</span>, clientLink("cl2")!);
  }

  return (
    <p
      className="ncp-subtitle"
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px", marginTop: 6 }}
    >
      {children}
    </p>
  );
}

function ContractDetailSheet({
  open,
  onOpenChange,
  row,
  contracts,
  projects,
  saving,
  canRealise,
  realising,
  onRealise,
  onDelete,
  onSave,
  onMsaUploadComplete,
  goClient,
}: ContractDetailSheetProps) {
  const [editMode, setEditMode] = useState(false);
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<Record<string, string>>({});
  const [platformUsers, setPlatformUsers] = useState<PlatformUserLite[]>([]);
  const [msaUploading, setMsaUploading] = useState(false);
  const [msaErr, setMsaErr] = useState<string | null>(null);
  const msaFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && row) {
      setForm(contractRowToForm(row));
      setEditMode(false);
      setTab(0);
    }
  }, [open, row?.id]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([queries.taskAssignableUsers().catch(() => []), adminApi.listUsers().catch(() => [])]).then(([a, b]) => {
      if (cancelled) return;
      const m = new Map<number, PlatformUserLite>();
      for (const u of a as PlatformUserLite[]) {
        m.set(u.id, { id: u.id, email: u.email, role: u.role });
      }
      for (const u of b as PlatformUserLite[]) {
        if (!m.has(u.id)) m.set(u.id, { id: u.id, email: u.email, role: u.role });
      }
      setPlatformUsers(Array.from(m.values()).sort((x, y) => x.email.localeCompare(y.email)));
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const project = row ? projects.find((p) => p.id === row.project_id) ?? null : null;
  const projHead =
    (project as { project_head?: string | null; practice_head?: string | null } | null)?.project_head
    || (project as { practice_head?: string | null } | null)?.practice_head
    || row?.practice_head_snapshot
    || null;
  const matchedHeadUser = useMemo(
    () => matchHeadUser(project?.project_head_user_id, projHead, platformUsers),
    [project, projHead, platformUsers],
  );

  if (!row) return null;

  const onField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const money = (v: number | null | undefined) => (v != null ? formatCurrency(v) : "—");

  // Computed values
  const acv = row.signed_acv_inr;
  const cm = row.signed_cm_pct;
  const grossMargin = acv && cm ? Math.round(acv * (cm > 1 ? cm / 100 : cm)) : null;
  const mrr = acv ? Math.round(acv / 12) : null;
  const stageLabel =
    CONTRACT_PIPELINE_STAGES.find((s) => s.value === row.pipeline_stage)?.label ??
    row.pipeline_stage ?? "—";
  const statusCls = (() => {
    const s = (row.contract_status || "").toLowerCase();
    if (s.includes("active") || s.includes("live")) return "ncp-st-active";
    if (s.includes("pend") || s.includes("draft")) return "ncp-st-pending";
    return "ncp-st-inactive";
  })();
  const durationMonths = (() => {
    const s = parseDay(row.contract_start_date);
    const e = parseDay(row.contract_end_date);
    if (!s || !e) return null;
    return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  })();
  const daysLeft = daysUntilEnd(row.contract_end_date);

  // Project info
  const tags = [
    project?.hierarchy_tag_bu,
    project?.hierarchy_tag_sbu,
    project?.hierarchy_tag_sbg,
    project?.hierarchy_tag_sbe,
  ].filter(Boolean) as string[];

  // Distinct options from existing contracts
  const renewalOptions = Array.from(
    new Set(["Auto-renew", "Manual review", "In negotiation", "Do not renew",
      ...contracts.map((c) => c.renewal_status ?? "").filter(Boolean)])
  ).sort();
  const pricingOptions = Array.from(
    new Set(contracts.map((c) => c.pricing_model ?? "").filter(Boolean))
  ).sort();
  const accountTypeOptions = Array.from(
    new Set(["RPO", "Staff Augmentation", "Managed Services", "Project-based", "Retainer",
      ...contracts.map((c) => c.account_type ?? "").filter(Boolean)])
  ).sort();

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const propRow = (label: string, value: React.ReactNode, noBorder?: boolean) => {
    const hasVal = value !== null && value !== undefined && value !== "" && value !== "—";
    return (
      <div className="ncp-prop-row" style={noBorder ? { borderTop: "none" } : undefined}>
        <div className="ncp-prop-label">{label}</div>
        <div style={{ flex: 1, fontSize: 14, color: hasVal ? "var(--ncp-text-primary)" : "var(--ncp-text-muted)", paddingTop: 2, paddingBottom: 2, whiteSpace: "pre-wrap" }}>
          {value ?? "—"}
        </div>
      </div>
    );
  };
  const editRow = (label: string, key: string, type: "text" | "date" | "number" = "text", placeholder?: string) => (
    <div className="ncp-prop-row">
      <div className="ncp-prop-label">{label}</div>
      <input className="ncp-prop-input" type={type === "number" ? "text" : type}
        inputMode={type === "number" ? "decimal" : undefined} placeholder={placeholder}
        value={form[key] ?? ""} onChange={(e) => onField(key, e.target.value)} />
    </div>
  );
  const editArea = (label: string, key: string, rows = 2) => (
    <div className="ncp-prop-row">
      <div className="ncp-prop-label">{label}</div>
      <textarea className="ncp-prop-input" rows={rows}
        value={form[key] ?? ""} onChange={(e) => onField(key, e.target.value)} />
    </div>
  );
  const editSelect = (label: string, key: string, opts: string[], emptyLabel = "—") => (
    <div className="ncp-prop-row">
      <div className="ncp-prop-label">{label}</div>
      <select className="ncp-prop-input" value={form[key] ?? ""} onChange={(e) => onField(key, e.target.value)}>
        <option value="">{emptyLabel}</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
  const editTri = (label: string, key: string) => (
    <div className="ncp-prop-row">
      <div className="ncp-prop-label">{label}</div>
      <select className="ncp-prop-input" value={form[key] ?? ""} onChange={(e) => onField(key, e.target.value)}>
        <option value="">—</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </div>
  );

  const msaFilenames = useMemo(() => sortMsaFilenamesNewestFirst(parseSowMsaFilenames(row.sow_msa_reference)), [row.sow_msa_reference]);
  const msaProjectId = row.project_id;

  function msaErrFromCatch(e: unknown, fallback: string): string {
    let msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : fallback;
    const status =
      e && typeof e === "object" && "response" in e
        ? (e as { response?: { status?: number } }).response?.status
        : undefined;
    if (status === 403 || /access denied/i.test(msg)) {
      msg = `${msg} If this is wrong, ask an admin to assign you to project PRJ-${msaProjectId}.`;
    }
    return msg;
  }

  async function onMsaUpload(file: File | null) {
    if (!file || !row) return;
    const cid = row.id;
    setMsaErr(null);
    setMsaUploading(true);
    try {
      await queries.uploadContractMSA(cid, file);
      const updated = await queries.contract(cid);
      onMsaUploadComplete(updated);
      onField("sow_msa_reference", updated.sow_msa_reference ?? "");
    } catch (e: unknown) {
      setMsaErr(msaErrFromCatch(e, "Upload failed"));
    } finally {
      setMsaUploading(false);
      if (msaFileRef.current) msaFileRef.current.value = "";
    }
  }

  async function onDownloadMsa(storedBasename: string) {
    if (!row || !storedBasename) return;
    const cid = row.id;
    setMsaErr(null);
    try {
      const res = await api.get(`contracts/${cid}/msa-document`, {
        params: { f: storedBasename },
        responseType: "blob",
      });
      const dispo = res.headers["content-disposition"] as string | undefined;
      let name = displayMsaStoredName(storedBasename);
      const m = dispo && /filename\*?=(?:UTF-8''|")?([^";\n]+)/i.exec(dispo);
      if (m?.[1]) name = decodeURIComponent(m[1].replace(/"/g, "").trim());
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setMsaErr(msaErrFromCatch(e, "Download failed"));
    }
  }

  async function handleSave() {
    await onSave(form);
    setEditMode(false);
  }

  // ── Tab panels ───────────────────────────────────────────────────────────────
  const TAB_0 = (
    <div className="ncp-panel ncp-panel-active">
      {/* Project card */}
      <div className="ncp-section" style={{ marginBottom: 12 }}>
        <div className="ncp-section-header" style={{ cursor: "default" }}>
          <div className="ncp-section-icon ncp-orange">◇</div>
          <div>
            <div className="ncp-section-label">Project</div>
            <div className="ncp-section-desc">Linked PRJ, hierarchy tags, project head</div>
          </div>
        </div>
        <div className="ncp-section-body" style={{ maxHeight: 320 }}>
          {propRow("PRJ", <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 13 }}>PRJ-{row.project_id} · {row.sbuLabel || "—"}</span>, true)}
          {row.client_id != null && propRow("Legal client",
            <button type="button" style={{ background: "none", border: "none", color: "var(--ncp-accent)", cursor: "pointer", padding: 0, fontSize: 14, fontFamily: "var(--ncp-font)", textDecoration: "underline" }}
              onClick={() => { onOpenChange(false); goClient(row.client_id); }}>
              {row.clientLabel ?? `Client ${row.client_id}`}
            </button>
          )}
          {projHead && propRow("Project head", <ProjectHeadBadge headLabel={projHead} matchedUser={matchedHeadUser} />)}
          {tags.length > 0 && propRow("Org tags",
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {tags.map((t) => (
                <span key={t} style={{ fontSize: 11, fontFamily: "var(--ncp-mono)", background: "var(--ncp-accent-soft)", color: "var(--ncp-accent)", border: "1px solid var(--ncp-accent-mid)", borderRadius: 999, padding: "2px 9px" }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Pipeline & Identity */}
      <div className="ncp-section" style={{ marginBottom: 12 }}>
        <div className="ncp-section-header" style={{ cursor: "default" }}>
          <div className="ncp-section-icon ncp-orange">⏱</div>
          <div>
            <div className="ncp-section-label">Pipeline &amp; Identity</div>
            <div className="ncp-section-desc">Stage, classification, practice head</div>
          </div>
        </div>
        <div className="ncp-section-body" style={{ maxHeight: 520 }}>
          {editMode ? (
            <>
              <div className="ncp-prop-row" style={{ borderTop: "none" }}>
                <div className="ncp-prop-label">Pipeline stage</div>
                <select className="ncp-prop-input" value={form.pipeline_stage || "discovery"} onChange={(e) => onField("pipeline_stage", e.target.value)}>
                  {CONTRACT_PIPELINE_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              {editRow("Customer name", "customer_name")}
              {editSelect("Account / contract type", "account_type", accountTypeOptions)}
              {editRow("Practice head", "practice_head_snapshot")}
              {editSelect("Renewal status", "renewal_status", renewalOptions)}
            </>
          ) : (
            <>
              {propRow("Pipeline stage", stageLabel, true)}
              {propRow("Customer name", row.customer_name)}
              {propRow("Account / type", row.account_type)}
              {propRow("Practice head", row.practice_head_snapshot)}
              {propRow("Renewal status", row.renewal_status)}
            </>
          )}
        </div>
      </div>
    </div>
  );

  const TAB_1 = (
    <div className="ncp-panel ncp-panel-active">
      {/* Visual date range card */}
      {!editMode && (
        <div style={{ display: "flex", alignItems: "stretch", gap: 0, background: "var(--ncp-surface)", border: "1px solid var(--ncp-border)", borderRadius: "var(--ncp-radius-lg)", marginBottom: 16, overflow: "hidden" }}>
          {[
            { label: "Start", val: fmtDatePretty(row.contract_start_date), mono: row.contract_start_date?.slice(0, 10) },
            { label: "End / renewal", val: fmtDatePretty(row.contract_end_date), mono: row.contract_end_date?.slice(0, 10) },
          ].map((d, i) => (
            <div key={d.label} style={{ flex: 1, padding: "18px 18px 14px", borderLeft: i > 0 ? "1px solid var(--ncp-border)" : undefined }}>
              <div className="ncp-micro-label" style={{ marginBottom: 6 }}>{d.label}</div>
              <div style={{ fontSize: 17, fontWeight: 500, color: "var(--ncp-text-primary)", letterSpacing: "-0.3px" }}>{d.val}</div>
              {d.mono && <div style={{ fontSize: 10, color: "var(--ncp-text-muted)", fontFamily: "var(--ncp-mono)", marginTop: 3 }}>{d.mono}</div>}
            </div>
          ))}
          <div style={{ padding: "18px 18px 14px", textAlign: "center", minWidth: 96, borderLeft: "1px solid var(--ncp-border)", background: "var(--ncp-surface-hover)" }}>
            <div className="ncp-micro-label" style={{ marginBottom: 6 }}>Duration</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ncp-accent)", letterSpacing: "-0.5px" }}>
              {durationMonths ?? row.duration_months ?? "—"}
            </div>
            <div style={{ fontSize: 10, color: "var(--ncp-text-muted)", fontFamily: "var(--ncp-mono)" }}>months</div>
          </div>
        </div>
      )}
      {daysLeft != null && !editMode && (
        <div style={{ padding: "9px 14px", background: daysLeft < 0 ? "rgba(239,68,68,0.07)" : daysLeft <= 30 ? "rgba(245,158,11,0.08)" : "var(--ncp-surface)", border: `1px solid ${daysLeft < 0 ? "rgba(239,68,68,0.25)" : daysLeft <= 30 ? "rgba(245,158,11,0.3)" : "var(--ncp-border)"}`, borderRadius: "var(--ncp-radius)", marginBottom: 14, fontSize: 13, color: daysLeft < 0 ? "#b91c1c" : daysLeft <= 30 ? "#92400e" : "var(--ncp-text-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
          <span>{daysLeft < 0 ? "⚠" : daysLeft <= 30 ? "⏰" : "ℹ"}</span>
          <span>{daysLeft < 0 ? `Expired ${Math.abs(daysLeft)} days ago` : daysLeft === 0 ? "Expires today" : `${daysLeft} days until renewal`}</span>
        </div>
      )}
      <div className="ncp-section" style={{ marginBottom: 12 }}>
        <div className="ncp-section-header" style={{ cursor: "default" }}>
          <div className="ncp-section-icon ncp-blue">📅</div>
          <div>
            <div className="ncp-section-label">Date fields</div>
            <div className="ncp-section-desc">Reminder and manual overrides</div>
          </div>
        </div>
        <div className="ncp-section-body" style={{ maxHeight: 400 }}>
          {editMode ? (
            <>
              <div className="ncp-date-grid">
                <div className="ncp-date-cell">
                  <label>Contract start</label>
                  <input type="date" value={form.contract_start_date} onChange={(e) => onField("contract_start_date", e.target.value)} />
                </div>
                <div className="ncp-date-cell">
                  <label>Contract end / renewal</label>
                  <input type="date" value={form.contract_end_date} onChange={(e) => onField("contract_end_date", e.target.value)} />
                </div>
              </div>
              {editRow("Renewal reminder", "renewal_reminder_date", "date")}
              {editRow("Duration (months override)", "duration_months", "number")}
            </>
          ) : (
            <>
              {propRow("Renewal reminder", fmtDatePretty(row.renewal_reminder_date), true)}
              {propRow("Duration (months)", row.duration_months != null ? `${row.duration_months} months` : durationMonths != null ? `${durationMonths} months (computed)` : null)}
            </>
          )}
        </div>
      </div>
    </div>
  );

  const TAB_2 = (
    <div className="ncp-panel ncp-panel-active">
      {!editMode && acv != null && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Signed ACV", val: money(acv), sub: "" },
            { label: "Gross margin", val: grossMargin != null ? formatCurrency(grossMargin) : "—", sub: fmtCmPct(row.signed_cm_pct) },
            { label: "Monthly run rate", val: mrr != null ? formatCurrency(mrr) : "—", sub: "per month" },
            { label: "Est. annual value", val: money(row.est_annual_value_inr), sub: "" },
          ].map(({ label, val, sub }) => (
            <div key={label} style={{ background: "var(--ncp-surface)", border: "1px solid var(--ncp-border)", borderRadius: "var(--ncp-radius)", padding: "14px 16px" }}>
              <div className="ncp-micro-label" style={{ marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 17, fontWeight: 600, fontFamily: "var(--ncp-mono)", color: "var(--ncp-text-primary)" }}>{val}</div>
              {sub && <div style={{ fontSize: 11, color: "var(--ncp-text-muted)", marginTop: 2 }}>{sub}</div>}
            </div>
          ))}
        </div>
      )}
      <div className="ncp-section">
        <div className="ncp-section-header" style={{ cursor: "default" }}>
          <div className="ncp-section-icon ncp-green">₹</div>
          <div>
            <div className="ncp-section-label">Commercial details</div>
            <div className="ncp-section-desc">Pricing, rate, and payment terms</div>
          </div>
        </div>
        <div className="ncp-section-body" style={{ maxHeight: 560 }}>
          {editMode ? (
            <>
              <div className="ncp-commercial-row">
                <div className="ncp-amount-wrap">
                  <label>Signed ACV</label>
                  <div className="ncp-amount-row">
                    <span className="ncp-currency-badge">₹</span>
                    <input type="text" inputMode="decimal" placeholder="0" value={form.signed_acv_inr} onChange={(e) => onField("signed_acv_inr", e.target.value)} />
                  </div>
                </div>
                <div className="ncp-amount-wrap">
                  <label>Signed CM%</label>
                  <div className="ncp-amount-row">
                    <span className="ncp-currency-badge">%</span>
                    <input type="text" inputMode="decimal" placeholder="0.32 or 32" value={form.signed_cm_pct} onChange={(e) => onField("signed_cm_pct", e.target.value)} />
                  </div>
                </div>
              </div>
              {editRow("Agreed rate / fee", "agreed_rate_fee_inr", "number")}
              {editRow("Est. annual value", "est_annual_value_inr", "number")}
              {editRow("Revenue run rate / mo", "revenue_run_rate_inr", "number")}
              {editSelect("Pricing model", "pricing_model", pricingOptions)}
              {editArea("Payment terms", "payment_terms", 2)}
            </>
          ) : (
            <>
              {propRow("Signed ACV", acv != null ? money(acv) : null, true)}
              {propRow("Signed CM%", fmtCmPct(row.signed_cm_pct))}
              {propRow("Agreed rate / fee", money(row.agreed_rate_fee_inr))}
              {propRow("Revenue run rate / mo", money(row.revenue_run_rate_inr))}
              {propRow("Pricing model", row.pricing_model)}
              {propRow("Payment terms", row.payment_terms)}
            </>
          )}
        </div>
      </div>
    </div>
  );

  const TAB_3 = (
    <div className="ncp-panel ncp-panel-active">
      <div className="ncp-section">
        <div className="ncp-section-header" style={{ cursor: "default" }}>
          <div className="ncp-section-icon ncp-blue">📊</div>
          <div>
            <div className="ncp-section-label">Delivery &amp; sources</div>
            <div className="ncp-section-desc">Headcount, positions, source mix</div>
          </div>
        </div>
        <div className="ncp-section-body" style={{ maxHeight: 560 }}>
          {editMode ? (
            <>
              <div className="ncp-commercial-row">
                <div className="ncp-amount-wrap">
                  <label>HC contracted</label>
                  <div className="ncp-amount-row">
                    <input type="text" inputMode="decimal" value={form.headcount_contracted} onChange={(e) => onField("headcount_contracted", e.target.value)} />
                  </div>
                </div>
                <div className="ncp-amount-wrap">
                  <label>Hiring volume</label>
                  <div className="ncp-amount-row">
                    <input type="text" inputMode="decimal" value={form.hiring_volume} onChange={(e) => onField("hiring_volume", e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="ncp-commercial-row">
                <div className="ncp-amount-wrap">
                  <label>Positions contracted</label>
                  <div className="ncp-amount-row">
                    <input type="text" inputMode="numeric" value={form.positions_contracted} onChange={(e) => onField("positions_contracted", e.target.value)} />
                  </div>
                </div>
                <div className="ncp-amount-wrap">
                  <label>Positions filled</label>
                  <div className="ncp-amount-row">
                    <input type="text" inputMode="numeric" value={form.positions_filled} onChange={(e) => onField("positions_filled", e.target.value)} />
                  </div>
                </div>
              </div>
              {editRow("Taggd source mix", "taggd_source_mix")}
              {editRow("Other source mix", "other_source_mix")}
              {editRow("Overall RPH", "overall_rph", "number")}
              {editTri("MMF applicable", "mmf_applicable")}
              {editTri("Opening fee applicable", "opening_fee_applicable")}
            </>
          ) : (
            <>
              {propRow("Headcount contracted", row.headcount_contracted, true)}
              {propRow("Hiring volume", row.hiring_volume)}
              {propRow("Positions contracted", row.positions_contracted)}
              {propRow("Positions filled", row.positions_filled)}
              {(row.positions_contracted != null || row.positions_filled != null) &&
                propRow("Fill rate", `${row.positions_filled ?? 0} / ${row.positions_contracted ?? "?"} filled`)}
              {propRow("Taggd source mix", row.taggd_source_mix)}
              {propRow("Other source mix", row.other_source_mix)}
              {propRow("Overall RPH", row.overall_rph)}
              {propRow("MMF applicable", triBoolLabel(row.mmf_applicable))}
              {propRow("Opening fee", triBoolLabel(row.opening_fee_applicable))}
            </>
          )}
        </div>
      </div>
    </div>
  );

  const TAB_4 = (
    <div className="ncp-panel ncp-panel-active">
      <div className="ncp-section" style={{ marginBottom: 12 }}>
        <div className="ncp-section-header" style={{ cursor: "default" }}>
          <div className="ncp-section-icon ncp-amber">⚖</div>
          <div>
            <div className="ncp-section-label">Legal &amp; SLA</div>
            <div className="ncp-section-desc">SOW, SLA terms, sign-off, remarks</div>
          </div>
        </div>
        <div className="ncp-section-body" style={{ maxHeight: 560 }}>
          {editMode ? (
            <>
              {editRow("SOW / MSA reference", "sow_msa_reference")}
              {editArea("SLA terms summary", "sla_terms_summary", 3)}
              {editRow("Client sign-off authority", "client_signoff_authority")}
              {editArea("Reason for lapse / loss", "reason_for_lapse", 2)}
              {editArea("Contract detail / scope", "contract_detail", 3)}
              {editArea("Remarks", "remarks", 2)}
            </>
          ) : (
            <>
              {propRow("SOW / MSA", row.sow_msa_reference, true)}
              {propRow("SLA summary", row.sla_terms_summary)}
              {propRow("Client sign-off", row.client_signoff_authority)}
              {propRow("Reason for lapse", row.reason_for_lapse)}
              {propRow("Detail / scope", row.contract_detail)}
              {propRow("Remarks", row.remarks)}
            </>
          )}
        </div>
      </div>
      <div className="ncp-section">
        <div className="ncp-section-header" style={{ cursor: "default" }}>
          <div className="ncp-section-icon" style={{ background: "var(--ncp-surface-hover)" }}>📁</div>
          <div>
            <div className="ncp-section-label">Provenance</div>
            <div className="ncp-section-desc">Import source and contract documents</div>
          </div>
        </div>
        <div className="ncp-section-body" style={{ maxHeight: 400 }}>
          {(row.source_filename || row.uploaded_by) && (
            <>
              {propRow("Source file", row.source_filename, true)}
              {propRow("Uploaded by", row.uploaded_by)}
            </>
          )}
          {!row.source_filename && !row.uploaded_by && (
            <p className="ncp-hint" style={{ margin: "0 0 10px" }}>
              No import workbook is linked to this row. Bulk import still runs from the <strong>Import workbook</strong> tab.
            </p>
          )}
          <div
            style={{
              borderTop: "1px solid var(--ncp-border)",
              marginTop: row.source_filename || row.uploaded_by ? 4 : 0,
              paddingTop: 10,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ncp-text-secondary)", marginBottom: 8 }}>
              Contract sheet / MSA
            </div>
            <p className="ncp-hint" style={{ margin: "0 0 8px" }}>
              PDF, Word, Excel, or an image. Each upload is kept; “SOW / MSA reference” lists every stored file (newest first).
            </p>
            {msaFilenames.length > 0 && (
              <ul className="ncp-hint" style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 13, color: "var(--ncp-text-primary)" }}>
                {msaFilenames.map((fn) => (
                  <li key={fn} style={{ marginBottom: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                    <span style={{ flex: "1 1 140px", minWidth: 0, wordBreak: "break-all", fontFamily: "var(--ncp-mono)", fontSize: 12 }}>
                      {displayMsaStoredName(fn)}
                    </span>
                    <button type="button" className="ncp-btn ncp-btn-ghost" style={{ flexShrink: 0 }} onClick={() => void onDownloadMsa(fn)}>
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <input
                ref={msaFileRef}
                type="file"
                accept=".pdf,.doc,.docx,.xlsx,.xls,.png,.jpg,.jpeg"
                className="sr-only"
                disabled={msaUploading}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  void onMsaUpload(f);
                }}
              />
              <button
                type="button"
                className="ncp-btn ncp-btn-secondary"
                disabled={msaUploading}
                onClick={() => msaFileRef.current?.click()}
              >
                {msaUploading ? "Uploading…" : "Upload file…"}
              </button>
            </div>
            {msaErr && (
              <div
                className="ncp-hint"
                style={{ marginTop: 8, color: "var(--ncp-amber, #b45309)", fontSize: 12 }}
                role="alert"
              >
                {msaErr}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const PANELS = [TAB_0, TAB_1, TAB_2, TAB_3, TAB_4];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
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
        <div className="new-contract-sheet flex min-h-0 flex-1 flex-col">
          <div className="ncp-scroll min-h-0 flex-1">
            <div className="ncp-page">
              {/* ── Header ──────────────────────────────────────────────── */}
              <div className="ncp-header">
                <div style={{ minWidth: 0 }}>
                  <div className="ncp-breadcrumb">
                    <span>Portfolio</span>
                    <span className="ncp-breadcrumb-sep">›</span>
                    <span>Contracts</span>
                    <span className="ncp-breadcrumb-sep">›</span>
                    <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 10 }}>CNT-{row.id}</span>
                  </div>
                  <h1 className="ncp-h1">{row.customer_name || "Contract"}</h1>
                  <ContractSubtitle
                    row={row}
                    onClientNav={() => {
                      onOpenChange(false);
                      goClient(row.client_id);
                    }}
                  />
                </div>
                <button type="button" className="ncp-close-btn" aria-label="Close" onClick={() => onOpenChange(false)}>✕</button>
              </div>

              {/* ── At-a-glance bar ──────────────────────────────────────── */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--ncp-surface)", border: "1px solid var(--ncp-border)", borderRadius: "var(--ncp-radius-lg)", marginBottom: 14 }}>
                {editMode ? (
                  <select className={cn("ncp-status-pill", statusCls)} value={form.contract_status} onChange={(e) => onField("contract_status", e.target.value)}>
                    {["Active", "Pending", "Inactive", "renewed", "expired"].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : (
                  row.contract_status ? <span className={cn("ncp-status-pill", statusCls)}>{row.contract_status}</span> : null
                )}
                <span style={{ fontSize: 11, fontFamily: "var(--ncp-mono)", background: "var(--ncp-accent-soft)", color: "var(--ncp-accent)", border: "1px solid var(--ncp-accent-mid)", borderRadius: 999, padding: "3px 10px" }}>{stageLabel}</span>
                <span style={{ flex: 1 }} />
                {acv != null && (
                  <span style={{ fontSize: 13, fontFamily: "var(--ncp-font)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    ACV {money(acv)}
                  </span>
                )}
                {projHead && (
                  <ProjectHeadBadge headLabel={projHead} matchedUser={matchedHeadUser} compact />
                )}
              </div>

              {/* ── Horizontal tabs ───────────────────────────────────────── */}
              <div className="ncp-steps" role="tablist" style={{ marginBottom: 18 }}>
                {DETAIL_TABS.map(({ icon, label }, i) => (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    aria-selected={tab === i}
                    className={cn("ncp-step", tab === i && "ncp-active")}
                    onClick={() => setTab(i)}
                  >
                    <span className="ncp-step-num" style={{ fontSize: 14, background: tab === i ? "rgba(255,255,255,0.22)" : "var(--ncp-border)" }}>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Active panel ─────────────────────────────────────────── */}
              {PANELS[tab]}
            </div>
          </div>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <div className="ncp-footer">
            {editMode ? (
              <>
                <button type="button" className="ncp-btn ncp-btn-ghost" disabled={saving}
                  onClick={() => { setForm(contractRowToForm(row)); setEditMode(false); }}>
                  ← Cancel
                </button>
                <button type="button" className="ncp-btn ncp-btn-primary" disabled={saving} onClick={() => void handleSave()}>
                  {saving ? "Saving…" : "Save changes ✓"}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="ncp-btn ncp-btn-ghost"
                  style={{ color: "var(--ncp-text-muted)", borderColor: "rgba(239,68,68,0.35)" }}
                  onClick={() => void onDelete()}>
                  Delete
                </button>
                <div style={{ display: "flex", gap: 8 }}>
                  {canRealise && (
                    <button type="button" className="ncp-btn ncp-btn-secondary" disabled={realising} onClick={() => void onRealise()}>
                      {realising ? "Working…" : "Realise client"}
                    </button>
                  )}
                  <button type="button" className="ncp-btn ncp-btn-primary" onClick={() => setEditMode(true)}>
                    Edit
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ReadonlyContractDetails({ row }: { row: EnrichedContract }) {
  const line = (label: string, children: React.ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, fontSize: 12, alignItems: "start" }}>
      <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{label}</span>
      <span>{children ?? "—"}</span>
    </div>
  );
  const money = (v: number | null | undefined) => (v != null ? formatCurrency(v) : "—");
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Pipeline</div>
      {line(
        "Stage",
        row.pipeline_stage
          ? CONTRACT_PIPELINE_STAGES.find((s) => s.value === row.pipeline_stage)?.label ?? row.pipeline_stage
          : "—",
      )}
      <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>Identity</div>
      {line("Account / type", row.account_type)}
      {line("Practice head", row.practice_head_snapshot)}
      {line("Renewal status", row.renewal_status)}
      <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>Dates</div>
      {line(
        "Term",
        <>
          {row.contract_start_date?.slice(0, 10) ?? "—"} → {row.contract_end_date?.slice(0, 10) ?? "—"}
        </>,
      )}
      {line("Reminder", row.renewal_reminder_date?.slice(0, 10))}
      {line("Duration (mo)", row.duration_months)}
      <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>Commercial</div>
      {line("Signed ACV", money(row.signed_acv_inr))}
      {line("Signed CM%", fmtCmPct(row.signed_cm_pct))}
      {line("Agreed rate / fee", money(row.agreed_rate_fee_inr))}
      {line("Est. annual value", money(row.est_annual_value_inr))}
      {line("Run rate / mo", money(row.revenue_run_rate_inr))}
      {line("Pricing model", row.pricing_model)}
      {line("Payment terms", <span style={{ whiteSpace: "pre-wrap" }}>{row.payment_terms}</span>)}
      <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>Delivery</div>
      {line("Headcount", row.headcount_contracted)}
      {line("Hiring volume", row.hiring_volume)}
      {line("Positions", `${row.positions_filled ?? "—"} / ${row.positions_contracted ?? "—"} filled / contracted`)}
      {line("Taggd mix", row.taggd_source_mix)}
      {line("Other mix", row.other_source_mix)}
      {line("Overall RPH", row.overall_rph)}
      {line("MMF", triBoolLabel(row.mmf_applicable))}
      {line("Opening fee", triBoolLabel(row.opening_fee_applicable))}
      <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>Legal &amp; SLA</div>
      {line("SOW / MSA", row.sow_msa_reference)}
      {line("SLA summary", <span style={{ whiteSpace: "pre-wrap" }}>{row.sla_terms_summary}</span>)}
      {line("Client sign-off", row.client_signoff_authority)}
      {line("Lapse / loss", <span style={{ whiteSpace: "pre-wrap" }}>{row.reason_for_lapse}</span>)}
      {line("Detail", <span style={{ whiteSpace: "pre-wrap" }}>{row.contract_detail}</span>)}
      {line("Remarks", <span style={{ whiteSpace: "pre-wrap" }}>{row.remarks}</span>)}
      {(row.source_filename || row.uploaded_by) && (
        <>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>Provenance</div>
          {line("Source file", row.source_filename)}
          {line("Uploaded by", row.uploaded_by)}
        </>
      )}
    </div>
  );
}

export function ClientContracts() {
  const navigate = useNavigate();
  const contractWorkbookImportId = React.useId();
  const [tab, setTab] = useState("Portfolio");
  const [contracts, setContracts] = useState<ProjectContractRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<EnrichedContract | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [createProjectId, setCreateProjectId] = useState<string>("");
  const [createForm, setCreateForm] = useState<Record<string, string>>(() => emptyContractForm());
  const [createProspectName, setCreateProspectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [realising, setRealising] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p, cl] = await Promise.all([queries.contractsList(), queries.projects(), queries.clients()]);
      setContracts(c);
      setProjects(p);
      setClientGroups(cl);
      return { contracts: c, projects: p, clientGroups: cl };
    } catch {
      setContracts([]);
      setProjects([]);
      setClientGroups([]);
      return { contracts: [] as ProjectContractRow[], projects: [] as Project[], clientGroups: [] as ClientGroup[] };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const projectById = useMemo(() => {
    const m = new Map<number, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const clientNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of clientGroups) m.set(g.id, g.official_name);
    return m;
  }, [clientGroups]);

  const clientLifecycleById = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of clientGroups) {
      m.set(g.id, (g.lifecycle_state ?? "active").toLowerCase());
    }
    return m;
  }, [clientGroups]);

  /** Contracts included in KPI strip (and renewal radar / ACV roll-ups when a status chip is selected). */
  const contractsForKpis = useMemo(() => {
    if (statusFilter === "all") return contracts;
    const want = statusFilter.toLowerCase();
    return contracts.filter((c) => normStatus(c.contract_status) === want);
  }, [contracts, statusFilter]);

  const enriched: EnrichedContract[] = useMemo(() => {
    return contracts.map((c) => {
      const pr = projectById.get(c.project_id);
      const sbu =
        (pr?.engagement_name && String(pr.engagement_name).trim()) ||
        (pr?.account_name && String(pr.account_name).trim()) ||
        `PRJ-${c.project_id}`;
      const cl =
        c.client_id != null ? clientNameById.get(c.client_id) ?? null : null;
      return { ...c, sbuLabel: sbu, clientLabel: cl };
    });
  }, [contracts, projectById, clientNameById]);

  const kpis = useMemo(() => {
    let active = 0;
    let renewed = 0;
    let expired = 0;
    let totalAcv = 0;
    let expiring90 = 0;
    let overdue = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const c of contractsForKpis) {
      const st = normStatus(c.contract_status);
      if (st === "active") active++;
      else if (st === "renewed") renewed++;
      else if (st === "expired") expired++;
      if (c.signed_acv_inr != null) totalAcv += c.signed_acv_inr;
      const du = daysUntilEnd(c.contract_end_date);
      if (du != null && du >= 0 && du <= 90) expiring90++;
      const end = parseDay(c.contract_end_date);
      if (end && end < today && st !== "renewed") overdue++;
    }
    return {
      total: contractsForKpis.length,
      active,
      renewed,
      expired,
      totalAcv,
      expiring90,
      overdue,
    };
  }, [contractsForKpis]);

  const canRealiseActiveContract = useMemo(() => {
    if (!activeRow || activeRow.client_id == null) return false;
    if (clientLifecycleById.get(activeRow.client_id) !== "prospect") return false;
    const ps = (activeRow.pipeline_stage || "").toLowerCase();
    return ps === "signed" || ps === "active_client";
  }, [activeRow, clientLifecycleById]);

  const filteredPortfolio = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((c) => {
      if (statusFilter !== "all" && normStatus(c.contract_status) !== statusFilter.toLowerCase()) {
        return false;
      }
      if (!q) return true;
      return (
        (c.customer_name || "").toLowerCase().includes(q) ||
        c.sbuLabel.toLowerCase().includes(q) ||
        (c.clientLabel || "").toLowerCase().includes(q) ||
        String(c.project_id).includes(q) ||
        (c.account_type || "").toLowerCase().includes(q)
      );
    });
  }, [enriched, search, statusFilter]);

  const renewalsSorted = useMemo(() => {
    const rows = [...enriched].filter((c) => c.contract_end_date);
    rows.sort((a, b) => {
      const da = parseDay(a.contract_end_date)?.getTime() ?? 0;
      const db = parseDay(b.contract_end_date)?.getTime() ?? 0;
      return da - db;
    });
    return rows;
  }, [enriched]);

  function openDetail(row: EnrichedContract) {
    setActiveRow(row);
    setEditMode(false);
    setForm(contractRowToForm(row));
    setDetailOpen(true);
  }

  function openCreateDialog() {
    setCreateForm(() => {
      const f = emptyContractForm();
      f.contract_status = "Active";
      f.pipeline_stage = "discovery";
      return f;
    });
    setCreateProjectId("");
    setCreateProspectName("");
    setCreateOpen(true);
  }

  async function savePatch(formData?: Record<string, string>) {
    if (!activeRow) return;
    setSaving(true);
    try {
      const body = formToContractPayload(formData ?? form);
      const updated = await queries.patchContract(activeRow.id, body);
      setContracts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      const pr = projectById.get(updated.project_id);
      const sbu =
        (pr?.engagement_name && String(pr.engagement_name).trim()) ||
        (pr?.account_name && String(pr.account_name).trim()) ||
        `PRJ-${updated.project_id}`;
      const cl =
        updated.client_id != null ? clientNameById.get(updated.client_id) ?? null : null;
      setActiveRow({ ...updated, sbuLabel: sbu, clientLabel: cl });
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Save failed";
      alert(msg);
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function removeContract() {
    if (!activeRow) return;
    if (!window.confirm(`Delete contract #${activeRow.id} for ${activeRow.customer_name ?? "this account"}?`)) return;
    try {
      await queries.deleteContract(activeRow.id);
      setDetailOpen(false);
      setActiveRow(null);
      refresh();
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Delete failed";
      alert(msg);
    }
  }

  async function onUpload(f: File | null) {
    if (!f) return;
    setUploading(true);
    setUploadMsg(null);
    setUploadErr(null);
    try {
      const r = await queries.uploadContractsWorkbook(f);
      setUploadMsg(
        `Imported ${r.created} row(s); skipped ${r.skipped}. ${r.missing_customer_no_project?.length ? `Unmatched customers: ${r.missing_customer_no_project.join(", ")}` : ""}`,
      );
      refresh();
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Upload failed";
      setUploadErr(msg);
    } finally {
      setUploading(false);
    }
  }

  async function submitCreate() {
    const pid = parseInt(createProjectId, 10);
    if (!pid || Number.isNaN(pid)) {
      alert("Choose a project (SBU).");
      return;
    }
    setCreating(true);
    try {
      const payload = formToContractPayload(createForm);
      const pn = createProspectName.trim();
      if (pn) {
        (payload as Record<string, unknown>).prospect_client_official_name = pn;
      }
      await queries.createContract({ project_id: pid, ...payload });
      setCreateOpen(false);
      setCreateProjectId("");
      setCreateProspectName("");
      setCreateForm(emptyContractForm());
      refresh();
      setTab("Portfolio");
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Create failed";
      alert(msg);
    } finally {
      setCreating(false);
    }
  }

  const makeEmptyContractFormCb = useCallback(() => emptyContractForm(), []);

  async function submitClientWithEngagements(bundle: NewContractOrgBundle) {
    setCreating(true);
    try {
      const cl = await queries.createClient({
        official_name: bundle.client.official_name,
        short_code: bundle.client.short_code ?? undefined,
        lifecycle_state: bundle.client.lifecycle_state,
        hierarchy_tag_bu: bundle.client.hierarchy_tag_bu ?? undefined,
        hierarchy_tag_sbu: bundle.client.hierarchy_tag_sbu ?? undefined,
        hierarchy_tag_sbg: bundle.client.hierarchy_tag_sbg ?? undefined,
        hierarchy_tag_sbe: bundle.client.hierarchy_tag_sbe ?? undefined,
      });
      for (const eng of bundle.engagements) {
        const proj = await queries.createClientProject(cl.id, {
          engagement_name: eng.engagement_name,
          hierarchy_tag_bu: eng.hierarchy_tag_bu ?? undefined,
          hierarchy_tag_sbu: eng.hierarchy_tag_sbu ?? undefined,
          hierarchy_tag_sbg: eng.hierarchy_tag_sbg ?? undefined,
          hierarchy_tag_sbe: eng.hierarchy_tag_sbe ?? undefined,
          project_head_user_id: eng.project_head_user_id ?? undefined,
        });
        const payload = formToContractPayload(eng.form);
        const contract = await queries.createContract({ project_id: proj.id, ...payload });
        if (eng.msa_files?.length) {
          for (const f of eng.msa_files) {
            try {
              await queries.uploadContractMSA(contract.id, f);
            } catch {
              console.warn("MSA upload failed for contract", contract.id, f.name);
            }
          }
        }
      }
      setCreateOpen(false);
      setCreateProjectId("");
      setCreateProspectName("");
      setCreateForm(emptyContractForm());
      await refresh();
      setTab("Portfolio");
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Create failed";
      alert(msg);
    } finally {
      setCreating(false);
    }
  }

  async function realiseLegalClient() {
    if (!activeRow) return;
    setRealising(true);
    try {
      await queries.realiseContractClient(activeRow.id);
      const { contracts: clist, projects: plist, clientGroups: cglist } = (await refresh()) ?? {
        contracts: [],
        projects: [],
        clientGroups: [],
      };
      const row = clist.find((x) => x.id === activeRow.id);
      if (row) {
        const pr = plist.find((p) => p.id === row.project_id);
        const sbu =
          (pr?.engagement_name && String(pr.engagement_name).trim()) ||
          (pr?.account_name && String(pr.account_name).trim()) ||
          `PRJ-${row.project_id}`;
        const nm = new Map(cglist.map((g) => [g.id, g.official_name]));
        const cl = row.client_id != null ? nm.get(row.client_id) ?? null : null;
        setActiveRow({ ...row, sbuLabel: sbu, clientLabel: cl });
      }
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Realise failed";
      alert(msg);
    } finally {
      setRealising(false);
    }
  }

  function goClient(clientId: number | null) {
    if (clientId != null) navigate(`/clients/${clientId}`);
  }

  const statusOptions = ["all", "active", "renewed", "expired"];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <PageHeader
          title="Contract management"
          subtitle="Commercial signup, renewals, ACV, and workbook import — scoped to your projects."
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            className="platform-dialog__btn platform-dialog__btn--primary"
            style={{ fontSize: 11, fontFamily: "'DM Mono',monospace" }}
            onClick={() => openCreateDialog()}
          >
            + New contract
          </button>
          <button
            type="button"
            className="platform-dialog__btn"
            style={{ fontSize: 11, fontFamily: "'DM Mono',monospace" }}
            onClick={() => setTab("Import workbook")}
          >
            Import workbook
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={72} />
          ))}
        </div>
      ) : (
        <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <PlatformKpi
            label="Contracts on file"
            value={kpis.total}
            accent="blue"
            subtext={statusFilter === "all" ? "Scoped portfolio" : `Filtered · ${statusFilter}`}
          />
          <PlatformKpi
            label="Active / renewed / expired"
            value={`${kpis.active} / ${kpis.renewed} / ${kpis.expired}`}
            accent="teal"
            subtext={statusFilter === "all" ? "By row status" : "Within filtered rows"}
          />
          <PlatformKpi
            label="Σ Signed ACV"
            value={kpis.totalAcv > 0 ? formatCurrency(kpis.totalAcv) : "—"}
            accent="green"
            subtext={statusFilter === "all" ? "INR from contract rows" : "INR · filtered rows"}
          />
          <PlatformKpi
            label="Renewal radar"
            value={`${kpis.expiring90} ≤90d · ${kpis.overdue} overdue`}
            accent={kpis.overdue > 0 ? "red" : "amber"}
            subtext={statusFilter === "all" ? "End date vs today" : "Filtered contracts only"}
          />
        </div>
        <div
          role="toolbar"
          aria-label="Filter contracts by status"
          style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 2 }}
        >
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Status</span>
          {statusOptions.map((s) => (
            <button
              key={s}
              type="button"
              className={cn("platform-chip", statusFilter === s && "active")}
              style={{ fontSize: 10.5, cursor: "pointer", fontFamily: "'DM Mono',monospace" }}
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        </>
      )}

      <Tabs
        tabs={["Portfolio", "Pipeline", "Renewals & alerts", "Import workbook"]}
        active={tab}
        onChange={setTab}
      />

      {tab === "Portfolio" && (
        <PlatformSection title="All contracts" action="Refresh" onAction={refresh}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12, alignItems: "center" }}>
            <input
              className="platform-search"
              placeholder="Search customer, SBU, legal client, PRJ…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: "1 1 220px", maxWidth: 360, minWidth: 180 }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg2)",
                color: "var(--text)",
                fontSize: 11,
                fontFamily: "'DM Mono',monospace",
              }}
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="platform-table-wrap" style={{ overflowX: "auto" }}>
            <table className="platform-table" style={{ minWidth: 1480 }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Customer</th>
                  <th>SBU / project</th>
                  <th>Legal client</th>
                  <th>Type</th>
                  <th>Practice head</th>
                  <th>Pipeline</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Reminder</th>
                  <th>Mo</th>
                  <th>Pos (f/c)</th>
                  <th>ACV</th>
                  <th>CM%</th>
                  <th>Agreed fee</th>
                  <th>Est. annual</th>
                  <th>Run / mo</th>
                  <th>Pricing</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={19} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && filteredPortfolio.length === 0 && (
                  <tr>
                    <td colSpan={19} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
                      No contracts yet. Import the workbook or create a row.
                    </td>
                  </tr>
                )}
                {!loading &&
                  filteredPortfolio.map((c) => {
                    const du = daysUntilEnd(c.contract_end_date);
                    const warn = du != null && du < 0 ? "expired" : du != null && du <= 30 ? "soon" : null;
                    return (
                      <tr
                        key={c.id}
                        style={{ cursor: "pointer" }}
                        onClick={() => openDetail(c)}
                      >
                        <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--accent)" }}>{c.id}</td>
                        <td style={{ fontWeight: 600 }}>{c.customer_name ?? "—"}</td>
                        <td style={{ fontSize: 11 }}>
                          <span style={{ fontFamily: "'DM Mono',monospace", color: "var(--text-muted)" }}>PRJ-{c.project_id}</span>
                          {" · "}
                          {c.sbuLabel}
                        </td>
                        <td>
                          {c.client_id != null ? (
                            <button
                              type="button"
                              className="text-left underline-offset-2 hover:underline"
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--accent)",
                                cursor: "pointer",
                                fontSize: 11,
                                padding: 0,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                goClient(c.client_id);
                              }}
                            >
                              {c.clientLabel ?? `CLI-${c.client_id}`}
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.account_type ?? "—"}</td>
                        <td style={{ fontSize: 10, color: "var(--text-muted)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.practice_head_snapshot ?? ""}>
                          {c.practice_head_snapshot ?? "—"}
                        </td>
                        <td style={{ fontSize: 10, color: "var(--text-muted)", maxWidth: 100 }} title={c.pipeline_stage ?? ""}>
                          {CONTRACT_PIPELINE_STAGES.find((s) => s.value === (c.pipeline_stage || "discovery"))?.label ??
                            (c.pipeline_stage || "—")}
                        </td>
                        <td>
                          <StatusTag status={c.contract_status || "—"} />
                          {warn === "soon" && (
                            <span className="platform-badge amber" style={{ marginLeft: 6, fontSize: 9 }}>
                              ≤30d
                            </span>
                          )}
                          {warn === "expired" && (
                            <span className="platform-badge" style={{ marginLeft: 6, fontSize: 9, background: "rgba(255,79,107,0.15)", color: "var(--red)" }}>
                              Past end
                            </span>
                          )}
                        </td>
                        <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{c.contract_start_date?.slice(0, 10) ?? "—"}</td>
                        <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{c.contract_end_date?.slice(0, 10) ?? "—"}</td>
                        <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{c.renewal_reminder_date?.slice(0, 10) ?? "—"}</td>
                        <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{c.duration_months ?? "—"}</td>
                        <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>
                          {c.positions_filled ?? "—"}/{c.positions_contracted ?? "—"}
                        </td>
                        <td style={{ fontSize: 11 }}>{c.signed_acv_inr != null ? formatCurrency(c.signed_acv_inr) : "—"}</td>
                        <td style={{ fontSize: 11 }}>{fmtCmPct(c.signed_cm_pct)}</td>
                        <td style={{ fontSize: 11 }}>{c.agreed_rate_fee_inr != null ? formatCurrency(c.agreed_rate_fee_inr) : "—"}</td>
                        <td style={{ fontSize: 11 }}>{c.est_annual_value_inr != null ? formatCurrency(c.est_annual_value_inr) : "—"}</td>
                        <td style={{ fontSize: 11 }}>{c.revenue_run_rate_inr != null ? formatCurrency(c.revenue_run_rate_inr) : "—"}</td>
                        <td style={{ fontSize: 10, color: "var(--text-muted)", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.pricing_model ?? ""}>
                          {c.pricing_model ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </PlatformSection>
      )}

      {tab === "Pipeline" && (
        <PlatformSection title="Closing pipeline" action="Refresh" onAction={() => void refresh()}>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12, maxWidth: 760 }}>
            Contracts grouped by commercial closing stage. Edit a row to move stages; when the deal is{" "}
            <strong>Signed</strong> or <strong>Active client</strong> and the legal account is still a{" "}
            <strong>prospect</strong>, use <em>Realise legal client</em> in the contract drawer to flip the client to active.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
              alignItems: "stretch",
            }}
          >
            {CONTRACT_PIPELINE_STAGES.map((st) => {
              const rows = enriched.filter((c) => (c.pipeline_stage || "discovery") === st.value);
              return (
                <div
                  key={st.value}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: 10,
                    minHeight: 100,
                    background: "var(--bg2)",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>{st.label}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
                    {rows.length} contract{rows.length !== 1 ? "s" : ""}
                  </div>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 16, fontSize: 11, lineHeight: 1.45 }}>
                    {rows.slice(0, 10).map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => openDetail(c)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--accent)",
                            cursor: "pointer",
                            padding: 0,
                            textAlign: "left",
                          }}
                        >
                          {c.customer_name ?? `CNT-${c.id}`}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {rows.length > 10 && (
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>+{rows.length - 10} more…</div>
                  )}
                </div>
              );
            })}
          </div>
        </PlatformSection>
      )}

      {tab === "Renewals & alerts" && (
        <PlatformSection title="Renewal timeline" action="Refresh" onAction={refresh}>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12, maxWidth: 720 }}>
            Sorted by contract end date. Use this for renewal discussions, pricing escalators, and lapse reasons.
            Click a row to edit dates, status, and remarks.
          </p>
          <div className="platform-table-wrap" style={{ overflowX: "auto" }}>
            <table className="platform-table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>SBU</th>
                  <th>End date</th>
                  <th>Reminder</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th>Renewal</th>
                  <th>ACV</th>
                  <th>Est. annual</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {!loading && renewalsSorted.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
                      No end dates on file.
                    </td>
                  </tr>
                )}
                {renewalsSorted.map((c) => {
                  const du = daysUntilEnd(c.contract_end_date);
                  return (
                    <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => openDetail(c)}>
                      <td style={{ fontWeight: 600 }}>{c.customer_name ?? "—"}</td>
                      <td style={{ fontSize: 11 }}>{c.sbuLabel}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{c.contract_end_date?.slice(0, 10) ?? "—"}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{c.renewal_reminder_date?.slice(0, 10) ?? "—"}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: du != null && du < 0 ? "var(--red)" : du != null && du <= 90 ? "var(--amber)" : "var(--text-muted)" }}>
                        {du == null ? "—" : du < 0 ? `${du}d` : `${du}d`}
                      </td>
                      <td><StatusTag status={c.contract_status || "—"} /></td>
                      <td style={{ fontSize: 10, color: "var(--text-muted)" }}>{c.renewal_status ?? "—"}</td>
                      <td>{c.signed_acv_inr != null ? formatCurrency(c.signed_acv_inr) : "—"}</td>
                      <td>{c.est_annual_value_inr != null ? formatCurrency(c.est_annual_value_inr) : "—"}</td>
                      <td style={{ fontSize: 10, color: "var(--text-muted)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.remarks ?? ""}>
                        {c.remarks ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PlatformSection>
      )}

      {tab === "Import workbook" && (
        <PlatformSection title="Import Contract Data sheet">
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 16px", maxWidth: 800, lineHeight: 1.55 }}>
            Upload <strong>Project Signup Renewal Detail.xlsx</strong> (or the same layout). Rows match{" "}
            <strong>Customer</strong> to <strong>project account name</strong>. Signed ACV in ₹L is converted to INR.
            Unmatched names are returned in the response — create or rename projects first if needed.
          </p>
          <input
            id={contractWorkbookImportId}
            type="file"
            accept=".xlsx,.xlsm"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              void onUpload(f ?? null);
            }}
          />
          <label
            htmlFor={contractWorkbookImportId}
            className={cn("platform-dialog__dropzone", uploading && "opacity-70")}
            style={{ cursor: uploading ? "wait" : "pointer" }}
          >
            <div className="platform-dialog__dropzone-hint">
              {uploading ? "Uploading…" : "Drop .xlsx here or click to browse"}
            </div>
          </label>
          {uploadMsg && <div className="alert-banner" style={{ marginTop: 12, fontSize: 11 }}>{uploadMsg}</div>}
          {uploadErr && <div className="alert-banner" style={{ marginTop: 12, fontSize: 11, borderColor: "rgba(255,79,107,0.35)" }}>{uploadErr}</div>}
        </PlatformSection>
      )}

      <ContractDetailSheet
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o);
        }}
        row={activeRow}
        contracts={contracts}
        projects={projects}
        saving={saving}
        canRealise={canRealiseActiveContract}
        realising={realising}
        onRealise={() => void realiseLegalClient()}
        onDelete={() => void removeContract()}
        onSave={async (f) => {
          await savePatch(f);
        }}
        onMsaUploadComplete={(u) => {
          setContracts((prev) => prev.map((c) => (c.id === u.id ? u : c)));
          setActiveRow((ar) => {
            if (!ar || ar.id !== u.id) return ar;
            const pr = projectById.get(u.project_id);
            const sbu =
              (pr?.engagement_name && String(pr.engagement_name).trim()) ||
              (pr?.account_name && String(pr.account_name).trim()) ||
              `PRJ-${u.project_id}`;
            const cl = u.client_id != null ? clientNameById.get(u.client_id) ?? null : null;
            return { ...u, sbuLabel: sbu, clientLabel: cl };
          });
        }}
        goClient={goClient}
      />

      <NewContractSheet
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) {
            setCreateProjectId("");
            setCreateProspectName("");
            setCreateForm(emptyContractForm());
          }
        }}
        projects={projects}
        contracts={contracts}
        createProjectId={createProjectId}
        setCreateProjectId={setCreateProjectId}
        createForm={createForm}
        setCreateForm={setCreateForm}
        createProspectName={createProspectName}
        setCreateProspectName={setCreateProspectName}
        onSubmitCreate={() => void submitCreate()}
        creating={creating}
        makeEmptyContractForm={makeEmptyContractFormCb}
        onSubmitClientWithEngagements={(b) => void submitClientWithEngagements(b)}
        clientGroups={clientGroups}
      />
    </div>
  );
}
