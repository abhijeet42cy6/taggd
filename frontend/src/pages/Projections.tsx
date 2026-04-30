/**
 * Projection playground — scenarios by time, project clubbing, project head, and side-by-side compare.
 */
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Search } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Flex,
  Grid,
  Metric,
  Select,
  SelectItem,
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
import { ProjectionsModelChartWindow } from "@/components/tremor-blocks/ProjectionsModelChartWindow";
import {
  ProjectionsLedgerScopeCard,
  ProjectionsScenariosCard,
} from "@/components/tremor-blocks/ProjectionsScopeSurface";
import { queries, type Project } from "@/lib/api";
import { financeRowsVm, type FinanceRowVm } from "@/lib/view-models/finance";
import { DashboardFilters } from "@/components/platform/DashboardFilters";
import {
  DEFAULT_DASHBOARD_FILTERS,
  filterFinanceRows,
  fiscalYearStart,
  parseMonthSort,
  isProjectEligibleForFinanceAccountList,
  type DashboardFilters as DF,
} from "@/lib/dashboard-aggregates";
import { formatLargeCurrency, formatPercent } from "@/lib/utils";
import {
  buildMonthlySeries,
  projectForwardFromHistory,
  countRowsInFy,
  filterRowsByProjectIds,
  buildDualScenarioChartData,
  sumForwardRevenueInr,
  buildRevenueChartData,
  buildCmCollChartData,
  filterComparisonByChartRange,
  lastMonthKeyFromSeries,
  type ChartTimeRange,
} from "@/lib/projections-forecast";
const HORIZONS = [3, 6, 9] as const;

const CHART_TIME_RANGES: { value: ChartTimeRange; label: string; hint: string }[] = [
  { value: "6m", label: "6M", hint: "Last 6 months of actuals" },
  { value: "12m", label: "12M", hint: "Last 12 months" },
  { value: "18m", label: "18M", hint: "Last 18 months" },
  { value: "24m", label: "24M", hint: "Last 24 months" },
  { value: "all", label: "All", hint: "Full history in scope" },
];

function uniqSortedStr(vals: (string | null | undefined)[]): string[] {
  const s = new Set<string>();
  for (const v of vals) {
    const t = (v || "").trim();
    if (t) s.add(t);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

function projectLabel(p: Project): string {
  const a = (p.account_name || "").trim();
  const e = (p.engagement_name || "").trim();
  if (e && e !== a) return `${a} — ${e}`;
  return a || `PRJ-${p.id}`;
}

function fyShortLabel(start: number): string {
  return `FY${String(start).slice(2)}–${String(start + 1).slice(2)}`;
}

/** One-line summary for the collapsible "Ledger scope" block. */
function ledgerScopeSummary(f: DF, fyStart: number): string {
  const bits: string[] = [fyShortLabel(fyStart)];
  if (f.region !== "all") bits.push(f.region);
  if (f.subRegion !== "all") bits.push(f.subRegion);
  if (f.vertical !== "all") bits.push(f.vertical);
  if (f.account !== "all") bits.push(f.account);
  if (f.regionHead !== "all") bits.push(`RH: ${f.regionHead}`);
  if (f.practiceHead !== "all") bits.push(`PH: ${f.practiceHead}`);
  if (bits.length === 1) {
    return `${bits[0]} · All regions, verticals & accounts (narrow below)`;
  }
  return bits.join(" · ");
}

function deltaTrendClass(v: number | null | undefined): string {
  if (v == null) return "tabular-nums text-right";
  if (v > 0) return "tabular-nums text-right font-semibold text-emerald-600 dark:text-emerald-400";
  if (v < 0) return "tabular-nums text-right font-semibold text-rose-600 dark:text-rose-400";
  return "tabular-nums text-right";
}

type ScenarioBlockProps = {
  title: string;
  hint: string;
  projects: Project[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  search: string;
  onSearch: (s: string) => void;
};

function ScenarioProjectPicker({
  title,
  hint,
  projects,
  selectedIds,
  onToggle,
  search,
  onSearch,
}: ScenarioBlockProps) {
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return projects;
    return projects.filter((p) => {
      const lab = projectLabel(p).toLowerCase();
      return lab.includes(q) || String(p.id).includes(q);
    });
  }, [projects, q]);

  const sel = new Set(selectedIds);

  return (
    <Card className="overflow-hidden ring-1 ring-tremor-ring dark:ring-dark-tremor-ring">
      <div className="border-b border-tremor-border px-3 py-2.5 dark:border-dark-tremor-border">
        <Title className="text-sm font-semibold text-tremor-content-strong">{title}</Title>
        <Text className="mt-0.5 text-xs text-tremor-content-subtle">{hint}</Text>
        <TextInput
          className="mt-2"
          icon={Search}
          placeholder="Search project…"
          value={search}
          onValueChange={onSearch}
          aria-label="Filter project list"
        />
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-tremor-border px-3 py-2 dark:border-dark-tremor-border">
        {selectedIds.length > 0 ? (
          selectedIds.map((id) => {
            const p = projects.find((x) => x.id === id);
            if (!p) return null;
            return (
              <Button
                key={id}
                type="button"
                size="xs"
                variant="light"
                color="orange"
                className="max-w-full rounded-full"
                onClick={() => onToggle(id)}
                title="Remove from scenario"
              >
                <span className="truncate">{projectLabel(p)}</span>
                <span className="ml-1 shrink-0 opacity-70" aria-hidden>
                  ×
                </span>
              </Button>
            );
          })
        ) : (
          <Text className="text-xs text-tremor-content-subtle">All accounts in the filter scope (full slice)</Text>
        )}
      </div>
      <div className="max-h-52 overflow-y-auto px-1.5 py-1.5" role="listbox" aria-label={`${title} project list`}>
        {filtered.map((p) => {
          const on = sel.has(p.id);
          return (
            <label
              key={p.id}
              className="flex cursor-pointer items-start gap-2 rounded-tremor-default px-2 py-1.5 hover:bg-tremor-background-muted dark:hover:bg-dark-tremor-background-muted"
            >
              <input type="checkbox" checked={on} onChange={() => onToggle(p.id)} className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <Text className="block text-xs font-medium leading-snug text-tremor-content-strong">{projectLabel(p)}</Text>
                {p.project_head ? (
                  <Text className="mt-0.5 block text-[11px] leading-snug text-tremor-content-subtle" title="Project head">
                    {p.project_head}
                  </Text>
                ) : null}
              </span>
            </label>
          );
        })}
        {filtered.length === 0 ? (
          <Text className="block py-4 text-center text-xs text-tremor-content-subtle">No projects match.</Text>
        ) : null}
      </div>
    </Card>
  );
}

export function Projections() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [financeRows, setFinanceRows] = useState<FinanceRowVm[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [filters, setFilters] = useState<DF>(DEFAULT_DASHBOARD_FILTERS);
  const [selectedFyStart, setSelectedFyStart] = useState(2025);

  const [monthsAhead, setMonthsAhead] = useState<number>(3);
  const [projectHeadFilter, setProjectHeadFilter] = useState("all");
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [projectIdsA, setProjectIdsA] = useState<number[]>([]);
  const [projectIdsB, setProjectIdsB] = useState<number[]>([]);
  const [compareOn, setCompareOn] = useState(false);
  const [chartTimeRange, setChartTimeRange] = useState<ChartTimeRange>("12m");
  /** Keep filters discoverable; scenario clubbing is secondary on first paint. */
  const [scenariosOpen, setScenariosOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadErr(null);
      try {
        const [p, f] = await Promise.allSettled([queries.projects(), queries.financeData()]);
        if (!mounted) return;
        if (p.status === "fulfilled") setProjects(p.value);
        if (f.status === "fulfilled") setFinanceRows(financeRowsVm(f.value || []));
        if (f.status === "rejected") setLoadErr("Could not load finance data.");
      } catch (e) {
        if (mounted) setLoadErr(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const fyYears = useMemo(() => {
    const s = new Set<number>();
    for (const r of financeRows) {
      const d = parseMonthSort(r.month_sort);
      if (d) s.add(fiscalYearStart(d));
    }
    return Array.from(s).sort((a, b) => b - a);
  }, [financeRows]);

  useEffect(() => {
    if (fyYears.length && !fyYears.includes(selectedFyStart)) {
      setSelectedFyStart(fyYears[0]);
    }
  }, [fyYears, selectedFyStart]);

  useEffect(() => {
    if (compareOn) setScenariosOpen(true);
  }, [compareOn]);

  const filterForScope = useMemo(
    () => ({ ...filters, period: "all" as const, month: "all" as const }),
    [filters],
  );

  const scopedRows = useMemo(
    () => filterFinanceRows(financeRows, projects, filterForScope),
    [financeRows, projects, filterForScope],
  );

  const projectHeadOptions = useMemo(
    () => ["all", ...uniqSortedStr(projects.map((p) => p.project_head))],
    [projects],
  );

  const projectsForPicker = useMemo(() => {
    const base = projects.filter(isProjectEligibleForFinanceAccountList);
    if (projectHeadFilter === "all") return base;
    return base.filter(
      (p) =>
        (p.project_head || "").trim() === projectHeadFilter || (p.be_spoc || "").trim() === projectHeadFilter,
    );
  }, [projects, projectHeadFilter]);

  const rowsA = useMemo(
    () => filterRowsByProjectIds(scopedRows, projectIdsA),
    [scopedRows, projectIdsA],
  );
  const rowsB = useMemo(
    () => filterRowsByProjectIds(scopedRows, projectIdsB),
    [scopedRows, projectIdsB],
  );

  const monthlyA = useMemo(() => buildMonthlySeries(rowsA), [rowsA]);
  const monthlyB = useMemo(() => buildMonthlySeries(rowsB), [rowsB]);

  const outA = useMemo(
    () => projectForwardFromHistory(monthlyA, monthsAhead, { fyStartForContext: selectedFyStart }),
    [monthlyA, monthsAhead, selectedFyStart],
  );
  const outB = useMemo(
    () => projectForwardFromHistory(monthlyB, monthsAhead, { fyStartForContext: selectedFyStart }),
    [monthlyB, monthsAhead, selectedFyStart],
  );

  const { forward: forwardA, methodNote: methodA } = outA;
  const { forward: forwardB, methodNote: methodB } = outB;

  const dualChart = useMemo(
    () => buildDualScenarioChartData(monthlyA, forwardA, monthlyB, forwardB),
    [monthlyA, forwardA, monthlyB, forwardB],
  );

  const lastHistoryKeyForCompare = useMemo(() => {
    const ka = lastMonthKeyFromSeries(monthlyA);
    const kb = lastMonthKeyFromSeries(monthlyB);
    if (!ka) return kb;
    if (!kb) return ka;
    return ka.localeCompare(kb) >= 0 ? ka : kb;
  }, [monthlyA, monthlyB]);

  const dualChartFiltered = useMemo(
    () => filterComparisonByChartRange(dualChart, chartTimeRange, lastHistoryKeyForCompare),
    [dualChart, chartTimeRange, lastHistoryKeyForCompare],
  );

  const kpiA = useMemo(() => {
    const s = sumForwardRevenueInr(forwardA);
    const c = forwardA[0];
    return { sum3: s.total, m1: c?.rev, cm1: c?.cm, coll1: c?.collected, cmPct: c?.cmPct };
  }, [forwardA]);

  const kpiB = useMemo(() => {
    const s = sumForwardRevenueInr(forwardB);
    const c = forwardB[0];
    return { sum3: s.total, m1: c?.rev, cm1: c?.cm, coll1: c?.collected, cmPct: c?.cmPct };
  }, [forwardB]);

  const toggleA = useCallback((id: number) => {
    setProjectIdsA((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);
  const toggleB = useCallback((id: number) => {
    setProjectIdsB((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const chartDataSingle = useMemo(
    () => buildRevenueChartData(monthlyA, forwardA, chartTimeRange),
    [monthlyA, forwardA, chartTimeRange],
  );

  const cmCollA = useMemo(
    () => buildCmCollChartData(monthlyA, forwardA, chartTimeRange),
    [monthlyA, forwardA, chartTimeRange],
  );

  const fyRowCount = countRowsInFy(scopedRows, selectedFyStart);
  const canProjectA = monthlyA.length >= 4;
  const canProjectB = monthlyB.length >= 4;
  const deltaRev = kpiA.m1 != null && kpiB.m1 != null ? kpiB.m1 - kpiA.m1 : null;
  const delta3 = compareOn && canProjectA && canProjectB ? kpiB.sum3 - kpiA.sum3 : null;
  const deltaCm = kpiA.cm1 != null && kpiB.cm1 != null ? kpiB.cm1 - kpiA.cm1 : null;
  const deltaColl = kpiA.coll1 != null && kpiB.coll1 != null ? kpiB.coll1 - kpiA.coll1 : null;

  const timeRangeLabel = CHART_TIME_RANGES.find((x) => x.value === chartTimeRange)?.label ?? chartTimeRange;

  return (
    <div className="projections-tremor space-y-3 pb-6 md:space-y-4 md:pb-8">
      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            {/* Use span (not Tremor Text / <p>) so the eyebrow never collapses to width 0 in flex layouts */}
            <span className="inline-flex max-w-full items-center whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-orange-600">
              Finance&nbsp;·&nbsp;Planning
            </span>
            <Title className="mt-0.5 text-2xl font-bold tracking-tight text-tremor-content-strong md:text-3xl">
              Projections
            </Title>
          </div>
          <Flex className="shrink-0 flex-wrap gap-1.5 sm:justify-end sm:pt-0.5" aria-label="Context">
            {fyYears.length > 0 ? (
              <Badge color="orange" size="xs">
                {fyShortLabel(selectedFyStart)}
              </Badge>
            ) : null}
            {fyRowCount > 0 ? (
              <Badge color="slate" size="xs">
                {fyRowCount} row{fyRowCount === 1 ? "" : "s"} in FY
              </Badge>
            ) : null}
            <Badge color="slate" size="xs">
              {timeRangeLabel} + {monthsAhead}M
            </Badge>
          </Flex>
        </div>
        <Text className="mt-1.5 max-w-3xl text-xs leading-snug text-tremor-content-emphasis md:text-sm md:leading-snug">
          What-if <span className="font-semibold text-tremor-content-strong">revenue, CM, and collections</span> from ledger
          history — for planning, not a replacement for official budget. Set{" "}
          <span className="font-semibold">chart history</span> and <span className="font-semibold">forward horizon</span> first,
          then scope the ledger; optionally club projects in scenarios.
        </Text>
        <details className="mt-2 rounded-tremor-default border border-tremor-border bg-tremor-background-subtle px-3 py-2 dark:border-dark-tremor-border dark:bg-dark-tremor-background-subtle">
          <summary className="cursor-pointer text-xs font-semibold text-tremor-content-strong">
            How time &amp; scope work
          </summary>
          <div className="mt-2 space-y-1.5 border-t border-tremor-border pt-2 text-xs leading-snug text-tremor-content-emphasis dark:border-dark-tremor-border md:text-sm md:leading-snug">
            <Text>
              <span className="font-semibold">History (6M–All)</span> only changes the plotted past. The{" "}
              <span className="font-semibold">model</span> still uses every in-scope month to estimate trend and CM/cash
              ratios.
            </Text>
            <Text>
              <span className="font-semibold">Ledger scope</span> (FY, region, account) defines the universe.{" "}
              <span className="font-semibold">Scenarios</span> can further restrict to checked projects; empty = full portfolio
              in scope.
            </Text>
          </div>
        </details>
      </div>

      {loadErr ? (
        <Card className="border-rose-200 bg-rose-50 ring-1 ring-rose-200 dark:border-rose-900/40 dark:bg-rose-950/30 dark:ring-rose-900/50">
          <Text className="px-3 py-2 text-xs font-medium text-rose-800 dark:text-rose-200 md:text-sm" role="alert">
            {loadErr}
          </Text>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <Flex className="min-h-[96px] items-center justify-center py-6">
            <Text className="text-sm font-medium text-tremor-content-subtle">Loading finance history…</Text>
          </Flex>
        </Card>
      ) : (
        <>
          <ProjectionsModelChartWindow
            titleId="pg-model-title"
            chartTimeRange={chartTimeRange}
            chartTimeRanges={CHART_TIME_RANGES}
            onChartTimeRangeChange={setChartTimeRange}
            monthsAhead={monthsAhead}
            horizons={HORIZONS}
            onMonthsAheadChange={setMonthsAhead}
            projectHeadFilter={projectHeadFilter}
            projectHeadOptions={projectHeadOptions}
            onProjectHeadFilterChange={(v) => {
              setProjectHeadFilter(v);
              setSearchA("");
              setSearchB("");
            }}
            compareOn={compareOn}
            onCompareOnChange={setCompareOn}
          />

          <ProjectionsLedgerScopeCard
            summaryLine={ledgerScopeSummary(filters, selectedFyStart)}
            filters={
              <DashboardFilters
                value={filters}
                onChange={setFilters}
                projects={projects}
                financeRows={financeRows}
                fyYears={fyYears}
                selectedFyStart={selectedFyStart}
                onFyChange={setSelectedFyStart}
              />
            }
            footnote={
              <Text className="text-[11px] leading-snug text-tremor-content-subtle md:text-xs">
                Period/month here do <span className="font-semibold text-tremor-content-emphasis">not</span> change the
                projection model (all in-scope months are used). They affect account picklists.
                {fyRowCount > 0 ? (
                  <span>
                    {" "}
                    · {fyRowCount} row{fyRowCount === 1 ? "" : "s"} in this FY
                  </span>
                ) : null}
              </Text>
            }
          />

          <ProjectionsScenariosCard
            open={scenariosOpen}
            onToggle={() => setScenariosOpen((o) => !o)}
            summaryMeta={
              projectIdsA.length + projectIdsB.length === 0
                ? "Full portfolio in scope"
                : `${projectIdsA.length + projectIdsB.length} project(s)${compareOn ? " · A/B" : " · A"}`
            }
          >
            <ScenarioProjectPicker
              title="Scenario A"
              hint="No selection = full slice. Check projects to club."
              projects={projectsForPicker}
              selectedIds={projectIdsA}
              onToggle={toggleA}
              search={searchA}
              onSearch={setSearchA}
            />
            {compareOn ? (
              <ScenarioProjectPicker
                title="Scenario B"
                hint="e.g. club accounts to compare run-rate to A."
                projects={projectsForPicker}
                selectedIds={projectIdsB}
                onToggle={toggleB}
                search={searchB}
                onSearch={setSearchB}
              />
            ) : null}
          </ProjectionsScenariosCard>

          {!canProjectA ? (
            <Card decoration="left" decorationColor="amber" className="p-3">
              <Text className="text-xs text-tremor-content-emphasis md:text-sm">
                <span className="font-semibold text-tremor-content-strong">Scenario A:</span> need at least 4 months of revenue
                actuals in this slice
                {projectIdsA.length ? " for the selected project(s)" : ""}. Adjust filters or project pick.
              </Text>
            </Card>
          ) : null}

          {canProjectA && !compareOn ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Key metrics — scenario A">
                <Card decoration="top" decorationColor="orange" className="p-3">
                  <Text className="text-[10px] font-semibold uppercase tracking-wide text-orange-600">Next month · revenue (proj.)</Text>
                  <Metric className="mt-1 text-xl tabular-nums md:text-2xl">
                    {kpiA.m1 != null ? formatLargeCurrency(kpiA.m1) : "—"}
                  </Metric>
                </Card>
                <Card decoration="top" decorationColor="teal" className="p-3">
                  <Text className="text-[10px] font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">Implied CM</Text>
                  <Metric className="mt-1 text-xl tabular-nums md:text-2xl">
                    {kpiA.cm1 != null ? formatLargeCurrency(kpiA.cm1) : "—"}
                  </Metric>
                  {kpiA.cmPct != null ? (
                    <Text className="mt-0.5 text-[11px] text-tremor-content-subtle">{formatPercent(kpiA.cmPct, 1)} of rev</Text>
                  ) : null}
                </Card>
                <Card decoration="top" decorationColor="blue" className="p-3">
                  <Text className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                    Implied collections
                  </Text>
                  <Metric className="mt-1 text-xl tabular-nums md:text-2xl">
                    {kpiA.coll1 != null ? formatLargeCurrency(kpiA.coll1) : "—"}
                  </Metric>
                </Card>
                <Card decoration="top" decorationColor="slate" className="p-3">
                  <Text className="text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">
                    Sum · forward {monthsAhead}M revenue (proj.)
                  </Text>
                  <Metric className="mt-1 text-xl tabular-nums md:text-2xl">{formatLargeCurrency(kpiA.sum3)}</Metric>
                </Card>
              </div>

              <Grid numItems={1} numItemsLg={2} className="gap-3">
                <Card className="overflow-hidden ring-1 ring-tremor-ring dark:ring-dark-tremor-ring">
                  <div className="border-b border-tremor-border px-3 py-2 dark:border-dark-tremor-border">
                    <Title className="text-base font-semibold text-tremor-content-strong">Revenue</Title>
                    <Text className="mt-0.5 text-xs text-tremor-content-subtle md:text-sm">
                      ₹ Cr · <Badge size="xs" color="orange">History {timeRangeLabel}</Badge> + {monthsAhead}M projected. Solid =
                      actual, dashed = model, thin = official ledger forecast when present.
                    </Text>
                  </div>
                  <div className="h-[260px] w-full px-1.5 pb-2 pt-1 md:h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartDataSingle} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} label={{ value: "₹ Cr", angle: -90, position: "insideLeft", fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => (typeof v === "number" ? v.toFixed(2) : v)} contentStyle={{ fontSize: 12 }} />
                        <Legend />
                        <Line type="monotone" dataKey="revActual" name="Rev actual" stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls />
                        <Line type="monotone" dataKey="revPred" name="Projected" stroke="var(--accent2)" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
                        <Line type="monotone" dataKey="officialFcst" name="Official fcst (hist.)" stroke="var(--text-subtle)" strokeWidth={1} dot={false} connectNulls />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card className="overflow-hidden ring-1 ring-tremor-ring dark:ring-dark-tremor-ring">
                  <div className="border-b border-tremor-border px-3 py-2 dark:border-dark-tremor-border">
                    <Title className="text-base font-semibold text-tremor-content-strong">CM &amp; collections</Title>
                    <Text className="mt-0.5 text-xs text-tremor-content-subtle md:text-sm">
                      Trailing <span className="font-semibold text-tremor-content-emphasis">actual</span> CM and cash in scope (
                      {timeRangeLabel}) + <span className="font-semibold text-tremor-content-emphasis">implied</span> path for the
                      next {monthsAhead}M (ratio × projected revenue).
                    </Text>
                  </div>
                  <div className="h-[220px] w-full px-1.5 pb-2 pt-1 md:h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={cmCollA} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} label={{ value: "₹ Cr", angle: -90, position: "insideLeft", fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => (typeof v === "number" ? v.toFixed(2) : v)} />
                        <Legend />
                        <Area type="monotone" dataKey="cm" name="Implied CM" fill="rgba(20, 184, 166, 0.12)" stroke="var(--green)" />
                        <Line type="monotone" dataKey="collected" name="Implied collections" stroke="var(--blue)" strokeWidth={2} dot />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </Grid>
              <Card className="bg-tremor-background-muted p-3 dark:bg-dark-tremor-background-muted">
                <Text className="text-xs text-tremor-content-emphasis md:text-sm">
                  <span className="font-semibold text-tremor-content-strong">Scenario A run:</span> {methodA}
                </Text>
              </Card>
            </>
          ) : null}

          {compareOn && canProjectA && canProjectB ? (
            <>
              <section aria-label="Compare KPIs">
              <Card className="overflow-hidden ring-1 ring-tremor-ring dark:ring-dark-tremor-ring">
                <div className="border-b border-tremor-border px-3 py-2 dark:border-dark-tremor-border">
                  <Title className="text-base font-semibold text-tremor-content-strong">Comparison</Title>
                </div>
                <div className="overflow-x-auto px-1.5 pb-2 pt-1">
                  <Table className="min-w-[640px] text-xs md:text-sm">
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Metric</TableHeaderCell>
                        <TableHeaderCell>
                          Scenario A{" "}
                          {projectIdsA.length
                            ? `(${projectIdsA.length} project${projectIdsA.length > 1 ? "s" : ""})`
                            : "(full slice)"}
                        </TableHeaderCell>
                        <TableHeaderCell>
                          Scenario B{" "}
                          {projectIdsB.length
                            ? `(${projectIdsB.length} project${projectIdsB.length > 1 ? "s" : ""})`
                            : "(full slice)"}
                        </TableHeaderCell>
                        <TableHeaderCell className="text-right">Δ (B − A)</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TableRow>
                        <TableCell>Next month · revenue (proj.)</TableCell>
                        <TableCell className="tabular-nums">{kpiA.m1 != null ? formatLargeCurrency(kpiA.m1) : "—"}</TableCell>
                        <TableCell className="tabular-nums">{kpiB.m1 != null ? formatLargeCurrency(kpiB.m1) : "—"}</TableCell>
                        <TableCell className={deltaTrendClass(deltaRev)}>
                          {deltaRev != null ? formatLargeCurrency(deltaRev) : "—"}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Implied CM (next month)</TableCell>
                        <TableCell className="tabular-nums">{kpiA.cm1 != null ? formatLargeCurrency(kpiA.cm1) : "—"}</TableCell>
                        <TableCell className="tabular-nums">{kpiB.cm1 != null ? formatLargeCurrency(kpiB.cm1) : "—"}</TableCell>
                        <TableCell className={deltaTrendClass(deltaCm)}>{deltaCm != null ? formatLargeCurrency(deltaCm) : "—"}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Implied collections (next month)</TableCell>
                        <TableCell className="tabular-nums">{kpiA.coll1 != null ? formatLargeCurrency(kpiA.coll1) : "—"}</TableCell>
                        <TableCell className="tabular-nums">{kpiB.coll1 != null ? formatLargeCurrency(kpiB.coll1) : "—"}</TableCell>
                        <TableCell className={deltaTrendClass(deltaColl)}>
                          {deltaColl != null ? formatLargeCurrency(deltaColl) : "—"}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Sum · forward {monthsAhead}M revenue (proj.)</TableCell>
                        <TableCell className="tabular-nums">{formatLargeCurrency(kpiA.sum3)}</TableCell>
                        <TableCell className="tabular-nums">{formatLargeCurrency(kpiB.sum3)}</TableCell>
                        <TableCell className={deltaTrendClass(delta3)}>{delta3 != null ? formatLargeCurrency(delta3) : "—"}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </Card>
              </section>

              <Card className="overflow-hidden ring-1 ring-tremor-ring dark:ring-dark-tremor-ring">
                <div className="border-b border-tremor-border px-3 py-2 dark:border-dark-tremor-border">
                  <Title className="text-base font-semibold text-tremor-content-strong">Revenue overlay (₹ Cr) — A vs B</Title>
                  <Text className="mt-0.5 text-xs text-tremor-content-subtle md:text-sm">
                    Chart history <Badge size="xs" color="orange">{timeRangeLabel}</Badge> (aligned to the later of the two series)
                    + forward. Solid = actual; dashed = model. A: coral / teal · B: violet / amber
                  </Text>
                </div>
                <div className="h-[300px] w-full px-1.5 pb-2 pt-1 md:h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dualChartFiltered} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} label={{ value: "₹ Cr", angle: -90, position: "insideLeft", fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ fontSize: 12 }}
                        formatter={(v: number) => (typeof v === "number" && v != null ? v.toFixed(2) : "—")}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="revA" name="A · actual" stroke="#ea580c" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="revB" name="B · actual" stroke="#7c3aed" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="predA" name="A · projected" stroke="#0d9488" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
                      <Line type="monotone" dataKey="predB" name="B · projected" stroke="#d97706" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Grid numItems={1} numItemsMd={2} className="gap-3">
                <Card className="bg-tremor-background-muted p-3 dark:bg-dark-tremor-background-muted">
                  <Text className="text-xs text-tremor-content-emphasis md:text-sm">
                    <span className="font-semibold text-tremor-content-strong">Scenario A</span> {methodA}
                  </Text>
                </Card>
                <Card className="bg-tremor-background-muted p-3 dark:bg-dark-tremor-background-muted">
                  <Text className="text-xs text-tremor-content-emphasis md:text-sm">
                    <span className="font-semibold text-tremor-content-strong">Scenario B</span> {methodB}
                  </Text>
                </Card>
              </Grid>
            </>
          ) : null}

          {compareOn && canProjectA && !canProjectB ? (
            <Card decoration="left" decorationColor="amber" className="p-3">
              <Text className="text-xs text-tremor-content-emphasis md:text-sm">
                <span className="font-semibold text-tremor-content-strong">Scenario B</span> needs at least 4 months of history for
                the selected project(s) (or use an empty pick for full slice).
              </Text>
            </Card>
          ) : null}
        </>
      )}

      <Card className="ring-1 ring-tremor-ring dark:ring-dark-tremor-ring">
        <div className="border-b border-tremor-border px-3 py-2 dark:border-dark-tremor-border">
          <Title className="text-base font-semibold text-tremor-content-strong">How to use the playground</Title>
        </div>
        <ul className="list-disc space-y-2 px-6 py-3 text-xs text-tremor-content-emphasis marker:text-tremor-content-subtle md:px-7 md:text-sm">
          <li>
            <span className="font-semibold text-tremor-content-strong">Club projects:</span> in Scenario B, check two (or more)
            project rows — the model sums their ledger and runs one forward path, so you can compare a single account (A)
            against the same account plus another (B).
          </li>
          <li>
            <span className="font-semibold text-tremor-content-strong">People / collaboration:</span> use{" "}
            <span className="font-semibold">Shortlist by head</span> to filter the project list; the main filters still have
            Region head / Practice head for the wider team view.
          </li>
          <li>
            <span className="font-semibold text-tremor-content-strong">Time:</span> horizon changes how many forward months appear
            in the chart and the rolling sum column.
          </li>
        </ul>
      </Card>
    </div>
  );
}
