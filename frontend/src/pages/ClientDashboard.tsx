import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Grid,
  Metric,
  SearchSelect,
  SearchSelectItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
  Title,
} from "@tremor/react";
import {
  api,
  invalidateCache,
  queries,
  type ClientDashboardConfig,
  type ClientDashboardSummary,
} from "@/lib/api";
import { cn, formatLargeCurrency, formatPercent } from "@/lib/utils";
import { PlatformDrawer } from "@/components/platform/PlatformDrawer";
import { TremorDashboardSection } from "@/components/tremor-dashboard/TremorDashboardSection";
import { Search } from "lucide-react";
import "@/styles/client-dashboard.css";

const flatCard =
  "overflow-hidden border-0 p-0 shadow-tremor-card ring-1 ring-tremor-ring dark:bg-dark-tremor-background dark:shadow-dark-tremor-card dark:ring-dark-tremor-ring";

function statusTagFromRaw(rawStatus: unknown): string {
  const s = String(rawStatus ?? "").trim();
  const lower = s.toLowerCase();
  if (lower === "met") return "Met";
  if (lower.includes("not met")) return "Breached";
  if (
    lower === "not reported" ||
    lower.includes("not reported") ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "-" ||
    lower === ""
  ) {
    return "Not Reported";
  }
  return "Not Reported";
}

function kpiTypeLabel(raw: string | null | undefined): string {
  if (!raw) return "—";
  const s = raw.toLowerCase();
  if (s.includes("contract")) return "Contractual";
  if (s.includes("internal")) return "Internal";
  return raw;
}

function clientSlaStatusLabel(raw: unknown): string {
  return statusTagFromRaw(raw);
}

function clientSlaBadgeColor(label: string): "emerald" | "rose" | "slate" {
  if (label === "Met") return "emerald";
  if (label === "Breached") return "rose";
  return "slate";
}

function deepCloneCfg(c: ClientDashboardConfig): ClientDashboardConfig {
  return JSON.parse(JSON.stringify(c)) as ClientDashboardConfig;
}

export function ClientDashboard() {
  const [data, setData] = useState<ClientDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scopeClientId, setScopeClientId] = useState<number | "all">("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftConfig, setDraftConfig] = useState<ClientDashboardConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res =
        scopeClientId === "all"
          ? await queries.clientDashboardSummary()
          : await queries.clientDashboardSummary({ client_id: scopeClientId });
      setData(res);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load dashboard";
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [scopeClientId]);

  useEffect(() => {
    load();
  }, [load]);

  const widgets = data?.config?.widgets ?? {};

  const saveClientId = useMemo(() => {
    if (scopeClientId !== "all") return scopeClientId;
    if (data?.selected_client_id != null) return data.selected_client_id;
    if ((data?.clients?.length ?? 0) === 1) return data!.clients[0].id;
    return null;
  }, [scopeClientId, data]);

  const openEditor = () => {
    if (!data) return;
    if (saveClientId == null) {
      setError("Select a single organisation in the filter above to customize this dashboard.");
      return;
    }
    setError(null);
    setDraftConfig(deepCloneCfg(data.config));
    setEditorOpen(true);
  };

  const saveLayout = async () => {
    if (draftConfig == null || saveClientId == null) return;
    setSaving(true);
    setError(null);
    try {
      await api.put("/client-dashboard/config", {
        client_id: saveClientId,
        config: draftConfig,
      });
      invalidateCache("client-dashboard");
      setEditorOpen(false);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleWidget = (key: keyof NonNullable<ClientDashboardConfig["widgets"]>) => {
    setDraftConfig((prev) => {
      const base = prev ?? {};
      const w = { ...(base.widgets ?? {}) };
      const visible = w[key] !== false;
      w[key] = visible ? false : true;
      return { ...base, widgets: w };
    });
  };

  const toggleDraftFlag = (
    key:
      | "sla_show_internal_kpis"
      | "finance_show_revenue"
      | "finance_show_collections"
      | "finance_show_unbilled"
      | "finance_show_cm",
  ) => {
    setDraftConfig((prev) => {
      const base = prev ?? {};
      if (key === "sla_show_internal_kpis") {
        return { ...base, [key]: !Boolean(base[key]) };
      }
      const on = base[key] !== false;
      return { ...base, [key]: !on };
    });
  };

  const toggleListFilter = (field: "project_vertical_filter" | "project_region_filter", value: string) => {
    setDraftConfig((prev) => {
      const base = prev ?? {};
      const cur = [...(base[field] ?? [])];
      const i = cur.indexOf(value);
      if (i >= 0) cur.splice(i, 1);
      else cur.push(value);
      return { ...base, [field]: cur };
    });
  };

  const slaHealth = data?.sla?.portfolio_health;
  const showKpiRow = widgets.kpi_row !== false;

  return (
    <div className="client-dash-tremor space-y-4 pb-10 md:space-y-5">
      <div className="client-dash-tremor__hero">
        <span className="inline-flex max-w-full items-center whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
          Client portal · Portfolio
        </span>
        <Title className="client-dash-tremor__title mt-0.5 text-2xl font-bold tracking-tight md:text-3xl">
          Client dashboard
        </Title>
        <Text className="mt-1.5 max-w-4xl text-xs leading-snug text-tremor-content-emphasis md:text-sm md:leading-snug">
          SLA and financial visibility for your allocated engagements — curated for clarity.
        </Text>
      </div>

      <div className="client-dash-tremor__toolbar">
        <div className="flex flex-wrap items-end justify-start gap-3">
          {(data?.clients?.length ?? 0) > 1 ? (
            <div className="min-w-[12rem] max-w-full flex-1 sm:max-w-xs">
              <Text className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                Organisation
              </Text>
              <SearchSelect
                icon={Search}
                value={scopeClientId === "all" ? "all" : String(scopeClientId)}
                onValueChange={(v) => {
                  if (!v) {
                    setScopeClientId("all");
                    return;
                  }
                  setScopeClientId(v === "all" ? "all" : Number(v));
                }}
                placeholder="Type to filter…"
                enableClear={false}
              >
                <SearchSelectItem value="all">All assigned organisations</SearchSelectItem>
                {(data?.clients ?? []).map((c) => (
                  <SearchSelectItem key={c.id} value={String(c.id)}>
                    {c.official_name}
                  </SearchSelectItem>
                ))}
              </SearchSelect>
              <Text className="mt-1 max-w-xs text-[10px] leading-snug text-tremor-content-subtle">
                Click the field, then type to filter by organisation name.
              </Text>
            </div>
          ) : null}
          <Button type="button" size="xs" variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
          {data?.can_edit_config ? (
            <Button
              type="button"
              size="xs"
              variant="secondary"
              color="orange"
              onClick={openEditor}
              title={
                saveClientId == null
                  ? "Pick one organisation to edit layout"
                  : "Customize KPIs, widgets, and filters"
              }
            >
              Customize layout
            </Button>
          ) : null}
          <Text className="ml-auto shrink-0 text-[10px] font-medium tabular-nums uppercase tracking-wide text-tremor-content-subtle">
            {loading ? "Loading…" : data ? "Ready" : ""}
          </Text>
        </div>
      </div>

      {error ? (
        <Card
          decoration="left"
          decorationColor="rose"
          className="border-0 p-3 shadow-tremor-card ring-1 ring-tremor-ring dark:bg-dark-tremor-background dark:shadow-dark-tremor-card dark:ring-dark-tremor-ring"
        >
          <Text className="text-sm text-rose-700 dark:text-rose-300">{error}</Text>
        </Card>
      ) : null}

      {loading && !data ? (
        <Card className={cn(flatCard, "p-8 text-center")}>
          <Text className="text-sm text-tremor-content-subtle">Loading dashboard…</Text>
        </Card>
      ) : null}

      {!loading && data && data.projects.length === 0 ? (
        <Card className="border border-dashed border-tremor-border bg-tremor-background-muted/40 p-8 text-center dark:border-dark-tremor-border dark:bg-dark-tremor-background-muted/30">
          <Text className="text-sm text-tremor-content-subtle">
            No engagements match the current filters or assignments. Ask your programme owner to confirm project
            allocation.
          </Text>
        </Card>
      ) : null}

      {data && data.projects.length > 0 ? (
        <>
          {showKpiRow ? (
            <Grid numItems={2} numItemsLg={4} className="gap-2 md:gap-3">
              <Card decoration="top" decorationColor="emerald" className="p-3">
                <Text className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  SLA met %
                </Text>
                <Metric className="mt-1 text-xl tabular-nums md:text-2xl">
                  {slaHealth == null ? "—" : formatPercent(slaHealth)}
                </Metric>
                <Text className="mt-0.5 text-[11px] text-tremor-content-subtle md:text-xs">
                  {data.sla.met_count != null && data.sla.not_met_count != null
                    ? `${data.sla.met_count} met · ${data.sla.not_met_count} not met`
                    : "—"}
                </Text>
              </Card>
              <Card decoration="top" decorationColor="blue" className="p-3">
                <Text className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                  SLA metrics tracked
                </Text>
                <Metric className="mt-1 text-xl tabular-nums md:text-2xl">{data.sla.total_metrics ?? "—"}</Metric>
                <Text className="mt-0.5 text-[11px] text-tremor-content-subtle md:text-xs">Across allocated projects</Text>
              </Card>
              <Card decoration="top" decorationColor="amber" className="p-3">
                <Text className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  Requisitions
                </Text>
                <Metric className="mt-1 text-xl tabular-nums md:text-2xl">{data.requisitions_total}</Metric>
                <Text className="mt-0.5 text-[11px] text-tremor-content-subtle md:text-xs">Records in scope</Text>
              </Card>
              <Card decoration="top" decorationColor="blue" className="p-3">
                <Text className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                  Revenue recognised
                </Text>
                <Metric className="mt-1 text-xl tabular-nums md:text-2xl">
                  {data.finance.revenue_actual != undefined ? formatLargeCurrency(data.finance.revenue_actual) : "—"}
                </Metric>
                <Text className="mt-0.5 text-[11px] text-tremor-content-subtle md:text-xs">
                  {data.finance.rev_attainment != undefined && widgets.finance_summary !== false
                    ? `${formatPercent(data.finance.rev_attainment)} vs budget`
                    : "—"}
                </Text>
              </Card>
            </Grid>
          ) : null}

          {widgets.sla_summary !== false ? (
            <TremorDashboardSection tag="SLA" title="SLA summary">
              <Grid numItems={1} numItemsSm={2} className="gap-3">
                <Card className="border border-tremor-border bg-tremor-background-muted/35 p-4 dark:border-dark-tremor-border dark:bg-dark-tremor-background-muted/25">
                  <Text className="text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">
                    Portfolio health
                  </Text>
                  <Metric className="mt-1 text-lg tabular-nums md:text-xl">
                    {slaHealth == null ? "—" : formatPercent(slaHealth)}
                  </Metric>
                </Card>
                <Card className="border border-tremor-border bg-tremor-background-muted/35 p-4 dark:border-dark-tremor-border dark:bg-dark-tremor-background-muted/25">
                  <Text className="text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">
                    Met / Not met / Not reported
                  </Text>
                  <Metric className="mt-1 text-base tabular-nums md:text-lg">
                    {data.sla.met_count ?? "—"} · {data.sla.not_met_count ?? "—"} · {data.sla.not_reported_count ?? "—"}
                  </Metric>
                </Card>
              </Grid>
            </TremorDashboardSection>
          ) : null}

          {widgets.finance_summary !== false && Object.keys(data.finance).length > 0 ? (
            <TremorDashboardSection tag="Finance" title="Financial snapshot">
              <Grid numItems={1} numItemsSm={2} numItemsLg={3} className="gap-3">
                {data.finance.revenue_actual != undefined ? (
                  <Card className="border border-tremor-border bg-tremor-background-muted/35 p-4 dark:border-dark-tremor-border dark:bg-dark-tremor-background-muted/25">
                    <Text className="text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">
                      Revenue (actual)
                    </Text>
                    <Metric className="mt-1 text-lg tabular-nums md:text-xl">
                      {formatLargeCurrency(data.finance.revenue_actual)}
                    </Metric>
                  </Card>
                ) : null}
                {data.finance.revenue_budget != undefined ? (
                  <Card className="border border-tremor-border bg-tremor-background-muted/35 p-4 dark:border-dark-tremor-border dark:bg-dark-tremor-background-muted/25">
                    <Text className="text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">
                      Revenue (budget)
                    </Text>
                    <Metric className="mt-1 text-lg tabular-nums md:text-xl">
                      {formatLargeCurrency(data.finance.revenue_budget)}
                    </Metric>
                  </Card>
                ) : null}
                {data.finance.rev_attainment != undefined ? (
                  <Card className="border border-tremor-border bg-tremor-background-muted/35 p-4 dark:border-dark-tremor-border dark:bg-dark-tremor-background-muted/25">
                    <Text className="text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">
                      Budget attainment
                    </Text>
                    <Metric className="mt-1 text-lg tabular-nums md:text-xl">
                      {formatPercent(data.finance.rev_attainment)}
                    </Metric>
                  </Card>
                ) : null}
                {data.finance.total_cm != undefined ? (
                  <Card className="border border-tremor-border bg-tremor-background-muted/35 p-4 dark:border-dark-tremor-border dark:bg-dark-tremor-background-muted/25">
                    <Text className="text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">
                      Contribution margin
                    </Text>
                    <Metric className="mt-1 text-lg tabular-nums md:text-xl">
                      {formatLargeCurrency(data.finance.total_cm)}
                    </Metric>
                  </Card>
                ) : null}
                {data.finance.total_collected != undefined ? (
                  <Card className="border border-tremor-border bg-tremor-background-muted/35 p-4 dark:border-dark-tremor-border dark:bg-dark-tremor-background-muted/25">
                    <Text className="text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">
                      Collected
                    </Text>
                    <Metric className="mt-1 text-lg tabular-nums md:text-xl">
                      {formatLargeCurrency(data.finance.total_collected)}
                    </Metric>
                  </Card>
                ) : null}
                {data.finance.collection_pending != undefined ? (
                  <Card className="border border-tremor-border bg-tremor-background-muted/35 p-4 dark:border-dark-tremor-border dark:bg-dark-tremor-background-muted/25">
                    <Text className="text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">
                      Collection pending
                    </Text>
                    <Metric className="mt-1 text-lg tabular-nums md:text-xl">
                      {formatLargeCurrency(data.finance.collection_pending)}
                    </Metric>
                  </Card>
                ) : null}
                {data.finance.total_unbilled != undefined ? (
                  <Card className="border border-tremor-border bg-tremor-background-muted/35 p-4 dark:border-dark-tremor-border dark:bg-dark-tremor-background-muted/25">
                    <Text className="text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">
                      Unbilled
                    </Text>
                    <Metric className="mt-1 text-lg tabular-nums md:text-xl">
                      {formatLargeCurrency(data.finance.total_unbilled)}
                    </Metric>
                  </Card>
                ) : null}
              </Grid>
              {data.is_client_user ? (
                <Text className="mt-4 text-[11px] leading-relaxed text-tremor-content-subtle">
                  Figures reflect ledger and cash-flow data available for your allocated projects. Internal-only finance
                  lines are never shown in the client view.
                </Text>
              ) : null}
            </TremorDashboardSection>
          ) : null}

          {widgets.sla_metrics_table !== false && data.sla_metrics.length > 0 ? (
            <TremorDashboardSection tag="Operations" title="SLA KPIs (latest reported)" noPad>
              <div className="overflow-x-auto px-2 pb-3 pt-1 md:px-4">
                <Table className="min-w-[720px]">
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="text-xs">Account</TableHeaderCell>
                      <TableHeaderCell className="text-xs">KPI</TableHeaderCell>
                      <TableHeaderCell className="text-xs">Type</TableHeaderCell>
                      <TableHeaderCell className="text-xs">Target</TableHeaderCell>
                      <TableHeaderCell className="text-xs">Score</TableHeaderCell>
                      <TableHeaderCell className="text-xs">Reported</TableHeaderCell>
                      <TableHeaderCell className="text-xs">Status</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.sla_metrics.map((row) => {
                      const statusLabel = clientSlaStatusLabel(row.status);
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-xs font-medium text-orange-600 dark:text-orange-400">
                            {row.account_name}
                          </TableCell>
                          <TableCell className="text-xs text-tremor-content-emphasis md:text-sm">{row.metric_label}</TableCell>
                          <TableCell className="text-[10px] text-tremor-content-subtle md:text-xs">
                            {kpiTypeLabel(row.metric_nature)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">{row.target ?? "—"}</TableCell>
                          <TableCell className="text-xs tabular-nums">{row.latest_score ?? "—"}</TableCell>
                          <TableCell className="text-[10px] tabular-nums text-tremor-content-subtle md:text-xs">
                            {row.reporting_month && row.reporting_month !== "N/A"
                              ? String(row.reporting_month).slice(0, 10)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge color={clientSlaBadgeColor(statusLabel)} size="xs">
                              {statusLabel}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TremorDashboardSection>
          ) : null}

          {widgets.projects_table !== false ? (
            <TremorDashboardSection tag="Engagements" title="Your engagements" noPad>
              <div className="overflow-x-auto px-2 pb-3 pt-1 md:px-4">
                <Table className="min-w-[640px]">
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="text-xs">Account</TableHeaderCell>
                      <TableHeaderCell className="text-xs">Engagement</TableHeaderCell>
                      <TableHeaderCell className="text-xs">Region</TableHeaderCell>
                      <TableHeaderCell className="text-xs">Vertical</TableHeaderCell>
                      <TableHeaderCell className="text-xs">Practice head</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.projects.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs text-tremor-content-strong md:text-sm">{p.account_name}</TableCell>
                        <TableCell className="text-xs text-tremor-content-emphasis md:text-sm">{p.engagement_name}</TableCell>
                        <TableCell className="text-xs text-tremor-content-emphasis md:text-sm">{p.region}</TableCell>
                        <TableCell className="text-xs text-tremor-content-emphasis md:text-sm">{p.vertical}</TableCell>
                        <TableCell className="text-xs text-tremor-content-emphasis md:text-sm">{p.practice_head}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TremorDashboardSection>
          ) : null}
        </>
      ) : null}

      <PlatformDrawer
        open={editorOpen}
        title="Customize client dashboard"
        subtitle={
          saveClientId != null
            ? `Configuration applies to organisation ID ${saveClientId}`
            : "Select one organisation to enable saving"
        }
        onClose={() => {
          setEditorOpen(false);
          setDraftConfig(null);
        }}
        width={460}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="xs"
              variant="secondary"
              disabled={saving}
              onClick={() => {
                setEditorOpen(false);
                setDraftConfig(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="xs"
              variant="primary"
              color="orange"
              disabled={saving || saveClientId == null}
              onClick={() => void saveLayout()}
            >
              {saving ? "Saving…" : "Save layout"}
            </Button>
          </div>
        }
      >
        {draftConfig ? (
          <div className="space-y-5">
            <Text className="text-xs leading-relaxed text-tremor-content-emphasis">
              Choose what your client sees on this dashboard. Empty vertical / region filters mean{" "}
              <span className="font-semibold text-tremor-content-strong">all</span> values are shown.
            </Text>

            <div className="cd-editor-section">
              <Text className="mb-2 text-[10px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                Widgets
              </Text>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["kpi_row", "KPI strip"],
                    ["sla_summary", "SLA summary"],
                    ["sla_metrics_table", "SLA KPI table"],
                    ["finance_summary", "Finance snapshot"],
                    ["projects_table", "Engagements table"],
                  ] as const
                ).map(([key, label]) => {
                  const on = draftConfig.widgets?.[key] !== false;
                  return (
                    <Button key={key} type="button" size="xs" variant={on ? "primary" : "secondary"} color={on ? "orange" : undefined} onClick={() => toggleWidget(key)}>
                      {label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="cd-editor-section">
              <Text className="mb-2 text-[10px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                SLA detail
              </Text>
              <Button
                type="button"
                size="xs"
                variant={Boolean(draftConfig.sla_show_internal_kpis) ? "primary" : "secondary"}
                color={Boolean(draftConfig.sla_show_internal_kpis) ? "orange" : undefined}
                onClick={() => toggleDraftFlag("sla_show_internal_kpis")}
              >
                Show internal KPIs (not only contractual)
              </Button>
            </div>

            <div className="cd-editor-section">
              <Text className="mb-2 text-[10px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                Finance tiles
              </Text>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["finance_show_revenue", "Revenue & attainment"],
                    ["finance_show_collections", "Collections"],
                    ["finance_show_unbilled", "Unbilled"],
                    ["finance_show_cm", "Contribution margin"],
                  ] as const
                ).map(([key, label]) => {
                  const on = draftConfig[key] !== false;
                  return (
                    <Button key={key} type="button" size="xs" variant={on ? "primary" : "secondary"} color={on ? "orange" : undefined} onClick={() => toggleDraftFlag(key)}>
                      {label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="cd-editor-section">
              <Text className="mb-2 text-[10px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                Filter — verticals (whitelist)
              </Text>
              <div className="flex flex-wrap gap-2">
                {(data?.vertical_options ?? []).length === 0 ? (
                  <Text className="text-xs text-tremor-content-subtle">No vertical labels on scoped projects.</Text>
                ) : (
                  data!.vertical_options.map((v) => {
                    const on = (draftConfig.project_vertical_filter ?? []).includes(v);
                    return (
                      <Button
                        key={v}
                        type="button"
                        size="xs"
                        variant={on ? "primary" : "secondary"}
                        color={on ? "orange" : undefined}
                        onClick={() => toggleListFilter("project_vertical_filter", v)}
                      >
                        {v}
                      </Button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="cd-editor-section">
              <Text className="mb-2 text-[10px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                Filter — regions (whitelist)
              </Text>
              <div className="flex flex-wrap gap-2">
                {(data?.region_options ?? []).length === 0 ? (
                  <Text className="text-xs text-tremor-content-subtle">No region labels on scoped projects.</Text>
                ) : (
                  data!.region_options.map((r) => {
                    const on = (draftConfig.project_region_filter ?? []).includes(r);
                    return (
                      <Button
                        key={r}
                        type="button"
                        size="xs"
                        variant={on ? "primary" : "secondary"}
                        color={on ? "orange" : undefined}
                        onClick={() => toggleListFilter("project_region_filter", r)}
                      >
                        {r}
                      </Button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : null}
      </PlatformDrawer>
    </div>
  );
}
