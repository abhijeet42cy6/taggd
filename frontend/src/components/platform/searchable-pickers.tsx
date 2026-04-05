import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "@/lib/api";

export type MetricOption = { id: number; label: string; account: string };

export function projectLabel(p: Project): string {
  return `${(p.account_name || p.filename || `Project ${p.id}`).slice(0, 100)} (ID ${p.id})`;
}

/** Type-to-filter; value must be chosen from the list (validated on submit). */
export function SearchableProjectPicker({
  projects,
  loading,
  projectId,
  onProjectIdChange,
}: {
  projects: Project[];
  loading: boolean;
  projectId: number | "";
  onProjectIdChange: (id: number | "") => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!projectId) setDraft("");
  }, [projectId]);

  const selected = projects.find((p) => p.id === projectId);
  const selectedLabel = selected ? projectLabel(selected) : "";

  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => projectLabel(p).toLowerCase().includes(q));
  }, [projects, draft]);

  const displayValue = focused ? draft : selected ? selectedLabel : draft;

  const pick = (p: Project) => {
    onProjectIdChange(p.id);
    setDraft("");
    setPanelOpen(false);
    setFocused(false);
  };

  return (
    <div className="relative w-full max-w-none">
      <input
        ref={inputRef}
        type="text"
        className="platform-search w-full max-w-none"
        role="combobox"
        aria-expanded={panelOpen}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={loading}
        placeholder={loading ? "Loading projects…" : "Type to search, then pick a client"}
        value={displayValue}
        onChange={(e) => {
          setDraft(e.target.value);
          onProjectIdChange("");
          setPanelOpen(true);
          setFocused(true);
        }}
        onFocus={() => {
          setFocused(true);
          setPanelOpen(true);
          setDraft(selected ? selectedLabel : "");
          requestAnimationFrame(() => inputRef.current?.select());
        }}
        onBlur={() => {
          setTimeout(() => {
            setFocused(false);
            setPanelOpen(false);
          }, 180);
        }}
      />
      {panelOpen && !loading && filtered.length > 0 && (
        <ul
          className="absolute left-0 right-0 z-[60] mt-1 max-h-60 overflow-auto rounded-md border border-border/80 bg-background py-1 text-xs shadow-lg"
          role="listbox"
        >
          {filtered.map((p) => (
            <li key={p.id} role="option">
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-muted/80"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
              >
                {projectLabel(p)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SearchableStringPicker({
  items,
  value,
  onChange,
  placeholder,
  disabled,
  emptyHint,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  emptyHint?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value) setDraft("");
  }, [value]);

  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => s.toLowerCase().includes(q));
  }, [items, draft]);

  const displayValue = focused ? draft : value || draft;

  return (
    <div className="relative w-full max-w-none">
      <input
        ref={inputRef}
        type="text"
        className="platform-search w-full max-w-none"
        role="combobox"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={displayValue}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange("");
          setPanelOpen(true);
          setFocused(true);
        }}
        onFocus={() => {
          setFocused(true);
          setPanelOpen(true);
          setDraft(value || "");
          requestAnimationFrame(() => inputRef.current?.select());
        }}
        onBlur={() => setTimeout(() => { setFocused(false); setPanelOpen(false); }, 180)}
      />
      {emptyHint && !value && !focused ? (
        <p className="text-muted-foreground mt-1 text-[10px]">{emptyHint}</p>
      ) : null}
      {panelOpen && !disabled && filtered.length > 0 && (
        <ul className="absolute left-0 right-0 z-[60] mt-1 max-h-52 overflow-auto rounded-md border border-border/80 bg-background py-1 text-xs shadow-lg">
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-muted/80"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s);
                  setDraft("");
                  setPanelOpen(false);
                  setFocused(false);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SearchableMetricOptionPicker({
  options,
  metricId,
  onMetricIdChange,
  disabled,
}: {
  options: MetricOption[];
  metricId: number | null;
  onMetricIdChange: (id: number | null) => void;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (metricId == null) setDraft("");
  }, [metricId]);

  const selected = options.find((o) => o.id === metricId);
  const selectedLabel = selected ? selected.label : "";

  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        String(o.id).includes(q),
    );
  }, [options, draft]);

  const displayValue = focused ? draft : selected ? selectedLabel : draft;

  return (
    <div className="relative w-full max-w-none">
      <input
        ref={inputRef}
        type="text"
        className="platform-search w-full max-w-none"
        role="combobox"
        autoComplete="off"
        disabled={disabled}
        placeholder={disabled ? "—" : "Type to search KPIs…"}
        value={displayValue}
        onChange={(e) => {
          setDraft(e.target.value);
          onMetricIdChange(null);
          setPanelOpen(true);
          setFocused(true);
        }}
        onFocus={() => {
          setFocused(true);
          setPanelOpen(true);
          setDraft(selected ? selectedLabel : "");
          requestAnimationFrame(() => inputRef.current?.select());
        }}
        onBlur={() => setTimeout(() => { setFocused(false); setPanelOpen(false); }, 180)}
      />
      {panelOpen && !disabled && filtered.length > 0 && (
        <ul className="absolute left-0 right-0 z-[60] mt-1 max-h-60 overflow-auto rounded-md border border-border/80 bg-background py-1 text-xs shadow-lg">
          {filtered.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-muted/80"
                title={o.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onMetricIdChange(o.id);
                  setDraft("");
                  setPanelOpen(false);
                  setFocused(false);
                }}
              >
                <span className="block max-h-10 overflow-hidden text-left leading-snug">{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
