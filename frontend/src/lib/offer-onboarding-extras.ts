/** Keys stored in `candidates.offer_onboarding_extras` from Offer & Onboarding tracker / UI. */

export const OFFER_ONBOARDING_EXTRA_KEYS = [
  "employment_type",
  "duration",
  "deviation",
  "deviation_comments",
  "letter_sent_date",
  "letter_accepted_date",
  "document_shared_with_taq_date",
  "notice_period_buyout_amount",
  "remarks",
] as const;

export type OfferOnboardingExtraKey = (typeof OFFER_ONBOARDING_EXTRA_KEYS)[number];

export const EMPLOYMENT_TYPE_OPTIONS = ["Permanent", "Contractual", "Trainee", "Aprantice"] as const;

export const JOINING_STATUS_OPTIONS = ["Confirmed", "Pending", "Deferred", "Dropped", "Joined"] as const;

export const CHECKIN_STATUS_OPTIONS = ["Pending", "Completed", "N/A", "Scheduled"] as const;

export const EARLY_EXIT_RISK_OPTIONS = ["🟢 Low", "🟡 Watch", "🔴 High Risk"] as const;

export const OFFER_ACCEPTED_OPTIONS = ["Yes", "No", "Pending"] as const;

export function readOfferExtra(
  extras: Record<string, unknown> | null | undefined,
  key: OfferOnboardingExtraKey,
): string {
  if (!extras || typeof extras !== "object") return "";
  const v = extras[key];
  if (v == null) return "";
  return String(v);
}

export function mergeOfferExtras(
  base: Record<string, unknown> | null | undefined,
  patch: Partial<Record<OfferOnboardingExtraKey, string>>,
): Record<string, unknown> {
  const out = { ...(base && typeof base === "object" ? base : {}) };
  for (const [k, v] of Object.entries(patch)) {
    const t = (v ?? "").trim();
    if (t) out[k] = t;
    else delete out[k];
  }
  return out;
}

export type OfferOnboardingSummary = {
  total: number;
  open_offers: number;
  accepted_pending_doj: number;
  joined: number;
  at_risk: number;
  overdue_checkins: number;
  offer_accept_rate_pct: number | null;
};

export function formatOfferDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return iso;
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatOfferCtc(lpa: number | null | undefined): string {
  if (lpa == null || Number.isNaN(lpa)) return "—";
  return `${lpa.toLocaleString("en-IN", { maximumFractionDigits: 2 })} LPA`;
}

export function riskBadgeClass(risk: string | null | undefined): string {
  const s = (risk || "").toLowerCase();
  if (s.includes("high") || s.includes("🔴") || s.includes("red")) {
    return "bg-rose-100 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-900/50";
  }
  if (s.includes("watch") || s.includes("🟡") || s.includes("amber")) {
    return "bg-amber-100 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900/50";
  }
  if (s.includes("low") || s.includes("🟢") || s.includes("green")) {
    return "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-900/50";
  }
  return "bg-tremor-background-muted text-tremor-content-emphasis ring-tremor-ring dark:bg-dark-tremor-background-muted";
}
