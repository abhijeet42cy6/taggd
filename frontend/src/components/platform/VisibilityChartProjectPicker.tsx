import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import "@/styles/new-contract-panel.css";

export type ChartProjectOption = { id: number; name: string };

type Props = {
  options: ChartProjectOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  /** Used when the user unchecks the last project — typically random / priority re-pick. */
  resampleWhenEmpty: () => number[];
  label: string;
  triggerPlaceholder: string;
  ariaLabel: string;
  /** e.g. "Search projects…" */
  searchPlaceholder?: string;
  /** Wider list panel than trigger (px). */
  minPanelWidth?: number;
};

function projectOptInitials(name: string): string {
  const t = name.replace(/[^a-zA-Z0-9\s]/g, " ").trim();
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return t.slice(0, 2).toUpperCase() || "PR";
}

function triggerSummary(selectedIds: number[], options: ChartProjectOption[], placeholder: string): string {
  if (selectedIds.length === 0) return placeholder;
  const byId = new Map(options.map((o) => [o.id, o.name] as const));
  const first = selectedIds[0]!;
  const a = byId.get(first) ?? `PRJ-${first}`;
  if (selectedIds.length === 1) return a;
  if (selectedIds.length === 2) {
    const b = byId.get(selectedIds[1]!) ?? `PRJ-${selectedIds[1]}`;
    return `${a}, ${b}`;
  }
  return `${a}, ${byId.get(selectedIds[1]!) ?? `PRJ-${selectedIds[1]}`} +${selectedIds.length - 2}`;
}

export function VisibilityChartProjectPicker({
  options,
  selectedIds,
  onChange,
  resampleWhenEmpty,
  label,
  triggerPlaceholder,
  ariaLabel,
  searchPlaceholder = "Search projects…",
  minPanelWidth = 300,
}: Props) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => {
      const idStr = `prj-${o.id}`;
      return (
        o.name.toLowerCase().includes(s) || String(o.id).includes(s) || idStr.includes(s) || `prj ${o.id}`.includes(s)
      );
    });
  }, [options, q]);

  const summary = useMemo(
    () => triggerSummary(selectedIds, options, triggerPlaceholder),
    [selectedIds, options, triggerPlaceholder],
  );

  const toggle = useCallback(
    (id: number) => {
      if (selected.has(id)) {
        const next = selectedIds.filter((x) => x !== id);
        onChange(next.length > 0 ? next : resampleWhenEmpty());
      } else {
        onChange([...selectedIds, id]);
      }
    },
    [selected, selectedIds, onChange, resampleWhenEmpty],
  );

  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    const measure = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, minPanelWidth) });
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
  }, [open, minPanelWidth]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || portalRef.current?.contains(t)) return;
      setOpen(false);
      setQ("");
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setQ("");
      }
    }
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div
      className="new-contract-sheet"
      style={{ width: "100%", margin: 0, padding: 0, background: "transparent", minHeight: 0, boxShadow: "none" }}
    >
      <div className="ncp-project-wrap" ref={wrapRef} style={{ marginBottom: 0 }}>
        <button
          ref={btnRef}
          type="button"
          className={cn("ncp-project-btn", (selectedIds.length > 0 || open) && "ncp-selected")}
          onClick={() => {
            setOpen((v) => !v);
            if (open) setQ("");
          }}
          style={{ padding: "10px 12px", fontSize: 12, borderRadius: 8 }}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          id={`${uid}-rt-chart-trigger`}
        >
          <span className="ncp-project-icon" style={{ width: 32, height: 32, fontSize: 12 }}>
            {selectedIds.length > 0 ? String(selectedIds.length) : "+"}
          </span>
          <div className="ncp-project-meta" style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 12.5, lineHeight: 1.25 }}>{summary}</strong>
            <span style={{ fontSize: 10.5 }}>{open ? "Choose projects below" : "Search or select (multi)"}</span>
          </div>
          <span style={{ color: "var(--ncp-accent)" }}>▾</span>
        </button>

        {open && rect
          ? createPortal(
              <div
                ref={portalRef}
                className="new-contract-sheet"
                style={{
                  position: "fixed",
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  zIndex: 250,
                  pointerEvents: "auto",
                  minHeight: 0,
                  height: "auto",
                  display: "block",
                  background: "transparent",
                }}
              >
                <div className="ncp-project-dd ncp-open ncp-project-dd--portal" onClick={(e) => e.stopPropagation()}>
                  <div className="ncp-project-search" style={{ paddingTop: 10 }}>
                    <span style={{ opacity: 0.5 }}>🔍</span>
                    <input
                      type="search"
                      placeholder={searchPlaceholder}
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      autoFocus
                      aria-label={searchPlaceholder}
                    />
                  </div>
                  <div
                    className="ncp-dd-scroll"
                    style={{ maxHeight: 240 }}
                    role="listbox"
                    aria-label={label}
                    onWheel={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                  >
                    {filtered.map((p) => {
                      const isOn = selected.has(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className="ncp-project-opt"
                          role="option"
                          aria-selected={isOn}
                          onClick={() => toggle(p.id)}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: 3,
                              border: `1.5px solid var(--ncp-border-focus)`,
                              flexShrink: 0,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 10,
                              fontWeight: 700,
                              background: isOn ? "var(--ncp-accent)" : "transparent",
                              color: isOn ? "#fff" : "transparent",
                            }}
                          >
                            {isOn ? "✓" : ""}
                          </span>
                          <span className="ncp-proj-ico" style={{ fontSize: 10.5, fontWeight: 700 }}>
                            {projectOptInitials(p.name)}
                          </span>
                          <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: "6px 10px" }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "var(--ncp-accent)",
                                fontFamily: "var(--ncp-mono)",
                                flex: "0 0 auto",
                              }}
                            >
                              PRJ-{p.id}
                            </span>
                            <span style={{ fontWeight: 500, color: "var(--ncp-text-primary)", flex: "1 1 120px" }}>{p.name}</span>
                          </div>
                        </button>
                      );
                    })}
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
