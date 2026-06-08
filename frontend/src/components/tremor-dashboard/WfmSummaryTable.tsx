import React from "react";
import {
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
import { wfmFillBand, wfmFillColor, type WfmSummaryRowVm } from "@/lib/view-models/wfm";

function formatWfmRowRevenueTarget(raw: number | null | undefined): string {
  const v = Number(raw);
  if (!Number.isFinite(v) || v === 0) return "—";
  const inr = Math.abs(v) > 500_000 ? v : v * 100_000;
  return formatLargeCurrency(inr);
}

function fillBarColor(pct: number, ideal: number): "emerald" | "amber" | "rose" {
  const b = wfmFillBand(pct, ideal);
  if (b === "strong") return "emerald";
  if (b === "watch") return "amber";
  return "rose";
}

const tableClass =
  "text-tremor-default [&_tbody_td]:px-2 [&_tbody_td]:py-1.5 [&_tbody_td]:text-xs [&_tfoot_td]:px-2 [&_tfoot_td]:py-1.5 [&_tfoot_td]:text-xs [&_thead_th]:px-2 [&_thead_th]:py-2 [&_thead_th]:text-[11px] [&_thead_th]:font-semibold [&_thead_th]:normal-case [&_thead_th]:tracking-normal [&_thead_th]:text-tremor-content-emphasis dark:[&_thead_th]:text-dark-tremor-content-emphasis [&_thead_th]:border-b [&_thead_th]:border-tremor-border dark:[&_thead_th]:border-dark-tremor-border";

export function WfmSummaryTable({
  rows,
  labelTitle,
  labelSubtitle,
  totals,
}: {
  rows: WfmSummaryRowVm[];
  labelTitle: string;
  labelSubtitle: string;
  totals: WfmSummaryRowVm | null;
}) {
  return (
    <Table className={tableClass}>
      <TableHead>
        <TableRow>
          <TableHeaderCell className="min-w-[148px]">
            <Text className="block text-[11px] font-semibold leading-tight">{labelTitle}</Text>
            <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle">
              {labelSubtitle}
            </Text>
          </TableHeaderCell>
          <TableHeaderCell className="min-w-[96px] text-right">
            <Text className="block text-[11px] font-semibold leading-tight">Target revenue</Text>
            <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle">
              Workbook YTD
            </Text>
          </TableHeaderCell>
          <TableHeaderCell className="text-right text-[11px] font-semibold">Target productivity</TableHeaderCell>
          <TableHeaderCell className="text-right text-[11px] font-semibold">Ideal HC</TableHeaderCell>
          <TableHeaderCell className="text-right text-[11px] font-semibold">Actual HC</TableHeaderCell>
          <TableHeaderCell className="min-w-[88px] text-right">
            <Text className="block text-[11px] font-semibold leading-tight">Variance</Text>
            <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle">
              Ideal − actual
            </Text>
          </TableHeaderCell>
          <TableHeaderCell className="text-right text-[11px] font-semibold">Additional HC</TableHeaderCell>
          <TableHeaderCell className="text-right text-[11px] font-semibold">Open position</TableHeaderCell>
          <TableHeaderCell className="text-right text-[11px] font-semibold">Resignation</TableHeaderCell>
          <TableHeaderCell className="min-w-[88px] text-right">
            <Text className="block text-[11px] font-semibold leading-tight">Projected HC</Text>
            <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle">
              Actual + addl + open − resign
            </Text>
          </TableHeaderCell>
          <TableHeaderCell className="min-w-[88px] text-right">
            <Text className="block text-[11px] font-semibold leading-tight">Net variance</Text>
            <Text className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-tremor-content-subtle">
              Actual − projected
            </Text>
          </TableHeaderCell>
          <TableHeaderCell className="text-[11px] font-semibold">Fill rate</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((r) => {
          const gapColor = wfmFillColor(r.fill_pct, r.ideal_hc);
          return (
            <TableRow key={r.key}>
              <TableCell className="max-w-[200px]">
                <Text className="text-xs font-semibold text-tremor-content-strong">{r.labelPrimary}</Text>
                <Text className="block text-[11px] text-tremor-content-subtle">{r.labelSecondary}</Text>
                <Text className="block text-[10px] text-tremor-content-subtle">{r.client_count} client{r.client_count === 1 ? "" : "s"}</Text>
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums text-tremor-content-strong">
                {formatWfmRowRevenueTarget(r.lateral_revenue_target)}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums text-tremor-content-subtle">
                {r.lateral_productivity_target > 0 ? formatLacs(r.lateral_productivity_target) : "—"}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">{formatNumber(r.ideal_hc)}</TableCell>
              <TableCell className="text-right text-xs tabular-nums">{formatNumber(r.actual_hc_total)}</TableCell>
              <TableCell
                className={`text-right text-xs tabular-nums font-semibold ${
                  r.variance_ideal_actual > 0 ? "text-rose-600" : r.variance_ideal_actual < 0 ? "text-amber-600" : "text-emerald-600"
                }`}
              >
                {r.variance_ideal_actual > 0 ? "+" : ""}
                {formatNumber(r.variance_ideal_actual)}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums text-tremor-content-subtle">{formatNumber(r.additional_hc)}</TableCell>
              <TableCell className="text-right text-xs tabular-nums text-sky-800 dark:text-sky-300">{formatNumber(r.open_positions)}</TableCell>
              <TableCell className="text-right text-xs tabular-nums text-tremor-content-subtle">
                {r.resignations > 0 ? formatNumber(r.resignations) : "—"}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums font-medium text-violet-800 dark:text-violet-300">
                {formatNumber(r.projected_hc)}
              </TableCell>
              <TableCell
                className={`text-right text-xs tabular-nums font-semibold ${
                  r.net_variance_actual_projected > 0
                    ? "text-emerald-600"
                    : r.net_variance_actual_projected < 0
                      ? "text-rose-600"
                      : "text-tremor-content-subtle"
                }`}
              >
                {r.net_variance_actual_projected > 0 ? "+" : ""}
                {formatNumber(r.net_variance_actual_projected)}
              </TableCell>
              <TableCell className="min-w-[120px]">
                <Flex justifyContent="start" alignItems="center" className="gap-1.5">
                  <ProgressBar
                    value={Math.min(100, r.fill_pct)}
                    color={fillBarColor(r.fill_pct, r.ideal_hc)}
                    className="min-w-[52px] flex-1 !h-1.5"
                  />
                  <Text className="shrink-0 text-[11px] tabular-nums" style={{ color: gapColor }}>
                    {formatPercent(r.fill_pct)}
                  </Text>
                </Flex>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      {totals ? (
        <TableFoot>
          <TableRow className="border-t border-orange-200/80 bg-orange-50/50 dark:border-orange-900/50 dark:bg-orange-950/25">
            <TableFooterCell className="text-xs font-semibold text-orange-800 dark:text-orange-200">
              {totals.labelPrimary}
              <span className="mt-0.5 block text-[10px] font-normal text-tremor-content-subtle">{totals.labelSecondary}</span>
            </TableFooterCell>
            <TableFooterCell className="text-right text-[11px] tabular-nums font-semibold">
              {formatWfmRowRevenueTarget(totals.lateral_revenue_target)}
            </TableFooterCell>
            <TableFooterCell className="text-right text-[11px] tabular-nums font-semibold">
              {totals.lateral_productivity_target > 0 ? formatLacs(totals.lateral_productivity_target) : "—"}
            </TableFooterCell>
            <TableFooterCell className="text-right text-xs tabular-nums font-semibold">{formatNumber(totals.ideal_hc)}</TableFooterCell>
            <TableFooterCell className="text-right text-xs tabular-nums font-semibold">{formatNumber(totals.actual_hc_total)}</TableFooterCell>
            <TableFooterCell
              className={`text-right text-xs tabular-nums font-semibold ${
                totals.variance_ideal_actual > 0 ? "text-rose-600" : totals.variance_ideal_actual < 0 ? "text-amber-600" : "text-emerald-600"
              }`}
            >
              {totals.variance_ideal_actual > 0 ? "+" : ""}
              {formatNumber(totals.variance_ideal_actual)}
            </TableFooterCell>
            <TableFooterCell className="text-right text-xs tabular-nums font-semibold">{formatNumber(totals.additional_hc)}</TableFooterCell>
            <TableFooterCell className="text-right text-xs tabular-nums font-semibold text-sky-800 dark:text-sky-300">
              {formatNumber(totals.open_positions)}
            </TableFooterCell>
            <TableFooterCell className="text-right text-xs tabular-nums font-semibold text-tremor-content-subtle">
              {totals.resignations > 0 ? formatNumber(totals.resignations) : "—"}
            </TableFooterCell>
            <TableFooterCell className="text-right text-xs tabular-nums font-semibold text-violet-800 dark:text-violet-300">
              {formatNumber(totals.projected_hc)}
            </TableFooterCell>
            <TableFooterCell
              className={`text-right text-xs tabular-nums font-semibold ${
                totals.net_variance_actual_projected > 0
                  ? "text-emerald-600"
                  : totals.net_variance_actual_projected < 0
                    ? "text-rose-600"
                    : "text-tremor-content-subtle"
              }`}
            >
              {totals.net_variance_actual_projected > 0 ? "+" : ""}
              {formatNumber(totals.net_variance_actual_projected)}
            </TableFooterCell>
            <TableFooterCell>
              <Flex justifyContent="start" alignItems="center" className="gap-1.5">
                <ProgressBar
                  value={Math.min(100, totals.fill_pct)}
                  color={fillBarColor(totals.fill_pct, totals.ideal_hc)}
                  className="min-w-[52px] flex-1 !h-1.5"
                />
                <Text
                  className="shrink-0 text-[11px] tabular-nums font-semibold"
                  style={{ color: wfmFillColor(totals.fill_pct, totals.ideal_hc) }}
                >
                  {formatPercent(totals.fill_pct)}
                </Text>
              </Flex>
            </TableFooterCell>
          </TableRow>
        </TableFoot>
      ) : null}
    </Table>
  );
}
