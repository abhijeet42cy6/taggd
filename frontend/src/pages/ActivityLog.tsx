import React, { useCallback, useEffect, useRef, useState } from "react";
import { queries, type ActivityLogItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader, PlatformSection } from "@/components/platform/PlatformBlocks";

const RESOURCE_TYPE_LABEL: Record<string, string> = {
  requisition: "Requisition",
  project: "Project",
  project_logic: "Revenue logic",
  sla_metric: "SLA metric",
  sla_upload: "SLA upload",
  wfm_benchmark: "WFM benchmark",
  wfm_upload: "WFM upload",
  finance_ledger: "Finance ledger",
  finance_upload: "Finance upload",
  budget: "Budget",
  forecast: "Forecast",
  budget_forecast_upload: "Budget/forecast upload",
  budget_forecast_recalculate: "Budget/forecast recalc",
  revenue_forecast_weekly: "Weekly revenue forecast",
  revenue_visibility_snapshot: "Revenue visibility",
  ingestion_express: "Express ingest",
  ingestion_pro_inspect: "Pro · inspect",
  ingestion_pro_confirm: "Pro · run",
  ingestion_sla_upload: "SLA ingest",
  ingestion_wfm_upload: "WFM ingest",
  ingestion_finance_upload: "Finance ingest",
  candidate: "Candidate",
};

function actionAccent(action: string): string {
  const a = (action || "").toLowerCase();
  if (a === "delete") return "var(--red)";
  if (a === "create") return "var(--green)";
  if (a === "upload") return "var(--amber)";
  return "var(--accent)";
}

export function ActivityLog() {
  const { user } = useAuth();
  const [items, setItems] = useState<ActivityLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const itemsRef = useRef<ActivityLogItem[]>([]);
  itemsRef.current = items;

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    setLoading(true);
    try {
      const data = await queries.activityLog({ limit: 50, offset });
      setTotal(data.total);
      setItems((prev) => (append ? [...prev, ...data.items] : data.items));
    } catch {
      if (!append) {
        setItems([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPage(0, false);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loading) return;
    const offset = itemsRef.current.length;
    if (offset >= total) return;
    await fetchPage(offset, true);
  }, [loading, total, fetchPage]);

  const scopeHint =
    user?.role === "admin"
      ? "All recorded actions across the platform."
      : "Your actions and teammates’ activity on projects you share. Portfolio-wide actions without a project are visible only to the actor.";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        title="Activity log"
        subtitle="Edits, additions, deletions, and uploads — scoped to your role and project assignments"
      />

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -8 }}>
        <button
          type="button"
          disabled={loading}
          onClick={() => void fetchPage(0, false)}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface-raised)",
            cursor: loading ? "wait" : "pointer",
            fontSize: 11,
            fontFamily: "'DM Mono',monospace",
            color: "var(--text-subtle)",
          }}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <PlatformSection title="Timeline">
        <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 14px", lineHeight: 1.45, maxWidth: 720 }}>
          {scopeHint}
        </p>
        {loading && items.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "12px 0" }}>Loading…</div>
        ) : items.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              padding: "16px 12px",
              textAlign: "center",
              borderRadius: 10,
              border: "1px dashed var(--border)",
              background: "var(--surface-muted)",
            }}
          >
            No activity yet. Creates, updates, uploads, and ingestion runs appear here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "min(70vh, 720px)", overflowY: "auto", paddingRight: 4 }}>
            {items.map((row) => {
              const when = row.created_at
                ? new Date(row.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                : "—";
              const rt = RESOURCE_TYPE_LABEL[row.resource_type] ?? row.resource_type.replace(/_/g, " ");
              const ac = actionAccent(row.action);
              return (
                <div
                  key={row.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) auto",
                    gap: 10,
                    alignItems: "start",
                    padding: "10px 12px",
                    background: "var(--surface-raised, #fff)",
                    borderRadius: 10,
                    border: "1px solid color-mix(in srgb, var(--border) 80%, transparent)",
                    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                      <span
                        style={{
                          fontFamily: "'DM Mono',monospace",
                          fontSize: 11,
                          color: "var(--accent)",
                          fontWeight: 600,
                        }}
                      >
                        {row.public_id}
                      </span>
                      <span style={{ fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
                        {when}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-subtle)", lineHeight: 1.4 }}>
                      <span style={{ color: "var(--text)", fontWeight: 600 }}>{row.actor_email || "—"}</span>
                      {" · "}
                      <span>{rt}</span>
                      {row.project_id != null ? (
                        <span style={{ color: "var(--text-muted)" }}>{` · PRJ-${row.project_id}`}</span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 11.5, marginTop: 4, wordBreak: "break-word", color: "var(--text)" }}>
                      {row.summary}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 9.5,
                      background: `${ac}18`,
                      color: ac,
                      borderRadius: 6,
                      padding: "3px 8px",
                      fontFamily: "'DM Mono',monospace",
                      whiteSpace: "nowrap",
                      textTransform: "capitalize",
                    }}
                  >
                    {row.action}
                  </span>
                </div>
              );
            })}
            {items.length < total ? (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loading}
                style={{
                  alignSelf: "center",
                  marginTop: 8,
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface-raised)",
                  cursor: loading ? "wait" : "pointer",
                  fontSize: 11,
                  fontFamily: "'DM Mono',monospace",
                  color: "var(--text-subtle)",
                }}
              >
                {loading ? "Loading…" : `Load more (${items.length} / ${total})`}
              </button>
            ) : null}
          </div>
        )}
      </PlatformSection>
    </div>
  );
}
