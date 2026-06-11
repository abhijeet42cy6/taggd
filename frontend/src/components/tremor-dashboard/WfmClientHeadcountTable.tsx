import { Pencil, UserPlus } from "lucide-react";
import {
  Badge,
  Flex,
  ProgressBar,
  Table,
  TableBody,
  TableCell,
  TableFoot,
  TableFooterCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
} from "@tremor/react";
import { formatLargeCurrency, formatLacs, formatNumber, formatPercent } from "@/lib/utils";
import {
  wfmFillBand,
  wfmFillColor,
  wfmFillPct,
  wfmOpenPositionsFromSheet,
  wfmResignationsFromSheet,
  wfmRowAdditionalHcProxy,
  wfmRowNetVarianceVsProjected,
  wfmRowProjectedHc,
  wfmStatusLabel,
  wfmStatusToBadgeColor,
  type WfmBenchmarkRowVm,
} from "@/lib/view-models/wfm";

const tableClass =
  "text-tremor-default [&_tbody_td]:px-2 [&_tbody_td]:py-1.5 [&_tbody_td]:text-xs [&_tfoot_td]:px-2 [&_tfoot_td]:py-1.5 [&_tfoot_td]:text-xs [&_thead_th]:px-2 [&_thead_th]:py-2 [&_thead_th]:text-[11px] [&_thead_th]:font-semibold [&_thead_th]:normal-case [&_thead_th]:tracking-normal [&_thead_th]:text-tremor-content-emphasis dark:[&_thead_th]:text-dark-tremor-content-emphasis [&_thead_th]:border-b [&_thead_th]:border-tremor-border dark:[&_thead_th]:border-dark-tremor-border";

function formatWfmRowRevenueTarget(raw: number | null | undefined): string {
  const v = Number(raw);
  if (!Number.isFinite(v) || v === 0) return "—";
  const inr = Math.abs(v) > 500_000 ? v : v * 100_000;
  return formatLargeCurrency(inr);
}

function fillBarTremorColor(pct: number, ideal: number): "emerald" | "amber" | "rose" {
  const b = wfmFillBand(pct, ideal);
  if (b === "strong") return "emerald";
  if (b === "watch") return "amber";
  return "rose";
}

export type WfmClientTableTotals = {
  totIdeal: number;
  totActual: number;
  totVariance: number;
  totAdditionalHc: number;
  totOpenSheet: number;
  totResignations: number;
  totProjectedHc: number;
  totNetVar: number;
  totFill: number;
  footerRevenueDisplay: string;
  footerProductivityLacs: number;
};

export function computeWfmClientTableTotals(rows: WfmBenchmarkRowVm[]): WfmClientTableTotals | null {
  if (rows.length <= 1) return null;
  const totIdeal = rows.reduce((s, r) => s + Number(r.ideal_hc ?? 0), 0);
  const totActual = rows.reduce((s, r) => s + Number(r.actual_hc_total ?? 0), 0);
  const totVariance = totIdeal - totActual;
  const totAdditionalHc = rows.reduce((s, r) => s + wfmRowAdditionalHcProxy(r), 0);
  const totOpenSheet = rows.reduce((s, r) => s + wfmOpenPositionsFromSheet(r), 0);
  const totResignations = rows.reduce((s, r) => s + wfmResignationsFromSheet(r), 0);
  const totProjectedHc = rows.reduce((s, r) => s + wfmRowProjectedHc(r), 0);
  const totNetVar = totIdeal - totProjectedHc;
  const totFill = wfmFillPct(totActual, totIdeal);
  let sumRev = 0;
  let maxRev = 0;
  let sumIdealForProd = 0;
  let sumProdWeighted = 0;
  for (const r of rows) {
    const rev = Number(r.lateral_revenue_target ?? 0);
    sumRev += rev;
    maxRev = Math.max(maxRev, Math.abs(rev));
    const idealN = Number(r.ideal_hc ?? 0);
    const prod = Number(r.lateral_productivity_target ?? 0);
    if (idealN > 0 && Number.isFinite(prod)) {
      sumIdealForProd += idealN;
      sumProdWeighted += prod * idealN;
    }
  }
  const revenueInrSum = maxRev > 500_000 ? sumRev : sumRev * 100_000;
  const wProdFoot =
    sumIdealForProd > 0
      ? sumProdWeighted / sumIdealForProd
      : rows.reduce((s, r) => s + Number(r.lateral_productivity_target ?? 0), 0) / rows.length;
  return {
    totIdeal,
    totActual,
    totVariance,
    totAdditionalHc,
    totOpenSheet,
    totResignations,
    totProjectedHc,
    totNetVar,
    totFill,
    footerRevenueDisplay: formatLargeCurrency(revenueInrSum),
    footerProductivityLacs: Number.isFinite(wProdFoot) ? wProdFoot : 0,
  };
}

export function WfmClientHeadcountTable({
  rows,
  totals,
  onAssignRegionalHead,
}: {
  rows: WfmBenchmarkRowVm[];
  totals?: WfmClientTableTotals | null;
  onAssignRegionalHead?: (row: WfmBenchmarkRowVm) => void;
}) {
  return (
    <Table className={tableClass}>
      <TableHead>
        <TableRow>
          <TableHeaderCell className="min-w-[148px]">
            <Text className="block text-[11px] font-semibold leading-tight text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
              Client / region
            </Text>
            <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
              Regional head
            </Text>
          </TableHeaderCell>
          <TableHeaderCell className="min-w-[96px] text-right">
            <Text className="block text-[11px] font-semibold leading-tight text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
              Target revenue
            </Text>
            <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
              Workbook YTD
            </Text>
          </TableHeaderCell>
          <TableHeaderCell className="text-right text-[11px] font-semibold text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
            Prod. (lacs)
          </TableHeaderCell>
          <TableHeaderCell className="text-right text-[11px] font-semibold text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
            Ideal HC
          </TableHeaderCell>
          <TableHeaderCell className="text-right text-[11px] font-semibold text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
            Actual HC
          </TableHeaderCell>
          <TableHeaderCell className="min-w-[88px] text-right">
            <Text className="block text-[11px] font-semibold leading-tight text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
              Variance
            </Text>
            <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
              Ideal − actual
            </Text>
          </TableHeaderCell>
          <TableHeaderCell className="min-w-[88px] text-right">
            <Text className="block text-[11px] font-semibold leading-tight text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
              Addl HC
            </Text>
            <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
              Workbook proxy
            </Text>
          </TableHeaderCell>
          <TableHeaderCell className="text-right text-[11px] font-semibold text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
            Open positions
          </TableHeaderCell>
          <TableHeaderCell className="text-right text-[11px] font-semibold text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
            Resignations
          </TableHeaderCell>
          <TableHeaderCell className="min-w-[88px] text-right">
            <Text className="block text-[11px] font-semibold leading-tight text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
              Projected HC
            </Text>
            <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
              Actual + addl + open
            </Text>
          </TableHeaderCell>
          <TableHeaderCell className="min-w-[88px] text-right">
            <Text className="block text-[11px] font-semibold leading-tight text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
              Net variance
            </Text>
            <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
              Ideal − projected
            </Text>
          </TableHeaderCell>
          <TableHeaderCell className="text-[11px] font-semibold text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
            Fill rate
          </TableHeaderCell>
          <TableHeaderCell className="text-[11px] font-semibold text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
            Status
          </TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((r, i) => {
          const idealN = Number(r.ideal_hc ?? 0);
          const actualN = Number(r.actual_hc_total ?? 0);
          const variance = idealN - actualN;
          const additionalHc = wfmRowAdditionalHcProxy(r);
          const pct = wfmFillPct(actualN, idealN);
          const gapColor = wfmFillColor(pct, idealN);
          const statusLbl = wfmStatusLabel(pct, idealN);
          const openSheet = wfmOpenPositionsFromSheet(r);
          const resignations = wfmResignationsFromSheet(r);
          const projRow = wfmRowProjectedHc(r);
          const netVar = wfmRowNetVarianceVsProjected(r);
          const regionLbl = (r.region || "").trim();
          const regionalHead = (r.regional_head || "").trim();
          return (
            <TableRow key={r.project_id ?? r.id ?? i}>
              <TableCell className="max-w-[200px]">
                <Text className="text-xs font-semibold text-tremor-content-strong">{r.account_name || `Project ${r.project_id}`}</Text>
                {regionLbl && regionLbl !== "Unknown" ? (
                  <Text className="block text-[11px] text-tremor-content-subtle">{regionLbl}</Text>
                ) : null}
                {onAssignRegionalHead ? (
                  regionalHead ? (
                    <button
                      type="button"
                      className="group mt-0.5 inline-flex max-w-full items-center gap-1 text-left text-[10px] text-tremor-content-subtle hover:text-orange-700 dark:hover:text-orange-300"
                      title="Edit regional head"
                      onClick={() => onAssignRegionalHead(r)}
                    >
                      <span className="truncate">{regionalHead}</span>
                      <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-orange-700 hover:text-orange-800 dark:text-orange-300 dark:hover:text-orange-200"
                      onClick={() => onAssignRegionalHead(r)}
                    >
                      <UserPlus className="h-3 w-3 shrink-0" aria-hidden />
                      Assign regional head
                    </button>
                  )
                ) : regionalHead ? (
                  <Text className="mt-0.5 block truncate text-[10px] text-tremor-content-subtle">{regionalHead}</Text>
                ) : null}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums text-tremor-content-strong">
                {formatWfmRowRevenueTarget(r.lateral_revenue_target)}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums text-tremor-content-subtle">
                {r.lateral_productivity_target != null ? formatLacs(r.lateral_productivity_target) : "—"}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums text-tremor-content-strong">{formatNumber(idealN)}</TableCell>
              <TableCell className="text-right text-xs tabular-nums text-tremor-content-strong">{formatNumber(actualN)}</TableCell>
              <TableCell
                className={`text-right text-xs tabular-nums font-semibold ${
                  variance > 0 ? "text-rose-600" : variance < 0 ? "text-amber-600" : "text-emerald-600"
                }`}
              >
                {variance > 0 ? "+" : ""}
                {formatNumber(variance)}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums text-tremor-content-subtle">{formatNumber(additionalHc)}</TableCell>
              <TableCell
                className={`text-right text-xs tabular-nums ${openSheet > 0 ? "text-sky-800 dark:text-sky-300" : "text-tremor-content-subtle"}`}
              >
                {formatNumber(openSheet, 0)}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums text-tremor-content-subtle">
                {resignations > 0 ? formatNumber(resignations) : "—"}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums font-medium text-violet-800 dark:text-violet-300">
                {formatNumber(projRow)}
              </TableCell>
              <TableCell
                className={`text-right text-xs tabular-nums font-semibold ${
                  netVar > 0 ? "text-rose-600" : netVar < 0 ? "text-amber-600" : "text-emerald-600"
                }`}
              >
                {netVar > 0 ? "+" : ""}
                {formatNumber(netVar)}
              </TableCell>
              <TableCell className="min-w-[120px]">
                <Flex justifyContent="start" alignItems="center" className="gap-1.5">
                  <ProgressBar value={Math.min(100, pct)} color={fillBarTremorColor(pct, idealN)} className="min-w-[52px] flex-1 !h-1.5" />
                  <Text className="shrink-0 text-[11px] tabular-nums" style={{ color: gapColor }}>
                    {formatPercent(pct)}
                  </Text>
                </Flex>
              </TableCell>
              <TableCell>
                <Badge size="xs" color={wfmStatusToBadgeColor(statusLbl)}>{statusLbl}</Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      {totals ? (
        <TableFoot>
          <TableRow className="border-t border-orange-200/80 bg-orange-50/50 dark:border-orange-900/50 dark:bg-orange-950/25">
            <TableFooterCell className="text-xs font-semibold tracking-normal text-orange-800 dark:text-orange-200">
              Σ / blended
            </TableFooterCell>
            <TableFooterCell className="text-right text-[11px] tabular-nums font-semibold text-tremor-content-strong">
              {totals.footerRevenueDisplay}
            </TableFooterCell>
            <TableFooterCell className="text-right text-[11px] tabular-nums font-semibold">
              {formatLacs(totals.footerProductivityLacs)}
            </TableFooterCell>
            <TableFooterCell className="text-right text-xs tabular-nums font-semibold">{formatNumber(totals.totIdeal)}</TableFooterCell>
            <TableFooterCell className="text-right text-xs tabular-nums font-semibold">{formatNumber(totals.totActual)}</TableFooterCell>
            <TableFooterCell
              className={`text-right text-xs tabular-nums font-semibold ${
                totals.totVariance > 0 ? "text-rose-600" : totals.totVariance < 0 ? "text-amber-600" : "text-emerald-600"
              }`}
            >
              {totals.totVariance > 0 ? "+" : ""}
              {formatNumber(totals.totVariance)}
            </TableFooterCell>
            <TableFooterCell className="text-right text-xs tabular-nums font-semibold">{formatNumber(totals.totAdditionalHc)}</TableFooterCell>
            <TableFooterCell className="text-right text-xs tabular-nums font-semibold text-sky-800 dark:text-sky-300">
              {formatNumber(totals.totOpenSheet, 0)}
            </TableFooterCell>
            <TableFooterCell className="text-right text-xs tabular-nums font-semibold text-tremor-content-subtle">
              {totals.totResignations > 0 ? formatNumber(totals.totResignations) : "—"}
            </TableFooterCell>
            <TableFooterCell className="text-right text-xs tabular-nums font-semibold text-violet-800 dark:text-violet-300">
              {formatNumber(totals.totProjectedHc)}
            </TableFooterCell>
            <TableFooterCell
              className={`text-right text-xs tabular-nums font-semibold ${
                totals.totNetVar > 0 ? "text-rose-600" : totals.totNetVar < 0 ? "text-amber-600" : "text-emerald-600"
              }`}
            >
              {totals.totNetVar > 0 ? "+" : ""}
              {formatNumber(totals.totNetVar)}
            </TableFooterCell>
            <TableFooterCell>
              <Flex justifyContent="start" alignItems="center" className="gap-1.5">
                <ProgressBar
                  value={Math.min(100, totals.totFill)}
                  color={fillBarTremorColor(totals.totFill, totals.totIdeal)}
                  className="min-w-[52px] flex-1 !h-1.5"
                />
                <Text
                  className="shrink-0 text-[11px] tabular-nums font-semibold"
                  style={{ color: wfmFillColor(totals.totFill, totals.totIdeal) }}
                >
                  {formatPercent(totals.totFill)}
                </Text>
              </Flex>
            </TableFooterCell>
            <TableFooterCell className="text-xs">—</TableFooterCell>
          </TableRow>
        </TableFoot>
      ) : null}
    </Table>
  );
}
