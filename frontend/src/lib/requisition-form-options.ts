/** Preset candidate labels for open / pipeline requisitions. */
export const CANDIDATE_NAME_PRESETS = [
  "Yet to Join (YTJ)",
  "Offered Drop in",
  "Open position",
] as const;

export const DIVERSITY_OPTIONS = ["Male", "Female", "Other"] as const;

export function readDiversity(attrs?: Record<string, unknown> | null): string {
  if (!attrs || typeof attrs !== "object") return "";
  const raw = attrs.diversity ?? attrs.Diversity ?? attrs.gender;
  return typeof raw === "string" ? raw.trim() : "";
}

export function candidateNameSelectOptions(current: string): string[] {
  const set = new Set<string>(CANDIDATE_NAME_PRESETS);
  const cur = current.trim();
  if (cur && !set.has(cur)) set.add(cur);
  return Array.from(set);
}
