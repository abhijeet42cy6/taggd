import React, { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { PlatformKpi, PlatformSection } from "@/components/platform/PlatformBlocks";
import { SkeletonKpiRow } from "@/components/platform/Skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { FinanceRowVm } from "@/lib/view-models/finance";

export const PRODUCTIVITY_AVG_INFO =
  "Arithmetic mean of Tag prod. (joiners ÷ WL1 HC), PPC (total cost ÷ overall HC), and Rev / WL1 (revenue ÷ WL1 HC). Each average uses only rows where that metric is defined; filters narrow client-month rows first.";

export const PRODUCTIVITY_AVG_INFO_DASHBOARD =
  "Same metrics as Finance Command. Rows are those that match the dashboard filter bar (period, month, region, sub-region, account, vertical, etc.). Each average uses only rows where that metric is defined.";

const selectStyle: React.CSSProperties = {
  background: "var(--surface-raised)",
  border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
  color: "var(--text)",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: 10,
  fontFamily: "'DM Mono',monospace",
  maxWidth: 200,
  flex: "0 1 auto",
};

export function fmtFinRatio(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function fmtFinInrMetric(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatCurrency(n);
}

function averageDefined(
  rows: FinanceRowVm[],
  pick: (r: FinanceRowVm) => number | null | undefined,
): { mean: number | null; count: number } {
  const vals: number[] = [];
  for (const r of rows) {
    const v = pick(r);
    if (v != null && Number.isFinite(v)) vals.push(v);
  }
  if (!vals.length) return { mean: null, count: 0 };
  const sum = vals.reduce((a, b) => a + b, 0);
  return { mean: sum / vals.length, count: vals.length };
}

type Props = {
  rows: FinanceRowVm[];
  /** When true, shows KPI skeletons (e.g. initial dashboard load). */
  loading?: boolean;
  /**
   * When true, `rows` are already scoped (e.g. dashboard `filteredRows`); hide client/month dropdowns.
   * When false (default), section includes its own client + month filters.
   */
  externalFilters?: boolean;
};

export function ProductivityAveragesSection({ rows, loading = false, externalFilters = false }: Props) {
  const [avgFilterClient, setAvgFilterClient] = useState<string>("all");
  const [avgFilterMonth, setAvgFilterMonth] = useState<string>("all");

  const accountOptions = useMemo(
    () => [...new Set(rows.map((r) => r.account_name).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b))),
    [rows],
  );

  const monthOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: { label: string; sortKey: string }[] = [];
    for (const r of rows) {
      const label = String(r.month ?? "").trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      list.push({ label, sortKey: String(r.month_sort ?? r.month ?? label) });
    }
    list.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return list.map((x) => x.label);
  }, [rows]);

  const rowsForProductivityAvg = useMemo(() => {
    if (externalFilters) return rows;
    return rows.filter((r) => {
      const clientOk = avgFilterClient === "all" || r.account_name === avgFilterClient;
      const monthOk = avgFilterMonth === "all" || r.month === avgFilterMonth;
      return clientOk && monthOk;
    });
  }, [rows, externalFilters, avgFilterClient, avgFilterMonth]);

  const productivityAvgs = useMemo(() => {
    const tag = averageDefined(rowsForProductivityAvg, (r) => r.taggd_joiner_productivity);
    const ppc = averageDefined(rowsForProductivityAvg, (r) => r.ppc_inr);
    const rev = averageDefined(rowsForProductivityAvg, (r) => r.revenue_productivity_inr);
    return { tag, ppc, rev };
  }, [rowsForProductivityAvg]);

  return (
    <PlatformSection
      title="Productivity averages"
      titleAccessory={(
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex shrink-0 rounded p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text)] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                aria-label="How productivity averages are calculated"
              >
                <Info size={15} strokeWidth={2} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-sm text-left">
              {externalFilters ? PRODUCTIVITY_AVG_INFO_DASHBOARD : PRODUCTIVITY_AVG_INFO}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    >
      {externalFilters ? (
        <p style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", lineHeight: 1.45, margin: "0 0 12px" }}>
          {rowsForProductivityAvg.length} client-month{rowsForProductivityAvg.length === 1 ? "" : "s"} match dashboard filters
        </p>
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <select
            value={avgFilterClient}
            onChange={(e) => setAvgFilterClient(e.target.value)}
            style={selectStyle}
            title="Filter by client"
            disabled={loading}
          >
            <option value="all">All clients</option>
            {accountOptions.map((a) => (
              <option key={a} value={a}>{a.length > 42 ? `${a.slice(0, 40)}…` : a}</option>
            ))}
          </select>
          <select
            value={avgFilterMonth}
            onChange={(e) => setAvgFilterMonth(e.target.value)}
            style={selectStyle}
            title="Filter by month"
            disabled={loading}
          >
            <option value="all">All months</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {(avgFilterClient !== "all" || avgFilterMonth !== "all") && (
            <button
              type="button"
              className="platform-chip"
              style={{ fontSize: 10, cursor: "pointer" }}
              onClick={() => {
                setAvgFilterClient("all");
                setAvgFilterMonth("all");
              }}
            >
              Clear filters
            </button>
          )}
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginLeft: "auto" }}>
            {rowsForProductivityAvg.length} client-month{rowsForProductivityAvg.length === 1 ? "" : "s"} in scope
          </span>
        </div>
      )}
      {loading ? (
        <SkeletonKpiRow count={3} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          <PlatformKpi
            label="Avg Tag prod."
            value={fmtFinRatio(productivityAvgs.tag.mean)}
            accent="teal"
            subtext={
              productivityAvgs.tag.count
                ? `Mean of ${productivityAvgs.tag.count} values`
                : "No Tag prod. values in scope"
            }
          />
          <PlatformKpi
            label="Avg PPC"
            value={fmtFinInrMetric(productivityAvgs.ppc.mean)}
            accent="blue"
            subtext={
              productivityAvgs.ppc.count
                ? `Mean of ${productivityAvgs.ppc.count} values`
                : "No PPC values in scope"
            }
          />
          <PlatformKpi
            label="Avg Rev / WL1"
            value={fmtFinInrMetric(productivityAvgs.rev.mean)}
            accent="amber"
            subtext={
              productivityAvgs.rev.count
                ? `Mean of ${productivityAvgs.rev.count} values`
                : "No Rev / WL1 values in scope"
            }
          />
        </div>
      )}
    </PlatformSection>
  );
}
