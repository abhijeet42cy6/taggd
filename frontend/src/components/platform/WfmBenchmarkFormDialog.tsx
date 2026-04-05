import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { queries, wfmBenchmarkApi, type Project } from "@/lib/api";
import type { WfmBenchmarkRowVm } from "@/lib/view-models/wfm";
import { SearchableProjectPicker, SearchableStringPicker } from "@/components/platform/searchable-pickers";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wfmRows: WfmBenchmarkRowVm[];
  onSaved: () => void;
};

function defaultMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthFromReportingDate(iso: string | null | undefined): string {
  const s = String(iso ?? "").trim();
  if (s.length >= 7 && /^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  return defaultMonth();
}

function parseNum(s: string): number {
  const t = s.trim().replace(/,/g, "");
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function parseIntSafe(s: string): number {
  const n = Math.round(parseNum(s));
  return Number.isFinite(n) ? n : 0;
}

const emptyForm = {
  lateralRevenue: "",
  lateralHcTarget: "",
  lateralProductivity: "",
  idealHc: "",
  actualHcTotal: "",
  wl1: "",
  wl2: "",
  wl3: "",
  wl4: "",
};

const WFM_MONTH_INPUT_ID = "wfm-benchmark-reporting-month";

export function WfmBenchmarkFormDialog({ open, onOpenChange, wfmRows, onSaved }: Props) {
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState<number | "">("");
  const [reportingMonth, setReportingMonth] = useState(defaultMonth());
  const [editAccount, setEditAccount] = useState("");
  const [editMonthYm, setEditMonthYm] = useState("");

  const [form, setForm] = useState(emptyForm);

  const accountsInWfm = useMemo(() => {
    const s = new Set<string>();
    for (const r of wfmRows) {
      if (r.account_name) s.add(r.account_name);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [wfmRows]);

  const monthsYmForAccount = useMemo(() => {
    if (!editAccount) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of wfmRows) {
      if (r.account_name !== editAccount || !r.reporting_date) continue;
      const ym = String(r.reporting_date).slice(0, 7);
      if (!ym || seen.has(ym)) continue;
      seen.add(ym);
      out.push(ym);
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [wfmRows, editAccount]);

  const applyRow = useCallback((r: WfmBenchmarkRowVm) => {
    setProjectId(r.project_id ?? "");
    setReportingMonth(monthFromReportingDate(r.reporting_date));
    setForm({
      lateralRevenue: String(r.lateral_revenue_target ?? 0),
      lateralHcTarget: String(r.lateral_hc_target ?? 0),
      lateralProductivity: String(r.lateral_productivity_target ?? 0),
      idealHc: String(r.ideal_hc ?? 0),
      actualHcTotal: String(r.actual_hc_total ?? 0),
      wl1: String(r.wl1_hires ?? 0),
      wl2: String(r.wl2_hires ?? 0),
      wl3: String(r.wl3_hires ?? 0),
      wl4: String(r.wl4_hires ?? 0),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMode("create");
    setProjectId("");
    setReportingMonth(defaultMonth());
    setEditAccount("");
    setEditMonthYm("");
    setForm(emptyForm);
    setLoadingProjects(true);
    queries
      .projects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [open]);

  useEffect(() => {
    if (!open || mode !== "edit" || !editAccount || !editMonthYm) return;
    const row = wfmRows.find(
      (r) =>
        r.account_name === editAccount &&
        r.reporting_date &&
        String(r.reporting_date).slice(0, 7) === editMonthYm,
    );
    if (row) applyRow(row);
  }, [open, mode, editAccount, editMonthYm, wfmRows, applyRow]);

  const setField = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const pid = Number(projectId);
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
    if (mode === "edit" && (!editAccount.trim() || !editMonthYm.trim())) {
      setError("Select client and reporting period to update.");
      return;
    }
    setSaving(true);
    try {
      await wfmBenchmarkApi.upsert({
        project_id: pid,
        reporting_month: reportingMonth.slice(0, 7),
        lateral_revenue_target: parseNum(form.lateralRevenue),
        lateral_hc_target: parseNum(form.lateralHcTarget),
        lateral_productivity_target: parseNum(form.lateralProductivity),
        ideal_hc: parseNum(form.idealHc),
        actual_hc_total: parseIntSafe(form.actualHcTotal),
        wl1_hires: parseIntSafe(form.wl1),
        wl2_hires: parseIntSafe(form.wl2),
        wl3_hires: parseIntSafe(form.wl3),
        wl4_hires: parseIntSafe(form.wl4),
      });
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const monthLocked = mode === "edit" && Boolean(editAccount && editMonthYm);

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
          <div className="platform-dialog__eyebrow">Workforce · Benchmark</div>
          <DialogTitle className="platform-dialog__title">Add or update WFM data</DialogTitle>
          <DialogDescription className="platform-dialog__desc">
            One snapshot per client and reporting month: ideal vs actual HC, lateral targets, productivity, and WL hire
            counts. Matches the WFM upload pipeline (wfm_hr_benchmarks).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="platform-dialog__body platform-dialog__body--tall min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="flex flex-wrap gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="wfm-mode"
                  checked={mode === "create"}
                  onChange={() => {
                    setMode("create");
                    setProjectId("");
                    setReportingMonth(defaultMonth());
                    setEditAccount("");
                    setEditMonthYm("");
                    setForm(emptyForm);
                  }}
                />
                New client-month
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="wfm-mode"
                  checked={mode === "edit"}
                  onChange={() => {
                    setMode("edit");
                    setEditAccount("");
                    setEditMonthYm("");
                    setForm(emptyForm);
                  }}
                  disabled={wfmRows.length === 0}
                />
                Update existing snapshot
                {wfmRows.length === 0 ? (
                  <span className="text-muted-foreground">(no WFM data yet)</span>
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
                <p className="text-muted-foreground text-[10px]">Type to search, then pick a client.</p>
              </div>
            )}

            {mode === "edit" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1 md:min-w-0">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Client *
                  </label>
                  <SearchableStringPicker
                    items={accountsInWfm}
                    value={editAccount}
                    onChange={(acc) => {
                      setEditAccount(acc);
                      setEditMonthYm("");
                    }}
                    placeholder="Type to search clients…"
                    emptyHint={accountsInWfm.length === 0 ? "Upload WFM data or create a new snapshot first." : undefined}
                  />
                </div>
                <div className="space-y-1 md:min-w-0">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Reporting month *
                  </label>
                  <SearchableStringPicker
                    items={monthsYmForAccount}
                    value={editMonthYm}
                    onChange={setEditMonthYm}
                    placeholder={editAccount ? "YYYY-MM…" : "—"}
                    disabled={!editAccount}
                  />
                  {!editAccount ? (
                    <p className="text-muted-foreground mt-1 text-[10px]">Choose a client first.</p>
                  ) : monthsYmForAccount.length === 0 ? (
                    <p className="text-muted-foreground mt-1 text-[10px]">No snapshots for this client.</p>
                  ) : null}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label
                htmlFor={WFM_MONTH_INPUT_ID}
                className={cn(
                  "block w-full space-y-1.5",
                  monthLocked ? "cursor-not-allowed" : "cursor-pointer",
                )}
              >
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Reporting month *
                </span>
                <input
                  id={WFM_MONTH_INPUT_ID}
                  type="month"
                  className={cn(
                    "platform-search block min-h-11 w-full max-w-none py-2.5",
                    "cursor-pointer accent-[var(--accent)]",
                    "disabled:cursor-not-allowed disabled:opacity-70",
                  )}
                  value={reportingMonth}
                  onChange={(e) => setReportingMonth(e.target.value)}
                  disabled={monthLocked}
                  onClick={(e) => {
                    const el = e.currentTarget;
                    if (el.disabled) return;
                    try {
                      el.showPicker?.();
                    } catch {
                      /* ignore */
                    }
                  }}
                />
              </label>
              <p className="text-muted-foreground text-[10px]">
                Stored as the first day of the month. Locked when editing an existing client + period above.
              </p>
            </div>

            <div className="platform-dialog__section-label border-t border-border/60 pt-4">Targets & HC</div>
            <div className="grid gap-3 md:grid-cols-2">
              {(
                [
                  ["lateralRevenue", "Lateral revenue target"],
                  ["lateralHcTarget", "Lateral HC target"],
                  ["lateralProductivity", "Lateral productivity target"],
                  ["idealHc", "Ideal HC"],
                  ["actualHcTotal", "Actual HC (total)"],
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

            <div className="platform-dialog__section-label">WL hire mix (counts)</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(["wl1", "wl2", "wl3", "wl4"] as const).map((key, i) => (
                <div key={key} className="space-y-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    WL{i + 1}
                  </label>
                  <input
                    className="platform-search w-full max-w-none font-mono text-xs"
                    inputMode="numeric"
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
              {saving ? "Saving…" : "Save benchmark"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
