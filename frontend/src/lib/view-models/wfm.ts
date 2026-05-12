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

export function wfmRowsVm(rows: any[]): WfmBenchmarkRowVm[] {
  return (rows || []) as WfmBenchmarkRowVm[];
}
