/**
 * WFM fill rate = actual HC ÷ ideal HC × 100.
 * Product rule: values at or below 100% are on plan; over 100% is over-capacity (at risk).
 */

export type WfmHcBulletCore = {
  name: string;
  actual: number;
  ideal: number;
  color: string;
  pct: number;
};

export function wfmFillPct(actual: number, ideal: number): number {
  const a = Number(actual);
  const i = Number(ideal);
  if (!Number.isFinite(a) || !Number.isFinite(i) || i <= 0) return 0;
  return (a / i) * 100;
}

export type WfmFillBand = "strong" | "watch" | "risk";

/** strong = 70–100% on plan; watch = 50–69%; risk = >100% (over) or <50% (under) or no ideal */
export function wfmFillBand(pct: number, ideal: number): WfmFillBand {
  const i = Number(ideal);
  if (!Number.isFinite(i) || i <= 0) return "risk";
  if (pct > 100) return "risk";
  if (pct >= 70 && pct <= 100) return "strong";
  if (pct >= 50 && pct < 70) return "watch";
  return "risk";
}

export function wfmFillColor(pct: number, ideal: number): string {
  const b = wfmFillBand(pct, ideal);
  if (b === "strong") return "var(--green)";
  if (b === "watch") return "var(--amber)";
  return "var(--red)";
}

export function wfmStatusLabel(pct: number, ideal: number): "Strong" | "Watch" | "At Risk" {
  const b = wfmFillBand(pct, ideal);
  if (b === "strong") return "Strong";
  if (b === "watch") return "Watch";
  return "At Risk";
}

export function wfmMatchesFilter(pct: number, ideal: number, filter: "all" | "strong" | "watch" | "risk"): boolean {
  if (filter === "all") return true;
  const b = wfmFillBand(pct, ideal);
  return b === filter;
}

export function wfmStatsVm(raw: any) {
  return raw || null;
}

/** One row from GET /wfm/data (benchmark snapshot per client / reporting period). */
/** Subset of `sheet_metrics_json` from WFM ingest (see `ingest_wfm.py`). */
export type WfmSheetMetricsJson = {
  open_positions?: { wl1?: number; wl2?: number; wl3?: number; wl4?: number; total?: number };
  variance?: { hc_bench?: number | null; after_hiring?: number | null };
};

export type WfmBenchmarkRowVm = {
  id: number;
  project_id?: number;
  account_name: string;
  region?: string;
  vertical?: string;
  practice?: string;
  practice_head?: string;
  /** Account regional lead from `projects.regional_head`. */
  regional_head?: string;
  /** Count of `wfm_resource_gaps` rows for this project (gap upload). */
  resource_gap_row_count?: number;
  reporting_date: string | null;
  ideal_hc: number;
  actual_hc_total: number;
  lateral_revenue_target?: number;
  lateral_hc_target: number;
  lateral_productivity_target: number;
  gap?: number;
  wl1_hires: number;
  wl2_hires: number;
  wl3_hires: number;
  wl4_hires: number;
  sheet_metrics_json?: WfmSheetMetricsJson | Record<string, unknown> | null;
};

export function wfmRowWlSum(r: Pick<WfmBenchmarkRowVm, "wl1_hires" | "wl2_hires" | "wl3_hires" | "wl4_hires">): number {
  return (
    Number(r.wl1_hires ?? 0) + Number(r.wl2_hires ?? 0) + Number(r.wl3_hires ?? 0) + Number(r.wl4_hires ?? 0)
  );
}

/** Open pipeline total from ingested sheet JSON (per client row). */
export function wfmOpenPositionsFromSheet(r: WfmBenchmarkRowVm): number {
  const j = r.sheet_metrics_json as WfmSheetMetricsJson | null | undefined;
  const t = j?.open_positions?.total;
  return typeof t === "number" && Number.isFinite(t) ? t : 0;
}

/**
 * "Additional" HC proxy: YTD lateral HC target above current roster (temp / stretch in workbook).
 * Distinct from WL band mix (often equals actual when self-consistent).
 */
export function wfmRowAdditionalHcProxy(r: WfmBenchmarkRowVm): number {
  const actual = Number(r.actual_hc_total ?? 0);
  const target = Number(r.lateral_hc_target ?? 0);
  return Math.max(0, target - actual);
}

/** Projected roster strength ≈ actual + (target − roster buffer) + sheet open positions; resignations not in ingest (0). */
export function wfmRowProjectedHc(r: WfmBenchmarkRowVm): number {
  const actual = Number(r.actual_hc_total ?? 0);
  return actual + wfmRowAdditionalHcProxy(r) + wfmOpenPositionsFromSheet(r);
}

/** Ideal − projected HC (whether pipeline closes the gap vs ideal). */
export function wfmRowNetVarianceVsProjected(r: WfmBenchmarkRowVm): number {
  const ideal = Number(r.ideal_hc ?? 0);
  return ideal - wfmRowProjectedHc(r);
}

/** Actual − projected HC (workbook summary rollups). */
export function wfmRowNetVarianceActualVsProjected(r: WfmBenchmarkRowVm): number {
  const actual = Number(r.actual_hc_total ?? 0);
  return actual - wfmRowProjectedHc(r);
}

export type WfmSummaryRowVm = {
  key: string;
  labelPrimary: string;
  labelSecondary: string;
  lateral_revenue_target: number;
  lateral_productivity_target: number;
  ideal_hc: number;
  actual_hc_total: number;
  variance_ideal_actual: number;
  additional_hc: number;
  open_positions: number;
  resignations: number;
  projected_hc: number;
  net_variance_actual_projected: number;
  fill_pct: number;
  client_count: number;
};

/** Keep latest benchmark snapshot per project when multiple reporting dates exist. */
export function wfmDedupeLatestByProject(rows: WfmBenchmarkRowVm[]): WfmBenchmarkRowVm[] {
  const byProject = new Map<number, WfmBenchmarkRowVm>();
  const orphans: WfmBenchmarkRowVm[] = [];
  for (const r of rows) {
    const pid = r.project_id;
    if (pid == null || pid <= 0) {
      orphans.push(r);
      continue;
    }
    const prev = byProject.get(pid);
    const d = String(r.reporting_date ?? "");
    const prevD = String(prev?.reporting_date ?? "");
    if (!prev || d.localeCompare(prevD) > 0) {
      byProject.set(pid, r);
    }
  }
  return [...byProject.values(), ...orphans];
}

function wfmAggregateRows(
  rows: WfmBenchmarkRowVm[],
  keyFn: (r: WfmBenchmarkRowVm) => string,
  labelFn: (r: WfmBenchmarkRowVm) => { primary: string; secondary: string },
): WfmSummaryRowVm[] {
  type Acc = {
    key: string;
    labelPrimary: string;
    labelSecondary: string;
    sumRev: number;
    maxRev: number;
    sumIdeal: number;
    sumActual: number;
    sumAdditional: number;
    sumOpen: number;
    sumProjected: number;
    sumProdWeighted: number;
    sumIdealForProd: number;
    clientCount: number;
  };
  const map = new Map<string, Acc>();
  for (const r of rows) {
    const key = keyFn(r);
    const { primary, secondary } = labelFn(r);
    let acc = map.get(key);
    if (!acc) {
      acc = {
        key,
        labelPrimary: primary,
        labelSecondary: secondary,
        sumRev: 0,
        maxRev: 0,
        sumIdeal: 0,
        sumActual: 0,
        sumAdditional: 0,
        sumOpen: 0,
        sumProjected: 0,
        sumProdWeighted: 0,
        sumIdealForProd: 0,
        clientCount: 0,
      };
      map.set(key, acc);
    }
    const rev = Number(r.lateral_revenue_target ?? 0);
    const ideal = Number(r.ideal_hc ?? 0);
    const actual = Number(r.actual_hc_total ?? 0);
    const prod = Number(r.lateral_productivity_target ?? 0);
    acc.sumRev += rev;
    acc.maxRev = Math.max(acc.maxRev, Math.abs(rev));
    acc.sumIdeal += ideal;
    acc.sumActual += actual;
    acc.sumAdditional += wfmRowAdditionalHcProxy(r);
    acc.sumOpen += wfmOpenPositionsFromSheet(r);
    acc.sumProjected += wfmRowProjectedHc(r);
    acc.clientCount += 1;
    if (ideal > 0 && Number.isFinite(prod)) {
      acc.sumIdealForProd += ideal;
      acc.sumProdWeighted += prod * ideal;
    }
  }
  return [...map.values()]
    .map((a) => {
      const wProd =
        a.sumIdealForProd > 0 ? a.sumProdWeighted / a.sumIdealForProd : 0;
      return {
        key: a.key,
        labelPrimary: a.labelPrimary,
        labelSecondary: a.labelSecondary,
        lateral_revenue_target: a.sumRev,
        lateral_productivity_target: wProd,
        ideal_hc: a.sumIdeal,
        actual_hc_total: a.sumActual,
        variance_ideal_actual: a.sumIdeal - a.sumActual,
        additional_hc: a.sumAdditional,
        open_positions: a.sumOpen,
        resignations: 0,
        projected_hc: a.sumProjected,
        net_variance_actual_projected: a.sumActual - a.sumProjected,
        fill_pct: wfmFillPct(a.sumActual, a.sumIdeal),
        client_count: a.clientCount,
      };
    })
    .sort((x, y) => x.labelPrimary.localeCompare(y.labelPrimary) || x.labelSecondary.localeCompare(y.labelSecondary));
}

export function wfmAggregateByRegionalHead(rows: WfmBenchmarkRowVm[]): WfmSummaryRowVm[] {
  return wfmAggregateRows(
    rows,
    (r) => {
      const region = (r.region || "").trim() || "Unknown";
      const head = (r.regional_head || "").trim() || "Unassigned";
      return `${region}\0${head}`;
    },
    (r) => ({
      primary: (r.region || "").trim() || "Unknown",
      secondary: (r.regional_head || "").trim() || "Unassigned",
    }),
  );
}

export function wfmAggregateByPracticeHead(rows: WfmBenchmarkRowVm[]): WfmSummaryRowVm[] {
  return wfmAggregateRows(
    rows,
    (r) => {
      const ph = (r.practice_head || "").trim() || "Unassigned";
      const region = (r.region || "").trim() || "Unknown";
      return `${ph}\0${region}`;
    },
    (r) => ({
      primary: (r.practice_head || "").trim() || "Unassigned",
      secondary: (r.region || "").trim() || "Unknown",
    }),
  );
}

export function wfmSummaryTotals(rows: WfmSummaryRowVm[]): WfmSummaryRowVm | null {
  if (rows.length <= 1) return null;
  let sumRev = 0;
  let maxRev = 0;
  let sumIdeal = 0;
  let sumActual = 0;
  let sumAdditional = 0;
  let sumOpen = 0;
  let sumProjected = 0;
  let sumProdWeighted = 0;
  let sumIdealForProd = 0;
  let clients = 0;
  for (const r of rows) {
    sumRev += r.lateral_revenue_target;
    maxRev = Math.max(maxRev, Math.abs(r.lateral_revenue_target));
    sumIdeal += r.ideal_hc;
    sumActual += r.actual_hc_total;
    sumAdditional += r.additional_hc;
    sumOpen += r.open_positions;
    sumProjected += r.projected_hc;
    clients += r.client_count;
    if (r.ideal_hc > 0 && Number.isFinite(r.lateral_productivity_target)) {
      sumIdealForProd += r.ideal_hc;
      sumProdWeighted += r.lateral_productivity_target * r.ideal_hc;
    }
  }
  const wProd = sumIdealForProd > 0 ? sumProdWeighted / sumIdealForProd : 0;
  return {
    key: "__totals__",
    labelPrimary: "Σ / blended",
    labelSecondary: `${clients} clients`,
    lateral_revenue_target: sumRev,
    lateral_productivity_target: wProd,
    ideal_hc: sumIdeal,
    actual_hc_total: sumActual,
    variance_ideal_actual: sumIdeal - sumActual,
    additional_hc: sumAdditional,
    open_positions: sumOpen,
    resignations: 0,
    projected_hc: sumProjected,
    net_variance_actual_projected: sumActual - sumProjected,
    fill_pct: wfmFillPct(sumActual, sumIdeal),
    client_count: clients,
  };
}

export function wfmRowsVm(rows: any[]): WfmBenchmarkRowVm[] {
  return (rows || []) as WfmBenchmarkRowVm[];
}
