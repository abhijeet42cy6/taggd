import React, { useCallback, useEffect, useMemo, useState } from "react";
import { queries, type Project, authProfileApi } from "@/lib/api";
import {
  displayNameFromUser,
  initialsFromUser,
  useAuth,
  type AuthUser,
} from "@/lib/auth";
import { VERTICAL_MODULES } from "@/pages/AdminUsers";
import { UserAvatarImg } from "@/components/UserAvatarImg";
import "@/styles/profile-page.css";

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

  const projectsSummary = useMemo(() => {
    if (!user) return "";
    if (projectIds == null) return "Full org — not restricted to project assignments.";
    if (projectIds.length === 0) return "No projects assigned.";
    const names =
      scopedProjects.map((p) => p.account_name || `PRJ-${p.id}`).join(", ") ||
      projectIds.map((id) => `#${id}`).join(", ");
    return `${projectIds.length} project(s): ${names}`;
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

  const effectiveRole = user.effectiveRole ?? user.role;
  const showLegacyRole = user.effectiveRole != null && user.effectiveRole !== user.role;

  return (
    <div className="profile-page">
      <header className="profile-page__header">
        <div className="profile-page__eyebrow">Account</div>
        <h1 className="profile-page__title">My profile</h1>
        <p className="profile-page__lead">
          Your display name, contact details, and a read-only summary of workspace access. Permissions are assigned by an
          administrator.
        </p>
      </header>

      {err ? <div className="profile-page__alert">{err}</div> : null}
      {msg ? <div className="profile-page__flash">{msg}</div> : null}

      <div className="profile-page__grid">
        <aside className="profile-page__aside">
          <div className="profile-page__avatar-card">
            <span className="profile-page__avatar-label">Photo</span>
            <UserAvatarImg
              userId={user.id}
              hasAvatar={user.hasAvatar}
              fallback={initialsEl(user)}
              size={96}
              borderRadius={12}
            />
            <div className="profile-page__upload">
              <span className="profile-page__upload-hint">JPEG, PNG, or WebP · max 2MB</span>
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
        </aside>

        <div className="profile-page__main">
          <section className="profile-page__section" aria-labelledby="profile-contact-heading">
            <h2 id="profile-contact-heading" className="profile-page__section-title">
              Contact
            </h2>
            <div className="profile-page__field">
              <div className="profile-page__field-label">Email</div>
              <div className="profile-page__field-value profile-page__field-value--mono">{user.email}</div>
            </div>
            <div className="profile-page__field">
              <div className="profile-page__field-label">Given name</div>
              <div className="profile-page__field-value">
                <input
                  className="profile-page__input"
                  value={givenName}
                  onChange={(e) => setGivenName(e.target.value)}
                  autoComplete="given-name"
                />
              </div>
            </div>
            <div className="profile-page__field">
              <div className="profile-page__field-label">Family name</div>
              <div className="profile-page__field-value">
                <input
                  className="profile-page__input"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  autoComplete="family-name"
                />
              </div>
            </div>
            <div className="profile-page__field">
              <div className="profile-page__field-label">Phone</div>
              <div className="profile-page__field-value">
                <input
                  className="profile-page__input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                />
              </div>
            </div>
            <div className="profile-page__actions">
              <button
                type="button"
                className="platform-dialog__btn platform-dialog__btn--primary"
                disabled={saving}
                onClick={() => void onSaveProfile()}
              >
                {saving ? "Saving…" : "Save details"}
              </button>
            </div>
          </section>

          <hr className="profile-page__divider" />

          <section className="profile-page__section" aria-labelledby="profile-access-heading">
            <h2 id="profile-access-heading" className="profile-page__section-title">
              Access &amp; permissions
            </h2>
            <div className="profile-page__callout">
              <strong>Read-only summary</strong>
              Role, module access, and project scope are managed by a platform administrator. Use this section to verify what
              is active for your sign-in.
            </div>

            <div className="profile-page__field">
              <div className="profile-page__field-label">Display name</div>
              <div className="profile-page__field-value">{displayNameFromUser(user)}</div>
            </div>
            <div className="profile-page__field">
              <div className="profile-page__field-label">User ID</div>
              <div className="profile-page__field-value profile-page__field-value--mono">{user.id}</div>
            </div>
            <div className="profile-page__field">
              <div className="profile-page__field-label">Effective role</div>
              <div className="profile-page__field-value">
                <span className="profile-page__tag profile-page__tag--accent">{effectiveRole}</span>
              </div>
            </div>
            {showLegacyRole ? (
              <div className="profile-page__field">
                <div className="profile-page__field-label">Stored role</div>
                <div className="profile-page__field-value profile-page__field-value--mono">{user.role}</div>
              </div>
            ) : null}

            <div className="profile-page__field">
              <div className="profile-page__field-label">Modules</div>
              <div className="profile-page__field-value">
                {user.verticalAccess == null ? (
                  <span className="profile-page__tag profile-page__tag--accent">All modules</span>
                ) : user.verticalAccess.length === 0 ? (
                  <span className="profile-page__tag">None (empty allow-list)</span>
                ) : (
                  <div className="profile-page__tag-row">
                    {user.verticalAccess.map((k) => (
                      <span key={k} className="profile-page__tag">
                        {verticalLabel(k)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="profile-page__field">
              <div className="profile-page__field-label">Projects</div>
              <div className="profile-page__field-value profile-page__projects">{projectsSummary}</div>
            </div>

            {user.managerUserId != null ? (
              <div className="profile-page__field">
                <div className="profile-page__field-label">Reports to</div>
                <div className="profile-page__field-value profile-page__field-value--mono">User #{user.managerUserId}</div>
              </div>
            ) : null}

            {user.isReadOnly ? (
              <div className="profile-page__field">
                <div className="profile-page__field-label">Portal mode</div>
                <div className="profile-page__field-value">
                  <span className="profile-page__tag">Read-only client portal</span>
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                    Business data cannot be changed from this account; you can still update your profile and photo.
                  </p>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
