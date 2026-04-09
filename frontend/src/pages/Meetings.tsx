import React, { useCallback, useEffect, useMemo, useState } from "react";
import { queries, type MeetingRow, type Project, type MeetingActionItemRow } from "@/lib/api";
import { PageHeader, PlatformSection, StatusTag } from "@/components/platform/PlatformBlocks";
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

type ExtContact = { name: string; designation: string; email: string; phone: string };

const emptyContact = (): ExtContact => ({ name: "", designation: "", email: "", phone: "" });

const emptyAction = (): Omit<MeetingActionItemRow, "id"> => ({
  description: "",
  owner: "",
  due_date: "",
  status: "",
  sort_order: 0,
});

function sortMeetings(rows: MeetingRow[]): MeetingRow[] {
  return [...rows].sort((a, b) => {
    const da = a.meeting_date?.slice(0, 10) ?? "";
    const db = b.meeting_date?.slice(0, 10) ?? "";
    if (da !== db) return db.localeCompare(da);
    return (b.id || 0) - (a.id || 0);
  });
}

export function Meetings() {
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingType, setMeetingType] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [attendeesInternal, setAttendeesInternal] = useState("");
  const [attendeesExternal, setAttendeesExternal] = useState("");
  const [extContacts, setExtContacts] = useState<ExtContact[]>([emptyContact()]);
  const [projectId, setProjectId] = useState<string>("");
  const [accountSnapshot, setAccountSnapshot] = useState("");
  const [agendaItems, setAgendaItems] = useState("");
  const [discussionSummary, setDiscussionSummary] = useState("");
  const [decisionsTaken, setDecisionsTaken] = useState("");
  const [keyDiscussionPoints, setKeyDiscussionPoints] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [nextMeetingDate, setNextMeetingDate] = useState("");
  const [meetingMode, setMeetingMode] = useState("");
  const [meetingStatus, setMeetingStatus] = useState("Scheduled");
  const [momStatus, setMomStatus] = useState("");
  const [momLinkRemarks, setMomLinkRemarks] = useState("");
  const [attachmentsJson, setAttachmentsJson] = useState("");
  const [actions, setActions] = useState<Omit<MeetingActionItemRow, "id">[]>([emptyAction()]);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([queries.meetingsList(), queries.projects()])
      .then(([m, p]) => {
        setRows(m);
        setProjects(p);
      })
      .catch(() => {
        setRows([]);
        setProjects([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const projectById = useMemo(() => {
    const m = new Map<number, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = sortMeetings(rows);
    if (!q) return sorted;
    return sorted.filter((r) => {
      const blob = [
        r.meeting_title,
        r.meeting_type,
        r.account_name_snapshot,
        r.organizer_name,
        r.meeting_status,
        r.mom_status,
        String(r.id),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search]);

  function resetForm() {
    setEditingId(null);
    setMeetingTitle("");
    setMeetingType("");
    setMeetingDate("");
    setStartTime("");
    setEndTime("");
    setOrganizerName("");
    setAttendeesInternal("");
    setAttendeesExternal("");
    setExtContacts([emptyContact()]);
    setProjectId("");
    setAccountSnapshot("");
    setAgendaItems("");
    setDiscussionSummary("");
    setDecisionsTaken("");
    setKeyDiscussionPoints("");
    setFollowUpDate("");
    setNextMeetingDate("");
    setMeetingMode("");
    setMeetingStatus("Scheduled");
    setMomStatus("");
    setMomLinkRemarks("");
    setAttachmentsJson("");
    setActions([emptyAction()]);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(m: MeetingRow) {
    setEditingId(m.id);
    setMeetingTitle(m.meeting_title ?? "");
    setMeetingType(m.meeting_type ?? "");
    setMeetingDate(m.meeting_date?.slice(0, 10) ?? "");
    setStartTime(m.start_time ?? "");
    setEndTime(m.end_time ?? "");
    setOrganizerName(m.organizer_name ?? "");
    setAttendeesInternal(m.attendees_internal ?? "");
    setAttendeesExternal(m.attendees_external ?? "");
    const ej = m.external_attendees_json;
    if (Array.isArray(ej) && ej.length) {
      setExtContacts(
        ej.map((x) => ({
          name: String((x as Record<string, unknown>).name ?? ""),
          designation: String((x as Record<string, unknown>).designation ?? ""),
          email: String((x as Record<string, unknown>).email ?? ""),
          phone: String((x as Record<string, unknown>).phone ?? ""),
        })),
      );
    } else {
      setExtContacts([emptyContact()]);
    }
    setProjectId(m.project_id != null ? String(m.project_id) : "");
    setAccountSnapshot(m.account_name_snapshot ?? "");
    setAgendaItems(m.agenda_items ?? "");
    setDiscussionSummary(m.discussion_summary ?? "");
    setDecisionsTaken(m.decisions_taken ?? "");
    setKeyDiscussionPoints(m.key_discussion_points ?? "");
    setFollowUpDate(m.follow_up_date?.slice(0, 10) ?? "");
    setNextMeetingDate(m.next_meeting_date?.slice(0, 10) ?? "");
    setMeetingMode(m.meeting_mode ?? "");
    setMeetingStatus(m.meeting_status ?? "Scheduled");
    setMomStatus(m.mom_status ?? "");
    setMomLinkRemarks(m.mom_link_remarks ?? "");
    setAttachmentsJson(m.attachments_json ? JSON.stringify(m.attachments_json, null, 2) : "");
    setActions(
      m.action_items?.length
        ? m.action_items.map((a) => ({
            description: a.description ?? "",
            owner: a.owner ?? "",
            due_date: a.due_date?.slice(0, 10) ?? "",
            status: a.status ?? "",
            sort_order: a.sort_order ?? 0,
          }))
        : [emptyAction()],
    );
    setDialogOpen(true);
  }

  function onProjectChange(pid: string) {
    setProjectId(pid);
    const id = parseInt(pid, 10);
    if (!pid || Number.isNaN(id)) {
      return;
    }
    const p = projectById.get(id);
    if (p) {
      const label = (p.account_name || p.engagement_name || "").trim();
      if (label) setAccountSnapshot(label);
    }
  }

  function buildPayload(): Record<string, unknown> {
    const pid = projectId.trim() ? parseInt(projectId, 10) : NaN;
    const extJson = extContacts
      .map((c) => ({
        name: c.name.trim(),
        designation: c.designation.trim(),
        email: c.email.trim(),
        phone: c.phone.trim(),
      }))
      .filter((c) => c.name || c.email || c.phone || c.designation);
    let attachments: unknown = null;
    const aj = attachmentsJson.trim();
    if (aj) {
      try {
        attachments = JSON.parse(aj);
      } catch {
        throw new Error("Attachments must be valid JSON (array or object).");
      }
    }
    const actionPayload = actions
      .map((a, i) => ({
        description: (a.description ?? "").trim() || null,
        owner: (a.owner ?? "").trim() || null,
        due_date: (a.due_date ?? "").trim() || null,
        status: (a.status ?? "").trim() || null,
        sort_order: i,
      }))
      .filter((a) => a.description || a.owner || a.due_date || a.status);

    return {
      meeting_title: meetingTitle.trim() || null,
      meeting_type: meetingType.trim() || null,
      meeting_date: meetingDate.trim() || null,
      start_time: startTime.trim() || null,
      end_time: endTime.trim() || null,
      organizer_name: organizerName.trim() || null,
      attendees_internal: attendeesInternal.trim() || null,
      attendees_external: attendeesExternal.trim() || null,
      external_attendees_json: extJson.length ? extJson : null,
      project_id: !Number.isNaN(pid) ? pid : null,
      account_name_snapshot: accountSnapshot.trim() || null,
      agenda_items: agendaItems.trim() || null,
      discussion_summary: discussionSummary.trim() || null,
      decisions_taken: decisionsTaken.trim() || null,
      key_discussion_points: keyDiscussionPoints.trim() || null,
      follow_up_date: followUpDate.trim() || null,
      next_meeting_date: nextMeetingDate.trim() || null,
      meeting_mode: meetingMode.trim() || null,
      meeting_status: meetingStatus.trim() || null,
      mom_status: momStatus.trim() || null,
      mom_link_remarks: momLinkRemarks.trim() || null,
      attachments_json: attachments,
      action_items: actionPayload,
    };
  }

  async function save() {
    setSaving(true);
    try {
      const body = buildPayload();
      if (editingId != null) {
        const updated = await queries.patchMeeting(editingId, body);
        setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      } else {
        const created = await queries.createMeeting(body);
        setRows((prev) => [created, ...prev]);
      }
      setDialogOpen(false);
      resetForm();
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Save failed";
      alert(msg);
    } finally {
      setSaving(false);
    }
  }

  async function removeMeeting(id: number) {
    if (!window.confirm(`Delete meeting MTG-${id}?`)) return;
    try {
      await queries.deleteMeeting(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Delete failed";
      alert(msg);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <PageHeader
          title="Meeting tracker"
          subtitle="Log governance calls, QBRs, and MoMs — scoped to your projects. Action items are stored per meeting."
        />
        <button
          type="button"
          className="platform-dialog__btn platform-dialog__btn--primary"
          style={{ fontSize: 11, fontFamily: "'DM Mono',monospace" }}
          onClick={() => openCreate()}
        >
          + Log meeting
        </button>
      </div>

      {loading ? (
        <Skeleton height={200} />
      ) : (
        <PlatformSection title="Meetings" action="Refresh" onAction={refresh}>
          <div style={{ marginBottom: 12 }}>
            <input
              className="platform-search"
              placeholder="Search title, type, account, organizer, status, ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 400, width: "100%" }}
            />
          </div>
          <div className="platform-table-wrap" style={{ overflowX: "auto" }}>
            <table className="platform-table" style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Date</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Account / project</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th>Organizer</th>
                  <th>MoM</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
                      No meetings yet. Use “Log meeting”.
                    </td>
                  </tr>
                )}
                {filtered.map((m) => {
                  const pr = m.project_id != null ? projectById.get(m.project_id) : undefined;
                  const prLabel =
                    m.account_name_snapshot ||
                    (pr && (pr.engagement_name || pr.account_name)) ||
                    (m.project_id != null ? `PRJ-${m.project_id}` : "—");
                  return (
                    <tr key={m.id}>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--accent)" }}>{m.id}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{m.meeting_date?.slice(0, 10) ?? "—"}</td>
                      <td style={{ fontWeight: 600, maxWidth: 200 }}>{m.meeting_title ?? "—"}</td>
                      <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.meeting_type ?? "—"}</td>
                      <td style={{ fontSize: 11 }}>{prLabel}</td>
                      <td style={{ fontSize: 10, color: "var(--text-muted)" }}>{m.meeting_mode ?? "—"}</td>
                      <td>
                        <StatusTag status={m.meeting_status || "—"} />
                      </td>
                      <td style={{ fontSize: 11 }}>{m.organizer_name ?? "—"}</td>
                      <td style={{ fontSize: 10, color: "var(--text-muted)" }}>{m.mom_status ?? "—"}</td>
                      <td style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        {m.created_by_email ?? "—"}
                        <div style={{ fontSize: 9, opacity: 0.8 }}>{m.system_created_at?.slice(0, 16) ?? ""}</div>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button type="button" className="platform-dialog__btn" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => openEdit(m)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="platform-dialog__btn"
                          style={{ fontSize: 10, padding: "4px 8px", marginLeft: 6, color: "var(--red)", borderColor: "rgba(255,79,107,0.35)" }}
                          onClick={() => void removeMeeting(m.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PlatformSection>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) resetForm();
          setDialogOpen(o);
        }}
      >
        <DialogContent showCloseButton className={cn("platform-dialog platform-dialog--wide max-h-[92vh] overflow-y-auto")}>
          <DialogHeader className="platform-dialog__header">
            <div className="platform-dialog__eyebrow">{editingId != null ? `Edit · MTG-${editingId}` : "New meeting"}</div>
            <DialogTitle className="platform-dialog__title">{editingId != null ? "Update meeting record" : "Log a meeting"}</DialogTitle>
            <DialogDescription className="platform-dialog__desc">
              Link an optional project for access scoping. External contacts support name, designation, email, and phone. Action items replace the prior list on save.
            </DialogDescription>
          </DialogHeader>
          <div className="platform-dialog__body space-y-4" style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
                <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Meeting title</span>
                <input className="platform-search" value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
                <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Meeting type (QBR, Monthly, …)</span>
                <input className="platform-search" value={meetingType} onChange={(e) => setMeetingType(e.target.value)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
                <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Date</span>
                <input className="platform-search" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
                <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Organizer (name)</span>
                <input className="platform-search" value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
                <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Start time</span>
                <input className="platform-search" placeholder="12:00" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
                <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>End time</span>
                <input className="platform-search" placeholder="12:30" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </label>
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
              <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Project (optional — ties to account scope)</span>
              <select className="platform-search" value={projectId} onChange={(e) => onProjectChange(e.target.value)}>
                <option value="">— None —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    PRJ-{p.id} · {(p.engagement_name || p.account_name || p.filename || "").slice(0, 48)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
              <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Account / customer label (snapshot)</span>
              <input className="platform-search" value={accountSnapshot} onChange={(e) => setAccountSnapshot(e.target.value)} placeholder="e.g. Siemens Healthineers" />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
                <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Meeting mode</span>
                <input className="platform-search" value={meetingMode} onChange={(e) => setMeetingMode(e.target.value)} placeholder="Video / In person" />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
                <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Meeting status</span>
                <select className="platform-search" value={meetingStatus} onChange={(e) => setMeetingStatus(e.target.value)}>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
                <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>MoM status</span>
                <input className="platform-search" value={momStatus} onChange={(e) => setMomStatus(e.target.value)} placeholder="Draft / Shared" />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
                <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Follow-up date</span>
                <input className="platform-search" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
                <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Next meeting date</span>
                <input className="platform-search" type="date" value={nextMeetingDate} onChange={(e) => setNextMeetingDate(e.target.value)} />
              </label>
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
              <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Attendees (internal)</span>
              <textarea className="platform-search" rows={2} value={attendeesInternal} onChange={(e) => setAttendeesInternal(e.target.value)} placeholder="Comma or line separated" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
              <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Attendees (external — free text)</span>
              <textarea className="platform-search" rows={2} value={attendeesExternal} onChange={(e) => setAttendeesExternal(e.target.value)} />
            </label>

            <div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 8 }}>External contacts (structured)</div>
              <div style={{ display: "grid", gap: 8 }}>
                {extContacts.map((c, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 6, alignItems: "end" }}>
                    <input className="platform-search" placeholder="Name" value={c.name} onChange={(e) => setExtContacts((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <input className="platform-search" placeholder="Designation" value={c.designation} onChange={(e) => setExtContacts((prev) => prev.map((x, j) => (j === i ? { ...x, designation: e.target.value } : x)))} />
                    <input className="platform-search" placeholder="Email" value={c.email} onChange={(e) => setExtContacts((prev) => prev.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                    <input className="platform-search" placeholder="Phone" value={c.phone} onChange={(e) => setExtContacts((prev) => prev.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
                    <button
                      type="button"
                      className="platform-dialog__btn"
                      style={{ fontSize: 10, padding: "6px 8px" }}
                      onClick={() => setExtContacts((prev) => prev.filter((_, j) => j !== i || prev.length === 1))}
                    >
                      −
                    </button>
                  </div>
                ))}
                <button type="button" className="platform-dialog__btn" style={{ fontSize: 10 }} onClick={() => setExtContacts((p) => [...p, emptyContact()])}>
                  + Add contact row
                </button>
              </div>
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
              <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Agenda items</span>
              <textarea className="platform-search" rows={2} value={agendaItems} onChange={(e) => setAgendaItems(e.target.value)} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
              <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Discussion summary</span>
              <textarea className="platform-search" rows={2} value={discussionSummary} onChange={(e) => setDiscussionSummary(e.target.value)} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
              <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Key discussion points</span>
              <textarea className="platform-search" rows={2} value={keyDiscussionPoints} onChange={(e) => setKeyDiscussionPoints(e.target.value)} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
              <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Decisions taken</span>
              <textarea className="platform-search" rows={2} value={decisionsTaken} onChange={(e) => setDecisionsTaken(e.target.value)} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
              <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>MoM link / remarks</span>
              <textarea className="platform-search" rows={2} value={momLinkRemarks} onChange={(e) => setMomLinkRemarks(e.target.value)} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
              <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>Attachments (JSON array — optional)</span>
              <textarea
                className="platform-search"
                style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}
                rows={2}
                value={attachmentsJson}
                onChange={(e) => setAttachmentsJson(e.target.value)}
                placeholder='[{"name":"deck","url":"https://..."}]'
              />
            </label>

            <div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 8 }}>Action items</div>
              <div style={{ display: "grid", gap: 8 }}>
                {actions.map((a, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 6, alignItems: "end" }}>
                    <input className="platform-search" placeholder="Description" value={a.description ?? ""} onChange={(e) => setActions((prev) => prev.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                    <input className="platform-search" placeholder="Owner" value={a.owner ?? ""} onChange={(e) => setActions((prev) => prev.map((x, j) => (j === i ? { ...x, owner: e.target.value } : x)))} />
                    <input className="platform-search" type="date" value={a.due_date ?? ""} onChange={(e) => setActions((prev) => prev.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))} />
                    <input className="platform-search" placeholder="Status" value={a.status ?? ""} onChange={(e) => setActions((prev) => prev.map((x, j) => (j === i ? { ...x, status: e.target.value } : x)))} />
                    <button
                      type="button"
                      className="platform-dialog__btn"
                      style={{ fontSize: 10, padding: "6px 8px" }}
                      onClick={() => setActions((prev) => prev.filter((_, j) => j !== i || prev.length === 1))}
                    >
                      −
                    </button>
                  </div>
                ))}
                <button type="button" className="platform-dialog__btn" style={{ fontSize: 10 }} onClick={() => setActions((p) => [...p, emptyAction()])}>
                  + Add action item
                </button>
              </div>
            </div>
          </div>
          <DialogFooter className="platform-dialog__footer">
            <button type="button" className="platform-dialog__btn" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="platform-dialog__btn platform-dialog__btn--primary" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : editingId != null ? "Save changes" : "Create"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
