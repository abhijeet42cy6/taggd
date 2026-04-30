import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge as TremorBadge,
  Button as TremorButton,
  Divider,
  Flex,
  Grid,
  Select,
  SelectItem,
  Switch,
  Tab,
  TabGroup,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
  TextInput,
  Title,
} from "@tremor/react";
import {
  queries,
  type FinanceBillingValidationEventRow,
  type FinanceBillingWorkflowDto,
  type RevenueBillingWithWorkflow,
} from "@/lib/api";
import { canAccessFinanceValidation, useAuth } from "@/lib/auth";
import { cn, formatDate, formatLargeCurrency } from "@/lib/utils";
import { TremorDashboardSection } from "@/components/tremor-dashboard/TremorDashboardSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterX, PanelRightOpen, Search } from "lucide-react";
import "@/styles/new-contract-panel.css";

const PM_NONE = "__pm_none__";
const FY_NONE = "__fy_none__";

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

function fvWorkflowTremorBadge(raw: string | null | undefined): {
  label: string;
  color: "emerald" | "rose" | "sky" | "violet" | "amber" | "slate";
} {
  const s = (raw || "draft").toLowerCase();
  const label = formatWorkflowLabel(raw);
  if (s === "fully_approved") return { label, color: "emerald" };
  if (s === "rejected") return { label, color: "rose" };
  if (s === "submitted" || s === "under_review") return { label, color: "sky" };
  if (s === "cfo_pending") return { label, color: "violet" };
  if (s === "disputed") return { label, color: "amber" };
  return { label, color: "slate" };
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

function FvNcpSection({
  icon,
  iconCls,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  iconCls: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ncp-section" style={{ marginBottom: 12 }}>
      <div className="ncp-section-header" style={{ cursor: "default" }}>
        <div className={cn("ncp-section-icon", iconCls)}>{icon}</div>
        <div style={{ minWidth: 0 }}>
          <div className="ncp-section-label">{title}</div>
          {description ? <div className="ncp-section-desc">{description}</div> : null}
        </div>
      </div>
      <div className="ncp-section-body" style={{ maxHeight: "none" }}>
        {children}
      </div>
    </div>
  );
}

function NcpReadRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="ncp-prop-row">
      <div className="ncp-prop-label">{label}</div>
      <div
        className={cn("ncp-prop-input", mono && "font-mono text-[13px]")}
        style={{
          cursor: "default",
          display: "flex",
          alignItems: "center",
          minHeight: 36,
        }}
      >
        {value ?? "—"}
      </div>
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

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedId(null);
    setDetail(null);
  }, []);

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

  const workflowTabIndex = useMemo(() => {
    const i = STATUS_CHIPS.findIndex((c) => c.value === status);
    return i >= 0 ? i : 0;
  }, [status]);

  function clearTableFilters() {
    setTableSearch("");
    setTableFy("all");
    setTablePm("all");
    setTableInvoice("all");
  }

  if (!allowed) {
    return (
      <div className="finance-validation-tremor space-y-7 pb-16 pt-2">
        <div className="min-w-0">
          <Title className="text-tremor-content-strong">Finance validation</Title>
          <Text className="mt-1 block text-sm font-medium text-tremor-content-emphasis">
            Invoice lifecycle, approvals, and collections governance.
          </Text>
        </div>
        <TremorDashboardSection tag="Access" title="Access restricted" noPad>
          <div className="border-t border-tremor-border bg-white px-6 py-6">
            <Text className="text-sm leading-relaxed text-tremor-content-emphasis">
              This screen is not in your navigation allow-list. Operations and client portal users need the{" "}
              <span className="font-semibold text-tremor-content-strong">finance_validation</span> vertical in{" "}
              <span className="font-semibold text-tremor-content-strong">Users &amp; access</span>. Other roles use role-based
              routing; recruiters do not have this module.
            </Text>
          </div>
        </TremorDashboardSection>
      </div>
    );
  }

  return (
    <div className="finance-validation-tremor space-y-7 pb-16 pt-2">
      <div className="min-w-0">
        <Title className="text-tremor-content-strong">Finance validation</Title>
        <Text className="mt-1 block text-sm font-medium text-tremor-content-emphasis">
          Queue for TAGGD billing rows — submit from Billing, then review, junior-validate, and CFO-approve when over threshold.
        </Text>
      </div>

      <TremorDashboardSection tag="Filters" title="Filters" action="Refresh" onAction={() => void load()} noPad>
        <div className="space-y-5 border-t border-tremor-border bg-white px-6 py-5">
          <div>
            <Text className="mb-3 text-xs font-semibold uppercase tracking-wide text-orange-600">Workflow status</Text>
            <TabGroup
              index={workflowTabIndex}
              onIndexChange={(i) => {
                const chip = STATUS_CHIPS[i];
                if (chip) setStatus(chip.value);
              }}
            >
              <TabList variant="line" color="orange" className="overflow-x-auto [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0">
                {STATUS_CHIPS.map(({ value: v, label }) => (
                  <Tab key={v || "all"}>{label}</Tab>
                ))}
              </TabList>
            </TabGroup>
            <Text className="mt-2 text-xs text-tremor-content-subtle">
              Loads billing rows in this lifecycle stage from the server — use Refresh after switching.
            </Text>
          </div>

          <Divider />

          <Grid numItems={1} numItemsMd={2} className="gap-4">
            <Flex
              justifyContent="between"
              alignItems="center"
              className="rounded-tremor-default border border-tremor-border bg-tremor-background-muted px-4 py-3 dark:bg-dark-tremor-background-muted"
            >
              <label htmlFor="fv-filter-mine" className="text-sm font-medium text-tremor-content-emphasis">
                Assigned to me
              </label>
              <Switch id="fv-filter-mine" checked={mine} onChange={(next) => setMine(next)} color="orange" />
            </Flex>
            <Flex
              justifyContent="between"
              alignItems="center"
              className="rounded-tremor-default border border-tremor-border bg-tremor-background-muted px-4 py-3 dark:bg-dark-tremor-background-muted"
            >
              <label htmlFor="fv-filter-overdue" className="min-w-0 flex-1 pr-3 text-sm font-medium text-tremor-content-emphasis">
                <span className="hidden sm:inline">Overdue — due passed, not approved</span>
                <span className="sm:hidden">Overdue only</span>
              </label>
              <Switch
                id="fv-filter-overdue"
                checked={overdueOnly}
                onChange={(next) => setOverdueOnly(next)}
                color="amber"
                tooltip="Due date passed and not fully approved"
              />
            </Flex>
          </Grid>

          <Flex justifyContent="end" alignItems="center">
            <Text className="text-xs tabular-nums text-tremor-content-subtle">
              {total} row{total === 1 ? "" : "s"} matching server filters
            </Text>
          </Flex>

          {err && !drawerOpen ? (
            <Text className="text-xs font-medium text-rose-600 dark:text-rose-400">{err}</Text>
          ) : null}
        </div>
      </TremorDashboardSection>

      <TremorDashboardSection
        tag="Queue"
        title="Queue"
        action="Refresh"
        onAction={() => void load()}
        noPad
        toolbar={
          <Grid numItems={1} numItemsSm={2} numItemsLg={6} className="items-end gap-3">
            <div className="lg:col-span-2">
              <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-600">Search</Text>
              <TextInput
                icon={Search}
                placeholder="Search ID, account, PM, invoice, FY, PRJ…"
                value={tableSearch}
                onValueChange={setTableSearch}
              />
            </div>
            <div>
              <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-600">Year</Text>
              <Select value={tableFy} onValueChange={setTableFy}>
                <SelectItem value="all">All years</SelectItem>
                {hasEmptyFy ? <SelectItem value={FY_NONE}>No FY set</SelectItem> : null}
                {distinctFiscalYears.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </Select>
            </div>
            <div>
              <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-600">PM</Text>
              <Select value={tablePm} onValueChange={setTablePm}>
                <SelectItem value="all">All PMs</SelectItem>
                {hasEmptyPm ? <SelectItem value={PM_NONE}>No PM set</SelectItem> : null}
                {distinctPMs.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </Select>
            </div>
            <div>
              <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-600">Invoice</Text>
              <Select
                value={tableInvoice}
                onValueChange={(v) => setTableInvoice(v as "all" | "has" | "none")}
              >
                <SelectItem value="all">All invoices</SelectItem>
                <SelectItem value="has">Has invoice #</SelectItem>
                <SelectItem value="none">No invoice</SelectItem>
              </Select>
            </div>
            <Flex justifyContent="end" alignItems="end" className="flex-col gap-2 sm:flex-row sm:items-end lg:flex-col lg:items-end">
              <Text className="text-right text-xs tabular-nums text-tremor-content-subtle">
                {tableFiltersActive ? `${filteredRows.length} of ${rows.length} shown` : `${rows.length} loaded`}
                {total > rows.length ? ` · ${total} total` : ""}
              </Text>
              {tableFiltersActive ? (
                <TremorButton
                  type="button"
                  variant="light"
                  color="orange"
                  size="xs"
                  icon={FilterX}
                  onClick={clearTableFilters}
                >
                  Clear filters
                </TremorButton>
              ) : null}
            </Flex>
          </Grid>
        }
      >
        <div className="overflow-x-auto border-t border-tremor-border bg-white px-2 pb-4 pt-2">
          <Table className="min-w-[980px]">
            <TableHead>
              <TableRow>
                <TableHeaderCell>ID</TableHeaderCell>
                <TableHeaderCell>Project</TableHeaderCell>
                <TableHeaderCell>Update</TableHeaderCell>
                <TableHeaderCell>FY</TableHeaderCell>
                <TableHeaderCell>PM</TableHeaderCell>
                <TableHeaderCell className="text-right">Net rev</TableHeaderCell>
                <TableHeaderCell className="text-right">MMF</TableHeaderCell>
                <TableHeaderCell>Invoice</TableHeaderCell>
                <TableHeaderCell>Due</TableHeaderCell>
                <TableHeaderCell>Workflow</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={11}>
                    <Text className="block py-10 text-center text-tremor-content-subtle">Loading…</Text>
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11}>
                    <Text className="block px-4 py-10 text-center text-tremor-content-subtle">
                      No rows match the filters above. Try another workflow status, assignment, or overdue toggle, then refresh.
                    </Text>
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading && rows.length > 0 && filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11}>
                    <Text className="block px-4 py-10 text-center text-tremor-content-subtle">
                      No rows match these table filters.{" "}
                      <button
                        type="button"
                        className="text-sm font-semibold text-orange-600 underline-offset-2 hover:underline dark:text-orange-400"
                        onClick={clearTableFilters}
                      >
                        Clear filters
                      </button>
                    </Text>
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading &&
                filteredRows.map((r) => {
                  const wfBadge = fvWorkflowTremorBadge(r.workflow?.validation_status);
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-tremor-background-muted dark:hover:bg-dark-tremor-background-muted"
                      onClick={() => void openRow(r.id)}
                    >
                      <TableCell className="tabular-nums text-xs font-medium text-orange-700 dark:text-orange-400">
                        {r.id}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <Text className="block text-xs font-semibold text-tremor-content-strong">{r.account_name || "—"}</Text>
                        <Text className="mt-0.5 block text-[10px] tabular-nums text-tremor-content-subtle">
                          PRJ-{r.project_id}
                        </Text>
                      </TableCell>
                      <TableCell className="tabular-nums text-xs text-tremor-content-emphasis">
                        {r.update_date?.slice(0, 10) || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-tremor-content-subtle">{r.fiscal_year_label || "—"}</TableCell>
                      <TableCell
                        className="max-w-[120px] truncate text-xs text-tremor-content-subtle"
                        title={r.project_manager || ""}
                      >
                        {r.project_manager || "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-tremor-content-strong">
                        {r.net_revenue_inr != null ? formatLargeCurrency(r.net_revenue_inr) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-tremor-content-strong">
                        {r.mmf_inr != null ? formatLargeCurrency(r.mmf_inr) : "—"}
                      </TableCell>
                      <TableCell
                        className={`max-w-[120px] truncate text-xs tabular-nums ${r.invoice_number ? "text-orange-700 dark:text-orange-400" : "text-tremor-content-subtle"}`}
                        title={r.invoice_number || ""}
                      >
                        {r.invoice_number || "—"}
                      </TableCell>
                      <TableCell className="tabular-nums text-xs text-tremor-content-emphasis">
                        {r.payment_due_date?.slice(0, 10) || "—"}
                      </TableCell>
                      <TableCell>
                        <TremorBadge color={wfBadge.color} size="sm">
                          {wfBadge.label}
                        </TremorBadge>
                      </TableCell>
                      <TableCell
                        className="text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <TremorButton
                          type="button"
                          variant="light"
                          color="orange"
                          size="xs"
                          icon={PanelRightOpen}
                          className="shrink-0"
                          onClick={() => void openRow(r.id)}
                          title="Open validation drawer"
                        >
                          Open
                        </TremorButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </TremorDashboardSection>

      <Sheet
        open={drawerOpen}
        onOpenChange={(o) => {
          if (!o) closeDrawer();
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
          <div className="new-contract-sheet flex min-h-0 flex-1 flex-col">
            <div className="ncp-scroll min-h-0 flex-1">
              <div className="ncp-page">
                <div className="ncp-header">
                  <div style={{ minWidth: 0 }}>
                    <div className="ncp-breadcrumb">
                      <span>Finance</span>
                      <span className="ncp-breadcrumb-sep">›</span>
                      <span>Validation</span>
                      <span className="ncp-breadcrumb-sep">›</span>
                      <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 10 }}>
                        {detail ? `BIL-${detail.id}` : "—"}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: "10px 14px",
                        marginTop: 2,
                      }}
                    >
                      <h1 className="ncp-h1" style={{ margin: 0 }}>
                        {detail ? `Billing #${detail.id}` : "Billing"}
                      </h1>
                      {wf ? (
                        <Badge
                          variant="outline"
                          className={cn("shrink-0 border text-[10px] font-medium", workflowBadgeClass(st))}
                        >
                          {titleCaseStatus(wf.validation_status)}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="ncp-subtitle" style={{ marginTop: 6 }}>
                      {drawerSubtitle ||
                        "Open a queue row to confirm invoice details, validate, and record receipts."}
                    </p>
                  </div>
                  <button type="button" className="ncp-close-btn" aria-label="Close" onClick={closeDrawer}>
                    ✕
                  </button>
                </div>

                {!detail ? (
                  <p className="ncp-hint" style={{ marginBottom: 14 }}>
                    Loading…
                  </p>
                ) : (
                  <>
                    <p className="ncp-hint" style={{ marginBottom: 14 }}>
                      <span aria-hidden>●</span> What this sheet is for — confirm invoice details, capture validation notes,
                      record receipts, and advance workflow from the footer. Use <strong>Audit log</strong> for the change
                      trail.
                    </p>

                    <div className="ncp-steps" role="tablist" aria-label="Billing workflow sections" style={{ marginBottom: 18 }}>
                      {DRAWER_TABS.map(({ id, label }, i) => (
                        <button
                          key={id}
                          type="button"
                          role="tab"
                          aria-selected={tab === id}
                          className={cn("ncp-step", tab === id && "ncp-active")}
                          onClick={() => setTab(id)}
                        >
                          <span className="ncp-step-num">{i + 1}</span>
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className={cn("ncp-panel", tab === "summary" && "ncp-panel-active")}>
                      <div className="flex flex-col gap-0">
                        <FvNcpSection
                          icon="◇"
                          iconCls="ncp-blue"
                          title="Invoice & billing row"
                          description="Core commercial fields from the TAGGD billing record."
                        >
                          <NcpReadRow label="Account" value={detail.account_name || "—"} />
                          <NcpReadRow label="Project" value={`PRJ-${detail.project_id}`} mono />
                          <NcpReadRow label="Invoice number" value={detail.invoice_number || "—"} mono />
                          <NcpReadRow
                            label="Invoice amount"
                            value={
                              detail.invoice_amount_inr != null ? formatLargeCurrency(detail.invoice_amount_inr) : "—"
                            }
                            mono
                          />
                          <NcpReadRow
                            label="Payment due"
                            value={detail.payment_due_date ? formatDate(detail.payment_due_date) : "—"}
                            mono
                          />
                          <NcpReadRow
                            label="Update date"
                            value={detail.update_date ? formatDate(detail.update_date) : "—"}
                            mono
                          />
                        </FvNcpSection>

                        {!wf ? (
                          <p
                            className="ncp-hint"
                            style={{
                              marginBottom: 12,
                              padding: "12px 14px",
                              border: "1px dashed var(--ncp-border)",
                              borderRadius: "var(--ncp-radius)",
                            }}
                          >
                            No finance workflow envelope for this billing row yet — collections and approvals appear after
                            submission from Billing.
                          </p>
                        ) : (
                          <>
                            <FvNcpSection
                              icon="◇"
                              iconCls="ncp-amber"
                              title="Collections & CFO rule"
                              description="Outstanding = invoice less recorded receipts. CFO sign-off applies when amount meets threshold."
                            >
                              <NcpReadRow
                                label="Outstanding (calculated)"
                                value={
                                  wf.outstanding_inr != null ? formatLargeCurrency(wf.outstanding_inr) : "—"
                                }
                                mono
                              />
                              <NcpReadRow
                                label="Recorded receipts (total)"
                                value={
                                  wf.amount_received_inr != null
                                    ? formatLargeCurrency(wf.amount_received_inr)
                                    : "—"
                                }
                                mono
                              />
                              <NcpReadRow
                                label="CFO threshold"
                                value={
                                  wf.cfo_threshold_inr != null ? formatLargeCurrency(wf.cfo_threshold_inr) : "—"
                                }
                                mono
                              />
                              <NcpReadRow
                                label="Partial payment"
                                value={
                                  wf.partial_payment === true
                                    ? "Yes"
                                    : wf.partial_payment === false
                                      ? "No"
                                      : "—"
                                }
                              />
                            </FvNcpSection>

                            <FvNcpSection
                              icon="◇"
                              iconCls="ncp-green"
                              title="Approval timeline"
                              description="Key milestones in this finance workflow."
                            >
                              <NcpReadRow label="Submitted to finance" value={formatDateTimeHuman(wf.practice_submitted_at)} />
                              <NcpReadRow label="Review started" value={formatDateTimeHuman(wf.finance_review_started_at)} />
                              <NcpReadRow label="Junior validated" value={formatDateTimeHuman(wf.junior_validated_at)} />
                              <NcpReadRow label="CFO approved" value={formatDateTimeHuman(wf.cfo_approved_at)} />
                              <NcpReadRow
                                label="CFO sign-off acknowledged"
                                value={
                                  wf.cfo_sign_off_acknowledged === true
                                    ? "Yes"
                                    : wf.cfo_sign_off_acknowledged === false
                                      ? "No"
                                      : "—"
                                }
                              />
                            </FvNcpSection>
                          </>
                        )}
                      </div>
                    </div>

                    <div className={cn("ncp-panel", tab === "validation" && "ncp-panel-active")}>
                      <FvNcpSection
                        icon="◇"
                        iconCls="ncp-red"
                        title="Dispute & reject context"
                        description="Required when sending back to practice (dispute). Also used if you reject from the footer."
                      >
                        <label className="ncp-micro-label" htmlFor="fv-disc-note" style={{ display: "block", marginBottom: 6 }}>
                          Note to project team
                        </label>
                        <textarea
                          id="fv-disc-note"
                          className="ncp-prop-input"
                          value={discNote}
                          onChange={(e) => setDiscNote(e.target.value)}
                          placeholder="e.g. GST mismatch on March invoice — please re-upload supporting…"
                          rows={4}
                        />
                      </FvNcpSection>

                      <FvNcpSection
                        icon="◇"
                        iconCls="ncp-orange"
                        title="Payment & tax validation"
                        description="Saved on the workflow — use Save after edits."
                      >
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Payment mode</div>
                          <input
                            className="ncp-prop-input"
                            value={wfForm.payment_mode}
                            onChange={(e) => setWfForm((f) => ({ ...f, payment_mode: e.target.value }))}
                            placeholder="NEFT, RTGS, cheque…"
                          />
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">UTR / reference</div>
                          <input
                            className="ncp-prop-input font-mono"
                            value={wfForm.payment_reference_utr}
                            onChange={(e) => setWfForm((f) => ({ ...f, payment_reference_utr: e.target.value }))}
                            placeholder="Bank reference"
                          />
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">GST reconciliation</div>
                          <input
                            className="ncp-prop-input"
                            value={wfForm.gst_reconciliation_status}
                            onChange={(e) => setWfForm((f) => ({ ...f, gst_reconciliation_status: e.target.value }))}
                            placeholder="Matched, pending, mismatch…"
                          />
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">TDS deducted (INR)</div>
                          <input
                            className="ncp-prop-input font-mono"
                            value={wfForm.tds_deducted_inr}
                            onChange={(e) => setWfForm((f) => ({ ...f, tds_deducted_inr: e.target.value }))}
                            placeholder="0"
                          />
                        </div>
                        <div style={{ marginTop: 14 }}>
                          <button
                            type="button"
                            className="ncp-btn ncp-btn-primary"
                            disabled={saving || !detail}
                            onClick={() =>
                              detail &&
                              run(() =>
                                queries.financeBillingWorkflowPatch(detail.id, {
                                  payment_mode: wfForm.payment_mode || null,
                                  payment_reference_utr: wfForm.payment_reference_utr || null,
                                  gst_reconciliation_status: wfForm.gst_reconciliation_status || null,
                                  discrepancy_notes: wfForm.discrepancy_notes || null,
                                  tds_deducted_inr: wfForm.tds_deducted_inr.trim()
                                    ? Number(wfForm.tds_deducted_inr.replace(/,/g, ""))
                                    : null,
                                }),
                              )
                            }
                          >
                            Save validation fields
                          </button>
                        </div>
                      </FvNcpSection>
                    </div>

                    <div className={cn("ncp-panel", tab === "payments" && "ncp-panel-active")}>
                      <FvNcpSection
                        icon="◇"
                        iconCls="ncp-blue"
                        title="Recorded receipts"
                        description={`${(wf?.payment_receipts ?? []).length} receipt(s) on file for this billing row.`}
                      >
                        {(wf?.payment_receipts ?? []).length === 0 ? (
                          <p className="ncp-hint" style={{ margin: 0 }}>
                            No receipts yet — add one below.
                          </p>
                        ) : (
                          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                            {(wf?.payment_receipts ?? []).map((p) => (
                              <li
                                key={p.id}
                                className="ncp-prop-input"
                                style={{
                                  cursor: "default",
                                  display: "block",
                                  padding: "10px 12px",
                                }}
                              >
                                <div style={{ fontWeight: 600, fontFamily: "var(--ncp-mono)", fontSize: 13 }}>
                                  {formatLargeCurrency(p.amount_inr)}
                                </div>
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: "var(--ncp-text-muted)",
                                    marginTop: 6,
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: "4px 12px",
                                  }}
                                >
                                  <span>UTR: {p.utr_reference || "—"}</span>
                                  <span>Date: {p.received_date ? formatDate(p.received_date) : "—"}</span>
                                  {p.partial ? <span style={{ color: "#b45309" }}>Partial</span> : null}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </FvNcpSection>

                      <FvNcpSection
                        icon="◇"
                        iconCls="ncp-green"
                        title="Add receipt"
                        description="Post a bank receipt against this invoice."
                      >
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Amount (INR)</div>
                          <input
                            className="ncp-prop-input font-mono"
                            placeholder="e.g. 1850000"
                            value={receiptAmt}
                            onChange={(e) => setReceiptAmt(e.target.value)}
                          />
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">UTR</div>
                          <input
                            className="ncp-prop-input font-mono"
                            placeholder="Bank reference"
                            value={receiptUtr}
                            onChange={(e) => setReceiptUtr(e.target.value)}
                          />
                        </div>
                        <div className="ncp-prop-row">
                          <div className="ncp-prop-label">Received date</div>
                          <input className="ncp-prop-input" type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
                        </div>
                        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
                          <button
                            type="button"
                            className="ncp-btn ncp-btn-primary"
                            disabled={saving || !receiptAmt.trim() || !detail}
                            onClick={() =>
                              detail &&
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
                            className="ncp-btn ncp-btn-ghost"
                            disabled={saving || !detail}
                            onClick={() => detail && run(() => queries.financeBillingWorkflowOverdueTick(detail.id))}
                          >
                            Log overdue escalation (stub)
                          </button>
                        </div>
                      </FvNcpSection>
                    </div>

                    <div className={cn("ncp-panel", tab === "history" && "ncp-panel-active")}>
                      <FvNcpSection
                        icon="◇"
                        iconCls="ncp-accent"
                        title="Audit log"
                        description="Immutable history of workflow actions (oldest first, API order)."
                      >
                        {events.length === 0 ? (
                          <p className="ncp-hint" style={{ margin: 0 }}>
                            No events recorded yet.
                          </p>
                        ) : (
                          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                            {events.map((e) => (
                              <li
                                key={e.id}
                                className="ncp-prop-row"
                                style={{ alignItems: "flex-start", borderBottom: "1px solid var(--ncp-border)", marginBottom: 0 }}
                              >
                                <div
                                  className="ncp-prop-label"
                                  style={{ alignSelf: "flex-start", paddingTop: 4 }}
                                  aria-hidden
                                >
                                  ●
                                </div>
                                <div style={{ minWidth: 0, paddingBottom: 12 }}>
                                  <p style={{ fontSize: 11, color: "var(--ncp-text-muted)", margin: 0 }}>
                                    {formatDateTimeHuman(e.created_at)}
                                  </p>
                                  <p style={{ fontSize: 13, fontWeight: 500, margin: "6px 0 0", color: "var(--ncp-text-primary)" }}>
                                    {eventActionLabel(e.action)}
                                  </p>
                                  <p
                                    style={{
                                      fontSize: 11,
                                      fontFamily: "var(--ncp-mono)",
                                      color: "var(--ncp-text-muted)",
                                      margin: "4px 0 0",
                                    }}
                                  >
                                    {e.user_id != null ? `Actor user #${e.user_id}` : "System / unspecified user"}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </FvNcpSection>
                    </div>

                    {err && drawerOpen ? (
                      <div
                        style={{
                          margin: "12px 0 0",
                          padding: "10px 14px",
                          background: "rgba(239,68,68,0.07)",
                          border: "1px solid rgba(239,68,68,0.25)",
                          borderRadius: "var(--ncp-radius)",
                          fontSize: 12,
                          color: "#b91c1c",
                        }}
                        role="alert"
                      >
                        {err}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {detail && wf ? (
              <div className="ncp-footer">
                <span style={{ fontSize: 12, color: "var(--ncp-text-muted)" }}>Esc to close</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", flex: 1 }}>
                  <button type="button" className="ncp-btn ncp-btn-ghost" onClick={closeDrawer} disabled={saving}>
                    Close
                  </button>
                  {st === "submitted" ? (
                    <button
                      type="button"
                      className="ncp-btn ncp-btn-primary"
                      disabled={saving}
                      onClick={() => run(() => queries.financeBillingWorkflowStartReview(detail.id))}
                    >
                      Start review
                    </button>
                  ) : null}
                  {(st === "submitted" || st === "under_review") && (
                    <button
                      type="button"
                      className="ncp-btn ncp-btn-primary"
                      style={{ background: "#f59e0b", boxShadow: "0 1px 3px rgba(245,158,11,0.35)" }}
                      disabled={saving || !discNote.trim()}
                      onClick={() => run(() => queries.financeBillingWorkflowDispute(detail.id, discNote.trim()))}
                    >
                      Dispute → practice
                    </button>
                  )}
                  {st === "under_review" ? (
                    <button
                      type="button"
                      className="ncp-btn ncp-btn-primary"
                      disabled={saving}
                      onClick={() => run(() => queries.financeBillingWorkflowJuniorApprove(detail.id))}
                    >
                      Junior validate / approve
                    </button>
                  ) : null}
                  {st === "cfo_pending" ? (
                    <button
                      type="button"
                      className="ncp-btn ncp-btn-primary"
                      disabled={saving}
                      onClick={() => run(() => queries.financeBillingWorkflowCfoApprove(detail.id, true))}
                    >
                      CFO sign-off
                    </button>
                  ) : null}
                  {(st === "submitted" || st === "under_review" || st === "cfo_pending") && (
                    <button
                      type="button"
                      className="ncp-btn ncp-btn-ghost"
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
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
