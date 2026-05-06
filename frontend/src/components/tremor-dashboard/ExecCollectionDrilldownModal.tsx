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
  Switch,
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

function fmtCrFromInr(n: number): string {
  if (n === 0) return "₹0.00 Cr";
  return `₹${(n / 1e7).toFixed(2)} Cr`;
}

function fmtPct(n: number | null, decimals = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(decimals)}%`;
}

function unbilledRiskBadge(unbPctRev: number | null): { label: string; color: "emerald" | "amber" | "rose" | "slate" } {
  if (unbPctRev == null) return { label: "—", color: "slate" };
  if (unbPctRev <= 0) return { label: "Clear", color: "emerald" };
  if (unbPctRev > 10) return { label: "High", color: "rose" };
  if (unbPctRev > 5) return { label: "Watch", color: "amber" };
  return { label: "Low", color: "emerald" };
}

function collStatusBadge(att: number | null): { label: string; color: "emerald" | "amber" | "rose" | "slate" } {
  if (att == null) return { label: "—", color: "slate" };
  if (att >= 90) return { label: "On track", color: "emerald" };
  if (att >= 70) return { label: "Monitor", color: "amber" };
  return { label: "Below", color: "rose" };
}

export type ExecAccountCollectionRow = {
  account: string;
  vertical: string;
  projectCount: number;
  revInr: number;
  collectedInr: number;
  collectionTargetInr: number;
  unbilledInr: number;
  badDebtInr: number;
  collAtt: number | null;
  unbPctRev: number | null;
};

function buildAccountCollectionRows(rows: FinanceRowVm[], projects: Project[]): ExecAccountCollectionRow[] {
  const pmap = new Map(projects.map((p) => [p.id, p]));
  const byKey = new Map<
    string,
    { display: string; rev: number; coll: number; ct: number; unb: number; bd: number; pids: Set<number> }
  >();
  for (const r of rows) {
    const display = (r.account_name || "").trim() || "—";
    const key = display.toLowerCase();
    const cur = byKey.get(key) ?? { display, rev: 0, coll: 0, ct: 0, unb: 0, bd: 0, pids: new Set<number>() };
    cur.rev += r.rev_actual_inr ?? 0;
    cur.coll += r.collected_inr ?? 0;
    cur.ct += r.collection_target_inr ?? 0;
    cur.unb += r.unbilled_inr ?? 0;
    cur.bd += r.bad_debt_inr ?? 0;
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
      const collAtt = v.ct > 0 ? (v.coll / v.ct) * 100 : null;
      const unbPctRev = v.rev > 0 ? (v.unb / v.rev) * 100 : null;
      return {
        account: v.display,
        vertical: vertLabel,
        projectCount: v.pids.size,
        revInr: v.rev,
        collectedInr: v.coll,
        collectionTargetInr: v.ct,
        unbilledInr: v.unb,
        badDebtInr: v.bd,
        collAtt,
        unbPctRev,
      };
    })
    .sort((a, b) => b.unbilledInr - a.unbilledInr);
}

export type ExecProjectCollectionRow = {
  id: number;
  label: string;
  accountName: string;
  vertical: string;
  revInr: number;
  collectedInr: number;
  collectionTargetInr: number;
  unbilledInr: number;
  badDebtInr: number;
  collAtt: number | null;
  unbPctRev: number | null;
};

function buildProjectCollectionRows(rows: FinanceRowVm[], projects: Project[]): ExecProjectCollectionRow[] {
  const pmap = new Map(projects.map((p) => [p.id, p]));
  const byPid = new Map<number, { rev: number; coll: number; ct: number; unb: number; bd: number }>();
  for (const r of rows) {
    const pid = r.project_id;
    if (pid == null) continue;
    const cur = byPid.get(pid) ?? { rev: 0, coll: 0, ct: 0, unb: 0, bd: 0 };
    cur.rev += r.rev_actual_inr ?? 0;
    cur.coll += r.collected_inr ?? 0;
    cur.ct += r.collection_target_inr ?? 0;
    cur.unb += r.unbilled_inr ?? 0;
    cur.bd += r.bad_debt_inr ?? 0;
    byPid.set(pid, cur);
  }
  return Array.from(byPid.entries())
    .map(([id, v]) => {
      const p = pmap.get(id);
      const label = (p?.engagement_name?.trim() || p?.account_name?.trim() || `Project ${id}`).trim();
      const accountName = (p?.account_name ?? "—").trim() || "—";
      const vertical = (p?.vertical ?? "—").trim() || "—";
      const collAtt = v.ct > 0 ? (v.coll / v.ct) * 100 : null;
      const unbPctRev = v.rev > 0 ? (v.unb / v.rev) * 100 : null;
      return {
        id,
        label,
        accountName,
        vertical,
        revInr: v.rev,
        collectedInr: v.coll,
        collectionTargetInr: v.ct,
        unbilledInr: v.unb,
        badDebtInr: v.bd,
        collAtt,
        unbPctRev,
      };
    })
    .sort((a, b) => b.unbilledInr - a.unbilledInr);
}

const chartTooltipStyle: CSSProperties = {
  backgroundColor: "rgb(255 255 255)",
  border: "1px solid rgb(229 229 229)",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
};

/** Collection + unbilled drill-down: matches revenue / CM modal chrome; highlights unbilled by account. */
export function ExecCollectionDrilldownModal({
  open,
  onOpenChange,
  fyLabel,
  kpiRows,
  projects,
  quarters,
  totalCollectedInr,
  totalCollectionTargetInr,
  collectionAttainmentPct,
  totalUnbilledInr,
  totalBadDebtInr,
  totalRevInr,
  portfolioUnbPctRev,
  compareFyLabel,
  priorCollectedInr,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  fyLabel: string;
  kpiRows: FinanceRowVm[];
  projects: Project[];
  quarters: QuarterPoint[];
  totalCollectedInr: number;
  totalCollectionTargetInr: number;
  collectionAttainmentPct: number;
  totalUnbilledInr: number;
  totalBadDebtInr: number;
  totalRevInr: number;
  portfolioUnbPctRev: number;
  compareFyLabel?: string;
  priorCollectedInr?: number;
}) {
  const [q, setQ] = useState("");
  const [vertical, setVertical] = useState("all");
  const [unbilledOnly, setUnbilledOnly] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [projQ, setProjQ] = useState("");

  const accountRows = useMemo(() => buildAccountCollectionRows(kpiRows, projects), [kpiRows, projects]);
  const projectRows = useMemo(() => buildProjectCollectionRows(kpiRows, projects), [kpiRows, projects]);

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
      if (unbilledOnly && r.unbilledInr <= 0) return false;
      if (vertical !== "all" && r.vertical !== vertical) return false;
      if (!needle) return true;
      return r.account.toLowerCase().includes(needle);
    });
  }, [accountRows, q, vertical, unbilledOnly]);

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

  const topUnbilledBars = useMemo(() => {
    const withUnb = accountRows.filter((r) => r.unbilledInr > 0).slice(0, 12);
    return withUnb.map((r) => ({
      name: r.account.length > 36 ? `${r.account.slice(0, 34)}…` : r.account,
      value: r.unbilledInr,
    }));
  }, [accountRows]);

  const quarterChartData = useMemo(
    () =>
      quarters.map((qpt) => ({
        quarter: qpt.q,
        Target: qpt.planInr / 1e7,
        Collected: qpt.actualInr / 1e7,
      })),
    [quarters],
  );

  const hasQuarterData = quarterChartData.some((d) => d.Target > 0 || d.Collected > 0);

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)}>
      <DialogPanel className="flex max-h-[min(94vh,920px)] w-full max-w-[min(88rem,calc(100vw-1.25rem))] flex-col overflow-hidden p-0 shadow-tremor-dropdown">
        <div className="shrink-0 border-b border-tremor-border bg-gradient-to-r from-orange-50/80 via-white to-white px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="inline-flex rounded-full bg-orange-100 px-2.5 py-1 ring-1 ring-orange-200/70">
                <Text className="text-[11px] font-bold uppercase tracking-wide text-orange-900">Collection</Text>
              </span>
              <Title className="mt-2 text-tremor-title text-tremor-content-strong">Unbilled by account · {fyLabel}</Title>
              <Text className="mt-1 max-w-3xl text-tremor-default text-tremor-content-subtle">
                Collected vs collection target by quarter, with a full account list of unbilled and bad debt — same FY and
                filters as the executive hero.
              </Text>
            </div>
            <Button type="button" variant="secondary" color="orange" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>

          <Grid numItems={1} numItemsSm={2} numItemsLg={5} className="mt-5 gap-3">
            <Card decoration="top" decorationColor="orange" className="ring-1 ring-black/[0.04]">
              <Text className="text-tremor-default font-medium text-tremor-content-subtle">Collected (FY)</Text>
              <Metric className="mt-1 text-tremor-content-strong">{fmtCrFromInr(totalCollectedInr)}</Metric>
            </Card>
            <Card decoration="top" decorationColor="slate" className="ring-1 ring-black/[0.04]">
              <Text className="text-tremor-default font-medium text-tremor-content-subtle">Target (FY)</Text>
              <Metric className="mt-1 text-tremor-content-strong">{fmtCrFromInr(totalCollectionTargetInr)}</Metric>
            </Card>
            <Card decoration="top" decorationColor="amber" className="ring-1 ring-black/[0.04]">
              <Text className="text-tremor-default font-medium text-tremor-content-subtle">Attainment</Text>
              <Metric className="mt-1 text-tremor-content-strong">{fmtPct(collectionAttainmentPct, 1)}</Metric>
            </Card>
            <Card decoration="top" decorationColor="orange" className="ring-1 ring-black/[0.04]">
              <Text className="text-tremor-default font-medium text-tremor-content-subtle">Unbilled (FY)</Text>
              <Metric className="mt-1 text-tremor-content-strong">{fmtCrFromInr(totalUnbilledInr)}</Metric>
            </Card>
            <Card decoration="top" decorationColor="rose" className="ring-1 ring-black/[0.04]">
              <Text className="text-tremor-default font-medium text-tremor-content-subtle">Bad debt</Text>
              <Metric className="mt-1 text-tremor-content-strong">{fmtCrFromInr(totalBadDebtInr)}</Metric>
            </Card>
          </Grid>

          <Text className="mt-3 text-sm text-tremor-content-subtle">
            Unbilled as % of revenue (portfolio):{" "}
            <span className="font-semibold text-tremor-content-strong">{fmtPct(portfolioUnbPctRev, 1)}</span>
            {priorCollectedInr != null && compareFyLabel ? (
              <>
                {" "}
                · Prior {compareFyLabel} collected:{" "}
                <span className="font-semibold text-tremor-content-strong">{fmtCrFromInr(priorCollectedInr)}</span>
              </>
            ) : null}
          </Text>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 pb-5 pt-4">
          <Grid numItems={1} numItemsLg={2} className="gap-4">
            <Card className="ring-1 ring-black/[0.04]">
              <Title className="text-base text-tremor-content-strong">Top accounts by unbilled</Title>
              <Text className="mt-1 text-sm text-tremor-content-subtle">Largest unbilled balances in this view (top 12 with unbilled &gt; 0).</Text>
              <div className="mt-4">
                {topUnbilledBars.length === 0 ? (
                  <Text className="py-8 text-center font-medium text-tremor-content-emphasis">No unbilled in this selection</Text>
                ) : (
                  <BarList data={topUnbilledBars} valueFormatter={(n: number) => fmtCrFromInr(n)} color="orange" sortOrder="none" />
                )}
              </div>
            </Card>

            <Card className="ring-1 ring-black/[0.04]">
              <Title className="text-base text-tremor-content-strong">Quarterly collection vs target</Title>
              <Text className="mt-1 text-sm text-tremor-content-subtle">Collection target vs collected (₹ Cr).</Text>
              <div className="mt-2 h-[260px] w-full">
                {!hasQuarterData ? (
                  <Flex className="h-full items-center justify-center">
                    <Text className="font-medium text-tremor-content-emphasis">No quarterly collection in range</Text>
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
                      <Bar dataKey="Target" fill="rgb(148 163 184)" name="Target" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Collected" fill="rgb(234 88 12)" name="Collected" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </Grid>

          <Card className="mt-5 ring-1 ring-black/[0.04]">
            <Flex className="flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <Title className="text-base text-tremor-content-strong">All accounts — unbilled & collection</Title>
                <Text className="mt-0.5 text-sm text-tremor-content-subtle">
                  {filteredAccounts.length} of {accountRows.length} accounts · sorted by unbilled (highest first)
                </Text>
              </div>
              <Grid numItems={1} numItemsSm={2} numItemsLg={3} className="w-full gap-2 lg:max-w-3xl">
                <TextInput icon={Search} placeholder="Search account…" value={q} onValueChange={setQ} />
                <Select value={vertical} onValueChange={setVertical}>
                  <SelectItem value="all">All verticals</SelectItem>
                  {verticalOptions.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </Select>
                <Flex justifyContent="start" alignItems="center" className="gap-2 px-1">
                  <Switch id="exec-coll-unb-only" checked={unbilledOnly} onChange={setUnbilledOnly} color="orange" />
                  <label htmlFor="exec-coll-unb-only" className="text-sm font-medium text-tremor-content-emphasis">
                    Unbilled only
                  </label>
                </Flex>
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
                    <TableHeaderCell className="text-right">Collected</TableHeaderCell>
                    <TableHeaderCell className="text-right">Coll. target</TableHeaderCell>
                    <TableHeaderCell className="text-right">Coll. %</TableHeaderCell>
                    <TableHeaderCell className="text-right">Unbilled</TableHeaderCell>
                    <TableHeaderCell className="text-right">Unbilled % rev</TableHeaderCell>
                    <TableHeaderCell className="text-right">Bad debt</TableHeaderCell>
                    <TableHeaderCell>Unbilled risk</TableHeaderCell>
                    <TableHeaderCell>Collection</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAccounts.map((r) => {
                    const ur = unbilledRiskBadge(r.unbPctRev);
                    const cs = collStatusBadge(r.collAtt);
                    return (
                      <TableRow key={r.account}>
                        <TableCell className="max-w-[200px] font-medium text-tremor-content-strong">{r.account}</TableCell>
                        <TableCell className="text-tremor-content-emphasis">{r.vertical}</TableCell>
                        <TableCell className="text-right tabular-nums text-tremor-content-subtle">
                          {r.projectCount > 0 ? r.projectCount : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-tremor-content-subtle">{fmtCrFromInr(r.revInr)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-tremor-content-strong">
                          {fmtCrFromInr(r.collectedInr)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-tremor-content-subtle">
                          {fmtCrFromInr(r.collectionTargetInr)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.collAtt != null ? (
                            <span
                              className={
                                r.collAtt >= 90
                                  ? "font-semibold text-emerald-600"
                                  : r.collAtt >= 70
                                    ? "font-semibold text-amber-700"
                                    : "font-semibold text-rose-600"
                              }
                            >
                              {fmtPct(r.collAtt, 0)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-orange-700">
                          {fmtCrFromInr(r.unbilledInr)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.unbPctRev != null ? (
                            <span className={r.unbPctRev > 10 ? "font-semibold text-rose-600" : "text-tremor-content-strong"}>
                              {fmtPct(r.unbPctRev, 1)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell
                          className={
                            r.badDebtInr > 0 ? "text-right tabular-nums font-semibold text-rose-600" : "text-right tabular-nums text-tremor-content-subtle"
                          }
                        >
                          {fmtCrFromInr(r.badDebtInr)}
                        </TableCell>
                        <TableCell>
                          <Badge color={ur.color} size="sm">
                            {ur.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge color={cs.color} size="sm">
                            {cs.label}
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
                One row per project — {filteredProjects.length} of {projectRows.length} shown · sorted by unbilled
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
                      <TableHeaderCell className="text-right">Collected</TableHeaderCell>
                      <TableHeaderCell className="text-right">Target</TableHeaderCell>
                      <TableHeaderCell className="text-right">Unbilled</TableHeaderCell>
                      <TableHeaderCell className="text-right">Unbilled % rev</TableHeaderCell>
                      <TableHeaderCell>Unbilled risk</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredProjects.map((r) => {
                      const ur = unbilledRiskBadge(r.unbPctRev);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="tabular-nums text-tremor-content-subtle">{r.id}</TableCell>
                          <TableCell className="max-w-[200px] truncate font-medium text-tremor-content-strong">{r.label}</TableCell>
                          <TableCell className="max-w-[160px] truncate text-tremor-content-emphasis">{r.accountName}</TableCell>
                          <TableCell className="text-tremor-content-emphasis">{r.vertical}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium text-tremor-content-strong">
                            {fmtCrFromInr(r.collectedInr)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-tremor-content-subtle">
                            {fmtCrFromInr(r.collectionTargetInr)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold text-orange-700">
                            {fmtCrFromInr(r.unbilledInr)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.unbPctRev != null ? (
                              <span className={r.unbPctRev > 10 ? "font-semibold text-rose-600" : "text-tremor-content-strong"}>
                                {fmtPct(r.unbPctRev, 1)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge color={ur.color} size="sm">
                              {ur.label}
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
