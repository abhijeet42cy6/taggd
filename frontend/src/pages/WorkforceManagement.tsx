import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Expand, Plus, Upload } from "lucide-react";
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
  TableFoot,
  TableFooterCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
  TextInput,
  Title,
} from "@tremor/react";
import { api, invalidateCache, queries } from "@/lib/api";
import { SkeletonTable } from "@/components/platform/Skeleton";
import { GaugeRing, HcIdealActualGroupedChart, WlDistributionBar, WfmProductivityFillChart } from "@/components/platform/Charts";
import { WfmBenchmarkFormDialog } from "@/components/platform/WfmBenchmarkFormDialog";
import {
  WfmExpandDialog,
  WfmFilterChipRow,
  wfmStatusToBadgeColor,
  type WfmBulletItem,
  type WfmExpandMode,
  type WfmPerformFilter,
} from "@/components/tremor-dashboard/WfmExpandDialog";
import { TremorDashboardSection } from "@/components/tremor-dashboard/TremorDashboardSection";
import { cn, formatLargeCurrency, formatLacs, formatNumber, formatPercent } from "@/lib/utils";
import {
  wfmFillPct,
  wfmFillColor,
  wfmFillBand,
  wfmStatusLabel,
  wfmMatchesFilter,
  wfmRowsVm,
  wfmOpenPositionsFromSheet,
  wfmRowAdditionalHcProxy,
  wfmRowProjectedHc,
  wfmRowNetVarianceVsProjected,
  type WfmBenchmarkRowVm,
} from "@/lib/view-models/wfm";

/** Same INR heuristic as portfolio workbook card (values ≤ ₹5L treated as lacs × 1e5). */
function formatWfmRowRevenueTarget(raw: number | null | undefined): string {
  const v = Number(raw);
  if (!Number.isFinite(v) || v === 0) return "—";
  const inr = Math.abs(v) > 500_000 ? v : v * 100_000;
  return formatLargeCurrency(inr);
}

function fillBarTremorColor(pct: number, ideal: number): "emerald" | "amber" | "rose" {
  const b = wfmFillBand(pct, ideal);
  if (b === "strong") return "emerald";
  if (b === "watch") return "amber";
  return "rose";
}

const flatCard =
  "overflow-hidden border-0 p-0 shadow-tremor-card ring-1 ring-tremor-ring dark:bg-dark-tremor-background dark:shadow-dark-tremor-card dark:ring-dark-tremor-ring";

const WFM_BLOCK_TAG = "mt-3 text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle md:mt-4";

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export function WorkforceManagement() {
  const [stats, setStats] = useState<any>(null);
  const [rows, setRows] = useState<WfmBenchmarkRowVm[]>([]);
  const [loading, setLoading] = useState(true);
  const [wfmDialogOpen, setWfmDialogOpen] = useState(false);

  const reloadWfm = useCallback(async () => {
    invalidateCache("wfm/");
    const [s, d] = await Promise.allSettled([queries.wfmStats(), queries.wfmData()]);
    if (s.status === "fulfilled") setStats(s.value);
    if (d.status === "fulfilled") setRows(wfmRowsVm(d.value || []));
  }, []);

  const [tableFilter, setTableFilter] = useState<WfmPerformFilter>("all");
  const [expandMode, setExpandMode] = useState<WfmExpandMode>(null);
  const [expandFilter, setExpandFilter] = useState<WfmPerformFilter>("all");
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
    const form = new FormData();
    form.append("file", file);
    await api.post("/wfm/upload", form);
    await reloadWfm();
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
  const projectedHc = actualHc; // roster strength = total actual HC (WL = mix, not added again)
  const varActual = Math.max(0, projectedHc - actualHc); // 0 in self-consistent template; ≥0 if we ever add pipeline
  /** Same as `idealHc - actualHc` (negative = over ideal / over-capacity). */
  const netRosterGapToIdeal = idealHc - actualHc;

  const fgColor = idealHc > 0 ? wfmFillColor(fillRate, idealHc) : "var(--accent)";

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

  // Filtered table rows
  const filteredRows = useMemo(() =>
    rows.filter((r) => {
      const ideal = Number(r.ideal_hc ?? 0);
      const actual = Number(r.actual_hc_total ?? 0);
      const pct = wfmFillPct(actual, ideal);
      return wfmMatchesFilter(pct, ideal, tableFilter);
    }),
  [rows, tableFilter]);

  // WL distribution
  const wlData = useMemo(() => rows.map((r) => ({
    name: (r.account_name || `P${r.project_id}`).slice(0, 12),
        wl1: Number(r.wl1_hires ?? 0),
        wl2: Number(r.wl2_hires ?? 0),
        wl3: Number(r.wl3_hires ?? 0),
        wl4: Number(r.wl4_hires ?? 0),
  })).filter((d) => d.wl1 + d.wl2 + d.wl3 + d.wl4 > 0), [rows]);

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

  const projectTableTotals = useMemo(() => {
    if (filteredRows.length <= 1) return null;
    const totIdeal = filteredRows.reduce((s, r) => s + Number(r.ideal_hc ?? 0), 0);
    const totActual = filteredRows.reduce((s, r) => s + Number(r.actual_hc_total ?? 0), 0);
    const totVariance = totIdeal - totActual;
    const totAdditionalHc = filteredRows.reduce((s, r) => s + wfmRowAdditionalHcProxy(r), 0);
    const totOpenSheet = filteredRows.reduce((s, r) => s + wfmOpenPositionsFromSheet(r), 0);
    const totGapRows = filteredRows.reduce((s, r) => s + Number(r.resource_gap_row_count ?? 0), 0);
    const totProjectedHc = filteredRows.reduce((s, r) => s + wfmRowProjectedHc(r), 0);
    const totNetVar = totIdeal - totProjectedHc;
    const totFill = wfmFillPct(totActual, totIdeal);
    let sumRev = 0;
    let maxRev = 0;
    let sumIdealForProd = 0;
    let sumProdWeighted = 0;
    for (const r of filteredRows) {
      const rev = Number(r.lateral_revenue_target ?? 0);
      sumRev += rev;
      maxRev = Math.max(maxRev, Math.abs(rev));
      const idealN = Number(r.ideal_hc ?? 0);
      const prod = Number(r.lateral_productivity_target ?? 0);
      if (idealN > 0 && Number.isFinite(prod)) {
        sumIdealForProd += idealN;
        sumProdWeighted += prod * idealN;
      }
    }
    const revenueInrSum = maxRev > 500_000 ? sumRev : sumRev * 100_000;
    const wProdFoot =
      sumIdealForProd > 0
        ? sumProdWeighted / sumIdealForProd
        : filteredRows.reduce((s, r) => s + Number(r.lateral_productivity_target ?? 0), 0) / filteredRows.length;
    return {
      totIdeal,
      totActual,
      totVariance,
      totAdditionalHc,
      totOpenSheet,
      totGapRows,
      totProjectedHc,
      totNetVar,
      totFill,
      footerRevenueDisplay: formatLargeCurrency(revenueInrSum),
      footerProductivityLacs: Number.isFinite(wProdFoot) ? wProdFoot : 0,
    };
  }, [filteredRows]);

  const openRequisitionsTotal = Number(stats?.open_requisitions ?? 0);

  /** Portfolio-level metrics from benchmark rows + sheet JSON (no new API). */
  const portfolioWorkbook = useMemo(() => {
    if (!rows.length) return null;
    let sumRev = 0;
    let sumIdealForProd = 0;
    let sumProdWeighted = 0;
    let sumOpenSheet = 0;
    let sumAdditional = 0;
    let sumActual = 0;
    let sumIdeal = 0;
    let maxRev = 0;
    for (const r of rows) {
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
      sumAdditional += wfmRowAdditionalHcProxy(r);
    }
    const wProdRaw =
      sumIdealForProd > 0
        ? sumProdWeighted / sumIdealForProd
        : rows.reduce((s, r) => s + Number(r.lateral_productivity_target ?? 0), 0) / rows.length;
    const wProd = Number.isFinite(wProdRaw) ? wProdRaw : 0;
    const portfolioProjected = sumActual + sumAdditional + sumOpenSheet;
    const varianceVsActual = sumIdeal - sumActual;
    const staffGapPctActual = sumIdeal > 0 ? ((sumIdeal - sumActual) / sumIdeal) * 100 : 0;
    const varianceVsProjected = sumIdeal - portfolioProjected;
    const staffGapPctProjected = sumIdeal > 0 ? ((sumIdeal - portfolioProjected) / sumIdeal) * 100 : 0;
    let overstaffed = 0;
    let understaffed = 0;
    let onTrack = 0;
    for (const r of rows) {
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
  }, [rows]);

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
          <Text className="mt-1.5 max-w-4xl text-xs leading-snug text-tremor-content-emphasis md:text-sm md:leading-snug">
            Portfolio workbook · benchmarks · WL mix
          </Text>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" size="xs" variant="primary" color="orange" onClick={() => setWfmDialogOpen(true)}>
            <span className="inline-flex items-center gap-1">
              <Plus size={12} strokeWidth={2.5} aria-hidden />
            Add / edit WFM data
            </span>
          </Button>
          <Button type="button" size="xs" variant="secondary" color="slate" onClick={() => uploadInputRef.current?.click()}>
            <span className="inline-flex items-center gap-1">
              <Upload size={12} aria-hidden />
              Upload WFM
            </span>
          </Button>
        </div>
      </Flex>

      {!loading && portfolioWorkbook && (
        <>
          <Text className={WFM_BLOCK_TAG}>Portfolio mix (workbook)</Text>
          <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="gap-2 md:gap-3">
            <Card decoration="top" decorationColor="amber" className="p-3">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Forecast revenue (YTD)
              </Text>
              <Metric className="mt-1 text-lg tabular-nums leading-tight md:text-xl">
                {formatLargeCurrency(portfolioWorkbook.revenueInr)}
              </Metric>
              <Text className="mt-0.5 text-[10px] leading-snug text-tremor-content-subtle md:text-[11px]">
                Σ lateral revenue YTD; per-row totals below ₹5L assumed Lacs (×1e5) for ₹ display
              </Text>
            </Card>
            <Card decoration="top" decorationColor="indigo" className="p-3">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
                Target productivity
              </Text>
              <Metric className="mt-1 text-lg tabular-nums md:text-xl">{formatLacs(portfolioWorkbook.wProd)}</Metric>
              <Text className="mt-0.5 text-[10px] leading-snug text-tremor-content-subtle md:text-[11px]">
                Ideal-HC–weighted mean of lateral productivity (YTD column), lacs
              </Text>
            </Card>
            <Card decoration="top" decorationColor="teal" className="p-3">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">Ideal HC</Text>
              <Metric className="mt-1 text-lg tabular-nums md:text-xl">{formatNumber(idealHc)}</Metric>
              <Text className="mt-0.5 text-[10px] text-tremor-content-subtle md:text-[11px]">Σ ideal headcount</Text>
            </Card>
            <Card decoration="top" decorationColor="blue" className="p-3">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Actual HC</Text>
              <Metric className="mt-1 text-lg tabular-nums md:text-xl">{formatNumber(actualHc)}</Metric>
              <Text className="mt-0.5 text-[10px] text-tremor-content-subtle md:text-[11px]">Σ on payroll</Text>
            </Card>
            <Card decoration="top" decorationColor="cyan" className="p-3">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-400">Additional HC (proxy)</Text>
              <Metric className="mt-1 text-lg tabular-nums md:text-xl">{formatNumber(portfolioWorkbook.sumAdditional)}</Metric>
              <Text className="mt-0.5 text-[10px] leading-snug text-tremor-content-subtle md:text-[11px]">
                Σ max(0, lateral HC target − actual) per client — temp / stretch from workbook
              </Text>
            </Card>
            <Card decoration="top" decorationColor="rose" className="p-3">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">Total open positions</Text>
              <Flex justifyContent="between" alignItems="start" className="mt-1 flex-wrap gap-1">
                <Metric className="text-lg tabular-nums md:text-xl">{formatNumber(portfolioWorkbook.sumOpenSheet)}</Metric>
                <Badge color="slate" size="xs">Sheet</Badge>
              </Flex>
              <Text className="mt-0.5 text-[10px] leading-snug text-tremor-content-subtle md:text-[11px]">
                Σ open_positions.total from workbook JSON per client (feeds projected HC). Gap upload lists{" "}
                <span className="font-medium text-tremor-content-emphasis">{formatNumber(openRequisitionsTotal, 0)}</span> open gap{" "}
                records — a separate pipeline count, not included in the sheet total above.
              </Text>
            </Card>
            <Card decoration="top" decorationColor="slate" className="p-3">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Resignations</Text>
              <Metric className="mt-1 text-lg tabular-nums text-tremor-content-subtle md:text-xl">Not tracked</Metric>
              <Text className="mt-0.5 text-[10px] leading-snug text-tremor-content-subtle md:text-[11px]">
                Not ingested on the WFM workbook path — projected HC below assumes 0 resignations.
              </Text>
            </Card>
            <Card decoration="top" decorationColor="violet" className="p-3">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400">Projected HC</Text>
              <Metric className="mt-1 text-lg tabular-nums md:text-xl">{formatNumber(portfolioWorkbook.portfolioProjected)}</Metric>
              <Text className="mt-0.5 text-[10px] leading-snug text-tremor-content-subtle md:text-[11px]">
                Actual + additional proxy + sheet open positions (no resignations)
              </Text>
            </Card>
          </Grid>

          <Text className={WFM_BLOCK_TAG}>Variance indicators</Text>
          <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="gap-2 md:gap-3">
            <Card decoration="top" decorationColor="orange" className="p-3">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                Variance vs actual HC
              </Text>
              <Metric
                className={`mt-1 text-lg tabular-nums md:text-xl ${
                  portfolioWorkbook.varianceVsActual < 0 ? "text-orange-600 dark:text-orange-400" : "text-tremor-content-strong"
                }`}
              >
                {portfolioWorkbook.varianceVsActual > 0 ? "+" : ""}
                {formatNumber(portfolioWorkbook.varianceVsActual)}
              </Metric>
              <Text className="mt-0.5 text-[10px] leading-snug text-tremor-content-subtle md:text-[11px]">Ideal − actual (Σ)</Text>
            </Card>
            <Card decoration="top" decorationColor="fuchsia" className="p-3">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-fuchsia-700 dark:text-fuchsia-400">
                Staff gap % vs actual
              </Text>
              <Metric className="mt-1 text-lg tabular-nums md:text-xl">{formatPercent(portfolioWorkbook.staffGapPctActual)}</Metric>
              <Text className="mt-0.5 text-[10px] leading-snug text-tremor-content-subtle md:text-[11px]">(Ideal − actual) ÷ ideal</Text>
            </Card>
            <Card decoration="top" decorationColor="orange" className="p-3">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                Net variance vs projected HC
              </Text>
              <Metric
                className={`mt-1 text-lg tabular-nums md:text-xl ${
                  portfolioWorkbook.varianceVsProjected < 0 ? "text-orange-600 dark:text-orange-400" : "text-tremor-content-strong"
                }`}
              >
                {portfolioWorkbook.varianceVsProjected > 0 ? "+" : ""}
                {formatNumber(portfolioWorkbook.varianceVsProjected)}
              </Metric>
              <Text className="mt-0.5 text-[10px] leading-snug text-tremor-content-subtle md:text-[11px]">Ideal − projected (Σ)</Text>
            </Card>
            <Card decoration="top" decorationColor="fuchsia" className="p-3">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-fuchsia-700 dark:text-fuchsia-400">
                Staffing gap % vs projected
              </Text>
              <Metric className="mt-1 text-lg tabular-nums md:text-xl">{formatPercent(portfolioWorkbook.staffGapPctProjected)}</Metric>
              <Text className="mt-0.5 text-[10px] leading-snug text-tremor-content-subtle md:text-[11px]">(Ideal − projected) ÷ ideal</Text>
            </Card>
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
          <Text className={WFM_BLOCK_TAG}>Roster vs target</Text>
          <Grid numItems={1} numItemsSm={2} numItemsLg={3} className="gap-2 md:gap-3">
            <Card decoration="top" decorationColor="teal" className="p-3">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">Roster (actual HC)</Text>
              <Metric className="mt-1 text-xl tabular-nums md:text-2xl">{formatNumber(projectedHc)}</Metric>
              <Text className="mt-0.5 text-[11px] leading-snug text-tremor-content-subtle md:text-xs">
                On rolls; WL1–4 are band mix (not double-counted)
              </Text>
            </Card>
            <Card decoration="top" decorationColor="emerald" className="p-3">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Net new vs roster</Text>
              <Metric
                className={`mt-1 text-xl tabular-nums md:text-2xl ${varActual > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-tremor-content-strong"}`}
              >
                {varActual > 0 ? `+${formatNumber(varActual)}` : "0"}
              </Metric>
              <Text className="mt-0.5 text-[11px] leading-snug text-tremor-content-subtle md:text-xs">
                Pipeline beyond actual (0 when WL = headcount mix)
              </Text>
            </Card>
            <Card decoration="top" decorationColor="orange" className="p-3">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">Gap to ideal target</Text>
              <Metric
                className={`mt-1 text-xl tabular-nums md:text-2xl ${
                  netRosterGapToIdeal < 0 ? "text-orange-500 dark:text-orange-400" : netRosterGapToIdeal > 0 ? "text-rose-600 dark:text-rose-400" : "text-tremor-content-strong"
                }`}
              >
                {netRosterGapToIdeal >= 0 ? "−" : "+"}
                {formatNumber(Math.abs(netRosterGapToIdeal))}
              </Metric>
              <Text className="mt-0.5 text-[11px] leading-snug text-tremor-content-subtle md:text-xs">Ideal − actual (same as ideal HC gap above)</Text>
            </Card>
          </Grid>
        </>
      )}

      {!loading && rows.length > 0 && (
        <>
          <Text className={WFM_BLOCK_TAG}>WL hire mix (additional support)</Text>
          <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="gap-2 md:gap-3">
            {(
              [
                { label: "WL1 hires", value: totalWl1, sub: "Entry level", color: "cyan" as const, text: "text-cyan-600 dark:text-cyan-400" },
                { label: "WL2 hires", value: totalWl2, sub: "Mid level", color: "blue" as const, text: "text-blue-600 dark:text-blue-400" },
                { label: "WL3+ hires", value: totalWl3, sub: "Senior / leadership", color: "violet" as const, text: "text-violet-600 dark:text-violet-400" },
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
                <Metric className="mt-1 text-xl tabular-nums md:text-2xl">{formatNumber(c.value)}</Metric>
                <Text className="mt-0.5 text-[11px] leading-snug text-tremor-content-subtle md:text-xs">{c.sub}</Text>
              </Card>
            ))}
          </Grid>
        </>
      )}

      <TremorDashboardSection
        className={flatCard}
        compact
        tag="Client headcount detail"
        title="Targets, pipeline & fill by client"
        toolbar={(
          <Flex justifyContent="between" alignItems="center" className="flex-wrap gap-2">
            <WfmFilterChipRow value={tableFilter} onChange={setTableFilter} />
            <Button
              type="button"
              variant="light"
              color="orange"
              size="xs"
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
          </Flex>
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
        ) : filteredRows.length === 0 ? (
          <div className="p-4">
            <Text className="text-sm text-tremor-content-subtle">No clients match this filter</Text>
          </div>
        ) : (
          <div className="overflow-x-auto bg-gradient-to-b from-orange-50/30 to-white px-2 pb-3 pt-1 dark:from-orange-950/20 dark:to-dark-tremor-background-default sm:px-3">
            <Table className="text-tremor-default [&_tbody_td]:px-2 [&_tbody_td]:py-1.5 [&_tbody_td]:text-xs [&_tfoot_td]:px-2 [&_tfoot_td]:py-1.5 [&_tfoot_td]:text-xs [&_thead_th]:px-2 [&_thead_th]:py-2 [&_thead_th]:text-[11px] [&_thead_th]:font-semibold [&_thead_th]:normal-case [&_thead_th]:tracking-normal [&_thead_th]:text-tremor-content-emphasis dark:[&_thead_th]:text-dark-tremor-content-emphasis [&_thead_th]:border-b [&_thead_th]:border-tremor-border dark:[&_thead_th]:border-dark-tremor-border">
              <TableHead>
                <TableRow>
                  <TableHeaderCell className="min-w-[148px]">
                    <Text className="block text-[11px] font-semibold leading-tight text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
                      Client / region
                    </Text>
                    <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                      Regional head
                    </Text>
                  </TableHeaderCell>
                  <TableHeaderCell className="min-w-[96px] text-right">
                    <Text className="block text-[11px] font-semibold leading-tight text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
                      Target revenue
                    </Text>
                    <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                      Workbook YTD
                    </Text>
                  </TableHeaderCell>
                  <TableHeaderCell className="text-right text-[11px] font-semibold text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
                    Prod. (lacs)
                  </TableHeaderCell>
                  <TableHeaderCell className="text-right text-[11px] font-semibold text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
                    Ideal HC
                  </TableHeaderCell>
                  <TableHeaderCell className="text-right text-[11px] font-semibold text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
                    Actual HC
                  </TableHeaderCell>
                  <TableHeaderCell className="min-w-[88px] text-right">
                    <Text className="block text-[11px] font-semibold leading-tight text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
                      Variance
                    </Text>
                    <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                      Ideal − actual
                    </Text>
                  </TableHeaderCell>
                  <TableHeaderCell className="min-w-[88px] text-right">
                    <Text className="block text-[11px] font-semibold leading-tight text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
                      Addl HC
                    </Text>
                    <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                      Workbook proxy
                    </Text>
                  </TableHeaderCell>
                  <TableHeaderCell className="min-w-[92px] text-right">
                    <Text className="block text-[11px] font-semibold leading-tight text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
                      Open positions
                    </Text>
                    <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                      Sheet / gap reqs
                    </Text>
                  </TableHeaderCell>
                  <TableHeaderCell className="text-right text-[11px] font-semibold text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
                    Resignations
                  </TableHeaderCell>
                  <TableHeaderCell className="min-w-[88px] text-right">
                    <Text className="block text-[11px] font-semibold leading-tight text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
                      Projected HC
                    </Text>
                    <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                      Actual + addl + open
                    </Text>
                  </TableHeaderCell>
                  <TableHeaderCell className="min-w-[88px] text-right">
                    <Text className="block text-[11px] font-semibold leading-tight text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
                      Net variance
                    </Text>
                    <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                      Ideal − projected
                    </Text>
                  </TableHeaderCell>
                  <TableHeaderCell className="text-[11px] font-semibold text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
                    Fill rate
                  </TableHeaderCell>
                  <TableHeaderCell className="text-[11px] font-semibold text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
                    Status
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRows.map((r, i) => {
                  const idealN = Number(r.ideal_hc ?? 0);
                  const actualN = Number(r.actual_hc_total ?? 0);
                  const variance = idealN - actualN;
                  const additionalHc = wfmRowAdditionalHcProxy(r);
                  const pct = wfmFillPct(actualN, idealN);
                  const gapColor = wfmFillColor(pct, idealN);
                  const statusLbl = wfmStatusLabel(pct, idealN);
                  const openSheet = wfmOpenPositionsFromSheet(r);
                  const gapReqRows = Number(r.resource_gap_row_count ?? 0);
                  const projRow = wfmRowProjectedHc(r);
                  const netVar = wfmRowNetVarianceVsProjected(r);
                  const regionLbl = (r.region || "").trim();
                  const headLbl = ((r.regional_head || "").trim() || (r.practice_head || "").trim()) || null;
                  return (
                    <TableRow key={i}>
                      <TableCell className="max-w-[200px]">
                        <Text className="text-xs font-semibold text-tremor-content-strong">{r.account_name || `Project ${r.project_id}`}</Text>
                        {regionLbl && regionLbl !== "Unknown" ? (
                          <Text className="block text-[11px] text-tremor-content-subtle">{regionLbl}</Text>
                        ) : null}
                        {headLbl ? <Text className="block text-[10px] text-tremor-content-subtle">{headLbl}</Text> : null}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-tremor-content-strong">
                        {formatWfmRowRevenueTarget(r.lateral_revenue_target)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-tremor-content-subtle">
                        {r.lateral_productivity_target != null ? formatLacs(r.lateral_productivity_target) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-tremor-content-strong">{formatNumber(idealN)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-tremor-content-strong">{formatNumber(actualN)}</TableCell>
                      <TableCell
                        className={`text-right text-xs tabular-nums font-semibold ${
                          variance > 0 ? "text-rose-600" : variance < 0 ? "text-amber-600" : "text-emerald-600"
                        }`}
                      >
                        {variance > 0 ? "+" : ""}
                        {formatNumber(variance)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-tremor-content-subtle">{formatNumber(additionalHc)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        <Text className={`tabular-nums ${openSheet > 0 ? "text-sky-800 dark:text-sky-300" : "text-tremor-content-subtle"}`}>
                          {formatNumber(openSheet)}
                        </Text>
                        <Text
                          className={`block text-[10px] tabular-nums ${gapReqRows > 0 ? "text-tremor-content-emphasis" : "text-tremor-content-subtle"}`}
                        >
                          {formatNumber(gapReqRows, 0)} reqs
                        </Text>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-tremor-content-subtle">—</TableCell>
                      <TableCell className="text-right text-xs tabular-nums font-medium text-violet-800 dark:text-violet-300">
                        {formatNumber(projRow)}
                      </TableCell>
                      <TableCell
                        className={`text-right text-xs tabular-nums font-semibold ${
                          netVar > 0 ? "text-rose-600" : netVar < 0 ? "text-amber-600" : "text-emerald-600"
                        }`}
                      >
                        {netVar > 0 ? "+" : ""}
                        {formatNumber(netVar)}
                      </TableCell>
                      <TableCell className="min-w-[120px]">
                        <Flex justifyContent="start" alignItems="center" className="gap-1.5">
                          <ProgressBar value={Math.min(100, pct)} color={fillBarTremorColor(pct, idealN)} className="min-w-[52px] flex-1 !h-1.5" />
                          <Text className="shrink-0 text-[11px] tabular-nums" style={{ color: gapColor }}>
                            {formatPercent(pct)}
                          </Text>
                        </Flex>
                      </TableCell>
                      <TableCell>
                        <Badge size="xs" color={wfmStatusToBadgeColor(statusLbl)}>{statusLbl}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              {projectTableTotals ? (
                <TableFoot>
                  <TableRow className="border-t border-orange-200/80 bg-orange-50/50 dark:border-orange-900/50 dark:bg-orange-950/25">
                    <TableFooterCell className="text-xs font-semibold tracking-normal text-orange-800 dark:text-orange-200">
                      Σ / blended
                    </TableFooterCell>
                    <TableFooterCell className="text-right text-[11px] tabular-nums font-semibold text-tremor-content-strong">
                      {projectTableTotals.footerRevenueDisplay}
                    </TableFooterCell>
                    <TableFooterCell className="text-right text-[11px] tabular-nums font-semibold">
                      {formatLacs(projectTableTotals.footerProductivityLacs)}
                    </TableFooterCell>
                    <TableFooterCell className="text-right text-xs tabular-nums font-semibold">{formatNumber(projectTableTotals.totIdeal)}</TableFooterCell>
                    <TableFooterCell className="text-right text-xs tabular-nums font-semibold">{formatNumber(projectTableTotals.totActual)}</TableFooterCell>
                    <TableFooterCell
                      className={`text-right text-xs tabular-nums font-semibold ${
                        projectTableTotals.totVariance > 0 ? "text-rose-600" : projectTableTotals.totVariance < 0 ? "text-amber-600" : "text-emerald-600"
                      }`}
                    >
                      {projectTableTotals.totVariance > 0 ? "+" : ""}
                      {formatNumber(projectTableTotals.totVariance)}
                    </TableFooterCell>
                    <TableFooterCell className="text-right text-xs tabular-nums font-semibold">{formatNumber(projectTableTotals.totAdditionalHc)}</TableFooterCell>
                    <TableFooterCell className="text-right text-[11px] tabular-nums font-semibold">
                      <span className="text-sky-800 dark:text-sky-300">{formatNumber(projectTableTotals.totOpenSheet)}</span>
                      <span className="mt-0.5 block text-[10px] font-normal text-tremor-content-subtle">
                        {formatNumber(projectTableTotals.totGapRows, 0)} reqs
                      </span>
                    </TableFooterCell>
                    <TableFooterCell className="text-right text-xs text-tremor-content-subtle">—</TableFooterCell>
                    <TableFooterCell className="text-right text-xs tabular-nums font-semibold text-violet-800 dark:text-violet-300">
                      {formatNumber(projectTableTotals.totProjectedHc)}
                    </TableFooterCell>
                    <TableFooterCell
                      className={`text-right text-xs tabular-nums font-semibold ${
                        projectTableTotals.totNetVar > 0 ? "text-rose-600" : projectTableTotals.totNetVar < 0 ? "text-amber-600" : "text-emerald-600"
                      }`}
                    >
                      {projectTableTotals.totNetVar > 0 ? "+" : ""}
                      {formatNumber(projectTableTotals.totNetVar)}
                    </TableFooterCell>
                    <TableFooterCell>
                      <Flex justifyContent="start" alignItems="center" className="gap-1.5">
                        <ProgressBar
                          value={Math.min(100, projectTableTotals.totFill)}
                          color={fillBarTremorColor(projectTableTotals.totFill, projectTableTotals.totIdeal)}
                          className="min-w-[52px] flex-1 !h-1.5"
                        />
                        <Text className="shrink-0 text-[11px] tabular-nums font-semibold" style={{ color: wfmFillColor(projectTableTotals.totFill, projectTableTotals.totIdeal) }}>
                          {formatPercent(projectTableTotals.totFill)}
                        </Text>
                      </Flex>
                    </TableFooterCell>
                    <TableFooterCell className="text-xs">—</TableFooterCell>
                  </TableRow>
                </TableFoot>
              ) : null}
            </Table>
          </div>
        )}
      </TremorDashboardSection>

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

      {!loading && rows.length > 0 && (
        <>
          <Text className={WFM_BLOCK_TAG}>Client HC — ideal vs actual</Text>
          <Grid numItems={1} numItemsLg={2} className="gap-3">
            <Card className={flatCard}>
              <div className="border-b border-tremor-border px-4 py-3 dark:border-dark-tremor-border">
                <Flex justifyContent="between" alignItems="center" className="gap-2">
                  <Title className="text-base font-semibold text-tremor-content-strong">HC comparison</Title>
                  <Button
                    type="button"
                    variant="light"
                    color="orange"
                    size="xs"
                    onClick={() => {
                      setExpandMode("hc");
                      setExpandFilter("all");
                    }}
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium">
                      <Expand size={12} aria-hidden />
                      Full list
                    </span>
                  </Button>
                </Flex>
              </div>
              <div className="px-4 py-3">
                {allBulletItems.length === 0 ? (
                  <Text className="text-xs text-tremor-content-subtle">No data</Text>
                ) : (
                  <HcIdealActualGroupedChart items={allBulletItems.slice(0, 8)} />
                )}
              </div>
            </Card>
            <Card className={flatCard}>
              <div className="border-b border-tremor-border px-4 py-3 dark:border-dark-tremor-border">
                <Title className="text-base font-semibold text-tremor-content-strong">Capacity fill gauge</Title>
                <Text className="mt-0.5 text-xs text-tremor-content-subtle">Ideal vs actual roster strength</Text>
              </div>
              <div className="flex flex-col gap-4 px-4 py-3">
                <GaugeRing
                  value={fillRate}
                  label="Capacity Fill Rate"
                  sublabel={`${formatNumber(actualHc)} of ${formatNumber(idealHc)} positions`}
                  color={fgColor}
                />
                {wlData.length > 0 ? <WlDistributionBar data={wlData} /> : null}
              </div>
            </Card>
          </Grid>
        </>
      )}

      <WfmExpandDialog
        mode={expandMode}
        items={allBulletItems}
        rows={rows}
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
    </div>
  );
}
