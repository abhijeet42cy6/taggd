import type { RecordRow } from "@/lib/api";

export function requisitionFunnelVm(records: RecordRow[]) {
  const out: Record<string, number> = { Draft: 0, Open: 0, Screening: 0, Offer: 0, Joined: 0, Cancelled: 0 };
  for (const r of records || []) {
    const s = (r.status || "").toLowerCase();
    if (s.includes("draft")) out.Draft += 1;
    else if (s.includes("screen")) out.Screening += 1;
    else if (s.includes("offer")) out.Offer += 1;
    else if (s.includes("join") || (r.global_status || "").toUpperCase() === "CLOSED") out.Joined += 1;
    else if (s.includes("cancel") || s.includes("hold")) out.Cancelled += 1;
    else out.Open += 1;
  }
  return out;
}

