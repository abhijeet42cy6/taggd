/**
 * Normalize API `mapping` payloads: legacy flat dict vs v2 `{ universal, record_fields }`.
 */

export type ColumnMappingSections = {
  isV2: boolean;
  universal: [string, string][];
  recordFields: [string, string][];
};

export function parseColumnMappingSections(raw: unknown): ColumnMappingSections {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { isV2: false, universal: [], recordFields: [] };
  }
  const o = raw as Record<string, unknown>;
  const u = o.universal;
  const r = o.record_fields;

  if (u && typeof u === "object" && !Array.isArray(u)) {
    const universal = Object.entries(u)
      .filter(([, v]) => typeof v === "string" && String(v).trim())
      .map(([k, v]) => [k, String(v).trim()] as [string, string])
      .sort(([a], [b]) => a.localeCompare(b));
    const rec =
      r && typeof r === "object" && !Array.isArray(r)
        ? (Object.entries(r)
            .filter(([, v]) => typeof v === "string" && String(v).trim())
            .map(([k, v]) => [k, String(v).trim()] as [string, string])
            .sort(([a], [b]) => a.localeCompare(b)) as [string, string][])
        : [];
    return { isV2: true, universal, recordFields: rec };
  }

  const skip = new Set(["version", "universal", "record_fields"]);
  const universal = Object.entries(o)
    .filter(([k, v]) => typeof v === "string" && !skip.has(k) && String(v).trim())
    .map(([k, v]) => [k, String(v).trim()] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b));
  return { isV2: false, universal, recordFields: [] };
}

/** Turn snake_case API key into a short title for UI. */
export function formatMappingFieldLabel(key: string): string {
  if (!key) return "";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
