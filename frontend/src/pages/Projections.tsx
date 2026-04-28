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
import "@/styles/projections-page.css";

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
    <div className="pg-scenario">
      <div className="pg-scenario__head">
        <h3 className="pg-scenario__title">{title}</h3>
        <p className="pg-scenario__hint">{hint}</p>
        <input
          type="search"
          className="pg-scenario__search"
          placeholder="Search project…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Filter project list"
        />
      </div>
      <div className="pg-scenario__chips">
        {selectedIds.length > 0 ? (
          selectedIds.map((id) => {
            const p = projects.find((x) => x.id === id);
            if (!p) return null;
            return (
              <button
                key={id}
                type="button"
                className="pg-chip pg-chip--on"
                onClick={() => onToggle(id)}
                title="Remove from scenario"
              >
                {projectLabel(p)}
                <span className="pg-chip__x" aria-hidden>×</span>
              </button>
            );
          })
        ) : (
          <span className="pg-scenario__empty-pick">All accounts in the filter scope (full slice)</span>
        )}
      </div>
      <ul className="pg-project-list" role="listbox" aria-label={`${title} project list`}>
        {filtered.map((p) => {
          const on = sel.has(p.id);
          return (
            <li key={p.id}>
              <label className="pg-project-row">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(p.id)}
                />
                <span className="pg-project-row__name">{projectLabel(p)}</span>
                {p.project_head ? (
                  <span className="pg-project-row__meta" title="Project head">{p.project_head}</span>
                ) : null}
              </label>
            </li>
          );
        })}
        {filtered.length === 0 && <li className="pg-project-list__empty">No projects match.</li>}
      </ul>
    </div>
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

  const timeRangeLabel = CHART_TIME_RANGES.find((x) => x.value === chartTimeRange)?.label ?? chartTimeRange;

  return (
    <div className="projections-page">
      <header className="pg-hero">
        <div className="pg-hero__top">
          <div>
            <div className="pg-hero__eyebrow">Finance · Planning</div>
            <h1 className="pg-hero__title">Projections</h1>
            <p className="pg-hero__lead">
              What-if <strong>revenue, CM, and collections</strong> from ledger history — for planning, not a replacement for
              official budget. Set <strong>chart history</strong> and <strong>forward horizon</strong> first, then scope the
              ledger; optionally club projects in scenarios.
            </p>
          </div>
          <div className="pg-hero__meta" aria-label="Context">
            {fyYears.length > 0 && <span className="pg-hero__chip">{fyShortLabel(selectedFyStart)}</span>}
            {fyRowCount > 0 && (
              <span className="pg-hero__chip pg-hero__chip--muted">
                {fyRowCount} row{fyRowCount === 1 ? "" : "s"} in FY
              </span>
            )}
            <span className="pg-hero__chip pg-hero__chip--muted">
              {timeRangeLabel} + {monthsAhead}M
            </span>
          </div>
        </div>
        <details className="pg-prose-details">
          <summary className="pg-prose-details__summary">How time &amp; scope work</summary>
          <div className="pg-prose-details__body">
            <p>
              <strong>History (6M–All)</strong> only changes the <em>plotted</em> past. The <strong>model</strong> still uses
              every in-scope month to estimate trend and CM/cash ratios.
            </p>
            <p>
              <strong>Ledger scope</strong> (FY, region, account) defines the universe. <strong>Scenarios</strong> can further
              restrict to checked projects; empty = full portfolio in scope.
            </p>
          </div>
        </details>
      </header>

      {loadErr && (
        <div className="projections-page__err" role="alert">{loadErr}</div>
      )}

      {loading ? (
        <div className="projections-page__loading">Loading finance history…</div>
      ) : (
        <>
      <section className="pg-panel pg-panel--accent" aria-labelledby="pg-model-title">
        <div className="pg-panel__head">
          <h2 id="pg-model-title" className="pg-panel__title">Model &amp; chart window</h2>
          <p className="pg-panel__desc">What you see on the x-axis. Engine uses full in-scope history for math.</p>
        </div>
        <div className="pg-toolbar__row pg-toolbar__row--flush">
          <div className="pg-segment-wrap">
            <span className="pg-segment-legend" id="chart-hist-label">History on chart</span>
            <div className="pg-segment" role="group" aria-labelledby="chart-hist-label">
              {CHART_TIME_RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={r.value === chartTimeRange ? "pg-segment__btn pg-segment__btn--active" : "pg-segment__btn"}
                  onClick={() => setChartTimeRange(r.value)}
                  title={r.hint}
                  aria-pressed={r.value === chartTimeRange}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <label className="pg-field">
            <span className="pg-field__label">Forward horizon</span>
            <select
              className="pg-field__select"
              value={monthsAhead}
              onChange={(e) => setMonthsAhead(Number(e.target.value))}
              aria-label="Months forward for model"
            >
              {HORIZONS.map((h) => (
                <option key={h} value={h}>{h} months</option>
              ))}
            </select>
          </label>
          <label className="pg-field">
            <span className="pg-field__label">Shortlist by head</span>
            <select
              className="pg-field__select"
              value={projectHeadFilter}
              onChange={(e) => {
                setProjectHeadFilter(e.target.value);
                setSearchA("");
                setSearchB("");
              }}
            >
              {projectHeadOptions.map((h) => (
                <option key={h} value={h}>{h === "all" ? "All" : h}</option>
              ))}
            </select>
          </label>
          <div className="pg-toolbar__compare">
            <label className="pg-compare-toggle">
              <input type="checkbox" checked={compareOn} onChange={(e) => setCompareOn(e.target.checked)} />
              <span>Compare A / B</span>
            </label>
          </div>
        </div>
      </section>

      <details className="pg-details">
        <summary className="pg-details__summary">
          <span className="pg-details__summary-title">Ledger &amp; portfolio scope</span>
          <span className="pg-details__summary-hint">{ledgerScopeSummary(filters, selectedFyStart)}</span>
        </summary>
        <div className="pg-details__body">
          <div className="projections-page__bar">
            <DashboardFilters
              value={filters}
              onChange={setFilters}
              projects={projects}
              financeRows={financeRows}
              fyYears={fyYears}
              selectedFyStart={selectedFyStart}
              onFyChange={setSelectedFyStart}
            />
          </div>
          <p className="pg-filter-footnote">
            Period/month here do <strong>not</strong> change the projection model (all in-scope months are used). They affect
            account picklists. {fyRowCount > 0 && <span>· {fyRowCount} row{fyRowCount === 1 ? "" : "s"} in this FY</span>}
          </p>
        </div>
      </details>

      <div className="pg-scenario-wrap">
        <button
          type="button"
          className="pg-scenario-toggle"
          aria-expanded={scenariosOpen}
          onClick={() => setScenariosOpen((o) => !o)}
        >
          <span className="pg-scenario-toggle__title">Scenarios</span>
          <span className="pg-scenario-toggle__meta">
            {projectIdsA.length + projectIdsB.length === 0
              ? "Full portfolio in scope"
              : `${projectIdsA.length + projectIdsB.length} project(s)${compareOn ? " · A/B" : " · A"}`}
          </span>
          <span className="pg-scenario-toggle__chev" aria-hidden>{scenariosOpen ? "▾" : "▸"}</span>
        </button>
        {scenariosOpen && (
          <div className="pg-scenarios pg-scenarios--in-flow">
            <ScenarioProjectPicker
              title="Scenario A"
              hint="No selection = full slice. Check projects to club."
              projects={projectsForPicker}
              selectedIds={projectIdsA}
              onToggle={toggleA}
              search={searchA}
              onSearch={setSearchA}
            />
            {compareOn && (
              <ScenarioProjectPicker
                title="Scenario B"
                hint="e.g. club accounts to compare run-rate to A."
                projects={projectsForPicker}
                selectedIds={projectIdsB}
                onToggle={toggleB}
                search={searchB}
                onSearch={setSearchB}
              />
            )}
          </div>
        )}
      </div>

          {!canProjectA && (
            <div className="projections-page__empty">
              <p>
                <strong>Scenario A:</strong> need at least 4 months of revenue actuals in this slice
                {projectIdsA.length ? " for the selected project(s)" : ""}. Adjust filters or project pick.
              </p>
            </div>
          )}

          {canProjectA && !compareOn && (
            <>
              <section className="pg-kpi-compare" aria-label="Key metrics — scenario A">
                <div className="projections-kpi">
                  <div className="projections-kpi__label">Next month · revenue (proj.)</div>
                  <div className="projections-kpi__val">{kpiA.m1 != null ? formatLargeCurrency(kpiA.m1) : "—"}</div>
                </div>
                <div className="projections-kpi">
                  <div className="projections-kpi__label">Implied CM</div>
                  <div className="projections-kpi__val">
                    {kpiA.cm1 != null ? formatLargeCurrency(kpiA.cm1) : "—"}
                    {kpiA.cmPct != null && <span className="projections-kpi__sub"> · {formatPercent(kpiA.cmPct, 1)} of rev</span>}
                  </div>
                </div>
                <div className="projections-kpi">
                  <div className="projections-kpi__label">Implied collections</div>
                  <div className="projections-kpi__val">{kpiA.coll1 != null ? formatLargeCurrency(kpiA.coll1) : "—"}</div>
                </div>
                <div className="projections-kpi">
                  <div className="projections-kpi__label">Sum · forward {monthsAhead}M revenue (proj.)</div>
                  <div className="projections-kpi__val">{formatLargeCurrency(kpiA.sum3)}</div>
                </div>
              </section>
              <div className="projections-page__grid">
                <div className="projections-card projections-card--chart">
                  <div className="projections-card__head">
                    <div>
                      <h2 className="projections-card__title">Revenue</h2>
                      <p className="projections-card__sub">
                        ₹ Cr · <span className="projections-card__tag">History {timeRangeLabel}</span> + {monthsAhead}M projected. Solid = actual, dashed
                        = model, thin = official ledger forecast when present.
                      </p>
                    </div>
                  </div>
                  <div className="projections-card__chart">
                    <ResponsiveContainer width="100%" height={320}>
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
                </div>
                <div className="projections-card projections-card--chart">
                  <div className="projections-card__head">
                    <div>
                      <h2 className="projections-card__title">CM &amp; collections</h2>
                      <p className="projections-card__sub">
                        Trailing <strong>actual</strong> CM and cash in scope ({timeRangeLabel}) + <strong>implied</strong> path for the
                        next {monthsAhead}M (ratio × projected revenue).
                      </p>
                    </div>
                  </div>
                  <div className="projections-card__chart">
                    <ResponsiveContainer width="100%" height={280}>
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
                </div>
              </div>
              <p className="projections-page__method-note pg-note-inline"><strong>Scenario A run:</strong> {methodA}</p>
            </>
          )}

          {compareOn && canProjectA && canProjectB && (
            <>
              <section className="pg-compare-kpi" aria-label="Compare KPIs">
                <h2 className="pg-compare-kpi__title">Comparison</h2>
                <div className="pg-compare-table-wrap">
                  <table className="pg-compare-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Scenario A {projectIdsA.length ? `(${projectIdsA.length} project${projectIdsA.length > 1 ? "s" : ""})` : "(full slice)"}</th>
                        <th>Scenario B {projectIdsB.length ? `(${projectIdsB.length} project${projectIdsB.length > 1 ? "s" : ""})` : "(full slice)"}</th>
                        <th>Δ (B − A)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Next month · revenue (proj.)</td>
                        <td>{kpiA.m1 != null ? formatLargeCurrency(kpiA.m1) : "—"}</td>
                        <td>{kpiB.m1 != null ? formatLargeCurrency(kpiB.m1) : "—"}</td>
                        <td className={deltaRev != null && deltaRev > 0 ? "pg-compare-table__up" : deltaRev != null && deltaRev < 0 ? "pg-compare-table__down" : ""}>
                          {deltaRev != null ? formatLargeCurrency(deltaRev) : "—"}
                        </td>
                      </tr>
                      <tr>
                        <td>Implied CM (next month)</td>
                        <td>{kpiA.cm1 != null ? formatLargeCurrency(kpiA.cm1) : "—"}</td>
                        <td>{kpiB.cm1 != null ? formatLargeCurrency(kpiB.cm1) : "—"}</td>
                        <td>
                          {kpiA.cm1 != null && kpiB.cm1 != null
                            ? formatLargeCurrency(kpiB.cm1 - kpiA.cm1)
                            : "—"}
                        </td>
                      </tr>
                      <tr>
                        <td>Implied collections (next month)</td>
                        <td>{kpiA.coll1 != null ? formatLargeCurrency(kpiA.coll1) : "—"}</td>
                        <td>{kpiB.coll1 != null ? formatLargeCurrency(kpiB.coll1) : "—"}</td>
                        <td>
                          {kpiA.coll1 != null && kpiB.coll1 != null
                            ? formatLargeCurrency(kpiB.coll1 - kpiA.coll1)
                            : "—"}
                        </td>
                      </tr>
                      <tr>
                        <td>Sum · forward {monthsAhead}M revenue (proj.)</td>
                        <td>{formatLargeCurrency(kpiA.sum3)}</td>
                        <td>{formatLargeCurrency(kpiB.sum3)}</td>
                        <td className={delta3 != null && delta3 > 0 ? "pg-compare-table__up" : delta3 != null && delta3 < 0 ? "pg-compare-table__down" : ""}>
                          {delta3 != null ? formatLargeCurrency(delta3) : "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="projections-card projections-card--chart pg-compare-chart-card">
                <h2 className="projections-card__title">Revenue overlay (₹ Cr) — A vs B</h2>
                <p className="projections-card__sub">
                  Chart history <span className="projections-card__tag">{timeRangeLabel}</span> (aligned to the later of the two
                  series) + forward. Solid = actual; dashed = model. A: coral / teal · B: violet / amber
                </p>
                <div className="projections-card__chart">
                  <ResponsiveContainer width="100%" height={360}>
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
              </div>
              <div className="pg-dual-method">
                <p><strong>Scenario A</strong> {methodA}</p>
                <p><strong>Scenario B</strong> {methodB}</p>
              </div>
            </>
          )}

          {compareOn && canProjectA && !canProjectB && (
            <div className="projections-page__empty">
              <p><strong>Scenario B</strong> needs at least 4 months of history for the selected project(s) (or use an empty pick for full slice).</p>
            </div>
          )}
        </>
      )}

      <section className="projections-page__method">
        <h2 className="projections-page__method-title">How to use the playground</h2>
        <ul className="projections-page__list">
          <li>
            <strong>Club projects:</strong> in Scenario B, check two (or more) project rows — the model sums their ledger
            and runs one forward path, so you can compare a single account (A) against the same account plus another (B).
          </li>
          <li>
            <strong>People / collaboration:</strong> use <strong>Shortlist by head</strong> to filter the project list;
            the main filters still have Region head / Practice head for the wider team view.
          </li>
          <li>
            <strong>Time:</strong> horizon changes how many forward months appear in the chart and the rolling sum column.
          </li>
        </ul>
      </section>
    </div>
  );
}
