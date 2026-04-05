import React, { useEffect, useMemo, useState } from "react";
import { queries } from "@/lib/api";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { PlatformSection, PageHeader, StatusTag } from "@/components/platform/PlatformBlocks";
import { BubbleChart, ReqStatusStackedBar } from "@/components/platform/Charts";
import { portfolioCompositeVm, type PortfolioRow } from "@/lib/view-models/portfolio";
import { SkeletonTable } from "@/components/platform/Skeleton";

const BUBBLE_COLORS = ["var(--green)", "var(--green)", "var(--amber)", "var(--red)", "var(--red)", "var(--amber)", "var(--accent)"];

export function PortfolioIntelligence() {
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([queries.globalMonitor(), queries.projects()]).then(([monitor, projects]) => {
      if (monitor.status !== "fulfilled") { setLoading(false); return; }
      const stats = monitor.value.project_stats ?? [];

      // Build projectId → clean account_name
      const nameMap = new Map<number, string>();
      if (projects.status === "fulfilled") {
        for (const p of projects.value) {
          nameMap.set(p.id, p.account_name || p.filename?.replace(".xlsx", "") || `Project-${p.id}`);
        }
      }

      const enriched = stats.map((s) => ({
        ...s,
        name: nameMap.get(s.id) ?? s.name?.replace(".xlsx", "") ?? `Project-${s.id}`,
      }));

      setRows(portfolioCompositeVm(enriched, []));
      setLoading(false);
    });
  }, []);

  // Bubble: fill % (x) vs activity % (y), bubble size = revenue
  const bubbleData = useMemo(() =>
    rows
      .filter((r) => r.positions > 0)
      .slice(0, 7)
      .map((r, i) => ({
        name: r.name,
        x: r.fillScore,
        y: r.activityScore,
        z: Math.max(r.revenue / 100000, 5),
        color: BUBBLE_COLORS[i % BUBBLE_COLORS.length],
      })),
  [rows]);

  // Stacked bar: real closed/active/on_hold/pipeline per client (top 8 by volume)
  const stackedData = useMemo(() =>
    rows
      .filter((r) => r.positions > 0)
      .slice(0, 8)
      .map((r) => {
        const label = r.name.length > 12 ? r.name.slice(0, 11) + "…" : r.name;
        const other = Math.max(0, r.positions - r.closed - r.active - r.on_hold);
        return {
          name: label,
          joined: r.closed,
          open: r.active,
          offer: other,        // remaining pipeline
          cancelled: r.on_hold,
        };
      }),
  [rows]);

  const scoreColor = (v: number) => v >= 75 ? "var(--green)" : v >= 50 ? "var(--amber)" : "var(--red)";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <PageHeader title="Portfolio Intelligence" subtitle="Real hiring performance across all projects · sorted by composite score" />

      {/* BUBBLE + STACKED BAR */}
      <div className="platform-grid-2">
        <PlatformSection title="Fill Rate vs Activity Rate (Bubble = Revenue)">
          {loading
            ? <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
            : bubbleData.length > 0
              ? <BubbleChart data={bubbleData} />
              : <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 11 }}>No data yet</div>
          }
        </PlatformSection>
        <PlatformSection title="Req Status Distribution — Top 8 by Volume">
          {loading
            ? <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 11 }}>Loading…</div>
            : stackedData.length > 0
              ? <ReqStatusStackedBar data={stackedData} />
              : <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 11 }}>No req data</div>
          }
        </PlatformSection>
      </div>

      {/* COMPOSITE SCORE TABLE */}
      <PlatformSection title={`Portfolio Composite Score — ${rows.length} projects`} action="Export CSV">
        {/* Score legend */}
        <div style={{ display: "flex", gap: 16, marginBottom: 10, fontSize: 9.5, fontFamily: "'DM Mono',monospace", color: "var(--text-muted)" }}>
          <span>Composite = Fill 40% · Activity 30% · Hold-free 20% · Rev Quality 10%</span>
          <span style={{ color: "var(--green)" }}>■ ≥75 Strong</span>
          <span style={{ color: "var(--amber)" }}>■ 50–74 Watch</span>
          <span style={{ color: "var(--red)" }}>■ &lt;50 At Risk</span>
        </div>
        <div className="platform-table-wrap">
          {loading ? <SkeletonTable rows={8} cols={9} /> : (
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Client / Project</th>
                  <th style={{ textAlign: "right" }}>Total Reqs</th>
                  <th style={{ textAlign: "right" }}>Closed</th>
                  <th style={{ textAlign: "right" }}>Active</th>
                  <th style={{ textAlign: "right" }}>On Hold</th>
                  <th style={{ textAlign: "right" }}>Fill %</th>
                  <th style={{ textAlign: "right" }}>Activity %</th>
                  <th style={{ textAlign: "right" }}>Revenue</th>
                  <th style={{ textAlign: "right" }}>Composite</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={10} style={{ color: "var(--text-muted)", textAlign: "center" }}>
                    Upload project data to populate portfolio scores
                  </td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td style={{ textAlign: "right", fontFamily: "'DM Mono',monospace" }}>{r.positions.toLocaleString()}</td>
                    <td style={{ textAlign: "right", color: "var(--green)", fontFamily: "'DM Mono',monospace" }}>{r.closed.toLocaleString()}</td>
                    <td style={{ textAlign: "right", color: "var(--accent)", fontFamily: "'DM Mono',monospace" }}>{r.active.toLocaleString()}</td>
                    <td style={{ textAlign: "right", color: r.on_hold > 0 ? "var(--amber)" : "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>{r.on_hold.toLocaleString()}</td>
                    <td style={{ textAlign: "right", color: scoreColor(r.fillScore) }}>{formatPercent(r.fillScore)}</td>
                    <td style={{ textAlign: "right", color: scoreColor(r.activityScore) }}>{formatPercent(r.activityScore)}</td>
                    <td style={{ textAlign: "right" }}>{r.revenue > 0 ? formatCurrency(r.revenue) : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                    <td style={{ textAlign: "right" }}>
                      <strong style={{ color: scoreColor(r.composite) }}>{r.composite}</strong>
                    </td>
                    <td><StatusTag status={r.composite >= 75 ? "Strong" : r.composite >= 50 ? "Watch" : "At Risk"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </PlatformSection>
    </div>
  );
}
