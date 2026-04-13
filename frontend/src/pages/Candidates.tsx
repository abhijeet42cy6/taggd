import React, { useCallback, useEffect, useRef, useState } from "react";
import { downloadCandidateCvFile, queries, type CandidateRow, type Project } from "@/lib/api";
import { isPlatformAdminRole, isReadOnlyClient, isRecruiterUser, useAuth } from "@/lib/auth";
import { CandidateFormDrawer } from "@/components/platform/CandidateFormDrawer";
import { PageHeader, PlatformSection, StatusTag } from "@/components/platform/PlatformBlocks";
import { Skeleton } from "@/components/platform/Skeleton";

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
    queries.projects().then(setProjects).catch(() => setProjects([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const pid = projectId.trim() ? parseInt(projectId, 10) : undefined;
      const data = await queries.candidatesList({
        project_id: pid != null && !Number.isNaN(pid) ? pid : undefined,
        search: debounced || undefined,
        limit: 100,
        offset: 0,
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
  }, [debounced, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <PageHeader
        title="Candidates"
        subtitle={
          recruiterView
            ? "Mandate-level pipeline rows where you are the assigned recruiter or hiring manager (or on your projects)."
            : readOnly
              ? "Candidates on the projects enabled for your portal account."
              : "RPO candidate rows scoped to your projects — each line is tied to one requisition."
        }
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <input
          className="platform-search"
          placeholder="Search name, email, client id, org, professional summary…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 220px", maxWidth: 420, minWidth: 180 }}
        />
        <select
          className="platform-search"
          style={{ minWidth: 160 }}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={String(p.id)}>
              PRJ-{p.id} {p.account_name || p.filename || ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="platform-dialog__btn"
          style={{ fontSize: 11, fontFamily: "'DM Mono',monospace" }}
          onClick={() => void load()}
        >
          Refresh
        </button>
        {!readOnly ? (
          <button
            type="button"
            className="platform-dialog__btn platform-dialog__btn--primary"
            style={{ fontSize: 11, fontFamily: "'DM Mono',monospace" }}
            onClick={openCreateDrawer}
          >
            Add candidate
          </button>
        ) : null}
      </div>

      {loadError ? (
        <div
          className="alert-banner amber"
          style={{ fontSize: 12, margin: 0 }}
          role="alert"
        >
          <strong>Could not load candidates.</strong> {loadError}
          {loadError.includes("403") || loadError.toLowerCase().includes("vertical") ? (
            <>
              {" "}
              Your account may need the <strong>Candidates</strong> module enabled in Users &amp; access, or broader
              project assignments.
            </>
          ) : null}
        </div>
      ) : null}

      <PlatformSection title={`Results (${total})`}>
        <input
          ref={cvFileRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf"
          style={{ display: "none" }}
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
        {loading ? (
          <Skeleton height={220} />
        ) : rows.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 16, lineHeight: 1.55 }}>
            <p style={{ margin: "0 0 8px" }}>No candidate rows returned.</p>
            <p style={{ margin: "0 0 12px" }}>
              The <strong>Requisitions</strong> screen reads the <code>records</code> table (ingested positions). This tab
              reads the separate <code>candidates</code> table, which is only populated via the Candidates API unless you
              run a migration from records → candidates. If you expect data here, confirm rows exist in the database and
              that master backfill has been run after candidates exist.
            </p>
            {!readOnly ? (
              <button
                type="button"
                className="platform-dialog__btn platform-dialog__btn--primary"
                style={{ fontSize: 11 }}
                onClick={openCreateDrawer}
              >
                Add candidate
              </button>
            ) : null}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="platform-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "8px 6px" }}>ID</th>
                  <th style={{ padding: "8px 6px" }}>Master</th>
                  <th style={{ padding: "8px 6px" }}>Name</th>
                  <th style={{ padding: "8px 6px" }}>Client ID</th>
                  <th style={{ padding: "8px 6px" }}>Project</th>
                  <th style={{ padding: "8px 6px" }}>Req</th>
                  <th style={{ padding: "8px 6px" }}>Recruiter</th>
                  <th style={{ padding: "8px 6px" }}>Created by</th>
                  <th style={{ padding: "8px 6px" }}>Experience</th>
                  <th style={{ padding: "8px 6px" }}>CV</th>
                  <th style={{ padding: "8px 6px" }}>Stage</th>
                  <th style={{ padding: "8px 6px" }}>Status</th>
                  {!readOnly ? <th style={{ padding: "8px 6px" }}>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid color-mix(in srgb, var(--border) 60%, transparent)" }}>
                    <td style={{ padding: "8px 6px", fontFamily: "'DM Mono',monospace" }}>CAN-{r.id}</td>
                    <td style={{ padding: "8px 6px", fontFamily: "'DM Mono',monospace", color: "var(--accent)" }}>
                      {r.master_id != null ? `MST-${r.master_id}` : "—"}
                    </td>
                    <td style={{ padding: "8px 6px" }}>{r.full_name || "—"}</td>
                    <td style={{ padding: "8px 6px" }}>{r.client_candidate_id}</td>
                    <td style={{ padding: "8px 6px" }}>PRJ-{r.project_id}</td>
                    <td style={{ padding: "8px 6px" }}>REQ-{r.record_id}</td>
                    <td style={{ padding: "8px 6px", maxWidth: 120 }} title={r.assigned_recruiter || undefined}>
                      {r.assigned_recruiter_user_id != null
                        ? `UID ${r.assigned_recruiter_user_id}`
                        : r.assigned_recruiter || "—"}
                    </td>
                    <td style={{ padding: "8px 6px", maxWidth: 140, wordBreak: "break-word" }} title={r.created_by_email || undefined}>
                      {r.created_by_email || (r.created_by_user_id != null ? `UID ${r.created_by_user_id}` : "—")}
                    </td>
                    <td style={{ padding: "8px 6px", maxWidth: 160 }} title={r.professional_summary || undefined}>
                      {(r.experience_role_count ?? 0) > 0 ? `${r.experience_role_count} role(s)` : "—"}
                      {r.professional_summary ? (
                        <span style={{ display: "block", color: "var(--text-muted)", fontSize: 10, marginTop: 2 }}>
                          {(r.professional_summary || "").slice(0, 48)}
                          {(r.professional_summary || "").length > 48 ? "…" : ""}
                        </span>
                      ) : null}
                    </td>
                    <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                      {r.has_cv ? (
                        <button
                          type="button"
                          className="platform-dialog__btn"
                          style={{ fontSize: 10, marginRight: 4 }}
                          onClick={() =>
                            void downloadCandidateCvFile(r.id, r.cv_original_filename).catch(() => undefined)
                          }
                        >
                          Download
                        </button>
                      ) : null}
                      {!readOnly && r.has_cv ? (
                        <button
                          type="button"
                          className="platform-dialog__btn"
                          style={{ fontSize: 10 }}
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
                        </button>
                      ) : null}
                      {!readOnly ? (
                        <button
                          type="button"
                          className="platform-dialog__btn"
                          style={{ fontSize: 10, marginLeft: r.has_cv ? 4 : 0 }}
                          disabled={cvBusy === r.id}
                          onClick={() => {
                            setCvUploadFor(r.id);
                            cvFileRef.current?.click();
                          }}
                        >
                          {r.has_cv ? "Replace" : "Upload"}
                        </button>
                      ) : null}
                      {readOnly && !r.has_cv ? "—" : null}
                    </td>
                    <td style={{ padding: "8px 6px" }}>{r.current_stage || "—"}</td>
                    <td style={{ padding: "8px 6px" }}>
                      {r.global_status ? <StatusTag status={r.global_status} /> : "—"}
                    </td>
                    {!readOnly ? (
                      <td style={{ padding: "8px 6px" }}>
                        <button
                          type="button"
                          className="platform-dialog__btn"
                          style={{ fontSize: 10 }}
                          onClick={() => openEditDrawer(r.id)}
                        >
                          Edit
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PlatformSection>

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
        <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>
          Use <strong>Candidate store</strong> to run enterprise search; use <strong>Admin → backfill</strong> from API
          <code style={{ fontSize: 9 }}> POST /candidate-masters/backfill</code> to link legacy rows to masters.
        </p>
      ) : null}
    </div>
  );
}
