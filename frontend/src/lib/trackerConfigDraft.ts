import type { TrackerConfig } from "@/lib/api";

/** Parse lines like `WIP → Open` or `WIP: Open` into a status vocabulary map. */
export function parseStatusVocabulary(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sep = trimmed.includes("→") ? "→" : trimmed.includes(":") ? ":" : null;
    if (!sep) continue;
    const [left, right] = trimmed.split(sep);
    const key = left?.trim();
    const val = right?.trim();
    if (key && val) out[key] = val;
  }
  return out;
}

export function statusVocabularyToText(vocab?: Record<string, string> | null): string {
  if (!vocab) return "";
  return Object.entries(vocab)
    .map(([k, v]) => `${k} → ${v}`)
    .join("\n");
}

const COLUMN_ALIAS_FIELDS = [
  { key: "req_id", label: "Req ID column" },
  { key: "status", label: "Status column" },
  { key: "position_title", label: "Position title column" },
  { key: "candidate_name", label: "Candidate name column" },
  { key: "joining_date", label: "Joining date column" },
  { key: "offered_ctc", label: "Offered CTC column" },
] as const;

export type ColumnAliasField = (typeof COLUMN_ALIAS_FIELDS)[number]["key"];

export type ColumnAliasesDraft = Record<ColumnAliasField, string>;

export function emptyColumnAliasesDraft(): ColumnAliasesDraft {
  return {
    req_id: "",
    status: "",
    position_title: "",
    candidate_name: "",
    joining_date: "",
    offered_ctc: "",
  };
}

export function columnAliasesFromConfig(aliases?: Record<string, string> | null): ColumnAliasesDraft {
  const base = emptyColumnAliasesDraft();
  if (!aliases) return base;
  for (const { key } of COLUMN_ALIAS_FIELDS) {
    const v = aliases[key];
    if (typeof v === "string") base[key] = v;
  }
  return base;
}

export function columnAliasesToConfig(draft: ColumnAliasesDraft): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key } of COLUMN_ALIAS_FIELDS) {
    const v = draft[key]?.trim();
    if (v) out[key] = v;
  }
  return out;
}

export { COLUMN_ALIAS_FIELDS };

export type FeeModelDraft = {
  type: "percentage" | "flat_fee";
  closing_fee_pct: string;
  opening_fee_pct: string;
  flat_fee_per_joiner: string;
};

export function emptyFeeModelDraft(): FeeModelDraft {
  return {
    type: "percentage",
    closing_fee_pct: "",
    opening_fee_pct: "",
    flat_fee_per_joiner: "",
  };
}

export function feeModelFromConfig(fee?: TrackerConfig["fee_model"]): FeeModelDraft {
  if (!fee) return emptyFeeModelDraft();
  return {
    type: fee.type === "flat_fee" ? "flat_fee" : "percentage",
    closing_fee_pct: fee.closing_fee_pct != null ? String(fee.closing_fee_pct) : "",
    opening_fee_pct: fee.opening_fee_pct != null ? String(fee.opening_fee_pct) : "",
    flat_fee_per_joiner: fee.flat_fee_per_joiner != null ? String(fee.flat_fee_per_joiner) : "",
  };
}

export function feeModelToConfig(draft: FeeModelDraft, ctcUnit: "lakhs" | "inr"): TrackerConfig["fee_model"] | undefined {
  if (draft.type === "flat_fee") {
    const flat = parseFloat(draft.flat_fee_per_joiner);
    if (!Number.isFinite(flat)) return undefined;
    return { type: "flat_fee", flat_fee_per_joiner: flat };
  }
  const closing = draft.closing_fee_pct.trim() ? parseFloat(draft.closing_fee_pct) : undefined;
  const opening = draft.opening_fee_pct.trim() ? parseFloat(draft.opening_fee_pct) : undefined;
  if (closing == null && opening == null) return undefined;
  return {
    type: "percentage",
    closing_fee_pct: closing ?? 0,
    opening_fee_pct: opening ?? 0,
    ctc_unit: ctcUnit,
  };
}

export function buildTrackerConfigPayload(draft: {
  valid_bands: string;
  valid_departments: string;
  valid_locations: string;
  valid_source_joiner_types: string[];
  ctc_unit: "lakhs" | "inr";
  required_fields: string[];
  status_vocabulary_text: string;
  column_aliases: ColumnAliasesDraft;
  fee_model: FeeModelDraft;
}): TrackerConfig {
  const status_vocabulary = parseStatusVocabulary(draft.status_vocabulary_text);
  const column_aliases = columnAliasesToConfig(draft.column_aliases);
  const fee_model = feeModelToConfig(draft.fee_model, draft.ctc_unit);
  return {
    valid_bands: parseTagList(draft.valid_bands),
    valid_departments: parseTagList(draft.valid_departments),
    valid_locations: parseTagList(draft.valid_locations),
    valid_source_joiner_types: draft.valid_source_joiner_types,
    ctc_unit: draft.ctc_unit,
    required_fields: draft.required_fields,
    ...(Object.keys(status_vocabulary).length ? { status_vocabulary } : {}),
    ...(Object.keys(column_aliases).length ? { column_aliases } : {}),
    ...(fee_model ? { fee_model } : {}),
  };
}

function parseTagList(raw: string): string[] {
  return raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}
