import type { RecordRow } from "@/lib/api";

/** Display label for UNPROCESSED / unmappable pipeline rows (matches Requisitions funnel). */
export const REQUISITION_FUNNEL_UNPROCESSED_LABEL = "Inconsistent Input";

export function requisitionFunnelVm(records: RecordRow[]) {
  const out: Record<string, number> = {
    [REQUISITION_FUNNEL_UNPROCESSED_LABEL]: 0,
    Open: 0,
    Screening: 0,
    Offer: 0,
    Joined: 0,
    "On Hold": 0,
    Cancelled: 0,
  };
  for (const r of records || []) {
    const gs = (r.global_status || "").toUpperCase();
    const s = (r.status || "").toLowerCase();
    if (gs === "UNPROCESSED" || s.includes("draft")) out[REQUISITION_FUNNEL_UNPROCESSED_LABEL] += 1;
    else if (gs === "CANCELLED" || s.includes("cancel")) out.Cancelled += 1;
    else if (gs === "ON HOLD" || s.includes("hold")) out["On Hold"] += 1;
    else if (s.includes("join") || gs === "CLOSED") out.Joined += 1;
    else if (s.includes("offer")) out.Offer += 1;
    else if (s.includes("screen") || s.includes("interview")) out.Screening += 1;
    else if (gs === "PIPELINE") out.Offer += 1;
    else out.Open += 1;
  }
  return out;
}

