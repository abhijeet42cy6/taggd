export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div
      style={{
        width: "100%",
        height,
        borderRadius: 4,
        background: "linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)",
        backgroundSize: "200% 100%",
        animation: "chartSkeletonShimmer 1.2s ease-in-out infinite",
      }}
    />
  );
}
