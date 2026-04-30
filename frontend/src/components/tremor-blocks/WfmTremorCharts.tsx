import { useMemo } from "react";
import {
  Badge,
  BarChart,
  DonutChart,
  Flex,
  Metric,
  ProgressBar,
  ScatterChart,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
} from "@tremor/react";
import { formatNumber, formatPercent } from "@/lib/utils";
import { wfmFillBand, wfmStatusLabel, type WfmHcBulletCore } from "@/lib/view-models/wfm";

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

/** Ideal vs actual HC — horizontal grouped bars (Tremor). */
export function WfmHcIdealActualTremorBarChart({ items }: { items: WfmHcBulletCore[] }) {
  if (!items.length) return null;
  const chartData = items.map((item) => ({
    client: item.name.length > 24 ? `${item.name.slice(0, 23)}…` : item.name,
    fullName: item.name,
    "Ideal HC": Math.max(0, Number(item.ideal) || 0),
    "Actual HC": Math.max(0, Number(item.actual) || 0),
  }));
  const h = Math.min(440, Math.max(220, 80 + items.length * 40));
  return (
    <div className="w-full" style={{ height: h }}>
      <BarChart
        className="h-full w-full"
        data={chartData}
        index="client"
        categories={["Ideal HC", "Actual HC"]}
        colors={["teal", "orange"]}
        layout="vertical"
        valueFormatter={(v) => formatNumber(Number(v))}
        yAxisWidth={128}
        barCategoryGap="18%"
        enableLegendSlider={false}
      />
      <Text className="mt-2 block text-center text-[10px] text-tremor-content-subtle">
        Teal = ideal target · Orange = actual headcount · Shared numeric scale
      </Text>
    </div>
  );
}

export type WfmWlBandDatum = { name: string; wl1: number; wl2: number; wl3: number; wl4: number };

/** WL1–4 stacked mix per client (portfolio view). */
export function WfmWlDistributionTremorBarChart({ data }: { data: WfmWlBandDatum[] }) {
  if (!data.length) return null;
  const chartData = data.map((d) => ({
    client: d.name,
    WL1: d.wl1,
    WL2: d.wl2,
    WL3: d.wl3,
    "WL4+": d.wl4,
  }));
  return (
    <BarChart
      className="h-[200px]"
      data={chartData}
      index="client"
      categories={["WL1", "WL2", "WL3", "WL4+"]}
      colors={["orange", "teal", "amber", "rose"]}
      stack
      valueFormatter={(v) => formatNumber(Number(v))}
      yAxisWidth={40}
      barCategoryGap="12%"
      rotateLabelX={{ angle: -28, verticalShift: 18, xAxisHeight: 56 }}
    />
  );
}

/** Donut to 100% band + label shows true fill % (including over-capacity). */
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
  const toPlan = Math.min(100, Math.max(0, f));
  const headroom = Math.max(0.5, 100 - toPlan);
  const donutData = [
    { segment: "Fill (to 100% band)", value: toPlan },
    { segment: "Headroom", value: headroom },
  ];
  return (
    <Flex className="items-start gap-4">
      <DonutChart
        variant="donut"
        data={donutData}
        category="value"
        index="segment"
        colors={["orange", "slate"]}
        className="h-28 w-28 shrink-0"
        valueFormatter={(v) => `${Number(v).toFixed(1)}%`}
        label={formatPercent(f)}
        showLabel
      />
      <div className="min-w-0 flex-1">
        <Text className="text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">{label}</Text>
        <Metric className="mt-1 text-lg tabular-nums text-tremor-content-strong">{formatPercent(f)}</Metric>
        <Text className="mt-1 text-sm text-tremor-content-emphasis">{sublabel}</Text>
        <Text className="mt-2 text-[11px] leading-snug text-tremor-content-subtle">
          Ring shows share up to 100% of the plan band; center shows the true fill rate (can exceed 100%).
        </Text>
      </div>
    </Flex>
  );
}

export type WfmProdScatterPoint = { fullName: string; shortLabel: string; fillPct: number; productivity: number };

/** Fill % vs productivity target — scatter avoids dual-axis scale clash and extreme bar outliers. */
export function WfmFillProductivityScatterTremor({ points }: { points: WfmProdScatterPoint[] }) {
  const chartRows = useMemo(() => {
    return points.map((p) => {
      const prod = p.productivity;
      const prodPct = prod > 1 ? prod : prod * 100;
      return {
        client: p.shortLabel || p.fullName.slice(0, 14),
        fullName: p.fullName,
        fill: Math.round(p.fillPct * 10) / 10,
        prodPct: Math.round(prodPct * 100) / 100,
        size: 28,
      };
    });
  }, [points]);

  if (!chartRows.length) {
    return (
      <div className="flex min-h-[220px] items-center justify-center px-4">
        <Text className="text-center text-sm font-medium text-tremor-content-emphasis">
          Upload WFM data with ideal HC to compare
        </Text>
      </div>
    );
  }

  const maxFill = chartRows.reduce((m, r) => Math.max(m, r.fill), 100);
  const maxXValue = Math.min(450, Math.max(115, Math.ceil(maxFill / 10) * 10 + 15));
  const maxProd = chartRows.reduce((m, r) => Math.max(m, r.prodPct), 8);

  return (
    <div className="w-full space-y-2">
      <ScatterChart
        className="h-[320px]"
        data={chartRows}
        category="client"
        x="fill"
        y="prodPct"
        size="size"
        minXValue={0}
        maxXValue={maxXValue}
        minYValue={0}
        maxYValue={Math.max(8, Math.ceil(maxProd) + 1)}
        xAxisLabel="Fill rate %"
        yAxisLabel="Productivity target %"
        showLegend={false}
        showOpacity
        yAxisWidth={44}
        valueFormatter={{
          x: (v) => `${Number(v).toFixed(1)}%`,
          y: (v) => `${Number(v).toFixed(1)}%`,
          size: () => "",
        }}
        colors={["orange", "amber", "teal", "cyan", "blue", "violet", "rose", "emerald"]}
      />
      <Text className="text-[11px] leading-relaxed text-tremor-content-subtle">
        Each point is a client: horizontal distance from 0% is fill (100% = at ideal HC). Vertical axis is the
        lateral productivity target. Dense clusters near 100% × low target are easier to read than dual-axis bars
        when one client has a very large fill %.
      </Text>
    </div>
  );
}

/** Full-list modal: scan-friendly table with Tremor progress + badges. */
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
      <Text className="mt-3 text-[10px] text-tremor-content-subtle">
        Bar caps at 100% for layout; read the Fill % column for values over 100% (over-capacity).
      </Text>
    </div>
  );
}
