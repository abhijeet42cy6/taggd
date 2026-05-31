import React, { useEffect, useMemo, useState } from "react";
import { Button, Text, TextInput } from "@tremor/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminApi, invalidateCache, queries } from "@/lib/api";
import type { WfmBenchmarkRowVm } from "@/lib/view-models/wfm";
import {
  regionalHeadLabelFromUser,
  regionalHeadValueFromDraft,
  resolveRegionalHeadDraft,
  type RegionalHeadCandidate,
} from "@/lib/wfm-org-metadata";

export function WfmRegionalHeadAssignDialog({
  row,
  onClose,
  onSaved,
}: {
  row: WfmBenchmarkRowVm | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const open = row != null;
  const [users, setUsers] = useState<RegionalHeadCandidate[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [mode, setMode] = useState<"user" | "custom">("user");
  const [userId, setUserId] = useState<number | "">("");
  const [customName, setCustomName] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingUsers(true);
    Promise.all([
      queries.taskAssignableUsers().catch(() => []),
      adminApi.listUsers().catch(() => []),
    ])
      .then(([scoped, all]) => {
        if (cancelled) return;
        const map = new Map<number, RegionalHeadCandidate>();
        const add = (u: RegionalHeadCandidate) => map.set(u.id, u);
        scoped.forEach((u) => add(u as RegionalHeadCandidate));
        all.forEach((u) => add({ id: u.id, email: u.email, role: u.role }));
        setUsers([...map.values()].sort((a, b) => regionalHeadLabelFromUser(a).localeCompare(regionalHeadLabelFromUser(b))));
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !row) return;
    setError(null);
    setUserSearch("");
    const existing = (row.regional_head || "").trim();
    const regional = resolveRegionalHeadDraft(existing, users);
    setMode(regional.mode);
    setUserId(regional.userId);
    setCustomName(regional.customName);
  }, [open, row, users]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const label = regionalHeadLabelFromUser(u).toLowerCase();
      return label.includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
    });
  }, [users, userSearch]);

  async function handleSave() {
    if (!row?.project_id) return;
    setError(null);
    let value = "";
    if (mode === "user") {
      const resolved = regionalHeadValueFromDraft("user", userId, "", users);
      if (!resolved) {
        setError("Select a platform user or switch to custom name.");
        return;
      }
      value = resolved;
    } else {
      value = customName.trim();
      if (!value) {
        setError("Enter a regional head name.");
        return;
      }
    }
    setSaving(true);
    try {
      await queries.patchProjectMetadata(row.project_id, { regional_head: value });
      invalidateCache("wfm/");
      await onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!row?.project_id) return;
    if (!window.confirm("Clear regional head for this client?")) return;
    setSaving(true);
    setError(null);
    try {
      await queries.patchProjectMetadata(row.project_id, { regional_head: "" });
      invalidateCache("wfm/");
      await onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setSaving(false);
    }
  }

  const accountLabel = row?.account_name || (row?.project_id ? `Project ${row.project_id}` : "Client");

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="flex max-h-[min(90dvh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b border-tremor-border px-4 py-3">
          <DialogTitle className="text-base font-semibold text-tremor-content-strong">Assign regional head</DialogTitle>
          <DialogDescription className="text-xs text-tremor-content-subtle">
            {accountLabel}
            {row?.region ? ` · ${row.region}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                mode === "user"
                  ? "border-orange-400 bg-orange-50 text-orange-800 dark:border-orange-500 dark:bg-orange-950/40 dark:text-orange-200"
                  : "border-tremor-border text-tremor-content-subtle hover:border-orange-200"
              }`}
              onClick={() => setMode("user")}
              disabled={saving}
            >
              Platform user
            </button>
            <button
              type="button"
              className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                mode === "custom"
                  ? "border-orange-400 bg-orange-50 text-orange-800 dark:border-orange-500 dark:bg-orange-950/40 dark:text-orange-200"
                  : "border-tremor-border text-tremor-content-subtle hover:border-orange-200"
              }`}
              onClick={() => setMode("custom")}
              disabled={saving}
            >
              Custom name
            </button>
          </div>

          {mode === "user" ? (
            <div className="space-y-2">
              <Text className="text-[11px] text-tremor-content-subtle">
                Pick an active user. Stored as their display name on the project record.
              </Text>
              <TextInput
                placeholder="Search users…"
                value={userSearch}
                onValueChange={setUserSearch}
                disabled={saving || loadingUsers}
              />
              <div className="max-h-52 overflow-y-auto rounded-md border border-tremor-border bg-white dark:bg-dark-tremor-background-default">
                {loadingUsers ? (
                  <Text className="p-3 text-xs text-tremor-content-subtle">Loading users…</Text>
                ) : filteredUsers.length === 0 ? (
                  <Text className="p-3 text-xs text-tremor-content-subtle">
                    No users match. Use custom name if they are not on the platform.
                  </Text>
                ) : (
                  filteredUsers.map((u) => {
                    const label = regionalHeadLabelFromUser(u);
                    const selected = userId === u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        className={`flex w-full flex-col items-start gap-0.5 border-b border-tremor-border px-3 py-2 text-left last:border-b-0 ${
                          selected ? "bg-orange-50 dark:bg-orange-950/30" : "hover:bg-orange-50/50 dark:hover:bg-orange-950/20"
                        }`}
                        onClick={() => setUserId(u.id)}
                        disabled={saving}
                      >
                        <span className="text-xs font-medium text-tremor-content-strong">{label}</span>
                        <span className="text-[10px] text-tremor-content-subtle">
                          {u.email} · {u.role.replace(/_/g, " ")}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Text className="text-[11px] text-tremor-content-subtle">
                Enter the regional leader name when they are not a platform user.
              </Text>
              <TextInput
                placeholder="e.g. Baljeet Singh"
                value={customName}
                onValueChange={setCustomName}
                disabled={saving}
              />
            </div>
          )}

          {error ? (
            <Text className="text-xs text-rose-600" role="alert">
              {error}
            </Text>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-tremor-border bg-muted/50 px-4 py-3">
          {(row?.regional_head || "").trim() ? (
            <Button type="button" variant="light" color="rose" size="xs" disabled={saving} onClick={() => void handleClear()}>
              Clear
            </Button>
          ) : (
            <span className="min-w-0" aria-hidden />
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="xs" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" size="xs" color="orange" disabled={saving} loading={saving} onClick={() => void handleSave()}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
