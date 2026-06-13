import React, { useEffect, useMemo, useRef, useState } from "react";
import { Select, SelectItem, Text } from "@tremor/react";
import { cn } from "@/lib/utils";

const TRIGGER_CLASS =
  "relative w-full outline-none text-left whitespace-nowrap truncate rounded-tremor-default focus:ring-2 transition duration-100 border pr-8 py-2 shadow-tremor-input focus:border-tremor-brand-subtle focus:ring-tremor-brand-muted pl-3 bg-tremor-background hover:bg-tremor-background-muted text-tremor-content-emphasis border-tremor-border dark:bg-dark-tremor-background dark:hover:bg-dark-tremor-background-muted dark:text-dark-tremor-content-emphasis dark:border-dark-tremor-border dark:shadow-dark-tremor-input dark:focus:border-dark-tremor-brand-subtle dark:focus:ring-dark-tremor-brand-muted";

export function SearchableTremorFilterSelect({
  label,
  value,
  onValueChange,
  options,
  allLabel = "All",
  searchableThreshold = 5,
  className,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: string[];
  allLabel?: string;
  searchableThreshold?: number;
  className?: string;
}) {
  const searchable = options.length > searchableThreshold;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const display =
    value === "all" ? allLabel : options.includes(value) ? value : value || allLabel;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
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
    onValueChange(v);
    setOpen(false);
    setQuery("");
  };

  if (!searchable) {
    return (
      <div className={cn("min-w-[10rem]", className)}>
        <Text className="mb-1 font-semibold text-tremor-content-emphasis">{label}</Text>
        <Select value={value} onValueChange={onValueChange}>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </Select>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={cn("relative min-w-[10rem]", className)}>
      <Text className="mb-1 font-semibold text-tremor-content-emphasis">{label}</Text>
      <button
        type="button"
        className={cn(TRIGGER_CLASS, open && "border-tremor-brand-subtle ring-2 ring-tremor-brand-muted")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="block truncate pr-1">{display}</span>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
          ▾
        </span>
      </button>
      {open ? (
        <div
          className="absolute left-0 right-0 top-full z-[100] mt-1 overflow-hidden rounded-tremor-default border border-tremor-border bg-tremor-background shadow-lg dark:border-dark-tremor-border dark:bg-dark-tremor-background"
          role="listbox"
        >
          <div className="border-b border-tremor-border p-2 dark:border-dark-tremor-border">
            <input
              ref={searchRef}
              type="search"
              className="w-full rounded-tremor-default border border-tremor-border bg-tremor-background px-2.5 py-1.5 text-xs text-tremor-content-emphasis outline-none focus:border-tremor-brand-subtle focus:ring-2 focus:ring-tremor-brand-muted dark:border-dark-tremor-border dark:bg-dark-tremor-background dark:text-dark-tremor-content-emphasis"
              placeholder={`Search ${label.toLowerCase()}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button"
              role="option"
              aria-selected={value === "all"}
              className={cn(
                "w-full px-3 py-2 text-left text-xs hover:bg-tremor-background-muted dark:hover:bg-dark-tremor-background-muted",
                value === "all" && "bg-orange-50 font-semibold text-orange-700 dark:bg-orange-950/30 dark:text-orange-300",
              )}
              onClick={() => pick("all")}
            >
              {allLabel}
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                No matches for “{query.trim()}”
              </div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o}
                  type="button"
                  role="option"
                  aria-selected={value === o}
                  className={cn(
                    "w-full px-3 py-2 text-left text-xs hover:bg-tremor-background-muted dark:hover:bg-dark-tremor-background-muted",
                    value === o && "bg-orange-50 font-semibold text-orange-700 dark:bg-orange-950/30 dark:text-orange-300",
                  )}
                  onClick={() => pick(o)}
                >
                  {o}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
