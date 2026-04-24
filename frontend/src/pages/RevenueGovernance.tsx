import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { UserPickerDropdown, type PlatformUserLite } from "@/components/platform/NewContractOrgFlow";
import "@/styles/new-contract-panel.css";
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

/** NCP sheet status pill class (scoped under `.new-contract-sheet`). */
function packStatusNcpClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "approved") return "ncp-st-active";
  if (s === "submitted" || s === "under_review" || s === "changes_requested") return "ncp-st-pending";
  if (s === "rejected") return "ncp-st-inactive";
  if (s === "draft") return "ncp-st-inactive";
  return "ncp-st-inactive";
}

function NcpReadonlyRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="ncp-prop-row">
      <span className="ncp-prop-label">{label}</span>
      <span
        className={cn("text-[13px] font-semibold", mono && "font-mono")}
        style={{ color: "var(--ncp-text-primary)", alignSelf: "center" }}
      >
        {value}
      </span>
    </div>
  );
}

function actorToPickerUsers(actor: RevenueWeeklySubmissionDto["submitted_by"], fallbackRole: string): PlatformUserLite[] {
  if (!actor?.id || !actor.email?.trim()) return [];
  const role = (actor.role && String(actor.role).trim()) || fallbackRole;
  return [{ id: actor.id, email: actor.email.trim(), role }];
}

/** Read-only row styled like `UserPickerDropdown`’s selected `ncp-user-btn`. */
function NcpReadonlyUserRow({
  label,
  actor,
  fallbackRole,
}: {
  label: string;
  actor: RevenueWeeklySubmissionDto["submitted_by"];
  fallbackRole: string;
}) {
  const users = actorToPickerUsers(actor, fallbackRole);
  const value = actor?.id != null ? String(actor.id) : "";
  return (
    <div className="ncp-prop-row ncp-prop-row--tall-value">
      <span className="ncp-prop-label">{label}</span>
      <div className="ncp-user-wrap">
        <UserPickerDropdown value={value} onChange={() => {}} users={users} disabled placeholder="—" />
      </div>
    </div>
  );
}

/** Date / timestamp row using the same card shell as `ncp-user-btn`. */
function NcpReadonlyDateRow({
  label,
  iso,
  detail = "Governance log",
}: {
  label: string;
  iso: string | null | undefined;
  /** Shown under the date, like role under email in the user picker. */
  detail?: string;
}) {
  const has = Boolean(iso);
  const primary = has ? formatDate(iso!) : "—";
  return (
    <div className="ncp-prop-row ncp-prop-row--tall-value">
      <span className="ncp-prop-label">{label}</span>
      <div className="ncp-user-wrap">
        <button
          type="button"
          className={cn("ncp-user-btn", has && "ncp-selected")}
          disabled
          style={{ cursor: "default", opacity: 1 }}
        >
          <span
            className="ncp-user-ico"
            style={{
              background: has ? "var(--ncp-blue-soft)" : "var(--ncp-border)",
              color: has ? "var(--ncp-blue)" : "var(--ncp-text-muted)",
              fontSize: 12,
            }}
            aria-hidden
          >
            {has ? "📅" : "—"}
          </span>
          <div className="ncp-user-meta">
            <strong>{primary}</strong>
            {detail ? <span>{has ? detail : "Not recorded"}</span> : null}
          </div>
        </button>
      </div>
    </div>
  );
}

function NcpSectionCard({
  icon,
  iconTone,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  iconTone?: "orange" | "blue" | "green" | "amber" | "accent";
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ncp-section">
      <div className="ncp-section-header">
        <span className={cn("ncp-section-icon", iconTone && `ncp-${iconTone}`)}>{icon}</span>
        <div>
          <div className="ncp-section-label">{title}</div>
          {description ? <div className="ncp-section-desc">{description}</div> : null}
        </div>
      </div>
      <div className="ncp-section-body">{children}</div>
    </div>
  );
}

function EmptyPackBlock({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center rounded-[var(--ncp-radius-lg)] border border-dashed px-4 py-8 min-h-[120px]"
      style={{ borderColor: "var(--ncp-border)", background: "var(--ncp-surface-hover)" }}
    >
      <p className="text-xs font-medium" style={{ color: "var(--ncp-text-primary)" }}>
        {title}
      </p>
      <p className="ncp-hint mt-1 max-w-[280px]">{body}</p>
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
    <div className="flex flex-col gap-0">
      {cells.map((c) => (
        <NcpReadonlyRow key={c.label} label={c.label} value={c.value} mono />
      ))}
    </div>
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
    <div className="flex flex-col gap-0">
      {cells.map((c) => (
        <NcpReadonlyRow key={c.label} label={c.label} value={c.value} mono />
      ))}
    </div>
  );
}

const GOVERNANCE_DRAWER_TABS: { icon: string; label: string }[] = [
  { icon: "◇", label: "Overview" },
  { icon: "✓", label: "Workflow" },
  { icon: "📊", label: "Forecast & pipeline" },
];

export function RevenueGovernance() {
  const { user } = useAuth();
  const allowed = canAccessRevenueGovernance(user);
  const [searchParams] = useSearchParams();
  const submissionFromUrl = useMemo(() => {
    const s = searchParams.get("submission");
    if (!s) return null;
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? null : n;
  }, [searchParams]);
  const openedSubmissionRef = useRef<number | null>(null);

  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
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
  const [governanceDrawerTab, setGovernanceDrawerTab] = useState(0);

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

  useEffect(() => {
    if (sel?.id != null) setGovernanceDrawerTab(0);
  }, [sel?.id]);

  useEffect(() => {
    if (submissionFromUrl != null) {
      setQueueFilter("all");
    }
  }, [submissionFromUrl]);

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

  useEffect(() => {
    if (submissionFromUrl == null || loading) return;
    if (openedSubmissionRef.current === submissionFromUrl) return;
    const r = rows.find((x) => x.id === submissionFromUrl);
    if (r) {
      openedSubmissionRef.current = submissionFromUrl;
      void openRow(r);
    }
  }, [submissionFromUrl, rows, loading]);

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
                    <div>No rows for this filter.</div>
                    {queueFilter === "needs_review" && !queueSearch.trim() ? (
                      <p className="mt-2 max-w-md mx-auto text-[11px] text-muted-foreground leading-relaxed">
                        Packs that are already <strong className="text-foreground/80">approved</strong> (or still{" "}
                        <strong className="text-foreground/80">draft</strong>) do not appear under Needs review. Use{" "}
                        <strong className="text-foreground/80">All</strong> or <strong className="text-foreground/80">Approved</strong>{" "}
                        to see them.
                      </p>
                    ) : null}
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
        title=" "
        embeddedChrome
      >
        <div className="new-contract-sheet flex min-h-0 flex-1 flex-col">
          <div className="ncp-scroll min-h-0 flex-1">
            <div className="ncp-page">
              {err && drawer ? (
                <div
                  className="mb-4 rounded-[var(--ncp-radius)] border px-3 py-2 text-xs"
                  style={{
                    borderColor: "rgba(239, 68, 68, 0.35)",
                    background: "rgba(239, 68, 68, 0.06)",
                    color: "#b91c1c",
                  }}
                  role="alert"
                >
                  {err}
                </div>
              ) : null}

              {!sel ? (
                <p className="ncp-hint" style={{ padding: "24px 0", textAlign: "center" }}>
                  Open a pack from the queue.
                </p>
              ) : (
                <>
                  <div className="ncp-header">
                    <div style={{ minWidth: 0 }}>
                      <div className="ncp-breadcrumb">
                        <span>Governance</span>
                        <span className="ncp-breadcrumb-sep">›</span>
                        <span>Revenue packs</span>
                        <span className="ncp-breadcrumb-sep">›</span>
                        <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 10 }}>#{sel.id}</span>
                      </div>
                      <h1 className="ncp-h1">{sel.account_name?.trim() || `Project ${sel.project_id}`}</h1>
                      <div className="ncp-subtitle">
                        <span style={{ fontFamily: "var(--ncp-mono)", color: "var(--ncp-text-muted)" }}>{`PRJ-${sel.project_id}`}</span>
                        {sel.week_start_date ? (
                          <>
                            <span style={{ color: "var(--ncp-text-muted)", margin: "0 6px" }}>·</span>
                            <span>Week of {formatDate(sel.week_start_date)}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <button type="button" className="ncp-close-btn" aria-label="Close" onClick={() => {
                      setDrawer(false);
                      setSel(null);
                      setPack(null);
                    }}>
                      ✕
                    </button>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 14px",
                      background: "var(--ncp-surface)",
                      border: "1px solid var(--ncp-border)",
                      borderRadius: "var(--ncp-radius-lg)",
                      marginBottom: 14,
                    }}
                  >
                    <span className={cn("ncp-status-pill", packStatusNcpClass(st))}>{sel.status.replace(/_/g, " ")}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--ncp-mono)",
                        background: "var(--ncp-accent-soft)",
                        color: "var(--ncp-accent)",
                        border: "1px solid var(--ncp-accent-mid)",
                        borderRadius: 999,
                        padding: "3px 10px",
                      }}
                    >
                      {`Pack #${sel.id}`}
                    </span>
                    <span style={{ flex: 1 }} />
                    {packLoading ? (
                      <span style={{ fontSize: 12, color: "var(--ncp-text-muted)" }}>Loading metrics…</span>
                    ) : pack?.forecast ? (
                      <span
                        style={{
                          fontSize: 13,
                          fontFamily: "var(--ncp-font)",
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                          color: "var(--ncp-text-primary)",
                        }}
                      >
                        Net revenue {formatLargeCurrency(pack.forecast.net_revenue_inr)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--ncp-text-muted)" }}>No forecast row</span>
                    )}
                  </div>

                  <div className="ncp-steps" role="tablist" style={{ marginBottom: 18 }}>
                    {GOVERNANCE_DRAWER_TABS.map(({ icon, label }, i) => (
                      <button
                        key={label}
                        type="button"
                        role="tab"
                        aria-selected={governanceDrawerTab === i}
                        className={cn("ncp-step", governanceDrawerTab === i && "ncp-active")}
                        onClick={() => setGovernanceDrawerTab(i)}
                      >
                        <span
                          className="ncp-step-num"
                          style={{
                            fontSize: 14,
                            background: governanceDrawerTab === i ? "rgba(255,255,255,0.22)" : "var(--ncp-border)",
                          }}
                        >
                          {icon}
                        </span>
                        {label}
                      </button>
                    ))}
                  </div>

                  {packLoading ? (
                    <div className="flex min-h-[200px] items-center justify-center text-sm" style={{ color: "var(--ncp-text-muted)" }}>
                      Loading pack details…
                    </div>
                  ) : (
                    <>
                      {governanceDrawerTab === 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          <NcpSectionCard
                            icon="🗓"
                            iconTone="orange"
                            title="Weekly revenue pack review"
                            description="Compare forecast (expected fees and revenue) with visibility (pipeline and realisation), then use the footer actions when you are ready to move this pack forward."
                          >
                            <p className="ncp-hint" style={{ marginBottom: 14 }}>
                              Governance compares what the practice <strong>expects</strong> this week with pipeline{" "}
                              <strong>visibility</strong> so you can approve or send targeted feedback.
                            </p>
                            <NcpReadonlyRow label="Account" value={sel.account_name?.trim() || "—"} />
                            <NcpReadonlyRow
                              label="Week start"
                              value={sel.week_start_date ? formatDate(sel.week_start_date) : "—"}
                              mono
                            />
                            <NcpReadonlyRow label="Pack / project" value={`#${sel.id} · PRJ-${sel.project_id}`} mono />
                          </NcpSectionCard>
                        </div>
                      ) : null}

                      {governanceDrawerTab === 1 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          <NcpSectionCard
                            icon="✓"
                            iconTone="green"
                            title="Workflow & ownership"
                            description="Who touched this pack and when."
                          >
                            {displaySubmission ? (
                              <>
                                <NcpReadonlyUserRow
                                  label="Submitted by"
                                  actor={displaySubmission.submitted_by}
                                  fallbackRole="Submitter"
                                />
                                <NcpReadonlyDateRow
                                  label="Submitted at"
                                  iso={displaySubmission.submitted_at}
                                  detail="Practice submission"
                                />
                                <NcpReadonlyUserRow
                                  label="Reviewed by"
                                  actor={displaySubmission.reviewed_by}
                                  fallbackRole="Reviewer"
                                />
                                <NcpReadonlyDateRow
                                  label="Reviewed at"
                                  iso={displaySubmission.reviewed_at}
                                  detail="Governance review"
                                />
                                <NcpReadonlyUserRow
                                  label="Approved by"
                                  actor={displaySubmission.approved_by}
                                  fallbackRole="Approver"
                                />
                                <NcpReadonlyDateRow
                                  label="Approved at"
                                  iso={displaySubmission.approved_at}
                                  detail="Final approval"
                                />
                                <NcpReadonlyRow label="Prior review notes" value={displaySubmission.review_notes?.trim() || "—"} />
                              </>
                            ) : (
                              <EmptyPackBlock title="No submission payload" body="Try closing and reopening this pack." />
                            )}
                          </NcpSectionCard>

                          <NcpSectionCard
                            icon="💬"
                            iconTone="blue"
                            title="Feedback to project team"
                            description="Optional for approval. Required detail helps when you request changes or reject."
                          >
                            <textarea
                              id="rg-pack-notes"
                              className="ncp-prop-input"
                              style={{ width: "100%", minHeight: 88, maxHeight: 160, resize: "vertical" }}
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              placeholder="e.g. Please reconcile MMF with visibility joiners for week of Apr 13…"
                            />
                          </NcpSectionCard>
                        </div>
                      ) : null}

                      {governanceDrawerTab === 2 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          <NcpSectionCard
                            icon="📈"
                            iconTone="accent"
                            title="Weekly forecast"
                            description="Fee and revenue line items the practice expects for this week."
                          >
                            {pack?.forecast ? (
                              <ForecastBody row={pack.forecast} />
                            ) : (
                              <EmptyPackBlock
                                title="No forecast row"
                                body="The project team has not saved a weekly forecast for this week in Revenue trackers yet."
                              />
                            )}
                          </NcpSectionCard>

                          <NcpSectionCard
                            icon="👁"
                            iconTone="amber"
                            title="Visibility snapshot"
                            description="Pipeline, fees, and conversion signals as of the snapshot date."
                          >
                            {pack?.visibility ? (
                              <VisibilityBody row={pack.visibility} />
                            ) : (
                              <EmptyPackBlock
                                title="No visibility snapshot"
                                body="The project team has not saved a visibility snapshot for this pack in Revenue trackers yet."
                              />
                            )}
                          </NcpSectionCard>
                        </div>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {sel ? (
            <div className="ncp-footer">
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                {footerHint ? <p className="ncp-hint" style={{ margin: 0 }}>{footerHint}</p> : <span />}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="ncp-btn ncp-btn-ghost"
                  style={{ fontSize: 13, padding: "8px 14px" }}
                  disabled={saving}
                  onClick={() => {
                    setDrawer(false);
                    setSel(null);
                    setPack(null);
                  }}
                >
                  Close
                </button>
                {st === "submitted" ? (
                  <button
                    type="button"
                    className="ncp-btn ncp-btn-secondary"
                    style={{ fontSize: 13, padding: "8px 14px" }}
                    disabled={saving}
                    onClick={() => void run(() => queries.revenueWeeklySubmissionStartReview(sel.id))}
                  >
                    Start review
                  </button>
                ) : null}
                {st === "submitted" || st === "under_review" ? (
                  <>
                    <button
                      type="button"
                      className="ncp-btn ncp-btn-primary"
                      style={{ fontSize: 13, padding: "8px 14px" }}
                      disabled={saving}
                      onClick={() => void run(() => queries.revenueWeeklySubmissionApprove(sel.id))}
                    >
                      Approve pack
                    </button>
                    <button
                      type="button"
                      className="ncp-btn ncp-btn-secondary"
                      style={{ fontSize: 13, padding: "8px 14px" }}
                      disabled={saving}
                      onClick={() => void run(() => queries.revenueWeeklySubmissionRequestChanges(sel.id, notes || undefined))}
                    >
                      Request changes
                    </button>
                    <button
                      type="button"
                      className="ncp-btn ncp-btn-ghost"
                      style={{
                        fontSize: 13,
                        padding: "8px 14px",
                        color: "rgba(185, 28, 28, 0.95)",
                        borderColor: "rgba(239, 68, 68, 0.35)",
                      }}
                      disabled={saving}
                      onClick={() => void run(() => queries.revenueWeeklySubmissionReject(sel.id, notes || undefined))}
                    >
                      Reject pack
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </PlatformDrawer>
    </div>
  );
}
