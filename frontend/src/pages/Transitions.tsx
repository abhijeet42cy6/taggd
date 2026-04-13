import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { queries, type Project, type ProjectTransitionRow } from "@/lib/api";
import { isReadOnlyClient, useAuth } from "@/lib/auth";
import { PageHeader, PlatformSection } from "@/components/platform/PlatformBlocks";
import { Skeleton } from "@/components/platform/Skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const STATUSES = ["draft", "in_progress", "soft_launched", "live", "delayed", "cancelled"] as const;

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return d.length >= 10 ? d.slice(0, 10) : d;
}

export function Transitions() {
  const { user } = useAuth();
  const readOnly = isReadOnlyClient(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const focusPid = searchParams.get("project");

  const [rows, setRows] = useState<ProjectTransitionRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [edit, setEdit] = useState<ProjectTransitionRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [newPid, setNewPid] = useState<string>("");

  const [form, setForm] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setErr(null);
    const [tlist, plist] = await Promise.all([queries.transitionsList(), queries.projects()]);
    setRows(tlist);
    setProjects(plist);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await refresh();
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const existingPids = useMemo(() => new Set(rows.map((r) => r.project_id)), [rows]);

  const projectsWithoutTransition = useMemo(
    () => projects.filter((p) => !existingPids.has(p.id)),
    [projects, existingPids],
  );

  const openEditor = useCallback(
    (row: ProjectTransitionRow) => {
      setEdit(row);
      setForm({
        status: row.status || "draft",
        project_signed_date: row.project_signed_date || "",
        kickoff_date: row.kickoff_date || "",
        as_is_study_date: row.as_is_study_date || "",
        to_be_presentation_date: row.to_be_presentation_date || "",
        soft_launch_date: row.soft_launch_date || "",
        go_live_date: row.go_live_date || "",
        transition_done_by_user_id: row.transition_done_by_user_id != null ? String(row.transition_done_by_user_id) : "",
        attendees_internal: row.attendees_internal || "",
        attendees_external: row.attendees_external || "",
        external_attendees_names: row.external_attendees_names || "",
        external_attendees_contact: row.external_attendees_contact || "",
        external_attendees_email: row.external_attendees_email || "",
        rpo_solution_deck_url: row.rpo_solution_deck_url || "",
        transition_document_url: row.transition_document_url || "",
        dead_days: row.dead_days != null ? String(row.dead_days) : "",
        ageing_days: row.ageing_days != null ? String(row.ageing_days) : "",
        reason_for_delay: row.reason_for_delay || "",
        linked_meeting_ids_json: Array.isArray(row.linked_meeting_ids_json)
          ? row.linked_meeting_ids_json.join(",")
          : "",
      });
      setDialogOpen(true);
    },
    [],
  );

  useEffect(() => {
    if (!focusPid || loading) return;
    const pid = parseInt(focusPid, 10);
    if (Number.isNaN(pid)) return;
    const row = rows.find((r) => r.project_id === pid);
    if (row) {
      openEditor(row);
      setSearchParams({}, { replace: true });
    }
  }, [focusPid, loading, rows, openEditor, setSearchParams]);

  async function onCreate() {
    const pid = parseInt(newPid, 10);
    if (Number.isNaN(pid)) {
      setErr("Pick a project to start a transition tracker.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await queries.createTransition(pid);
      setNewPid("");
      await refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function onSave() {
    if (!edit || readOnly) return;
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        status: form.status || null,
        project_signed_date: form.project_signed_date.trim() || null,
        kickoff_date: form.kickoff_date.trim() || null,
        as_is_study_date: form.as_is_study_date.trim() || null,
        to_be_presentation_date: form.to_be_presentation_date.trim() || null,
        soft_launch_date: form.soft_launch_date.trim() || null,
        go_live_date: form.go_live_date.trim() || null,
        attendees_internal: form.attendees_internal.trim() || null,
        attendees_external: form.attendees_external.trim() || null,
        external_attendees_names: form.external_attendees_names.trim() || null,
        external_attendees_contact: form.external_attendees_contact.trim() || null,
        external_attendees_email: form.external_attendees_email.trim() || null,
        rpo_solution_deck_url: form.rpo_solution_deck_url.trim() || null,
        transition_document_url: form.transition_document_url.trim() || null,
        reason_for_delay: form.reason_for_delay.trim() || null,
      };
      const tid = form.transition_done_by_user_id.trim();
      body.transition_done_by_user_id = tid ? parseInt(tid, 10) : null;
      const dd = form.dead_days.trim();
      body.dead_days = dd ? parseInt(dd, 10) : null;
      const ag = form.ageing_days.trim();
      body.ageing_days = ag ? parseInt(ag, 10) : null;
      const mids = form.linked_meeting_ids_json
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n));
      body.linked_meeting_ids_json = mids.length ? mids : null;
      await queries.patchTransition(edit.project_id, body);
      setDialogOpen(false);
      setEdit(null);
      await refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const lbl = (t: string) => (
    <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{t}</span>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        title="Client onboarding & transitions"
        subtitle="Track kickoff through go-live. Log MoMs under Meetings, then maintain this tracker and links to your transition document. Use Tasks for follow-up actions."
      />

      {readOnly ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>View only — client portal accounts cannot edit this tracker.</div>
      ) : null}
      {err ? <div className="platform-dialog__alert">{err}</div> : null}

      <PlatformSection title="Process checklist">
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 1.7, color: "var(--text-muted)" }}>
          <li>
            Assign / confirm <strong>project head</strong> on the project directory.
          </li>
          <li>
            Record kickoff and workshop meetings in{" "}
            <Link to="/meetings" style={{ color: "var(--accent)" }}>
              Meetings (MoM)
            </Link>
            — use meeting types such as <em>transition_kickoff</em> for filtering.
          </li>
          <li>
            Create a <strong>transition tracker</strong> row per project below; add document URLs and milestone dates.
          </li>
          <li>
            Run day-to-day follow-ups in{" "}
            <Link to="/tasks" style={{ color: "var(--accent)" }}>
              Tasks
            </Link>
            .
          </li>
        </ol>
      </PlatformSection>

      <PlatformSection title="Start tracker for a project">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220 }}>
            {lbl("Project (no tracker yet)")}
            <select
              className="platform-search"
              value={newPid}
              onChange={(e) => setNewPid(e.target.value)}
              disabled={readOnly || saving}
            >
              <option value="">— Select —</option>
              {projectsWithoutTransition.map((p) => (
                <option key={p.id} value={p.id}>
                  PRJ-{p.id} · {(p.engagement_name || p.account_name || "").slice(0, 48)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="platform-dialog__btn platform-dialog__btn--primary"
            disabled={readOnly || saving || !newPid}
            onClick={() => void onCreate()}
          >
            Create tracker
          </button>
        </div>
      </PlatformSection>

      <PlatformSection title="Transition pipeline" action="Refresh" onAction={() => void refresh()}>
        {loading ? (
          <Skeleton height={200} />
        ) : (
          <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--border)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 960 }}>
              <thead>
                <tr style={{ textAlign: "left", background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>
                  <th style={{ padding: "8px 10px" }}>Project</th>
                  <th style={{ padding: "8px 10px" }}>Status</th>
                  <th style={{ padding: "8px 10px" }}>Signed</th>
                  <th style={{ padding: "8px 10px" }}>Kickoff</th>
                  <th style={{ padding: "8px 10px" }}>Go live</th>
                  <th style={{ padding: "8px 10px" }}>Dead days*</th>
                  <th style={{ padding: "8px 10px" }}>Ageing*</th>
                  <th style={{ padding: "8px 10px" }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 600 }}>
                      {r.account_name || `PRJ-${r.project_id}`}
                      {r.engagement_name ? (
                        <div style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 10 }}>{r.engagement_name}</div>
                      ) : null}
                    </td>
                    <td style={{ padding: "8px 10px" }}>{r.status || "—"}</td>
                    <td style={{ padding: "8px 10px" }}>{fmt(r.project_signed_date)}</td>
                    <td style={{ padding: "8px 10px" }}>{fmt(r.kickoff_date)}</td>
                    <td style={{ padding: "8px 10px" }}>{fmt(r.go_live_date)}</td>
                    <td style={{ padding: "8px 10px" }}>{r.dead_days_effective ?? "—"}</td>
                    <td style={{ padding: "8px 10px" }}>{r.ageing_days_effective ?? "—"}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <button type="button" className="platform-dialog__btn" onClick={() => openEditor(r)}>
                        {readOnly ? "View" : "Edit"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "8px 10px" }}>
              *Effective values use dates when manual dead days / ageing are empty.
            </div>
          </div>
        )}
      </PlatformSection>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent showCloseButton className={cn("platform-dialog platform-dialog--wide max-h-[90vh] overflow-y-auto")}>
          <DialogHeader className="platform-dialog__header">
            <DialogTitle className="platform-dialog__title">
              Transition · PRJ-{edit?.project_id} {edit?.account_name ? `· ${edit.account_name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="platform-dialog__body" style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {lbl("Status")}
              <select
                className="platform-search"
                disabled={readOnly}
                value={form.status || "draft"}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["project_signed_date", "Project signed date"],
                ["kickoff_date", "Kickoff date"],
                ["as_is_study_date", "As-is study date"],
                ["to_be_presentation_date", "To-be presentation / closure call"],
                ["soft_launch_date", "Soft launch"],
                ["go_live_date", "Go live date"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {lbl(label)}
                <input
                  type="date"
                  className="platform-search"
                  disabled={readOnly}
                  value={form[k] || ""}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                />
              </label>
            ))}
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {lbl("Transition done by (user id)")}
              <input
                className="platform-search"
                disabled={readOnly}
                value={form.transition_done_by_user_id || ""}
                onChange={(e) => setForm((f) => ({ ...f, transition_done_by_user_id: e.target.value }))}
              />
            </label>
            {(
              [
                ["attendees_internal", "Attendees internal"],
                ["attendees_external", "Attendees external"],
                ["external_attendees_names", "External attendee names"],
                ["external_attendees_contact", "External contact details"],
                ["external_attendees_email", "External email IDs"],
                ["rpo_solution_deck_url", "RPO solution deck (URL)"],
                ["transition_document_url", "Transition document (URL)"],
                ["reason_for_delay", "Reason for delay"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {lbl(label)}
                <textarea
                  className="platform-search"
                  rows={k.includes("url") ? 2 : 3}
                  disabled={readOnly}
                  value={form[k] || ""}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                />
              </label>
            ))}
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {lbl("Dead days (override; leave empty for auto from signed → go-live)")}
              <input
                className="platform-search"
                disabled={readOnly}
                value={form.dead_days || ""}
                onChange={(e) => setForm((f) => ({ ...f, dead_days: e.target.value }))}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {lbl("Ageing days (override; leave empty for auto)")}
              <input
                className="platform-search"
                disabled={readOnly}
                value={form.ageing_days || ""}
                onChange={(e) => setForm((f) => ({ ...f, ageing_days: e.target.value }))}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {lbl("Linked MoM meeting IDs (comma-separated)")}
              <input
                className="platform-search"
                disabled={readOnly}
                value={form.linked_meeting_ids_json || ""}
                onChange={(e) => setForm((f) => ({ ...f, linked_meeting_ids_json: e.target.value }))}
              />
            </label>
          </div>
          <DialogFooter className="platform-dialog__footer">
            <button type="button" className="platform-dialog__btn" onClick={() => setDialogOpen(false)}>
              Close
            </button>
            {!readOnly ? (
              <button
                type="button"
                className="platform-dialog__btn platform-dialog__btn--primary"
                disabled={saving}
                onClick={() => void onSave()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
