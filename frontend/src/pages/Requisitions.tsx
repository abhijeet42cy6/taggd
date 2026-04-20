import React, { useCallback, useEffect, useMemo, useState } from "react";
import { queries, type Project, type RecordRow, type RecordsPage, type RequisitionKpis } from "@/lib/api";
import { PlatformKpi, PlatformSection, PageHeader, StatusTag } from "@/components/platform/PlatformBlocks";
import { isRecruiterUser, useAuth } from "@/lib/auth";
import { RequisitionCreateDrawer } from "@/components/platform/RequisitionCreateDrawer";
import { RequisitionRecordDrawer } from "@/components/platform/RequisitionRecordDrawer";
import { LevelDonutChart, AgeingBars } from "@/components/platform/Charts";
import { SkeletonTable, SkeletonKpiRow, Skeleton } from "@/components/platform/Skeleton";
import { requisitionFunnelVm } from "@/lib/view-models/requisitions";
import { formatCurrency } from "@/lib/utils";

const PER_PAGE = 50;

// Build department frequency chart from loaded records (same logic as ClientDetail)
function buildDeptData(records: import("@/lib/api").RecordRow[]) {
  const freq: Record<string, number> = {};
  for (const r of records) {
    const dept = (r.department || "").trim();
    if (!dept || dept === "nan" || dept === "—") continue;
    freq[dept] = (freq[dept] || 0) + 1;
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 8);
  const otherCount = sorted.slice(8).reduce((s, [, v]) => s + v, 0);
  const result = top.map(([name, value]) => ({ name, value }));
  if (otherCount > 0) result.push({ name: "Other", value: otherCount });
  return result;
}

export function Requisitions() {
  const { user } = useAuth();
  const recruiterView = isRecruiterUser(user);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [result, setResult] = useState<RecordsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RecordRow | null>(null);

  // Full-dataset stats from monitor (not affected by pagination)
  const [globalStatusBreakdown, setGlobalStatusBreakdown] = useState<Record<string, number>>({});
  const [monitor, setMonitor] = useState<import("@/lib/api").GlobalMonitor | null>(null);
  const [reqKpis, setReqKpis] = useState<RequisitionKpis | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [addReqOpen, setAddReqOpen] = useState(false);

  useEffect(() => {
    queries.projects().then(setProjects).catch(() => setProjects([]));
  }, []);

  // Load global monitor once (status breakdown + ageing summary)
  useEffect(() => {
    queries.globalMonitor().then((m) => {
      setGlobalStatusBreakdown(m.status_breakdown ?? {});
      setMonitor(m);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    queries.requisitionKpis().then(setReqKpis).catch(() => setReqKpis(null));
  }, []);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch when page or search changes
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    queries
      .recordsAll({ page, per_page: PER_PAGE, search: debouncedSearch || undefined })
      .then((data) => { if (mounted) { setResult(data); setLoading(false); } })
      .catch(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [page, debouncedSearch]);

  // Reset to page 1 when search changes
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const records = result?.records ?? [];
  const totalRecords = result?.total ?? 0;
  const totalPages = result?.pages ?? 1;

  // Build funnel from full global status breakdown when available,
  // fall back to current-page records when searching (filtered view)
  const funnel = useMemo(() => {
    if (debouncedSearch) {
      // When searching, use page records (relative counts within search results)
      return requisitionFunnelVm(records);
    }
    // Map normalised global_status keys to funnel labels
    const sb = globalStatusBreakdown;
    if (Object.keys(sb).length === 0) return requisitionFunnelVm(records);
    return {
      Draft:     sb["UNPROCESSED"] ?? 0,
      Open:      sb["ACTIVE"]      ?? 0,
      Screening: sb["PIPELINE"]    ?? 0,
      Offer:     0,  // not a distinct global_status — grouped into ACTIVE
      Joined:    sb["CLOSED"]      ?? 0,
      Cancelled: sb["ON HOLD"]     ?? 0,
    };
  }, [globalStatusBreakdown, records, debouncedSearch]);

  // Scale bars relative to the largest bucket in the funnel (not total records)
  const funnelMax = Math.max(...Object.values(funnel), 1);

  const funnelColors: Record<string, string> = {
    Draft: "var(--text3)", Open: "var(--accent)", Screening: "var(--accent2)",
    Offer: "var(--amber)", Joined: "var(--green)", Cancelled: "var(--red)",
  };

  // Ageing buckets from globalMonitor (covers entire dataset, not just current page)
  const monitorBuckets = monitor?.ageing_summary?.buckets ?? {};
  const ageingMax = Math.max(...Object.values(monitorBuckets), 1);
  const ageingBuckets = [
    // Backend bucket keys are: "0-30 days", "31-60 days", "61-90 days", "90+ days"
    { label: "0–30 days",  count: monitorBuckets["0-30 days"]  ?? monitorBuckets["0–30 days"]  ?? 0, max: ageingMax, color: "var(--green)" },
    { label: "31–60 days", count: monitorBuckets["31-60 days"] ?? monitorBuckets["31–60 days"] ?? 0, max: ageingMax, color: "var(--amber)" },
    { label: "61–90 days", count: monitorBuckets["61-90 days"] ?? monitorBuckets["61–90 days"] ?? 0, max: ageingMax, color: "var(--red)" },
    { label: "90+ days",   count: monitorBuckets["90+ days"]   ?? monitorBuckets["90–plus days"] ?? 0, max: ageingMax, color: "var(--red)" },
  ];

  // Department donut from current page's records (updates as user pages/searches)
  const deptData = useMemo(() => buildDeptData(records), [records]);

  const onRequisitionSaved = useCallback((updated: RecordRow) => {
    setSelected(updated);
    setResult((prev) => {
      if (!prev) return prev;
      return { ...prev, records: prev.records.map((row) => (row.id === updated.id ? updated : row)) };
    });
  }, []);

  const onRequisitionDeleted = useCallback((id: number) => {
    setSelected(null);
    setResult((prev) => {
      if (!prev) return prev;
      if (!prev.records.some((r) => r.id === id)) return prev;
      const records = prev.records.filter((row) => row.id !== id);
      const total = Math.max(0, prev.total - 1);
      const pages = Math.max(1, Math.ceil(total / prev.per_page));
      return { ...prev, records, total, pages };
    });
    queries.requisitionKpis().then(setReqKpis).catch(() => {});
    queries.globalMonitor().then((m) => {
      setGlobalStatusBreakdown(m.status_breakdown ?? {});
      setMonitor(m);
    }).catch(() => {});
  }, []);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <PageHeader
        title="Requisitions"
        subtitle={
          recruiterView
            ? reqKpis
              ? `${reqKpis.total_records.toLocaleString()} visible to you — assigned to you or on your projects (same scope as the table below)`
              : `${totalRecords.toLocaleString()} on this view · loading KPIs…`
            : reqKpis
              ? `${reqKpis.total_records.toLocaleString()} in tracker · Open / Offer / Joiner counts are portfolio-wide`
              : `${totalRecords.toLocaleString()} on this view · loading portfolio KPIs…`
        }
      />

      {/* TOP KPIs — Open / Offer / Joiner from tracker `records` */}
      {reqKpis ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <PlatformKpi
            label="Open reqs"
            value={reqKpis.open_req.toLocaleString()}
            accent="blue"
            delta="ACTIVE (no offer signal in status)"
          />
          <PlatformKpi
            label="Offer reqs"
            value={reqKpis.offer_req.toLocaleString()}
            accent="amber"
            delta="PIPELINE or status contains “offer”"
          />
          <PlatformKpi
            label="Joiners"
            value={reqKpis.joiners.toLocaleString()}
            accent="green"
            delta="CLOSED (joined / closed hires)"
          />
        </div>
      ) : (
        <SkeletonKpiRow count={3} />
      )}

      {/* FUNNEL + AGEING */}
      <div className="platform-grid-5-7">
        <PlatformSection title="Pipeline Funnel">
          {loading && !result
            ? <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{Array(5).fill(0).map((_, i) => <Skeleton key={i} height={20} />)}</div>
            : (
              <div style={{ padding: "4px 0" }}>
                {Object.entries(funnel).map(([k, v]) => (
                  <div key={k} className="funnel-item">
                    <div className="funnel-label">{k}</div>
                    <div className="funnel-bar-wrap">
                      <div className="funnel-bar" style={{
                        width: `${Math.max(3, (v / funnelMax) * 92)}%`,
                        background: funnelColors[k] ?? "var(--accent)",
                      }}>{v.toLocaleString()}</div>
                    </div>
                    <div className="funnel-count">{v}</div>
                  </div>
                ))}
              </div>
            )
          }
        </PlatformSection>

        <PlatformSection title="Ageing Distribution + Dept Mix">
          <AgeingBars buckets={ageingBuckets} />
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace", marginBottom: 4 }}>
              Req by Department (Top 8)
            </div>
            {deptData.length === 0
              ? <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 11 }}>
                  No department data on this page
                </div>
              : <LevelDonutChart data={deptData} />
            }
          </div>
        </PlatformSection>
      </div>

      {/* MASTER TABLE */}
      <PlatformSection
        title={`Requisition Master Table — ${totalRecords.toLocaleString()} records`}
        action="Export"
        headerRight={
          projects.length > 0 ? (
            <button
              type="button"
              className="req-drawer-btn-edit"
              onClick={() => setAddReqOpen(true)}
            >
              Add requisition
            </button>
          ) : null
        }
      >
        {/* SEARCH + PAGINATION */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10 }}>
          <input
            className="platform-search"
            placeholder="Filter by candidate, position, HM..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 260 }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'DM Mono',monospace", fontSize: 10.5 }}>
            <span style={{ color: "var(--text-muted)" }}>
              {totalRecords > 0
                ? `${((page - 1) * PER_PAGE) + 1}–${Math.min(page * PER_PAGE, totalRecords)} of ${totalRecords.toLocaleString()}`
                : "—"}
            </span>
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg2)", color: page <= 1 ? "var(--text-muted)" : "var(--text)", cursor: page <= 1 ? "not-allowed" : "pointer" }}
            >←</button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg2)", color: page >= totalPages ? "var(--text-muted)" : "var(--text)", cursor: page >= totalPages ? "not-allowed" : "pointer" }}
            >→</button>
          </div>
        </div>

        {/* TABLE */}
        <div className="platform-table-wrap">
          {loading && !result
            ? <SkeletonTable rows={8} cols={9} />
            : (
              <table className="platform-table">
                <thead>
                  <tr>
                    <th>Req ID</th><th>Candidate</th><th>Position</th><th>Status</th>
                    <th>HM</th><th>Dept</th><th>Location</th><th>CTC</th><th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 && (
                    <tr><td colSpan={9} style={{ color: "var(--text-muted)", textAlign: "center" }}>
                      {totalRecords === 0 ? "Upload a project file to see requisitions" : "No matching records"}
                    </td></tr>
                  )}
                  {records.map((r) => {
                    const reqId = (r.additional_attributes?.position_code as string) || `REQ-${r.id}`;
                    const rev = r.revenue_results?.revenue ?? 0;
                    const ageColor = (r.ageing ?? 0) > 90 ? "var(--red)" : (r.ageing ?? 0) > 60 ? "var(--amber)" : undefined;
                    return (
                      <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => setSelected(r)}>
                        <td style={{ fontFamily: "'DM Mono',monospace", color: "var(--accent)" }}>{reqId}</td>
                        <td>{r.candidate_name || "—"}</td>
                        <td>{r.position_title || "—"}</td>
                        <td><StatusTag status={r.status || r.global_status || "Open"} /></td>
                        <td>{r.hiring_manager || "—"}</td>
                        <td>{r.department || "—"}</td>
                        <td>{r.location || "—"}</td>
                        <td>{r.offered_ctc ? `₹${(r.offered_ctc / 100000).toFixed(1)}L` : "—"}</td>
                        <td style={{ color: rev > 0 ? "var(--green)" : "var(--text-muted)" }}>{rev > 0 ? formatCurrency(rev) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          }
        </div>

        {/* BOTTOM PAGINATION */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 12 }}>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = i + 1;
              return (
                <button key={p} onClick={() => setPage(p)}
                  style={{
                    width: 28, height: 28, borderRadius: 6, border: "1px solid var(--border)",
                    background: page === p ? "color-mix(in srgb, var(--accent) 20%, transparent)" : "var(--bg2)",
                    color: page === p ? "var(--accent)" : "var(--text-subtle)", cursor: "pointer",
                    fontSize: 10.5, fontFamily: "'DM Mono',monospace",
                  }}>{p}</button>
              );
            })}
            {totalPages > 7 && <span style={{ color: "var(--text-muted)", alignSelf: "center", fontSize: 10 }}>…{totalPages} pages</span>}
          </div>
        )}
      </PlatformSection>

      <RequisitionCreateDrawer
        open={addReqOpen}
        onClose={() => setAddReqOpen(false)}
        projects={projects}
        onCreated={(r) => {
          setAddReqOpen(false);
          setSelected(r);
          setPage(1);
          queries
            .recordsAll({ page: 1, per_page: PER_PAGE, search: debouncedSearch || undefined })
            .then(setResult)
            .catch(() => {});
          queries.requisitionKpis().then(setReqKpis).catch(() => setReqKpis(null));
          queries.globalMonitor().then((m) => {
            setGlobalStatusBreakdown(m.status_breakdown ?? {});
            setMonitor(m);
          }).catch(() => {});
        }}
      />

      {/* REQUISITION DETAIL DRAWER */}
      <RequisitionRecordDrawer
        record={selected}
        onClose={() => setSelected(null)}
        onSaved={onRequisitionSaved}
        onDeleted={onRequisitionDeleted}
      />
    </div>
  );
}
