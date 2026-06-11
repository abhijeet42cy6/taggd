import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Flex,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
  TextInput,
  Title,
} from "@tremor/react";
import { downloadCandidateCvFile, queries, type CandidateRow, type Project } from "@/lib/api";
import { isPlatformAdminRole, isReadOnlyClient, isRecruiterUser, useAuth } from "@/lib/auth";
import { CandidateFormDrawer } from "@/components/platform/CandidateFormDrawer";
import { StatusTag } from "@/components/platform/PlatformBlocks";
import { projectDisplayName, SearchableProjectFilterSelect } from "@/components/platform/searchable-pickers";
import { Skeleton } from "@/components/platform/Skeleton";

const PER_PAGE = 50;
const PAGE_WINDOW = 7;

function buildVisiblePageNumbers(current: number, total: number, windowSize = PAGE_WINDOW): number[] {
  if (total <= windowSize) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  let start = Math.max(1, current - Math.floor(windowSize / 2));
  let end = start + windowSize - 1;
  if (end > total) {
    end = total;
    start = Math.max(1, end - windowSize + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

const flatCard =
  "overflow-hidden border-0 p-0 shadow-tremor-card ring-1 ring-tremor-ring dark:bg-dark-tremor-background dark:shadow-dark-tremor-card dark:ring-dark-tremor-ring";

export function Candidates() {
  const { user } = useAuth();
  const readOnly = isReadOnlyClient(user);
  const recruiterView = isRecruiterUser(user);
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [cvUploadFor, setCvUploadFor] = useState<number | null>(null);
  const [cvBusy, setCvBusy] = useState<number | null>(null);
  const cvFileRef = useRef<HTMLInputElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [drawerCandidateId, setDrawerCandidateId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const defaultDrawerProjectId =
    projectId.trim() !== "" && !Number.isNaN(parseInt(projectId, 10)) ? parseInt(projectId, 10) : null;

  const openCreateDrawer = useCallback(() => {
    setDrawerMode("create");
    setDrawerCandidateId(null);
    setDrawerOpen(true);
  }, []);

  const openEditDrawer = useCallback((id: number) => {
    setDrawerMode("edit");
    setDrawerCandidateId(id);
    setDrawerOpen(true);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, projectId]);

  useEffect(() => {
    queries.projects().then(setProjects).catch(() => setProjects([]));
  }, []);

  const projectById = useMemo(() => {
    const m = new Map<number, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const pid = projectId.trim() ? parseInt(projectId, 10) : undefined;
      const data = await queries.candidatesList({
        project_id: pid != null && !Number.isNaN(pid) ? pid : undefined,
        search: debounced || undefined,
        limit: PER_PAGE,
        offset: (page - 1) * PER_PAGE,
      });
      setRows(data.items);
      setTotal(data.total);
    } catch (e: unknown) {
      setRows([]);
      setTotal(0);
      const msg = e instanceof Error ? e.message : "Could not load candidates";
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [debounced, page, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const visiblePages = useMemo(
    () => buildVisiblePageNumbers(page, totalPages),
    [page, totalPages],
  );

  const subtitle = recruiterView
    ? "Mandate-level pipeline rows where you are the assigned recruiter or hiring manager (or on your projects)."
    : readOnly
      ? "Candidates on the projects enabled for your portal account."
      : "RPO candidate rows scoped to your projects — each line is tied to one requisition.";

  return (
    <div className="candidates-tremor space-y-3 pb-8 md:space-y-4">
      <div>
        <span className="inline-flex max-w-full items-center whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-orange-600">
          People&nbsp;·&nbsp;Talent
        </span>
        <Title className="mt-0.5 text-2xl font-bold tracking-tight text-tremor-content-strong md:text-3xl">Candidates</Title>
        <Text className="mt-1.5 max-w-4xl text-xs leading-snug text-tremor-content-emphasis md:text-sm md:leading-snug">
          {subtitle}
        </Text>
      </div>

      {loadError ? (
        <Card className="border-amber-200 bg-amber-50 ring-1 ring-amber-200 dark:border-amber-900/40 dark:bg-amber-950/25 dark:ring-amber-900/50">
          <Text className="px-4 py-3 text-xs text-amber-950 dark:text-amber-100 md:text-sm" role="alert">
            <span className="font-semibold">Could not load candidates.</span> {loadError}
            {loadError.includes("403") || loadError.toLowerCase().includes("vertical") ? (
              <span>
                {" "}
                Your account may need the <span className="font-semibold">Candidates</span> module enabled in Users &amp;
                access, or broader project assignments.
              </span>
            ) : null}
          </Text>
        </Card>
      ) : null}

      <Card className={flatCard}>
        <div className="flex w-full min-w-0 flex-col gap-3 border-b border-tremor-border px-4 py-3 dark:border-dark-tremor-border">
          <div className="flex w-full min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
            <div className="min-w-0 w-full flex-1">
              <Text className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-orange-600">Search</Text>
              <TextInput
                placeholder="Search name, email, client id, org, professional summary…"
                value={search}
                onValueChange={setSearch}
                className="w-full"
                aria-label="Search candidates"
              />
            </div>
            <div className="w-full min-w-0 shrink-0 lg:w-64">
              <Text className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-orange-600">Project</Text>
              <SearchableProjectFilterSelect
                projects={projects}
                value={projectId}
                onChange={setProjectId}
                disabled={loading && projects.length === 0}
              />
            </div>
            <div className="flex w-full shrink-0 flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
              <Button type="button" size="xs" variant="secondary" onClick={() => void load()}>
                Refresh
              </Button>
              {!readOnly ? (
                <Button type="button" size="xs" variant="primary" color="orange" onClick={openCreateDrawer}>
                  Add candidate
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1 border-b border-tremor-border px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-dark-tremor-border">
          <Title className="text-sm font-semibold text-tremor-content-strong">Results ({total.toLocaleString()})</Title>
          {total > 0 ? (
            <Text className="text-xs tabular-nums text-tremor-content-subtle">
              {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total.toLocaleString()}
            </Text>
          ) : null}
        </div>

        <input
          ref={cvFileRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf"
          className="hidden"
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            const cid = cvUploadFor;
            e.target.value = "";
            setCvUploadFor(null);
            if (!f || cid == null) return;
            setCvBusy(cid);
            void queries
              .candidateUploadCv(cid, f)
              .then(() => void load())
              .finally(() => setCvBusy(null));
          }}
        />

        <div className="px-2 pb-3 pt-1">
          {loading ? (
            <Skeleton height={220} />
          ) : rows.length === 0 ? (
            <div className="px-3 py-6">
              <Text className="text-sm font-medium text-tremor-content-strong">No candidate rows returned.</Text>
              <Text className="mt-3 text-xs leading-relaxed text-tremor-content-emphasis">
                The <span className="font-semibold">Requisitions</span> screen reads the <code className="rounded bg-tremor-background-muted px-1 py-0.5 text-[11px] dark:bg-dark-tremor-background-muted">records</code>{" "}
                table (ingested positions). This tab reads the separate{" "}
                <code className="rounded bg-tremor-background-muted px-1 py-0.5 text-[11px] dark:bg-dark-tremor-background-muted">candidates</code> table, which is only populated via the Candidates API unless you run a migration from records → candidates. If you expect data here, confirm rows exist in the database and that master backfill has been run after candidates exist.
              </Text>
              {!readOnly ? (
                <Button type="button" size="xs" className="mt-4" variant="primary" color="orange" onClick={openCreateDrawer}>
                  Add candidate
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1100px]">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>ID</TableHeaderCell>
                    <TableHeaderCell>Master</TableHeaderCell>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Client ID</TableHeaderCell>
                    <TableHeaderCell>Project</TableHeaderCell>
                    <TableHeaderCell>Req</TableHeaderCell>
                    <TableHeaderCell>Recruiter</TableHeaderCell>
                    <TableHeaderCell>Created by</TableHeaderCell>
                    <TableHeaderCell>Experience</TableHeaderCell>
                    <TableHeaderCell>CV</TableHeaderCell>
                    <TableHeaderCell>Stage</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    {!readOnly ? <TableHeaderCell>Actions</TableHeaderCell> : null}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs tabular-nums text-tremor-content-strong">CAN-{r.id}</TableCell>
                      <TableCell className="text-xs font-medium text-orange-600 tabular-nums dark:text-orange-400">
                        {r.master_id != null ? `MST-${r.master_id}` : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{r.full_name || "—"}</TableCell>
                      <TableCell className="text-sm tabular-nums">{r.client_candidate_id}</TableCell>
                      <TableCell className="text-sm">
                        {(() => {
                          const pr = projectById.get(r.project_id);
                          const name = pr ? projectDisplayName(pr) : `Project ${r.project_id}`;
                          return (
                            <span title={`PRJ-${r.project_id}`}>
                              {name}
                              <span className="mt-0.5 block text-[10px] tabular-nums text-tremor-content-subtle">
                                PRJ-{r.project_id}
                              </span>
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">REQ-{r.record_id}</TableCell>
                      <TableCell className="max-w-[7.5rem] truncate text-sm" title={r.assigned_recruiter || undefined}>
                        {r.assigned_recruiter_user_id != null
                          ? `UID ${r.assigned_recruiter_user_id}`
                          : r.assigned_recruiter || "—"}
                      </TableCell>
                      <TableCell className="max-w-[8.75rem] break-words text-sm" title={r.created_by_email || undefined}>
                        {r.created_by_email || (r.created_by_user_id != null ? `UID ${r.created_by_user_id}` : "—")}
                      </TableCell>
                      <TableCell className="max-w-[10rem] text-sm" title={r.professional_summary || undefined}>
                        {(r.experience_role_count ?? 0) > 0 ? `${r.experience_role_count} role(s)` : "—"}
                        {r.professional_summary ? (
                          <span className="mt-0.5 block text-[10px] leading-snug text-tremor-content-subtle">
                            {(r.professional_summary || "").slice(0, 48)}
                            {(r.professional_summary || "").length > 48 ? "…" : ""}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-1">
                          {r.has_cv ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="light"
                              onClick={() => void downloadCandidateCvFile(r.id, r.cv_original_filename).catch(() => undefined)}
                            >
                              Download
                            </Button>
                          ) : null}
                          {!readOnly && r.has_cv ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="light"
                              disabled={cvBusy === r.id}
                              onClick={() => {
                                if (!window.confirm("Remove CV from this candidate?")) return;
                                setCvBusy(r.id);
                                void queries
                                  .candidateDeleteCv(r.id)
                                  .then(() => void load())
                                  .finally(() => setCvBusy(null));
                              }}
                            >
                              Remove
                            </Button>
                          ) : null}
                          {!readOnly ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="secondary"
                              disabled={cvBusy === r.id}
                              onClick={() => {
                                setCvUploadFor(r.id);
                                cvFileRef.current?.click();
                              }}
                            >
                              {r.has_cv ? "Replace" : "Upload"}
                            </Button>
                          ) : null}
                          {readOnly && !r.has_cv ? (
                            <Text className="text-xs text-tremor-content-subtle">—</Text>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.current_stage || "—"}</TableCell>
                      <TableCell>{r.global_status ? <StatusTag status={r.global_status} /> : "—"}</TableCell>
                      {!readOnly ? (
                        <TableCell>
                          <Button type="button" size="xs" variant="light" color="orange" onClick={() => openEditDrawer(r.id)}>
                            Edit
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {totalPages > 1 ? (
          <Flex justifyContent="center" alignItems="center" className="flex-wrap gap-1.5 border-t border-tremor-border px-4 py-3 dark:border-dark-tremor-border">
            <Button
              type="button"
              size="xs"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Previous page"
            >
              ←
            </Button>
            {visiblePages[0] > 1 ? (
              <Text className="self-center text-xs text-tremor-content-subtle">…</Text>
            ) : null}
            {visiblePages.map((p) => (
              <Button
                key={p}
                type="button"
                size="xs"
                variant={page === p ? "primary" : "light"}
                color="orange"
                className="min-w-[1.75rem] px-0 tabular-nums"
                onClick={() => setPage(p)}
              >
                {p}
              </Button>
            ))}
            {visiblePages[visiblePages.length - 1] < totalPages ? (
              <Text className="self-center text-xs text-tremor-content-subtle">…{totalPages} pages</Text>
            ) : null}
            <Button
              type="button"
              size="xs"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
            >
              →
            </Button>
          </Flex>
        ) : null}
      </Card>

      <CandidateFormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        mode={drawerMode}
        candidateId={drawerCandidateId}
        projects={projects}
        defaultProjectId={defaultDrawerProjectId}
        onSuccess={() => void load()}
      />

      {isPlatformAdminRole(user?.role) ? (
        <Text className="text-[11px] leading-snug text-tremor-content-subtle">
          Use <span className="font-semibold text-tremor-content-emphasis">Candidate store</span> to run enterprise search;
          use <span className="font-semibold text-tremor-content-emphasis">Admin → backfill</span> from API{" "}
          <code className="rounded bg-tremor-background-muted px-1 py-0.5 font-mono text-[10px] dark:bg-dark-tremor-background-muted">
            POST /candidate-masters/backfill
          </code>{" "}
          to link legacy rows to masters.
        </Text>
      ) : null}
    </div>
  );
}
