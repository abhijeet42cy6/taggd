import React, { useCallback, useEffect, useMemo, useState } from "react";
import { queries } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { usePersona } from "@/lib/persona";
import { PlatformSection, PageHeader, Tabs, StatusTag } from "@/components/platform/PlatformBlocks";
import { Skeleton } from "@/components/platform/Skeleton";
import { clientGroupsToVm, clientsVm, projectForestForClient, projectRollupText, type ClientVm, type ProjectTreeNode } from "@/lib/view-models/clients";
import { isRecruiterUser, useAuth } from "@/lib/auth";
import {
  buildClientsHubFilterOptions,
  clientMatchesHubFilters,
  clientMatchesSearch,
  countActiveHubFilters,
  DEFAULT_CLIENTS_HUB_FILTERS,
  type ClientsHubFilters,
} from "@/lib/clients-hub-filters";
import { ACCOUNT_STATUS_OPTIONS } from "@/lib/project-directory-options";
import { SearchableFilterSelect } from "@/components/platform/searchable-pickers";

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

function ClientHubMetaItem({ label, value }: { label: string; value: string }) {
  const empty = !value || value === "—";
  return (
    <div className="clients-hub-card__meta-item">
      <div className="clients-hub-card__meta-label">{label}</div>
      <div
        className={empty ? "clients-hub-card__meta-value clients-hub-card__meta-value--muted" : "clients-hub-card__meta-value"}
        title={value}
      >
        {empty ? "—" : value}
      </div>
    </div>
  );
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
  const [filters, setFilters] = useState<ClientsHubFilters>(DEFAULT_CLIENTS_HUB_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  const filterOptions = useMemo(() => buildClientsHubFilterOptions(clients), [clients]);

  const activeFilterCount = useMemo(() => countActiveHubFilters(filters), [filters]);

  const filteredClients = useMemo(() => {
    return clients.filter((c) => clientMatchesHubFilters(c, filters) && clientMatchesSearch(c, search));
  }, [clients, filters, search]);

  const setFilter = <K extends keyof ClientsHubFilters>(key: K, value: ClientsHubFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  function clearFilters() {
    setFilters(DEFAULT_CLIENTS_HUB_FILTERS);
    setSearch("");
  }

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

      <div className="clients-hub-filters">
        <input
          className="platform-search clients-hub-filters__search"
          type="search"
          placeholder="Search by legal client, SBU, or project ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filter clients"
        />

        <div className="clients-hub-filters__grid">
          <SearchableFilterSelect
            label="Client lifecycle"
            value={filters.lifecycle}
            onChange={(v) => setFilter("lifecycle", v as ClientsHubFilters["lifecycle"])}
            allLabel="All clients"
            options={[
              { value: "active", label: "Active only" },
              { value: "prospect", label: "Prospects only" },
            ]}
          />
          <SearchableFilterSelect
            label="Account status"
            value={filters.accountStatus}
            onChange={(v) => setFilter("accountStatus", v as ClientsHubFilters["accountStatus"])}
            options={ACCOUNT_STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
          />
          <SearchableFilterSelect
            label="Region"
            value={filters.region}
            onChange={(v) => setFilter("region", v)}
            options={filterOptions.regions.map((r) => ({ value: r, label: r }))}
          />
          <SearchableFilterSelect
            label="Practice head"
            value={filters.practiceHead}
            onChange={(v) => setFilter("practiceHead", v)}
            options={filterOptions.practiceHeads.map((h) => ({ value: h, label: h }))}
          />
        </div>

        <div className="clients-hub-filters__toolbar">
          <button
            type="button"
            className={`clients-hub-filters__toggle${filtersOpen ? " clients-hub-filters__toggle--open" : ""}${activeFilterCount > 0 ? " clients-hub-filters__toggle--active" : ""}`}
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
          >
            {filtersOpen ? "Hide filters" : "More filters"}
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          {(activeFilterCount > 0 || search.trim()) && (
            <button type="button" className="dashboard-filter-reset" onClick={clearFilters}>
              Clear
            </button>
          )}
          {!loading && clients.length > 0 && (
            <span className="clients-hub-filters__count">
              {filteredClients.length === clients.length && !search.trim() && activeFilterCount === 0
                ? `${clients.length} client${clients.length !== 1 ? "s" : ""}`
                : `Showing ${filteredClients.length} of ${clients.length}`}
              {filters.lifecycle === "active" &&
                clients.some((c) => c.lifecycleState === "prospect") &&
                activeFilterCount <= 1 &&
                !search.trim() &&
                ` (${clients.filter((c) => c.lifecycleState !== "prospect").length} active; ${clients.length} incl. prospects)`}
            </span>
          )}
        </div>

        {filtersOpen && (
          <div className="clients-hub-filters__extended">
            <div className="clients-hub-filters__grid">
              <SearchableFilterSelect
                label="Sub region"
                value={filters.subRegion}
                onChange={(v) => setFilter("subRegion", v)}
                options={filterOptions.subRegions.map((r) => ({ value: r, label: r }))}
              />
              <SearchableFilterSelect
                label="Regional head"
                value={filters.regionalHead}
                onChange={(v) => setFilter("regionalHead", v)}
                options={filterOptions.regionalHeads.map((h) => ({ value: h, label: h }))}
              />
              <SearchableFilterSelect
                label="Function head"
                value={filters.functionHead}
                onChange={(v) => setFilter("functionHead", v)}
                options={filterOptions.functionHeads.map((h) => ({ value: h, label: h }))}
              />
              <SearchableFilterSelect
                label="Category (TARA)"
                value={filters.category}
                onChange={(v) => setFilter("category", v)}
                options={filterOptions.categories.map((c) => ({ value: c, label: c }))}
              />
              <SearchableFilterSelect
                label="Vertical"
                value={filters.vertical}
                onChange={(v) => setFilter("vertical", v)}
                options={filterOptions.verticals.map((v) => ({ value: v, label: v }))}
              />
              <SearchableFilterSelect
                label="Practice type"
                value={filters.practice}
                onChange={(v) => setFilter("practice", v)}
                options={filterOptions.practices.map((p) => ({ value: p, label: p }))}
              />
              <SearchableFilterSelect
                label="Missing data"
                value={filters.missingData}
                onChange={(v) => setFilter("missingData", v as ClientsHubFilters["missingData"])}
                allLabel="Any completeness"
                options={[
                  { value: "region", label: "Missing region" },
                  { value: "sub_region", label: "Missing sub region" },
                  { value: "practice_head", label: "Missing practice head" },
                  { value: "regional_head", label: "Missing regional head" },
                  { value: "charge_code", label: "Missing charge code" },
                  { value: "category", label: "Missing category" },
                ]}
              />
            </div>
          </div>
        )}
      </div>

      {tab === "Overview" && (
        <div className="platform-grid-3">
          {loading && Array(6).fill(0).map((_, i) => (
            <div key={i} className="platform-card clients-hub-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <Skeleton height={18} width="55%" />
              <Skeleton height={10} width="35%" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Skeleton height={36} />
                <Skeleton height={36} />
                <Skeleton height={36} />
                <Skeleton height={36} />
              </div>
              <Skeleton height={5} />
            </div>
          ))}
          {!loading && clients.length === 0 && (
            <div className="platform-card" style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--text-muted)", padding: 32 }}>
              No client data yet — upload a project Excel file via Ingestion Center.
            </div>
          )}
          {!loading && clients.length > 0 && filteredClients.length === 0 && (
            <div className="platform-card" style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--text-muted)", padding: 32 }}>
              {search.trim() || activeFilterCount > 0
                ? <>No clients match the current search and filters.</>
                : filters.lifecycle === "active"
                  ? <>No active clients — use <strong>All clients</strong> under Client lifecycle or <strong>More filters</strong>.</>
                  : <>No clients to show.</>}
            </div>
          )}
          {filteredClients.map((c) => {
            const score = compositeScore(c.projectIds, projectStats);
            const status = scoreStatus(score);
            const color = scoreColor(score);
            const projects = c.projects;
            const region = projectRollupText(projects, (p) => p.region);
            const subRegion = projectRollupText(projects, (p) => p.sub_region);
            const accountType = projectRollupText(projects, (p) => p.practice);
            const vertical = projectRollupText(projects, (p) => p.vertical);
            const accountStatus = projectRollupText(projects, (p) => p.account_status);
            const practiceHead = projectRollupText(projects, (p) => p.practice_head);
            const category = projectRollupText(projects, (p) => p.category);

            return (
              <div
                key={c.id}
                className="platform-card clients-hub-card"
                onClick={() => goToClient(c.id, navigate)}
                style={{
                  cursor: "pointer",
                  transition: "border-color .2s, transform .15s, box-shadow .2s",
                  borderColor: c.split && c.id < 0 ? "rgba(255,79,107,.25)" : undefined,
                  ["--clients-hub-accent" as string]: color,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "";
                }}
              >
                <div className="clients-hub-card__head">
                  <div className="clients-hub-card__title" title={c.officialName}>
                    {c.officialName}
                    {c.lifecycleState === "prospect" && c.id >= 0 ? (
                      <span className="platform-badge amber" style={{ marginLeft: 8, fontSize: 9, verticalAlign: "middle" }}>
                        Prospect
                      </span>
                    ) : null}
                  </div>
                  <StatusTag status={status} />
                </div>
                <div className="clients-hub-card__sub">
                  {c.projectIds.map((id) => `P${String(id).padStart(2, "0")}`).join(" · ")}
                  {c.split ? (c.id >= 0 ? " · Multi-SBU" : " · Merged") : ""}
                </div>
                <div className="clients-hub-card__meta">
                  <ClientHubMetaItem label="Region" value={region} />
                  <ClientHubMetaItem label="Account type" value={accountType} />
                  <ClientHubMetaItem label="Sub region" value={subRegion} />
                  <ClientHubMetaItem label="Vertical" value={vertical} />
                  <ClientHubMetaItem label="Status" value={accountStatus} />
                  <ClientHubMetaItem label="Category" value={category} />
                </div>
                <div className="clients-hub-card__score-row">
                  <span className="clients-hub-card__score-label">Composite health</span>
                  <span className="clients-hub-card__score-value" style={{ color }}>
                    {score}/100
                  </span>
                </div>
                <div className="prog-bar" style={{ marginTop: 6 }}>
                  <div className="prog-fill" style={{ width: `${score}%`, background: color }} />
                </div>
                {practiceHead !== "—" ? (
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 10,
                      color: "var(--text-muted)",
                      fontFamily: "var(--mono)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={practiceHead}
                  >
                    Practice head · {practiceHead}
                  </div>
                ) : null}
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
              {search.trim() || activeFilterCount > 0
                ? <>No clients match your search or filters.</>
                : filters.lifecycle === "active"
                  ? <>No active clients — switch Client lifecycle to <strong>All clients</strong>.</>
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
                      {search.trim() || activeFilterCount > 0
                        ? "No clients match your search or filters."
                        : filters.lifecycle === "active"
                          ? 'No active clients — set Client lifecycle to "All clients".'
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
