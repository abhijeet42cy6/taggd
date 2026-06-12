import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Flex,
  Grid,
  Metric,
  ProgressBar,
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
import { queries, type Project, type RecordRow, type RecordsPage, type RequisitionKpis } from "@/lib/api";
import { StatusTag } from "@/components/platform/PlatformBlocks";
import {
  hasUnrestrictedProjectAccess,
  isProjectScopedUser,
  isReadOnlyClient,
  isRecruiterUser,
  useAuth,
} from "@/lib/auth";
import { RequisitionCreateDrawer } from "@/components/platform/RequisitionCreateDrawer";
import { RequisitionRecordDrawer } from "@/components/platform/RequisitionRecordDrawer";
import { LevelDonutChart, AgeingBars } from "@/components/platform/Charts";
import { SkeletonTable, SkeletonKpiRow, Skeleton } from "@/components/platform/Skeleton";
import { REQUISITION_FUNNEL_UNPROCESSED_LABEL, requisitionFunnelVm } from "@/lib/view-models/requisitions";
import { displayRecordReqId, formatCurrency, formatOfferedCtc } from "@/lib/utils";

const PER_PAGE = 50;
const PAGE_WINDOW = 7;
const RECORDS_FETCH_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Request timed out")), ms);
    }),
  ]);
}

function statusBreakdownToFunnel(sb: Record<string, number>) {
  return {
    [REQUISITION_FUNNEL_UNPROCESSED_LABEL]: sb["UNPROCESSED"] ?? 0,
    Open: sb["ACTIVE"] ?? 0,
    Screening: sb["PIPELINE"] ?? 0,
    Offer: 0,
    Joined: sb["CLOSED"] ?? 0,
    Cancelled: sb["ON HOLD"] ?? 0,
  };
}

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

function buildDeptData(records: import("@/lib/api").RecordRow[]) {
  const freq: Record<string, number> = {};
  for (const r of records) {
    const dept = (r.department || "").trim();
    if (!dept || dept === "nan" || dept === "—") continue;
    freq[dept] = (freq[dept] || 0) + 1;
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 8);
  const otherCount = sorted.slice(8).reduce((s, [, v]) => s + v, 0);
  const result = top.map(([name, value]) => ({ name, value }));
  if (otherCount > 0) result.push({ name: "Other", value: otherCount });
  return result;
}

const funnelBarColor: Record<string, React.ComponentProps<typeof ProgressBar>["color"]> = {
  [REQUISITION_FUNNEL_UNPROCESSED_LABEL]: "slate",
  Open: "orange",
  Screening: "teal",
  Offer: "amber",
  Joined: "emerald",
  Cancelled: "rose",
};

export function Requisitions() {
  const { user, projectIds } = useAuth();
  const recruiterView = isRecruiterUser(user);
  const readOnlyClient = isReadOnlyClient(user);
  const scopedView = isProjectScopedUser(projectIds);
  const portfolioView = hasUnrestrictedProjectAccess(projectIds);
  const scopeKey = user?.id ?? "anon";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [result, setResult] = useState<RecordsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RecordRow | null>(null);

  const [globalStatusBreakdown, setGlobalStatusBreakdown] = useState<Record<string, number>>({});
  const [monitor, setMonitor] = useState<import("@/lib/api").GlobalMonitor | null>(null);
  const [reqKpis, setReqKpis] = useState<RequisitionKpis | null>(null);
  const [deptBreakdown, setDeptBreakdown] = useState<Array<{ name: string; value: number }>>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [addReqOpen, setAddReqOpen] = useState(false);

  useEffect(() => {
    queries.projects().then(setProjects).catch(() => setProjects([]));
  }, [scopeKey]);

  useEffect(() => {
    if (portfolioView) return undefined;
    let mounted = true;
    queries
      .globalMonitor()
      .then((m) => {
        if (!mounted) return;
        setGlobalStatusBreakdown(m.status_breakdown ?? {});
        setMonitor(m);
      })
      .catch(() => {
        if (!mounted) return;
        setGlobalStatusBreakdown({});
        setMonitor(null);
      });
    return () => {
      mounted = false;
    };
  }, [scopeKey, portfolioView]);

  useEffect(() => {
    if (portfolioView) {
      setGlobalStatusBreakdown({});
      setMonitor(null);
    }
  }, [portfolioView]);

  useEffect(() => {
    let mounted = true;
    queries
      .requisitionKpis()
      .then((k) => {
        if (mounted) setReqKpis(k);
      })
      .catch(() => {
        if (mounted) setReqKpis(null);
      });
    return () => {
      mounted = false;
    };
  }, [scopeKey]);

  useEffect(() => {
    let mounted = true;
    queries
      .requisitionDepartments()
      .then((d) => {
        if (mounted) setDeptBreakdown(d.items ?? []);
      })
      .catch(() => {
        if (mounted) setDeptBreakdown([]);
      });
    return () => {
      mounted = false;
    };
  }, [scopeKey]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    withTimeout(
      queries.recordsAll({ page, per_page: PER_PAGE, search: debouncedSearch || undefined }),
      RECORDS_FETCH_TIMEOUT_MS,
    )
      .then((data) => {
        if (mounted) {
          setResult(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setResult((prev) =>
            prev ?? { records: [], total: 0, page, per_page: PER_PAGE, pages: 1 },
          );
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [page, debouncedSearch, scopeKey]);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const records = result?.records ?? [];
  const totalRecords = result?.total ?? 0;
  const totalPages = result?.pages ?? 1;
  const visiblePages = useMemo(
    () => buildVisiblePageNumbers(page, totalPages),
    [page, totalPages],
  );

  const funnel = useMemo(() => {
    if (debouncedSearch) {
      return requisitionFunnelVm(records);
    }
    const sb = globalStatusBreakdown;
    if (Object.keys(sb).length > 0) {
      return statusBreakdownToFunnel(sb);
    }
    const kpiSb = reqKpis?.status_breakdown;
    if (kpiSb && Object.keys(kpiSb).length > 0) {
      return statusBreakdownToFunnel(kpiSb);
    }
    return requisitionFunnelVm(records);
  }, [globalStatusBreakdown, reqKpis?.status_breakdown, records, debouncedSearch]);

  const funnelMax = Math.max(...Object.values(funnel), 1);

  const monitorBuckets =
    monitor?.ageing_summary?.buckets ?? reqKpis?.ageing_buckets ?? {};
  const ageingMax = Math.max(...Object.values(monitorBuckets), 1);
  const ageingBuckets = [
    { label: "0–30 days", count: monitorBuckets["0-30 days"] ?? monitorBuckets["0–30 days"] ?? 0, max: ageingMax, color: "var(--green)" },
    { label: "31–60 days", count: monitorBuckets["31-60 days"] ?? monitorBuckets["31–60 days"] ?? 0, max: ageingMax, color: "var(--amber)" },
    { label: "61–90 days", count: monitorBuckets["61-90 days"] ?? monitorBuckets["61–90 days"] ?? 0, max: ageingMax, color: "var(--red)" },
    { label: "90+ days", count: monitorBuckets["90+ days"] ?? monitorBuckets["90–plus days"] ?? 0, max: ageingMax, color: "var(--red)" },
  ];

  const deptData = useMemo(
    () => (debouncedSearch ? buildDeptData(records) : deptBreakdown),
    [debouncedSearch, records, deptBreakdown],
  );

  const scopeLabel = useMemo(() => {
    if (portfolioView) return "portfolio-wide";
    if (scopedView && (projectIds?.length ?? 0) === 0) return "no projects assigned";
    if (readOnlyClient) return "your client portal projects";
    if (recruiterView) return "your assigned requisitions and projects";
    return "your assigned projects";
  }, [portfolioView, scopedView, projectIds, readOnlyClient, recruiterView]);

  const subtitle = reqKpis
    ? recruiterView
      ? `${reqKpis.total_records.toLocaleString()} visible to you — ${scopeLabel} (same scope as the table below)`
      : scopedView
        ? `${reqKpis.total_records.toLocaleString()} in tracker — scoped to ${scopeLabel}`
        : `${reqKpis.total_records.toLocaleString()} in tracker · Open / Offer / Joiner counts are ${scopeLabel}`
    : `${totalRecords.toLocaleString()} on this view · loading KPIs…`;

  const funnelSubtitle = debouncedSearch
    ? "Counts from filtered rows on this page"
    : scopedView || recruiterView
      ? "Counts from your scoped requisitions (same rules as the table)"
      : "Counts from global status across the portfolio";

  const ageingSubtitle = debouncedSearch
    ? "Ageing from filtered rows; department chart from search results on this page"
    : scopedView || recruiterView
      ? "Ageing and department mix from your scoped requisitions"
      : "Ageing from monitor; department chart from scoped tracker";

  const onRequisitionSaved = useCallback((updated: RecordRow) => {
    setSelected(updated);
    setResult((prev) => {
      if (!prev) return prev;
      return { ...prev, records: prev.records.map((row) => (row.id === updated.id ? updated : row)) };
    });
  }, []);

  const onRequisitionDeleted = useCallback((id: number) => {
    setSelected(null);
    setResult((prev) => {
      if (!prev) return prev;
      if (!prev.records.some((r) => r.id === id)) return prev;
      const nextRecords = prev.records.filter((row) => row.id !== id);
      const total = Math.max(0, prev.total - 1);
      const pages = Math.max(1, Math.ceil(total / prev.per_page));
      return { ...prev, records: nextRecords, total, pages };
    });
    queries.requisitionKpis().then(setReqKpis).catch(() => {});
    queries.globalMonitor().then((m) => {
      setGlobalStatusBreakdown(m.status_breakdown ?? {});
      setMonitor(m);
    }).catch(() => {});
    queries.requisitionDepartments().then((d) => setDeptBreakdown(d.items ?? [])).catch(() => setDeptBreakdown([]));
  }, []);

  return (
    <div className="req-dash-tremor space-y-3 pb-8 md:space-y-4">
      <div>
        <span className="inline-flex max-w-full items-center whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-orange-600">
          Hiring&nbsp;·&nbsp;Pipeline
        </span>
        <Title className="mt-0.5 text-2xl font-bold tracking-tight text-tremor-content-strong md:text-3xl">
          Requisitions
        </Title>
        <Text className="mt-1.5 max-w-4xl text-xs leading-snug text-tremor-content-emphasis md:text-sm md:leading-snug">
          {subtitle}
        </Text>
      </div>

      {reqKpis ? (
        <Grid numItems={1} numItemsSm={3} className="gap-2 md:gap-3">
          <Card decoration="top" decorationColor="blue" className="p-3">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Open reqs</Text>
            <Metric className="mt-1 text-xl tabular-nums md:text-2xl">{reqKpis.open_req.toLocaleString()}</Metric>
            <Text className="mt-0.5 text-[11px] text-tremor-content-subtle md:text-xs">
              ACTIVE (no offer signal in status)
            </Text>
          </Card>
          <Card decoration="top" decorationColor="amber" className="p-3">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Offer reqs</Text>
            <Metric className="mt-1 text-xl tabular-nums md:text-2xl">{reqKpis.offer_req.toLocaleString()}</Metric>
            <Text className="mt-0.5 text-[11px] text-tremor-content-subtle md:text-xs">
              PIPELINE or status contains &quot;offer&quot;
            </Text>
          </Card>
          <Card decoration="top" decorationColor="emerald" className="p-3">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Joiners</Text>
            <Metric className="mt-1 text-xl tabular-nums md:text-2xl">{reqKpis.joiners.toLocaleString()}</Metric>
            <Text className="mt-0.5 text-[11px] text-tremor-content-subtle md:text-xs">CLOSED (joined / closed hires)</Text>
          </Card>
        </Grid>
      ) : (
        <SkeletonKpiRow count={3} />
      )}

      <Grid numItems={1} numItemsLg={2} className="gap-3">
        <Card className={flatCard}>
          <div className="border-b border-tremor-border px-4 py-3 dark:border-dark-tremor-border">
            <Title className="text-base font-semibold text-tremor-content-strong">Pipeline funnel</Title>
            <Text className="mt-0.5 text-xs text-tremor-content-subtle">{funnelSubtitle}</Text>
          </div>
          <div className="px-4 py-3">
            {loading && !result ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} height={20} />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(funnel).map(([k, v]) => {
                  const pct = funnelMax > 0 ? (v / funnelMax) * 100 : 0;
                  return (
                    <div key={k} className="flex items-center gap-2">
                      <Text className="w-[6.75rem] shrink-0 text-xs font-medium leading-tight text-tremor-content-strong">{k}</Text>
                      <div className="min-w-0 flex-1">
                        <ProgressBar
                          value={pct}
                          color={funnelBarColor[k] ?? "orange"}
                          className="[&>div]:min-w-[2px]"
                        />
                      </div>
                      <Badge color="slate" size="xs" className="shrink-0 tabular-nums">
                        {v.toLocaleString()}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <Card className={flatCard}>
          <div className="border-b border-tremor-border px-4 py-3 dark:border-dark-tremor-border">
            <Title className="text-base font-semibold text-tremor-content-strong">Ageing + department mix</Title>
            <Text className="mt-0.5 text-xs text-tremor-content-subtle">{ageingSubtitle}</Text>
          </div>
          <div className="px-4 py-3">
            <AgeingBars buckets={ageingBuckets} />
            <div className="mt-4">
              <Text className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">
                Req by department (top 8)
              </Text>
              {deptData.length === 0 ? (
                <div className="flex min-h-[80px] items-center justify-center rounded-tremor-default border border-dashed border-tremor-border bg-tremor-background-muted/40 dark:border-dark-tremor-border dark:bg-dark-tremor-background-muted/30">
                  <Text className="text-center text-xs text-tremor-content-subtle">No department data on this page</Text>
                </div>
              ) : (
                <LevelDonutChart data={deptData} />
              )}
            </div>
          </div>
        </Card>
      </Grid>

      <Card className={flatCard}>
        <div className="flex w-full min-w-0 flex-col gap-3 border-b border-tremor-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 dark:border-dark-tremor-border">
          <div className="min-w-0 w-full flex-1 sm:pr-2">
            <Title className="text-base font-semibold text-tremor-content-strong">
              Requisition master table — {totalRecords.toLocaleString()} records
            </Title>
            <Text className="mt-0.5 block text-xs text-tremor-content-subtle">Click a row to view or edit</Text>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {projects.length > 0 && !readOnlyClient ? (
              <Button type="button" size="xs" variant="primary" color="orange" onClick={() => setAddReqOpen(true)}>
                Add requisition
              </Button>
            ) : null}
            <Button type="button" size="xs" variant="secondary" disabled title="Export is not wired for this view yet">
              Export
            </Button>
          </div>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-2 border-b border-tremor-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 dark:border-dark-tremor-border">
          <div className="w-full min-w-0 sm:max-w-md sm:flex-1">
            <TextInput
              placeholder="Filter by candidate, position, HM…"
              value={search}
              onValueChange={setSearch}
              className="w-full"
              aria-label="Filter requisitions"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Text className="text-xs tabular-nums text-tremor-content-subtle">
              {totalRecords > 0
                ? `${((page - 1) * PER_PAGE) + 1}–${Math.min(page * PER_PAGE, totalRecords)} of ${totalRecords.toLocaleString()}`
                : "—"}
            </Text>
            <Button type="button" size="xs" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ←
            </Button>
            <Button type="button" size="xs" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              →
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto px-2 pb-3 pt-1">
          {loading && !result ? (
            <SkeletonTable rows={8} cols={9} />
          ) : (
            <Table className="min-w-[920px]">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Req ID</TableHeaderCell>
                  <TableHeaderCell>Candidate</TableHeaderCell>
                  <TableHeaderCell>Position</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>HM</TableHeaderCell>
                  <TableHeaderCell>Dept</TableHeaderCell>
                  <TableHeaderCell>Location</TableHeaderCell>
                  <TableHeaderCell className="text-right">CTC</TableHeaderCell>
                  <TableHeaderCell className="text-right">Revenue</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <Text className="block py-8 text-center text-sm text-tremor-content-subtle">
                        {totalRecords === 0 ? "Upload a project file to see requisitions" : "No matching records"}
                      </Text>
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((r) => {
                    const reqId = displayRecordReqId(r);
                    const rev = r.revenue_results?.revenue ?? 0;
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-tremor-background-muted dark:hover:bg-dark-tremor-background-muted"
                        onClick={() => setSelected(r)}
                      >
                        <TableCell className="font-medium text-orange-600 tabular-nums dark:text-orange-400">{reqId}</TableCell>
                        <TableCell className="text-sm">{r.candidate_name || "—"}</TableCell>
                        <TableCell className="text-sm">{r.position_title || "—"}</TableCell>
                        <TableCell>
                          <StatusTag status={r.status || r.global_status || "Open"} />
                        </TableCell>
                        <TableCell className="text-sm">{r.hiring_manager || "—"}</TableCell>
                        <TableCell className="text-sm">{r.department || "—"}</TableCell>
                        <TableCell className="text-sm">{r.location || "—"}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {formatOfferedCtc(r.offered_ctc)}
                        </TableCell>
                        <TableCell
                          className={`text-right text-sm tabular-nums ${rev > 0 ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-tremor-content-subtle"}`}
                        >
                          {rev > 0 ? formatCurrency(rev) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>

        {totalPages > 1 ? (
          <Flex justifyContent="center" alignItems="center" className="flex-wrap gap-1.5 border-t border-tremor-border px-4 py-3 dark:border-dark-tremor-border">
            <Button
              type="button"
              size="xs"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Previous page"
            >
              ←
            </Button>
            {visiblePages[0] > 1 ? (
              <Text className="self-center text-xs text-tremor-content-subtle">…</Text>
            ) : null}
            {visiblePages.map((p) => (
              <Button
                key={p}
                type="button"
                size="xs"
                variant={page === p ? "primary" : "light"}
                color="orange"
                className="min-w-[1.75rem] px-0 tabular-nums"
                onClick={() => setPage(p)}
              >
                {p}
              </Button>
            ))}
            {visiblePages[visiblePages.length - 1] < totalPages ? (
              <Text className="self-center text-xs text-tremor-content-subtle">…{totalPages} pages</Text>
            ) : null}
            <Button
              type="button"
              size="xs"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
            >
              →
            </Button>
          </Flex>
        ) : null}
      </Card>

      <RequisitionCreateDrawer
        open={addReqOpen}
        onClose={() => setAddReqOpen(false)}
        projects={projects}
        onCreated={(r) => {
          setAddReqOpen(false);
          setSelected(r);
          setPage(1);
          queries
            .recordsAll({ page: 1, per_page: PER_PAGE, search: debouncedSearch || undefined })
            .then(setResult)
            .catch(() => {});
          queries.requisitionKpis().then(setReqKpis).catch(() => setReqKpis(null));
          queries.globalMonitor().then((m) => {
            setGlobalStatusBreakdown(m.status_breakdown ?? {});
            setMonitor(m);
          }).catch(() => {});
        }}
      />

      <RequisitionRecordDrawer
        record={selected}
        onClose={() => setSelected(null)}
        onSaved={onRequisitionSaved}
        onDeleted={onRequisitionDeleted}
      />
    </div>
  );
}
