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
  /** Met + not met (excludes not reported). */
  total: number;
  /** Metrics in this slice with no Met/Not met status. */
  notReported: number;
  /** All metrics matching this slice (reported + not reported). */
  inSlice: number;
  accent: "blue" | "violet" | "rose" | "red" | "emerald";
  /** Default: met %. Penalties triggered: show breach count instead. */
  variant?: "met_rate" | "penalties_triggered";
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
  if (!slices.some((s) => s.inSlice > 0)) return null;
  return (
    <div className="sla-dash-card sla-bifurcation-wrap">
      <div className="sla-dash-card-hd">
        <div className="sla-dash-card-title">SLA bifurcation (latest status per metric)</div>
        <div className="sla-dash-card-sub">
          Contractual, internal, and non-penalty tiles show met %. The penalty tile counts penalty SLAs currently not met
          (Red/Amber). Double-click a tile for the metric list.
        </div>
      </div>
      <div className="sla-dash-card-bd">
        <div className="sla-bifurcation-grid">
          {slices.map((s) => {
            const isPenaltyTriggered = s.variant === "penalties_triggered";
            const hasReported = s.total > 0;
            const heroValue = isPenaltyTriggered ? String(s.notMet) : hasReported ? formatPercent(s.pct) : "—";
            const heroNote = isPenaltyTriggered
              ? s.notMet === 1
                ? "KPI with penalty triggered"
                : "KPIs with penalty triggered"
              : hasReported
                ? "met rate (reported only)"
                : null;
            const reportedLine = isPenaltyTriggered
              ? hasReported
                ? `${s.met} in compliance · ${s.notMet} triggered of ${s.total} reported penalty SLAs`
                : "No reported penalty SLA outcomes yet"
              : hasReported
                ? `${s.met} met · ${s.notMet} not met of ${s.total} reported`
                : "No reported outcomes yet";
            const coverageLine =
              s.notReported > 0
                ? `${s.notReported} not reported · ${s.inSlice} total in slice`
                : `${s.inSlice} metric${s.inSlice === 1 ? "" : "s"} in slice`;
            return (
            <button
              key={s.key}
              type="button"
              className={cn(
                "sla-bifurcation-tile",
                `sla-bifurcation-tile--${s.accent}`,
                isPenaltyTriggered && s.notMet > 0 && "sla-bifurcation-tile--penalty-active",
              )}
              onDoubleClick={() => onDrill(s.key)}
              title={
                isPenaltyTriggered
                  ? "Double-click to list penalty SLAs with a triggered penalty"
                  : "Double-click to list metrics in this slice"
              }
            >
              <div className="sla-bifurcation-tile__label">{s.label}</div>
              <div
                className={cn(
                  "sla-bifurcation-tile__pct",
                  isPenaltyTriggered && s.notMet > 0 && "sla-bifurcation-tile__pct--danger",
                  isPenaltyTriggered && s.notMet === 0 && "sla-bifurcation-tile__pct--clear",
                )}
              >
                {heroValue}
              </div>
              {heroNote ? <div className="sla-bifurcation-tile__pct-note">{heroNote}</div> : null}
              <div className="sla-bifurcation-tile__sub">{s.subtitle}</div>
              {s.inSlice > 0 ? (
                <>
                  <div className="sla-bifurcation-tile__hint">{reportedLine}</div>
                  <div className="sla-bifurcation-tile__hint sla-bifurcation-tile__hint--muted">{coverageLine}</div>
                </>
              ) : (
                <div className="sla-bifurcation-tile__hint">No metrics in slice</div>
              )}
            </button>
            );
          })}
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

/** Canonical label when `projects.region` and `sub_region` are both empty on an SLA row. */
export const SLA_WORKSPACE_REGION_UNASSIGNED = "Unassigned";

/**
 * Workspace geography key for SLA–KPI grouping (matches `/sla/data` `region` then `sub_region`).
 * Use this instead of compass rollups so UI labels match the SLA Base File / directory.
 */
export function workspaceRegionLabel(
  region: string | null | undefined,
  subRegion?: string | null | undefined,
): string {
  const r = (region || "").trim();
  if (r) return r;
  const sr = (subRegion || "").trim();
  if (sr) return sr;
  return SLA_WORKSPACE_REGION_UNASSIGNED;
}

export type SlaWorkspaceRegionStat = {
  label: string;
  metPct: number | null;
  met: number;
  notMet: number;
};

export function SlaWorkspaceRegionsMap({
  regions,
  activeLabel,
  onSelectLabel,
}: {
  regions: SlaWorkspaceRegionStat[];
  activeLabel: string | null;
  onSelectLabel: (label: string | null) => void;
}) {
  return (
    <div className="sla-dash-card sla-region-dash-card">
      <div className="sla-dash-card-hd">
        <div className="sla-dash-card-title">
          <MapPinned className="inline-block mr-1.5 h-4 w-4 align-text-bottom opacity-80" strokeWidth={2} aria-hidden />
          Regional snapshot (workspace)
        </div>
        <div className="sla-dash-card-sub">
          Each tile is a distinct project <code className="text-[10px]">region</code> or{" "}
          <code className="text-[10px]">sub_region</code> from your loaded SLA metrics (same strings as Advanced filters
          → Region). Rows with no geography roll into <strong>{SLA_WORKSPACE_REGION_UNASSIGNED}</strong>. Click a tile to
          filter the SLA table; the selection appears under <strong>Advanced filters</strong>.
        </div>
      </div>
      <div className="sla-dash-card-bd sla-region-dash-card__bd">
        {regions.length === 0 ? (
          <div className="sla-empty">No SLA metric rows in the current KPI scope.</div>
        ) : (
          <div className="sla-workspace-region-grid" role="list">
            {regions.map((item) => {
              const pct = item.met + item.notMet > 0 ? item.metPct : null;
              const active = activeLabel === item.label;
              return (
                <button
                  key={item.label}
                  type="button"
                  className={cn("sla-ws-region-tile", active && "sla-ws-region-tile--active")}
                  onClick={() => onSelectLabel(active ? null : item.label)}
                  title={`${item.label}: ${pct != null ? `${pct}% Met` : "No outcomes"}`}
                >
                  <span className="sla-ws-region-tile__nm">{item.label}</span>
                  <span className="sla-ws-region-tile__pct">{pct != null ? `${pct}%` : "—"}</span>
                  {item.met + item.notMet > 0 ? (
                    <span className="sla-ws-region-tile__hint">
                      Met {item.met} · Not met {item.notMet}
                    </span>
                  ) : (
                    <span className="sla-ws-region-tile__hint">No outcomes</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {activeLabel ? (
          <div className="sla-zone-map-actions">
            <button type="button" className="sla-zone-clear-btn" onClick={() => onSelectLabel(null)}>
              Clear region filter
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type SlaAccountRankDatum = {
  account: string;
  metPct: number;
  met: number;
  notMet: number;
  notReported: number;
  decisive: number;
};

function slaMetPctBand(pct: number): "green" | "amber" | "red" {
  if (pct >= 75) return "green";
  if (pct >= 50) return "amber";
  return "red";
}

function SlaExecRankColumn({
  title,
  hint,
  rows,
  barMax,
  onSelectAccount,
}: {
  title: string;
  hint: string;
  rows: SlaAccountRankDatum[];
  barMax: number;
  onSelectAccount?: (account: string) => void;
}) {
  const domain = Math.max(barMax, 1);
  return (
    <div className="sla-exec-rank-col">
      <div className="sla-exec-rank-col-hd">{title}</div>
      <div className="sla-exec-rank-col-sub">{hint}</div>
      {rows.length === 0 ? (
        <div className="sla-empty">No accounts with decisive outcomes in scope.</div>
      ) : (
        <ul className="sla-exec-rank-list" role="list">
          {rows.map((row) => {
            const band = slaMetPctBand(row.metPct);
            const lowN = row.decisive < 3;
            return (
              <li key={row.account}>
                <button
                  type="button"
                  className="sla-exec-rank-row"
                  onClick={() => onSelectAccount?.(row.account)}
                  title={`${row.account}: ${row.metPct.toFixed(1)}% Met (${row.met} met · ${row.notMet} not met${row.notReported > 0 ? ` · ${row.notReported} not reported` : ""})`}
                >
                  <span className="sla-exec-rank-row__name">{row.account}</span>
                  <span className="sla-exec-rank-row__viz" aria-hidden>
                    <span className="sla-exec-rank-row__track">
                      <span
                        className={cn("sla-exec-rank-row__bar", `sla-exec-rank-row__bar--${band}`)}
                        style={{ width: `${Math.min(100, (row.metPct / domain) * 100)}%` }}
                      />
                    </span>
                    <span className={cn("sla-exec-rank-row__pct", `sla-exec-rank-row__pct--${band}`)}>
                      {row.metPct.toFixed(1)}%
                    </span>
                  </span>
                  <span className="sla-exec-rank-row__meta">
                    {row.met} met · {row.notMet} not met
                    {row.notReported > 0 ? ` · ${row.notReported} NR` : ""}
                    {lowN ? " · low n" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Top / bottom account Met % — latest decisive rows, band colours, click to filter table. */
export function SlaExecutiveAccountRankPanel({
  top,
  bottom,
  portfolioMetPct,
  minDecisive = 3,
  onSelectAccount,
}: {
  top: SlaAccountRankDatum[];
  bottom: SlaAccountRankDatum[];
  portfolioMetPct: number | null;
  minDecisive?: number;
  onSelectAccount?: (account: string) => void;
}) {
  const bottomMax = bottom.length
    ? Math.max(50, ...bottom.map((r) => r.metPct)) + 5
    : 100;
  return (
    <div className="sla-exec-rank-panel">
      <div className="sla-exec-rank-panel__note">
        <span className="sla-exec-rank-basis">Basis: latest decisive row per metric</span>
        {portfolioMetPct != null ? (
          <span className="sla-exec-rank-portfolio">Portfolio Met %: {formatPercent(portfolioMetPct)}</span>
        ) : null}
        {minDecisive > 1 ? (
          <span className="sla-exec-rank-min-n">Rankings prefer accounts with ≥{minDecisive} decisive metrics</span>
        ) : null}
      </div>
      <div className="sla-exec-rank-panel__cols">
        <SlaExecRankColumn
          title="Top performers"
          hint="Highest Met % (met ÷ met + not met)"
          rows={top}
          barMax={100}
          onSelectAccount={onSelectAccount}
        />
        <SlaExecRankColumn
          title="Needs attention"
          hint="Lowest Met % on latest decisive rows"
          rows={bottom}
          barMax={bottomMax}
          onSelectAccount={onSelectAccount}
        />
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
