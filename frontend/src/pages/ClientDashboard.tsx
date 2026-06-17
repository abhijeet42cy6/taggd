import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Grid,
  Metric,
  SearchSelect,
  SearchSelectItem,
  Text,
  Title,
} from "@tremor/react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  api,
  invalidateCache,
  queries,
  type BlockCatalogEntry,
  type BlockType,
  type ClientDashboardConfig,
  type ClientDashboardSummary,
  type LayoutBlock,
} from "@/lib/api";
import { cn, formatLargeCurrency, formatPercent } from "@/lib/utils";
import { isReadOnlyClient, useAuth } from "@/lib/auth";
import { PlatformDrawer } from "@/components/platform/PlatformDrawer";
import { TremorDashboardSection } from "@/components/tremor-dashboard/TremorDashboardSection";
import {
  PipelineActivityChart,
  PipelineAgeingChart,
  PipelineKpiStrip,
  PipelineMixCharts,
  PipelineQualityStrip,
} from "@/components/tremor-dashboard/ClientPipelineBlocks";
import { PipelineAnalyticsPanel } from "@/components/tremor-dashboard/ClientPipelineDashboard";
import { mergePipelineForProjects, type PipelineFilterOptions } from "@/lib/client-pipeline-metrics";
import "@/styles/client-dashboard.css";
import "@/styles/exec-dash-premium.css";

// ─── Constants ──────────────────────────────────────────────────────────────────

const BLOCK_CATALOG_LABELS: Record<BlockType, string> = {
  req_kpi: "Requisitions KPI",
  pipeline_kpi_strip: "Pipeline KPI strip",
  pipeline_quality_strip: "Pipeline quality strip",
  pipeline_activity_chart: "Pipeline activity trend",
  pipeline_ageing_chart: "WIP ageing distribution",
  pipeline_mix_charts: "Diversity & source mix",
  pipeline_analytics_panel: "RPO pipeline analytics",
  finance_strip: "Finance snapshot",
};

/** Retired block types — stripped from saved layouts on load. */
const RETIRED_BLOCK_TYPES = new Set<string>([
  "sla_kpi_strip",
  "sla_summary_cards",
  "sla_table",
  "engagements_table",
]);

const DEFAULT_LAYOUT: LayoutBlock[] = [
  { id: "pipeline_analytics_panel", type: "pipeline_analytics_panel", variant: "card", order: 0 },
];

// ─── Utilities ──────────────────────────────────────────────────────────────────

function deepCloneLayout(layout: LayoutBlock[]): LayoutBlock[] {
  return JSON.parse(JSON.stringify(layout)) as LayoutBlock[];
}

function sanitizeLayout(layout: LayoutBlock[]): LayoutBlock[] {
  const filtered = layout.filter((b) => !RETIRED_BLOCK_TYPES.has(b.type));
  if (filtered.length === 0) return DEFAULT_LAYOUT;
  return filtered.map((b, i) => ({ ...b, order: i }));
}

// ─── Block sub-components ───────────────────────────────────────────────────────

function ReqKpi({ total, variant }: { total: number; variant: LayoutBlock["variant"] }) {
  if (variant === "dense") {
    return (
      <div className="flex items-center gap-4 rounded-tremor-default border border-tremor-border bg-white px-4 py-3">
        <div>
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Requisitions</Text>
          <Text className="mt-0.5 text-lg font-bold tabular-nums text-tremor-content-strong">{total}</Text>
        </div>
        <Text className="text-xs text-tremor-content-subtle">Records in scope</Text>
      </div>
    );
  }
  return (
    <TremorDashboardSection tag="Requisitions" title="Requisitions in scope">
      <Card decoration="top" decorationColor="amber" className="p-4">
        <Text className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Total requisitions</Text>
        <Metric className="mt-1 text-2xl tabular-nums">{total}</Metric>
        <Text className="mt-0.5 text-xs text-tremor-content-subtle">Records across allocated projects</Text>
      </Card>
    </TremorDashboardSection>
  );
}

function FinanceStrip({ finance, isClientUser }: { finance: Record<string, number>; isClientUser: boolean }) {
  if (Object.keys(finance).length === 0) return null;
  const tiles: Array<{ key: string; label: string }> = [
    { key: "revenue_actual", label: "Revenue (actual)" },
    { key: "revenue_budget", label: "Revenue (budget)" },
    { key: "rev_attainment", label: "Budget attainment" },
    { key: "total_cm", label: "Contribution margin" },
    { key: "total_collected", label: "Collected" },
    { key: "collection_pending", label: "Collection pending" },
    { key: "total_unbilled", label: "Unbilled" },
  ];
  const active = tiles.filter((t) => finance[t.key] !== undefined);
  if (active.length === 0) return null;
  return (
    <TremorDashboardSection tag="Finance" title="Financial snapshot">
      <Grid numItems={1} numItemsSm={2} numItemsLg={3} className="gap-3">
        {active.map((t) => (
          <Card key={t.key} className="border border-tremor-border bg-tremor-background-muted/35 p-4">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">{t.label}</Text>
            <Metric className="mt-1 text-lg tabular-nums md:text-xl">
              {t.key === "rev_attainment"
                ? formatPercent(finance[t.key])
                : formatLargeCurrency(finance[t.key])}
            </Metric>
          </Card>
        ))}
      </Grid>
      {isClientUser ? (
        <Text className="mt-4 text-[11px] leading-relaxed text-tremor-content-subtle">
          Figures reflect ledger and cash-flow data for your allocated projects. Internal-only finance lines are not shown.
        </Text>
      ) : null}
    </TremorDashboardSection>
  );
}

// ─── Block renderer ─────────────────────────────────────────────────────────────

function BlockRenderer({
  block,
  tabReqTotal,
  tabPipeline,
  finance,
  isClientUser,
}: {
  block: LayoutBlock;
  tabReqTotal: number;
  tabPipeline: ReturnType<typeof mergePipelineForProjects>;
  finance: Record<string, number>;
  isClientUser: boolean;
}) {
  switch (block.type) {
    case "req_kpi":
      return <ReqKpi total={tabReqTotal} variant={block.variant} />;
    case "pipeline_kpi_strip":
      return <PipelineKpiStrip metrics={tabPipeline} variant={block.variant} />;
    case "pipeline_quality_strip":
      return <PipelineQualityStrip metrics={tabPipeline} />;
    case "pipeline_activity_chart":
      return <PipelineActivityChart metrics={tabPipeline} />;
    case "pipeline_ageing_chart":
      return <PipelineAgeingChart metrics={tabPipeline} />;
    case "pipeline_mix_charts":
      return <PipelineMixCharts metrics={tabPipeline} />;
    case "pipeline_analytics_panel":
      return <PipelineAnalyticsPanel metrics={tabPipeline} />;
    case "finance_strip":
      return <FinanceStrip finance={finance} isClientUser={isClientUser} />;
    default:
      return null;
  }
}

// ─── Builder drawer internals ───────────────────────────────────────────────────

function BuilderBlockRow({
  block,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onRemove,
  onToggleVariant,
}: {
  block: LayoutBlock;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onToggleVariant: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-tremor-border bg-white px-3 py-2.5 shadow-sm">
      <GripVertical size={14} className="shrink-0 text-tremor-content-subtle" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Text className="truncate text-xs font-medium text-tremor-content-strong">
          {BLOCK_CATALOG_LABELS[block.type]}
        </Text>
      </div>
      <button
        type="button"
        onClick={onToggleVariant}
        title="Toggle variant"
        className={cn(
          "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
          block.variant === "card"
            ? "bg-orange-50 text-orange-600 hover:bg-orange-100"
            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
        )}
      >
        {block.variant}
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          title="Move up"
          className="rounded p-1 text-tremor-content-subtle hover:bg-tremor-background-muted disabled:opacity-30"
        >
          <ArrowUp size={12} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          title="Move down"
          className="rounded p-1 text-tremor-content-subtle hover:bg-tremor-background-muted disabled:opacity-30"
        >
          <ArrowDown size={12} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          title="Remove block"
          className="rounded p-1 text-rose-400 hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function ClientDashboard() {
  const { user } = useAuth();
  const isClientUser = isReadOnlyClient(user);
  const [data, setData] = useState<ClientDashboardSummary | null>(null);
  const [catalog, setCatalog] = useState<BlockCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scopeClientId, setScopeClientId] = useState<number | "all">("all");
  const [activeTabKey, setActiveTabKey] = useState<string>("all");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [draftLayout, setDraftLayout] = useState<LayoutBlock[] | null>(null);
  const [draftSlaInternal, setDraftSlaInternal] = useState(false);
  const [draftVerticals, setDraftVerticals] = useState<string[]>([]);
  const [draftRegions, setDraftRegions] = useState<string[]>([]);
  const [draftReportingFrom, setDraftReportingFrom] = useState("");
  const [draftReportingTo, setDraftReportingTo] = useState("");
  const [pipelineFilters, setPipelineFilters] = useState({
    pipeline_division: "",
    pipeline_sbg: "",
    pipeline_sbu: "",
    pipeline_bhr: "",
    pipeline_band: "",
    req_created_from: "",
    req_created_to: "",
    offer_from: "",
    offer_to: "",
    join_from: "",
    join_to: "",
  });
  const [saving, setSaving] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [availableClients, setAvailableClients] = useState<Array<{ id: number; official_name: string }>>([]);

  // ── Load summary ──────────────────────────────────────────────────────────────
  const load = useCallback(async (opts?: {
    pipeline_filters?: typeof pipelineFilters;
  }) => {
    setLoading(true);
    setError(null);
    if (isClientUser) {
      setData(null);
    }
    try {
      invalidateCache("client-dashboard/summary");
      const params: {
        client_id?: number;
        pipeline_division?: string;
        pipeline_sbg?: string;
        pipeline_sbu?: string;
        pipeline_bhr?: string;
        pipeline_band?: string;
        req_created_from?: string;
        req_created_to?: string;
        offer_from?: string;
        offer_to?: string;
        join_from?: string;
        join_to?: string;
      } = {};
      if (scopeClientId !== "all") params.client_id = scopeClientId;
      const filters = opts?.pipeline_filters ?? pipelineFilters;
      for (const [k, v] of Object.entries(filters)) {
        const trimmed = String(v).trim();
        if (trimmed) (params as Record<string, string>)[k] = trimmed;
      }
      const res = await queries.clientDashboardSummary(params);
      if (isClientUser && res.clients.length > 1 && res.selected_client_id == null) {
        throw new Error("Client dashboard scope could not be resolved. Please refresh or contact your programme owner.");
      }
      setData(res);
      // Reset to "all" tab whenever data reloads
      setActiveTabKey("all");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [scopeClientId, pipelineFilters, isClientUser]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!data?.clients?.length || isClientUser || data.is_client_user) return;
    setAvailableClients((prev) => {
      const merged = new Map(prev.map((c) => [c.id, c]));
      for (const c of data.clients) merged.set(c.id, c);
      return [...merged.values()].sort((a, b) => a.official_name.localeCompare(b.official_name));
    });
  }, [data?.clients, isClientUser, data?.is_client_user]);

  useEffect(() => {
    setPipelineFilters({
      pipeline_division: "",
      pipeline_sbg: "",
      pipeline_sbu: "",
      pipeline_bhr: "",
      pipeline_band: "",
      req_created_from: "",
      req_created_to: "",
      offer_from: "",
      offer_to: "",
      join_from: "",
      join_to: "",
    });
  }, [scopeClientId]);

  // Load block catalog once
  useEffect(() => {
    queries.clientDashboardBlocks()
      .then((r) => setCatalog(r.blocks))
      .catch(() => { /* catalog is optional; defaults fill in */ });
  }, []);

  // ── Derived: save target client ───────────────────────────────────────────────
  const saveClientId = useMemo(() => {
    if (scopeClientId !== "all") return scopeClientId;
    if (data?.selected_client_id != null) return data.selected_client_id;
    if ((data?.clients?.length ?? 0) === 1) return data!.clients[0].id;
    return null;
  }, [scopeClientId, data]);

  // ── Derived: active BU tab ────────────────────────────────────────────────────
  const buTabs = data?.bu_tabs ?? [];
  const activeBuTab = buTabs.find((t) => t.key === activeTabKey) ?? null;
  const tabPidSet = useMemo<Set<number>>(() => {
    if (activeBuTab) return new Set(activeBuTab.project_ids);
    return new Set((data?.projects ?? []).map((p) => p.id));
  }, [activeBuTab, data]);

  // ── Derived: tab-scoped data ──────────────────────────────────────────────────
  const tabReqTotal = useMemo(() => {
    let total = 0;
    const rq = data?.req_by_project ?? {};
    for (const pid of tabPidSet) {
      total += rq[String(pid)] ?? 0;
    }
    return total;
  }, [data, tabPidSet]);

  const tabPipeline = useMemo(() => {
    if (!data?.pipeline_by_project) return data?.pipeline_metrics ?? null;
    const ids = [...tabPidSet];
    if (ids.length === (data.projects?.length ?? 0)) {
      return data.pipeline_metrics ?? null;
    }
    return mergePipelineForProjects(data.pipeline_by_project, ids);
  }, [data, tabPidSet]);

  // ── Layout (from config or default) ──────────────────────────────────────────
  const layout = useMemo<LayoutBlock[]>(() => {
    const l = data?.config?.layout;
    const raw = Array.isArray(l) && l.length > 0 ? l : DEFAULT_LAYOUT;
    return sanitizeLayout(raw);
  }, [data]);

  const sortedLayout = useMemo(
    () => [...layout].sort((a, b) => a.order - b.order),
    [layout],
  );

  // ── Builder open ──────────────────────────────────────────────────────────────
  const openBuilder = () => {
    if (!data) return;
    if (saveClientId == null) {
      setError("Select a single organisation above to customise this dashboard.");
      return;
    }
    setError(null);
    setDraftLayout(deepCloneLayout(layout));
    setDraftSlaInternal(Boolean(data.config?.sla_show_internal_kpis));
    setDraftVerticals(data.config?.project_vertical_filter ?? []);
    setDraftRegions(data.config?.project_region_filter ?? []);
    setDraftReportingFrom(data.config?.sla_reporting_month_from ? String(data.config.sla_reporting_month_from).slice(0, 7) : "");
    setDraftReportingTo(data.config?.sla_reporting_month_to ? String(data.config.sla_reporting_month_to).slice(0, 7) : "");
    setBuilderOpen(true);
  };

  // ── Builder: layout mutations ─────────────────────────────────────────────────
  const moveBlock = (idx: number, dir: -1 | 1) => {
    setDraftLayout((prev) => {
      if (!prev) return prev;
      const next = deepCloneLayout(prev);
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((b, i) => ({ ...b, order: i }));
    });
  };

  const removeBlock = (idx: number) => {
    setDraftLayout((prev) => {
      if (!prev) return prev;
      return prev.filter((_, i) => i !== idx).map((b, i) => ({ ...b, order: i }));
    });
  };

  const toggleVariant = (idx: number) => {
    setDraftLayout((prev) => {
      if (!prev) return prev;
      return prev.map((b, i) =>
        i === idx ? { ...b, variant: b.variant === "card" ? "dense" : "card" } : b,
      );
    });
  };

  const addBlock = (type: BlockType) => {
    setDraftLayout((prev) => {
      const base = prev ?? [];
      const newBlock: LayoutBlock = {
        id: `${type}_${Date.now()}`,
        type,
        variant: "card",
        order: base.length,
      };
      return [...base, newBlock];
    });
  };

  const toggleDraftFilter = (
    field: "verticals" | "regions",
    value: string,
  ) => {
    const setter = field === "verticals" ? setDraftVerticals : setDraftRegions;
    setter((prev) => {
      const i = prev.indexOf(value);
      if (i >= 0) return prev.filter((v) => v !== value);
      return [...prev, value];
    });
  };

  // ── Save layout ───────────────────────────────────────────────────────────────
  const saveLayout = async () => {
    if (!draftLayout || saveClientId == null) return;
    setSaving(true);
    setError(null);
    try {
      const config: ClientDashboardConfig = {
        version: 2,
        layout: draftLayout.map((b, i) => ({ ...b, order: i })),
        sla_show_internal_kpis: draftSlaInternal,
        project_vertical_filter: draftVerticals,
        project_region_filter: draftRegions,
        sla_reporting_month_from: draftReportingFrom.trim() || null,
        sla_reporting_month_to: draftReportingTo.trim() || null,
        pipeline_period_from: data?.config?.pipeline_period_from ?? null,
        pipeline_period_to: data?.config?.pipeline_period_to ?? null,
        pipeline_period_anchor: data?.config?.pipeline_period_anchor ?? null,
        pipeline_granularity: data?.config?.pipeline_granularity,
        pipeline_compare: data?.config?.pipeline_compare,
        // Carry forward finance flags from current config
        finance_show_revenue: data?.config?.finance_show_revenue ?? true,
        finance_show_collections: data?.config?.finance_show_collections ?? true,
        finance_show_unbilled: data?.config?.finance_show_unbilled ?? true,
        finance_show_cm: data?.config?.finance_show_cm ?? false,
      };
      await api.put("/client-dashboard/config", { client_id: saveClientId, config });
      invalidateCache("client-dashboard");
      setBuilderOpen(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Computed: active client context ───────────────────────────────────────────
  const orgPickerClients = useMemo(
    () => (availableClients.length > 0 ? availableClients : (data?.clients ?? [])),
    [availableClients, data?.clients],
  );

  const activeClientId = useMemo(() => {
    if (scopeClientId !== "all") return scopeClientId;
    if (!isClientUser && !data?.is_client_user && orgPickerClients.length > 1) return null;
    if (data?.selected_client_id != null) return data.selected_client_id;
    if (orgPickerClients.length === 1) return orgPickerClients[0].id;
    if ((data?.clients?.length ?? 0) === 1) return data!.clients[0].id;
    return null;
  }, [scopeClientId, data, orgPickerClients, isClientUser, data?.is_client_user]);

  const activeClientName = useMemo(() => {
    if (activeClientId == null) return null;
    return (
      orgPickerClients.find((c) => c.id === activeClientId)?.official_name
      ?? data?.clients.find((c) => c.id === activeClientId)?.official_name
      ?? null
    );
  }, [activeClientId, orgPickerClients, data?.clients]);

  const layoutTypeCounts = useMemo(() => {
    const counts: Partial<Record<BlockType, number>> = {};
    for (const b of draftLayout ?? []) {
      counts[b.type] = (counts[b.type] ?? 0) + 1;
    }
    return counts;
  }, [draftLayout]);

  const catalogEntries = useMemo(
    () =>
      catalog.length > 0
        ? catalog
        : Object.entries(BLOCK_CATALOG_LABELS).map(([type, label]) => ({
            type,
            label,
            desc: "",
            category: "",
          })),
    [catalog],
  );

  const showOrgPicker =
    !isClientUser && !data?.is_client_user && orgPickerClients.length > 1;
  const clientScopeReady =
    !isClientUser || activeClientId != null || (data?.clients?.length ?? 0) <= 1;
  const showDashboardBody = !loading && data && clientScopeReady;
  const hasData = showDashboardBody && data.projects.length > 0;

  const activePipelineFilterCount = useMemo(
    () => Object.values(pipelineFilters).filter((v) => v.trim()).length,
    [pipelineFilters],
  );

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (showOrgPicker && scopeClientId !== "all") {
      const name = orgPickerClients.find((c) => c.id === scopeClientId)?.official_name;
      if (name) parts.push(name);
    } else if (activeClientName) {
      parts.push(activeClientName);
    }
    if (activePipelineFilterCount > 0) {
      parts.push(`${activePipelineFilterCount} pipeline filter${activePipelineFilterCount > 1 ? "s" : ""}`);
    }
    return parts.length ? parts.join(" · ") : "Default scope · click to refine";
  }, [
    showOrgPicker,
    scopeClientId,
    orgPickerClients,
    activeClientName,
    activePipelineFilterCount,
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="client-dash-tremor space-y-4 pb-10 md:space-y-5">

      {/* Hero */}
      <div className="client-dash-tremor__hero">
        <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-orange-600">
          Client portal · Portfolio
        </span>
        <Title className="client-dash-tremor__title mt-0.5 text-2xl font-bold tracking-tight md:text-3xl">
          {activeClientName ?? "Client dashboard"}
        </Title>
        {activeClientName && showOrgPicker ? (
          <div className="client-dash-tremor__scope-chip">
            <span className="client-dash-tremor__scope-chip-label">Viewing</span>
            <span className="client-dash-tremor__scope-chip-name">{activeClientName}</span>
            {scopeClientId !== "all" ? (
              <button
                type="button"
                className="client-dash-tremor__scope-chip-change"
                onClick={() => setScopeClientId("all")}
              >
                View all organisations
              </button>
            ) : (
              <span className="client-dash-tremor__scope-chip-hint">Pick one organisation below</span>
            )}
          </div>
        ) : activeClientName ? (
          <div className="client-dash-tremor__scope-chip">
            <span className="client-dash-tremor__scope-chip-label">Viewing</span>
            <span className="client-dash-tremor__scope-chip-name">{activeClientName}</span>
          </div>
        ) : null}
        <Text className="mt-1.5 max-w-4xl text-xs leading-snug text-tremor-content-emphasis md:text-sm">
          SLA and requisition visibility for your allocated engagements — curated for clarity.
        </Text>
      </div>

      {/* Organisation scope — always visible above filter toolbar */}
      {showOrgPicker ? (
        <div className="client-dash-tremor__org-scope">
          <Text className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-orange-600">Organisation</Text>
          <SearchSelect
            value={scopeClientId === "all" ? "all" : String(scopeClientId)}
            onValueChange={(v) => setScopeClientId(!v || v === "all" ? "all" : Number(v))}
            placeholder="Type to filter…"
            enableClear={false}
          >
            <SearchSelectItem value="all">All assigned organisations</SearchSelectItem>
            {(orgPickerClients).map((c) => (
              <SearchSelectItem key={c.id} value={String(c.id)}>
                {c.official_name}
              </SearchSelectItem>
            ))}
          </SearchSelect>
          <Text className="mt-1 text-[10px] text-tremor-content-subtle">
            Click the field, then type to filter.
          </Text>
        </div>
      ) : null}

      {/* Toolbar — collapsed by default; click header to expand filters */}
      <div className={cn("client-dash-tremor__toolbar", filtersExpanded && "client-dash-tremor__toolbar--expanded")}>
        <div className="client-dash-tremor__toolbar-header">
          <button
            type="button"
            className="client-dash-tremor__toolbar-toggle"
            onClick={() => setFiltersExpanded((v) => !v)}
            aria-expanded={filtersExpanded}
            aria-controls="client-dash-filter-panel"
          >
            <SlidersHorizontal size={14} className="shrink-0 text-orange-600" aria-hidden />
            <span className="client-dash-tremor__toolbar-toggle-label">Filters &amp; scope</span>
            {!filtersExpanded ? (
              <span className="client-dash-tremor__toolbar-summary">{filterSummary}</span>
            ) : null}
            {filtersExpanded ? (
              <ChevronUp size={16} className="shrink-0 text-tremor-content-subtle" aria-hidden />
            ) : (
              <ChevronDown size={16} className="shrink-0 text-tremor-content-subtle" aria-hidden />
            )}
          </button>
          <div className="client-dash-tremor__toolbar-actions">
            <Button type="button" size="xs" variant="secondary" onClick={() => void load()}>
              <RefreshCw size={12} className="mr-1" /> Refresh
            </Button>
            {data?.can_edit_config ? (
              <Button
                type="button"
                size="xs"
                variant="secondary"
                color="orange"
                onClick={openBuilder}
                title={saveClientId == null ? "Select an organisation to customise" : "Customise layout for this client"}
              >
                <Settings2 size={12} className="mr-1" /> Customize layout
              </Button>
            ) : null}
            <Text className="text-[10px] font-medium uppercase tracking-wide text-tremor-content-subtle">
              {loading ? "Loading…" : data ? "Ready" : ""}
            </Text>
          </div>
        </div>

        {filtersExpanded ? (
          <div id="client-dash-filter-panel" className="client-dash-tremor__toolbar-body">
          <div className="flex flex-wrap items-end gap-3">
            <Text className="w-full text-[10px] font-semibold uppercase tracking-wide text-orange-600">Pipeline filters</Text>
            {(
              [
                ["division", "All Divisions", "pipeline_division"],
                ["sbg", "All SBGs", "pipeline_sbg"],
                ["sbu", "All SBUs", "pipeline_sbu"],
                ["bhr", "All BHRs", "pipeline_bhr"],
                ["band", "All Bands", "pipeline_band"],
              ] as const
            ).map(([optKey, allLabel, filterKey]) => {
              const opts = (data?.pipeline_filter_options as PipelineFilterOptions | undefined)?.[optKey] ?? [];
              const hasOptions = opts.length > 0;
              return (
                <div key={filterKey} className="min-w-[8rem] flex-1 sm:max-w-[10rem]">
                  <Text className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">
                    {allLabel.replace(/^All /, "")}
                  </Text>
                  <select
                    className="w-full rounded-md border border-tremor-border bg-white px-2 py-1.5 text-xs text-tremor-content-strong disabled:cursor-not-allowed disabled:bg-tremor-background-subtle disabled:text-tremor-content-subtle"
                    value={pipelineFilters[filterKey]}
                    disabled={!hasOptions}
                    onChange={(e) => {
                      const next = { ...pipelineFilters, [filterKey]: e.target.value };
                      setPipelineFilters(next);
                      void load({ pipeline_filters: next });
                    }}
                  >
                    <option value="">{allLabel}</option>
                    {opts.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              );
            })}
            {(
              [
                ["req_created_from", "req_created_to", "Req creation"],
                ["offer_from", "offer_to", "Offer accept"],
                ["join_from", "join_to", "Joiner date"],
              ] as const
            ).map(([fromKey, toKey, label]) => (
              <div key={fromKey} className="min-w-[11rem]">
                <Text className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">{label}</Text>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    className="w-full rounded-md border border-tremor-border bg-white px-1.5 py-1.5 text-[11px] text-tremor-content-strong"
                    value={pipelineFilters[fromKey]}
                    onChange={(e) => setPipelineFilters((prev) => ({ ...prev, [fromKey]: e.target.value }))}
                    onBlur={() => void load()}
                  />
                  <span className="text-[10px] text-tremor-content-subtle">–</span>
                  <input
                    type="date"
                    className="w-full rounded-md border border-tremor-border bg-white px-1.5 py-1.5 text-[11px] text-tremor-content-strong"
                    value={pipelineFilters[toKey]}
                    onChange={(e) => setPipelineFilters((prev) => ({ ...prev, [toKey]: e.target.value }))}
                    onBlur={() => void load()}
                  />
                </div>
              </div>
            ))}
            {Object.values(pipelineFilters).some((v) => v.trim()) ? (
              <Button
                type="button"
                size="xs"
                variant="light"
                onClick={() => {
                  const cleared = {
                    pipeline_division: "",
                    pipeline_sbg: "",
                    pipeline_sbu: "",
                    pipeline_bhr: "",
                    pipeline_band: "",
                    req_created_from: "",
                    req_created_to: "",
                    offer_from: "",
                    offer_to: "",
                    join_from: "",
                    join_to: "",
                  };
                  setPipelineFilters(cleared);
                  void load({ pipeline_filters: cleared });
                }}
              >
                Reset filters
              </Button>
            ) : null}
          </div>
          </div>
        ) : null}
      </div>

      {/* Error */}
      {error ? (
        <Card decoration="left" decorationColor="rose" className="border-0 p-3 ring-1 ring-tremor-ring">
          <Text className="text-sm text-rose-700">{error}</Text>
        </Card>
      ) : null}

      {/* Loading skeleton */}
      {(loading && !data) || (isClientUser && loading) || (isClientUser && data && !clientScopeReady) ? (
        <Card className="overflow-hidden border-0 p-8 text-center ring-1 ring-tremor-ring">
          <Text className="text-sm text-tremor-content-subtle">Loading dashboard…</Text>
        </Card>
      ) : null}

      {/* Empty state */}
      {showDashboardBody && data.projects.length === 0 ? (
        <Card className="border border-dashed border-tremor-border p-8 text-center">
          <Text className="text-sm text-tremor-content-subtle">
            No engagements match the current filters or assignments. Ask your programme owner to confirm project allocation.
          </Text>
        </Card>
      ) : null}

      {/* BU / SBU tabs */}
      {hasData && buTabs.length > 0 ? (
        <div className="cd-bu-tabs">
          {buTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTabKey(tab.key)}
              className={cn(
                "cd-bu-tab",
                activeTabKey === tab.key ? "cd-bu-tab--active" : "cd-bu-tab--idle",
              )}
            >
              {tab.label}
              <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums leading-none"
                style={activeTabKey === tab.key
                  ? { background: "rgb(234 88 12 / 0.12)", color: "rgb(194 65 12)" }
                  : { background: "rgb(0 0 0 / 0.06)", color: "rgb(100 100 100)" }}
              >
                {tab.project_ids.length}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Layout blocks */}
      {hasData ? (
        <div className="space-y-4 md:space-y-5">
          {sortedLayout.map((block) => (
            <BlockRenderer
              key={block.id}
              block={block}
              tabReqTotal={tabReqTotal}
              tabPipeline={tabPipeline}
              finance={data!.finance}
              isClientUser={isClientUser || data!.is_client_user}
            />
          ))}
        </div>
      ) : null}

      {/* ── Builder drawer ─────────────────────────────────────────────────────── */}
      <PlatformDrawer
        open={builderOpen}
        title="Customize client dashboard"
        subtitle={
          activeClientName != null
            ? (
              <span className="cd-builder-client-badge">
                Changes apply to <strong>{activeClientName}</strong>
              </span>
            )
            : "Select one organisation to enable saving"
        }
        onClose={() => { setBuilderOpen(false); setDraftLayout(null); }}
        className="platform-drawer--client-builder"
        width="min(920px, 96vw)"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button" size="xs" variant="secondary" disabled={saving}
              onClick={() => { setBuilderOpen(false); setDraftLayout(null); }}
            >
              Cancel
            </Button>
            <Button
              type="button" size="xs" variant="primary" color="orange"
              disabled={saving || saveClientId == null || !draftLayout}
              onClick={() => void saveLayout()}
            >
              {saving ? "Saving…" : "Save layout"}
            </Button>
          </div>
        }
      >
        {draftLayout ? (
          <div className="cd-builder-shell space-y-5">
            <Text className="text-xs leading-relaxed text-tremor-content-emphasis">
              Build what your client sees. Reorder blocks, switch card vs dense, and add duplicates if needed.
            </Text>

            <div className="cd-builder-main">
              {/* ── Current layout blocks ── */}
              <div className="cd-editor-section cd-builder-panel">
                <Text className="cd-builder-label">Layout blocks ({draftLayout.length})</Text>
                {draftLayout.length === 0 ? (
                  <Text className="text-xs text-tremor-content-subtle">No blocks yet — add from the catalog.</Text>
                ) : (
                  <div className="space-y-2">
                    {draftLayout.map((block, idx) => (
                      <BuilderBlockRow
                        key={block.id}
                        block={block}
                        index={idx}
                        total={draftLayout.length}
                        onMoveUp={() => moveBlock(idx, -1)}
                        onMoveDown={() => moveBlock(idx, 1)}
                        onRemove={() => removeBlock(idx)}
                        onToggleVariant={() => toggleVariant(idx)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* ── Add blocks from catalog ── */}
              <div className="cd-editor-section cd-builder-panel">
                <Text className="cd-builder-label">Add block</Text>
                <Text className="mb-2 text-[10px] leading-relaxed text-tremor-content-subtle">
                  Click + to add. Blocks already in the layout stay clickable — you can add the same block more than once.
                </Text>
                <div className="cd-builder-catalog">
                  {catalogEntries.map((entry) => {
                    const type = entry.type as BlockType;
                    const inLayoutCount = layoutTypeCounts[type] ?? 0;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => addBlock(type)}
                        className="cd-builder-catalog-item"
                        title={`Add ${entry.label}`}
                      >
                        <div className="min-w-0 flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <Text className="text-xs font-medium text-tremor-content-strong">{entry.label}</Text>
                            {inLayoutCount > 0 ? (
                              <span className="cd-builder-catalog-badge">×{inLayoutCount}</span>
                            ) : null}
                          </div>
                          {entry.desc ? (
                            <Text className="mt-0.5 text-[10px] leading-snug text-tremor-content-subtle">{entry.desc}</Text>
                          ) : null}
                        </div>
                        <span className="cd-builder-catalog-add" aria-hidden>
                          <Plus size={14} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── SLA detail toggle ── */}
            <div className="cd-editor-section">
              <Text className="cd-builder-label">SLA detail</Text>
              <button
                type="button"
                onClick={() => setDraftSlaInternal((v) => !v)}
                className={cn(
                  "rounded-tremor-default border px-3 py-1.5 text-xs font-medium transition-colors",
                  draftSlaInternal
                    ? "border-orange-400 bg-orange-50 text-orange-700"
                    : "border-tremor-border bg-white text-tremor-content hover:border-orange-300",
                )}
              >
                {draftSlaInternal ? "✓ " : ""}Show internal KPIs (not only contractual)
              </button>
            </div>

            {/* ── Default SLA reporting window ── */}
            <div className="cd-editor-section">
              <Text className="cd-builder-label">SLA reporting window (client default)</Text>
              <Text className="mb-2 text-[10px] text-tremor-content-subtle">
                Optional default month range for SLA blocks when this client opens the dashboard.
              </Text>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Text className="mb-1 text-[10px] text-tremor-content-subtle">From</Text>
                  <input
                    type="month"
                    className="rounded-md border border-tremor-border bg-white px-2 py-1.5 text-xs font-mono"
                    value={draftReportingFrom}
                    onChange={(e) => setDraftReportingFrom(e.target.value)}
                    list="client-dash-builder-month-options"
                  />
                </div>
                <div>
                  <Text className="mb-1 text-[10px] text-tremor-content-subtle">Through</Text>
                  <input
                    type="month"
                    className="rounded-md border border-tremor-border bg-white px-2 py-1.5 text-xs font-mono"
                    value={draftReportingTo}
                    onChange={(e) => setDraftReportingTo(e.target.value)}
                    list="client-dash-builder-month-options"
                  />
                </div>
                {(draftReportingFrom || draftReportingTo) ? (
                  <button
                    type="button"
                    className="rounded-tremor-default border border-tremor-border bg-white px-2.5 py-1.5 text-xs text-tremor-content hover:border-orange-300"
                    onClick={() => {
                      setDraftReportingFrom("");
                      setDraftReportingTo("");
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              <datalist id="client-dash-builder-month-options">
                {(data?.reporting_month_options ?? []).map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>

            {/* ── Vertical filter ── */}
            {(data?.vertical_options ?? []).length > 0 ? (
              <div className="cd-editor-section">
                <Text className="cd-builder-label">Filter — verticals (whitelist)</Text>
                <Text className="mb-2 text-[10px] text-tremor-content-subtle">
                  Empty = all verticals shown.
                </Text>
                <div className="flex flex-wrap gap-2">
                  {data!.vertical_options.map((v) => {
                    const on = draftVerticals.includes(v);
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => toggleDraftFilter("verticals", v)}
                        className={cn(
                          "rounded-tremor-default border px-2.5 py-1 text-xs font-medium transition-colors",
                          on
                            ? "border-orange-400 bg-orange-50 text-orange-700"
                            : "border-tremor-border bg-white text-tremor-content hover:border-orange-300",
                        )}
                      >
                        {on ? "✓ " : ""}{v}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* ── Region filter ── */}
            {(data?.region_options ?? []).length > 0 ? (
              <div className="cd-editor-section">
                <Text className="cd-builder-label">Filter — regions (whitelist)</Text>
                <Text className="mb-2 text-[10px] text-tremor-content-subtle">
                  Empty = all regions shown.
                </Text>
                <div className="flex flex-wrap gap-2">
                  {data!.region_options.map((r) => {
                    const on = draftRegions.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleDraftFilter("regions", r)}
                        className={cn(
                          "rounded-tremor-default border px-2.5 py-1 text-xs font-medium transition-colors",
                          on
                            ? "border-orange-400 bg-orange-50 text-orange-700"
                            : "border-tremor-border bg-white text-tremor-content hover:border-orange-300",
                        )}
                      >
                        {on ? "✓ " : ""}{r}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </PlatformDrawer>
    </div>
  );
}
