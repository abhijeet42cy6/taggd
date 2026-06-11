import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Expand, Plus, Upload } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Flex,
  Grid,
  Metric,
  Text,
  TextInput,
  Title,
} from "@tremor/react";
import { api, queries } from "@/lib/api";
import { SkeletonTable } from "@/components/platform/Skeleton";
import { WfmProductivityFillChart } from "@/components/platform/Charts";
import { WfmBenchmarkFormDialog } from "@/components/platform/WfmBenchmarkFormDialog";
import {
  WfmExpandDialog,
  WfmFilterChipRow,
  type WfmBulletItem,
  type WfmExpandMode,
  type WfmPerformFilter,
} from "@/components/tremor-dashboard/WfmExpandDialog";
import { WfmRegionalHeadAssignDialog } from "@/components/tremor-dashboard/WfmRegionalHeadAssignDialog";
import { TremorDashboardSection } from "@/components/tremor-dashboard/TremorDashboardSection";
import { cn, formatLargeCurrency, formatLacs, formatNumber, formatPercent } from "@/lib/utils";
import {
  wfmFillPct,
  wfmFillColor,
  wfmMatchesFilter,
  wfmRowsVm,
  wfmOpenPositionsFromSheet,
  wfmResignationsFromSheet,
  wfmRowAdditionalHcProxy,
  wfmRowProjectedHc,
  wfmDedupeLatestByProject,
  wfmAggregateByRegionalHead,
  wfmAggregateByPracticeHead,
  wfmAggregateByWlBand,
  wfmSummaryTotals,
  type WfmBenchmarkRowVm,
} from "@/lib/view-models/wfm";
import { WfmSummaryTable } from "@/components/tremor-dashboard/WfmSummaryTable";
import { WfmClientHeadcountTable, computeWfmClientTableTotals } from "@/components/tremor-dashboard/WfmClientHeadcountTable";
import { WfmMetricHeroCard } from "@/components/tremor-dashboard/WfmMetricHeroCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import "@/styles/exec-dash-premium.css";

type WfmKpiDetail = {
  title: string;
  value: React.ReactNode;
  detail: React.ReactNode;
};

function openWfmKpiDetail(
  setKpiDetail: (d: WfmKpiDetail | null) => void,
  title: string,
  value: React.ReactNode,
  detail: React.ReactNode,
) {
  setKpiDetail({ title, value, detail });
}

/** Headcount KPIs — whole numbers only (no 390.5-style decimals). */
function formatHcCount(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("en-IN");
}

const flatCard =
  "overflow-hidden border-0 p-0 shadow-tremor-card ring-1 ring-tremor-ring dark:bg-dark-tremor-background dark:shadow-dark-tremor-card dark:ring-dark-tremor-ring";

const WFM_BLOCK_TAG = "mt-3 text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle md:mt-4";

type WfmSummaryTab = "client" | "regional" | "practice";

const WFM_SUMMARY_TABS: { id: WfmSummaryTab; label: string }[] = [
  { id: "client", label: "By client" },
  { id: "regional", label: "Regional head" },
  { id: "practice", label: "Practice head" },
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export function WorkforceManagement() {
  const [stats, setStats] = useState<any>(null);
  const [rows, setRows] = useState<WfmBenchmarkRowVm[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [wfmDialogOpen, setWfmDialogOpen] = useState(false);
  const [kpiDetail, setKpiDetail] = useState<WfmKpiDetail | null>(null);

  const reloadWfm = useCallback(async () => {
    setUploadError(null);
    const { stats: s, data: d } = await queries.wfmFresh();
    setStats(s);
    setRows(wfmRowsVm(d || []));
  }, []);

  const [tableFilter, setTableFilter] = useState<WfmPerformFilter>("all");
  const [summaryTab, setSummaryTab] = useState<WfmSummaryTab>("client");
  const [regionalHeadFilter, setRegionalHeadFilter] = useState<string>("all");
  const [expandMode, setExpandMode] = useState<WfmExpandMode>(null);
  const [expandFilter, setExpandFilter] = useState<WfmPerformFilter>("all");
  const [regionalHeadAssignRow, setRegionalHeadAssignRow] = useState<WfmBenchmarkRowVm | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Productivity chart client picker
  const [prodChartSelected, setProdChartSelected] = useState<string[]>([]);
  const [prodChartSearch, setProdChartSearch] = useState("");
  const [prodChartPickerOpen, setProdChartPickerOpen] = useState(false);
  const prodChartPickerWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!prodChartPickerOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (prodChartPickerWrapRef.current && !prodChartPickerWrapRef.current.contains(e.target as Node)) {
        setProdChartPickerOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setProdChartPickerOpen(false); };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDocDown); document.removeEventListener("keydown", onKey); };
  }, [prodChartPickerOpen]);

  useEffect(() => {
    (async () => {
      const [s, d] = await Promise.allSettled([queries.wfmStats(), queries.wfmData()]);
      if (s.status === "fulfilled") setStats(s.value);
      if (d.status === "fulfilled") setRows(wfmRowsVm(d.value || []));
      setLoading(false);
    })();
  }, []);

  const onUpload = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post("/wfm/upload", form);
      await reloadWfm();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? String((err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Upload failed")
          : err instanceof Error
            ? err.message
            : "Upload failed";
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  // ── derived metrics ─────────────────────────────────────────────────────────
  const idealHc = Number(stats?.total_ideal_hc ?? 0);
  const actualHc = Number(stats?.total_actual_hc ?? 0);
  const fillRate = idealHc > 0 ? (actualHc / idealHc) * 100 : 0;

  // WL1–WL4 in the ingested 09 (excel_upload_masters) template are a **band split of actual_hc_total**
  // (sum(WL) = actual per project). They are *not* incremental pipeline on top of actual. Using
  // actual + sum(WL) was double-counting and inflated "Projected" to ~2× actual.
  const totalWl1 = useMemo(() => rows.reduce((s, r) => s + Number(r.wl1_hires ?? 0), 0), [rows]);
  const totalWl2 = useMemo(() => rows.reduce((s, r) => s + Number(r.wl2_hires ?? 0), 0), [rows]);
  const totalWl3 = useMemo(() => rows.reduce((s, r) => s + Number(r.wl3_hires ?? 0) + Number(r.wl4_hires ?? 0), 0), [rows]);
  const totalAdditional = totalWl1 + totalWl2 + totalWl3; // for WL mix; equals total actual when data is self-consistent

  // Bullet items for all clients
  const allBulletItems = useMemo((): WfmBulletItem[] =>
    rows.map((r) => {
      const ideal = Number(r.ideal_hc ?? 0);
      const actual = Number(r.actual_hc_total ?? 0);
      const pct = wfmFillPct(actual, ideal);
      const color = wfmFillColor(pct, ideal);
      return { name: r.account_name || `Project ${r.project_id}`, actual, ideal, color, pct, row: r };
    }),
  [rows]);

  // Dedupe to latest snapshot per project before filters / rollups
  const dedupedRows = useMemo(() => wfmDedupeLatestByProject(rows), [rows]);

  const regionalHeadOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of dedupedRows) {
      const h = (r.regional_head || "").trim();
      if (h) set.add(h);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [dedupedRows]);

  const rowsMatchingFilters = useMemo(
    () =>
      dedupedRows.filter((r) => {
        const ideal = Number(r.ideal_hc ?? 0);
        const actual = Number(r.actual_hc_total ?? 0);
        const pct = wfmFillPct(actual, ideal);
        if (!wfmMatchesFilter(pct, ideal, tableFilter)) return false;
        if (regionalHeadFilter === "all") return true;
        if (regionalHeadFilter === "unassigned") return !(r.regional_head || "").trim();
        return (r.regional_head || "").trim() === regionalHeadFilter;
      }),
    [dedupedRows, tableFilter, regionalHeadFilter],
  );

  // Filtered table rows (client tab)
  const filteredRows = rowsMatchingFilters;

  const missingRegionalHeadCount = useMemo(
    () => dedupedRows.filter((r) => !(r.regional_head || "").trim()).length,
    [dedupedRows],
  );

  const regionalSummaryRows = useMemo(() => wfmAggregateByRegionalHead(rowsMatchingFilters), [rowsMatchingFilters]);
  const practiceSummaryRows = useMemo(() => wfmAggregateByPracticeHead(rowsMatchingFilters), [rowsMatchingFilters]);
  const regionalSummaryTotals = useMemo(() => wfmSummaryTotals(regionalSummaryRows), [regionalSummaryRows]);
  const practiceSummaryTotals = useMemo(() => wfmSummaryTotals(practiceSummaryRows), [practiceSummaryRows]);
  const wlSummaryRows = useMemo(() => wfmAggregateByWlBand(rowsMatchingFilters), [rowsMatchingFilters]);
  const wlSummaryTotals = useMemo(() => wfmSummaryTotals(wlSummaryRows), [wlSummaryRows]);

  // Productivity vs fill chart
  const productivityFillChartAll = useMemo(() =>
    rows
      .filter((r) => Number(r.ideal_hc ?? 0) > 0)
      .map((r) => {
        const ideal = Number(r.ideal_hc ?? 0);
        const actual = Number(r.actual_hc_total ?? 0);
        const pct = wfmFillPct(actual, ideal);
        const fullName = String(r.account_name || `Project ${r.project_id}`);
        const short = fullName.length > 14 ? `${fullName.slice(0, 13)}…` : fullName;
        return { fullName, name: short, fillPct: Math.round(pct * 10) / 10, productivity: Number(r.lateral_productivity_target ?? 0) };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
  [rows]);

  const productivityFillChartData = useMemo(() => {
    if (!productivityFillChartAll.length) return [];
    if (!prodChartSelected.length) return productivityFillChartAll;
    const sel = new Set(prodChartSelected);
    return productivityFillChartAll.filter((d) => sel.has(d.fullName));
  }, [productivityFillChartAll, prodChartSelected]);

  const prodChartPickerCandidates = useMemo(() => {
    const q = prodChartSearch.trim().toLowerCase();
    return productivityFillChartAll
      .filter((d) => !prodChartSelected.includes(d.fullName) && (!q || d.fullName.toLowerCase().includes(q)))
      .slice(0, 60);
  }, [productivityFillChartAll, prodChartSearch, prodChartSelected]);

  const projectTableTotals = useMemo(() => computeWfmClientTableTotals(filteredRows), [filteredRows]);

  const openRequisitionsTotal = Number(stats?.open_requisitions ?? 0);

  /** Portfolio-level metrics — latest snapshot per project (same dedupe as summary table). */
  const portfolioWorkbook = useMemo(() => {
    if (!dedupedRows.length) return null;
    let sumRev = 0;
    let sumIdealForProd = 0;
    let sumProdWeighted = 0;
    let sumOpenSheet = 0;
    let sumResignations = 0;
    let sumAdditional = 0;
    let sumActual = 0;
    let sumIdeal = 0;
    let maxRev = 0;
    for (const r of dedupedRows) {
      const rev = Number(r.lateral_revenue_target ?? 0);
      sumRev += rev;
      maxRev = Math.max(maxRev, Math.abs(rev));
      const idealN = Number(r.ideal_hc ?? 0);
      const prod = Number(r.lateral_productivity_target ?? 0);
      sumIdeal += idealN;
      sumActual += Number(r.actual_hc_total ?? 0);
      if (idealN > 0 && Number.isFinite(prod)) {
        sumIdealForProd += idealN;
        sumProdWeighted += prod * idealN;
      }
      sumOpenSheet += wfmOpenPositionsFromSheet(r);
      sumResignations += wfmResignationsFromSheet(r);
      sumAdditional += wfmRowAdditionalHcProxy(r);
    }
    const wProdRaw =
      sumIdealForProd > 0
        ? sumProdWeighted / sumIdealForProd
        : dedupedRows.reduce((s, r) => s + Number(r.lateral_productivity_target ?? 0), 0) / dedupedRows.length;
    const wProd = Number.isFinite(wProdRaw) ? wProdRaw : 0;
    const portfolioProjected = dedupedRows.reduce((s, r) => s + wfmRowProjectedHc(r), 0);
    const varianceVsActual = sumIdeal - sumActual;
    const staffGapPctActual = sumIdeal > 0 ? ((sumIdeal - sumActual) / sumIdeal) * 100 : 0;
    const varianceVsProjected = sumIdeal - portfolioProjected;
    const staffGapPctProjected = sumIdeal > 0 ? ((sumIdeal - portfolioProjected) / sumIdeal) * 100 : 0;
    let overstaffed = 0;
    let understaffed = 0;
    let onTrack = 0;
    for (const r of dedupedRows) {
      const idealN = Number(r.ideal_hc ?? 0);
      const actualN = Number(r.actual_hc_total ?? 0);
      const proj = wfmRowProjectedHc(r);
      if (actualN > proj) overstaffed += 1;
      else if (proj < idealN) understaffed += 1;
      else onTrack += 1;
    }
    /** Heuristic: workbook YTD revenue column is usually in Lacs; very large values treated as full INR. */
    const revenueInr = maxRev > 500_000 ? sumRev : sumRev * 100_000;
    return {
      sumRev,
      revenueInr,
      wProd,
      sumOpenSheet,
      sumResignations,
      sumAdditional,
      portfolioProjected,
      overstaffed,
      understaffed,
      onTrack,
      varianceVsActual,
      staffGapPctActual,
      varianceVsProjected,
      staffGapPctProjected,
    };
  }, [dedupedRows]);

  const portfolioResignationsLatest = Number(
    stats?.portfolio_hc_summary?.latest?.resignations ?? NaN,
  );
  const sumResignationsTracked = Number(
    stats?.total_existing_resignations ?? portfolioWorkbook?.sumResignations ?? 0,
  );
  const hasResignationIngest =
    sumResignationsTracked > 0 || Number.isFinite(portfolioResignationsLatest);

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="wfm-tremor space-y-3 pb-8 md:space-y-4">
      <input
        ref={uploadInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          void onUpload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <Flex justifyContent="between" alignItems="start" className="flex-wrap gap-3">
        <div className="min-w-0 flex-1">
          <span className="inline-flex max-w-full items-center whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-orange-600">
            Operations&nbsp;·&nbsp;Workforce
          </span>
          <Title className="mt-0.5 text-2xl font-bold tracking-tight text-tremor-content-strong md:text-3xl">
            Workforce Management
          </Title>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" size="xs" variant="primary" color="orange" onClick={() => setWfmDialogOpen(true)}>
            <span className="inline-flex items-center gap-1">
              <Plus size={12} strokeWidth={2.5} aria-hidden />
            Add / edit WFM data
            </span>
          </Button>
          <Button
            type="button"
            size="xs"
            variant="secondary"
            color="slate"
            disabled={uploading}
            onClick={() => uploadInputRef.current?.click()}
          >
            <span className="inline-flex items-center gap-1">
              <Upload size={12} aria-hidden />
              {uploading ? "Uploading…" : "Upload WFM"}
            </span>
          </Button>
        </div>
      </Flex>

      {uploadError ? (
        <Card className="border-amber-200 bg-amber-50 ring-1 ring-amber-200 dark:border-amber-900/40 dark:bg-amber-950/25 dark:ring-amber-900/50">
          <Text className="px-4 py-3 text-xs text-amber-950 dark:text-amber-100 md:text-sm" role="alert">
            <span className="font-semibold">WFM upload failed.</span> {uploadError}
          </Text>
        </Card>
      ) : null}

      {!loading && portfolioWorkbook && (
        <>
          <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="items-stretch gap-3 [&>*]:h-full">
            <WfmMetricHeroCard
              eyebrow="Forecast Revenue (Current Quarter)"
              decorationColor="amber"
              primary={formatLargeCurrency(portfolioWorkbook.revenueInr)}
              meta={[{ label: "Clients in scope", value: String(dedupedRows.length) }]}
              onDrillIn={() => openWfmKpiDetail(
                setKpiDetail,
                "Forecast Revenue (Current Quarter)",
                formatLargeCurrency(portfolioWorkbook.revenueInr),
                (
                <div className="space-y-2 text-sm text-tremor-content-emphasis">
                  <p>Σ lateral revenue YTD from the workbook; per-row totals below ₹5L are assumed to be in Lacs (×1e5) for ₹ display.</p>
                  <p>
                    <span className="font-medium">Calculation:</span> Sum of{" "}
                    <code className="text-xs">lateral_revenue_target</code> across{" "}
                    {dedupedRows.length} client(s) (latest snapshot each).
                  </p>
                  <p>
                    <span className="font-medium">Displayed:</span> {formatLargeCurrency(portfolioWorkbook.revenueInr)}
                  </p>
                </div>
              ))}
            />
            <WfmMetricHeroCard
              eyebrow="Target productivity"
              decorationColor="indigo"
              primary={formatLacs(portfolioWorkbook.wProd)}
              meta={[{ label: "Weighted by ideal HC", value: "YTD lateral" }]}
              onDrillIn={() => openWfmKpiDetail(
                setKpiDetail,
                "Target productivity",
                formatLacs(portfolioWorkbook.wProd),
                (
                  <div className="space-y-2 text-sm text-tremor-content-emphasis">
                    <p>Ideal-HC–weighted mean of lateral productivity (YTD column), in lacs.</p>
                    <p>
                      <span className="font-medium">Calculation:</span> Σ (productivity × ideal HC) ÷ Σ ideal HC across latest client snapshots.
                    </p>
                    <p>
                      <span className="font-medium">Displayed:</span> {formatLacs(portfolioWorkbook.wProd)}
                    </p>
                  </div>
                ),
              )}
            />
            <WfmMetricHeroCard
              eyebrow="Ideal HC"
              decorationColor="teal"
              primary={formatHcCount(idealHc)}
              meta={[{ label: "Benchmark source", value: "wfm_hr_benchmarks" }]}
              onDrillIn={() => openWfmKpiDetail(
                setKpiDetail,
                "Ideal HC",
                formatHcCount(idealHc),
                (
                  <div className="space-y-2 text-sm text-tremor-content-emphasis">
                    <p>Sum of ideal headcount from the latest benchmark row per project.</p>
                    <p>
                      <span className="font-medium">Source:</span> <code className="text-xs">ideal_hc</code> on{" "}
                      <code className="text-xs">wfm_hr_benchmarks</code> (GET /wfm/stats).
                    </p>
                    <p>
                      <span className="font-medium">Displayed:</span> {formatHcCount(idealHc)}
                    </p>
                  </div>
                ),
              )}
            />
            <WfmMetricHeroCard
              eyebrow="Actual Headcount (Active+Resigned)"
              decorationColor="blue"
              primary={formatHcCount(actualHc)}
              meta={[{ label: "Fill vs ideal", value: formatPercent(fillRate) }]}
              onDrillIn={() => openWfmKpiDetail(
                setKpiDetail,
                "Actual Headcount (Active+Resigned)",
                formatHcCount(actualHc),
                (
                  <div className="space-y-2 text-sm text-tremor-content-emphasis">
                    <p>Σ on payroll — active plus resigned still on rolls (workbook actual HC total).</p>
                    <p>
                      <span className="font-medium">Source:</span> <code className="text-xs">actual_hc_total</code> summed across latest client snapshots.
                    </p>
                    <p>
                      <span className="font-medium">Displayed:</span> {formatHcCount(actualHc)}
                    </p>
                  </div>
                ),
              )}
            />
            <WfmMetricHeroCard
              eyebrow="Additional Headcount (Vendor/Third Party)"
              decorationColor="cyan"
              primary={formatHcCount(portfolioWorkbook.sumAdditional)}
              meta={[{ label: "Proxy", value: "max(0, target − actual)" }]}
              onDrillIn={() => openWfmKpiDetail(
                setKpiDetail,
                "Additional Headcount (Vendor/Third Party)",
                formatHcCount(portfolioWorkbook.sumAdditional),
                (
                  <div className="space-y-2 text-sm text-tremor-content-emphasis">
                    <p>Σ max(0, lateral HC target − actual) per client — temporary / stretch headcount from the workbook (vendor or third-party proxy).</p>
                    <p>
                      <span className="font-medium">Calculation:</span> Per client, additional HC = max(0, lateral_hc_target − actual_hc_total), then summed.
                    </p>
                    <p>
                      <span className="font-medium">Displayed:</span> {formatHcCount(portfolioWorkbook.sumAdditional)}
                    </p>
                  </div>
                ),
              )}
            />
            <WfmMetricHeroCard
              eyebrow="Total Open Positions (YTJ+TBO+OPEN)"
              decorationColor="rose"
              primary={formatHcCount(portfolioWorkbook.sumOpenSheet)}
              badge={<Badge color="slate" size="xs">Sheet</Badge>}
              meta={[{ label: "Gap reqs excluded", value: formatHcCount(openRequisitionsTotal) }]}
              onDrillIn={() => openWfmKpiDetail(
                setKpiDetail,
                "Total Open Positions (YTJ+TBO+OPEN)",
                formatHcCount(portfolioWorkbook.sumOpenSheet),
                (
                  <div className="space-y-2 text-sm text-tremor-content-emphasis">
                    <p>Workbook open-position total from sheet metrics (YTJ + TBO + OPEN columns).</p>
                    <p>
                      <span className="font-medium">Source:</span> <code className="text-xs">sheet_metrics_json.open_positions.total</code> per client.
                    </p>
                    <p>
                      <span className="font-medium">Excluded:</span> {formatHcCount(openRequisitionsTotal)} gap requisition rows from{" "}
                      <code className="text-xs">wfm_resource_gaps</code> (not in this card).
                    </p>
                    <p>
                      <span className="font-medium">Displayed:</span> {formatHcCount(portfolioWorkbook.sumOpenSheet)}
                    </p>
                  </div>
                ),
              )}
            />
            <WfmMetricHeroCard
              eyebrow="Resignation (Serving Notice)"
              decorationColor="slate"
              primary={hasResignationIngest ? formatHcCount(sumResignationsTracked) : "Not tracked"}
              badge={hasResignationIngest ? <Badge color="slate" size="xs">Q4 sheet</Badge> : undefined}
              meta={
                hasResignationIngest && Number.isFinite(portfolioResignationsLatest)
                  ? [{ label: "HC summary (latest)", value: formatHcCount(portfolioResignationsLatest) }]
                  : undefined
              }
              onDrillIn={() => openWfmKpiDetail(
                setKpiDetail,
                "Resignation (Serving Notice)",
                hasResignationIngest ? formatHcCount(sumResignationsTracked) : "Not tracked",
                (
                  <div className="space-y-2 text-sm text-tremor-content-emphasis">
                    {hasResignationIngest ? (
                      <>
                        <p>Σ per client from Q4 resignation sheet — existing employees serving notice period.</p>
                        <p>
                          <span className="font-medium">Source:</span> <code className="text-xs">sheet_metrics_json.resignations.existing</code>
                        </p>
                        {Number.isFinite(portfolioResignationsLatest) ? (
                          <p>
                            <span className="font-medium">HC summary (latest):</span> {formatHcCount(portfolioResignationsLatest)}
                          </p>
                        ) : null}
                        <p>
                          <span className="font-medium">Displayed:</span> {formatHcCount(sumResignationsTracked)}
                        </p>
                      </>
                    ) : (
                      <p>Re-ingest the WFM workbook with Q4 + HC summary tabs to load resignation (serving notice) counts.</p>
                    )}
                  </div>
                ),
              )}
            />
            <WfmMetricHeroCard
              eyebrow="Projected HC"
              decorationColor="violet"
              primary={formatHcCount(portfolioWorkbook.portfolioProjected)}
              meta={[
                {
                  label: "Δ vs actual",
                  value: `${portfolioWorkbook.portfolioProjected - actualHc > 0 ? "+" : ""}${formatHcCount(portfolioWorkbook.portfolioProjected - actualHc)}`,
                },
              ]}
              onDrillIn={() => openWfmKpiDetail(
                setKpiDetail,
                "Projected HC",
                formatHcCount(portfolioWorkbook.portfolioProjected),
                (
                  <div className="space-y-2 text-sm text-tremor-content-emphasis">
                    <p>Forward-looking headcount after pipeline and attrition adjustments.</p>
                    <p>
                      <span className="font-medium">Calculation:</span> Actual + additional (vendor/proxy) + open positions − resignations (serving notice), per client then summed.
                    </p>
                    <p>
                      <span className="font-medium">Displayed:</span> {formatHcCount(portfolioWorkbook.portfolioProjected)}
                    </p>
                  </div>
                ),
              )}
            />
          </Grid>

          <Text className={WFM_BLOCK_TAG}>Variance indicators</Text>
          <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="items-stretch gap-3 [&>*]:h-full">
            <WfmMetricHeroCard
              eyebrow="Variance vs actual HC"
              decorationColor="orange"
              primary={`${portfolioWorkbook.varianceVsActual > 0 ? "+" : ""}${formatHcCount(portfolioWorkbook.varianceVsActual)}`}
              primaryClassName={portfolioWorkbook.varianceVsActual < 0 ? "text-orange-600 dark:text-orange-400" : undefined}
              meta={[{ label: "Ideal − actual", value: `${formatHcCount(idealHc)} − ${formatHcCount(actualHc)}` }]}
              onDrillIn={() => openWfmKpiDetail(
                setKpiDetail,
                "Variance vs actual HC",
                `${portfolioWorkbook.varianceVsActual > 0 ? "+" : ""}${formatHcCount(portfolioWorkbook.varianceVsActual)}`,
                (
                  <div className="space-y-2 text-sm text-tremor-content-emphasis">
                    <p>Ideal − actual headcount (portfolio sum).</p>
                    <p>
                      <span className="font-medium">Calculation:</span> {formatHcCount(idealHc)} − {formatHcCount(actualHc)} ={" "}
                      {formatHcCount(portfolioWorkbook.varianceVsActual)}
                    </p>
                  </div>
                ),
              )}
            />
            <WfmMetricHeroCard
              eyebrow="Staff gap % vs actual"
              decorationColor="fuchsia"
              primary={formatPercent(portfolioWorkbook.staffGapPctActual)}
              primaryClassName={portfolioWorkbook.staffGapPctActual < 0 ? "text-fuchsia-700 dark:text-fuchsia-400" : undefined}
              meta={[{ label: "Basis", value: "(Ideal − actual) ÷ ideal" }]}
              onDrillIn={() => openWfmKpiDetail(
                setKpiDetail,
                "Staff gap % vs actual",
                formatPercent(portfolioWorkbook.staffGapPctActual),
                (
                  <div className="space-y-2 text-sm text-tremor-content-emphasis">
                    <p>Percentage gap between ideal and actual headcount.</p>
                    <p>
                      <span className="font-medium">Calculation:</span> (Ideal − actual) ÷ ideal × 100 = {formatPercent(portfolioWorkbook.staffGapPctActual)}
                    </p>
                  </div>
                ),
              )}
            />
            <WfmMetricHeroCard
              eyebrow="Net variance vs projected HC"
              decorationColor="orange"
              primary={`${portfolioWorkbook.varianceVsProjected > 0 ? "+" : ""}${formatHcCount(portfolioWorkbook.varianceVsProjected)}`}
              primaryClassName={portfolioWorkbook.varianceVsProjected < 0 ? "text-orange-600 dark:text-orange-400" : undefined}
              meta={[{ label: "Ideal − projected", value: `${formatHcCount(idealHc)} − ${formatHcCount(portfolioWorkbook.portfolioProjected)}` }]}
              onDrillIn={() => openWfmKpiDetail(
                setKpiDetail,
                "Net variance vs projected HC",
                `${portfolioWorkbook.varianceVsProjected > 0 ? "+" : ""}${formatHcCount(portfolioWorkbook.varianceVsProjected)}`,
                (
                  <div className="space-y-2 text-sm text-tremor-content-emphasis">
                    <p>Ideal − projected headcount (portfolio sum).</p>
                    <p>
                      <span className="font-medium">Calculation:</span> {formatHcCount(idealHc)} − {formatHcCount(portfolioWorkbook.portfolioProjected)} ={" "}
                      {formatHcCount(portfolioWorkbook.varianceVsProjected)}
                    </p>
                  </div>
                ),
              )}
            />
            <WfmMetricHeroCard
              eyebrow="Staffing gap % vs projected"
              decorationColor="fuchsia"
              primary={formatPercent(portfolioWorkbook.staffGapPctProjected)}
              primaryClassName={portfolioWorkbook.staffGapPctProjected < 0 ? "text-fuchsia-700 dark:text-fuchsia-400" : undefined}
              meta={[{ label: "Basis", value: "(Ideal − projected) ÷ ideal" }]}
              onDrillIn={() => openWfmKpiDetail(
                setKpiDetail,
                "Staffing gap % vs projected",
                formatPercent(portfolioWorkbook.staffGapPctProjected),
                (
                  <div className="space-y-2 text-sm text-tremor-content-emphasis">
                    <p>Percentage gap between ideal and projected headcount.</p>
                    <p>
                      <span className="font-medium">Calculation:</span> (Ideal − projected) ÷ ideal × 100 ={" "}
                      {formatPercent(portfolioWorkbook.staffGapPctProjected)}
                    </p>
                  </div>
                ),
              )}
            />
          </Grid>
          <Card decoration="top" decorationColor="slate" className="border-l-4 border-l-slate-300 p-3 md:p-4 dark:border-l-slate-600">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">Client staffing posture</Text>
            <Flex className="mt-3 flex-wrap gap-4 md:gap-8" justifyContent="start" alignItems="start">
              <div>
                <Text className="text-[11px] text-tremor-content-subtle">Overstaffed</Text>
                <Metric className="text-xl text-rose-600 dark:text-rose-400">{String(portfolioWorkbook.overstaffed)}</Metric>
                <Text className="text-[10px] text-tremor-content-subtle">Actual greater than projected</Text>
          </div>
              <div>
                <Text className="text-[11px] text-tremor-content-subtle">Understaffed</Text>
                <Metric className="text-xl text-amber-600 dark:text-amber-400">{String(portfolioWorkbook.understaffed)}</Metric>
                <Text className="text-[10px] text-tremor-content-subtle">Projected below ideal</Text>
              </div>
              <div>
                <Text className="text-[11px] text-tremor-content-subtle">On track</Text>
                <Metric className="text-xl text-emerald-600 dark:text-emerald-400">{String(portfolioWorkbook.onTrack)}</Metric>
                <Text className="text-[10px] text-tremor-content-subtle">Else vs rules above</Text>
              </div>
            </Flex>
          </Card>
        </>
      )}

      {!loading && rows.length > 0 && (
        <>
          <Text className={WFM_BLOCK_TAG}>WL Wise Actual Headcount</Text>
          <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="gap-2 md:gap-3">
            {(
              [
                { label: "WL1 Headcount", value: totalWl1, sub: "Entry level", color: "cyan" as const, text: "text-cyan-600 dark:text-cyan-400" },
                { label: "WL2 Headcount", value: totalWl2, sub: "Mid level", color: "blue" as const, text: "text-blue-600 dark:text-blue-400" },
                { label: "WL3 & Above Headcount", value: totalWl3, sub: "Senior / leadership", color: "violet" as const, text: "text-violet-600 dark:text-violet-400" },
                {
                  label: "WL headcount (sum)",
                  value: totalAdditional,
                  sub: "Equals roster when data is a band split",
                  color: "orange" as const,
                  text: "text-orange-600 dark:text-orange-400",
                },
              ] as const
            ).map((c) => (
              <Card key={c.label} decoration="top" decorationColor={c.color} className="p-3">
                <Text className={`text-[10px] font-semibold uppercase tracking-wide ${c.text}`}>{c.label}</Text>
                <Metric className="mt-1 text-xl tabular-nums md:text-2xl">{formatHcCount(c.value)}</Metric>
                <Text className="mt-0.5 text-[11px] leading-snug text-tremor-content-subtle md:text-xs">{c.sub}</Text>
              </Card>
            ))}
          </Grid>
        </>
      )}

      <TremorDashboardSection
        className={flatCard}
        compact
        title="Client Headcount & Variance"
        toolbar={(
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                className="inline-flex max-w-full rounded-lg border border-tremor-border bg-orange-50/40 p-0.5 dark:border-dark-tremor-border dark:bg-orange-950/20"
                role="tablist"
                aria-label="Table view"
              >
                {WFM_SUMMARY_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={summaryTab === t.id}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors",
                      summaryTab === t.id
                        ? "bg-white text-orange-700 shadow-sm ring-1 ring-orange-200/80 dark:bg-dark-tremor-background-default dark:text-orange-300 dark:ring-orange-900/60"
                        : "text-tremor-content-subtle hover:text-tremor-content-emphasis dark:hover:text-dark-tremor-content-emphasis",
                    )}
                    onClick={() => setSummaryTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {summaryTab === "client" ? (
                <Button
                  type="button"
                  variant="light"
                  color="orange"
                  size="xs"
                  className="shrink-0"
                  onClick={() => {
                    setExpandMode("benchmark");
                    setExpandFilter(tableFilter);
                  }}
                >
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium">
                    <Expand size={12} aria-hidden />
                    Expand all
                  </span>
                </Button>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
              <div className="min-w-0">
                <Text className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                  Fill rate
                </Text>
                <WfmFilterChipRow value={tableFilter} onChange={setTableFilter} />
              </div>

              <div className="hidden sm:block sm:h-9 sm:w-px sm:self-end sm:bg-tremor-border dark:sm:bg-dark-tremor-border" aria-hidden />

              <div className="sm:min-w-[11rem]">
                <Text className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                  Regional head
                </Text>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="dashboard-filter-select w-full min-w-[9.5rem] max-w-[16rem] text-[11px]"
                    value={regionalHeadFilter}
                    onChange={(e) => setRegionalHeadFilter(e.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="unassigned">Unassigned</option>
                    {regionalHeadOptions.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  {missingRegionalHeadCount > 0 ? (
                    <Text className="text-[10px] leading-snug text-amber-700 dark:text-amber-300">
                      {missingRegionalHeadCount} client{missingRegionalHeadCount === 1 ? "" : "s"} missing regional head
                    </Text>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}
        noPad
      >
        {loading ? (
          <div className="p-4">
            <SkeletonTable rows={6} cols={13} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <Text className="text-sm text-tremor-content-subtle">Upload WFM data to populate this table</Text>
          </div>
        ) : rowsMatchingFilters.length === 0 ? (
          <div className="p-4">
            <Text className="text-sm text-tremor-content-subtle">No rows match the current filters</Text>
          </div>
        ) : summaryTab === "regional" ? (
          <div className="overflow-x-auto bg-gradient-to-b from-orange-50/30 to-white px-2 pb-3 pt-1 dark:from-orange-950/20 dark:to-dark-tremor-background-default sm:px-3">
            <WfmSummaryTable
              rows={regionalSummaryRows}
              labelTitle="Region"
              labelSubtitle="Region leader"
              totals={regionalSummaryTotals}
            />
          </div>
        ) : summaryTab === "practice" ? (
          <div className="overflow-x-auto bg-gradient-to-b from-orange-50/30 to-white px-2 pb-3 pt-1 dark:from-orange-950/20 dark:to-dark-tremor-background-default sm:px-3">
            <WfmSummaryTable
              rows={practiceSummaryRows}
              labelTitle="Practice head"
              labelSubtitle="Region"
              totals={practiceSummaryTotals}
            />
          </div>
        ) : (
          <div className="overflow-x-auto bg-gradient-to-b from-orange-50/30 to-white px-2 pb-3 pt-1 dark:from-orange-950/20 dark:to-dark-tremor-background-default sm:px-3">
            <WfmClientHeadcountTable
              rows={filteredRows}
              totals={projectTableTotals}
              onAssignRegionalHead={setRegionalHeadAssignRow}
            />
          </div>
        )}
      </TremorDashboardSection>

      {!loading && rows.length > 0 && rowsMatchingFilters.length > 0 && (
        <>
          <TremorDashboardSection
            className={flatCard}
            compact
            title="Region & region leader — headcount variance"
            noPad
          >
            <div className="overflow-x-auto bg-gradient-to-b from-orange-50/30 to-white px-2 pb-3 pt-1 dark:from-orange-950/20 dark:to-dark-tremor-background-default sm:px-3">
              <WfmSummaryTable
                rows={regionalSummaryRows}
                labelTitle="Region"
                labelSubtitle="Region leader"
                totals={regionalSummaryTotals}
              />
            </div>
          </TremorDashboardSection>

          <TremorDashboardSection
            className={flatCard}
            compact
            title="Overall WL wise variance"
            noPad
          >
            <div className="overflow-x-auto bg-gradient-to-b from-orange-50/30 to-white px-2 pb-3 pt-1 dark:from-orange-950/20 dark:to-dark-tremor-background-default sm:px-3">
              <WfmSummaryTable
                rows={wlSummaryRows}
                labelTitle="Work level"
                labelSubtitle="Band"
                totals={wlSummaryTotals}
              />
            </div>
          </TremorDashboardSection>
        </>
      )}

      {!loading && rows.length > 0 && (
        <Card className={cn(flatCard, "border-t-4 border-t-orange-400 dark:border-t-orange-500")}>
          <div className="border-b border-tremor-border px-4 py-3 dark:border-dark-tremor-border">
            <Title className="text-base font-semibold text-tremor-content-strong">Productivity target vs fill rate (by client)</Title>
            <Text className="mt-0.5 text-xs leading-snug text-tremor-content-subtle">
              Bars: fill rate (actual ÷ ideal HC). Line: productivity target (lacs). Dashed line: 100% fill — above = over-capacity.
          {productivityFillChartAll.length > 0 ? (
                <span className="mt-1 block text-[11px]">
              {prodChartSelected.length === 0
                    ? `Showing all ${productivityFillChartAll.length} clients — search to narrow.`
                    : `Showing ${productivityFillChartData.length} of ${productivityFillChartAll.length} selected.`}
            </span>
          ) : null}
            </Text>
        </div>
          <div className="px-4 py-3">
          {productivityFillChartAll.length > 0 ? (
            <div className="mb-3">
              <div ref={prodChartPickerWrapRef} className="relative">
                <Flex className="flex-wrap items-center gap-1.5">
                  <TextInput
                    className="min-w-[140px] max-w-xs flex-1 text-xs"
                  placeholder="Search clients to add…"
                  value={prodChartSearch}
                    onValueChange={setProdChartSearch}
                  onFocus={() => setProdChartPickerOpen(true)}
                  onClick={() => setProdChartPickerOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setProdChartPickerOpen(false);
                  }}
                  autoComplete="off"
                />
                  <Button
                  type="button"
                    variant="secondary"
                    size="xs"
                    color="slate"
                    className="!text-[11px]"
                  onClick={() => {
                      const next = prodChartPickerCandidates[0]?.fullName;
                      if (next && !prodChartSelected.includes(next)) setProdChartSelected((s) => [...s, next]);
                    setProdChartSearch("");
                  }}
                    disabled={!prodChartPickerCandidates.length}
                >
                  + Add first match
                  </Button>
                  <Button
                  type="button"
                    variant="primary"
                    size="xs"
                    color="orange"
                    className="!text-[11px]"
                  onClick={() => {
                    setProdChartSelected([]);
                    setProdChartSearch("");
                    setProdChartPickerOpen(false);
                  }}
                >
                    Show all
                  </Button>
                </Flex>
                {prodChartPickerOpen && prodChartPickerCandidates.length > 0 ? (
                <div
                  role="listbox"
                    className="absolute left-0 right-0 top-full z-40 mt-1 max-h-36 overflow-y-auto rounded-tremor-default border border-tremor-border bg-white py-1 shadow-tremor-dropdown dark:border-dark-tremor-border dark:bg-dark-tremor-background-muted"
                  >
                    <Text className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-orange-600">Add client</Text>
                  {prodChartPickerCandidates.map((d) => (
                    <button
                      key={d.fullName}
                      type="button"
                      role="option"
                        className="block w-full cursor-pointer border-0 bg-transparent px-2.5 py-1 text-left text-xs text-tremor-content-subtle hover:bg-orange-50 dark:hover:bg-dark-tremor-background-subtle"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setProdChartSelected((s) => (s.includes(d.fullName) ? s : [...s, d.fullName]));
                        setProdChartSearch("");
                      }}
                    >
                      {d.fullName}
                    </button>
                  ))}
                </div>
                ) : null}
            </div>
              {prodChartSelected.length > 0 ? (
                <Flex className="mt-2 flex-wrap items-center gap-1.5">
                  <Text className="text-[10px] font-bold uppercase tracking-wide text-tremor-content-subtle">Selected</Text>
                {prodChartSelected.map((fn) => (
                    <Button
                    key={fn}
                    type="button"
                      size="xs"
                      variant="light"
                      color="orange"
                      className="!max-w-[200px] !truncate !text-[11px]"
                    onClick={() => setProdChartSelected((s) => s.filter((x) => x !== fn))}
                  >
                    {fn.length > 28 ? `${fn.slice(0, 27)}…` : fn}
                      <span className="ml-0.5 opacity-70">×</span>
                    </Button>
                ))}
                </Flex>
              ) : null}
              </div>
          ) : null}
          <div className="mt-1">
        <WfmProductivityFillChart data={productivityFillChartData} />
        </div>
        </div>
        </Card>
      )}

      <WfmExpandDialog
        mode={expandMode}
        items={allBulletItems}
        rows={rowsMatchingFilters}
        filter={expandFilter}
        onFilterChange={setExpandFilter}
        onClose={() => setExpandMode(null)}
      />

      <WfmBenchmarkFormDialog
        open={wfmDialogOpen}
        onOpenChange={setWfmDialogOpen}
        wfmRows={rows}
        onSaved={reloadWfm}
      />

      <WfmRegionalHeadAssignDialog
        row={regionalHeadAssignRow}
        onClose={() => setRegionalHeadAssignRow(null)}
        onSaved={reloadWfm}
      />

      <Dialog open={kpiDetail != null} onOpenChange={(open) => { if (!open) setKpiDetail(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{kpiDetail?.title}</DialogTitle>
            <DialogDescription asChild>
              <div className="mt-2 text-base font-semibold tabular-nums text-tremor-content-strong">
                {kpiDetail?.value}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 border-t border-tremor-border pt-3 dark:border-dark-tremor-border">
            <Text className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">
              Data reference &amp; calculation
            </Text>
            {kpiDetail?.detail}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
