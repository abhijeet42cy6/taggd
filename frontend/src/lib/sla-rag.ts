/**
 * Maps SLA template + legacy Base File status strings to UI / portfolio buckets.
 * Template 08_sla allows Green / Amber / Red / Grey / RAG_* (see column_dropdowns.py);
 * Base File may use "Met" / "Not Met" free text.
 */

export type SlaRagUiBucket = "met" | "breached" | "not_reported";

/** Lowercase key set for "met" after trim. */
const MET = new Set(["met", "green", "rag_g"]);

/** "Not met" / breach / warning RAG */
const BREACH = new Set([
  "not met",
  "red",
  "amber",
  "yellow",
  "rag_r",
  "rag_a",
  "breach",
  "breached",
  "not_met",
]);

const NOT_REPORTED = new Set([
  "",
  "n/a",
  "na",
  "nan",
  "none",
  "not reported",
  "not_reported",
  "no data",
  "no_data",
  "grey",
  "gray",
  "-",
]);

function normKey(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Classify a raw `rag_status` (or status column) for KPI cards and filters.
 */
export function slaRagUiBucket(raw: unknown): SlaRagUiBucket {
  const s = normKey(String(raw ?? ""));
  if (!s) return "not_reported";
  if (NOT_REPORTED.has(s) || s.includes("not reported")) return "not_reported";
  if (MET.has(s)) return "met";
  if (s.includes("not met") || BREACH.has(s)) return "breached";
  return "not_reported";
}

/**
 * Human label for the status tag (matches previous Met / Breached / Not Reported).
 */
export function slaRagDisplayLabel(raw: unknown): string {
  const b = slaRagUiBucket(raw);
  if (b === "met") return "Met";
  if (b === "breached") return "Breached";
  return "Not Reported";
}
