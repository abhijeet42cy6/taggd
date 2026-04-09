import type { ClientGroup, Project } from "@/lib/api";

export type ClientVm = {
  /** Legal client id (URL: /clients/:id) */
  id: number;
  /** Display name — Client.official_name */
  officialName: string;
  shortCode: string | null;
  /** Kept for labels / persona filter compatibility */
  client: string;
  projectIds: number[];
  projects: Project[];
  /** More than one SBU / project under this legal client */
  split: boolean;
};

/** Preferred: server-grouped clients from GET /clients. */
export function clientGroupsToVm(rows: ClientGroup[]): ClientVm[] {
  return (rows || []).map((r) => ({
    id: r.id,
    officialName: r.official_name,
    shortCode: r.short_code,
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
      client,
      projects: ps,
      projectIds: ps.map((p) => p.id),
      split: ps.length > 1,
    }))
    .sort((a, b) => b.projects.length - a.projects.length);
}
