import type { CSSProperties } from "react";
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
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Project } from "@/lib/api";
import type { QuarterPoint } from "@/components/platform/ExecutiveFinanceHero";
import type { FinanceRowVm } from "@/lib/view-models/finance";
import { buildCeoProjectFyRows } from "@/components/tremor-dashboard/CeoProjectsPortfolioModal";

function fmtCrFromInr(n: number): string {
  if (n === 0) return "₹0.00 Cr";
  return `₹${(n / 1e7).toFixed(2)} Cr`;
}

function fmtPct(n: number | null, decimals = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(decimals)}%`;
}

function statusBadge(att: number | null): { label: string; color: "emerald" | "amber" | "rose" | "slate" } {
  if (att == null) return { label: "—", color: "slate" };
  if (att >= 100) return { label: "On track", color: "emerald" };
  if (att >= 70) return { label: "Monitor", color: "amber" };
  return { label: "At risk", color: "rose" };
}

export type ExecAccountRevenueRow = {
  account: string;
  vertical: string;
  actualInr: number;
  budgetInr: number;
  attainment: number | null;
  projectCount: number;
};

function buildAccountRevenueRows(rows: FinanceRowVm[], projects: Project[]): ExecAccountRevenueRow[] {
  const pmap = new Map(projects.map((p) => [p.id, p]));
  const byKey = new Map<string, { display: string; actual: number; budget: number; pids: Set<number> }>();
  for (const r of rows) {
    const display = (r.account_name || "").trim() || "—";
    const key = display.toLowerCase();
    const cur = byKey.get(key) ?? { display, actual: 0, budget: 0, pids: new Set<number>() };
    cur.actual += r.rev_actual_inr ?? 0;
    cur.budget += r.rev_budget_inr ?? 0;
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
      const attainment = v.budget > 0 ? (v.actual / v.budget) * 100 : null;
      return {
        account: v.display,
        vertical: vertLabel,
        actualInr: v.actual,
        budgetInr: v.budget,
        attainment,
        projectCount: v.pids.size,
      };
    })
    .sort((a, b) => b.actualInr - a.actualInr);
}

const chartTooltipStyle: CSSProperties = {
  backgroundColor: "rgb(255 255 255)",
  border: "1px solid rgb(229 229 229)",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
};

/** Near full-view Tremor dialog: actual revenue rolled up by account + optional project detail, with charts. */
export function ExecRevenueActualDrilldownModal({
  open,
  onOpenChange,
  fyLabel,
  kpiRows,
  projects,
  quarters,
  totalActualInr,
  totalBudgetInr,
  attainmentPct,
  compareFyLabel,
  priorActualInr,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  fyLabel: string;
  kpiRows: FinanceRowVm[];
  projects: Project[];
  quarters: QuarterPoint[];
  totalActualInr: number;
  totalBudgetInr: number;
  attainmentPct: number;
  compareFyLabel?: string;
  priorActualInr?: number;
}) {
  const [q, setQ] = useState("");
  const [vertical, setVertical] = useState("all");
  const [showProjects, setShowProjects] = useState(false);
  const [projQ, setProjQ] = useState("");

  const accountRows = useMemo(() => buildAccountRevenueRows(kpiRows, projects), [kpiRows, projects]);
  const projectRows = useMemo(() => buildCeoProjectFyRows(kpiRows, projects), [kpiRows, projects]);

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
        String(r.id).includes(needle) ||
        r.chargeCode.toLowerCase().includes(needle),
    );
  }, [projectRows, projQ]);

  const topAccountBars = useMemo(() => {
    const slice = accountRows.slice(0, 12);
    return slice.map((r) => ({
      name: r.account.length > 36 ? `${r.account.slice(0, 34)}…` : r.account,
      value: r.actualInr,
    }));
  }, [accountRows]);

  const quarterChartData = useMemo(
    () =>
      quarters.map((qpt) => ({
        quarter: qpt.q,
        Plan: qpt.planInr / 1e7,
        Actual: qpt.actualInr / 1e7,
      })),
    [quarters],
  );

  const hasQuarterData = quarterChartData.some((d) => d.Plan > 0 || d.Actual > 0);

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)}>
      <DialogPanel className="flex max-h-[min(94vh,920px)] w-full max-w-[min(88rem,calc(100vw-1.25rem))] flex-col overflow-hidden p-0 shadow-tremor-dropdown">
        <div className="shrink-0 border-b border-tremor-border bg-gradient-to-r from-orange-50/80 via-white to-white px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="inline-flex rounded-full bg-orange-100 px-2.5 py-1 ring-1 ring-orange-200/70">
                <Text className="text-[11px] font-bold uppercase tracking-wide text-orange-900">Revenue — actual</Text>
              </span>
              <Title className="mt-2 text-tremor-title text-tremor-content-strong">Account breakdown · {fyLabel}</Title>
              <Text className="mt-1 max-w-3xl text-tremor-default text-tremor-content-subtle">
                Ledger rows behind the executive hero card: every account and project that rolls into actual revenue for
                the selected fiscal year and dashboard filters.
              </Text>
            </div>
            <Button type="button" variant="secondary" color="orange" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>

          <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="mt-5 gap-3">
            <Card decoration="top" decorationColor="orange" className="ring-1 ring-black/[0.04]">
              <Text className="text-tremor-default font-medium text-tremor-content-subtle">Actual (FY)</Text>
              <Metric className="mt-1 text-tremor-content-strong">{fmtCrFromInr(totalActualInr)}</Metric>
            </Card>
            <Card decoration="top" decorationColor="slate" className="ring-1 ring-black/[0.04]">
              <Text className="text-tremor-default font-medium text-tremor-content-subtle">Budget (FY)</Text>
              <Metric className="mt-1 text-tremor-content-strong">{fmtCrFromInr(totalBudgetInr)}</Metric>
            </Card>
            <Card decoration="top" decorationColor="amber" className="ring-1 ring-black/[0.04]">
              <Text className="text-tremor-default font-medium text-tremor-content-subtle">Attainment</Text>
              <Metric className="mt-1 text-tremor-content-strong">{fmtPct(attainmentPct, 1)}</Metric>
            </Card>
            {priorActualInr != null && compareFyLabel ? (
              <Card decoration="top" decorationColor="blue" className="ring-1 ring-black/[0.04]">
                <Text className="text-tremor-default font-medium text-tremor-content-subtle">{compareFyLabel} actual</Text>
                <Metric className="mt-1 text-tremor-content-strong">{fmtCrFromInr(priorActualInr)}</Metric>
              </Card>
            ) : (
              <Card decoration="top" decorationColor="blue" className="ring-1 ring-black/[0.04]">
                <Text className="text-tremor-default font-medium text-tremor-content-subtle">Accounts</Text>
                <Metric className="mt-1 text-tremor-content-strong">{accountRows.length}</Metric>
              </Card>
            )}
          </Grid>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 pb-5 pt-4">
          <Grid numItems={1} numItemsLg={2} className="gap-4">
            <Card className="ring-1 ring-black/[0.04]">
              <Title className="text-base text-tremor-content-strong">Top accounts by actual</Title>
              <Text className="mt-1 text-sm text-tremor-content-subtle">Largest contributors in this view (top 12).</Text>
              <div className="mt-4">
                {topAccountBars.length === 0 ? (
                  <Text className="py-8 text-center font-medium text-tremor-content-emphasis">No revenue rows for this selection</Text>
                ) : (
                  <BarList data={topAccountBars} valueFormatter={(n: number) => fmtCrFromInr(n)} color="orange" sortOrder="none" />
                )}
              </div>
            </Card>

            <Card className="ring-1 ring-black/[0.04]">
              <Title className="text-base text-tremor-content-strong">Quarterly plan vs actual</Title>
              <Text className="mt-1 text-sm text-tremor-content-subtle">Indian FY quarters (₹ Cr).</Text>
              <div className="mt-2 h-[260px] w-full">
                {!hasQuarterData ? (
                  <Flex className="h-full items-center justify-center">
                    <Text className="font-medium text-tremor-content-emphasis">No quarterly plan/actual in range</Text>
                  </Flex>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={quarterChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(229 229 229)" vertical={false} />
                      <XAxis dataKey="quarter" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={44}
                        tickFormatter={(v) => `${Number(v).toFixed(0)}`}
                      />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        formatter={(v: number | string) => [`₹${Number(v).toFixed(2)} Cr`, ""]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Plan" fill="rgb(148 163 184)" name="Plan" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Actual" fill="rgb(234 88 12)" name="Actual" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </Grid>

          <Card className="mt-5 ring-1 ring-black/[0.04]">
            <Flex className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Title className="text-base text-tremor-content-strong">All accounts</Title>
                <Text className="mt-0.5 text-sm text-tremor-content-subtle">
                  {filteredAccounts.length} of {accountRows.length} accounts · sums match filtered ledger rows
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
                    <TableHeaderCell className="text-right">Actual</TableHeaderCell>
                    <TableHeaderCell className="text-right">Budget</TableHeaderCell>
                    <TableHeaderCell className="text-right">Attainment</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAccounts.map((r) => {
                    const st = statusBadge(r.attainment);
                    return (
                      <TableRow key={r.account}>
                        <TableCell className="max-w-[220px] font-medium text-tremor-content-strong">{r.account}</TableCell>
                        <TableCell className="text-tremor-content-emphasis">{r.vertical}</TableCell>
                        <TableCell className="text-right tabular-nums text-tremor-content-subtle">
                          {r.projectCount > 0 ? r.projectCount : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-tremor-content-strong">
                          {fmtCrFromInr(r.actualInr)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-tremor-content-subtle">
                          {fmtCrFromInr(r.budgetInr)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.attainment != null ? (
                            <span
                              className={
                                r.attainment >= 100
                                  ? "font-semibold text-emerald-600"
                                  : r.attainment >= 70
                                    ? "font-semibold text-amber-700"
                                    : "font-semibold text-rose-600"
                              }
                            >
                              {fmtPct(r.attainment, 0)}
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
                One row per project_id in the same FY slice — {filteredProjects.length} of {projectRows.length} shown
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
                      <TableHeaderCell className="text-right">Actual</TableHeaderCell>
                      <TableHeaderCell className="text-right">Budget</TableHeaderCell>
                      <TableHeaderCell className="text-right">Attainment</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredProjects.map((r) => {
                      const st = statusBadge(r.attainment);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="tabular-nums text-tremor-content-subtle">{r.id}</TableCell>
                          <TableCell className="max-w-[200px] truncate font-medium text-tremor-content-strong">{r.label}</TableCell>
                          <TableCell className="max-w-[160px] truncate text-tremor-content-emphasis">{r.accountName}</TableCell>
                          <TableCell className="text-tremor-content-emphasis">{r.vertical}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium text-tremor-content-strong">
                            {fmtCrFromInr(r.actualInr)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-tremor-content-subtle">
                            {fmtCrFromInr(r.budgetInr)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.attainment != null ? (
                              <span
                                className={
                                  r.attainment >= 100
                                    ? "font-semibold text-emerald-600"
                                    : r.attainment >= 70
                                      ? "font-semibold text-amber-700"
                                      : "font-semibold text-rose-600"
                                }
                              >
                                {fmtPct(r.attainment, 0)}
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
