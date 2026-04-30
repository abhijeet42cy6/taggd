import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminApi, type AdminUserRow, type Project } from "@/lib/api";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { UserPickerDropdown, type PlatformUserLite } from "@/components/platform/NewContractOrgFlow";
import "@/styles/new-contract-panel.css";

/** Matches backend `auth/profile.py` VERTICAL_KEYS — order is UI-only. */
export const VERTICAL_MODULES: { key: string; label: string }[] = [
  { key: "executive_dashboard", label: "Executive Overview (dashboard)" },
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
  { key: "client_dashboard", label: "Client dashboard" },
  { key: "data_operations", label: "Data operations" },
  { key: "admin_users", label: "Users & access (admin)" },
];

const ALL_VERTICAL_KEYS = VERTICAL_MODULES.map((m) => m.key);

const VERTICAL_MODULES_CLIENT_CREATE = VERTICAL_MODULES.filter((m) => m.key !== "admin_users");

const USER_CREATE_TABS = ["Credentials", "Role & reporting", "Module access", "Projects"] as const;
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

function avatarInitials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._\-+]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function displayName(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local
    .split(/[._\-+]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const ROLE_PILL_VARIANTS: Record<string, string> = {
  platform_admin: "admin",
  admin: "admin",
  executive: "exec",
  operations: "ops",
  project_head: "ph",
  manager: "ph",
  recruiter: "recruiter",
  client_user: "client",
};
function rolePillVariant(role: string): string {
  return ROLE_PILL_VARIANTS[(role || "").toLowerCase()] ?? "default";
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
  /** New-user wizard only (edit access uses `selectedProjects`). */
  const [cProjectIds, setCProjectIds] = useState<number[]>([]);

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
    setCProjectIds([]);
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
      if (cRole === "client_user" && cProjectIds.length === 0) {
        setLoadError("Client portal users need at least one project — use the Projects step.");
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
      const created = (await adminApi.createUser(body)) as { id: number };
      if (cProjectIds.length > 0) {
        await adminApi.setUserProjects(created.id, cProjectIds);
      }
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

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [sortBy, setSortBy] = useState<"email" | "role">("email");

  const filteredUsers = useMemo(() => {
    let list = users;
    // text search
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q) ||
          effectiveRoleLabel(u.role).toLowerCase().includes(q) ||
          String(u.id).includes(q),
      );
    }
    // role filter
    if (roleFilter) {
      list = list.filter((u) =>
        rolePillVariant(u.role) === roleFilter ||
        u.role.toLowerCase() === roleFilter.toLowerCase(),
      );
    }
    // status filter
    if (statusFilter === "active") list = list.filter((u) => u.is_active);
    else if (statusFilter === "inactive") list = list.filter((u) => !u.is_active);
    // sort
    if (sortBy === "role") list = [...list].sort((a, b) => a.role.localeCompare(b.role));
    return list;
  }, [users, search, roleFilter, statusFilter, sortBy]);

  const groupedUsers = useMemo(() => {
    const sorted = [...filteredUsers].sort((a, b) =>
      sortBy === "role" ? a.role.localeCompare(b.role) : a.email.localeCompare(b.email),
    );
    if (sortBy === "role") {
      const groups = new Map<string, AdminUserRow[]>();
      for (const u of sorted) {
        const key = effectiveRoleLabel(u.role);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(u);
      }
      return groups;
    }
    const groups = new Map<string, AdminUserRow[]>();
    for (const u of sorted) {
      const letter = u.email[0]?.toUpperCase() ?? "#";
      if (!groups.has(letter)) groups.set(letter, []);
      groups.get(letter)!.push(u);
    }
    return groups;
  }, [filteredUsers, sortBy]);

  const hasFilters = !!(search || roleFilter || statusFilter);

  const activeCount  = useMemo(() => users.filter((u) => u.is_active).length, [users]);
  const inactiveCount = useMemo(() => users.filter((u) => !u.is_active).length, [users]);

  return (
    <div style={{ padding: "0 4px 48px" }}>
      {/* ── Page header ── */}
      <div className="au-header">
        <div className="au-header-left">
          <h1 className="au-page-title">Users &amp; access</h1>
          <p className="au-page-sub">
            Manage platform logins, roles, module access and project assignments.
          </p>
        </div>
        <div className="au-header-actions">
          <div className="au-search-wrap">
            <span className="au-search-icon" aria-hidden>🔍</span>
            <input
              className="au-search-input"
              type="search"
              placeholder="Search members…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="au-add-btn"
            disabled={busy}
            onClick={openCreateSheet}
          >
            + Add user
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="dashboard-filter-bar au-filter-bar">
        {/* Role */}
        <div className="dashboard-filter-field">
          <span className="dashboard-filter-label">Role</span>
          <select
            className="dashboard-filter-select"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">All roles</option>
            <option value="admin">Platform admin</option>
            <option value="exec">Executive</option>
            <option value="ph">Project head</option>
            <option value="ops">Operations</option>
            <option value="recruiter">Recruiter</option>
            <option value="client">Client portal</option>
          </select>
        </div>

        {/* Status */}
        <div className="dashboard-filter-field">
          <span className="dashboard-filter-label">Status</span>
          <select
            className="dashboard-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | "active" | "inactive")}
          >
            <option value="">All ({users.length})</option>
            <option value="active">Active ({activeCount})</option>
            <option value="inactive">Inactive ({inactiveCount})</option>
          </select>
        </div>

        {/* Sort */}
        <div className="dashboard-filter-field">
          <span className="dashboard-filter-label">Sort by</span>
          <select
            className="dashboard-filter-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "email" | "role")}
          >
            <option value="email">Email A–Z</option>
            <option value="role">Role</option>
          </select>
        </div>

        {/* Active chip-strip */}
        <div className="au-filter-status-chips">
          <button
            type="button"
            className={cn("au-status-chip", !statusFilter && "au-status-chip--active")}
            onClick={() => setStatusFilter("")}
          >
            All
            <span className="au-status-chip__count">{users.length}</span>
          </button>
          <button
            type="button"
            className={cn("au-status-chip au-status-chip--on", statusFilter === "active" && "au-status-chip--active")}
            onClick={() => setStatusFilter(statusFilter === "active" ? "" : "active")}
          >
            <span className="au-status-dot au-status-dot--on" />
            Active
            <span className="au-status-chip__count">{activeCount}</span>
          </button>
          <button
            type="button"
            className={cn("au-status-chip au-status-chip--off", statusFilter === "inactive" && "au-status-chip--active")}
            onClick={() => setStatusFilter(statusFilter === "inactive" ? "" : "inactive")}
          >
            <span className="au-status-dot au-status-dot--off" />
            Inactive
            <span className="au-status-chip__count">{inactiveCount}</span>
          </button>
        </div>

        {hasFilters ? (
          <button
            type="button"
            className="dashboard-filter-reset"
            onClick={() => { setSearch(""); setRoleFilter(""); setStatusFilter(""); }}
          >
            Reset filters
          </button>
        ) : null}
      </div>

      {loadError ? (
        <div style={{ color: "var(--red)", marginBottom: 12, fontSize: 12 }}>{loadError}</div>
      ) : null}

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
                  ncpSection("📊", "ncp-blue", "Client dashboards", "Read-only sections this portal login may open (assign projects in the Projects step).",
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

              {/* Tab 3 — Project assignments (same as Edit access) */}
              <div className={cn("ncp-panel", createTab === 3 && "ncp-panel-active")}>
                {ncpSection("📁", "ncp-green", "Project assignments", "Scoped roles (operations, project head, recruiter) only see data for checked projects. Executive with no assignments is org-wide; with assignments, scope matches the list.",
                  <MultiProjectPicker
                    value={cProjectIds}
                    onChange={setCProjectIds}
                    projects={projects}
                  />,
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

      {/* ── Grouped contact list ── */}
      <div className="au-list">
        {groupedUsers.size === 0 && !loadError ? (
          <div className="au-empty">No users found.</div>
        ) : null}
        {[...groupedUsers.entries()].map(([letter, rows]) => (
          <div key={letter} className="au-group">
            <div className="au-group-letter">{letter}</div>
            {rows.map((u) => (
              <div key={u.id} className={cn("au-row", !u.is_active && "au-row--inactive")}>
                <div className="au-avatar" data-role={u.role}>
                  {avatarInitials(u.email)}
                </div>
                <div className="au-identity">
                  <span className="au-name">{displayName(u.email)}</span>
                  <span className="au-email">{u.email}</span>
                </div>
                <div className="au-role-col">
                  <span className={cn("au-role-pill", `au-role-pill--${rolePillVariant(u.role)}`)}>
                    {effectiveRoleLabel(u.role)}
                  </span>
                </div>
                <div className="au-reports-col">
                  {u.manager_user_id != null ? (
                    <span className="au-reports-to">
                      ↑ {managerEmail(u.manager_user_id)}
                    </span>
                  ) : null}
                </div>
                <div className="au-actions">
                  <label className="au-toggle" title={u.is_active ? "Disable account" : "Enable account"}>
                    <input
                      type="checkbox"
                      checked={u.is_active}
                      onChange={() => void toggleActive(u)}
                      disabled={busy}
                    />
                    <span className="au-toggle-track" />
                  </label>
                  <button
                    type="button"
                    className="au-edit-btn"
                    aria-label="Edit access"
                    onClick={() => openAccessModal(u)}
                  >
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
                      <path d="M11.5 1.5a1.414 1.414 0 0 1 2 2l-9 9-2.5.5.5-2.5 9-9Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
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
