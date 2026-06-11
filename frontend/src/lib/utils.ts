import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(value || 0);
}

export function formatDate(dateString: string): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function formatLargeCurrency(val: number): string {
    if (!val) return '₹0';
    if (val >= 10000000) {
        return `₹${(val / 10000000).toFixed(2)} Cr`;
    } else if (val >= 100000) {
        return `₹${(val / 100000).toFixed(2)} L`;
    }
    return formatCurrency(val);
}

/** Correct ingest rows that stored annual CTC with an extra ×1e5 (e.g. ₹325B instead of ₹32.5L). */
export function normalizeOfferedCtcInr(raw: number | null | undefined): number {
  const n = typeof raw === "number" ? raw : Number(raw ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  let v = n;
  if (v >= 100_000_000_000) v /= 100_000;
  return v;
}

/** Display annual CTC in compact ₹L / ₹Cr (stored as absolute INR). */
export function formatOfferedCtc(raw: number | null | undefined): string {
  const inr = normalizeOfferedCtcInr(raw);
  if (inr <= 0) return "—";
  return formatLargeCurrency(inr);
}

/** Placement fee revenue from `revenue_results` (not candidate CTC). */
export function recordRevenueInr(
  results: { revenue?: number | string | null } | null | undefined,
): number {
  const raw = results?.revenue;
  const n = typeof raw === "number" ? raw : Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function recordOpeningFeeInr(
  results: { opening_fee?: number | string | null } | null | undefined,
): number {
  const raw = results?.opening_fee;
  const n = typeof raw === "number" ? raw : Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function formatPercent(value: number | string | null | undefined, digits = 1): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.0%";
  return `${num.toFixed(digits)}%`;
}

/** WFM lateral productivity target — workbook column is in lacs, not a percentage. */
export function formatLacs(value: number | string | null | undefined, digits = 1): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return `${(0).toFixed(digits)} lacs`;
  return `${num.toFixed(digits)} lacs`;
}

export function formatNumber(value: number | string | null | undefined, digits = 1): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return (0).toFixed(digits);
  return num.toFixed(digits);
}

type RecordReqIdSource = {
  id: number;
  client_req_id?: string | null;
  excel_provided_id?: string | null;
  additional_attributes?: Record<string, unknown>;
};

function cleanReqIdValue(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s.toLowerCase() === "nan" || s.toLowerCase() === "none") return null;
  return s.replace(/\.0$/, "");
}

/** Best display label for a requisition id (Excel Req ID, position code, or DB fallback). */
export function displayRecordReqId(record: RecordReqIdSource): string {
  const attrs = record.additional_attributes ?? {};
  const fromAttrs =
    cleanReqIdValue(attrs.position_code) ??
    cleanReqIdValue(attrs["Position Code"]) ??
    cleanReqIdValue(attrs["Req ID"]) ??
    cleanReqIdValue(attrs["ABG Req ID"]);
  if (fromAttrs) return fromAttrs;
  const fromColumn =
    cleanReqIdValue(record.client_req_id) ?? cleanReqIdValue(record.excel_provided_id);
  if (fromColumn) return fromColumn;
  return `REQ-${record.id}`;
}

