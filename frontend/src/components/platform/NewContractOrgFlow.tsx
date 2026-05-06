import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { CONTRACT_PIPELINE_STAGES } from "@/lib/api";
import type { ClientGroup } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TagLevel = "BU" | "SBU" | "SBG" | "SBE" | "";

export type OrgClientDraft = {
  official_name: string;
  short_code: string;
  lifecycle: "prospect" | "active";
  tag_level: TagLevel;
  tag_value: string;
};

export type EngagementRow = {
  id: string;
  engagement_name: string;
  /** Override tag level; empty string = inherit from client tag */
  tag_level: TagLevel;
  tag_value: string;
  headUserId: string;
  form: Record<string, string>;
  /** Optional contract / MSA attachments (multiple uploads per engagement). */
  msa_files: File[];
};

export type NewContractOrgBundle = {
  client: {
    official_name: string;
    short_code?: string | null;
    lifecycle_state: "active" | "prospect";
    hierarchy_tag_bu?: string | null;
    hierarchy_tag_sbu?: string | null;
    hierarchy_tag_sbg?: string | null;
    hierarchy_tag_sbe?: string | null;
  };
  engagements: Array<{
    engagement_name: string;
    hierarchy_tag_bu?: string | null;
    hierarchy_tag_sbu?: string | null;
    hierarchy_tag_sbg?: string | null;
    hierarchy_tag_sbe?: string | null;
    project_head_user_id: number | null;
    form: Record<string, string>;
    msa_files?: File[];
  }>;
};

export type PlatformUserLite = { id: number; email: string; role: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function userInitials(email: string): string {
  const local = email.split("@")[0];
  const parts = local.split(/[._-]/);
  if (parts.length >= 2 && parts[0] && parts[1])
    return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

const USER_COLORS = [
  "#5b8dee", "#ee5b78", "#5bb8ee", "#ee9d5b",
  "#5beeaa", "#9d5bee", "#5beee9", "#ee5bee",
];
function userColor(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) | 0;
  return USER_COLORS[Math.abs(h) % USER_COLORS.length];
}

function checkDuplicate(name: string, groups: ClientGroup[]): string | null {
  const q = name.trim().toLowerCase();
  if (!q || q.length < 2) return null;
  const match = groups.find((g) => {
    const n = (g.official_name || "").toLowerCase();
    return n === q || n.includes(q) || q.includes(n);
  });
  return match
    ? `"${match.official_name}" already exists (CLI-${match.id}). Check before creating a duplicate.`
    : null;
}

function durationLabelFor(f: Record<string, string>): string {
  const s = f.contract_start_date?.trim();
  const e = f.contract_end_date?.trim();
  if (!s || !e) return "— months";
  const start = new Date(s);
  const end = new Date(e);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "— months";
  const months = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  if (months < 0) return "⚠ Check dates";
  return `${months} month${months !== 1 ? "s" : ""}`;
}

function grossMarginFor(f: Record<string, string>): string {
  const acv = parseFloat(String(f.signed_acv_inr || "").replace(/,/g, "")) || 0;
  const cm = parseFloat(String(f.signed_cm_pct || "")) || 0;
  const cmReal = cm > 1 ? cm / 100 : cm;
  if (!acv) return "₹ —";
  return `₹ ${Math.round(acv * cmReal).toLocaleString("en-IN")}`;
}

function mrrFor(f: Record<string, string>): string {
  const acv = parseFloat(String(f.signed_acv_inr || "").replace(/,/g, "")) || 0;
  if (!acv) return "₹ —";
  return `₹ ${Math.round(acv / 12).toLocaleString("en-IN")} / mo`;
}

function statusPillClass(status: string): "ncp-st-active" | "ncp-st-pending" | "ncp-st-inactive" {
  const s = (status || "").toLowerCase();
  if (s.includes("pend") || s.includes("draft")) return "ncp-st-pending";
  if (s.includes("active") || s.includes("live") || s.includes("sign")) return "ncp-st-active";
  return "ncp-st-inactive";
}

// ─── Exported helpers used by parent ─────────────────────────────────────────

export function makeEngagementRow(makeEmpty: () => Record<string, string>): EngagementRow {
  const f = makeEmpty();
  if (!f.contract_status?.trim()) f.contract_status = "Active";
  if (!f.pipeline_stage?.trim()) f.pipeline_stage = "discovery";
  return {
    id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    engagement_name: "",
    tag_level: "",
    tag_value: "",
    headUserId: "",
    form: f,
    msa_files: [],
  };
}

export function orgSetupValid(orgClient: OrgClientDraft, engagements: EngagementRow[]): boolean {
  return orgClient.official_name.trim().length > 0 && engagements.some((e) => e.engagement_name.trim());
}

function tagToFields(
  level: TagLevel,
  value: string,
): {
  hierarchy_tag_bu: string | null;
  hierarchy_tag_sbu: string | null;
  hierarchy_tag_sbg: string | null;
  hierarchy_tag_sbe: string | null;
} {
  const v = value.trim() || null;
  return {
    hierarchy_tag_bu: level === "BU" ? v : null,
    hierarchy_tag_sbu: level === "SBU" ? v : null,
    hierarchy_tag_sbg: level === "SBG" ? v : null,
    hierarchy_tag_sbe: level === "SBE" ? v : null,
  };
}

export function buildOrgBundle(
  orgClient: OrgClientDraft,
  engagements: EngagementRow[],
  users: PlatformUserLite[],
): NewContractOrgBundle | null {
  const on = orgClient.official_name.trim();
  if (!on) return null;
  const rows = engagements.filter((e) => e.engagement_name.trim());
  if (!rows.length) return null;

  const clientTags = tagToFields(orgClient.tag_level, orgClient.tag_value);

  return {
    client: {
      official_name: on,
      short_code: orgClient.short_code.trim() || null,
      lifecycle_state: orgClient.lifecycle,
      ...clientTags,
    },
    engagements: rows.map((e) => {
      const hid = e.headUserId ? parseInt(e.headUserId, 10) : NaN;
      const headUid = Number.isFinite(hid) ? hid : null;
      const u = headUid != null ? users.find((x) => x.id === headUid) : null;
      const form = { ...e.form };
      if (u?.email && !form.practice_head_snapshot?.trim()) form.practice_head_snapshot = u.email;
      // Engagement overrides client tag only when both level+value are set
      const engTags =
        e.tag_level && e.tag_value.trim()
          ? tagToFields(e.tag_level, e.tag_value)
          : clientTags;
      return {
        engagement_name: e.engagement_name.trim(),
        ...engTags,
        project_head_user_id: headUid,
        form,
        msa_files: [...(e.msa_files ?? [])],
      };
    }),
  };
}

// ─── UserPickerDropdown ───────────────────────────────────────────────────────

export function UserPickerDropdown({
  value,
  onChange,
  users,
  placeholder = "— Optional —",
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  users: PlatformUserLite[];
  placeholder?: string;
  /** When true, shows the current selection without opening a dropdown. */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [ddRect, setDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const rawId = String(value ?? "").trim();
  const numericId = rawId === "" ? NaN : Number(rawId);
  const selected =
    rawId === ""
      ? null
      : (users.find((u) => String(u.id) === rawId) ??
        (Number.isFinite(numericId) ? users.find((u) => u.id === numericId) ?? null : null));

  useLayoutEffect(() => {
    if (!open) {
      setDdRect(null);
      return;
    }
    const measure = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setDdRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (btnRef.current) ro.observe(btnRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || portalRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q),
    );
  }, [users, search]);

  const panel = (
    <div
      className={cn("ncp-user-dd", open && "ncp-open", "ncp-user-dd--portal")}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ncp-project-search">
        <span style={{ opacity: 0.5 }}>🔍</span>
        <input
          type="search"
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus={open}
        />
      </div>
      <div
        className="ncp-dd-scroll"
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="ncp-project-opt"
          onClick={() => {
            onChange("");
            setOpen(false);
            setSearch("");
          }}
        >
          <span className="ncp-user-ico" style={{ background: "var(--ncp-border)", color: "var(--ncp-text-muted)" }}>
            —
          </span>
          <div>
            <div style={{ color: "var(--ncp-text-muted)", fontSize: 12 }}>None / not assigned</div>
          </div>
        </button>
        {filtered.map((u) => (
          <button
            key={u.id}
            type="button"
            className="ncp-project-opt"
            onClick={() => {
              onChange(String(u.id));
              setOpen(false);
              setSearch("");
            }}
          >
            <span className="ncp-user-ico" style={{ background: userColor(u.email) }}>
              {userInitials(u.email)}
            </span>
            <div>
              <div style={{ fontWeight: 500, color: "var(--ncp-text-primary)" }}>{u.email}</div>
              <div style={{ fontSize: 11, color: "var(--ncp-text-muted)", fontFamily: "var(--ncp-mono)" }}>
                {u.role}
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ncp-text-muted)" }}>
            No users match "{search}"
          </div>
        )}
      </div>
    </div>
  );

  if (disabled) {
    return (
      <div className="ncp-user-wrap">
        <button type="button" className={cn("ncp-user-btn", selected && "ncp-selected")} disabled style={{ cursor: "default", opacity: 1 }}>
          {selected ? (
            <>
              <span className="ncp-user-ico" style={{ background: userColor(selected.email) }}>
                {userInitials(selected.email)}
              </span>
              <div className="ncp-user-meta">
                <strong>{selected.email}</strong>
                <span>{selected.role}</span>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: 16, opacity: 0.4 }}>👤</span>
              <span>{placeholder}</span>
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="ncp-user-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={cn("ncp-user-btn", selected && "ncp-selected")}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {selected ? (
          <>
            <span
              className="ncp-user-ico"
              style={{ background: userColor(selected.email) }}
            >
              {userInitials(selected.email)}
            </span>
            <div className="ncp-user-meta">
              <strong>{selected.email}</strong>
              <span>{selected.role}</span>
            </div>
            <span style={{ color: "var(--ncp-accent)", marginLeft: "auto" }}>▾</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 16, opacity: 0.4 }}>👤</span>
            <span>{placeholder}</span>
            <span style={{ color: "var(--ncp-text-muted)", marginLeft: "auto" }}>▾</span>
          </>
        )}
      </button>
      {open &&
        ddRect &&
        createPortal(
          <div
            ref={portalRef}
            className="new-contract-sheet"
            style={{
              position: "fixed",
              top: ddRect.top,
              left: ddRect.left,
              width: ddRect.width,
              zIndex: 200,
              pointerEvents: "auto",
              minHeight: 0,
              height: "auto",
              display: "block",
              background: "transparent",
            }}
          >
            {panel}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ─── MultiFileUploadZone ───────────────────────────────────────────────────────

function fileDedupeKey(f: File): string {
  return `${f.name}\u0000${f.size}\u0000${f.lastModified}`;
}

function MultiFileUploadZone({
  files,
  onChange,
  label = "Upload MSA / contract documents",
}: {
  files: File[];
  onChange: (next: File[]) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const mergeFromFileList = (list: FileList | null) => {
    if (!list?.length) return;
    const incoming = Array.from(list);
    const seen = new Set(files.map(fileDedupeKey));
    const merged = [...files];
    for (const f of incoming) {
      const k = fileDedupeKey(f);
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(f);
      }
    }
    onChange(merged);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeAt = (idx: number) => {
    onChange(files.filter((_, i) => i !== idx));
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg"
        style={{ display: "none" }}
        onChange={(e) => mergeFromFileList(e.target.files)}
      />
      {files.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {files.map((f, i) => (
            <div key={`${fileDedupeKey(f)}-${i}`} className="ncp-file-selected">
              <span>📎</span>
              <span className="ncp-file-name">{f.name}</span>
              <span className="ncp-file-size">({(f.size / 1024).toFixed(0)} KB)</span>
              <button type="button" className="ncp-file-remove" onClick={() => removeAt(i)} aria-label={`Remove ${f.name}`}>
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <button type="button" className="ncp-upload-zone" onClick={() => inputRef.current?.click()}>
        <span style={{ fontSize: 22, marginBottom: 4 }}>⬆</span>
        <span>{files.length ? "Add more files…" : label}</span>
        <span className="ncp-hint" style={{ padding: 0 }}>
          PDF, Word, Excel, image — you can select multiple files at once
        </span>
      </button>
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

type Props = {
  step: number;
  setStep: (n: number) => void;
  creating: boolean;
  onOpenChange: (open: boolean) => void;
  orgClient: OrgClientDraft;
  setOrgClient: React.Dispatch<React.SetStateAction<OrgClientDraft>>;
  engagements: EngagementRow[];
  setEngagements: React.Dispatch<React.SetStateAction<EngagementRow[]>>;
  makeEmptyContractForm: () => Record<string, string>;
  platformUsers: PlatformUserLite[];
  accountTypeMerged: string[];
  renewalOptions: string[];
  pricingOptions: string[];
  clientGroups: ClientGroup[];
  onSubmitBundle: (bundle: NewContractOrgBundle) => void | Promise<void>;
};

// ─── Main component ───────────────────────────────────────────────────────────

export function NewContractOrgFlow({
  step,
  setStep,
  creating,
  onOpenChange,
  orgClient,
  setOrgClient,
  engagements,
  setEngagements,
  makeEmptyContractForm,
  platformUsers,
  accountTypeMerged,
  renewalOptions,
  pricingOptions,
  clientGroups,
  onSubmitBundle,
}: Props) {
  const canContinue = useMemo(() => orgSetupValid(orgClient, engagements), [orgClient, engagements]);

  const dupWarning = useMemo(
    () => checkDuplicate(orgClient.official_name, clientGroups),
    [orgClient.official_name, clientGroups],
  );

  const validEngagements = useMemo(
    () => engagements.filter((e) => e.engagement_name.trim()),
    [engagements],
  );

  const onEngField = useCallback((id: string, key: string, value: string) => {
    setEngagements((rows) =>
      rows.map((r) => (r.id === id ? { ...r, form: { ...r.form, [key]: value } } : r)),
    );
  }, [setEngagements]);

  const onEngDates = useCallback(
    (id: string, key: "contract_start_date" | "contract_end_date", value: string) => {
      setEngagements((rows) =>
        rows.map((r) => {
          if (r.id !== id) return r;
          const next = { ...r.form, [key]: value };
          if (key === "contract_end_date" && value && !r.form.renewal_reminder_date?.trim()) {
            const end = new Date(value);
            if (!Number.isNaN(end.getTime())) {
              const rem = new Date(end);
              rem.setDate(rem.getDate() - 60);
              next.renewal_reminder_date = rem.toISOString().slice(0, 10);
            }
          }
          return { ...r, form: next };
        }),
      );
    },
    [setEngagements],
  );

  const addRow = useCallback(() => {
    setEngagements((r) => [...r, makeEngagementRow(makeEmptyContractForm)]);
  }, [makeEmptyContractForm, setEngagements]);

  const removeRow = useCallback(
    (id: string) => {
      setEngagements((rows) => (rows.length <= 1 ? rows : rows.filter((x) => x.id !== id)));
    },
    [setEngagements],
  );

  function goOrg(n: number) {
    if (n >= 1 && !canContinue) return;
    setStep(n);
  }

  async function handleCreate() {
    const b = buildOrgBundle(orgClient, engagements, platformUsers);
    if (!b) return;
    await onSubmitBundle(b);
  }

  const footer = (backN: number | null, nextN: number | null, createMode = false) => (
    <div
      className="ncp-footer"
      style={{ borderTop: "none", paddingLeft: 0, paddingRight: 0, background: "transparent" }}
    >
      {backN !== null ? (
        <button type="button" className="ncp-btn ncp-btn-ghost" onClick={() => goOrg(backN)}>
          ← Back
        </button>
      ) : (
        <span className="ncp-hint">
          <kbd className="ncp-kbd">Esc</kbd> to cancel
        </span>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {createMode ? (
          <>
            <button type="button" className="ncp-btn ncp-btn-secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="ncp-btn ncp-btn-primary"
              disabled={creating || !canContinue}
              onClick={() => void handleCreate()}
            >
              {creating ? "Creating…" : "Create client & projects ✓"}
            </button>
          </>
        ) : nextN !== null ? (
          <button type="button" className="ncp-btn ncp-btn-primary" disabled={!canContinue} onClick={() => goOrg(nextN)}>
            Continue →
          </button>
        ) : null}
      </div>
    </div>
  );

  // ── Step 0: Client ──────────────────────────────────────────────────────────
  return (
    <>
      <div className={cn("ncp-panel", step === 0 && "ncp-panel-active")}>
        <div className="ncp-req-note">
          <span>●</span> Create the legal client, then define one or more project engagements below.
        </div>

        {dupWarning ? (
          <div className="ncp-dup-warn">
            <span>⚠</span>
            <span>{dupWarning}</span>
          </div>
        ) : null}

        <div className="ncp-section" style={{ marginBottom: 14 }}>
          <div className="ncp-section-header" style={{ cursor: "default" }}>
            <div className="ncp-section-icon ncp-orange">◇</div>
            <div>
              <div className="ncp-section-label">Legal client</div>
              <div className="ncp-section-desc">Official name, lifecycle, and default BU→SBE org tags</div>
            </div>
          </div>
          <div className="ncp-section-body" style={{ maxHeight: 520 }}>
            <div className="ncp-prop-row" style={{ borderTop: "none" }}>
              <div className="ncp-prop-label">Official name</div>
              <input
                className="ncp-prop-input"
                placeholder="e.g. ACME Ltd"
                value={orgClient.official_name}
                onChange={(e) => setOrgClient((c) => ({ ...c, official_name: e.target.value }))}
              />
            </div>
            <div className="ncp-prop-row">
              <div className="ncp-prop-label">Short code</div>
              <input
                className="ncp-prop-input"
                placeholder="Optional (e.g. ACME)"
                value={orgClient.short_code}
                onChange={(e) => setOrgClient((c) => ({ ...c, short_code: e.target.value }))}
              />
            </div>
            <div className="ncp-prop-row">
              <div className="ncp-prop-label">Lifecycle</div>
              <select
                className="ncp-prop-input"
                value={orgClient.lifecycle}
                onChange={(e) => setOrgClient((c) => ({ ...c, lifecycle: e.target.value as "prospect" | "active" }))}
              >
                <option value="prospect">Prospect (pre-close)</option>
                <option value="active">Active (operating)</option>
              </select>
            </div>
            <div className="ncp-prop-row">
              <div className="ncp-prop-label">Org tag</div>
              <div style={{ flex: 1, display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  className="ncp-prop-input"
                  style={{ width: 100, flexShrink: 0 }}
                  value={orgClient.tag_level}
                  onChange={(e) =>
                    setOrgClient((c) => ({ ...c, tag_level: e.target.value as TagLevel }))
                  }
                >
                  <option value="">None</option>
                  <option value="BU">BU</option>
                  <option value="SBU">SBU</option>
                  <option value="SBG">SBG</option>
                  <option value="SBE">SBE</option>
                </select>
                {orgClient.tag_level ? (
                  <input
                    className="ncp-prop-input"
                    placeholder={
                      orgClient.tag_level === "BU"
                        ? "Business unit name"
                        : orgClient.tag_level === "SBU"
                          ? "Sub business unit"
                          : orgClient.tag_level === "SBG"
                            ? "Sub business group"
                            : "Sub business entity"
                    }
                    value={orgClient.tag_value}
                    onChange={(e) => setOrgClient((c) => ({ ...c, tag_value: e.target.value }))}
                  />
                ) : (
                  <span style={{ fontSize: 12, color: "var(--ncp-text-muted)" }}>
                    Select a level to tag this client
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <span style={{ fontFamily: "var(--ncp-mono)", fontSize: 11, color: "var(--ncp-text-muted)" }}>
            Projects / engagements
          </span>
          <button type="button" className="ncp-btn ncp-btn-secondary" onClick={addRow}>
            ＋ Add project
          </button>
        </div>

        {engagements.map((row, idx) => (
          <div key={row.id} className="ncp-stack-card">
            <div className="ncp-stack-card-head">
              <span className="ncp-stack-card-title">Engagement {idx + 1}</span>
              {engagements.length > 1 ? (
                <button
                  type="button"
                  className="ncp-btn ncp-btn-ghost"
                  style={{ fontSize: 11, padding: "5px 10px" }}
                  onClick={() => removeRow(row.id)}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <div className="ncp-prop-row" style={{ borderTop: "none" }}>
              <div className="ncp-prop-label">Project / engagement name</div>
              <input
                className="ncp-prop-input"
                placeholder="Shown as the PRJ engagement label"
                value={row.engagement_name}
                onChange={(e) =>
                  setEngagements((rs) =>
                    rs.map((r) => (r.id === row.id ? { ...r, engagement_name: e.target.value } : r)),
                  )
                }
              />
            </div>
            <div className="ncp-prop-row">
              <div className="ncp-prop-label">Org tag</div>
              <div style={{ flex: 1, display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  className="ncp-prop-input"
                  style={{ width: 120, flexShrink: 0 }}
                  value={row.tag_level}
                  onChange={(e) =>
                    setEngagements((rs) =>
                      rs.map((r) =>
                        r.id === row.id ? { ...r, tag_level: e.target.value as TagLevel, tag_value: e.target.value ? r.tag_value : "" } : r,
                      ),
                    )
                  }
                >
                  <option value="">Inherit from client</option>
                  <option value="BU">BU</option>
                  <option value="SBU">SBU</option>
                  <option value="SBG">SBG</option>
                  <option value="SBE">SBE</option>
                </select>
                {row.tag_level ? (
                  <input
                    className="ncp-prop-input"
                    placeholder={
                      row.tag_level === "BU"
                        ? "Business unit"
                        : row.tag_level === "SBU"
                          ? "Sub business unit"
                          : row.tag_level === "SBG"
                            ? "Sub business group"
                            : "Sub business entity"
                    }
                    value={row.tag_value}
                    onChange={(e) =>
                      setEngagements((rs) =>
                        rs.map((r) => (r.id === row.id ? { ...r, tag_value: e.target.value } : r)),
                      )
                    }
                  />
                ) : (
                  <span style={{ fontSize: 12, color: "var(--ncp-text-muted)" }}>
                    {orgClient.tag_level && orgClient.tag_value.trim()
                      ? `${orgClient.tag_level}: ${orgClient.tag_value}`
                      : "No client tag set"}
                  </span>
                )}
              </div>
            </div>
            <div className="ncp-prop-row">
              <div className="ncp-prop-label">Project head</div>
              <div style={{ flex: 1 }}>
                <UserPickerDropdown
                  value={row.headUserId}
                  onChange={(v) => {
                    setEngagements((rs) =>
                      rs.map((r) => {
                        if (r.id !== row.id) return r;
                        const u = platformUsers.find((x) => String(x.id) === v);
                        const nextForm = {
                          ...r.form,
                          practice_head_snapshot: u?.email ?? r.form.practice_head_snapshot,
                        };
                        return { ...r, headUserId: v, form: nextForm };
                      }),
                    );
                  }}
                  users={platformUsers}
                />
              </div>
            </div>
          </div>
        ))}

        {footer(null, 1)}
      </div>

      {/* ── Step 1: Identity ──────────────────────────────────────────────── */}
      <div className={cn("ncp-panel", step === 1 && "ncp-panel-active")}>
        <p className="ncp-hint" style={{ marginBottom: 12 }}>
          Fill contract-facing identity fields for each engagement. Pipeline stage determines the commercial pursuit
          state.
        </p>

        {validEngagements.map((row) => (
          <div key={row.id} className="ncp-stack-card" style={{ marginBottom: 14 }}>
            <div className="ncp-stack-card-head">
              <span className="ncp-stack-card-title">{row.engagement_name.trim()}</span>
              {platformUsers.find((u) => String(u.id) === row.headUserId) ? (
                <span
                  className="ncp-user-ico"
                  style={{
                    background: userColor(
                      platformUsers.find((u) => String(u.id) === row.headUserId)!.email,
                    ),
                    width: 22,
                    height: 22,
                    fontSize: 10,
                  }}
                >
                  {userInitials(platformUsers.find((u) => String(u.id) === row.headUserId)!.email)}
                </span>
              ) : null}
            </div>

            <div className="ncp-prop-row" style={{ borderTop: "none" }}>
              <div className="ncp-prop-label">Pipeline stage</div>
              <select
                className="ncp-prop-input"
                value={row.form.pipeline_stage || "discovery"}
                onChange={(e) => onEngField(row.id, "pipeline_stage", e.target.value)}
              >
                {CONTRACT_PIPELINE_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="ncp-prop-row">
              <div className="ncp-prop-label">Customer name</div>
              <input
                className="ncp-prop-input"
                placeholder="e.g. Accenture India Pvt Ltd"
                value={row.form.customer_name}
                onChange={(e) => onEngField(row.id, "customer_name", e.target.value)}
              />
            </div>
            <div className="ncp-prop-row">
              <div className="ncp-prop-label">Contract type</div>
              <select
                className="ncp-prop-input"
                value={row.form.account_type}
                onChange={(e) => onEngField(row.id, "account_type", e.target.value)}
              >
                <option value="">Choose type…</option>
                {accountTypeMerged.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="ncp-prop-row">
              <div className="ncp-prop-label">Current status</div>
              <div style={{ padding: "6px 0" }}>
                <select
                  className={cn("ncp-status-pill", statusPillClass(row.form.contract_status))}
                  value={row.form.contract_status || "Active"}
                  onChange={(e) => onEngField(row.id, "contract_status", e.target.value)}
                >
                  <option value="Active">Active</option>
                  <option value="Pending">Pending</option>
                  <option value="Inactive">Inactive</option>
                  <option value="renewed">Renewed</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
            </div>
            <div className="ncp-prop-row">
              <div className="ncp-prop-label">Renewal status</div>
              <select
                className="ncp-prop-input"
                value={row.form.renewal_status}
                onChange={(e) => onEngField(row.id, "renewal_status", e.target.value)}
              >
                <option value="">Not set</option>
                {renewalOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}

        {footer(0, 2)}
      </div>

      {/* ── Step 2: Dates ────────────────────────────────────────────────── */}
      <div className={cn("ncp-panel", step === 2 && "ncp-panel-active")}>
        <p className="ncp-hint" style={{ marginBottom: 12 }}>
          Contract dates per engagement. Duration auto-calculates; reminder defaults to 60 days before end.
        </p>

        {validEngagements.map((row) => (
          <div key={row.id} className="ncp-stack-card" style={{ marginBottom: 14 }}>
            <div className="ncp-stack-card-head">
              <span className="ncp-stack-card-title">{row.engagement_name.trim()}</span>
            </div>

            <div className="ncp-date-grid">
              <div className="ncp-date-cell">
                <label>Contract start</label>
                <input
                  type="date"
                  value={row.form.contract_start_date}
                  onChange={(e) => onEngDates(row.id, "contract_start_date", e.target.value)}
                />
              </div>
              <div className="ncp-date-cell">
                <label>Contract end / renewal</label>
                <input
                  type="date"
                  value={row.form.contract_end_date}
                  onChange={(e) => onEngDates(row.id, "contract_end_date", e.target.value)}
                />
              </div>
            </div>

            <div className="ncp-prop-row" style={{ marginTop: 4, borderTop: "none" }}>
              <div className="ncp-prop-label">Duration</div>
              <div className="ncp-computed-field">
                <span className="ncp-computed-label">AUTO</span>
                <span>{durationLabelFor(row.form)}</span>
              </div>
            </div>
            <div className="ncp-prop-row">
              <div className="ncp-prop-label">Renewal reminder</div>
              <input
                className="ncp-prop-input"
                type="date"
                value={row.form.renewal_reminder_date}
                onChange={(e) => onEngField(row.id, "renewal_reminder_date", e.target.value)}
              />
            </div>
            <div className="ncp-prop-row">
              <div className="ncp-prop-label">Duration (months)</div>
              <input
                className="ncp-prop-input"
                inputMode="numeric"
                placeholder="Override auto if needed"
                value={row.form.duration_months}
                onChange={(e) => onEngField(row.id, "duration_months", e.target.value)}
              />
            </div>
          </div>
        ))}

        {footer(1, 3)}
      </div>

      {/* ── Step 3: Commercial + MSA upload ──────────────────────────────── */}
      <div className={cn("ncp-panel", step === 3 && "ncp-panel-active")}>
        <p className="ncp-hint" style={{ marginBottom: 12 }}>
          Key economics and optional MSA / contract document upload for each engagement.
        </p>

        {validEngagements.map((row) => (
          <div key={row.id} className="ncp-stack-card" style={{ marginBottom: 14 }}>
            <div className="ncp-stack-card-head">
              <span className="ncp-stack-card-title">{row.engagement_name.trim()}</span>
            </div>

            <div className="ncp-commercial-row">
              <div className="ncp-amount-wrap">
                <label>Signed ACV</label>
                <div className="ncp-amount-row">
                  <span className="ncp-currency-badge">₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={row.form.signed_acv_inr}
                    onChange={(e) => onEngField(row.id, "signed_acv_inr", e.target.value)}
                  />
                </div>
              </div>
              <div className="ncp-amount-wrap">
                <label>Signed CM%</label>
                <div className="ncp-amount-row">
                  <span className="ncp-currency-badge">%</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.32 or 32"
                    value={row.form.signed_cm_pct}
                    onChange={(e) => onEngField(row.id, "signed_cm_pct", e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="ncp-prop-row" style={{ marginTop: 8, borderTop: "none" }}>
              <div className="ncp-prop-label">Gross margin</div>
              <div className="ncp-computed-field">
                <span className="ncp-computed-label">AUTO</span>
                <span>{grossMarginFor(row.form)}</span>
              </div>
            </div>
            <div className="ncp-prop-row">
              <div className="ncp-prop-label">Monthly run rate</div>
              <div className="ncp-computed-field">
                <span className="ncp-computed-label">AUTO</span>
                <span>{mrrFor(row.form)}</span>
              </div>
            </div>
            <div className="ncp-prop-row">
              <div className="ncp-prop-label">Pricing model</div>
              <select
                className="ncp-prop-input"
                value={row.form.pricing_model}
                onChange={(e) => onEngField(row.id, "pricing_model", e.target.value)}
              >
                <option value="">—</option>
                {pricingOptions.filter(Boolean).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="ncp-prop-row">
              <div className="ncp-prop-label">SOW / MSA ref</div>
              <input
                className="ncp-prop-input"
                placeholder="Reference number or URL"
                value={row.form.sow_msa_reference}
                onChange={(e) => onEngField(row.id, "sow_msa_reference", e.target.value)}
              />
            </div>
            <div className="ncp-prop-row">
              <div className="ncp-prop-label">Payment terms</div>
              <textarea
                className="ncp-prop-input"
                rows={2}
                value={row.form.payment_terms}
                onChange={(e) => onEngField(row.id, "payment_terms", e.target.value)}
              />
            </div>
            <div style={{ padding: "10px 12px" }}>
              <div className="ncp-micro-label" style={{ marginBottom: 8 }}>
                MSA / Contract document
              </div>
              <MultiFileUploadZone
                files={row.msa_files}
                onChange={(next) =>
                  setEngagements((rs) => rs.map((r) => (r.id === row.id ? { ...r, msa_files: next } : r)))
                }
              />
            </div>
          </div>
        ))}

        {footer(2, 4)}
      </div>

      {/* ── Step 4: Review ───────────────────────────────────────────────── */}
      <div className={cn("ncp-panel", step === 4 && "ncp-panel-active")}>
        <div
          className="ncp-section"
          style={{
            borderStyle: "dashed",
            borderColor: "var(--ncp-border-focus)",
            marginBottom: 16,
          }}
        >
          <div className="ncp-section-header" style={{ cursor: "default" }}>
            <div className="ncp-section-icon ncp-amber">✅</div>
            <div>
              <div className="ncp-section-label">Review</div>
              <div className="ncp-section-desc">
                Creates the client, then each project and its contract row
              </div>
            </div>
          </div>
          <div className="ncp-section-body" style={{ maxHeight: 480, paddingTop: 8 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "4px 20px",
                fontSize: 13,
                color: "var(--ncp-text-secondary)",
                lineHeight: 1.75,
              }}
            >
              <div>
                <span style={{ color: "var(--ncp-text-muted)" }}>Client</span>
                <br />
                <strong>{orgClient.official_name.trim() || "—"}</strong>
              </div>
              <div>
                <span style={{ color: "var(--ncp-text-muted)" }}>Lifecycle</span>
                <br />
                <strong style={{ textTransform: "capitalize" }}>{orgClient.lifecycle}</strong>
              </div>
              {orgClient.tag_level && orgClient.tag_value.trim() ? (
                <div>
                  <span style={{ color: "var(--ncp-text-muted)" }}>{orgClient.tag_level}</span>
                  <br />
                  <strong>{orgClient.tag_value}</strong>
                </div>
              ) : null}
            </div>

            <div
              style={{
                borderTop: "1px solid var(--ncp-border)",
                marginTop: 14,
                paddingTop: 12,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--ncp-mono)",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--ncp-text-muted)",
                  marginBottom: 8,
                }}
              >
                Engagements ({validEngagements.length})
              </div>
              {validEngagements.map((e, i) => {
                const headUser = platformUsers.find((u) => String(u.id) === e.headUserId);
                const stageLabel =
                  CONTRACT_PIPELINE_STAGES.find((s) => s.value === (e.form.pipeline_stage || "discovery"))?.label ??
                  e.form.pipeline_stage;
                return (
                  <div
                    key={e.id}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "var(--ncp-radius)",
                      background: i % 2 === 0 ? "var(--ncp-surface-hover)" : "transparent",
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ncp-text-primary)" }}>
                      {e.engagement_name.trim()}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--ncp-text-muted)",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0 12px",
                        marginTop: 2,
                      }}
                    >
                      {headUser ? <span>Head: {headUser.email}</span> : null}
                      <span>{stageLabel}</span>
                      {e.form.contract_start_date ? (
                        <span>
                          {e.form.contract_start_date} → {e.form.contract_end_date || "open"}
                        </span>
                      ) : null}
                      {e.form.signed_acv_inr ? (
                        <span>
                          ACV ₹
                          {parseFloat(e.form.signed_acv_inr.replace(/,/g, "")).toLocaleString("en-IN")}
                        </span>
                      ) : null}
                      {e.msa_files?.length ? (
                        <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "0 8px" }}>
                          {e.msa_files.map((f) => (
                            <span key={fileDedupeKey(f)}>📎 {f.name}</span>
                          ))}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {footer(3, null, true)}
      </div>
    </>
  );
}
