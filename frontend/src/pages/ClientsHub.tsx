import React, { useEffect, useMemo, useState } from "react";
import { queries, type Project } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { usePersona } from "@/lib/persona";
import { PlatformSection, PageHeader, MiniStatRow, Tabs, StatusTag } from "@/components/platform/PlatformBlocks";
import { Skeleton } from "@/components/platform/Skeleton";
import { clientsVm, type ClientVm } from "@/lib/view-models/clients";
import { formatCurrency } from "@/lib/utils";

// Real composite from projectStats — same formula as ClientDetail & PortfolioIntelligence
// Falls back to a neutral 50 when no stats are available yet.
function compositeScore(
  projectIds: number[],
  projectStats: Map<number, { positions: number; revenue: number; closed?: number; active?: number; on_hold?: number }>
): number {
  let totalPos = 0, totalClosed = 0, totalActive = 0, totalHold = 0, totalRevenue = 0;
  for (const pid of projectIds) {
    const s = projectStats.get(pid);
    if (!s) continue;
    totalPos     += s.positions;
    totalRevenue += s.revenue;
    totalClosed  += s.closed  ?? 0;
    totalActive  += s.active  ?? 0;
    totalHold    += s.on_hold ?? 0;
  }
  if (totalPos === 0) return 50;  // no data yet
  const fill     = (totalClosed / totalPos) * 100;
  const activity = ((totalClosed + totalActive) / totalPos) * 100;
  const holdFree = Math.max(0, 100 - (totalHold / totalPos) * 100);
  const revScore = Math.min(100, ((totalRevenue / totalPos) / 200_000) * 100);
  return Math.round(fill * 0.4 + activity * 0.3 + holdFree * 0.2 + revScore * 0.1);
}

function scoreStatus(s: number) {
  if (s >= 70) return "Strong";
  if (s >= 45) return "Watch";
  return "At Risk";
}

function scoreColor(s: number) {
  if (s >= 70) return "var(--green)";
  if (s >= 45) return "var(--amber)";
  return "var(--red)";
}

function goToClient(name: string, navigate: ReturnType<typeof useNavigate>) {
  navigate(`/clients/${encodeURIComponent(name)}`);
}

// projectId → per-project stats from the monitor endpoint
type ProjectStat = { positions: number; revenue: number; closed?: number; active?: number; on_hold?: number };

export function ClientsHub() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectStats, setProjectStats] = useState<Map<number, ProjectStat>>(new Map());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Overview");
  const [search, setSearch] = useState("");
  const { persona, scopedClients } = usePersona();
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([queries.projects(), queries.globalMonitor()]).then(([ps, monitor]) => {
      setProjects(ps);
      const map = new Map<number, ProjectStat>();
      for (const s of monitor.project_stats ?? []) {
        map.set(s.id, {
          positions: s.positions,
          revenue:   s.revenue,
          closed:    s.closed,
          active:    s.active,
          on_hold:   s.on_hold,
        });
      }
      setProjectStats(map);
      setLoading(false);
    }).catch(() => {
      // globalMonitor may fail independently; still show projects
      queries.projects().then((ps) => { setProjects(ps); setLoading(false); });
    });
  }, []);

  const clients = useMemo<ClientVm[]>(() => {
    const all = clientsVm(projects);
    if (persona.id === "client_manager" && scopedClients?.length) {
      return all.filter((c) => scopedClients.includes(c.client));
    }
    return all;
  }, [projects, persona, scopedClients]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      if (c.client.toLowerCase().includes(q)) return true;
      for (const id of c.projectIds) {
        if (String(id).includes(q)) return true;
        if (`p${id}`.includes(q) || `p${String(id).padStart(2, "0")}`.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [clients, search]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <PageHeader
        title={persona.id === "client_manager" ? "My Accounts" : "Client 360 Hub"}
        subtitle="Unified client intelligence across Finance · SLA · Hiring · Workforce"
      />

      {/* SPLIT IDENTITY WARNING */}
      {clients.some((c) => c.split) && (
        <div className="alert-banner amber">
          ⚠ One or more clients appear across multiple Project IDs due to upload mismatch. Data unified at client layer.
          <span style={{ textDecoration: "underline", cursor: "pointer", marginLeft: 8 }}>Reconcile →</span>
        </div>
      )}

      <Tabs tabs={["Overview", "Table"]} active={tab} onChange={setTab} />

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <input
          className="platform-search"
          type="search"
          placeholder="Search clients by name or project ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filter clients"
          style={{ flex: "1 1 240px", maxWidth: 420, minWidth: 180 }}
        />
        {!loading && clients.length > 0 && (
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
            {filteredClients.length === clients.length
              ? `${clients.length} client${clients.length !== 1 ? "s" : ""}`
              : `Showing ${filteredClients.length} of ${clients.length}`}
          </span>
        )}
      </div>

      {tab === "Overview" && (
        <div className="platform-grid-3">
          {loading && Array(6).fill(0).map((_, i) => (
            <div key={i} className="platform-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <Skeleton height={14} width="60%" />
              <Skeleton height={10} width="40%" />
              <div style={{ display: "flex", gap: 6 }}>
                <Skeleton height={32} />
                <Skeleton height={32} />
                <Skeleton height={32} />
              </div>
              <Skeleton height={4} />
            </div>
          ))}
          {!loading && clients.length === 0 && (
            <div className="platform-card" style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--text-muted)", padding: 32 }}>
              No client data yet — upload a project Excel file via Ingestion Center.
            </div>
          )}
          {!loading && clients.length > 0 && filteredClients.length === 0 && (
            <div className="platform-card" style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--text-muted)", padding: 32 }}>
              No clients match &quot;{search.trim()}&quot;. Try another name or project ID.
            </div>
          )}
          {filteredClients.map((c) => {
            const score = compositeScore(c.projectIds, projectStats);
            const status = scoreStatus(score);
            const color = scoreColor(score);

            // Aggregate real data across all project IDs for this client
            let totalReqs = 0, totalRevenue = 0, totalClosed = 0;
            for (const pid of c.projectIds) {
              const s = projectStats.get(pid);
              if (s) {
                totalReqs    += s.positions;
                totalRevenue += s.revenue;
                totalClosed  += s.closed ?? 0;
              }
            }
            const revenueDisplay = totalRevenue > 0 ? formatCurrency(totalRevenue) : "—";
            const reqsDisplay = totalReqs > 0 ? totalReqs : "—";
            // Real fill % = closed / total positions
            const fillDisplay = totalReqs > 0
              ? `${totalClosed}/${totalReqs} (${Math.round((totalClosed / totalReqs) * 100)}%)`
              : "—";

            return (
              <div key={c.client} className="platform-card" onClick={() => goToClient(c.client, navigate)}
                style={{
                  cursor: "pointer", transition: "border-color .2s, transform .15s",
                  borderColor: c.split ? "rgba(255,79,107,.25)" : undefined,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "")}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={c.client}
                  >
                    {c.client}
                  </div>
                  <StatusTag status={status} />
                </div>
                <div
                  style={{
                    fontSize: 9.5,
                    color: "var(--text-muted)",
                    fontFamily: "'DM Mono',monospace",
                    marginBottom: 10,
                    wordBreak: "break-word",
                  }}
                >
                  {c.projectIds.map((id) => `P${String(id).padStart(2, "0")}`).join(" · ")}
                  {c.split ? " · Merged" : ""}
                </div>
                <MiniStatRow stats={[
                  { label: "Reqs",    value: reqsDisplay },
                  { label: "Revenue", value: revenueDisplay, color: totalRevenue > 0 ? "var(--green)" : undefined },
                  { label: "Fill %",  value: fillDisplay },
                ]} />
                <div className="prog-bar" style={{ marginTop: 8, height: 4 }}>
                  <div className="prog-fill" style={{ width: `${score}%`, background: color }} />
                </div>
                <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginTop: 4, fontFamily: "'DM Mono',monospace" }}>
                  Composite Score: {score}/100
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "Table" && (
        <PlatformSection title="All Clients">
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead><tr><th>Client</th><th>Project IDs</th><th>Composite</th><th>Status</th><th>Split</th></tr></thead>
              <tbody>
                {filteredClients.length === 0 && clients.length > 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>No clients match your search.</td></tr>
                )}
                {filteredClients.map((c) => {
                  const score = compositeScore(c.projectIds, projectStats);
                  return (
                    <tr key={c.client} style={{ cursor: "pointer" }} onClick={() => goToClient(c.client, navigate)}>
                      <td style={{ fontWeight: 600 }}>{c.client}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--accent)" }}>
                        {c.projectIds.join(", ")}
                      </td>
                      <td style={{ color: scoreColor(score) }}>{score}/100</td>
                      <td><StatusTag status={scoreStatus(score)} /></td>
                      <td>{c.split ? <span className="platform-badge amber">Split</span> : <span className="platform-badge green">Unified</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PlatformSection>
      )}

    </div>
  );
}
