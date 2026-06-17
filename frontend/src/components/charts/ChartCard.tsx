import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CARD_STYLE, CHART_HEIGHT } from "./chartTokens";
import { ChartSkeleton } from "./ChartSkeleton";
import { EmptyChartState } from "./EmptyChartState";

export function ChartCard({
  title,
  caption,
  height = CHART_HEIGHT.lg,
  loading,
  empty,
  emptyMessage = "No data available",
  zoomHint,
  variant = "default",
  children,
  className,
}: {
  title?: string;
  caption?: string;
  height?: number;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  zoomHint?: string;
  variant?: "default" | "gaugeGradient";
  children?: ReactNode;
  className?: string;
}) {
  const isGauge = variant === "gaugeGradient";

  return (
    <div
      className={cn("chart-card", className)}
      style={{
        borderRadius: CARD_STYLE.borderRadius,
        boxShadow: isGauge ? "0 10px 40px rgba(0,0,0,0.12)" : CARD_STYLE.boxShadow,
        border: CARD_STYLE.border,
        padding: 16,
        background: isGauge
          ? "linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)"
          : "#fff",
        color: isGauge ? "#fff" : undefined,
        height: "100%",
      }}
    >
      {title ? (
        <div
          style={{
            fontSize: "0.875rem",
            fontWeight: 700,
            color: isGauge ? "#fff" : "#334155",
            marginBottom: 4,
          }}
        >
          {title}
        </div>
      ) : null}
      {caption ? (
        <div
          style={{
            fontSize: "0.75rem",
            color: isGauge ? "rgba(255,255,255,0.85)" : "#94a3b8",
            marginBottom: 12,
          }}
        >
          {caption}
        </div>
      ) : null}
      {loading ? (
        <ChartSkeleton height={height} />
      ) : empty ? (
        <EmptyChartState height={height} message={emptyMessage} light={isGauge} />
      ) : (
        children
      )}
      {zoomHint && !loading && !empty ? (
        <div
          style={{
            fontSize: "0.75rem",
            color: isGauge ? "rgba(255,255,255,0.75)" : "#94a3b8",
            marginTop: 8,
          }}
        >
          {zoomHint}
        </div>
      ) : null}
    </div>
  );
}

export const ZOOM_HINT_COPY =
  "Wheel or pinch to zoom the window; horizontal wheel / drag to scroll along the timeline. Charts share the same visible range. Use the toolbox reset icon to show the full range again.";
