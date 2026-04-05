import type { Project } from "@/lib/api";
import type { FinanceRowVm } from "@/lib/view-models/finance";

/** Indian FY: Apr → Mar. FY label "2025" = FY2025-26 (Apr 2025 – Mar 2026). */
export type DashboardFilters = {
  period: "all" | "Q1" | "Q2" | "Q3" | "Q4";
  month: string; // "all" | FY_MONTHS
  region: string;
  subRegion: string;
  regionHead: string;
  practiceHead: string;
  vertical: string;
  account: string;
};

export const FY_MONTH_ORDER = [
  "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar",
] as const;

export const DEFAULT_DASHBOARD_FILTERS: DashboardFilters = {
  period: "all",
  month: "all",
  region: "all",
  subRegion: "all",
  regionHead: "all",
  practiceHead: "all",
  vertical: "all",
  account: "all",
};

export function fiscalYearStart(d: Date): number {
  const y = d.getFullYear();
  const m = d.getMonth();
  return m >= 3 ? y : y - 1;
}

/** 0 = Apr … 11 = Mar */
export function monthIndexInFY(d: Date): number {
  const m = d.getMonth();
  if (m >= 3) return m - 3;
  return m + 9;
}

export function parseMonthSort(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function norm(s: string | undefined | null): string {
  return (s || "").trim().toLowerCase();
}

function matches(filterVal: string, val: string | undefined): boolean {
  if (!filterVal || filterVal === "all") return true;
  return norm(val) === norm(filterVal);
}

function matchesContains(filterVal: string, val: string | undefined): boolean {
  if (!filterVal || filterVal === "all") return true;
  const v = norm(val);
  const f = norm(filterVal);
  return v.includes(f) || f.includes(v);
}

export function filterFinanceRows(
  rows: FinanceRowVm[],
  projects: Project[],
  f: DashboardFilters,
): FinanceRowVm[] {
  const pmap = new Map(projects.map((p) => [p.id, p]));
  return rows.filter((row) => {
    const p = row.project_id != null ? pmap.get(row.project_id) : undefined;
    const region = p?.region;
    const vertical = p?.vertical ?? row.vertical;
    const account = p?.account_name ?? row.account_name;
    if (!matches(f.region, region)) return false;
    if (!matchesContains(f.subRegion, p?.sub_region ?? p?.category)) return false;
    if (!matches(f.regionHead, p?.practice_head)) return false;
    if (!matches(f.practiceHead, p?.be_spoc)) return false;
    if (!matches(f.vertical, vertical)) return false;
    if (!matchesContains(f.account, account)) return false;
    const d = parseMonthSort(row.month_sort);
    if (!d) return true;
    const mi = monthIndexInFY(d);
    if (f.month !== "all") {
      if (f.month !== FY_MONTH_ORDER[mi]) return false;
    }
    if (f.period !== "all") {
      const q = f.period;
      if (q === "Q1" && (mi < 0 || mi > 2)) return false;
      if (q === "Q2" && (mi < 3 || mi > 5)) return false;
      if (q === "Q3" && (mi < 6 || mi > 8)) return false;
      if (q === "Q4" && (mi < 9 || mi > 11)) return false;
    }
    return true;
  });
}

export type YoYRevPoint = {
  month: string;
  budget: number;
  actual: number;
  forecast: number;
  priorActual: number;
};

export type YoYCmPoint = {
  month: string;
  actualPct: number;
  priorActualPct: number;
  /** Reference line (typical CM% target). */
  budgetRefPct: number;
};

/** Aggregate by FY start year + month-in-FY; amounts in ₹ (same as row fields). */
export function buildYoYRevenueSeries(
  rows: FinanceRowVm[],
  primaryFyStart: number,
): { revenue: YoYRevPoint[]; cm: YoYCmPoint[] } {
  type Agg = { b: number; a: number; f: number; cm: number; ra: number };
  const bucket = new Map<string, Agg>();

  for (const r of rows) {
    const d = parseMonthSort(r.month_sort);
    if (!d) continue;
    const fy = fiscalYearStart(d);
    const mi = monthIndexInFY(d);
    const key = `${fy}-${mi}`;
    const cur = bucket.get(key) || { b: 0, a: 0, f: 0, cm: 0, ra: 0 };
    cur.b += r.rev_budget_inr;
    cur.a += r.rev_actual_inr;
    cur.f += r.rev_forecast_inr;
    cur.cm += r.cm_actual_inr;
    cur.ra += r.rev_actual_inr;
    bucket.set(key, cur);
  }

  const revenue: YoYRevPoint[] = [];
  const cm: YoYCmPoint[] = [];

  for (let mi = 0; mi < 12; mi++) {
    const label = FY_MONTH_ORDER[mi];
    const pk = `${primaryFyStart}-${mi}`;
    const prevK = `${primaryFyStart - 1}-${mi}`;
    const cur = bucket.get(pk) || { b: 0, a: 0, f: 0, cm: 0, ra: 0 };
    const prev = bucket.get(prevK) || { b: 0, a: 0, f: 0, cm: 0, ra: 0 };
    revenue.push({
      month: label,
      budget: cur.b / 1e7,
      actual: cur.a / 1e7,
      forecast: cur.f / 1e7,
      priorActual: prev.a / 1e7,
    });
    const cmPct = cur.ra > 0 ? (cur.cm / cur.ra) * 100 : 0;
    const prevCmPct = prev.ra > 0 ? (prev.cm / prev.ra) * 100 : 0;
    cm.push({
      month: label,
      actualPct: Math.round(cmPct * 10) / 10,
      priorActualPct: Math.round(prevCmPct * 10) / 10,
      budgetRefPct: 35,
    });
  }

  return { revenue, cm };
}

export type RegionBarDatum = { region: string; actual: number; budget: number };

export function buildRegionalRevenue(rows: FinanceRowVm[], projects: Project[]): RegionBarDatum[] {
  const pmap = new Map(projects.map((p) => [p.id, p]));
  const by: Record<string, { a: number; b: number }> = {};
  for (const r of rows) {
    const p = r.project_id != null ? pmap.get(r.project_id) : undefined;
    const reg = (p?.region || "Unknown").trim() || "Unknown";
    if (!by[reg]) by[reg] = { a: 0, b: 0 };
    by[reg].a += r.rev_actual_inr;
    by[reg].b += r.rev_budget_inr;
  }
  return Object.entries(by)
    .map(([region, v]) => ({
      region,
      actual: v.a / 1e7,
      budget: v.b / 1e7,
    }))
    .sort((x, y) => y.actual - x.actual);
}

export type ExecTableRow = {
  metric: string;
  budget: string;
  forecast: string;
  actual: string;
  varBudget: string;
  varForecast: string;
  priorActual: string;
  yoy: string;
};

export function buildExecutiveSummary(
  finance: {
    revenue_budget_inr: number;
    revenue_actual_inr: number;
    total_cm_inr: number;
    total_unbilled_inr: number;
    total_bad_debt_inr: number;
    total_collected_inr: number;
    total_collection_target_inr: number;
    rev_attainment: number;
  } | null,
  priorFYRevenueActualCr: number,
): ExecTableRow[] {
  if (!finance) return [];
  const revB = finance.revenue_budget_inr / 1e7;
  const revA = finance.revenue_actual_inr / 1e7;
  const revF = revB;
  const vb = revB > 0 ? ((revA / revB) - 1) * 100 : 0;
  const cmB = revB * 0.35;
  const cmA = finance.total_cm_inr / 1e7;
  const cmPctA = revA > 0 ? (cmA / revA) * 100 : 0;
  const cmPctB = 35;
  const collT = finance.total_collection_target_inr / 1e7;
  const collA = finance.total_collected_inr / 1e7;
  const unb = finance.total_unbilled_inr / 1e7;
  const bd = finance.total_bad_debt_inr / 1e7;
  const yoyRev = priorFYRevenueActualCr > 0 ? ((revA - priorFYRevenueActualCr) / priorFYRevenueActualCr) * 100 : 0;

  const fmt = (n: number) => `₹${n.toFixed(2)} Cr`;
  const fmtPct = (n: number) => `${n >= 0 ? "" : ""}${n.toFixed(1)}%`;

  return [
    {
      metric: "Revenue",
      budget: fmt(revB),
      forecast: fmt(revF),
      actual: fmt(revA),
      varBudget: fmtPct(vb),
      varForecast: "—",
      priorActual: fmt(priorFYRevenueActualCr),
      yoy: fmtPct(yoyRev),
    },
    {
      metric: "CM %",
      budget: `${cmPctB.toFixed(1)}%`,
      forecast: `${cmPctB.toFixed(1)}%`,
      actual: `${cmPctA.toFixed(2)}%`,
      varBudget: fmtPct(cmPctA - cmPctB),
      varForecast: "—",
      priorActual: "—",
      yoy: "—",
    },
    {
      metric: "Collection",
      budget: fmt(collT),
      forecast: fmt(collT),
      actual: fmt(collA),
      varBudget: collT > 0 ? fmtPct(((collA / collT) - 1) * 100) : "—",
      varForecast: "—",
      priorActual: "—",
      yoy: "—",
    },
    {
      metric: "Unbilled",
      budget: "—",
      forecast: "—",
      actual: fmt(unb),
      varBudget: revA > 0 ? fmtPct((unb / revA) * 100) + " of Rev" : "—",
      varForecast: "—",
      priorActual: "—",
      yoy: "—",
    },
    {
      metric: "Bad debt",
      budget: "—",
      forecast: "—",
      actual: fmt(bd),
      varBudget: collA > 0 ? fmtPct((bd / collA) * 100) + " of Coll." : "—",
      varForecast: "—",
      priorActual: "—",
      yoy: "—",
    },
  ];
}

/** Sum prior FY actual revenue (Cr) from YoY series for comparison. */
export function sumPriorFYActual(yoy: YoYRevPoint[]): number {
  return yoy.reduce((s, p) => s + p.priorActual, 0);
}

/** Sum ledger rows (same units as API: INR). */
export function aggregateFinanceFromRows(rows: FinanceRowVm[]): {
  revenue_budget_inr: number;
  revenue_actual_inr: number;
  total_cm_inr: number;
  total_unbilled_inr: number;
  total_bad_debt_inr: number;
  total_collected_inr: number;
  total_collection_target_inr: number;
  collection_pending_inr: number;
  rev_attainment: number;
  collection_efficiency: number;
} | null {
  if (!rows.length) return null;
  let revB = 0;
  let revA = 0;
  let cm = 0;
  let unb = 0;
  let bd = 0;
  let coll = 0;
  let ct = 0;
  for (const r of rows) {
    revB += r.rev_budget_inr;
    revA += r.rev_actual_inr;
    cm += r.cm_actual_inr;
    unb += r.unbilled_inr;
    bd += r.bad_debt_inr;
    coll += r.collected_inr ?? 0;
    ct += r.collection_target_inr;
  }
  const rev_attainment = revB > 0 ? (revA / revB) * 100 : 0;
  const collection_efficiency = coll + unb > 0 ? (coll / (coll + unb)) * 100 : 0;
  const collection_pending_inr = ct - coll;
  return {
    revenue_budget_inr: revB,
    revenue_actual_inr: revA,
    total_cm_inr: cm,
    total_unbilled_inr: unb,
    total_bad_debt_inr: bd,
    total_collected_inr: coll,
    total_collection_target_inr: ct,
    collection_pending_inr,
    rev_attainment,
    collection_efficiency,
  };
}
