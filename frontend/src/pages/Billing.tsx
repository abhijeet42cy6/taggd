import React, { useCallback, useEffect, useMemo, useState } from "react";
import { invalidateCache, queries, type Project, type RevenueBillingRow, type RevenueBillingCreate, type RevenueBillingPatch } from "@/lib/api";
import { formatLargeCurrency } from "@/lib/utils";
import { PageHeader, PlatformSection } from "@/components/platform/PlatformBlocks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Plus, PencilLine, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

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

function FormGrid({
  draft,
  setDraft,
  projectLocked,
  projects,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  projectLocked: boolean;
  projects: Project[];
}) {
  const set = (k: string, v: string) => setDraft((prev) => ({ ...prev, [k]: v }));

  const field = (
    key: string,
    label: string,
    opts?: { type?: string; className?: string; disabled?: boolean }
  ) => (
    <div key={key} className={cn("space-y-1.5", opts?.className)}>
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input
        type={opts?.type ?? "text"}
        value={draft[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
        disabled={opts?.disabled}
        className="h-8 text-xs font-mono"
      />
    </div>
  );

  return (
    <div className="space-y-8 max-h-[min(70vh,640px)] overflow-y-auto pr-2">
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">Project & period</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Project</Label>
            <Select
              value={draft.project_id}
              onValueChange={(v) => set("project_id", v)}
              disabled={projectLocked}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)} className="text-xs font-mono">
                    PRJ-{p.id} · {p.account_name || p.filename || "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {field("update_date", "Update date (YYYY-MM-DD)")}
          {field("fiscal_year_label", "Fiscal year label (e.g. FY 2025-26)")}
          {field("project_manager", "Project manager")}
        </div>
      </div>

      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">Revenue & MMF</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {field("revenue_booked_inr", "Revenue booked (INR)")}
          {field("mmf_inr", "MMF (INR)")}
          {field("net_revenue_inr", "Net revenue (INR)")}
          {field("rph_inr", "RPH (INR)")}
          {field("pct_of_target", "% of target")}
        </div>
      </div>

      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">Openings & joiners</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {field("opening_req", "Opening req (count)", { type: "number" })}
          {field("opening_fee_inr", "Opening fee (INR)")}
          {field("total_joiners", "Total joiners", { type: "number" })}
          {field("taggd_joiner", "Taggd joiner (count)", { type: "number" })}
          {field("taggd_joiner_fee_inr", "Taggd joiner fee (INR)")}
          {field("total_joining_fee_inr", "Total joining fee (INR)")}
        </div>
      </div>

      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">ER/IJP/Other & campus</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {field("er_ijp_other_count", "ER/IJP/Other (count)", { type: "number" })}
          {field("er_ijp_other_fee_inr", "ER/IJP/Other fee (INR)")}
          {field("campus_count", "Campus (count)", { type: "number" })}
          {field("campus_fee_inr", "Campus fee (INR)")}
        </div>
      </div>

      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">Adjustments</h4>
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Adjustment reason</Label>
            <Textarea
              value={draft.adjustment_reason ?? ""}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set("adjustment_reason", e.target.value)}
              className="text-xs min-h-[56px]"
            />
          </div>
          {field("adjustment_amt_inr", "Adjustment amount (INR)")}
        </div>
      </div>

      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">Invoice & collection</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {field("invoice_number", "Invoice number")}
          {field("invoice_amount_inr", "Invoice amount (INR)")}
          {field("invoice_raised_date", "Invoice raised (YYYY-MM-DD)")}
          {field("payment_due_date", "Payment due (YYYY-MM-DD)")}
          {field("actual_payment_received_date", "Payment received (YYYY-MM-DD)")}
          {field("collection_received_inr", "Collection received (INR)")}
          {field("approver_name", "Approver name")}
          {field("attachment_ref", "Attachment (URL / ref)")}
        </div>
      </div>

      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">Notes</h4>
        <Textarea
          value={draft.notes ?? ""}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set("notes", e.target.value)}
          className="text-xs min-h-[72px]"
        />
      </div>
    </div>
  );
}

export function Billing() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<RevenueBillingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(0));
  const [baselineDraft, setBaselineDraft] = useState<Draft | null>(null);

  const pid = projectFilter === "all" ? undefined : Number(projectFilter);

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

  function openCreate() {
    const id = defaultProjectId || projects[0]?.id || 0;
    setEditId(null);
    setBaselineDraft(null);
    setDraft(emptyDraft(id));
    setDialogOpen(true);
  }

  function openEdit(r: RevenueBillingRow) {
    const d = rowToDraft(r);
    setEditId(r.id);
    setBaselineDraft({ ...d });
    setDraft(d);
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setErr(null);
    try {
      if (editId === null) {
        const body = draftToCreate(draft);
        await queries.createRevenueBilling(body);
      } else {
        if (!baselineDraft) return;
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

  async function handleDelete(id: number) {
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
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 min-w-[200px]">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Project</span>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="h-9 text-xs w-[260px]">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  All projects
                </SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)} className="text-xs font-mono">
                    PRJ-{p.id} · {p.account_name || p.filename || "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" className="h-9 gap-2" onClick={openCreate} disabled={!projects.length}>
            <Plus className="h-3.5 w-3.5" />
            New billing row
          </Button>
          <span className="text-[10px] text-muted-foreground font-mono ml-auto">{total} row(s)</span>
        </div>
        {err && (
          <div className="mt-3 text-xs text-destructive font-mono border border-destructive/30 rounded-md px-3 py-2 bg-destructive/5">
            {err}
          </div>
        )}
      </PlatformSection>

      <PlatformSection title="Billing rows">
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
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 whitespace-nowrap">ID</th>
                  <th className="px-3 py-2 whitespace-nowrap">Project</th>
                  <th className="px-3 py-2 whitespace-nowrap">Update</th>
                  <th className="px-3 py-2 whitespace-nowrap">FY</th>
                  <th className="px-3 py-2 whitespace-nowrap">PM</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Net rev</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">MMF</th>
                  <th className="px-3 py-2 whitespace-nowrap">Invoice</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/10">
                    <td className="px-3 py-2 font-mono text-primary">{r.id}</td>
                    <td className="px-3 py-2 max-w-[180px] truncate" title={r.account_name}>
                      <span className="font-mono text-[10px] text-muted-foreground">PRJ-{r.project_id}</span>
                      <br />
                      <span className="text-foreground">{r.account_name || "—"}</span>
                    </td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap">{r.update_date || "—"}</td>
                    <td className="px-3 py-2">{r.fiscal_year_label || "—"}</td>
                    <td className="px-3 py-2 max-w-[120px] truncate" title={r.project_manager || ""}>
                      {r.project_manager || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                      {r.net_revenue_inr != null ? formatLargeCurrency(r.net_revenue_inr) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                      {r.mmf_inr != null ? formatLargeCurrency(r.mmf_inr) : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono max-w-[100px] truncate" title={r.invoice_number || ""}>
                      {r.invoice_number || "—"}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(r)} title="Edit">
                        <PencilLine className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        onClick={() => void handleDelete(r.id)}
                        title="Delete"
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
      </PlatformSection>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-syne text-lg">
              {editId === null ? "New billing row" : `Edit billing #${editId}`}
            </DialogTitle>
            <DialogDescription className="text-xs">
              All amounts are INR. Dates use YYYY-MM-DD. Only project is required to create; add other fields when ready.
            </DialogDescription>
          </DialogHeader>
          <FormGrid
            draft={draft}
            setDraft={setDraft}
            projectLocked={editId !== null}
            projects={projects}
          />
          <DialogFooter className="gap-2 sm:gap-0 border-t border-border pt-4 mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving || !draft.project_id}>
              {saving ? "Saving…" : editId === null ? "Create" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
