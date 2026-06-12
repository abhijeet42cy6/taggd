import type { RecordRpoPatch, RecordRow } from "@/lib/api";

/** Requisition org dimensions — maps UI labels to `records` RPO columns (+ extras for SBG). */
export type ReqOrgFormFields = {
  rpo_vertical: string;
  rpo_division: string;
  org_sbg: string;
  rpo_bu_sbu: string;
  rpo_business_hrbp: string;
  rpo_grade_band: string;
};

export const REQ_ORG_FIELD_LABELS: { key: keyof ReqOrgFormFields; label: string; hint?: string }[] = [
  { key: "rpo_vertical", label: "Business unit" },
  { key: "rpo_division", label: "Division" },
  { key: "org_sbg", label: "SBG", hint: "Stored in requisition_extras (no dedicated column)" },
  { key: "rpo_bu_sbu", label: "SBU" },
  { key: "rpo_business_hrbp", label: "BHR", hint: "Business HRBP" },
  { key: "rpo_grade_band", label: "Band" },
];

function readExtraString(r: RecordRow, key: string): string {
  const ext = r.requisition_extras;
  if (ext && typeof ext === "object" && !Array.isArray(ext)) {
    const v = (ext as Record<string, unknown>)[key];
    if (typeof v === "string") return v.trim();
  }
  return "";
}

export function readReqOrgFields(r: RecordRow): ReqOrgFormFields {
  return {
    rpo_vertical: (r.rpo_vertical ?? "").trim(),
    rpo_division: (r.rpo_division ?? "").trim(),
    org_sbg: readExtraString(r, "sbg"),
    rpo_bu_sbu: (r.rpo_bu_sbu ?? "").trim(),
    rpo_business_hrbp: (r.rpo_business_hrbp ?? "").trim(),
    rpo_grade_band: (r.rpo_grade_band ?? "").trim(),
  };
}

export function orgFieldsToRpoPatch(fields: ReqOrgFormFields): RecordRpoPatch | undefined {
  const rpo: RecordRpoPatch = {};
  const str = (v: string) => v.trim();

  if (str(fields.rpo_vertical)) rpo.rpo_vertical = str(fields.rpo_vertical);
  if (str(fields.rpo_division)) rpo.rpo_division = str(fields.rpo_division);
  if (str(fields.rpo_bu_sbu)) rpo.rpo_bu_sbu = str(fields.rpo_bu_sbu);
  if (str(fields.rpo_business_hrbp)) rpo.rpo_business_hrbp = str(fields.rpo_business_hrbp);
  if (str(fields.rpo_grade_band)) rpo.rpo_grade_band = str(fields.rpo_grade_band);

  const sbg = str(fields.org_sbg);
  if (sbg) {
    rpo.requisition_extras = { sbg };
  }

  return Object.keys(rpo).length ? rpo : undefined;
}

export function mergeRpoPatches(...patches: (RecordRpoPatch | undefined)[]): RecordRpoPatch | undefined {
  const merged: RecordRpoPatch = {};
  let extras: Record<string, unknown> | undefined;
  for (const p of patches) {
    if (!p) continue;
    for (const [k, v] of Object.entries(p)) {
      if (k === "requisition_extras" && v && typeof v === "object") {
        extras = { ...(extras ?? {}), ...(v as Record<string, unknown>) };
      } else if (v !== undefined && v !== null) {
        (merged as Record<string, unknown>)[k] = v;
      }
    }
  }
  if (extras && Object.keys(extras).length) merged.requisition_extras = extras;
  return Object.keys(merged).length ? merged : undefined;
}
