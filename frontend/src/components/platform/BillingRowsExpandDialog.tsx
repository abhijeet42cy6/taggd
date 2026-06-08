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
import type { RevenueBillingRow } from "@/lib/api";
import { formatLargeCurrency } from "@/lib/utils";

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadBillingExcel(rows: RevenueBillingRow[]) {
  const headers = [
    "id",
    "project_id",
    "account_name",
    "update_date",
    "fiscal_year_label",
    "project_manager",
    "revenue_booked_inr",
    "mmf_inr",
    "net_revenue_inr",
    "total_joiners",
    "taggd_joiner",
    "er_ijp_other_count",
    "other_joiner_fee_inr",
    "rph_inr",
    "total_joining_fee_inr",
    "invoice_number",
    "invoice_amount_inr",
    "collection_received_inr",
    "workflow_status",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.id),
        csvCell(r.project_id),
        csvCell(r.account_name),
        csvCell(r.update_date),
        csvCell(r.fiscal_year_label),
        csvCell(r.project_manager),
        csvCell(r.revenue_booked_inr),
        csvCell(r.mmf_inr),
        csvCell(r.net_revenue_inr),
        csvCell(r.total_joiners),
        csvCell(r.taggd_joiner),
        csvCell(r.er_ijp_other_count),
        csvCell(r.er_ijp_other_fee_inr),
        csvCell(r.rph_inr),
        csvCell(r.total_joining_fee_inr),
        csvCell(r.invoice_number),
        csvCell(r.invoice_amount_inr),
        csvCell(r.collection_received_inr),
        csvCell(r.workflow?.validation_status ?? ""),
      ].join(","),
    );
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `billing-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatWorkflowLabel(raw: string | null | undefined): string {
  const s = (raw || "draft").trim();
  if (!s) return "Draft";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtCur(v: number | null | undefined): string {
  return v != null && Number.isFinite(v) ? formatLargeCurrency(v) : "—";
}

function fmtInt(v: number | null | undefined): string {
  return v != null && Number.isFinite(v) ? v.toLocaleString() : "—";
}

export function BillingRowsExpandDialog({
  open,
  onOpenChange,
  rows,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  rows: RevenueBillingRow[];
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const hay = [
        String(r.id),
        r.account_name,
        r.project_manager,
        r.invoice_number,
        r.fiscal_year_label,
        `prj-${r.project_id}`,
        String(r.project_id),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} static>
      <DialogPanel className="flex max-h-[min(94vh,920px)] w-full max-w-[min(96rem,calc(100vw-1.25rem))] flex-col overflow-hidden p-0 shadow-tremor-dropdown">
        <div className="border-b border-tremor-border bg-white px-6 py-4">
          <Text className="text-[10px] font-bold uppercase tracking-wider text-orange-600">Billing rows</Text>
          <Title className="mt-1 text-lg font-semibold text-tremor-content-strong">All billing rows</Title>
          <Text className="mt-1 text-sm text-tremor-content-emphasis">
            Full revenue, joiner, and invoice fields for rows matching the current filters.
          </Text>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <TextInput
              icon={Search}
              placeholder="Search ID, account, PM, invoice, FY…"
              value={q}
              onValueChange={setQ}
              className="max-w-xs"
            />
            <Button
              type="button"
              size="xs"
              variant="secondary"
              icon={Download}
              onClick={() => downloadBillingExcel(filtered)}
              disabled={!filtered.length}
            >
              Download Excel (CSV)
            </Button>
            <Text className="text-xs text-tremor-content-emphasis">
              {filtered.length} row{filtered.length === 1 ? "" : "s"}
            </Text>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-white px-2 pb-4 pt-2">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>ID</TableHeaderCell>
                <TableHeaderCell>Account</TableHeaderCell>
                <TableHeaderCell>Update</TableHeaderCell>
                <TableHeaderCell>FY</TableHeaderCell>
                <TableHeaderCell>PM</TableHeaderCell>
                <TableHeaderCell className="text-right">Revenue booked</TableHeaderCell>
                <TableHeaderCell className="text-right">Total net revenue</TableHeaderCell>
                <TableHeaderCell className="text-right">MMF</TableHeaderCell>
                <TableHeaderCell className="text-right">Total</TableHeaderCell>
                <TableHeaderCell className="text-right">Total joiners</TableHeaderCell>
                <TableHeaderCell className="text-right">RPH</TableHeaderCell>
                <TableHeaderCell className="text-right">Taggd joiner</TableHeaderCell>
                <TableHeaderCell className="text-right">Other joiner</TableHeaderCell>
                <TableHeaderCell>Invoice</TableHeaderCell>
                <TableHeaderCell>Workflow</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs text-orange-600">{r.id}</TableCell>
                  <TableCell className="max-w-[180px]">
                    <div className="truncate font-medium" title={r.account_name || ""}>
                      {r.account_name || "—"}
                    </div>
                    <div className="font-mono text-[11px] text-orange-600">PRJ-{r.project_id}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.update_date?.slice(0, 10) || "—"}</TableCell>
                  <TableCell>{r.fiscal_year_label || "—"}</TableCell>
                  <TableCell className="max-w-[120px] truncate" title={r.project_manager || ""}>
                    {r.project_manager || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtCur(r.revenue_booked_inr)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtCur(r.net_revenue_inr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtCur(r.mmf_inr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtCur(r.total_joining_fee_inr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(r.total_joiners)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtCur(r.rph_inr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(r.taggd_joiner)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(r.er_ijp_other_count)}</TableCell>
                  <TableCell className="max-w-[100px] truncate font-mono text-xs" title={r.invoice_number || ""}>
                    {r.invoice_number || "—"}
                  </TableCell>
                  <TableCell className="text-xs">{formatWorkflowLabel(r.workflow?.validation_status)}</TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={15} className="py-8 text-center text-tremor-content-emphasis">
                    No rows match your search.
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
