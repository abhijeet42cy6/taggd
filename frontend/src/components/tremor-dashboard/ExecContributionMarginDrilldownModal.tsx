import { useMemo, useState } from "react";
import {
  Badge,
  BarList,
  Button,
  Card,
  Dialog,
  DialogPanel,
  Flex,
  Grid,
  Metric,
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
import { QuarterlyGroupedBarChart } from "@/components/charts/components/QuarterlyGroupedBarChart";
import { ACTUAL_COLOR, FORECAST_COLOR } from "@/components/charts/chartTokens";
import type { Project } from "@/lib/api";
import type { QuarterPoint } from "@/components/platform/ExecutiveFinanceHero";
import type { FinanceRowVm } from "@/lib/view-models/finance";

const CM_TARGET = 35;

function fmtCrFromInr(n: number): string {
  if (n === 0) return "₹0.00 Cr";
  return `₹${(n / 1e7).toFixed(2)} Cr`;
}

function fmtPct(n: number | null, decimals = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(decimals)}%`;
}

function cmStatusBadge(cmPct: number | null): { label: string; color: "emerald" | "amber" | "rose" | "slate" } {
  if (cmPct == null) return { label: "—", color: "slate" };
  if (cmPct >= CM_TARGET) return { label: "On target", color: "emerald" };
  if (cmPct >= CM_TARGET - 5) return { label: "Monitor", color: "amber" };
  return { label: "Below target", color: "rose" };
}

export type ExecAccountCmRow = {
  account: string;
  vertical: string;
  revInr: number;
  cmInr: number;
  cmPct: number | null;
  projectCount: number;
};

function buildAccountCmRows(rows: FinanceRowVm[], projects: Project[]): ExecAccountCmRow[] {
  const pmap = new Map(projects.map((p) => [p.id, p]));
  const byKey = new Map<string, { display: string; rev: number; cm: number; pids: Set<number> }>();
  for (const r of rows) {
    const display = (r.account_name || "").trim() || "—";
    const key = display.toLowerCase();
    const cur = byKey.get(key) ?? { display, rev: 0, cm: 0, pids: new Set<number>() };
    cur.rev += r.rev_actual_inr ?? 0;
    cur.cm += r.cm_actual_inr ?? 0;
    if (r.project_id != null) cur.pids.add(r.project_id);
    byKey.set(key, cur);
  }
  return Array.from(byKey.values())
    .map((v) => {
      const verticals = new Set<string>();
      for (const pid of v.pids) {
        const pv = pmap.get(pid)?.vertical;
        if (pv && String(pv).trim()) verticals.add(String(pv).trim());
      }
      let vertLabel = "—";
      if (verticals.size === 1) vertLabel = [...verticals][0];
      else if (verticals.size > 1) vertLabel = "Multiple";
      const cmPct = v.rev > 0 ? (v.cm / v.rev) * 100 : null;
      return {
        account: v.display,
        vertical: vertLabel,
        revInr: v.rev,
        cmInr: v.cm,
        cmPct,
        projectCount: v.pids.size,
      };
    })
    .sort((a, b) => b.cmInr - a.cmInr);
}

export type ExecProjectCmRow = {
  id: number;
  label: string;
  accountName: string;
  vertical: string;
  revInr: number;
  cmInr: number;
  cmPct: number | null;
};

function buildProjectCmRows(rows: FinanceRowVm[], projects: Project[]): ExecProjectCmRow[] {
  const pmap = new Map(projects.map((p) => [p.id, p]));
  const byPid = new Map<number, { rev: number; cm: number }>();
  for (const r of rows) {
    const pid = r.project_id;
    if (pid == null) continue;
    const cur = byPid.get(pid) ?? { rev: 0, cm: 0 };
    cur.rev += r.rev_actual_inr ?? 0;
    cur.cm += r.cm_actual_inr ?? 0;
    byPid.set(pid, cur);
  }
  return Array.from(byPid.entries())
    .map(([id, v]) => {
      const p = pmap.get(id);
      const label = (p?.engagement_name?.trim() || p?.account_name?.trim() || `Project ${id}`).trim();
      const accountName = (p?.account_name ?? "—").trim() || "—";
      const vertical = (p?.vertical ?? "—").trim() || "—";
      const cmPct = v.rev > 0 ? (v.cm / v.rev) * 100 : null;
      return { id, label, accountName, vertical, revInr: v.rev, cmInr: v.cm, cmPct };
    })
    .sort((a, b) => b.cmInr - a.cmInr);
}

/** Full-view Tremor dialog: CM% rolled up by account + optional project rows; mirrors revenue drill-down. */
export function ExecContributionMarginDrilldownModal({
  open,
  onOpenChange,
  fyLabel,
  kpiRows,
  projects,
  quarters,
  portfolioCmPct,
  totalCmInr,
  totalRevInr,
  targetAttainmentPct,
  compareFyLabel,
  priorPortfolioCmPct,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  fyLabel: string;
  kpiRows: FinanceRowVm[];
  projects: Project[];
  quarters: QuarterPoint[];
  portfolioCmPct: number;
  totalCmInr: number;
  totalRevInr: number;
  targetAttainmentPct: number;
  compareFyLabel?: string;
  priorPortfolioCmPct?: number;
}) {
  const [q, setQ] = useState("");
  const [vertical, setVertical] = useState("all");
  const [showProjects, setShowProjects] = useState(false);
  const [projQ, setProjQ] = useState("");

  const accountRows = useMemo(() => buildAccountCmRows(kpiRows, projects), [kpiRows, projects]);
  const projectRows = useMemo(() => buildProjectCmRows(kpiRows, projects), [kpiRows, projects]);

  const verticalOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of accountRows) {
      if (r.vertical && r.vertical !== "—" && r.vertical !== "Multiple") s.add(r.vertical);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [accountRows]);

  const filteredAccounts = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return accountRows.filter((r) => {
      if (vertical !== "all" && r.vertical !== vertical) return false;
      if (!needle) return true;
      return r.account.toLowerCase().includes(needle);
    });
  }, [accountRows, q, vertical]);

  const filteredProjects = useMemo(() => {
    const needle = projQ.trim().toLowerCase();
    if (!needle) return projectRows;
    return projectRows.filter(
      (r) =>
        r.label.toLowerCase().includes(needle) ||
        r.accountName.toLowerCase().includes(needle) ||
        String(r.id).includes(needle),
    );
  }, [projectRows, projQ]);

  const topCmBars = useMemo(() => {
    return accountRows.slice(0, 12).map((r) => ({
      name: r.account.length > 36 ? `${r.account.slice(0, 34)}…` : r.account,
      value: r.cmInr,
    }));
  }, [accountRows]);

  const quarterChartData = useMemo(
    () =>
      quarters.map((qpt) => ({
        quarter: qpt.q,
        Target: qpt.planInr / 1e7,
        Actual: qpt.actualInr / 1e7,
      })),
    [quarters],
  );

  const hasQuarterData = quarterChartData.some((d) => d.Target > 0 || d.Actual > 0);

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)}>
      <DialogPanel className="flex max-h-[min(94vh,920px)] w-full max-w-[min(88rem,calc(100vw-1.25rem))] flex-col overflow-hidden p-0 shadow-tremor-dropdown">
        <div className="shrink-0 border-b border-tremor-border bg-gradient-to-r from-amber-50/90 via-white to-white px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 ring-1 ring-amber-200/70">
                <Text className="text-[11px] font-bold uppercase tracking-wide text-amber-950">Contribution margin</Text>
              </span>
              <Title className="mt-2 text-tremor-title text-tremor-content-strong">Account CM% · {fyLabel}</Title>
              <Text className="mt-1 max-w-3xl text-tremor-default text-tremor-content-subtle">
                Ledger CM and revenue rolled up by account (same FY and filters as the executive hero). Target reference:
                {CM_TARGET}% portfolio CM%.
              </Text>
            </div>
            <Button type="button" variant="secondary" color="orange" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>

          <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="mt-5 gap-3">
            <Card decoration="top" decorationColor="amber" className="ring-1 ring-black/[0.04]">
              <Text className="text-tremor-default font-medium text-tremor-content-subtle">Portfolio CM%</Text>
              <Metric className="mt-1 text-tremor-content-strong">{fmtPct(portfolioCmPct, 1)}</Metric>
            </Card>
            <Card decoration="top" decorationColor="slate" className="ring-1 ring-black/[0.04]">
              <Text className="text-tremor-default font-medium text-tremor-content-subtle">CM (FY, ₹ Cr)</Text>
              <Metric className="mt-1 text-tremor-content-strong">{fmtCrFromInr(totalCmInr)}</Metric>
            </Card>
            <Card decoration="top" decorationColor="orange" className="ring-1 ring-black/[0.04]">
              <Text className="text-tremor-default font-medium text-tremor-content-subtle">Revenue (FY, ₹ Cr)</Text>
              <Metric className="mt-1 text-tremor-content-strong">{fmtCrFromInr(totalRevInr)}</Metric>
            </Card>
            <Card decoration="top" decorationColor="emerald" className="ring-1 ring-black/[0.04]">
              <Text className="text-tremor-default font-medium text-tremor-content-subtle">vs {CM_TARGET}% target</Text>
              <Metric className="mt-1 text-tremor-content-strong">{fmtPct(targetAttainmentPct, 1)}</Metric>
            </Card>
          </Grid>

          {priorPortfolioCmPct != null && compareFyLabel ? (
            <Text className="mt-3 text-sm font-medium text-tremor-content-subtle">
              Prior {compareFyLabel} portfolio CM%:{" "}
              <span className="text-tremor-content-strong">{fmtPct(priorPortfolioCmPct, 1)}</span>
            </Text>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 pb-5 pt-4">
          <Grid numItems={1} numItemsLg={2} className="gap-4">
            <Card className="ring-1 ring-black/[0.04]">
              <Title className="text-base text-tremor-content-strong">Top accounts by CM (₹)</Title>
              <Text className="mt-1 text-sm text-tremor-content-subtle">Largest absolute contribution margin in this view (top 12).</Text>
              <div className="mt-4">
                {topCmBars.length === 0 ? (
                  <Text className="py-8 text-center font-medium text-tremor-content-emphasis">No CM rows for this selection</Text>
                ) : (
                  <BarList data={topCmBars} valueFormatter={(n: number) => fmtCrFromInr(n)} color="amber" sortOrder="none" />
                )}
              </div>
            </Card>

            <Card className="ring-1 ring-black/[0.04]">
              <Title className="text-base text-tremor-content-strong">Quarterly CM vs target (₹ Cr)</Title>
              <Text className="mt-1 text-sm text-tremor-content-subtle">
                Target = {CM_TARGET}% of revenue budget in the quarter; actual = sum of CM (same logic as the hero).
              </Text>
              <div className="mt-2 h-[260px] w-full">
                {!hasQuarterData ? (
                  <Flex className="h-full items-center justify-center">
                    <Text className="font-medium text-tremor-content-emphasis">No quarterly CM in range</Text>
                  </Flex>
                ) : (
                  <QuarterlyGroupedBarChart
                    categories={quarterChartData.map((d) => d.quarter)}
                    series={[
                      { name: "Target CM (₹)", data: quarterChartData.map((d) => d.Target), color: FORECAST_COLOR },
                      { name: "Actual CM (₹)", data: quarterChartData.map((d) => d.Actual), color: ACTUAL_COLOR },
                    ]}
                    emptyMessage="No quarterly CM in range"
                  />
                )}
              </div>
            </Card>
          </Grid>

          <Card className="mt-5 ring-1 ring-black/[0.04]">
            <Flex className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Title className="text-base text-tremor-content-strong">All accounts — CM%</Title>
                <Text className="mt-0.5 text-sm text-tremor-content-subtle">
                  {filteredAccounts.length} of {accountRows.length} accounts · CM% = CM ÷ revenue for rolled-up rows
                </Text>
              </div>
              <Grid numItems={1} numItemsSm={2} className="w-full gap-2 sm:max-w-xl">
                <TextInput icon={Search} placeholder="Search account…" value={q} onValueChange={setQ} />
                <Select value={vertical} onValueChange={setVertical}>
                  <SelectItem value="all">All verticals</SelectItem>
                  {verticalOptions.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </Select>
              </Grid>
            </Flex>

            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Account</TableHeaderCell>
                    <TableHeaderCell>Vertical</TableHeaderCell>
                    <TableHeaderCell className="text-right">Projects</TableHeaderCell>
                    <TableHeaderCell className="text-right">Revenue</TableHeaderCell>
                    <TableHeaderCell className="text-right">CM</TableHeaderCell>
                    <TableHeaderCell className="text-right">CM%</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAccounts.map((r) => {
                    const st = cmStatusBadge(r.cmPct);
                    return (
                      <TableRow key={r.account}>
                        <TableCell className="max-w-[220px] font-medium text-tremor-content-strong">{r.account}</TableCell>
                        <TableCell className="text-tremor-content-emphasis">{r.vertical}</TableCell>
                        <TableCell className="text-right tabular-nums text-tremor-content-subtle">
                          {r.projectCount > 0 ? r.projectCount : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-tremor-content-subtle">{fmtCrFromInr(r.revInr)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-tremor-content-strong">
                          {fmtCrFromInr(r.cmInr)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.cmPct != null ? (
                            <span
                              className={
                                r.cmPct >= CM_TARGET
                                  ? "font-semibold text-emerald-600"
                                  : r.cmPct >= CM_TARGET - 5
                                    ? "font-semibold text-amber-700"
                                    : "font-semibold text-rose-600"
                              }
                            >
                              {fmtPct(r.cmPct, 1)}
                            </span>
                          ) : (
                            "—"
                          )}
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
              {filteredAccounts.length === 0 ? (
                <Text className="py-10 text-center font-medium text-tremor-content-emphasis">No accounts match filters</Text>
              ) : null}
            </div>
          </Card>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <Title className="text-base text-tremor-content-strong">Project-level detail</Title>
            <Button type="button" variant="light" color="orange" onClick={() => setShowProjects((v) => !v)}>
              {showProjects ? "Hide project rows" : "Show all projects"}
            </Button>
          </div>

          {showProjects ? (
            <Card className="mt-3 ring-1 ring-black/[0.04]">
              <Text className="text-sm text-tremor-content-subtle">
                One row per project in the FY slice — {filteredProjects.length} of {projectRows.length} shown
              </Text>
              <div className="mt-3 max-w-md">
                <TextInput icon={Search} placeholder="Search project, account, ID…" value={projQ} onValueChange={setProjQ} />
              </div>
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>ID</TableHeaderCell>
                      <TableHeaderCell>Project</TableHeaderCell>
                      <TableHeaderCell>Account</TableHeaderCell>
                      <TableHeaderCell>Vertical</TableHeaderCell>
                      <TableHeaderCell className="text-right">Revenue</TableHeaderCell>
                      <TableHeaderCell className="text-right">CM</TableHeaderCell>
                      <TableHeaderCell className="text-right">CM%</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredProjects.map((r) => {
                      const st = cmStatusBadge(r.cmPct);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="tabular-nums text-tremor-content-subtle">{r.id}</TableCell>
                          <TableCell className="max-w-[200px] truncate font-medium text-tremor-content-strong">{r.label}</TableCell>
                          <TableCell className="max-w-[160px] truncate text-tremor-content-emphasis">{r.accountName}</TableCell>
                          <TableCell className="text-tremor-content-emphasis">{r.vertical}</TableCell>
                          <TableCell className="text-right tabular-nums text-tremor-content-subtle">{fmtCrFromInr(r.revInr)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium text-tremor-content-strong">
                            {fmtCrFromInr(r.cmInr)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.cmPct != null ? (
                              <span
                                className={
                                  r.cmPct >= CM_TARGET
                                    ? "font-semibold text-emerald-600"
                                    : r.cmPct >= CM_TARGET - 5
                                      ? "font-semibold text-amber-700"
                                      : "font-semibold text-rose-600"
                                }
                              >
                                {fmtPct(r.cmPct, 1)}
                              </span>
                            ) : (
                              "—"
                            )}
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
            </Card>
          ) : null}
        </div>
      </DialogPanel>
    </Dialog>
  );
}
