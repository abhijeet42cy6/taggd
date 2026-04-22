import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import axios from "axios";
import { queries, type Project, type TaskRow } from "@/lib/api";
import {
  CUSTOM_LINK_PRESET,
  PLATFORM_TASK_LINK_KINDS,
  defaultCategoryForLinkKind,
  platformTaskLinkHref,
  platformTaskLinkSummary,
} from "@/lib/task-platform-links";
import { isPlatformAdminRole, isReadOnlyClient, isRecruiterUser, useAuth } from "@/lib/auth";
import { PageHeader, PlatformKpi, PlatformSection, StatusTag } from "@/components/platform/PlatformBlocks";
import { Skeleton } from "@/components/platform/Skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import "@/styles/new-contract-panel.css";
import "@/styles/tasks-page.css";
import { Check, Search } from "lucide-react";

function getApiErrorMessage(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data as { detail?: unknown } | undefined;
    if (typeof d?.detail === "string" && d.detail) return d.detail;
    if (Array.isArray(d?.detail) && d.detail.length) {
      return d.detail
        .map((x: unknown) => {
          if (x && typeof x === "object" && "msg" in x) return String((x as { msg: string }).msg);
          return JSON.stringify(x);
        })
        .join("; ");
    }
    if (e.message) return e.message;
  }
  if (e instanceof Error && e.message) return e.message;
  return "Save failed";
}

const STATUSES = ["open", "in_progress", "blocked", "done", "cancelled"] as const;

const CATEGORIES = [
  { value: "", label: "— None —" },
  { value: "portfolio", label: "Portfolio intelligence" },
  { value: "client_project", label: "Client / project" },
  { value: "transitions", label: "Client onboarding" },
  { value: "contract", label: "Contracts" },
  { value: "meeting", label: "Meetings / MoM" },
  { value: "requisition", label: "Requisitions / records" },
  { value: "candidate", label: "Candidates" },
  { value: "ingestion", label: "Ingestion / uploads" },
  { value: "data_operations", label: "Data operations" },
  { value: "finance", label: "Finance command" },
  { value: "revenue_tracker", label: "Revenue trackers" },
  { value: "revenue_governance", label: "Revenue packs (governance)" },
  { value: "billing", label: "Billing" },
  { value: "finance_validation", label: "Finance validation" },
  { value: "sla", label: "SLA performance" },
  { value: "wfm", label: "Workforce management" },
  { value: "vendor_license", label: "Vendor licenses" },
  { value: "activity", label: "Activity log" },
  { value: "admin", label: "Users & access" },
  { value: "agent", label: "Assistant" },
  { value: "adhoc", label: "Ad hoc" },
];

/** Four named priority levels stored as `p0`–`p3` on the task record. */
const TASK_PRIORITY_LEVELS = [
  { value: "p0", label: "P0 · Critical" },
  { value: "p1", label: "P1 · High" },
  { value: "p2", label: "P2 · Normal" },
  { value: "p3", label: "P3 · Low" },
] as const;

function taskPrioritySelectValue(priority: string): string {
  const raw = priority.trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (["p0", "p1", "p2", "p3"].includes(lower)) return lower;
  return raw;
}

function localDatetimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoFromLocal(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

function isDemoTask(t: TaskRow): boolean {
  return t.id < 0;
}

function initialsFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() || "?";
  const parts = local.replace(/[^a-z0-9]/gi, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return local.slice(0, 2).toUpperCase();
}

function avatarHue(email: string): number {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h + email.charCodeAt(i) * 17) % 360;
  return h;
}

function formatRoleLabel(role: string): string {
  if (!role) return "—";
  return role.replace(/_/g, " ");
}

function taskSheetSection(icon: string, iconCls: string, title: string, subtitle: string, body: React.ReactNode) {
  return (
    <div className="ncp-section">
      <div className="ncp-section-header" style={{ cursor: "default" }}>
        <div className={cn("ncp-section-icon", iconCls)}>{icon}</div>
        <div className="ncp-section-title">
          <div className="ncp-section-name">{title}</div>
          <div className="ncp-section-sub">{subtitle}</div>
        </div>
      </div>
      <div className="ncp-section-body">{body}</div>
    </div>
  );
}

function TaskSheetProjectPicker({
  projects,
  projectId,
  onProjectChange,
}: {
  projects: Project[];
  projectId: string;
  onProjectChange: (pid: string) => void;
}) {
  const [projDdOpen, setProjDdOpen] = useState(false);
  const [projSearch, setProjSearch] = useState("");
  const [projDdRect, setProjDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const projWrapRef = useRef<HTMLDivElement>(null);
  const projBtnRef = useRef<HTMLButtonElement>(null);
  const projPortalRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!projDdOpen) {
      setProjDdRect(null);
      return;
    }
    const measure = () => {
      const btn = projBtnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setProjDdRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (projBtnRef.current) ro.observe(projBtnRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [projDdOpen]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (projWrapRef.current?.contains(t) || projPortalRef.current?.contains(t)) return;
      setProjDdOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const filteredProjects = useMemo(() => {
    const q = projSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const lab = `prj-${p.id} ${p.account_name || p.engagement_name || p.filename || ""}`.toLowerCase();
      return lab.includes(q);
    });
  }, [projects, projSearch]);

  const selectedProject = useMemo(() => {
    const pid = parseInt(projectId, 10);
    return Number.isFinite(pid) && pid > 0 ? projects.find((p) => p.id === pid) ?? null : null;
  }, [projectId, projects]);

  return (
    <div ref={projWrapRef} className="ncp-prop-row" style={{ alignItems: "center" }}>
      <div className="ncp-prop-label">Project</div>
      <div style={{ flex: 1, position: "relative" }}>
        <button
          ref={projBtnRef}
          type="button"
          className={cn("ncp-project-btn", selectedProject && "ncp-selected")}
          style={{ padding: "8px 12px", height: 36 }}
          onClick={(e) => {
            e.stopPropagation();
            setProjDdOpen((o) => !o);
          }}
        >
          {selectedProject ? (
            <>
              <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 11, color: "var(--ncp-accent)" }}>PRJ-{selectedProject.id}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ncp-text-primary)" }}>
                {selectedProject.account_name || selectedProject.engagement_name || selectedProject.filename || "—"}
              </span>
            </>
          ) : (
            <span style={{ color: "var(--ncp-text-muted)", fontSize: 13 }}>— None / optional —</span>
          )}
          <span style={{ marginLeft: "auto", color: "var(--ncp-text-muted)" }}>▾</span>
        </button>
        {projDdOpen && projDdRect
          ? createPortal(
              <div
                ref={projPortalRef}
                className="new-contract-sheet"
                style={{
                  position: "fixed",
                  top: projDdRect.top,
                  left: projDdRect.left,
                  width: projDdRect.width,
                  zIndex: 200,
                  pointerEvents: "auto",
                  minHeight: 0,
                  height: "auto",
                  display: "block",
                  background: "transparent",
                }}
              >
                <div className="ncp-project-dd ncp-open ncp-project-dd--portal" onClick={(e) => e.stopPropagation()}>
                  <div className="ncp-project-search">
                    <Search className="size-3.5 shrink-0 opacity-50" aria-hidden />
                    <input
                      type="search"
                      placeholder="Search projects…"
                      value={projSearch}
                      onChange={(e) => setProjSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="ncp-dd-scroll" onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="ncp-project-opt"
                      onClick={() => {
                        onProjectChange("");
                        setProjDdOpen(false);
                        setProjSearch("");
                      }}
                    >
                      <span style={{ fontSize: 11, color: "var(--ncp-text-muted)" }}>— None —</span>
                    </button>
                    {filteredProjects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={cn("ncp-project-opt", projectId === String(p.id) && "ncp-selected")}
                        onClick={() => {
                          onProjectChange(String(p.id));
                          setProjDdOpen(false);
                          setProjSearch("");
                        }}
                      >
                        <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 11, color: "var(--ncp-accent)", minWidth: 52 }}>
                          PRJ-{p.id}
                        </span>
                        <span>{p.account_name || p.engagement_name || p.filename || `Project ${p.id}`}</span>
                      </button>
                    ))}
                    {filteredProjects.length === 0 && (
                      <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ncp-text-muted)" }}>
                        {`No projects match "${projSearch}"`}
                      </div>
                    )}
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}

/** Shown when the API returns no rows so the board stays demonstrable. IDs are negative — never sent to PATCH/DELETE. */
const SAMPLE_TASKS: TaskRow[] = [
  {
    id: -101,
    title: "SLA drilldown ingest — Siemens quarterly close",
    description:
      "Second upload failed validation on duplicate `period_start`. Align with Data Ops on canonical FY25 Q4 window before client steering.",
    status: "open",
    priority: "p1",
    task_category: "sla",
    task_subtype: "ingestion_sla_upload_review",
    linked_resource_type: "ingestion_batch",
    linked_resource_id: "42881",
    project_id: null,
    due_at: "2026-03-20T14:00:00.000Z",
    completed_at: null,
    created_by_user_id: null,
    completed_by_user_id: null,
    updated_by_user_id: null,
    meta_json: null,
    system_created_at: "2026-03-18T09:00:00.000Z",
    system_updated_at: null,
    assignees: [
      { user_id: 91001, email: "ops.lead@taggd.internal", assignee_role: "assignee", assigned_at: "2026-03-18T09:05:00.000Z" },
    ],
  },
  {
    id: -102,
    title: "Birla Paint — contract renewal pack for legal",
    description: "Pull latest commercials from project master, attach redlines, and route to Contracts by EOD Thursday.",
    status: "open",
    priority: "p2",
    task_category: "contract",
    task_subtype: "renewal_summary",
    linked_resource_type: "project",
    linked_resource_id: "33",
    project_id: null,
    due_at: "2026-04-02T16:30:00.000Z",
    completed_at: null,
    created_by_user_id: null,
    completed_by_user_id: null,
    updated_by_user_id: null,
    meta_json: null,
    system_created_at: "2026-03-21T11:20:00.000Z",
    system_updated_at: null,
    assignees: [
      { user_id: 91002, email: "delivery.pm@taggd.internal", assignee_role: "assignee", assigned_at: "2026-03-21T11:22:00.000Z" },
      { user_id: 91003, email: "contracts@taggd.internal", assignee_role: "watcher", assigned_at: "2026-03-21T11:22:00.000Z" },
    ],
  },
  {
    id: -103,
    title: "M&M.xlsx — column mapping sign-off after regen",
    description: "Sheet identifier picked a secondary tab; confirm `Position / Status` mapping with ingestion preview before full run.",
    status: "open",
    priority: "p2",
    task_category: "ingestion",
    task_subtype: "column_mapper_review",
    linked_resource_type: "project",
    linked_resource_id: "27",
    project_id: null,
    due_at: "2026-03-29T12:00:00.000Z",
    completed_at: null,
    created_by_user_id: null,
    completed_by_user_id: null,
    updated_by_user_id: null,
    meta_json: null,
    system_created_at: "2026-03-26T08:40:00.000Z",
    system_updated_at: null,
    assignees: [{ user_id: 91004, email: "data.ops@taggd.internal", assignee_role: "assignee", assigned_at: "2026-03-26T08:41:00.000Z" }],
  },
  {
    id: -201,
    title: "Naukri seat utilization — Q1 true-up vs finance",
    description: "Reconcile active seats with ledger accrual; flag deltas >5% to FP&A before March close.",
    status: "in_progress",
    priority: "p1",
    task_category: "billing",
    task_subtype: "vendor_license_reconcile",
    linked_resource_type: null,
    linked_resource_id: null,
    project_id: null,
    due_at: "2026-03-31T18:00:00.000Z",
    completed_at: null,
    created_by_user_id: null,
    completed_by_user_id: null,
    updated_by_user_id: null,
    meta_json: null,
    system_created_at: "2026-03-10T07:00:00.000Z",
    system_updated_at: "2026-03-24T15:00:00.000Z",
    assignees: [
      { user_id: 91005, email: "finance.ops@taggd.internal", assignee_role: "assignee", assigned_at: "2026-03-10T07:02:00.000Z" },
    ],
  },
  {
    id: -202,
    title: "Requisition pipeline — shortlist feedback consolidation",
    description: "Hiring manager comments are split across email and sheet; centralize in platform record before client sync.",
    status: "in_progress",
    priority: "p2",
    task_category: "requisition",
    task_subtype: "record_hiring_update",
    linked_resource_type: "requisition",
    linked_resource_id: "8841",
    project_id: null,
    due_at: "2026-03-28T11:00:00.000Z",
    completed_at: null,
    created_by_user_id: null,
    completed_by_user_id: null,
    updated_by_user_id: null,
    meta_json: null,
    system_created_at: "2026-03-25T13:10:00.000Z",
    system_updated_at: null,
    assignees: [
      { user_id: 91006, email: "recruiting.lead@taggd.internal", assignee_role: "assignee", assigned_at: "2026-03-25T13:12:00.000Z" },
    ],
  },
  {
    id: -203,
    title: "WFM roster export — blocked on HRIS cost-centre field",
    description: "Downstream job fails when `cost_centre_code` is null. Need HRIS owner to backfill last 2 weeks before nightly export.",
    status: "in_progress",
    priority: "p0",
    task_category: "wfm",
    task_subtype: "export_blocked",
    linked_resource_type: null,
    linked_resource_id: null,
    project_id: null,
    due_at: "2026-03-27T09:00:00.000Z",
    completed_at: null,
    created_by_user_id: null,
    completed_by_user_id: null,
    updated_by_user_id: null,
    meta_json: null,
    system_created_at: "2026-03-23T16:00:00.000Z",
    system_updated_at: "2026-03-27T08:00:00.000Z",
    assignees: [
      { user_id: 91007, email: "wfm.admin@taggd.internal", assignee_role: "assignee", assigned_at: "2026-03-23T16:01:00.000Z" },
    ],
  },
  {
    id: -301,
    title: "FY25–26 finance cutover — ledger mapping sign-off",
    description: "Blocked on client CFO delegate. Cannot flip `fiscal_year_label` in prod until written OK received.",
    status: "blocked",
    priority: "p0",
    task_category: "finance",
    task_subtype: "ledger_cutover",
    linked_resource_type: "meeting",
    linked_resource_id: "1204",
    project_id: null,
    due_at: "2026-04-05T17:00:00.000Z",
    completed_at: null,
    created_by_user_id: null,
    completed_by_user_id: null,
    updated_by_user_id: null,
    meta_json: null,
    system_created_at: "2026-03-12T10:00:00.000Z",
    system_updated_at: "2026-03-26T14:30:00.000Z",
    assignees: [
      { user_id: 91005, email: "finance.ops@taggd.internal", assignee_role: "assignee", assigned_at: "2026-03-12T10:01:00.000Z" },
    ],
  },
  {
    id: -302,
    title: "HPE tracker — duplicate row merge policy",
    description: "Two uploads created divergent keys for same req id. Need dedupe rule approved before automated merge.",
    status: "blocked",
    priority: "p1",
    task_category: "ingestion",
    task_subtype: "dedupe_policy",
    linked_resource_type: "project",
    linked_resource_id: "19",
    project_id: null,
    due_at: "2026-03-30T15:00:00.000Z",
    completed_at: null,
    created_by_user_id: null,
    completed_by_user_id: null,
    updated_by_user_id: null,
    meta_json: null,
    system_created_at: "2026-03-24T09:00:00.000Z",
    system_updated_at: null,
    assignees: [{ user_id: 91004, email: "data.ops@taggd.internal", assignee_role: "assignee", assigned_at: "2026-03-24T09:02:00.000Z" }],
  },
  {
    id: -401,
    title: "Steering committee — MoM & action items (18 Mar)",
    description: "Circulated to client; SLA dashboard tweaks and ingestion freeze window captured.",
    status: "done",
    priority: "p2",
    task_category: "meeting",
    task_subtype: "mom_publish",
    linked_resource_type: "meeting",
    linked_resource_id: "1188",
    project_id: null,
    due_at: "2026-03-19T12:00:00.000Z",
    completed_at: "2026-03-19T16:45:00.000Z",
    created_by_user_id: null,
    completed_by_user_id: null,
    updated_by_user_id: null,
    meta_json: null,
    system_created_at: "2026-03-17T08:00:00.000Z",
    system_updated_at: "2026-03-19T16:45:00.000Z",
    assignees: [{ user_id: 91002, email: "delivery.pm@taggd.internal", assignee_role: "assignee", assigned_at: "2026-03-17T08:01:00.000Z" }],
  },
  {
    id: -402,
    title: "Excel add-in vendor license — Q1 true-up paid",
    description: "PO closed; attach receipt to vendor_license record for audit trail.",
    status: "done",
    priority: "p3",
    task_category: "vendor_license",
    task_subtype: "true_up",
    linked_resource_type: "vendor_license",
    linked_resource_id: "55",
    project_id: null,
    due_at: "2026-03-15T23:59:00.000Z",
    completed_at: "2026-03-16T10:00:00.000Z",
    created_by_user_id: null,
    completed_by_user_id: null,
    updated_by_user_id: null,
    meta_json: null,
    system_created_at: "2026-03-01T09:00:00.000Z",
    system_updated_at: "2026-03-16T10:00:00.000Z",
    assignees: [{ user_id: 91005, email: "finance.ops@taggd.internal", assignee_role: "assignee", assigned_at: "2026-03-01T09:01:00.000Z" }],
  },
  {
    id: -501,
    title: "Retry ingest — superseded by regen run 1774481204",
    description: "Cancelled after automated regen replaced file; keep ticket for traceability only.",
    status: "cancelled",
    priority: "p3",
    task_category: "ingestion",
    task_subtype: "retry_superseded",
    linked_resource_type: "ingestion_batch",
    linked_resource_id: "42790",
    project_id: null,
    due_at: null,
    completed_at: null,
    created_by_user_id: null,
    completed_by_user_id: null,
    updated_by_user_id: null,
    meta_json: null,
    system_created_at: "2026-03-22T18:00:00.000Z",
    system_updated_at: "2026-03-22T19:30:00.000Z",
    assignees: [{ user_id: 91004, email: "data.ops@taggd.internal", assignee_role: "assignee", assigned_at: "2026-03-22T18:01:00.000Z" }],
  },
];

function applyClientTaskFilters(
  tasks: TaskRow[],
  opts: {
    filterStatus: string;
    filterMine: boolean;
    filterOverdue: boolean;
    filterProjectId: string;
    filterCategory: string;
    filterLinkKind: string;
    uid: number | null;
  },
): TaskRow[] {
  let out = tasks;
  if (opts.filterStatus) out = out.filter((t) => t.status === opts.filterStatus);
  if (opts.filterMine && opts.uid != null) {
    out = out.filter((t) => (t.assignees ?? []).some((a) => a.user_id === opts.uid));
  }
  if (opts.filterOverdue) {
    const now = Date.now();
    out = out.filter(
      (t) =>
        t.due_at &&
        new Date(t.due_at).getTime() < now &&
        !["done", "cancelled"].includes(t.status),
    );
  }
  if (opts.filterProjectId) {
    const pid = parseInt(opts.filterProjectId, 10);
    if (!Number.isNaN(pid)) out = out.filter((t) => t.project_id === pid);
  }
  if (opts.filterCategory) {
    const c = opts.filterCategory.toLowerCase();
    out = out.filter((t) => (t.task_category ?? "").toLowerCase() === c);
  }
  if (opts.filterLinkKind) {
    const k = opts.filterLinkKind.toLowerCase();
    out = out.filter((t) => (t.linked_resource_type ?? "").toLowerCase() === k);
  }
  return out;
}

const COLUMN_STATUS_META: { status: (typeof STATUSES)[number]; label: string; hint: string }[] = [
  { status: "open", label: "Open", hint: "Not started" },
  { status: "in_progress", label: "In progress", hint: "Active" },
  { status: "blocked", label: "Blocked", hint: "Waiting" },
  { status: "done", label: "Done", hint: "Completed" },
  { status: "cancelled", label: "Cancelled", hint: "Won't do" },
];

export function Tasks() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const role = (user?.role ?? "").toLowerCase();
  const readOnlyPortal = isReadOnlyClient(user);
  const recruiterView = isRecruiterUser(user);

  const [rows, setRows] = useState<TaskRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignable, setAssignable] = useState<{ id: number; email: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  /** Local edits to sample tasks (negative ids) when API list is empty — drag status, etc. */
  const [sampleOverrides, setSampleOverrides] = useState<Record<number, Partial<TaskRow>>>({});

  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterMine, setFilterMine] = useState(false);
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterProjectId, setFilterProjectId] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterLinkKind, setFilterLinkKind] = useState<string>("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<string>("open");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [subtype, setSubtype] = useState("");
  const [linkedType, setLinkedType] = useState("");
  const [linkedId, setLinkedId] = useState("");
  const [linkPreset, setLinkPreset] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [dueLocal, setDueLocal] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<Set<number>>(new Set());
  const [assigneeSearch, setAssigneeSearch] = useState("");
  /** People picker starts collapsed (same NCP pattern as contract sections). */
  const [peopleSectionOpen, setPeopleSectionOpen] = useState(false);

  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [pendingMove, setPendingMove] = useState<{ task: TaskRow; nextStatus: string } | null>(null);
  const [moveSaving, setMoveSaving] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [t, p, a] = await Promise.all([
        queries.tasksList({
          status: filterStatus || undefined,
          mine: filterMine || undefined,
          overdue: filterOverdue || undefined,
          project_id: filterProjectId ? parseInt(filterProjectId, 10) : undefined,
          task_category: filterCategory || undefined,
          linked_resource_type: filterLinkKind || undefined,
        }),
        queries.projects(),
        queries.taskAssignableUsers(),
      ]);
      setRows(t);
      setProjects(p);
      setAssignable(a);
    } catch {
      setRows([]);
      setProjects([]);
      setAssignable([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterMine, filterOverdue, filterProjectId, filterCategory, filterLinkKind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const usingSampleBoard = !loading && rows.length === 0;

  const sampleWithOverrides = useMemo(
    () => SAMPLE_TASKS.map((t) => ({ ...t, ...sampleOverrides[t.id] })),
    [sampleOverrides],
  );

  const displayRows = useMemo(() => {
    const source = rows.length > 0 ? rows : sampleWithOverrides;
    if (rows.length > 0) return source;
    return applyClientTaskFilters(source, {
      filterStatus,
      filterMine,
      filterOverdue,
      filterProjectId,
      filterCategory,
      filterLinkKind,
      uid,
    });
  }, [
    rows,
    sampleWithOverrides,
    filterStatus,
    filterMine,
    filterOverdue,
    filterProjectId,
    filterCategory,
    filterLinkKind,
    uid,
  ]);

  const tasksByStatus = useMemo(() => {
    const m = new Map<string, TaskRow[]>();
    for (const s of STATUSES) m.set(s, []);
    for (const t of displayRows) {
      const list = m.get(t.status);
      if (list) list.push(t);
      else {
        const open = m.get("open");
        if (open) open.push(t);
      }
    }
    return m;
  }, [displayRows]);

  const openCount = useMemo(
    () => displayRows.filter((r) => !["done", "cancelled"].includes(r.status)).length,
    [displayRows],
  );
  const overdueCount = useMemo(() => {
    const now = Date.now();
    return displayRows.filter(
      (r) =>
        r.due_at &&
        new Date(r.due_at).getTime() < now &&
        !["done", "cancelled"].includes(r.status),
    ).length;
  }, [displayRows]);

  function resetForm() {
    setSaveError(null);
    setEditing(null);
    setTitle("");
    setDescription("");
    setStatus("open");
    setPriority("");
    setCategory("");
    setSubtype("");
    setLinkedType("");
    setLinkedId("");
    setLinkPreset("");
    setProjectId("");
    setDueLocal("");
    setAssigneeIds(new Set());
    setAssigneeSearch("");
    setPeopleSectionOpen(false);
  }

  function openCreate() {
    resetForm();
    if (uid != null) setAssigneeIds(new Set([uid]));
    setDialogOpen(true);
  }

  function openEdit(t: TaskRow) {
    setSaveError(null);
    setAssigneeSearch("");
    setPeopleSectionOpen(false);
    setEditing(t);
    setTitle(t.title);
    setDescription(t.description ?? "");
    setStatus(t.status);
    setPriority(t.priority ?? "");
    setCategory(t.task_category ?? "");
    setSubtype(t.task_subtype ?? "");
    const lt = (t.linked_resource_type ?? "").trim().toLowerCase();
    const known = PLATFORM_TASK_LINK_KINDS.some((k) => k.value === lt);
    setLinkPreset(known ? lt : lt ? CUSTOM_LINK_PRESET : "");
    setLinkedType(t.linked_resource_type ?? "");
    setLinkedId(t.linked_resource_id ?? "");
    setProjectId(t.project_id != null ? String(t.project_id) : "");
    setDueLocal(localDatetimeInput(t.due_at));
    setAssigneeIds(new Set(t.assignees?.map((a) => a.user_id) ?? []));
    setDialogOpen(true);
  }

  function toggleAssignee(id: number) {
    setAssigneeIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const filteredAssignable = useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    if (!q) return assignable;
    return assignable.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        formatRoleLabel(u.role).toLowerCase().includes(q),
    );
  }, [assignable, assigneeSearch]);

  async function save() {
    if (!title.trim()) {
      setSaveError("Title is required.");
      return;
    }
    const dueIso = toIsoFromLocal(dueLocal);
    const pid = projectId.trim() ? parseInt(projectId, 10) : null;
    const body: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || null,
      status,
      priority: priority.trim() || null,
      task_category: category.trim() || null,
      task_subtype: subtype.trim() || null,
      linked_resource_type: linkedType.trim() || null,
      linked_resource_id: linkedId.trim() || null,
      project_id: pid != null && !Number.isNaN(pid) ? pid : null,
      due_at: dueIso,
      assignee_user_ids: Array.from(assigneeIds),
    };
    setSaving(true);
    setSaveError(null);
    try {
      if (editing && !isDemoTask(editing)) {
        const u = await queries.patchTask(editing.id, body);
        setRows((prev) => prev.map((x) => (x.id === u.id ? u : x)));
      } else {
        const c = await queries.createTask(body);
        setRows((prev) => [c, ...prev]);
      }
      setDialogOpen(false);
      resetForm();
    } catch (e: unknown) {
      const msg = getApiErrorMessage(e);
      setSaveError(msg);
      console.error("Task save failed", e);
    } finally {
      setSaving(false);
    }
  }

  async function removeTask(t: TaskRow) {
    if (!window.confirm(`Delete task #${t.id}?`)) return;
    try {
      await queries.deleteTask(t.id);
      setRows((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Delete failed";
      alert(msg);
    }
  }

  function labelForStatus(st: string) {
    return COLUMN_STATUS_META.find((c) => c.status === st)?.label ?? st;
  }

  function handleTaskDragStart(e: React.DragEvent, t: TaskRow) {
    if (readOnlyPortal) return;
    e.dataTransfer.setData("text/task-id", String(t.id));
    e.dataTransfer.setData("text/from-status", t.status);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleColumnDragOver(e: React.DragEvent, columnStatus: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnStatus);
  }

  function handleColumnDrop(e: React.DragEvent, columnStatus: string) {
    e.preventDefault();
    if (readOnlyPortal) return;
    setDragOverColumn(null);
    const idStr = e.dataTransfer.getData("text/task-id");
    const from = e.dataTransfer.getData("text/from-status");
    if (!idStr) return;
    const id = parseInt(idStr, 10);
    if (Number.isNaN(id)) return;
    if (from === columnStatus) return;
    const task = displayRows.find((r) => r.id === id);
    if (!task) return;
    setPendingMove({ task, nextStatus: columnStatus });
    setMoveDialogOpen(true);
  }

  async function confirmStatusMove() {
    if (readOnlyPortal) return;
    if (!pendingMove) return;
    const { task, nextStatus } = pendingMove;
    if (task.status === nextStatus) {
      setMoveDialogOpen(false);
      setPendingMove(null);
      return;
    }
    setMoveSaving(true);
    try {
      if (isDemoTask(task)) {
        const nowIso = new Date().toISOString();
        setSampleOverrides((prev) => ({
          ...prev,
          [task.id]: {
            ...prev[task.id],
            status: nextStatus,
            completed_at: nextStatus === "done" ? nowIso : null,
          },
        }));
      } else {
        await queries.patchTask(task.id, { status: nextStatus });
        await refresh();
      }
      setMoveDialogOpen(false);
      setPendingMove(null);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as Error).message) : "Update failed";
      alert(msg);
    } finally {
      setMoveSaving(false);
    }
  }

  function cancelStatusMove() {
    if (!moveSaving) {
      setMoveDialogOpen(false);
      setPendingMove(null);
    }
  }

  const canDelete = (t: TaskRow) =>
    !readOnlyPortal &&
    !isDemoTask(t) &&
    (isPlatformAdminRole(role) || role === "executive" || (uid != null && t.created_by_user_id === uid));

  /* ── helpers for new design-guide card rendering ── */
  function priorityCls(p: string): string {
    const lower = (p ?? "").toLowerCase().trim();
    if (lower === "p0") return "tsk-priority--p0";
    if (lower === "p1") return "tsk-priority--p1";
    if (lower === "p2") return "tsk-priority--p2";
    if (lower === "p3") return "tsk-priority--p3";
    return lower ? "tsk-priority--other" : "";
  }

  function priorityLabel(p: string): string {
    const lower = (p ?? "").toLowerCase().trim();
    if (lower === "p0") return "P0 · Critical";
    if (lower === "p1") return "P1 · High";
    if (lower === "p2") return "P2 · Normal";
    if (lower === "p3") return "P3 · Low";
    return p || "";
  }

  return (
    <div className="tsk-page">
      {/* ── PAGE HEADER ─────────────────────────────── */}
      <div className="tsk-header">
        <div className="tsk-header-left">
          <h1 className="tsk-page-title">Tasks</h1>
          <p className="tsk-page-sub">
            {recruiterView
              ? "Your queue — tasks you created, are assigned to, or that touch your projects."
              : "Cross-cutting work: deadlines, assignees, and links to ingestion, contracts, meetings, billing and more."}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
        {!readOnlyPortal ? (
            <button type="button" className="tsk-btn-primary" onClick={() => openCreate()}>
            + New task
          </button>
        ) : null}
      {readOnlyPortal ? (
            <span className="tsk-readonly-notice">⚠ View only — cannot create or edit tasks</span>
      ) : null}
        </div>
      </div>

      {/* ── KPI STRIP ─────────────────────────────────── */}
      {loading ? (
        <div className="tsk-skeleton-strip">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={68} />
          ))}
        </div>
      ) : (
        <div className="tsk-kpi-strip">
          <div className="tsk-kpi tsk-kpi--blue">
            <span className="tsk-kpi-label">Visible tasks</span>
            <span className="tsk-kpi-value">{displayRows.length}</span>
            <span className="tsk-kpi-sub">Current filters</span>
          </div>
          <div className="tsk-kpi tsk-kpi--teal">
            <span className="tsk-kpi-label">Open / active</span>
            <span className="tsk-kpi-value">{openCount}</span>
            <span className="tsk-kpi-sub">Not done or cancelled</span>
          </div>
          <div className={cn("tsk-kpi", overdueCount > 0 ? "tsk-kpi--red" : "tsk-kpi--amber")}>
            <span className="tsk-kpi-label">Overdue (in list)</span>
            <span className="tsk-kpi-value">{overdueCount}</span>
            <span className="tsk-kpi-sub">Due in past &amp; open</span>
          </div>
        </div>
      )}

      {/* ── BOARD SHELL ───────────────────────────────── */}
      <div className="tsk-board-shell">
        {/* toolbar */}
        <div className="tsk-board-toolbar">
          <span className="tsk-board-toolbar-title">Task board</span>
        </div>

        {/* filters */}
        <div className="tsk-filters">
          <select
            className={cn("tsk-filter-select", filterStatus && "tsk-filter-active")}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            className={cn("tsk-filter-select", filterProjectId && "tsk-filter-active")}
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                PRJ-{p.id} · {(p.engagement_name || p.account_name || "").slice(0, 32)}
              </option>
            ))}
          </select>

          <select
            className={cn("tsk-filter-select", filterCategory && "tsk-filter-active")}
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {CATEGORIES.filter((c) => c.value).map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          <select
            className={cn("tsk-filter-select", filterLinkKind && "tsk-filter-active")}
            value={filterLinkKind}
            onChange={(e) => setFilterLinkKind(e.target.value)}
          >
            <option value="">All link types</option>
            {PLATFORM_TASK_LINK_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>

          <label className="tsk-filter-toggle">
            <input type="checkbox" checked={filterMine} onChange={(e) => setFilterMine(e.target.checked)} />
            Mine only
          </label>
          <label className="tsk-filter-toggle">
            <input type="checkbox" checked={filterOverdue} onChange={(e) => setFilterOverdue(e.target.checked)} />
            Overdue
          </label>
        </div>

        {usingSampleBoard && (
          <div className="tsk-sample-notice">
            Showing <strong>sample tasks</strong> — realistic placeholders for an empty workspace. Create a task or sync live data to replace this board.
            <span style={{ display: "block", marginTop: 4 }}>
              Drag a card into another column to change status; confirm in the dialog.
            </span>
          </div>
        )}

        {!loading && displayRows.length === 0 && (
          <div className="tsk-empty-state">
            <div className="tsk-empty-state-icon">✓</div>
            No tasks match the current filters.
          </div>
        )}

        {/* ── KANBAN BOARD ──────────────────────────── */}
        <div className="tsk-board">
          {COLUMN_STATUS_META.map((col) => {
            const list = tasksByStatus.get(col.status) ?? [];
            const colActive = dragOverColumn === col.status;
            return (
              <div
                key={col.status}
                className={cn("tsk-col", colActive && "tsk-col--drag-over")}
                onDragOver={(e) => handleColumnDragOver(e, col.status)}
                onDrop={(e) => handleColumnDrop(e, col.status)}
              >
                <div className="tsk-col-head">
                  <div className="tsk-col-head-row">
                    <span className="tsk-col-name">
                      <span className={`tsk-col-dot tsk-col-dot--${col.status}`} />
                      {col.label}
                    </span>
                    <span className="tsk-col-count">{list.length}</span>
                  </div>
                  <div className="tsk-col-hint">{col.hint}</div>
                </div>

                <div className="tsk-col-list">
                  {list.length === 0 && !loading && (
                    <div className="tsk-col-empty">Drop cards here</div>
                  )}
                  {list.map((t) => {
                    const pr = t.project_id != null ? projects.find((p) => p.id === t.project_id) : undefined;
                    const prLabel = pr != null
                        ? `PRJ-${t.project_id} · ${(pr.engagement_name || pr.account_name || "").slice(0, 22)}`
                      : t.project_id != null ? `PRJ-${t.project_id}` : null;
                    const linkHref = platformTaskLinkHref(t.linked_resource_type, t.linked_resource_id);
                    const linkSummary = platformTaskLinkSummary(t.linked_resource_type, t.linked_resource_id);
                    const legacyLinkLabel = t.linked_resource_type && t.linked_resource_id
                      ? `${t.linked_resource_type}:${t.linked_resource_id}` : null;
                    const overdue = t.due_at && new Date(t.due_at).getTime() < Date.now() && !["done", "cancelled"].includes(t.status);
                    const catLabel = CATEGORIES.find((c) => c.value === (t.task_category ?? ""))?.label ?? t.task_category ?? null;
                    const demo = isDemoTask(t);
                    const prio = t.priority?.trim() ?? "";

                    return (
                      <div
                        key={t.id}
                        className={cn("tsk-card", `tsk-card--${t.status}`)}
                        draggable={!loading && !readOnlyPortal}
                        onDragStart={(e) => handleTaskDragStart(e, t)}
                        onDragEnd={() => setDragOverColumn(null)}
                        style={{ cursor: loading || readOnlyPortal ? "default" : undefined }}
                      >
                        <div className="tsk-card-title-block">
                          <h3 className="tsk-card-title">{t.title}</h3>
                          <div className="tsk-card-kicker">
                            <span className="tsk-card-id">{demo ? "DEMO" : `TSK-${t.id}`}</span>
                            {prio && (
                              <span className={cn("tsk-priority", priorityCls(prio))}>
                                {priorityLabel(prio)}
                            </span>
                          )}
                            {overdue && <span className="tsk-badge-overdue">Overdue</span>}
                            {demo && <span className="tsk-badge-sample">Sample</span>}
                        </div>
                        </div>

                        {t.description && (
                          <p className="tsk-card-desc">{t.description}</p>
                        )}

                        <div className="tsk-card-meta">
                          <span className={cn("tsk-badge", "tsk-badge-dot", `tsk-badge--${t.status}`)}>
                            {COLUMN_STATUS_META.find((c) => c.status === t.status)?.label ?? t.status}
                            </span>
                          {catLabel && <span className="tsk-cat-chip">{catLabel}</span>}
                          {t.task_subtype?.trim() ? (
                            <span className="tsk-subtype-chip" title={t.task_subtype}>{t.task_subtype}</span>
                          ) : null}
                        </div>

                        <div className="tsk-card-props">
                          <div className={cn("tsk-card-prop", overdue && "tsk-card-prop--warn")}>
                            <span className="tsk-card-prop-label">Due</span>
                            <span className="tsk-card-prop-value">{fmtWhen(t.due_at)}</span>
                        </div>
                          {prLabel ? (
                            <div className="tsk-card-prop">
                              <span className="tsk-card-prop-label">Project</span>
                              <span className="tsk-card-prop-value tsk-card-prop-value--accent">{prLabel}</span>
                            </div>
                          ) : null}
                        </div>

                        {(t.assignees ?? []).length > 0 && (
                          <div
                            className="tsk-card-assignees"
                            title={(t.assignees ?? []).map((a) => a.email).join(", ")}
                          >
                            <span className="tsk-card-prop-label">People</span>
                            <div className="tsk-avatars">
                              {(t.assignees ?? []).slice(0, 4).map((a) => {
                                const hue = avatarHue(a.email);
                                return (
                                  <span
                                    key={a.user_id}
                                    className="tsk-avatar"
                                    style={{ background: `hsl(${hue} 52% 42%)` }}
                                    title={a.email}
                                  >
                                    {initialsFromEmail(a.email)}
                                  </span>
                                );
                              })}
                              {(t.assignees ?? []).length > 4 && (
                                <span
                                  className="tsk-avatar"
                                  style={{ background: "var(--border2, rgba(24,24,27,0.16))", color: "var(--text-muted)", fontSize: 9 }}
                                >
                                  +{(t.assignees ?? []).length - 4}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {(linkHref || legacyLinkLabel) && (
                          <div className="tsk-link-row">
                            {linkHref ? (
                              <Link
                                to={linkHref}
                                className="tsk-platform-link"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Open in platform
                              </Link>
                            ) : null}
                            <span className="tsk-link-meta" title={legacyLinkLabel ?? ""}>
                              {linkHref ? linkSummary : legacyLinkLabel}
                            </span>
                          </div>
                        )}

                        <div className="tsk-card-actions">
                          <button
                            type="button"
                            className="tsk-action-btn"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => { if (!readOnlyPortal) openEdit(t); }}
                          >
                            Edit
                          </button>
                          {canDelete(t) && (
                            <button
                              type="button"
                              className="tsk-action-btn tsk-action-btn--danger"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={() => void removeTask(t)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Sheet
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) resetForm();
          else setSaveError(null);
          setDialogOpen(o);
        }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className="new-contract-sheet flex min-h-0 flex-1 flex-col p-0 max-h-[100dvh]"
          aria-labelledby="task-sheet-title"
        >
          <form
            className="flex min-h-0 min-w-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="ncp-scroll min-h-0 flex-1">
              <div className="ncp-page">
                <div className="ncp-header">
                  <div>
                    <div className="ncp-breadcrumb">
                      <span>TASKS</span>
                      <span>›</span>
                      <span>
                        {editing
                          ? isDemoTask(editing)
                            ? "DEMO SAMPLE"
                            : `EDIT · TSK-${editing.id}`
                          : "NEW"}
                      </span>
                    </div>
                    <h1 id="task-sheet-title" className="ncp-title">
                      {editing ? "Update task" : "New task"}
                    </h1>
                    <p className="ncp-subtitle">
                      Assign teammates (managers only see people who share a project with them, or themselves). Set status
                      to <strong>done</strong> to record completion. All API fields are still here — grouped for a calmer
                      flow.
                      {editing && isDemoTask(editing) ? (
                        <span style={{ display: "block", marginTop: 8, color: "var(--ncp-accent)" }}>
                          Sample card: saving creates a new live task; the demo card is not updated in place.
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <button type="button" className="ncp-close" onClick={() => setDialogOpen(false)} aria-label="Close">
                    ✕
                  </button>
                </div>

                {taskSheetSection(
                  "✓",
                  "ncp-accent",
                  "What to do",
                  "Title is required. Description supports context, links, and checklists.",
                  <>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Title *</div>
                      <input
                        className="ncp-prop-input"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Short, actionable title"
                        autoComplete="off"
                      />
                    </div>
                    <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
                      <div className="ncp-prop-label" style={{ paddingTop: 8 }}>
                        Description
                      </div>
                      <textarea
                        className="ncp-prop-input"
                        rows={4}
                        style={{ resize: "vertical", minHeight: 88 }}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Optional — scope, links, acceptance criteria…"
                      />
                    </div>
                  </>,
                )}

                <div className={cn("ncp-section", !peopleSectionOpen && "ncp-collapsed")}>
                  <button
                    type="button"
                    className="ncp-section-header"
                    aria-expanded={peopleSectionOpen}
                    onClick={() => setPeopleSectionOpen((o) => !o)}
                  >
                    <div className="ncp-section-icon ncp-green">👥</div>
                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <div className="ncp-section-label">People</div>
                      <div className="ncp-section-desc">
                        {assigneeIds.size === 0
                          ? "Collapsed — click to search and assign teammates"
                          : `${assigneeIds.size} selected — click to change`}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--ncp-mono)",
                        color: "var(--ncp-accent)",
                        background: "var(--ncp-accent-soft)",
                        border: "1px solid var(--ncp-accent-mid)",
                        borderRadius: 999,
                        padding: "2px 10px",
                        flexShrink: 0,
                        marginRight: 4,
                      }}
                    >
                      {assigneeIds.size}
                    </span>
                    <span className="ncp-section-toggle">▾</span>
                  </button>
                  <div className="ncp-section-body">
                    <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--ncp-text-muted)", lineHeight: 1.45 }}>
                      Search and tap to toggle. Managers only see people who share a project with them (or themselves).
                    </p>
                    <div
                      className="overflow-hidden"
                      style={{
                        borderRadius: "var(--ncp-radius-lg)",
                        border: "1px solid var(--ncp-border)",
                        background: "var(--ncp-surface)",
                      }}
                    >
                      <div className="relative border-b px-2 py-2" style={{ borderColor: "var(--ncp-border)" }}>
                        <Search
                          className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 opacity-50"
                          aria-hidden
                        />
                        <input
                          type="search"
                          className="ncp-prop-input"
                          style={{ paddingLeft: 36 }}
                          placeholder="Search by email or role…"
                          value={assigneeSearch}
                          onChange={(e) => setAssigneeSearch(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                      <div
                        className="max-h-[min(220px,38vh)] overflow-y-auto p-1.5"
                        role="listbox"
                        aria-label="Task assignees"
                        aria-multiselectable="true"
                      >
                        {filteredAssignable.length === 0 ? (
                          <p style={{ margin: 0, padding: "20px 12px", textAlign: "center", fontSize: 12, color: "var(--ncp-text-muted)" }}>
                            {assignable.length === 0 ? "No assignable users loaded." : "No users match your search."}
                          </p>
                        ) : (
                          <ul className="m-0 flex list-none flex-col gap-1 p-0">
                            {filteredAssignable.map((u) => {
                              const selected = assigneeIds.has(u.id);
                              const hue = avatarHue(u.email);
                              return (
                                <li key={u.id}>
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={selected}
                                    onClick={() => toggleAssignee(u.id)}
                                    className={cn(
                                      "flex w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                                      selected ? "ring-1" : "hover:opacity-90",
                                    )}
                                    style={
                                      selected
                                        ? { background: "var(--ncp-accent-soft)", boxShadow: "inset 0 0 0 1px var(--ncp-accent-mid)" }
                                        : { background: "transparent" }
                                    }
                                  >
                                    <span
                                      className="flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold uppercase text-white"
                                      style={{
                                        background: `linear-gradient(145deg, hsl(${hue} 58% 46%) 0%, hsl(${hue} 52% 34%) 100%)`,
                                      }}
                                      aria-hidden
                                    >
                                      {initialsFromEmail(u.email)}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span
                                        className="block truncate text-[12px] font-medium leading-tight"
                                        style={{ fontFamily: "var(--ncp-mono)" }}
                                      >
                                        {u.email}
                                      </span>
                                      <span
                                        className="mt-0.5 inline-block max-w-full truncate rounded-md px-1.5 py-0.5 text-[10px] capitalize"
                                        style={{ color: "var(--ncp-text-muted)", background: "color-mix(in srgb, var(--ncp-border) 40%, transparent)" }}
                                      >
                                        {formatRoleLabel(u.role)}
                                      </span>
                                    </span>
                                    <span
                                      className="flex size-6 shrink-0 items-center justify-center rounded-full border text-muted-foreground"
                                      style={{
                                        borderColor: "var(--ncp-border)",
                                        background: selected ? "var(--ncp-accent)" : "var(--ncp-surface)",
                                        color: selected ? "#fff" : "var(--ncp-text-muted)",
                                      }}
                                      aria-hidden
                                    >
                                      {selected ? <Check className="size-3.5 stroke-[2.5]" /> : null}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {taskSheetSection(
                  "⏱",
                  "ncp-amber",
                  "Schedule & scope",
                  "Due date, status, and priority in one place.",
                  <>
                    <div className="ncp-date-grid" style={{ borderTop: "none" }}>
                      <div className="ncp-date-cell" style={{ gridColumn: "1 / -1" }}>
                        <label htmlFor="task-due-local">Due date</label>
                        <input
                          id="task-due-local"
                          type="datetime-local"
                          value={dueLocal}
                          onChange={(e) => setDueLocal(e.target.value)}
                        />
                      </div>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                        gap: 10,
                      }}
                    >
                      <div className="ncp-prop-row" style={{ borderTop: "none" }}>
                        <div className="ncp-prop-label">Status</div>
                        <select className="ncp-prop-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                      </div>
                      <div className="ncp-prop-row" style={{ borderTop: "none" }}>
                        <div className="ncp-prop-label">Priority</div>
                        <select
                          className="ncp-prop-input"
                          value={taskPrioritySelectValue(priority)}
                          onChange={(e) => setPriority(e.target.value)}
                        >
                          <option value="">— None —</option>
                          {TASK_PRIORITY_LEVELS.map((lvl) => (
                            <option key={lvl.value} value={lvl.value}>
                              {lvl.label}
                            </option>
                          ))}
                          {(() => {
                            const raw = priority.trim();
                            const lower = raw.toLowerCase();
                            if (!raw || ["p0", "p1", "p2", "p3"].includes(lower)) return null;
                            return (
                              <option key="__legacy_priority__" value={raw}>
                                {raw} (from record)
                              </option>
                            );
                          })()}
                        </select>
                      </div>
                    </div>
                  </>,
                )}

                {taskSheetSection(
                  "📁",
                  "ncp-blue",
                  "Project",
                  "Optional — link this task to a client project for context and reporting.",
                  <TaskSheetProjectPicker projects={projects} projectId={projectId} onProjectChange={setProjectId} />,
                )}

                {taskSheetSection(
                  "🏷",
                  "ncp-green",
                  "Category",
                  "Optional — choose a workflow lane for filters and automation.",
                  <div className="ncp-prop-row" style={{ borderTop: "none", alignItems: "center" }}>
                    <div className="ncp-prop-label">Category</div>
                    <select className="ncp-prop-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c.value || "none"} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                  </div>,
                )}

                {taskSheetSection(
                  "🔗",
                  "ncp-blue",
                  "Deep link & subtype",
                  "Optional: tie this task to a platform record, or add a subtype verb for automation and filters.",
                  <>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Subtype</div>
                      <input
                        className="ncp-prop-input"
                        value={subtype}
                        onChange={(e) => setSubtype(e.target.value)}
                        placeholder="e.g. pack_review, sla_upload_review"
                      />
            </div>
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Link preset</div>
              <select
                        className="ncp-prop-input"
                value={linkPreset}
                onChange={(e) => {
                  const v = e.target.value;
                  setLinkPreset(v);
                  if (v === "") {
                    setLinkedType("");
                    setLinkedId("");
                    return;
                  }
                  if (v === CUSTOM_LINK_PRESET) return;
                  setLinkedType(v);
                  const dc = defaultCategoryForLinkKind(v);
                  if (dc) setCategory((prev) => (prev.trim() ? prev : dc));
                }}
              >
                <option value="">— Not linked —</option>
                {PLATFORM_TASK_LINK_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
                <option value={CUSTOM_LINK_PRESET}>Custom (advanced)…</option>
              </select>
                    </div>
              {linkPreset && linkPreset !== CUSTOM_LINK_PRESET ? (
                      <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--ncp-text-muted)", lineHeight: 1.45 }}>
                  {PLATFORM_TASK_LINK_KINDS.find((k) => k.value === linkPreset)?.hint ?? ""}
                </p>
              ) : null}
            {linkPreset && linkPreset !== CUSTOM_LINK_PRESET ? (
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Resource id</div>
                        <input
                          className="ncp-prop-input"
                          value={linkedId}
                          onChange={(e) => setLinkedId(e.target.value)}
                          placeholder="When the preset needs an id (submission, project, record…)"
                        />
                      </div>
            ) : null}
            {linkPreset === CUSTOM_LINK_PRESET ? (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                          gap: 10,
                        }}
                      >
                        <div className="ncp-prop-row" style={{ borderTop: "none" }}>
                          <div className="ncp-prop-label">Resource type</div>
                          <input
                            className="ncp-prop-input"
                            value={linkedType}
                            onChange={(e) => setLinkedType(e.target.value)}
                            placeholder="Canonical type string"
                          />
                        </div>
                        <div className="ncp-prop-row" style={{ borderTop: "none" }}>
                          <div className="ncp-prop-label">Resource id</div>
                          <input
                            className="ncp-prop-input"
                            value={linkedId}
                            onChange={(e) => setLinkedId(e.target.value)}
                            placeholder="Id or composite key"
                          />
                        </div>
              </div>
            ) : null}
                  </>,
                )}

                {saveError ? (
              <div
                style={{
                      margin: "12px 0",
                      padding: "10px 14px",
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      borderRadius: "var(--ncp-radius)",
                      fontSize: 13,
                      color: "#b91c1c",
                    }}
                  >
                    {saveError}
              </div>
                ) : null}
            </div>
          </div>

            <div className="ncp-footer">
              <span className="ncp-hint" style={{ alignSelf: "center" }}>
                <kbd className="ncp-kbd">Esc</kbd> closes
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </button>
                <button type="submit" className="ncp-btn ncp-btn-primary" disabled={saving}>
                  {saving ? "Saving…" : editing ? "Save changes" : "Create task"}
            </button>
              </div>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Dialog
        open={moveDialogOpen}
        onOpenChange={(o) => {
          if (!o && !moveSaving) cancelStatusMove();
        }}
      >
        <DialogContent showCloseButton className={cn("platform-dialog max-w-md")}>
          <DialogHeader className="platform-dialog__header">
            <div className="platform-dialog__eyebrow">Card update</div>
            <DialogTitle className="platform-dialog__title">Update task status</DialogTitle>
            <DialogDescription className="platform-dialog__desc">
              {pendingMove ? (
                <>
                  <strong style={{ color: "var(--text)" }}>{pendingMove.task.title}</strong>
                  <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5 }}>
                    <span style={{ color: "var(--text-muted)" }}>From </span>
                    <StatusTag status={pendingMove.task.status} />
                    <span style={{ margin: "0 6px", color: "var(--text-muted)" }}>→</span>
                    <StatusTag status={pendingMove.nextStatus} />
                    <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>({labelForStatus(pendingMove.nextStatus)})</span>
                  </div>
                  {isDemoTask(pendingMove.task) ? (
                    <p style={{ marginTop: 12, marginBottom: 0, fontSize: 11, color: "var(--text-muted)" }}>
                      Sample board: this change stays in your browser until you refresh or create live tasks.
                    </p>
                  ) : (
                    <p style={{ marginTop: 12, marginBottom: 0, fontSize: 11, color: "var(--text-muted)" }}>
                      This updates the task on the server and respects your access rules.
                    </p>
                  )}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="platform-dialog__footer">
            <button type="button" className="platform-dialog__btn" onClick={() => cancelStatusMove()} disabled={moveSaving}>
              Cancel
            </button>
            <button
              type="button"
              className="platform-dialog__btn platform-dialog__btn--primary"
              onClick={() => void confirmStatusMove()}
              disabled={moveSaving || !pendingMove}
            >
              {moveSaving ? "Updating…" : "Confirm update"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
