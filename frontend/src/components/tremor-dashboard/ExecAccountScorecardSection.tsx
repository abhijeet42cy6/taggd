import { useMemo, useState } from "react";
import { Button } from "@tremor/react";
import { Download, Maximize2 } from "lucide-react";
import type { Project } from "@/lib/api";
import {
  buildExecAccountScorecardRows,
  exportExecAccountScorecardCsv,
} from "@/lib/exec-account-scorecard";
import type { FinanceRowVm } from "@/lib/view-models/finance";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { fmtFinInrMetric, fmtFinRatio } from "@/components/platform/ProductivityAveragesSection";
import { TremorDashboardSection } from "@/components/tremor-dashboard/TremorDashboardSection";
import { ExecAccountScorecardExpandDialog } from "@/components/tremor-dashboard/ExecAccountScorecardExpandDialog";

const PREVIEW_LIMIT = 8;

export function ExecAccountScorecardSection({
  fyLabel,
  kpiRows,
  projects,
}: {
  fyLabel: string;
  kpiRows: FinanceRowVm[];
  projects: Project[];
}) {
  const [expandOpen, setExpandOpen] = useState(false);
  const rows = useMemo(() => buildExecAccountScorecardRows(kpiRows, projects), [kpiRows, projects]);
  const preview = rows.slice(0, PREVIEW_LIMIT);

  return (
    <>
      <TremorDashboardSection
        tag="Accounts"
        title="Account scorecard"
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="xs"
              variant="secondary"
              icon={Download}
              onClick={() => exportExecAccountScorecardCsv(rows, fyLabel)}
              disabled={!rows.length}
            >
              Download Excel (CSV)
            </Button>
            <Button
              type="button"
              size="xs"
              variant="light"
              color="orange"
              icon={Maximize2}
              onClick={() => setExpandOpen(true)}
              disabled={!rows.length}
            >
              Show & expand
            </Button>
          </div>
        }
      >
        <table className="exec-drilldown-table">
          <thead>
            <tr>
              <th>Account</th>
              <th style={{ textAlign: "right" }}>Actual revenue</th>
              <th style={{ textAlign: "right" }}>CM%</th>
              <th style={{ textAlign: "right" }}>Rev productivity</th>
              <th style={{ textAlign: "right" }}>Joiner productivity</th>
              <th style={{ textAlign: "right" }}>PPC</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((r) => (
              <tr key={r.account}>
                <td>
                  <div className="exec-risk-table__name" title={r.account}>
                    {r.account}
                  </div>
                </td>
                <td className="text-right font-semibold tabular-nums text-tremor-content-strong">
                  {formatCurrency(r.actualRevenueInr)}
                </td>
                <td style={{ textAlign: "right" }} className="tabular-nums">
                  {r.cmPct == null ? "—" : formatPercent(r.cmPct)}
                </td>
                <td style={{ textAlign: "right" }} className="tabular-nums">
                  {fmtFinInrMetric(r.revProductivity)}
                </td>
                <td style={{ textAlign: "right" }} className="tabular-nums">
                  {fmtFinRatio(r.joinerProductivity)}
                </td>
                <td style={{ textAlign: "right" }} className="tabular-nums">
                  {fmtFinInrMetric(r.ppcInr)}
                </td>
              </tr>
            ))}
            {preview.length === 0 && (
              <tr>
                <td colSpan={6} className="exec-empty">
                  No finance data for {fyLabel} with current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {rows.length > PREVIEW_LIMIT ? (
          <p className="mt-3 text-xs text-tremor-content-emphasis">
            Showing top {PREVIEW_LIMIT} of {rows.length} accounts by actual revenue. Use Show & expand for the full list.
          </p>
        ) : null}
      </TremorDashboardSection>

      <ExecAccountScorecardExpandDialog
        open={expandOpen}
        onOpenChange={setExpandOpen}
        fyLabel={fyLabel}
        rows={rows}
      />
    </>
  );
}
