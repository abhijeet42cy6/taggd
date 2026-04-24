import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { queries, type Project, type RevenueForecastWeeklyRow } from "@/lib/api";
import { isProjectEligibleForFinanceAccountList } from "@/lib/dashboard-aggregates";
import { cn, formatDate } from "@/lib/utils";
import { GovernanceForecastGroupedBarChart, type GovernanceGroupedBarSeries } from "@/components/platform/Charts";
import { VisibilityChartProjectPicker, type ChartProjectOption } from "@/components/platform/VisibilityChartProjectPicker";
import "@/styles/exec-dashboard.css";
import "@/styles/new-contract-panel.css";

const WEEK_PALETTE = [
  "#7c3aed",
  "#2563eb",
  "#059669",
  "#d97706",
  "#db2777",
  "#0891b2",
  "#4f46e5",
  "#b45309",
];

function inrToCr(inr: number): number {
  return inr / 1e7;
}

function weekDataKey(iso: string): string {
  return `wk_${iso.replace(/-/g, "_")}`;
}

function projectDisplayName(p: Project): string {
  return (p.account_name || p.engagement_name || p.filename || `Project ${p.id}`).trim();
}

/** Picker: no prospects; no hard-inactive directory rows; include finance-eligible accounts or any project with tracker forecast rows. */
function isGovernanceForecastProjectOption(p: Project, trackerProjectIds: Set<number>): boolean {
  if ((p.client_lifecycle_state ?? "").toLowerCase() === "prospect") return false;
  const st = (p.account_status ?? "").trim().toLowerCase();
  if (
    st &&
    /inactive|lapsed|closed|cancel|churn|lost|on\s*hold|dormant|suspended|dropped/.test(st)
  ) {
    return false;
  }
  if (trackerProjectIds.has(p.id)) return true;
  return isProjectEligibleForFinanceAccountList(p);
}

function dedupeForecastRows(rows: RevenueForecastWeeklyRow[]): Map<string, RevenueForecastWeeklyRow> {
  const m = new Map<string, RevenueForecastWeeklyRow>();
  for (const r of rows) {
    if (!r.week_start_date) continue;
    const k = `${r.project_id}|${r.week_start_date}`;
    const prev = m.get(k);
    if (!prev || r.id > prev.id) m.set(k, r);
  }
  return m;
}

function GovChartSectionCard({ tag, title, children }: { tag: string; title: string; children: React.ReactNode }) {
  return (
    <div className="exec-section-card">
      <div className="exec-section-card__header">
        <div>
          <div className="exec-section-card__tag">{tag}</div>
          <div className="exec-section-card__title">{title}</div>
        </div>
      </div>
      <div style={{ padding: "16px 20px" }}>{children}</div>
    </div>
  );
}

type WeekMultiPickerProps = {
  options: { iso: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  resampleWhenEmpty: () => string[];
};

function GovernanceWeekMultiPicker({ options, selected, onChange, resampleWhenEmpty }: WeekMultiPickerProps) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => o.iso.includes(s) || o.label.toLowerCase().includes(s));
  }, [options, q]);

  const summary = useMemo(() => {
    if (!selected.length) return "Select weeks…";
    if (selected.length === 1) {
      const o = options.find((x) => x.iso === selected[0]);
      return o?.label ?? selected[0]!;
    }
    return `${selected.length} weeks`;
  }, [selected, options]);

  const toggle = useCallback(
    (iso: string) => {
      if (selectedSet.has(iso)) {
        const next = selected.filter((x) => x !== iso);
        onChange(next.length > 0 ? next : resampleWhenEmpty());
      } else {
        onChange([...selected, iso]);
      }
    },
    [selectedSet, selected, onChange, resampleWhenEmpty],
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
      setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 280) });
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
      <div className="ncp-project-wrap" ref={wrapRef} style={{ marginBottom: 0, width: "100%", minWidth: 0 }}>
        <button
          ref={btnRef}
          type="button"
          className={cn("ncp-project-btn", (selected.length > 0 || open) && "ncp-selected")}
          onClick={() => {
            setOpen((v) => !v);
            if (open) setQ("");
          }}
          style={{ padding: "10px 12px", fontSize: 12, borderRadius: 8, width: "100%" }}
          aria-label="Select ISO week starts"
          aria-expanded={open}
          aria-haspopup="listbox"
          id={`${uid}-wk-trigger`}
        >
          <span className="ncp-project-icon" style={{ width: 32, height: 32, fontSize: 11 }}>
            {selected.length > 0 ? String(selected.length) : "📅"}
          </span>
          <div className="ncp-project-meta" style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 12.5, lineHeight: 1.25 }}>{summary}</strong>
            <span style={{ fontSize: 10.5 }}>{open ? "Toggle weeks below" : "Week starts (multi)"}</span>
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
                      placeholder="Search weeks…"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      autoFocus
                      aria-label="Search weeks"
                    />
                  </div>
                  <div
                    className="ncp-dd-scroll"
                    style={{ maxHeight: 260 }}
                    role="listbox"
                    aria-label="Week starts"
                    onWheel={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                  >
                    {filtered.map((o) => {
                      const isOn = selectedSet.has(o.iso);
                      return (
                        <button
                          key={o.iso}
                          type="button"
                          className="ncp-project-opt"
                          role="option"
                          aria-selected={isOn}
                          onClick={() => toggle(o.iso)}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: 3,
                              border: "1.5px solid var(--ncp-border-focus)",
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
                            W
                          </span>
                          <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                            <span style={{ fontWeight: 600, color: "var(--ncp-text-primary)", fontSize: 11 }}>{o.label}</span>
                            <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 10, color: "var(--ncp-text-muted)" }}>{o.iso}</span>
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

export function RevenueGovernanceForecastAnalytics() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [forecastSample, setForecastSample] = useState<RevenueForecastWeeklyRow[]>([]);
  const [forecastRows, setForecastRows] = useState<RevenueForecastWeeklyRow[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingForecasts, setLoadingForecasts] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [selectedWeekIsos, setSelectedWeekIsos] = useState<string[]>([]);

  const trackerProjectIds = useMemo(() => new Set(forecastSample.map((r) => r.project_id)), [forecastSample]);

  const chartOptions: ChartProjectOption[] = useMemo(() => {
    const eligible = projects.filter((p) => isGovernanceForecastProjectOption(p, trackerProjectIds));
    const latestWeekByProject = new Map<number, string>();
    for (const r of forecastSample) {
      if (!r.week_start_date) continue;
      const prev = latestWeekByProject.get(r.project_id);
      if (!prev || r.week_start_date > prev) latestWeekByProject.set(r.project_id, r.week_start_date);
    }
    const scored = eligible.map((p) => ({
      p,
      sortKey: latestWeekByProject.get(p.id) ?? "",
    }));
    scored.sort((a, b) => {
      if (a.sortKey !== b.sortKey) return b.sortKey.localeCompare(a.sortKey);
      return projectDisplayName(a.p).localeCompare(projectDisplayName(b.p), undefined, { sensitivity: "base" });
    });
    return scored.map(({ p }) => ({ id: p.id, name: projectDisplayName(p) }));
  }, [projects, forecastSample, trackerProjectIds]);

  useEffect(() => {
    let cancelled = false;
    setLoadingProjects(true);
    Promise.all([queries.projects(), queries.revenueForecastWeekly({ limit: 500 })])
      .then(([list, fc]) => {
        if (cancelled) return;
        setProjects(Array.isArray(list) ? list : []);
        setForecastSample(fc.items ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setProjects([]);
          setForecastSample([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loadingProjects || chartOptions.length === 0 || selectedProjectIds.length > 0) return;
    const inSample = new Set(forecastSample.map((r) => r.project_id));
    const fromTracker = chartOptions.filter((o) => inSample.has(o.id)).slice(0, 5).map((o) => o.id);
    setSelectedProjectIds(fromTracker.length ? fromTracker : chartOptions.slice(0, 5).map((o) => o.id));
  }, [loadingProjects, chartOptions, forecastSample, selectedProjectIds.length]);

  useEffect(() => {
    if (selectedProjectIds.length === 0) {
      setForecastRows([]);
      return;
    }
    let cancelled = false;
    setLoadingForecasts(true);
    Promise.all(selectedProjectIds.map((id) => queries.revenueForecastWeekly({ project_id: id, limit: 600 })))
      .then((chunks) => {
        if (cancelled) return;
        const merged: RevenueForecastWeeklyRow[] = [];
        for (const c of chunks) merged.push(...(c.items ?? []));
        setForecastRows(merged);
      })
      .catch(() => {
        if (!cancelled) setForecastRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingForecasts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectIds]);

  /** Global sample + per-project fetches so weeks/values render immediately from the 500-row pull. */
  const mergedForecastRows = useMemo(() => {
    if (selectedProjectIds.length === 0) return [];
    const sel = new Set(selectedProjectIds);
    const out: RevenueForecastWeeklyRow[] = [];
    for (const r of forecastRows) {
      if (sel.has(r.project_id)) out.push(r);
    }
    for (const r of forecastSample) {
      if (sel.has(r.project_id)) out.push(r);
    }
    return out;
  }, [forecastRows, forecastSample, selectedProjectIds]);

  const sortedWeekIsos = useMemo(() => {
    const set = new Set<string>();
    for (const r of mergedForecastRows) {
      if (r.week_start_date) set.add(r.week_start_date);
    }
    return [...set].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }, [mergedForecastRows]);

  useEffect(() => {
    if (!sortedWeekIsos.length) {
      setSelectedWeekIsos([]);
      return;
    }
    setSelectedWeekIsos((prev) => {
      const kept = prev.filter((w) => sortedWeekIsos.includes(w));
      if (kept.length) return kept;
      return sortedWeekIsos.slice(0, Math.min(2, sortedWeekIsos.length));
    });
  }, [sortedWeekIsos]);

  /** Avoid empty charts before the week-selection effect runs (sync fallback to latest 2 weeks). */
  const chartWeekIsos = useMemo(() => {
    const valid = selectedWeekIsos.filter((w) => sortedWeekIsos.includes(w));
    if (valid.length) return valid;
    return sortedWeekIsos.slice(0, Math.min(2, sortedWeekIsos.length));
  }, [selectedWeekIsos, sortedWeekIsos]);

  const weekPickerOptions = useMemo(
    () =>
      sortedWeekIsos.map((iso) => ({
        iso,
        label: `Week of ${formatDate(iso)}`,
      })),
    [sortedWeekIsos],
  );

  const resampleWeeks = useCallback(() => sortedWeekIsos.slice(0, Math.min(2, sortedWeekIsos.length)), [sortedWeekIsos]);

  const resampleProjects = useCallback(() => {
    if (chartOptions.length === 0) return [];
    return chartOptions.slice(0, 5).map((o) => o.id);
  }, [chartOptions]);

  const deduped = useMemo(() => dedupeForecastRows(mergedForecastRows), [mergedForecastRows]);

  const chartSeries: GovernanceGroupedBarSeries[] = useMemo(() => {
    return chartWeekIsos.map((iso, i) => ({
      dataKey: weekDataKey(iso),
      name: `Week of ${formatDate(iso)}`,
      fill: WEEK_PALETTE[i % WEEK_PALETTE.length]!,
    }));
  }, [chartWeekIsos]);

  const chartData = useMemo(() => {
    const nameById = new Map(chartOptions.map((o) => [o.id, o.name] as const));
    return selectedProjectIds.map((pid) => {
      const baseName = nameById.get(pid) ?? `PRJ-${pid}`;
      const short = baseName.length > 22 ? `${baseName.slice(0, 20)}…` : baseName;
      const row: Record<string, string | number | undefined> = { name: short };
      for (const iso of chartWeekIsos) {
        const rec = deduped.get(`${pid}|${iso}`);
        const key = weekDataKey(iso);
        row[key] = rec ? inrToCr(rec.revenue_forecast_inr) : undefined;
      }
      return row;
    });
  }, [selectedProjectIds, chartWeekIsos, deduped, chartOptions]);

  const netChartData = useMemo(() => {
    const nameById = new Map(chartOptions.map((o) => [o.id, o.name] as const));
    return selectedProjectIds.map((pid) => {
      const baseName = nameById.get(pid) ?? `PRJ-${pid}`;
      const short = baseName.length > 22 ? `${baseName.slice(0, 20)}…` : baseName;
      const row: Record<string, string | number | undefined> = { name: short };
      for (const iso of chartWeekIsos) {
        const rec = deduped.get(`${pid}|${iso}`);
        const key = weekDataKey(iso);
        row[key] = rec ? inrToCr(rec.net_revenue_inr) : undefined;
      }
      return row;
    });
  }, [selectedProjectIds, chartWeekIsos, deduped, chartOptions]);

  const mmfChartData = useMemo(() => {
    const nameById = new Map(chartOptions.map((o) => [o.id, o.name] as const));
    return selectedProjectIds.map((pid) => {
      const baseName = nameById.get(pid) ?? `PRJ-${pid}`;
      const short = baseName.length > 22 ? `${baseName.slice(0, 20)}…` : baseName;
      const row: Record<string, string | number | undefined> = { name: short };
      for (const iso of chartWeekIsos) {
        const rec = deduped.get(`${pid}|${iso}`);
        const key = weekDataKey(iso);
        row[key] = rec ? inrToCr(rec.mmf_inr) : undefined;
      }
      return row;
    });
  }, [selectedProjectIds, chartWeekIsos, deduped, chartOptions]);

  const busy = loadingProjects || loadingForecasts;

  return (
    <div className="exec-dash" style={{ gap: 16 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto",
          alignItems: "end",
          gap: "10px 14px",
          width: "100%",
        }}
      >
        <div style={{ minWidth: 0, width: "100%" }}>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">Projects (X-axis)</div>
          {loadingProjects ? (
            <div className="text-xs text-muted-foreground font-mono">Loading projects…</div>
          ) : (
            <VisibilityChartProjectPicker
              options={chartOptions}
              selectedIds={selectedProjectIds}
              onChange={setSelectedProjectIds}
              resampleWhenEmpty={resampleProjects}
              label="Projects for chart"
              triggerPlaceholder="Search or select projects…"
              ariaLabel="Select projects for governance charts"
              searchPlaceholder="Search projects…"
              minPanelWidth={280}
            />
          )}
        </div>
        <div style={{ minWidth: 0, width: "100%" }}>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">Weeks (grouped bars)</div>
          <GovernanceWeekMultiPicker
            options={weekPickerOptions}
            selected={selectedWeekIsos}
            onChange={setSelectedWeekIsos}
            resampleWhenEmpty={resampleWeeks}
          />
        </div>
        <div style={{ justifySelf: "end", paddingBottom: 2, whiteSpace: "nowrap" }}>
          {busy ? (
            <span className="text-xs text-muted-foreground font-mono">Refreshing…</span>
          ) : (
            <span className="text-xs text-muted-foreground font-mono">
              {forecastRows.length} row{forecastRows.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      <div className="exec-charts" style={{ gridTemplateColumns: "1fr" }}>
        <GovChartSectionCard tag="Governance" title="Weekly revenue forecast — by project & week (₹ Cr)">
          <GovernanceForecastGroupedBarChart data={chartData} series={chartSeries} height={340} />
        </GovChartSectionCard>
      </div>

      <div className="exec-charts">
        <GovChartSectionCard tag="Governance" title="Net revenue — same selection (₹ Cr)">
          <GovernanceForecastGroupedBarChart data={netChartData} series={chartSeries} height={280} />
        </GovChartSectionCard>
        <GovChartSectionCard tag="Governance" title="MMF — same selection (₹ Cr)">
          <GovernanceForecastGroupedBarChart data={mmfChartData} series={chartSeries} height={280} />
        </GovChartSectionCard>
      </div>
    </div>
  );
}
