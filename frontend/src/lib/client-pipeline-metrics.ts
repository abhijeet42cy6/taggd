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
  avg_ageing_days: number | null;
  median_ageing_days: number | null;
  avg_tto_days: number | null;
  median_tto_days: number | null;
  avg_ttf_days: number | null;
  median_ttf_days: number | null;
  diversity_pct: number | null;
  rpo_mix_pct: number | null;
  offer_drop_pct: number | null;
  coverage: PipelineCoverage;
};

export type PipelineSeriesRow = {
  month: string;
  opens_created: number;
  offered: number;
  joiners: number;
  offer_drops: number;
  ytj_end: number;
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
  diversity_breakdown: Array<{ label: string; count: number }>;
  source_breakdown: Array<{ label: string; count: number }>;
  series: PipelineSeriesRow[];
  period_month_options: string[];
};

const BUCKET_KEYS = ["wip", "open", "offered", "ytj", "joiners", "offer_drops"] as const;
const COV_KEYS = ["joiners", "with_diversity", "with_source", "with_offer_date", "with_creation_date"] as const;

function emptyBucket(): PipelineBucket {
  return {
    wip: 0,
    open: 0,
    offered: 0,
    ytj: 0,
    joiners: 0,
    offer_drops: 0,
    avg_ageing_days: null,
    median_ageing_days: null,
    avg_tto_days: null,
    median_tto_days: null,
    avg_ttf_days: null,
    median_ttf_days: null,
    diversity_pct: null,
    rpo_mix_pct: null,
    offer_drop_pct: null,
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
  const divMap: Record<string, number> = {};
  const srcMap: Record<string, number> = {};
  const seriesMap: Record<string, PipelineSeriesRow> = {};
  const monthOpts = new Set<string>();

  for (const ch of chunks) {
    for (const b of ch.ageing_buckets) {
      ageingMap[b.bucket] = (ageingMap[b.bucket] ?? 0) + b.count;
    }
    for (const d of ch.diversity_breakdown) {
      divMap[d.label] = (divMap[d.label] ?? 0) + d.count;
    }
    for (const s of ch.source_breakdown) {
      srcMap[s.label] = (srcMap[s.label] ?? 0) + s.count;
    }
    for (const row of ch.series) {
      if (!seriesMap[row.month]) {
        seriesMap[row.month] = { month: row.month, opens_created: 0, offered: 0, joiners: 0, offer_drops: 0, ytj_end: 0 };
      }
      const acc = seriesMap[row.month];
      acc.opens_created += row.opens_created;
      acc.offered += row.offered;
      acc.joiners += row.joiners;
      acc.offer_drops += row.offer_drops;
      acc.ytj_end += row.ytj_end;
    }
    for (const m of ch.period_month_options) monthOpts.add(m);
  }

  const meta = chunks[0];
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
    diversity_breakdown: Object.entries(divMap).map(([label, count]) => ({ label, count })),
    source_breakdown: Object.entries(srcMap)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    series: Object.values(seriesMap).sort((a, b) => a.month.localeCompare(b.month)),
    period_month_options: [...monthOpts].sort().reverse(),
  };
}

export function formatPipelineDelta(
  delta: number | null | undefined,
  compare: string,
): { label: string; cls: string } | null {
  if (delta == null || Number.isNaN(delta)) return null;
  const cmp = compare === "qoq" ? "QoQ" : "MoM";
  const cls = delta > 0.5 ? "text-emerald-600" : delta < -0.5 ? "text-rose-600" : "text-tremor-content-subtle";
  return { label: `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)}% ${cmp}`, cls };
}

export function ageingBucketsForChart(buckets: Array<{ bucket: string; count: number }>) {
  const colors: Record<string, string> = {
    "0-30": "var(--green)",
    "31-60": "var(--amber)",
    "61-90": "var(--red)",
    "90+": "var(--red)",
  };
  const labels: Record<string, string> = {
    "0-30": "0–30 days",
    "31-60": "31–60 days",
    "61-90": "61–90 days",
    "90+": "90+ days",
  };
  const max = Math.max(...buckets.map((b) => b.count), 1);
  return buckets.map((b) => ({
    label: labels[b.bucket] ?? b.bucket,
    count: b.count,
    max,
    color: colors[b.bucket] ?? "var(--accent)",
  }));
}
