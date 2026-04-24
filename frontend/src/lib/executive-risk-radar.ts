/**
 * Executive Risk Radar — per-client health from **available** finance ledger, forecast, revenue, SLA, WFM only.
 * - No requisition/tracker stats in the score.
 * - No neutral penalty for missing data: each domain is `null` if insufficient data; composite reweights over non-null domains only.
 */
import type { FinanceRowVm } from "@/lib/view-models/finance";
import { aggregateFinanceFromRows } from "@/lib/dashboard-aggregates";

export type DomainRisk = "OK" | "MED" | "HIGH";

/** Base weights renormalized over domains with data. */
const W_REVENUE = 0.2;
const W_FINANCE = 0.25;
const W_FORECAST = 0.2;
const W_SLA = 0.2;
const W_WFM = 0.15;

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

/** Budget vs actual revenue (ledger). */
function scoreRevenue(agg: FinanceAgg | null): number | null {
  if (!agg) return null;
  const b = agg.revenue_budget_inr;
  const a = agg.revenue_actual_inr;
  if (b > 0) return clamp((a / b) * 100);
  return null;
}

/** CM%, collections, unbilled / bad-debt stress (excludes top-line rev attainment). */
function scoreFinanceOps(agg: FinanceAgg | null): number | null {
  if (!agg) return null;
  const a = agg.revenue_actual_inr;
  const b = agg.revenue_budget_inr;
  if (a <= 0 && b <= 0) return null;
  const cmPct = a > 0 ? (agg.total_cm_inr / a) * 100 : 0;
  const cmScore = a > 0 ? clamp((cmPct / CM_TARGET_PCT) * 100) : 50;
  const collScore =
    agg.total_collection_target_inr > 0
      ? clamp((agg.total_collected_inr / agg.total_collection_target_inr) * 100)
      : null;
  const unbPct = a > 0 ? (agg.total_unbilled_inr / a) * 100 : 0;
  const denom = agg.total_collected_inr + agg.total_bad_debt_inr;
  const bdPct = denom > 0 ? (agg.total_bad_debt_inr / denom) * 100 : 0;
  const unbPenalty = clamp(unbPct * 0.35, 0, 30);
  const bdPenalty = clamp(bdPct * 0.5, 0, 25);
  const stress = 100 - unbPenalty - bdPenalty;
  if (collScore == null) {
    if (a <= 0) return null;
    return clamp(Math.round(cmScore * 0.6 + stress * 0.4));
  }
  if (a <= 0) return clamp(Math.round(collScore * 0.5 + stress * 0.5));
  return clamp(Math.round(cmScore * 0.35 + collScore * 0.35 + stress * 0.3));
}

/** Actual vs **forecast** only (no budget fallback). */
function scoreForecast(agg: FinanceAgg | null): number | null {
  if (!agg) return null;
  const f = agg.revenue_forecast_inr;
  const a = agg.revenue_actual_inr;
  if (f == null || f <= 0) return null;
  return clamp((a / f) * 100);
}

function scoreSlaForProject(
  slaRows: Array<{ project_id: number; status: string }>,
  projectId: number,
): number | null {
  const rows = slaRows.filter((r) => r.project_id === projectId);
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

function scoreWfmForProject(
  wfmRows: Array<{
    project_id: number;
    ideal_hc: number | null;
    actual_hc_total: number | null;
    reporting_date: string | null;
  }>,
  projectId: number,
): number | null {
  const rows = wfmRows.filter((r) => r.project_id === projectId);
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => {
    const ta = a.reporting_date ? new Date(a.reporting_date).getTime() : 0;
    const tb = b.reporting_date ? new Date(b.reporting_date).getTime() : 0;
    return tb - ta;
  });
  const b = sorted[0];
  const ideal = Number(b.ideal_hc ?? 0);
  const actual = Number(b.actual_hc_total ?? 0);
  if (ideal <= 0) return null;
  const fill = (actual / ideal) * 100;
  if (fill >= 95 && fill <= 105) return 92;
  if (fill >= 85) return 82;
  if (fill >= 70) return 68;
  if (fill >= 55) return 55;
  return clamp(Math.round(fill * 0.9));
}

function compositeFromAvailable(
  s: { revenue: number | null; finance: number | null; forecast: number | null; sla: number | null; wfm: number | null },
): number | null {
  const w = {
    revenue: W_REVENUE,
    finance: W_FINANCE,
    forecast: W_FORECAST,
    sla: W_SLA,
    wfm: W_WFM,
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
    revenue: number | null;
    finance: number | null;
    forecast: number | null;
    sla: number | null;
    wfm: number | null;
  };
  /** Renormalized over available domains; null if no domain has data. */
  composite: number | null;
  risk: DomainRisk | null;
  levels: {
    revenue: DomainRisk | null;
    finance: DomainRisk | null;
    forecast: DomainRisk | null;
    sla: DomainRisk | null;
    wfm: DomainRisk | null;
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
    ["Revenue", row.scores.revenue],
    ["Finance", row.scores.finance],
    ["Forecast", row.scores.forecast],
    ["SLA", row.scores.sla],
    ["WFM", row.scores.wfm],
  ].filter((x): x is [string, number] => x[1] != null);
  if (!entries.length) return "—";
  entries.sort((a, b) => a[1] - b[1]);
  return entries[0][0];
}

export function buildClientRiskRadarRows(
  clients: { id: number; name: string }[],
  kpiRows: FinanceRowVm[],
  slaData: Array<{ project_id: number; status: string }>,
  wfmData: Array<{
    project_id: number;
    ideal_hc: number | null;
    actual_hc_total: number | null;
    reporting_date: string | null;
  }>,
  /** Optional: requisition rollups for drawer (not used in score). */
  pipelineById: Map<
    number,
    { positions: number; closed: number; active: number; on_hold: number; pipeline: number; revenue: number }
  >,
): ClientRiskRadarRow[] {
  const out: ClientRiskRadarRow[] = [];
  for (const c of clients) {
    const sub = kpiRows.filter((r) => r.project_id === c.id);
    const agg = sub.length ? aggregateFinanceFromRows(sub) : null;

    const revenue = scoreRevenue(agg);
    const finance = scoreFinanceOps(agg);
    const forecast = scoreForecast(agg);
    const sla = scoreSlaForProject(slaData, c.id);
    const wfm = scoreWfmForProject(wfmData, c.id);

    const scores = { revenue, finance, forecast, sla, wfm };
    const composite = compositeFromAvailable(scores);
    const risk = riskFromComposite(composite);
    const levels = {
      revenue: riskFromScore(revenue),
      finance: riskFromScore(finance),
      forecast: riskFromScore(forecast),
      sla: riskFromScore(sla),
      wfm: riskFromScore(wfm),
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
