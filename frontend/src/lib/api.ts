import axios from "axios";

const AUTH_TOKEN_KEY = "tgddata_access_token";

/** Cloud Run / CDN split: set VITE_API_BASE_URL at build time (e.g. https://api.example.com/api). */
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "/api";

export const api = axios.create({
  baseURL: API_BASE,
  /** Large portfolios + SQLite can exceed short UI races; avoid indefinite hangs. */
  timeout: 120_000,
});

api.interceptors.request.use((config) => {
  const t = localStorage.getItem(AUTH_TOKEN_KEY);
  if (t) {
    config.headers.Authorization = `Bearer ${t}`;
  }
  return config;
});

/** Surface FastAPI `detail` on thrown errors so UI logs show the real message, not only "status code 500". */
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err.response?.status;
    const url = String(err.config?.url ?? "");
    if (
      status === 401 &&
      !url.includes("/auth/login") &&
      typeof window !== "undefined" &&
      !window.location.pathname.includes("/login")
    ) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      delete api.defaults.headers.common.Authorization;
      if (
        import.meta.env.VITE_STATIC_HOSTING === "1" ||
        window.location.hostname === "storage.googleapis.com"
      ) {
        window.location.hash = "#/login";
      } else {
        const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
        window.location.assign(`${base}/login`);
      }
    }
    const d = err.response?.data?.detail;
    if (typeof d === "string" && d.length) {
      err.message = d;
    } else if (Array.isArray(d) && d.length) {
      err.message = d.map((x: { msg?: string }) => x?.msg || JSON.stringify(x)).join("; ");
    }
    return Promise.reject(err);
  }
);

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type GlobalStats = {
  total_revenue: number;
  total_opening_fees: number;
  total_closing_fees: number;
  total_joinees: number;
  total_records: number;
  total_projects: number;
};

/** Server-persisted ingestion audit rows (`GET /ingestion/events`). */
export type IngestionEventRow = {
  id: number;
  public_id: string;
  created_at: string | null;
  actor_email: string;
  kind: string;
  filename: string;
  status: string;
  label: string;
  project_id: number | null;
};

/** Unified activity row (`GET /activity/log`). */
export type ActivityLogItem = {
  id: number;
  public_id: string;
  created_at: string | null;
  actor_email: string;
  action: string;
  resource_type: string;
  resource_id: string;
  project_id: number | null;
  summary: string;
  meta: Record<string, unknown>;
};

/** Weekly revenue forecast row (`GET /revenue-trackers/forecast-weekly`); amounts in INR. */
export type RevenueForecastWeeklyRow = {
  id: number;
  project_id: number;
  account_name: string;
  week_start_date: string | null;
  week_label: string | null;
  month_anchor: string | null;
  update_date: string | null;
  revenue_forecast_inr: number;
  adjustment_inr: number;
  penalty_inr: number;
  bad_debts_inr: number;
  mmf_inr: number;
  open_fee_inr: number;
  joiner_fee_inr: number;
  to_be_offer_fee_inr: number;
  net_revenue_inr: number;
  open_req: number;
  joiner_count: number;
  to_be_offer_count: number;
  achievement_pct: number | null;
  remarks: string | null;
  entered_by_user_id: number | null;
  weekly_submission_id?: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RevenueVisibilitySnapshotRow = {
  id: number;
  project_id: number;
  account_name: string;
  as_of_date: string | null;
  practice_head: string | null;
  mmf_inr: number;
  open_req: number;
  opening_fee_inr: number;
  joiners_as_on_date: number;
  joining_fee_inr: number;
  yet_to_join: number;
  ytj_fee_inr: number;
  conversion_rate_pct: number | null;
  revenue_realised_pct: number | null;
  gap_to_mmf_inr: number;
  status: string | null;
  entered_by_user_id: number | null;
  weekly_submission_id?: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RevenueForecastWeeklyUpsert = {
  project_id: number;
  week_start_date: string;
  week_label?: string | null;
  month_anchor: string;
  update_date?: string | null;
  revenue_forecast_lakhs?: number;
  adjustment_lakhs?: number;
  penalty_lakhs?: number;
  bad_debts_lakhs?: number;
  mmf_lakhs?: number;
  open_fee_lakhs?: number;
  joiner_fee_lakhs?: number;
  to_be_offer_fee_lakhs?: number;
  net_revenue_lakhs?: number;
  open_req?: number;
  joiner_count?: number;
  to_be_offer_count?: number;
  achievement_pct?: number | null;
  remarks?: string | null;
};

export type RevenueVisibilityUpsert = {
  project_id: number;
  as_of_date: string;
  /** Link snapshot to weekly governance pack (ISO week start YYYY-MM-DD). */
  week_start_date?: string | null;
  practice_head?: string | null;
  mmf_inr?: number;
  open_req?: number;
  opening_fee_inr?: number;
  joiners_as_on_date?: number;
  joining_fee_inr?: number;
  yet_to_join?: number;
  ytj_fee_inr?: number;
  conversion_rate_pct?: number | null;
  revenue_realised_pct?: number | null;
  gap_to_mmf_inr?: number;
  status?: string | null;
};

export type RevenueWeeklySubmissionActor = { id: number; email: string; role?: string | null } | null;

export type RevenueWeeklySubmissionDto = {
  id: number;
  project_id: number;
  week_start_date: string | null;
  period_type: string;
  status: string;
  submitted_by_user_id: number | null;
  submitted_at: string | null;
  submitted_by?: RevenueWeeklySubmissionActor;
  reviewed_by_user_id: number | null;
  reviewed_at: string | null;
  review_notes: string | null;
  reviewed_by?: RevenueWeeklySubmissionActor;
  approved_by_user_id: number | null;
  approved_at: string | null;
  approved_by?: RevenueWeeklySubmissionActor;
  version: number;
  created_at: string | null;
  updated_at: string | null;
  account_name?: string;
  client_id?: number | null;
};

export type RevenueWeeklyPackResponse = {
  submission: RevenueWeeklySubmissionDto | null;
  forecast: RevenueForecastWeeklyRow | null;
  visibility: RevenueVisibilitySnapshotRow | null;
};

/** Short workflow summary embedded on `GET /revenue-billing` rows. */
export type RevenueBillingWorkflowSummary = {
  id?: number | null;
  validation_status?: string | null;
  practice_submitted_at?: string | null;
  finance_reviewer_user_id?: number | null;
  junior_validated_at?: string | null;
  cfo_approved_at?: string | null;
};

/** Full workflow payload from `GET /finance-billing-workflow/{billingId}`. */
export type FinanceBillingWorkflowDto = {
  id: number;
  taggd_revenue_billing_id: number;
  validation_status: string;
  practice_submitted_at?: string | null;
  practice_submitted_by_user_id?: number | null;
  finance_reviewer_user_id?: number | null;
  finance_review_started_at?: string | null;
  validation_completed_at?: string | null;
  discrepancy_notes?: string | null;
  payment_mode?: string | null;
  payment_reference_utr?: string | null;
  partial_payment?: boolean | null;
  amount_received_inr?: number | null;
  tds_deducted_inr?: number | null;
  gst_reconciliation_status?: string | null;
  junior_validated_by_user_id?: number | null;
  junior_validated_at?: string | null;
  cfo_approved_by_user_id?: number | null;
  cfo_approved_at?: string | null;
  cfo_sign_off_acknowledged?: boolean | null;
  bank_match_status?: string | null;
  bank_match_confidence?: number | null;
  bank_match_payload_json?: Record<string, unknown> | null;
  overdue_escalation_last_at?: string | null;
  overdue_escalation_level?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  outstanding_inr?: number | null;
  payment_receipts?: FinancePaymentReceiptRow[];
  invoice_amount_inr_for_threshold?: number;
  cfo_threshold_inr?: number;
};

export type FinancePaymentReceiptRow = {
  id: number;
  workflow_id: number;
  amount_inr: number;
  received_date?: string | null;
  payment_mode?: string | null;
  utr_reference?: string | null;
  partial: boolean;
  notes?: string | null;
  created_by_user_id?: number | null;
  created_at?: string | null;
};

export type FinanceBillingValidationEventRow = {
  id: number;
  workflow_id: number;
  user_id?: number | null;
  action: string;
  payload_json?: Record<string, unknown> | null;
  created_at?: string | null;
};

/** TAGGD-style revenue / billing tracker (`GET /revenue-billing`); amounts in INR. */
export type RevenueBillingRow = {
  id: number;
  project_id: number;
  account_name: string;
  update_date: string | null;
  fiscal_year_label: string | null;
  project_manager: string | null;
  revenue_booked_inr: number | null;
  mmf_inr: number | null;
  opening_req: number | null;
  opening_fee_inr: number | null;
  total_joiners: number | null;
  taggd_joiner: number | null;
  taggd_joiner_fee_inr: number | null;
  er_ijp_other_count: number | null;
  er_ijp_other_fee_inr: number | null;
  campus_count: number | null;
  campus_fee_inr: number | null;
  total_joining_fee_inr: number | null;
  adjustment_reason: string | null;
  adjustment_amt_inr: number | null;
  net_revenue_inr: number | null;
  rph_inr: number | null;
  pct_of_target: number | null;
  attachment_ref: string | null;
  approver_name: string | null;
  invoice_number: string | null;
  invoice_amount_inr: number | null;
  invoice_raised_date: string | null;
  payment_due_date: string | null;
  actual_payment_received_date: string | null;
  collection_received_inr: number | null;
  notes: string | null;
  entered_by_user_id: number | null;
  system_created_at: string | null;
  system_updated_at: string | null;
  source_filename: string | null;
  uploaded_by: string | null;
  workflow?: RevenueBillingWorkflowSummary | null;
};

/** Billing row + embedded workflow (same shape as list queue items). */
export type RevenueBillingWithWorkflow = RevenueBillingRow & { workflow?: FinanceBillingWorkflowDto | null };

export type RevenueBillingCreate = {
  project_id: number;
  update_date?: string | null;
  fiscal_year_label?: string | null;
  project_manager?: string | null;
  revenue_booked_inr?: number | null;
  mmf_inr?: number | null;
  opening_req?: number | null;
  opening_fee_inr?: number | null;
  total_joiners?: number | null;
  taggd_joiner?: number | null;
  taggd_joiner_fee_inr?: number | null;
  er_ijp_other_count?: number | null;
  er_ijp_other_fee_inr?: number | null;
  campus_count?: number | null;
  campus_fee_inr?: number | null;
  total_joining_fee_inr?: number | null;
  adjustment_reason?: string | null;
  adjustment_amt_inr?: number | null;
  net_revenue_inr?: number | null;
  rph_inr?: number | null;
  pct_of_target?: number | null;
  attachment_ref?: string | null;
  approver_name?: string | null;
  invoice_number?: string | null;
  invoice_amount_inr?: number | null;
  invoice_raised_date?: string | null;
  payment_due_date?: string | null;
  actual_payment_received_date?: string | null;
  collection_received_inr?: number | null;
  notes?: string | null;
};

export type RevenueBillingPatch = Partial<Omit<RevenueBillingCreate, "project_id">>;

export type GlobalMonitor = {
  total_positions: number;
  status_breakdown: Record<string, number>;
  req_status_breakdown: Record<string, number>;
  ageing_summary: {
    average_days: number;
    total_open_with_date: number;
    buckets: Record<string, number>;
  };
  revenue_total: number;
  project_stats: Array<{
    id: number;
    name: string;
    positions: number;
    closed: number;
    active: number;
    on_hold: number;
    pipeline: number;
    revenue: number;
  }>;
};

/** Portfolio requisition counts from `records` (tracker pipeline). */
export type RequisitionKpis = {
  open_req: number;
  offer_req: number;
  joiners: number;
  total_records: number;
};

/** Count mapped columns for legacy flat `column_mapping` or v2 `{ universal, record_fields }`. */
export function columnMappingEntryCount(
  cm: Record<string, unknown> | Record<string, string> | null | undefined
): number {
  if (!cm || typeof cm !== "object") return 0;
  const o = cm as Record<string, unknown>;
  const u = o.universal;
  const r = o.record_fields;
  if (u && typeof u === "object") {
    return (
      Object.keys(u as object).length +
      (r && typeof r === "object" ? Object.keys(r as object).length : 0)
    );
  }
  return Object.keys(cm).length;
}

export type Project = {
  id: number;
  filename: string;
  /** FK to clients.id — parent legal client for rollups */
  client_id?: number | null;
  /** Client > BU > SBU: parent BU project (same client_id), null for top-level */
  parent_project_id?: number | null;
  /** business_unit | sub_business_unit (legacy rows: null = SBU) */
  org_unit_kind?: string | null;
  /** SBU / engagement label (e.g. TATA Motors) */
  engagement_name?: string | null;
  /** Optional BU / SBU / SBG / SBE directory tags */
  hierarchy_tag_bu?: string | null;
  hierarchy_tag_sbu?: string | null;
  hierarchy_tag_sbg?: string | null;
  hierarchy_tag_sbe?: string | null;
  /** Linked platform user as accountable project head */
  project_head_user_id?: number | null;
  /** Joined from Client.official_name in list/detail APIs */
  client_official_name?: string | null;
  account_name?: string;
  /** From linked Client row on GET /projects; `prospect` = pre-close, exclude from revenue account list. */
  client_lifecycle_state?: string | null;
  /** Client / charge identifier from directory (e.g. TRP0001T00NM1GIA) */
  charge_code?: string;
  account_status?: string;
  region?: string;
  /** Geographic / ops sub-region (e.g. West 1); distinct from category */
  sub_region?: string;
  function_head?: string;
  regional_head?: string;
  vertical?: string;
  category?: string;
  tracker_sheet?: string;
  contract_sheet?: string;
  created_at?: string;
  system_created_at?: string;
  source_filename?: string;
  practice_head?: string;
  /** RPO scorecard / directory — may align with practice_head */
  project_head?: string | null;
  be_spoc?: string;
  /** Account type (e.g. RPO) */
  practice?: string;
  /** After corporate finance master ingest: appears on Taggd_Source_Joiner sheet (CEO KPI cohort). */
  has_taggd_joiner_sheet?: boolean | null;
  pos_id_column?: string;
  /** Legacy: flat universal map. v2: `{ version, universal, record_fields }`. */
  column_mapping?: Record<string, unknown> | Record<string, string> | null;
  revenue_logic_code?: string | null;
  logic_explanation?: string | null;
};

/** `project_transitions` — client onboarding / transition tracker (GET /transitions, …). */
export type ProjectTransitionRow = {
  id: number;
  project_id: number;
  status: string | null;
  project_signed_date: string | null;
  kickoff_date: string | null;
  as_is_study_date: string | null;
  to_be_presentation_date: string | null;
  soft_launch_date: string | null;
  go_live_date: string | null;
  transition_done_by_user_id: number | null;
  attendees_internal: string | null;
  attendees_external: string | null;
  external_attendees_names: string | null;
  external_attendees_contact: string | null;
  external_attendees_email: string | null;
  rpo_solution_deck_url: string | null;
  transition_document_url: string | null;
  dead_days: number | null;
  ageing_days: number | null;
  dead_days_effective: number | null;
  ageing_days_effective: number | null;
  reason_for_delay: string | null;
  linked_meeting_ids_json: number[] | null;
  /** Uploaded files: [{ filename, original_name, uploaded_at }] — persisted on server disk + DB JSON. */
  resource_attachments_json?: { filename: string; original_name: string; uploaded_at?: string }[] | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  system_created_at: string | null;
  system_updated_at: string | null;
  account_name?: string | null;
  engagement_name?: string | null;
};

/** Parent account (legal client) with scoped projects from GET /clients. */
export type ClientGroup = {
  id: number;
  official_name: string;
  short_code: string | null;
  /** prospect = pre-close; active = operating client */
  lifecycle_state?: string | null;
  hierarchy_tag_bu?: string | null;
  hierarchy_tag_sbu?: string | null;
  hierarchy_tag_sbg?: string | null;
  hierarchy_tag_sbe?: string | null;
  projects: Project[];
};

/** `project_contracts` row — commercial signup / renewal snapshot (see GET /contracts/...). */
export type ProjectContractRow = {
  id: number;
  project_id: number;
  client_id: number | null;
  customer_name: string | null;
  account_type: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  renewal_reminder_date: string | null;
  duration_months: number | null;
  signed_acv_inr: number | null;
  contract_status: string | null;
  signed_cm_pct: number | null;
  headcount_contracted: number | null;
  hiring_volume: number | null;
  taggd_source_mix: string | null;
  other_source_mix: string | null;
  overall_rph: number | null;
  mmf_applicable: boolean | null;
  opening_fee_applicable: boolean | null;
  payment_terms: string | null;
  pricing_model: string | null;
  contract_detail: string | null;
  remarks: string | null;
  agreed_rate_fee_inr: number | null;
  est_annual_value_inr: number | null;
  sow_msa_reference: string | null;
  sla_terms_summary: string | null;
  positions_contracted: number | null;
  positions_filled: number | null;
  renewal_status: string | null;
  reason_for_lapse: string | null;
  client_signoff_authority: string | null;
  internal_signoff: string | null;
  revenue_run_rate_inr: number | null;
  practice_head_snapshot: string | null;
  /** Commercial closing pipeline stage */
  pipeline_stage?: string | null;
  system_created_at?: string | null;
  system_updated_at?: string | null;
  source_filename?: string | null;
  uploaded_by?: string | null;
};

/** Contract commercial closing pipeline — values match POST/PATCH /contracts. */
export const CONTRACT_PIPELINE_STAGES: { value: string; label: string }[] = [
  { value: "discovery", label: "Discovery" },
  { value: "meetings_in_process", label: "Meetings in process" },
  { value: "terms_settlement", label: "Terms settlement" },
  { value: "legal_review", label: "Legal review" },
  { value: "signed", label: "Signed" },
  { value: "active_client", label: "Active client" },
  { value: "lapsed", label: "Lapsed" },
  { value: "cancelled", label: "Cancelled" },
];

/** `platform_meetings` + nested `meeting_action_items` (MoM / governance). */
export type MeetingActionItemRow = {
  id: number;
  description: string | null;
  owner: string | null;
  due_date: string | null;
  status: string | null;
  sort_order: number;
};

export type MeetingRow = {
  id: number;
  meeting_title: string | null;
  meeting_type: string | null;
  meeting_date: string | null;
  start_time: string | null;
  end_time: string | null;
  organizer_user_id: number | null;
  organizer_name: string | null;
  attendees_internal: string | null;
  attendees_external: string | null;
  external_attendees_json: Record<string, unknown>[] | null;
  project_id: number | null;
  account_name_snapshot: string | null;
  agenda_items: string | null;
  discussion_summary: string | null;
  decisions_taken: string | null;
  key_discussion_points: string | null;
  follow_up_date: string | null;
  next_meeting_date: string | null;
  meeting_mode: string | null;
  meeting_status: string | null;
  attachments_json: unknown[] | null;
  mom_status: string | null;
  mom_link_remarks: string | null;
  teams_event_id?: string | null;
  teams_calendar_id?: string | null;
  teams_owner_user_id?: number | null;
  teams_sync_status?: string | null;
  teams_etag?: string | null;
  teams_last_synced_at?: string | null;
  teams_last_remote_updated_at?: string | null;
  teams_last_local_updated_at?: string | null;
  created_by_user_id: number | null;
  created_by_email: string | null;
  system_created_at: string | null;
  system_updated_at: string | null;
  action_items: MeetingActionItemRow[];
};

export type ComposioConnectionRow = {
  id: number;
  provider: string;
  status: string;
  connection_id: string | null;
  external_user_id: string | null;
  connection_meta_json: Record<string, unknown> | null;
  connected_at: string | null;
  disconnected_at: string | null;
  system_updated_at: string | null;
};

export type ComposioStatusResponse = {
  enabled: boolean;
  configured: boolean;
  env: string;
  base_url: string;
  auth_config_id?: string | null;
  connected: boolean;
  user_id: number;
  connection: ComposioConnectionRow | null;
};

export type ComposioConnectLinkResponse = {
  redirect_url: string;
  connection_id: string | null;
  connection_user_id: string;
  auth_config_id: string;
};

export type ComposioOutlookSyncResponse = {
  imported: number;
  updated: number;
  remote_count: number;
  meetings: MeetingRow[];
};

/** Org-level job board / resume supplier license costs (`resume_supplier_licenses`). */
export type ResumeSupplierLicenseRow = {
  id: number;
  vendor_name: string;
  login_ids_count: number | null;
  resume_inventory: string | null;
  job_postings: number | null;
  naukri_invites: number | null;
  utilization: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_duration_months: number | null;
  cost_inr: number | null;
  primary_person_name: string | null;
  primary_person_phone: string | null;
  primary_person_email: string | null;
  secondary_person_name: string | null;
  secondary_person_phone: string | null;
  secondary_person_email: string | null;
  remarks: string | null;
  fiscal_year_label: string | null;
  sort_order: number;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  system_created_at: string | null;
  system_updated_at: string | null;
};

export type TaskAssigneeDto = {
  user_id: number;
  email: string;
  assignee_role: string;
  assigned_at: string | null;
};

/** Central platform task (`platform_tasks` + `task_assignees`). */
export type TaskRow = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  task_category: string | null;
  task_subtype: string | null;
  linked_resource_type: string | null;
  linked_resource_id: string | null;
  project_id: number | null;
  due_at: string | null;
  completed_at: string | null;
  created_by_user_id: number | null;
  completed_by_user_id: number | null;
  updated_by_user_id: number | null;
  meta_json: Record<string, unknown> | null;
  system_created_at: string | null;
  system_updated_at: string | null;
  assignees: TaskAssigneeDto[];
};

export type AdminUserRow = {
  id: number;
  email: string;
  role: string;
  is_active: boolean;
  project_ids: number[];
  manager_user_id?: number | null;
  vertical_access?: string[] | null;
};

export const adminApi = {
  listUsers: () => api.get<AdminUserRow[]>("/admin/users").then((r) => r.data),
  createUser: (body: {
    email: string;
    password: string;
    role: string;
    vertical_access?: string[];
    manager_user_id?: number | null;
  }) => api.post("/admin/users", body).then((r) => r.data),
  patchUser: (
    id: number,
    body: {
      email?: string;
      is_active?: boolean;
      role?: string;
      password?: string;
      manager_user_id?: number | null;
      vertical_access?: string[] | null;
    },
  ) => api.patch(`/admin/users/${id}`, body).then((r) => r.data),
  setUserProjects: (userId: number, project_ids: number[]) =>
    api.put(`/admin/users/${userId}/projects`, { project_ids }).then((r) => r.data),
  deleteUser: (id: number) => api.delete(`/admin/users/${id}`).then((r) => r.data),
  listProjectsForAdmin: () => api.get<Project[]>("/projects").then((r) => r.data),
};

export const authProfileApi = {
  patchProfile: (body: { given_name?: string | null; family_name?: string | null; phone?: string | null }) =>
    api.patch<{
      status: string;
      given_name: string | null;
      family_name: string | null;
      phone: string | null;
      has_avatar: boolean;
    }>("/auth/me/profile", body),
  postAvatar: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<{ status: string; has_avatar: boolean }>("/auth/me/avatar", fd);
  },
  deleteAvatar: () => api.delete<{ status: string; has_avatar: boolean }>("/auth/me/avatar"),
};

/** Matches backend `RecordRpoPatch` — use on create/patch nested `rpo` and as optional fields on row responses. */
export type RecordRpoPatch = {
  client_req_id?: string;
  rpo_client_name?: string;
  positions_open?: number;
  rpo_priority?: string;
  rpo_job_type?: string;
  experience_years_required?: string;
  ctc_budget_lpa?: number;
  rpo_source_of_hire?: string;
  rpo_sub_source?: string;
  profiles_sourced?: number;
  profiles_submitted?: number;
  interviews_scheduled?: number;
  offers_released?: number;
  offers_accepted?: number;
  assigned_recruiter_rpo?: string;
  rpo_mandate_status?: string;
  rpo_vertical?: string;
  rpo_division?: string;
  rpo_bu_sbu?: string;
  rpo_zone?: string;
  rpo_grade_band?: string;
  rpo_business_hrbp?: string;
  rpo_sourcer?: string;
  rpo_taggd_pm?: string;
  rpo_hiring_agency?: string;
  rpo_ijp_referral?: string;
  mandate_received_date?: string;
  intake_date?: string;
  first_cv_share_date?: string;
  selection_date_req?: string;
  loi_date_req?: string;
  closure_date_req?: string;
  rpo_stage?: string;
  ageing_days?: number;
  ageing_bracket?: string;
  dead_days?: number;
  tto_days?: number;
  ttf_days?: number;
  taggd_fees_amount?: number;
  billing_month?: string;
  fy_label?: string;
  requisition_extras?: Record<string, unknown>;
  /** Taggd vs non-Taggd joiner source (requisition create). */
  source_joiner_type?: string | null;
};

export type RecordRow = {
  id: number;
  project_id: number;
  candidate_name: string;
  position_title: string;
  status: string;
  global_status?: string;
  req_status?: string;
  ageing?: number | null;
  hiring_manager?: string;
  department?: string;
  location?: string;
  offered_ctc?: number;
  creation_date?: string;
  joining_date?: string;
  revenue_results?: {
    revenue?: number;
    opening_fee?: number;
    closing_fee?: number;
    status?: string;
  };
  additional_attributes?: Record<string, unknown>;
} & Partial<RecordRpoPatch>;

/** PATCH /records/{id} — partial update; null clears optional fields where supported */
export type RecordPatch = {
  status?: string | null;
  global_status?: string | null;
  candidate_name?: string | null;
  position_title?: string | null;
  source_joiner_type?: string | null;
  hiring_manager?: string | null;
  department?: string | null;
  location?: string | null;
  offered_ctc?: number | null;
  creation_date?: string | null;
  joining_date?: string | null;
  additional_attributes?: Record<string, unknown>;
  rpo?: RecordRpoPatch;
};

/** POST /records — manual create */
export type RecordCreate = {
  project_id: number;
  candidate_name: string;
  position_title: string;
  source_joiner_type: string;
  position_code?: string | null;
  status?: string | null;
  global_status?: string | null;
  hiring_manager?: string | null;
  department?: string | null;
  location?: string | null;
  offered_ctc?: number | null;
  creation_date?: string | null;
  joining_date?: string | null;
  additional_attributes?: Record<string, unknown>;
  client_req_id?: string | null;
  rpo?: RecordRpoPatch;
};

/** Structured work history for `professional_experience_json` (flexible keys). */
export type ProfessionalExperienceEntry = {
  company?: string | null;
  title?: string | null;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean | null;
  description?: string | null;
  [key: string]: unknown;
};

/** Row shape from `GET /candidates` / `GET /candidates/{id}` (mirrors ORM + audit mixin). */
export type CandidateRow = {
  id: number;
  project_id: number;
  record_id: number;
  client_candidate_id: string;
  full_name?: string | null;
  contact_no?: string | null;
  email_id?: string | null;
  gender?: string | null;
  current_location?: string | null;
  qualification?: string | null;
  specialization?: string | null;
  total_experience_yrs?: number | null;
  current_organization?: string | null;
  current_designation?: string | null;
  notice_period_days?: number | null;
  alternate_contact_no?: string | null;
  source_of_hire?: string | null;
  sub_source?: string | null;
  current_ctc_lpa?: number | null;
  expected_ctc_lpa?: number | null;
  resume_screening?: string | null;
  assigned_recruiter?: string | null;
  hiring_manager?: string | null;
  current_stage?: string | null;
  offer_ctc_lpa?: number | null;
  offer_release_date?: string | null;
  offer_acceptance?: string | null;
  expected_doj?: string | null;
  actual_doj?: string | null;
  selection_date?: string | null;
  loi_issue_date?: string | null;
  cb_closure_date?: string | null;
  fingerprint?: string | null;
  excel_row_index?: number | null;
  revenue_results?: Record<string, unknown> | null;
  global_status?: string | null;
  candidate_extras?: Record<string, unknown> | null;
  offer_date?: string | null;
  offer_accepted_flag?: string | null;
  decline_reason?: string | null;
  joining_status?: string | null;
  checkin_30_day?: string | null;
  checkin_60_day?: string | null;
  checkin_90_day?: string | null;
  early_exit_risk?: string | null;
  offered_gross_ctc?: number | null;
  offered_stvs?: number | null;
  hike_pct_offered?: number | null;
  bgv_date?: string | null;
  bgv_status?: string | null;
  medical_initiation_date?: string | null;
  candidate_staff_no?: string | null;
  msil_staff_no?: string | null;
  sourcer_name?: string | null;
  taggd_pm?: string | null;
  offer_onboarding_extras?: Record<string, unknown> | null;
  system_created_at?: string | null;
  system_updated_at?: string | null;
  source_filename?: string | null;
  uploaded_by?: string | null;
  hiring_manager_user_id?: number | null;
  assigned_recruiter_user_id?: number | null;
  /** Enterprise master (`candidate_masters.id`) when linked. */
  master_id?: number | null;
  /** Original CV filename (stored file is server-side only). */
  cv_original_filename?: string | null;
  /** Whether a CV file exists and resolves on disk. */
  has_cv?: boolean | null;
  professional_experience_json?: ProfessionalExperienceEntry[] | null;
  professional_summary?: string | null;
  /** Number of entries in `professional_experience_json` (server-computed). */
  experience_role_count?: number | null;
  created_by_user_id?: number | null;
  created_by_email?: string | null;
};

/** `GET /candidate-masters` row (light). */
export type CandidateMasterRow = {
  id: number;
  display_name?: string | null;
  email_normalized?: string | null;
  phone_normalized?: string | null;
  global_fingerprint?: string | null;
  consent_json?: Record<string, unknown> | null;
  meta_json?: Record<string, unknown> | null;
  migration_batch_tag?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  placement_count: number;
};

/** `GET /candidate-masters/{id}` */
export type CandidateMasterDetail = CandidateMasterRow & {
  placements: Array<{
    id: number;
    project_id: number;
    record_id: number;
    client_candidate_id: string;
    full_name?: string | null;
    email_id?: string | null;
    current_stage?: string | null;
    global_status?: string | null;
    assigned_recruiter_user_id?: number | null;
    hiring_manager_user_id?: number | null;
  }>;
};

/** POST /candidates */
export type CandidateCreate = {
  project_id: number;
  record_id: number;
  client_candidate_id: string;
} & Partial<
  Omit<CandidateRow, "id" | "project_id" | "record_id" | "client_candidate_id">
>;

/** PATCH /candidates/{id} */
export type CandidatePatch = Partial<
  Pick<CandidateRow, "record_id"> &
    Omit<CandidateRow, "id" | "project_id" | "record_id" | "client_candidate_id">
>;

/** Download CV with Bearer auth (blob + local save). */
export async function downloadCandidateCvFile(candidateId: number, filename?: string | null): Promise<void> {
  const r = await api.get(`/candidates/${candidateId}/cv`, { responseType: "blob" });
  const blob = r.data instanceof Blob ? r.data : new Blob([r.data]);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (filename && filename.trim()) || `candidate-${candidateId}-cv.pdf`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/** POST /sla/insights/generate — Gemini flash; requires server GEMINI_API_KEY. */
export type SlaInsightLlm = {
  title: string;
  description: string;
  tone?: "info" | "success" | "warn";
};

export async function generateSlaInsights(payload: Record<string, unknown>): Promise<SlaInsightLlm[]> {
  const { data } = await api.post<{ insights: SlaInsightLlm[] }>("/sla/insights/generate", { payload });
  const list = Array.isArray(data?.insights) ? data.insights : [];
  return list.map((i) => ({
    title: String(i.title ?? "").trim(),
    description: String(i.description ?? "").trim(),
    tone: i.tone === "success" || i.tone === "warn" ? i.tone : "info",
  }));
}

export type RecordsPage = {
  records: RecordRow[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
};

export type BudgetForecastData = {
  summary: { total_budget: number; total_actual: number; variance: number };
  budgets: Array<{
    id: number;
    project_id: number | null;
    raw_name: string;
    system_name?: string;
    is_matched: boolean;
    q1: number;
    q2: number;
    q3: number;
    q4: number;
    total: number;
    actual: number;
    variance: number;
  }>;
  forecasts: Array<{
    raw_name: string;
    project_id?: number | null;
    is_matched: boolean;
    system_name?: string;
    months: Record<string, Record<string, number>>;
  }>;
};

// ─── IN-MEMORY SWR CACHE ──────────────────────────────────────────────────────
// Stale-while-revalidate: return cached data immediately, then refresh silently.
// Components get instant render + fresh data within the TTL window.

type CacheEntry<T> = { data: T; fetchedAt: number };
const _cache = new Map<string, CacheEntry<unknown>>();

const TTL_MS: Record<string, number> = {
  default:          15_000,   // 15s — shorter so mutations show up without waiting as long
  "stats/global":   15_000,
  "stats/monitor":  15_000,
  "stats/requisitions": 15_000,
  "projects":       30_000,
  "records/all":    10_000,
  candidates:       15_000,
  "revenue-billing": 15_000,
  "finance/stats":  20_000,
  "finance/data":   20_000,
  "sla/stats":      20_000,
  "sla/data":       20_000,
  "sla/account-metrics": 20_000,
  "client-dashboard": 20_000,
  "wfm/stats":      20_000,
  "wfm/data":       20_000,
};

function ttlFor(key: string) {
  for (const [pattern, ms] of Object.entries(TTL_MS)) {
    if (key.includes(pattern)) return ms;
  }
  return TTL_MS.default;
}

/**
 * Fetch with stale-while-revalidate cache.
 * - First call: fetches, stores, returns.
 * - Subsequent calls within TTL: returns cached value immediately.
 * - After TTL: returns stale data immediately AND fires background refresh.
 */
async function cachedGet<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = _cache.get(cacheKey) as CacheEntry<T> | undefined;
  const ttl = ttlFor(cacheKey);
  const now = Date.now();

  if (entry) {
    const age = now - entry.fetchedAt;
    if (age < ttl) {
      return entry.data;                     // Fresh — return immediately
    }
    // Stale — return immediately, refresh in background
    fetcher()
      .then((fresh) => _cache.set(cacheKey, { data: fresh, fetchedAt: Date.now() }))
      .catch(() => { /* silent background failure — stale data stays */ });
    return entry.data;
  }

  // No cache entry — fetch and store
  const data = await fetcher();
  _cache.set(cacheKey, { data, fetchedAt: now });
  return data;
}

/** Manually invalidate cache keys matching a prefix (call after mutations) */
export function invalidateCache(prefix: string) {
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

/** Clear all cached API responses (use on logout / login / user switch). */
export function clearApiCache() {
  _cache.clear();
}

// ─── QUERY FUNCTIONS ──────────────────────────────────────────────────────────

/** Layout block types available in the block catalog. */
export type BlockType =
  | "sla_kpi_strip"
  | "sla_summary_cards"
  | "sla_table"
  | "req_kpi"
  | "engagements_table"
  | "finance_strip";

/** A single block in the v2 layout array. */
export type LayoutBlock = {
  id: string;
  type: BlockType;
  /** "card" = full-width section card; "dense" = compact metric strip */
  variant: "card" | "dense";
  order: number;
  /** Optional custom label override shown in the block header. */
  label?: string | null;
};

/** Block catalog entry returned by GET /client-dashboard/blocks */
export type BlockCatalogEntry = {
  type: BlockType;
  label: string;
  desc: string;
  category: string;
};

/** Curated client portal dashboard config (v2 layout-driven). */
export type ClientDashboardConfig = {
  version?: number;
  /** v2: ordered array of blocks to render */
  layout?: LayoutBlock[];
  /** v1 legacy widget map — used as fallback on old configs */
  widgets?: {
    kpi_row?: boolean;
    sla_summary?: boolean;
    sla_metrics_table?: boolean;
    finance_summary?: boolean;
    projects_table?: boolean;
  };
  sla_show_internal_kpis?: boolean;
  finance_show_revenue?: boolean;
  finance_show_collections?: boolean;
  finance_show_unbilled?: boolean;
  finance_show_cm?: boolean;
  project_vertical_filter?: string[];
  project_region_filter?: string[];
  /** Default SLA reporting window (YYYY-MM) saved per client. */
  sla_reporting_month_from?: string | null;
  sla_reporting_month_to?: string | null;
};

export type ClientDashboardSummary = {
  clients: Array<{ id: number; official_name: string }>;
  selected_client_id: number | null;
  projects: Array<{
    id: number;
    client_id: number | null;
    account_name: string;
    engagement_name: string;
    region: string;
    practice_head: string;
    vertical: string;
    bu: string | null;
    sbu: string | null;
  }>;
  vertical_options: string[];
  region_options: string[];
  config: ClientDashboardConfig;
  /** BU/SBU horizontal tabs. Empty array → no tabs rendered. */
  bu_tabs: Array<{ key: string; label: string; project_ids: number[] }>;
  sla_metrics: Array<{
    id: number;
    project_id: number;
    account_name: string;
    region: string;
    practice_head: string | null;
    metric_nature: string | null;
    metric_label: string;
    metric_group: string | null;
    target: string | null;
    latest_score: string | number | null;
    status: string;
    status_bucket?: "met" | "not_met" | "not_reported";
    reporting_month: string;
  }>;
  finance: Record<string, number>;
  /** Distinct YYYY-MM values available in scoped SLA performances (newest first). */
  reporting_month_options?: string[];
  active_reporting_month_from?: string | null;
  active_reporting_month_to?: string | null;
  /** Requisition count per project_id (string key for JSON compat). */
  req_by_project: Record<string, number>;
  is_client_user: boolean;
  can_edit_config: boolean;
};

export const queries = {
  globalStats: () =>
    cachedGet<GlobalStats>("stats/global", () =>
      api.get<GlobalStats>("/stats/global").then((r) => r.data)
    ),

  globalMonitor: () =>
    cachedGet<GlobalMonitor>("stats/monitor", () =>
      api.get<GlobalMonitor>("/stats/global/monitor").then((r) => r.data)
    ),

  globalDrilldown: (field = "hiring_manager") =>
    cachedGet<Array<{ name: string; revenue: number; count: number }>>(
      `stats/drilldown/${field}`,
      () =>
        api
          .get<Array<{ name: string; revenue: number; count: number }>>(
            `/stats/drilldown?field=${field}`
          )
          .then((r) => r.data)
    ),

  requisitionKpis: () =>
    cachedGet<RequisitionKpis>("stats/requisitions/kpis", () =>
      api.get<RequisitionKpis>("/stats/requisitions/kpis").then((r) => r.data)
    ),

  projects: () =>
    cachedGet<Project[]>("projects", () =>
      api.get<Project[]>("/projects").then((r) => r.data)
    ),

  project: (id: string | number) =>
    cachedGet<Project>(`project/${id}`, () =>
      api.get<Project>(`/projects/${id}`).then((r) => r.data)
    ),

  transitionsList: () => api.get<ProjectTransitionRow[]>("/transitions").then((r) => r.data),
  transitionByProject: (projectId: number) =>
    api.get<ProjectTransitionRow>(`/transitions/by-project/${projectId}`).then((r) => r.data),
  createTransition: (project_id: number) =>
    api.post<ProjectTransitionRow>("/transitions", { project_id }).then((r) => r.data),
  patchTransition: (projectId: number, body: Record<string, unknown>) =>
    api.patch<ProjectTransitionRow>(`/transitions/by-project/${projectId}`, body).then((r) => r.data),

  uploadTransitionResource: (projectId: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api
      .post<{ attachment: { filename: string; original_name: string; uploaded_at: string }; transition: ProjectTransitionRow }>(
        `/transitions/by-project/${projectId}/upload-resource`,
        fd,
      )
      .then((r) => r.data);
  },

  downloadTransitionResource: (projectId: number, filename: string, originalName: string) =>
    api
      .get(`/transitions/by-project/${projectId}/resource-file/${encodeURIComponent(filename)}`, {
        responseType: "blob",
      })
      .then((r) => {
        const url = URL.createObjectURL(r.data);
        const a = document.createElement("a");
        a.href = url;
        a.download = originalName || filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }),

  /** PATCH directory metadata (charge code, heads, region, category, …). */
  patchProjectMetadata: (
    project_id: number,
    body: Partial<
      Pick<
        Project,
        | "charge_code"
        | "account_name"
        | "account_status"
        | "region"
        | "sub_region"
        | "function_head"
        | "regional_head"
        | "practice_head"
        | "project_head"
        | "be_spoc"
        | "category"
        | "vertical"
        | "practice"
        | "client_id"
        | "engagement_name"
        | "parent_project_id"
        | "org_unit_kind"
        | "hierarchy_tag_bu"
        | "hierarchy_tag_sbu"
        | "hierarchy_tag_sbg"
        | "hierarchy_tag_sbe"
        | "project_head_user_id"
      >
    >
  ) =>
    api.patch<Project>(`/projects/${project_id}`, body).then((r) => {
      invalidateCache("projects");
      invalidateCache("clients");
      invalidateCache("client/");
      if ("regional_head" in body) invalidateCache("wfm/");
      return r.data;
    }),

  contractsByProject: (projectId: number) =>
    api.get<ProjectContractRow[]>(`/contracts/by-project/${projectId}`).then((r) => r.data),

  contractsList: () =>
    api.get<ProjectContractRow[]>(`/contracts`).then((r) => r.data),

  uploadContractsWorkbook: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api
      .post<{ created: number; skipped: number; missing_customer_no_project?: string[]; file: string }>(
        `/contracts/upload`,
        fd,
      )
      .then((r) => {
        invalidateCache("contracts");
        return r.data;
      });
  },

  contract: (id: number) =>
    api.get<ProjectContractRow>(`/contracts/${id}`).then((r) => r.data),

  createContract: (body: Record<string, unknown>) =>
    api.post<ProjectContractRow>(`/contracts`, body).then((r) => {
      invalidateCache("contracts");
      return r.data;
    }),

  patchContract: (id: number, body: Record<string, unknown>) =>
    api.patch<ProjectContractRow>(`/contracts/${id}`, body).then((r) => {
      invalidateCache("contracts");
      return r.data;
    }),

  uploadContractMSA: (contractId: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api
      .post<{ status: string; filename: string; sow_msa_reference: string }>(
        `/contracts/${contractId}/upload-msa`,
        fd,
      )
      .then((r) => r.data);
  },

  contractMSAUrl: (contractId: number, storedBasename?: string) => {
    const q =
      storedBasename != null && storedBasename !== ""
        ? `?f=${encodeURIComponent(storedBasename)}`
        : "";
    return `/contracts/${contractId}/msa-document${q}`;
  },

  realiseContractClient: (id: number) =>
    api
      .post<{ status: string; client_id: number; lifecycle_state: string }>(`/contracts/${id}/realise-client`, {})
      .then((r) => {
        invalidateCache("contracts");
        invalidateCache("clients");
        invalidateCache("client/");
        return r.data;
      }),

  deleteContract: (id: number) =>
    api.delete<{ status: string; id: number }>(`/contracts/${id}`).then((r) => {
      invalidateCache("contracts");
      return r.data;
    }),

  composioStatus: () =>
    api.get<ComposioStatusResponse>(`/integrations/composio/status`).then((r) => r.data),

  composioConnectLink: () =>
    api.post<ComposioConnectLinkResponse>(`/integrations/composio/connect-link`, {}).then((r) => r.data),

  composioConnect: (body: {
    connection_id?: string | null;
    external_user_id?: string | null;
    connection_meta_json?: Record<string, unknown> | null;
  } = {}) =>
    api.post<ComposioStatusResponse>(`/integrations/composio/connect`, body).then((r) => r.data),

  composioDisconnect: () =>
    api.post<ComposioStatusResponse>(`/integrations/composio/disconnect`, {}).then((r) => r.data),

  composioSyncOutlookMeetings: (limit = 25) =>
    api
      .post<ComposioOutlookSyncResponse>(`/integrations/composio/outlook/sync`, { limit })
      .then((r) => r.data),

  meetingsList: () => api.get<MeetingRow[]>(`/meetings`).then((r) => r.data),

  meeting: (id: number) => api.get<MeetingRow>(`/meetings/${id}`).then((r) => r.data),

  createMeeting: (body: Record<string, unknown>) =>
    api.post<MeetingRow>(`/meetings`, body).then((r) => r.data),

  patchMeeting: (id: number, body: Record<string, unknown>) =>
    api.patch<MeetingRow>(`/meetings/${id}`, body).then((r) => r.data),

  linkMeetingCalendar: (
    id: number,
    body: {
      teams_event_id?: string | null;
      teams_calendar_id?: string | null;
      teams_sync_status?: string | null;
      teams_etag?: string | null;
      teams_last_remote_updated_at?: string | null;
      teams_last_local_updated_at?: string | null;
    } = {},
  ) => api.post<MeetingRow>(`/meetings/${id}/calendar-link`, body).then((r) => r.data),

  patchMeetingCalendarLink: (
    id: number,
    body: {
      teams_event_id?: string | null;
      teams_calendar_id?: string | null;
      teams_sync_status?: string | null;
      teams_etag?: string | null;
      teams_last_remote_updated_at?: string | null;
      teams_last_local_updated_at?: string | null;
    },
  ) => api.patch<MeetingRow>(`/meetings/${id}/calendar-link`, body).then((r) => r.data),

  unlinkMeetingCalendar: (id: number) =>
    api.delete<MeetingRow>(`/meetings/${id}/calendar-link`).then((r) => r.data),

  deleteMeeting: (id: number) =>
    api.delete<{ status: string; id: number }>(`/meetings/${id}`).then((r) => r.data),

  vendorLicensesList: () =>
    api.get<ResumeSupplierLicenseRow[]>(`/vendor-licenses`).then((r) => r.data),

  vendorLicense: (id: number) =>
    api.get<ResumeSupplierLicenseRow>(`/vendor-licenses/${id}`).then((r) => r.data),

  createVendorLicense: (body: Record<string, unknown>) =>
    api.post<ResumeSupplierLicenseRow>(`/vendor-licenses`, body).then((r) => r.data),

  patchVendorLicense: (id: number, body: Record<string, unknown>) =>
    api.patch<ResumeSupplierLicenseRow>(`/vendor-licenses/${id}`, body).then((r) => r.data),

  deleteVendorLicense: (id: number) =>
    api.delete<{ status: string; id: number }>(`/vendor-licenses/${id}`).then((r) => r.data),

  taskAssignableUsers: (params?: { project_id?: number }) => {
    const q =
      params?.project_id != null && params.project_id > 0
        ? `?project_id=${encodeURIComponent(String(params.project_id))}`
        : "";
    return api
      .get<
        {
          id: number;
          email: string;
          role: string;
          given_name?: string | null;
          family_name?: string | null;
        }[]
      >(`/tasks/meta/assignable-users${q}`)
      .then((r) => r.data);
  },

  tasksList: (params?: {
    status?: string;
    project_id?: number;
    mine?: boolean;
    overdue?: boolean;
    task_category?: string;
    linked_resource_type?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set("status", params.status);
    if (params?.project_id != null) sp.set("project_id", String(params.project_id));
    if (params?.mine) sp.set("mine", "true");
    if (params?.overdue) sp.set("overdue", "true");
    if (params?.task_category?.trim()) sp.set("task_category", params.task_category.trim());
    if (params?.linked_resource_type?.trim()) sp.set("linked_resource_type", params.linked_resource_type.trim());
    const q = sp.toString();
    return api.get<TaskRow[]>(`/tasks${q ? `?${q}` : ""}`).then((r) => r.data);
  },

  task: (id: number) => api.get<TaskRow>(`/tasks/${id}`).then((r) => r.data),

  createTask: (body: Record<string, unknown>) =>
    api.post<TaskRow>(`/tasks`, body).then((r) => r.data),

  patchTask: (id: number, body: Record<string, unknown>) =>
    api.patch<TaskRow>(`/tasks/${id}`, body).then((r) => r.data),

  deleteTask: (id: number) =>
    api.delete<{ status: string; id: number }>(`/tasks/${id}`).then((r) => r.data),

  /** Grouped legal clients + SBU projects (scoped). */
  clients: () =>
    cachedGet<ClientGroup[]>("clients", () =>
      api.get<ClientGroup[]>("/clients").then((r) => r.data)
    ),

  clientDetail: (clientId: number) =>
    cachedGet<ClientGroup>(`client/${clientId}`, () =>
      api.get<ClientGroup>(`/clients/${clientId}`).then((r) => r.data)
    ),

  createClient: (body: {
    official_name: string;
    short_code?: string | null;
    lifecycle_state?: "active" | "prospect";
    hierarchy_tag_bu?: string | null;
    hierarchy_tag_sbu?: string | null;
    hierarchy_tag_sbg?: string | null;
    hierarchy_tag_sbe?: string | null;
  }) =>
    api
      .post<{ id: number; official_name: string; short_code: string | null; lifecycle_state?: string }>(
        "/clients",
        body,
      )
      .then((r) => {
        invalidateCache("clients");
        return r.data;
      }),

  createClientProject: (
    clientId: number,
    body: {
      engagement_name: string;
      account_name?: string | null;
      org_unit_kind?: string | null;
      parent_project_id?: number | null;
      project_head_user_id?: number | null;
      practice_head?: string | null;
      project_head?: string | null;
      hierarchy_tag_bu?: string | null;
      hierarchy_tag_sbu?: string | null;
      hierarchy_tag_sbg?: string | null;
      hierarchy_tag_sbe?: string | null;
    },
  ) =>
    api.post<Project>(`/clients/${clientId}/projects`, body).then((r) => {
      invalidateCache("projects");
      invalidateCache("clients");
      invalidateCache(`client/${clientId}`);
      return r.data;
    }),

  patchClient: (
    clientId: number,
    body: {
      official_name?: string;
      short_code?: string | null;
      lifecycle_state?: "active" | "prospect";
      hierarchy_tag_bu?: string | null;
      hierarchy_tag_sbu?: string | null;
      hierarchy_tag_sbg?: string | null;
      hierarchy_tag_sbe?: string | null;
    },
  ) =>
    api
      .patch<{ id: number; official_name: string; short_code: string | null; lifecycle_state?: string }>(
        `/clients/${clientId}`,
        body,
      )
      .then((r) => {
        invalidateCache("clients");
        invalidateCache(`client/${clientId}`);
        invalidateCache("projects");
        return r.data;
      }),

  /**
   * NEW: single-request paginated records endpoint.
   * Replaces the N+1 allRecords() waterfall.
   */
  recordsAll: (params: {
    page?: number;
    per_page?: number;
    project_id?: number;
    status?: string;
    search?: string;
  } = {}) => {
    const { page = 1, per_page = 100, project_id, status, search } = params;
    const qs = new URLSearchParams({
      page: String(page),
      per_page: String(per_page),
      ...(project_id ? { project_id: String(project_id) } : {}),
      ...(status ? { status } : {}),
      ...(search ? { search } : {}),
    });
    const key = `records/all?${qs}`;
    return cachedGet<RecordsPage>(key, () =>
      api.get<RecordsPage>(`/records/all?${qs}`).then((r) => r.data)
    );
  },

  patchRecord: (id: number, body: RecordPatch) =>
    api.patch<RecordRow>(`/records/${id}`, body).then((r) => {
      invalidateCache("records/all");
      invalidateCache("stats/requisitions");
      invalidateCache("stats/monitor");
      invalidateCache("stats/global");
      return r.data;
    }),

  createRecord: (body: RecordCreate) =>
    api.post<RecordRow>("/records", body).then((r) => {
      invalidateCache("records/all");
      invalidateCache("stats/requisitions");
      invalidateCache("stats/monitor");
      invalidateCache("stats/global");
      return r.data;
    }),

  deleteRecord: (id: number) =>
    api.delete<{ status: string; id: number }>(`/records/${id}`).then((r) => {
      invalidateCache("records/all");
      invalidateCache("project-records/");
      invalidateCache("candidates");
      invalidateCache("stats/requisitions");
      invalidateCache("stats/monitor");
      invalidateCache("stats/global");
      return r.data;
    }),

  /** Paginated RPO candidates (`GET /candidates`). Scoped by role like records. */
  candidatesList: (params: {
    project_id?: number;
    record_id?: number;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.project_id != null) qs.set("project_id", String(params.project_id));
    if (params.record_id != null) qs.set("record_id", String(params.record_id));
    if (params.search != null && params.search.trim()) qs.set("search", params.search.trim());
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    const q = qs.toString();
    const key = `candidates?${q || "all"}`;
    return cachedGet<{ items: CandidateRow[]; total: number; limit: number; offset: number }>(key, () =>
      api
        .get<{ items: CandidateRow[]; total: number; limit: number; offset: number }>(
          `/candidates${q ? `?${q}` : ""}`
        )
        .then((r) => r.data)
    );
  },

  candidate: (id: number) => api.get<CandidateRow>(`/candidates/${id}`).then((r) => r.data),

  /** PDF/DOCX → heuristic field suggestions (does not persist; use create + candidateUploadCv). */
  parseResumePreview: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api
      .post<{ ok: boolean; fields: Record<string, unknown> }>("/candidates/parse-resume", fd)
      .then((r) => r.data);
  },

  createCandidate: (body: CandidateCreate) =>
    api.post<CandidateRow>("/candidates", body).then((r) => {
      invalidateCache("candidates");
      return r.data;
    }),

  patchCandidate: (id: number, body: CandidatePatch) =>
    api.patch<CandidateRow>(`/candidates/${id}`, body).then((r) => {
      invalidateCache("candidates");
      return r.data;
    }),

  deleteCandidate: (id: number) =>
    api.delete<{ status: string; id: number }>(`/candidates/${id}`).then((r) => {
      invalidateCache("candidates");
      return r.data;
    }),

  candidateUploadCv: (id: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<CandidateRow>(`/candidates/${id}/cv`, fd).then((r) => {
      invalidateCache("candidates");
      return r.data;
    });
  },

  candidateDeleteCv: (id: number) =>
    api.delete<CandidateRow>(`/candidates/${id}/cv`).then((r) => {
      invalidateCache("candidates");
      return r.data;
    }),

  candidateMastersList: (params: { q?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.q != null && params.q.trim()) qs.set("q", params.q.trim());
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return api
      .get<{ items: CandidateMasterRow[]; total: number; limit: number; offset: number }>(
        `/candidate-masters${q ? `?${q}` : ""}`
      )
      .then((r) => r.data);
  },

  candidateMaster: (id: number) =>
    api.get<CandidateMasterDetail>(`/candidate-masters/${id}`).then((r) => r.data),

  candidateMasterBackfill: (body: { dry_run?: boolean; limit?: number; migration_batch_tag?: string }) =>
    api.post<Record<string, unknown>>("/candidate-masters/backfill", body).then((r) => {
      invalidateCache("candidates");
      return r.data;
    }),

  /**
   * LEGACY: kept for compatibility with existing project-specific views.
   */
  projectRecords: (id: string | number) =>
    cachedGet<RecordRow[]>(`project-records/${id}`, () =>
      api.get<RecordRow[]>(`/projects/${id}/records`).then((r) => r.data)
    ),

  /**
   * DEPRECATED but kept: use recordsAll() for listing pages.
   * Now backed by cache so repeated calls are instant.
   */
  allRecords: async (): Promise<RecordRow[]> => {
    const page = await queries.recordsAll({ page: 1, per_page: 500 });
    return page.records;
  },

  budgetForecastData: () =>
    cachedGet<BudgetForecastData>("budget-forecast/data", () =>
      // Backend route is /api/budget-forecast/data.
      // Vite proxy strips leading /api, so we must call /api/api/... from the browser.
      api.get<BudgetForecastData>("/api/budget-forecast/data").then((r) => r.data)
    ),

  budgetForecastWaterfall: () =>
    cachedGet<{ opening: number; additions: number; closures: number; leakage: number; total: number }>(
      "budget-forecast/waterfall",
      () =>
        api
          .get<{ opening: number; additions: number; closures: number; leakage: number; total: number }>(
            // Backend route is /api/budget-forecast/waterfall.
            // Vite proxy strips leading /api, so we must call /api/api/... from the browser.
            "/api/budget-forecast/waterfall"
          )
          .then((r) => r.data)
    ),

  financeStats: () =>
    cachedGet("finance/stats", () => api.get("/finance/stats").then((r) => r.data)),

  /** Scoped by role: admin/executive see all; managers see own + shared-project peers. */
  ingestionEvents: (limit = 50) =>
    api.get<{ events: IngestionEventRow[] }>(`/ingestion/events?limit=${limit}`).then((r) => r.data),

  /** Unified timeline: requisitions, projects, SLA/WFM/finance, budget/forecast, ingestion, etc. */
  activityLog: (params: { limit?: number; offset?: number } = {}) => {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;
    return api
      .get<{ items: ActivityLogItem[]; total: number; limit: number; offset: number }>(
        `/activity/log?limit=${limit}&offset=${offset}`
      )
      .then((r) => r.data);
  },

  revenueForecastWeekly: (params: { project_id?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.project_id != null) qs.set("project_id", String(params.project_id));
    if (params.limit != null) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return cachedGet<{ items: RevenueForecastWeeklyRow[] }>(
      `revenue-trackers/forecast-weekly?${q || "all"}`,
      () =>
        api
          .get<{ items: RevenueForecastWeeklyRow[] }>(
            `/revenue-trackers/forecast-weekly${q ? `?${q}` : ""}`
          )
          .then((r) => r.data)
    );
  },

  revenueVisibilitySnapshots: (params: { project_id?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.project_id != null) qs.set("project_id", String(params.project_id));
    if (params.limit != null) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return cachedGet<{ items: RevenueVisibilitySnapshotRow[] }>(
      `revenue-trackers/visibility?${q || "all"}`,
      () =>
        api
          .get<{ items: RevenueVisibilitySnapshotRow[] }>(
            `/revenue-trackers/visibility${q ? `?${q}` : ""}`
          )
          .then((r) => r.data)
    );
  },

  upsertRevenueForecastWeekly: (body: RevenueForecastWeeklyUpsert) =>
    api.post<RevenueForecastWeeklyRow>("/revenue-trackers/forecast-weekly", body).then((r) => {
      invalidateCache("revenue-trackers/");
      invalidateCache("activity/log");
      return r.data;
    }),

  upsertRevenueVisibility: (body: RevenueVisibilityUpsert) =>
    api.post<RevenueVisibilitySnapshotRow>("/revenue-trackers/visibility", body).then((r) => {
      invalidateCache("revenue-trackers/");
      invalidateCache("activity/log");
      return r.data;
    }),

  deleteRevenueForecastWeekly: (id: number) =>
    api.delete<{ status: string; id: number }>(`/revenue-trackers/forecast-weekly/${id}`).then((r) => {
      invalidateCache("revenue-trackers/");
      invalidateCache("activity/log");
      return r.data;
    }),

  deleteRevenueVisibility: (id: number) =>
    api.delete<{ status: string; id: number }>(`/revenue-trackers/visibility/${id}`).then((r) => {
      invalidateCache("revenue-trackers/");
      invalidateCache("activity/log");
      return r.data;
    }),

  revenueWeeklyPack: (projectId: number, weekStartDate: string) =>
    api
      .get<RevenueWeeklyPackResponse>(
        `/revenue-weekly-submissions/pack?project_id=${projectId}&week_start_date=${encodeURIComponent(weekStartDate)}`
      )
      .then((r) => r.data),

  revenueWeeklyMinePacks: (params: { limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit != null) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return api
      .get<{ items: RevenueWeeklySubmissionDto[]; total: number; limit: number; offset: number }>(
        `/revenue-weekly-submissions/mine-packs${q ? `?${q}` : ""}`
      )
      .then((r) => r.data);
  },

  revenueWeeklySubmissionQueue: (params: {
    status?: string;
    client_id?: number;
    project_id?: number;
    limit?: number;
    offset?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.client_id != null) qs.set("client_id", String(params.client_id));
    if (params.project_id != null) qs.set("project_id", String(params.project_id));
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return api
      .get<{ items: RevenueWeeklySubmissionDto[]; total: number; limit: number; offset: number }>(
        `/revenue-weekly-submissions/queue${q ? `?${q}` : ""}`
      )
      .then((r) => r.data);
  },

  revenueWeeklySubmissionSubmit: (submissionId: number) =>
    api.post<RevenueWeeklySubmissionDto>(`/revenue-weekly-submissions/${submissionId}/submit`, {}).then((r) => {
      invalidateCache("revenue-trackers/");
      invalidateCache("activity/log");
      return r.data;
    }),

  revenueWeeklySubmissionStartReview: (submissionId: number) =>
    api.post<RevenueWeeklySubmissionDto>(`/revenue-weekly-submissions/${submissionId}/start-review`, {}).then((r) => {
      invalidateCache("activity/log");
      return r.data;
    }),

  revenueWeeklySubmissionApprove: (submissionId: number) =>
    api.post<RevenueWeeklySubmissionDto>(`/revenue-weekly-submissions/${submissionId}/approve`, {}).then((r) => {
      invalidateCache("revenue-trackers/");
      invalidateCache("activity/log");
      return r.data;
    }),

  revenueWeeklySubmissionRequestChanges: (submissionId: number, notes?: string) =>
    api
      .post<RevenueWeeklySubmissionDto>(`/revenue-weekly-submissions/${submissionId}/request-changes`, {
        notes: notes ?? null,
      })
      .then((r) => {
        invalidateCache("revenue-trackers/");
        invalidateCache("activity/log");
        return r.data;
      }),

  revenueWeeklySubmissionReject: (submissionId: number, notes?: string) =>
    api
      .post<RevenueWeeklySubmissionDto>(`/revenue-weekly-submissions/${submissionId}/reject`, { notes: notes ?? null })
      .then((r) => {
        invalidateCache("revenue-trackers/");
        invalidateCache("activity/log");
        return r.data;
      }),

  revenueWeeklyClientSummary: (clientId: number) =>
    api
      .get<{ client_id: number; pending_count: number; project_ids: number[] }>(
        `/revenue-weekly-submissions/by-client/${clientId}/summary`
      )
      .then((r) => r.data),

  revenueBillingList: (params: {
    project_id?: number;
    limit?: number;
    offset?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.project_id != null) qs.set("project_id", String(params.project_id));
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return cachedGet<{ items: RevenueBillingRow[]; total: number; limit: number; offset: number }>(
      `revenue-billing?${q || "all"}`,
      () =>
        api
          .get<{ items: RevenueBillingRow[]; total: number; limit: number; offset: number }>(
            `/revenue-billing${q ? `?${q}` : ""}`
          )
          .then((r) => r.data)
    );
  },

  revenueBilling: (id: number) => api.get<RevenueBillingRow>(`/revenue-billing/${id}`).then((r) => r.data),

  createRevenueBilling: (body: RevenueBillingCreate) =>
    api.post<RevenueBillingRow>("/revenue-billing", body).then((r) => {
      invalidateCache("revenue-billing");
      invalidateCache("activity/log");
      return r.data;
    }),

  patchRevenueBilling: (id: number, body: RevenueBillingPatch) =>
    api.patch<RevenueBillingRow>(`/revenue-billing/${id}`, body).then((r) => {
      invalidateCache("revenue-billing");
      invalidateCache("activity/log");
      return r.data;
    }),

  uploadRevenueBillingAttachment: (rowId: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<RevenueBillingRow>(`/revenue-billing/${rowId}/upload-billing-attachment`, fd).then((r) => {
      invalidateCache("revenue-billing");
      invalidateCache("activity/log");
      return r.data;
    });
  },

  revenueBillingAttachmentUrl: (rowId: number, storedBasename?: string) => {
    const q =
      storedBasename != null && storedBasename !== ""
        ? `?f=${encodeURIComponent(storedBasename)}`
        : "";
    return `/revenue-billing/${rowId}/billing-attachment${q}`;
  },

  deleteRevenueBilling: (id: number) =>
    api.delete<{ status: string; id: number }>(`/revenue-billing/${id}`).then((r) => {
      invalidateCache("revenue-billing");
      invalidateCache("activity/log");
      return r.data;
    }),

  financeBillingWorkflowQueue: (params: {
    status?: string;
    project_id?: number;
    mine?: boolean;
    overdue_only?: boolean;
    limit?: number;
    offset?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.project_id != null) qs.set("project_id", String(params.project_id));
    if (params.mine) qs.set("mine", "true");
    if (params.overdue_only) qs.set("overdue_only", "true");
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return api
      .get<{ items: RevenueBillingWithWorkflow[]; total: number; limit: number; offset: number }>(
        `/finance-billing-workflow/queue${q ? `?${q}` : ""}`
      )
      .then((r) => r.data);
  },

  financeBillingWorkflowDetail: (billingId: number) =>
    api.get<RevenueBillingWithWorkflow>(`/finance-billing-workflow/${billingId}`).then((r) => r.data),

  financeBillingWorkflowEvents: (billingId: number) =>
    api
      .get<{ items: FinanceBillingValidationEventRow[] }>(`/finance-billing-workflow/${billingId}/events`)
      .then((r) => r.data),

  financeBillingWorkflowPatch: (billingId: number, body: Record<string, unknown>) =>
    api.patch<RevenueBillingWithWorkflow>(`/finance-billing-workflow/${billingId}`, body).then((r) => {
      invalidateCache("revenue-billing");
      return r.data;
    }),

  financeBillingWorkflowSubmit: (billingId: number) =>
    api.post<RevenueBillingWithWorkflow>(`/finance-billing-workflow/${billingId}/submit`, {}).then((r) => {
      invalidateCache("revenue-billing");
      return r.data;
    }),

  financeBillingWorkflowStartReview: (billingId: number) =>
    api.post<RevenueBillingWithWorkflow>(`/finance-billing-workflow/${billingId}/start-review`, {}).then((r) => {
      invalidateCache("revenue-billing");
      return r.data;
    }),

  financeBillingWorkflowDispute: (billingId: number, discrepancy_notes: string) =>
    api
      .post<RevenueBillingWithWorkflow>(`/finance-billing-workflow/${billingId}/dispute`, {
        discrepancy_notes,
      })
      .then((r) => {
        invalidateCache("revenue-billing");
        return r.data;
      }),

  financeBillingWorkflowJuniorApprove: (billingId: number) =>
    api.post<RevenueBillingWithWorkflow>(`/finance-billing-workflow/${billingId}/junior-approve`, {}).then((r) => {
      invalidateCache("revenue-billing");
      return r.data;
    }),

  financeBillingWorkflowCfoApprove: (billingId: number, cfo_sign_off_acknowledged: boolean) =>
    api
      .post<RevenueBillingWithWorkflow>(`/finance-billing-workflow/${billingId}/cfo-approve`, {
        cfo_sign_off_acknowledged,
      })
      .then((r) => {
        invalidateCache("revenue-billing");
        return r.data;
      }),

  financeBillingWorkflowReject: (billingId: number, discrepancy_notes?: string) =>
    api
      .post<RevenueBillingWithWorkflow>(`/finance-billing-workflow/${billingId}/reject`, {
        discrepancy_notes: discrepancy_notes ?? null,
      })
      .then((r) => {
        invalidateCache("revenue-billing");
        return r.data;
      }),

  financeBillingWorkflowAddReceipt: (
    billingId: number,
    body: {
      amount_inr: number;
      received_date?: string | null;
      payment_mode?: string | null;
      utr_reference?: string | null;
      partial?: boolean;
      notes?: string | null;
    }
  ) =>
    api.post<FinancePaymentReceiptRow>(`/finance-billing-workflow/${billingId}/payment-receipts`, body).then((r) => {
      invalidateCache("revenue-billing");
      return r.data;
    }),

  financeBillingWorkflowAddTdsCertificate: (
    billingId: number,
    body: {
      fy_label?: string | null;
      counterparty_name?: string | null;
      certificate_type?: string | null;
      received_date?: string | null;
      file_ref?: string | null;
      notes?: string | null;
    }
  ) =>
    api.post<Record<string, unknown>>(`/finance-billing-workflow/${billingId}/tds-certificates`, body).then((r) => {
      invalidateCache("revenue-billing");
      return r.data;
    }),

  financeBillingWorkflowOverdueTick: (billingId: number) =>
    api.post<{ status: string; overdue_escalation_level?: number }>(
      `/finance-billing-workflow/${billingId}/run-overdue-escalation`,
      {}
    ).then((r) => {
      invalidateCache("revenue-billing");
      return r.data;
    }),

  financeData: () =>
    cachedGet("finance/data", () => api.get("/finance/data").then((r) => r.data)),

  slaStats: () =>
    cachedGet("sla/stats", () => api.get("/sla/stats").then((r) => r.data)),

  slaData: () =>
    cachedGet("sla/data", () => api.get("/sla/data").then((r) => r.data)),

  slaTimeseries: () =>
    cachedGet<Array<{
      account_name: string;
      timeline: Array<{
        month: string;
        met: number;
        not_met: number;
        not_reported: number;
        met_pct: number | null;
        total: number;
      }>;
    }>>("sla/timeseries", () => api.get("/sla/timeseries").then((r) => r.data)),

  slaAccountMetricsTimeseries: (account: string) =>
    cachedGet<{
      account_name: string;
      metrics: Array<{
        definition_id: number;
        metric_label: string;
        metric_nature: string | null;
        timeline: Array<{
          month: string;
          met: number;
          not_met: number;
          not_reported: number;
          met_pct: number | null;
          total: number;
        }>;
      }>;
    }>(
      `sla/account-metrics-timeseries/${encodeURIComponent(account)}`,
      () =>
        api
          .get(
            `/sla/account-metrics-timeseries?account=${encodeURIComponent(account)}`
          )
          .then((r) => r.data)
    ),

  clientDashboardSummary: (params?: {
    client_id?: number;
    reporting_month_from?: string;
    reporting_month_to?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.client_id != null) qs.set("client_id", String(params.client_id));
    if (params?.reporting_month_from?.trim()) qs.set("reporting_month_from", params.reporting_month_from.trim());
    if (params?.reporting_month_to?.trim()) qs.set("reporting_month_to", params.reporting_month_to.trim());
    const q = qs.toString();
    return cachedGet<ClientDashboardSummary>(`client-dashboard/summary${q ? `?${q}` : ""}`, () =>
      api.get(`/client-dashboard/summary${q ? `?${q}` : ""}`).then((r) => r.data)
    );
  },

  clientDashboardConfig: (clientId: number) =>
    cachedGet<{ client_id: number; config: ClientDashboardConfig }>(
      `client-dashboard/config/${clientId}`,
      () =>
        api
          .get("/client-dashboard/config", { params: { client_id: clientId } })
          .then((r) => r.data)
    ),

  clientDashboardBlocks: () =>
    cachedGet<{ blocks: BlockCatalogEntry[] }>(
      "client-dashboard/blocks",
      () => api.get("/client-dashboard/blocks").then((r) => r.data)
    ),

  wfmStats: () =>
    cachedGet("wfm/stats", () => api.get("/wfm/stats").then((r) => r.data)),

  wfmData: () =>
    cachedGet("wfm/data", () => api.get("/wfm/data").then((r) => r.data)),

  // ─── DATA OPERATIONS (Integrity / Risk) ────────────────────────────────────

  dataOpsSummary: () =>
    cachedGet(
      "data-ops/summary",
      () => api.get("/data-ops/summary").then((r) => r.data)
    ),

  dataOpsRevenueRiskProjects: (params: { page?: number; per_page?: number } = {}) => {
    const page = params.page ?? 1;
    const per_page = params.per_page ?? 20;
    const key = `data-ops/revenue-risk/projects?page=${page}&per_page=${per_page}`;
    return cachedGet(key, () =>
      api
        .get<{ projects: Array<{ project_id: number; account_name: string; bad_count: number }>; page: number; per_page: number; pages: number; total: number }>(
          `/data-ops/risk/revenue-closed-zero/projects?page=${page}&per_page=${per_page}`
        )
        .then((r) => r.data)
    );
  },

  dataOpsRevenueRiskRecords: (params: { page?: number; per_page?: number; project_id?: number | null } = {}) => {
    const page = params.page ?? 1;
    const per_page = params.per_page ?? 50;
    const pid = params.project_id ?? null;
    const key = `data-ops/revenue-risk/records?page=${page}&per_page=${per_page}&project_id=${pid ?? "all"}`;
    return cachedGet(key, () =>
      api
        .get<{
          records: Array<{
            id: number;
            project_id: number;
            account_name: string;
            candidate_name: string;
            position_title: string;
            hiring_manager: string;
            department: string;
            location: string;
            excel_provided_id: string | null;
            excel_row_index: number | null;
            opening_fee: number;
            revenue: number;
            closing_fee: number;
          }>;
          page: number;
          per_page: number;
          pages: number;
          total: number;
        }>(`/data-ops/risk/revenue-closed-zero/records?page=${page}&per_page=${per_page}${pid != null ? `&project_id=${pid}` : ""}`)
        .then((r) => r.data)
    );
  },

  dataOpsMissingJoiningProjects: (params: { page?: number; per_page?: number } = {}) => {
    const page = params.page ?? 1;
    const per_page = params.per_page ?? 20;
    const key = `data-ops/missing-joining/projects?page=${page}&per_page=${per_page}`;
    return cachedGet(key, () =>
      api
        .get<{ projects: Array<{ project_id: number; account_name: string; bad_count: number }>; page: number; per_page: number; pages: number; total: number }>(
          `/data-ops/risk/missing-joining-date/projects?page=${page}&per_page=${per_page}`
        )
        .then((r) => r.data)
    );
  },

  dataOpsMissingJoiningRecords: (params: { page?: number; per_page?: number } = {}) => {
    const page = params.page ?? 1;
    const per_page = params.per_page ?? 50;
    const key = `data-ops/missing-joining/records?page=${page}&per_page=${per_page}`;
    return cachedGet(key, () =>
      api
        .get<{
          records: Array<{
            id: number;
            project_id: number;
            account_name: string;
            candidate_name: string;
            position_title: string;
            hiring_manager: string;
            department: string;
            location: string;
            excel_provided_id: string | null;
            excel_row_index: number | null;
          }>;
          page: number;
          per_page: number;
          pages: number;
          total: number;
        }>(`/data-ops/risk/missing-joining-date/records?page=${page}&per_page=${per_page}`)
        .then((r) => r.data)
    );
  },

  // Remediation actions (backend re-computes logic for the project)
  recalculateProject: (project_id: number) =>
    api.post(`/projects/${project_id}/recalculate`).then((r) => r.data),

  regenerateProjectLogic: (
    project_id: number,
    body?: { dry_run?: boolean },
  ) =>
    api
      .post(`/projects/${project_id}/logic/regenerate`, body ?? {})
      .then((r) => r.data),

  updateProjectLogic: (
    project_id: number,
    payload: {
      revenue_logic_code: string;
      logic_explanation: string;
      source_filename?: string;
      contract_sheet?: string;
      tracker_sheet?: string;
      filename?: string;
    },
  ) => api.put(`/projects/${project_id}/logic`, payload).then((r) => r.data),

  regenerateProjectLogicFromUpload: (project_id: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api
      .post(`/projects/${project_id}/logic/regenerate-from-upload`, fd)
      .then((r) => r.data);
  },
};

export type SlaMetricRecord = {
  id: number;
  project_id: number;
  account_name: string;
  metric_label: string;
  metric_group: string | null;
  metric_nature: string | null;
  target_threshold: string | null;
  definition: string | null;
  calculation_method: string | null;
  formula: string | null;
  source_system: string | null;
};

export type SlaMetricPerformancePayload = {
  reporting_month?: string | null;
  period_start?: string | null;
  score?: string | null;
  rag_status?: string | null;
};

export const slaMetricsApi = {
  get: (definitionId: number) =>
    api.get<SlaMetricRecord>(`/sla/metrics/${definitionId}`).then((r) => r.data),
  create: (body: {
    project_id: number;
    metric_label: string;
    metric_group?: string | null;
    metric_nature?: string | null;
    target_threshold?: string | null;
    definition?: string | null;
    calculation_method?: string | null;
    formula?: string | null;
    source_system?: string | null;
    performance?: SlaMetricPerformancePayload | null;
  }) => api.post<SlaMetricRecord>("/sla/metrics", body).then((r) => r.data),
  update: (
    definitionId: number,
    body: {
      metric_label?: string;
      metric_group?: string | null;
      metric_nature?: string | null;
      target_threshold?: string | null;
      definition?: string | null;
      calculation_method?: string | null;
      formula?: string | null;
      source_system?: string | null;
      performance?: SlaMetricPerformancePayload | null;
    },
  ) => api.patch<SlaMetricRecord>(`/sla/metrics/${definitionId}`, body).then((r) => r.data),
};

/** Manual finance ledger row (matches POST /finance/ledger-upsert). Amounts in INR as stored in DB. */
export type FinanceLedgerUpsertPayload = {
  project_id: number;
  reporting_month: string;
  rev_budget: number;
  rev_forecast: number;
  rev_actual: number;
  cm_actual: number;
  unbilled: number;
  collection_target: number;
  collected: number;
  bad_debt: number;
  adjustments: number;
  /** WL1 HC (same semantics as Excel sheet Actual Headcount WL1). */
  actual_headcount_wl1: number;
  /** Overall HC — omit to leave unchanged on upsert. */
  actual_headcount_finance?: number | null;
  taggd_joiners?: number | null;
  target_revenue_per_recruiter?: number | null;
  /** Target PPC (INR per overall HC). Actual PPC is always cost ÷ overall HC in API. */
  target_ppc_inr?: number | null;
};

export const financeLedgerApi = {
  upsert: (body: FinanceLedgerUpsertPayload) =>
    api
      .post<{ status: string; project_id: number; reporting_month: string }>("/finance/ledger-upsert", body)
      .then((r) => r.data),
};

/** WFM HR benchmark snapshot (matches POST /wfm/benchmark-upsert). */
export type WfmBenchmarkUpsertPayload = {
  project_id: number;
  reporting_month: string;
  lateral_revenue_target: number;
  lateral_hc_target: number;
  lateral_productivity_target: number;
  ideal_hc: number;
  actual_hc_total: number;
  open_position: number;
  additional_hc: number;
  resignation: number;
  wl1_hires: number;
  wl2_hires: number;
  wl3_hires: number;
  wl4_hires: number;
};

export const wfmBenchmarkApi = {
  upsert: (body: WfmBenchmarkUpsertPayload) =>
    api
      .post<{ status: string; project_id: number; reporting_date: string }>("/wfm/benchmark-upsert", body)
      .then((r) => r.data),
};

// ─── Revenue Leakage ────────────────────────────────────────────────────────

export type RevenueLeakageRow = {
  id: number;
  project_id: number;
  req_number: string;
  candidate_name: string;
  position_title: string;
  hiring_manager: string;
  recruiter: string;
  department: string;
  location: string;
  region: string;
  creation_date: string | null;
  intake_date: string | null;
  approved_date: string | null;
  last_update_date: string | null;
  days_open: number | null;
  ageing_days: number | null;
  ageing_bucket: string;
  cancellation_reason: string;
  sla_48h: "Met" | "Not Met" | "No Data";
  source_of_hire: string;
  commercial_class: "Beneficial" | "Loss";
  direct_indirect: string;
  global_status: string;
  status: string;
};

export type RevenueLeakageSummary = {
  total_cancelled: number;
  avg_ageing_days: number | null;
  sla_48h_met: number;
  sla_48h_not_met: number;
  sla_48h_no_data: number;
  sla_48h_pct: number | null;
  month: string | null;
};

export type RevenueLeakageBucket = { bucket: string; count: number };
export type RevenueLeakageSohItem = { label: string; count: number; commercial_class: "Beneficial" | "Loss" };
export type RevenueLeakageCancelReason = { reason: string; count: number };

export type RevenueLeakageResponse = {
  summary: RevenueLeakageSummary;
  ageing_buckets: RevenueLeakageBucket[];
  source_of_hire: RevenueLeakageSohItem[];
  cancel_reasons: RevenueLeakageCancelReason[];
  rows: RevenueLeakageRow[];
};

export const revenueLeakageApi = {
  get: (params: { month?: string; project_id?: number; source_of_hire?: string }) =>
    api
      .get<RevenueLeakageResponse>("/revenue-leakage", { params })
      .then((r) => r.data),
};

/** CEO board deck JSON — Gemini applies a natural-language instruction (server needs GEMINI_API_KEY). */
export const ceoDeckAiApi = {
  edit: (body: {
    current_json: string;
    instruction: string;
    /** When set, backend asks the model for a JSON fragment only at these paths (smaller output). */
    focus_paths?: string[] | null;
  }) =>
    api
      .post<{ deck_json: string }>("/ceo-deck/ai-edit", body, {
        /** Whole-deck JSON + JSON-mode generation often exceeds the default 120s client cap. */
        timeout: 360_000,
      })
      .then((r) => r.data),
};
