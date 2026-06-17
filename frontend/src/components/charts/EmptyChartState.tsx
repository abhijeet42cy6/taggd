import { CHART_HEIGHT } from "./chartTokens";

export function EmptyChartState({
  height = CHART_HEIGHT.sm,
  message = "No data available",
  light = false,
}: {
  height?: number;
  message?: string;
  light?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height,
        color: light ? "rgba(255,255,255,0.75)" : "#94a3b8",
        fontSize: 14,
      }}
    >
      {message}
    </div>
  );
}
