import React from "react";
import { cn } from "@/lib/utils";
import { UserPickerDropdown, type PlatformUserLite } from "@/components/platform/NewContractOrgFlow";
import type { RegionalHeadCandidate, WfmOrgMetadataDraft } from "@/lib/wfm-org-metadata";

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
  const platformUsers: PlatformUserLite[] = users;

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

      <div className="ncp-prop-row">
        <div className="ncp-prop-label">Regional head</div>
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
            <UserPickerDropdown
              value={draft.regionalHeadUserId === "" ? "" : String(draft.regionalHeadUserId)}
              onChange={(v) =>
                onChange({
                  regionalHeadMode: "user",
                  regionalHeadUserId: v ? parseInt(v, 10) : "",
                  regionalHeadCustom: "",
                })
              }
              users={platformUsers}
              placeholder={loadingUsers ? "Loading users…" : "— Optional —"}
              disabled={disabled || loadingUsers}
            />
          ) : (
            <input
              className="ncp-prop-input"
              placeholder="e.g. Baljeet Singh"
              value={draft.regionalHeadCustom}
              onChange={(e) =>
                onChange({
                  regionalHeadMode: "custom",
                  regionalHeadCustom: e.target.value,
                  regionalHeadUserId: "",
                })
              }
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
