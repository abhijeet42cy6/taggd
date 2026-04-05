import axios from "axios";

const AUTH_TOKEN_KEY = "tgddata_access_token";

export const api = axios.create({
  baseURL: "/api",
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
      window.location.assign("/login");
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
  account_name?: string;
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
  be_spoc?: string;
  /** Account type (e.g. RPO) */
  practice?: string;
  pos_id_column?: string;
  /** Legacy: flat universal map. v2: `{ version, universal, record_fields }`. */
  column_mapping?: Record<string, unknown> | Record<string, string> | null;
  revenue_logic_code?: string | null;
  logic_explanation?: string | null;
};

export type AdminUserRow = {
  id: number;
  email: string;
  role: string;
  is_active: boolean;
  project_ids: number[];
};

export const adminApi = {
  listUsers: () => api.get<AdminUserRow[]>("/admin/users").then((r) => r.data),
  createUser: (body: { email: string; password: string; role: string }) =>
    api.post("/admin/users", body).then((r) => r.data),
  patchUser: (id: number, body: { is_active?: boolean; role?: string; password?: string }) =>
    api.patch(`/admin/users/${id}`, body).then((r) => r.data),
  setUserProjects: (userId: number, project_ids: number[]) =>
    api.put(`/admin/users/${userId}/projects`, { project_ids }).then((r) => r.data),
  listProjectsForAdmin: () => api.get<Project[]>("/projects").then((r) => r.data),
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
  "finance/stats":  20_000,
  "finance/data":   20_000,
  "sla/stats":      20_000,
  "sla/data":       20_000,
  "sla/account-metrics": 20_000,
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
        | "be_spoc"
        | "category"
        | "vertical"
        | "practice"
      >
    >
  ) => api.patch<Project>(`/projects/${project_id}`, body).then((r) => r.data),

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
    limit?: number;
    offset?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.project_id != null) qs.set("project_id", String(params.project_id));
    if (params.record_id != null) qs.set("record_id", String(params.record_id));
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
