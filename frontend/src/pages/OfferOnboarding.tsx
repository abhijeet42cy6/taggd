import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Grid,
  Metric,
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
import { queries, type CandidateRow, type Project } from "@/lib/api";
import { isReadOnlyClient, isRecruiterUser, useAuth } from "@/lib/auth";
import { CandidateFormDrawer } from "@/components/platform/CandidateFormDrawer";
import { projectDisplayName, SearchableProjectFilterSelect } from "@/components/platform/searchable-pickers";
import { Skeleton } from "@/components/platform/Skeleton";
import {
  formatOfferCtc,
  formatOfferDate,
  riskBadgeClass,
  type OfferOnboardingSummary,
} from "@/lib/offer-onboarding-extras";

const PER_PAGE = 50;
const PAGE_WINDOW = 7;

function buildVisiblePageNumbers(current: number, total: number, windowSize = PAGE_WINDOW): number[] {
  if (total <= windowSize) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  let start = Math.max(1, current - Math.floor(windowSize / 2));
  let end = start + windowSize - 1;
  if (end > total) {
    end = total;
    start = Math.max(1, end - windowSize + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

const flatCard =
  "overflow-hidden border-0 p-0 shadow-tremor-card ring-1 ring-tremor-ring dark:bg-dark-tremor-background dark:shadow-dark-tremor-card dark:ring-dark-tremor-ring";

function KpiStrip({ summary, loading }: { summary: OfferOnboardingSummary | null; loading: boolean }) {
  if (loading && !summary) {
    return <Skeleton height={88} className="rounded-xl" />;
  }
  if (!summary) return null;
  const items = [
    { label: "In offer / onboarding", value: summary.total.toLocaleString() },
    { label: "Open offers", value: summary.open_offers.toLocaleString() },
    { label: "Accepted · pending DOJ", value: summary.accepted_pending_doj.toLocaleString() },
    { label: "Joined", value: summary.joined.toLocaleString() },
    { label: "At-risk flags", value: summary.at_risk.toLocaleString() },
    { label: "Overdue check-ins", value: summary.overdue_checkins.toLocaleString() },
  ];
  return (
    <Card className={flatCard}>
      <Grid numItemsSm={2} numItemsLg={3} numItemsMd={6} className="gap-0 divide-y sm:divide-y-0 sm:divide-x divide-tremor-border dark:divide-dark-tremor-border">
        {items.map((item) => (
          <div key={item.label} className="px-4 py-3">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-orange-600">{item.label}</Text>
            <Metric className="mt-1 text-xl font-bold tabular-nums text-tremor-content-strong">{item.value}</Metric>
            {item.label === "Open offers" && summary.offer_accept_rate_pct != null ? (
              <Text className="mt-0.5 text-[10px] text-tremor-content-subtle">
                Accept rate {summary.offer_accept_rate_pct}%
              </Text>
            ) : null}
          </div>
        ))}
      </Grid>
    </Card>
  );
}

export function OfferOnboarding() {
  const { user } = useAuth();
  const readOnly = isReadOnlyClient(user);
  const recruiterView = isRecruiterUser(user);
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<OfferOnboardingSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCandidateId, setDrawerCandidateId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, projectId]);

  useEffect(() => {
    queries.projects().then(setProjects).catch(() => setProjects([]));
  }, []);

  const projectById = useMemo(() => {
    const m = new Map<number, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const load = useCallback(async () => {
    setLoading(true);
    setSummaryLoading(true);
    setLoadError(null);
    try {
      const pid = projectId.trim() ? parseInt(projectId, 10) : undefined;
      const project_id = pid != null && !Number.isNaN(pid) ? pid : undefined;
      const [list, kpi] = await Promise.all([
        queries.candidatesList({
          project_id,
          search: debounced || undefined,
          offer_onboarding_only: true,
          include_record_context: true,
          limit: PER_PAGE,
          offset: (page - 1) * PER_PAGE,
        }),
        queries.offerOnboardingSummary({ project_id }),
      ]);
      setRows(list.items);
      setTotal(list.total);
      setSummary(kpi);
    } catch (e: unknown) {
      setRows([]);
      setTotal(0);
      setSummary(null);
      const msg = e instanceof Error ? e.message : "Could not load offer & onboarding rows";
      setLoadError(msg);
    } finally {
      setLoading(false);
      setSummaryLoading(false);
    }
  }, [debounced, page, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const visiblePages = useMemo(() => buildVisiblePageNumbers(page, totalPages), [page, totalPages]);

  const subtitle = recruiterView
    ? "Offer release through joining and 30/60/90-day retention — scoped to your assigned mandates."
    : readOnly
      ? "Read-only view of offer and onboarding progress on your portal projects."
      : "Track offer letters, joining dates, compliance milestones, and early-life retention per candidate.";

  return (
    <div className="offer-onboarding-tremor space-y-3 pb-8 md:space-y-4">
      <div>
        <span className="inline-flex max-w-full items-center whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-orange-600">
          Operations&nbsp;·&nbsp;Offer lifecycle
        </span>
        <Title className="mt-0.5 text-2xl font-bold tracking-tight text-tremor-content-strong md:text-3xl">
          Offer &amp; Onboarding
        </Title>
        <Text className="mt-1.5 max-w-4xl text-xs leading-snug text-tremor-content-emphasis md:text-sm md:leading-snug">
          {subtitle}
        </Text>
      </div>

      <KpiStrip summary={summary} loading={summaryLoading} />

      {loadError ? (
        <Card className="border-amber-200 bg-amber-50 ring-1 ring-amber-200 dark:border-amber-900/40 dark:bg-amber-950/25 dark:ring-amber-900/50">
          <Text className="px-4 py-3 text-xs text-amber-950 dark:text-amber-100 md:text-sm" role="alert">
            <span className="font-semibold">Could not load data.</span> {loadError}
          </Text>
        </Card>
      ) : null}

      <Card className={flatCard}>
        <div className="flex w-full min-w-0 flex-col gap-3 border-b border-tremor-border px-4 py-3 dark:border-dark-tremor-border">
          <div className="flex w-full min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
            <div className="min-w-0 w-full flex-1">
              <Text className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-orange-600">Search</Text>
              <TextInput
                placeholder="Name, email, client req id, Excel Cand. ID…"
                value={search}
                onValueChange={setSearch}
                className="w-full"
                aria-label="Search offer and onboarding"
              />
            </div>
            <div className="w-full min-w-0 shrink-0 lg:w-64">
              <Text className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-orange-600">Project</Text>
              <SearchableProjectFilterSelect
                projects={projects}
                value={projectId}
                onChange={setProjectId}
                disabled={loading && projects.length === 0}
              />
            </div>
            <div className="flex w-full shrink-0 flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
              <Button type="button" size="xs" variant="secondary" onClick={() => void load()}>
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1 border-b border-tremor-border px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-dark-tremor-border">
          <Title className="text-sm font-semibold text-tremor-content-strong">Tracker ({total.toLocaleString()})</Title>
          {total > 0 ? (
            <Text className="text-xs tabular-nums text-tremor-content-subtle">
              {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total.toLocaleString()}
            </Text>
          ) : null}
        </div>

        <div className="px-2 pb-3 pt-1">
          {loading ? (
            <Skeleton height={220} />
          ) : rows.length === 0 ? (
            <div className="px-3 py-6">
              <Text className="text-sm font-medium text-tremor-content-strong">No offer or onboarding rows yet.</Text>
              <Text className="mt-3 text-xs leading-relaxed text-tremor-content-emphasis">
                Rows appear when a candidate has an offer date, offer CTC, joining status, expected DOJ, or an
                offer-related pipeline stage. Ingest the RPO template via{" "}
                <span className="font-semibold">Ingestion Center → Candidates</span> (pass 2 + 3 run automatically) or
                edit a candidate from the <span className="font-semibold">Candidates</span> tab.
              </Text>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1400px]">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Cand. ID</TableHeaderCell>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Req. ID</TableHeaderCell>
                    <TableHeaderCell>Client</TableHeaderCell>
                    <TableHeaderCell>Role</TableHeaderCell>
                    <TableHeaderCell>Offer CTC</TableHeaderCell>
                    <TableHeaderCell>Offer date</TableHeaderCell>
                    <TableHeaderCell>Accepted</TableHeaderCell>
                    <TableHeaderCell>Expected DOJ</TableHeaderCell>
                    <TableHeaderCell>Joining</TableHeaderCell>
                    <TableHeaderCell>30 / 60 / 90</TableHeaderCell>
                    <TableHeaderCell>Risk</TableHeaderCell>
                    <TableHeaderCell>Recruiter</TableHeaderCell>
                    {!readOnly ? <TableHeaderCell>Actions</TableHeaderCell> : null}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs font-medium tabular-nums text-orange-600 dark:text-orange-400">
                        {r.excel_candidate_id || r.client_candidate_id.slice(0, 12)}
                      </TableCell>
                      <TableCell className="text-sm">{r.full_name || "—"}</TableCell>
                      <TableCell className="text-xs tabular-nums">{r.client_req_id || `REQ-${r.record_id}`}</TableCell>
                      <TableCell className="max-w-[8rem] truncate text-sm" title={r.rpo_client_name || undefined}>
                        {r.rpo_client_name ||
                          (() => {
                            const pr = projectById.get(r.project_id);
                            return pr ? projectDisplayName(pr) : "—";
                          })()}
                      </TableCell>
                      <TableCell className="max-w-[9rem] truncate text-sm" title={r.position_title || undefined}>
                        {r.position_title || "—"}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">{formatOfferCtc(r.offer_ctc_lpa)}</TableCell>
                      <TableCell className="text-xs tabular-nums">{formatOfferDate(r.offer_date)}</TableCell>
                      <TableCell className="text-xs">{r.offer_accepted_flag || r.offer_acceptance || "—"}</TableCell>
                      <TableCell className="text-xs tabular-nums">{formatOfferDate(r.expected_doj)}</TableCell>
                      <TableCell className="text-xs">{r.joining_status || "—"}</TableCell>
                      <TableCell className="text-[10px] leading-snug">
                        {[r.checkin_30_day, r.checkin_60_day, r.checkin_90_day]
                          .map((x) => (x && String(x).trim() ? String(x).trim() : "—"))
                          .join(" · ")}
                      </TableCell>
                      <TableCell>
                        {r.early_exit_risk ? (
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${riskBadgeClass(r.early_exit_risk)}`}
                          >
                            {r.early_exit_risk}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="max-w-[7rem] truncate text-sm" title={r.assigned_recruiter || undefined}>
                        {r.assigned_recruiter || "—"}
                      </TableCell>
                      {!readOnly ? (
                        <TableCell>
                          <Button
                            type="button"
                            size="xs"
                            variant="light"
                            onClick={() => {
                              setDrawerCandidateId(r.id);
                              setDrawerOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-center gap-1 border-t border-tremor-border px-4 py-3 dark:border-dark-tremor-border">
            <Button type="button" size="xs" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Prev
            </Button>
            {visiblePages.map((p) => (
              <Button
                key={p}
                type="button"
                size="xs"
                variant={p === page ? "primary" : "secondary"}
                color={p === page ? "orange" : undefined}
                onClick={() => setPage(p)}
              >
                {p}
              </Button>
            ))}
            <Button
              type="button"
              size="xs"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </Card>

      <CandidateFormDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerCandidateId(null);
        }}
        mode="edit"
        candidateId={drawerCandidateId}
        projects={projects}
        initialTab={3}
        focusMode="offer"
        onSuccess={() => void load()}
      />
    </div>
  );
}
