import React, { useEffect, useState } from "react";
import { invalidateCache, queries } from "@/lib/api";
import { PlatformKpi, PlatformSection, PageHeader } from "@/components/platform/PlatformBlocks";

export function DataOperations() {
  const [summary, setSummary] = useState<any>(null);

  const [revenueProjects, setRevenueProjects] = useState<any[]>([]);
  const [joiningProjects, setJoiningProjects] = useState<any[]>([]);

  const [revenueRecords, setRevenueRecords] = useState<any[]>([]);
  const [joiningRecords, setJoiningRecords] = useState<any[]>([]);

  const [revPage, setRevPage] = useState(1);
  const [joinPage, setJoinPage] = useState(1);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [sum, revP, joinP, revR, joinR] = await Promise.allSettled([
        queries.dataOpsSummary(),
        queries.dataOpsRevenueRiskProjects({ page: 1, per_page: 20 }),
        queries.dataOpsMissingJoiningProjects({ page: 1, per_page: 20 }),
        queries.dataOpsRevenueRiskRecords({ page: 1, per_page: 50 }),
        queries.dataOpsMissingJoiningRecords({ page: 1, per_page: 50 }),
      ]);

      if (sum.status === "fulfilled") setSummary(sum.value);
      if (revP.status === "fulfilled") setRevenueProjects(revP.value.projects ?? []);
      if (joinP.status === "fulfilled") setJoiningProjects(joinP.value.projects ?? []);
      if (revR.status === "fulfilled") setRevenueRecords(revR.value.records ?? []);
      if (joinR.status === "fulfilled") setJoiningRecords(joinR.value.records ?? []);
      setLoading(false);
    })();
  }, []);

  // Pagination: refresh evidence rows when the page changes
  useEffect(() => {
    (async () => {
      const [revR, joinR] = await Promise.allSettled([
        queries.dataOpsRevenueRiskRecords({ page: revPage, per_page: 50 }),
        queries.dataOpsMissingJoiningRecords({ page: joinPage, per_page: 50 }),
      ]);
      if (revR.status === "fulfilled") setRevenueRecords(revR.value.records ?? []);
      if (joinR.status === "fulfilled") setJoiningRecords(joinR.value.records ?? []);
    })();
  }, [revPage, joinPage]);

  const splitClients: Array<[string, number]> = summary?.split_clients ?? [];
  const qualityScore: number = summary?.quality_score ?? 0;
  const revenueClosedZeroCount: number = summary?.revenue_closed_zero_count ?? 0;
  const missingJoiningCount: number = summary?.missing_joining_count ?? 0;
  const placeholderCandidateCount: number = summary?.placeholder_candidate_count ?? 0;

  const reloadAll = async () => {
    // Mutations are followed by cache invalidation + re-fetch.
    invalidateCache("data-ops/");
    invalidateCache("stats/monitor");

    const [sum, revP, joinP, revR, joinR] = await Promise.allSettled([
      queries.dataOpsSummary(),
      queries.dataOpsRevenueRiskProjects({ page: 1, per_page: 20 }),
      queries.dataOpsMissingJoiningProjects({ page: 1, per_page: 20 }),
      queries.dataOpsRevenueRiskRecords({ page: 1, per_page: 50 }),
      queries.dataOpsMissingJoiningRecords({ page: 1, per_page: 50 }),
    ]);

    if (sum.status === "fulfilled") setSummary(sum.value);
    if (revP.status === "fulfilled") setRevenueProjects(revP.value.projects ?? []);
    if (joinP.status === "fulfilled") setJoiningProjects(joinP.value.projects ?? []);
    if (revR.status === "fulfilled") setRevenueRecords(revR.value.records ?? []);
    if (joinR.status === "fulfilled") setJoiningRecords(joinR.value.records ?? []);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <PageHeader title="Data Operations" subtitle="Trust · Integrity · Duplicate detection · Ingestion quality" />

      {(revenueClosedZeroCount > 0 || missingJoiningCount > 0 || splitClients.length > 0) && (
        <div className="alert-banner red">
          🔴 Data integrity risks detected. Review evidence rows and run remediation on affected projects.
        </div>
      )}

      {/* KPI RIBBON */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        <PlatformKpi label="Data Quality Score" value={`${qualityScore}/100`}
          accent={qualityScore >= 85 ? "green" : qualityScore >= 65 ? "amber" : "red"} delta="— stable" />
        <PlatformKpi
          label="Revenue Risk (CLOSED≠fee)"
          value={revenueClosedZeroCount}
          accent={revenueClosedZeroCount > 0 ? "red" : "green"}
          delta={revenueClosedZeroCount > 0 ? "Fix via Recalculate" : "Clean"}
        />
        <PlatformKpi
          label="Missing Joining Date"
          value={missingJoiningCount}
          accent={missingJoiningCount > 0 ? "amber" : "green"}
          delta={missingJoiningCount > 0 ? "Evidence-based review" : "Clean"}
        />
        <PlatformKpi
          label="Placeholder Candidate IDs"
          value={placeholderCandidateCount}
          accent={placeholderCandidateCount > 0 ? "amber" : "green"}
          delta="Identity hygiene"
        />
      </div>

      <div className="platform-grid-2">
        {/* Revenue Risk Projects */}
        <PlatformSection title="Revenue-risk Projects" action="Remediate">
          <div style={{ color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace", fontSize: 10.5, marginBottom: 10 }}>
            CLOSED records where revenue and closing_fee are both zero.
          </div>

          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Bad Rows</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} style={{ color: "var(--text-muted)", textAlign: "center" }}>Loading…</td>
                  </tr>
                ) : revenueProjects.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ color: "var(--text-muted)", textAlign: "center" }}>No revenue-risk projects</td>
                  </tr>
                ) : (
                  revenueProjects.map((p: any) => (
                    <tr key={p.project_id}>
                      <td style={{ fontFamily: "'DM Mono',monospace" }}>{p.account_name}</td>
                      <td style={{ color: "var(--red)", fontFamily: "'DM Mono',monospace" }}>{p.bad_count}</td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button
                            className="platform-chip active"
                            style={{ fontSize: 10.5, cursor: "pointer" }}
                            onClick={async () => {
                              await queries.recalculateProject(p.project_id);
                              await reloadAll();
                            }}
                          >
                            Recalculate
                          </button>
                          <button
                            className="platform-chip"
                            style={{ fontSize: 10.5, cursor: "pointer" }}
                            onClick={async () => {
                              await queries.regenerateProjectLogic(p.project_id);
                              await reloadAll();
                            }}
                          >
                            Regenerate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PlatformSection>

        {/* Missing joining date + identity mismatches */}
        <PlatformSection title="Lifecycle-risk Projects" action="Review">
          <div style={{ color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace", fontSize: 10.5, marginBottom: 10 }}>
            CLOSED records with missing joining_date.
          </div>

          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Bad Rows</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} style={{ color: "var(--text-muted)", textAlign: "center" }}>Loading…</td>
                  </tr>
                ) : joiningProjects.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ color: "var(--text-muted)", textAlign: "center" }}>No lifecycle-risk projects</td>
                  </tr>
                ) : (
                  joiningProjects.map((p: any) => (
                    <tr key={p.project_id}>
                      <td style={{ fontFamily: "'DM Mono',monospace" }}>{p.account_name}</td>
                      <td style={{ color: "var(--amber)", fontFamily: "'DM Mono',monospace" }}>{p.bad_count}</td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button
                            className="platform-chip active"
                            style={{ fontSize: 10.5, cursor: "pointer" }}
                            onClick={async () => {
                              await queries.recalculateProject(p.project_id);
                              await reloadAll();
                            }}
                          >
                            Recalculate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {splitClients.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,179,71,0.15)" }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace", marginBottom: 8 }}>
                Client Identity Mismatches
              </div>
              {splitClients.slice(0, 3).map(([name, count]) => (
                <div key={name} style={{ background: "var(--bg2)", border: "1px solid rgba(255,179,71,0.2)", borderRadius: 7, padding: 12, marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <strong style={{ fontSize: 12.5 }}>{name}</strong>
                    <span className="platform-badge amber">{count} Project IDs</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--amber)", marginTop: 6 }}>⚠ Requires backend merge for full correctness.</div>
                </div>
              ))}
            </div>
          )}
        </PlatformSection>
      </div>

      {/* Evidence tables */}
      <div className="platform-grid-2">
        <PlatformSection title="Revenue-risk Evidence (sample)" action="Navigate">
          <div className="platform-table-wrap" style={{ maxHeight: 360 }}>
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Req ID</th>
                  <th>Project</th>
                  <th>Candidate</th>
                  <th>Position</th>
                  <th>Dept</th>
                  <th>Loc</th>
                  <th style={{ textAlign: "right" }}>Rev</th>
                </tr>
              </thead>
              <tbody>
                {revenueRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ color: "var(--text-muted)", textAlign: "center" }}>
                      {loading ? "Loading…" : "No evidence rows"}
                    </td>
                  </tr>
                ) : (
                  revenueRecords.map((r: any) => (
                    <tr key={r.id} style={{ background: "rgba(255,79,107,0.04)" }}>
                      <td style={{ fontFamily: "'DM Mono',monospace" }}>{r.excel_provided_id ?? `REQ-${r.id}`}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", color: "var(--text-subtle)" }}>{r.account_name}</td>
                      <td>{r.candidate_name ?? "—"}</td>
                      <td>{r.position_title ?? "—"}</td>
                      <td>{r.department ?? "—"}</td>
                      <td>{r.location ?? "—"}</td>
                      <td style={{ textAlign: "right", fontFamily: "'DM Mono',monospace", color: "var(--red)" }}>
                        ₹{Math.round(r.revenue).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, alignItems: "center" }}>
            <button
              className="platform-chip"
              disabled={revPage <= 1}
              style={{ cursor: revPage <= 1 ? "not-allowed" : "pointer" }}
              onClick={() => setRevPage((p) => Math.max(1, p - 1))}
            >
              ← Prev
            </button>
            <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", fontSize: 10.5 }}>Page {revPage}</span>
            <button className="platform-chip active" style={{ cursor: "pointer" }} onClick={() => setRevPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        </PlatformSection>

        <PlatformSection title="Lifecycle-risk Evidence (sample)" action="Navigate">
          <div className="platform-table-wrap" style={{ maxHeight: 360 }}>
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Req ID</th>
                  <th>Project</th>
                  <th>Candidate</th>
                  <th>Position</th>
                  <th>Dept</th>
                  <th>Loc</th>
                </tr>
              </thead>
              <tbody>
                {joiningRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ color: "var(--text-muted)", textAlign: "center" }}>
                      {loading ? "Loading…" : "No evidence rows"}
                    </td>
                  </tr>
                ) : (
                  joiningRecords.map((r: any) => (
                    <tr key={r.id} style={{ background: "rgba(255,179,71,0.04)" }}>
                      <td style={{ fontFamily: "'DM Mono',monospace" }}>{r.excel_provided_id ?? `REQ-${r.id}`}</td>
                      <td style={{ fontFamily: "'DM Mono',monospace", color: "var(--text-subtle)" }}>{r.account_name}</td>
                      <td>{r.candidate_name ?? "—"}</td>
                      <td>{r.position_title ?? "—"}</td>
                      <td>{r.department ?? "—"}</td>
                      <td>{r.location ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, alignItems: "center" }}>
            <button
              className="platform-chip"
              disabled={joinPage <= 1}
              style={{ cursor: joinPage <= 1 ? "not-allowed" : "pointer" }}
              onClick={() => setJoinPage((p) => Math.max(1, p - 1))}
            >
              ← Prev
            </button>
            <span style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", fontSize: 10.5 }}>Page {joinPage}</span>
            <button className="platform-chip active" style={{ cursor: "pointer" }} onClick={() => setJoinPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        </PlatformSection>
      </div>
    </div>
  );
}
