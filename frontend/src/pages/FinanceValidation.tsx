import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  queries,
  type FinanceBillingValidationEventRow,
  type FinanceBillingWorkflowDto,
  type RevenueBillingWithWorkflow,
} from "@/lib/api";
import { canAccessFinanceValidation, useAuth } from "@/lib/auth";
import { cn, formatDate, formatLargeCurrency } from "@/lib/utils";
import { PageHeader, PlatformSection } from "@/components/platform/PlatformBlocks";
import { PlatformDrawer } from "@/components/platform/PlatformDrawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FilterX, PanelRightOpen } from "lucide-react";

const PM_NONE = "__pm_none__";
const FY_NONE = "__fy_none__";

const selectFilterStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg2)",
  color: "var(--text)",
  fontSize: 11,
  fontFamily: "'DM Mono',monospace",
};

function rowMatchesFvQueueTableFilters(
  r: RevenueBillingWithWorkflow,
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

function formatWorkflowLabel(raw: string | null | undefined): string {
  const s = (raw || "draft").trim();
  if (!s) return "Draft";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function QueueWorkflowCell({ row }: { row: RevenueBillingWithWorkflow }) {
  const raw = (row.workflow?.validation_status || "draft").toLowerCase();
  const label = formatWorkflowLabel(row.workflow?.validation_status || "draft");
  if (raw === "fully_approved") {
    return <span className="platform-badge green">{label}</span>;
  }
  if (raw === "rejected") {
    return <span className="platform-badge red">{label}</span>;
  }
  if (raw === "submitted" || raw === "under_review") {
    return <span className="platform-badge blue">{label}</span>;
  }
  if (raw === "cfo_pending") {
    return <span className="platform-badge teal">{label}</span>;
  }
  if (raw === "disputed") {
    return <span className="platform-badge amber">{label}</span>;
  }
  return <span className="platform-badge grey">{label}</span>;
}

/** Server `status` query param — one chip maps to one value (no backend change). */
const STATUS_CHIPS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under review" },
  { value: "disputed", label: "Disputed" },
  { value: "cfo_pending", label: "CFO pending" },
  { value: "fully_approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const DRAWER_TABS = [
  { id: "summary" as const, label: "Summary" },
  { id: "validation" as const, label: "Validation" },
  { id: "payments" as const, label: "Payments" },
  { id: "history" as const, label: "Audit log" },
];

function titleCaseStatus(raw: string | null | undefined): string {
  const s = (raw || "draft").trim();
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function workflowBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "fully_approved") return "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300";
  if (s === "rejected") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (s === "cfo_pending") return "border-violet-500/30 bg-violet-500/10 text-violet-900 dark:text-violet-200";
  if (s === "under_review" || s === "submitted") return "border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200";
  if (s === "disputed") return "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-200";
  return "border-border bg-muted/60 text-muted-foreground";
}

function formatDateTimeHuman(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function eventActionLabel(action: string): string {
  const a = action.toLowerCase().replace(/-/g, "_");
  const map: Record<string, string> = {
    practice_submit: "Practice submitted to finance",
    start_review: "Finance started review",
    junior_approve: "Junior finance validated",
    junior_validate: "Junior finance validated",
    cfo_approve: "CFO signed off",
    dispute: "Disputed — sent back to practice",
    reject: "Rejected",
    patch: "Validation fields updated",
    add_receipt: "Payment receipt recorded",
    overdue_tick: "Overdue escalation noted",
  };
  if (map[a]) return map[a];
  return titleCaseStatus(action.replace(/-/g, "_"));
}

function FvSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/70 bg-card/50 shadow-sm">
      <div className="border-b border-border/50 px-3 py-2.5 sm:px-4">
        <h4 className="text-sm font-semibold text-foreground tracking-tight">{title}</h4>
        {description ? <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{description}</p> : null}
      </div>
      <div className="px-3 py-3 sm:px-4 sm:py-3.5">{children}</div>
    </section>
  );
}

function DlRow({ label, value, monoValue }: { label: string; value: React.ReactNode; monoValue?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 py-2 border-b border-border/40 last:border-0 last:pb-0 first:pt-0">
      <dt className="text-[11px] font-medium text-muted-foreground shrink-0">{label}</dt>
      <dd className={cn("text-sm text-foreground text-left sm:text-right min-w-0 break-words", monoValue && "font-mono text-[13px]")}>
        {value}
      </dd>
    </div>
  );
}

export function FinanceValidation() {
  const { user } = useAuth();
  const allowed = canAccessFinanceValidation(user);
  const [rows, setRows] = useState<RevenueBillingWithWorkflow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [mine, setMine] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RevenueBillingWithWorkflow | null>(null);
  const [events, setEvents] = useState<FinanceBillingValidationEventRow[]>([]);
  const [tab, setTab] = useState<"summary" | "validation" | "payments" | "history">("summary");
  const [saving, setSaving] = useState(false);
  const [discNote, setDiscNote] = useState("");
  const [wfForm, setWfForm] = useState({
    payment_mode: "",
    payment_reference_utr: "",
    gst_reconciliation_status: "",
    discrepancy_notes: "",
    tds_deducted_inr: "",
  });
  const [receiptAmt, setReceiptAmt] = useState("");
  const [receiptUtr, setReceiptUtr] = useState("");
  const [receiptDate, setReceiptDate] = useState("");

  /** Client-side filters on the loaded queue (server still applies status / mine / overdue). */
  const [tableSearch, setTableSearch] = useState("");
  const [tableFy, setTableFy] = useState<string>("all");
  const [tablePm, setTablePm] = useState<string>("all");
  const [tableInvoice, setTableInvoice] = useState<"all" | "has" | "none">("all");

  const load = useCallback(async () => {
    if (!allowed) return;
    setErr(null);
    setLoading(true);
    try {
      const res = await queries.financeBillingWorkflowQueue({
        status: status || undefined,
        mine,
        overdue_only: overdueOnly,
        limit: 200,
        offset: 0,
      });
      setRows(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, status, mine, overdueOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const openRow = useCallback(async (id: number) => {
    setSelectedId(id);
    setDrawerOpen(true);
    setTab("summary");
    setErr(null);
    try {
      const [d, ev] = await Promise.all([
        queries.financeBillingWorkflowDetail(id),
        queries.financeBillingWorkflowEvents(id),
      ]);
      setDetail(d);
      setEvents(ev.items ?? []);
      const w = d.workflow as FinanceBillingWorkflowDto | undefined;
      setWfForm({
        payment_mode: w?.payment_mode ?? "",
        payment_reference_utr: w?.payment_reference_utr ?? "",
        gst_reconciliation_status: w?.gst_reconciliation_status ?? "",
        discrepancy_notes: w?.discrepancy_notes ?? "",
        tds_deducted_inr: w?.tds_deducted_inr != null ? String(w.tds_deducted_inr) : "",
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const refreshDetail = useCallback(async () => {
    if (selectedId == null) return;
    const d = await queries.financeBillingWorkflowDetail(selectedId);
    setDetail(d);
    const ev = await queries.financeBillingWorkflowEvents(selectedId);
    setEvents(ev.items ?? []);
  }, [selectedId]);

  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    setErr(null);
    try {
      await fn();
      await refreshDetail();
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const wf = detail?.workflow as FinanceBillingWorkflowDto | undefined;
  const st = wf?.validation_status ?? "draft";

  const drawerSubtitle = useMemo(() => {
    if (!detail) return undefined;
    const parts = [detail.account_name, `PRJ-${detail.project_id}`];
    if (detail.invoice_number) parts.push(detail.invoice_number);
    return parts.filter(Boolean).join(" · ");
  }, [detail]);

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

  const filteredRows = useMemo(
    () =>
      rows.filter((r) =>
        rowMatchesFvQueueTableFilters(r, {
          search: tableSearch,
          fy: tableFy,
          pm: tablePm,
          invoice: tableInvoice,
        })
      ),
    [rows, tableSearch, tableFy, tablePm, tableInvoice]
  );

  const tableFiltersActive =
    tableSearch.trim() !== "" || tableFy !== "all" || tablePm !== "all" || tableInvoice !== "all";

  function clearTableFilters() {
    setTableSearch("");
    setTableFy("all");
    setTablePm("all");
    setTableInvoice("all");
  }

  if (!allowed) {
    return (
      <div className="space-y-4 pb-16">
        <PageHeader
          title="Finance validation"
          subtitle="Invoice lifecycle, approvals, and collections governance."
        />
        <PlatformSection title="Access">
          <p className="text-sm text-muted-foreground font-mono">
            This screen is not in your navigation allow-list. Operations and client portal users need the{" "}
            <strong>finance_validation</strong> vertical in <strong>Users &amp; access</strong>. Other roles use role-based
            routing; recruiters do not have this module.
          </p>
        </PlatformSection>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="Finance validation"
        subtitle="Queue for TAGGD billing rows — submit from Billing, then review, junior-validate, and CFO-approve when over threshold."
      />

      <PlatformSection title="Filters" action="Refresh" onAction={() => void load()}>
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground mb-2">Workflow status</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_CHIPS.map(({ value: v, label }) => {
                const on = status === v;
                return (
                  <Button
                    key={v || "all"}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={on}
                    className={cn(
                      "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                      on
                        ? "border-primary/45 bg-primary/10 text-foreground shadow-sm"
                        : "border-border/80 bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                    )}
                    onClick={() => setStatus(v)}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                role="switch"
                aria-checked={mine}
                className={cn(
                  "h-8 rounded-full border px-3 text-xs font-medium",
                  mine
                    ? "border-primary/45 bg-primary/10 text-foreground"
                    : "border-border/80 bg-background text-muted-foreground hover:bg-muted/40",
                )}
                onClick={() => setMine((x) => !x)}
              >
                Assigned to me
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                role="switch"
                aria-checked={overdueOnly}
                className={cn(
                  "h-8 rounded-full border px-3 text-xs font-medium max-w-full sm:max-w-[min(100%,22rem)]",
                  overdueOnly
                    ? "border-amber-500/40 bg-amber-500/10 text-foreground"
                    : "border-border/80 bg-background text-muted-foreground hover:bg-muted/40",
                )}
                onClick={() => setOverdueOnly((x) => !x)}
                title="Due date passed and not fully approved"
              >
                <span className="hidden sm:inline">Overdue — due passed, not approved</span>
                <span className="sm:hidden">Overdue</span>
              </Button>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground sm:text-right">
              {total} row{total === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        {err && !drawerOpen ? <div className="text-xs text-destructive font-mono mt-3">{err}</div> : null}
      </PlatformSection>

      <PlatformSection title="Queue" action="Refresh" onAction={() => void load()}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12, alignItems: "center" }}>
          <input
            className="platform-search"
            placeholder="Search ID, account, PM, invoice, FY, PRJ…"
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            style={{ flex: "1 1 220px", maxWidth: 400, minWidth: 180 }}
          />
          <select value={tableFy} onChange={(e) => setTableFy(e.target.value)} style={{ ...selectFilterStyle, minWidth: 140 }}>
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
          <select value={tablePm} onChange={(e) => setTablePm(e.target.value)} style={{ ...selectFilterStyle, minWidth: 160 }}>
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
            value={tableInvoice}
            onChange={(e) => setTableInvoice(e.target.value as "all" | "has" | "none")}
            style={{ ...selectFilterStyle, minWidth: 130 }}
          >
            <option value="all">All invoices</option>
            <option value="has">Has invoice #</option>
            <option value="none">No invoice</option>
          </select>
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginLeft: "auto" }}>
            {tableFiltersActive ? `${filteredRows.length} of ${rows.length} shown` : `${rows.length} loaded`}
            {total > rows.length ? ` · ${total} total` : ""}
          </span>
          {tableFiltersActive ? (
            <button
              type="button"
              className="platform-dialog__btn"
              style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={clearTableFilters}
            >
              <FilterX className="h-3 w-3" />
              Clear filters
            </button>
          ) : null}
        </div>

        <div className="platform-table-wrap" style={{ overflowX: "auto" }}>
          <table className="platform-table" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Project</th>
                <th>Update</th>
                <th>FY</th>
                <th>PM</th>
                <th style={{ textAlign: "right" }}>Net rev</th>
                <th style={{ textAlign: "right" }}>MMF</th>
                <th>Invoice</th>
                <th>Due</th>
                <th>Workflow</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={11} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
                    No rows match the filters above. Try another workflow status, assignment, or overdue toggle, then refresh.
                  </td>
                </tr>
              )}
              {!loading && rows.length > 0 && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
                    No rows match these table filters.{" "}
                    <button
                      type="button"
                      className="text-primary underline-offset-2 hover:underline text-xs bg-transparent border-0 cursor-pointer p-0 font-medium"
                      onClick={clearTableFilters}
                    >
                      Clear filters
                    </button>
                  </td>
                </tr>
              )}
              {!loading &&
                filteredRows.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-muted/20 cursor-pointer"
                    onClick={() => void openRow(r.id)}
                  >
                    <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--accent)" }}>{r.id}</td>
                    <td style={{ maxWidth: 200 }}>
                      <div style={{ fontWeight: 600, fontSize: 11 }}>{r.account_name || "—"}</div>
                      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                        PRJ-{r.project_id}
                      </div>
                    </td>
                    <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{r.update_date?.slice(0, 10) || "—"}</td>
                    <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.fiscal_year_label || "—"}</td>
                    <td
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        maxWidth: 120,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={r.project_manager || ""}
                    >
                      {r.project_manager || "—"}
                    </td>
                    <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, textAlign: "right" }}>
                      {r.net_revenue_inr != null ? formatLargeCurrency(r.net_revenue_inr) : "—"}
                    </td>
                    <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, textAlign: "right" }}>
                      {r.mmf_inr != null ? formatLargeCurrency(r.mmf_inr) : "—"}
                    </td>
                    <td
                      style={{
                        fontFamily: "'DM Mono',monospace",
                        fontSize: 10,
                        maxWidth: 120,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: r.invoice_number ? "var(--accent)" : "var(--text-muted)",
                      }}
                      title={r.invoice_number || ""}
                    >
                      {r.invoice_number || "—"}
                    </td>
                    <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{r.payment_due_date?.slice(0, 10) || "—"}</td>
                    <td>
                      <QueueWorkflowCell row={r} />
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 gap-1 text-[10px]"
                        onClick={() => void openRow(r.id)}
                        title="Open validation drawer"
                      >
                        <PanelRightOpen className="h-3.5 w-3.5" />
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </PlatformSection>

      <PlatformDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedId(null);
          setDetail(null);
        }}
        title={detail ? `Billing #${detail.id}` : "Billing"}
        subtitle={drawerSubtitle}
        className="platform-drawer--wide"
        headerActions={
          wf ? (
            <Badge variant="outline" className={cn("shrink-0 border text-[10px] font-medium", workflowBadgeClass(st))}>
              {titleCaseStatus(wf.validation_status)}
            </Badge>
          ) : null
        }
        footer={
          detail && wf ? (
            <div className="flex flex-col gap-2">
              {err && drawerOpen ? <div className="text-xs text-destructive font-mono">{err}</div> : null}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="req-drawer-btn-ghost" onClick={() => setDrawerOpen(false)} disabled={saving}>
                  Close
                </button>
                {st === "submitted" ? (
                  <button
                    type="button"
                    className="req-drawer-btn-primary"
                    disabled={saving}
                    onClick={() => run(() => queries.financeBillingWorkflowStartReview(detail.id))}
                  >
                    Start review
                  </button>
                ) : null}
                {(st === "submitted" || st === "under_review") && (
                  <button
                    type="button"
                    className="req-drawer-btn-primary"
                    style={{ background: "var(--amber)" }}
                    disabled={saving || !discNote.trim()}
                    onClick={() => run(() => queries.financeBillingWorkflowDispute(detail.id, discNote.trim()))}
                  >
                    Dispute → practice
                  </button>
                )}
                {st === "under_review" ? (
                  <button
                    type="button"
                    className="req-drawer-btn-primary"
                    disabled={saving}
                    onClick={() => run(() => queries.financeBillingWorkflowJuniorApprove(detail.id))}
                  >
                    Junior validate / approve
                  </button>
                ) : null}
                {st === "cfo_pending" ? (
                  <button
                    type="button"
                    className="req-drawer-btn-primary"
                    disabled={saving}
                    onClick={() => run(() => queries.financeBillingWorkflowCfoApprove(detail.id, true))}
                  >
                    CFO sign-off
                  </button>
                ) : null}
                {(st === "submitted" || st === "under_review" || st === "cfo_pending") && (
                  <button
                    type="button"
                    className="req-drawer-btn-ghost"
                    disabled={saving}
                    onClick={() =>
                      run(() => queries.financeBillingWorkflowReject(detail.id, discNote.trim() || "Rejected"))
                    }
                  >
                    Reject
                  </button>
                )}
              </div>
            </div>
          ) : null
        }
      >
        {!detail ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-primary/12 bg-primary/[0.04] px-3 py-2.5">
              <p className="text-xs font-medium text-foreground">What this drawer is for</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                Confirm invoice details, capture validation notes, record receipts, and move the workflow forward using the
                buttons below. Use <strong>Audit log</strong> for a plain-English trail of what changed and when.
              </p>
            </div>

            <div
              role="tablist"
              aria-label="Billing workflow sections"
              className="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1"
            >
              {DRAWER_TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    tab === id
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/80"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "summary" && detail && (
              <div className="flex flex-col gap-3">
                <FvSection
                  title="Invoice & billing row"
                  description="Core commercial fields from the TAGGD billing record."
                >
                  <dl>
                    <DlRow label="Account" value={detail.account_name || "—"} />
                    <DlRow label="Project" value={<span className="font-mono">PRJ-{detail.project_id}</span>} />
                    <DlRow label="Invoice number" value={detail.invoice_number || "—"} monoValue />
                    <DlRow
                      label="Invoice amount"
                      value={detail.invoice_amount_inr != null ? formatLargeCurrency(detail.invoice_amount_inr) : "—"}
                      monoValue
                    />
                    <DlRow
                      label="Payment due"
                      value={detail.payment_due_date ? formatDate(detail.payment_due_date) : "—"}
                      monoValue
                    />
                    <DlRow label="Update date" value={detail.update_date ? formatDate(detail.update_date) : "—"} monoValue />
                  </dl>
                </FvSection>

                {!wf ? (
                  <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-6 text-center">
                    No finance workflow envelope for this billing row yet — collections and approvals will appear after
                    submission.
                  </p>
                ) : (
                  <>
                    <FvSection
                      title="Collections & CFO rule"
                      description="Outstanding is derived from invoice less recorded receipts. CFO sign-off is required when the invoice amount meets or exceeds the threshold."
                    >
                      <dl>
                        <DlRow
                          label="Outstanding (calculated)"
                          value={wf.outstanding_inr != null ? formatLargeCurrency(wf.outstanding_inr) : "—"}
                          monoValue
                        />
                        <DlRow
                          label="Recorded receipts (total)"
                          value={
                            wf.amount_received_inr != null ? formatLargeCurrency(wf.amount_received_inr) : "—"
                          }
                          monoValue
                        />
                        <DlRow
                          label="CFO threshold"
                          value={wf.cfo_threshold_inr != null ? formatLargeCurrency(wf.cfo_threshold_inr) : "—"}
                          monoValue
                        />
                        <DlRow
                          label="Partial payment"
                          value={wf.partial_payment === true ? "Yes" : wf.partial_payment === false ? "No" : "—"}
                        />
                      </dl>
                    </FvSection>

                    <FvSection title="Approval timeline" description="Key milestones in this finance workflow.">
                      <dl>
                        <DlRow label="Submitted to finance" value={formatDateTimeHuman(wf.practice_submitted_at)} />
                        <DlRow label="Review started" value={formatDateTimeHuman(wf.finance_review_started_at)} />
                        <DlRow label="Junior validated" value={formatDateTimeHuman(wf.junior_validated_at)} />
                        <DlRow label="CFO approved" value={formatDateTimeHuman(wf.cfo_approved_at)} />
                        <DlRow
                          label="CFO sign-off acknowledged"
                          value={
                            wf.cfo_sign_off_acknowledged === true
                              ? "Yes"
                              : wf.cfo_sign_off_acknowledged === false
                                ? "No"
                                : "—"
                          }
                        />
                      </dl>
                    </FvSection>
                  </>
                )}
              </div>
            )}

            {tab === "validation" && detail && (
              <div className="flex flex-col gap-4">
                <FvSection
                  title="Dispute & reject context"
                  description="Required when sending back to practice (dispute). Also stored if you reject from the footer."
                >
                  <label className="text-xs font-medium text-foreground" htmlFor="fv-disc-note">
                    Note to project team
                  </label>
                  <textarea
                    id="fv-disc-note"
                    className="mt-1.5 w-full min-h-[80px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={discNote}
                    onChange={(e) => setDiscNote(e.target.value)}
                    placeholder="e.g. GST mismatch on March invoice — please re-upload supporting…"
                  />
                </FvSection>

                <FvSection
                  title="Payment & tax validation"
                  description="Saved to the workflow record — use Save before leaving this tab if you edited fields."
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Payment mode</label>
                      <input
                        className="platform-search w-full h-9 text-sm"
                        value={wfForm.payment_mode}
                        onChange={(e) => setWfForm((f) => ({ ...f, payment_mode: e.target.value }))}
                        placeholder="NEFT, RTGS, cheque…"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">UTR / reference</label>
                      <input
                        className="platform-search w-full h-9 text-sm font-mono"
                        value={wfForm.payment_reference_utr}
                        onChange={(e) => setWfForm((f) => ({ ...f, payment_reference_utr: e.target.value }))}
                        placeholder="Bank reference"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">GST reconciliation</label>
                      <input
                        className="platform-search w-full h-9 text-sm"
                        value={wfForm.gst_reconciliation_status}
                        onChange={(e) => setWfForm((f) => ({ ...f, gst_reconciliation_status: e.target.value }))}
                        placeholder="Matched, pending, mismatch…"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">TDS deducted (INR)</label>
                      <input
                        className="platform-search w-full h-9 text-sm font-mono"
                        value={wfForm.tds_deducted_inr}
                        onChange={(e) => setWfForm((f) => ({ ...f, tds_deducted_inr: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <Separator className="my-4" />
                  <button
                    type="button"
                    className="req-drawer-btn-primary text-xs"
                    disabled={saving}
                    onClick={() =>
                      run(() =>
                        queries.financeBillingWorkflowPatch(detail.id, {
                          payment_mode: wfForm.payment_mode || null,
                          payment_reference_utr: wfForm.payment_reference_utr || null,
                          gst_reconciliation_status: wfForm.gst_reconciliation_status || null,
                          discrepancy_notes: wfForm.discrepancy_notes || null,
                          tds_deducted_inr: wfForm.tds_deducted_inr.trim()
                            ? Number(wfForm.tds_deducted_inr.replace(/,/g, ""))
                            : null,
                        })
                      )
                    }
                  >
                    Save validation fields
                  </button>
                </FvSection>
              </div>
            )}

            {tab === "payments" && detail && (
              <div className="flex flex-col gap-3">
                <FvSection
                  title="Recorded receipts"
                  description={`${(wf?.payment_receipts ?? []).length} receipt(s) on file for this billing row.`}
                >
                  {(wf?.payment_receipts ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No receipts yet — add one below.</p>
                  ) : (
                    <ul className="space-y-2">
                      {(wf?.payment_receipts ?? []).map((p) => (
                        <li
                          key={p.id}
                          className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm"
                        >
                          <div className="font-semibold font-mono">{formatLargeCurrency(p.amount_inr)}</div>
                          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                            <span>UTR: {p.utr_reference || "—"}</span>
                            <span>Date: {p.received_date ? formatDate(p.received_date) : "—"}</span>
                            {p.partial ? <span className="text-amber-700">Partial</span> : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </FvSection>

                <FvSection title="Add receipt" description="Post a bank receipt against this invoice.">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Amount (INR)</label>
                      <input
                        className="platform-search h-9 text-sm font-mono"
                        placeholder="e.g. 1850000"
                        value={receiptAmt}
                        onChange={(e) => setReceiptAmt(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">UTR</label>
                      <input
                        className="platform-search h-9 text-sm font-mono"
                        placeholder="Bank reference"
                        value={receiptUtr}
                        onChange={(e) => setReceiptUtr(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">Received date</label>
                      <input
                        className="platform-search h-9 text-sm w-full max-w-xs"
                        type="date"
                        value={receiptDate}
                        onChange={(e) => setReceiptDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="req-drawer-btn-primary text-xs"
                      disabled={saving || !receiptAmt.trim()}
                      onClick={() =>
                        run(async () => {
                          await queries.financeBillingWorkflowAddReceipt(detail.id, {
                            amount_inr: Number(receiptAmt.replace(/,/g, "")),
                            utr_reference: receiptUtr || null,
                            received_date: receiptDate || null,
                          });
                          setReceiptAmt("");
                          setReceiptUtr("");
                          setReceiptDate("");
                        })
                      }
                    >
                      Add receipt
                    </button>
                    <button
                      type="button"
                      className="req-drawer-btn-ghost text-xs"
                      disabled={saving}
                      onClick={() => run(() => queries.financeBillingWorkflowOverdueTick(detail.id))}
                    >
                      Log overdue escalation (stub)
                    </button>
                  </div>
                </FvSection>
              </div>
            )}

            {tab === "history" && (
              <FvSection title="Audit log" description="Immutable history of workflow actions (oldest at top, same order as from the API).">
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events recorded yet.</p>
                ) : (
                  <ul className="space-y-4">
                    {events.map((e) => (
                      <li key={e.id} className="flex gap-3">
                        <div
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent shadow-[0_0_0_3px_var(--background)]"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1 border-b border-border/50 pb-4 last:border-0 last:pb-0">
                          <p className="text-[11px] text-muted-foreground">{formatDateTimeHuman(e.created_at)}</p>
                          <p className="text-sm font-medium text-foreground mt-0.5">{eventActionLabel(e.action)}</p>
                          <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                            {e.user_id != null ? `Actor user #${e.user_id}` : "System / unspecified user"}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </FvSection>
            )}
          </div>
        )}
      </PlatformDrawer>
    </div>
  );
}
