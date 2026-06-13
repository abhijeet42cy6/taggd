import type { ClientGroup, Project } from "@/lib/api";

export type ClientVm = {
  /** Legal client id (URL: /clients/:id) */
  id: number;
  /** Display name — Client.official_name */
  officialName: string;
  shortCode: string | null;
  /** prospect | active (from GET /clients) */
  lifecycleState: string | null;
  /** Org directory tags on the legal client row */
  hierarchyTagBu?: string | null;
  hierarchyTagSbu?: string | null;
  hierarchyTagSbg?: string | null;
  hierarchyTagSbe?: string | null;
  /** Kept for labels / persona filter compatibility */
  client: string;
  projectIds: number[];
  projects: Project[];
  /** More than one SBU / project under this legal client */
  split: boolean;
};

export type ProjectTreeNode = {
  project: Project;
  children: ProjectTreeNode[];
};

/** Client > BU > SBU forest: roots are projects with no in-client parent; children nest by parent_project_id. */
export function projectForestForClient(projects: Project[]): ProjectTreeNode[] {
  const ids = new Set((projects || []).map((p) => p.id));
  const byParent = new Map<number, Project[]>();
  for (const p of projects || []) {
    const pid = p.parent_project_id;
    if (pid != null && ids.has(pid)) {
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid)!.push(p);
    }
  }
  const roots = (projects || [])
    .filter((p) => p.parent_project_id == null || !ids.has(p.parent_project_id))
    .sort((a, b) => a.id - b.id);
  function walk(pr: Project): ProjectTreeNode {
    const ch = (byParent.get(pr.id) ?? []).sort((a, b) => a.id - b.id);
    return { project: pr, children: ch.map(walk) };
  }
  return roots.map(walk);
}

function dashField(v: unknown): string {
  if (v == null) return "—";
  const s = String(v).trim();
  return s && s.toLowerCase() !== "nan" ? s : "—";
}

/** When all projects share the same value, show it; otherwise summarize variance. */
export function projectRollupText(
  projects: { region?: string | null; sub_region?: string | null; practice?: string | null; vertical?: string | null; account_status?: string | null; practice_head?: string | null; category?: string | null }[],
  pick: (p: (typeof projects)[number]) => string | null | undefined,
): string {
  if (!projects.length) return "—";
  const vals = [...new Set(projects.map((p) => dashField(pick(p))).filter((v) => v !== "—"))];
  if (vals.length === 0) return "—";
  if (vals.length === 1) return vals[0];
  return `${vals.length} values`;
}

/** Preferred: server-grouped clients from GET /clients. */
export function clientGroupsToVm(rows: ClientGroup[]): ClientVm[] {
  return (rows || []).map((r) => ({
    id: r.id,
    officialName: r.official_name,
    shortCode: r.short_code,
    lifecycleState: r.lifecycle_state ?? "active",
    hierarchyTagBu: r.hierarchy_tag_bu ?? null,
    hierarchyTagSbu: r.hierarchy_tag_sbu ?? null,
    hierarchyTagSbg: r.hierarchy_tag_sbg ?? null,
    hierarchyTagSbe: r.hierarchy_tag_sbe ?? null,
    client: r.official_name,
    projects: r.projects,
    projectIds: r.projects.map((p) => p.id),
    split: r.projects.length > 1,
  }));
}

/**
 * Legacy: derive “clients” by grouping flat /projects rows on account_name.
 * Use when API /clients is unavailable or for old bookmark URLs.
 */
export function clientsVm(projects: Project[]): ClientVm[] {
  const map = new Map<string, Project[]>();
  for (const p of projects || []) {
    const key = (
      p.client_official_name ||
      p.account_name ||
      p.filename?.replace(".xlsx", "") ||
      `Project-${p.id}`
    ).trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  let syntheticId = -1;
  return Array.from(map.entries())
    .map(([client, ps]) => ({
      id: syntheticId--,
      officialName: client,
      shortCode: null,
      lifecycleState: "active",
      client,
      projects: ps,
      projectIds: ps.map((p) => p.id),
      split: ps.length > 1,
    }))
    .sort((a, b) => b.projects.length - a.projects.length);
}
