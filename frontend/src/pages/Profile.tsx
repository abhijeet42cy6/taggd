import React, { useCallback, useEffect, useMemo, useState } from "react";
import { queries, type Project, authProfileApi } from "@/lib/api";
import {
  displayNameFromUser,
  initialsFromUser,
  useAuth,
  type AuthUser,
} from "@/lib/auth";
import { VERTICAL_MODULES } from "@/pages/AdminUsers";
import { PageHeader, PlatformSection } from "@/components/platform/PlatformBlocks";
import { UserAvatarImg } from "@/components/UserAvatarImg";

const verticalLabel = (key: string) =>
  VERTICAL_MODULES.find((m) => m.key.toLowerCase() === key.toLowerCase())?.label ?? key;

export function Profile() {
  const { user, refreshMe, projectIds } = useAuth();
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [avatarBusy, setAvatarBusy] = useState(false);

  useEffect(() => {
    setGivenName((user?.givenName ?? "").trim());
    setFamilyName((user?.familyName ?? "").trim());
    setPhone((user?.phone ?? "").trim());
  }, [user?.givenName, user?.familyName, user?.phone, user?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await queries.projects();
        if (!cancelled) setProjects(list);
      } catch {
        if (!cancelled) setProjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scopedProjects = useMemo(() => {
    if (!projectIds || projectIds.length === 0) return [];
    const set = new Set(projectIds);
    return projects.filter((p) => set.has(p.id));
  }, [projects, projectIds]);

  const permissionsLines = useMemo(() => {
    if (!user) return [];
    const er = user.effectiveRole ?? user.role;
    const lines: string[] = [`Effective role: ${er}`];
    if (user.verticalAccess == null) {
      lines.push("Modules: all (not restricted by vertical list)");
    } else if (user.verticalAccess.length === 0) {
      lines.push("Modules: none in allow-list");
    } else {
      lines.push(`Modules: ${user.verticalAccess.map(verticalLabel).join(", ")}`);
    }
    if (projectIds == null) {
      lines.push("Projects: full org (not restricted to assignments)");
    } else if (projectIds.length === 0) {
      lines.push("Projects: none assigned");
    } else {
      lines.push(`Projects (${projectIds.length}): ${scopedProjects.map((p) => p.account_name || `PRJ-${p.id}`).join(", ") || projectIds.map((id) => `#${id}`).join(", ")}`);
    }
    if (user.managerUserId != null) {
      lines.push(`Reports to user id: ${user.managerUserId}`);
    }
    if (user.isReadOnly) {
      lines.push("Account type: read-only client portal (business data cannot be changed; profile can be edited)");
    }
    return lines;
  }, [user, projectIds, scopedProjects]);

  const onSaveProfile = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await authProfileApi.patchProfile({
        given_name: givenName.trim() || null,
        family_name: familyName.trim() || null,
        phone: phone.trim() || null,
      });
      await refreshMe();
      setMsg("Profile saved.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [user, givenName, familyName, phone, refreshMe]);

  const onAvatar = useCallback(
    async (file: File | null) => {
      if (!user) return;
      setAvatarBusy(true);
      setErr(null);
      setMsg(null);
      try {
        if (!file) return;
        await authProfileApi.postAvatar(file);
        await refreshMe();
        setMsg("Photo updated.");
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setAvatarBusy(false);
      }
    },
    [user, refreshMe],
  );

  const onRemoveAvatar = useCallback(async () => {
    if (!user) return;
    setAvatarBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await authProfileApi.deleteAvatar();
      await refreshMe();
      setMsg("Photo removed.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setAvatarBusy(false);
    }
  }, [user, refreshMe]);

  const initialsEl = (u: AuthUser) => (
    <div
      style={{
        width: 96,
        height: 96,
        borderRadius: 12,
        background: "linear-gradient(135deg, var(--accent), var(--accent2))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 28,
        fontWeight: 700,
        color: "#fff",
      }}
    >
      {initialsFromUser(u)}
    </div>
  );

  if (!user) return null;

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 720 }}>
      <PageHeader title="My profile" subtitle="Your display details and a read-only summary of your access." />

      {err ? (
        <div className="platform-dialog__alert" style={{ margin: 0 }}>
          {err}
        </div>
      ) : null}
      {msg ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
          {msg}
        </div>
      ) : null}

      <PlatformSection title="Photo">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
          <UserAvatarImg
            userId={user.id}
            hasAvatar={user.hasAvatar}
            fallback={initialsEl(user)}
            size={96}
            borderRadius={12}
          />
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 11 }}>
              <span style={{ color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Upload (JPEG, PNG, WebP, max 2MB)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={avatarBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onAvatar(f);
                }}
              />
            </label>
            {user.hasAvatar ? (
              <button
                type="button"
                className="platform-dialog__btn"
                disabled={avatarBusy}
                onClick={() => void onRemoveAvatar()}
              >
                Remove photo
              </button>
            ) : null}
          </div>
        </div>
      </PlatformSection>

      <PlatformSection title="Contact">
        <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>Email (read-only)</div>
            <div style={{ fontSize: 13 }}>{user.email}</div>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Given name</span>
            <input className="platform-search" value={givenName} onChange={(e) => setGivenName(e.target.value)} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Family name</span>
            <input className="platform-search" value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Phone</span>
            <input className="platform-search" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <div>
            <button
              type="button"
              className="platform-dialog__btn platform-dialog__btn--primary"
              disabled={saving}
              onClick={() => void onSaveProfile()}
            >
              {saving ? "Saving…" : "Save details"}
            </button>
          </div>
        </div>
      </PlatformSection>

      <PlatformSection title="Permissions (read-only)">
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
          Role, modules, and project scope are managed by a platform administrator. Display name in the shell:{" "}
          <strong>{displayNameFromUser(user)}</strong>
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.65 }}>
          {permissionsLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </PlatformSection>
    </div>
  );
}
