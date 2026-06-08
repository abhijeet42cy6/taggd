import type { Project } from "@/lib/api";
import {
  avgPpcSigmaRevMinusCmOverSigmaHc,
  avgTaggdSigmaJoinersOverSigmaWl1,
} from "@/components/platform/ProductivityAveragesSection";
import type { FinanceRowVm } from "@/lib/view-models/finance";

export type ExecAccountScorecardRow = {
  account: string;
  vertical: string;
  actualRevenueInr: number;
  cmPct: number | null;
  /** Mean of per-row revenue productivity (INR per WL1 HC) where present. */
  revProductivity: number | null;
  /** Σ Taggd joiners ÷ Σ WL1 HC on account FY rows. */
  joinerProductivity: number | null;
  /** Σ(Rev − CM) ÷ Σ overall HC (INR per HC). */
  ppcInr: number | null;
  clientMonthCount: number;
};

function meanDefined(rows: FinanceRowVm[], pick: (r: FinanceRowVm) => number | null | undefined): number | null {
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    const v = pick(r);
    if (v != null && Number.isFinite(v)) {
      sum += v;
      n += 1;
    }
  }
  return n ? sum / n : null;
}

function verticalLabel(pids: Set<number>, pmap: Map<number, Project>): string {
  const verticals = new Set<string>();
  for (const pid of pids) {
    const pv = pmap.get(pid)?.vertical;
    if (pv && String(pv).trim()) verticals.add(String(pv).trim());
  }
  if (verticals.size === 1) return [...verticals][0];
  if (verticals.size > 1) return "Multiple";
  return "—";
}

export function buildExecAccountScorecardRows(
  rows: FinanceRowVm[],
  projects: Project[],
): ExecAccountScorecardRow[] {
  const pmap = new Map(projects.map((p) => [p.id, p]));
  const byKey = new Map<
    string,
    { display: string; rows: FinanceRowVm[]; pids: Set<number> }
  >();

  for (const r of rows) {
    const display = (r.account_name || "").trim() || "—";
    const key = display.toLowerCase();
    const cur = byKey.get(key) ?? { display, rows: [], pids: new Set<number>() };
    cur.rows.push(r);
    if (r.project_id != null) cur.pids.add(r.project_id);
    byKey.set(key, cur);
  }

  return Array.from(byKey.values())
    .map(({ display, rows: sub, pids }) => {
      let rev = 0;
      let cm = 0;
      for (const r of sub) {
        rev += Number(r.rev_actual_inr) || 0;
        cm += Number(r.cm_actual_inr) || 0;
      }
      const cmPct = rev > 0 ? Math.round((cm / rev) * 10000) / 100 : null;
      const tag = avgTaggdSigmaJoinersOverSigmaWl1(sub);
      const ppc = avgPpcSigmaRevMinusCmOverSigmaHc(sub);
      const revProductivity =
        meanDefined(sub, (r) => r.rev_productivity_actual_inr ?? r.revenue_productivity_inr) ??
        (() => {
          let sumWl1 = 0;
          for (const r of sub) sumWl1 += Number(r.actual_headcount_wl1) || 0;
          return sumWl1 > 0 && rev > 0 ? rev / sumWl1 : null;
        })();

      return {
        account: display,
        vertical: verticalLabel(pids, pmap),
        actualRevenueInr: rev,
        cmPct,
        revProductivity,
        joinerProductivity: tag.value,
        ppcInr: ppc.value,
        clientMonthCount: sub.length,
      };
    })
    .sort((a, b) => b.actualRevenueInr - a.actualRevenueInr);
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function fmtNum(n: number | null, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toFixed(decimals);
}

export function exportExecAccountScorecardCsv(rows: ExecAccountScorecardRow[], fyLabel: string): void {
  const header = [
    "Account",
    "Vertical",
    "Actual revenue (INR)",
    "CM%",
    "Rev productivity (INR/WL1)",
    "Joiner productivity (joiners/WL1)",
    "PPC (INR/HC)",
    "Client-months",
  ].join(",");
  const body = rows
    .map((r) =>
      [
        csvEscape(r.account),
        csvEscape(r.vertical),
        fmtNum(r.actualRevenueInr, 0),
        fmtNum(r.cmPct, 2),
        fmtNum(r.revProductivity, 2),
        fmtNum(r.joinerProductivity, 4),
        fmtNum(r.ppcInr, 2),
        String(r.clientMonthCount),
      ].join(","),
    )
    .join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `account-scorecard-${fyLabel.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
