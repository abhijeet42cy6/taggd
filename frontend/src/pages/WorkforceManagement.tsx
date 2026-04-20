import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { api, invalidateCache, queries } from "@/lib/api";
import { formatNumber, formatPercent } from "@/lib/utils";
import { PlatformSection, PageHeader } from "@/components/platform/PlatformBlocks";
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
  row: WfmBenchmarkRowVm;
};

// ─── helpers ──────────────────────────────────────────────────────────────────
function bandClass(band: "strong" | "watch" | "risk") {
  if (band === "strong") return "wfm-kpi-fill--green";
  if (band === "watch")  return "wfm-kpi-fill--amber";
  return "wfm-kpi-fill--red";
}

function deltaClass(band: "strong" | "watch" | "risk") {
  if (band === "strong") return "wfm-kpi-delta--green";
  if (band === "watch")  return "wfm-kpi-delta--amber";
  return "wfm-kpi-delta--red";
}

function statusClass(label: "Strong" | "Watch" | "At Risk") {
  if (label === "Strong")   return "wfm-status--on-track";
  if (label === "Watch")    return "wfm-status--watch";
  return "wfm-status--at-risk";
}

function barFillClass(pct: number, ideal: number) {
  const b = wfmFillBand(pct, ideal);
  if (b === "strong") return "wfm-bar-fill--green";
  if (b === "watch")  return "wfm-bar-fill--amber";
  return "wfm-bar-fill--red";
}

// ─── FILTER CHIPS ─────────────────────────────────────────────────────────────
const CHIPS: { key: PerformFilter; label: string; cls: string }[] = [
  { key: "all",    label: "All",          cls: "wfm-chip--active-accent" },
  { key: "strong", label: "On plan 70–100%", cls: "wfm-chip--active-green" },
  { key: "watch",  label: "Watch 50–69%",    cls: "wfm-chip--active-amber" },
  { key: "risk",   label: ">100% or <50%",   cls: "wfm-chip--active-red" },
];

function FilterChips({ value, onChange }: { value: PerformFilter; onChange: (v: PerformFilter) => void }) {
  return (
    <div className="wfm-chip-row">
      {CHIPS.map((c) => (
        <button
          key={c.key}
          className={`wfm-chip ${value === c.key ? c.cls : ""}`}
          onClick={() => onChange(c.key)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

// ─── KPI CARD ────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, delta, deltaClass: dCls, color, fillPct, fillClass,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: string;
  deltaClass?: string;
  color: string;
  fillPct?: number;
  fillClass?: string;
}) {
  return (
    <div className={`wfm-kpi-card wfm-kpi-card--${color}`}>
      <div className="wfm-kpi-label">{label}</div>
      <div className="wfm-kpi-primary">{value}</div>
      {delta && <span className={`wfm-kpi-delta ${dCls ?? "wfm-kpi-delta--muted"}`}>{delta}</span>}
      {sub && <div className="wfm-kpi-sub">{sub}</div>}
      {fillPct !== undefined && fillClass && (
        <div className="wfm-kpi-track">
          <div className={`wfm-kpi-fill ${fillClass}`} style={{ width: `${Math.min(fillPct, 100)}%` }} />
        </div>
      )}
    </div>
  );
}

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
function WfmStatus({ label }: { label: "Strong" | "Watch" | "At Risk" }) {
  return <span className={`wfm-status ${statusClass(label)}`}>{label}</span>;
}

// ─── EXPAND MODAL ─────────────────────────────────────────────────────────────
function WfmExpandModal({
  mode, items, rows, filter, onFilterChange, onClose,
}: {
  mode: ExpandMode;
  items: BulletItem[];
  rows: WfmBenchmarkRowVm[];
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
  const filteredRows = rows.filter((r) => {
    const ideal = Number(r.ideal_hc ?? 0);
    const actual = Number(r.actual_hc_total ?? 0);
    const pct = wfmFillPct(actual, ideal);
    return wfmMatchesFilter(pct, ideal, filter);
  });

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "color-mix(in srgb, var(--surface-page) 85%, transparent)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg1)", border: "1px solid var(--border)",
        borderRadius: 14, width: "100%", maxWidth: 1080,
        maxHeight: "88vh", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
      }}>
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, gap: 12,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{titles[mode]}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <FilterChips value={filter} onChange={onFilterChange} />
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)" }}>
              {mode === "benchmark" ? filteredRows.length : filteredItems.length} clients
            </span>
            <button
              onClick={onClose}
              style={{
                background: "var(--red-soft)", border: "1px solid color-mix(in srgb, var(--red) 30%, transparent)",
                color: "var(--red)", borderRadius: 6, padding: "4px 12px", cursor: "pointer",
                fontSize: 11, fontFamily: "var(--mono)",
              }}
            >
              ✕ Close
            </button>
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "16px 20px", flex: 1 }}>
          {/* HC BULLET CHART — expanded */}
          {mode === "hc" && (
            filteredItems.length === 0
              ? <div className="wfm-empty">No clients match this filter</div>
              : <div style={{ display: "grid", gap: 8 }}>
                  {filteredItems.map((item) => {
                    const barPct = Math.min(100, item.pct);
                    const statusLbl = wfmStatusLabel(item.pct, item.ideal);
                    const fc = barFillClass(item.pct, item.ideal);
                    return (
                      <div key={item.name} style={{ display: "grid", gridTemplateColumns: "180px 1fr 100px 70px 90px", alignItems: "center", gap: 10 }}>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{item.name}</div>
                        <div className="wfm-bar-track" style={{ height: 6 }}>
                          <div className={`wfm-bar-fill ${fc}`} style={{ width: `${barPct}%`, height: "100%" }} />
                        </div>
                        <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: item.color, textAlign: "right" }}>
                          {formatNumber(item.actual)} / {formatNumber(item.ideal)}
                        </div>
                        <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: item.color, textAlign: "right" }}>
                          {formatPercent(item.pct)}
                        </div>
                        <div style={{ textAlign: "right" }}><WfmStatus label={statusLbl} /></div>
                      </div>
                    );
                  })}
                </div>
          )}

          {/* RESOURCE GAP TABLE — expanded */}
          {mode === "gap" && (
            filteredItems.length === 0
              ? <div className="wfm-empty">No clients match this filter</div>
              : <div style={{ overflowX: "auto" }}>
                  <table className="wfm-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th className="right">Ideal HC</th>
                        <th className="right">Actual HC</th>
                        <th className="right">HC Gap</th>
                        <th className="right">Fill Rate</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((b) => {
                        const gap = b.ideal - b.actual;
                        const statusLbl = wfmStatusLabel(b.pct, b.ideal);
                        return (
                          <tr key={b.name}>
                            <td><span className="wfm-table__name">{b.name}</span></td>
                            <td className="right">{formatNumber(b.ideal)}</td>
                            <td className="right" style={{ color: b.color }}>{formatNumber(b.actual)}</td>
                            <td className="right" style={{ color: b.color }}>
                              {gap >= 0 ? "−" : "+"}{formatNumber(Math.abs(gap))}
                            </td>
                            <td className="right" style={{ color: b.color }}>{formatPercent(b.pct)}</td>
                            <td><WfmStatus label={statusLbl} /></td>
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
              ? <div className="wfm-empty">No clients match this filter</div>
              : <div style={{ overflowX: "auto" }}>
                  <table className="wfm-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Practice Head</th>
                        <th className="right">Lateral Tgt</th>
                        <th className="right">Productivity</th>
                        <th className="right">Ideal HC</th>
                        <th className="right">Actual HC</th>
                        <th className="right">HC Gap</th>
                        <th className="right">Fill Rate</th>
                        <th className="right">WL1</th>
                        <th className="right">WL2</th>
                        <th className="right">WL3+</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((r, i) => {
                        const idealN = Number(r.ideal_hc ?? 0);
                        const actualN = Number(r.actual_hc_total ?? 0);
                        const hcGap = idealN - actualN;
                        const pct = wfmFillPct(actualN, idealN);
                        const gapColor = wfmFillColor(pct, idealN);
                        const statusLbl = wfmStatusLabel(pct, idealN);
                        return (
                          <tr key={i}>
                            <td><span className="wfm-table__name">{r.account_name || `Project ${r.project_id}`}</span></td>
                            <td><span className="wfm-table__muted" title={r.practice_head || ""}>{r.practice_head || "—"}</span></td>
                            <td className="right">{r.lateral_hc_target != null ? formatNumber(r.lateral_hc_target) : "—"}</td>
                            <td className="right">{r.lateral_productivity_target != null ? formatPercent(r.lateral_productivity_target) : "—"}</td>
                            <td className="right">{formatNumber(idealN)}</td>
                            <td className="right" style={{ color: gapColor }}>{formatNumber(actualN)}</td>
                            <td className="right" style={{ color: gapColor }}>{hcGap >= 0 ? "−" : "+"}{formatNumber(Math.abs(hcGap))}</td>
                            <td className="right" style={{ color: gapColor }}>{formatPercent(pct)}</td>
                            <td className="right">{r.wl1_hires ?? "—"}</td>
                            <td className="right">{r.wl2_hires ?? "—"}</td>
                            <td className="right">{(r.wl3_hires ?? 0) + (r.wl4_hires ?? 0) || "—"}</td>
                            <td><WfmStatus label={statusLbl} /></td>
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

  const [tableFilter, setTableFilter] = useState<PerformFilter>("all");
  const [expandMode, setExpandMode] = useState<ExpandMode>(null);
  const [expandFilter, setExpandFilter] = useState<PerformFilter>("all");

  // Productivity chart client picker
  const [prodChartSelected, setProdChartSelected] = useState<string[]>([]);
  const [prodChartSearch, setProdChartSearch] = useState("");
  const [prodChartPickerOpen, setProdChartPickerOpen] = useState(false);
  const prodChartPickerWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!prodChartPickerOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (prodChartPickerWrapRef.current && !prodChartPickerWrapRef.current.contains(e.target as Node)) {
        setProdChartPickerOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setProdChartPickerOpen(false); };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDocDown); document.removeEventListener("keydown", onKey); };
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
    const form = new FormData();
    form.append("file", file);
    await api.post("/wfm/upload", form);
    await reloadWfm();
  };

  // ── derived metrics ─────────────────────────────────────────────────────────
  const idealHc = Number(stats?.total_ideal_hc ?? 0);
  const actualHc = Number(stats?.total_actual_hc ?? 0);
  const fillRate = idealHc > 0 ? (actualHc / idealHc) * 100 : 0;
  const hcGap = idealHc - actualHc;

  // Projected HC = actual + wl1 + wl2 + wl3 + wl4 − resignations (not tracked; just sum hires)
  const totalWl1 = useMemo(() => rows.reduce((s, r) => s + Number(r.wl1_hires ?? 0), 0), [rows]);
  const totalWl2 = useMemo(() => rows.reduce((s, r) => s + Number(r.wl2_hires ?? 0), 0), [rows]);
  const totalWl3 = useMemo(() => rows.reduce((s, r) => s + Number(r.wl3_hires ?? 0) + Number(r.wl4_hires ?? 0), 0), [rows]);
  const totalAdditional = totalWl1 + totalWl2 + totalWl3;
  const projectedHc = actualHc + totalAdditional;
  const varActual = projectedHc - actualHc;   // additional support / pipeline
  const openPositions = hcGap > 0 ? hcGap : 0;

  const fillBand = idealHc > 0 ? wfmFillBand(fillRate, idealHc) : "risk";
  const fgColor = idealHc > 0 ? wfmFillColor(fillRate, idealHc) : "var(--accent)";

  // Bullet items for all clients
  const allBulletItems = useMemo((): BulletItem[] =>
    rows.map((r) => {
      const ideal = Number(r.ideal_hc ?? 0);
      const actual = Number(r.actual_hc_total ?? 0);
      const pct = wfmFillPct(actual, ideal);
      const color = wfmFillColor(pct, ideal);
      return { name: r.account_name || `Project ${r.project_id}`, actual, ideal, color, pct, row: r };
    }),
  [rows]);

  // Filtered table rows
  const filteredRows = useMemo(() =>
    rows.filter((r) => {
      const ideal = Number(r.ideal_hc ?? 0);
      const actual = Number(r.actual_hc_total ?? 0);
      const pct = wfmFillPct(actual, ideal);
      return wfmMatchesFilter(pct, ideal, tableFilter);
    }),
  [rows, tableFilter]);

  // At-risk clients count
  const atRiskCount = useMemo(() =>
    allBulletItems.filter((b) => wfmFillBand(b.pct, b.ideal) === "risk").length,
  [allBulletItems]);

  const onPlanCount = useMemo(() =>
    allBulletItems.filter((b) => wfmFillBand(b.pct, b.ideal) === "strong").length,
  [allBulletItems]);

  // WL distribution
  const wlData = useMemo(() => rows.map((r) => ({
    name: (r.account_name || `P${r.project_id}`).slice(0, 12),
    wl1: Number(r.wl1_hires ?? 0),
    wl2: Number(r.wl2_hires ?? 0),
    wl3: Number(r.wl3_hires ?? 0),
    wl4: Number(r.wl4_hires ?? 0),
  })).filter((d) => d.wl1 + d.wl2 + d.wl3 + d.wl4 > 0), [rows]);

  // Productivity vs fill chart
  const productivityFillChartAll = useMemo(() =>
    rows
      .filter((r) => Number(r.ideal_hc ?? 0) > 0)
      .map((r) => {
        const ideal = Number(r.ideal_hc ?? 0);
        const actual = Number(r.actual_hc_total ?? 0);
        const pct = wfmFillPct(actual, ideal);
        const fullName = String(r.account_name || `Project ${r.project_id}`);
        const short = fullName.length > 14 ? `${fullName.slice(0, 13)}…` : fullName;
        return { fullName, name: short, fillPct: Math.round(pct * 10) / 10, productivity: Number(r.lateral_productivity_target ?? 0) };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
  [rows]);

  const productivityFillChartData = useMemo(() => {
    if (!productivityFillChartAll.length) return [];
    if (!prodChartSelected.length) return productivityFillChartAll;
    const sel = new Set(prodChartSelected);
    return productivityFillChartAll.filter((d) => sel.has(d.fullName));
  }, [productivityFillChartAll, prodChartSelected]);

  const prodChartPickerCandidates = useMemo(() => {
    const q = prodChartSearch.trim().toLowerCase();
    return productivityFillChartAll
      .filter((d) => !prodChartSelected.includes(d.fullName) && (!q || d.fullName.toLowerCase().includes(q)))
      .slice(0, 60);
  }, [productivityFillChartAll, prodChartSearch, prodChartSelected]);

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="wfm-page">

      {/* ── Header row ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <PageHeader
          title="Workforce Management"
          subtitle="Fill rate vs ideal HC · Productivity targets · WL mix"
        />
        <div className="wfm-actions">
          <button
            type="button"
            className="wfm-btn wfm-btn--primary"
            onClick={() => setWfmDialogOpen(true)}
          >
            <Plus size={14} strokeWidth={2.5} aria-hidden />
            Add / edit WFM data
          </button>
          <label className="wfm-btn" style={{ cursor: "pointer" }}>
            ↑ Upload WFM
            <input type="file" hidden accept=".xlsx,.xls" onChange={(e) => onUpload(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      {/* ── Section label ── */}
      <div className="wfm-section-label">Key Performance Indicators</div>

      {/* ── 5-up KPI grid ── */}
      {loading
        ? <SkeletonKpiRow count={5} />
        : (
          <div className="wfm-kpi-grid">
            <KpiCard
              label="Ideal Headcount"
              value={formatNumber(idealHc)}
              sub="Target Strength"
              color="teal"
            />
            <KpiCard
              label="Actual Headcount"
              value={formatNumber(actualHc)}
              sub="On Rolls Today"
              delta={`${hcGap >= 0 ? "−" : "+"}${formatNumber(Math.abs(hcGap))} gap`}
              deltaClass={hcGap > 0 ? "wfm-kpi-delta--red" : hcGap < 0 ? "wfm-kpi-delta--amber" : "wfm-kpi-delta--green"}
              color="blue"
            />
            <KpiCard
              label="Fill Rate"
              value={idealHc > 0 ? formatPercent(fillRate) : "—"}
              sub="≤100% on plan; >100% over-capacity"
              delta={fillBand === "strong" ? "On Plan" : fillBand === "watch" ? "Watch" : "At Risk"}
              deltaClass={deltaClass(fillBand)}
              fillPct={fillRate}
              fillClass={bandClass(fillBand)}
              color={fillBand === "strong" ? "green" : fillBand === "watch" ? "amber" : "red"}
            />
            <KpiCard
              label="Open Positions"
              value={formatNumber(openPositions)}
              sub="Active Openings (gap)"
              delta={openPositions > 0 ? "Unfilled" : "Fully Staffed"}
              deltaClass={openPositions > 0 ? "wfm-kpi-delta--red" : "wfm-kpi-delta--green"}
              color="red"
            />
            <KpiCard
              label="Clients at Risk"
              value={String(atRiskCount)}
              sub={`${onPlanCount} on plan · ${rows.length} total`}
              delta={atRiskCount > 0 ? `${atRiskCount} need attention` : "All on plan"}
              deltaClass={atRiskCount > 0 ? "wfm-kpi-delta--red" : "wfm-kpi-delta--green"}
              color="orange"
            />
          </div>
        )
      }

      {/* ── Projected HC 3-up ── */}
      {!loading && rows.length > 0 && (
        <>
          <div className="wfm-section-label">Projected Headcount</div>
          <div className="wfm-proj-grid">
            <div className="wfm-proj-card">
              <div className="wfm-proj-card__label">Projected Headcount</div>
              <div className="wfm-proj-card__value">{formatNumber(projectedHc)}</div>
              <div className="wfm-proj-card__sub">Actual + Additional Support</div>
            </div>
            <div className="wfm-proj-card">
              <div className="wfm-proj-card__label">Variance vs Actual</div>
              <div className="wfm-proj-card__value" style={{ color: varActual > 0 ? "var(--green)" : varActual < 0 ? "var(--red)" : "var(--text)" }}>
                {varActual >= 0 ? "+" : ""}{formatNumber(varActual)}
              </div>
              <div className="wfm-proj-card__sub">Projected − Actual</div>
            </div>
            <div className="wfm-proj-card">
              <div className="wfm-proj-card__label">Net Variance vs Projected</div>
              <div className="wfm-proj-card__value" style={{ color: idealHc - projectedHc <= 0 ? "var(--green)" : "var(--amber)" }}>
                {idealHc - projectedHc >= 0 ? "−" : "+"}{formatNumber(Math.abs(idealHc - projectedHc))}
              </div>
              <div className="wfm-proj-card__sub">Ideal − Projected</div>
            </div>
          </div>
        </>
      )}

      {/* ── WL Mix summary ── */}
      {!loading && rows.length > 0 && (
        <>
          <div className="wfm-section-label">WL Hire Mix (Additional Support)</div>
          <div className="wfm-wl-grid">
            {[
              { label: "WL1 Hires", value: totalWl1, sub: "Entry level" },
              { label: "WL2 Hires", value: totalWl2, sub: "Mid level" },
              { label: "WL3+ Hires", value: totalWl3, sub: "Senior / leadership" },
              { label: "Total Pipeline", value: totalAdditional, sub: "All WL tiers" },
            ].map((c) => (
              <div key={c.label} className="wfm-wl-cell">
                <div className="wfm-wl-cell__label">{c.label}</div>
                <div className="wfm-wl-cell__value">{formatNumber(c.value)}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.sub}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Project-wise table ── */}
      <div className="wfm-section-label" style={{ marginTop: 4 }}>Project Wise</div>
      <div className="wfm-section-card">
        <div className="wfm-section-card__header">
          <div>
            <div className="wfm-section-card__tag">Client Headcount Detail</div>
            <div className="wfm-section-card__title">Fill Rate & Resource Gap by Client</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <FilterChips value={tableFilter} onChange={setTableFilter} />
            <button
              className="wfm-section-card__action"
              onClick={() => { setExpandMode("benchmark"); setExpandFilter(tableFilter); }}
            >
              ⤢ Expand all
            </button>
          </div>
        </div>
        <div className="wfm-section-card__body" style={{ padding: 0 }}>
          {loading
            ? <SkeletonTable rows={6} cols={10} />
            : rows.length === 0
              ? <div className="wfm-empty">Upload WFM data to populate this table</div>
              : filteredRows.length === 0
                ? <div className="wfm-empty">No clients match this filter</div>
                : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="wfm-table">
                      <thead>
                        <tr>
                          <th>Department / Client</th>
                          <th className="right">Target Productivity</th>
                          <th className="right">Ideal HC</th>
                          <th className="right">Actual HC</th>
                          <th className="right">Variance</th>
                          <th className="right">Additional HC</th>
                          <th className="right">Open Positions</th>
                          <th className="right">Projected HC</th>
                          <th className="right">Net Variance</th>
                          <th>Fill Rate</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((r, i) => {
                          const idealN = Number(r.ideal_hc ?? 0);
                          const actualN = Number(r.actual_hc_total ?? 0);
                          const variance = idealN - actualN;
                          const additional = Number(r.wl1_hires ?? 0) + Number(r.wl2_hires ?? 0) + Number(r.wl3_hires ?? 0) + Number(r.wl4_hires ?? 0);
                          const openPos = variance > 0 ? variance : 0;
                          const projHc = actualN + additional;
                          const netVariance = idealN - projHc;
                          const pct = wfmFillPct(actualN, idealN);
                          const gapColor = wfmFillColor(pct, idealN);
                          const statusLbl = wfmStatusLabel(pct, idealN);
                          const fc = barFillClass(pct, idealN);
                          return (
                            <tr key={i}>
                              <td>
                                <div className="wfm-table__name">{r.account_name || `Project ${r.project_id}`}</div>
                                {r.practice_head && <div className="wfm-table__muted">{r.practice_head}</div>}
                              </td>
                              <td className="right">{r.lateral_productivity_target != null ? formatPercent(r.lateral_productivity_target) : "—"}</td>
                              <td className="right">{formatNumber(idealN)}</td>
                              <td className="right">{formatNumber(actualN)}</td>
                              <td className="right" style={{ color: variance > 0 ? "var(--red)" : variance < 0 ? "var(--amber)" : "var(--green)", fontWeight: 600 }}>
                                {variance > 0 ? "+" : ""}{formatNumber(variance)}
                              </td>
                              <td className="right">{formatNumber(additional)}</td>
                              <td className="right" style={{ color: openPos > 0 ? "var(--red)" : "var(--text-muted)" }}>
                                {formatNumber(openPos)}
                              </td>
                              <td className="right" style={{ color: "var(--blue)" }}>{formatNumber(projHc)}</td>
                              <td className="right" style={{ color: netVariance > 0 ? "var(--amber)" : "var(--green)", fontWeight: 600 }}>
                                {netVariance <= 0 ? "0" : formatNumber(netVariance)}
                              </td>
                              <td style={{ minWidth: 130 }}>
                                <div className="wfm-bar-wrap">
                                  <div className="wfm-bar-track">
                                    <div className={`wfm-bar-fill ${fc}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                  </div>
                                  <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: gapColor, minWidth: 36 }}>
                                    {formatPercent(pct)}
                                  </span>
                                </div>
                              </td>
                              <td><WfmStatus label={statusLbl} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {/* TOTAL row */}
                      {filteredRows.length > 1 && (() => {
                        const totIdeal = filteredRows.reduce((s, r) => s + Number(r.ideal_hc ?? 0), 0);
                        const totActual = filteredRows.reduce((s, r) => s + Number(r.actual_hc_total ?? 0), 0);
                        const totAdditional = filteredRows.reduce((s, r) =>
                          s + Number(r.wl1_hires ?? 0) + Number(r.wl2_hires ?? 0) + Number(r.wl3_hires ?? 0) + Number(r.wl4_hires ?? 0), 0);
                        const totVariance = totIdeal - totActual;
                        const totOpenPos = totVariance > 0 ? totVariance : 0;
                        const totProj = totActual + totAdditional;
                        const totNetVar = totIdeal - totProj;
                        const totFill = wfmFillPct(totActual, totIdeal);
                        return (
                          <tfoot>
                            <tr style={{ background: "var(--surface-muted)", fontWeight: 700 }}>
                              <td style={{ fontWeight: 700 }}>TOTAL</td>
                              <td className="right">—</td>
                              <td className="right">{formatNumber(totIdeal)}</td>
                              <td className="right">{formatNumber(totActual)}</td>
                              <td className="right" style={{ color: totVariance > 0 ? "var(--red)" : "var(--green)" }}>
                                {totVariance > 0 ? "+" : ""}{formatNumber(totVariance)}
                              </td>
                              <td className="right">{formatNumber(totAdditional)}</td>
                              <td className="right" style={{ color: totOpenPos > 0 ? "var(--red)" : "var(--text-muted)" }}>
                                {formatNumber(totOpenPos)}
                              </td>
                              <td className="right" style={{ color: "var(--blue)" }}>{formatNumber(totProj)}</td>
                              <td className="right" style={{ color: totNetVar > 0 ? "var(--amber)" : "var(--green)" }}>
                                {totNetVar <= 0 ? "0" : formatNumber(totNetVar)}
                              </td>
                              <td>
                                <div className="wfm-bar-wrap">
                                  <div className="wfm-bar-track">
                                    <div className={`wfm-bar-fill ${bandClass(wfmFillBand(totFill, totIdeal))}`} style={{ width: `${Math.min(totFill, 100)}%` }} />
                                  </div>
                                  <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: wfmFillColor(totFill, totIdeal), minWidth: 36 }}>
                                    {formatPercent(totFill)}
                                  </span>
                                </div>
                              </td>
                              <td>—</td>
                            </tr>
                          </tfoot>
                        );
                      })()}
                    </table>
                  </div>
                )
          }
        </div>
      </div>

      {/* ── HC Chart + Gauge side by side ── */}
      {!loading && rows.length > 0 && (
        <>
          <div className="wfm-section-label">Client HC — Ideal vs Actual</div>
          <div className="wfm-charts-grid">
            <div className="wfm-section-card">
              <div className="wfm-section-card__header">
                <div className="wfm-section-card__title">HC Comparison</div>
                <button
                  className="wfm-section-card__action"
                  onClick={() => { setExpandMode("hc"); setExpandFilter("all"); }}
                >
                  ⤢ Full list
                </button>
              </div>
              <div className="wfm-section-card__body">
                {allBulletItems.length === 0
                  ? <div className="wfm-empty">No data</div>
                  : <HcIdealActualGroupedChart items={allBulletItems.slice(0, 8)} />
                }
              </div>
            </div>

            <div className="wfm-section-card">
              <div className="wfm-section-card__header">
                <div className="wfm-section-card__title">Capacity Fill Gauge</div>
              </div>
              <div className="wfm-section-card__body" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <GaugeRing
                  value={fillRate}
                  label="Capacity Fill Rate"
                  sublabel={`${formatNumber(actualHc)} of ${formatNumber(idealHc)} positions`}
                  color={fgColor}
                />
                {wlData.length > 0 && <WlDistributionBar data={wlData} />}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Productivity vs Fill chart ── */}
      {!loading && rows.length > 0 && (
        <PlatformSection title="Productivity Target vs Fill Rate (by client)">
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 10, fontFamily: "var(--mono)", lineHeight: 1.5 }}>
            Bars: fill rate (actual ÷ ideal HC). Line: productivity target. Dashed line: 100% fill — above = over-capacity.
            {productivityFillChartAll.length > 0 && (
              <span style={{ display: "block", marginTop: 2 }}>
                {prodChartSelected.length === 0
                  ? `Showing all ${productivityFillChartAll.length} clients — search to narrow.`
                  : `Showing ${productivityFillChartData.length} of ${productivityFillChartAll.length} selected.`}
              </span>
            )}
          </div>
          {productivityFillChartAll.length > 0 && (
            <div style={{ marginBottom: 12 }}>
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
                    onKeyDown={(e) => { if (e.key === "Escape") setProdChartPickerOpen(false); }}
                    autoComplete="off"
                  />
                  <button type="button" className="platform-chip" style={{ cursor: "pointer" }}
                    onClick={() => {
                      const next = prodChartPickerCandidates[0]?.fullName;
                      if (next && !prodChartSelected.includes(next)) setProdChartSelected((s) => [...s, next]);
                      setProdChartSearch("");
                    }}
                    disabled={!prodChartPickerCandidates.length}
                  >+ Add first match</button>
                  <button type="button" className="platform-chip active" style={{ cursor: "pointer" }}
                    onClick={() => { setProdChartSelected([]); setProdChartSearch(""); setProdChartPickerOpen(false); }}
                  >Show all</button>
                </div>
                {prodChartPickerOpen && prodChartPickerCandidates.length > 0 && (
                  <div role="listbox" style={{
                    position: "absolute", left: 0, right: 0, top: "100%", marginTop: 6, zIndex: 40,
                    maxHeight: 160, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8,
                    padding: "6px 0", background: "var(--surface-muted)", boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
                  }}>
                    <div style={{ fontSize: 9, color: "var(--text-muted)", padding: "0 12px 6px", fontFamily: "var(--mono)" }}>
                      Click to add · search narrows the list
                    </div>
                    {prodChartPickerCandidates.map((d) => (
                      <button key={d.fullName} type="button" role="option"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setProdChartSelected((s) => (s.includes(d.fullName) ? s : [...s, d.fullName])); setProdChartSearch(""); }}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 12px", border: "none", background: "transparent", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}
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
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 8 }}>
                  <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--mono)" }}>SELECTED</span>
                  {prodChartSelected.map((fn) => (
                    <button key={fn} type="button"
                      onClick={() => setProdChartSelected((s) => s.filter((x) => x !== fn))}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "2px 8px", borderRadius: 20,
                        border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
                        background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                        color: "var(--accent)", fontSize: 10.5, fontFamily: "var(--mono)", cursor: "pointer",
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
      )}

      {/* ── Expand Modal ── */}
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
