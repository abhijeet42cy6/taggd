import type { ECharts } from "echarts/core";

type SyncEntry = {
  chart: ECharts;
  handler: () => void;
};

const groups = new Map<string, Set<SyncEntry>>();

export function registerDataZoomSync(groupId: string, chart: ECharts): () => void {
  if (!groupId) return () => undefined;

  const handler = () => {
    const option = chart.getOption();
    const dz = option.dataZoom as { start?: number; end?: number }[] | undefined;
    if (!dz?.length) return;
    const start = dz[0]?.start ?? 0;
    const end = dz[0]?.end ?? 100;

    const entries = groups.get(groupId);
    if (!entries) return;
    for (const entry of entries) {
      if (entry.chart === chart || entry.chart.isDisposed()) continue;
      entry.chart.dispatchAction({
        type: "dataZoom",
        start,
        end,
        dataZoomIndex: 0,
      });
    }
  };

  chart.on("datazoom", handler);

  const entry: SyncEntry = { chart, handler };
  if (!groups.has(groupId)) groups.set(groupId, new Set());
  groups.get(groupId)!.add(entry);

  return () => {
    chart.off("datazoom", handler);
    groups.get(groupId)?.delete(entry);
    if (groups.get(groupId)?.size === 0) groups.delete(groupId);
  };
}
