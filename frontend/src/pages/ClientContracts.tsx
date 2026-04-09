import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  queries,
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
    internal_signoff: row.internal_signoff ?? "",
    revenue_run_rate_inr: n(row.revenue_run_rate_inr),
    practice_head_snapshot: row.practice_head_snapshot ?? "",
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
    internal_signoff: str("internal_signoff"),
    revenue_run_rate_inr: numOrNull(form.revenue_run_rate_inr ?? ""),
    practice_head_snapshot: str("practice_head_snapshot"),
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
      {inp("internal_signoff", "Internal sign-off")}
      {ta("reason_for_lapse", "Reason for lapse / loss", 3)}
      {ta("contract_detail", "Detail (SOW / scope notes)", 3)}
      {ta("remarks", "Remarks", 3)}
    </div>
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
      <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Identity</div>
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
      {line("Internal sign-off", row.internal_signoff)}
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
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([queries.contractsList(), queries.projects(), queries.clients()])
      .then(([c, p, cl]) => {
        setContracts(c);
        setProjects(p);
        setClientGroups(cl);
      })
      .catch(() => {
        setContracts([]);
        setProjects([]);
        setClientGroups([]);
      })
      .finally(() => setLoading(false));
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
    for (const c of contracts) {
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
      total: contracts.length,
      active,
      renewed,
      expired,
      totalAcv,
      expiring90,
      overdue,
    };
  }, [contracts]);

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
      return f;
    });
    setCreateProjectId("");
    setCreateOpen(true);
  }

  async function savePatch() {
    if (!activeRow) return;
    setSaving(true);
    try {
      const body = formToContractPayload(form);

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
      setEditMode(false);
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Save failed";
      alert(msg);
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
      await queries.createContract({ project_id: pid, ...payload });
      setCreateOpen(false);
      setCreateProjectId("");
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <PlatformKpi label="Contracts on file" value={kpis.total} accent="blue" subtext="Scoped portfolio" />
          <PlatformKpi
            label="Active / renewed / expired"
            value={`${kpis.active} / ${kpis.renewed} / ${kpis.expired}`}
            accent="teal"
            subtext="By row status"
          />
          <PlatformKpi
            label="Σ Signed ACV"
            value={kpis.totalAcv > 0 ? formatCurrency(kpis.totalAcv) : "—"}
            accent="green"
            subtext="INR from contract rows"
          />
          <PlatformKpi
            label="Renewal radar"
            value={`${kpis.expiring90} ≤90d · ${kpis.overdue} overdue`}
            accent={kpis.overdue > 0 ? "red" : "amber"}
            subtext="End date vs today"
          />
        </div>
      )}

      <Tabs
        tabs={["Portfolio", "Renewals & alerts", "Import workbook"]}
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
            <table className="platform-table" style={{ minWidth: 1400 }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Customer</th>
                  <th>SBU / project</th>
                  <th>Legal client</th>
                  <th>Type</th>
                  <th>Practice head</th>
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
                    <td colSpan={18} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && filteredPortfolio.length === 0 && (
                  <tr>
                    <td colSpan={18} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
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
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12, maxWidth: 800 }}>
            Upload <strong>Project Signup Renewal Detail.xlsx</strong> (or the same layout). Rows match{" "}
            <strong>Customer</strong> to <strong>project account name</strong>. Signed ACV in ₹L is converted to INR.
            Unmatched names are returned in the response — create or rename projects first if needed.
          </p>
          <label
            className={cn("platform-dialog__dropzone", uploading && "opacity-70")}
            style={{ maxWidth: 480, cursor: uploading ? "wait" : "pointer" }}
          >
            <input
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
            <div className="platform-dialog__dropzone-hint">
              {uploading ? "Uploading…" : "Drop .xlsx here or click to browse"}
            </div>
          </label>
          {uploadMsg && <div className="alert-banner" style={{ marginTop: 12, fontSize: 11 }}>{uploadMsg}</div>}
          {uploadErr && <div className="alert-banner" style={{ marginTop: 12, fontSize: 11, borderColor: "rgba(255,79,107,0.35)" }}>{uploadErr}</div>}
        </PlatformSection>
      )}

      <Dialog open={detailOpen} onOpenChange={(o) => { if (!o) { setDetailOpen(false); setEditMode(false); } }}>
        <DialogContent showCloseButton className={cn("platform-dialog platform-dialog--wide max-h-[90vh] overflow-y-auto")}>
          <DialogHeader className="platform-dialog__header">
            <div className="platform-dialog__eyebrow">Contract · CNT-{activeRow?.id}</div>
            <DialogTitle className="platform-dialog__title">{activeRow?.customer_name ?? "Contract"}</DialogTitle>
            <DialogDescription className="platform-dialog__desc">
              {activeRow && (
                <>
                  <span style={{ fontFamily: "'DM Mono',monospace" }}>PRJ-{activeRow.project_id}</span>
                  {" · "}
                  {activeRow.sbuLabel}
                  {activeRow.client_id != null && (
                    <>
                      {" · "}
                      <button type="button" className="underline-offset-2 hover:underline" style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0 }} onClick={() => goClient(activeRow.client_id)}>
                        {activeRow.clientLabel ?? `Client ${activeRow.client_id}`}
                      </button>
                    </>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="platform-dialog__body space-y-3">
            {!editMode && activeRow && <ReadonlyContractDetails row={activeRow} />}
            {editMode && (
              <ContractFormFields
                form={form}
                onField={(key, value) => setForm((f) => ({ ...f, [key]: value }))}
              />
            )}
          </div>
          <DialogFooter className="platform-dialog__footer" style={{ flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="platform-dialog__btn" onClick={() => setDetailOpen(false)}>Close</button>
            {!editMode && (
              <>
                <button type="button" className="platform-dialog__btn platform-dialog__btn--primary" onClick={() => setEditMode(true)}>Edit</button>
                <button type="button" className="platform-dialog__btn" style={{ color: "var(--red)", borderColor: "rgba(255,79,107,0.35)" }} onClick={removeContract}>Delete</button>
              </>
            )}
            {editMode && (
              <>
                <button
                  type="button"
                  className="platform-dialog__btn"
                  onClick={() => {
                    if (activeRow) setForm(contractRowToForm(activeRow));
                    setEditMode(false);
                  }}
                  disabled={saving}
                >
                  Cancel edit
                </button>
                <button type="button" className="platform-dialog__btn platform-dialog__btn--primary" onClick={() => void savePatch()} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) {
            setCreateProjectId("");
            setCreateForm(emptyContractForm());
          }
        }}
      >
        <DialogContent showCloseButton className={cn("platform-dialog platform-dialog--wide max-h-[92vh] overflow-y-auto")}>
          <DialogHeader className="platform-dialog__header">
            <div className="platform-dialog__eyebrow">New contract</div>
            <DialogTitle className="platform-dialog__title">Create contract row</DialogTitle>
            <DialogDescription className="platform-dialog__desc">
              Link to an operational project (SBU), then capture commercial terms. All fields are optional except project; you can edit later from the portfolio.
            </DialogDescription>
          </DialogHeader>
          <div className="platform-dialog__body space-y-4">
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
              <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Project (required)</span>
              <select
                className="platform-search"
                value={createProjectId}
                onChange={(e) => setCreateProjectId(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="">Select PRJ…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    PRJ-{p.id} · {(p.engagement_name || p.account_name || p.filename || "").slice(0, 48)}
                  </option>
                ))}
              </select>
            </label>
            <ContractFormFields
              form={createForm}
              onField={(key, value) => setCreateForm((f) => ({ ...f, [key]: value }))}
            />
          </div>
          <DialogFooter className="platform-dialog__footer">
            <button type="button" className="platform-dialog__btn" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</button>
            <button type="button" className="platform-dialog__btn platform-dialog__btn--primary" onClick={() => void submitCreate()} disabled={creating}>{creating ? "Creating…" : "Create"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
