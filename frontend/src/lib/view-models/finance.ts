import { normalizeMaybeNumeric, normalizePlainNumber } from "@/lib/finance-units";

export type FinanceRowVm = {
  id: number;
  project_id?: number;
  month: string;
  month_sort?: string;
  account_name: string;
  vertical: string;
  project_head?: string | null;
  practice_head?: string | null;
  rev_budget_inr: number;
  rev_actual_inr: number;
  rev_forecast_inr: number;
  cm_actual_inr: number;
  /** Actual CM ÷ actual revenue × 100 */
  cm_pct?: number | null;
  unbilled_inr: number;
  collected_inr?: number;
  bad_debt_inr: number;
  collection_target_inr: number;
  collection_pending_inr: number;
  attainment: number;
  /** WL1 headcount from finance master (Actual Headcount WL1); may be fractional. */
  actual_headcount_wl1?: number;
  /** Overall HC (Actual_Headcount Overall). */
  actual_headcount_overall?: number;
  /** Monthly Taggd joiners (Taggd_Source_Joiner sheet). */
  taggd_joiners?: number;
  /** Total cost INR (Actual Cost ledger). */
  total_cost_inr?: number;
  /** Taggd joiners ÷ WL1 HC (Taggd source productivity). */
  taggd_joiner_productivity?: number | null;
  taggd_source_productivity?: number | null;
  /** Total cost / Overall HC (INR per HC). Formula only. */
  ppc_inr?: number | null;
  target_ppc_inr?: number | null;
  /** Actual PPC ÷ target PPC × 100 */
  ppc_ach_pct?: number | null;
  /** Target rev productivity (INR per WL1) from finance KPI row. */
  target_revenue_per_recruiter?: number | null;
  /** Revenue actual / WL1 HC (INR per WL1 HC). */
  revenue_productivity_inr?: number | null;
  /** Actual rev productivity ÷ target × 100 */
  rev_prod_ach_pct?: number | null;
  metrics_updated_at?: string | null;
  metrics_updated_by_user_id?: number | null;
  metrics_updated_by_email?: string | null;
};

export function financeStatsVm(raw: any) {
  if (!raw) return null;
  const revenue_budget_inr = normalizeMaybeNumeric(raw.revenue_budget);
  const revenue_actual_inr = normalizeMaybeNumeric(raw.revenue_actual);
  const total_cm_inr = normalizeMaybeNumeric(raw.total_cm);
  const total_unbilled_inr = normalizeMaybeNumeric(raw.total_unbilled);
  const total_collected_inr = normalizeMaybeNumeric(raw.total_collected);
  const total_bad_debt_inr = normalizeMaybeNumeric(raw.total_bad_debt);
  const total_collection_target_inr = normalizeMaybeNumeric(raw.total_collection_target);
  const collection_pending_inr = normalizeMaybeNumeric(raw.collection_pending);
  return {
    revenue_budget_inr,
    revenue_actual_inr,
    total_cm_inr,
    total_unbilled_inr,
    total_collected_inr,
    total_bad_debt_inr,
    total_collection_target_inr,
    collection_pending_inr,
    rev_attainment: raw.rev_attainment ?? 0,
    collection_efficiency: raw.collection_efficiency ?? 0,
  };
}

function optionalRatio(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function financeRowsVm(rows: any[]): FinanceRowVm[] {
  return (rows || []).map((r) => ({
    id: r.id,
    project_id: r.project_id,
    month: r.month,
    month_sort: r.month_sort,
    account_name: r.account_name,
    vertical: r.vertical,
    project_head: r.project_head ?? null,
    practice_head: r.practice_head ?? null,
    rev_budget_inr: normalizeMaybeNumeric(r.rev_budget),
    rev_actual_inr: normalizeMaybeNumeric(r.rev_actual),
    rev_forecast_inr: normalizeMaybeNumeric(r.rev_forecast),
    cm_actual_inr: normalizeMaybeNumeric(r.cm_actual),
    cm_pct:
      r.cm_pct != null && Number.isFinite(Number(r.cm_pct))
        ? Number(r.cm_pct)
        : (() => {
            const cm = normalizeMaybeNumeric(r.cm_actual);
            const rev = normalizeMaybeNumeric(r.rev_actual);
            if (rev > 0) return Math.round((cm / rev) * 10000) / 100;
            return null;
          })(),
    unbilled_inr: normalizeMaybeNumeric(r.unbilled),
    collected_inr: normalizeMaybeNumeric(r.collected),
    bad_debt_inr: normalizeMaybeNumeric(r.bad_debt),
    collection_target_inr: normalizeMaybeNumeric(r.collection_target),
    collection_pending_inr: normalizeMaybeNumeric(r.collection_pending),
    attainment: r.attainment ?? 0,
    actual_headcount_wl1: normalizePlainNumber(r.actual_headcount_wl1),
    actual_headcount_overall: normalizePlainNumber(r.actual_headcount_overall),
    taggd_joiners: normalizePlainNumber(r.taggd_joiners),
    total_cost_inr: normalizeMaybeNumeric(r.total_cost_inr),
    taggd_joiner_productivity: optionalRatio(r.taggd_joiner_productivity),
    taggd_source_productivity: optionalRatio(r.taggd_source_productivity ?? r.taggd_joiner_productivity),
    ppc_inr: optionalRatio(r.ppc_inr),
    target_ppc_inr: optionalRatio(r.target_ppc_inr),
    ppc_ach_pct: optionalRatio(r.ppc_ach_pct),
    target_revenue_per_recruiter: optionalRatio(r.target_revenue_per_recruiter),
    revenue_productivity_inr: optionalRatio(r.revenue_productivity_inr),
    rev_prod_ach_pct: optionalRatio(r.rev_prod_ach_pct),
    metrics_updated_at: r.metrics_updated_at ?? null,
    metrics_updated_by_user_id:
      r.metrics_updated_by_user_id != null ? normalizePlainNumber(r.metrics_updated_by_user_id) : null,
    metrics_updated_by_email: r.metrics_updated_by_email ?? null,
  }));
}

