import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminApi, type AdminUserRow, type Project } from "@/lib/api";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { UserPickerDropdown, type PlatformUserLite } from "@/components/platform/NewContractOrgFlow";
import "@/styles/new-contract-panel.css";

/** Matches backend `auth/profile.py` VERTICAL_KEYS — order is UI-only. */
export const VERTICAL_MODULES: { key: string; label: string }[] = [
  { key: "finance", label: "Finance" },
  { key: "sla", label: "SLA" },
  { key: "wfm", label: "WFM" },
  { key: "requisitions", label: "Requisitions" },
  { key: "candidates", label: "Candidates" },
  { key: "contracts", label: "Contracts" },
  { key: "meetings", label: "Meetings" },
  { key: "transitions", label: "Client onboarding (transition)" },
  { key: "ingestion", label: "Ingestion" },
  { key: "revenue_forecast", label: "Revenue forecast" },
  { key: "revenue_kpi_governance", label: "Revenue KPI governance (weekly packs)" },
  { key: "revenue_billing", label: "Revenue / billing" },
  { key: "finance_validation", label: "Finance validation (billing approvals)" },
  { key: "vendor_licenses", label: "Vendor licenses" },
  { key: "tasks", label: "Tasks" },
  { key: "portfolio", label: "Portfolio" },
  { key: "clients", label: "Clients" },
  { key: "data_operations", label: "Data operations" },
  { key: "admin_users", label: "Users & access (admin)" },
];

const ALL_VERTICAL_KEYS = VERTICAL_MODULES.map((m) => m.key);

const VERTICAL_MODULES_CLIENT_CREATE = VERTICAL_MODULES.filter((m) => m.key !== "admin_users");

const USER_CREATE_TABS = ["Credentials", "Role & reporting", "Module access", "Review"] as const;
type CreateTabIdx = 0 | 1 | 2 | 3;

const EDIT_ACCESS_TABS = ["Credentials", "Role & reporting", "Module access", "Projects"] as const;
type AccessTabIdx = 0 | 1 | 2 | 3;

function toPlatformUsers(rows: AdminUserRow[]): PlatformUserLite[] {
  return rows.map((u) => ({ id: u.id, email: u.email, role: u.role }));
}

const ROLE_OPTIONS_CREATE: { value: string; label: string }[] = [
  { value: "platform_admin", label: "Platform admin — full platform" },
  { value: "executive", label: "Executive — org-wide data" },
  { value: "operations", label: "Operations — assigned projects + module list" },
  { value: "project_head", label: "Project head — full stack on assigned projects" },
  { value: "recruiter", label: "Recruiter — assigned requisitions / candidates" },
  {
    value: "client_user",
    label: "Client portal — read-only dashboards (assigned projects + module list)",
  },
];

function effectiveRoleLabel(stored: string): string {
  const r = (stored || "").toLowerCase();
  const map: Record<string, string> = {
    admin: "Platform admin",
    platform_admin: "Platform admin",
    manager: "Project head",
    project_head: "Project head",
    executive: "Executive",
    operations: "Operations",
    recruiter: "Recruiter",
    client_user: "Client portal",
  };
  return map[r] || stored;
}

function roleSelectOptions(currentStoredRole: string): { value: string; label: string }[] {
  const byVal = new Map(ROLE_OPTIONS_CREATE.map((o) => [o.value, o]));
  byVal.set("admin", { value: "admin", label: "admin (legacy → platform_admin on save)" });
  byVal.set("manager", { value: "manager", label: "manager (legacy → project_head on save)" });
  const cur = (currentStoredRole || "").toLowerCase();
  if (cur && !byVal.has(cur)) {
    byVal.set(cur, { value: currentStoredRole, label: `${currentStoredRole} (stored)` });
  }
  const order = [
    "platform_admin",
    "admin",
    "executive",
    "operations",
    "project_head",
    "manager",
    "recruiter",
    "client_user",
  ];
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const v of order) {
    const o = byVal.get(v);
    if (o && !seen.has(o.value)) {
      seen.add(o.value);
      out.push(o);
    }
  }
  for (const o of byVal.values()) {
    if (!seen.has(o.value)) {
      seen.add(o.value);
      out.push(o);
    }
  }
  return out;
}

function verticalSummary(access: string[] | null | undefined): string {
  if (access == null) return "— (default: all)";
  if (access.length === 0) return "— (none)";
  if (access.length >= ALL_VERTICAL_KEYS.length) return "All modules";
  return access.slice(0, 4).join(", ") + (access.length > 4 ? ` +${access.length - 4}` : "");
}

function projInitials(name: string): string {
  return name
    .split(/[\s\-_/]+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function MultiProjectPicker({
  value,
  onChange,
  projects,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  projects: Project[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [ddRect, setDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        String(p.id).includes(q) ||
        (p.account_name || "").toLowerCase().includes(q) ||
        (p.filename || "").toLowerCase().includes(q),
    );
  }, [projects, search]);

  const selectedProjects = useMemo(
    () => projects.filter((p) => value.includes(p.id)),
    [projects, value],
  );

  useLayoutEffect(() => {
    if (!open) { setDdRect(null); return; }
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
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || portalRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  function toggle(id: number) {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  }

  function projectLabel(p: Project) {
    return p.account_name || p.filename || `#${p.id}`;
  }

  const triggerLabel =
    selectedProjects.length === 0
      ? null
      : selectedProjects.length === 1
        ? `${projectLabel(selectedProjects[0])} (PRJ-${selectedProjects[0].id})`
        : `${selectedProjects.length} projects selected`;

  const panel = (
    <div
      className="new-contract-sheet"
      style={{
        position: "fixed",
        top: ddRect?.top ?? 0,
        left: ddRect?.left ?? 0,
        width: ddRect?.width ?? 0,
        zIndex: 200,
        pointerEvents: "auto",
        height: "auto",
        display: "block",
        background: "transparent",
      }}
      ref={portalRef}
    >
      <div className="ncp-project-dd ncp-open ncp-project-dd--portal" onClick={(e) => e.stopPropagation()}>
        <div className="ncp-project-search">
          <span style={{ opacity: 0.5 }}>🔍</span>
          <input
            type="search"
            placeholder="Search by ID, account, or file…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {value.length > 0 && (
            <button
              type="button"
              style={{ fontSize: 11, color: "var(--ncp-accent)", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
              onClick={() => { onChange([]); setOpen(false); }}
            >
              Clear all
            </button>
          )}
        </div>
        <div
          className="ncp-dd-scroll"
          style={{ maxHeight: 280 }}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {filtered.length === 0 && (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ncp-text-muted)" }}>
              No projects match "{search}"
            </div>
          )}
          {filtered.map((p) => {
            const checked = value.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className="ncp-project-opt"
                style={{ background: checked ? "color-mix(in srgb, var(--ncp-accent) 8%, transparent)" : undefined }}
                onClick={() => toggle(p.id)}
              >
                <span
                  className="ncp-proj-ico"
                  style={{
                    background: checked ? "var(--ncp-accent)" : "var(--ncp-border)",
                    color: checked ? "#fff" : "var(--ncp-text-muted)",
                    fontFamily: "var(--ncp-mono)",
                    fontSize: 10,
                  }}
                >
                  {checked ? "✓" : projInitials(projectLabel(p))}
                </span>
                <div>
                  <div style={{ fontWeight: checked ? 600 : 500, color: "var(--ncp-text-primary)" }}>
                    {projectLabel(p)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ncp-text-muted)", fontFamily: "var(--ncp-mono)" }}>
                    PRJ-{p.id}
                  </div>
                </div>
                {checked && <span style={{ marginLeft: "auto", color: "var(--ncp-accent)", fontSize: 12 }}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="ncp-project-wrap" style={{ marginBottom: 0 }}>
        <button
          ref={btnRef}
          type="button"
          className={cn("ncp-project-btn", selectedProjects.length > 0 && "ncp-selected")}
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        >
          {selectedProjects.length > 0 ? (
            <>
              <span className="ncp-project-icon" style={{ fontSize: 11, background: "var(--ncp-accent)" }}>
                {selectedProjects.length > 1 ? selectedProjects.length : projInitials(projectLabel(selectedProjects[0]))}
              </span>
              <div className="ncp-project-meta">
                <strong>{triggerLabel}</strong>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: 20 }}>＋</span>
              <span>Search or select projects…</span>
            </>
          )}
          <span style={{ color: "var(--ncp-text-muted)", marginLeft: "auto" }}>▾</span>
        </button>
      </div>

      {selectedProjects.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {selectedProjects.map((p) => (
            <span
              key={p.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px 3px 6px",
                borderRadius: 6,
                background: "color-mix(in srgb, var(--ncp-accent) 10%, var(--ncp-surface))",
                border: "1px solid color-mix(in srgb, var(--ncp-accent) 30%, transparent)",
                fontSize: 11,
                fontFamily: "var(--ncp-mono)",
                color: "var(--ncp-text-primary)",
              }}
            >
              <span style={{ color: "var(--ncp-accent)", fontWeight: 600 }}>PRJ-{p.id}</span>
              {(p.account_name || p.filename) && (
                <span style={{ color: "var(--ncp-text-secondary)" }}>{p.account_name || p.filename}</span>
              )}
              <button
                type="button"
                style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 0 2px", color: "var(--ncp-text-muted)", lineHeight: 1, fontSize: 13 }}
                onClick={() => toggle(p.id)}
                aria-label={`Remove ${projectLabel(p)}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {open && ddRect && createPortal(panel, document.body)}
    </div>
  );
}

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [createTab, setCreateTab] = useState<CreateTabIdx>(0);
  const [cEmail, setCEmail] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cRole, setCRole] = useState("project_head");
  const [cManagerUserId, setCManagerUserId] = useState("");
  const [cVerticals, setCVerticals] = useState<Set<string>>(() => new Set(ALL_VERTICAL_KEYS));
  const [cClientModules, setCClientModules] = useState<string[]>(["portfolio", "sla"]);

  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);

  const [accessModalUser, setAccessModalUser] = useState<AdminUserRow | null>(null);
  const [accessTab, setAccessTab] = useState<AccessTabIdx>(0);
  const [draftRole, setDraftRole] = useState("");
  const [draftManagerId, setDraftManagerId] = useState<string>("");
  const [draftVerticals, setDraftVerticals] = useState<Set<string>>(() => new Set(ALL_VERTICAL_KEYS));
  const [draftNewPassword, setDraftNewPassword] = useState("");
  const [draftNewPasswordConfirm, setDraftNewPasswordConfirm] = useState("");


  function openAccessModal(u: AdminUserRow) {
    setLoadError(null);
    const row = users.find((x) => x.id === u.id) ?? u;
    setAccessModalUser(row);
    setAccessTab(0);
    setDraftNewPassword("");
    setDraftNewPasswordConfirm("");
    setDraftRole(row.role);
    setDraftManagerId(row.manager_user_id != null ? String(row.manager_user_id) : "");
    setSelectedProjects([...(row.project_ids ?? [])]);
    const va = row.vertical_access;
    const stored = (row.role || "").toLowerCase();
    if (stored === "client_user" && (va == null || va.length === 0)) {
      setDraftVerticals(new Set(["portfolio", "sla"]));
    } else if (va == null || va.length === 0) {
      setDraftVerticals(new Set(ALL_VERTICAL_KEYS));
    } else {
      setDraftVerticals(new Set(va));
    }
  }

  function closeAccessModal() {
    setAccessModalUser(null);
    setAccessTab(0);
    setDraftNewPassword("");
    setDraftNewPasswordConfirm("");
  }

  async function refresh() {
    setLoadError(null);
    try {
      const [u, p] = await Promise.all([adminApi.listUsers(), adminApi.listProjectsForAdmin()]);
      setUsers(u);
      setProjects(p);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function resetCreateSheet() {
    setCreateTab(0);
    setCEmail("");
    setCPassword("");
    setCRole("project_head");
    setCManagerUserId("");
    setCVerticals(new Set(ALL_VERTICAL_KEYS));
    setCClientModules(["portfolio", "sla"]);
    setLoadError(null);
  }

  function openCreateSheet() {
    resetCreateSheet();
    setCreateSheetOpen(true);
  }

  async function submitCreateUser() {
    setBusy(true);
    setLoadError(null);
    try {
      if (cRole === "client_user" && cClientModules.length === 0) {
        setLoadError("Client portal users need at least one dashboard module.");
        setBusy(false);
        return;
      }
      const body: Parameters<typeof adminApi.createUser>[0] = {
        email: cEmail.trim(),
        password: cPassword,
        role: cRole,
      };
      const mid = cManagerUserId.trim();
      if (mid !== "") {
        const n = parseInt(mid, 10);
        if (Number.isNaN(n)) {
          setLoadError("Reports-to must be a valid user selection.");
          setBusy(false);
          return;
        }
        body.manager_user_id = n;
      }
      if (cRole === "client_user") {
        body.vertical_access = [...cClientModules].sort();
      } else {
        if (cVerticals.size === 0) {
          body.vertical_access = [];
        } else if (cVerticals.size < ALL_VERTICAL_KEYS.length) {
          body.vertical_access = [...cVerticals].sort();
        }
      }
      await adminApi.createUser(body);
      setCreateSheetOpen(false);
      resetCreateSheet();
      await refresh();
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  const platformUsers = useMemo(() => toPlatformUsers(users), [users]);

  /** Reports-to picker: exclude self, but always include the current selection so the button shows the manager. */
  const accessReportsPickerUsers = useMemo(() => {
    if (!accessModalUser) return platformUsers;
    const selfId = accessModalUser.id;
    const withoutSelf = platformUsers.filter((x) => x.id !== selfId);
    const pick = parseInt(draftManagerId.trim(), 10);
    if (!Number.isFinite(pick)) return withoutSelf;
    const selectedUser = platformUsers.find((x) => x.id === pick);
    if (selectedUser && !withoutSelf.some((x) => x.id === pick)) {
      return [selectedUser, ...withoutSelf];
    }
    return withoutSelf;
  }, [accessModalUser, platformUsers, draftManagerId]);

  function ncpSection(icon: string, iconCls: string, title: string, subtitle: string, sectionBody: React.ReactNode) {
    return (
      <div className="ncp-section">
        <div className="ncp-section-header" style={{ cursor: "default" }}>
          <div className={cn("ncp-section-icon", iconCls)}>{icon}</div>
          <div className="ncp-section-title">
            <div className="ncp-section-name">{title}</div>
            <div className="ncp-section-sub">{subtitle}</div>
          </div>
        </div>
        <div className="ncp-section-body">{sectionBody}</div>
      </div>
    );
  }

  function cPr(label: string, input: React.ReactNode) {
    return (
      <div className="ncp-prop-row">
        <div className="ncp-prop-label">{label}</div>
        {input}
      </div>
    );
  }

  async function toggleActive(u: AdminUserRow) {
    setBusy(true);
    try {
      await adminApi.patchUser(u.id, { is_active: !u.is_active });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveAccess() {
    if (!accessModalUser) return;
    const mid = draftManagerId.trim();
    const manager_user_id = mid === "" ? null : parseInt(mid, 10);
    if (mid !== "" && Number.isNaN(manager_user_id)) {
      setLoadError("Reports-to must be a valid user selection or empty.");
      return;
    }
    const pw = draftNewPassword.trim();
    const pwc = draftNewPasswordConfirm.trim();
    if (pw !== "" || pwc !== "") {
      if (pw.length < 6) {
        setLoadError("New password must be at least 6 characters.");
        return;
      }
      if (pw !== pwc) {
        setLoadError("New password and confirmation do not match.");
        return;
      }
    }
    setBusy(true);
    setLoadError(null);
    try {
      let vertical_access =
        draftVerticals.size === ALL_VERTICAL_KEYS.length ? [...ALL_VERTICAL_KEYS].sort() : [...draftVerticals].sort();
      if ((draftRole || "").toLowerCase() === "client_user") {
        vertical_access = vertical_access.filter((k) => k !== "admin_users");
      }
      const patch: Parameters<typeof adminApi.patchUser>[1] = {
        role: draftRole,
        manager_user_id,
        vertical_access,
      };
      if (pw !== "") {
        patch.password = pw;
      }
      await adminApi.patchUser(accessModalUser.id, patch);
      await adminApi.setUserProjects(accessModalUser.id, selectedProjects);
      closeAccessModal();
      await refresh();
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function managerEmail(managerId: number | null | undefined): string {
    if (managerId == null) return "—";
    const m = users.find((x) => x.id === managerId);
    return m ? `${m.email} (#${managerId})` : `#${managerId}`;
  }

  return (
    <div style={{ padding: "0 4px 32px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>
          Users & access
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", maxWidth: 720, lineHeight: 1.5 }}>
          Create accounts, assign{" "}
          <strong>roles</strong> (including <strong>client portal</strong> read-only logins),{" "}
          <strong>project assignments</strong>, optional <strong>reports-to</strong> hierarchy, and for{" "}
          <strong>operations</strong>, <strong>executive</strong>, <strong>project head</strong>,{" "}
          <strong>recruiter</strong>, and <strong>client portal</strong> users a <strong>vertical allow-list</strong>{" "}
          (which app sections and APIs they may use). Leave all modules checked or clear the saved list only when you
          intend full access (null in DB). Client portal accounts cannot modify data; gated APIs use the same keys.
        </p>
      </div>

      {loadError ? <div style={{ color: "var(--red)", marginBottom: 12 }}>{loadError}</div> : null}

      <div
        style={{
          marginBottom: 28,
          padding: "14px 16px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 14,
        }}
      >
        <button type="button" className="platform-chip active" disabled={busy} style={{ cursor: "pointer" }} onClick={openCreateSheet}>
          Add user
        </button>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", maxWidth: 560, lineHeight: 1.5 }}>
          Opens a side panel with the same step-by-step layout as contract creation: credentials, role, module access, then review before creating the account.
        </p>
      </div>

      <Sheet open={createSheetOpen} onOpenChange={(o) => { if (!o) { setCreateSheetOpen(false); resetCreateSheet(); } }}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="new-contract-sheet flex min-h-0 flex-1 flex-col p-0 max-h-[100dvh]"
        >
          <div className="ncp-scroll min-h-0 flex-1">
            <div className="ncp-page">
              <div className="ncp-header">
                <div>
                  <div className="ncp-breadcrumb">
                    <span>ADMIN</span>
                    <span>›</span>
                    <span>USERS</span>
                    <span>›</span>
                    <span>NEW</span>
                  </div>
                  <h1 className="ncp-title">New user</h1>
                  <p className="ncp-subtitle">
                    Create a platform login, set role and optional reports-to, then choose which app modules and APIs this account may use (same rules as Edit access).
                  </p>
                </div>
                <button type="button" className="ncp-close" onClick={() => { setCreateSheetOpen(false); resetCreateSheet(); }}>✕</button>
              </div>

              <div className="ncp-steps">
                {USER_CREATE_TABS.map((name, i) => (
                  <button
                    key={name}
                    type="button"
                    className={cn("ncp-step", i === createTab && "ncp-active", i < createTab && "ncp-done")}
                    onClick={() => setCreateTab(i as CreateTabIdx)}
                  >
                    <span className="ncp-step-num">{i < createTab ? "✓" : i + 1}</span>
                    {name}
                  </button>
                ))}
              </div>

              {/* Tab 0 — Credentials */}
              <div className={cn("ncp-panel", createTab === 0 && "ncp-panel-active")}>
                {ncpSection("✉️", "ncp-blue", "Sign-in", "Email and password for the new account",
                  <>
                    {cPr(
                      "Email",
                      <input
                        className="ncp-prop-input"
                        type="email"
                        autoComplete="off"
                        placeholder="name@company.com"
                        value={cEmail}
                        onChange={(e) => setCEmail(e.target.value)}
                      />,
                    )}
                    {cPr(
                      "Password",
                      <input
                        className="ncp-prop-input"
                        type="password"
                        autoComplete="new-password"
                        placeholder="Minimum 6 characters"
                        minLength={6}
                        value={cPassword}
                        onChange={(e) => setCPassword(e.target.value)}
                      />,
                    )}
                  </>,
                )}
              </div>

              {/* Tab 1 — Role & reporting */}
              <div className={cn("ncp-panel", createTab === 1 && "ncp-panel-active")}>
                {ncpSection("🛡️", "ncp-amber", "Role", "Determines default capabilities and data scope",
                  <div className="ncp-prop-row">
                    <div className="ncp-prop-label">Role</div>
                    <select
                      className="ncp-prop-input"
                      value={cRole}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCRole(v);
                        if (v === "client_user") {
                          setCClientModules((prev) => (prev.length ? prev : ["portfolio", "sla"]));
                        } else {
                          setCVerticals(new Set(ALL_VERTICAL_KEYS));
                        }
                      }}
                    >
                      {ROLE_OPTIONS_CREATE.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>,
                )}
                {ncpSection("🔗", "ncp-green", "Reporting", "Optional manager / dotted-line reports-to (platform user)",
                  <div className="ncp-prop-row">
                    <div className="ncp-prop-label">Reports to</div>
                    <UserPickerDropdown
                      value={cManagerUserId}
                      onChange={setCManagerUserId}
                      users={platformUsers}
                      placeholder="— None —"
                    />
                  </div>,
                )}
              </div>

              {/* Tab 2 — Module access */}
              <div className={cn("ncp-panel", createTab === 2 && "ncp-panel-active")}>
                {cRole === "client_user" ? (
                  ncpSection("📊", "ncp-blue", "Client dashboards", "Read-only sections this portal login may open (assign projects after save)",
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "4px 0" }}>
                      {VERTICAL_MODULES_CLIENT_CREATE.map((m) => (
                        <label
                          key={m.key}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            cursor: "pointer",
                            fontSize: 13,
                            padding: "8px 12px",
                            borderRadius: "var(--ncp-radius)",
                            border: "1px solid var(--ncp-border)",
                            background: "var(--ncp-surface)",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={cClientModules.includes(m.key)}
                            onChange={(e) => {
                              setCClientModules((prev) => {
                                if (e.target.checked) return [...prev, m.key];
                                return prev.filter((k) => k !== m.key);
                              });
                            }}
                          />
                          <span>{m.label}</span>
                        </label>
                      ))}
                    </div>,
                  )
                ) : (
                  ncpSection("📊", "ncp-blue", "Module allow-list", "Unchecked routes stay hidden; all checked = full access (same as legacy default when unset).",
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                          gap: 8,
                          padding: "4px 0",
                        }}
                      >
                        {VERTICAL_MODULES.map((m) => (
                          <label
                            key={m.key}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              cursor: "pointer",
                              fontSize: 12,
                              padding: "6px 8px",
                              borderRadius: "var(--ncp-radius)",
                              border: "1px solid var(--ncp-border)",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={cVerticals.has(m.key)}
                              onChange={(e) => {
                                setCVerticals((prev) => {
                                  const n = new Set(prev);
                                  if (e.target.checked) n.add(m.key);
                                  else n.delete(m.key);
                                  return n;
                                });
                              }}
                            />
                            <span>{m.label}</span>
                          </label>
                        ))}
                      </div>
                      <p style={{ fontSize: 11, color: "var(--ncp-text-muted)", margin: "12px 0 0", lineHeight: 1.45 }}>
                        For executive, operations, project head, and recruiter roles, this list gates sections and APIs (e.g. /finance). Client portal uses the tab above.
                      </p>
                    </>,
                  )
                )}
              </div>

              {/* Tab 3 — Review */}
              <div className={cn("ncp-panel", createTab === 3 && "ncp-panel-active")}>
                {ncpSection("✓", "ncp-accent", "Review", "Confirm before creating the account",
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13, color: "var(--ncp-text-secondary)", padding: "4px 0" }}>
                    <div><strong style={{ color: "var(--ncp-text-primary)" }}>Email:</strong> {cEmail.trim() || "—"}</div>
                    <div><strong style={{ color: "var(--ncp-text-primary)" }}>Role:</strong> {ROLE_OPTIONS_CREATE.find((r) => r.value === cRole)?.label ?? cRole}</div>
                    <div>
                      <strong style={{ color: "var(--ncp-text-primary)" }}>Reports to:</strong>{" "}
                      {cManagerUserId
                        ? (platformUsers.find((u) => String(u.id) === cManagerUserId)?.email ?? `#${cManagerUserId}`)
                        : "— None —"}
                    </div>
                    <div>
                      <strong style={{ color: "var(--ncp-text-primary)" }}>Modules:</strong>{" "}
                      {cRole === "client_user"
                        ? verticalSummary(cClientModules)
                        : cVerticals.size >= ALL_VERTICAL_KEYS.length
                          ? "All modules (default)"
                          : cVerticals.size === 0
                            ? "— (none — may block gated routes)"
                            : verticalSummary([...cVerticals])}
                    </div>
                  </div>,
                )}
              </div>

              {loadError && createSheetOpen ? (
                <div style={{ margin: "12px 0", padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--ncp-radius)", fontSize: 13, color: "#b91c1c" }}>
                  {loadError}
                </div>
              ) : null}
            </div>
          </div>

          <div className="ncp-footer">
            <button
              type="button"
              className="ncp-btn ncp-btn-ghost"
              onClick={createTab > 0 ? () => setCreateTab((t) => (t - 1) as CreateTabIdx) : () => { setCreateSheetOpen(false); resetCreateSheet(); }}
            >
              {createTab > 0 ? "← Back" : "Cancel"}
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              {createTab < USER_CREATE_TABS.length - 1 ? (
                <button type="button" className="ncp-btn ncp-btn-primary" onClick={() => setCreateTab((t) => (t + 1) as CreateTabIdx)}>
                  Next →
                </button>
              ) : (
                <button
                  type="button"
                  className="ncp-btn ncp-btn-primary"
                  disabled={busy || !cEmail.trim() || cPassword.length < 6}
                  onClick={() => void submitCreateUser()}
                >
                  {busy ? "Creating…" : "Create account"}
                </button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--border)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 920 }}>
          <thead>
            <tr style={{ textAlign: "left", background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>
              <th style={{ padding: "10px 12px" }}>ID</th>
              <th style={{ padding: "10px 12px" }}>Email</th>
              <th style={{ padding: "10px 12px" }}>Role (stored)</th>
              <th style={{ padding: "10px 12px" }}>Effective</th>
              <th style={{ padding: "10px 12px" }}>Active</th>
              <th style={{ padding: "10px 12px" }}>Reports to</th>
              <th style={{ padding: "10px 12px" }}>Verticals</th>
              <th style={{ padding: "10px 12px" }}>Projects</th>
              <th style={{ padding: "10px 12px" }} />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 12px", fontFamily: "'DM Mono',monospace" }}>{u.id}</td>
                <td style={{ padding: "10px 12px" }}>{u.email}</td>
                <td style={{ padding: "10px 12px", fontFamily: "'DM Mono',monospace", fontSize: 11 }}>{u.role}</td>
                <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>{effectiveRoleLabel(u.role)}</td>
                <td style={{ padding: "10px 12px" }}>{u.is_active ? "yes" : "no"}</td>
                <td style={{ padding: "10px 12px", fontSize: 11, maxWidth: 180 }} title={managerEmail(u.manager_user_id ?? undefined)}>
                  {managerEmail(u.manager_user_id ?? undefined)}
                </td>
                <td style={{ padding: "10px 12px", fontSize: 11, color: "var(--text-muted)", maxWidth: 200 }} title={verticalSummary(u.vertical_access)}>
                  {verticalSummary(u.vertical_access)}
                </td>
                <td style={{ padding: "10px 12px", fontFamily: "'DM Mono',monospace", fontSize: 11 }}>
                  {u.project_ids.length ? u.project_ids.join(", ") : "—"}
                </td>
                <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                  <button
                    type="button"
                    className="platform-chip"
                    style={{ cursor: "pointer", marginRight: 6 }}
                    onClick={() => openAccessModal(u)}
                  >
                    Edit access
                  </button>
                  <button type="button" className="platform-chip" style={{ cursor: "pointer", marginRight: 6 }} onClick={() => void toggleActive(u)}>
                    {u.is_active ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={!!accessModalUser} onOpenChange={(o) => { if (!o) closeAccessModal(); }}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="new-contract-sheet flex min-h-0 flex-1 flex-col p-0 max-h-[100dvh]"
        >
          {accessModalUser ? (
            <>
              <div className="ncp-scroll min-h-0 flex-1">
                <div className="ncp-page">
                  <div className="ncp-header">
                    <div>
                      <div className="ncp-breadcrumb">
                        <span>ADMIN</span>
                        <span>›</span>
                        <span>USERS</span>
                        <span>›</span>
                        <span>ACCESS</span>
                      </div>
                      <h1 id="admin-access-title" className="ncp-title">Edit access</h1>
                      <p className="ncp-subtitle">
                        {accessModalUser.email} — update sign-in password (optional), role, reports-to, and module allow-list.
                        Existing passwords cannot be displayed; set new values only when you want to rotate credentials.
                      </p>
                    </div>
                    <button type="button" className="ncp-close" onClick={closeAccessModal}>✕</button>
                  </div>

                  <div className="ncp-steps">
                    {EDIT_ACCESS_TABS.map((name, i) => (
                      <button
                        key={name}
                        type="button"
                        className={cn("ncp-step", i === accessTab && "ncp-active", i < accessTab && "ncp-done")}
                        onClick={() => setAccessTab(i as AccessTabIdx)}
                      >
                        <span className="ncp-step-num">{i < accessTab ? "✓" : i + 1}</span>
                        {name}
                      </button>
                    ))}
                  </div>

                  <div className={cn("ncp-panel", accessTab === 0 && "ncp-panel-active")}>
                    {ncpSection("✉️", "ncp-blue", "Account", "Platform login email (read-only)",
                      cPr(
                        "Email",
                        <input
                          className="ncp-prop-input"
                          type="email"
                          readOnly
                          value={accessModalUser.email}
                          aria-readonly="true"
                        />,
                      ),
                    )}
                    {ncpSection("🔑", "ncp-amber", "Security", "Leave blank to keep the current password. Minimum 6 characters when set.",
                      <>
                        {cPr(
                          "New password",
                          <input
                            className="ncp-prop-input"
                            type="password"
                            autoComplete="new-password"
                            placeholder="Leave blank to keep current"
                            minLength={6}
                            value={draftNewPassword}
                            onChange={(e) => setDraftNewPassword(e.target.value)}
                          />,
                        )}
                        {cPr(
                          "Confirm new password",
                          <input
                            className="ncp-prop-input"
                            type="password"
                            autoComplete="new-password"
                            placeholder="Repeat new password"
                            minLength={6}
                            value={draftNewPasswordConfirm}
                            onChange={(e) => setDraftNewPasswordConfirm(e.target.value)}
                          />,
                        )}
                      </>,
                    )}
                  </div>

                  <div className={cn("ncp-panel", accessTab === 1 && "ncp-panel-active")}>
                    {ncpSection("🛡️", "ncp-amber", "Role", "Determines default capabilities; legacy stored values normalize on save.",
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Role</div>
                        <select
                          className="ncp-prop-input"
                          value={draftRole}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftRole(v);
                            if (v === "client_user") {
                              setDraftVerticals((prev) => {
                                const next = new Set([...prev].filter((k) => k !== "admin_users"));
                                if (next.size === 0) return new Set(["portfolio", "sla"]);
                                return next;
                              });
                            }
                          }}
                        >
                          {roleSelectOptions(draftRole).map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>,
                    )}
                    {ncpSection("🔗", "ncp-green", "Reporting", "Optional manager / dotted-line reports-to (platform user)",
                      <div className="ncp-prop-row">
                        <div className="ncp-prop-label">Reports to</div>
                        <UserPickerDropdown
                          value={draftManagerId}
                          onChange={setDraftManagerId}
                          users={accessReportsPickerUsers}
                          placeholder="— None —"
                        />
                      </div>,
                    )}
                  </div>

                  <div className={cn("ncp-panel", accessTab === 2 && "ncp-panel-active")}>
                    {(draftRole || "").toLowerCase() === "client_user" ? (
                      ncpSection("📊", "ncp-blue", "Client dashboards", "Read-only sections this portal login may open (assign projects from the table).",
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "4px 0" }}>
                          {VERTICAL_MODULES_CLIENT_CREATE.map((m) => (
                            <label
                              key={m.key}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                cursor: "pointer",
                                fontSize: 13,
                                padding: "8px 12px",
                                borderRadius: "var(--ncp-radius)",
                                border: "1px solid var(--ncp-border)",
                                background: "var(--ncp-surface)",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={draftVerticals.has(m.key)}
                                onChange={(e) => {
                                  setDraftVerticals((prev) => {
                                    const n = new Set(prev);
                                    if (e.target.checked) n.add(m.key);
                                    else n.delete(m.key);
                                    return n;
                                  });
                                }}
                              />
                              <span>{m.label}</span>
                            </label>
                          ))}
                        </div>,
                      )
                    ) : (
                      ncpSection("📊", "ncp-blue", "Module allow-list", "For executive, operations, project head, and recruiter, this gates sections and APIs (e.g. /finance, /sla-performance).",
                        <>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                              gap: 8,
                              padding: "4px 0",
                            }}
                          >
                            {VERTICAL_MODULES.map((m) => (
                              <label
                                key={m.key}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  cursor: "pointer",
                                  fontSize: 12,
                                  padding: "6px 8px",
                                  borderRadius: "var(--ncp-radius)",
                                  border: "1px solid var(--ncp-border)",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={draftVerticals.has(m.key)}
                                  onChange={(e) => {
                                    setDraftVerticals((prev) => {
                                      const n = new Set(prev);
                                      if (e.target.checked) n.add(m.key);
                                      else n.delete(m.key);
                                      return n;
                                    });
                                  }}
                                />
                                <span>{m.label}</span>
                              </label>
                            ))}
                          </div>
                          <p style={{ fontSize: 11, color: "var(--ncp-text-muted)", margin: "12px 0 0", lineHeight: 1.45 }}>
                            All boxes checked stores the full module list. None checked stores an empty list and removes gated-route access until you assign modules again.
                            Users with no saved list in the database still get full module access (legacy default).
                          </p>
                        </>,
                      )
                    )}
                  </div>

                  <div className={cn("ncp-panel", accessTab === 3 && "ncp-panel-active")}>
                    {ncpSection("📁", "ncp-green", "Project assignments", "Scoped roles (operations, project head, recruiter) only see data for checked projects. Executive with no assignments is org-wide; with assignments, scope matches the list.",
                      <MultiProjectPicker
                        value={selectedProjects}
                        onChange={setSelectedProjects}
                        projects={projects}
                      />,
                    )}
                  </div>

                  {loadError && accessModalUser ? (
                    <div style={{ margin: "12px 0", padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--ncp-radius)", fontSize: 13, color: "#b91c1c" }}>
                      {loadError}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="ncp-footer">
                <button
                  type="button"
                  className="ncp-btn ncp-btn-ghost"
                  onClick={accessTab > 0 ? () => setAccessTab((t) => (t - 1) as AccessTabIdx) : closeAccessModal}
                >
                  {accessTab > 0 ? "← Back" : "Cancel"}
                </button>
                <div style={{ display: "flex", gap: 8 }}>
                  {accessTab < EDIT_ACCESS_TABS.length - 1 ? (
                    <button type="button" className="ncp-btn ncp-btn-primary" onClick={() => setAccessTab((t) => (t + 1) as AccessTabIdx)}>
                      Next →
                    </button>
                  ) : (
                    <button type="button" className="ncp-btn ncp-btn-primary" disabled={busy} onClick={() => void saveAccess()}>
                      {busy ? "Saving…" : "Save all"}
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

    </div>
  );
}
