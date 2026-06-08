import React, { useCallback, useEffect, useMemo, useState } from "react";
import { queries, type CandidateMasterDetail, type CandidateMasterRow } from "@/lib/api";
import { isPlatformAdminRole, isReadOnlyClient, useAuth } from "@/lib/auth";
import { PageHeader, PlatformSection } from "@/components/platform/PlatformBlocks";
import { Skeleton } from "@/components/platform/Skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PlacementFilter = "all" | "single" | "multi";
type SortKey = "name" | "placements" | "updated";

/** Backend `GET /candidate-masters` caps `limit` at 200. */
const MASTER_PAGE_SIZE = 200;

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function CandidateStore() {
  const { user } = useAuth();
  const readOnly = isReadOnlyClient(user);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [placementFilter, setPlacementFilter] = useState<PlacementFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [items, setItems] = useState<CandidateMasterRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mandateTotal, setMandateTotal] = useState<number | null>(null);
  const [detail, setDetail] = useState<CandidateMasterDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 350);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await queries.candidateMastersList({
        q: debounced || undefined,
        limit: MASTER_PAGE_SIZE,
        offset: 0,
      });
      setItems(data.items);
      setTotal(data.total);
      setOffset(data.items.length);
      if (data.total === 0) {
        try {
          const cand = await queries.candidatesList({ limit: 1, offset: 0 });
          setMandateTotal(cand.total);
        } catch {
          setMandateTotal(null);
        }
      } else {
        setMandateTotal(null);
      }
    } catch (e: unknown) {
      setItems([]);
      setTotal(0);
      setOffset(0);
      setMandateTotal(null);
      const msg = e instanceof Error ? e.message : "Could not load masters";
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  const loadMore = useCallback(async () => {
    if (loadingMore || offset >= total) return;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const data = await queries.candidateMastersList({
        q: debounced || undefined,
        limit: MASTER_PAGE_SIZE,
        offset,
      });
      setItems((prev) => [...prev, ...data.items]);
      setOffset((prev) => prev + data.items.length);
      setTotal(data.total);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not load more masters";
      setLoadError(msg);
    } finally {
      setLoadingMore(false);
    }
  }, [debounced, loadingMore, offset, total]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    let list = [...items];
    if (placementFilter === "single") list = list.filter((m) => m.placement_count === 1);
    else if (placementFilter === "multi") list = list.filter((m) => m.placement_count > 1);
    list.sort((a, b) => {
      if (sortBy === "name") {
        return (a.display_name || "").localeCompare(b.display_name || "", undefined, { sensitivity: "base" });
      }
      if (sortBy === "placements") {
        return b.placement_count - a.placement_count || a.id - b.id;
      }
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tb - ta || a.id - b.id;
    });
    return list;
  }, [items, placementFilter, sortBy]);

  async function openDetail(id: number) {
    setSelectedId(id);
    setBusy(true);
    try {
      const d = await queries.candidateMaster(id);
      setDetail(d);
      setDetailOpen(true);
    } catch {
      setDetail(null);
    } finally {
      setBusy(false);
    }
  }

  async function runBackfill(dry: boolean) {
    if (!isPlatformAdminRole(user?.role)) return;
    setBackfillMsg(null);
    setBusy(true);
    try {
      const r = await queries.candidateMasterBackfill({
        dry_run: dry,
        migration_batch_tag: "ui",
        limit: 5000,
      });
      setBackfillMsg(JSON.stringify(r));
      await load();
    } catch (e: unknown) {
      setBackfillMsg(e instanceof Error ? e.message : "Backfill failed");
    } finally {
      setBusy(false);
    }
  }

  const sectionHeaderBtnStyle: React.CSSProperties = {
    padding: "5px 12px",
    background: "var(--surface-raised)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-base)",
    fontFamily: "var(--font)",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-muted)",
    cursor: "pointer",
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <PageHeader
        title="Candidate store"
        subtitle={
          readOnly
            ? "Enterprise directory scoped to candidates on your projects — search by name, email, or phone (normalized)."
            : "Cross-project talent identities (masters). Each row can represent multiple mandate placements you are allowed to see."
        }
      />

      {isPlatformAdminRole(user?.role) ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            className="platform-dialog__btn platform-dialog__btn--primary"
            style={{ fontSize: 11, fontFamily: "'DM Mono',monospace" }}
            onClick={() => void runBackfill(true)}
            disabled={busy}
          >
            Dry-run backfill
          </button>
          <button
            type="button"
            className="platform-dialog__btn platform-dialog__btn--primary"
            style={{ fontSize: 11, fontFamily: "'DM Mono',monospace" }}
            onClick={() => {
              if (window.confirm("Link all unlinked mandate rows to masters (writes DB)?")) void runBackfill(false);
            }}
            disabled={busy}
          >
            Run backfill
          </button>
        </div>
      ) : null}
      {backfillMsg ? (
        <pre
          style={{
            fontSize: 10,
            fontFamily: "'DM Mono',monospace",
            background: "var(--surface-muted)",
            padding: 10,
            borderRadius: 8,
            overflow: "auto",
            maxHeight: 120,
          }}
        >
          {backfillMsg}
        </pre>
      ) : null}

      {loadError ? (
        <div
          className="alert-banner"
          style={{ fontSize: 11, borderColor: "rgba(255,79,107,0.35)" }}
          role="alert"
        >
          <strong>Could not load masters.</strong> {loadError}
        </div>
      ) : null}

      <PlatformSection
        title={`Masters (${total.toLocaleString()})`}
        action="Refresh"
        onAction={() => void load()}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12, alignItems: "center" }}>
          <input
            className="platform-search"
            placeholder="Search name, email, phone, fingerprint…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: "1 1 220px", maxWidth: 420, minWidth: 180 }}
            aria-label="Search masters"
          />
          <select
            value={placementFilter}
            onChange={(e) => setPlacementFilter(e.target.value as PlacementFilter)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg2)",
              color: "var(--text)",
              fontSize: 11,
              fontFamily: "'DM Mono',monospace",
            }}
            aria-label="Filter by placements"
          >
            <option value="all">All placements</option>
            <option value="single">Single placement</option>
            <option value="multi">Multiple placements</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg2)",
              color: "var(--text)",
              fontSize: 11,
              fontFamily: "'DM Mono',monospace",
            }}
            aria-label="Sort masters"
          >
            <option value="updated">Sort: recently updated</option>
            <option value="name">Sort: name A–Z</option>
            <option value="placements">Sort: most placements</option>
          </select>
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
            Showing {filteredItems.length.toLocaleString()} of {total.toLocaleString()} master{total === 1 ? "" : "s"}
          </span>
        </div>

        {loading ? (
          <Skeleton height={220} />
        ) : loadError && filteredItems.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 24, textAlign: "center" }}>
            Fix the error above and click Refresh.
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 24, textAlign: "center", lineHeight: 1.55 }}>
            {mandateTotal != null && mandateTotal > 0 ? (
              <>
                You have <strong>{mandateTotal.toLocaleString()}</strong> mandate row{mandateTotal === 1 ? "" : "s"} on the{" "}
                <strong>Candidates</strong> tab, but none are linked to masters yet.
                {isPlatformAdminRole(user?.role) ? (
                  <> Use <strong>Run backfill</strong> above to create master identities.</>
                ) : (
                  <> Ask a platform admin to run the candidate master backfill.</>
                )}
              </>
            ) : mandateTotal === 0 ? (
              <>No candidate mandate rows yet — add candidates on the <strong>Candidates</strong> tab first.</>
            ) : (
              <>No masters found for your project scope. Admins can run backfill to link existing mandate rows.</>
            )}
          </div>
        ) : (
          <div className="platform-table-wrap" style={{ overflowX: "auto" }}>
            <table className="platform-table" style={{ minWidth: 920 }}>
              <thead>
                <tr>
                  <th>Master ID</th>
                  <th>Name</th>
                  <th>Email (norm)</th>
                  <th>Phone (norm)</th>
                  <th>Placements</th>
                  <th>Fingerprint</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((m) => (
                  <tr
                    key={m.id}
                    style={{
                      cursor: "pointer",
                      background: selectedId === m.id ? "rgba(255, 107, 53, 0.06)" : undefined,
                    }}
                    onClick={() => void openDetail(m.id)}
                  >
                    <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--accent)", fontWeight: 600 }}>
                      MST-{m.id}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{m.display_name || "—"}</td>
                    <td style={{ fontSize: 11, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.email_normalized || undefined}>
                      {m.email_normalized || "—"}
                    </td>
                    <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{m.phone_normalized || "—"}</td>
                    <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 600 }}>{m.placement_count}</td>
                    <td
                      style={{
                        fontFamily: "'DM Mono',monospace",
                        fontSize: 9,
                        color: "var(--text-muted)",
                        maxWidth: 120,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={m.global_fingerprint || undefined}
                    >
                      {m.global_fingerprint ? `${m.global_fingerprint.slice(0, 14)}…` : "—"}
                    </td>
                    <td style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{fmtWhen(m.updated_at)}</td>
                    <td>
                      <button
                        type="button"
                        style={sectionHeaderBtnStyle}
                        onClick={(e) => {
                          e.stopPropagation();
                          void openDetail(m.id);
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {offset < total ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
                <button
                  type="button"
                  className="platform-dialog__btn"
                  style={{ fontSize: 11, fontFamily: "'DM Mono',monospace" }}
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? "Loading…" : `Load more (${(total - offset).toLocaleString()} remaining)`}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </PlatformSection>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent style={{ maxWidth: 560 }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Syne',sans-serif" }}>
              {detail ? `Master MST-${detail.id}` : "Loading…"}
            </DialogTitle>
          </DialogHeader>
          {detail ? (
            <div style={{ display: "grid", gap: 10, fontSize: 11 }}>
              <div>
                <strong>Display name:</strong> {detail.display_name || "—"}
              </div>
              <div style={{ color: "var(--text-muted)" }}>
                Email (norm): {detail.email_normalized || "—"} · Phone (norm): {detail.phone_normalized || "—"}
              </div>
              <div style={{ fontWeight: 600, marginTop: 8 }}>Placements you can see</div>
              <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {detail.placements.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      fontFamily: "'DM Mono',monospace",
                      fontSize: 10,
                    }}
                  >
                    CAN-{p.id} · PRJ-{p.project_id} · REQ-{p.record_id} · {p.client_candidate_id}
                    <div style={{ fontFamily: "inherit", marginTop: 4, color: "var(--text-subtle)" }}>
                      {p.full_name || "—"} · {p.current_stage || "—"} · {p.global_status || "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
