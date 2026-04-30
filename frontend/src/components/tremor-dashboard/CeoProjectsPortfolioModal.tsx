import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogPanel,
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
import type { Project } from "@/lib/api";

export type CeoProjectFyRow = {
  id: number;
  label: string;
  accountName: string;
  vertical: string;
  region: string;
  chargeCode: string;
  actualInr: number;
  budgetInr: number;
  attainment: number | null;
};

function fmtCrFromInr(n: number): string {
  if (n === 0) return "—";
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

export function buildCeoProjectFyRows(
  fyRows: Array<{ project_id?: number | null; rev_actual_inr: number; rev_budget_inr: number }>,
  projects: Project[],
): CeoProjectFyRow[] {
  const pmap = new Map(projects.map((p) => [p.id, p]));
  const byPid = new Map<number, { actual: number; budget: number }>();
  for (const r of fyRows) {
    const pid = r.project_id;
    if (pid == null) continue;
    const cur = byPid.get(pid) ?? { actual: 0, budget: 0 };
    cur.actual += r.rev_actual_inr;
    cur.budget += r.rev_budget_inr;
    byPid.set(pid, cur);
  }
  return Array.from(byPid.entries())
    .map(([id, v]) => {
      const p = pmap.get(id);
      const label = (p?.engagement_name?.trim() || p?.account_name?.trim() || `Project ${id}`).trim();
      const accountName = (p?.account_name ?? "—").trim() || "—";
      const vertical = (p?.vertical ?? "—").trim() || "—";
      const region = (p?.region ?? "—").trim() || "—";
      const chargeCode = (p?.charge_code ?? "").trim();
      const attainment = v.budget > 0 ? (v.actual / v.budget) * 100 : null;
      return {
        id,
        label,
        accountName,
        vertical,
        region,
        chargeCode,
        actualInr: v.actual,
        budgetInr: v.budget,
        attainment,
      };
    })
    .sort((a, b) => b.actualInr - a.actualInr);
}

/** Full-screen-style Tremor dialog: all projects with FY revenue + search / filters. */
export function CeoProjectsPortfolioModal({
  open,
  onOpenChange,
  fyLabel,
  rows,
}: {
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  fyLabel: string;
  rows: CeoProjectFyRow[];
}) {
  const [q, setQ] = useState("");
  const [vertical, setVertical] = useState("all");

  const verticalOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.vertical && r.vertical !== "—") s.add(r.vertical);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (vertical !== "all" && r.vertical !== vertical) return false;
      if (!needle) return true;
      return (
        r.label.toLowerCase().includes(needle) ||
        r.accountName.toLowerCase().includes(needle) ||
        String(r.id).includes(needle) ||
        r.chargeCode.toLowerCase().includes(needle) ||
        r.vertical.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, vertical]);

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)}>
      <DialogPanel className="flex max-h-[min(92vh,880px)] max-w-6xl flex-col overflow-hidden p-0 shadow-tremor-dropdown">
        <div className="shrink-0 border-b border-tremor-border px-6 py-4">
          <Title className="text-tremor-title text-tremor-content-strong">Projects — {fyLabel}</Title>
          <Text className="mt-1 text-tremor-default text-tremor-content-subtle">
            Revenue and budget rolled from finance rows for this fiscal year ({filtered.length} of {rows.length} shown)
          </Text>
          <Grid numItems={1} numItemsSm={2} numItemsLg={3} className="mt-4 gap-3">
            <TextInput
              icon={Search}
              placeholder="Search project, account, ID, charge code…"
              value={q}
              onValueChange={setQ}
            />
            <Select value={vertical} onValueChange={setVertical}>
              <SelectItem value="all">All verticals</SelectItem>
              {verticalOptions.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </Select>
            <Flex justifyContent="end" alignItems="end">
              <Button type="button" variant="secondary" color="orange" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </Flex>
          </Grid>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4 pt-2">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>ID</TableHeaderCell>
                <TableHeaderCell>Project</TableHeaderCell>
                <TableHeaderCell>Account</TableHeaderCell>
                <TableHeaderCell>Vertical</TableHeaderCell>
                <TableHeaderCell className="text-right">Revenue</TableHeaderCell>
                <TableHeaderCell className="text-right">Budget</TableHeaderCell>
                <TableHeaderCell className="text-right">Attainment</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((r) => {
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
          {filtered.length === 0 ? (
            <Text className="py-12 text-center font-medium text-tremor-content-emphasis">No projects match your filters</Text>
          ) : null}
        </div>
      </DialogPanel>
    </Dialog>
  );
}
