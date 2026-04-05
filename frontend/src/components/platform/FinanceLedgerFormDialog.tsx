import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { financeLedgerApi, queries, type Project } from "@/lib/api";
import type { FinanceRowVm } from "@/lib/view-models/finance";
import { SearchableProjectPicker, SearchableStringPicker } from "@/components/platform/searchable-pickers";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledgerRows: FinanceRowVm[];
  onSaved: () => void;
};

function defaultMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthInputFromRow(r: FinanceRowVm): string {
  const ms = r.month_sort?.trim();
  if (ms && /^\d{4}-\d{2}/.test(ms)) return ms.slice(0, 7);
  return defaultMonth();
}

function parseNum(s: string): number {
  const t = s.trim().replace(/,/g, "");
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

const emptyAmounts = {
  revBudget: "",
  revForecast: "",
  revActual: "",
  cmActual: "",
  actualHeadcountWl1: "",
  unbilled: "",
  collectionTarget: "",
  collected: "",
  badDebt: "",
  adjustments: "",
};

const FINANCE_MONTH_INPUT_ID = "finance-ledger-reporting-month";

export function FinanceLedgerFormDialog({ open, onOpenChange, ledgerRows, onSaved }: Props) {
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState<number | "">("");
  const [reportingMonth, setReportingMonth] = useState(defaultMonth());
  const [editAccount, setEditAccount] = useState("");
  const [editMonthLabel, setEditMonthLabel] = useState("");

  const [form, setForm] = useState(emptyAmounts);

  const accountsInLedger = useMemo(() => {
    const s = new Set<string>();
    for (const r of ledgerRows) {
      if (r.account_name) s.add(r.account_name);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [ledgerRows]);

  const monthsForEditAccount = useMemo(() => {
    if (!editAccount) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of ledgerRows) {
      if (r.account_name !== editAccount) continue;
      const lab = String(r.month ?? "").trim();
      if (!lab || seen.has(lab)) continue;
      seen.add(lab);
      out.push(lab);
    }
    return out.sort((a, b) => {
      const ra = ledgerRows.find((x) => x.month === a && x.account_name === editAccount);
      const rb = ledgerRows.find((x) => x.month === b && x.account_name === editAccount);
      return String(ra?.month_sort ?? a).localeCompare(String(rb?.month_sort ?? b));
    });
  }, [ledgerRows, editAccount]);

  const applyRow = useCallback((r: FinanceRowVm) => {
    setProjectId(r.project_id ?? "");
    setReportingMonth(monthInputFromRow(r));
    setForm({
      revBudget: String(r.rev_budget_inr ?? 0),
      revForecast: String(r.rev_forecast_inr ?? 0),
      revActual: String(r.rev_actual_inr ?? 0),
      cmActual: String(r.cm_actual_inr ?? 0),
      actualHeadcountWl1: String(r.actual_headcount_wl1 ?? 0),
      unbilled: String(r.unbilled_inr ?? 0),
      collectionTarget: String(r.collection_target_inr ?? 0),
      collected: String(r.collected_inr ?? 0),
      badDebt: String(r.bad_debt_inr ?? 0),
      adjustments: "0",
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMode("create");
    setProjectId("");
    setReportingMonth(defaultMonth());
    setEditAccount("");
    setEditMonthLabel("");
    setForm(emptyAmounts);
    setLoadingProjects(true);
    queries
      .projects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [open]);

  useEffect(() => {
    if (!open || mode !== "edit" || !editAccount || !editMonthLabel) return;
    const row = ledgerRows.find(
      (r) => r.account_name === editAccount && r.month === editMonthLabel,
    );
    if (row) applyRow(row);
  }, [open, mode, editAccount, editMonthLabel, ledgerRows, applyRow]);

  const setField = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const pid = mode === "create" ? Number(projectId) : Number(projectId);
    if (!pid || Number.isNaN(pid)) {
      setError(mode === "create" ? "Select a client from the list." : "Missing project for this row.");
      return;
    }
    if (!projects.some((p) => p.id === pid)) {
      setError("Choose a valid client project.");
      return;
    }
    if (!reportingMonth || reportingMonth.length < 7) {
      setError("Set reporting month (YYYY-MM).");
      return;
    }
    if (mode === "edit" && (!editAccount.trim() || !editMonthLabel.trim())) {
      setError("Select client and month for the row to update.");
      return;
    }
    setSaving(true);
    try {
      await financeLedgerApi.upsert({
        project_id: pid,
        reporting_month: reportingMonth.slice(0, 7),
        rev_budget: parseNum(form.revBudget),
        rev_forecast: parseNum(form.revForecast),
        rev_actual: parseNum(form.revActual),
        cm_actual: parseNum(form.cmActual),
        unbilled: parseNum(form.unbilled),
        collection_target: parseNum(form.collectionTarget),
        collected: parseNum(form.collected),
        bad_debt: parseNum(form.badDebt),
        adjustments: parseNum(form.adjustments),
        actual_headcount_wl1: parseNum(form.actualHeadcountWl1),
      });
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "platform-dialog platform-dialog--xl",
          "!fixed !left-1/2 !top-[4vh] !z-50 !max-h-[92vh] !h-[92vh] !translate-x-[-50%] !translate-y-0 !gap-0",
          "flex flex-col overflow-hidden",
        )}
      >
        <DialogHeader className="platform-dialog__header shrink-0 border-b border-border/60 px-5 py-4">
          <div className="platform-dialog__eyebrow">Finance · Ledger</div>
          <DialogTitle className="platform-dialog__title">Add or update finance data</DialogTitle>
          <DialogDescription className="platform-dialog__desc">
            Writes one client-month row: revenue (ledger), contribution margin (ledger), cashflow (unbilled,
            collections, bad debt), and WL1 headcount (same field as the Actual Headcount WL1 sheet).
            Currency amounts are full INR (same units as the finance upload and table); WL1 HC is a headcount, not INR.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="platform-dialog__body platform-dialog__body--tall min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="flex flex-wrap gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="fin-mode"
                  checked={mode === "create"}
                  onChange={() => {
                    setMode("create");
                    setProjectId("");
                    setReportingMonth(defaultMonth());
                    setEditAccount("");
                    setEditMonthLabel("");
                    setForm(emptyAmounts);
                  }}
                />
                New client-month
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="fin-mode"
                  checked={mode === "edit"}
                  onChange={() => {
                    setMode("edit");
                    setEditAccount("");
                    setEditMonthLabel("");
                    setForm(emptyAmounts);
                  }}
                  disabled={ledgerRows.length === 0}
                />
                Update existing row
                {ledgerRows.length === 0 ? (
                  <span className="text-muted-foreground">(no ledger data yet)</span>
                ) : null}
              </label>
            </div>

            {mode === "create" && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Client / project *
                </label>
                <SearchableProjectPicker
                  projects={projects}
                  loading={loadingProjects}
                  projectId={projectId}
                  onProjectIdChange={setProjectId}
                />
                <p className="text-muted-foreground text-[10px]">Type to search, then pick a row from the list.</p>
              </div>
            )}

            {mode === "edit" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1 md:min-w-0">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Client *
                  </label>
                  <SearchableStringPicker
                    items={accountsInLedger}
                    value={editAccount}
                    onChange={(acc) => {
                      setEditAccount(acc);
                      setEditMonthLabel("");
                    }}
                    placeholder="Type to search clients…"
                    emptyHint={accountsInLedger.length === 0 ? "Upload finance data or create a new row first." : undefined}
                  />
                </div>
                <div className="space-y-1 md:min-w-0">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Month *
                  </label>
                  <SearchableStringPicker
                    items={monthsForEditAccount}
                    value={editMonthLabel}
                    onChange={setEditMonthLabel}
                    placeholder={editAccount ? "Type to search month…" : "—"}
                    disabled={!editAccount}
                  />
                  {!editAccount ? (
                    <p className="text-muted-foreground mt-1 text-[10px]">Choose a client first.</p>
                  ) : monthsForEditAccount.length === 0 ? (
                    <p className="text-muted-foreground mt-1 text-[10px]">No months for this client.</p>
                  ) : null}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label
                htmlFor={FINANCE_MONTH_INPUT_ID}
                className={cn(
                  "block w-full space-y-1.5",
                  mode === "edit" && editAccount && editMonthLabel
                    ? "cursor-not-allowed"
                    : "cursor-pointer",
                )}
              >
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Reporting month *
                </span>
                <input
                  id={FINANCE_MONTH_INPUT_ID}
                  type="month"
                  className={cn(
                    "platform-search block min-h-11 w-full max-w-none py-2.5",
                    "cursor-pointer accent-[var(--accent)]",
                    "disabled:cursor-not-allowed disabled:opacity-70",
                  )}
                  value={reportingMonth}
                  onChange={(e) => setReportingMonth(e.target.value)}
                  disabled={mode === "edit" && Boolean(editAccount && editMonthLabel)}
                  onClick={(e) => {
                    const el = e.currentTarget;
                    if (el.disabled) return;
                    try {
                      el.showPicker?.();
                    } catch {
                      /* ignore — some browsers only allow showPicker from direct user gesture */
                    }
                  }}
                />
              </label>
              <p className="text-muted-foreground text-[10px]">
                Stored as the first day of the month. In edit mode, locked when a client-month row is selected.
              </p>
            </div>

            <div className="platform-dialog__section-label border-t border-border/60 pt-4">Revenue (ledger)</div>
            <div className="grid gap-3 md:grid-cols-3">
              {(
                [
                  ["revBudget", "Budget (INR)"],
                  ["revForecast", "Forecast (INR)"],
                  ["revActual", "Actual (INR)"],
                ] as const
              ).map(([key, lab]) => (
                <div key={key} className="space-y-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{lab}</label>
                  <input
                    className="platform-search w-full max-w-none font-mono text-xs"
                    inputMode="decimal"
                    value={form[key]}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div className="platform-dialog__section-label">Contribution margin (ledger)</div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  CM actual (INR)
                </label>
                <input
                  className="platform-search w-full max-w-none font-mono text-xs"
                  inputMode="decimal"
                  value={form.cmActual}
                  onChange={(e) => setField("cmActual", e.target.value)}
                />
              </div>
            </div>

            <div className="platform-dialog__section-label">Headcount (finance)</div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Actual WL1 HC
                </label>
                <input
                  className="platform-search w-full max-w-none font-mono text-xs"
                  inputMode="decimal"
                  value={form.actualHeadcountWl1}
                  onChange={(e) => setField("actualHeadcountWl1", e.target.value)}
                />
                <p className="text-muted-foreground text-[10px]">
                  Work level 1 headcount (may include decimals). Stored with ledger month; same as ingest sheet Actual
                  Headcount WL1.
                </p>
              </div>
            </div>

            <div className="platform-dialog__section-label">Cashflow</div>
            <div className="grid gap-3 md:grid-cols-2">
              {(
                [
                  ["unbilled", "Unbilled (INR)"],
                  ["collectionTarget", "Collection target (INR)"],
                  ["collected", "Collected (INR)"],
                  ["badDebt", "Bad debt (INR)"],
                  ["adjustments", "Adjustments (INR)"],
                ] as const
              ).map(([key, lab]) => (
                <div key={key} className="space-y-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{lab}</label>
                  <input
                    className="platform-search w-full max-w-none font-mono text-xs"
                    inputMode="decimal"
                    value={form[key]}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                </div>
              ))}
            </div>

            {error ? (
              <div className="platform-dialog__alert" role="alert">
                {error}
              </div>
            ) : null}
          </div>

          <div className="platform-dialog__footer mt-0 shrink-0 flex flex-row justify-end gap-2 border-t border-border/60">
            <button
              type="button"
              className="platform-dialog__btn"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="platform-dialog__btn platform-dialog__btn--primary" disabled={saving}>
              {saving ? "Saving…" : "Save to ledger"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
