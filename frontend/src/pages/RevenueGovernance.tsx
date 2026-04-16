import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  queries,
  type RevenueForecastWeeklyRow,
  type RevenueWeeklyPackResponse,
  type RevenueWeeklySubmissionDto,
  type RevenueVisibilitySnapshotRow,
} from "@/lib/api";
import { canAccessRevenueGovernance, useAuth } from "@/lib/auth";
import { formatDate, formatLargeCurrency, formatPercent, cn } from "@/lib/utils";
import { PageHeader, PlatformSection } from "@/components/platform/PlatformBlocks";
import { PlatformDrawer } from "@/components/platform/PlatformDrawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

/** Maps to `GET .../queue?status=` — `needs_review` is expanded server-side to submitted + under_review. */
type QueueFilter = "all" | "needs_review" | "changes_requested" | "approved" | "rejected" | "draft";

const MAIN_QUEUE_CHIPS: { id: QueueFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs_review", label: "Needs review" },
  { id: "changes_requested", label: "Changes requested" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

function queueFilterToApiStatus(f: QueueFilter): string | undefined {
  if (f === "all") return undefined;
  return f;
}

function packStatusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "approved") return "bg-emerald-600/15 text-emerald-700 border-emerald-600/25 dark:text-emerald-400";
  if (s === "submitted") return "bg-sky-600/12 text-sky-800 border-sky-600/20 dark:text-sky-300";
  if (s === "under_review") return "bg-amber-500/15 text-amber-900 border-amber-500/25 dark:text-amber-200";
  if (s === "rejected") return "bg-destructive/10 text-destructive border-destructive/20";
  if (s === "changes_requested") return "bg-violet-600/12 text-violet-900 border-violet-600/20 dark:text-violet-300";
  if (s === "draft") return "bg-muted text-muted-foreground border-border";
  return "bg-muted/80 text-foreground border-border";
}

function PackMetric({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold text-foreground truncate", mono && "font-mono text-[13px]")}>{value}</div>
    </div>
  );
}

function SectionShell({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-xl border border-border/80 bg-card/80 shadow-sm overflow-hidden min-h-[188px]",
        className,
      )}
    >
      <div className="border-b border-border/60 bg-muted/25 px-4 py-2.5">
        <h4 className="text-sm font-semibold tracking-tight text-foreground">{title}</h4>
        {description ? <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{description}</p> : null}
      </div>
      <div className="flex-1 p-4 flex flex-col">{children}</div>
    </section>
  );
}

function EmptyPackBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center rounded-lg border border-dashed border-border/80 bg-muted/10 px-4 py-8 min-h-[120px]">
      <p className="text-xs font-medium text-foreground">{title}</p>
      <p className="text-[11px] text-muted-foreground mt-1 max-w-[280px] leading-relaxed">{body}</p>
    </div>
  );
}

function ForecastBody({ row }: { row: RevenueForecastWeeklyRow }) {
  const cells: Array<{ label: string; value: string }> = [
    { label: "Net revenue", value: formatLargeCurrency(row.net_revenue_inr) },
    { label: "Revenue forecast", value: formatLargeCurrency(row.revenue_forecast_inr) },
    { label: "MMF", value: formatLargeCurrency(row.mmf_inr) },
    { label: "Open + joiner + TBO fees", value: formatLargeCurrency(row.open_fee_inr + row.joiner_fee_inr + row.to_be_offer_fee_inr) },
    { label: "Open requisitions", value: String(row.open_req) },
    { label: "Joiners / TBO", value: `${row.joiner_count} / ${row.to_be_offer_count}` },
    { label: "Achievement", value: row.achievement_pct != null ? formatPercent(row.achievement_pct) : "—" },
    { label: "Week label", value: row.week_label || "—" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      {cells.map((c) => (
        <div key={c.label} className="min-w-0">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{c.label}</dt>
          <dd className="text-[13px] font-semibold font-mono text-foreground mt-0.5 break-words">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function VisibilityBody({ row }: { row: RevenueVisibilitySnapshotRow }) {
  const cells: Array<{ label: string; value: string }> = [
    { label: "As of", value: row.as_of_date ? formatDate(row.as_of_date) : "—" },
    { label: "Practice head", value: row.practice_head || "—" },
    { label: "MMF", value: formatLargeCurrency(row.mmf_inr) },
    { label: "Open requisitions", value: String(row.open_req) },
    { label: "Opening fee", value: formatLargeCurrency(row.opening_fee_inr) },
    { label: "Joiners (on date)", value: String(row.joiners_as_on_date) },
    { label: "Joining fee", value: formatLargeCurrency(row.joining_fee_inr) },
    { label: "Yet to join / YTJ fee", value: `${row.yet_to_join} · ${formatLargeCurrency(row.ytj_fee_inr)}` },
    { label: "Conversion", value: row.conversion_rate_pct != null ? formatPercent(row.conversion_rate_pct) : "—" },
    { label: "Realised vs MMF", value: row.revenue_realised_pct != null ? formatPercent(row.revenue_realised_pct) : "—" },
    { label: "Gap to MMF", value: formatLargeCurrency(row.gap_to_mmf_inr) },
    { label: "Status", value: row.status || "—" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      {cells.map((c) => (
        <div key={c.label} className="min-w-0">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{c.label}</dt>
          <dd className="text-[13px] font-semibold font-mono text-foreground mt-0.5 break-words">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RevenueGovernance() {
  const { user } = useAuth();
  const allowed = canAccessRevenueGovernance(user);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("needs_review");
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
  const [queueSearch, setQueueSearch] = useState("");

  const filteredQueueRows = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        String(r.id),
        String(r.project_id),
        (r.account_name || "").toLowerCase(),
        (r.week_start_date || "").toLowerCase(),
        (r.status || "").toLowerCase(),
        (r.submitted_by?.email || "").toLowerCase(),
      ];
      return hay.some((bit) => bit.includes(q));
    });
  }, [rows, queueSearch]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await queries.revenueWeeklySubmissionQueue({
        status: queueFilterToApiStatus(queueFilter),
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
  }, [queueFilter]);

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
      const upd = (
        await queries.revenueWeeklySubmissionQueue({ status: queueFilterToApiStatus(queueFilter), limit: 200 })
      ).items?.find(
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

  const displaySubmission = useMemo(
    () => (pack?.submission ?? sel) as RevenueWeeklySubmissionDto | null,
    [pack?.submission, sel],
  );

  const footerHint = useMemo(() => {
    if (!sel) return "";
    if (st === "draft")
      return "Practice is still editing this pack. They must submit it from Revenue trackers before you can start review, approve, or reject.";
    if (st === "submitted")
      return "Pack is in your queue. Start review when you begin checking numbers, then approve or send back with notes.";
    if (st === "under_review")
      return "Review in progress. Approve if numbers look right, or request changes / reject with clear feedback below.";
    if (st === "approved") return "This pack is approved. No further actions.";
    if (st === "rejected") return "This pack was rejected. The project team can revise and resubmit.";
    if (st === "changes_requested") return "Waiting on the project team to address your feedback.";
    return "";
  }, [sel, st]);

  const drawerTitle = sel ? (sel.account_name?.trim() || `Project ${sel.project_id}`) : "Pack";
  const drawerSubtitle = sel?.week_start_date
    ? `Pack #${sel.id} · PRJ-${sel.project_id} · Week of ${formatDate(sel.week_start_date)}`
    : sel
      ? `Pack #${sel.id} · PRJ-${sel.project_id}`
      : undefined;

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="Revenue pack governance"
        subtitle="Queue of weekly forecast + visibility submissions — start review, approve, request changes, or reject."
      />

      <PlatformSection title="Filters">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {MAIN_QUEUE_CHIPS.map(({ id, label }) => {
              const on = queueFilter === id;
              return (
                <Button
                  key={id}
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
                  onClick={() => setQueueFilter(id)}
                >
                  {label}
                </Button>
              );
            })}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={queueFilter === "draft"}
                  className={cn(
                    "h-8 gap-1 rounded-full border px-3 text-xs font-medium",
                    queueFilter === "draft"
                      ? "border-primary/45 bg-primary/10 text-foreground shadow-sm"
                      : "border-border/80 bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                >
                  More
                  <ChevronDown className="size-3.5 opacity-70" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[10rem]">
                <DropdownMenuItem
                  className="text-xs font-medium"
                  onSelect={() => setQueueFilter("draft")}
                >
                  Draft
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex shrink-0 items-center justify-end sm:justify-end">
            <span className="text-xs tabular-nums text-muted-foreground">
              {total} pack{total === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        {err && !drawer ? <div className="text-xs text-destructive font-mono mt-2">{err}</div> : null}
      </PlatformSection>

      <PlatformSection title="Queue" action="Refresh" onAction={() => void load()}>
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12, alignItems: "center" }}
        >
          <input
            className="platform-search"
            placeholder="Search project, week, status, submitter…"
            value={queueSearch}
            onChange={(e) => setQueueSearch(e.target.value)}
            style={{ flex: "1 1 220px", maxWidth: 360, minWidth: 180 }}
          />
        </div>
        <div className="platform-table-wrap" style={{ overflowX: "auto" }}>
          <table className="platform-table" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Project</th>
                <th>Week</th>
                <th>Status</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
                    No rows for this filter.
                  </td>
                </tr>
              )}
              {!loading && rows.length > 0 && filteredQueueRows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
                    No rows match your search.
                  </td>
                </tr>
              )}
              {!loading &&
                filteredQueueRows.map((r) => (
                  <tr
                    key={r.id}
                    className="transition-colors hover:bg-muted/20"
                    style={{ cursor: "pointer" }}
                    onClick={() => void openRow(r)}
                  >
                    <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--accent)" }}>{r.id}</td>
                    <td style={{ fontWeight: 600, maxWidth: 260 }}>
                      <div style={{ fontSize: 11 }} className="truncate">
                        <span
                          style={{ fontFamily: "'DM Mono',monospace", color: "var(--text-muted)" }}
                        >{`PRJ-${r.project_id}`}</span>
                        {r.account_name?.trim() ? (
                          <>
                            {" · "}
                            {r.account_name.trim()}
                          </>
                        ) : null}
                      </div>
                    </td>
                    <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--text-muted)" }}>
                      {r.week_start_date ?? "—"}
                    </td>
                    <td>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 border font-mono text-[9.5px] capitalize",
                          packStatusBadgeClass(r.status),
                        )}
                      >
                        {r.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td
                      style={{
                        fontFamily: "'DM Mono',monospace",
                        fontSize: 10,
                        color: "var(--text-muted)",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={r.submitted_by?.email ?? undefined}
                    >
                      {r.submitted_by?.email ?? "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </PlatformSection>

      <PlatformDrawer
        open={drawer}
        onClose={() => {
          setDrawer(false);
          setSel(null);
          setPack(null);
        }}
        title={drawerTitle}
        subtitle={drawerSubtitle}
        className="platform-drawer--wide"
        headerActions={
          sel ? (
            <Badge variant="outline" className={cn("shrink-0 border font-mono text-[10px] capitalize", packStatusBadgeClass(st))}>
              {sel.status.replace(/_/g, " ")}
            </Badge>
          ) : null
        }
        footer={
          sel ? (
            <div className="flex w-full flex-col gap-3">
              {footerHint ? (
                <p className="text-[11px] leading-snug text-muted-foreground">{footerHint}</p>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" className="text-xs" disabled={saving} onClick={() => setDrawer(false)}>
                  Close
                </Button>
                {st === "submitted" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="text-xs font-medium"
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
                      className="text-xs font-semibold shadow-sm"
                      disabled={saving}
                      onClick={() => void run(() => queries.revenueWeeklySubmissionApprove(sel.id))}
                    >
                      Approve pack
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs font-medium"
                      disabled={saving}
                      onClick={() => void run(() => queries.revenueWeeklySubmissionRequestChanges(sel.id, notes || undefined))}
                    >
                      Request changes
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="text-xs font-medium"
                      disabled={saving}
                      onClick={() => void run(() => queries.revenueWeeklySubmissionReject(sel.id, notes || undefined))}
                    >
                      Reject pack
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null
        }
      >
        {err && drawer ? (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{err}</div>
        ) : null}

        <div className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2.5 mb-4">
          <p className="text-xs font-medium text-foreground">Weekly revenue pack review</p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            Compare <span className="font-medium text-foreground">forecast</span> (expected fees and revenue) with{" "}
            <span className="font-medium text-foreground">visibility</span> (pipeline and realisation). Use the actions
            below when you are ready to move this pack forward.
          </p>
        </div>

        {packLoading ? (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">Loading pack details…</div>
        ) : sel ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3 min-h-[88px] flex flex-col justify-center">
                <PackMetric label="Account" value={sel.account_name?.trim() || "—"} />
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3 min-h-[88px] flex flex-col justify-center">
                <PackMetric label="Week start" value={sel.week_start_date ? formatDate(sel.week_start_date) : "—"} mono />
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3 min-h-[88px] flex flex-col justify-center">
                <PackMetric label="Pack / project" value={`#${sel.id} · PRJ-${sel.project_id}`} mono />
              </div>
            </div>

            <Separator />

            <SectionShell
              title="Workflow & ownership"
              description="Who touched this pack and when — same data as before, formatted for scanning."
            >
              {displaySubmission ? (
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <PackMetric label="Submitted by" value={displaySubmission.submitted_by?.email ?? "—"} mono />
                  <PackMetric
                    label="Submitted at"
                    value={displaySubmission.submitted_at ? formatDate(displaySubmission.submitted_at) : "—"}
                    mono
                  />
                  <PackMetric label="Reviewed by" value={displaySubmission.reviewed_by?.email ?? "—"} mono />
                  <PackMetric
                    label="Reviewed at"
                    value={displaySubmission.reviewed_at ? formatDate(displaySubmission.reviewed_at) : "—"}
                    mono
                  />
                  <PackMetric label="Approved by" value={displaySubmission.approved_by?.email ?? "—"} mono />
                  <PackMetric
                    label="Approved at"
                    value={displaySubmission.approved_at ? formatDate(displaySubmission.approved_at) : "—"}
                    mono
                  />
                  <div className="sm:col-span-2">
                    <PackMetric label="Prior review notes" value={displaySubmission.review_notes?.trim() || "—"} />
                  </div>
                </dl>
              ) : (
                <EmptyPackBlock title="No submission payload" body="Try refreshing the drawer." />
              )}
            </SectionShell>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <SectionShell
                title="Weekly forecast"
                description="Fee and revenue line items the practice expects for this week."
                className="min-h-[220px]"
              >
                {pack?.forecast ? (
                  <ForecastBody row={pack.forecast} />
                ) : (
                  <EmptyPackBlock
                    title="No forecast row"
                    body="The project team has not saved a weekly forecast for this week in Revenue trackers yet."
                  />
                )}
              </SectionShell>

              <SectionShell
                title="Visibility snapshot"
                description="Pipeline, fees, and conversion signals as of the snapshot date."
                className="min-h-[220px]"
              >
                {pack?.visibility ? (
                  <VisibilityBody row={pack.visibility} />
                ) : (
                  <EmptyPackBlock
                    title="No visibility snapshot"
                    body="The project team has not saved a visibility snapshot for this pack in Revenue trackers yet."
                  />
                )}
              </SectionShell>
            </div>

            <div className="rounded-xl border border-border/80 bg-card px-4 py-3">
              <label className="text-sm font-semibold text-foreground" htmlFor="rg-pack-notes">
                Feedback to project team
              </label>
              <p id="rg-pack-notes-hint" className="text-[11px] text-muted-foreground mt-1 mb-2 leading-relaxed">
                Optional for approval. Include specifics when you <strong>request changes</strong> or <strong>reject</strong> so
                the practice can fix the pack quickly.
              </p>
              <textarea
                id="rg-pack-notes"
                aria-describedby="rg-pack-notes-hint"
                className="w-full min-h-[88px] max-h-[140px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Please reconcile MMF with visibility joiners for week of Apr 13…"
              />
            </div>
          </div>
        ) : null}
      </PlatformDrawer>
    </div>
  );
}
