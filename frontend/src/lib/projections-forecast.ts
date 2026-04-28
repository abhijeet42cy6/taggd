/**
 * Portfolio-level forward views from `FinanceRowVm` history (ledger actuals).
 * Method: damped trend on revenue + trailing CM% and collection-to-revenue ratios.
 * This is a planning aid — not a substitute for official budget / forecast in the ledger.
 */
import type { FinanceRowVm } from "@/lib/view-models/finance";
import { parseMonthSort, fiscalYearStart } from "@/lib/dashboard-aggregates";

export type MonthlyAgg = {
  key: string;
  monthLabel: string;
  t: number;
  revActual: number;
  revBudget: number;
  revForecast: number;
  cmActual: number;
  collected: number;
  collectionTarget: number;
};

export type ForwardPoint = {
  key: string;
  monthLabel: string;
  isProjected: boolean;
  rev: number;
  revLow: number;
  revHigh: number;
  cm: number;
  cmPct: number | null;
  collected: number;
  collectionTarget: number;
};

const BAND = 0.12;

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function labelMonth(d: Date): string {
  return d.toLocaleString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export function buildMonthlySeries(rows: FinanceRowVm[]): MonthlyAgg[] {
  const m = new Map<
    string,
    {
      t: number;
      revA: number;
      revB: number;
      revF: number;
      cm: number;
      coll: number;
      ct: number;
    }
  >();
  for (const r of rows) {
    const d = parseMonthSort(r.month_sort);
    if (!d) continue;
    const k = monthKey(d);
    const cur = m.get(k) || {
      t: d.getTime(),
      revA: 0,
      revB: 0,
      revF: 0,
      cm: 0,
      coll: 0,
      ct: 0,
    };
    cur.revA += r.rev_actual_inr;
    cur.revB += r.rev_budget_inr;
    cur.revF += r.rev_forecast_inr;
    cur.cm += r.cm_actual_inr;
    cur.coll += r.collected_inr ?? 0;
    cur.ct += r.collection_target_inr;
    m.set(k, cur);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => ({
      key: k,
      monthLabel: labelMonth(new Date(v.t)),
      t: v.t,
      revActual: v.revA,
      revBudget: v.revB,
      revForecast: v.revF,
      cmActual: v.cm,
      collected: v.coll,
      collectionTarget: v.ct,
    }));
}

/**
 * @param monthsAhead 1–6 typical
 */
export function projectForwardFromHistory(
  series: MonthlyAgg[],
  monthsAhead: number,
  opts?: { fyStartForContext?: number },
): {
  history: ForwardPoint[];
  forward: ForwardPoint[];
  combined: ForwardPoint[];
  methodNote: string;
} {
  const minPts = 4;
  if (series.length < minPts) {
    return {
      history: [],
      forward: [],
      combined: [],
      methodNote:
        `Need at least ${minPts} distinct months of ledger history in the current filter. Upload or widen scope (region, account).`,
    };
  }

  const sorted = [...series].sort((a, b) => a.t - b.t);
  const last = sorted[sorted.length - 1];
  const lastN = Math.min(6, sorted.length);
  const tail = sorted.slice(-lastN);
  const revs = tail.map((x) => x.revActual);
  let momAvg = 0;
  for (let i = 1; i < revs.length; i++) {
    const prev = revs[i - 1];
    if (prev > 0) momAvg += (revs[i] - prev) / prev;
  }
  if (revs.length > 1) {
    momAvg /= revs.length - 1;
  }
  const growth = Math.max(-0.2, Math.min(0.25, momAvg * 0.75));

  let cmRatio = 0;
  let collRatio = 0;
  let revSum = 0;
  for (const p of tail) {
    if (p.revActual > 0) {
      cmRatio += p.cmActual / p.revActual;
      collRatio += p.collected / p.revActual;
      revSum += 1;
    }
  }
  if (revSum > 0) {
    cmRatio /= revSum;
    collRatio /= revSum;
  } else {
    cmRatio = 0.15;
    collRatio = 0.85;
  }

  const nextMonthDate = (from: Date, add: number) => {
    const y = from.getUTCFullYear();
    const mo = from.getUTCMonth() + add;
    return new Date(Date.UTC(y, mo, 1));
  };

  const base = new Date(last.t);
  const history: ForwardPoint[] = sorted.map((p) => {
    const cmPct = p.revActual > 0 ? (p.cmActual / p.revActual) * 100 : null;
    return {
      key: p.key,
      monthLabel: p.monthLabel,
      isProjected: false,
      rev: p.revActual,
      revLow: p.revActual * (1 - BAND),
      revHigh: p.revActual * (1 + BAND),
      cm: p.cmActual,
      cmPct,
      collected: p.collected,
      collectionTarget: p.collectionTarget,
    };
  });

  const forward: ForwardPoint[] = [];
  let rPrev = last.revActual;
  for (let h = 1; h <= monthsAhead; h++) {
    const d = nextMonthDate(base, h);
    rPrev = Math.max(0, rPrev * (1 + growth));
    const k = monthKey(d);
    const cm = rPrev * cmRatio;
    const coll = rPrev * collRatio;
    const cmPct = rPrev > 0 ? (cm / rPrev) * 100 : null;
    forward.push({
      key: k,
      monthLabel: labelMonth(d),
      isProjected: true,
      rev: rPrev,
      revLow: rPrev * (1 - BAND),
      revHigh: rPrev * (1 + BAND),
      cm,
      cmPct,
      collected: coll,
      collectionTarget: coll * 1.05,
    });
  }

  const fy = opts?.fyStartForContext;
  const methodNote =
    `Based on the last ${lastN} month(s): damped MoM growth ${(growth * 100).toFixed(1)}% (capped), ` +
    `implied CM ratio ${(cmRatio * 100).toFixed(1)}% of revenue, ` +
    `collection ratio ${(collRatio * 100).toFixed(1)}% of revenue. ` +
    (fy != null
      ? `Context FY starts Apr ${fy} (Indian FY). Shaded band ±${(BAND * 100).toFixed(0)}% on revenue for uncertainty.`
      : `Shaded band ±${(BAND * 100).toFixed(0)}% on revenue for uncertainty.`);

  return { history, forward, combined: [...history, ...forward], methodNote };
}

/** FY-filtered row count helper for empty states */
export function countRowsInFy(rows: FinanceRowVm[], fyStart: number): number {
  let n = 0;
  for (const r of rows) {
    const d = parseMonthSort(r.month_sort);
    if (d && fiscalYearStart(d) === fyStart) n++;
  }
  return n;
}

/** If `ids` is non-empty, keep only rows for those `project_id`s; otherwise return all (portfolio in scope). */
export function filterRowsByProjectIds(rows: FinanceRowVm[], ids: number[]): FinanceRowVm[] {
  if (!ids.length) return rows;
  const set = new Set(ids);
  return rows.filter((r) => r.project_id != null && set.has(r.project_id));
}

/** Chart x-axis: how much **history** to show (forward horizon is separate). */
export type ChartTimeRange = "6m" | "12m" | "18m" | "24m" | "all";

const RANGE_MONTHS: Record<Exclude<ChartTimeRange, "all">, number> = {
  "6m": 6,
  "12m": 12,
  "18m": 18,
  "24m": 24,
};

function addUtcMonths(utcMs: number, delta: number): number {
  const d = new Date(utcMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1);
}

/** `YYYY-MM` → UTC first of month. */
function tFromYyyyMm(key: string): number {
  const p = (key || "").split("-");
  if (p.length < 2) return NaN;
  const y = Number(p[0]);
  const mo = Number(p[1]);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return NaN;
  return Date.UTC(y, mo - 1, 1);
}

/**
 * Keep monthly points whose `t` is on or after (lastMonthInData − N months).
 * "all" = unchanged.
 */
export function filterMonthlyByChartRange(monthly: MonthlyAgg[], range: ChartTimeRange): MonthlyAgg[] {
  if (range === "all" || monthly.length === 0) return monthly;
  const n = RANGE_MONTHS[range as Exclude<ChartTimeRange, "all">];
  const sorted = [...monthly].sort((a, b) => a.t - b.t);
  const lastT = sorted[sorted.length - 1].t;
  const cutoff = addUtcMonths(lastT, -n);
  return sorted.filter((m) => m.t >= cutoff);
}

export type ComparisonRow = {
  key: string;
  name: string;
  revA: number | null;
  revB: number | null;
  predA: number | null;
  predB: number | null;
  isFuture: boolean;
};

/**
 * Chart window for compare overlay: show last N **historical** months (by `lastHistoryMonthKey`)
 * and always keep projection months (`isFuture`).
 */
export function filterComparisonByChartRange(
  rows: ComparisonRow[],
  range: ChartTimeRange,
  lastHistoryMonthKey: string | null,
): ComparisonRow[] {
  if (range === "all" || !lastHistoryMonthKey || rows.length === 0) return rows;
  const n = RANGE_MONTHS[range as Exclude<ChartTimeRange, "all">];
  const tLast = tFromYyyyMm(lastHistoryMonthKey);
  if (Number.isNaN(tLast)) return rows;
  const cutoff = addUtcMonths(tLast, -n);
  return rows.filter((r) => {
    if (r.isFuture) return true;
    const t = tFromYyyyMm(r.key);
    return !Number.isNaN(t) && t >= cutoff;
  });
}

/**
 * Merge two monthly+forward series onto one chart timeline (₹ Cr scale).
 * Uses month label as `name` for display; `isFuture` when either side is projection-only.
 */
export function buildDualScenarioChartData(
  monthlyA: MonthlyAgg[],
  forwardA: ForwardPoint[],
  monthlyB: MonthlyAgg[],
  forwardB: ForwardPoint[],
): ComparisonRow[] {
  const byKey = new Map<
    string,
    { name: string; isFuture: boolean; aAct?: number; bAct?: number; aPred?: number; bPred?: number }
  >();

  const cr = (v: number) => v / 1e7;

  for (const m of monthlyA) {
    if (!byKey.has(m.key)) {
      byKey.set(m.key, { name: m.monthLabel, isFuture: false });
    }
    const x = byKey.get(m.key)!;
    x.aAct = cr(m.revActual);
  }
  for (const m of monthlyB) {
    if (!byKey.has(m.key)) {
      byKey.set(m.key, { name: m.monthLabel, isFuture: false });
    }
    const x = byKey.get(m.key)!;
    x.bAct = cr(m.revActual);
  }
  for (const f of forwardA) {
    if (!byKey.has(f.key)) {
      byKey.set(f.key, { name: f.monthLabel, isFuture: true });
    } else {
      byKey.get(f.key)!.isFuture = true;
    }
    const x = byKey.get(f.key)!;
    x.aPred = cr(f.rev);
  }
  for (const f of forwardB) {
    if (!byKey.has(f.key)) {
      byKey.set(f.key, { name: f.monthLabel, isFuture: true });
    } else {
      byKey.get(f.key)!.isFuture = true;
    }
    const x = byKey.get(f.key)!;
    x.bPred = cr(f.rev);
  }

  return [...byKey.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, v]) => ({
      key,
      name: v.name,
      isFuture: v.isFuture,
      revA: v.aAct ?? null,
      revB: v.bAct ?? null,
      predA: v.aPred ?? null,
      predB: v.bPred ?? null,
    }));
}

export function sumForwardRevenueInr(forward: ForwardPoint[]): { total: number; lastMonth: number } {
  const total = forward.reduce((s, p) => s + p.rev, 0);
  const lastMonth = forward.length ? forward[forward.length - 1].rev : 0;
  return { total, lastMonth };
}

export type RevChartPoint = {
  name: string;
  revActual: number | null;
  revPred: number | null;
  officialFcst: number | null;
};

export function buildRevenueChartData(
  monthly: MonthlyAgg[],
  forward: ForwardPoint[],
  historyRange: ChartTimeRange,
): RevChartPoint[] {
  const hist = filterMonthlyByChartRange(monthly, historyRange);
  const a: RevChartPoint[] = hist.map((m) => ({
    name: m.monthLabel,
    revActual: m.revActual / 1e7,
    revPred: null,
    officialFcst: m.revForecast > 0 ? m.revForecast / 1e7 : null,
  }));
  const b: RevChartPoint[] = forward.map((p) => ({
    name: p.monthLabel,
    revActual: null,
    revPred: p.rev / 1e7,
    officialFcst: null,
  }));
  return [...a, ...b];
}

/**
 * CM & cash: show **trailing** history in ₹ Cr (from ledger) + forward implied path.
 */
export function buildCmCollChartData(
  monthly: MonthlyAgg[],
  forward: ForwardPoint[],
  historyRange: ChartTimeRange,
): { name: string; cm: number; collected: number }[] {
  const hist = filterMonthlyByChartRange(monthly, historyRange);
  const a = hist.map((m) => ({
    name: m.monthLabel,
    cm: m.cmActual / 1e7,
    collected: m.collected / 1e7,
  }));
  const b = forward.map((p) => ({
    name: p.monthLabel,
    cm: p.cm / 1e7,
    collected: p.collected / 1e7,
  }));
  return [...a, ...b];
}

export function lastMonthKeyFromSeries(monthly: MonthlyAgg[]): string | null {
  if (monthly.length === 0) return null;
  const sorted = [...monthly].sort((a, b) => a.t - b.t);
  return sorted[sorted.length - 1].key;
}
