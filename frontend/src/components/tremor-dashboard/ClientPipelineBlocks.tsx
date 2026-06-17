import React, { useMemo } from "react";
import { Card, Grid, Metric, Text, Title } from "@tremor/react";
import { EChartsCanvas } from "@/components/charts/EChartsCanvas";
import { buildMultiLineTimeseriesOption } from "@/components/charts/optionBuilders";
import { CHART_COLORS } from "@/components/charts/chartTokens";
import { AgeingBars, LevelDonutChart } from "@/components/platform/Charts";
import { ClientMetricGrid, AccountMetricCard } from "@/components/tremor-dashboard/AccountMetricCard";
import { TremorDashboardSection } from "@/components/tremor-dashboard/TremorDashboardSection";
import {
  ageingBucketsForChart,
  formatPipelineDelta,
  type ClientPipelineMetrics,
  type PipelineBucket,
} from "@/lib/client-pipeline-metrics";
import { formatPercent } from "@/lib/utils";
import type { LayoutBlock } from "@/lib/api";

function fmtDays(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${Math.round(v)}d`;
}

function coverageNote(cov: PipelineBucket["coverage"], kind: "diversity" | "source" | "tto"): string {
  if (kind === "diversity" && cov.joiners > 0) {
    return `${cov.with_diversity} of ${cov.joiners} joiners tagged`;
  }
  if (kind === "source" && cov.joiners > 0) {
    return `${cov.with_source} of ${cov.joiners} joiners tagged`;
  }
  if (kind === "tto" && cov.with_offer_date > 0) {
    return `Based on ${cov.with_offer_date} reqs with offer date`;
  }
  return "Limited data on tagged fields";
}

type PipelineBlocksProps = {
  metrics: ClientPipelineMetrics | null;
  variant?: LayoutBlock["variant"];
};

export function PipelineKpiStrip({ metrics, variant = "card" }: PipelineBlocksProps) {
  if (!metrics) {
    return (
      <TremorDashboardSection tag="Pipeline" title="Requisition pipeline">
        <Text className="text-sm text-tremor-content-subtle">No pipeline data in scope.</Text>
      </TremorDashboardSection>
    );
  }

  const snap = metrics.snapshot;
  const period = metrics.period;
  const cmp = metrics.compare;

  const cards = [
    {
      label: "WIP / Open",
      value: String(snap.wip),
      sub: `${snap.open} open · ${period.offered} offered in period`,
      decoration: "blue" as const,
      delta: metrics.deltas.wip_pct,
    },
    {
      label: "Total offered",
      value: String(snap.offered),
      sub: `${period.offered} in ${metrics.period_label}`,
      decoration: "amber" as const,
      delta: metrics.deltas.offered_pct,
    },
    {
      label: "Total YTJ",
      value: String(snap.ytj),
      sub: "Yet to join (current)",
      decoration: "teal" as const,
      delta: metrics.deltas.ytj_pct,
    },
    {
      label: "WIP ageing",
      value: fmtDays(snap.median_ageing_days ?? snap.avg_ageing_days),
      sub: "Median days open (today − created)",
      decoration: "orange" as const,
      delta: metrics.deltas.median_ageing_days_delta,
      deltaIsPts: true,
    },
    {
      label: "TTO",
      value: fmtDays(snap.median_tto_days ?? snap.avg_tto_days),
      sub: coverageNote(snap.coverage, "tto"),
      decoration: "emerald" as const,
      delta: metrics.deltas.avg_tto_days_delta,
      deltaIsPts: true,
    },
    {
      label: "TTF",
      value: fmtDays(snap.median_ttf_days ?? snap.avg_ttf_days),
      sub: "Joining − creation (joiners)",
      decoration: "rose" as const,
      delta: metrics.deltas.avg_ttf_days_delta,
      deltaIsPts: true,
    },
  ];

  if (variant === "dense") {
    return (
      <div className="flex flex-wrap gap-4 rounded-tremor-default border border-tremor-border bg-white px-4 py-3">
        {cards.slice(0, 3).map((c) => (
          <div key={c.label}>
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">{c.label}</Text>
            <Text className="mt-0.5 text-lg font-bold tabular-nums text-tremor-content-strong">{c.value}</Text>
          </div>
        ))}
      </div>
    );
  }

  return (
    <TremorDashboardSection
      tag="Pipeline"
      title="Requisition pipeline"
      toolbar={
        <Text className="text-[11px] text-tremor-content-subtle">
          Period {metrics.period_label}
        </Text>
      }
    >
      <ClientMetricGrid count={6}>
        {cards.map((c) => (
          <AccountMetricCard
            key={c.label}
            eyebrow={c.label}
            value={c.value}
            subtext={c.sub}
            decorationColor={c.decoration}
            hint={
              c.deltaIsPts
                ? c.delta != null
                  ? `${c.delta >= 0 ? "+" : ""}${c.delta}d vs prior`
                  : undefined
                : formatPipelineDelta(c.delta, cmp)?.label
            }
          />
        ))}
      </ClientMetricGrid>
    </TremorDashboardSection>
  );
}

export function PipelineQualityStrip({ metrics }: PipelineBlocksProps) {
  if (!metrics) return null;
  const snap = metrics.snapshot;
  const cmp = metrics.compare;

  const items = [
    {
      label: "Diversity",
      value: snap.diversity_pct == null ? "—" : formatPercent(snap.diversity_pct),
      sub: `Female joiners / total joiners · ${coverageNote(snap.coverage, "diversity")}`,
      decoration: "rose" as const,
      delta: metrics.deltas.diversity_pct_delta,
    },
    {
      label: "Source mix (RPO)",
      value: snap.rpo_mix_pct == null ? "—" : formatPercent(snap.rpo_mix_pct),
      sub: `Taggd RPO joiners / total · ${coverageNote(snap.coverage, "source")}`,
      decoration: "blue" as const,
      delta: metrics.deltas.rpo_mix_pct_delta,
    },
    {
      label: "Offer drop ratio",
      value: snap.offer_drop_pct == null ? "—" : formatPercent(snap.offer_drop_pct),
      sub: `${snap.offer_drops} drops / ${snap.offered} offered`,
      decoration: "amber" as const,
      delta: metrics.deltas.offer_drop_pct_delta,
    },
  ];

  return (
    <TremorDashboardSection tag="Quality" title="Joiner quality & offer health">
      <ClientMetricGrid count={6} className="client-metric-grid--3">
        {items.map((c) => (
          <AccountMetricCard
            key={c.label}
            eyebrow={c.label}
            value={c.value}
            subtext={c.sub}
            decorationColor={c.decoration}
            hint={c.delta != null ? `${c.delta >= 0 ? "+" : ""}${c.delta} pts vs prior` : undefined}
          />
        ))}
      </ClientMetricGrid>
    </TremorDashboardSection>
  );
}

export function PipelineActivityChart({ metrics }: PipelineBlocksProps) {
  if (!metrics?.series?.length) {
    return (
      <TremorDashboardSection tag="Trend" title="Pipeline activity">
        <Text className="text-sm text-tremor-content-subtle">No monthly activity in scope.</Text>
      </TremorDashboardSection>
    );
  }

  const data = metrics.series.map((r) => ({
    month: r.month.slice(5),
    Opens: r.opens_created,
    Offered: r.offered,
    Joiners: r.joiners,
    Drops: r.offer_drops,
  }));

  const option = useMemo(
    () =>
      buildMultiLineTimeseriesOption(
        data.map((d) => d.month),
        [
          { name: "Opens", data: data.map((d) => d.Opens), color: CHART_COLORS[5] },
          { name: "Offered", data: data.map((d) => d.Offered), color: CHART_COLORS[2] },
          { name: "Joiners", data: data.map((d) => d.Joiners), color: CHART_COLORS[1] },
          { name: "Drops", data: data.map((d) => d.Drops), color: CHART_COLORS[3] },
        ],
      ),
    [data],
  );

  return (
    <TremorDashboardSection tag="Trend" title="Pipeline activity (12 months)">
      <div className="h-52 w-full min-w-0">
        <EChartsCanvas option={option} height={208} />
      </div>
    </TremorDashboardSection>
  );
}

export function PipelineAgeingChart({ metrics }: PipelineBlocksProps) {
  if (!metrics) return null;
  const buckets = ageingBucketsForChart(metrics.ageing_buckets);
  const total = buckets.reduce((s, b) => s + b.count, 0);

  return (
    <TremorDashboardSection tag="Ageing" title="WIP ageing distribution">
      {total === 0 ? (
        <Text className="text-sm text-tremor-content-subtle">No open requisitions with creation dates.</Text>
      ) : (
        <>
          <AgeingBars buckets={buckets} />
          <Text className="mt-3 text-[11px] text-tremor-content-subtle">
            Median ageing: {fmtDays(metrics.snapshot.median_ageing_days ?? metrics.snapshot.avg_ageing_days)} · {total} open reqs
          </Text>
        </>
      )}
    </TremorDashboardSection>
  );
}

export function PipelineMixCharts({ metrics }: PipelineBlocksProps) {
  if (!metrics) return null;

  const divData = metrics.diversity_breakdown
    .filter((d) => d.count > 0)
    .map((d) => ({ name: d.label, value: d.count }));
  const srcData = metrics.source_breakdown
    .filter((d) => d.count > 0)
    .map((d) => ({ name: d.label, value: d.count }));

  return (
    <TremorDashboardSection tag="Mix" title="Diversity & source composition">
      <Grid numItems={1} numItemsSm={2} className="gap-4">
        <Card className="border border-tremor-border p-4">
          <Title className="text-sm font-semibold text-tremor-content-strong">Diversity (joiners)</Title>
          {divData.length === 0 ? (
            <Text className="mt-2 text-xs text-tremor-content-subtle">No diversity tags on joiners yet.</Text>
          ) : (
            <div className="mt-2">
              <LevelDonutChart data={divData} />
            </div>
          )}
        </Card>
        <Card className="border border-tremor-border p-4">
          <Title className="text-sm font-semibold text-tremor-content-strong">Source mix (joiners)</Title>
          {srcData.length === 0 ? (
            <Text className="mt-2 text-xs text-tremor-content-subtle">No source joiner tags on joiners yet.</Text>
          ) : (
            <div className="mt-2">
              <LevelDonutChart data={srcData} />
            </div>
          )}
        </Card>
      </Grid>
    </TremorDashboardSection>
  );
}
