import React, { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Flex,
  Grid,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
  TextInput,
  Title,
} from "@tremor/react";
import { Search } from "lucide-react";
import { queries } from "@/lib/api";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { portfolioCompositeVm, type PortfolioRow } from "@/lib/view-models/portfolio";
import { TremorDashboardSection } from "@/components/tremor-dashboard/TremorDashboardSection";
import {
  PortfolioFillActivityScatter,
  PortfolioReqStatusStackedBar,
} from "@/components/tremor-blocks/PortfolioIntelligenceTremorCharts";

function csvEscapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadPortfolioCsv(rows: PortfolioRow[]) {
  const headers = [
    "Client / Project",
    "Vertical",
    "Total Reqs",
    "Closed",
    "Active",
    "On Hold",
    "Fill %",
    "Activity %",
    "Revenue",
    "Composite",
    "Status",
  ];
  const lines = [
    headers.map(csvEscapeCell).join(","),
    ...rows.map((r) => {
      const statusLabel = r.composite >= 75 ? "Strong" : r.composite >= 50 ? "Watch" : "At Risk";
      return [
        r.name,
        r.vertical,
        String(r.positions),
        String(r.closed),
        String(r.active),
        String(r.on_hold),
        String(r.fillScore),
        String(r.activityScore),
        r.revenue > 0 ? String(r.revenue) : "",
        String(r.composite),
        statusLabel,
      ]
        .map(csvEscapeCell)
        .join(",");
    }),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `portfolio-intelligence-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PortfolioIntelligence() {
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableSearch, setTableSearch] = useState("");
  const [tableVertical, setTableVertical] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [monitor, projects] = await Promise.allSettled([queries.globalMonitor(), queries.projects()]);
        if (cancelled) return;
        if (monitor.status !== "fulfilled") {
          setRows([]);
          return;
        }
        const stats = monitor.value.project_stats ?? [];

        const metaMap = new Map<number, { name: string; vertical?: string }>();
        if (projects.status === "fulfilled") {
          for (const p of projects.value) {
            metaMap.set(p.id, {
              name: p.account_name || p.filename?.replace(".xlsx", "") || `Project-${p.id}`,
              vertical: p.vertical,
            });
          }
        }

        const enriched = stats.map((s) => {
          const m = metaMap.get(s.id);
          return {
            ...s,
            name: m?.name ?? s.name?.replace(".xlsx", "") ?? `Project-${s.id}`,
            vertical: m?.vertical,
          };
        });

        setRows(portfolioCompositeVm(enriched, []));
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const verticalOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.vertical && r.vertical !== "—") s.add(r.vertical);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const needle = tableSearch.trim().toLowerCase();
    let list = rows;
    if (needle) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          r.vertical.toLowerCase().includes(needle) ||
          String(r.id).includes(needle),
      );
    }
    if (tableVertical !== "all") {
      list = list.filter((r) => r.vertical === tableVertical);
    }
    return list;
  }, [rows, tableSearch, tableVertical]);

  const chartRows = filteredRows.length > 0 ? filteredRows : rows;

  const compositeBadge = (composite: number) => {
    if (composite >= 75) return { label: "Strong", color: "emerald" as const };
    if (composite >= 50) return { label: "Watch", color: "amber" as const };
    return { label: "At Risk", color: "rose" as const };
  };

  const scoreToneClass = (v: number) =>
    v >= 75 ? "font-semibold text-emerald-600" : v >= 50 ? "font-semibold text-amber-700" : "font-semibold text-rose-600";

  return (
    <div className="portfolio-intel-tremor space-y-7 pb-12 pt-2">
      <div className="min-w-0">
        <Title className="text-3xl font-bold tracking-tight text-tremor-content-strong">Portfolio Intelligence</Title>
        <Text className="mt-1 block text-sm font-medium text-tremor-content-emphasis">
          Real hiring performance across all projects · sorted by composite score
        </Text>
      </div>

      <Grid numItems={1} numItemsLg={2} className="gap-6">
        <TremorDashboardSection tag="Performance" title="Fill Rate vs Activity Rate (Bubble = Revenue)" noPad>
          <div className="bg-white px-2 pb-4 pt-4">
            {loading ? (
              <div className="flex min-h-[260px] items-center justify-center">
                <Text className="text-tremor-content-subtle">Loading…</Text>
              </div>
            ) : (
              <PortfolioFillActivityScatter rows={chartRows} />
            )}
          </div>
        </TremorDashboardSection>

        <TremorDashboardSection tag="Pipeline" title="Req Status Distribution — Top 8 by Volume" noPad>
          <div className="bg-white px-2 pb-4 pt-4">
            {loading ? (
              <div className="flex min-h-[260px] items-center justify-center">
                <Text className="text-tremor-content-subtle">Loading…</Text>
              </div>
            ) : (
              <PortfolioReqStatusStackedBar rows={chartRows} />
            )}
          </div>
        </TremorDashboardSection>
      </Grid>

      <TremorDashboardSection
        tag="Portfolio"
        title={`Portfolio Composite Score — ${filteredRows.length} projects`}
        action="Export CSV"
        onAction={() => downloadPortfolioCsv(filteredRows)}
        toolbar={
          <Grid numItems={1} numItemsSm={2} className="items-end gap-3">
            <div className="sm:col-span-1">
              <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-600">Search</Text>
              <TextInput
                icon={Search}
                placeholder="Project, vertical, or ID…"
                value={tableSearch}
                onValueChange={setTableSearch}
              />
            </div>
            <div>
              <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-600">Vertical</Text>
              <Select value={tableVertical} onValueChange={setTableVertical}>
                <SelectItem value="all">All verticals</SelectItem>
                {verticalOptions.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </Select>
            </div>
            {(tableSearch.trim() || tableVertical !== "all") && (
              <Flex justifyContent="start" alignItems="end" className="sm:col-span-2">
                <Button type="button" variant="light" color="orange" size="xs" onClick={() => {
                  setTableSearch("");
                  setTableVertical("all");
                }}>
                  Clear filters
                </Button>
              </Flex>
            )}
          </Grid>
        }
        noPad
      >
        <div className="border-t border-tremor-border bg-white px-2 pb-4 pt-4">
          <Flex alignItems="start" justifyContent="between" className="mb-4 flex-wrap gap-6 px-2">
            <Text className="max-w-[42rem] text-xs leading-relaxed text-tremor-content-subtle">
              Composite = Fill 40% · Activity 30% · Hold-free 20% · Rev quality 10%
            </Text>
            <Flex className="flex-wrap gap-3 text-xs text-tremor-content-subtle">
              <span>
                <span className="font-medium text-emerald-600">■</span> ≥75 Strong
              </span>
              <span>
                <span className="font-medium text-amber-700">■</span> 50–74 Watch
              </span>
              <span>
                <span className="font-medium text-rose-600">■</span> &lt;50 At Risk
              </span>
            </Flex>
          </Flex>

          {loading ? (
            <Text className="block py-16 text-center text-tremor-content-subtle">Loading…</Text>
          ) : rows.length === 0 ? (
            <Text className="block px-4 py-12 text-center font-medium text-tremor-content-emphasis">
              Upload project data to populate portfolio scores
            </Text>
          ) : filteredRows.length === 0 ? (
            <Text className="block px-4 py-12 text-center font-medium text-tremor-content-emphasis">
              No projects match these filters
            </Text>
          ) : (
            <div className="overflow-x-auto px-2">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Client / Project</TableHeaderCell>
                    <TableHeaderCell>Vertical</TableHeaderCell>
                    <TableHeaderCell className="text-right">Total Reqs</TableHeaderCell>
                    <TableHeaderCell className="text-right">Closed</TableHeaderCell>
                    <TableHeaderCell className="text-right">Active</TableHeaderCell>
                    <TableHeaderCell className="text-right">On Hold</TableHeaderCell>
                    <TableHeaderCell className="text-right">Fill %</TableHeaderCell>
                    <TableHeaderCell className="text-right">Activity %</TableHeaderCell>
                    <TableHeaderCell className="text-right">Revenue</TableHeaderCell>
                    <TableHeaderCell className="text-right">Composite</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRows.map((r) => {
                    const st = compositeBadge(r.composite);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="max-w-[200px] font-medium text-tremor-content-strong">
                          <span className="line-clamp-2">{r.name}</span>
                        </TableCell>
                        <TableCell className="text-tremor-content-emphasis">{r.vertical}</TableCell>
                        <TableCell className="text-right tabular-nums text-tremor-content-strong">
                          {r.positions.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                          {r.closed.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-orange-700 dark:text-orange-400">
                          {r.active.toLocaleString()}
                        </TableCell>
                        <TableCell
                          className={
                            r.on_hold > 0
                              ? "text-right tabular-nums font-medium text-amber-700 dark:text-amber-400"
                              : "text-right tabular-nums text-tremor-content-subtle"
                          }
                        >
                          {r.on_hold.toLocaleString()}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${scoreToneClass(r.fillScore)}`}>
                          {formatPercent(r.fillScore)}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${scoreToneClass(r.activityScore)}`}>
                          {formatPercent(r.activityScore)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-tremor-content-strong">
                          {r.revenue > 0 ? formatCurrency(r.revenue) : "—"}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${scoreToneClass(r.composite)}`}>
                          {r.composite}
                        </TableCell>
                        <TableCell>
                          <Badge color={st.color} size="sm">
                            {st.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </TremorDashboardSection>
    </div>
  );
}
