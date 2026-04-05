import type { Project } from "@/lib/api";

export type ClientVm = {
  client: string;
  projectIds: number[];
  projects: Project[];
  split: boolean;
};

export function clientsVm(projects: Project[]): ClientVm[] {
  const map = new Map<string, Project[]>();
  for (const p of projects || []) {
    const key = (p.account_name || p.filename?.replace(".xlsx", "") || `Project-${p.id}`).trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return Array.from(map.entries())
    .map(([client, ps]) => ({ client, projects: ps, projectIds: ps.map((p) => p.id), split: ps.length > 1 }))
    .sort((a, b) => b.projects.length - a.projects.length);
}

