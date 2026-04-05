import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { api, invalidateCache, queries } from "@/lib/api";
import { formatNumber, formatPercent } from "@/lib/utils";
import { PlatformKpi, PlatformSection, PageHeader, StatusTag } from "@/components/platform/PlatformBlocks";
import { SkeletonKpiRow, SkeletonTable } from "@/components/platform/Skeleton";
import { GaugeRing, HcIdealActualGroupedChart, WlDistributionBar, WfmProductivityFillChart } from "@/components/platform/Charts";
import { WfmBenchmarkFormDialog } from "@/components/platform/WfmBenchmarkFormDialog";
import {
  wfmFillPct,
  wfmFillColor,
  wfmFillBand,
  wfmStatusLabel,
  wfmMatchesFilter,
  wfmRowsVm,
  type WfmBenchmarkRowVm,
} from "@/lib/view-models/wfm";


type PerformFilter = "all" | "strong" | "watch" | "risk";
type ExpandMode = null | "hc" | "gap" | "benchmark";

type BulletItem = {
  name: string;
  actual: number;
  ideal: number;
  color: string;
  pct: number;
  row: any;
};

// ─── FILTER CHIPS ─────────────────────────────────────────────────────────────
function FilterChips({ value, onChange }: { value: PerformFilter; onChange: (v: PerformFilter) => void }) {
  const chips: { key: PerformFilter; label: string; color: string }[] = [
    { key: "all", label: "All", color: "var(--text-subtle)" },
    { key: "strong", label: "On plan 70–100%", color: "var(--green)" },
    { key: "watch", label: "Watch 50–69%", color: "var(--amber)" },
    { key: "risk", label: ">100% or <50%", color: "var(--red)" },
  ];
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {chips.map((c) => (
        <button key={c.key} onClick={() => onChange(c.key)} style={{
          padding: "2px 9px", borderRadius: 5, fontSize: 9.5,
          fontFamily: "'DM Mono',monospace", cursor: "pointer",
          border: `1px solid ${value === c.key ? c.color : "var(--border)"}`,
          background: value === c.key ? `${c.color}1a` : "transparent",
          color: value === c.key ? c.color : "var(--text-muted)",
          transition: "all .15s",
        }}>{c.label}</button>
      ))}
    </div>
  );
}

// ─── EXPAND MODAL ─────────────────────────────────────────────────────────────
function WfmExpandModal({
  mode, items, rows, filter, onFilterChange, onClose,
}: {
  mode: ExpandMode;
  items: BulletItem[];
  rows: any[];
  filter: PerformFilter;
  onFilterChange: (v: PerformFilter) => void;
  onClose: () => void;
}) {
  if (!mode) return null;

  const titles: Record<NonNullable<ExpandMode>, string> = {
    hc: "Ideal vs Actual HC — All Clients",
    gap: "Resource Gap Summary — All Clients",
    benchmark: "Workforce Benchmark Snapshot — All Clients",
  };

  const filteredItems = items.filter((b) => wfmMatchesFilter(b.pct, b.ideal, filter));

  const filteredRows = rows.filter((r: any) => {
    const ideal = Number(r.ideal_hc ?? 0);
    const actual = Number(r.actual_hc_total ?? 0);
    const pct = wfmFillPct(actual, ideal);
    return wfmMatchesFilter(pct, ideal, filter);
  });

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "color-mix(in srgb, var(--surface-page) 85%, transparent)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "var(--bg1)", border: "1px solid var(--border)",
        borderRadius: 14, width: "100%", maxWidth: 1000,
        maxHeight: "88vh", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
      }}>
        {/* HEADER */}
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{titles[mode]}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <FilterChips value={filter} onChange={onFilterChange} />
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
              {mode === "benchmark" ? filteredRows.length : filteredItems.length} clients
            </div>
            <button onClick={onClose} style={{
              background: "rgba(255,79,107,0.1)", border: "1px solid rgba(255,79,107,0.3)",
              color: "var(--red)", borderRadius: 6, padding: "4px 12px",
              cursor: "pointer", fontSize: 11, fontFamily: "'DM Mono',monospace",
            }}>✕ Close</button>
          </div>
        </div>

        {/* BODY */}
        <div style={{ overflowY: "auto", padding: "16px 20px", flex: 1 }}>
          {/* HC BULLET CHART — expanded */}
          {mode === "hc" && (
            filteredItems.length === 0
              ? <EmptyFilter />
              : <div style={{ display: "grid", gap: 8 }}>
                  {filteredItems.map((item) => {
                    const fullPct = wfmFillPct(item.actual, item.ideal);
                    const barPct = Math.min(100, fullPct);
                    const gap = item.ideal - item.actual;
                    const barBg = `linear-gradient(90deg, ${item.color}, color-mix(in srgb, ${item.color} 72%, transparent))`;
                    return (
                      <div key={item.name} style={{ display: "grid", gridTemplateColumns: "160px 1fr 90px 70px 80px", alignItems: "center", gap: 10 }}>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.name}</div>
                        <div style={{ height: 10, background: "var(--bg3)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                          <div style={{ position: "absolute", top: 0, left: 0, height: "100%", borderRadius: 3, width: `${barPct}%`, background: barBg, transition: "width .5s" }} />
                        </div>
                        <div style={{ fontSize: 10.5, fontFamily: "'DM Mono',monospace", color: item.color, textAlign: "right" }}>
                          {formatNumber(item.actual)} / {formatNumber(item.ideal)}
                        </div>
                        <div style={{ fontSize: 10.5, fontFamily: "'DM Mono',monospace", color: item.color, textAlign: "right" }}>
                          {formatPercent(fullPct)}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <StatusTag status={wfmStatusLabel(fullPct, item.ideal)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
          )}

          {/* RESOURCE GAP TABLE — expanded */}
          {mode === "gap" && (
            filteredItems.length === 0
              ? <EmptyFilter />
              : <div className="platform-table-wrap">
                  <table className="platform-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th style={{ textAlign: "right" }}>Ideal HC</th>
                        <th style={{ textAlign: "right" }}>Actual HC</th>
                        <th style={{ textAlign: "right" }}>HC Gap</th>
                        <th style={{ textAlign: "right" }}>Fill Rate</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((b) => {
                        const gap = b.ideal - b.actual;
                        return (
                          <tr key={b.name}>
                            <td style={{ fontWeight: 500 }}>{b.name}</td>
                            <td style={{ textAlign: "right", fontFamily: "'DM Mono',monospace" }}>{formatNumber(b.ideal)}</td>
                            <td style={{ textAlign: "right", fontFamily: "'DM Mono',monospace", color: b.color }}>{formatNumber(b.actual)}</td>
                            <td style={{ textAlign: "right", fontFamily: "'DM Mono',monospace", color: b.color }}>
                              {`${gap >= 0 ? "−" : "+"}${formatNumber(Math.abs(gap))}`}
                            </td>
                            <td style={{ textAlign: "right", fontFamily: "'DM Mono',monospace", color: b.color }}>
                              {formatPercent(b.pct)}
                            </td>
                            <td><StatusTag status={wfmStatusLabel(b.pct, b.ideal)} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
          )}

          {/* FULL BENCHMARK TABLE — expanded */}
          {mode === "benchmark" && (
            filteredRows.length === 0
              ? <EmptyFilter />
              : <div className="platform-table-wrap">
                  <table className="platform-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Practice head</th>
                        <th style={{ textAlign: "right" }}>Lateral Target</th>
                        <th style={{ textAlign: "right" }}>Productivity</th>
                        <th style={{ textAlign: "right" }}>Ideal HC</th>
                        <th style={{ textAlign: "right" }}>Actual HC</th>
                        <th style={{ textAlign: "right" }}>HC Gap</th>
                        <th style={{ textAlign: "right" }}>Fill Rate</th>
                        <th style={{ textAlign: "right" }}>WL1</th>
                        <th style={{ textAlign: "right" }}>WL2</th>
                        <th style={{ textAlign: "right" }}>WL3+</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((r: any, i: number) => {
                        const idealHcRow = Number(r.ideal_hc ?? 0);
                        const actualHcRow = Number(r.actual_hc_total ?? 0);
                        const hcGap = idealHcRow - actualHcRow;
                        const pct = wfmFillPct(actualHcRow, idealHcRow);
                        const gapColor = wfmFillColor(pct, idealHcRow);
                        return (
                          <tr key={i}>
                            <td style={{ fontWeight: 500 }}>{r.account_name || `Project ${r.project_id}`}</td>
                            <td style={{ fontSize: 11, color: "var(--text-muted)", maxWidth: 120 }} title={r.practice_head || ""}>{r.practice_head ? String(r.practice_head) : "—"}</td>
                            <td style={{ textAlign: "right" }}>{r.lateral_hc_target != null ? formatNumber(r.lateral_hc_target) : "—"}</td>
                            <td style={{ textAlign: "right" }}>{r.lateral_productivity_target != null ? formatPercent(r.lateral_productivity_target) : "—"}</td>
                            <td style={{ textAlign: "right" }}>{r.ideal_hc != null ? formatNumber(r.ideal_hc) : "—"}</td>
                            <td style={{ textAlign: "right", color: gapColor }}>{r.actual_hc_total != null ? formatNumber(r.actual_hc_total) : "—"}</td>
                            <td style={{ textAlign: "right", color: gapColor }}>{`${hcGap >= 0 ? "−" : "+"}${formatNumber(Math.abs(hcGap))}`}</td>
                            <td style={{ textAlign: "right", color: gapColor }}>{formatPercent(pct)}</td>
                            <td style={{ textAlign: "right" }}>{r.wl1_hires ?? "—"}</td>
                            <td style={{ textAlign: "right" }}>{r.wl2_hires ?? "—"}</td>
                            <td style={{ textAlign: "right" }}>{(r.wl3_hires ?? 0) + (r.wl4_hires ?? 0) || "—"}</td>
                            <td><StatusTag status={wfmStatusLabel(pct, idealHcRow)} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyFilter() {
  return (
    <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)", fontSize: 12, fontFamily: "'DM Mono',monospace" }}>
      No clients match this filter
    </div>
  );
}

// ─── CARD HEADER with Expand + Filter ─────────────────────────────────────────
function CardHeader({
  title, filter, onFilterChange, onExpand,
}: {
  title: string;
  filter: PerformFilter;
  onFilterChange: (v: PerformFilter) => void;
  onExpand: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <FilterChips value={filter} onChange={onFilterChange} />
        <button onClick={onExpand} title="Expand all clients" style={{
          background: "color-mix(in srgb, var(--accent) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
          color: "var(--accent)", borderRadius: 5, padding: "2px 8px",
          cursor: "pointer", fontSize: 11, fontFamily: "'DM Mono',monospace",
          lineHeight: 1.4,
        }}>⤢ All</button>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export function WorkforceManagement() {
  const [stats, setStats] = useState<any>(null);
  const [rows, setRows] = useState<WfmBenchmarkRowVm[]>([]);
  const [loading, setLoading] = useState(true);
  const [wfmDialogOpen, setWfmDialogOpen] = useState(false);

  const reloadWfm = useCallback(async () => {
    invalidateCache("wfm/");
    const [s, d] = await Promise.allSettled([queries.wfmStats(), queries.wfmData()]);
    if (s.status === "fulfilled") setStats(s.value);
    if (d.status === "fulfilled") setRows(wfmRowsVm(d.value || []));
  }, []);

  // per-card filter state
  const [hcFilter, setHcFilter] = useState<PerformFilter>("all");
  const [gapFilter, setGapFilter] = useState<PerformFilter>("risk"); // default: show at-risk in compact
  const [benchFilter, setBenchFilter] = useState<PerformFilter>("all");

  // expand modal state
  const [expandMode, setExpandMode] = useState<ExpandMode>(null);
  // shared filter for the expand modal (inherits from the card that opened it)
  const [expandFilter, setExpandFilter] = useState<PerformFilter>("all");

  // Productivity vs fill chart: empty selection = show all clients
  const [prodChartSelected, setProdChartSelected] = useState<string[]>([]);
  const [prodChartSearch, setProdChartSearch] = useState("");
  const [prodChartPickerOpen, setProdChartPickerOpen] = useState(false);
  const prodChartPickerWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!prodChartPickerOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const el = prodChartPickerWrapRef.current;
      if (el && !el.contains(e.target as Node)) setProdChartPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProdChartPickerOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [prodChartPickerOpen]);

  useEffect(() => {
    (async () => {
      const [s, d] = await Promise.allSettled([queries.wfmStats(), queries.wfmData()]);
      if (s.status === "fulfilled") setStats(s.value);
      if (d.status === "fulfilled") setRows(wfmRowsVm(d.value || []));
      setLoading(false);
    })();
  }, []);

  const onUpload = async (file?: File | null) => {
    if (!file) return;
    const form = new FormData(); form.append("file", file);
    await api.post("/wfm/upload", form);
    await reloadWfm();
  };

  function openExpand(mode: NonNullable<ExpandMode>, filter: PerformFilter) {
    setExpandMode(mode);
    setExpandFilter(filter);
  }

  const idealHc = Number(stats?.total_ideal_hc ?? 0);
  const actualHc = Number(stats?.total_actual_hc ?? 0);
  const fillRate = (actualHc / Math.max(idealHc, 1)) * 100;
  const gap = idealHc - actualHc;

  // ALL bullet items — no slice
  const allBulletItems = useMemo((): BulletItem[] => {
    if (rows.length === 0) return [];
    return rows.map((r: any) => {
      const ideal = Number(r.ideal_hc ?? 0);
      const actual = Number(r.actual_hc_total ?? 0);
      const pct = wfmFillPct(actual, ideal);
      const color = wfmFillColor(pct, ideal);
      return { name: r.account_name || `Project ${r.project_id}`, actual, ideal, color, pct, row: r };
    });
  }, [rows]);

  // Compact filtered bullet items (top 6 of filtered set)
  const compactHcItems = useMemo(() => {
    return allBulletItems
      .filter((b) => wfmMatchesFilter(b.pct, b.ideal, hcFilter))
      .slice(0, 6);
  }, [allBulletItems, hcFilter]);

  const compactGapItems = useMemo(() => {
    return allBulletItems
      .filter((b) => wfmMatchesFilter(b.pct, b.ideal, gapFilter))
      .slice(0, 6);
  }, [allBulletItems, gapFilter]);

  const fgColor = idealHc > 0 ? wfmFillColor(fillRate, idealHc) : "var(--accent)";
  const fillKpiAccent =
    idealHc <= 0 ? "amber" : wfmFillBand(fillRate, idealHc) === "strong" ? "green" : wfmFillBand(fillRate, idealHc) === "watch" ? "amber" : "red";

  // Real WL distribution from wfm rows (wl1_hires…wl4_hires per client)
  const wlData = useMemo(() => {
    if (!rows.length) return [];
    return rows
      .map((r: any) => ({
        name: (r.account_name || `P${r.project_id}`).length > 12
          ? (r.account_name || `P${r.project_id}`).slice(0, 11) + "…"
          : (r.account_name || `P${r.project_id}`),
        wl1: Number(r.wl1_hires ?? 0),
        wl2: Number(r.wl2_hires ?? 0),
        wl3: Number(r.wl3_hires ?? 0),
        wl4: Number(r.wl4_hires ?? 0),
      }))
      .filter((d) => d.wl1 + d.wl2 + d.wl3 + d.wl4 > 0);
  }, [rows]);

  // Compact benchmark rows (top 8 of filtered set)
  const compactBenchRows = useMemo(() => {
    return rows
      .filter((r: any) => {
        const ideal = Number(r.ideal_hc ?? 0);
        const actual = Number(r.actual_hc_total ?? 0);
        const pct = wfmFillPct(actual, ideal);
        return wfmMatchesFilter(pct, ideal, benchFilter);
      })
      .slice(0, 8);
  }, [rows, benchFilter]);

  const productivityFillChartAll = useMemo(() => {
    return rows
      .filter((r: any) => Number(r.ideal_hc ?? 0) > 0)
      .map((r: any) => {
        const ideal = Number(r.ideal_hc ?? 0);
        const actual = Number(r.actual_hc_total ?? 0);
        const pct = wfmFillPct(actual, ideal);
        const fullName = String(r.account_name || `Project ${r.project_id}`);
        const short = fullName.length > 14 ? `${fullName.slice(0, 13)}…` : fullName;
        return {
          fullName,
          name: short,
          fillPct: Math.round(pct * 10) / 10,
          productivity: Number(r.lateral_productivity_target ?? 0),
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [rows]);

  const productivityFillChartData = useMemo(() => {
    if (productivityFillChartAll.length === 0) return [];
    if (prodChartSelected.length === 0) return productivityFillChartAll;
    const sel = new Set(prodChartSelected);
    return productivityFillChartAll.filter((d) => sel.has(d.fullName));
  }, [productivityFillChartAll, prodChartSelected]);

  const prodChartPickerCandidates = useMemo(() => {
    const q = prodChartSearch.trim().toLowerCase();
    return productivityFillChartAll.filter((d) => {
      if (prodChartSelected.includes(d.fullName)) return false;
      if (!q) return true;
      return d.fullName.toLowerCase().includes(q);
    }).slice(0, 60);
  }, [productivityFillChartAll, prodChartSearch, prodChartSelected]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <PageHeader title="Workforce Management" subtitle="Fill rate vs ideal HC (≤100% on plan; >100% over-capacity) · Productivity targets · WL mix" />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-0 bg-[var(--accent)] px-3 py-1.5 text-[10.5px] font-semibold text-[var(--accent-foreground)] shadow-sm transition-colors hover:bg-[var(--accent-hover)]"
            onClick={() => setWfmDialogOpen(true)}
          >
            <Plus className="shrink-0" size={14} strokeWidth={2.5} aria-hidden />
            Add / edit WFM data
          </button>
          <label className="platform-chip active" style={{ cursor: "pointer" }}>
            ↑ Upload WFM
            <input type="file" hidden accept=".xlsx,.xls" onChange={(e) => onUpload(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      {/* KPI RIBBON */}
      {loading
        ? <SkeletonKpiRow count={3} />
        : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            <PlatformKpi label="Ideal HC" value={formatNumber(idealHc)} accent="teal" delta="— Target" />
            <PlatformKpi
              label="Actual HC"
              value={formatNumber(actualHc)}
              accent="blue"
              delta={`${gap >= 0 ? "−" : "+"}${formatNumber(Math.abs(gap))} gap`}
            />
            <PlatformKpi label="Fill Rate" value={idealHc > 0 ? formatPercent(fillRate) : "—"} accent={fillKpiAccent} subtext="≤100% on plan; >100% over-capacity" />
          </div>
        )
      }

      {/* HC BULLETS + GAUGE */}
      <div className="platform-grid-2">
        {/* HC — grouped horizontal bars (ideal vs actual per client) */}
        <section className="platform-card">
          <CardHeader
            title="Client HC — ideal vs actual"
            filter={hcFilter}
            onFilterChange={setHcFilter}
            onExpand={() => openExpand("hc", hcFilter)}
          />
          {rows.length === 0
            ? <div style={{ color: "var(--text-muted)", fontSize: 11, textAlign: "center", padding: "16px 0" }}>Upload WFM data to see HC breakdown</div>
            : compactHcItems.length === 0
              ? <div style={{ color: "var(--text-muted)", fontSize: 11, textAlign: "center", padding: "16px 0" }}>No clients match filter</div>
              : <HcIdealActualGroupedChart items={compactHcItems} />
          }
          <div style={{ marginTop: 8, fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
            Showing {compactHcItems.length} of {allBulletItems.length} clients · click ⤢ All for full list and status
          </div>
        </section>

        <PlatformSection title="WL Distribution + Capacity Gauge">
          {wlData.length === 0
            ? <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 11 }}>
                Upload WFM data to see WL distribution
              </div>
            : <WlDistributionBar data={wlData} />
          }
          <div style={{ marginTop: 16 }}>
            <GaugeRing
              value={fillRate}
              label="Capacity Fill Rate"
              sublabel={`${formatNumber(actualHc)} of ${formatNumber(idealHc)} positions`}
              color={fgColor}
            />
            <div style={{ marginTop: 6, fontSize: 10.5, color: "var(--red)", fontFamily: "'DM Mono',monospace" }}>
              {formatNumber(Math.abs(gap))} open gaps
            </div>
          </div>
        </PlatformSection>
      </div>

      {/* RESOURCE GAP */}
      <section className="platform-card">
        <CardHeader
          title="Resource Gap Summary"
          filter={gapFilter}
          onFilterChange={setGapFilter}
          onExpand={() => openExpand("gap", gapFilter)}
        />
        <div className="platform-table-wrap">
          <table className="platform-table">
            <thead><tr><th>Client</th><th>HC Gap</th><th>Fill Rate</th><th>Status</th></tr></thead>
            <tbody>
              {compactGapItems.length === 0 && (
                <tr><td colSpan={4} style={{ color: "var(--text-muted)", textAlign: "center" }}>No clients match filter</td></tr>
              )}
              {compactGapItems.map((b) => (
                <tr key={b.name}>
                  <td>{b.name}</td>
                  <td style={{ color: b.color }}>{`${b.ideal - b.actual >= 0 ? "−" : "+"}${formatNumber(Math.abs(b.ideal - b.actual))}`}</td>
                  <td style={{ color: b.color }}>{formatPercent(b.pct)}</td>
                  <td><StatusTag status={wfmStatusLabel(b.pct, b.ideal)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8, fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
          Showing {compactGapItems.length} of {allBulletItems.length} clients · click ⤢ All to see everyone
        </div>
      </section>

      <PlatformSection title="Productivity target vs fill rate (by client)">
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 10, fontFamily: "'DM Mono',monospace", lineHeight: 1.45 }}>
          Bars: fill rate (actual ÷ ideal HC). Line: productivity target from WFM. Dashed line: 100% fill — above = over-capacity (at risk).
          {productivityFillChartAll.length > 0 ? (
            <span style={{ display: "block", marginTop: 4 }}>
              {prodChartSelected.length === 0
                ? `Showing all ${productivityFillChartAll.length} clients — search below to narrow.`
                : `Showing ${productivityFillChartData.length} of ${productivityFillChartAll.length} selected clients.`}
            </span>
          ) : null}
        </div>
        {productivityFillChartAll.length > 0 && (
          <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
            <div ref={prodChartPickerWrapRef} style={{ position: "relative" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <input
                  className="platform-search"
                  style={{ flex: "1 1 200px", minWidth: 160, maxWidth: 320, fontSize: 12 }}
                  placeholder="Search clients to add…"
                  value={prodChartSearch}
                  onChange={(e) => setProdChartSearch(e.target.value)}
                  onFocus={() => setProdChartPickerOpen(true)}
                  onClick={() => setProdChartPickerOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setProdChartPickerOpen(false);
                  }}
                  aria-expanded={prodChartPickerOpen}
                  aria-haspopup="listbox"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="platform-chip"
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    if (prodChartPickerCandidates.length === 0) return;
                    const next = prodChartPickerCandidates[0].fullName;
                    if (!prodChartSelected.includes(next)) setProdChartSelected((s) => [...s, next]);
                    setProdChartSearch("");
                  }}
                  disabled={prodChartPickerCandidates.length === 0}
                >
                  + Add first match
                </button>
                <button
                  type="button"
                  className="platform-chip active"
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setProdChartSelected([]);
                    setProdChartSearch("");
                    setProdChartPickerOpen(false);
                  }}
                >
                  Show all clients
                </button>
              </div>
              {prodChartPickerOpen && prodChartPickerCandidates.length > 0 && (
                <div
                  role="listbox"
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: "100%",
                    marginTop: 6,
                    zIndex: 40,
                    maxHeight: 160,
                    overflowY: "auto",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "6px 0",
                    background: "color-mix(in srgb, var(--surface-muted) 98%, transparent)",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
                  }}
                >
                  <div style={{ fontSize: 9, color: "var(--text-muted)", padding: "0 12px 6px", fontFamily: "'DM Mono',monospace" }}>
                    Click to add · search narrows the list
                  </div>
                  {prodChartPickerCandidates.map((d) => (
                    <button
                      key={d.fullName}
                      type="button"
                      role="option"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setProdChartSelected((s) => (s.includes(d.fullName) ? s : [...s, d.fullName]));
                        setProdChartSearch("");
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "6px 12px",
                        border: "none",
                        background: "transparent",
                        color: "var(--text-muted)",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "color-mix(in srgb, var(--accent) 10%, transparent)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                    >
                      {d.fullName}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {prodChartSelected.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>SELECTED</span>
                {prodChartSelected.map((fn) => (
                  <button
                    key={fn}
                    type="button"
                    onClick={() => setProdChartSelected((s) => s.filter((x) => x !== fn))}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 8px",
                      borderRadius: 20,
                      border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
                      background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                      color: "var(--accent)",
                      fontSize: 10.5,
                      fontFamily: "'DM Mono',monospace",
                      cursor: "pointer",
                    }}
                  >
                    {fn.length > 28 ? `${fn.slice(0, 27)}…` : fn}
                    <span style={{ opacity: 0.7 }}>×</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <WfmProductivityFillChart data={productivityFillChartData} />
      </PlatformSection>

      {/* BENCHMARK TABLE CARD */}
      <section className="platform-card">
        <CardHeader
          title="Workforce Benchmark Snapshot"
          filter={benchFilter}
          onFilterChange={setBenchFilter}
          onExpand={() => openExpand("benchmark", benchFilter)}
        />
        <div className="platform-table-wrap">
          <table className="platform-table">
            <thead>
              <tr>
                <th>Client</th><th>Practice head</th><th>Lateral Target</th><th>HC Target</th><th>Productivity</th>
                <th>Ideal HC</th><th>Actual HC</th><th>HC Gap</th><th>WL1</th><th>WL2</th><th>WL3+</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={11} style={{ color: "var(--text-muted)", textAlign: "center" }}>Upload WFM file to populate data</td></tr>
              ) : compactBenchRows.length === 0 ? (
                <tr><td colSpan={11} style={{ color: "var(--text-muted)", textAlign: "center" }}>No clients match this filter</td></tr>
              ) : compactBenchRows.map((r: any, i: number) => {
                const idealN = Number(r.ideal_hc ?? 0);
                const actualN = Number(r.actual_hc_total ?? 0);
                const hcGap = idealN - actualN;
                const fillPct = wfmFillPct(actualN, idealN);
                const gapColor = wfmFillColor(fillPct, idealN);
                return (
                  <tr key={i}>
                    <td>{r.account_name || `Project ${r.project_id}`}</td>
                    <td style={{ fontSize: 11, color: "var(--text-muted)", maxWidth: 160 }} title={r.practice_head || ""}>
                      {r.practice_head ? String(r.practice_head) : "—"}
                    </td>
                    <td>{r.lateral_hc_target != null ? formatNumber(r.lateral_hc_target) : "—"}</td>
                    <td>{r.ideal_hc != null ? formatNumber(r.ideal_hc) : "—"}</td>
                    <td>{r.lateral_productivity_target != null ? formatPercent(r.lateral_productivity_target) : "—"}</td>
                    <td>{r.ideal_hc != null ? formatNumber(r.ideal_hc) : "—"}</td>
                    <td style={{ color: gapColor }}>{r.actual_hc_total != null ? formatNumber(r.actual_hc_total) : "—"}</td>
                    <td style={{ color: gapColor }}>{`${hcGap >= 0 ? "−" : "+"}${formatNumber(Math.abs(hcGap))}`}</td>
                    <td>{r.wl1_hires ?? "—"}</td>
                    <td>{r.wl2_hires ?? "—"}</td>
                    <td>{(r.wl3_hires ?? 0) + (r.wl4_hires ?? 0) || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8, fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
          Showing {compactBenchRows.length} of {rows.length} clients · click ⤢ All to see everyone
        </div>
      </section>

      {/* EXPAND MODAL */}
      <WfmExpandModal
        mode={expandMode}
        items={allBulletItems}
        rows={rows}
        filter={expandFilter}
        onFilterChange={setExpandFilter}
        onClose={() => setExpandMode(null)}
      />

      <WfmBenchmarkFormDialog
        open={wfmDialogOpen}
        onOpenChange={setWfmDialogOpen}
        wfmRows={rows}
        onSaved={reloadWfm}
      />
    </div>
  );
}
