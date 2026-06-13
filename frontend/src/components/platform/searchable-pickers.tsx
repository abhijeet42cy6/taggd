import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "@/lib/api";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string };

/** Dashboard-style filter: native select when ≤ threshold options, searchable dropdown when more. */
export function SearchableFilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
  minWidth = 130,
  searchableThreshold = 5,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: FilterOption[];
  allLabel?: string;
  minWidth?: number;
  searchableThreshold?: number;
  className?: string;
}) {
  const searchable = options.length > searchableThreshold;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedLabel =
    value === "all"
      ? allLabel
      : options.find((o) => o.value === value)?.label ?? value;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  if (!searchable) {
    return (
      <label className={cn("dashboard-filter-field", className)} style={{ minWidth }}>
        <span className="dashboard-filter-label">{label}</span>
        <select
          className="dashboard-filter-select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        >
          <option value="all">{allLabel}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={cn("dashboard-filter-field clients-hub-filter-searchable", className)}
      style={{ minWidth, position: "relative" }}
    >
      <span className="dashboard-filter-label">{label}</span>
      <button
        type="button"
        className={cn("dashboard-filter-select clients-hub-filter-trigger", open && "clients-hub-filter-trigger--open")}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="clients-hub-filter-trigger__text">{selectedLabel}</span>
        <span className="clients-hub-filter-trigger__chev" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="clients-hub-filter-panel" role="listbox">
          <div className="clients-hub-filter-panel__search">
            <input
              ref={searchRef}
              type="search"
              className="platform-search"
              placeholder={`Search ${label.toLowerCase()}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
            />
          </div>
          <div className="clients-hub-filter-panel__list">
            <button
              type="button"
              role="option"
              aria-selected={value === "all"}
              className={cn("clients-hub-filter-option", value === "all" && "clients-hub-filter-option--active")}
              onClick={() => pick("all")}
            >
              {allLabel}
            </button>
            {filtered.length === 0 ? (
              <div className="clients-hub-filter-empty">No matches for “{query.trim()}”</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={value === o.value}
                  className={cn("clients-hub-filter-option", value === o.value && "clients-hub-filter-option--active")}
                  onClick={() => pick(o.value)}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type MetricOption = { id: number; label: string; account: string };

export function projectLabel(p: Project): string {
  return `${(p.account_name || p.filename || `Project ${p.id}`).slice(0, 100)} (ID ${p.id})`;
}

/** Human-readable project label for tables and filters (engagement / account name first). */
export function projectDisplayName(p: Project, opts?: { includePrj?: boolean }): string {
  const base =
    (p.engagement_name && String(p.engagement_name).trim()) ||
    (p.account_name && String(p.account_name).trim()) ||
    (p.filename && String(p.filename).trim()) ||
    `Project ${p.id}`;
  return opts?.includePrj ? `${base} · PRJ-${p.id}` : base;
}

/** Single-select project filter with search and an explicit “All projects” option. */
export function SearchableProjectFilterSelect({
  projects,
  value,
  onChange,
  disabled,
  className,
  ariaLabel = "Filter by project",
}: {
  projects: Project[];
  value: string;
  onChange: (projectId: string) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = value.trim() ? projects.find((p) => String(p.id) === value.trim()) : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const label = projectDisplayName(p, { includePrj: true }).toLowerCase();
      return label.includes(q) || String(p.id).includes(q) || `prj-${p.id}`.includes(q);
    });
  }, [projects, search]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (open) {
      setSearch("");
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  const triggerLabel = selected ? projectDisplayName(selected, { includePrj: true }) : "All projects";

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={wrapRef} className={className ? `relative w-full ${className}` : "relative w-full"}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="relative w-full truncate rounded-tremor-default border border-tremor-border bg-tremor-background py-2 pl-3 pr-8 text-left text-tremor-default text-tremor-content-emphasis shadow-tremor-input outline-none transition duration-100 hover:bg-tremor-background-muted focus:border-tremor-brand-subtle focus:ring-2 focus:ring-tremor-brand-muted disabled:opacity-50 dark:border-dark-tremor-border dark:bg-dark-tremor-background dark:text-dark-tremor-content-emphasis dark:shadow-dark-tremor-input dark:hover:bg-dark-tremor-background-muted dark:focus:border-dark-tremor-brand-subtle dark:focus:ring-dark-tremor-brand-muted"
        onClick={() => setOpen((o) => !o)}
      >
        {triggerLabel}
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-tremor-content-subtle">▾</span>
      </button>
      {open ? (
        <div
          className="absolute left-0 right-0 z-[80] mt-1 overflow-hidden rounded-tremor-default border border-tremor-border bg-tremor-background shadow-lg dark:border-dark-tremor-border dark:bg-dark-tremor-background"
          role="listbox"
        >
          <div className="border-b border-tremor-border p-2 dark:border-dark-tremor-border">
            <input
              ref={searchRef}
              type="search"
              className="platform-search w-full max-w-none text-xs"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button"
              role="option"
              aria-selected={!value.trim()}
              className={`w-full px-3 py-2 text-left text-xs hover:bg-tremor-background-muted dark:hover:bg-dark-tremor-background-muted ${!value.trim() ? "bg-orange-50 font-semibold text-orange-700 dark:bg-orange-950/30 dark:text-orange-300" : "text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis"}`}
              onClick={() => pick("")}
            >
              All projects
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-tremor-content-subtle">No projects match your search.</div>
            ) : (
              filtered.map((p) => {
                const id = String(p.id);
                const active = value.trim() === id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-tremor-background-muted dark:hover:bg-dark-tremor-background-muted ${active ? "bg-orange-50 font-semibold text-orange-700 dark:bg-orange-950/30 dark:text-orange-300" : "text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis"}`}
                    onClick={() => pick(id)}
                  >
                    {projectDisplayName(p, { includePrj: true })}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
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
