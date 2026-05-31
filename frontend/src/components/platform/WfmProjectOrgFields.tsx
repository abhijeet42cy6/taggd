import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  regionalHeadLabelFromUser,
  type RegionalHeadCandidate,
  type WfmOrgMetadataDraft,
} from "@/lib/wfm-org-metadata";

export function WfmProjectOrgFields({
  draft,
  onChange,
  users,
  loadingUsers,
  disabled,
}: {
  draft: WfmOrgMetadataDraft;
  onChange: (patch: Partial<WfmOrgMetadataDraft>) => void;
  users: RegionalHeadCandidate[];
  loadingUsers: boolean;
  disabled?: boolean;
}) {
  const [userSearch, setUserSearch] = React.useState("");

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const label = regionalHeadLabelFromUser(u).toLowerCase();
      return label.includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
    });
  }, [users, userSearch]);

  return (
    <>
      <div className="ncp-prop-row">
        <div className="ncp-prop-label">Region</div>
        <input
          className="ncp-prop-input"
          placeholder="e.g. West, Middle East"
          value={draft.region}
          onChange={(e) => onChange({ region: e.target.value })}
          disabled={disabled}
        />
      </div>

      <div className="ncp-prop-row" style={{ alignItems: "flex-start" }}>
        <div className="ncp-prop-label" style={{ paddingTop: 8 }}>
          Regional head
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button
              type="button"
              className={cn("ncp-flow-pill", draft.regionalHeadMode === "user" && "ncp-flow-pill--active")}
              onClick={() => onChange({ regionalHeadMode: "user" })}
              disabled={disabled}
            >
              Platform user
            </button>
            <button
              type="button"
              className={cn("ncp-flow-pill", draft.regionalHeadMode === "custom" && "ncp-flow-pill--active")}
              onClick={() => onChange({ regionalHeadMode: "custom" })}
              disabled={disabled}
            >
              Custom name
            </button>
          </div>

          {draft.regionalHeadMode === "user" ? (
            <>
              <input
                type="search"
                className="ncp-prop-input"
                placeholder="Search users…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                disabled={disabled || loadingUsers}
              />
              <div
                className="ncp-dd-scroll"
                style={{
                  maxHeight: 160,
                  border: "1px solid var(--ncp-border)",
                  borderRadius: "var(--ncp-radius)",
                  background: "var(--ncp-bg-card)",
                }}
              >
                {loadingUsers ? (
                  <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--ncp-text-muted)" }}>Loading users…</div>
                ) : filteredUsers.length === 0 ? (
                  <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--ncp-text-muted)" }}>
                    No users match — switch to custom name.
                  </div>
                ) : (
                  filteredUsers.map((u) => {
                    const label = regionalHeadLabelFromUser(u);
                    const selected = draft.regionalHeadUserId === u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        className={cn("ncp-project-opt", selected && "ncp-selected")}
                        style={{ width: "100%", borderRadius: 0, border: "none", borderBottom: "1px solid var(--ncp-border)" }}
                        onClick={() => onChange({ regionalHeadUserId: u.id, regionalHeadCustom: "" })}
                        disabled={disabled}
                      >
                        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ncp-text-primary)" }}>{label}</span>
                          <span style={{ fontSize: 10, color: "var(--ncp-text-muted)" }}>
                            {u.email} · {u.role.replace(/_/g, " ")}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <input
              className="ncp-prop-input"
              placeholder="e.g. Baljeet Singh"
              value={draft.regionalHeadCustom}
              onChange={(e) => onChange({ regionalHeadCustom: e.target.value, regionalHeadUserId: "" })}
              disabled={disabled}
            />
          )}
        </div>
      </div>

      <div className="ncp-prop-row">
        <div className="ncp-prop-label">Practice head</div>
        <input
          className="ncp-prop-input"
          placeholder="Account practice leader"
          value={draft.practiceHead}
          onChange={(e) => onChange({ practiceHead: e.target.value })}
          disabled={disabled}
        />
      </div>

      <div className="ncp-prop-row">
        <div className="ncp-prop-label">Function head</div>
        <input
          className="ncp-prop-input"
          placeholder="Function / FH from directory"
          value={draft.functionHead}
          onChange={(e) => onChange({ functionHead: e.target.value })}
          disabled={disabled}
        />
      </div>
    </>
  );
}
