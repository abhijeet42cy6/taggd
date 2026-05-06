import React, { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { Button, Card, Grid, Metric, Select, SelectItem, Text } from "@tremor/react";
import { formatCurrency } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TremorDashboardSection } from "@/components/tremor-dashboard/TremorDashboardSection";
import type { FinanceRowVm } from "@/lib/view-models/finance";

export const PRODUCTIVITY_AVG_INFO =
  "Avg Taggd source prod. = Σ Taggd joiners ÷ Σ WL1 HC on filtered rows (portfolio ratio — matches Excel totals). Avg Rev / WL1 is the arithmetic mean of per-row revenue ÷ WL1. Avg PPC = Σ(Rev − CM) ÷ Σ overall HC (implied cost per HC).";

export const PRODUCTIVITY_AVG_INFO_DASHBOARD =
  "Uses the **same fiscal year** as “Financial performance” (FY selector) plus region/account/month filters. Rows are client-months in that FY only — not prior FYs. Avg Taggd source prod. = Σ joiners ÷ Σ WL1 HC. Avg PPC = Σ(Rev − CM) ÷ Σ overall HC.";

export function fmtFinRatio(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function fmtFinInrMetric(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatCurrency(n);
}

function averageDefined(
  rows: FinanceRowVm[],
  pick: (r: FinanceRowVm) => number | null | undefined,
): { mean: number | null; count: number } {
  const vals: number[] = [];
  for (const r of rows) {
    const v = pick(r);
    if (v != null && Number.isFinite(v)) vals.push(v);
  }
  if (!vals.length) return { mean: null, count: 0 };
  const sum = vals.reduce((a, b) => a + b, 0);
  return { mean: sum / vals.length, count: vals.length };
}

/** Portfolio-style Avg Taggd source prod.: Σ joiners ÷ Σ WL1 HC (matches spreadsheet totals, not mean of ratios). */
export function avgTaggdSigmaJoinersOverSigmaWl1(rows: FinanceRowVm[]): {
  value: number | null;
  rowCount: number;
  sumJoiners: number;
  sumWl1: number;
} {
  let sumJoiners = 0;
  let sumWl1 = 0;
  let rowCount = 0;
  for (const r of rows) {
    rowCount += 1;
    sumJoiners += Number(r.taggd_joiners) || 0;
    sumWl1 += Number(r.actual_headcount_wl1) || 0;
  }
  if (!rowCount || sumWl1 <= 0 || !Number.isFinite(sumJoiners)) {
    return { value: null, rowCount, sumJoiners, sumWl1 };
  }
  return {
    value: sumJoiners / sumWl1,
    rowCount,
    sumJoiners,
    sumWl1,
  };
}

/** Portfolio-style Avg PPC: Σ(Rev − CM) ÷ Σ overall HC on the same filtered rows (INR per HC). */
export function avgPpcSigmaRevMinusCmOverSigmaHc(rows: FinanceRowVm[]): {
  value: number | null;
  rowCount: number;
  sumHc: number;
  sumImpliedCostInr: number;
} {
  let sumRev = 0;
  let sumCm = 0;
  let sumHc = 0;
  let rowCount = 0;
  for (const r of rows) {
    rowCount += 1;
    sumRev += Number(r.rev_actual_inr) || 0;
    sumCm += Number(r.cm_actual_inr) || 0;
    sumHc += Number(r.actual_headcount_overall) || 0;
  }
  const sumImpliedCostInr = sumRev - sumCm;
  if (!rowCount || sumHc <= 0 || !Number.isFinite(sumImpliedCostInr)) {
    return { value: null, rowCount, sumHc, sumImpliedCostInr };
  }
  return {
    value: sumImpliedCostInr / sumHc,
    rowCount,
    sumHc,
    sumImpliedCostInr,
  };
}

/** Tremor-native KPI tile: top decoration stripe + Metric stack (no custom header chrome). */
function ProductivityMetricTile({
  decorationColor,
  label,
  value,
  subtext,
}: {
  decorationColor: "teal" | "blue" | "orange";
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <Card decoration="top" decorationColor={decorationColor}>
      <Text className="font-medium text-tremor-content-emphasis">{label}</Text>
      <Metric className="mt-2 text-tremor-content-strong">{value}</Metric>
      <Text className="mt-2 text-tremor-default leading-snug text-tremor-content-subtle">{subtext}</Text>
    </Card>
  );
}

type Props = {
  rows: FinanceRowVm[];
  loading?: boolean;
  externalFilters?: boolean;
  /** When set (exec dashboard), shown in the scope line — e.g. FY25–26 from the page FY selector. */
  fyLabel?: string;
};

export function ProductivityAveragesSection({
  rows,
  loading = false,
  externalFilters = false,
  fyLabel,
}: Props) {
  const [avgFilterClient, setAvgFilterClient] = useState<string>("all");
  const [avgFilterMonth, setAvgFilterMonth] = useState<string>("all");

  const accountOptions = useMemo(
    () => [...new Set(rows.map((r) => r.account_name).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b))),
    [rows],
  );

  const monthOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: { label: string; sortKey: string }[] = [];
    for (const r of rows) {
      const label = String(r.month ?? "").trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      list.push({ label, sortKey: String(r.month_sort ?? r.month ?? label) });
    }
    list.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return list.map((x) => x.label);
  }, [rows]);

  const rowsForProductivityAvg = useMemo(() => {
    if (externalFilters) return rows;
    return rows.filter((r) => {
      const clientOk = avgFilterClient === "all" || r.account_name === avgFilterClient;
      const monthOk = avgFilterMonth === "all" || r.month === avgFilterMonth;
      return clientOk && monthOk;
    });
  }, [rows, externalFilters, avgFilterClient, avgFilterMonth]);

  const productivityAvgs = useMemo(() => {
    const tag = avgTaggdSigmaJoinersOverSigmaWl1(rowsForProductivityAvg);
    const ppc = avgPpcSigmaRevMinusCmOverSigmaHc(rowsForProductivityAvg);
    const rev = averageDefined(rowsForProductivityAvg, (r) => r.revenue_productivity_inr);
    return { tag, ppc, rev };
  }, [rowsForProductivityAvg]);

  const infoTooltip = externalFilters ? PRODUCTIVITY_AVG_INFO_DASHBOARD : PRODUCTIVITY_AVG_INFO;

  return (
    <TremorDashboardSection
      tag="Productivity"
      title="Productivity averages"
      titleAccessory={(
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex shrink-0 rounded-tremor-small p-1 text-orange-700 transition-colors hover:bg-orange-50 hover:text-orange-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                aria-label="How productivity averages are calculated"
              >
                <Info size={18} strokeWidth={2} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-sm text-left">
              {infoTooltip}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    >
      {externalFilters ? (
        <Text className="mb-4 font-medium text-tremor-content-emphasis">
          {rowsForProductivityAvg.length} client-month{rowsForProductivityAvg.length === 1 ? "" : "s"}
          {fyLabel ? ` · ${fyLabel}` : ""} · dashboard filters
        </Text>
      ) : (
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="min-w-[12rem] flex-1">
            <Text className="mb-1 font-semibold text-tremor-content-emphasis">Client</Text>
            <Select value={avgFilterClient} onValueChange={setAvgFilterClient} disabled={loading}>
              <SelectItem value="all">All clients</SelectItem>
              {accountOptions.map((a) => (
                <SelectItem key={a} value={a}>
                  {a.length > 42 ? `${a.slice(0, 40)}…` : a}
                </SelectItem>
              ))}
            </Select>
          </div>
          <div className="min-w-[10rem] flex-1">
            <Text className="mb-1 font-semibold text-tremor-content-emphasis">Month</Text>
            <Select value={avgFilterMonth} onValueChange={setAvgFilterMonth} disabled={loading}>
              <SelectItem value="all">All months</SelectItem>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </Select>
          </div>
          {(avgFilterClient !== "all" || avgFilterMonth !== "all") && (
            <Button
              type="button"
              variant="secondary"
              color="orange"
              disabled={loading}
              onClick={() => {
                setAvgFilterClient("all");
                setAvgFilterMonth("all");
              }}
            >
              Clear filters
            </Button>
          )}
          <Text className="ml-auto w-full font-medium text-tremor-content-emphasis sm:w-auto">
            {rowsForProductivityAvg.length} client-month{rowsForProductivityAvg.length === 1 ? "" : "s"} in scope
          </Text>
        </div>
      )}

      {loading ? (
        <Grid numItems={1} numItemsMd={3} className="gap-4">
          {(["teal", "blue", "orange"] as const).map((c) => (
            <Card key={c} decoration="top" decorationColor={c} className="animate-pulse">
              <div className="h-4 w-2/3 rounded bg-tremor-background-subtle" />
              <div className="mt-3 h-8 w-1/2 rounded bg-tremor-background-subtle" />
              <div className="mt-3 h-3 w-full rounded bg-tremor-background-subtle" />
            </Card>
          ))}
        </Grid>
      ) : (
        <Grid numItems={1} numItemsMd={3} className="gap-4">
          <ProductivityMetricTile
            decorationColor="teal"
            label="Avg Taggd source prod."
            value={fmtFinRatio(productivityAvgs.tag.value)}
            subtext={
              productivityAvgs.tag.value != null && productivityAvgs.tag.sumWl1 > 0
                ? `Σ ${productivityAvgs.tag.sumJoiners.toLocaleString(undefined, { maximumFractionDigits: 2 })} joiners ÷ Σ ${productivityAvgs.tag.sumWl1.toLocaleString(undefined, { maximumFractionDigits: 2 })} WL1 (${productivityAvgs.tag.rowCount} client-months)`
                : productivityAvgs.tag.rowCount === 0
                  ? "No rows in scope"
                  : "Σ WL1 HC is 0 in scope"
            }
          />
          <ProductivityMetricTile
            decorationColor="blue"
            label="Avg PPC"
            value={fmtFinInrMetric(productivityAvgs.ppc.value)}
            subtext={
              productivityAvgs.ppc.rowCount === 0
                ? "No rows in scope"
                : productivityAvgs.ppc.sumHc <= 0
                  ? "Σ overall HC is 0 in scope"
                  : "Σ(Rev − CM) ÷ Σ HC"
            }
          />
          <ProductivityMetricTile
            decorationColor="orange"
            label="Avg Rev / WL1"
            value={fmtFinInrMetric(productivityAvgs.rev.mean)}
            subtext={
              productivityAvgs.rev.count
                ? `Mean of ${productivityAvgs.rev.count} values`
                : "No Rev / WL1 values in scope"
            }
          />
        </Grid>
      )}
    </TremorDashboardSection>
  );
}
