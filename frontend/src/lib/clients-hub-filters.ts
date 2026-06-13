import type { Project } from "@/lib/api";
import type { ClientVm } from "@/lib/view-models/clients";
import {
  ACCOUNT_STATUS_OPTIONS,
  CATEGORY_TARA_OPTIONS,
  PRACTICE_ACCOUNT_TYPE_OPTIONS,
  SUB_REGION_OPTIONS,
  VERTICAL_INDUSTRY_SEED,
} from "@/lib/project-directory-options";

export type ClientsHubFilters = {
  /** Legal client lifecycle (clients.lifecycle_state). */
  lifecycle: "all" | "active" | "prospect";
  /** Project account_status — client matches if any SBU matches. */
  accountStatus: "all" | (typeof ACCOUNT_STATUS_OPTIONS)[number];
  region: "all" | string;
  subRegion: "all" | string;
  practiceHead: "all" | string;
  regionalHead: "all" | string;
  functionHead: "all" | string;
  category: "all" | string;
  vertical: "all" | string;
  practice: "all" | string;
  /** Show clients where at least one project has a gap in the chosen field. */
  missingData: "all" | "region" | "sub_region" | "practice_head" | "regional_head" | "charge_code" | "category";
};

export const DEFAULT_CLIENTS_HUB_FILTERS: ClientsHubFilters = {
  lifecycle: "active",
  accountStatus: "all",
  region: "all",
  subRegion: "all",
  practiceHead: "all",
  regionalHead: "all",
  functionHead: "all",
  category: "all",
  vertical: "all",
  practice: "all",
  missingData: "all",
};

function uniqSorted(vals: (string | null | undefined)[]): string[] {
  const s = new Set<string>();
  for (const v of vals) {
    const t = (v ?? "").trim();
    if (t) s.add(t);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

function mergeOptions(canonical: readonly string[], fromProjects: string[]): string[] {
  return uniqSorted([...canonical, ...fromProjects]);
}

export type ClientsHubFilterOptions = {
  regions: string[];
  subRegions: string[];
  practiceHeads: string[];
  regionalHeads: string[];
  functionHeads: string[];
  categories: string[];
  verticals: string[];
  practices: string[];
};

export function buildClientsHubFilterOptions(clients: ClientVm[]): ClientsHubFilterOptions {
  const projects = clients.flatMap((c) => c.projects);
  const pick = (fn: (p: Project) => string | null | undefined) => uniqSorted(projects.map(fn));
  return {
    regions: pick((p) => p.region),
    subRegions: mergeOptions(SUB_REGION_OPTIONS, pick((p) => p.sub_region)),
    practiceHeads: pick((p) => p.practice_head),
    regionalHeads: pick((p) => p.regional_head),
    functionHeads: pick((p) => p.function_head),
    categories: mergeOptions(CATEGORY_TARA_OPTIONS, pick((p) => p.category)),
    verticals: mergeOptions(VERTICAL_INDUSTRY_SEED, pick((p) => p.vertical)),
    practices: mergeOptions(PRACTICE_ACCOUNT_TYPE_OPTIONS, pick((p) => p.practice)),
  };
}

function projectFieldMissing(p: Project, field: ClientsHubFilters["missingData"]): boolean {
  switch (field) {
    case "region":
      return !(p.region ?? "").trim();
    case "sub_region":
      return !(p.sub_region ?? "").trim();
    case "practice_head":
      return !(p.practice_head ?? "").trim();
    case "regional_head":
      return !(p.regional_head ?? "").trim();
    case "charge_code":
      return !(p.charge_code ?? "").trim();
    case "category":
      return !(p.category ?? "").trim();
    default:
      return false;
  }
}

function anyProjectMatches(projects: Project[], pred: (p: Project) => boolean): boolean {
  return projects.length === 0 ? false : projects.some(pred);
}

export function clientMatchesHubFilters(c: ClientVm, filters: ClientsHubFilters): boolean {
  const projects = c.projects;

  if (filters.lifecycle === "active" && c.lifecycleState === "prospect") return false;
  if (filters.lifecycle === "prospect" && c.lifecycleState !== "prospect") return false;

  if (filters.accountStatus !== "all") {
    if (!anyProjectMatches(projects, (p) => (p.account_status ?? "").trim() === filters.accountStatus)) {
      return false;
    }
  }

  if (filters.region !== "all" && !anyProjectMatches(projects, (p) => (p.region ?? "").trim() === filters.region)) {
    return false;
  }
  if (
    filters.subRegion !== "all" &&
    !anyProjectMatches(projects, (p) => (p.sub_region ?? "").trim() === filters.subRegion)
  ) {
    return false;
  }
  if (
    filters.practiceHead !== "all" &&
    !anyProjectMatches(projects, (p) => (p.practice_head ?? "").trim() === filters.practiceHead)
  ) {
    return false;
  }
  if (
    filters.regionalHead !== "all" &&
    !anyProjectMatches(projects, (p) => (p.regional_head ?? "").trim() === filters.regionalHead)
  ) {
    return false;
  }
  if (
    filters.functionHead !== "all" &&
    !anyProjectMatches(projects, (p) => (p.function_head ?? "").trim() === filters.functionHead)
  ) {
    return false;
  }
  if (
    filters.category !== "all" &&
    !anyProjectMatches(projects, (p) => (p.category ?? "").trim() === filters.category)
  ) {
    return false;
  }
  if (
    filters.vertical !== "all" &&
    !anyProjectMatches(projects, (p) => (p.vertical ?? "").trim() === filters.vertical)
  ) {
    return false;
  }
  if (
    filters.practice !== "all" &&
    !anyProjectMatches(projects, (p) => (p.practice ?? "").trim() === filters.practice)
  ) {
    return false;
  }

  if (filters.missingData !== "all") {
    if (!anyProjectMatches(projects, (p) => projectFieldMissing(p, filters.missingData))) {
      return false;
    }
  }

  return true;
}

export function countActiveHubFilters(filters: ClientsHubFilters): number {
  let n = 0;
  if (filters.lifecycle !== DEFAULT_CLIENTS_HUB_FILTERS.lifecycle) n++;
  if (filters.accountStatus !== "all") n++;
  if (filters.region !== "all") n++;
  if (filters.subRegion !== "all") n++;
  if (filters.practiceHead !== "all") n++;
  if (filters.regionalHead !== "all") n++;
  if (filters.functionHead !== "all") n++;
  if (filters.category !== "all") n++;
  if (filters.vertical !== "all") n++;
  if (filters.practice !== "all") n++;
  if (filters.missingData !== "all") n++;
  return n;
}

export function clientMatchesSearch(c: ClientVm, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (c.officialName.toLowerCase().includes(q) || c.client.toLowerCase().includes(q)) return true;
  for (const p of c.projects) {
    const sbu = (p.engagement_name || p.account_name || "").toLowerCase();
    if (sbu.includes(q)) return true;
    if ((p.region ?? "").toLowerCase().includes(q)) return true;
    if ((p.sub_region ?? "").toLowerCase().includes(q)) return true;
    if ((p.practice_head ?? "").toLowerCase().includes(q)) return true;
  }
  for (const id of c.projectIds) {
    if (String(id).includes(q)) return true;
    if (`p${id}`.includes(q) || `p${String(id).padStart(2, "0")}`.toLowerCase().includes(q)) return true;
  }
  return false;
}
