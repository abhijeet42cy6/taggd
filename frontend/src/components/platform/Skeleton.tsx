import React from "react";

/**
 * Shimmer skeleton — matches platform.html design tokens.
 * Usage:
 *   <Skeleton width="100%" height={88} radius={10} />
 *   <SkeletonKpiRow count={7} />
 *   <SkeletonTable rows={6} cols={5} />
 *   <SkeletonCard height={220} />
 */

const shimmerStyle: React.CSSProperties = {
  background: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 5%, transparent) 25%, color-mix(in srgb, var(--accent) 12%, transparent) 50%, color-mix(in srgb, var(--accent) 5%, transparent) 75%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.6s infinite",
  borderRadius: 8,
};

export function Skeleton({
  width = "100%",
  height = 16,
  radius = 6,
  style,
  className,
}: {
  width?: string | number;
  height?: number;
  radius?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        ...shimmerStyle,
        width,
        height,
        borderRadius: radius,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

export function SkeletonKpiRow({ count = 7 }: { count?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 10 }}>
      {Array(count).fill(0).map((_, i) => (
        <div key={i} className="platform-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton height={10} width="55%" />
          <Skeleton height={26} width="75%" radius={5} />
          <Skeleton height={8} width="40%" />
        </div>
      ))}
    </div>
  );
}

/** Tremor hero-card-shaped placeholders (client detail / exec-style KPI rows). */
export function SkeletonHeroKpiRow({ count = 4 }: { count?: number }) {
  const gridClass =
    count >= 6
      ? "client-metric-grid client-metric-grid--6"
      : count === 3
        ? "client-metric-grid client-metric-grid--4"
        : "client-metric-grid client-metric-grid--4";

  return (
    <div className={gridClass}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="client-metric-card relative min-w-0 rounded-tremor-default border-l-4 border-orange-500/25 bg-gradient-to-b from-white via-white to-orange-50/30 p-4 shadow-tremor-card ring-1 ring-black/[0.04] sm:p-5"
        >
          <Skeleton height={18} width="48%" radius={999} className="max-w-full opacity-80" />
          <Skeleton height={28} width="72%" radius={8} className="mt-3 max-w-full opacity-90" />
          <Skeleton height={14} width="100%" radius={6} className="mt-3 max-w-full opacity-70" />
          <Skeleton height={12} width="55%" radius={6} className="mt-3 max-w-full opacity-60" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* header */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
        {Array(cols).fill(0).map((_, i) => (
          <Skeleton key={i} height={10} width={`${80 + Math.random() * 40}px`} />
        ))}
      </div>
      {/* rows */}
      {Array(rows).fill(0).map((_, r) => (
        <div key={r} style={{ display: "flex", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
          {Array(cols).fill(0).map((_, c) => (
            <Skeleton key={c} height={11} width={`${50 + Math.random() * 80}px`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ height = 220 }: { height?: number }) {
  return (
    <div className="platform-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <Skeleton height={11} width="40%" />
      <Skeleton height={height - 40} radius={8} />
    </div>
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array(lines).fill(0).map((_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
}
