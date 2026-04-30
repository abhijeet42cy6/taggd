import {
  Badge,
  Button,
  Dialog,
  DialogPanel,
  Flex,
  ProgressBar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
  Title,
} from "@tremor/react";
import { cn, formatNumber, formatPercent } from "@/lib/utils";
import {
  wfmFillBand,
  wfmFillColor,
  wfmFillPct,
  wfmMatchesFilter,
  wfmStatusLabel,
  type WfmBenchmarkRowVm,
} from "@/lib/view-models/wfm";

export type WfmPerformFilter = "all" | "strong" | "watch" | "risk";

export type WfmExpandMode = null | "hc" | "gap" | "benchmark";

export type WfmBulletItem = {
  name: string;
  actual: number;
  ideal: number;
  color: string;
  pct: number;
  row: WfmBenchmarkRowVm;
};

function barFillColor(pct: number, ideal: number): "emerald" | "amber" | "rose" {
  const b = wfmFillBand(pct, ideal);
  if (b === "strong") return "emerald";
  if (b === "watch") return "amber";
  return "rose";
}

export function wfmStatusToBadgeColor(label: "Strong" | "Watch" | "At Risk"): "emerald" | "amber" | "rose" {
  if (label === "Strong") return "emerald";
  if (label === "Watch") return "amber";
  return "rose";
}

export function WfmFilterChipRow({
  value,
  onChange,
  className,
}: {
  value: WfmPerformFilter;
  onChange: (v: WfmPerformFilter) => void;
  className?: string;
}) {
  const item = (key: WfmPerformFilter, label: string, color: "orange" | "emerald" | "amber" | "rose") => (
    <Button
      key={key}
      type="button"
      size="xs"
      variant={value === key ? "primary" : "secondary"}
      color={color}
      className="!text-[11px] !leading-tight"
      onClick={() => onChange(key)}
    >
      {label}
    </Button>
  );
  return (
    <Flex className={cn("flex-wrap gap-1.5 sm:gap-2", className)}>
      {item("all", "All", "orange")}
      {item("strong", "On plan 70–100%", "emerald")}
      {item("watch", "Watch 50–69%", "amber")}
      {item("risk", ">100% or <50%", "rose")}
    </Flex>
  );
}

export function WfmExpandDialog({
  mode,
  items,
  rows,
  filter,
  onFilterChange,
  onClose,
}: {
  mode: WfmExpandMode;
  items: WfmBulletItem[];
  rows: WfmBenchmarkRowVm[];
  filter: WfmPerformFilter;
  onFilterChange: (v: WfmPerformFilter) => void;
  onClose: () => void;
}) {
  if (!mode) return null;

  const titles: Record<NonNullable<WfmExpandMode>, string> = {
    hc: "Ideal vs Actual HC — All Clients",
    gap: "Resource Gap Summary — All Clients",
    benchmark: "Workforce Benchmark Snapshot — All Clients",
  };

  const filteredItems = items.filter((b) => wfmMatchesFilter(b.pct, b.ideal, filter));
  const filteredRows = rows.filter((r) => {
    const ideal = Number(r.ideal_hc ?? 0);
    const actual = Number(r.actual_hc_total ?? 0);
    const pct = wfmFillPct(actual, ideal);
    return wfmMatchesFilter(pct, ideal, filter);
  });

  const count = mode === "benchmark" ? filteredRows.length : filteredItems.length;

  return (
    <Dialog open onClose={onClose}>
      <DialogPanel className="flex max-h-[min(92vh,880px)] max-w-6xl flex-col overflow-hidden p-0 shadow-tremor-dropdown">
        <div className="shrink-0 border-b border-tremor-border px-4 py-3 sm:px-5 sm:py-3.5">
          <Flex justifyContent="between" alignItems="start" className="flex-wrap gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <Title className="text-base font-semibold text-tremor-content-strong sm:text-lg">{titles[mode]}</Title>
              <Text className="mt-0.5 text-tremor-default text-tremor-content-subtle">
                {count} client{count === 1 ? "" : "s"} · filter narrows the list
              </Text>
            </div>
            <Flex className="shrink-0 flex-wrap items-center gap-3">
              <WfmFilterChipRow value={filter} onChange={onFilterChange} />
              <Button type="button" variant="secondary" color="slate" onClick={onClose}>
                Close
              </Button>
            </Flex>
          </Flex>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 pb-6 pt-4">
          {mode === "hc" &&
            (filteredItems.length === 0 ? (
              <Text className="text-tremor-default text-tremor-content-subtle">No clients match this filter</Text>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Client</TableHeaderCell>
                    <TableHeaderCell>Fill</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actual / Ideal</TableHeaderCell>
                    <TableHeaderCell className="text-right">%</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredItems.map((item) => {
                    const barPct = Math.min(100, item.pct);
                    const statusLbl = wfmStatusLabel(item.pct, item.ideal);
                    return (
                      <TableRow key={item.name}>
                        <TableCell className="max-w-[200px] truncate font-medium text-tremor-content-strong">
                          {item.name}
                        </TableCell>
                        <TableCell className="min-w-[140px]">
                          <ProgressBar value={barPct} color={barFillColor(item.pct, item.ideal)} className="mt-1" />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-tremor-content-subtle">
                          {formatNumber(item.actual)} / {formatNumber(item.ideal)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium" style={{ color: item.color }}>
                          {formatPercent(item.pct)}
                        </TableCell>
                        <TableCell>
                          <Badge size="xs" color={wfmStatusToBadgeColor(statusLbl)}>
                            {statusLbl}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ))}

          {mode === "gap" &&
            (filteredItems.length === 0 ? (
              <Text className="text-tremor-default text-tremor-content-subtle">No clients match this filter</Text>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Client</TableHeaderCell>
                    <TableHeaderCell className="text-right">Ideal HC</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actual HC</TableHeaderCell>
                    <TableHeaderCell className="text-right">HC Gap</TableHeaderCell>
                    <TableHeaderCell className="text-right">Fill rate</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredItems.map((b) => {
                    const gap = b.ideal - b.actual;
                    const statusLbl = wfmStatusLabel(b.pct, b.ideal);
                    return (
                      <TableRow key={b.name}>
                        <TableCell className="font-medium text-tremor-content-strong">{b.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(b.ideal)}</TableCell>
                        <TableCell className="text-right tabular-nums" style={{ color: b.color }}>
                          {formatNumber(b.actual)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums" style={{ color: b.color }}>
                          {gap >= 0 ? "−" : "+"}
                          {formatNumber(Math.abs(gap))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums" style={{ color: b.color }}>
                          {formatPercent(b.pct)}
                        </TableCell>
                        <TableCell>
                          <Badge size="xs" color={wfmStatusToBadgeColor(statusLbl)}>
                            {statusLbl}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ))}

          {mode === "benchmark" &&
            (filteredRows.length === 0 ? (
              <Text className="text-tremor-default text-tremor-content-subtle">No clients match this filter</Text>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Client</TableHeaderCell>
                    <TableHeaderCell>Practice head</TableHeaderCell>
                    <TableHeaderCell className="text-right">Lateral tgt</TableHeaderCell>
                    <TableHeaderCell className="text-right">Productivity</TableHeaderCell>
                    <TableHeaderCell className="text-right">Ideal HC</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actual HC</TableHeaderCell>
                    <TableHeaderCell className="text-right">HC Gap</TableHeaderCell>
                    <TableHeaderCell className="text-right">Fill rate</TableHeaderCell>
                    <TableHeaderCell className="text-right">WL1</TableHeaderCell>
                    <TableHeaderCell className="text-right">WL2</TableHeaderCell>
                    <TableHeaderCell className="text-right">WL3+</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRows.map((r, i) => {
                    const idealN = Number(r.ideal_hc ?? 0);
                    const actualN = Number(r.actual_hc_total ?? 0);
                    const hcGap = idealN - actualN;
                    const pct = wfmFillPct(actualN, idealN);
                    const gapColor = wfmFillColor(pct, idealN);
                    const statusLbl = wfmStatusLabel(pct, idealN);
                    return (
                      <TableRow key={i}>
                        <TableCell className="max-w-[180px] truncate font-medium text-tremor-content-strong">
                          {r.account_name || `Project ${r.project_id}`}
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate text-tremor-content-subtle" title={r.practice_head || ""}>
                          {r.practice_head || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.lateral_hc_target != null ? formatNumber(r.lateral_hc_target) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.lateral_productivity_target != null ? formatPercent(r.lateral_productivity_target) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(idealN)}</TableCell>
                        <TableCell className="text-right tabular-nums" style={{ color: gapColor }}>
                          {formatNumber(actualN)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums" style={{ color: gapColor }}>
                          {hcGap >= 0 ? "−" : "+"}
                          {formatNumber(Math.abs(hcGap))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums" style={{ color: gapColor }}>
                          {formatPercent(pct)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.wl1_hires ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.wl2_hires ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {(r.wl3_hires ?? 0) + (r.wl4_hires ?? 0) || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge size="xs" color={wfmStatusToBadgeColor(statusLbl)}>
                            {statusLbl}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ))}
        </div>
      </DialogPanel>
    </Dialog>
  );
}
