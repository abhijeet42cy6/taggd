export type RegionalHeadCandidate = {
  id: number;
  email: string;
  role: string;
  given_name?: string | null;
  family_name?: string | null;
};

export type RegionalHeadAssignMode = "user" | "custom";

export function regionalHeadLabelFromUser(
  u: Pick<RegionalHeadCandidate, "email" | "given_name" | "family_name">,
): string {
  const g = (u.given_name ?? "").trim();
  const f = (u.family_name ?? "").trim();
  if (g || f) return `${g} ${f}`.trim();
  const local = u.email.split("@")[0];
  return local || u.email;
}

export function resolveRegionalHeadDraft(
  existing: string,
  users: RegionalHeadCandidate[],
): { mode: RegionalHeadAssignMode; userId: number | ""; customName: string } {
  const trimmed = existing.trim();
  if (!trimmed) {
    return { mode: "user", userId: "", customName: "" };
  }
  const match = users.find(
    (u) =>
      regionalHeadLabelFromUser(u).toLowerCase() === trimmed.toLowerCase() ||
      u.email.toLowerCase() === trimmed.toLowerCase(),
  );
  if (match) {
    return { mode: "user", userId: match.id, customName: "" };
  }
  return { mode: "custom", userId: "", customName: trimmed };
}

export function regionalHeadValueFromDraft(
  mode: RegionalHeadAssignMode,
  userId: number | "",
  customName: string,
  users: RegionalHeadCandidate[],
): string | null {
  if (mode === "user") {
    const id = Number(userId);
    const user = Number.isFinite(id) && id > 0 ? users.find((u) => u.id === id) : null;
    if (!user) return null;
    return regionalHeadLabelFromUser(user);
  }
  const name = customName.trim();
  return name || null;
}

export type WfmOrgMetadataDraft = {
  region: string;
  practiceHead: string;
  functionHead: string;
  regionalHeadMode: RegionalHeadAssignMode;
  regionalHeadUserId: number | "";
  regionalHeadCustom: string;
};

export const emptyWfmOrgMetadataDraft = (): WfmOrgMetadataDraft => ({
  region: "",
  practiceHead: "",
  functionHead: "",
  regionalHeadMode: "user",
  regionalHeadUserId: "",
  regionalHeadCustom: "",
});

export function wfmOrgDraftFromSources(
  sources: {
    region?: string | null;
    practice_head?: string | null;
    function_head?: string | null;
    regional_head?: string | null;
  },
  users: RegionalHeadCandidate[],
): WfmOrgMetadataDraft {
  const regional = resolveRegionalHeadDraft(sources.regional_head ?? "", users);
  return {
    region: (sources.region ?? "").trim(),
    practiceHead: (sources.practice_head ?? "").trim(),
    functionHead: (sources.function_head ?? "").trim(),
    regionalHeadMode: regional.mode,
    regionalHeadUserId: regional.userId,
    regionalHeadCustom: regional.customName,
  };
}

export function wfmOrgMetadataPatchBody(
  draft: WfmOrgMetadataDraft,
  users: RegionalHeadCandidate[],
): {
  region?: string;
  practice_head?: string;
  function_head?: string;
  regional_head?: string;
} {
  const regional = regionalHeadValueFromDraft(
    draft.regionalHeadMode,
    draft.regionalHeadUserId,
    draft.regionalHeadCustom,
    users,
  );
  return {
    region: draft.region.trim() || "",
    practice_head: draft.practiceHead.trim() || "",
    function_head: draft.functionHead.trim() || "",
    regional_head: regional ?? "",
  };
}
