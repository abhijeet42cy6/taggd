import React, { useEffect, useMemo, useState } from "react";
import { adminApi, type AdminUserRow, type Project } from "@/lib/api";

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "executive" | "manager">("manager");

  const [editingProjectsFor, setEditingProjectsFor] = useState<number | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  const [projectSearch, setProjectSearch] = useState("");

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
      await adminApi.createUser({ email: newEmail.trim(), password: newPassword, role: newRole });
      setNewEmail("");
      setNewPassword("");
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

  function openProjectEditor(u: AdminUserRow) {
    setEditingProjectsFor(u.id);
    setSelectedProjects([...u.project_ids]);
    setProjectSearch("");
  }

  return (
    <div style={{ padding: "0 4px 32px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>
          Users & access
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", maxWidth: 560 }}>
          Create accounts, assign roles, and link managers to projects. Backend enforces scopes on API routes.
        </p>
      </div>

      {loadError ? <div style={{ color: "var(--red)", marginBottom: 12 }}>{loadError}</div> : null}

      <form
        onSubmit={onCreate}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 140px auto",
          gap: 10,
          alignItems: "end",
          marginBottom: 28,
          padding: 16,
          borderRadius: 12,
          border: "1px solid var(--border)",
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>Email</div>
          <input className="platform-search" style={{ width: "100%", boxSizing: "border-box" }} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required type="email" />
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>Password (min 6)</div>
          <input className="platform-search" style={{ width: "100%", boxSizing: "border-box" }} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required type="password" minLength={6} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>Role</div>
          <select
            className="platform-search"
            style={{ width: "100%", boxSizing: "border-box" }}
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as typeof newRole)}
          >
            <option value="manager">manager</option>
            <option value="executive">executive</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <button type="submit" className="platform-chip active" disabled={busy} style={{ cursor: "pointer" }}>
          Add user
        </button>
      </form>

      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--border)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: "left", background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>
              <th style={{ padding: "10px 12px" }}>ID</th>
              <th style={{ padding: "10px 12px" }}>Email</th>
              <th style={{ padding: "10px 12px" }}>Role</th>
              <th style={{ padding: "10px 12px" }}>Active</th>
              <th style={{ padding: "10px 12px" }}>Projects</th>
              <th style={{ padding: "10px 12px" }} />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 12px", fontFamily: "'DM Mono',monospace" }}>{u.id}</td>
                <td style={{ padding: "10px 12px" }}>{u.email}</td>
                <td style={{ padding: "10px 12px" }}>{u.role}</td>
                <td style={{ padding: "10px 12px" }}>{u.is_active ? "yes" : "no"}</td>
                <td style={{ padding: "10px 12px", fontFamily: "'DM Mono',monospace", fontSize: 11 }}>
                  {u.project_ids.length ? u.project_ids.join(", ") : "—"}
                </td>
                <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                  <button type="button" className="platform-chip" style={{ cursor: "pointer", marginRight: 8 }} onClick={() => void toggleActive(u)}>
                    {u.is_active ? "Disable" : "Enable"}
                  </button>
                  <button type="button" className="platform-chip active" style={{ cursor: "pointer" }} onClick={() => openProjectEditor(u)}>
                    Assign projects
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
                Select projects for this manager. Executive and admin roles ignore this list for data access.
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
