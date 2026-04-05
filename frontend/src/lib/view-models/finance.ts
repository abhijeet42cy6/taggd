import { normalizeMaybeNumeric, normalizePlainNumber } from "@/lib/finance-units";

export type FinanceRowVm = {
  id: number;
  project_id?: number;
  month: string;
  month_sort?: string;
  account_name: string;
  vertical: string;
  rev_budget_inr: number;
  rev_actual_inr: number;
  rev_forecast_inr: number;
  cm_actual_inr: number;
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
  /** Taggd joiner / WL1 HC */
  taggd_joiner_productivity?: number | null;
  /** Total cost / Overall HC (INR per HC). */
  ppc_inr?: number | null;
  /** Revenue actual / WL1 HC (INR per WL1 HC). */
  revenue_productivity_inr?: number | null;
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
    rev_budget_inr: normalizeMaybeNumeric(r.rev_budget),
    rev_actual_inr: normalizeMaybeNumeric(r.rev_actual),
    rev_forecast_inr: normalizeMaybeNumeric(r.rev_forecast),
    cm_actual_inr: normalizeMaybeNumeric(r.cm_actual),
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
    ppc_inr: optionalRatio(r.ppc_inr),
    revenue_productivity_inr: optionalRatio(r.revenue_productivity_inr),
  }));
}

