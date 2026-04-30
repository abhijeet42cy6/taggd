import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Flex,
  Text,
  TextInput,
  Title,
} from "@tremor/react";
import { queries, type Project, authProfileApi } from "@/lib/api";
import {
  displayNameFromUser,
  initialsFromUser,
  useAuth,
  type AuthUser,
} from "@/lib/auth";
import { VERTICAL_MODULES } from "@/pages/AdminUsers";
import { UserAvatarImg } from "@/components/UserAvatarImg";
import { cn } from "@/lib/utils";

const flatCard =
  "overflow-hidden border-0 p-0 shadow-tremor-card ring-1 ring-tremor-ring dark:bg-dark-tremor-background dark:shadow-dark-tremor-card dark:ring-dark-tremor-ring";

const verticalLabel = (key: string) =>
  VERTICAL_MODULES.find((m) => m.key.toLowerCase() === key.toLowerCase())?.label ?? key;

function ReadonlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4">
      <Text className="w-full shrink-0 text-xs font-medium text-tremor-content-subtle sm:w-36">{label}</Text>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

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
  const avatarFileRef = useRef<HTMLInputElement>(null);

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
    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-teal-600 text-2xl font-bold text-white shadow-tremor-card">
      {initialsFromUser(u)}
    </div>
  );

  if (!user) return null;

  const effectiveRole = user.effectiveRole ?? user.role;
  const showLegacyRole = user.effectiveRole != null && user.effectiveRole !== user.role;

  return (
    <div className="profile-tremor space-y-4 pb-10 md:space-y-5">
      <div className="flex w-full min-w-0 flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-600">Account</span>
        <Title className="text-2xl font-bold tracking-tight text-tremor-content-strong md:text-3xl">My profile</Title>
        <Text className="max-w-2xl text-sm leading-relaxed text-tremor-content-emphasis">
          Your display name, contact details, and a read-only summary of workspace access. Permissions are assigned by an
          administrator.
        </Text>
      </div>

      {err ? (
        <Card
          decoration="top"
          decorationColor="rose"
          className="border-0 p-3 shadow-tremor-card ring-1 ring-rose-200 dark:bg-dark-tremor-background dark:ring-rose-900/40"
        >
          <Text className="text-sm text-rose-800 dark:text-rose-100">{err}</Text>
        </Card>
      ) : null}
      {msg ? (
        <Card
          decoration="top"
          decorationColor="emerald"
          className="border-0 p-3 shadow-tremor-card ring-1 ring-emerald-200 dark:bg-dark-tremor-background dark:ring-emerald-900/40"
        >
          <Text className="text-sm text-emerald-900 dark:text-emerald-100">{msg}</Text>
        </Card>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <Card className={cn(flatCard, "w-full shrink-0 lg:max-w-[17.5rem]")}>
          <div className="border-b border-tremor-border px-4 py-3 dark:border-dark-tremor-border">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-tremor-content-subtle">Photo</Text>
            <Title className="mt-0.5 text-sm font-semibold text-tremor-content-strong">Profile image</Title>
          </div>
          <div className="flex flex-col items-center gap-4 px-4 py-5">
            <UserAvatarImg
              userId={user.id}
              hasAvatar={user.hasAvatar}
              fallback={initialsEl(user)}
              size={96}
              borderRadius={12}
            />
            <Text className="text-center text-xs text-tremor-content-subtle">JPEG, PNG, or WebP · max 2MB</Text>
            <input
              ref={avatarFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={avatarBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onAvatar(f);
              }}
            />
            <Flex className="w-full flex-col gap-2 sm:flex-row sm:justify-center">
              <Button
                type="button"
                size="xs"
                variant="secondary"
                disabled={avatarBusy}
                className="w-full sm:w-auto"
                onClick={() => avatarFileRef.current?.click()}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Upload size={14} strokeWidth={2} aria-hidden />
                  Upload photo
                </span>
              </Button>
              {user.hasAvatar ? (
                <Button
                  type="button"
                  size="xs"
                  variant="light"
                  color="slate"
                  disabled={avatarBusy}
                  className="w-full sm:w-auto"
                  onClick={() => void onRemoveAvatar()}
                >
                  Remove photo
                </Button>
              ) : null}
            </Flex>
          </div>
        </Card>

        <div className="min-w-0 flex-1 space-y-4">
          <Card className={flatCard} aria-labelledby="profile-contact-heading">
            <div className="border-b border-tremor-border px-4 py-3 dark:border-dark-tremor-border">
              <Title id="profile-contact-heading" className="text-base font-semibold text-tremor-content-strong">
                Contact
              </Title>
              <Text className="mt-0.5 text-xs text-tremor-content-subtle">Editable fields sync to your sign-in identity.</Text>
            </div>
            <div className="space-y-0 px-4 py-2">
              <ReadonlyField label="Email">
                <Text className="break-all text-sm tabular-nums text-tremor-content-strong">{user.email}</Text>
              </ReadonlyField>
              <div className="space-y-1 border-b border-tremor-border py-3 dark:border-dark-tremor-border">
                <Text className="text-xs font-medium text-tremor-content-subtle">Given name</Text>
                <TextInput
                  value={givenName}
                  onValueChange={setGivenName}
                  placeholder="Given name"
                  autoComplete="given-name"
                  aria-label="Given name"
                />
              </div>
              <div className="space-y-1 border-b border-tremor-border py-3 dark:border-dark-tremor-border">
                <Text className="text-xs font-medium text-tremor-content-subtle">Family name</Text>
                <TextInput
                  value={familyName}
                  onValueChange={setFamilyName}
                  placeholder="Family name"
                  autoComplete="family-name"
                  aria-label="Family name"
                />
              </div>
              <div className="space-y-1 py-3">
                <Text className="text-xs font-medium text-tremor-content-subtle">Phone</Text>
                <TextInput
                  value={phone}
                  onValueChange={setPhone}
                  placeholder="Phone"
                  autoComplete="tel"
                  inputMode="tel"
                  aria-label="Phone"
                />
              </div>
            </div>
            <div className="border-t border-tremor-border px-4 py-3 dark:border-dark-tremor-border">
              <Button
                type="button"
                size="xs"
                variant="primary"
                color="orange"
                disabled={saving}
                onClick={() => void onSaveProfile()}
              >
                {saving ? "Saving…" : "Save details"}
              </Button>
            </div>
          </Card>

          <Card className={flatCard} aria-labelledby="profile-access-heading">
            <div className="border-b border-tremor-border px-4 py-3 dark:border-dark-tremor-border">
              <Title id="profile-access-heading" className="text-base font-semibold text-tremor-content-strong">
                Access & permissions
              </Title>
            </div>
            <div className="space-y-4 px-4 py-4">
              <div className="rounded-tremor-default border-l-4 border-orange-500 bg-orange-50/80 px-3 py-2.5 dark:border-orange-400 dark:bg-orange-950/30">
                <Text className="text-xs font-semibold text-tremor-content-strong">Read-only summary</Text>
                <Text className="mt-1 text-xs leading-relaxed text-tremor-content-emphasis">
                  Role, module access, and project scope are managed by a platform administrator. Use this section to verify what
                  is active for your sign-in.
                </Text>
              </div>

              <div className="divide-y divide-tremor-border dark:divide-dark-tremor-border">
                <ReadonlyField label="Display name">
                  <Text className="text-sm font-medium text-tremor-content-strong">{displayNameFromUser(user)}</Text>
                </ReadonlyField>
                <ReadonlyField label="User ID">
                  <Text className="text-sm tabular-nums text-tremor-content-emphasis">{user.id}</Text>
                </ReadonlyField>
                <ReadonlyField label="Effective role">
                  <Badge color="orange" size="xs">
                    {effectiveRole}
                  </Badge>
                </ReadonlyField>
                {showLegacyRole ? (
                  <ReadonlyField label="Stored role">
                    <Text className="text-sm tabular-nums text-tremor-content-emphasis">{user.role}</Text>
                  </ReadonlyField>
                ) : null}
                <ReadonlyField label="Modules">
                  {user.verticalAccess == null ? (
                    <Badge color="orange" size="xs">
                      All modules
                    </Badge>
                  ) : user.verticalAccess.length === 0 ? (
                    <Badge color="slate" size="xs">
                      None (empty allow-list)
                    </Badge>
                  ) : (
                    <Flex className="flex-wrap gap-1.5">
                      {user.verticalAccess.map((k) => (
                        <Badge key={k} color="slate" size="xs">
                          {verticalLabel(k)}
                        </Badge>
                      ))}
                    </Flex>
                  )}
                </ReadonlyField>
                <ReadonlyField label="Projects">
                  <Text className="text-sm leading-relaxed text-tremor-content-emphasis">{projectsSummary}</Text>
                </ReadonlyField>
                {user.managerUserId != null ? (
                  <ReadonlyField label="Reports to">
                    <Text className="text-sm tabular-nums text-tremor-content-emphasis">User #{user.managerUserId}</Text>
                  </ReadonlyField>
                ) : null}
                {user.isReadOnly ? (
                  <ReadonlyField label="Portal mode">
                    <div>
                      <Badge color="amber" size="xs">
                        Read-only client portal
                      </Badge>
                      <Text className="mt-2 text-xs leading-relaxed text-tremor-content-subtle">
                        Business data cannot be changed from this account; you can still update your profile and photo.
                      </Text>
                    </div>
                  </ReadonlyField>
                ) : null}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
