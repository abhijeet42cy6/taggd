/** Indian FY (Apr–Mar) vs calendar-year period helpers for SLA FY comparison. */

export type FyMode = "indian" | "calendar";

/** Months in YYYY-MM included in period 1 or 2 for the given mode. */
export function periodMonthSet(mode: FyMode, which: "p1" | "p2"): Set<string> {
  const out = new Set<string>();
  if (mode === "indian") {
    if (which === "p1") {
      for (let m = 4; m <= 12; m++) out.add(`2024-${String(m).padStart(2, "0")}`);
      for (let m = 1; m <= 3; m++) out.add(`2025-${String(m).padStart(2, "0")}`);
    } else {
      for (let m = 4; m <= 12; m++) out.add(`2025-${String(m).padStart(2, "0")}`);
      for (let m = 1; m <= 3; m++) out.add(`2026-${String(m).padStart(2, "0")}`);
    }
  } else {
    if (which === "p1") {
      for (let m = 1; m <= 12; m++) out.add(`2024-${String(m).padStart(2, "0")}`);
    } else {
      for (let m = 1; m <= 12; m++) out.add(`2025-${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

export function formatPeriodColumnHeader(mode: FyMode, which: "p1" | "p2"): string {
  if (mode === "indian") {
    return which === "p1" ? "FY 24-25 (%)" : "FY 25-26 (%)";
  }
  return which === "p1" ? "2024 (%)" : "2025 (%)";
}

/** Short labels for chart legend / tooltips. */
export function formatPeriodLabelShort(mode: FyMode, which: "p1" | "p2"): string {
  if (mode === "indian") {
    return which === "p1" ? "FY 24-25" : "FY 25-26";
  }
  return which === "p1" ? "2024" : "2025";
}

export type SlaTimelinePoint = {
  month: string;
  met: number;
  not_met: number;
};

/**
 * Sum met / not_met for months in the set; met_pct matches backend /sla/timeseries
 * (not_reported excluded from denominator).
 */
export function aggregatePeriod(
  timeline: SlaTimelinePoint[],
  months: Set<string>
): { met: number; not_met: number; met_pct: number | null } {
  let met = 0;
  let notMet = 0;
  for (const t of timeline) {
    if (!months.has(t.month)) continue;
    met += t.met;
    notMet += t.not_met;
  }
  const total = met + notMet;
  const met_pct = total > 0 ? Math.round((met / total) * 1000) / 10 : null;
  return { met, not_met: notMet, met_pct };
}
