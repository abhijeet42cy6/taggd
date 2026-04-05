import type { GlobalMonitor, GlobalStats } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

export function executiveKpis(stats: GlobalStats | null, monitor: GlobalMonitor | null) {
  return [
    { label: "Active Clients", value: stats?.total_projects ?? 0, delta: "live" },
    { label: "Open Reqs", value: monitor?.total_positions ?? 0, delta: "live" },
    { label: "Revenue YTD", value: formatCurrency(stats?.total_revenue ?? 0), delta: "derived" },
    { label: "Budget Attain.", value: `${Math.max(0, Math.min(100, Math.round(((stats?.total_revenue ?? 0) / Math.max((stats?.total_opening_fees ?? 1) + (stats?.total_closing_fees ?? 1), 1)) * 100)))}%`, delta: "proxy" },
    { label: "SLA Met %", value: `${Math.max(0, 100 - Math.round(((monitor?.status_breakdown?.["ON HOLD"] ?? 0) / Math.max(monitor?.total_positions ?? 1, 1)) * 100))}%`, delta: "proxy" },
    { label: "Fill Rate", value: `${Math.max(0, Math.round(((monitor?.status_breakdown?.["CLOSED"] ?? 0) / Math.max(monitor?.total_positions ?? 1, 1)) * 100))}%`, delta: "proxy" },
    { label: "Data Quality", value: "86", delta: "baseline" },
  ];
}

