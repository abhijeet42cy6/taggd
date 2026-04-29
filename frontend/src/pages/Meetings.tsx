import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  queries,
  adminApi,
  type MeetingRow,
  type Project,
  type MeetingActionItemRow,
  type ComposioStatusResponse,
  type ComposioOutlookSyncResponse,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader, PlatformSection, StatusTag } from "@/components/platform/PlatformBlocks";
import { Skeleton } from "@/components/platform/Skeleton";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  UserPickerDropdown,
  type PlatformUserLite,
} from "@/components/platform/NewContractOrgFlow";
import "@/styles/new-contract-panel.css";

// ─── Domain constants ─────────────────────────────────────────────────────────

const MEETING_TYPES = [
  "QBR",
  "Monthly Review",
  "Weekly Sync",
  "Kick-off",
  "Governance Call",
  "Steering Committee",
  "Ad-hoc",
  "Other",
];
const MEETING_MODES = ["Video", "In-person", "Hybrid", "Phone"];
const MEETING_STATUSES = ["Scheduled", "Completed", "Cancelled"];
const MOM_STATUSES = ["Draft", "Shared", "Approved"];
const ACTION_STATUSES = ["Open", "In Progress", "Done", "Cancelled"];

const MTG_TABS = [
  { icon: "🗓", label: "Overview" },
  { icon: "👥", label: "Attendees" },
  { icon: "💬", label: "Discussion" },
  { icon: "✅", label: "Actions" },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

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

function isPastMeeting(row: MeetingRow): boolean {
  const d = row.meeting_date?.slice(0, 10) ?? "";
  if (!d) return false;
  const t = (row.end_time || row.start_time || "23:59").slice(0, 5);
  const dt = new Date(`${d}T${t}:00`);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.getTime() < Date.now();
}

function meetingTimeLabel(row: MeetingRow): string {
  const s = (row.start_time || "").slice(0, 5);
  const e = (row.end_time || "").slice(0, 5);
  if (s && e) return `${s} - ${e}`;
  return s || e || "—";
}

// ─── MultiUserPicker ──────────────────────────────────────────────────────────

function MultiUserPicker({
  selectedIds,
  onChange,
  users,
  disabled = false,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  users: PlatformUserLite[];
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [ddRect, setDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open) { setDdRect(null); return; }
    const measure = () => {
      const b = btnRef.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      setDdRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (btnRef.current) ro.observe(btnRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || portalRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? users.filter((u) => u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q))
      : users;
  }, [users, search]);

  const selected = users.filter((u) => selectedIds.includes(String(u.id)));

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  function userColor(email: string) {
    const colors = ["#6366f1","#e16f3d","#14b8a6","#f59e0b","#3884ff","#2ecc71","#ec4899"];
    let h = 0; for (const c of email) h = (h * 31 + c.charCodeAt(0)) & 0xfffffff;
    return colors[Math.abs(h) % colors.length];
  }
  function initials(email: string) {
    const [a = "", b = ""] = email.split("@")[0].split(/[._-]/);
    return (a[0] + (b[0] || a[1] || "")).toUpperCase() || "?";
  }

  const panel = (
    <div
      className="ncp-user-dd ncp-open ncp-user-dd--portal"
      onClick={(e) => e.stopPropagation()}
      style={{ maxHeight: 320, display: "flex", flexDirection: "column" }}
    >
      <div className="ncp-project-search">
        <span style={{ opacity: 0.5 }}>🔍</span>
        <input
          type="search"
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>
      <div
        className="ncp-dd-scroll"
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {filtered.map((u) => {
          const checked = selectedIds.includes(String(u.id));
          return (
            <button
              key={u.id}
              type="button"
              className="ncp-project-opt"
              onClick={() => toggle(String(u.id))}
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <span className="ncp-user-ico" style={{ background: userColor(u.email) }}>
                {initials(u.email)}
              </span>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontWeight: 500, color: "var(--ncp-text-primary)" }}>{u.email}</div>
                <div style={{ fontSize: 11, color: "var(--ncp-text-muted)", fontFamily: "var(--ncp-mono)" }}>{u.role}</div>
              </div>
              {checked && <span style={{ color: "var(--ncp-accent)", fontSize: 14, fontWeight: 700 }}>✓</span>}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ncp-text-muted)" }}>No users match "{search}"</div>
        )}
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} style={{ flex: 1, minWidth: 0 }}>
      {/* Chips + trigger */}
      <div
        ref={btnRef}
        className="ncp-multi-user-btn"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((o) => !o);
        }}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          padding: "8px 12px",
          border: "1px solid var(--ncp-border)",
          borderRadius: "var(--ncp-radius-lg)",
          background: "var(--ncp-surface-hover)",
          cursor: disabled ? "default" : "pointer",
          minHeight: 40,
          alignItems: "center",
        }}
      >
        {selected.length === 0 && (
          <span style={{ fontSize: 13, color: "var(--ncp-text-muted)" }}>👤 — None selected —</span>
        )}
        {selected.map((u) => (
          <span
            key={u.id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "var(--ncp-accent-soft)",
              border: "1px solid var(--ncp-accent-mid)",
              borderRadius: 100,
              padding: "2px 8px 2px 4px",
              fontSize: 12,
              fontFamily: "var(--ncp-font)",
              color: "var(--ncp-text-primary)",
            }}
          >
            <span
              style={{
                width: 18, height: 18, borderRadius: "50%", display: "inline-flex",
                alignItems: "center", justifyContent: "center",
                background: userColor(u.email), color: "#fff",
                fontSize: 9, fontWeight: 700, fontFamily: "var(--ncp-mono)",
              }}
            >
              {initials(u.email)}
            </span>
            {u.email.split("@")[0]}
            {!disabled ? (
              <span
                style={{ cursor: "pointer", opacity: 0.5, fontSize: 14, lineHeight: 1 }}
                onClick={(e) => { e.stopPropagation(); toggle(String(u.id)); }}
              >
                ×
              </span>
            ) : null}
          </span>
        ))}
        {!disabled ? <span style={{ marginLeft: "auto", color: "var(--ncp-text-muted)", fontSize: 12 }}>▾</span> : null}
      </div>
      {!disabled && open && ddRect && createPortal(
        <div
          ref={portalRef}
          className="new-contract-sheet"
          style={{ position: "fixed", top: ddRect.top, left: ddRect.left, width: ddRect.width, zIndex: 200, pointerEvents: "auto", minHeight: 0, height: "auto", display: "block", background: "transparent" }}
        >
          {panel}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Agenda tag taxonomy ──────────────────────────────────────────────────────

const AGENDA_TAXONOMY: Record<string, string[]> = {
  "Pipeline & Delivery": [
    "Hiring pipeline review",
    "Open requisitions update",
    "Joiner / offer status",
    "Backfill & attrition review",
    "Recruiter productivity",
    "Campus delivery review",
  ],
  "SLA & Performance": [
    "SLA scorecard review",
    "TAT & quality metrics",
    "Candidate conversion rates",
    "ER / IJP performance",
    "Sourcing mix analysis",
    "Quality of hire review",
  ],
  "Commercial & Finance": [
    "Revenue & billing review",
    "Invoice & payment status",
    "MMF / fee discussion",
    "Contract renewal",
    "Commercial terms update",
    "Budget vs actuals",
  ],
  "Account Governance": [
    "Client feedback",
    "Escalation & risk",
    "Relationship health check",
    "Stakeholder alignment",
    "Account expansion",
    "Satisfaction review",
  ],
  "Planning & Strategy": [
    "Quarterly planning",
    "Annual target setting",
    "New mandate discussion",
    "Process improvement",
    "Technology & systems",
    "Team structure / capacity",
  ],
  "Compliance & Actions": [
    "Action item review",
    "MoM sign-off",
    "Audit / compliance",
    "Onboarding / transitions",
    "SOP review",
    "Data quality review",
  ],
};

const ALL_AGENDA_TAGS = Object.values(AGENDA_TAXONOMY).flat();

/** CSS class colour variant per category (matches ncp-agenda-cat.cat-* in stylesheet) */
const CATEGORY_COLOR_CLASS: Record<string, string> = {
  "Pipeline & Delivery":  "cat-accent",
  "SLA & Performance":    "cat-blue",
  "Commercial & Finance": "cat-green",
  "Account Governance":   "cat-amber",
  "Planning & Strategy":  "cat-indigo",
  "Compliance & Actions": "cat-teal",
};

/** Selected chip colour class (matches ncp-agenda-tag.sel-* in stylesheet) */
const CATEGORY_SEL_CLASS: Record<string, string> = {
  "Pipeline & Delivery":  "sel-accent",
  "SLA & Performance":    "sel-blue",
  "Commercial & Finance": "sel-green",
  "Account Governance":   "sel-amber",
  "Planning & Strategy":  "sel-indigo",
  "Compliance & Actions": "sel-teal",
};

function parseAgenda(raw: string): { selected: string[]; custom: string } {
  if (!raw.trim()) return { selected: [], custom: "" };
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const selected: string[] = [];
  const custom: string[] = [];
  for (const p of parts) {
    if (ALL_AGENDA_TAGS.includes(p)) selected.push(p);
    else custom.push(p);
  }
  return { selected, custom: custom.join(", ") };
}

function serializeAgenda(selected: string[], custom: string): string {
  const extra = custom.split(",").map((s) => s.trim()).filter((s) => s && !ALL_AGENDA_TAGS.includes(s));
  return [...selected, ...extra].join(", ");
}

// ─── AgendaTagPicker ──────────────────────────────────────────────────────────

function AgendaTagPicker({
  value,
  onChange,
  readOnly = false,
}: {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  const { selected: initSel, custom: initCustom } = useMemo(() => parseAgenda(value), []);

  const [selected, setSelected] = useState<string[]>(initSel);
  const [custom, setCustom] = useState(initCustom);
  const [activeCategory, setActiveCategory] = useState<string>(Object.keys(AGENDA_TAXONOMY)[0]);

  useEffect(() => {
    if (readOnly) return;
    onChange(serializeAgenda(selected, custom));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, selected, custom]);

  if (readOnly) {
    return (
      <div
        className="ncp-prop-input"
        style={{
          minHeight: 72,
          padding: "10px 12px",
          fontSize: 12,
          lineHeight: 1.5,
          color: "var(--ncp-text-primary)",
          whiteSpace: "pre-wrap",
          background: "var(--ncp-surface)",
          borderRadius: "var(--ncp-radius)",
        }}
      >
        {value.trim() ? value : "—"}
      </div>
    );
  }

  function toggle(tag: string) {
    setSelected((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  const categories = Object.keys(AGENDA_TAXONOMY);
  const tags = AGENDA_TAXONOMY[activeCategory] ?? [];

  return (
    <div className="ncp-agenda-wrap">

      {/* ── Category tab strip ─────────────────────── */}
      <div className="ncp-agenda-cats">
        {categories.map((cat) => {
          const count = (AGENDA_TAXONOMY[cat] ?? []).filter((t) => selected.includes(t)).length;
          const isActive = cat === activeCategory;
          const colorCls = CATEGORY_COLOR_CLASS[cat] ?? "cat-accent";
          return (
            <button
              key={cat}
              type="button"
              className={cn("ncp-agenda-cat", colorCls, isActive && "cat-on")}
              onClick={() => setActiveCategory(cat)}
            >
              {count > 0 && <span className="ncp-agenda-cat-dot" />}
              {cat}
              {count > 0 && (
                <span className="ncp-agenda-cat-count">
                  <span>{count}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tag chip grid for active category ──────── */}
      <div className="ncp-agenda-tags">
        {tags.map((tag) => {
          const on = selected.includes(tag);
          const selCls = CATEGORY_SEL_CLASS[activeCategory] ?? "sel-accent";
          return (
            <button
              key={tag}
              type="button"
              className={cn("ncp-agenda-tag", on && selCls)}
              onClick={() => toggle(tag)}
            >
              {on && <span className="ncp-agenda-tag-dot" />}
              {tag}
            </button>
          );
        })}
      </div>

      {/* ── Selected summary (shown only when ≥1 selected) ── */}
      {selected.length > 0 && (
        <div className="ncp-agenda-summary">
          <span className="ncp-agenda-summary-label">{selected.length} selected</span>
          {selected.map((t) => {
            const cat = Object.entries(AGENDA_TAXONOMY).find(([, ts]) => ts.includes(t))?.[0];
            const selCls = cat ? (CATEGORY_SEL_CLASS[cat] ?? "sel-accent") : "sel-accent";
            return (
              <span key={t} className={cn("ncp-agenda-sel-chip", selCls)}>
                {t}
                <button
                  type="button"
                  className="ncp-agenda-dismiss"
                  onClick={(e) => { e.stopPropagation(); toggle(t); }}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* ── Custom / ad-hoc items ───────────────────── */}
      <div className="ncp-prop-row" style={{ borderTop: "none" }}>
        <div className="ncp-prop-label">Custom topics</div>
        <input
          className="ncp-prop-input"
          placeholder="Any other agenda item, comma-separated…"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
      </div>
    </div>
  );
}



function MeetingFormNCP({
  // overview
  meetingTitle, setMeetingTitle,
  meetingType, setMeetingType,
  meetingDate, setMeetingDate,
  startTime, setStartTime,
  endTime, setEndTime,
  meetingMode, setMeetingMode,
  meetingStatus, setMeetingStatus,
  followUpDate, setFollowUpDate,
  nextMeetingDate, setNextMeetingDate,
  // project
  projectId,
  projects,
  onProjectChange,
  accountSnapshot, setAccountSnapshot,
  // attendees
  organizerUserId, setOrganizerUserId,
  setOrganizerName,
  internalIds, setInternalIds,
  attendeesExternal, setAttendeesExternal,
  extContacts, setExtContacts,
  // discussion
  agendaItems, setAgendaItems,
  keyDiscussionPoints, setKeyDiscussionPoints,
  discussionSummary, setDiscussionSummary,
  decisionsTaken, setDecisionsTaken,
  momStatus, setMomStatus,
  momLinkRemarks, setMomLinkRemarks,
  // actions
  actions, setActions,
  // meta
  platformUsers,
  tab, setTab,
  readOnly = false,
}: {
  meetingTitle: string; setMeetingTitle: (v: string) => void;
  meetingType: string; setMeetingType: (v: string) => void;
  meetingDate: string; setMeetingDate: (v: string) => void;
  startTime: string; setStartTime: (v: string) => void;
  endTime: string; setEndTime: (v: string) => void;
  meetingMode: string; setMeetingMode: (v: string) => void;
  meetingStatus: string; setMeetingStatus: (v: string) => void;
  followUpDate: string; setFollowUpDate: (v: string) => void;
  nextMeetingDate: string; setNextMeetingDate: (v: string) => void;
  projectId: string;
  projects: Project[];
  onProjectChange: (pid: string) => void;
  accountSnapshot: string; setAccountSnapshot: (v: string) => void;
  organizerUserId: string; setOrganizerUserId: (v: string) => void;
  setOrganizerName: (v: string) => void;
  internalIds: string[]; setInternalIds: (ids: string[]) => void;
  attendeesExternal: string; setAttendeesExternal: (v: string) => void;
  extContacts: ExtContact[]; setExtContacts: React.Dispatch<React.SetStateAction<ExtContact[]>>;
  agendaItems: string; setAgendaItems: (v: string) => void;
  keyDiscussionPoints: string; setKeyDiscussionPoints: (v: string) => void;
  discussionSummary: string; setDiscussionSummary: (v: string) => void;
  decisionsTaken: string; setDecisionsTaken: (v: string) => void;
  momStatus: string; setMomStatus: (v: string) => void;
  momLinkRemarks: string; setMomLinkRemarks: (v: string) => void;
  actions: Omit<MeetingActionItemRow, "id">[];
  setActions: React.Dispatch<React.SetStateAction<Omit<MeetingActionItemRow, "id">[]>>;
  platformUsers: PlatformUserLite[];
  tab: number; setTab: (n: number) => void;
  readOnly?: boolean;
}) {
  // Project picker portal
  const [projDdOpen, setProjDdOpen] = useState(false);
  const [projSearch, setProjSearch] = useState("");
  const [projDdRect, setProjDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const projWrapRef = useRef<HTMLDivElement>(null);
  const projBtnRef = useRef<HTMLButtonElement>(null);
  const projPortalRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!projDdOpen) { setProjDdRect(null); return; }
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
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
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

  useEffect(() => {
    if (readOnly) setProjDdOpen(false);
  }, [readOnly]);

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

  // helpers
  const pr = (label: string, value: string, onChange: (v: string) => void, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="ncp-prop-row">
      <div className="ncp-prop-label">{label}</div>
      <input
        className="ncp-prop-input"
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        {...extra}
      />
    </div>
  );

  const dd = (label: string, value: string, onChange: (v: string) => void, opts: string[], allowEmpty = true) => (
    <div className="ncp-prop-row">
      <div className="ncp-prop-label">{label}</div>
      <select className="ncp-prop-input" value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value)}>
        {allowEmpty && <option value="">— Choose —</option>}
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  const ta = (label: string, value: string, onChange: (v: string) => void, rows = 3, placeholder = "") => (
    <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
      <div className="ncp-prop-label" style={{ paddingTop: 10 }}>{label}</div>
      <textarea
        className="ncp-prop-input"
        rows={rows}
        placeholder={placeholder}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        style={{ resize: readOnly ? "none" : "vertical" }}
      />
    </div>
  );

  const section = (icon: React.ReactNode, colorCls: string, label: string, desc: string, body: React.ReactNode) => (
    <div className="ncp-section" style={{ marginBottom: 12 }}>
      <div className="ncp-section-header" style={{ cursor: "default" }}>
        <div className={cn("ncp-section-icon", colorCls)}>{icon}</div>
        <div>
          <div className="ncp-section-label">{label}</div>
          <div className="ncp-section-desc">{desc}</div>
        </div>
      </div>
      <div className="ncp-section-body" style={{ maxHeight: 600 }}>{body}</div>
    </div>
  );

  return (
    <>
      {/* ── Tabs ──────────────────────────────────────────── */}
      <div className="ncp-steps" role="tablist" style={{ marginBottom: 18 }}>
        {MTG_TABS.map(({ icon, label }, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={tab === i}
            className={cn("ncp-step", tab === i && "ncp-active")}
            onClick={() => setTab(i)}
          >
            <span className="ncp-step-num" style={{ fontSize: 14, background: tab === i ? "rgba(255,255,255,0.22)" : "var(--ncp-border)" }}>
              {i < tab ? "✓" : icon}
            </span>
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab 0: Overview ───────────────────────────────── */}
      <div className={cn("ncp-panel", tab === 0 && "ncp-panel-active")}>
        {section("🗓", "ncp-orange", "Meeting details", "Title, type and linked project",
          <>
            {pr("Title", meetingTitle, setMeetingTitle, { placeholder: "e.g. Q2 QBR — Siemens" })}
            {dd("Type", meetingType, setMeetingType, MEETING_TYPES)}
            {/* Project picker */}
            <div ref={projWrapRef} className="ncp-prop-row" style={{ alignItems: "center" }}>
              <div className="ncp-prop-label">Project</div>
              <div style={{ flex: 1, position: "relative" }}>
                <button
                  ref={projBtnRef}
                  type="button"
                  className={cn("ncp-project-btn", selectedProject && "ncp-selected")}
                  style={{ padding: "8px 12px", height: 36 }}
                  disabled={readOnly}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!readOnly) setProjDdOpen((o) => !o);
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
                {projDdOpen && projDdRect && createPortal(
                  <div
                    ref={projPortalRef}
                    className="new-contract-sheet"
                    style={{ position: "fixed", top: projDdRect.top, left: projDdRect.left, width: projDdRect.width, zIndex: 200, pointerEvents: "auto", minHeight: 0, height: "auto", display: "block", background: "transparent" }}
                  >
                    <div className="ncp-project-dd ncp-open ncp-project-dd--portal" onClick={(e) => e.stopPropagation()}>
                      <div className="ncp-project-search">
                        <span style={{ opacity: 0.5 }}>🔍</span>
                        <input type="search" placeholder="Search projects…" value={projSearch} onChange={(e) => setProjSearch(e.target.value)} autoFocus />
                      </div>
                      <div className="ncp-dd-scroll" onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
                        <button type="button" className="ncp-project-opt" onClick={() => { onProjectChange(""); setProjDdOpen(false); setProjSearch(""); }}>
                          <span style={{ fontSize: 11, color: "var(--ncp-text-muted)" }}>— None —</span>
                        </button>
                        {filteredProjects.map((p) => (
                          <button key={p.id} type="button"
                            className={cn("ncp-project-opt", projectId === String(p.id) && "ncp-selected")}
                            onClick={() => { onProjectChange(String(p.id)); setProjDdOpen(false); setProjSearch(""); }}
                          >
                            <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 11, color: "var(--ncp-accent)", minWidth: 52 }}>PRJ-{p.id}</span>
                            <span>{p.account_name || p.engagement_name || p.filename || `Project ${p.id}`}</span>
                          </button>
                        ))}
                        {filteredProjects.length === 0 && <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ncp-text-muted)" }}>No projects match "{projSearch}"</div>}
                      </div>
                    </div>
                  </div>,
                  document.body,
                )}
              </div>
            </div>
            {pr("Account (snapshot)", accountSnapshot, setAccountSnapshot, { placeholder: "e.g. Siemens Healthineers" })}
          </>
        )}
        {section("🕐", "ncp-blue", "Schedule", "When and how",
          <>
            <div className="ncp-date-grid" style={{ borderTop: "none" }}>
              <div className="ncp-date-cell">
                <label>Meeting date</label>
                <input type="date" value={meetingDate} readOnly={readOnly} onChange={(e) => setMeetingDate(e.target.value)} />
              </div>
              <div className="ncp-date-cell">
                <label>Follow-up date</label>
                <input type="date" value={followUpDate} readOnly={readOnly} onChange={(e) => setFollowUpDate(e.target.value)} />
              </div>
            </div>
            <div className="ncp-date-grid">
              <div className="ncp-date-cell">
                <label>Start time</label>
                <input type="time" value={startTime} readOnly={readOnly} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="ncp-date-cell">
                <label>End time</label>
                <input type="time" value={endTime} readOnly={readOnly} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="ncp-date-grid">
              <div className="ncp-date-cell" style={{ gridColumn: "1 / -1" }}>
                <label>Next meeting date</label>
                <input type="date" value={nextMeetingDate} readOnly={readOnly} onChange={(e) => setNextMeetingDate(e.target.value)} />
              </div>
            </div>
            {dd("Mode", meetingMode, setMeetingMode, MEETING_MODES)}
            {dd("Status", meetingStatus, setMeetingStatus, MEETING_STATUSES, false)}
          </>
        )}
      </div>

      {/* ── Tab 1: Attendees ──────────────────────────────── */}
      <div className={cn("ncp-panel", tab === 1 && "ncp-panel-active")}>
        {section("👤", "ncp-orange", "Organizer", "Meeting host / caller",
          <div className="ncp-prop-row">
            <div className="ncp-prop-label">Organizer</div>
            <div style={{ flex: 1 }}>
              <UserPickerDropdown
                value={organizerUserId}
                onChange={(v) => {
                  setOrganizerUserId(v);
                  const u = platformUsers.find((x) => String(x.id) === v);
                  setOrganizerName(u ? u.email : "");
                }}
                users={platformUsers}
                placeholder="— Select organizer —"
                disabled={readOnly}
              />
            </div>
          </div>
        )}
        {section("👥", "ncp-blue", "Internal attendees", "Platform users present in this meeting",
          <div className="ncp-prop-row" style={{ alignItems: "flex-start", paddingTop: 8 }}>
            <div className="ncp-prop-label" style={{ paddingTop: 6 }}>Attendees</div>
            <MultiUserPicker
              selectedIds={internalIds}
              onChange={setInternalIds}
              users={platformUsers}
              disabled={readOnly}
            />
          </div>
        )}
        {section("🌐", "ncp-amber", "External attendees", "Contacts from the client / partner side",
          <>
            {extContacts.map((c, i) => (
              <div key={i} style={{ borderTop: i === 0 ? "none" : "1px solid var(--ncp-border)" }}>
                <div style={{ display: "flex", alignItems: "center", padding: "8px 0 4px", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--ncp-accent)", fontFamily: "var(--ncp-mono)", minWidth: 20 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ncp-text-secondary)", flex: 1 }}>
                    {c.name || c.email || "Contact"}
                  </span>
                  {!readOnly ? (
                    <button
                      type="button"
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--ncp-text-muted)", padding: "0 4px" }}
                      onClick={() => setExtContacts((prev) => prev.length === 1 ? [emptyContact()] : prev.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                {[
                  { label: "Name", key: "name" as const, placeholder: "Full name" },
                  { label: "Designation", key: "designation" as const, placeholder: "e.g. VP HR" },
                  { label: "Email", key: "email" as const, placeholder: "work@company.com" },
                  { label: "Phone", key: "phone" as const, placeholder: "+91 …" },
                ].map(({ label, key, placeholder }) => (
                  <div key={key} className="ncp-prop-row">
                    <div className="ncp-prop-label" style={{ paddingLeft: 28 }}>{label}</div>
                    <input
                      className="ncp-prop-input"
                      placeholder={placeholder}
                      value={c[key]}
                      readOnly={readOnly}
                      onChange={(e) => setExtContacts((prev) => prev.map((x, j) => j === i ? { ...x, [key]: e.target.value } : x))}
                    />
                  </div>
                ))}
              </div>
            ))}
            {!readOnly ? (
              <button
                type="button"
                className="ncp-btn ncp-btn-ghost"
                style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
                onClick={() => setExtContacts((p) => [...p, emptyContact()])}
              >
                + Add external contact
              </button>
            ) : null}
          </>
        )}
      </div>

      {/* ── Tab 2: Discussion ─────────────────────────────── */}
      <div className={cn("ncp-panel", tab === 2 && "ncp-panel-active")}>
        {section("📋", "ncp-blue", "Content", "Agenda, discussion and decisions",
          <>
            <div className="ncp-section-body" style={{ borderTop: "none", padding: "12px 14px" }}>
              <AgendaTagPicker value={agendaItems} onChange={setAgendaItems} readOnly={readOnly} />
            </div>
            {ta("Key points", keyDiscussionPoints, setKeyDiscussionPoints, 3, "Bullet points from the conversation…")}
            {ta("Summary", discussionSummary, setDiscussionSummary, 3, "Overall narrative summary…")}
            {ta("Decisions", decisionsTaken, setDecisionsTaken, 3, "Decisions made / agreed upon…")}
          </>
        )}
        {section("📄", "ncp-amber", "Minutes of Meeting", "MoM status and record link",
          <>
            {dd("MoM status", momStatus, setMomStatus, MOM_STATUSES)}
            {pr("MoM link / remarks", momLinkRemarks, setMomLinkRemarks, { placeholder: "Paste link or note…" })}
          </>
        )}
      </div>

      {/* ── Tab 3: Actions ────────────────────────────────── */}
      <div className={cn("ncp-panel", tab === 3 && "ncp-panel-active")}>
        {section("✅", "ncp-green", "Action items", "Tasks and owners from this meeting",
          <>
            {actions.map((a, i) => (
              <div key={i} style={{ borderTop: i === 0 ? "none" : "1px solid var(--ncp-border)", paddingTop: i === 0 ? 0 : 6 }}>
                <div style={{ display: "flex", alignItems: "center", padding: "6px 0 2px", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--ncp-accent)", fontFamily: "var(--ncp-mono)", minWidth: 20 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ncp-text-secondary)", flex: 1 }}>
                    {a.description || "Action item"}
                  </span>
                  {!readOnly ? (
                    <button
                      type="button"
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--ncp-text-muted)", padding: "0 4px" }}
                      onClick={() => setActions((prev) => prev.length === 1 ? [emptyAction()] : prev.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                <div className="ncp-prop-row">
                  <div className="ncp-prop-label" style={{ paddingLeft: 28 }}>Description</div>
                  <input
                    className="ncp-prop-input"
                    placeholder="What needs to be done…"
                    value={a.description ?? ""}
                    readOnly={readOnly}
                    onChange={(e) => setActions((prev) => prev.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                  />
                </div>
                <div className="ncp-prop-row">
                  <div className="ncp-prop-label" style={{ paddingLeft: 28 }}>Owner</div>
                  <input
                    className="ncp-prop-input"
                    placeholder="Name or email…"
                    value={a.owner ?? ""}
                    readOnly={readOnly}
                    onChange={(e) => setActions((prev) => prev.map((x, j) => j === i ? { ...x, owner: e.target.value } : x))}
                  />
                </div>
                <div className="ncp-prop-row">
                  <div className="ncp-prop-label" style={{ paddingLeft: 28 }}>Due date</div>
                  <input
                    type="date"
                    className="ncp-prop-input"
                    value={a.due_date ?? ""}
                    readOnly={readOnly}
                    onChange={(e) => setActions((prev) => prev.map((x, j) => j === i ? { ...x, due_date: e.target.value } : x))}
                  />
                </div>
                <div className="ncp-prop-row">
                  <div className="ncp-prop-label" style={{ paddingLeft: 28 }}>Status</div>
                  <select
                    className="ncp-prop-input"
                    value={a.status ?? ""}
                    disabled={readOnly}
                    onChange={(e) => setActions((prev) => prev.map((x, j) => j === i ? { ...x, status: e.target.value } : x))}
                  >
                    <option value="">— Choose —</option>
                    {ACTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            ))}
            {!readOnly ? (
              <button
                type="button"
                className="ncp-btn ncp-btn-ghost"
                style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
                onClick={() => setActions((p) => [...p, emptyAction()])}
              >
                + Add action item
              </button>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

// ─── Meetings (main page) ─────────────────────────────────────────────────────

export function Meetings() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const openedFromUrlRef = useRef<number | null>(null);
  const teamsIntegrationEnabled = import.meta.env.VITE_TEAMS_CALENDAR_ENABLED !== "false";

  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [platformUsers, setPlatformUsers] = useState<PlatformUserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetReadOnly, setSheetReadOnly] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [meetingTab, setMeetingTab] = useState(0);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [teamsStatus, setTeamsStatus] = useState<ComposioStatusResponse | null>(null);
  const [teamsBusy, setTeamsBusy] = useState(false);
  const [showPastMeetings, setShowPastMeetings] = useState(true);

  // Form state
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingType, setMeetingType] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [organizerUserId, setOrganizerUserId] = useState("");
  const [internalIds, setInternalIds] = useState<string[]>([]);
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
  const [actions, setActions] = useState<Omit<MeetingActionItemRow, "id">[]>([emptyAction()]);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([queries.meetingsList(), queries.projects()])
      .then(([m, p]) => { setRows(m); setProjects(p); })
      .catch(() => { setRows([]); setProjects([]); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const refreshTeamsStatus = useCallback(async () => {
    if (!teamsIntegrationEnabled) return;
    try {
      const s = await queries.composioStatus();
      setTeamsStatus(s);
    } catch {
      setTeamsStatus(null);
    }
  }, [teamsIntegrationEnabled]);

  useEffect(() => {
    void refreshTeamsStatus();
  }, [refreshTeamsStatus]);

  // Load platform users once
  useEffect(() => {
    Promise.all([queries.taskAssignableUsers().catch(() => []), adminApi.listUsers().catch(() => [])])
      .then(([a, b]) => {
        const m = new Map<number, PlatformUserLite>();
        for (const u of a as PlatformUserLite[]) m.set(u.id, u);
        for (const u of b as PlatformUserLite[]) if (!m.has(u.id)) m.set(u.id, u);
        setPlatformUsers(Array.from(m.values()).sort((x, y) => x.email.localeCompare(y.email)));
      });
  }, []);

  const projectById = useMemo(() => {
    const m = new Map<number, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = sortMeetings(rows);
    const scoped = showPastMeetings ? sorted : sorted.filter((r) => !isPastMeeting(r));
    if (!q) return scoped;
    return scoped.filter((r) => {
      const blob = [r.meeting_title, r.meeting_type, r.account_name_snapshot, r.organizer_name, r.meeting_status, r.mom_status, String(r.id)]
        .filter(Boolean).join(" ").toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search, showPastMeetings]);

  function resetForm() {
    setEditingId(null);
    setMeetingTitle(""); setMeetingType(""); setMeetingDate("");
    setStartTime(""); setEndTime(""); setOrganizerName(""); setOrganizerUserId("");
    setInternalIds([]); setAttendeesExternal(""); setExtContacts([emptyContact()]);
    setProjectId(""); setAccountSnapshot(""); setAgendaItems("");
    setDiscussionSummary(""); setDecisionsTaken(""); setKeyDiscussionPoints("");
    setFollowUpDate(""); setNextMeetingDate(""); setMeetingMode("");
    setMeetingStatus("Scheduled"); setMomStatus(""); setMomLinkRemarks("");
    setActions([emptyAction()]); setMeetingTab(0); setSaveErr(null);
    setSheetReadOnly(false);
  }

  function openCreate() {
    resetForm();
    setSheetOpen(true);
  }

  const openMeetingSheet = useCallback((m: MeetingRow, viewOnly: boolean) => {
    setEditingId(m.id);
    setMeetingTitle(m.meeting_title ?? ""); setMeetingType(m.meeting_type ?? "");
    setMeetingDate(m.meeting_date?.slice(0, 10) ?? "");
    setStartTime(m.start_time ?? ""); setEndTime(m.end_time ?? "");
    setOrganizerName(m.organizer_name ?? "");
    setOrganizerUserId(m.organizer_user_id != null ? String(m.organizer_user_id) : "");
    const internalEmails = (m.attendees_internal ?? "")
      .split(/[,;\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (internalEmails.length && platformUsers.length) {
      const matched = platformUsers
        .filter((u) => internalEmails.includes(u.email.toLowerCase()))
        .map((u) => String(u.id));
      setInternalIds(matched);
    } else {
      setInternalIds([]);
    }
    setAttendeesExternal(m.attendees_external ?? "");
    const ej = m.external_attendees_json;
    setExtContacts(Array.isArray(ej) && ej.length
      ? ej.map((x) => ({
          name: String((x as Record<string,unknown>).name ?? ""),
          designation: String((x as Record<string,unknown>).designation ?? ""),
          email: String((x as Record<string,unknown>).email ?? ""),
          phone: String((x as Record<string,unknown>).phone ?? ""),
        }))
      : [emptyContact()]);
    setProjectId(m.project_id != null ? String(m.project_id) : "");
    setAccountSnapshot(m.account_name_snapshot ?? "");
    setAgendaItems(m.agenda_items ?? ""); setDiscussionSummary(m.discussion_summary ?? "");
    setDecisionsTaken(m.decisions_taken ?? ""); setKeyDiscussionPoints(m.key_discussion_points ?? "");
    setFollowUpDate(m.follow_up_date?.slice(0, 10) ?? "");
    setNextMeetingDate(m.next_meeting_date?.slice(0, 10) ?? "");
    setMeetingMode(m.meeting_mode ?? ""); setMeetingStatus(m.meeting_status ?? "Scheduled");
    setMomStatus(m.mom_status ?? ""); setMomLinkRemarks(m.mom_link_remarks ?? "");
    setActions(m.action_items?.length
      ? m.action_items.map((a) => ({ description: a.description ?? "", owner: a.owner ?? "", due_date: a.due_date?.slice(0,10) ?? "", status: a.status ?? "", sort_order: a.sort_order ?? 0 }))
      : [emptyAction()]);
    setMeetingTab(0); setSaveErr(null);
    setSheetReadOnly(viewOnly);
    setSheetOpen(true);
  }, []);

  const openEdit = useCallback((m: MeetingRow) => {
    openMeetingSheet(m, false);
  }, [openMeetingSheet]);

  const openView = useCallback((m: MeetingRow) => {
    openMeetingSheet(m, true);
  }, [openMeetingSheet]);

  useEffect(() => {
    if (!platformUsers.length) return;
    if (organizerName && !organizerUserId) {
      const u = platformUsers.find((x) => x.email.toLowerCase() === organizerName.toLowerCase());
      if (u) setOrganizerUserId(String(u.id));
    }
    if (editingId != null && internalIds.length === 0) {
      const m = rows.find((r) => r.id === editingId);
      const csv = m?.attendees_internal ?? "";
      if (csv) {
        const emails = csv
          .split(/[,;\n]/)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        if (emails.length) {
          const matched = platformUsers
            .filter((u) => emails.includes(u.email.toLowerCase()))
            .map((u) => String(u.id));
          if (matched.length) setInternalIds(matched);
        }
      }
    }
  }, [platformUsers, organizerName, organizerUserId, editingId, internalIds.length, rows]);

  function onProjectChange(pid: string) {
    setProjectId(pid);
    const id = parseInt(pid, 10);
    if (!pid || Number.isNaN(id)) return;
    const p = projectById.get(id);
    if (p) {
      const label = (p.account_name || p.engagement_name || "").trim();
      if (label) setAccountSnapshot(label);
    }
  }

  function buildPayload(): Record<string, unknown> {
    const pid = projectId.trim() ? parseInt(projectId, 10) : NaN;
    const extJson = extContacts
      .map((c) => ({ name: c.name.trim(), designation: c.designation.trim(), email: c.email.trim(), phone: c.phone.trim() }))
      .filter((c) => c.name || c.email || c.phone || c.designation);
    // Build attendees_internal from selected user emails
    const internalEmails = internalIds
      .map((id) => platformUsers.find((u) => String(u.id) === id)?.email ?? "")
      .filter(Boolean).join(", ");
    return {
      meeting_title: meetingTitle.trim() || null,
      meeting_type: meetingType.trim() || null,
      meeting_date: meetingDate.trim() || null,
      start_time: startTime.trim() || null,
      end_time: endTime.trim() || null,
      organizer_name: organizerName.trim() || null,
      attendees_internal: internalEmails || null,
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
      attachments_json: null,
      action_items: actions
        .map((a, i) => ({ description: (a.description ?? "").trim() || null, owner: (a.owner ?? "").trim() || null, due_date: (a.due_date ?? "").trim() || null, status: (a.status ?? "").trim() || null, sort_order: i }))
        .filter((a) => a.description || a.owner || a.due_date || a.status),
    };
  }

  async function save() {
    setSaving(true); setSaveErr(null);
    try {
      const body = buildPayload();
      if (editingId != null) {
        const updated = await queries.patchMeeting(editingId, body);
        setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      } else {
        const created = await queries.createMeeting(body);
        setRows((prev) => [created, ...prev]);
      }
      setSheetOpen(false);
      resetForm();
    } catch (e: unknown) {
      setSaveErr(e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Save failed");
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
      alert(e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Delete failed");
    }
  }

  async function connectMicrosoftCalendar() {
    setTeamsBusy(true);
    try {
      const link = await queries.composioConnectLink();
      const popup = window.open(
        link.redirect_url,
        "composio_connect_popup",
        "popup=yes,width=560,height=760,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes",
      );
      if (!popup) {
        throw new Error("Popup blocked by browser. Please allow popups and try again.");
      }
      const startedAt = Date.now();
      const timer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(timer);
          setTeamsBusy(false);
          void refreshTeamsStatus();
          return;
        }
        if (Date.now() - startedAt > 3 * 60_000) {
          window.clearInterval(timer);
          try { popup.close(); } catch { /* noop */ }
          setTeamsBusy(false);
          alert("Composio connect timed out. Please try again.");
        }
      }, 1500);
    } catch (e: unknown) {
      alert(e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Connect failed");
      setTeamsBusy(false);
    }
  }

  async function disconnectMicrosoftCalendar() {
    if (!window.confirm("Disconnect Microsoft calendar for your user?")) return;
    setTeamsBusy(true);
    try {
      const next = await queries.composioDisconnect();
      setTeamsStatus(next);
    } catch (e: unknown) {
      alert(e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Disconnect failed");
    } finally {
      setTeamsBusy(false);
    }
  }

  const syncOutlookMeetings = useCallback(
    async (options?: { silent?: boolean; bypassConnectedCheck?: boolean }) => {
      if (!options?.bypassConnectedCheck && !teamsStatus?.connected) {
        alert("Connect Microsoft first.");
        return;
      }
      setTeamsBusy(true);
      try {
        const res: ComposioOutlookSyncResponse = await queries.composioSyncOutlookMeetings(100);
        const latest = await queries.meetingsList();
        setRows(latest);
        if (!options?.silent) {
          alert(
            `Outlook sync complete.\nImported: ${res.imported}\nUpdated: ${res.updated}\nRemote events seen: ${res.remote_count}`,
          );
        }
      } catch (e: unknown) {
        if (!options?.silent) {
          alert(e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Outlook sync failed");
        }
      } finally {
        setTeamsBusy(false);
      }
    },
    [teamsStatus?.connected],
  );

  async function linkMeetingToTeams(meeting: MeetingRow) {
    if (!teamsStatus?.connected) {
      alert("Connect Microsoft first.");
      return;
    }
    try {
      const updated = await queries.linkMeetingCalendar(meeting.id, {
        teams_calendar_id: meeting.teams_calendar_id || "primary",
        teams_sync_status: "linked",
      });
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e: unknown) {
      alert(e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Link failed");
    }
  }

  async function unlinkMeetingFromTeams(meeting: MeetingRow) {
    if (!window.confirm(`Unlink MTG-${meeting.id} from Teams calendar?`)) return;
    try {
      const updated = await queries.unlinkMeetingCalendar(meeting.id);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e: unknown) {
      alert(e && typeof e === "object" && "message" in e ? String((e as Error).message) : "Unlink failed");
    }
  }

  useEffect(() => {
    if (loading) return;
    const raw = searchParams.get("meeting");
    if (!raw) return;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) return;
    if (openedFromUrlRef.current === id) return;
    const m = rows.find((r) => r.id === id);
    if (m) { openedFromUrlRef.current = id; openEdit(m); }
  }, [loading, rows, searchParams, openEdit]);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; status?: string } | null;
      if (!data || data.type !== "composio-connect-result") return;
      setTeamsBusy(false);
      void refreshTeamsStatus();
      if (data.status === "connected") {
        void syncOutlookMeetings({ silent: true, bypassConnectedCheck: true });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [refreshTeamsStatus, syncOutlookMeetings]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <PageHeader
          title="Meeting tracker"
          subtitle="Log governance calls, QBRs, and MoMs — scoped to your projects. Action items are stored per meeting."
        />
        <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
          {teamsIntegrationEnabled && (
            <div
              style={{
                border: "1px solid var(--border-color, #d7dce3)",
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 11,
                minWidth: 300,
                background: "var(--surface, #fff)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <strong>Microsoft Calendar</strong>
                <span style={{ color: teamsStatus?.connected ? "#15803d" : "#92400e" }}>
                  {teamsStatus?.connected ? "Connected" : "Not connected"}
                </span>
              </div>
              <div style={{ marginTop: 6, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-dialog__btn"
                  style={{ fontSize: 10, padding: "4px 8px" }}
                  disabled={teamsBusy || !teamsStatus?.configured || !!teamsStatus?.connected}
                  onClick={() => void connectMicrosoftCalendar()}
                >
                  {teamsStatus?.connected ? "Connected" : "Connect"}
                </button>
                <button
                  type="button"
                  className="platform-dialog__btn"
                  style={{ fontSize: 10, padding: "4px 8px" }}
                  disabled={teamsBusy || !teamsStatus?.connected}
                  onClick={() => void syncOutlookMeetings()}
                >
                  Sync Outlook
                </button>
                <button
                  type="button"
                  className="platform-dialog__btn"
                  style={{ fontSize: 10, padding: "4px 8px" }}
                  disabled={teamsBusy || !teamsStatus?.connected}
                  onClick={() => void disconnectMicrosoftCalendar()}
                >
                  Disconnect
                </button>
              </div>
              {teamsStatus?.auth_config_id && (
                <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-muted)" }}>
                  auth config: {teamsStatus.auth_config_id}
                </div>
              )}
              {teamsStatus?.connection?.external_user_id && (
                <div style={{ marginTop: 2, fontSize: 10, color: "var(--text-muted)" }}>
                  composio user: {teamsStatus.connection.external_user_id}
                </div>
              )}
              {teamsStatus?.connection?.connection_id && (
                <div style={{ marginTop: 2, fontSize: 10, color: "var(--text-muted)" }}>
                  connected account: {teamsStatus.connection.connection_id}
                </div>
              )}
              {!teamsStatus?.configured && (
                <div style={{ marginTop: 6, color: "#b91c1c" }}>
                  COMPOSIO_API_KEY or COMPOSIO_OUTLOOK_AUTH_CONFIG_ID missing on server.
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className="platform-dialog__btn platform-dialog__btn--primary"
            style={{ fontSize: 11, fontFamily: "'DM Mono',monospace" }}
            onClick={openCreate}
          >
            + Log meeting
          </button>
        </div>
      </div>

      {loading ? (
        <Skeleton height={200} />
      ) : (
        <PlatformSection title="Meetings" action="Refresh" onAction={refresh}>
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <input
              className="platform-search"
              placeholder="Search title, type, account, organizer, status, ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 400, width: "100%" }}
            />
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
              <input
                type="checkbox"
                checked={showPastMeetings}
                onChange={(e) => setShowPastMeetings(e.target.checked)}
              />
              Show past meetings
            </label>
          </div>
          <div className="platform-table-wrap" style={{ overflowX: "auto" }}>
            <table className="platform-table" style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th>ID</th><th>Date / time</th><th>Title</th><th>Type</th>
                  <th>Account / project</th><th>Mode</th><th>Status</th>
                  <th>Organizer</th><th>MoM</th><th>Teams</th><th>Created</th><th />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={12} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
                      No meetings yet. Use "Log meeting".
                    </td>
                  </tr>
                )}
                {filtered.map((m) => {
                  const pr = m.project_id != null ? projectById.get(m.project_id) : undefined;
                  const prLabel = m.account_name_snapshot || (pr && (pr.engagement_name || pr.account_name)) || (m.project_id != null ? `PRJ-${m.project_id}` : "—");
                  const linked = Boolean(m.teams_event_id);
                  const ownerId = m.teams_owner_user_id ?? null;
                  const canManageLink = ownerId == null || ownerId === user?.id;
                  const canEditMeeting = !linked || canManageLink;
                  return (
                    <tr
                      key={m.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openView(m)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openView(m);
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--accent)" }}>{m.id}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>
                        <div>{m.meeting_date?.slice(0, 10) ?? "—"}</div>
                        <div style={{ fontSize: 9, opacity: 0.8 }}>{meetingTimeLabel(m)}</div>
                      </td>
                      <td style={{ fontWeight: 600, maxWidth: 200 }}>{m.meeting_title ?? "—"}</td>
                      <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.meeting_type ?? "—"}</td>
                      <td style={{ fontSize: 11 }}>{prLabel}</td>
                      <td style={{ fontSize: 10, color: "var(--text-muted)" }}>{m.meeting_mode ?? "—"}</td>
                      <td><StatusTag status={m.meeting_status || "—"} /></td>
                      <td style={{ fontSize: 11 }}>{m.organizer_name ?? "—"}</td>
                      <td style={{ fontSize: 10, color: "var(--text-muted)" }}>{m.mom_status ?? "—"}</td>
                      <td style={{ fontSize: 10 }}>
                        {linked ? (
                          <span style={{ color: "#15803d", fontWeight: 600 }}>
                            Linked
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                        {ownerId != null && (
                          <div style={{ fontSize: 9, opacity: 0.8 }}>
                            owner: U{ownerId}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        {m.created_by_email ?? "—"}
                        <div style={{ fontSize: 9, opacity: 0.8 }}>{m.system_created_at?.slice(0, 16) ?? ""}</div>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="platform-dialog__btn"
                          style={{ fontSize: 10, padding: "4px 8px" }}
                          disabled={!canEditMeeting}
                          title={canEditMeeting ? "" : "Only link owner can edit linked meeting"}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(m);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="platform-dialog__btn"
                          style={{ fontSize: 10, padding: "4px 8px", marginLeft: 6 }}
                          disabled={!canManageLink}
                          title={canManageLink ? "" : "Only link owner can edit Teams link"}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (linked) {
                              void unlinkMeetingFromTeams(m);
                            } else {
                              void linkMeetingToTeams(m);
                            }
                          }}
                        >
                          {linked ? "Unlink" : "Link"}
                        </button>
                        <button
                          type="button"
                          className="platform-dialog__btn"
                          style={{ fontSize: 10, padding: "4px 8px", marginLeft: 6, color: "var(--red)", borderColor: "rgba(255,79,107,0.35)" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeMeeting(m.id);
                          }}
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

      {/* ── NCP side sheet ─────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o); }}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className={cn(
            "flex h-full max-h-[100dvh] flex-col gap-0 border-l p-0",
            "data-[side=right]:w-full data-[side=right]:max-w-[calc(100vw-1rem)]",
            "sm:data-[side=right]:w-[min(calc(100vw-2rem),52rem)] sm:data-[side=right]:max-w-[min(calc(100vw-2rem),52rem)]",
            "bg-[#f7f6f3] shadow-xl",
          )}
        >
          <div className="new-contract-sheet flex min-h-0 flex-1 flex-col">
            {/* Scrollable content */}
            <div className="ncp-scroll min-h-0 flex-1">
              <div className="ncp-page">
                {/* Header */}
                <div className="ncp-header">
                  <div style={{ minWidth: 0 }}>
                    <div className="ncp-breadcrumb">
                      <span>Meetings</span>
                      <span className="ncp-breadcrumb-sep">›</span>
                      {editingId != null
                        ? <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 10 }}>MTG-{editingId}</span>
                        : <span>New</span>}
                    </div>
                    <h1 className="ncp-h1">
                      {editingId == null
                        ? "Log a meeting"
                        : sheetReadOnly
                          ? `View meeting #${editingId}`
                          : `Edit meeting #${editingId}`}
                    </h1>
                    <p className="ncp-subtitle" style={{ marginTop: 4 }}>
                      {sheetReadOnly && editingId != null
                        ? "Read-only summary — use Edit below to change fields, or browse tabs to see all sections."
                        : "Record a governance call, QBR, or MoM. Link an optional project for scoping."}
                    </p>
                  </div>
                  <button type="button" className="ncp-close-btn" aria-label="Close" onClick={() => setSheetOpen(false)}>✕</button>
                </div>

                {/* Form */}
                <MeetingFormNCP
                  meetingTitle={meetingTitle} setMeetingTitle={setMeetingTitle}
                  meetingType={meetingType} setMeetingType={setMeetingType}
                  meetingDate={meetingDate} setMeetingDate={setMeetingDate}
                  startTime={startTime} setStartTime={setStartTime}
                  endTime={endTime} setEndTime={setEndTime}
                  meetingMode={meetingMode} setMeetingMode={setMeetingMode}
                  meetingStatus={meetingStatus} setMeetingStatus={setMeetingStatus}
                  followUpDate={followUpDate} setFollowUpDate={setFollowUpDate}
                  nextMeetingDate={nextMeetingDate} setNextMeetingDate={setNextMeetingDate}
                  projectId={projectId} projects={projects} onProjectChange={onProjectChange}
                  accountSnapshot={accountSnapshot} setAccountSnapshot={setAccountSnapshot}
                  organizerUserId={organizerUserId} setOrganizerUserId={setOrganizerUserId}
                  setOrganizerName={setOrganizerName}
                  internalIds={internalIds} setInternalIds={setInternalIds}
                  attendeesExternal={attendeesExternal} setAttendeesExternal={setAttendeesExternal}
                  extContacts={extContacts} setExtContacts={setExtContacts}
                  agendaItems={agendaItems} setAgendaItems={setAgendaItems}
                  keyDiscussionPoints={keyDiscussionPoints} setKeyDiscussionPoints={setKeyDiscussionPoints}
                  discussionSummary={discussionSummary} setDiscussionSummary={setDiscussionSummary}
                  decisionsTaken={decisionsTaken} setDecisionsTaken={setDecisionsTaken}
                  momStatus={momStatus} setMomStatus={setMomStatus}
                  momLinkRemarks={momLinkRemarks} setMomLinkRemarks={setMomLinkRemarks}
                  actions={actions} setActions={setActions}
                  platformUsers={platformUsers}
                  tab={meetingTab} setTab={setMeetingTab}
                  readOnly={sheetReadOnly}
                />

                {saveErr && (
                  <div style={{ margin: "0 0 12px", padding: "10px 14px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "var(--ncp-radius)", fontSize: 12, color: "#b91c1c" }}>
                    {saveErr}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="ncp-footer">
              {sheetReadOnly && editingId != null ? (
                <>
                  <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => setSheetOpen(false)}>
                    Close
                  </button>
                  <button type="button" className="ncp-btn ncp-btn-primary" onClick={() => setSheetReadOnly(false)}>
                    Edit
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => setSheetOpen(false)} disabled={saving}>
                    Cancel
                  </button>
                  <div style={{ display: "flex", gap: 8 }}>
                    {meetingTab > 0 && (
                      <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => setMeetingTab((t) => t - 1)}>
                        ← Back
                      </button>
                    )}
                    {meetingTab < MTG_TABS.length - 1 && (
                      <button type="button" className="ncp-btn ncp-btn-secondary" onClick={() => setMeetingTab((t) => t + 1)}>
                        Next →
                      </button>
                    )}
                    <button type="button" className="ncp-btn ncp-btn-primary" disabled={saving} onClick={() => void save()}>
                      {saving ? "Saving…" : editingId == null ? "Create ✓" : "Save changes ✓"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
