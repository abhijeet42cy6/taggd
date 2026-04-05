export function dataOpsVm(projects: any[], records: any[]) {
  const splitMap = new Map<string, number>();
  for (const p of projects || []) {
    if (!p.account_name) continue;
    splitMap.set(p.account_name, (splitMap.get(p.account_name) || 0) + 1);
  }
  const splitClients = Array.from(splitMap.entries()).filter(([, c]) => c > 1);

  const dupMap = new Map<string, number>();
  for (const r of records || []) {
    const key = `${r.project_id}|${r.position_title}|${r.candidate_name || ""}`;
    dupMap.set(key, (dupMap.get(key) || 0) + 1);
  }
  const duplicateSignals = Array.from(dupMap.entries()).filter(([, c]) => c > 1).slice(0, 20);

  return { splitClients, duplicateSignals };
}

