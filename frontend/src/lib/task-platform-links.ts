/**
 * Canonical `linked_resource_type` values and deep-link targets for the task board.
 * Keeps tasks attachable to every major platform module (not only revenue).
 */

export type PlatformTaskLinkKind = {
  /** Stored in `Task.linked_resource_type` */
  value: string;
  /** UI label in pickers */
  label: string;
  /** Shown under picker / placeholder */
  hint: string;
  /** When user picks this kind, prefill `task_category` if empty */
  defaultCategory: string;
  /** Whether `linked_resource_id` is required for a useful deep link */
  idRequired?: boolean;
};

/** Preset link kinds — order follows main nav / domains. */
export const PLATFORM_TASK_LINK_KINDS: PlatformTaskLinkKind[] = [
  { value: "portfolio", label: "Portfolio intelligence", hint: "Optional ref id in notes", defaultCategory: "portfolio", idRequired: false },
  { value: "project", label: "Client / project (PRJ)", hint: "Numeric project id → client hub", defaultCategory: "client_project" },
  { value: "transition", label: "Client onboarding", hint: "Transition id if tracked; else project id", defaultCategory: "transitions" },
  { value: "client_contract", label: "Client contracts", hint: "Contract id if known", defaultCategory: "contract" },
  { value: "meeting", label: "Meeting / MoM", hint: "platform_meetings.id", defaultCategory: "meeting" },
  { value: "requisition", label: "Requisition / record", hint: "records.id", defaultCategory: "requisition" },
  { value: "candidate", label: "Candidate", hint: "Internal candidate id", defaultCategory: "candidate" },
  { value: "candidate_store", label: "Candidate store", hint: "Store row id", defaultCategory: "candidate" },
  { value: "fiscal_performance", label: "Finance command", hint: "Project or FY ref in id", defaultCategory: "finance" },
  { value: "revenue_tracker", label: "Revenue trackers", hint: "Project id or tracker key", defaultCategory: "revenue_tracker" },
  { value: "revenue_weekly_submission", label: "Revenue pack (governance)", hint: "Weekly submission id", defaultCategory: "revenue_governance" },
  { value: "billing", label: "Billing", hint: "Workflow or invoice ref", defaultCategory: "billing" },
  { value: "finance_validation", label: "Finance validation", hint: "Validation case id", defaultCategory: "finance_validation" },
  { value: "vendor_license", label: "Vendor license", hint: "vendor_licenses.id", defaultCategory: "vendor_license" },
  { value: "sla", label: "SLA performance", hint: "Metric or snapshot id", defaultCategory: "sla" },
  { value: "wfm", label: "Workforce management", hint: "WFM row id", defaultCategory: "wfm" },
  { value: "ingestion_batch", label: "Ingestion / upload", hint: "Batch or job id", defaultCategory: "ingestion" },
  { value: "data_operations", label: "Data operations", hint: "Ops ticket or project id", defaultCategory: "data_operations" },
  { value: "ingestion_center", label: "Ingestion center", hint: "Optional ref id", defaultCategory: "ingestion", idRequired: false },
  { value: "activity", label: "Activity log", hint: "Activity id", defaultCategory: "activity" },
  { value: "admin_user", label: "Users & access", hint: "User id", defaultCategory: "admin" },
  { value: "agent", label: "Assistant / agent", hint: "Session or n/a", defaultCategory: "agent", idRequired: false },
  { value: "task", label: "Related task", hint: "platform_tasks.id", defaultCategory: "adhoc" },
];

const KIND_MAP = new Map(PLATFORM_TASK_LINK_KINDS.map((k) => [k.value, k]));

/** Aliases → canonical kind for href building */
const LINK_TYPE_ALIASES: Record<string, string> = {
  record: "requisition",
  req: "requisition",
  resume_supplier_license: "vendor_license",
  client: "project",
  clients: "project",
  finance: "fiscal_performance",
  revenue_governance: "revenue_weekly_submission",
  weekly_submission: "revenue_weekly_submission",
};

function canonicalKind(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const t = raw.trim().toLowerCase();
  return LINK_TYPE_ALIASES[t] ?? t;
}

/**
 * Build in-app path for Router (basename-aware callers should use `Link` from react-router).
 */
export function platformTaskLinkHref(linkType: string | null | undefined, resourceId: string | null | undefined): string | null {
  const kind = canonicalKind(linkType);
  const id = (resourceId ?? "").trim();
  switch (kind) {
    case "project":
    case "transition":
      if (!id) return "/clients";
      return `/clients/${encodeURIComponent(id)}`;
    case "client_contract":
      return id ? `/client-contracts?ref=${encodeURIComponent(id)}` : "/client-contracts";
    case "meeting":
      return id ? `/meetings?meeting=${encodeURIComponent(id)}` : "/meetings";
    case "requisition":
      return id ? `/requisitions?record=${encodeURIComponent(id)}` : "/requisitions";
    case "candidate":
      return id ? `/candidates?highlight=${encodeURIComponent(id)}` : "/candidates";
    case "candidate_store":
      return "/candidate-store";
    case "fiscal_performance":
      return "/finance";
    case "revenue_tracker":
      return id ? `/revenue-trackers?project=${encodeURIComponent(id)}` : "/revenue-trackers";
    case "revenue_weekly_submission":
      return id ? `/revenue-governance?submission=${encodeURIComponent(id)}` : "/revenue-governance";
    case "billing":
      return "/billing";
    case "finance_validation":
      return id ? `/finance-validation?case=${encodeURIComponent(id)}` : "/finance-validation";
    case "vendor_license":
      return "/vendor-licenses";
    case "sla":
      return "/sla-performance";
    case "wfm":
      return "/wfm";
    case "ingestion_batch":
      return "/ingestion";
    case "data_operations":
      return "/data-operations";
    case "ingestion_center":
      return "/ingestion";
    case "portfolio":
      return "/portfolio";
    case "activity":
      return "/activity";
    case "admin_user":
      return "/admin/users";
    case "agent":
      return "/agent";
    case "task":
      return id ? `/tasks?highlight=${encodeURIComponent(id)}` : "/tasks";
    default:
      return null;
  }
}

/** Short label for task cards */
export function platformTaskLinkSummary(linkType: string | null | undefined, resourceId: string | null | undefined): string {
  const kind = canonicalKind(linkType);
  const id = (resourceId ?? "").trim();
  const meta = KIND_MAP.get(kind);
  const base = meta?.label ?? (linkType?.trim() || "Link");
  if (id) return `${base} · ${id}`;
  return base;
}

export function defaultCategoryForLinkKind(linkType: string | null | undefined): string | null {
  const k = KIND_MAP.get(canonicalKind(linkType));
  return k?.defaultCategory ?? null;
}

export const CUSTOM_LINK_PRESET = "__custom__";
