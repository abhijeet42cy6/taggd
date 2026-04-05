import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { queries, slaMetricsApi, type Project, type SlaMetricRecord } from "@/lib/api";
import {
  SearchableMetricOptionPicker,
  SearchableProjectPicker,
  SearchableStringPicker,
  type MetricOption,
} from "@/components/platform/searchable-pickers";

export type SlaMetricOption = MetricOption;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing metrics from the SLA table (for edit mode). */
  metricOptions: SlaMetricOption[];
  onSaved: () => void;
};

const emptyForm = {
  projectId: "" as string | number,
  metricLabel: "",
  metricGroup: "",
  metricNature: "",
  targetThreshold: "",
  definition: "",
  calculationMethod: "",
  formula: "",
  sourceSystem: "",
  reportingMonth: "",
  score: "",
  ragStatus: "" as string,
};

function defaultMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function SlaMetricFormDialog({ open, onOpenChange, metricOptions, onSaved }: Props) {
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editId, setEditId] = useState<number | null>(null);
  const [editAccount, setEditAccount] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingMetric, setLoadingMetric] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const accountsInMetrics = useMemo(() => {
    const s = new Set<string>();
    for (const o of metricOptions) {
      if (o.account) s.add(o.account);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [metricOptions]);

  const metricsForAccount = useMemo(() => {
    if (!editAccount) return [];
    return metricOptions
      .filter((o) => o.account === editAccount)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [metricOptions, editAccount]);

  const resetForCreate = useCallback(() => {
    setMode("create");
    setEditId(null);
    setEditAccount("");
    setForm({ ...emptyForm, reportingMonth: defaultMonth() });
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMode("create");
    setEditId(null);
    setEditAccount("");
    setForm({ ...emptyForm, reportingMonth: defaultMonth() });
    setLoadingProjects(true);
    queries
      .projects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [open]);

  useEffect(() => {
    if (!open || mode !== "edit" || !editId) {
      if (mode === "edit" && !editId) {
        setForm({ ...emptyForm, reportingMonth: defaultMonth() });
      }
      return;
    }
    setLoadingMetric(true);
    setError(null);
    slaMetricsApi
      .get(editId)
      .then((m: SlaMetricRecord) => {
        setForm({
          projectId: m.project_id,
          metricLabel: m.metric_label || "",
          metricGroup: m.metric_group || "",
          metricNature: m.metric_nature || "",
          targetThreshold: m.target_threshold || "",
          definition: m.definition || "",
          calculationMethod: m.calculation_method || "",
          formula: m.formula || "",
          sourceSystem: m.source_system || "",
          reportingMonth: defaultMonth(),
          score: "",
          ragStatus: "",
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load metric"))
      .finally(() => setLoadingMetric(false));
  }, [open, mode, editId]);

  const setField = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const buildPerformance = () => {
    const rm = form.reportingMonth.trim();
    const hasPeriod = rm.length >= 7;
    const hasScore = form.score.trim().length > 0;
    const hasRag = form.ragStatus.trim().length > 0;
    if (!hasPeriod && !hasScore && !hasRag) return undefined;
    return {
      reporting_month: hasPeriod ? rm : undefined,
      score: hasScore ? form.score.trim() : undefined,
      rag_status: hasRag ? form.ragStatus.trim() : undefined,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const rm = form.reportingMonth.trim();
    const hasSnap =
      rm.length >= 7 || form.score.trim().length > 0 || form.ragStatus.trim().length > 0;
    if (hasSnap && rm.length < 7) {
      setError("Set reporting month for the period snapshot when you enter score or RAG status.");
      return;
    }
    if (mode === "create") {
      const pid = Number(form.projectId);
      if (!pid || Number.isNaN(pid)) {
        setError("Select a client / project from the list.");
        return;
      }
      if (!projects.some((p) => p.id === pid)) {
        setError("Choose a valid client from the list.");
        return;
      }
      if (!form.metricLabel.trim()) {
        setError("Performance measure (label) is required.");
        return;
      }
      setSaving(true);
      try {
        const perf = buildPerformance();
        await slaMetricsApi.create({
          project_id: pid,
          metric_label: form.metricLabel.trim(),
          metric_group: form.metricGroup || undefined,
          metric_nature: form.metricNature || undefined,
          target_threshold: form.targetThreshold || undefined,
          definition: form.definition || undefined,
          calculation_method: form.calculationMethod || undefined,
          formula: form.formula || undefined,
          source_system: form.sourceSystem || undefined,
          performance: perf,
        });
        onSaved();
        onOpenChange(false);
        resetForCreate();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!editAccount.trim()) {
      setError("Select a client first.");
      return;
    }
    if (!editId) {
      setError("Select an existing KPI to update.");
      return;
    }
    setSaving(true);
    try {
      const perf = buildPerformance();
      await slaMetricsApi.update(editId, {
        metric_label: form.metricLabel.trim() || undefined,
        metric_group: form.metricGroup || undefined,
        metric_nature: form.metricNature || undefined,
        target_threshold: form.targetThreshold || undefined,
        definition: form.definition || undefined,
        calculation_method: form.calculationMethod || undefined,
        formula: form.formula || undefined,
        source_system: form.sourceSystem || undefined,
        performance: perf,
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
          <div className="platform-dialog__eyebrow">SLA · Metric definition</div>
          <DialogTitle className="platform-dialog__title">Add or update SLA metric</DialogTitle>
          <DialogDescription className="platform-dialog__desc">
            Choose a client, then enter the performance measure and optional catalogue fields. Add a month snapshot
            (reporting month, score, Met / Not Met) to write or upsert period data in the database.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="platform-dialog__body platform-dialog__body--tall min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="flex flex-wrap gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="sla-m-mode"
                  checked={mode === "create"}
                  onChange={() => {
                    setMode("create");
                    setEditId(null);
                    setEditAccount("");
                    resetForCreate();
                  }}
                />
                Create new metric
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="sla-m-mode"
                  checked={mode === "edit"}
                  onChange={() => {
                    setMode("edit");
                    setEditId(null);
                    setEditAccount("");
                    setForm({ ...emptyForm, reportingMonth: defaultMonth() });
                  }}
                  disabled={metricOptions.length === 0}
                />
                Update existing metric
                {metricOptions.length === 0 ? (
                  <span className="text-muted-foreground">(no metrics loaded yet)</span>
                ) : null}
              </label>
            </div>

            {mode === "edit" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1 md:min-w-0">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Client *
                  </label>
                  <SearchableStringPicker
                    items={accountsInMetrics}
                    value={editAccount}
                    onChange={(acc) => {
                      setEditAccount(acc);
                      setEditId(null);
                    }}
                    placeholder="Type to search clients…"
                    emptyHint={accountsInMetrics.length === 0 ? "No clients in SLA data yet." : undefined}
                  />
                </div>
                <div className="space-y-1 md:min-w-0">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Existing KPI *
                  </label>
                  <SearchableMetricOptionPicker
                    options={metricsForAccount}
                    metricId={editId}
                    onMetricIdChange={setEditId}
                    disabled={!editAccount}
                  />
                  {!editAccount ? (
                    <p className="text-muted-foreground mt-1 text-[10px]">Choose a client first.</p>
                  ) : metricsForAccount.length === 0 ? (
                    <p className="text-muted-foreground mt-1 text-[10px]">No KPIs for this client.</p>
                  ) : null}
                </div>
              </div>
            )}

            {mode === "create" && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Client / project *
                </label>
                <SearchableProjectPicker
                  projects={projects}
                  loading={loadingProjects}
                  projectId={form.projectId === "" ? "" : Number(form.projectId)}
                  onProjectIdChange={(id) => setForm((f) => ({ ...f, projectId: id === "" ? "" : id }))}
                />
                <p className="text-muted-foreground text-[10px]">
                  Type to filter the list, then click a row to select the client.
                </p>
              </div>
            )}

            {mode === "edit" && loadingMetric && (
              <p className="text-xs text-muted-foreground">Loading metric…</p>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Performance measure (label) *
                </label>
                <input
                  className="platform-search w-full max-w-none"
                  value={form.metricLabel}
                  onChange={(e) => setField("metricLabel", e.target.value)}
                  placeholder="e.g. Time to Hire"
                  required
                  disabled={mode === "edit" && loadingMetric}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Metric group
                </label>
                <input
                  className="platform-search w-full max-w-none"
                  value={form.metricGroup}
                  onChange={(e) => setField("metricGroup", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Metric type / nature
                </label>
                <input
                  className="platform-search w-full max-w-none"
                  value={form.metricNature}
                  onChange={(e) => setField("metricNature", e.target.value)}
                  placeholder="e.g. Non-Penalty"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Target
                </label>
                <input
                  className="platform-search w-full max-w-none"
                  value={form.targetThreshold}
                  onChange={(e) => setField("targetThreshold", e.target.value)}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Definition
                </label>
                <textarea
                  className="platform-search min-h-[72px] w-full max-w-none resize-y font-sans"
                  value={form.definition}
                  onChange={(e) => setField("definition", e.target.value)}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Calculation method
                </label>
                <textarea
                  className="platform-search min-h-[56px] w-full max-w-none resize-y font-sans"
                  value={form.calculationMethod}
                  onChange={(e) => setField("calculationMethod", e.target.value)}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Formula
                </label>
                <textarea
                  className="platform-search min-h-[56px] w-full max-w-none resize-y font-sans"
                  value={form.formula}
                  onChange={(e) => setField("formula", e.target.value)}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Measurement system
                </label>
                <input
                  className="platform-search w-full max-w-none"
                  value={form.sourceSystem}
                  onChange={(e) => setField("sourceSystem", e.target.value)}
                />
              </div>
            </div>

            <div className="border-t border-border/60 pt-4">
              <div className="platform-dialog__section-label mb-2">Period snapshot (optional)</div>
              <p className="text-muted-foreground mb-3 text-[11px] leading-relaxed">
                Fills or updates one row in SLA performance for the selected reporting month. Leave all empty to only
                save the metric definition.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Reporting month
                  </label>
                  <input
                    type="month"
                    className="platform-search w-full max-w-none"
                    value={form.reportingMonth}
                    onChange={(e) => setField("reportingMonth", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Score</label>
                  <input
                    className="platform-search w-full max-w-none"
                    value={form.score}
                    onChange={(e) => setField("score", e.target.value)}
                    placeholder="e.g. 90"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">RAG status</label>
                  <select
                    className="platform-search w-full max-w-none"
                    value={form.ragStatus}
                    onChange={(e) => setField("ragStatus", e.target.value)}
                  >
                    <option value="">—</option>
                    <option value="Met">Met</option>
                    <option value="Not Met">Not Met</option>
                    <option value="NOT MET">NOT MET</option>
                    <option value="Not Reported">Not Reported</option>
                  </select>
                </div>
              </div>
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
              {saving ? "Saving…" : mode === "create" ? "Create metric" : "Save changes"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
