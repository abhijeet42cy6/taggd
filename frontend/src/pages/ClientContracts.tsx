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
  const [createCustomer, setCreateCustomer] = useState("");
  const [createStart, setCreateStart] = useState("");
  const [createEnd, setCreateEnd] = useState("");
  const [createAcv, setCreateAcv] = useState("");
  const [createStatus, setCreateStatus] = useState("Active");
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
    setForm({
      customer_name: row.customer_name ?? "",
      account_type: row.account_type ?? "",
      contract_start_date: row.contract_start_date?.slice(0, 10) ?? "",
      contract_end_date: row.contract_end_date?.slice(0, 10) ?? "",
      renewal_reminder_date: row.renewal_reminder_date?.slice(0, 10) ?? "",
      signed_acv_inr: row.signed_acv_inr != null ? String(row.signed_acv_inr) : "",
      contract_status: row.contract_status ?? "",
      signed_cm_pct: row.signed_cm_pct != null ? String(row.signed_cm_pct) : "",
      headcount_contracted: row.headcount_contracted != null ? String(row.headcount_contracted) : "",
      payment_terms: row.payment_terms ?? "",
      pricing_model: row.pricing_model ?? "",
      contract_detail: row.contract_detail ?? "",
      remarks: row.remarks ?? "",
      renewal_status: row.renewal_status ?? "",
      reason_for_lapse: row.reason_for_lapse ?? "",
      sow_msa_reference: row.sow_msa_reference ?? "",
      est_annual_value_inr: row.est_annual_value_inr != null ? String(row.est_annual_value_inr) : "",
      revenue_run_rate_inr: row.revenue_run_rate_inr != null ? String(row.revenue_run_rate_inr) : "",
    });
    setDetailOpen(true);
  }

  async function savePatch() {
    if (!activeRow) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      const keys = [
        "customer_name",
        "account_type",
        "contract_start_date",
        "contract_end_date",
        "renewal_reminder_date",
        "contract_status",
        "payment_terms",
        "pricing_model",
        "contract_detail",
        "remarks",
        "renewal_status",
        "reason_for_lapse",
        "sow_msa_reference",
      ] as const;
      for (const k of keys) {
        const v = form[k]?.trim();
        body[k] = v || null;
      }
      const num = (s: string) => {
        const t = s.trim();
        if (!t) return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
      };
      body.signed_acv_inr = num(form.signed_acv_inr ?? "");
      body.signed_cm_pct = num(form.signed_cm_pct ?? "");
      body.headcount_contracted = num(form.headcount_contracted ?? "");
      body.est_annual_value_inr = num(form.est_annual_value_inr ?? "");
      body.revenue_run_rate_inr = num(form.revenue_run_rate_inr ?? "");

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
      const body: Record<string, unknown> = {
        project_id: pid,
        customer_name: createCustomer.trim() || null,
        contract_start_date: createStart.trim() || null,
        contract_end_date: createEnd.trim() || null,
        contract_status: createStatus.trim() || null,
      };
      const acv = createAcv.trim();
      if (acv) body.signed_acv_inr = Number(acv);
      await queries.createContract(body);
      setCreateOpen(false);
      setCreateProjectId("");
      setCreateCustomer("");
      setCreateStart("");
      setCreateEnd("");
      setCreateAcv("");
      setCreateStatus("Active");
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
            onClick={() => setCreateOpen(true)}
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
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Customer</th>
                  <th>SBU / project</th>
                  <th>Legal client</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>ACV</th>
                  <th>CM%</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={10} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && filteredPortfolio.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
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
                        <td style={{ fontSize: 11 }}>{c.signed_acv_inr != null ? formatCurrency(c.signed_acv_inr) : "—"}</td>
                        <td style={{ fontSize: 11 }}>
                          {c.signed_cm_pct != null ? `${Math.round(c.signed_cm_pct * 10_000) / 100}%` : "—"}
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
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>SBU</th>
                  <th>End date</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th>ACV</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {!loading && renewalsSorted.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
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
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: du != null && du < 0 ? "var(--red)" : du != null && du <= 90 ? "var(--amber)" : "var(--text-muted)" }}>
                        {du == null ? "—" : du < 0 ? `${du}d` : `${du}d`}
                      </td>
                      <td><StatusTag status={c.contract_status || "—"} /></td>
                      <td>{c.signed_acv_inr != null ? formatCurrency(c.signed_acv_inr) : "—"}</td>
                      <td style={{ fontSize: 10, color: "var(--text-muted)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.remarks ?? ""}>
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
            {!editMode && activeRow && (
              <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
                <div><strong>Type:</strong> {activeRow.account_type ?? "—"}</div>
                <div><strong>Term:</strong> {activeRow.contract_start_date?.slice(0, 10) ?? "—"} → {activeRow.contract_end_date?.slice(0, 10) ?? "—"}</div>
                <div><strong>ACV:</strong> {activeRow.signed_acv_inr != null ? formatCurrency(activeRow.signed_acv_inr) : "—"}</div>
                <div><strong>CM%:</strong> {activeRow.signed_cm_pct != null ? `${Math.round(activeRow.signed_cm_pct * 10_000) / 100}%` : "—"}</div>
                <div><strong>HC:</strong> {activeRow.headcount_contracted ?? "—"}</div>
                <div><strong>Payment / pricing:</strong> {(activeRow.payment_terms || "—") + " · " + (activeRow.pricing_model || "—")}</div>
                <div><strong>Detail:</strong> {activeRow.contract_detail ?? "—"}</div>
                <div><strong>Remarks:</strong> {activeRow.remarks ?? "—"}</div>
              </div>
            )}
            {editMode && (
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                {(
                  [
                    ["customer_name", "Customer name"],
                    ["account_type", "Account type"],
                    ["contract_start_date", "Start (YYYY-MM-DD)"],
                    ["contract_end_date", "End (YYYY-MM-DD)"],
                    ["renewal_reminder_date", "Reminder date"],
                    ["contract_status", "Status"],
                    ["signed_acv_inr", "Signed ACV (INR)"],
                    ["signed_cm_pct", "CM (0–1 or decimal)"],
                    ["headcount_contracted", "Headcount"],
                    ["est_annual_value_inr", "Est. annual value (INR)"],
                    ["revenue_run_rate_inr", "Revenue run rate / mo (INR)"],
                    ["sow_msa_reference", "SOW / MSA ref"],
                    ["renewal_status", "Renewal status"],
                    ["payment_terms", "Payment terms"],
                    ["pricing_model", "Pricing model"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
                    <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>{label}</span>
                    <input
                      className="platform-search"
                      value={form[key] ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      style={{ width: "100%" }}
                    />
                  </label>
                ))}
                <label style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
                  <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Contract detail</span>
                  <textarea className="platform-search" rows={2} value={form.contract_detail ?? ""} onChange={(e) => setForm((f) => ({ ...f, contract_detail: e.target.value }))} style={{ width: "100%", resize: "vertical" }} />
                </label>
                <label style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
                  <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Remarks</span>
                  <textarea className="platform-search" rows={2} value={form.remarks ?? ""} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} style={{ width: "100%", resize: "vertical" }} />
                </label>
                <label style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
                  <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Reason for lapse / loss</span>
                  <textarea className="platform-search" rows={2} value={form.reason_for_lapse ?? ""} onChange={(e) => setForm((f) => ({ ...f, reason_for_lapse: e.target.value }))} style={{ width: "100%", resize: "vertical" }} />
                </label>
              </div>
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
                <button type="button" className="platform-dialog__btn" onClick={() => setEditMode(false)} disabled={saving}>Cancel edit</button>
                <button type="button" className="platform-dialog__btn platform-dialog__btn--primary" onClick={() => void savePatch()} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent showCloseButton className="platform-dialog">
          <DialogHeader className="platform-dialog__header">
            <div className="platform-dialog__eyebrow">New contract</div>
            <DialogTitle className="platform-dialog__title">Attach to a project (SBU)</DialogTitle>
            <DialogDescription className="platform-dialog__desc">
              Choose the operational project this agreement belongs to. You can refine fields after save from the portfolio.
            </DialogDescription>
          </DialogHeader>
          <div className="platform-dialog__body space-y-3">
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
              <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Project</span>
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
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
              <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Customer name (as on contract)</span>
              <input className="platform-search" value={createCustomer} onChange={(e) => setCreateCustomer(e.target.value)} placeholder="e.g. Siemens Healthineers" />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
                <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Start</span>
                <input className="platform-search" type="date" value={createStart} onChange={(e) => setCreateStart(e.target.value)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
                <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>End</span>
                <input className="platform-search" type="date" value={createEnd} onChange={(e) => setCreateEnd(e.target.value)} />
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
              <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Signed ACV (INR)</span>
              <input className="platform-search" value={createAcv} onChange={(e) => setCreateAcv(e.target.value)} placeholder="e.g. 12000000" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
              <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Status</span>
              <select className="platform-search" value={createStatus} onChange={(e) => setCreateStatus(e.target.value)}>
                <option value="Active">Active</option>
                <option value="Renewed">Renewed</option>
                <option value="Expired">Expired</option>
              </select>
            </label>
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
