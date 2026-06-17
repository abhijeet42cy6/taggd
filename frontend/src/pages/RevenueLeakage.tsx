import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  revenueLeakageApi,
  queries,
  type RevenueLeakageResponse,
  type RevenueLeakageRow,
  type RevenueLeakageCancelReason,
} from "@/lib/api";
import { AlertTriangle, ChevronDown, ChevronUp, Filter, RefreshCw, X } from "lucide-react";
import { ChartCard } from "@/components/charts/ChartCard";
import { EChartsCanvas } from "@/components/charts/EChartsCanvas";
import { buildGaugeKpiOption } from "@/components/charts/optionBuilders";
import "@/styles/revenue-leakage.css";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function recentMonthOptions(count = 24): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < count; i += 1) {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    out.push({ value, label });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

const RL_MONTH_OPTIONS = recentMonthOptions();

type SortKey = keyof RevenueLeakageRow | "";
type SortDir = "asc" | "desc";

const BUCKET_COLORS = ["var(--green)", "var(--accent)", "var(--amber)", "var(--red)", "var(--text-subtle)"];
const SOH_ORDER = ["RPO", "Direct", "External Requisition", "Internal Job Portal", "Transferred", "Unknown"];

function bucketBadgeClass(bucket: string) {
  if (bucket === "0-2") return "rl-badge rl-badge--b0";
  if (bucket === "3-5") return "rl-badge rl-badge--b1";
  if (bucket === "6-9") return "rl-badge rl-badge--b2";
  if (bucket === ">10") return "rl-badge rl-badge--b3";
  return "rl-badge rl-badge--nodata2";
}

function slaBadgeClass(sla: string) {
  if (sla === "Met") return "rl-badge rl-badge--met";
  if (sla === "Not Met") return "rl-badge rl-badge--notmet";
  return "rl-badge rl-badge--nodata";
}

function commBadgeClass(cls: string) {
  return cls === "Beneficial" ? "rl-badge rl-badge--beneficial" : "rl-badge rl-badge--loss";
}

// ─── SLA gauge ───────────────────────────────────────────────────────────────
function SlaGauge({ pct }: { pct: number | null }) {
  const option = useMemo(
    () => (pct != null ? buildGaugeKpiOption(pct, "48h SLA") : null),
    [pct],
  );
  return (
    <ChartCard variant="gaugeGradient" height={120} empty={pct == null} emptyMessage="—" className="rl-sla-gauge-card">
      <EChartsCanvas option={option} height={120} />
    </ChartCard>
  );
}

// ─── Detail Drawer ───────────────────────────────────────────────────────────
function DetailDrawer({ row, onClose }: { row: RevenueLeakageRow; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const timelineEvents: { label: string; date: string | null; note?: string; dotClass?: string }[] = [
    { label: "Requisition Created", date: row.creation_date, dotClass: "rl-timeline-dot--active" },
    {
      label: "Intake Meeting",
      date: row.intake_date,
      dotClass: row.intake_date ? "rl-timeline-dot--active" : undefined,
    },
    {
      label: "Approved / Pipeline Entry",
      date: row.approved_date,
      note: row.sla_48h !== "No Data" ? `48h SLA: ${row.sla_48h}` : undefined,
      dotClass:
        row.sla_48h === "Met"
          ? "rl-timeline-dot--met"
          : row.sla_48h === "Not Met"
            ? "rl-timeline-dot--miss"
            : undefined,
    },
    { label: "Last Updated / Cancelled", date: row.last_update_date, dotClass: undefined },
  ];

  return (
    <>
      <div className="rl-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="rl-drawer" role="dialog" aria-label="Requisition detail">
        <div className="rl-drawer__head">
          <div>
            <h2 className="rl-drawer__title">{row.position_title || `Record #${row.id}`}</h2>
            <p className="rl-drawer__sub">{row.candidate_name || "—"}</p>
          </div>
          <button type="button" className="rl-drawer__close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="rl-drawer__body">

          <div className="rl-drawer-section">
            <h3 className="rl-drawer-section-title">Requisition details</h3>
            {[
              ["Req number", row.req_number],
              ["Position", row.position_title],
              ["Candidate", row.candidate_name],
              ["Hiring manager", row.hiring_manager],
              ["Recruiter", row.recruiter],
              ["Department", row.department],
              ["Location", row.location],
              ["Region", row.region],
              ["Cancellation reason", row.cancellation_reason],
              ["Days open", row.days_open != null ? String(row.days_open) : null],
              ["Direct / Indirect", row.direct_indirect],
            ].map(([label, val]) => val ? (
              <div key={label} className="rl-prop-row">
                <span className="rl-prop-label">{label}</span>
                <span className="rl-prop-value">{val}</span>
              </div>
            ) : null)}
          </div>

          <div className="rl-drawer-section">
            <h3 className="rl-drawer-section-title">Timeline</h3>
            <ul className="rl-timeline">
              {timelineEvents.map((ev) => (
                <li key={ev.label} className="rl-timeline-item">
                  <span className={`rl-timeline-dot ${ev.dotClass ?? ""}`}>●</span>
                  <div className="rl-timeline-content">
                    <div className="rl-timeline-label">{ev.label}</div>
                    <div className="rl-timeline-date">{fmt(ev.date)}</div>
                    {ev.note && <div className="rl-timeline-note">{ev.note}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rl-drawer-section">
            <h3 className="rl-drawer-section-title">Revenue leakage metrics</h3>
            {[
              ["Revenue ageing", row.ageing_days != null ? `${row.ageing_days} days` : "—"],
              ["Ageing bucket", row.ageing_bucket],
              ["48h pipeline SLA", row.sla_48h],
              ["Source of hire", row.source_of_hire],
              ["Commercial class", row.commercial_class],
            ].map(([label, val]) => (
              <div key={label} className="rl-prop-row">
                <span className="rl-prop-label">{label}</span>
                <span className="rl-prop-value">{val || "—"}</span>
              </div>
            ))}
          </div>

        </div>
      </aside>
    </>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export function RevenueLeakage() {
  // Filters
  const [month, setMonth] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [sohFilter, setSohFilter] = useState<string>("");
  const [appliedMonth, setAppliedMonth] = useState<string>("");
  const [appliedProject, setAppliedProject] = useState<number | undefined>(undefined);
  const [appliedSoh, setAppliedSoh] = useState<string>("");

  // Data
  const [data, setData] = useState<RevenueLeakageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Projects list for filter dropdown
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);

  // Table
  const [sortKey, setSortKey] = useState<SortKey>("ageing_days");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const PER_PAGE = 25;

  // Drawer
  const [selected, setSelected] = useState<RevenueLeakageRow | null>(null);

  useEffect(() => {
    queries.projects().then((ps) =>
      setProjects(ps.map((p: { id: number; engagement_name?: string | null }) => ({ id: p.id, name: p.engagement_name ?? `Project ${p.id}` })))
    ).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await revenueLeakageApi.get({
        month: appliedMonth || undefined,
        project_id: appliedProject,
        source_of_hire: appliedSoh || undefined,
      });
      setData(res);
      setPage(1);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [appliedMonth, appliedProject, appliedSoh]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  function applyFilters() {
    setAppliedMonth(month);
    setAppliedProject(projectId ? Number(projectId) : undefined);
    setAppliedSoh(sohFilter);
  }

  function clearFilters() {
    setMonth("");
    setAppliedMonth("");
    setProjectId("");
    setAppliedProject(undefined);
    setSohFilter("");
    setAppliedSoh("");
  }

  // Sorted rows
  const sortedRows = useMemo(() => {
    if (!data) return [];
    const rows = [...data.rows];
    if (!sortKey) return rows;
    rows.sort((a, b) => {
      const av = a[sortKey as keyof RevenueLeakageRow];
      const bv = b[sortKey as keyof RevenueLeakageRow];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [data, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PER_PAGE));
  const pageRows = sortedRows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span style={{ opacity: 0.3, fontSize: 10 }}>⇅</span>;
    return sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />;
  }

  // Ageing bucket totals
  const maxBucket = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.ageing_buckets.map((b) => b.count));
  }, [data]);

  // SOH sorted
  const sohSorted = useMemo(() => {
    if (!data) return [];
    return [...data.source_of_hire].sort(
      (a, b) => SOH_ORDER.indexOf(a.label) - SOH_ORDER.indexOf(b.label)
    );
  }, [data]);

  const s = data?.summary;

  return (
    <div className="rl-page">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="rl-header">
        <div className="rl-header__eyebrow">Analytics · Revenue Intelligence</div>
        <h1 className="rl-header__title">Revenue Leakage</h1>
        <p className="rl-header__desc">
          Tracks cancelled requisitions and revenue timing risk. Measures{" "}
          <strong>revenue ageing</strong> (approved date − intake meeting date),{" "}
          <strong>48-hour pipeline SLA</strong> (creation → approved, working hours), and{" "}
          <strong>source-of-hire mix</strong> impact (RPO = beneficial · Direct/other = loss).
        </p>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="rl-filters">
        <Filter size={14} style={{ color: "var(--text-muted)", marginBottom: 1 }} />

        <div className="rl-filter-field">
          <label className="rl-filter-label">Month</label>
          <select
            className="rl-filter-input"
            value={month || "all"}
            onChange={(e) => setMonth(e.target.value === "all" ? "" : e.target.value)}
            style={{ fontFamily: "var(--mono)", fontSize: 12, minWidth: 148 }}
          >
            <option value="all">All months</option>
            {RL_MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rl-filter-field">
          <label className="rl-filter-label">Account / Project</label>
          <select
            className="rl-filter-input"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">All accounts</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="rl-filter-field">
          <label className="rl-filter-label">Source of hire</label>
          <select
            className="rl-filter-input"
            value={sohFilter}
            onChange={(e) => setSohFilter(e.target.value)}
          >
            <option value="">All sources</option>
            {SOH_ORDER.filter((s) => s !== "Unknown").map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <button type="button" className="rl-filter-btn rl-filter-btn--primary" onClick={applyFilters}>
          Apply
        </button>
        <button type="button" className="rl-filter-btn rl-filter-btn--ghost" onClick={clearFilters}>
          <X size={12} /> Clear
        </button>
        {loading && (
          <RefreshCw size={14} style={{ color: "var(--text-muted)", animation: "spin 1s linear infinite", marginLeft: 4 }} />
        )}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "var(--red-soft)", border: "1px solid var(--red)", borderRadius: "var(--radius-base)", marginBottom: 20, fontSize: 13, color: "var(--red)" }}>
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* ── KPI strip ───────────────────────────────────────────────────── */}
      {loading && !data ? (
        <div className="rl-kpi-strip">
          {[1,2,3,4].map((i) => (
            <div key={i} className="rl-kpi-card">
              <div className="rl-skeleton-row" style={{ height: 16, width: "60%", marginBottom: 8 }} />
              <div className="rl-skeleton-row" style={{ height: 32, width: "40%" }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rl-kpi-strip">
          <div className="rl-kpi-card">
            <div className="rl-kpi-card__bar" style={{ background: "var(--red)" }} />
            <div className="rl-kpi-card__label">Cancelled requisitions</div>
            <div className="rl-kpi-card__value">{s?.total_cancelled ?? "—"}</div>
            <div className="rl-kpi-card__sub">{appliedMonth ? `Month: ${appliedMonth}` : "All time"}</div>
          </div>
          <div className="rl-kpi-card">
            <div className="rl-kpi-card__bar" style={{ background: "var(--amber)" }} />
            <div className="rl-kpi-card__label">Avg revenue ageing</div>
            <div className="rl-kpi-card__value">{s?.avg_ageing_days != null ? `${s.avg_ageing_days}d` : "—"}</div>
            <div className="rl-kpi-card__sub">Approved date − Intake date</div>
          </div>
          <div className="rl-kpi-card">
            <div className="rl-kpi-card__bar" style={{ background: "var(--green)" }} />
            <div className="rl-kpi-card__label">48h pipeline SLA</div>
            <div className="rl-kpi-card__value" style={{ color: s?.sla_48h_pct != null ? (s.sla_48h_pct >= 80 ? "var(--green)" : s.sla_48h_pct >= 50 ? "var(--amber)" : "var(--red)") : "var(--text)" }}>
              {s?.sla_48h_pct != null ? `${s.sla_48h_pct}%` : "—"}
            </div>
            <div className="rl-kpi-card__sub">{s != null ? `${s.sla_48h_met} met · ${s.sla_48h_not_met} missed` : "Working days basis"}</div>
          </div>
          <div className="rl-kpi-card">
            <div className="rl-kpi-card__bar" style={{ background: "var(--accent)" }} />
            <div className="rl-kpi-card__label">RPO (beneficial) share</div>
            <div className="rl-kpi-card__value">
              {data && s && s.total_cancelled > 0
                ? `${Math.round(((data.source_of_hire.find((x) => x.label === "RPO")?.count ?? 0) / s.total_cancelled) * 100)}%`
                : "—"}
            </div>
            <div className="rl-kpi-card__sub">vs other sources (loss)</div>
          </div>
        </div>
      )}

      {/* ── Analytics row: Ageing + SLA ──────────────────────────────────── */}
      <div className="rl-analytics-row">
        {/* Ageing buckets */}
        <div className="rl-card">
          <div className="rl-card__header">
            <div>
              <h2 className="rl-card__title">Revenue ageing distribution</h2>
              <p className="rl-card__subtitle">First CV − Intake date · days</p>
            </div>
          </div>
          <div className="rl-card__body">
            {loading && !data ? (
              [1,2,3,4].map((i) => <div key={i} className="rl-skeleton-row" />)
            ) : (
              <div className="rl-bucket-list">
                {data?.ageing_buckets.map((b, i) => (
                  <div key={b.bucket} className="rl-bucket-row">
                    <span className="rl-bucket-label">{b.bucket === "No data" ? "No data" : `${b.bucket}d`}</span>
                    <div className="rl-bucket-bar-bg">
                      <div
                        className="rl-bucket-bar-fill"
                        style={{
                          width: `${Math.round((b.count / maxBucket) * 100)}%`,
                          background: BUCKET_COLORS[Math.min(i, BUCKET_COLORS.length - 1)],
                        }}
                      />
                    </div>
                    <span className="rl-bucket-count">{b.count}</span>
                  </div>
                ))}
                {!data?.ageing_buckets.length && <div className="rl-empty">No data</div>}
              </div>
            )}
          </div>
        </div>

        {/* SLA + Source of hire */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* SLA donut */}
          <div className="rl-card">
            <div className="rl-card__header">
              <div>
                <h2 className="rl-card__title">48-hour first-CV compliance</h2>
                <p className="rl-card__subtitle">Req creation → first CV (working hours)</p>
              </div>
            </div>
            <div className="rl-card__body">
              {loading && !data ? (
                <div className="rl-skeleton-row" style={{ height: 72 }} />
              ) : (
                <div className="rl-sla-visual">
                  <SlaGauge pct={s?.sla_48h_pct ?? null} />
                  <div className="rl-sla-legend">
                    <div className="rl-sla-legend-row">
                      <span className="rl-sla-legend-dot" style={{ background: "var(--green)" }} />
                      Met — {s?.sla_48h_met ?? 0}
                    </div>
                    <div className="rl-sla-legend-row">
                      <span className="rl-sla-legend-dot" style={{ background: "var(--red)" }} />
                      Not met — {s?.sla_48h_not_met ?? 0}
                    </div>
                    <div className="rl-sla-legend-row">
                      <span className="rl-sla-legend-dot" style={{ background: "var(--text-subtle)" }} />
                      No data — {s?.sla_48h_no_data ?? 0}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Source of hire */}
          <div className="rl-card" style={{ flex: 1 }}>
            <div className="rl-card__header">
              <div>
                <h2 className="rl-card__title">Source of hire mix</h2>
                <p className="rl-card__subtitle">RPO = beneficial · others = revenue loss</p>
              </div>
            </div>
            <div className="rl-card__body">
              {loading && !data ? (
                [1,2,3].map((i) => <div key={i} className="rl-skeleton-row" />)
              ) : (
                <div className="rl-soh-list">
                  {sohSorted.map((item) => (
                    <div key={item.label} className="rl-soh-row">
                      <span className="rl-soh-label">{item.label}</span>
                      <span className={`rl-soh-badge ${item.commercial_class === "Beneficial" ? "rl-soh-badge--beneficial" : "rl-soh-badge--loss"}`}>
                        {item.commercial_class}
                      </span>
                      <span className="rl-soh-count">{item.count}</span>
                    </div>
                  ))}
                  {!sohSorted.length && <div className="rl-empty">No source data</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Cancellation reasons ─────────────────────────────────────────── */}
      {data && data.cancel_reasons.length > 0 && (
        <div className="rl-card" style={{ marginBottom: 24 }}>
          <div className="rl-card__header">
            <div>
              <h2 className="rl-card__title">Top cancellation reasons</h2>
              <p className="rl-card__subtitle">Why requisitions were cancelled this period</p>
            </div>
          </div>
          <div className="rl-card__body">
            <div className="rl-bucket-list">
              {(() => {
                const maxCount = Math.max(1, ...data.cancel_reasons.map((r: RevenueLeakageCancelReason) => r.count));
                return data.cancel_reasons.map((item: RevenueLeakageCancelReason, i: number) => (
                  <div key={item.reason} style={{ display: "grid", gridTemplateColumns: "200px 1fr 36px", gap: 10, alignItems: "center" }}>
                    <span className="rl-bucket-label" style={{ textAlign: "left", fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.reason}>
                      {item.reason}
                    </span>
                    <div className="rl-bucket-bar-bg">
                      <div
                        className="rl-bucket-bar-fill"
                        style={{
                          width: `${Math.round((item.count / maxCount) * 100)}%`,
                          background: i === 0 ? "var(--red)" : i === 1 ? "var(--amber)" : "var(--accent)",
                        }}
                      />
                    </div>
                    <span className="rl-bucket-count">{item.count}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Detail table ─────────────────────────────────────────────────── */}
      <div className="rl-table-card">
        <div className="rl-card__header">
          <div>
            <h2 className="rl-card__title">Position tracker — cancelled requisitions</h2>
            <p className="rl-card__subtitle">{data ? `${data.rows.length} positions · click row for timeline` : "Loading…"}</p>
          </div>
        </div>

        {loading && !data ? (
          <div style={{ padding: "20px 20px 12px" }}>
            {[1,2,3,4,5].map((i) => <div key={i} className="rl-skeleton-row" />)}
          </div>
        ) : (
          <>
            <div className="rl-table-wrap">
              <table className="rl-table">
                <thead>
                  <tr>
                    {([
                      ["req_number", "Req #"],
                      ["position_title", "Position"],
                      ["hiring_manager", "Hiring manager"],
                      ["recruiter", "Recruiter"],
                      ["creation_date", "Created"],
                      ["intake_date", "Intake date"],
                      ["approved_date", "Approved date"],
                      ["ageing_days", "Ageing (d)"],
                      ["ageing_bucket", "Bucket"],
                      ["sla_48h", "48h SLA"],
                      ["cancellation_reason", "Cancel reason"],
                      ["source_of_hire", "Source"],
                      ["commercial_class", "Class"],
                    ] as [SortKey, string][]).map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key)}
                        className={sortKey === key ? "sorted" : ""}
                      >
                        {label} <SortIcon col={key} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={13}>
                        <div className="rl-empty">
                          <div className="rl-empty__icon">📭</div>
                          No cancelled requisitions found for this period.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((row) => (
                      <tr key={row.id} onClick={() => setSelected(row)}>
                        <td className="mono" style={{ fontWeight: 500 }}>{row.req_number || "—"}</td>
                        <td title={row.position_title}>{row.position_title || "—"}</td>
                        <td className="muted" title={row.hiring_manager}>{row.hiring_manager || "—"}</td>
                        <td className="muted" title={row.recruiter}>{row.recruiter || "—"}</td>
                        <td className="mono">{fmt(row.creation_date)}</td>
                        <td className="mono">{fmt(row.intake_date)}</td>
                        <td className="mono">{fmt(row.approved_date)}</td>
                        <td className="mono">{row.ageing_days != null ? row.ageing_days : "—"}</td>
                        <td><span className={bucketBadgeClass(row.ageing_bucket)}>{row.ageing_bucket}</span></td>
                        <td><span className={slaBadgeClass(row.sla_48h)}>{row.sla_48h}</span></td>
                        <td className="muted" title={row.cancellation_reason} style={{ maxWidth: 160 }}>{row.cancellation_reason || "—"}</td>
                        <td>{row.source_of_hire}</td>
                        <td><span className={commBadgeClass(row.commercial_class)}>{row.commercial_class}</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="rl-pagination">
                <span>{sortedRows.length} total</span>
                <button
                  className="rl-pg-btn"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ‹
                </button>
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  const pg = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page + i - 3;
                  if (pg < 1 || pg > totalPages) return null;
                  return (
                    <button
                      key={pg}
                      className={`rl-pg-btn ${pg === page ? "rl-pg-btn--active" : ""}`}
                      onClick={() => setPage(pg)}
                    >
                      {pg}
                    </button>
                  );
                })}
                <button
                  className="rl-pg-btn"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  ›
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Detail drawer ────────────────────────────────────────────────── */}
      {selected && (
        <DetailDrawer row={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
