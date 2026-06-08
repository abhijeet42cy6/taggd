/**
 * Executive Risk Radar — per-client health from finance ledger + SLA only.
 * Domains: budget revenue attainment, actual revenue YoY, CM%, SLA Met %.
 * Missing data is excluded from composite (reweighted), not penalized.
 */
import type { FinanceRowVm } from "@/lib/view-models/finance";
import { aggregateFinanceFromRows } from "@/lib/dashboard-aggregates";

export type DomainRisk = "OK" | "MED" | "HIGH";

const W_BUDGET_REV = 0.3;
const W_ACTUAL_REV = 0.25;
const W_CM = 0.25;
const W_SLA = 0.2;

const CM_TARGET_PCT = 35;

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

function riskFromScore(score: number | null): DomainRisk | null {
  if (score == null) return null;
  if (score < 45) return "HIGH";
  if (score < 70) return "MED";
  return "OK";
}

/** Mirror `bucket_sla_rag` in backend `sla_period.py`. */
function bucketSlaRag(rag: string | null | undefined): "met" | "not_met" | "not_reported" {
  const s = (rag || "").trim().toLowerCase();
  if (!s || s === "nan" || s === "none" || s === "-" || s === "n/a" || s === "not reported" || s === "no data" || s === "grey" || s === "gray")
    return "not_reported";
  if (s === "met" || s === "green" || s === "rag_g") return "met";
  if (
    s.includes("not met") ||
    ["red", "amber", "yellow", "rag_r", "rag_a", "breach", "breached", "not_met"].includes(s)
  )
    return "not_met";
  return "not_reported";
}

type FinanceAgg = NonNullable<ReturnType<typeof aggregateFinanceFromRows>>;

/** Actual ÷ budget revenue (ledger). */
function scoreBudgetRevenue(agg: FinanceAgg | null): number | null {
  if (!agg) return null;
  const b = agg.revenue_budget_inr;
  const a = agg.revenue_actual_inr;
  if (b > 0) return clamp((a / b) * 100);
  return null;
}

function normAccount(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function financeRowsForClient(
  rows: FinanceRowVm[],
  projectId: number,
  accountName: string,
): FinanceRowVm[] {
  const acc = normAccount(accountName);
  return rows.filter((r) => {
    if (r.project_id === projectId) return true;
    if (!acc) return false;
    return normAccount(r.account_name) === acc;
  });
}

/** Actual revenue vs prior FY actual (YoY index, 100 = flat). */
function scoreActualRevenueYoY(agg: FinanceAgg | null, priorActualInr: number | null | undefined): number | null {
  if (!agg) return null;
  const a = agg.revenue_actual_inr;
  const p = priorActualInr ?? 0;
  if (a <= 0 || p <= 0) return null;
  return clamp((a / p) * 100);
}

/** CM% vs 35% target. */
function scoreCmPct(agg: FinanceAgg | null): number | null {
  if (!agg) return null;
  const a = agg.revenue_actual_inr;
  if (a <= 0) return null;
  const cmPct = (agg.total_cm_inr / a) * 100;
  return clamp((cmPct / CM_TARGET_PCT) * 100);
}

function scoreSlaForClient(
  slaRows: Array<{ project_id: number; account_name?: string; status: string }>,
  projectId: number,
  accountName: string,
): number | null {
  const accNorm = normAccount(accountName);
  const rows = slaRows.filter((r) => {
    if (r.project_id === projectId) return true;
    if (!accNorm) return false;
    return normAccount(r.account_name) === accNorm;
  });
  if (!rows.length) return null;
  let met = 0;
  let notMet = 0;
  for (const r of rows) {
    const b = bucketSlaRag(r.status);
    if (b === "met") met++;
    else if (b === "not_met") notMet++;
  }
  const dec = met + notMet;
  if (dec === 0) return null;
  return clamp(Math.round((met / dec) * 100));
}

function compositeFromAvailable(s: {
  budgetRev: number | null;
  actualRev: number | null;
  cm: number | null;
  sla: number | null;
}): number | null {
  const w = {
    budgetRev: W_BUDGET_REV,
    actualRev: W_ACTUAL_REV,
    cm: W_CM,
    sla: W_SLA,
  } as const;
  type K = keyof typeof w;
  let acc = 0;
  let wsum = 0;
  (Object.keys(w) as K[]).forEach((k) => {
    const v = s[k];
    if (v != null && Number.isFinite(v)) {
      acc += v * w[k];
      wsum += w[k];
    }
  });
  if (wsum === 0) return null;
  return Math.round(acc / wsum);
}

function riskFromComposite(c: number | null): DomainRisk | null {
  if (c == null) return null;
  return riskFromScore(c) as DomainRisk;
}

export type ClientRiskRadarRow = {
  id: number;
  name: string;
  scores: {
    budgetRev: number | null;
    actualRev: number | null;
    cm: number | null;
    sla: number | null;
  };
  /** Renormalized over available domains; null if no domain has data. */
  composite: number | null;
  risk: DomainRisk | null;
  levels: {
    budgetRev: DomainRisk | null;
    actualRev: DomainRisk | null;
    cm: DomainRisk | null;
    sla: DomainRisk | null;
  };
  /** Optional pipeline context (requisitions) for drawer only — not used in scoring. */
  positions: number;
  closed: number;
  active: number;
  on_hold: number;
  pipeline: number;
  revenue: number;
};

export function worstDomainName(row: ClientRiskRadarRow): string {
  const entries: [string, number][] = [
    ["Budget rev", row.scores.budgetRev],
    ["Actual rev", row.scores.actualRev],
    ["CM%", row.scores.cm],
    ["SLA", row.scores.sla],
  ].filter((x): x is [string, number] => x[1] != null);
  if (!entries.length) return "—";
  entries.sort((a, b) => a[1] - b[1]);
  return entries[0][0];
}

export function buildClientRiskRadarRows(
  clients: { id: number; name: string; accountName: string }[],
  kpiRows: FinanceRowVm[],
  priorKpiRows: FinanceRowVm[],
  slaData: Array<{ project_id: number; account_name?: string; status: string }>,
  /** Optional: requisition rollups for drawer (not used in score). */
  pipelineById: Map<
    number,
    { positions: number; closed: number; active: number; on_hold: number; pipeline: number; revenue: number }
  >,
): ClientRiskRadarRow[] {
  const out: ClientRiskRadarRow[] = [];
  for (const c of clients) {
    const sub = financeRowsForClient(kpiRows, c.id, c.accountName);
    const agg = sub.length ? aggregateFinanceFromRows(sub) : null;

    const priorSub = financeRowsForClient(priorKpiRows, c.id, c.accountName);
    const priorAgg = priorSub.length ? aggregateFinanceFromRows(priorSub) : null;

    const budgetRev = scoreBudgetRevenue(agg);
    const actualRev = scoreActualRevenueYoY(agg, priorAgg?.revenue_actual_inr);
    const cm = scoreCmPct(agg);
    const sla = scoreSlaForClient(slaData, c.id, c.accountName);

    const scores = { budgetRev, actualRev, cm, sla };
    const composite = compositeFromAvailable(scores);
    const risk = riskFromComposite(composite);
    const levels = {
      budgetRev: riskFromScore(budgetRev),
      actualRev: riskFromScore(actualRev),
      cm: riskFromScore(cm),
      sla: riskFromScore(sla),
    };

    const pl = pipelineById.get(c.id);
    out.push({
      id: c.id,
      name: c.name,
      scores,
      composite,
      risk,
      levels,
      positions: pl?.positions ?? 0,
      closed: pl?.closed ?? 0,
      active: pl?.active ?? 0,
      on_hold: pl?.on_hold ?? 0,
      pipeline: pl?.pipeline ?? 0,
      revenue: pl?.revenue ?? 0,
    });
  }

  return out.sort((a, b) => {
    if (a.composite == null && b.composite == null) return a.name.localeCompare(b.name);
    if (a.composite == null) return 1;
    if (b.composite == null) return -1;
    if (a.composite !== b.composite) return a.composite - b.composite;
    return a.name.localeCompare(b.name);
  });
}
