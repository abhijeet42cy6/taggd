import React, { useEffect, useMemo } from "react";
import type { Project } from "@/lib/api";
import type { FinanceRowVm } from "@/lib/view-models/finance";
import {
  DEFAULT_DASHBOARD_FILTERS,
  isProjectEligibleForFinanceAccountList,
  revenueByAccountKeyInFy,
  type DashboardFilters as DF,
  FY_MONTH_ORDER,
} from "@/lib/dashboard-aggregates";
import "@/styles/ceo-view.css";

function uniqSorted(vals: (string | undefined)[]): string[] {
  const s = new Set<string>();
  for (const v of vals) {
    const t = (v || "").trim();
    if (t) s.add(t);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

function fySelectLabel(start: number): string {
  return `FY${String(start).slice(2)}–${String(start + 1).slice(2)}`;
}

export function DashboardFilters({
  value,
  onChange,
  projects,
  financeRows,
  fyYears,
  selectedFyStart,
  onFyChange,
  fySelectDisabled = false,
}: {
  value: DF;
  onChange: (next: DF) => void;
  projects: Project[];
  /** Used to list only accounts with actual revenue in the selected FY (excludes no-ledger / zero-revenue names). */
  financeRows: FinanceRowVm[];
  /** Indian FY start years present in the finance ledger (e.g. 2024 → FY24–25). */
  fyYears: number[];
  selectedFyStart: number;
  onFyChange: (fyStart: number) => void;
  fySelectDisabled?: boolean;
}) {
  const options = useMemo(() => {
    const revenueByKey = revenueByAccountKeyInFy(financeRows, selectedFyStart);
    const accountSeen = new Set<string>();
    const accounts: string[] = [];
    for (const p of projects) {
      if (!isProjectEligibleForFinanceAccountList(p)) continue;
      const n = (p.account_name || "").trim();
      if (!n) continue;
      const key = n.toLowerCase();
      if (accountSeen.has(key)) continue;
      if ((revenueByKey.get(key) ?? 0) <= 0) continue;
      accountSeen.add(key);
      accounts.push(n);
    }
    return {
      regions: uniqSorted(projects.map((p) => p.region)),
      subRegions: uniqSorted(projects.map((p) => p.sub_region ?? p.category)),
      regionHeads: uniqSorted(projects.map((p) => p.practice_head)),
      practiceHeads: uniqSorted(projects.map((p) => p.be_spoc)),
      verticals: uniqSorted(projects.map((p) => p.vertical)),
      accounts: accounts.sort((a, b) => a.localeCompare(b)),
    };
  }, [projects, financeRows, selectedFyStart]);

  const accountList = options.accounts;
  useEffect(() => {
    if (value.account === "all") return;
    if (!accountList.includes(value.account)) {
      onChange({ ...value, account: "all" });
    }
  }, [accountList, value.account, value, onChange]);

  const sel = (key: keyof DF, v: string) => onChange({ ...value, [key]: v });

  const field = (label: string, k: keyof DF, opts: string[], width = 120) => (
    <label className="dashboard-filter-field" style={{ minWidth: width }}>
      <span className="dashboard-filter-label">{label}</span>
      <select
        className="dashboard-filter-select"
        value={value[k]}
        onChange={(e) => sel(k, e.target.value)}
      >
        <option value="all">All</option>
        {opts.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );

  const fyValue =
    fyYears.length === 0
      ? ""
      : fyYears.includes(selectedFyStart)
        ? String(selectedFyStart)
        : String(fyYears[0]);

  return (
    <div className="dashboard-filter-bar">
      <label className="dashboard-filter-field" style={{ minWidth: 120 }}>
        <span className="ceo-fy-label">Fiscal year</span>
        <select
          className="ceo-fy-select"
          aria-label="Fiscal year"
          value={fyValue}
          onChange={(e) => onFyChange(Number(e.target.value))}
          disabled={fySelectDisabled || fyYears.length === 0}
        >
          {fyYears.length === 0 ? (
            <option value="">No fiscal years in ledger</option>
          ) : (
            fyYears.map((y) => (
              <option key={y} value={y}>
                {fySelectLabel(y)}
              </option>
            ))
          )}
        </select>
      </label>
      <label className="dashboard-filter-field" style={{ minWidth: 108 }}>
        <span className="dashboard-filter-label">Period</span>
        <select
          className="dashboard-filter-select"
          value={value.period}
          onChange={(e) => sel("period", e.target.value as DF["period"])}
        >
          <option value="all">Full year</option>
          <option value="Q1">Q1 (Apr–Jun)</option>
          <option value="Q2">Q2 (Jul–Sep)</option>
          <option value="Q3">Q3 (Oct–Dec)</option>
          <option value="Q4">Q4 (Jan–Mar)</option>
        </select>
      </label>
      {field("Month", "month", [...FY_MONTH_ORDER], 88)}
      {field("Region", "region", options.regions, 110)}
      {field("Sub Region", "subRegion", options.subRegions, 120)}
      {field("Region Head", "regionHead", options.regionHeads, 130)}
      {field("Practice Head", "practiceHead", options.practiceHeads, 130)}
      {field("Vertical", "vertical", options.verticals, 110)}
      {field("Account", "account", options.accounts, 160)}
      <button
        type="button"
        className="dashboard-filter-reset"
        onClick={() => onChange({ ...DEFAULT_DASHBOARD_FILTERS })}
      >
        Reset
      </button>
    </div>
  );
}
