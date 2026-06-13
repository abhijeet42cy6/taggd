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
import { Button, Grid, Select, SelectItem, Text } from "@tremor/react";
import { SearchableTremorFilterSelect } from "@/components/tremor-dashboard/SearchableTremorFilterSelect";

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

export function DashboardFiltersTremor({
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
  financeRows: FinanceRowVm[];
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

  const fyValue =
    fyYears.length === 0
      ? "none"
      : fyYears.includes(selectedFyStart)
        ? String(selectedFyStart)
        : String(fyYears[0]);

  const filterSelect = (label: string, key: keyof DF, opts: string[]) => (
    <SearchableTremorFilterSelect
      key={key}
      label={label}
      value={String(value[key])}
      onValueChange={(v) => sel(key, v)}
      options={opts}
    />
  );

  return (
    <div className="exec-dash-tremor__filters-shell">
      <div className="exec-dash-tremor__filters-inner">
        <div className="exec-dash-tremor__filters-heading">Scope &amp; filters</div>
        <p className="exec-dash-tremor__filters-sub">
          Control fiscal window and dimensions — KPIs and charts respond instantly to these selections.
        </p>
        <Grid numItems={1} numItemsSm={2} numItemsMd={3} numItemsLg={4} className="gap-x-5 gap-y-4">
        <div className="min-w-[10rem]">
          <Text className="mb-1 font-semibold text-tremor-content-emphasis">Fiscal year</Text>
          <Select
            value={fyValue}
            onValueChange={(v) => {
              if (v !== "none") onFyChange(Number(v));
            }}
            disabled={fySelectDisabled || fyYears.length === 0}
          >
            {fyYears.length === 0 ? (
              <SelectItem value="none">No fiscal years in ledger</SelectItem>
            ) : (
              fyYears.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {fySelectLabel(y)}
                </SelectItem>
              ))
            )}
          </Select>
        </div>

        <div className="min-w-[10rem]">
          <Text className="mb-1 font-semibold text-tremor-content-emphasis">Period</Text>
          <Select value={value.period} onValueChange={(v) => sel("period", v as DF["period"])}>
            <SelectItem value="all">Full year</SelectItem>
            <SelectItem value="Q1">Q1 (Apr–Jun)</SelectItem>
            <SelectItem value="Q2">Q2 (Jul–Sep)</SelectItem>
            <SelectItem value="Q3">Q3 (Oct–Dec)</SelectItem>
            <SelectItem value="Q4">Q4 (Jan–Mar)</SelectItem>
          </Select>
        </div>

        {filterSelect("Month", "month", [...FY_MONTH_ORDER])}
        {filterSelect("Region", "region", options.regions)}
        {filterSelect("Sub Region", "subRegion", options.subRegions)}
        {filterSelect("Region Head", "regionHead", options.regionHeads)}
        {filterSelect("Practice Head", "practiceHead", options.practiceHeads)}
        {filterSelect("Vertical", "vertical", options.verticals)}
        {filterSelect("Account", "account", options.accounts)}
      </Grid>

        <div className="mt-5 flex flex-wrap gap-3 border-t border-[rgb(0_0_0/0.06)] pt-5">
          <Button variant="secondary" color="orange" type="button" onClick={() => onChange({ ...DEFAULT_DASHBOARD_FILTERS })}>
            Reset filters
          </Button>
        </div>
      </div>
    </div>
  );
}
