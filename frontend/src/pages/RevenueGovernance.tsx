import React, { useCallback, useEffect, useState } from "react";
import { queries, type RevenueWeeklyPackResponse, type RevenueWeeklySubmissionDto } from "@/lib/api";
import { canAccessRevenueGovernance, useAuth } from "@/lib/auth";
import { PageHeader, PlatformSection } from "@/components/platform/PlatformBlocks";
import { PlatformDrawer } from "@/components/platform/PlatformDrawer";
import { Button } from "@/components/ui/button";

const STATUS_OPTS = ["", "submitted", "under_review", "draft", "approved", "changes_requested", "rejected"] as const;

export function RevenueGovernance() {
  const { user } = useAuth();
  const allowed = canAccessRevenueGovernance(user);
  const [status, setStatus] = useState<string>("submitted");
  const [rows, setRows] = useState<RevenueWeeklySubmissionDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<RevenueWeeklySubmissionDto | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [pack, setPack] = useState<RevenueWeeklyPackResponse | null>(null);
  const [packLoading, setPackLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await queries.revenueWeeklySubmissionQueue({
        status: status || undefined,
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
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const openRow = async (r: RevenueWeeklySubmissionDto) => {
    setSel(r);
    setDrawer(true);
    setNotes("");
    if (!r.week_start_date) {
      setPack(null);
      return;
    }
    setPackLoading(true);
    try {
      const p = await queries.revenueWeeklyPack(r.project_id, r.week_start_date);
      setPack(p);
    } catch {
      setPack(null);
    } finally {
      setPackLoading(false);
    }
  };

  const run = async (fn: () => Promise<unknown>) => {
    if (!sel) return;
    setSaving(true);
    setErr(null);
    try {
      await fn();
      await load();
      const p = await queries.revenueWeeklyPack(sel.project_id, sel.week_start_date!);
      setPack(p);
      const upd = (await queries.revenueWeeklySubmissionQueue({ status: status || undefined, limit: 200 })).items?.find(
        (x) => x.id === sel.id,
      );
      if (upd) setSel(upd);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) {
    return (
      <div className="space-y-4 pb-16">
        <PageHeader
          title="Revenue pack governance"
          subtitle="Approve weekly forecast and visibility packs from project teams."
        />
        <PlatformSection title="Access">
          <p className="text-sm text-muted-foreground font-mono">
            Enable the <strong>revenue_kpi_governance</strong> vertical (operations / client portal) or use an executive /
            admin role. Project heads submit packs from <strong>Revenue trackers</strong>.
          </p>
        </PlatformSection>
      </div>
    );
  }

  const st = (sel?.status ?? "").toLowerCase();

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="Revenue pack governance"
        subtitle="Queue of weekly forecast + visibility submissions — start review, approve, request changes, or reject."
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
              {STATUS_OPTS.map((s) => (
                <option key={s || "all"} value={s}>
                  {s === "" ? "All" : s}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="outline" size="sm" className="text-xs font-mono h-9" onClick={() => void load()}>
            Refresh
          </Button>
          <span className="text-[10px] text-muted-foreground font-mono ml-auto">{total} pack(s)</span>
        </div>
        {err && !drawer ? <div className="text-xs text-destructive font-mono mt-2">{err}</div> : null}
      </PlatformSection>

      <PlatformSection title="Queue">
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 font-mono">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8">No rows for this filter.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 font-mono text-[9px] uppercase text-muted-foreground">
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Week</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/40 hover:bg-muted/10 cursor-pointer"
                    onClick={() => void openRow(r)}
                  >
                    <td className="px-3 py-2 font-mono text-primary">{r.id}</td>
                    <td className="px-3 py-2 max-w-[220px] truncate">{r.account_name || `PRJ-${r.project_id}`}</td>
                    <td className="px-3 py-2 font-mono">{r.week_start_date ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{r.status}</td>
                    <td className="px-3 py-2 font-mono text-[10px]">{r.submitted_by?.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PlatformSection>

      <PlatformDrawer
        open={drawer}
        onClose={() => {
          setDrawer(false);
          setSel(null);
          setPack(null);
        }}
        title={sel ? `Pack #${sel.id} · PRJ-${sel.project_id}` : "Pack"}
        subtitle={sel?.week_start_date ?? undefined}
        className="platform-drawer--wide"
        footer={
          sel ? (
            <div className="flex flex-wrap gap-2 justify-end w-full">
              {st === "submitted" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="text-xs font-mono"
                  disabled={saving}
                  onClick={() => void run(() => queries.revenueWeeklySubmissionStartReview(sel.id))}
                >
                  Start review
                </Button>
              ) : null}
              {st === "submitted" || st === "under_review" ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    className="text-xs font-mono"
                    disabled={saving}
                    onClick={() => void run(() => queries.revenueWeeklySubmissionApprove(sel.id))}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-xs font-mono"
                    disabled={saving}
                    onClick={() =>
                      void run(() => queries.revenueWeeklySubmissionRequestChanges(sel.id, notes || undefined))
                    }
                  >
                    Request changes
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="text-xs font-mono"
                    disabled={saving}
                    onClick={() => void run(() => queries.revenueWeeklySubmissionReject(sel.id, notes || undefined))}
                  >
                    Reject
                  </Button>
                </>
              ) : null}
            </div>
          ) : null
        }
      >
        {err && drawer ? <div className="text-xs text-destructive font-mono mb-3">{err}</div> : null}
        <label className="block text-[10px] text-muted-foreground font-mono mb-1">Notes (request changes / reject)</label>
        <textarea
          className="w-full text-xs font-mono rounded-md border border-border bg-background p-2 mb-4 min-h-[72px]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional feedback to project team"
        />
        {packLoading ? (
          <div className="text-xs text-muted-foreground font-mono">Loading pack…</div>
        ) : (
          <div className="space-y-4 text-xs font-mono">
            <div>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Submission</div>
              <pre className="whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/20 p-3 max-h-[160px] overflow-auto">
                {JSON.stringify(sel, null, 2)}
              </pre>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Forecast</div>
              <pre className="whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/20 p-3 max-h-[200px] overflow-auto">
                {JSON.stringify(pack?.forecast ?? null, null, 2)}
              </pre>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Visibility</div>
              <pre className="whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/20 p-3 max-h-[200px] overflow-auto">
                {JSON.stringify(pack?.visibility ?? null, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </PlatformDrawer>
    </div>
  );
}
