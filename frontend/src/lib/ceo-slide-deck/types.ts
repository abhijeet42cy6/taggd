/** Configurable board deck for CEO's View — reference slide images (v1). */

export const CEO_SLIDE_DECK_VERSION = 1 as const;
export const CEO_SLIDE_DECK_STORAGE_KEY = "tgddata_ceo_slide_deck_v1";

export type YearTriple = { fy24: string; fy25: string; fy26e: string };

export type FinancialPerformanceSlide = {
  title: string;
  /** Total revenue bar — values in Cr or same unit as slide */
  totalRevenueByYear: { label: string; value: number }[];
  /** Stacked composition per year */
  composition: {
    year: string;
    existing: number;
    rampUp: number;
    anew: number;
  }[];
  metricCards: { primary: string; title: string; sub: string }[];
  landExpandTitle: string;
  landExpandBody: string;
};

export type ScaleEfficiencySlide = {
  title: string;
  hiringVolume: { year: string; volume: number; rphSub: string }[];
  revenuePerEmployee: { year: string; value: number }[];
  kpiTable: {
    headers: string[];
    rows: { metric: string; fy24: string; fy25: string; fy26: string; delta: string }[];
  };
  efficiencyTitle: string;
  efficiencyBody: string;
};

export type IndustryRow = {
  industry: string;
  color: string;
  fy24: number;
  fy26e: number;
};

export type IndustryDiversificationSlide = {
  title: string;
  subtitle: string;
  donutLabel: string;
  donutSegments: { name: string; pct: number; color: string }[];
  tableTitle: string;
  tableSubtitle: string;
  industries: IndustryRow[];
};

export type NewBusinessSlide = {
  title: string;
  kpiRow1: { primary: string; label: string; sub: string }[];
  kpiRow2: { primary: string; label: string; sub: string }[];
  acvBar: { year: string; value: number }[];
  strengthsTitle: string;
  strengths: { num: string; text: string }[];
};

export type GrowthJourneySlide = {
  title: string;
  footerNote: string;
  years: string[];
  highlightYear: string;
  revenueYoY: { year: string; value: number; label?: string }[];
  revenueGrowthTag: string;
  ebitdaYoY: { year: string; bar: number; marginPct: number }[];
  ebitdaGrowthTag: string;
  newAcv: { year: string; value: number }[];
  grossMarginPct: { year: string; value: number }[];
  sidebarKpis: { primary: string; label: string }[];
  sidebarBullets: string[];
};

export type RevenueBridgeSlide = {
  title: string;
  yMax: number;
  steps: { label: string; value: number; kind: "total" | "increase" | "decrease" | "final" }[];
};

export type UnitEconomicsRow =
  | { type: "data"; metric: string; fy25: string; fy26: string; fy27: string; fy30: string }
  | { type: "section"; metric: string }
  | { type: "summary"; metric: string; fy25: string; fy26: string; fy27: string; fy30: string };

export type UnitEconomicsSlide = {
  title: string;
  footerNote: string;
  headers: string[];
  rows: UnitEconomicsRow[];
};

export type HiringSourceSlide = {
  title: string;
  donut: { name: string; pct: number; color: string }[];
  stackedSectors: { sector: string; series: { name: string; pct: number }[] }[];
  seriesColors: Record<string, string>;
  insights: string[];
  footerNote: string;
};

export type PeopleCapabilitySlide = {
  title: string;
  subtitle: string;
  bannerMetrics: { value: string; label: string }[];
  deliveryTitle: string;
  deliveryBadge: string;
  deliveryItems: { title: string; body: string; icon: "building" | "star" | "message" | "rocket" }[];
  leadershipTitle: string;
  leadershipItems: { title: string; body: string; icon: "crown" | "user" }[];
  distributionTitle: string;
  wlDistribution: { level: string; pct: number; color: string }[];
  footerLine: string;
};

export type CostTeamSlide = {
  title: string;
  summaryCards: { primary: string; sub: string }[];
  headcountBySbu: {
    columns: string[];
    rows: { sbu: string; function: string; east: string; north: string; south: string; west: string; total: string }[];
    grandTotal: { east: string; north: string; south: string; west: string; all: string };
  };
  tenureByBand: { band: string; headcount: string; avgTenure: string }[];
  incentiveGrid: { band: string; sales: string; recruitmentOps: string; isg: string; technology: string }[];
  footerNote: string;
};

export type CeoSlideDeckConfig = {
  version: typeof CEO_SLIDE_DECK_VERSION;
  financialPerformance: FinancialPerformanceSlide;
  scaleEfficiency: ScaleEfficiencySlide;
  industryDiversification: IndustryDiversificationSlide;
  newBusinessRetention: NewBusinessSlide;
  growthJourney: GrowthJourneySlide;
  revenueBridge: RevenueBridgeSlide;
  unitEconomics: UnitEconomicsSlide;
  hiringSourceMix: HiringSourceSlide;
  peopleCapability: PeopleCapabilitySlide;
  costTeamStructure: CostTeamSlide;
};
