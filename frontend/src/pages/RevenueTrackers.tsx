import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  invalidateCache,
  queries,
  type Project,
  type RevenueForecastWeeklyRow,
  type RevenueVisibilitySnapshotRow,
} from "@/lib/api";
import { formatCurrency, formatLargeCurrency, formatPercent } from "@/lib/utils";
import { PageHeader, PlatformSection, Tabs } from "@/components/platform/PlatformBlocks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
} from "recharts";
import { RefreshCw, Plus, PencilLine } from "lucide-react";

const LAKHS = 100_000;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtLakhs(inr: number): string {
  return `${((inr || 0) / LAKHS).toFixed(2)}`;
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mondayYmd(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  const y = mon.getFullYear();
  const m = String(mon.getMonth() + 1).padStart(2, "0");
  const dd = String(mon.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatMonthLabel(ym: string): string {
  const [ys, ms] = ym.split("-");
  const y = Number(ys);
  const mo = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return ym;
  return `${MONTHS_SHORT[mo - 1]}-${String(y).slice(2)}`;
}

function forecastMonthKey(r: RevenueForecastWeeklyRow): string {
  const src = r.month_anchor || r.week_start_date;
  if (!src) return "unknown";
  return src.slice(0, 7);
}

function statusDisplay(status: string | null | undefined): React.ReactNode {
  const s = (status || "").trim();
  if (!s) return "—";
  const lower = s.toLowerCase();
  if (lower.includes("risk") || lower.includes("red") || lower.includes("at risk")) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span aria-hidden>🔴</span>
        <span>{s}</span>
      </span>
    );
  }
  if (lower.includes("on track") || lower.includes("green") || lower.includes("good")) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span aria-hidden>🟢</span>
        <span>{s}</span>
      </span>
    );
  }
  return s;
}

const CHART_TOOLTIP = {
  backgroundColor: "var(--surface-raised)",
  border: "1px solid color-mix(in srgb, var(--accent) 15%, transparent)",
  borderRadius: 8,
  fontSize: 11,
  color: "var(--text)",
  fontFamily: "'DM Mono',monospace",
};

type KpiProps = {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  accent?: "default" | "amber" | "teal";
};

function KpiTile({ icon, label, value, sub, accent = "default" }: KpiProps) {
  return (
    <div
      className="platform-card"
      style={{
        padding: "14px 16px",
        minHeight: 96,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        borderLeft: `3px solid ${accent === "amber" ? "var(--amber)" : accent === "teal" ? "var(--accent2)" : "var(--accent)"}`,
        boxShadow: "0 1px 0 color-mix(in srgb, var(--accent) 8%, transparent)",
      }}
    >
      <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", lineHeight: 1.35 }}>
        <span aria-hidden style={{ marginRight: 6 }}>
          {icon}
        </span>
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "'Syne',sans-serif",
          letterSpacing: "-0.02em",
          color: "var(--text)",
          marginTop: 8,
        }}
      >
        {value}
      </div>
      {sub ? (
        <div style={{ fontSize: 9.5, color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>{sub}</div>
      ) : null}
    </div>
  );
}

export function RevenueTrackers() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [forecast, setForecast] = useState<RevenueForecastWeeklyRow[]>([]);
  const [visibility, setVisibility] = useState<RevenueVisibilitySnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [asOfFilter, setAsOfFilter] = useState<string>("");

  const [forecastModalOpen, setForecastModalOpen] = useState(false);
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [editForecastRow, setEditForecastRow] = useState<RevenueForecastWeeklyRow | null>(null);
  const [editVisibilityRow, setEditVisibilityRow] = useState<RevenueVisibilitySnapshotRow | null>(null);

  const [mainTab, setMainTab] = useState<"Revenue visibility" | "Revenue forecast">("Revenue visibility");

  const pid = projectFilter ? Number(projectFilter) : undefined;

  const reload = useCallback(async () => {
    setErr(null);
    invalidateCache("revenue-trackers/");
    try {
      const [f, v] = await Promise.all([
        queries.revenueForecastWeekly({ project_id: pid, limit: 500 }),
        queries.revenueVisibilitySnapshots({ project_id: pid, limit: 500 }),
      ]);
      setForecast(f.items ?? []);
      setVisibility(v.items ?? []);
      setLastRefresh(new Date());
    } catch (e: unknown) {
      setErr(String(e instanceof Error ? e.message : e));
    }
  }, [pid]);

  useEffect(() => {
    void queries.projects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      await reload();
      setLoading(false);
    })();
  }, [reload]);

  const asOfDates = useMemo(() => {
    const s = new Set<string>();
    for (const r of visibility) {
      if (r.as_of_date) s.add(r.as_of_date);
    }
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [visibility]);

  const effectiveAsOf = asOfFilter || asOfDates[0] || "";

  const visibilityForCut = useMemo(() => {
    if (!effectiveAsOf) return [];
    return visibility.filter((r) => r.as_of_date === effectiveAsOf);
  }, [visibility, effectiveAsOf]);

  const visibilityTotals = useMemo(() => {
    const rows = visibilityForCut;
    let mmf = 0,
      openFee = 0,
      joinFee = 0,
      openReq = 0,
      joiners = 0,
      ytj = 0,
      ytjFee = 0,
      gap = 0;
    let convN = 0,
      convSum = 0,
      revN = 0,
      revSum = 0;
    for (const r of rows) {
      mmf += r.mmf_inr || 0;
      openFee += r.opening_fee_inr || 0;
      joinFee += r.joining_fee_inr || 0;
      openReq += r.open_req || 0;
      joiners += r.joiners_as_on_date || 0;
      ytj += r.yet_to_join || 0;
      ytjFee += r.ytj_fee_inr || 0;
      gap += r.gap_to_mmf_inr || 0;
      if (r.conversion_rate_pct != null) {
        convSum += r.conversion_rate_pct;
        convN++;
      }
      if (r.revenue_realised_pct != null) {
        revSum += r.revenue_realised_pct;
        revN++;
      }
    }
    return {
      mmf,
      openFee,
      joinFee,
      openReq,
      joiners,
      ytj,
      ytjFee,
      gap,
      convPct: convN ? convSum / convN : null,
      revPct: revN ? revSum / revN : null,
    };
  }, [visibilityForCut]);

  const forecastMonthly = useMemo(() => {
    type Agg = {
      rev: number;
      mmf: number;
      openReq: number;
      openFee: number;
      joiners: number;
      joinerFee: number;
      achSum: number;
      achN: number;
    };
    const map = new Map<string, Agg>();
    for (const r of forecast) {
      const k = forecastMonthKey(r);
      if (k === "unknown") continue;
      if (!map.has(k))
        map.set(k, { rev: 0, mmf: 0, openReq: 0, openFee: 0, joiners: 0, joinerFee: 0, achSum: 0, achN: 0 });
      const a = map.get(k)!;
      a.rev += r.revenue_forecast_inr || 0;
      a.mmf += r.mmf_inr || 0;
      a.openReq += r.open_req || 0;
      a.openFee += r.open_fee_inr || 0;
      a.joiners += r.joiner_count || 0;
      a.joinerFee += r.joiner_fee_inr || 0;
      if (r.achievement_pct != null) {
        a.achSum += r.achievement_pct;
        a.achN++;
      }
    }
    const keys = [...map.keys()].sort();
    return keys.map((k) => {
      const a = map.get(k)!;
      return {
        key: k,
        label: formatMonthLabel(k),
        revenueL: a.rev / LAKHS,
        mmfL: a.mmf / LAKHS,
        openReq: a.openReq,
        openFeeL: a.openFee / LAKHS,
        joiners: a.joiners,
        joinerFeeL: a.joinerFee / LAKHS,
        achPct: a.achN ? a.achSum / a.achN : null,
      };
    });
  }, [forecast]);

  const forecastTotals = useMemo(() => {
    let rev = 0,
      mmf = 0,
      openReq = 0,
      joiners = 0,
      joinerFee = 0,
      openFee = 0;
    let achSum = 0,
      achN = 0;
    for (const r of forecast) {
      rev += r.revenue_forecast_inr || 0;
      mmf += r.mmf_inr || 0;
      openReq += r.open_req || 0;
      joiners += r.joiner_count || 0;
      joinerFee += r.joiner_fee_inr || 0;
      openFee += r.open_fee_inr || 0;
      if (r.achievement_pct != null) {
        achSum += r.achievement_pct;
        achN++;
      }
    }
    return {
      revL: rev / LAKHS,
      mmfL: mmf / LAKHS,
      openReq,
      joiners,
      joinerFeeL: joinerFee / LAKHS,
      openFeeL: openFee / LAKHS,
      achPct: achN ? achSum / achN : null,
    };
  }, [forecast]);

  const chartVisibilityMmF = useMemo(
    () =>
      visibilityForCut.map((r) => ({
        name: (r.account_name || `PRJ-${r.project_id}`).slice(0, 18),
        mmf: (r.mmf_inr || 0) / LAKHS,
        gap: (r.gap_to_mmf_inr || 0) / LAKHS,
      })),
    [visibilityForCut],
  );

  const chartForecastTrend = useMemo(
    () =>
      forecastMonthly.map((m) => ({
        month: m.label,
        forecast: +m.revenueL.toFixed(2),
        mmf: +m.mmfL.toFixed(2),
      })),
    [forecastMonthly],
  );

  const projectLabel = useCallback(
    (id: number) => {
      const p = projects.find((x) => x.id === id);
      return (p?.account_name || p?.filename || `PRJ-${id}`) as string;
    },
    [projects],
  );

  const toolbarSelect: React.CSSProperties = {
    background: "var(--surface-raised)",
    border: "1px solid color-mix(in srgb, var(--accent) 22%, transparent)",
    color: "var(--text)",
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 11,
    fontFamily: "'DM Mono',monospace",
    minWidth: 180,
  };

  return (
    <div style={{ display: "grid", gap: 24, paddingBottom: 48 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <PageHeader
          title="Revenue trackers"
          subtitle="Use the tabs below to switch between pipeline visibility and TAGGD forecast — dashboards, tables, and add/update in each area"
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {lastRefresh ? (
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
              Last refresh {lastRefresh.toLocaleTimeString()}
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="font-mono text-[11px]"
            onClick={() => void reload()}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <div style={{ marginBottom: 4 }}>
        <Tabs
          tabs={["Revenue visibility", "Revenue forecast"]}
          active={mainTab}
          onChange={(t) => setMainTab(t as "Revenue visibility" | "Revenue forecast")}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          padding: "12px 14px",
          borderRadius: 10,
          background: "color-mix(in srgb, var(--accent) 6%, transparent)",
          border: "1px solid color-mix(in srgb, var(--accent) 14%, transparent)",
        }}
      >
        <label style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", display: "flex", alignItems: "center", gap: 8 }}>
          Scope
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} style={toolbarSelect}>
            <option value="">All assigned projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.account_name || p.filename || p.id}
              </option>
            ))}
          </select>
        </label>
        {mainTab === "Revenue visibility" ? (
          <label style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", display: "flex", alignItems: "center", gap: 8 }}>
            Visibility as-of
            <select value={effectiveAsOf} onChange={(e) => setAsOfFilter(e.target.value)} style={toolbarSelect}>
              {asOfDates.length === 0 ? <option value="">No snapshots</option> : null}
              {asOfDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {err ? <span style={{ color: "var(--red)", fontSize: 11 }}>{err}</span> : null}
      </div>

      {/* —— Revenue visibility —— */}
      {mainTab === "Revenue visibility" ? (
      <section>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Syne',sans-serif", letterSpacing: "-0.02em" }}>
            Revenue visibility — summary dashboard
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>
            Auto-refreshes from Revenue Tracker sheet · pipeline snapshot for the selected as-of date
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
          <KpiTile icon="💰" label="Total MMF (₹)" value={formatLargeCurrency(visibilityTotals.mmf)} sub="In scope" />
          <KpiTile icon="📥" label="Opening fee (₹)" value={formatLargeCurrency(visibilityTotals.openFee)} />
          <KpiTile icon="✅" label="Joining fee (₹)" value={formatLargeCurrency(visibilityTotals.joinFee)} />
          <KpiTile icon="📋" label="Open requisitions" value={String(visibilityTotals.openReq)} sub="#" />
          <KpiTile icon="🤝" label="Total joiners" value={String(visibilityTotals.joiners)} sub="#" />
          <KpiTile icon="⏳" label="Yet to join" value={String(visibilityTotals.ytj)} sub="#" />
          <KpiTile
            icon="🔄"
            label="Overall conversion %"
            value={visibilityTotals.convPct != null ? formatPercent(visibilityTotals.convPct, 1) : "—"}
            accent="teal"
          />
          <KpiTile
            icon="📈"
            label="Revenue realised %"
            value={visibilityTotals.revPct != null ? formatPercent(visibilityTotals.revPct, 1) : "—"}
            accent="teal"
          />
          <KpiTile icon="⚠️" label="Gap to MMF (₹)" value={formatLargeCurrency(visibilityTotals.gap)} accent="amber" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 18 }}>
          <div className="platform-card" style={{ padding: 14 }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace", marginBottom: 8 }}>
              MMF vs gap (₹ Lakhs)
            </div>
            <div style={{ width: "100%", height: 220 }}>
              {chartVisibilityMmF.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartVisibilityMmF} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, var(--accent) 12%, transparent)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 9 }} axisLine={false} tickLine={false} interval={0} angle={-25} textAnchor="end" height={56} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 9 }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP}
                      formatter={(v: number | string, name: string) => [`${Number(v).toFixed(2)} L`, name === "mmf" ? "MMF" : "Gap"]}
                    />
                    <Bar dataKey="mmf" name="MMF" fill="color-mix(in srgb, var(--accent) 70%, transparent)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="gap" name="Gap" fill="color-mix(in srgb, var(--amber) 55%, transparent)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 220, display: "grid", placeItems: "center", color: "var(--text-muted)", fontSize: 11 }}>No data</div>
              )}
            </div>
          </div>
          <div className="platform-card" style={{ padding: 14 }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace", marginBottom: 8 }}>
              Pipeline mix (joiners vs YTJ)
            </div>
            <div style={{ width: "100%", height: 220 }}>
              {visibilityForCut.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={visibilityForCut.map((r) => ({
                      name: (r.account_name || `P${r.project_id}`).slice(0, 14),
                      joiners: r.joiners_as_on_date || 0,
                      ytj: r.yet_to_join || 0,
                    }))}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, var(--accent) 12%, transparent)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 9 }} axisLine={false} tickLine={false} interval={0} angle={-25} textAnchor="end" height={56} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 9 }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                    <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'DM Mono',monospace" }} />
                    <Bar dataKey="joiners" name="Joiners" stackId="a" fill="color-mix(in srgb, var(--green) 65%, transparent)" />
                    <Bar dataKey="ytj" name="YTJ" stackId="a" fill="color-mix(in srgb, var(--accent2) 55%, transparent)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 220, display: "grid", placeItems: "center", color: "var(--text-muted)", fontSize: 11 }}>No data</div>
              )}
            </div>
          </div>
        </div>

        <PlatformSection
          title="Project-wise revenue summary"
          headerRight={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="font-mono text-[11px]"
              onClick={() => {
                setEditVisibilityRow(null);
                setVisibilityModalOpen(true);
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add / update
            </Button>
          }
        >
          <div className="platform-table-wrap" style={{ marginTop: 4 }}>
            <table className="platform-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Project name</th>
                  <th>Open req</th>
                  <th>Opening fee (₹)</th>
                  <th>Joiners</th>
                  <th>Joining fee (₹)</th>
                  <th>YTJ</th>
                  <th>YTJ fee (₹)</th>
                  <th>Conv %</th>
                  <th>Rev %</th>
                  <th>Gap to MMF (₹)</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibilityForCut.map((r, i) => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: "'DM Mono',monospace", color: "var(--text-muted)" }}>{i + 1}</td>
                    <td>{r.account_name || projectLabel(r.project_id)}</td>
                    <td>{r.open_req}</td>
                    <td>{formatCurrency(r.opening_fee_inr)}</td>
                    <td>{r.joiners_as_on_date}</td>
                    <td>{formatCurrency(r.joining_fee_inr)}</td>
                    <td>{r.yet_to_join}</td>
                    <td>{formatCurrency(r.ytj_fee_inr)}</td>
                    <td>{r.conversion_rate_pct != null ? formatPercent(r.conversion_rate_pct, 1) : "—"}</td>
                    <td>{r.revenue_realised_pct != null ? formatPercent(r.revenue_realised_pct, 1) : "—"}</td>
                    <td>{formatCurrency(r.gap_to_mmf_inr)}</td>
                    <td>{statusDisplay(r.status)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button
                          type="button"
                          title="Edit"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", padding: 4 }}
                          onClick={() => {
                            setEditVisibilityRow(r);
                            setVisibilityModalOpen(true);
                          }}
                        >
                          <PencilLine className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontSize: 10, fontFamily: "'DM Mono',monospace" }}
                          onClick={async () => {
                            if (!window.confirm("Delete this visibility snapshot?")) return;
                            await queries.deleteRevenueVisibility(r.id);
                            await reload();
                          }}
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {visibilityForCut.length ? (
                <tfoot>
                  <tr style={{ fontWeight: 700, background: "color-mix(in srgb, var(--accent) 6%, transparent)" }}>
                    <td colSpan={2}>TOTAL</td>
                    <td>{visibilityTotals.openReq}</td>
                    <td>{formatCurrency(visibilityTotals.openFee)}</td>
                    <td>{visibilityTotals.joiners}</td>
                    <td>{formatCurrency(visibilityTotals.joinFee)}</td>
                    <td>{visibilityTotals.ytj}</td>
                    <td>{formatCurrency(visibilityTotals.ytjFee)}</td>
                    <td>{visibilityTotals.convPct != null ? formatPercent(visibilityTotals.convPct, 1) : "—"}</td>
                    <td>{visibilityTotals.revPct != null ? formatPercent(visibilityTotals.revPct, 1) : "—"}</td>
                    <td>{formatCurrency(visibilityTotals.gap)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              ) : null}
            </table>
            {!visibilityForCut.length && !loading ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>No visibility rows for this as-of date.</div>
            ) : null}
          </div>
        </PlatformSection>
      </section>
      ) : null}

      {/* —— Forecast —— */}
      {mainTab === "Revenue forecast" ? (
      <section>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Syne',sans-serif", letterSpacing: "-0.02em" }}>
            TAGGD · Revenue forecast — summary dashboard
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>
            Auto-updated from revenue forecast data · weekly rows rolled up by month
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
          <KpiTile icon="📊" label="Total revenue forecast" value={fmtLakhs(forecastTotals.revL * LAKHS)} sub="₹ Lakhs" />
          <KpiTile icon="🎯" label="Total MMF" value={fmtLakhs(forecastTotals.mmfL * LAKHS)} sub="₹ Lakhs" />
          <KpiTile icon="📋" label="Total open reqs" value={String(forecastTotals.openReq)} sub="#" />
          <KpiTile icon="🤝" label="Total joiners" value={String(forecastTotals.joiners)} sub="#" />
          <KpiTile icon="💵" label="Total joiner fee" value={fmtLakhs(forecastTotals.joinerFeeL * LAKHS)} sub="₹ Lakhs" />
          <KpiTile
            icon="🏁"
            label="Avg achievement %"
            value={forecastTotals.achPct != null ? formatPercent(forecastTotals.achPct, 1) : "—"}
            sub="%"
          />
        </div>

        <div className="platform-card" style={{ padding: 14, marginTop: 18 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace", marginBottom: 8 }}>
            Revenue forecast vs MMF (₹ Lakhs)
          </div>
          <div style={{ width: "100%", height: 260 }}>
            {chartForecastTrend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartForecastTrend} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, var(--accent) 12%, transparent)" />
                  <XAxis dataKey="month" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 9 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'DM Mono',monospace" }} />
                  <Bar dataKey="forecast" name="Revenue forecast" fill="color-mix(in srgb, var(--accent) 45%, transparent)" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="mmf" name="MMF" stroke="var(--accent2)" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 260, display: "grid", placeItems: "center", color: "var(--text-muted)", fontSize: 11 }}>No monthly roll-up yet</div>
            )}
          </div>
        </div>

        <PlatformSection
          title="Monthly roll-up (from weekly entries)"
          headerRight={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="font-mono text-[11px]"
              onClick={() => {
                setEditForecastRow(null);
                setForecastModalOpen(true);
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add / update weekly row
            </Button>
          }
        >
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Revenue forecast (₹ Lakhs)</th>
                  <th>MMF (₹ Lakhs)</th>
                  <th>Open req (#)</th>
                  <th>Open fee (₹ Lakhs)</th>
                  <th>Joiner (#)</th>
                  <th>Joiner fee (₹ Lakhs)</th>
                  <th>Achievement %</th>
                </tr>
              </thead>
              <tbody>
                {forecastMonthly.map((m) => (
                  <tr key={m.key}>
                    <td style={{ fontWeight: 600 }}>{m.label}</td>
                    <td>{m.revenueL.toFixed(2)}</td>
                    <td>{m.mmfL.toFixed(2)}</td>
                    <td>{m.openReq}</td>
                    <td>{m.openFeeL.toFixed(2)}</td>
                    <td>{m.joiners}</td>
                    <td>{m.joinerFeeL.toFixed(2)}</td>
                    <td>{m.achPct != null ? formatPercent(m.achPct, 1) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              {forecastMonthly.length ? (
                <tfoot>
                  <tr style={{ fontWeight: 700, background: "color-mix(in srgb, var(--accent) 6%, transparent)" }}>
                    <td>TOTAL</td>
                    <td>{forecastTotals.revL.toFixed(2)}</td>
                    <td>{forecastTotals.mmfL.toFixed(2)}</td>
                    <td>{forecastTotals.openReq}</td>
                    <td>{forecastTotals.openFeeL.toFixed(2)}</td>
                    <td>{forecastTotals.joiners}</td>
                    <td>{forecastTotals.joinerFeeL.toFixed(2)}</td>
                    <td>{forecastTotals.achPct != null ? formatPercent(forecastTotals.achPct, 1) : "—"}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
            {!forecastMonthly.length && !loading ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>No forecast rows in scope.</div>
            ) : null}
          </div>
        </PlatformSection>

        <PlatformSection title="Weekly entries (edit / delete)">
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Week start</th>
                  <th>Account</th>
                  <th>Net revenue (L)</th>
                  <th>Open req</th>
                  <th>Achievement %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {forecast.map((r) => (
                  <tr key={r.id}>
                    <td>{r.week_start_date}</td>
                    <td>{r.account_name || projectLabel(r.project_id)}</td>
                    <td>{fmtLakhs(r.net_revenue_inr)}</td>
                    <td>{r.open_req}</td>
                    <td>{r.achievement_pct != null ? formatPercent(r.achievement_pct, 1) : "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          style={{
                            fontSize: 10,
                            background: "none",
                            border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
                            color: "var(--accent)",
                            borderRadius: 4,
                            padding: "4px 10px",
                            cursor: "pointer",
                            fontFamily: "'DM Mono',monospace",
                          }}
                          onClick={() => {
                            setEditForecastRow(r);
                            setForecastModalOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          style={{ fontSize: 10, color: "var(--red)", background: "none", border: "none", cursor: "pointer" }}
                          onClick={async () => {
                            if (!window.confirm("Delete this weekly forecast row?")) return;
                            await queries.deleteRevenueForecastWeekly(r.id);
                            await reload();
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!forecast.length && !loading ? (
              <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12 }}>No weekly rows.</div>
            ) : null}
          </div>
        </PlatformSection>
      </section>
      ) : null}

      <ForecastFormDialog
        open={forecastModalOpen}
        onOpenChange={(o) => {
          setForecastModalOpen(o);
          if (!o) setEditForecastRow(null);
        }}
        projects={projects}
        defaultProjectId={pid}
        initialRow={editForecastRow}
        onSaved={reload}
      />
      <VisibilityFormDialog
        open={visibilityModalOpen}
        onOpenChange={(o) => {
          setVisibilityModalOpen(o);
          if (!o) setEditVisibilityRow(null);
        }}
        projects={projects}
        defaultProjectId={pid}
        defaultAsOf={effectiveAsOf}
        initialRow={editVisibilityRow}
        onSaved={reload}
      />
    </div>
  );
}

function ForecastFormDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
  initialRow,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projects: Project[];
  defaultProjectId?: number;
  initialRow: RevenueForecastWeeklyRow | null;
  onSaved: () => void;
}) {
  const [projectId, setProjectId] = useState<number>(defaultProjectId ?? projects[0]?.id ?? 0);
  const [weekStart, setWeekStart] = useState(mondayYmd());
  const [monthAnchor, setMonthAnchor] = useState(() => todayYmd().slice(0, 7) + "-01");
  const [updateDate, setUpdateDate] = useState(todayYmd());
  const [weekLabel, setWeekLabel] = useState("");
  const [remarks, setRemarks] = useState("");
  const [revenueForecastLakhs, setRevenueForecastLakhs] = useState("0");
  const [adjustmentLakhs, setAdjustmentLakhs] = useState("0");
  const [penaltyLakhs, setPenaltyLakhs] = useState("0");
  const [badDebtsLakhs, setBadDebtsLakhs] = useState("0");
  const [mmfLakhs, setMmfLakhs] = useState("0");
  const [openFeeLakhs, setOpenFeeLakhs] = useState("0");
  const [joinerFeeLakhs, setJoinerFeeLakhs] = useState("0");
  const [tboFeeLakhs, setTboFeeLakhs] = useState("0");
  const [netRevLakhs, setNetRevLakhs] = useState("0");
  const [openReq, setOpenReq] = useState("0");
  const [joinerCount, setJoinerCount] = useState("0");
  const [tboCount, setTboCount] = useState("0");
  const [achPct, setAchPct] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (defaultProjectId) setProjectId(defaultProjectId);
  }, [defaultProjectId]);

  useEffect(() => {
    if (!projectId && projects.length) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const resetEmpty = useCallback(() => {
    setWeekStart(mondayYmd());
    setMonthAnchor(todayYmd().slice(0, 7) + "-01");
    setUpdateDate(todayYmd());
    setWeekLabel("");
    setRemarks("");
    setRevenueForecastLakhs("0");
    setAdjustmentLakhs("0");
    setPenaltyLakhs("0");
    setBadDebtsLakhs("0");
    setMmfLakhs("0");
    setOpenFeeLakhs("0");
    setJoinerFeeLakhs("0");
    setTboFeeLakhs("0");
    setNetRevLakhs("0");
    setOpenReq("0");
    setJoinerCount("0");
    setTboCount("0");
    setAchPct("");
  }, []);

  const fillFromRow = useCallback((r: RevenueForecastWeeklyRow) => {
    setProjectId(r.project_id);
    setWeekStart(r.week_start_date ?? mondayYmd());
    setMonthAnchor(r.month_anchor ?? todayYmd().slice(0, 7) + "-01");
    setUpdateDate(r.update_date ?? todayYmd());
    setWeekLabel(r.week_label ?? "");
    setRemarks(r.remarks ?? "");
    setRevenueForecastLakhs(String((r.revenue_forecast_inr || 0) / LAKHS));
    setAdjustmentLakhs(String((r.adjustment_inr || 0) / LAKHS));
    setPenaltyLakhs(String((r.penalty_inr || 0) / LAKHS));
    setBadDebtsLakhs(String((r.bad_debts_inr || 0) / LAKHS));
    setMmfLakhs(String((r.mmf_inr || 0) / LAKHS));
    setOpenFeeLakhs(String((r.open_fee_inr || 0) / LAKHS));
    setJoinerFeeLakhs(String((r.joiner_fee_inr || 0) / LAKHS));
    setTboFeeLakhs(String((r.to_be_offer_fee_inr || 0) / LAKHS));
    setNetRevLakhs(String((r.net_revenue_inr || 0) / LAKHS));
    setOpenReq(String(r.open_req ?? 0));
    setJoinerCount(String(r.joiner_count ?? 0));
    setTboCount(String(r.to_be_offer_count ?? 0));
    setAchPct(r.achievement_pct != null ? String(r.achievement_pct) : "");
  }, []);

  useEffect(() => {
    if (!open) return;
    if (initialRow) fillFromRow(initialRow);
    else {
      resetEmpty();
      if (defaultProjectId) setProjectId(defaultProjectId);
    }
  }, [open, initialRow, fillFromRow, resetEmpty, defaultProjectId]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-raised)",
    border: "1px solid color-mix(in srgb, var(--accent) 18%, transparent)",
    color: "var(--text)",
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 11,
    fontFamily: "'DM Mono',monospace",
  };

  const gridForm: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 12,
    marginTop: 8,
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    setSaving(true);
    try {
      await queries.upsertRevenueForecastWeekly({
        project_id: projectId,
        week_start_date: weekStart,
        month_anchor: monthAnchor,
        update_date: updateDate || undefined,
        week_label: weekLabel || null,
        remarks: remarks || null,
        revenue_forecast_lakhs: parseFloat(revenueForecastLakhs) || 0,
        adjustment_lakhs: parseFloat(adjustmentLakhs) || 0,
        penalty_lakhs: parseFloat(penaltyLakhs) || 0,
        bad_debts_lakhs: parseFloat(badDebtsLakhs) || 0,
        mmf_lakhs: parseFloat(mmfLakhs) || 0,
        open_fee_lakhs: parseFloat(openFeeLakhs) || 0,
        joiner_fee_lakhs: parseFloat(joinerFeeLakhs) || 0,
        to_be_offer_fee_lakhs: parseFloat(tboFeeLakhs) || 0,
        net_revenue_lakhs: parseFloat(netRevLakhs) || 0,
        open_req: parseInt(openReq, 10) || 0,
        joiner_count: parseInt(joinerCount, 10) || 0,
        to_be_offer_count: parseInt(tboCount, 10) || 0,
        achievement_pct: achPct.trim() === "" ? null : parseFloat(achPct),
      });
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "max-h-[min(90vh,880px)] overflow-y-auto border border-[color-mix(in_srgb,var(--accent)_15%,transparent)] bg-[var(--surface-raised)] p-6 sm:max-w-3xl"
        )}
      >
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-syne)] text-lg">Weekly revenue forecast</DialogTitle>
          <DialogDescription className="text-xs font-mono text-[var(--text-muted)]">
            Amounts in ₹ Lakhs · same project + week start replaces an existing row
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div style={gridForm}>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Project
              <select value={projectId || ""} onChange={(e) => setProjectId(Number(e.target.value))} required style={inputStyle}>
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.account_name || p.filename || p.id}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Week start
              <input style={inputStyle} value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Month anchor
              <input style={inputStyle} value={monthAnchor} onChange={(e) => setMonthAnchor(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Update date
              <input style={inputStyle} value={updateDate} onChange={(e) => setUpdateDate(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Week label
              <input style={inputStyle} value={weekLabel} onChange={(e) => setWeekLabel(e.target.value)} />
            </label>
          </div>
          <div style={{ ...gridForm, marginTop: 14 }}>
            {(
              [
                ["Revenue forecast (L)", revenueForecastLakhs, setRevenueForecastLakhs],
                ["Adjustment (L)", adjustmentLakhs, setAdjustmentLakhs],
                ["Penalty (L)", penaltyLakhs, setPenaltyLakhs],
                ["Bad debts (L)", badDebtsLakhs, setBadDebtsLakhs],
                ["MMF (L)", mmfLakhs, setMmfLakhs],
                ["Open fee (L)", openFeeLakhs, setOpenFeeLakhs],
                ["Joiner fee (L)", joinerFeeLakhs, setJoinerFeeLakhs],
                ["TBO fee (L)", tboFeeLakhs, setTboFeeLakhs],
                ["Net revenue (L)", netRevLakhs, setNetRevLakhs],
              ] as const
            ).map(([label, val, set]) => (
              <label key={label} style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
                {label}
                <input style={inputStyle} value={val} onChange={(e) => set(e.target.value)} inputMode="decimal" />
              </label>
            ))}
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Open req
              <input style={inputStyle} value={openReq} onChange={(e) => setOpenReq(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Joiners
              <input style={inputStyle} value={joinerCount} onChange={(e) => setJoinerCount(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              TBO count
              <input style={inputStyle} value={tboCount} onChange={(e) => setTboCount(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Achievement %
              <input style={inputStyle} value={achPct} onChange={(e) => setAchPct(e.target.value)} />
            </label>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)", marginTop: 14 }}>
            Remarks
            <textarea style={{ ...inputStyle, minHeight: 72, resize: "vertical" }} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !projectId}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VisibilityFormDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
  defaultAsOf,
  initialRow,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projects: Project[];
  defaultProjectId?: number;
  defaultAsOf: string;
  initialRow: RevenueVisibilitySnapshotRow | null;
  onSaved: () => void;
}) {
  const [projectId, setProjectId] = useState<number>(defaultProjectId ?? projects[0]?.id ?? 0);
  const [asOf, setAsOf] = useState(todayYmd());
  const [practiceHead, setPracticeHead] = useState("");
  const [mmfInr, setMmfInr] = useState("0");
  const [openReq, setOpenReq] = useState("0");
  const [openingFee, setOpeningFee] = useState("0");
  const [joiners, setJoiners] = useState("0");
  const [joiningFee, setJoiningFee] = useState("0");
  const [ytj, setYtj] = useState("0");
  const [ytjFee, setYtjFee] = useState("0");
  const [convPct, setConvPct] = useState("");
  const [realPct, setRealPct] = useState("");
  const [gapMmf, setGapMmf] = useState("0");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (defaultProjectId) setProjectId(defaultProjectId);
  }, [defaultProjectId]);

  useEffect(() => {
    if (!projectId && projects.length) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const fillFromRow = useCallback((r: RevenueVisibilitySnapshotRow) => {
    setProjectId(r.project_id);
    setAsOf(r.as_of_date ?? todayYmd());
    setPracticeHead(r.practice_head ?? "");
    setMmfInr(String(r.mmf_inr ?? 0));
    setOpenReq(String(r.open_req ?? 0));
    setOpeningFee(String(r.opening_fee_inr ?? 0));
    setJoiners(String(r.joiners_as_on_date ?? 0));
    setJoiningFee(String(r.joining_fee_inr ?? 0));
    setYtj(String(r.yet_to_join ?? 0));
    setYtjFee(String(r.ytj_fee_inr ?? 0));
    setConvPct(r.conversion_rate_pct != null ? String(r.conversion_rate_pct) : "");
    setRealPct(r.revenue_realised_pct != null ? String(r.revenue_realised_pct) : "");
    setGapMmf(String(r.gap_to_mmf_inr ?? 0));
    setStatus(r.status ?? "");
  }, []);

  const resetEmptyVis = useCallback(() => {
    setAsOf(defaultAsOf || todayYmd());
    setPracticeHead("");
    setMmfInr("0");
    setOpenReq("0");
    setOpeningFee("0");
    setJoiners("0");
    setJoiningFee("0");
    setYtj("0");
    setYtjFee("0");
    setConvPct("");
    setRealPct("");
    setGapMmf("0");
    setStatus("");
  }, [defaultAsOf]);

  useEffect(() => {
    if (!open) return;
    if (initialRow) fillFromRow(initialRow);
    else {
      resetEmptyVis();
      if (defaultProjectId) setProjectId(defaultProjectId);
    }
  }, [open, initialRow, fillFromRow, resetEmptyVis, defaultProjectId]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-raised)",
    border: "1px solid color-mix(in srgb, var(--accent) 18%, transparent)",
    color: "var(--text)",
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 11,
    fontFamily: "'DM Mono',monospace",
  };

  const gridForm: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 12,
    marginTop: 8,
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    setSaving(true);
    try {
      await queries.upsertRevenueVisibility({
        project_id: projectId,
        as_of_date: asOf,
        practice_head: practiceHead || null,
        mmf_inr: parseFloat(mmfInr) || 0,
        open_req: parseInt(openReq, 10) || 0,
        opening_fee_inr: parseFloat(openingFee) || 0,
        joiners_as_on_date: parseInt(joiners, 10) || 0,
        joining_fee_inr: parseFloat(joiningFee) || 0,
        yet_to_join: parseInt(ytj, 10) || 0,
        ytj_fee_inr: parseFloat(ytjFee) || 0,
        conversion_rate_pct: convPct.trim() === "" ? null : parseFloat(convPct),
        revenue_realised_pct: realPct.trim() === "" ? null : parseFloat(realPct),
        gap_to_mmf_inr: parseFloat(gapMmf) || 0,
        status: status || null,
      });
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "max-h-[min(90vh,800px)] overflow-y-auto border border-[color-mix(in_srgb,var(--accent)_15%,transparent)] bg-[var(--surface-raised)] p-6 sm:max-w-2xl"
        )}
      >
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-syne)] text-lg">Revenue visibility snapshot</DialogTitle>
          <DialogDescription className="text-xs font-mono text-[var(--text-muted)]">
            Amounts in INR · same project + as-of date replaces an existing row
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div style={gridForm}>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Project
              <select value={projectId || ""} onChange={(e) => setProjectId(Number(e.target.value))} required style={inputStyle}>
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.account_name || p.filename || p.id}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              As-of date
              <input style={inputStyle} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Practice head
              <input style={inputStyle} value={practiceHead} onChange={(e) => setPracticeHead(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              MMF (INR)
              <input style={inputStyle} value={mmfInr} onChange={(e) => setMmfInr(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Open req
              <input style={inputStyle} value={openReq} onChange={(e) => setOpenReq(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Opening fee (INR)
              <input style={inputStyle} value={openingFee} onChange={(e) => setOpeningFee(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Joiners
              <input style={inputStyle} value={joiners} onChange={(e) => setJoiners(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Joining fee (INR)
              <input style={inputStyle} value={joiningFee} onChange={(e) => setJoiningFee(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Yet to join
              <input style={inputStyle} value={ytj} onChange={(e) => setYtj(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              YTJ fee (INR)
              <input style={inputStyle} value={ytjFee} onChange={(e) => setYtjFee(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Conversion %
              <input style={inputStyle} value={convPct} onChange={(e) => setConvPct(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Revenue realised %
              <input style={inputStyle} value={realPct} onChange={(e) => setRealPct(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Gap to MMF (INR)
              <input style={inputStyle} value={gapMmf} onChange={(e) => setGapMmf(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
              Status
              <input style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)} placeholder="e.g. At Risk" />
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !projectId}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
