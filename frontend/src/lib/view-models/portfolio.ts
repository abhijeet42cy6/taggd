type ProjectStat = {
  id: number;
  name: string;
  positions: number;
  closed: number;
  active: number;
  on_hold: number;
  pipeline: number;
  revenue: number;
};

/**
 * Composite scores built entirely from real data in project_stats.
 *
 * fillScore  — closed / total * 100            (actual hiring delivery)
 * activityScore — (closed + active) / total * 100 (pipeline health, excludes ghosted/hold)
 * holdPenalty — on_hold / total * 100           (lower is better → inverted to a score)
 * revenueScore — revenue per position vs portfolio median (delivery quality proxy)
 * composite — weighted average of the four above
 *
 * Columns labelled honestly in the UI: "Fill %", "Activity %", "Hold%", "Rev/Pos"
 * rather than the previous fake "SLA", "WFM", "Finance", "Hiring" labels.
 */
export type PortfolioRow = {
  id: number;
  name: string;
  positions: number;
  closed: number;
  active: number;
  on_hold: number;
  revenue: number;
  fillScore: number;       // 0–100
  activityScore: number;   // 0–100
  holdPenalty: number;     // 0–100 (lower on_hold % = higher score)
  revenueScore: number;    // 0–100 (relative to portfolio median)
  composite: number;       // weighted 0–100
};

export function portfolioCompositeVm(
  projectStats: ProjectStat[],
  _budgetRows: any[],      // kept for signature compat, not used
): PortfolioRow[] {
  const active = projectStats.filter((p) => p.positions > 0);
  if (active.length === 0) return [];

  // Compute revenue-per-position for each project so we can normalise it
  const revPerPos = active.map((p) => (p.positions > 0 ? p.revenue / p.positions : 0));
  const medianRevPerPos = percentile(revPerPos, 50);
  const maxRevPerPos = Math.max(...revPerPos, 1);

  return active
    .map((p): PortfolioRow => {
      const total = p.positions;
      const closed = p.closed ?? 0;
      const actv   = p.active  ?? 0;
      const hold   = p.on_hold ?? 0;

      // Fill score: % of reqs that are closed/placed (0–100)
      const fillScore = Math.round((closed / total) * 100);

      // Activity score: % of reqs that are closed OR actively in pipeline (0–100)
      const activityScore = Math.round(((closed + actv) / total) * 100);

      // Hold penalty converted to a score: 0% on-hold = 100, 100% on-hold = 0
      const holdPenalty = Math.round(Math.max(0, 100 - (hold / total) * 100));

      // Revenue quality score vs portfolio median (capped 0–100)
      const rpp = p.positions > 0 ? p.revenue / p.positions : 0;
      // When median is 0, use absolute threshold: ₹200k/pos = 100, scaled linearly
      const revenueScore = medianRevPerPos > 0
        ? Math.min(100, Math.round((rpp / maxRevPerPos) * 100))
        : Math.min(100, Math.round((rpp / 200_000) * 100));

      // Composite: fill 40% | activity 30% | hold-penalty 20% | revenue 10%
      const composite = Math.round(
        fillScore * 0.40 +
        activityScore * 0.30 +
        holdPenalty * 0.20 +
        revenueScore * 0.10
      );

      return {
        id: p.id,
        name: p.name,
        positions: total,
        closed,
        active: actv,
        on_hold: hold,
        revenue: p.revenue,
        fillScore,
        activityScore,
        holdPenalty,
        revenueScore,
        composite,
      };
    })
    .sort((a, b) => b.composite - a.composite);
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
