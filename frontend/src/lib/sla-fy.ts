/** Indian FY (Apr–Mar) vs calendar-year period helpers for SLA FY comparison. */

export type FyMode = "indian" | "calendar";

/** Aligns with `backend/core/sla_period.normalize_timeline_month_key` for FY bucketing on the client. */
const MONTH_OVERRIDES: Record<string, [number, number]> = {
  Aug25: [2025, 8],
  Aug24: [2024, 8],
  Oct25: [2025, 10],
  Sep25: [2025, 9],
  Sep24: [2024, 9],
};

const QUARTER_FIRST_MONTH: Record<string, [number, number]> = {
  JAS24: [2024, 7],
  JAS25: [2025, 7],
  "OND 24": [2024, 10],
  OND24: [2024, 10],
  "JFM'25": [2025, 1],
  JFM25: [2025, 1],
  AMJ25: [2025, 4],
  AMJ26: [2026, 4],
};

const MONTH_NUM_RAW: [string, number][] = [
  ["january", 1],
  ["february", 2],
  ["march", 3],
  ["april", 4],
  ["june", 6],
  ["july", 7],
  ["august", 8],
  ["september", 9],
  ["october", 10],
  ["november", 11],
  ["december", 12],
  ["jan", 1],
  ["feb", 2],
  ["mar", 3],
  ["apr", 4],
  ["may", 5],
  ["jun", 6],
  ["jul", 7],
  ["aug", 8],
  ["sep", 9],
  ["sept", 9],
  ["oct", 10],
  ["nov", 11],
  ["dec", 12],
];
const MONTH_NUM_ENTRIES: [string, number][] = [...MONTH_NUM_RAW].sort(
  (a, b) => b[0].length - a[0].length,
);

const GARBAGE = new Set(["YTD", "Metrics to be picked of BE  (Measure Name as per standard Metrics)"]);

/**
 * Map legacy SLA month labels (Oct25, Apr 2024, YYYY-MM-DD, …) to canonical `YYYY-MM`.
 * Used so Indian/calendar FY sets intersect timelines and table rows even when the API still returns legacy keys.
 */
export function normalizeSlaMonthToYm(raw: string | null | undefined): string | null {
  const s0 = (raw ?? "").trim();
  if (!s0 || s0 === "N/A" || GARBAGE.has(s0) || s0.includes("Metrics to be picked")) return null;

  if (s0.length >= 7 && s0[4] === "-" && /^\d{4}-\d{2}/.test(s0)) {
    const mo = parseInt(s0.slice(5, 7), 10);
    if (mo >= 1 && mo <= 12) return s0.slice(0, 7);
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(s0)) {
    const mo = parseInt(s0.slice(5, 7), 10);
    const y = parseInt(s0.slice(0, 4), 10);
    if (mo >= 1 && mo <= 12 && Number.isFinite(y)) return `${y}-${String(mo).padStart(2, "0")}`;
  }

  const compact = s0.replace(/\s+/g, "");
  const q = QUARTER_FIRST_MONTH[compact] ?? QUARTER_FIRST_MONTH[s0];
  if (q) {
    const [y, m] = q;
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  const ov = MONTH_OVERRIDES[compact];
  if (ov) {
    const [y, m] = ov;
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  const low = compact.toLowerCase();
  for (const [key, num] of MONTH_NUM_ENTRIES) {
    if (!low.startsWith(key)) continue;
    let suffix = compact.slice(key.length).replace(/[^\d]/g, "");
    if (suffix.length >= 4) {
      const year = parseInt(suffix.slice(0, 4), 10);
      if (Number.isFinite(year)) return `${year}-${String(num).padStart(2, "0")}`;
    }
    if (suffix.length >= 2) {
      const yy = parseInt(suffix.slice(0, 2), 10);
      if (Number.isFinite(yy)) {
        const year = yy < 100 ? 2000 + yy : yy;
        return `${year}-${String(num).padStart(2, "0")}`;
      }
    }
    return null;
  }

  return null;
}

function ymListForFyBasis(allMonths: string[]): string[] {
  const out = new Set<string>();
  for (const s of allMonths || []) {
    const ym = normalizeSlaMonthToYm(s);
    if (ym) out.add(ym);
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}

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
  const valid = ymListForFyBasis(allMonths || [])
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
  const valid = ymListForFyBasis(allMonths || [])
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
  const valid = ymListForFyBasis(allMonths || [])
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
    const ym = normalizeSlaMonthToYm(t.month);
    if (!ym || !months.has(ym)) continue;
    met += t.met;
    notMet += t.not_met;
  }
  const total = met + notMet;
  const met_pct = total > 0 ? Math.round((met / total) * 1000) / 10 : null;
  return { met, not_met: notMet, met_pct };
}
