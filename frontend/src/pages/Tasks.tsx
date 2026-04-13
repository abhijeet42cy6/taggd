import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { queries, type Project, type TaskRow } from "@/lib/api";
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
import { cn } from "@/lib/utils";

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
  { value: "ingestion", label: "Ingestion / data ops" },
  { value: "requisition", label: "Requisition / record" },
  { value: "client_project", label: "Client / project" },
  { value: "contract", label: "Contract" },
  { value: "meeting", label: "Meeting / MoM" },
  { value: "billing", label: "Billing / revenue" },
  { value: "finance", label: "Finance ledger" },
  { value: "sla", label: "SLA" },
  { value: "wfm", label: "WFM" },
  { value: "vendor_license", label: "Vendor license" },
  { value: "candidate", label: "Candidate" },
  { value: "admin", label: "Admin / access" },
  { value: "adhoc", label: "Ad hoc" },
];

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
  const [projectId, setProjectId] = useState<string>("");
  const [dueLocal, setDueLocal] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<Set<number>>(new Set());

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
  }, [filterStatus, filterMine, filterOverdue, filterProjectId]);

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
      uid,
    });
  }, [rows, sampleWithOverrides, filterStatus, filterMine, filterOverdue, filterProjectId, uid]);

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
    setProjectId("");
    setDueLocal("");
    setAssigneeIds(new Set());
  }

  function openCreate() {
    resetForm();
    if (uid != null) setAssigneeIds(new Set([uid]));
    setDialogOpen(true);
  }

  function openEdit(t: TaskRow) {
    setSaveError(null);
    setEditing(t);
    setTitle(t.title);
    setDescription(t.description ?? "");
    setStatus(t.status);
    setPriority(t.priority ?? "");
    setCategory(t.task_category ?? "");
    setSubtype(t.task_subtype ?? "");
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

  const lbl = (t: string) => (
    <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{t}</span>
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <PageHeader
          title="Tasks"
          subtitle={
            recruiterView
              ? "Your queue: tasks you created, are assigned to, or on projects you have access to — start here each day."
              : "Cross-cutting work: deadlines, assignees, links to ingestion, requisitions, contracts, meetings, billing, and more."
          }
        />
        {!readOnlyPortal ? (
          <button
            type="button"
            className="platform-dialog__btn platform-dialog__btn--primary"
            style={{ fontSize: 11, fontFamily: "'DM Mono',monospace" }}
            onClick={() => openCreate()}
          >
            + New task
          </button>
        ) : null}
      </div>
      {readOnlyPortal ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: -6 }}>
          View only — this client portal account cannot create, edit, or move tasks.
        </div>
      ) : null}

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={72} />
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <PlatformKpi label="Visible tasks" value={displayRows.length} accent="blue" subtext="Current filters" />
          <PlatformKpi label="Open / active" value={openCount} accent="teal" subtext="Not done or cancelled" />
          <PlatformKpi label="Overdue (in list)" value={overdueCount} accent={overdueCount > 0 ? "red" : "amber"} subtext="Due in past & open" />
        </div>
      )}

      <PlatformSection title="Task board" action="Refresh" onAction={() => void refresh()}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12, alignItems: "center" }}>
          <select
            className="platform-search"
            style={{ minWidth: 140 }}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="platform-search"
            style={{ minWidth: 180 }}
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                PRJ-{p.id} · {(p.engagement_name || p.account_name || "").slice(0, 36)}
              </option>
            ))}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <input type="checkbox" checked={filterMine} onChange={(e) => setFilterMine(e.target.checked)} />
            Mine only
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <input type="checkbox" checked={filterOverdue} onChange={(e) => setFilterOverdue(e.target.checked)} />
            Overdue
          </label>
        </div>

        {usingSampleBoard && (
          <div
            style={{
              marginBottom: 14,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "rgba(59, 130, 246, 0.06)",
              fontSize: 11,
              color: "var(--text-muted)",
              lineHeight: 1.45,
            }}
          >
            Showing <strong style={{ color: "var(--text)" }}>sample tasks</strong> — realistic placeholders for an empty workspace. Create a task or sync live data to replace this board.
            <span style={{ display: "block", marginTop: 6 }}>Drag a card into another column to change status; you’ll confirm in a short dialog.</span>
          </div>
        )}

        {!usingSampleBoard && !loading && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
            Drag cards between columns to change status (confirm to save).
          </div>
        )}

        {!loading && displayRows.length === 0 && (
          <div style={{ color: "var(--text-muted)", padding: 28, textAlign: "center", fontSize: 12 }}>
            No tasks match filters.
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            paddingBottom: 6,
            alignItems: "stretch",
          }}
        >
          {COLUMN_STATUS_META.map((col) => {
            const list = tasksByStatus.get(col.status) ?? [];
            const colActive = dragOverColumn === col.status;
            return (
              <div
                key={col.status}
                onDragOver={(e) => handleColumnDragOver(e, col.status)}
                onDrop={(e) => handleColumnDrop(e, col.status)}
                style={{
                  flex: "0 0 min(280px, 85vw)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  minHeight: 200,
                  maxHeight: "min(72vh, 680px)",
                  borderRadius: 12,
                  outline: colActive ? "2px dashed var(--accent)" : "none",
                  outlineOffset: 4,
                  transition: "outline-color 0.12s ease",
                }}
              >
                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface-elevated, rgba(255,255,255,0.02))",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: "0.02em" }}>{col.label}</span>
                    <span
                      style={{
                        fontFamily: "'DM Mono',monospace",
                        fontSize: 10,
                        color: "var(--text-muted)",
                        background: "rgba(255,255,255,0.04)",
                        padding: "2px 8px",
                        borderRadius: 999,
                      }}
                    >
                      {list.length}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{col.hint}</div>
                </div>
                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    paddingRight: 4,
                  }}
                >
                  {list.map((t) => {
                    const pr = t.project_id != null ? projects.find((p) => p.id === t.project_id) : undefined;
                    const prLabel =
                      pr != null
                        ? `PRJ-${t.project_id} · ${(pr.engagement_name || pr.account_name || "").slice(0, 22)}`
                        : t.project_id != null
                          ? `PRJ-${t.project_id}`
                          : null;
                    const link =
                      t.linked_resource_type && t.linked_resource_id
                        ? `${t.linked_resource_type}:${t.linked_resource_id}`
                        : null;
                    const overdue =
                      t.due_at &&
                      new Date(t.due_at).getTime() < Date.now() &&
                      !["done", "cancelled"].includes(t.status);
                    const catLabel = CATEGORIES.find((c) => c.value === (t.task_category ?? ""))?.label ?? t.task_category ?? "—";
                    const demo = isDemoTask(t);
                    return (
                      <div
                        key={t.id}
                        draggable={!loading && !readOnlyPortal}
                        onDragStart={(e) => handleTaskDragStart(e, t)}
                        onDragEnd={() => setDragOverColumn(null)}
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          padding: "12px 12px 10px",
                          background: "var(--surface, rgba(0,0,0,0.2))",
                          display: "grid",
                          gap: 8,
                          boxShadow: "0 1px 0 rgba(255,255,255,0.03)",
                          cursor: loading ? "default" : "grab",
                        }}
                      >
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: "var(--accent)" }}>
                            {demo ? "DEMO" : `TSK-${t.id}`}
                          </span>
                          {t.priority && (
                            <span className="platform-badge" style={{ fontSize: 9 }}>
                              {t.priority}
                            </span>
                          )}
                          {overdue && (
                            <span
                              className="platform-badge"
                              style={{ fontSize: 9, background: "rgba(255,79,107,0.15)", color: "var(--red)" }}
                            >
                              Overdue
                            </span>
                          )}
                          {demo && (
                            <span className="platform-badge" style={{ fontSize: 9, opacity: 0.85 }}>
                              Sample
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.35 }}>{t.title}</div>
                        {t.description && (
                          <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {t.description}
                          </p>
                        )}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                          <StatusTag status={t.status} />
                          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{catLabel}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
                          Due {fmtWhen(t.due_at)}
                        </div>
                        {(t.assignees ?? []).length > 0 && (
                          <div style={{ fontSize: 10, color: "var(--text-muted)" }} title={(t.assignees ?? []).map((a) => a.email).join(", ")}>
                            {(t.assignees ?? []).map((a) => a.email.split("@")[0]).join(" · ")}
                          </div>
                        )}
                        {prLabel && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{prLabel}</div>}
                        {link && (
                          <div style={{ fontSize: 9, fontFamily: "'DM Mono',monospace", color: "var(--text-muted)", wordBreak: "break-all" }} title={link}>
                            {link}
                          </div>
                        )}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                          <button
                            type="button"
                            className="platform-dialog__btn"
                            style={{ fontSize: 10, padding: "4px 10px" }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => {
                              if (!readOnlyPortal) openEdit(t);
                            }}
                          >
                            Update task
                          </button>
                          {canDelete(t) && (
                            <button
                              type="button"
                              className="platform-dialog__btn"
                              style={{ fontSize: 10, padding: "4px 10px", color: "var(--red)", borderColor: "rgba(255,79,107,0.35)" }}
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
      </PlatformSection>

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) resetForm();
          else setSaveError(null);
          setDialogOpen(o);
        }}
      >
        <DialogContent showCloseButton className={cn("platform-dialog platform-dialog--wide max-h-[92vh] overflow-y-auto")}>
          <DialogHeader className="platform-dialog__header">
            <div className="platform-dialog__eyebrow">
              {editing ? (isDemoTask(editing) ? "Edit · DEMO sample" : `Edit · TSK-${editing.id}`) : "New task"}
            </div>
            <DialogTitle className="platform-dialog__title">{editing ? "Update task" : "Create task"}</DialogTitle>
            <DialogDescription className="platform-dialog__desc">
              Assign one or more users. Managers can only assign people who share a project with them (or themselves). Mark done to set completion time.
              {editing && isDemoTask(editing) ? (
                <span style={{ display: "block", marginTop: 8, color: "var(--amber, #fbbf24)", fontSize: 11 }}>
                  This is a sample card — saving creates a new live task (samples are not updated in place).
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 min-w-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
          <div className="platform-dialog__body space-y-3" style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {lbl("Title *")}
              <input className="platform-search" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {lbl("Description")}
              <textarea className="platform-search" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {lbl("Status")}
                <select className="platform-search" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {lbl("Priority (e.g. p0)")}
                <input className="platform-search" value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="p0 / p1 / high" />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {lbl("Category")}
                <select className="platform-search" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c.value || "none"} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {lbl("Subtype / verb (optional)")}
              <input className="platform-search" value={subtype} onChange={(e) => setSubtype(e.target.value)} placeholder="e.g. ingestion_sla_upload_review" />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {lbl("Linked resource type")}
                <input className="platform-search" value={linkedType} onChange={(e) => setLinkedType(e.target.value)} placeholder="requisition, meeting, …" />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {lbl("Linked resource id")}
                <input className="platform-search" value={linkedId} onChange={(e) => setLinkedId(e.target.value)} placeholder="numeric id" />
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {lbl("Project (optional)")}
              <select className="platform-search" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">— None —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    PRJ-{p.id} · {(p.engagement_name || p.account_name || p.filename || "").slice(0, 48)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {lbl("Due date & time")}
              <input className="platform-search" type="datetime-local" value={dueLocal} onChange={(e) => setDueLocal(e.target.value)} />
            </label>
            <div>
              {lbl("Assignees")}
              <div
                style={{
                  marginTop: 8,
                  maxHeight: 160,
                  overflowY: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 8,
                  display: "grid",
                  gap: 6,
                }}
              >
                {assignable.map((u) => (
                  <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, cursor: "pointer" }}>
                    <input type="checkbox" checked={assigneeIds.has(u.id)} onChange={() => toggleAssignee(u.id)} />
                    <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{u.email}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: 9 }}>{u.role}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          {saveError ? <div className="platform-dialog__alert mx-5 mb-0 mt-1 shrink-0">{saveError}</div> : null}
          <DialogFooter className="platform-dialog__footer">
            <button type="button" className="platform-dialog__btn" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="platform-dialog__btn platform-dialog__btn--primary" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create"}
            </button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
