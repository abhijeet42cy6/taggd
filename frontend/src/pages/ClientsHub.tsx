import React, { useCallback, useEffect, useMemo, useState } from "react";
import { queries } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { usePersona } from "@/lib/persona";
import { PlatformSection, PageHeader, MiniStatRow, Tabs, StatusTag } from "@/components/platform/PlatformBlocks";
import { Skeleton } from "@/components/platform/Skeleton";
import { clientGroupsToVm, clientsVm, projectForestForClient, type ClientVm, type ProjectTreeNode } from "@/lib/view-models/clients";
import { formatCurrency } from "@/lib/utils";
import { isRecruiterUser, useAuth } from "@/lib/auth";

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

function goToClient(id: number, navigate: ReturnType<typeof useNavigate>) {
  navigate(`/clients/${id}`);
}

// projectId → per-project stats from the monitor endpoint
type ProjectStat = { positions: number; revenue: number; closed?: number; active?: number; on_hold?: number };

export function ClientsHub() {
  const { user } = useAuth();
  const recruiterView = isRecruiterUser(user);
  const [clientsList, setClientsList] = useState<ClientVm[]>([]);
  const [projectStats, setProjectStats] = useState<Map<number, ProjectStat>>(new Map());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Overview");
  const [search, setSearch] = useState("");
  /** Default: active only (excludes prospect legal clients from GET /clients). */
  const [lifecycleFilter, setLifecycleFilter] = useState<"active" | "all">("active");
  const { persona, scopedClients } = usePersona();
  const navigate = useNavigate();

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const [groups, monitor] = await Promise.all([queries.clients(), queries.globalMonitor()]);
      setClientsList(clientGroupsToVm(groups));
      const map = new Map<number, ProjectStat>();
      for (const s of monitor.project_stats ?? []) {
        map.set(s.id, {
          positions: s.positions,
          revenue: s.revenue,
          closed: s.closed,
          active: s.active,
          on_hold: s.on_hold,
        });
      }
      setProjectStats(map);
    } catch {
      const ps = await queries.projects();
      setClientsList(clientsVm(ps));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  function renderProjectTree(nodes: ProjectTreeNode[], depth: number, clientId: number): React.ReactNode {
    return nodes.map(({ project, children }) => (
      <div key={project.id}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => goToClient(clientId, navigate)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              goToClient(clientId, navigate);
            }
          }}
          style={{
            paddingLeft: depth * 14,
            fontSize: 12,
            marginTop: 6,
            cursor: "pointer",
            lineHeight: 1.4,
          }}
        >
          <span style={{ fontFamily: "'DM Mono',monospace", color: "var(--accent)", fontSize: 10 }}>PRJ-{project.id}</span>
          <span style={{ marginLeft: 6 }}>
            {project.org_unit_kind === "business_unit" ? (
              <span className="platform-badge" style={{ fontSize: 9 }}>BU</span>
            ) : (
              <span className="platform-badge green" style={{ fontSize: 9 }}>SBU</span>
            )}
          </span>
          <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>
            {(project.engagement_name || project.account_name || project.filename || "").slice(0, 56)}
          </span>
        </div>
        {children.length > 0 ? renderProjectTree(children, depth + 1, clientId) : null}
      </div>
    ));
  }

  const clients = useMemo<ClientVm[]>(() => {
    const all = clientsList;
    if (persona.id === "client_manager" && scopedClients?.length) {
      return all.filter((c) => scopedClients.includes(c.officialName) || scopedClients.includes(c.client));
    }
    return all;
  }, [clientsList, persona, scopedClients]);

  const clientsLifecycle = useMemo(() => {
    if (lifecycleFilter === "all") return clients;
    return clients.filter((c) => c.lifecycleState !== "prospect");
  }, [clients, lifecycleFilter]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clientsLifecycle;
    return clientsLifecycle.filter((c) => {
      if (c.officialName.toLowerCase().includes(q) || c.client.toLowerCase().includes(q)) return true;
      for (const p of c.projects) {
        const sbu = (p.engagement_name || p.account_name || "").toLowerCase();
        if (sbu.includes(q)) return true;
      }
      for (const id of c.projectIds) {
        if (String(id).includes(q)) return true;
        if (`p${id}`.includes(q) || `p${String(id).padStart(2, "0")}`.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [clientsLifecycle, search]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <PageHeader
        title={
          recruiterView
            ? "My clients & projects"
            : persona.id === "client_manager"
              ? "My Accounts"
              : "Client 360 Hub"
        }
        subtitle={
          recruiterView
            ? "Clients and SBUs tied to projects you are assigned to — same access as requisitions and tasks."
            : "Unified client intelligence across Finance · SLA · Hiring · Workforce"
        }
      />

      {/* Legacy-only: inferred merge from duplicate account_name */}
      {clients.some((c) => c.split && c.id < 0) && (
        <div className="alert-banner amber">
          ⚠ Some accounts were inferred from project names only. Use{" "}
          <strong>POST /clients</strong> and <strong>PATCH /projects/:id</strong> with{" "}
          <code style={{ fontSize: 10 }}>client_id</code> to set a single legal client for SBUs.
        </div>
      )}

      <Tabs tabs={["Overview", "Hierarchy", "Table"]} active={tab} onChange={setTab} />

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <input
          className="platform-search"
          type="search"
          placeholder="Search by legal client, SBU, or project ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filter clients"
          style={{ flex: "1 1 240px", maxWidth: 420, minWidth: 180 }}
        />
        <label className="sr-only" htmlFor="clients-lifecycle-filter">
          Show clients
        </label>
        <select
          id="clients-lifecycle-filter"
          className="platform-search"
          value={lifecycleFilter}
          onChange={(e) => setLifecycleFilter(e.target.value as "active" | "all")}
          aria-label="Show active clients or all clients"
          style={{ flex: "0 0 auto", maxWidth: 200, minWidth: 150, cursor: "pointer" }}
        >
          <option value="active">Active only</option>
          <option value="all">All clients</option>
        </select>
        {!loading && clients.length > 0 && (
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
            {filteredClients.length === clientsLifecycle.length
              ? `${clientsLifecycle.length} client${clientsLifecycle.length !== 1 ? "s" : ""}${
                  lifecycleFilter === "active" && clients.length > clientsLifecycle.length
                    ? ` (active; ${clients.length} incl. prospects)`
                    : ""
                }`
              : `Showing ${filteredClients.length} of ${clientsLifecycle.length}`}
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
              {search.trim()
                ? <>No clients match &quot;{search.trim()}&quot;. Try another name or project ID.</>
                : lifecycleFilter === "active"
                  ? <>No active clients — use the filter above to show <strong>All clients</strong> (includes prospects).</>
                  : <>No clients to show.</>}
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
              <div key={c.id} className="platform-card" onClick={() => goToClient(c.id, navigate)}
                style={{
                  cursor: "pointer", transition: "border-color .2s, transform .15s",
                  borderColor: c.split && c.id < 0 ? "rgba(255,79,107,.25)" : undefined,
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
                    title={c.officialName}
                  >
                    {c.officialName}
                    {c.lifecycleState === "prospect" && c.id >= 0 ? (
                      <span className="platform-badge amber" style={{ marginLeft: 8, fontSize: 9 }}>
                        Prospect
                      </span>
                    ) : null}
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
                  {c.split ? (c.id >= 0 ? " · Multi-SBU" : " · Merged") : ""}
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

      {tab === "Hierarchy" && (
        <PlatformSection title="Client → BU → SBU" action="Refresh" onAction={() => void loadClients()}>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14, maxWidth: 720 }}>
            Projects under each legal client, nested by <strong>parent PRJ</strong>. Mark units as BU or SBU and set parent BU on the{" "}
            <strong>Account Info</strong> tab in client detail. Click a row to open the client cockpit.
          </p>
          {loading && <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Loading…</div>}
          {!loading && clients.length > 0 && filteredClients.length === 0 && (
            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
              {search.trim()
                ? <>No clients match your search.</>
                : lifecycleFilter === "active"
                  ? <>No active clients — switch the filter to <strong>All clients</strong> to include prospects.</>
                  : <>No clients to show.</>}
            </div>
          )}
          {!loading &&
            filteredClients.map((c) => (
              <div
                key={c.id}
                className="platform-card"
                style={{ padding: 14, marginBottom: 12, cursor: "default" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{c.officialName}</span>
                  {c.lifecycleState === "prospect" && c.id >= 0 ? (
                    <span className="platform-badge amber" style={{ fontSize: 9 }}>
                      Prospect client
                    </span>
                  ) : null}
                  {c.id >= 0 && (
                    <button
                      type="button"
                      className="platform-dialog__btn"
                      style={{ fontSize: 10, marginLeft: "auto" }}
                      onClick={() => goToClient(c.id, navigate)}
                    >
                      Open client
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
                  {renderProjectTree(projectForestForClient(c.projects), 0, c.id)}
                </div>
              </div>
            ))}
        </PlatformSection>
      )}

      {tab === "Table" && (
        <PlatformSection title="All Clients">
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead><tr><th>Client</th><th>Project IDs</th><th>Composite</th><th>Status</th><th>Split</th></tr></thead>
              <tbody>
                {filteredClients.length === 0 && clients.length > 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>
                      {search.trim()
                        ? "No clients match your search."
                        : lifecycleFilter === "active"
                          ? 'No active clients — choose "All clients" in the filter above to include prospects.'
                          : "No clients to show."}
                    </td>
                  </tr>
                )}
                {filteredClients.map((c) => {
                  const score = compositeScore(c.projectIds, projectStats);
                  return (
                    <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => goToClient(c.id, navigate)}>
                      <td style={{ fontWeight: 600 }}>{c.officialName}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--accent)" }}>
                        {c.projectIds.join(", ")}
                      </td>
                      <td style={{ color: scoreColor(score) }}>{score}/100</td>
                      <td><StatusTag status={scoreStatus(score)} /></td>
                      <td>
                        {c.split
                          ? c.id >= 0
                            ? <span className="platform-badge green">Multi-SBU</span>
                            : <span className="platform-badge amber">Inferred</span>
                          : <span className="platform-badge green">Single</span>}
                      </td>
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
