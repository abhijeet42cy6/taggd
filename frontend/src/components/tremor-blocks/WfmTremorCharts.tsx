import { useMemo } from "react";
import { Text } from "@tremor/react";
import { formatLacs, formatNumber, formatPercent } from "@/lib/utils";
import { wfmFillBand, wfmStatusLabel, type WfmHcBulletCore } from "@/lib/view-models/wfm";
import { EChartsCanvas } from "@/components/charts/EChartsCanvas";
import { buildHorizontalGroupedBarOption, buildStackedVerticalBarOption, buildScatterChartOption, buildDonutPieOption } from "@/components/charts/optionBuilders";
import { CHART_COLORS, PO_COLOR, ACTUAL_COLOR } from "@/components/charts/chartTokens";
import { colorForSeries } from "@/components/charts/chartColorRules";
import {
  Badge,
  Flex,
  Metric,
  ProgressBar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@tremor/react";

function barTone(pct: number, ideal: number): "emerald" | "amber" | "rose" {
  const b = wfmFillBand(pct, ideal);
  if (b === "strong") return "emerald";
  if (b === "watch") return "amber";
  return "rose";
}

function statusBadgeColor(label: "Strong" | "Watch" | "At Risk"): "emerald" | "amber" | "rose" {
  if (label === "Strong") return "emerald";
  if (label === "Watch") return "amber";
  return "rose";
}

export function WfmHcIdealActualTremorBarChart({ items }: { items: WfmHcBulletCore[] }) {
  const option = useMemo(() => {
    if (!items.length) return null;
    const names = items.map((i) => (i.name.length > 24 ? `${i.name.slice(0, 23)}…` : i.name));
    return buildHorizontalGroupedBarOption(names, [
      { name: "Ideal HC", data: items.map((i) => i.ideal), color: PO_COLOR },
      { name: "Actual HC", data: items.map((i) => i.actual), color: ACTUAL_COLOR },
    ]);
  }, [items]);
  if (!items.length) return null;
  const h = Math.min(440, Math.max(220, 80 + items.length * 40));
  return (
    <div className="w-full">
      <EChartsCanvas option={option} height={h} />
      <Text className="mt-2 block text-center text-[10px] text-tremor-content-subtle">
        Teal = ideal target · Orange = actual headcount · Shared numeric scale
      </Text>
    </div>
  );
}

export type WfmWlBandDatum = { name: string; wl1: number; wl2: number; wl3: number; wl4: number };

export function WfmWlDistributionTremorBarChart({ data }: { data: WfmWlBandDatum[] }) {
  const option = useMemo(() => {
    if (!data.length) return null;
    return buildStackedVerticalBarOption(
      data.map((d) => d.name),
      [
        { name: "WL1", data: data.map((d) => d.wl1), color: CHART_COLORS[0] },
        { name: "WL2", data: data.map((d) => d.wl2), color: CHART_COLORS[1] },
        { name: "WL3", data: data.map((d) => d.wl3), color: CHART_COLORS[2] },
        { name: "WL4+", data: data.map((d) => d.wl4), color: CHART_COLORS[3], roundTop: true },
      ]
    );
  }, [data]);
  if (!data.length) return null;
  return <EChartsCanvas option={option} height={200} />;
}

export function WfmCapacityTremorBlock({
  fillRate,
  label,
  sublabel,
}: {
  fillRate: number;
  label: string;
  sublabel: string;
}) {
  const f = Number.isFinite(fillRate) ? fillRate : 0;
  const option = useMemo(
    () => buildDonutPieOption(
      [
        { name: "Fill (to 100% band)", value: Math.min(100, Math.max(0, f)) },
        { name: "Headroom", value: Math.max(0.5, 100 - Math.min(100, Math.max(0, f))) },
      ],
      [CHART_COLORS[0], CHART_COLORS[8]]
    ),
    [f]
  );
  return (
    <Flex className="items-start gap-4">
      <div className="h-28 w-28 shrink-0">
        <EChartsCanvas option={option} height={112} />
      </div>
      <div className="min-w-0 flex-1">
        <Text className="text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">{label}</Text>
        <Metric className="mt-1 text-lg tabular-nums text-tremor-content-strong">{formatPercent(f)}</Metric>
        <Text className="mt-1 text-sm text-tremor-content-emphasis">{sublabel}</Text>
      </div>
    </Flex>
  );
}

export type WfmProdScatterPoint = { fullName: string; shortLabel: string; fillPct: number; productivity: number };

export function WfmFillProductivityScatterTremor({ points }: { points: WfmProdScatterPoint[] }) {
  const option = useMemo(() => {
    const chartRows = points.map((p, i) => ({
      name: p.shortLabel || p.fullName.slice(0, 14),
      x: Math.round(p.fillPct * 10) / 10,
      y: Math.round(p.productivity * 100) / 100,
      z: 28,
      color: colorForSeries(i),
    }));
    if (!chartRows.length) return null;
    return buildScatterChartOption(chartRows, "Fill rate %", "Productivity target (lacs)");
  }, [points]);

  if (!option) {
    return (
      <div className="flex min-h-[220px] items-center justify-center px-4">
        <Text className="text-center text-sm font-medium text-tremor-content-emphasis">
          Upload WFM data with ideal HC to compare
        </Text>
      </div>
    );
  }
  return (
    <div className="w-full space-y-2">
      <EChartsCanvas option={option} height={320} />
    </div>
  );
}

export function WfmHcModalComparisonTable({ items }: { items: WfmHcBulletCore[] }) {
  if (!items.length) return null;
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[720px] text-xs">
        <TableHead>
          <TableRow>
            <TableHeaderCell>Client</TableHeaderCell>
            <TableHeaderCell className="text-right">Ideal HC</TableHeaderCell>
            <TableHeaderCell className="text-right">Actual HC</TableHeaderCell>
            <TableHeaderCell>Fill to plan</TableHeaderCell>
            <TableHeaderCell className="text-right">Fill %</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => {
            const status = wfmStatusLabel(item.pct, item.ideal);
            const barPct = Math.min(100, item.pct);
            return (
              <TableRow key={item.name}>
                <TableCell className="max-w-[11rem] font-medium text-tremor-content-strong">{item.name}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(item.ideal)}</TableCell>
                <TableCell className="text-right tabular-nums text-tremor-content-emphasis">{formatNumber(item.actual)}</TableCell>
                <TableCell className="min-w-[8rem] max-w-[14rem]">
                  <ProgressBar value={barPct} color={barTone(item.pct, item.ideal)} />
                </TableCell>
                <TableCell className="text-right tabular-nums text-tremor-content-strong">{formatPercent(item.pct)}</TableCell>
                <TableCell>
                  <Badge color={statusBadgeColor(status)} size="xs">
                    {status}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
