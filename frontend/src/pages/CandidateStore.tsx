import React, { useCallback, useEffect, useState } from "react";
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

export function CandidateStore() {
  const { user } = useAuth();
  const readOnly = isReadOnlyClient(user);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<CandidateMasterRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<CandidateMasterDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 350);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await queries.candidateMastersList({ q: debounced || undefined, limit: 80, offset: 0 });
      setItems(data.items);
      setTotal(data.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: number) {
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

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <input
          className="platform-search"
          placeholder="Search masters — name, email, phone, fingerprint…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: "1 1 260px", maxWidth: 520, minWidth: 200 }}
        />
        <button
          type="button"
          className="platform-dialog__btn"
          style={{ fontSize: 11, fontFamily: "'DM Mono',monospace" }}
          onClick={() => void load()}
          disabled={busy}
        >
          {busy ? "…" : "Search"}
        </button>
        {isPlatformAdminRole(user?.role) ? (
          <>
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
          </>
        ) : null}
      </div>
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

      <PlatformSection title={`Masters (${total})`}>
        {loading ? (
          <Skeleton height={200} />
        ) : items.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 16 }}>
            No masters found. Admins can run backfill to create links from existing candidate rows.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => void openDetail(m.id)}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid color-mix(in srgb, var(--border) 80%, transparent)",
                  background: "var(--surface-raised)",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>
                  MST-{m.id} · {m.placement_count} placement{m.placement_count === 1 ? "" : "s"}
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>{m.display_name || "—"}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                  {[m.email_normalized, m.phone_normalized].filter(Boolean).join(" · ") || "No normalized email/phone"}
                </div>
              </button>
            ))}
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
