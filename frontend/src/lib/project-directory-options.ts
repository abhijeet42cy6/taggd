import type { Project } from "@/lib/api";

/** Closed lists aligned with `excel_upload_masters/column_dropdowns.py` and directory ingest. */
export const ACCOUNT_STATUS_OPTIONS = ["Active", "Not Active", "Dormant"] as const;

export const CATEGORY_TARA_OPTIONS = ["TARA", "Non TARA"] as const;

/** Ops sub-regions used in SLA / finance mapping (plus values seen in project directory). */
export const SUB_REGION_OPTIONS = [
  "North",
  "South 1",
  "South 2",
  "West 1",
  "West 2",
  "Middle East",
] as const;

/** Account type / practice from Listing backfill and directory. */
export const PRACTICE_ACCOUNT_TYPE_OPTIONS = ["RPO", "Lateral", "Leadership"] as const;

/** Common vertical / industry labels; extended with values from loaded projects. */
export const VERTICAL_INDUSTRY_SEED = ["RPO", "Manufacturing", "Automotive", "IT", "BFSI", "Pharma"] as const;

function uniqSorted(vals: (string | null | undefined)[]): string[] {
  const s = new Set<string>();
  for (const v of vals) {
    const t = (v ?? "").trim();
    if (t) s.add(t);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

/** Merge canonical options with directory values so existing rows stay selectable. */
export function directorySelectOptions(
  canonical: readonly string[],
  projects: Project[],
  pick: (p: Project) => string | null | undefined,
  current?: string | null,
): string[] {
  const merged = uniqSorted([...canonical, ...projects.map(pick), current]);
  return merged;
}

export function projectDirectoryOptionSets(projects: Project[], current?: Partial<Project>) {
  return {
    subRegions: directorySelectOptions(SUB_REGION_OPTIONS, projects, (p) => p.sub_region, current?.sub_region),
    categories: directorySelectOptions(CATEGORY_TARA_OPTIONS, projects, (p) => p.category, current?.category),
    verticals: directorySelectOptions(VERTICAL_INDUSTRY_SEED, projects, (p) => p.vertical, current?.vertical),
    practices: directorySelectOptions(PRACTICE_ACCOUNT_TYPE_OPTIONS, projects, (p) => p.practice, current?.practice),
    accountStatuses: directorySelectOptions(
      ACCOUNT_STATUS_OPTIONS,
      projects,
      (p) => p.account_status,
      current?.account_status,
    ),
  };
}
