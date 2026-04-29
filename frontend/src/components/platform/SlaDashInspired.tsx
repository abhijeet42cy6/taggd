import React from "react";
import { Download, Lightbulb, MapPinned, RefreshCw, Target, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/utils";

export type SlaInsight = {
  title: string;
  description: string;
  tone?: "info" | "success" | "warn";
};

export type SlaBifurcationSlice = {
  key: string;
  label: string;
  subtitle: string;
  pct: number;
  met: number;
  notMet: number;
  total: number;
  accent: "blue" | "violet" | "rose" | "emerald";
};

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** CSV export of current filtered SLA table rows (client-side). */
export function exportSlaRowsToCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = [
    "account_name",
    "region",
    "practice_head",
    "regional_head",
    "metric_label",
    "metric_nature",
    "metric_group",
    "target",
    "latest_score",
    "status",
    "reporting_month",
    "period_start",
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = keys.join(",");
  const body = rows
    .map((r) => keys.map((k) => esc((r as Record<string, unknown>)[k])).join(","))
    .join("\n");
  downloadBlob(`sla-export-${new Date().toISOString().slice(0, 10)}.csv`, `${header}\n${body}`, "text/csv;charset=utf-8");
}

export function SlaExportInlineBar({
  rows,
}: {
  rows: Record<string, unknown>[];
}) {
  return (
    <div className="sla-export-bar" role="group" aria-label="Export portfolio data">
      <span className="sla-export-bar__lbl">
        <Download className="sla-export-bar__ic" strokeWidth={2} aria-hidden />
        Export
      </span>
      <button
        type="button"
        className="btn btn-outline sla-export-bar__btn"
        disabled={rows.length === 0}
        onClick={() => exportSlaRowsToCsv(rows)}
      >
        CSV (filtered metrics)
      </button>
    </div>
  );
}

export function SlaInsightsStrip({
  insights,
  loading,
  source,
  onRefresh,
  refreshDisabled,
}: {
  insights: SlaInsight[];
  loading?: boolean;
  /** "llm" shows a small badge when insights come from the model */
  source?: "heuristic" | "llm";
  /** Calls the server to regenerate LLM insights for the current slice (falls back to heuristics on failure). */
  onRefresh?: () => void;
  refreshDisabled?: boolean;
}) {
  if (!loading && !insights.length) return null;
  const busy = !!loading;
  const refreshBlocked = !!refreshDisabled || busy;
  return (
    <div className="sla-insights-strip" aria-label="Key insights" aria-busy={loading || undefined}>
      <div className="sla-insights-strip__hd">
        <div className="sla-insights-strip__hd-main">
          <Lightbulb className="sla-insights-strip__hd-ic" strokeWidth={2} aria-hidden />
          <span>Key insights</span>
        </div>
        <div className="sla-insights-strip__hd-actions">
          {onRefresh ? (
            <button
              type="button"
              className={cn("sla-insights-strip__refresh", busy && "sla-insights-strip__refresh--busy")}
              onClick={() => onRefresh()}
              disabled={refreshBlocked}
              title="Regenerate AI insights for your current filters and time window"
            >
              <RefreshCw className="sla-insights-strip__refresh-ic" strokeWidth={2} aria-hidden />
              <span>Refresh insights</span>
            </button>
          ) : null}
          {source === "llm" && !loading ? (
            <span className="sla-insights-strip__badge" title="Generated from your current portfolio slice">
              AI
            </span>
          ) : null}
        </div>
      </div>
      {loading ? (
        <div className="sla-insights-strip__grid sla-insights-strip__grid--loading" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sla-insight-skeleton" />
          ))}
        </div>
      ) : (
        <div className="sla-insights-strip__grid">
          {insights.map((it, i) => (
            <div
              key={i}
              className={cn(
                "sla-insight-card",
                it.tone === "success" && "sla-insight-card--ok",
                it.tone === "warn" && "sla-insight-card--warn",
              )}
            >
              <div className="sla-insight-card__title">{it.title}</div>
              <p className="sla-insight-card__desc">{it.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SlaBifurcationTiles({
  slices,
  onDrill,
}: {
  slices: SlaBifurcationSlice[];
  onDrill: (key: string) => void;
}) {
  if (!slices.some((s) => s.total > 0)) return null;
  return (
    <div className="sla-dash-card sla-bifurcation-wrap">
      <div className="sla-dash-card-hd">
        <div className="sla-dash-card-title">SLA bifurcation (latest row per metric)</div>
        <div className="sla-dash-card-sub">
          Same rule as reference dashboard: Met ÷ (Met + Not met), excluding not reported. Double-click a tile for the
          metric list.
        </div>
      </div>
      <div className="sla-dash-card-bd">
        <div className="sla-bifurcation-grid">
          {slices.map((s) => (
            <button
              key={s.key}
              type="button"
              className={cn("sla-bifurcation-tile", `sla-bifurcation-tile--${s.accent}`)}
              onDoubleClick={() => onDrill(s.key)}
              title="Double-click to list metrics in this slice"
            >
              <div className="sla-bifurcation-tile__label">{s.label}</div>
              <div className="sla-bifurcation-tile__pct">{s.total > 0 ? formatPercent(s.pct) : "—"}</div>
              <div className="sla-bifurcation-tile__sub">{s.subtitle}</div>
              {s.total > 0 ? (
                <div className="sla-bifurcation-tile__hint">Met {s.met} · Not met {s.notMet}</div>
              ) : (
                <div className="sla-bifurcation-tile__hint">No outcomes in slice</div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export type SlaHealthBucket = {
  tier: "red" | "amber" | "green";
  label: string;
  hint: string;
  accounts: { name: string; metPct: number; met: number; total: number }[];
};

export function SlaAccountHealthRail({
  buckets,
  onPickTier,
}: {
  buckets: SlaHealthBucket[];
  onPickTier: (tier: "red" | "amber" | "green") => void;
}) {
  const hasAny = buckets.some((b) => b.accounts.length > 0);
  if (!hasAny) return null;
  return (
    <div className="sla-dash-card sla-health-dash-card">
      <div className="sla-dash-card-hd">
        <div className="sla-dash-card-title">Account health</div>
        <div className="sla-dash-card-sub">
          Buckets from latest Met % per account (outcomes only): red &lt;50%, amber 50–74%, green ≥75%. Click a tier to
          filter the SLA table; the active slice appears under <strong>Advanced filters</strong>.
        </div>
      </div>
      <div className="sla-dash-card-bd">
        <div className="sla-health-rail">
          {buckets.map((b) => (
            <button
              key={b.tier}
              type="button"
              className={cn("sla-health-panel", `sla-health-panel--${b.tier}`)}
              onClick={() => onPickTier(b.tier)}
              title="Click to filter the SLA table to these accounts"
            >
              <div className="sla-health-panel__label">{b.label}</div>
              <div className="sla-health-panel__count">{b.accounts.length}</div>
              <div className="sla-health-panel__hint">{b.hint}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export type SlaZoneStat = {
  zone: string;
  metPct: number | null;
  met: number;
  notMet: number;
};

export function SlaRegionZonesMap({
  zones,
  activeZone,
  onSelectZone,
}: {
  zones: SlaZoneStat[];
  activeZone: string | null;
  onSelectZone: (zone: string | null) => void;
}) {
  const layout: { zone: string; abbr: string; style: React.CSSProperties }[] = [
    { zone: "North", abbr: "N", style: { gridColumn: "2", gridRow: "1" } },
    { zone: "West", abbr: "W", style: { gridColumn: "1", gridRow: "2" } },
    { zone: "Central", abbr: "C", style: { gridColumn: "2", gridRow: "2" } },
    { zone: "East", abbr: "E", style: { gridColumn: "3", gridRow: "2" } },
    { zone: "South", abbr: "S", style: { gridColumn: "2", gridRow: "3" } },
  ];
  const byZone = new Map(zones.map((z) => [z.zone, z]));
  return (
    <div className="sla-dash-card sla-region-dash-card">
      <div className="sla-dash-card-hd">
        <div className="sla-dash-card-title">
          <MapPinned className="inline-block mr-1.5 h-4 w-4 align-text-bottom opacity-80" strokeWidth={2} aria-hidden />
          Regional snapshot (rolled)
        </div>
        <div className="sla-dash-card-sub">
          Zones group your workspace <code className="text-[10px]">region</code> strings (North, South, West, East,
          Central). Click a zone to filter the SLA table; the active zone appears under{" "}
          <strong>Advanced filters</strong>. You can clear here or from that bar.
        </div>
      </div>
      <div className="sla-dash-card-bd sla-region-dash-card__bd">
        <div className="sla-zone-map" role="list">
          {layout.map(({ zone, abbr, style }) => {
            const z = byZone.get(zone);
            const pct = z && z.met + z.notMet > 0 ? z.metPct : null;
            const active = activeZone === zone;
            return (
              <button
                key={zone}
                type="button"
                className={cn("sla-zone-cell", active && "sla-zone-cell--active")}
                style={style}
                onClick={() => onSelectZone(active ? null : zone)}
                title={`${zone}: ${pct != null ? `${pct}% Met` : "No outcomes"}`}
              >
                <span className="sla-zone-cell__abbr">{abbr}</span>
                <span className="sla-zone-cell__nm">{zone}</span>
                <span className="sla-zone-cell__pct">{pct != null ? `${pct}%` : "—"}</span>
              </button>
            );
          })}
        </div>
        {activeZone ? (
          <div className="sla-zone-map-actions">
            <button type="button" className="sla-zone-clear-btn" onClick={() => onSelectZone(null)}>
              Clear zone filter
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SlaBenchmarkForecastCards({ variant = "both" }: { variant?: "both" | "bench" | "forecast" }) {
  const showBench = variant === "both" || variant === "bench";
  const showFore = variant === "both" || variant === "forecast";
  return (
    <div className={cn("sla-rank-grid", showBench && showFore && "sla-rank-grid--pair")}>
      {showBench ? (
      <div className="sla-dash-card">
        <div className="sla-dash-card-hd">
          <div className="sla-dash-card-title">
            <Target className="inline-block mr-1.5 h-4 w-4 align-text-bottom opacity-80" strokeWidth={2} aria-hidden />
            Benchmarking
          </div>
          <div className="sla-dash-card-sub">Industry reference curves (reference dashboard parity).</div>
        </div>
        <div className="sla-dash-card-bd text-[12px] leading-relaxed text-muted-foreground">
          Wire external benchmarks (NASSCOM, sector medians) or internal targets here. For now this panel documents the
          intent: compare portfolio Met % and time-to-fill against a chosen peer set with the same month filters.
        </div>
      </div>
      ) : null}
      {showFore ? (
      <div className="sla-dash-card">
        <div className="sla-dash-card-hd">
          <div className="sla-dash-card-title">
            <TrendingUp className="inline-block mr-1.5 h-4 w-4 align-text-bottom opacity-80" strokeWidth={2} aria-hidden />
            Forecasting
          </div>
          <div className="sla-dash-card-sub">Simple trend extrapolation (reference dashboard parity).</div>
        </div>
        <div className="sla-dash-card-bd text-[12px] leading-relaxed text-muted-foreground">
          Plug a linear or damped projection on <code className="text-[10px]">/sla/timeseries</code> portfolio Met % to
          show next-quarter scenarios. Implementation is intentionally lightweight until a forecast model is chosen.
        </div>
      </div>
      ) : null}
    </div>
  );
}

/** Map workspace region labels into coarse zones for the simplified map. */
export function regionToZoneFromLabel(region: string | null | undefined): "North" | "South" | "West" | "East" | "Central" {
  const s = (region || "").toLowerCase();
  if (s.includes("north")) return "North";
  if (s.includes("south")) return "South";
  if (s.includes("west")) return "West";
  if (s.includes("east")) return "East";
  return "Central";
}
