import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { PlatformUserLite } from "@/components/platform/NewContractOrgFlow";

export type SlaFilterProject = {
  id: number;
  account_name: string;
  engagement_name?: string | null;
};

function userColor(email: string) {
  const palette = ["#6366f1", "#e16f3d", "#14b8a6", "#f59e0b", "#3884ff", "#2ecc71", "#ec4899"];
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) & 0xfffffff;
  return palette[Math.abs(h) % palette.length];
}

function userInitialsFromEmail(email: string) {
  const [a = "", b = ""] = email.split("@")[0].split(/[._-]/);
  return (a[0] + (b[0] || a[1] || "")).toUpperCase() || "?";
}

/** Match ingest-style practice head label to a platform user (email / local-part heuristics). */
export function matchUserForPracticeHead(ph: string, users: PlatformUserLite[]): PlatformUserLite | null {
  const t = ph.trim().toLowerCase();
  if (!t) return null;
  for (const u of users) {
    const e = u.email.toLowerCase();
    if (e === t) return u;
    const local = e.split("@")[0];
    if (local === t) return u;
  }
  const compact = t.replace(/\s+/g, "");
  for (const u of users) {
    const local = u.email.split("@")[0].replace(/[._-]/g, "");
    if (!local) continue;
    if (compact === local || local.includes(compact) || compact.includes(local)) return u;
  }
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const guess = `${tokens[0][0] || ""}${tokens[tokens.length - 1][0] || ""}`;
    for (const u of users) {
      const initials = userInitialsFromEmail(u.email);
      if (initials.toLowerCase() === guess) return u;
    }
  }
  return null;
}

function projInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const w = parts[0] || "?";
  return w.slice(0, 2).toUpperCase();
}

/**
 * Collapsed multi-select (NCP `ncp-prop-row` + portal list) for string option lists —
 * same interaction model as Practice head, without user-directory matching.
 */
export function SlaMultiStringPicker({
  label,
  options,
  value,
  onChange,
  emptyHint,
  searchPlaceholder,
  nounPlural,
  leadingEmptyGlyph,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  emptyHint: string;
  searchPlaceholder: string;
  nounPlural: string;
  /** Shown in the trigger when nothing is selected (e.g. 👤 or 📍). */
  leadingEmptyGlyph: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [ddRect, setDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setDdRect(null);
      return;
    }
    const measure = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setDdRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 320) });
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
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || portalRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const filteredOpts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  function toggle(x: string) {
    if (value.includes(x)) onChange(value.filter((v) => v !== x));
    else onChange([...value, x]);
  }

  const summary =
    value.length === 0 ? null : value.length === 1 ? value[0] : `${value.length} ${nounPlural}`;

  const panel = (
    <div className={cn("ncp-user-dd", open && "ncp-open", "ncp-user-dd--portal")} onClick={(e) => e.stopPropagation()}>
      <div className="ncp-project-search">
        <span style={{ opacity: 0.5 }}>🔍</span>
        <input
          type="search"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus={open}
        />
        {value.length > 0 ? (
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
        ) : null}
      </div>
      <div className="ncp-dd-scroll" style={{ maxHeight: 280 }} onWheel={(e) => e.stopPropagation()}>
        {filteredOpts.length === 0 ? (
          <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ncp-text-muted)" }}>
            No matches for “{search.trim()}”.
          </div>
        ) : (
          filteredOpts.map((opt) => {
            const checked = value.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                className="ncp-project-opt"
                style={{
                  background: checked ? "color-mix(in srgb, var(--ncp-accent) 8%, transparent)" : undefined,
                }}
                onClick={() => toggle(opt)}
              >
                <span
                  className="ncp-user-ico"
                  style={{
                    background: "var(--ncp-border)",
                    color: "var(--ncp-text-muted)",
                    fontSize: 11,
                    fontFamily: "var(--ncp-mono)",
                  }}
                >
                  {opt.slice(0, 2).toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div style={{ fontWeight: checked ? 600 : 500, color: "var(--ncp-text-primary)" }}>{opt}</div>
                </div>
                {checked ? <span style={{ color: "var(--ncp-accent)", fontSize: 12 }}>✓</span> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="ncp-prop-row">
      <div className="ncp-prop-label">{label}</div>
      <div className="ncp-user-wrap" ref={wrapRef}>
        <button
          ref={btnRef}
          type="button"
          className={cn("ncp-user-btn", value.length > 0 && "ncp-selected")}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          {value.length > 0 ? (
            <>
              <span
                className="ncp-user-ico"
                style={{
                  background: "var(--ncp-border)",
                  color: "var(--ncp-text-muted)",
                  fontSize: 11,
                  fontFamily: "var(--ncp-mono)",
                }}
              >
                {value.length === 1 ? value[0].slice(0, 2).toUpperCase() : String(value.length)}
              </span>
              <div className="ncp-user-meta">
                <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</strong>
              </div>
              <span style={{ color: "var(--ncp-accent)", marginLeft: "auto" }}>▾</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 16, opacity: 0.45 }}>{leadingEmptyGlyph}</span>
              <span>{emptyHint}</span>
              <span style={{ color: "var(--ncp-text-muted)", marginLeft: "auto" }}>▾</span>
            </>
          )}
        </button>
        {open &&
          ddRect &&
          createPortal(
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
              {panel}
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}

/** Multi-select practice heads with NCP user-picker styling; non-users show “--” in the avatar slot. */
export function SlaPracticeHeadMultiPicker({
  options,
  value,
  onChange,
  users,
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  users: PlatformUserLite[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [ddRect, setDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setDdRect(null);
      return;
    }
    const measure = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setDdRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 320) });
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
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || portalRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const filteredOpts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  function toggle(ph: string) {
    if (value.includes(ph)) onChange(value.filter((x) => x !== ph));
    else onChange([...value, ph]);
  }

  const summary =
    value.length === 0
      ? null
      : value.length === 1
        ? value[0]
        : `${value.length} practice heads`;

  const firstUser = value.length === 1 ? matchUserForPracticeHead(value[0], users) : null;

  const panel = (
    <div className={cn("ncp-user-dd", open && "ncp-open", "ncp-user-dd--portal")} onClick={(e) => e.stopPropagation()}>
      <div className="ncp-project-search">
        <span style={{ opacity: 0.5 }}>🔍</span>
        <input
          type="search"
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus={open}
        />
        {value.length > 0 ? (
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
        ) : null}
      </div>
      <div className="ncp-dd-scroll" style={{ maxHeight: 280 }} onWheel={(e) => e.stopPropagation()}>
        {filteredOpts.length === 0 ? (
          <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ncp-text-muted)" }}>
            No practice heads match “{search.trim()}”.
          </div>
        ) : (
          filteredOpts.map((ph) => {
            const checked = value.includes(ph);
            const u = matchUserForPracticeHead(ph, users);
            return (
              <button
                key={ph}
                type="button"
                className="ncp-project-opt"
                style={{
                  background: checked ? "color-mix(in srgb, var(--ncp-accent) 8%, transparent)" : undefined,
                }}
                onClick={() => toggle(ph)}
              >
                {u ? (
                  <span className="ncp-user-ico" style={{ background: userColor(u.email) }}>
                    {userInitialsFromEmail(u.email)}
                  </span>
                ) : (
                  <span
                    className="ncp-user-ico"
                    style={{
                      background: "var(--ncp-border)",
                      color: "var(--ncp-text-muted)",
                      fontSize: 11,
                      fontFamily: "var(--ncp-mono)",
                    }}
                  >
                    --
                  </span>
                )}
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div style={{ fontWeight: checked ? 600 : 500, color: "var(--ncp-text-primary)" }}>{ph}</div>
                  {u ? (
                    <div style={{ fontSize: 11, color: "var(--ncp-text-muted)", fontFamily: "var(--ncp-mono)" }}>
                      {u.email}
                    </div>
                  ) : null}
                </div>
                {checked ? <span style={{ color: "var(--ncp-accent)", fontSize: 12 }}>✓</span> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="ncp-prop-row">
      <div className="ncp-prop-label">Practice head</div>
      <div className="ncp-user-wrap" ref={wrapRef}>
        <button
          ref={btnRef}
          type="button"
          className={cn("ncp-user-btn", value.length > 0 && "ncp-selected")}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          {value.length > 0 ? (
            <>
              {firstUser ? (
                <span className="ncp-user-ico" style={{ background: userColor(firstUser.email) }}>
                  {userInitialsFromEmail(firstUser.email)}
                </span>
              ) : (
                <span
                  className="ncp-user-ico"
                  style={{
                    background: "var(--ncp-border)",
                    color: "var(--ncp-text-muted)",
                    fontSize: 11,
                    fontFamily: "var(--ncp-mono)",
                  }}
                >
                  --
                </span>
              )}
              <div className="ncp-user-meta">
                <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</strong>
                {value.length === 1 && firstUser ? <span>{firstUser.email}</span> : null}
              </div>
              <span style={{ color: "var(--ncp-accent)", marginLeft: "auto" }}>▾</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 16, opacity: 0.4 }}>👤</span>
              <span>— Assign owner —</span>
              <span style={{ color: "var(--ncp-text-muted)", marginLeft: "auto" }}>▾</span>
            </>
          )}
        </button>
        {open &&
          ddRect &&
          createPortal(
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
              {panel}
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}

/** Multi-select accounts with NCP project-picker styling (PRJ-··· + search). */
export function SlaAccountMultiProjectPicker({
  projects,
  value,
  onChange,
}: {
  projects: SlaFilterProject[];
  value: string[];
  onChange: (accountNames: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [ddRect, setDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const selectedProjects = useMemo(() => {
    const byName = new Map(projects.map((p) => [p.account_name, p]));
    return value.map((name) => byName.get(name)).filter(Boolean) as SlaFilterProject[];
  }, [projects, value]);

  useLayoutEffect(() => {
    if (!open) {
      setDdRect(null);
      return;
    }
    const measure = () => {
      const b = btnRef.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      setDdRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 320) });
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.account_name.toLowerCase().includes(q) ||
        String(p.id).includes(q) ||
        `prj-${p.id}`.includes(q) ||
        (p.engagement_name || "").toLowerCase().includes(q),
    );
  }, [projects, search]);

  function toggle(name: string) {
    if (value.includes(name)) onChange(value.filter((x) => x !== name));
    else onChange([...value, name]);
  }

  const prjLine = (p: SlaFilterProject) => (p.id > 0 ? `PRJ-${p.id}` : "—");

  const triggerSummary =
    selectedProjects.length === 0
      ? null
      : selectedProjects.length === 1
        ? `${selectedProjects[0].account_name} · ${prjLine(selectedProjects[0])}`
        : `${selectedProjects.length} projects`;

  const ddPanel = (
    <div className="ncp-project-dd ncp-open ncp-project-dd--portal" onClick={(e) => e.stopPropagation()}>
      <div className="ncp-project-search">
        <span style={{ opacity: 0.5 }}>🔍</span>
        <input
          type="search"
          placeholder="Search projects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        {value.length > 0 ? (
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
        ) : null}
      </div>
      <div className="ncp-dd-scroll" style={{ maxHeight: 280 }} onWheel={(e) => e.stopPropagation()}>
        {filtered.length === 0 ? (
          <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ncp-text-muted)" }}>
            {projects.length === 0 ? "No projects in SLA data." : "No projects match your search."}
          </div>
        ) : (
          filtered.map((p) => {
            const checked = value.includes(p.account_name);
            return (
              <button
                key={p.id}
                type="button"
                className="ncp-project-opt"
                style={{
                  background: checked ? "color-mix(in srgb, var(--ncp-accent) 8%, transparent)" : undefined,
                }}
                onClick={() => toggle(p.account_name)}
              >
                <span className="ncp-proj-ico">{projInitials(p.account_name)}</span>
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div style={{ fontWeight: checked ? 600 : 500, color: "var(--ncp-text-primary)" }}>
                    {p.account_name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ncp-text-muted)", fontFamily: "var(--ncp-mono)" }}>
                    {p.id > 0 ? `PRJ-${p.id}` : "—"}
                    {p.engagement_name ? ` · ${p.engagement_name}` : ""}
                  </div>
                </div>
                {checked ? <span style={{ color: "var(--ncp-accent)", fontSize: 12 }}>✓</span> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="ncp-prop-row">
      <div className="ncp-prop-label">Project</div>
      <div className="ncp-project-wrap" ref={wrapRef}>
        <button
          ref={btnRef}
          type="button"
          className={cn("ncp-project-btn", selectedProjects.length > 0 && "ncp-selected")}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          {selectedProjects.length > 0 ? (
            <>
              <span className="ncp-project-icon">{projInitials(selectedProjects[0].account_name)}</span>
              <div className="ncp-project-meta" style={{ minWidth: 0 }}>
                <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {triggerSummary}
                </strong>
                {selectedProjects.length === 1 ? (
                  <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 11 }}>{prjLine(selectedProjects[0])}</span>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: 20 }}>＋</span>
              <span style={{ opacity: 0.5 }}>Search or select a project (PRJ-···)</span>
            </>
          )}
          <span style={{ marginLeft: "auto", color: "var(--ncp-text-muted)", flexShrink: 0 }}>▾</span>
        </button>
        {open &&
          ddRect &&
          createPortal(
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
    </div>
  );
}
