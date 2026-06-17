import { api, type RecordRow, type RecordsPage } from "@/lib/api";
import { displayRecordReqId } from "@/lib/utils";

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type ExportColumn = { header: string; value: (row: RecordRow) => unknown };

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: "Req ID", value: (r) => displayRecordReqId(r) },
  { header: "Candidate", value: (r) => r.candidate_name || "" },
  { header: "Position", value: (r) => r.position_title || "" },
  { header: "Status", value: (r) => r.status || "" },
  { header: "Global Status", value: (r) => r.global_status || "" },
  { header: "Hiring Manager", value: (r) => r.hiring_manager || "" },
  { header: "Department", value: (r) => r.department || "" },
  { header: "Location", value: (r) => r.location || "" },
  { header: "Offered CTC (L)", value: (r) => r.offered_ctc ?? "" },
  { header: "Revenue", value: (r) => r.revenue_results?.revenue ?? "" },
  { header: "Creation Date", value: (r) => r.creation_date || "" },
  { header: "Joining Date", value: (r) => r.joining_date || "" },
  { header: "Division", value: (r) => r.rpo_division || "" },
  { header: "Band", value: (r) => r.rpo_grade_band || "" },
  { header: "Source", value: (r) => r.source_joiner_type || "" },
  { header: "Project ID", value: (r) => r.project_id },
  { header: "Record ID", value: (r) => r.id },
];

/** Fetch every requisition row in the user's scope (optional search filter). */
export async function fetchAllRequisitionsForExport(search?: string): Promise<RecordRow[]> {
  const perPage = 500;
  const rows: RecordRow[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const qs = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
      ...(search?.trim() ? { search: search.trim() } : {}),
    });
    const { data } = await api.get<RecordsPage>(`/records/all?${qs}`);
    rows.push(...(data.records ?? []));
    totalPages = Math.max(1, data.pages ?? 1);
    page += 1;
  }

  return rows;
}

export function downloadRequisitionsCsv(records: RecordRow[], opts?: { search?: string }): void {
  if (!records.length) return;
  const header = EXPORT_COLUMNS.map((c) => csvEscape(c.header)).join(",");
  const body = records
    .map((row) => EXPORT_COLUMNS.map((c) => csvEscape(c.value(row))).join(","))
    .join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  const tag = opts?.search?.trim() ? "filtered" : "all";
  downloadCsv(`requisitions-${tag}-${stamp}.csv`, `${header}\n${body}`);
}

export type RequisitionExportResult =
  | { ok: true; count: number }
  | { ok: false; message: string };

/** Export all scoped requisitions (respects the table search filter). */
export async function exportScopedRequisitions(search?: string): Promise<RequisitionExportResult> {
  try {
    const records = await fetchAllRequisitionsForExport(search);
    if (!records.length) {
      return { ok: false, message: "No requisitions to export for the current filter." };
    }
    downloadRequisitionsCsv(records, { search });
    return { ok: true, count: records.length };
  } catch {
    return { ok: false, message: "Export failed. Please try again." };
  }
}
