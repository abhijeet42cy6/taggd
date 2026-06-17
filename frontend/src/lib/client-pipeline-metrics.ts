/** Client portal pipeline metrics — mirrors backend `client_pipeline_metrics.py` payload. */

export type PipelineCoverage = {
  joiners: number;
  with_diversity: number;
  with_source: number;
  with_offer_date: number;
  with_creation_date: number;
};

export type PipelineBucket = {
  wip: number;
  open: number;
  offered: number;
  ytj: number;
  joiners: number;
  offer_drops: number;
  cancelled: number;
  hold: number;
  total_demand: number;
  avg_ageing_days: number | null;
  median_ageing_days: number | null;
  avg_tto_days: number | null;
  median_tto_days: number | null;
  avg_ttf_days: number | null;
  median_ttf_days: number | null;
  diversity_pct: number | null;
  rpo_mix_pct: number | null;
  offer_drop_pct: number | null;
  oar_pct: number | null;
  jcr_pct: number | null;
  offered_total: number;
  coverage: PipelineCoverage;
};

export type PipelineSeriesRow = {
  month: string;
  opens_created: number;
  open_wip: number;
  cancelled: number;
  hold: number;
  offered: number;
  joiners: number;
  offer_drops: number;
  ytj_end: number;
  avg_tto_days: number | null;
  avg_ttf_days: number | null;
  female_hire_pct: number | null;
  aged_over_30: number;
  oar_pct: number | null;
  odr_pct: number | null;
  oar_stock_pct: number | null;
  jcr_stock_pct: number | null;
};

export type PipelineQuarterRow = {
  quarter: string;
  opens_created: number;
  open_wip: number;
  cancelled: number;
  hold: number;
  offered: number;
  joiners: number;
  offer_drops: number;
  aged_over_30: number;
  avg_tto_days: number | null;
  avg_ttf_days: number | null;
  female_hire_pct: number | null;
  oar_pct: number | null;
  odr_pct: number | null;
  oar_stock_pct: number | null;
  jcr_stock_pct: number | null;
};

export type AccountAgeingRow = {
  account: string;
  open: number;
  b_0_30: number;
  b_31_45: number;
  b_46_60: number;
  b_61_90: number;
  b_90_plus: number;
  oldest_days: number;
  risk: "low" | "medium" | "high";
};

export type FunnelQuarterRow = {
  quarter: string;
  sourced: number;
  screened: number;
  interviewed: number;
  offered: number;
  joined: number;
  req_count: number;
};

export type SourceEffectivenessRow = {
  label: string;
  offers: number;
  joiners: number;
  otj_pct: number | null;
};

export type PipelineFilterOptions = {
  business_unit: string[];
  division: string[];
  sbg: string[];
  sbu: string[];
  bhr: string[];
  band: string[];
};

export type ClientPipelineMetrics = {
  snapshot: PipelineBucket;
  period: PipelineBucket;
  prior_period: PipelineBucket;
  deltas: Record<string, number | null>;
  period_label: string;
  period_start: string;
  period_end: string;
  prior_period_start: string;
  prior_period_end: string;
  granularity: string;
  compare: string;
  ageing_buckets: Array<{ bucket: string; count: number }>;
  fine_ageing_buckets: Array<{ bucket: string; count: number }>;
  account_ageing_rows: AccountAgeingRow[];
  diversity_breakdown: Array<{ label: string; count: number }>;
  source_breakdown: Array<{ label: string; count: number }>;
  source_breakdown_offers: Array<{ label: string; count: number }>;
  source_breakdown_pipeline: Array<{ label: string; count: number }>;
  source_effectiveness: SourceEffectivenessRow[];
  source_monthly: Array<{ month: string; joiners: Record<string, number>; offers: Record<string, number> }>;
  funnel_by_quarter: FunnelQuarterRow[];
  series: PipelineSeriesRow[];
  quarterly_series: PipelineQuarterRow[];
  period_month_options: string[];
  updated_at?: string;
};

const BUCKET_KEYS = ["wip", "open", "offered", "ytj", "joiners", "offer_drops", "cancelled", "hold", "total_demand"] as const;
const COV_KEYS = ["joiners", "with_diversity", "with_source", "with_offer_date", "with_creation_date"] as const;

function emptyBucket(): PipelineBucket {
  return {
    wip: 0,
    open: 0,
    offered: 0,
    ytj: 0,
    joiners: 0,
    offer_drops: 0,
    cancelled: 0,
    hold: 0,
    total_demand: 0,
    avg_ageing_days: null,
    median_ageing_days: null,
    avg_tto_days: null,
    median_tto_days: null,
    avg_ttf_days: null,
    median_ttf_days: null,
    diversity_pct: null,
    rpo_mix_pct: null,
    offer_drop_pct: null,
    oar_pct: null,
    jcr_pct: null,
    offered_total: 0,
    coverage: {
      joiners: 0,
      with_diversity: 0,
      with_source: 0,
      with_offer_date: 0,
      with_creation_date: 0,
    },
  };
}

function mergeBucketKey(chunks: ClientPipelineMetrics[], key: "snapshot" | "period" | "prior_period"): PipelineBucket {
  const merged = emptyBucket();
  const tto: number[] = [];
  const ttf: number[] = [];
  const ageing: number[] = [];

  for (const ch of chunks) {
    const b = ch[key];
    for (const k of BUCKET_KEYS) {
      merged[k] += b[k] ?? 0;
    }
    for (const ck of COV_KEYS) {
      merged.coverage[ck] += b.coverage[ck] ?? 0;
    }
    if (b.avg_tto_days != null) tto.push(b.avg_tto_days);
    if (b.avg_ttf_days != null) ttf.push(b.avg_ttf_days);
    if (b.median_ageing_days != null) ageing.push(b.median_ageing_days);
    if (b.avg_ageing_days != null) ageing.push(b.avg_ageing_days);
  }

  if (tto.length) {
    merged.avg_tto_days = Math.round((tto.reduce((a, c) => a + c, 0) / tto.length) * 10) / 10;
    merged.median_tto_days = merged.avg_tto_days;
  }
  if (ttf.length) {
    merged.avg_ttf_days = Math.round((ttf.reduce((a, c) => a + c, 0) / ttf.length) * 10) / 10;
    merged.median_ttf_days = merged.avg_ttf_days;
  }
  if (ageing.length) {
    merged.avg_ageing_days = Math.round((ageing.reduce((a, c) => a + c, 0) / ageing.length) * 10) / 10;
    merged.median_ageing_days = merged.avg_ageing_days;
  }

  const j = merged.coverage.joiners;
  if (key === "snapshot" && j > 0) {
    let female = 0;
    let rpo = 0;
    for (const ch of chunks) {
      for (const d of ch.diversity_breakdown) {
        if (d.label === "Female") female += d.count;
      }
      for (const s of ch.source_breakdown) {
        if (s.label === "Taggd RPO") rpo += s.count;
      }
    }
    if (merged.coverage.with_diversity > 0) {
      merged.diversity_pct = Math.round((female / j) * 1000) / 10;
    }
    if (merged.coverage.with_source > 0) {
      merged.rpo_mix_pct = Math.round((rpo / j) * 1000) / 10;
    }
  }
  if (merged.offered > 0) {
    merged.offer_drop_pct = Math.round((merged.offer_drops / merged.offered) * 1000) / 10;
    merged.oar_pct = Math.round((merged.joiners / merged.offered) * 1000) / 10;
  }

  return merged;
}

export function mergePipelineForProjects(
  byProject: Record<string, ClientPipelineMetrics>,
  projectIds: number[],
): ClientPipelineMetrics | null {
  const chunks = projectIds.map((id) => byProject[String(id)]).filter(Boolean);
  if (chunks.length === 0) return null;

  const snapshot = mergeBucketKey(chunks, "snapshot");
  const period = mergeBucketKey(chunks, "period");
  const prior = mergeBucketKey(chunks, "prior_period");

  const deltas: Record<string, number | null> = {};
  for (const k of BUCKET_KEYS) {
    const cur = period[k];
    const prev = prior[k];
    deltas[`${k}_pct`] = prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;
  }

  const ageingMap: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  const fineMap: Record<string, number> = { "0-30": 0, "31-45": 0, "46-60": 0, "61-90": 0, "90+": 0 };
  const divMap: Record<string, number> = {};
  const srcMap: Record<string, number> = {};
  const seriesMap: Record<string, PipelineSeriesRow> = {};
  const accountMap: Record<string, AccountAgeingRow> = {};
  const monthOpts = new Set<string>();

  for (const ch of chunks) {
    for (const b of ch.ageing_buckets) ageingMap[b.bucket] = (ageingMap[b.bucket] ?? 0) + b.count;
    for (const b of ch.fine_ageing_buckets ?? []) fineMap[b.bucket] = (fineMap[b.bucket] ?? 0) + b.count;
    for (const d of ch.diversity_breakdown) divMap[d.label] = (divMap[d.label] ?? 0) + d.count;
    for (const s of ch.source_breakdown) srcMap[s.label] = (srcMap[s.label] ?? 0) + s.count;
    for (const ar of ch.account_ageing_rows ?? []) {
      const ex = accountMap[ar.account];
      if (!ex) accountMap[ar.account] = { ...ar };
      else {
        ex.open += ar.open;
        ex.b_0_30 += ar.b_0_30;
        ex.b_31_45 += ar.b_31_45;
        ex.b_46_60 += ar.b_46_60;
        ex.b_61_90 += ar.b_61_90;
        ex.b_90_plus += ar.b_90_plus;
        ex.oldest_days = Math.max(ex.oldest_days, ar.oldest_days);
      }
    }
    for (const row of ch.series) {
      if (!seriesMap[row.month]) seriesMap[row.month] = { ...row };
      else {
        const acc = seriesMap[row.month];
        for (const fk of ["opens_created", "open_wip", "cancelled", "hold", "offered", "joiners", "offer_drops", "ytj_end", "aged_over_30"] as const) {
          acc[fk] += row[fk] ?? 0;
        }
      }
    }
    for (const m of ch.period_month_options) monthOpts.add(m);
  }

  const meta = chunks[0];
  const series = Object.values(seriesMap).sort((a, b) => a.month.localeCompare(b.month));

  return {
    snapshot,
    period,
    prior_period: prior,
    deltas,
    period_label: meta.period_label,
    period_start: meta.period_start,
    period_end: meta.period_end,
    prior_period_start: meta.prior_period_start,
    prior_period_end: meta.prior_period_end,
    granularity: meta.granularity,
    compare: meta.compare,
    ageing_buckets: Object.entries(ageingMap).map(([bucket, count]) => ({ bucket, count })),
    fine_ageing_buckets: Object.entries(fineMap).map(([bucket, count]) => ({ bucket, count })),
    account_ageing_rows: Object.values(accountMap).sort((a, b) => b.oldest_days - a.oldest_days),
    diversity_breakdown: Object.entries(divMap).map(([label, count]) => ({ label, count })),
    source_breakdown: Object.entries(srcMap)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    source_breakdown_offers: [],
    source_breakdown_pipeline: [],
    source_effectiveness: [],
    source_monthly: [],
    funnel_by_quarter: [],
    series,
    quarterly_series: aggregateQuarterly(series),
    period_month_options: [...monthOpts].sort().reverse(),
    updated_at: meta.updated_at,
  };
}

export function aggregateQuarterly(monthly: PipelineSeriesRow[]): PipelineQuarterRow[] {
  const buckets: Record<string, PipelineQuarterRow & { _tto: number[]; _ttf: number[]; _div: number[] }> = {};
  for (const row of monthly) {
    const y = parseInt(row.month.slice(0, 4), 10);
    const m = parseInt(row.month.slice(5, 7), 10);
    const q = Math.ceil(m / 3);
    const key = `${y}-Q${q}`;
    const acc = buckets[key] ?? {
      quarter: key,
      opens_created: 0,
      open_wip: 0,
      cancelled: 0,
      hold: 0,
      offered: 0,
      joiners: 0,
      offer_drops: 0,
      aged_over_30: 0,
      avg_tto_days: null,
      avg_ttf_days: null,
      female_hire_pct: null,
      oar_pct: null,
      odr_pct: null,
      oar_stock_pct: null,
      jcr_stock_pct: null,
      _tto: [],
      _ttf: [],
      _div: [],
    };
    const flowKeys = ["opens_created", "cancelled", "offered", "joiners", "offer_drops", "aged_over_30"] as const;
    for (const fk of flowKeys) {
      acc[fk] += row[fk] ?? 0;
    }
    acc.open_wip = row.open_wip ?? 0;
    acc.hold = row.hold ?? 0;
    acc.oar_stock_pct = row.oar_stock_pct ?? null;
    acc.jcr_stock_pct = row.jcr_stock_pct ?? null;
    if (row.avg_tto_days != null) acc._tto.push(row.avg_tto_days);
    if (row.avg_ttf_days != null) acc._ttf.push(row.avg_ttf_days);
    if (row.female_hire_pct != null) acc._div.push(row.female_hire_pct);
    buckets[key] = acc;
  }
  return Object.keys(buckets)
    .sort()
    .map((key) => {
      const acc = buckets[key];
      const offers = acc.offered;
      const joiners = acc.joiners;
      const drops = acc.offer_drops;
      return {
        quarter: acc.quarter,
        opens_created: acc.opens_created,
        open_wip: acc.open_wip,
        cancelled: acc.cancelled,
        hold: acc.hold,
        offered: offers,
        joiners,
        offer_drops: drops,
        aged_over_30: acc.aged_over_30,
        avg_tto_days: acc._tto.length ? Math.round((acc._tto.reduce((a, c) => a + c, 0) / acc._tto.length) * 10) / 10 : null,
        avg_ttf_days: acc._ttf.length ? Math.round((acc._ttf.reduce((a, c) => a + c, 0) / acc._ttf.length) * 10) / 10 : null,
        female_hire_pct: acc._div.length ? Math.round((acc._div.reduce((a, c) => a + c, 0) / acc._div.length) * 10) / 10 : null,
        oar_pct: offers > 0 ? Math.round((joiners / offers) * 1000) / 10 : null,
        odr_pct: offers > 0 ? Math.round((drops / offers) * 1000) / 10 : null,
        oar_stock_pct: acc.oar_stock_pct ?? null,
        jcr_stock_pct: acc.jcr_stock_pct ?? null,
      };
    });
}

export function formatPipelineDelta(
  delta: number | null | undefined,
  compare: string,
): { label: string; cls: string } | null {
  if (delta == null || Number.isNaN(delta)) return null;
  const cmp = compare === "qoq" ? "QoQ" : compare === "prior" ? "vs prior" : "MoM";
  const cls = delta > 0.5 ? "text-emerald-600" : delta < -0.5 ? "text-rose-600" : "text-tremor-content-subtle";
  return { label: `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)}% ${cmp}`, cls };
}

export function formatDeltaPts(delta: number | null | undefined, suffix = "pts"): string | undefined {
  if (delta == null || Number.isNaN(delta)) return undefined;
  return `${delta >= 0 ? "+" : ""}${delta}${suffix.startsWith(" ") ? suffix : ` ${suffix}`}`;
}

export function ageingBucketsForChart(buckets: Array<{ bucket: string; count: number }>, fine = false) {
  const colors: Record<string, string> = fine
    ? {
        "0-30": "#15803d",
        "31-45": "#0f766e",
        "46-60": "#f59e0b",
        "61-90": "#ea580c",
        "90+": "#b91c1c",
      }
    : { "0-30": "var(--green)", "31-60": "var(--amber)", "61-90": "var(--red)", "90+": "var(--red)" };
  const labels: Record<string, string> = fine
    ? {
        "0-30": "0–30 days",
        "31-45": "30–45 days",
        "46-60": "45–60 days",
        "61-90": "60–90 days",
        "90+": ">90 days",
      }
    : { "0-30": "0–30 days", "31-60": "31–60 days", "61-90": "61–90 days", "90+": "90+ days" };
  const max = Math.max(...buckets.map((b) => b.count), 1);
  return buckets.map((b) => ({
    label: labels[b.bucket] ?? b.bucket,
    count: b.count,
    max,
    color: colors[b.bucket] ?? "var(--accent)",
  }));
}

export function monthLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short" });
}

export function quarterLabel(iso: string): string {
  const q = iso.split("-Q")[1];
  return `Q${q}`;
}

const SOURCE_SHORT_ALIASES: Record<string, string> = {
  "taggd rpo": "Taggd RPO",
  "taggd direct": "Direct",
  "non-taggd employee referral": "ER",
  "non-taggd internal job portal": "IJP",
  "non-taggd internal job posting": "IJP",
  "non-taggd campus": "Campus",
  "non-taggd transferred": "Transfer",
  "non-taggd internal transfer": "Transfer",
  taggd_rpo: "Taggd RPO",
  taggd_direct: "Direct",
  nontaggd_employee_referral: "ER",
  nontaggd_internal_job_portal: "IJP",
  nontaggd_campus: "Campus",
  nontaggd_transferred: "Transfer",
};

/** Compact label for source-mix charts (donut legends / slice labels). */
export function shortSourceChannelLabel(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "Unknown";
  const key = t.toLowerCase();
  if (SOURCE_SHORT_ALIASES[key]) return SOURCE_SHORT_ALIASES[key];
  if (key.startsWith("nontaggd_")) {
    if (key.includes("employee") || key.includes("referral")) return "ER";
    if (key.includes("internal") || key.includes("job")) return "IJP";
    if (key.includes("campus")) return "Campus";
    if (key.includes("transfer")) return "Transfer";
  }
  if (key.startsWith("non-taggd ")) {
    const sub = key.slice("non-taggd ".length);
    if (sub.includes("employee") || sub.includes("referral")) return "ER";
    if (sub.includes("internal") || sub.includes("job")) return "IJP";
    if (sub.includes("campus")) return "Campus";
    if (sub.includes("transfer")) return "Transfer";
  }
  return t;
}

export function sourceDonutRows(items: Array<{ label: string; count: number }>) {
  return items
    .filter((d) => d.count > 0)
    .map((d) => ({
      name: shortSourceChannelLabel(d.label),
      value: d.count,
      fullName: d.label,
    }));
}
