import React, { useMemo } from "react";
import type { Project } from "@/lib/api";
import {
  DEFAULT_DASHBOARD_FILTERS,
  type DashboardFilters as DF,
  FY_MONTH_ORDER,
} from "@/lib/dashboard-aggregates";

function uniqSorted(vals: (string | undefined)[]): string[] {
  const s = new Set<string>();
  for (const v of vals) {
    const t = (v || "").trim();
    if (t) s.add(t);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

export function DashboardFilters({
  value,
  onChange,
  projects,
}: {
  value: DF;
  onChange: (next: DF) => void;
  projects: Project[];
}) {
  const options = useMemo(() => {
    return {
      regions: uniqSorted(projects.map((p) => p.region)),
      subRegions: uniqSorted(projects.map((p) => p.sub_region ?? p.category)),
      regionHeads: uniqSorted(projects.map((p) => p.practice_head)),
      practiceHeads: uniqSorted(projects.map((p) => p.be_spoc)),
      verticals: uniqSorted(projects.map((p) => p.vertical)),
      accounts: uniqSorted(projects.map((p) => p.account_name)),
    };
  }, [projects]);

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

  return (
    <div className="dashboard-filter-bar">
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
