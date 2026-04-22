/**
 * Overlays finance-ledger metrics onto the configurable CEO slide deck.
 * Narrative copy / slides without ledger support remain from the base config.
 */
import type { Project } from "@/lib/api";
import type { FinanceRowVm } from "@/lib/view-models/finance";
import {
  aggregateFinanceFromRows,
  fiscalYearStart,
  parseMonthSort,
  filterFinanceRows,
  DEFAULT_DASHBOARD_FILTERS,
} from "@/lib/dashboard-aggregates";
import type { CeoSlideDeckConfig } from "./types";

const DONUT_PALETTE = [
  "#e16f3d",
  "#c45c2a",
  "#f4a574",
  "#64748b",
  "#60a5fa",
  "#5eead4",
  "#14b8a6",
  "#9ca3af",
  "#3884ff",
  "#a855f7",
];

export type LiveSlideDeckInput = {
  base: CeoSlideDeckConfig;
  allRows: FinanceRowVm[];
  projects: Project[];
  /** FY start years, newest first (same as CeoView `fyYears`) */
  fyYears: number[];
  selectedFyStart: number;
  /** Prior FY used for YoY / bridge (same as CeoView `effectiveCompareFy`) */
  effectiveCompareFy: number;
};

function fyLabelShort(fyStart: number): string {
  return `FY ${String(fyStart).slice(2)}`;
}

function fyLabelRange(fyStart: number): string {
  return `FY${String(fyStart).slice(2)}–${String(fyStart + 1).slice(2)}`;
}

function rowsForFy(allRows: FinanceRowVm[], fyStart: number): FinanceRowVm[] {
  return allRows.filter((r) => {
    const d = parseMonthSort(r.month_sort);
    return d && fiscalYearStart(d) === fyStart;
  });
}

function maxMonthLabel(rows: FinanceRowVm[]): string | null {
  let best: Date | null = null;
  for (const r of rows) {
    const d = parseMonthSort(r.month_sort);
    if (!d) continue;
    if (!best || d > best) best = d;
  }
  if (!best) return null;
  return best.toLocaleString("en-IN", { month: "short", year: "numeric" });
}

/** Average monthly headcount (non-zero months only), same spirit as CeoView KPIs. */
function avgMonthlyHc(rows: FinanceRowVm[], key: "actual_headcount_overall" | "actual_headcount_wl1"): number {
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    const v = r[key] ?? 0;
    if (v > 0) {
      sum += v;
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

function sumJoiners(rows: FinanceRowVm[]): number {
  return rows.reduce((s, r) => s + (r.taggd_joiners ?? 0), 0);
}

type VerticalShare = { vertical: string; actual: number; share: number };

function verticalMixForFy(fyRows: FinanceRowVm[], projects: Project[]): VerticalShare[] {
  const pmap = new Map(projects.map((p) => [p.id, p]));
  const by: Record<string, number> = {};
  for (const r of fyRows) {
    const p = r.project_id != null ? pmap.get(r.project_id) : undefined;
    const v = (p?.vertical ?? r.vertical ?? "Other").trim() || "Other";
    by[v] = (by[v] ?? 0) + r.rev_actual_inr;
  }
  const total = Object.values(by).reduce((s, x) => s + x, 0) || 1;
  return Object.entries(by)
    .map(([vertical, actual]) => ({ vertical, actual, share: (actual / total) * 100 }))
    .sort((a, b) => b.actual - a.actual);
}

function formatRphSub(revInr: number, joiners: number): string {
  if (joiners <= 0) return "RPH: —";
  const rph = revInr / joiners;
  if (rph >= 1e5) return `RPH: ${(rph / 1e5).toFixed(2)} L`;
  if (rph >= 1e3) return `RPH: ${Math.round(rph / 1e3)}K`;
  return `RPH: ${Math.round(rph)}`;
}

export type LiveSlideDeckResult = {
  deck: CeoSlideDeckConfig;
  /** Latest month present in ledger rows (for UI). */
  asOf: string | null;
};

/**
 * Merges live ledger aggregates into the deck. Safe to call with empty rows (returns base unchanged).
 */
export function mergeLiveCeoSlideDeck(input: LiveSlideDeckInput): LiveSlideDeckResult {
  const { base, allRows, projects, fyYears, selectedFyStart, effectiveCompareFy } = input;
  if (!allRows.length || !fyYears.length) {
    return { deck: base, asOf: null };
  }

  const sortedDesc = [...fyYears].sort((a, b) => b - a);
  const sortedAsc = [...fyYears].sort((a, b) => a - b);
  const window3 = sortedDesc.slice(0, 3).sort((a, b) => a - b);

  const asOf = maxMonthLabel(allRows);

  // ── Slide 1: Financial (totals in ₹ Lakhs to match reference scale) ──
  const totalRevenueByYear = window3.map((fy) => {
    const r = rowsForFy(allRows, fy);
    const agg = aggregateFinanceFromRows(r);
    const revLakh = agg ? agg.revenue_actual_inr / 1e5 : 0;
    return { label: fyLabelRange(fy), value: Math.round(revLakh) };
  });

  const anchorRows = rowsForFy(allRows, selectedFyStart);
  const aggAnchor = aggregateFinanceFromRows(anchorRows);
  const compareRows = rowsForFy(allRows, effectiveCompareFy);
  const aggPrior = aggregateFinanceFromRows(compareRows);

  const revA = aggAnchor?.revenue_actual_inr ?? 0;
  const revPrior = aggPrior?.revenue_actual_inr ?? 0;
  const joinAnchor = sumJoiners(anchorRows);
  const rphDisplay =
    joinAnchor > 0 && revA > 0
      ? `${(revA / joinAnchor / 1e5).toFixed(0)} L`
      : "—";

  let yoyPct: number | null = null;
  if (window3.length >= 2) {
    const last = window3[window3.length - 1];
    const prev = window3[window3.length - 2];
    const a = aggregateFinanceFromRows(rowsForFy(allRows, last));
    const p = aggregateFinanceFromRows(rowsForFy(allRows, prev));
    if (a && p && p.revenue_actual_inr > 0) {
      yoyPct = ((a.revenue_actual_inr - p.revenue_actual_inr) / p.revenue_actual_inr) * 100;
    }
  }

  const metricCards = [...base.financialPerformance.metricCards];
  if (metricCards[0] && yoyPct != null) {
    metricCards[0] = {
      ...metricCards[0],
      primary: `${yoyPct >= 0 ? "" : ""}${yoyPct.toFixed(0)}%`,
      title: "YoY Growth",
      sub: `${fyLabelRange(window3[window3.length - 2] ?? effectiveCompareFy)} → ${fyLabelRange(window3[window3.length - 1] ?? selectedFyStart)} (actual)`,
    };
  }
  if (metricCards[2]) {
    metricCards[2] = {
      ...metricCards[2],
      primary: rphDisplay,
      title: "Revenue per hire (Taggd)",
      sub: `${fyLabelRange(selectedFyStart)} · ledger`,
    };
  }

  // ── Slide 2: Scale & efficiency ──
  const hiringVolume = window3.map((fy) => {
    const fr = rowsForFy(allRows, fy);
    const agg = aggregateFinanceFromRows(fr);
    const j = sumJoiners(fr);
    return {
      year: fyLabelRange(fy),
      volume: Math.round(j),
      rphSub: formatRphSub(agg?.revenue_actual_inr ?? 0, j),
    };
  });

  const revenuePerEmployee = window3.map((fy) => {
    const fr = rowsForFy(allRows, fy);
    const agg = aggregateFinanceFromRows(fr);
    const hc = avgMonthlyHc(fr, "actual_headcount_overall");
    const rev = agg?.revenue_actual_inr ?? 0;
    const prod = hc > 0 ? rev / hc : 0;
    return { year: fyLabelRange(fy), value: Math.round(prod) };
  });

  const fy24 = window3[0] != null ? window3[0] : selectedFyStart;
  const fy25 = window3[1] != null ? window3[1] : selectedFyStart;
  const fy26 = window3[2] != null ? window3[2] : selectedFyStart;

  const rph = (fy: number) => {
    const fr = rowsForFy(allRows, fy);
    const a = aggregateFinanceFromRows(fr);
    const j = sumJoiners(fr);
    if (!a || j <= 0) return "—";
    return `${Math.round(a.revenue_actual_inr / j)}`;
  };
  const headcount = (fy: number) => Math.round(avgMonthlyHc(rowsForFy(allRows, fy), "actual_headcount_overall"));
  const productivity = (fy: number) => {
    const fr = rowsForFy(allRows, fy);
    const a = aggregateFinanceFromRows(fr);
    const hc = avgMonthlyHc(fr, "actual_headcount_overall");
    if (!a || hc <= 0) return "—";
    return `${(a.revenue_actual_inr / hc / 1e5).toFixed(2)}L`;
  };
  const cmRow = (fy: number) => {
    const fr = rowsForFy(allRows, fy);
    const a = aggregateFinanceFromRows(fr);
    if (!a || !a.revenue_actual_inr) return "—";
    return `${((a.total_cm_inr / a.revenue_actual_inr) * 100).toFixed(0)}%`;
  };

  const deltaScale = (() => {
    const a = aggregateFinanceFromRows(rowsForFy(allRows, fy26));
    const b = aggregateFinanceFromRows(rowsForFy(allRows, fy24));
    if (!a || !b || !b.revenue_actual_inr || !avgMonthlyHc(rowsForFy(allRows, fy24), "actual_headcount_overall")) return "+0%";
    const p0 = a.revenue_actual_inr / avgMonthlyHc(rowsForFy(allRows, fy26), "actual_headcount_overall");
    const p1 = b.revenue_actual_inr / avgMonthlyHc(rowsForFy(allRows, fy24), "actual_headcount_overall");
    if (!p1) return "—";
    return `${((p0 / p1 - 1) * 100 >= 0 ? "+" : "")}${((p0 / p1 - 1) * 100).toFixed(0)}%`;
  })();

  const kpiTable = {
    ...base.scaleEfficiency.kpiTable,
    headers: ["", fyLabelRange(fy24), fyLabelRange(fy25), fyLabelRange(fy26), "Δ"],
    rows: [
      { metric: "RPH", fy24: rph(fy24), fy25: rph(fy25), fy26: rph(fy26), delta: "—" },
      { metric: "Headcount", fy24: String(headcount(fy24)), fy25: String(headcount(fy25)), fy26: String(headcount(fy26)), delta: "—" },
      { metric: "Productivity", fy24: productivity(fy24), fy25: productivity(fy25), fy26: productivity(fy26), delta: deltaScale },
      { metric: "CM", fy24: cmRow(fy24), fy25: cmRow(fy25), fy26: cmRow(fy26), delta: "—" },
    ],
  };

  // ── Slide 3: Industry — dynamic verticals (new verticals appear as soon as tagged) ──
  const mixAnchor = verticalMixForFy(rowsForFy(allRows, selectedFyStart), projects);
  const mixCompare = verticalMixForFy(rowsForFy(allRows, effectiveCompareFy), projects);
  const verticalSet = new Set<string>();
  mixAnchor.forEach((m) => verticalSet.add(m.vertical));
  mixCompare.forEach((m) => verticalSet.add(m.vertical));
  const industries = Array.from(verticalSet)
    .map((industry) => {
      const a = mixAnchor.find((x) => x.vertical === industry)?.share ?? 0;
      const b = mixCompare.find((x) => x.vertical === industry)?.share ?? 0;
      return { industry, fy24: Math.round(b * 10) / 10, fy26e: Math.round(a * 10) / 10 };
    })
    .sort((x, y) => y.fy26e - x.fy26e)
    .slice(0, 12)
    .map((row, i) => ({ ...row, color: DONUT_PALETTE[i % DONUT_PALETTE.length] }));

  const donutSegments = mixAnchor.slice(0, 8).map((m, i) => ({
    name: m.vertical,
    pct: Math.round(m.share * 10) / 10,
    color: DONUT_PALETTE[i % DONUT_PALETTE.length],
  }));

  // ── Slide 5: Growth — revenue & CM from ledger; forward years unchanged from base ──
  const revenueYoY = sortedAsc.map((fy) => {
    const fr = rowsForFy(allRows, fy);
    const a = aggregateFinanceFromRows(fr);
    const cr = a ? a.revenue_actual_inr / 1e7 : 0;
    return {
      year: fyLabelShort(fy),
      value: Math.round(cr * 10) / 10,
      label: `${(Math.round(cr * 10) / 10).toFixed(1)} Cr`,
    };
  });

  const grossMarginPct = sortedAsc.map((fy) => {
    const fr = rowsForFy(allRows, fy);
    const a = aggregateFinanceFromRows(fr);
    const pct = a && a.revenue_actual_inr > 0 ? (a.total_cm_inr / a.revenue_actual_inr) * 100 : 0;
    return { year: fyLabelShort(fy), value: Math.round(pct * 10) / 10 };
  });

  const ebitdaYoY = sortedAsc.map((fy) => {
    const fr = rowsForFy(allRows, fy);
    const a = aggregateFinanceFromRows(fr);
    const barCr = a ? a.total_cm_inr / 1e7 : 0;
    const marginPct =
      a && a.revenue_actual_inr > 0 ? (a.total_cm_inr / a.revenue_actual_inr) * 100 : 0;
    return { year: fyLabelShort(fy), bar: Math.round(barCr * 10) / 10, marginPct: Math.round(marginPct * 10) / 10 };
  });

  const growthFooter =
    (base.growthJourney.footerNote ? `${base.growthJourney.footerNote} ` : "") +
    "Revenue and contribution margin (CM) are from the finance ledger. CM is not audited EBITDA.";

  // ── Slide 6: Bridge (simplified: prior FY → anchor FY) ──
  const priorCr = revPrior / 1e7;
  const anchorCr = revA / 1e7;
  const deltaCr = anchorCr - priorCr;
  const deltaRounded = Math.round(deltaCr * 10) / 10;
  const bridgeSteps: CeoSlideDeckConfig["revenueBridge"]["steps"] = [
    { label: `Revenue ${fyLabelRange(effectiveCompareFy)}`, value: Math.round(priorCr * 10) / 10, kind: "total" },
    {
      label: `Change ${fyLabelRange(effectiveCompareFy)} → ${fyLabelRange(selectedFyStart)}`,
      value: deltaRounded,
      kind: deltaCr >= 0 ? "increase" : "decrease",
    },
    { label: `Revenue ${fyLabelRange(selectedFyStart)}`, value: Math.round(anchorCr * 10) / 10, kind: "final" },
  ];
  const yMaxBridge = Math.max(priorCr, anchorCr, 1) * 1.2;

  // ── Slide 9: People — workforce from avg HC ──
  const wf = Math.round(avgMonthlyHc(anchorRows, "actual_headcount_overall"));
  const bannerMetrics = base.peopleCapability.bannerMetrics.map((b, i) =>
    i === 0 ? { ...b, value: wf > 0 ? `${wf}+` : b.value, label: "Avg monthly workforce (overall HC)" } : b,
  );

  const out: CeoSlideDeckConfig = {
    ...base,
    financialPerformance: {
      ...base.financialPerformance,
      title: base.financialPerformance.title,
      totalRevenueByYear,
      metricCards,
    },
    scaleEfficiency: {
      ...base.scaleEfficiency,
      hiringVolume,
      revenuePerEmployee,
      kpiTable,
    },
    industryDiversification: {
      ...base.industryDiversification,
      donutLabel: `${fyLabelRange(selectedFyStart)} mix`,
      tableTitle: `${fyLabelRange(effectiveCompareFy)} vs ${fyLabelRange(selectedFyStart)}`,
      tableSubtitle: "Vertical revenue share · ledger",
      donutSegments,
      industries,
    },
    growthJourney: {
      ...base.growthJourney,
      years: sortedAsc.map(fyLabelShort),
      highlightYear: fyLabelShort(selectedFyStart),
      revenueYoY,
      ebitdaYoY,
      grossMarginPct,
      footerNote: growthFooter,
    },
    revenueBridge: {
      ...base.revenueBridge,
      title: `Revenue bridge (${fyLabelRange(effectiveCompareFy)} → ${fyLabelRange(selectedFyStart)}) · INR Cr`,
      yMax: Math.round(yMaxBridge * 10) / 10,
      steps: bridgeSteps,
    },
    peopleCapability: {
      ...base.peopleCapability,
      bannerMetrics,
    },
  };

  return { deck: out, asOf };
}

/** FY-scoped rows for slide helpers (same filters as dashboard). */
export function financeRowsScoped(allRows: FinanceRowVm[], projects: Project[]): FinanceRowVm[] {
  return filterFinanceRows(allRows, projects, DEFAULT_DASHBOARD_FILTERS);
}
