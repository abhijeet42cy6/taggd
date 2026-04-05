export function slaStatsVm(raw: any) {
  return {
    total_accounts: raw?.total_accounts ?? 0,
    total_metrics: raw?.total_metrics ?? 0,
    portfolio_health: raw?.portfolio_health ?? 0,
    met_count: raw?.met_count ?? 0,
    not_met_count: raw?.not_met_count ?? 0,
  };
}

export function slaRowsVm(rows: any[]) {
  return rows || [];
}

