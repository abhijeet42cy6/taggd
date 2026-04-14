import React, { useCallback, useEffect, useState } from "react";
import {
  queries,
  type FinanceBillingValidationEventRow,
  type FinanceBillingWorkflowDto,
  type RevenueBillingWithWorkflow,
} from "@/lib/api";
import { canAccessFinanceValidation, useAuth } from "@/lib/auth";
import { formatLargeCurrency } from "@/lib/utils";
import { PageHeader, PlatformSection } from "@/components/platform/PlatformBlocks";
import { PlatformDrawer } from "@/components/platform/PlatformDrawer";

const STATUS_OPTIONS = [
  "",
  "draft",
  "submitted",
  "under_review",
  "disputed",
  "cfo_pending",
  "fully_approved",
  "rejected",
] as const;

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

      <PlatformSection title="Filters">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground font-mono mb-1">Status</div>
            <select
              className="platform-search h-9 text-xs min-w-[180px]"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s || "all"} value={s}>
                  {s === "" ? "All statuses" : s}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs font-mono cursor-pointer">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            Assigned to me
          </label>
          <label className="flex items-center gap-2 text-xs font-mono cursor-pointer">
            <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
            Overdue (due date passed, not fully approved)
          </label>
          <button type="button" className="platform-dialog__btn text-xs font-mono" onClick={() => void load()}>
            Refresh
          </button>
          <span className="text-[10px] text-muted-foreground font-mono ml-auto">{total} row(s)</span>
        </div>
        {err && !drawerOpen ? <div className="text-xs text-destructive font-mono mt-2">{err}</div> : null}
      </PlatformSection>

      <PlatformSection title="Queue">
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 font-mono">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8">No rows match filters.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 font-mono text-[9px] uppercase text-muted-foreground">
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Due</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const w = r.workflow as FinanceBillingWorkflowDto | undefined;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-border/40 hover:bg-muted/10 cursor-pointer"
                      onClick={() => void openRow(r.id)}
                    >
                      <td className="px-3 py-2 font-mono text-primary">{r.id}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate">{r.account_name}</td>
                      <td className="px-3 py-2 font-mono">{w?.validation_status ?? "—"}</td>
                      <td className="px-3 py-2 font-mono truncate max-w-[120px]">{r.invoice_number || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {r.invoice_amount_inr != null ? formatLargeCurrency(r.invoice_amount_inr) : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono">{r.payment_due_date || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PlatformSection>

      <PlatformDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedId(null);
          setDetail(null);
        }}
        title={detail ? `Billing #${detail.id}` : "Billing"}
        subtitle={wf ? `Status: ${wf.validation_status}` : ""}
        width={520}
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
          <p className="text-xs text-muted-foreground font-mono">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2 text-[10px] font-mono">
              {(["summary", "validation", "payments", "history"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`px-2 py-1 rounded border ${tab === t ? "bg-accent text-accent-foreground border-accent" : "border-border"}`}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === "summary" && (
              <div className="space-y-2 text-xs font-mono">
                <div>
                  <span className="text-muted-foreground">Outstanding (calc):</span>{" "}
                  {wf?.outstanding_inr != null ? formatLargeCurrency(wf.outstanding_inr) : "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">CFO threshold (INR):</span> {wf?.cfo_threshold_inr ?? "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Submitted:</span> {wf?.practice_submitted_at ?? "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Junior validated:</span> {wf?.junior_validated_at ?? "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">CFO approved:</span> {wf?.cfo_approved_at ?? "—"}
                </div>
              </div>
            )}

            {tab === "validation" && (
              <div className="space-y-3">
                <label className="block text-[10px] uppercase text-muted-foreground font-mono">Dispute / reject note</label>
                <textarea
                  className="platform-search w-full min-h-[72px] text-xs"
                  value={discNote}
                  onChange={(e) => setDiscNote(e.target.value)}
                  placeholder="Required to dispute; optional for reject"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground font-mono">Payment mode</label>
                    <input
                      className="platform-search w-full h-8 text-xs mt-1"
                      value={wfForm.payment_mode}
                      onChange={(e) => setWfForm((f) => ({ ...f, payment_mode: e.target.value }))}
                      placeholder="NEFT / RTGS / …"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground font-mono">UTR</label>
                    <input
                      className="platform-search w-full h-8 text-xs mt-1"
                      value={wfForm.payment_reference_utr}
                      onChange={(e) => setWfForm((f) => ({ ...f, payment_reference_utr: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground font-mono">GST recon</label>
                    <input
                      className="platform-search w-full h-8 text-xs mt-1"
                      value={wfForm.gst_reconciliation_status}
                      onChange={(e) => setWfForm((f) => ({ ...f, gst_reconciliation_status: e.target.value }))}
                      placeholder="matched / mismatch / pending"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground font-mono">TDS (INR)</label>
                    <input
                      className="platform-search w-full h-8 text-xs mt-1"
                      value={wfForm.tds_deducted_inr}
                      onChange={(e) => setWfForm((f) => ({ ...f, tds_deducted_inr: e.target.value }))}
                    />
                  </div>
                </div>
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
              </div>
            )}

            {tab === "payments" && (
              <div className="space-y-3">
                <div className="text-[10px] text-muted-foreground font-mono">
                  Receipts: {(wf?.payment_receipts ?? []).length}
                </div>
                {(wf?.payment_receipts ?? []).map((p) => (
                  <div key={p.id} className="text-xs font-mono border border-border/50 rounded p-2">
                    {formatLargeCurrency(p.amount_inr)} · {p.utr_reference || "—"} · {p.received_date || "—"}
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="platform-search h-8 text-xs"
                    placeholder="Amount INR"
                    value={receiptAmt}
                    onChange={(e) => setReceiptAmt(e.target.value)}
                  />
                  <input
                    className="platform-search h-8 text-xs"
                    placeholder="UTR"
                    value={receiptUtr}
                    onChange={(e) => setReceiptUtr(e.target.value)}
                  />
                  <input
                    className="platform-search h-8 text-xs col-span-2"
                    type="date"
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                  />
                </div>
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
                  Record overdue escalation tick (stub)
                </button>
              </div>
            )}

            {tab === "history" && (
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {events.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No events yet.</p>
                ) : (
                  events.map((e) => (
                    <div key={e.id} className="text-[10px] font-mono border-b border-border/40 pb-2">
                      <div className="text-muted-foreground">{e.created_at}</div>
                      <div>{e.action}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </PlatformDrawer>
    </div>
  );
}
