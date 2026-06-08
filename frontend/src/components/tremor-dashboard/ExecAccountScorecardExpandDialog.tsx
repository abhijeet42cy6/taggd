import { useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogPanel,
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
import { Download, Search } from "lucide-react";
import {
  exportExecAccountScorecardCsv,
  type ExecAccountScorecardRow,
} from "@/lib/exec-account-scorecard";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { fmtFinInrMetric, fmtFinRatio } from "@/components/platform/ProductivityAveragesSection";

export function ExecAccountScorecardExpandDialog({
  open,
  onOpenChange,
  fyLabel,
  rows,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  fyLabel: string;
  rows: ExecAccountScorecardRow[];
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.account.toLowerCase().includes(needle) ||
        r.vertical.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} static>
      <DialogPanel className="flex max-h-[min(94vh,920px)] w-full max-w-[min(88rem,calc(100vw-1.25rem))] flex-col overflow-hidden p-0 shadow-tremor-dropdown">
        <div className="border-b border-tremor-border bg-white px-6 py-4">
          <Text className="text-[10px] font-bold uppercase tracking-wider text-orange-600">Account scorecard</Text>
          <Title className="mt-1 text-lg font-semibold text-tremor-content-strong">
            All accounts — {fyLabel}
          </Title>
          <Text className="mt-1 text-sm text-tremor-content-emphasis">
            Actual revenue, CM%, rev productivity, joiner productivity, and PPC rolled up from finance ledger rows
            for the selected FY and filters.
          </Text>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <TextInput
              icon={Search}
              placeholder="Search account or vertical…"
              value={q}
              onValueChange={setQ}
              className="max-w-xs"
            />
            <Button
              type="button"
              size="xs"
              variant="secondary"
              icon={Download}
              onClick={() => exportExecAccountScorecardCsv(filtered, fyLabel)}
              disabled={!filtered.length}
            >
              Download Excel (CSV)
            </Button>
            <Text className="text-xs text-tremor-content-emphasis">
              {filtered.length} account{filtered.length === 1 ? "" : "s"}
            </Text>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-white px-2 pb-4 pt-2">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Account</TableHeaderCell>
                <TableHeaderCell>Vertical</TableHeaderCell>
                <TableHeaderCell className="text-right">Actual revenue</TableHeaderCell>
                <TableHeaderCell className="text-right">CM%</TableHeaderCell>
                <TableHeaderCell className="text-right">Rev productivity</TableHeaderCell>
                <TableHeaderCell className="text-right">Joiner productivity</TableHeaderCell>
                <TableHeaderCell className="text-right">PPC</TableHeaderCell>
                <TableHeaderCell className="text-right">Months</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.account}>
                  <TableCell className="max-w-[220px] truncate font-medium" title={r.account}>
                    {r.account}
                  </TableCell>
                  <TableCell>{r.vertical}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(r.actualRevenueInr)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.cmPct == null ? "—" : formatPercent(r.cmPct)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtFinInrMetric(r.revProductivity)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtFinRatio(r.joinerProductivity)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtFinInrMetric(r.ppcInr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.clientMonthCount}</TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-tremor-content-emphasis">
                    No accounts in scope for {fyLabel}.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogPanel>
    </Dialog>
  );
}
