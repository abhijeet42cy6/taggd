import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { queries, adminApi, type Project, type ProjectTransitionRow, type MeetingRow } from "@/lib/api";
import { isReadOnlyClient, useAuth } from "@/lib/auth";
import { PageHeader, PlatformSection } from "@/components/platform/PlatformBlocks";
import { Skeleton } from "@/components/platform/Skeleton";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  UserPickerDropdown,
  type PlatformUserLite,
} from "@/components/platform/NewContractOrgFlow";
import "@/styles/new-contract-panel.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = ["draft", "in_progress", "soft_launched", "live", "delayed", "cancelled"] as const;
type TrnStatus = (typeof STATUSES)[number];

const STATUS_META: Record<TrnStatus, { label: string; color: string; bg: string; border: string; dot: string }> = {
  draft:         { label: "Draft",         color: "#92600a", bg: "rgba(245,158,11,0.09)",  border: "rgba(245,158,11,0.25)", dot: "#f59e0b" },
  in_progress:   { label: "In progress",   color: "#1a7a47", bg: "rgba(46,204,113,0.09)",  border: "rgba(46,204,113,0.25)", dot: "#2ecc71" },
  soft_launched: { label: "Soft launched", color: "#1d4ed8", bg: "rgba(56,132,255,0.09)",  border: "rgba(56,132,255,0.25)", dot: "#3884ff" },
  live:          { label: "Live ✓",        color: "#1a7a47", bg: "rgba(46,204,113,0.12)",  border: "rgba(46,204,113,0.30)", dot: "#2ecc71" },
  delayed:       { label: "Delayed",       color: "#b91c1c", bg: "rgba(239,68,68,0.09)",   border: "rgba(239,68,68,0.25)",  dot: "#ef4444" },
  cancelled:     { label: "Cancelled",     color: "#6b7280", bg: "rgba(107,114,128,0.09)", border: "rgba(107,114,128,0.22)", dot: "#9ca3af" },
};

const TRN_TABS = ["Overview", "Milestones", "People", "Documents"] as const;
type TrnTabIdx = 0 | 1 | 2 | 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return d.length >= 10 ? d.slice(0, 10) : d;
}

function userColor(email: string) {
  const palette = ["#6366f1", "#e16f3d", "#14b8a6", "#f59e0b", "#3884ff", "#2ecc71", "#ec4899"];
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) & 0xfffffff;
  return palette[Math.abs(h) % palette.length];
}
function userInitials(email: string) {
  const [a = "", b = ""] = email.split("@")[0].split(/[._-]/);
  return (a[0] + (b[0] || a[1] || "")).toUpperCase() || "?";
}

// ─── MultiUserPicker (portaled, same pattern as Meetings.tsx) ─────────────────

function MultiUserPicker({
  selectedIds,
  onChange,
  users,
  placeholder = "Search and add team members…",
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  users: PlatformUserLite[];
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [ddRect, setDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

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
    return q ? users.filter((u) => u.email.toLowerCase().includes(q)) : users;
  }, [users, search]);

  const selected = users.filter((u) => selectedIds.includes(String(u.id)));

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  const ddPanel = (
    <div
      className="ncp-user-dd ncp-open ncp-user-dd--portal"
      onClick={(e) => e.stopPropagation()}
      style={{ maxHeight: 300, display: "flex", flexDirection: "column" }}
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
      <div className="ncp-dd-scroll" onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
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
                {userInitials(u.email)}
              </span>
              <span style={{ flex: 1, textAlign: "left", fontSize: 13 }}>{u.email}</span>
              {checked && <span style={{ color: "var(--ncp-accent)", fontSize: 14 }}>✓</span>}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: "12px", fontSize: 12, color: "var(--ncp-text-muted)", textAlign: "center" }}>
            No users found
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {selected.map((u) => (
            <span
              key={u.id}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 10px 3px 5px",
                borderRadius: "var(--ncp-radius-pill, 100px)",
                background: "var(--ncp-accent-soft)",
                border: "1px solid var(--ncp-accent-mid)",
                fontSize: 12, color: "var(--ncp-accent)",
              }}
            >
              <span
                style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: userColor(u.email), color: "#fff",
                  fontSize: 9, fontWeight: 700, display: "flex",
                  alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >
                {userInitials(u.email)}
              </span>
              {u.email.split("@")[0]}
              <button
                type="button"
                onClick={() => toggle(String(u.id))}
                style={{ opacity: 0.5, cursor: "pointer", background: "none", border: "none", padding: 0, fontSize: 13, color: "inherit" }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {/* Trigger */}
      <div
        ref={btnRef}
        className="ncp-prop-input"
        style={{ cursor: "pointer", color: "var(--ncp-text-muted)", display: "flex", alignItems: "center", gap: 6 }}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      >
        <span style={{ fontSize: 12, opacity: 0.6 }}>+</span>
        <span style={{ fontSize: 13 }}>{placeholder}</span>
      </div>
      {/* Portal */}
      {open && ddRect && createPortal(
        <div
          ref={portalRef}
          className="new-contract-sheet"
          style={{ position: "fixed", top: ddRect.top, left: ddRect.left, width: ddRect.width, zIndex: 200, pointerEvents: "auto", minHeight: 0, height: "auto", display: "block", background: "transparent" }}
        >
          {ddPanel}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── ProjectPickerField (portaled) ───────────────────────────────────────────

function ProjectPickerField({
  value,
  onChange,
  projects,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  projects: Project[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [ddRect, setDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const selected = projects.find((p) => String(p.id) === value) ?? null;

  useLayoutEffect(() => {
    if (!open) { setDdRect(null); return; }
    const measure = () => {
      const b = btnRef.current; if (!b) return;
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
      ? projects.filter((p) => (p.account_name || "").toLowerCase().includes(q) || (p.engagement_name || "").toLowerCase().includes(q) || String(p.id).includes(q))
      : projects;
  }, [projects, search]);

  const ddPanel = (
    <div
      className="ncp-project-dd ncp-open ncp-project-dd--portal"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ncp-project-search">
        <span style={{ opacity: 0.5 }}>🔍</span>
        <input
          type="search"
          placeholder="Search projects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>
      <div className="ncp-dd-scroll" onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
        {filtered.map((p) => (
          <button
            key={p.id}
            type="button"
            className={cn("ncp-project-opt", String(p.id) === value && "ncp-opt-selected")}
            onClick={() => { onChange(String(p.id)); setOpen(false); setSearch(""); }}
          >
            <span className="ncp-project-id">PRJ-{p.id}</span>
            <span className="ncp-project-name">
              {p.account_name || "—"}
              {p.engagement_name ? <span style={{ opacity: 0.6, marginLeft: 6, fontWeight: 400 }}>{p.engagement_name}</span> : null}
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ncp-text-muted)" }}>No projects found</div>
        )}
      </div>
    </div>
  );

  return (
    <div ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={cn("ncp-project-btn", selected && "ncp-selected")}
      >
        {selected ? (
          <>
            <span className="ncp-project-id">PRJ-{selected.id}</span>
            <span className="ncp-project-name">
              {selected.account_name || "—"}
              {selected.engagement_name ? <span style={{ marginLeft: 6, opacity: 0.6, fontWeight: 400 }}>{selected.engagement_name}</span> : null}
            </span>
          </>
        ) : (
          <span style={{ opacity: 0.5 }}>+ Search or select a project (PRJ-···)</span>
        )}
        <span className="ncp-project-chevron">▾</span>
      </button>
      {open && ddRect && createPortal(
        <div
          ref={portalRef}
          className="new-contract-sheet"
          style={{ position: "fixed", top: ddRect.top, left: ddRect.left, width: ddRect.width, zIndex: 200, pointerEvents: "auto", minHeight: 0, height: "auto", display: "block", background: "transparent" }}
        >
          {ddPanel}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── LinkedMeetingsPicker (multi-select, scoped list from GET /meetings) ─────

function meetingPickLabel(m: MeetingRow) {
  return m.meeting_title?.trim() || m.account_name_snapshot?.trim() || `Meeting #${m.id}`;
}

function LinkedMeetingsPicker({
  value,
  onChange,
  meetings,
  labelLookup,
  disabled,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  meetings: MeetingRow[];
  /** Optional wider list (e.g. all scoped meetings) to resolve titles for IDs already linked but outside `meetings`. */
  labelLookup?: MeetingRow[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [ddRect, setDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const meetingById = useMemo(() => {
    const byId = new Map<number, MeetingRow>();
    for (const m of meetings) byId.set(m.id, m);
    if (labelLookup) {
      for (const m of labelLookup) {
        if (!byId.has(m.id)) byId.set(m.id, m);
      }
    }
    return byId;
  }, [meetings, labelLookup]);

  const selectedRows = useMemo(
    () => value.map((id) => ({ id, m: meetingById.get(id) })),
    [meetingById, value],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return meetings;
    return meetings.filter(
      (m) =>
        String(m.id).includes(q) ||
        (m.meeting_type || "").toLowerCase().includes(q) ||
        meetingPickLabel(m).toLowerCase().includes(q) ||
        (m.account_name_snapshot || "").toLowerCase().includes(q) ||
        (m.meeting_date || "").includes(q),
    );
  }, [meetings, search]);

  useLayoutEffect(() => {
    if (!open) {
      setDdRect(null);
      return;
    }
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
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
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

  function toggle(id: number) {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  }

  const triggerSummary =
    selectedRows.length === 0
      ? null
      : selectedRows.length === 1
        ? `${selectedRows[0].m ? meetingPickLabel(selectedRows[0].m) : `Meeting #${selectedRows[0].id}`} · #${selectedRows[0].id}`
        : `${selectedRows.length} meetings linked`;

  const ddPanel = (
    <div className="ncp-project-dd ncp-open ncp-project-dd--portal" onClick={(e) => e.stopPropagation()}>
      <div className="ncp-project-search">
        <span style={{ opacity: 0.5 }}>🔍</span>
        <input
          type="search"
          placeholder="Search by title, type, date, or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        {value.length > 0 && (
          <button
            type="button"
            style={{
              fontSize: 11,
              color: "var(--ncp-accent)",
              background: "none",
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
          >
            Clear all
          </button>
        )}
      </div>
      <div
        className="ncp-dd-scroll"
        style={{ maxHeight: 280 }}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {filtered.length === 0 && (
          <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ncp-text-muted)" }}>
            {meetings.length === 0 ? "No meetings in your scope yet." : `No meetings match "${search.trim()}".`}
          </div>
        )}
        {filtered.map((m) => {
          const checked = value.includes(m.id);
          const kick = (m.meeting_type || "").toLowerCase() === "transition_kickoff";
          return (
            <button
              key={m.id}
              type="button"
              className="ncp-project-opt"
              style={{
                background: checked ? "color-mix(in srgb, var(--ncp-accent) 8%, transparent)" : undefined,
                alignItems: "flex-start",
              }}
              onClick={() => toggle(m.id)}
            >
              <span
                className="ncp-proj-ico"
                style={{
                  background: checked ? "var(--ncp-accent)" : kick ? "rgba(225, 111, 61, 0.25)" : "var(--ncp-border)",
                  color: checked ? "#fff" : "var(--ncp-text-muted)",
                  fontFamily: "var(--ncp-mono)",
                  fontSize: 10,
                  flexShrink: 0,
                }}
              >
                {checked ? "✓" : String(m.id).slice(-2)}
              </span>
              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <div style={{ fontWeight: checked ? 600 : 500, color: "var(--ncp-text-primary)" }}>
                  {meetingPickLabel(m)}
                </div>
                <div style={{ fontSize: 11, color: "var(--ncp-text-muted)", fontFamily: "var(--ncp-mono)" }}>
                  #{m.id}
                  {m.meeting_date ? ` · ${m.meeting_date.slice(0, 10)}` : ""}
                  {m.meeting_type ? ` · ${m.meeting_type}` : ""}
                  {m.project_id != null ? ` · PRJ-${m.project_id}` : ""}
                </div>
              </div>
              {checked && <span style={{ color: "var(--ncp-accent)", fontSize: 12, flexShrink: 0 }}>✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="ncp-project-wrap" style={{ marginBottom: 0 }}>
        <button
          ref={btnRef}
          type="button"
          disabled={disabled}
          className={cn("ncp-project-btn", selectedRows.length > 0 && "ncp-selected")}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) setOpen((o) => !o);
          }}
        >
          {selectedRows.length > 0 ? (
            <>
              <span className="ncp-project-icon" style={{ fontSize: 11 }}>
                {selectedRows.length > 1 ? selectedRows.length : String(selectedRows[0].id).slice(-2)}
              </span>
              <div className="ncp-project-meta" style={{ minWidth: 0 }}>
                <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{triggerSummary}</strong>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: 20 }}>＋</span>
              <span>Search or select meetings (MoM)…</span>
            </>
          )}
          <span style={{ color: "var(--ncp-text-muted)", marginLeft: "auto" }}>▾</span>
        </button>
      </div>

      {selectedRows.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {selectedRows.map(({ id, m }) => (
            <span
              key={id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px 3px 6px",
                borderRadius: 6,
                background: "color-mix(in srgb, var(--ncp-accent) 10%, var(--ncp-surface))",
                border: "1px solid color-mix(in srgb, var(--ncp-accent) 30%, transparent)",
                fontSize: 11,
                maxWidth: "100%",
              }}
            >
              <span style={{ color: "var(--ncp-accent)", fontFamily: "var(--ncp-mono)", fontWeight: 600 }}>#{id}</span>
              <span style={{ color: "var(--ncp-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m ? meetingPickLabel(m) : "Not in current list"}
              </span>
              {!disabled && (
                <button
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "0 0 0 2px",
                    color: "var(--ncp-text-muted)",
                    lineHeight: 1,
                    fontSize: 13,
                  }}
                  onClick={() => toggle(id)}
                  aria-label={`Remove meeting ${id}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {open && ddRect && !disabled && createPortal(
        <div
          ref={portalRef}
          className="new-contract-sheet"
          style={{
            position: "fixed",
            top: ddRect.top,
            left: ddRect.left,
            width: ddRect.width,
            zIndex: 200,
            pointerEvents: "auto",
            minHeight: 0,
            height: "auto",
            display: "block",
            background: "transparent",
          }}
        >
          {ddPanel}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── StatusPicker ─────────────────────────────────────────────────────────────

function StatusPicker({ value, onChange, disabled = false }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {STATUSES.map((s) => {
        const m = STATUS_META[s];
        const on = value === s;
        return (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onChange(s)}
            className={cn("ncp-agenda-cat", on ? "cat-on" : "")}
            style={on ? { borderColor: m.border, background: m.bg, color: m.color, fontWeight: 600, borderWidth: 1.5 } : {}}
          >
            {on && <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.dot, flexShrink: 0 }} />}
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

function MetricCard({ value, label, accent = false, muted = false }: { value: string | number; label: string; accent?: boolean; muted?: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 120,
        background: accent ? "var(--ncp-accent-soft)" : "var(--ncp-surface)",
        border: `1px solid ${accent ? "var(--ncp-accent-mid)" : "var(--ncp-border)"}`,
        borderRadius: "var(--ncp-radius-lg)",
        padding: "14px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: "-0.5px",
          color: accent ? "var(--ncp-accent)" : muted ? "var(--ncp-text-muted)" : "var(--ncp-text-primary)",
          fontFamily: "var(--ncp-font)",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--ncp-text-muted)", fontFamily: "var(--ncp-mono)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
    </div>
  );
}

// ─── External contacts (serialized to 4 existing API string columns) ──────────

type TrnExtContact = { name: string; designation: string; email: string; phone: string };
const emptyTrnExtContact = (): TrnExtContact => ({ name: "", designation: "", email: "", phone: "" });

/** Multi-contact rows use this delimiter in each column so commas in names stay intact. */
const TRN_EXT_ROW_SEP = ";;";

function legacyTransitionExternalToContacts(
  names: string | null | undefined,
  designation: string | null | undefined,
  email: string | null | undefined,
  phone: string | null | undefined,
): TrnExtContact[] {
  const n = names ?? "";
  const d = designation ?? "";
  const e = email ?? "";
  const p = phone ?? "";
  const multi =
    n.includes(TRN_EXT_ROW_SEP) || d.includes(TRN_EXT_ROW_SEP) || e.includes(TRN_EXT_ROW_SEP) || p.includes(TRN_EXT_ROW_SEP);
  if (multi) {
    const ns = n.split(TRN_EXT_ROW_SEP).map((s) => s.trim());
    const ds = d.split(TRN_EXT_ROW_SEP).map((s) => s.trim());
    const es = e.split(TRN_EXT_ROW_SEP).map((s) => s.trim());
    const ps = p.split(TRN_EXT_ROW_SEP).map((s) => s.trim());
    const len = Math.max(ns.length, ds.length, es.length, ps.length, 1);
    return Array.from({ length: len }, (_, i) => ({
      name: ns[i] || "",
      designation: ds[i] || "",
      email: es[i] || "",
      phone: ps[i] || "",
    }));
  }
  if (!n.trim() && !d.trim() && !e.trim() && !p.trim()) return [emptyTrnExtContact()];
  return [{ name: n.trim(), designation: d.trim(), email: e.trim(), phone: p.trim() }];
}

function contactsToLegacyTransitionFields(contacts: TrnExtContact[]): {
  external_attendees_names: string | null;
  attendees_external: string | null;
  external_attendees_email: string | null;
  external_attendees_contact: string | null;
} {
  const filtered = contacts.filter((c) => c.name.trim() || c.designation.trim() || c.email.trim() || c.phone.trim());
  if (filtered.length === 0) {
    return {
      external_attendees_names: null,
      attendees_external: null,
      external_attendees_email: null,
      external_attendees_contact: null,
    };
  }
  if (filtered.length === 1) {
    const c = filtered[0];
    return {
      external_attendees_names: c.name.trim() || null,
      attendees_external: c.designation.trim() || null,
      external_attendees_email: c.email.trim() || null,
      external_attendees_contact: c.phone.trim() || null,
    };
  }
  return {
    external_attendees_names: filtered.map((c) => c.name.trim()).join(TRN_EXT_ROW_SEP),
    attendees_external: filtered.map((c) => c.designation.trim()).join(TRN_EXT_ROW_SEP),
    external_attendees_email: filtered.map((c) => c.email.trim()).join(TRN_EXT_ROW_SEP),
    external_attendees_contact: filtered.map((c) => c.phone.trim()).join(TRN_EXT_ROW_SEP),
  };
}

// ─── MultiMeetingPicker ───────────────────────────────────────────────────────

const MEETING_TYPE_ICONS: Record<string, string> = {
  transition_kickoff: "🚀",
  transition_workshop: "🛠",
  client_kickoff: "🤝",
  review: "📋",
  weekly: "📅",
  monthly: "📆",
  ad_hoc: "💬",
};

function mtIcon(type: string | null) {
  return MEETING_TYPE_ICONS[type ?? ""] ?? "📌";
}

function meetingLabel(m: MeetingRow): string {
  if (m.meeting_title) return m.meeting_title;
  const parts: string[] = [];
  if (m.meeting_type) parts.push(m.meeting_type.replace(/_/g, " "));
  if (m.meeting_date) parts.push(m.meeting_date);
  return parts.join(" · ") || `Meeting #${m.id}`;
}

function MultiMeetingPicker({
  value,
  onChange,
  meetings,
  projectId,
  disabled,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  meetings: MeetingRow[];
  projectId?: number | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [ddRect, setDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const src = q
      ? meetings.filter(
          (m) =>
            meetingLabel(m).toLowerCase().includes(q) ||
            (m.meeting_type ?? "").toLowerCase().includes(q) ||
            (m.meeting_date ?? "").includes(q) ||
            (m.account_name_snapshot ?? "").toLowerCase().includes(q) ||
            String(m.id).includes(q),
        )
      : meetings;
    return [...src].sort((a, b) => {
      const aRel = a.project_id === projectId ? 0 : 1;
      const bRel = b.project_id === projectId ? 0 : 1;
      if (aRel !== bRel) return aRel - bRel;
      const ad = a.meeting_date ?? "";
      const bd = b.meeting_date ?? "";
      return bd.localeCompare(ad); // newest first
    });
  }, [meetings, search, projectId]);

  const selected = useMemo(() => meetings.filter((m) => value.includes(m.id)), [meetings, value]);

  useLayoutEffect(() => {
    if (!open) { setDdRect(null); return; }
    const measure = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
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
    if (disabled) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || portalRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [disabled]);

  function toggle(id: number) {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  }

  const triggerLabel =
    selected.length === 0
      ? null
      : selected.length === 1
        ? meetingLabel(selected[0])
        : `${selected.length} meetings linked`;

  const dropdown = (
    <div
      className="new-contract-sheet"
      style={{ position: "fixed", top: ddRect?.top ?? 0, left: ddRect?.left ?? 0, width: ddRect?.width ?? 0, zIndex: 200, pointerEvents: "auto", height: "auto", display: "block", background: "transparent" }}
      ref={portalRef}
    >
      <div className="ncp-project-dd ncp-open ncp-project-dd--portal" onClick={(e) => e.stopPropagation()}>
        <div className="ncp-project-search">
          <span style={{ opacity: 0.5 }}>🔍</span>
          <input
            type="search"
            placeholder="Search by title, type, date, account…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {value.length > 0 && (
            <button
              type="button"
              style={{ fontSize: 11, color: "var(--ncp-accent)", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
              onClick={() => { onChange([]); setOpen(false); }}
            >
              Clear all
            </button>
          )}
        </div>
        <div
          className="ncp-dd-scroll"
          style={{ maxHeight: 300 }}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {meetings.length === 0 ? (
            <div style={{ padding: "14px 16px", fontSize: 12, color: "var(--ncp-text-muted)" }}>
              No meetings found — log transition meetings under <strong>Meetings</strong> first.
            </div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ncp-text-muted)" }}>
              No meetings match "{search}"
            </div>
          ) : null}
          {sorted.map((m) => {
            const checked = value.includes(m.id);
            const isRelated = m.project_id === projectId;
            return (
              <button
                key={m.id}
                type="button"
                className="ncp-project-opt"
                style={{ background: checked ? "color-mix(in srgb, var(--ncp-accent) 8%, transparent)" : undefined }}
                onClick={() => toggle(m.id)}
              >
                <span
                  className="ncp-proj-ico"
                  style={{
                    background: checked ? "var(--ncp-accent)" : isRelated ? "color-mix(in srgb, var(--ncp-accent) 18%, var(--ncp-border))" : "var(--ncp-border)",
                    color: checked ? "#fff" : "var(--ncp-text-primary)",
                    fontSize: 13,
                  }}
                >
                  {checked ? "✓" : mtIcon(m.meeting_type)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: checked ? 600 : 500, color: "var(--ncp-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {meetingLabel(m)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ncp-text-muted)", fontFamily: "var(--ncp-mono)", display: "flex", gap: 8 }}>
                    <span>#{m.id}</span>
                    {m.meeting_date && <span>{m.meeting_date}</span>}
                    {m.meeting_type && <span>{m.meeting_type.replace(/_/g, " ")}</span>}
                    {m.account_name_snapshot && <span style={{ color: isRelated ? "var(--ncp-accent)" : undefined }}>{m.account_name_snapshot}</span>}
                  </div>
                </div>
                {isRelated && !checked && (
                  <span style={{ fontSize: 10, color: "var(--ncp-accent)", background: "color-mix(in srgb, var(--ncp-accent) 12%, transparent)", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap" }}>
                    this project
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="ncp-project-wrap" style={{ marginBottom: 0 }}>
        <button
          ref={btnRef}
          type="button"
          className={cn("ncp-project-btn", selected.length > 0 && "ncp-selected")}
          disabled={disabled}
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        >
          {selected.length > 0 ? (
            <>
              <span className="ncp-project-icon" style={{ fontSize: 13, background: "var(--ncp-accent)" }}>
                {selected.length === 1 ? mtIcon(selected[0].meeting_type) : String(selected.length)}
              </span>
              <div className="ncp-project-meta">
                <strong>{triggerLabel}</strong>
                {selected.length === 1 && selected[0].meeting_date && (
                  <span>{selected[0].meeting_date}{selected[0].meeting_type ? ` · ${selected[0].meeting_type.replace(/_/g, " ")}` : ""}</span>
                )}
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: 20 }}>📌</span>
              <span>{meetings.length > 0 ? "Search or link meetings…" : "Loading meetings…"}</span>
            </>
          )}
          <span style={{ color: "var(--ncp-text-muted)", marginLeft: "auto" }}>▾</span>
        </button>
      </div>

      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {selected.map((m) => (
            <span
              key={m.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px 3px 6px",
                borderRadius: 6,
                background: "color-mix(in srgb, var(--ncp-accent) 10%, var(--ncp-surface))",
                border: "1px solid color-mix(in srgb, var(--ncp-accent) 30%, transparent)",
                fontSize: 11,
                color: "var(--ncp-text-primary)",
                maxWidth: 280,
              }}
            >
              <span>{mtIcon(m.meeting_type)}</span>
              <span style={{ color: "var(--ncp-accent)", fontWeight: 600, fontFamily: "var(--ncp-mono)" }}>#{m.id}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meetingLabel(m)}</span>
              {!disabled && (
                <button
                  type="button"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 0 2px", color: "var(--ncp-text-muted)", lineHeight: 1, fontSize: 13 }}
                  onClick={() => toggle(m.id)}
                  aria-label={`Remove ${meetingLabel(m)}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {open && ddRect && createPortal(dropdown, document.body)}
    </div>
  );
}

// ─── TransitionSheet ──────────────────────────────────────────────────────────

function TransitionSheet({
  open,
  onClose,
  edit,
  createProjects,
  allProjects,
  platformUsers,
  readOnly,
  onSaved,
  onPersistedTransition,
}: {
  open: boolean;
  onClose: () => void;
  edit: ProjectTransitionRow | null;
  createProjects: Project[];
  allProjects: Project[];
  platformUsers: PlatformUserLite[];
  readOnly: boolean;
  onSaved: () => void;
  /** Called after upload / attachment PATCH so parent can sync `edit` and refresh list. */
  onPersistedTransition?: (row: ProjectTransitionRow) => void;
}) {
  const isCreate = edit === null;

  const emptyForm = (): Record<string, string> => ({
    project_id: "",
    status: "draft",
    project_signed_date: "",
    kickoff_date: "",
    as_is_study_date: "",
    to_be_presentation_date: "",
    soft_launch_date: "",
    go_live_date: "",
    transition_done_by_user_id: "",
    attendees_internal_ids: "",
    rpo_solution_deck_url: "",
    transition_document_url: "",
    dead_days: "",
    ageing_days: "",
    reason_for_delay: "",
    linked_meeting_ids_json: "",
  });

  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [linkedMeetingIds, setLinkedMeetingIds] = useState<number[]>([]);
  const [allMeetings, setAllMeetings] = useState<MeetingRow[]>([]);
  const [extContacts, setExtContacts] = useState<TrnExtContact[]>([emptyTrnExtContact()]);
  type TrnResourceAtt = { filename: string; original_name: string; uploaded_at?: string };
  const [resourceAttachments, setResourceAttachments] = useState<TrnResourceAtt[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const resourceFileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TrnTabIdx>(0);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [meetingsListFailed, setMeetingsListFailed] = useState(false);

  // Load meetings the current user may link (same scope as Meetings page — project + role rules on server).
  useEffect(() => {
    if (!open) return;
    setMeetingsListFailed(false);
    let cancelled = false;
    void queries
      .meetingsList()
      .then((rows) => {
        if (!cancelled) {
          setAllMeetings(rows);
          setMeetingsListFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAllMeetings([]);
          setMeetingsListFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset when sheet opens
  useEffect(() => {
    if (!open) return;
    setTab(0);
    setSaveErr(null);
    setSaving(false);
    if (edit) {
      // Parse internal attendees: stored as comma-separated emails → map to IDs
      const internalIds = edit.attendees_internal
        ? edit.attendees_internal.split(",").map((e) => e.trim()).flatMap((emailOrId) => {
            const u = platformUsers.find((u) => u.email === emailOrId || String(u.id) === emailOrId);
            return u ? [String(u.id)] : [];
          }).join(",")
        : "";
      setForm({
        project_id: String(edit.project_id),
        status: edit.status || "draft",
        project_signed_date: edit.project_signed_date || "",
        kickoff_date: edit.kickoff_date || "",
        as_is_study_date: edit.as_is_study_date || "",
        to_be_presentation_date: edit.to_be_presentation_date || "",
        soft_launch_date: edit.soft_launch_date || "",
        go_live_date: edit.go_live_date || "",
        transition_done_by_user_id: edit.transition_done_by_user_id != null ? String(edit.transition_done_by_user_id) : "",
        attendees_internal_ids: internalIds,
        rpo_solution_deck_url: edit.rpo_solution_deck_url || "",
        transition_document_url: edit.transition_document_url || "",
        dead_days: edit.dead_days != null ? String(edit.dead_days) : "",
        ageing_days: edit.ageing_days != null ? String(edit.ageing_days) : "",
        reason_for_delay: edit.reason_for_delay || "",
        linked_meeting_ids_json: Array.isArray(edit.linked_meeting_ids_json)
          ? edit.linked_meeting_ids_json.join(", ")
          : "",
      });
      setExtContacts(
        legacyTransitionExternalToContacts(
          edit.external_attendees_names,
          edit.attendees_external,
          edit.external_attendees_email,
          edit.external_attendees_contact,
        ),
      );
      setResourceAttachments(Array.isArray(edit.resource_attachments_json) ? edit.resource_attachments_json : []);
      setLinkedMeetingIds(Array.isArray(edit.linked_meeting_ids_json) ? edit.linked_meeting_ids_json : []);
    } else {
      setForm(emptyForm());
      setExtContacts([emptyTrnExtContact()]);
      setResourceAttachments([]);
      setLinkedMeetingIds([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, edit]);

  const f = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  function applyLinkedMeetingIds(ids: number[]) {
    setLinkedMeetingIds(ids);
    f("linked_meeting_ids_json", ids.length ? ids.join(", ") : "");
  }

  const meetingsPickPool = useMemo(() => {
    const pid = parseInt(form.project_id || "", 10);
    let rows = allMeetings;
    if (Number.isFinite(pid)) {
      rows = rows.filter((m) => m.project_id == null || m.project_id === pid);
    }
    return [...rows].sort((a, b) => {
      const ak = (a.meeting_type || "").toLowerCase() === "transition_kickoff" ? 0 : 1;
      const bk = (b.meeting_type || "").toLowerCase() === "transition_kickoff" ? 0 : 1;
      if (ak !== bk) return ak - bk;
      const da = a.meeting_date || "";
      const db = b.meeting_date || "";
      if (da !== db) return db.localeCompare(da);
      return b.id - a.id;
    });
  }, [allMeetings, form.project_id]);

  async function onPickResourceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || readOnly) return;
    const pid = parseInt(form.project_id, 10);
    if (Number.isNaN(pid)) {
      setSaveErr("Select a project before attaching a file.");
      return;
    }
    setUploadingFile(true);
    setSaveErr(null);
    try {
      const { transition } = await queries.uploadTransitionResource(pid, file);
      setResourceAttachments(Array.isArray(transition.resource_attachments_json) ? transition.resource_attachments_json : []);
      onPersistedTransition?.(transition);
    } catch (err: unknown) {
      setSaveErr(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingFile(false);
    }
  }

  async function removeResourceFile(att: TrnResourceAtt) {
    if (readOnly) return;
    const pid = parseInt(form.project_id, 10);
    if (Number.isNaN(pid)) return;
    const next = resourceAttachments.filter((x) => x.filename !== att.filename);
    setUploadingFile(true);
    setSaveErr(null);
    try {
      const row = await queries.patchTransition(pid, {
        resource_attachments_json: next.length ? next : null,
      });
      setResourceAttachments(Array.isArray(row.resource_attachments_json) ? row.resource_attachments_json : []);
      onPersistedTransition?.(row);
    } catch (err: unknown) {
      setSaveErr(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setUploadingFile(false);
    }
  }

  async function doSave(forceDraft = false) {
    if (readOnly) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const pid = parseInt(form.project_id, 10);
      if (Number.isNaN(pid)) { setSaveErr("Please select a project."); setSaving(false); return; }

      const statusToSave = forceDraft ? "draft" : form.status;

      // Build internal attendees as comma-separated emails
      const internalEmails = form.attendees_internal_ids
        ? form.attendees_internal_ids.split(",").map((id) => id.trim()).filter(Boolean).map((id) => {
            const u = platformUsers.find((u) => String(u.id) === id);
            return u ? u.email : id;
          }).join(", ")
        : "";

      const extFields = contactsToLegacyTransitionFields(extContacts);
      const body: Record<string, unknown> = {
        status: statusToSave,
        project_signed_date: form.project_signed_date.trim() || null,
        kickoff_date: form.kickoff_date.trim() || null,
        as_is_study_date: form.as_is_study_date.trim() || null,
        to_be_presentation_date: form.to_be_presentation_date.trim() || null,
        soft_launch_date: form.soft_launch_date.trim() || null,
        go_live_date: form.go_live_date.trim() || null,
        attendees_internal: internalEmails || null,
        attendees_external: extFields.attendees_external,
        external_attendees_names: extFields.external_attendees_names,
        external_attendees_contact: extFields.external_attendees_contact,
        external_attendees_email: extFields.external_attendees_email,
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
        .split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
      body.linked_meeting_ids_json = mids.length ? mids : null;
      body.resource_attachments_json = resourceAttachments.length ? resourceAttachments : null;

      if (isCreate) {
        try {
          await queries.createTransition(pid);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.toLowerCase().includes("already exists")) throw e;
        }
      }
      await queries.patchTransition(pid, body);
      onSaved();
      onClose();
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ── Helper render functions ─────────────────────────────────────────────────

  function pr(label: string, fieldKey: string, opts?: { placeholder?: string; type?: string }) {
    return (
      <div className="ncp-prop-row">
        <div className="ncp-prop-label">{label}</div>
        <input
          className="ncp-prop-input"
          type={opts?.type || "text"}
          placeholder={opts?.placeholder}
          disabled={readOnly}
          value={form[fieldKey] || ""}
          onChange={(e) => f(fieldKey, e.target.value)}
        />
      </div>
    );
  }

  function dateRow(label: string, fieldKey: string) {
    return (
      <div className="ncp-prop-row">
        <div className="ncp-prop-label">{label}</div>
        <input
          className="ncp-prop-input"
          type="date"
          disabled={readOnly}
          value={form[fieldKey] || ""}
          onChange={(e) => f(fieldKey, e.target.value)}
        />
      </div>
    );
  }

  function ta(label: string, fieldKey: string, rows = 3, placeholder?: string) {
    return (
      <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
        <div className="ncp-prop-label" style={{ paddingTop: 8 }}>{label}</div>
        <textarea
          className="ncp-prop-input"
          rows={rows}
          style={{ resize: "vertical" }}
          placeholder={placeholder}
          disabled={readOnly}
          value={form[fieldKey] || ""}
          onChange={(e) => f(fieldKey, e.target.value)}
        />
      </div>
    );
  }

  function section(icon: string, cls: string, title: string, subtitle: string, body: React.ReactNode) {
    return (
      <div className="ncp-section">
        <div className="ncp-section-header" style={{ cursor: "default" }}>
          <div className={cn("ncp-section-icon", cls)}>{icon}</div>
          <div className="ncp-section-title">
            <div className="ncp-section-name">{title}</div>
            <div className="ncp-section-sub">{subtitle}</div>
          </div>
        </div>
        <div className="ncp-section-body">{body}</div>
      </div>
    );
  }

  // Derive selected project for display
  const selectedProject = allProjects.find((p) => String(p.id) === form.project_id) ?? null;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="new-contract-sheet flex min-h-0 flex-1 flex-col p-0 max-h-[100dvh]"
      >
        {/* ── Scroll body ────────────────────────────── */}
        <div className="ncp-scroll min-h-0 flex-1">
          <div className="ncp-page">

            {/* ── Header ─────────────────────────────── */}
            <div className="ncp-header">
              <div>
                <div className="ncp-breadcrumb">
                  <span>TRANSITIONS</span>
                  <span>›</span>
                  <span>{isCreate ? "NEW TRACKER" : `PRJ-${edit?.project_id}`}</span>
                </div>
                <h1 className="ncp-title">
                  {isCreate ? "New transition tracker" : (selectedProject?.account_name || `Transition · PRJ-${edit?.project_id}`)}
                </h1>
                {!isCreate && selectedProject?.engagement_name && (
                  <p className="ncp-subtitle" style={{ marginTop: 2 }}>{selectedProject.engagement_name}</p>
                )}
                {isCreate && (
                  <p className="ncp-subtitle">Select a project and fill in milestone dates and team details.</p>
                )}
              </div>
              <button type="button" className="ncp-close" onClick={onClose}>✕</button>
            </div>

            {/* ── Tab strip ──────────────────────────── */}
            <div className="ncp-steps">
              {TRN_TABS.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  className={cn("ncp-step", i === tab && "ncp-active", i < tab && "ncp-done")}
                  onClick={() => setTab(i as TrnTabIdx)}
                >
                  <span className="ncp-step-num">{i < tab ? "✓" : i + 1}</span>
                  {name}
                </button>
              ))}
            </div>

            {/* ════════════════════════════════════════
                TAB 0 — Overview
            ════════════════════════════════════════ */}
            <div className={cn("ncp-panel", tab === 0 && "ncp-panel-active")}>

              {/* Project (create mode) */}
              {isCreate && section("🏢", "ncp-blue", "Project", "Select the project to track",
                <div className="ncp-section-body">
                  <div className="ncp-prop-row">
                    <div className="ncp-prop-label">Project</div>
                    <ProjectPickerField
                      value={form.project_id}
                      onChange={(v) => f("project_id", v)}
                      projects={createProjects}
                    />
                  </div>
                </div>
              )}

              {/* Project info (edit mode) */}
              {!isCreate && selectedProject && section("🏢", "ncp-blue", "Project", `PRJ-${edit?.project_id}`,
                <div className="ncp-section-body">
                  <div className="ncp-prop-row">
                    <div className="ncp-prop-label">Account</div>
                    <div className="ncp-prop-input" style={{ color: "var(--ncp-text-secondary)" }}>{selectedProject.account_name || "—"}</div>
                  </div>
                  {selectedProject.engagement_name && (
                    <div className="ncp-prop-row">
                      <div className="ncp-prop-label">Engagement</div>
                      <div className="ncp-prop-input" style={{ color: "var(--ncp-text-secondary)" }}>{selectedProject.engagement_name}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Status */}
              {section("🔄", "ncp-amber", "Status", "Current transition stage",
                <div className="ncp-section-body">
                  <div style={{ padding: "4px 6px" }}>
                    <StatusPicker value={form.status || "draft"} onChange={(v) => f("status", v)} disabled={readOnly} />
                  </div>
                </div>
              )}

              {/* Ownership */}
              {section("👤", "ncp-green", "Ownership", "Who is leading this transition",
                <div className="ncp-section-body">
                  <div className="ncp-prop-row">
                    <div className="ncp-prop-label">Transition lead</div>
                    <UserPickerDropdown
                      value={form.transition_done_by_user_id}
                      onChange={(v) => f("transition_done_by_user_id", v)}
                      users={platformUsers}
                      placeholder="— Assign owner —"
                    />
                  </div>
                </div>
              )}

            </div>

            {/* ════════════════════════════════════════
                TAB 1 — Milestones
            ════════════════════════════════════════ */}
            <div className={cn("ncp-panel", tab === 1 && "ncp-panel-active")}>

              {section("📅", "ncp-accent", "Key dates", "Milestone timeline for this transition",
                <div className="ncp-section-body">
                  {dateRow("Project signed", "project_signed_date")}
                  {dateRow("Kickoff", "kickoff_date")}
                  {dateRow("As-is study", "as_is_study_date")}
                  {dateRow("To-be / closure call", "to_be_presentation_date")}
                  {dateRow("Soft launch", "soft_launch_date")}
                  {dateRow("Go live", "go_live_date")}
                </div>
              )}

              {section("📊", "ncp-blue", "Progress metrics", "Ageing and dead days (leave blank for auto-calculation)",
                <div className="ncp-section-body">
                  {pr("Dead days (override)", "dead_days", { placeholder: "Auto-computed from signed → go-live", type: "number" })}
                  {pr("Ageing days (override)", "ageing_days", { placeholder: "Auto-computed from kickoff to today", type: "number" })}
                </div>
              )}

              {section("⚠️", "ncp-red", "Delays", "Reason if the transition is delayed",
                <>
                  {ta("Reason for delay", "reason_for_delay", 3, "Describe any blockers or delays…")}
                </>
              )}

            </div>

            {/* ════════════════════════════════════════
                TAB 2 — People
            ════════════════════════════════════════ */}
            <div className={cn("ncp-panel", tab === 2 && "ncp-panel-active")}>

              {section("👥", "ncp-green", "Internal team", "Platform users attending this transition",
                <div className="ncp-section-body">
                  <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
                    <div className="ncp-prop-label" style={{ paddingTop: 6 }}>Attendees</div>
                    <MultiUserPicker
                      selectedIds={form.attendees_internal_ids ? form.attendees_internal_ids.split(",").filter(Boolean) : []}
                      onChange={(ids) => f("attendees_internal_ids", ids.join(","))}
                      users={platformUsers}
                      placeholder="Add internal attendees…"
                    />
                  </div>
                </div>
              )}

              {section("🌐", "ncp-blue", "External contacts", "Client-side or third-party attendees",
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
                        {!readOnly && (
                          <button
                            type="button"
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--ncp-text-muted)", padding: "0 4px" }}
                            onClick={() =>
                              setExtContacts((prev) =>
                                prev.length === 1 ? [emptyTrnExtContact()] : prev.filter((_, j) => j !== i),
                              )
                            }
                          >
                            ×
                          </button>
                        )}
                      </div>
                      {(
                        [
                          { label: "Name", key: "name" as const, placeholder: "Full name" },
                          { label: "Designation", key: "designation" as const, placeholder: "e.g. VP HR" },
                          { label: "Email", key: "email" as const, placeholder: "work@company.com" },
                          { label: "Phone", key: "phone" as const, placeholder: "+91 …" },
                        ] as const
                      ).map(({ label, key, placeholder }) => (
                        <div key={key} className="ncp-prop-row">
                          <div className="ncp-prop-label" style={{ paddingLeft: 28 }}>{label}</div>
                          <input
                            className="ncp-prop-input"
                            placeholder={placeholder}
                            disabled={readOnly}
                            value={c[key]}
                            onChange={(e) =>
                              setExtContacts((prev) =>
                                prev.map((x, j) => (j === i ? { ...x, [key]: e.target.value } : x)),
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                  {!readOnly && (
                    <button
                      type="button"
                      className="ncp-btn ncp-btn-ghost"
                      style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
                      onClick={() => setExtContacts((p) => [...p, emptyTrnExtContact()])}
                    >
                      + Add external contact
                    </button>
                  )}
                </>
              )}

            </div>

            {/* ════════════════════════════════════════
                TAB 3 — Documents
            ════════════════════════════════════════ */}
            <div className={cn("ncp-panel", tab === 3 && "ncp-panel-active")}>

              {section("📎", "ncp-accent", "Resources", "Key documents for this transition",
                <>
                  <div className="ncp-section-body">
                    {pr("RPO solution deck", "rpo_solution_deck_url", { placeholder: "https://…" })}
                    {pr("Transition document", "transition_document_url", { placeholder: "https://…" })}
                  </div>
                  <div className="ncp-section-body" style={{ borderTop: "1px solid var(--ncp-border)", paddingTop: 10 }}>
                    <div style={{ fontSize: 12, color: "var(--ncp-text-muted)", marginBottom: 10, lineHeight: 1.5 }}>
                      Attach files (PDF, Office, images, .txt up to 50 MB). Files are stored under{" "}
                      <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 11 }}>transition_documents/</span> on the server;
                      metadata is saved on this transition row.
                    </div>
                    {resourceAttachments.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                        {resourceAttachments.map((a) => (
                          <div key={a.filename} className="ncp-prop-row" style={{ borderTop: "none" }}>
                            <div className="ncp-prop-label" style={{ fontSize: 12 }}>Attachment</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                className="ncp-prop-input"
                                style={{ cursor: "pointer", color: "var(--ncp-accent)", textAlign: "left", flex: "1 1 200px" }}
                                onClick={() => {
                                  const pid = parseInt(form.project_id, 10);
                                  if (!Number.isNaN(pid)) {
                                    void queries.downloadTransitionResource(pid, a.filename, a.original_name || a.filename);
                                  }
                                }}
                              >
                                {a.original_name || a.filename}
                              </button>
                              {!readOnly && (
                                <button
                                  type="button"
                                  className="ncp-btn ncp-btn-ghost"
                                  style={{ padding: "4px 10px", flexShrink: 0 }}
                                  disabled={uploadingFile}
                                  onClick={() => void removeResourceFile(a)}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <input
                      ref={resourceFileInputRef}
                      type="file"
                      style={{ display: "none" }}
                      onChange={onPickResourceFile}
                    />
                    {!readOnly && (
                      <button
                        type="button"
                        className="ncp-btn ncp-btn-ghost"
                        disabled={uploadingFile}
                        style={{ marginTop: 4, width: "100%", justifyContent: "center" }}
                        onClick={() => resourceFileInputRef.current?.click()}
                      >
                        {uploadingFile ? "Uploading…" : "+ Attach file"}
                      </button>
                    )}
                  </div>
                </>
              )}

              {section("🔗", "ncp-blue", "Linked meetings", "MoM entries tied to this transition",
                <div className="ncp-section-body">
                  {meetingsListFailed ? (
                    <>
                      <div style={{ fontSize: 12, color: "var(--ncp-text-muted)", marginBottom: 10, lineHeight: 1.5 }}>
                        Could not load the meeting list (you may lack the Meetings module or API access). Enter IDs
                        manually, or open{" "}
                        <Link to="/meetings" style={{ color: "var(--ncp-accent)" }}>Meetings</Link>{" "}
                        in another tab.
                      </div>
                      {pr("Meeting IDs (comma-separated)", "linked_meeting_ids_json", { placeholder: "e.g. 12, 45, 67" })}
                    </>
                  ) : (
                    <LinkedMeetingsPicker
                      value={linkedMeetingIds}
                      onChange={applyLinkedMeetingIds}
                      meetings={meetingsPickPool}
                      labelLookup={allMeetings}
                      disabled={readOnly}
                    />
                  )}
                  <div style={{ padding: "8px 10px 4px", fontSize: 12, color: "var(--ncp-text-muted)", lineHeight: 1.45 }}>
                    List shows meetings you are allowed to see (same rules as the Meetings page). When a project is
                    selected above, results prefer this project and surface <em>transition_kickoff</em> first. Log new
                    MoMs in{" "}
                    <Link to="/meetings" style={{ color: "var(--ncp-accent)" }}>Meetings</Link>.
                  </div>
                </div>
              )}

            </div>

            {/* Save error */}
            {saveErr && (
              <div style={{ margin: "12px 0", padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--ncp-radius)", fontSize: 13, color: "#b91c1c" }}>
                {saveErr}
              </div>
            )}

          </div>
        </div>

        {/* ── Footer ─────────────────────────────────── */}
        <div className="ncp-footer">
          <button
            type="button"
            className="ncp-btn ncp-btn-ghost"
            onClick={tab > 0 ? () => setTab((t) => (t - 1) as TrnTabIdx) : onClose}
          >
            {tab > 0 ? "← Back" : "Cancel"}
          </button>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!readOnly && (
              <button
                type="button"
                className="ncp-btn ncp-btn-secondary"
                disabled={saving}
                onClick={() => void doSave(true)}
                title="Save with status = Draft"
              >
                Save as draft
              </button>
            )}

            {tab < TRN_TABS.length - 1 ? (
              <button
                type="button"
                className="ncp-btn ncp-btn-primary"
                onClick={() => setTab((t) => (t + 1) as TrnTabIdx)}
              >
                Next →
              </button>
            ) : (
              !readOnly && (
                <button
                  type="button"
                  className="ncp-btn ncp-btn-primary"
                  disabled={saving}
                  onClick={() => void doSave(false)}
                >
                  {saving ? "Saving…" : isCreate ? "Create tracker" : "Save changes"}
                </button>
              )
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  const s = (status || "draft") as TrnStatus;
  const m = STATUS_META[s] ?? STATUS_META.draft;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "2px 9px",
        borderRadius: "100px",
        fontSize: 11, fontWeight: 500,
        background: m.bg, color: m.color,
        border: `1px solid ${m.border}`,
        fontFamily: "var(--ncp-font)",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: m.dot, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

// ─── Transitions page ─────────────────────────────────────────────────────────

export function Transitions() {
  const { user } = useAuth();
  const readOnly = isReadOnlyClient(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const focusPid = searchParams.get("project");

  const [rows, setRows] = useState<ProjectTransitionRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [platformUsers, setPlatformUsers] = useState<PlatformUserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editRow, setEditRow] = useState<ProjectTransitionRow | null>(null);

  // ── Load data ─────────────────────────────────────────────────────────────

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
        const [,, users] = await Promise.all([
          refresh(),
          Promise.resolve(),
          Promise.all([
            queries.taskAssignableUsers().catch(() => [] as PlatformUserLite[]),
            adminApi.listUsers().catch(() => [] as PlatformUserLite[]),
          ]).then(([a, b]) => {
            const map = new Map<number, PlatformUserLite>();
            [...a, ...b].forEach((u) => map.set(u.id, u));
            return [...map.values()];
          }),
        ]);
        if (!cancelled) setPlatformUsers(users);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const existingPids = useMemo(() => new Set(rows.map((r) => r.project_id)), [rows]);
  const createProjects = useMemo(() => projects.filter((p) => !existingPids.has(p.id)), [projects, existingPids]);

  const metrics = useMemo(() => {
    const active = rows.filter((r) => r.status === "in_progress").length;
    const closed = rows.filter((r) => r.status === "live" || r.status === "soft_launched").length;
    const pipeline = rows.filter((r) => !r.status || r.status === "draft").length;
    const ageingRows = rows.filter(
      (r) => r.ageing_days_effective != null && !["live", "soft_launched", "cancelled"].includes(r.status ?? ""),
    );
    const avgAgeing =
      ageingRows.length
        ? Math.round(ageingRows.reduce((s, r) => s + (r.ageing_days_effective ?? 0), 0) / ageingRows.length)
        : null;
    return { active, closed, avgAgeing, pipeline };
  }, [rows]);

  // ── Open sheet handlers ───────────────────────────────────────────────────

  const openCreate = useCallback(() => {
    setEditRow(null);
    setSheetOpen(true);
  }, []);

  const openEditor = useCallback((row: ProjectTransitionRow) => {
    setEditRow(row);
    setSheetOpen(true);
  }, []);

  // Handle deep-link ?project=X
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        title="Client onboarding & transitions"
        subtitle="Track kickoff through go-live. Log MoMs under Meetings, then maintain this tracker and links to your transition document."
      />

      {readOnly && (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          View only — client portal accounts cannot edit this tracker.
        </div>
      )}
      {err && <div className="platform-dialog__alert">{err}</div>}

      {/* ── Process checklist ────────────────────────── */}
      <PlatformSection title="Process checklist">
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 1.7, color: "var(--text-muted)" }}>
          <li>Assign / confirm <strong>project head</strong> on the project directory.</li>
          <li>
            Record kickoff and workshop meetings in{" "}
            <Link to="/meetings" style={{ color: "var(--accent)" }}>Meetings (MoM)</Link>
            {" "}— use meeting types such as <em>transition_kickoff</em> for filtering.
          </li>
          <li>Create a <strong>transition tracker</strong> row per project below; add document URLs and milestone dates.</li>
          <li>
            Run day-to-day follow-ups in{" "}
            <Link to="/tasks" style={{ color: "var(--accent)" }}>Tasks</Link>.
          </li>
        </ol>
      </PlatformSection>

      {/* ── Transition pipeline ──────────────────────── */}
      <PlatformSection
        title="Transition pipeline"
        action="Refresh"
        onAction={() => void refresh()}
      >
        {/* 4 metric cards */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 18,
            padding: "14px 16px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
          }}
        >
          <MetricCard value={metrics.active} label="Open / In progress" accent />
          <MetricCard value={metrics.closed} label="Closed (Live)" />
          <MetricCard value={metrics.avgAgeing != null ? `${metrics.avgAgeing}d` : "—"} label="Avg. ageing" />
          <MetricCard value={metrics.pipeline} label="Pipeline (Draft)" muted />
        </div>

        {/* Create button */}
        {!readOnly && (
          <div style={{ marginBottom: 14 }}>
            <button
              type="button"
              className="platform-dialog__btn platform-dialog__btn--primary"
              onClick={openCreate}
            >
              + Create tracker
            </button>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <Skeleton height={200} />
        ) : (
          <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--border)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 920 }}>
              <thead>
                <tr style={{ textAlign: "left", background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>
                  <th style={{ padding: "8px 10px" }}>Project</th>
                  <th style={{ padding: "8px 10px" }}>Status</th>
                  <th style={{ padding: "8px 10px" }}>Signed</th>
                  <th style={{ padding: "8px 10px" }}>Kickoff</th>
                  <th style={{ padding: "8px 10px" }}>Go live</th>
                  <th style={{ padding: "8px 10px" }}>Dead days</th>
                  <th style={{ padding: "8px 10px" }}>Ageing</th>
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
                    <td style={{ padding: "8px 10px" }}>
                      <StatusBadge status={r.status} />
                    </td>
                    <td style={{ padding: "8px 10px" }}>{fmt(r.project_signed_date)}</td>
                    <td style={{ padding: "8px 10px" }}>{fmt(r.kickoff_date)}</td>
                    <td style={{ padding: "8px 10px" }}>{fmt(r.go_live_date)}</td>
                    <td style={{ padding: "8px 10px" }}>{r.dead_days_effective ?? "—"}</td>
                    <td style={{ padding: "8px 10px" }}>
                      {r.ageing_days_effective != null ? (
                        <span style={{ color: (r.ageing_days_effective ?? 0) > 90 ? "#b91c1c" : "inherit" }}>
                          {r.ageing_days_effective}d
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <button type="button" className="platform-dialog__btn" onClick={() => openEditor(r)}>
                        {readOnly ? "View" : "Edit"}
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
                      No transition trackers yet. Click "+ Create tracker" to start one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "8px 10px" }}>
              * Dead days and ageing are auto-computed when manual overrides are empty.
            </div>
          </div>
        )}
      </PlatformSection>

      {/* ── Side sheet ───────────────────────────────── */}
      <TransitionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        edit={editRow}
        createProjects={createProjects}
        allProjects={projects}
        platformUsers={platformUsers}
        readOnly={readOnly}
        onSaved={() => void refresh()}
        onPersistedTransition={(row) => {
          setEditRow(row);
          void refresh();
        }}
      />
    </div>
  );
}
