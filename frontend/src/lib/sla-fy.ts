/** Indian FY (Apr–Mar) vs calendar-year period helpers for SLA FY comparison. */

export type FyMode = "indian" | "calendar";

function parseYm(s: string): { y: number; m: number } | null {
  const t = s.trim();
  if (t.length < 7 || t[4] !== "-") return null;
  const y = parseInt(t.slice(0, 4), 10);
  const m = parseInt(t.slice(5, 7), 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { y, m };
}

/** Indian fiscal year that *starts* in April of `startYear` (e.g. 2024 → Apr'24–Mar'25). */
function indianFyStartYearForMonth(y: number, month: number): number {
  return month >= 4 ? y : y - 1;
}

function monthsInIndianFy(fyStartYear: number): Set<string> {
  const out = new Set<string>();
  for (let mo = 4; mo <= 12; mo++) out.add(`${fyStartYear}-${String(mo).padStart(2, "0")}`);
  for (let mo = 1; mo <= 3; mo++) out.add(`${fyStartYear + 1}-${String(mo).padStart(2, "0")}`);
  return out;
}

function labelIndianFyShort(fyStartYear: number): string {
  return `FY ${String(fyStartYear).slice(2)}–${String(fyStartYear + 1).slice(2)}`;
}

/**
 * From loaded timeline months, choose the two comparison windows:
 * p2 = Indian FY (or calendar year) that contains the latest data month, p1 = the previous FY/year.
 * Falls back to empty sets if there are no valid YYYY-MM values.
 */
export function periodMonthSetsFromData(
  mode: FyMode,
  allMonths: string[]
): { p1: Set<string>; p2: Set<string> } {
  const p1 = new Set<string>();
  const p2 = new Set<string>();
  const valid = (allMonths || [])
    .map((s) => parseYm(s))
    .filter((x): x is { y: number; m: number } => x != null);
  if (!valid.length) return { p1, p2 };
  const latest = valid.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.m - b.m)).at(-1)!;
  if (mode === "indian") {
    const fy2 = indianFyStartYearForMonth(latest.y, latest.m);
    const fy1 = fy2 - 1;
    return { p1: monthsInIndianFy(fy1), p2: monthsInIndianFy(fy2) };
  }
  const y2 = latest.y;
  const y1 = y2 - 1;
  for (let mo = 1; mo <= 12; mo++) {
    p1.add(`${y1}-${String(mo).padStart(2, "0")}`);
    p2.add(`${y2}-${String(mo).padStart(2, "0")}`);
  }
  return { p1, p2 };
}

export function formatPeriodColumnHeaderFromData(
  mode: FyMode,
  which: "p1" | "p2",
  allMonths: string[]
): string {
  const valid = (allMonths || [])
    .map((s) => parseYm(s))
    .filter((x): x is { y: number; m: number } => x != null);
  if (!valid.length) return which === "p1" ? "Period 1 (%)" : "Period 2 (%)";
  const latest = valid.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.m - b.m)).at(-1)!;
  if (mode === "indian") {
    const fy2 = indianFyStartYearForMonth(latest.y, latest.m);
    const fy1 = fy2 - 1;
    return which === "p1" ? `${labelIndianFyShort(fy1)} (%)` : `${labelIndianFyShort(fy2)} (%)`;
  }
  const y2 = latest.y;
  const y1 = y2 - 1;
  return which === "p1" ? `${y1} (%)` : `${y2} (%)`;
}

/** Short labels for chart legend / tooltips — derived from the same data window as the sets. */
export function formatPeriodLabelShortFromData(
  mode: FyMode,
  which: "p1" | "p2",
  allMonths: string[]
): string {
  const valid = (allMonths || [])
    .map((s) => parseYm(s))
    .filter((x): x is { y: number; m: number } => x != null);
  if (!valid.length) return which === "p1" ? "Period 1" : "Period 2";
  const latest = valid.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.m - b.m)).at(-1)!;
  if (mode === "indian") {
    const fy2 = indianFyStartYearForMonth(latest.y, latest.m);
    const fy1 = fy2 - 1;
    return which === "p1" ? labelIndianFyShort(fy1) : labelIndianFyShort(fy2);
  }
  const y2 = latest.y;
  const y1 = y2 - 1;
  return which === "p1" ? String(y1) : String(y2);
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
