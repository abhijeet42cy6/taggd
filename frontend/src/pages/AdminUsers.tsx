import React, { useEffect, useMemo, useState } from "react";
import { adminApi, type AdminUserRow, type Project } from "@/lib/api";

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

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("project_head");
  const [newClientModules, setNewClientModules] = useState<string[]>(["portfolio", "sla"]);

  const [editingProjectsFor, setEditingProjectsFor] = useState<number | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  const [projectSearch, setProjectSearch] = useState("");

  const [accessModalUser, setAccessModalUser] = useState<AdminUserRow | null>(null);
  const [draftRole, setDraftRole] = useState("");
  const [draftManagerId, setDraftManagerId] = useState<string>("");
  const [draftVerticals, setDraftVerticals] = useState<Set<string>>(() => new Set(ALL_VERTICAL_KEYS));

  const filteredProjectsForModal = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const idStr = String(p.id);
      const name = (p.account_name || "").toLowerCase();
      const file = (p.filename || "").toLowerCase();
      return idStr.includes(q) || name.includes(q) || file.includes(q);
    });
  }, [projects, projectSearch]);

  function closeProjectModal() {
    setEditingProjectsFor(null);
    setProjectSearch("");
  }

  function openAccessModal(u: AdminUserRow) {
    setAccessModalUser(u);
    setDraftRole(u.role);
    setDraftManagerId(u.manager_user_id != null ? String(u.manager_user_id) : "");
    const va = u.vertical_access;
    const stored = (u.role || "").toLowerCase();
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

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (newRole === "client_user" && newClientModules.length === 0) {
        setLoadError("Client portal users need at least one dashboard module.");
        return;
      }
      const body: { email: string; password: string; role: string; vertical_access?: string[] } = {
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      };
      if (newRole === "client_user") {
        body.vertical_access = [...newClientModules].sort();
      }
      await adminApi.createUser(body);
      setNewEmail("");
      setNewPassword("");
      setNewClientModules(["portfolio", "sla"]);
      await refresh();
    } finally {
      setBusy(false);
    }
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

  async function saveProjects(userId: number) {
    setBusy(true);
    try {
      await adminApi.setUserProjects(userId, selectedProjects);
      closeProjectModal();
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
      setLoadError("Reports-to must be a valid user ID or empty.");
      return;
    }
    setBusy(true);
    try {
      let vertical_access =
        draftVerticals.size === ALL_VERTICAL_KEYS.length ? [...ALL_VERTICAL_KEYS].sort() : [...draftVerticals].sort();
      if ((draftRole || "").toLowerCase() === "client_user") {
        vertical_access = vertical_access.filter((k) => k !== "admin_users");
      }
      await adminApi.patchUser(accessModalUser.id, {
        role: draftRole,
        manager_user_id,
        vertical_access,
      });
      closeAccessModal();
      setLoadError(null);
      await refresh();
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function openProjectEditor(u: AdminUserRow) {
    setEditingProjectsFor(u.id);
    setSelectedProjects([...u.project_ids]);
    setProjectSearch("");
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
          <strong>operations</strong> and <strong>client portal</strong> users a <strong>vertical allow-list</strong>{" "}
          (which dashboards they may open). Client portal accounts cannot modify data. Finance, SLA, and other module
          APIs enforce the same vertical keys.
        </p>
      </div>

      {loadError ? <div style={{ color: "var(--red)", marginBottom: 12 }}>{loadError}</div> : null}

      <form
        onSubmit={onCreate}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 10,
          alignItems: "end",
          marginBottom: 28,
          padding: 16,
          borderRadius: 12,
          border: "1px solid var(--border)",
        }}
      >
        <div style={{ gridColumn: "span 1", minWidth: 0 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>Email</div>
          <input
            className="platform-search"
            style={{ width: "100%", boxSizing: "border-box" }}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            type="email"
          />
        </div>
        <div style={{ gridColumn: "span 1", minWidth: 0 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>Password (min 6)</div>
          <input
            className="platform-search"
            style={{ width: "100%", boxSizing: "border-box" }}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            type="password"
            minLength={6}
          />
        </div>
        <div style={{ gridColumn: "span 2", minWidth: 200 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>Role</div>
          <select
            className="platform-search"
            style={{ width: "100%", boxSizing: "border-box" }}
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
          >
            {ROLE_OPTIONS_CREATE.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {newRole === "client_user" ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>
              Client portal — dashboards this login may open (assign projects after create)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {VERTICAL_MODULES_CLIENT_CREATE.map((m) => (
                <label
                  key={m.key}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={newClientModules.includes(m.key)}
                    onChange={(e) => {
                      setNewClientModules((prev) => {
                        if (e.target.checked) return [...prev, m.key];
                        return prev.filter((k) => k !== m.key);
                      });
                    }}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        ) : null}
        <div>
          <button type="submit" className="platform-chip active" disabled={busy} style={{ cursor: "pointer" }}>
            Add user
          </button>
        </div>
      </form>

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
                  <button type="button" className="platform-chip active" style={{ cursor: "pointer" }} onClick={() => openProjectEditor(u)}>
                    Projects
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {accessModalUser ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAccessModal();
          }}
        >
          <div
            role="dialog"
            aria-labelledby="admin-access-title"
            style={{
              width: "100%",
              maxWidth: 480,
              maxHeight: "min(90vh, 720px)",
              display: "flex",
              flexDirection: "column",
              borderRadius: 16,
              border: "1px solid color-mix(in srgb, var(--border) 85%, #94a3b8)",
              background: "var(--surface-raised, #ffffff)",
              color: "var(--text, #0f172a)",
              boxShadow: "0 25px 50px -12px rgba(15, 23, 42, 0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid var(--border)" }}>
              <div id="admin-access-title" style={{ fontWeight: 700, fontFamily: "'Syne',sans-serif", fontSize: 16 }}>
                Access — {accessModalUser.email}
              </div>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.45 }}>
                Operations users need matching verticals for gated routes (e.g. <code>/finance</code>, <code>/sla</code>
                ). Saving applies role, reports-to, and the module checklist below.
              </p>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "16px 20px" }}>
              <label style={{ display: "block", marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>Role</div>
                <select
                  className="platform-search"
                  style={{ width: "100%", boxSizing: "border-box" }}
                  value={draftRole}
                  onChange={(e) => setDraftRole(e.target.value)}
                >
                  {roleSelectOptions(draftRole).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "block", marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>Reports to (user ID)</div>
                <select
                  className="platform-search"
                  style={{ width: "100%", boxSizing: "border-box" }}
                  value={draftManagerId}
                  onChange={(e) => setDraftManagerId(e.target.value)}
                >
                  <option value="">— None —</option>
                  {users
                    .filter((x) => x.id !== accessModalUser.id)
                    .map((x) => (
                      <option key={x.id} value={String(x.id)}>
                        #{x.id} — {x.email}
                      </option>
                    ))}
                </select>
              </label>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>Module allow-list</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: 8,
                  fontSize: 11,
                }}
              >
                {VERTICAL_MODULES.map((m) => (
                  <label key={m.key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
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
              <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 12, lineHeight: 1.45 }}>
                All boxes checked = full list stored (same as default for operations). None checked sends an empty list
                (operations users lose gated modules until you fix it).
              </p>
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                padding: "14px 18px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <button type="button" className="platform-chip" style={{ cursor: "pointer" }} onClick={closeAccessModal}>
                Cancel
              </button>
              <button type="button" className="platform-chip active" style={{ cursor: "pointer" }} disabled={busy} onClick={() => void saveAccess()}>
                Save access
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingProjectsFor != null ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeProjectModal();
          }}
        >
          <div
            role="dialog"
            aria-labelledby="admin-project-assignments-title"
            style={{
              width: "100%",
              maxWidth: 420,
              maxHeight: "min(80vh, 640px)",
              display: "flex",
              flexDirection: "column",
              borderRadius: 16,
              border: "1px solid color-mix(in srgb, var(--border) 85%, #94a3b8)",
              background: "var(--surface-raised, #ffffff)",
              color: "var(--text, #0f172a)",
              boxShadow:
                "0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.8) inset",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "18px 20px 14px",
                borderBottom: "1px solid var(--border)",
                background: "var(--surface-raised, #ffffff)",
                borderRadius: "16px 16px 0 0",
              }}
            >
              <div
                id="admin-project-assignments-title"
                style={{ fontWeight: 700, marginBottom: 8, fontFamily: "'Syne',sans-serif", fontSize: 16, color: "var(--text)" }}
              >
                Project assignments
              </div>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, lineHeight: 1.45 }}>
                Scoped roles (operations, project head, recruiter) only see data for checked projects. Executive with no
                assignments is org-wide; with assignments, scope matches the list.
              </p>
              <input
                id="admin-project-search"
                type="search"
                className="platform-search"
                placeholder="Search by ID, account, or file…"
                aria-label="Search projects"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                autoComplete="off"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  marginTop: 14,
                }}
              />
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "auto",
                padding: "14px 16px",
                background: "var(--surface-muted, #f4f4f5)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {filteredProjectsForModal.length === 0 ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      textAlign: "center",
                      padding: "20px 12px",
                    }}
                  >
                    {projects.length === 0
                      ? "No projects available."
                      : `No projects match “${projectSearch.trim()}”.`}
                  </div>
                ) : null}
                {filteredProjectsForModal.map((p) => (
                  <label
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      cursor: "pointer",
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "var(--surface-raised, #ffffff)",
                      border: "1px solid color-mix(in srgb, var(--border) 70%, transparent)",
                      fontSize: 12,
                      color: "var(--text)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedProjects.includes(p.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedProjects((s) => [...s, p.id]);
                        else setSelectedProjects((s) => s.filter((x) => x !== p.id));
                      }}
                    />
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
                      #{p.id} — {p.account_name || p.filename}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                padding: "14px 18px",
                borderTop: "1px solid var(--border)",
                background: "var(--surface-raised, #ffffff)",
                borderRadius: "0 0 16px 16px",
              }}
            >
              <button type="button" className="platform-chip" style={{ cursor: "pointer" }} onClick={closeProjectModal}>
                Cancel
              </button>
              <button
                type="button"
                className="platform-chip active"
                style={{ cursor: "pointer" }}
                disabled={busy}
                onClick={() => void saveProjects(editingProjectsFor)}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
