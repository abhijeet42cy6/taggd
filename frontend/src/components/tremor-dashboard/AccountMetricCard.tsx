import type { ReactNode } from "react";
import { Card, Metric, Text } from "@tremor/react";
import { cn } from "@/lib/utils";

export type AccountMetricDecoration = "orange" | "amber" | "teal" | "blue" | "emerald" | "rose";

const METRIC_SKIN: Record<
  AccountMetricDecoration,
  {
    cardGradient: string;
    topWash: string;
    pillWrap: string;
    pillText: string;
    border: string;
  }
> = {
  orange: {
    cardGradient: "from-white via-white to-orange-50/[0.35]",
    topWash: "from-orange-100/25",
    pillWrap: "bg-orange-100 ring-orange-200/60",
    pillText: "text-orange-900",
    border: "border-orange-500",
  },
  amber: {
    cardGradient: "from-white via-white to-amber-50/[0.35]",
    topWash: "from-amber-100/25",
    pillWrap: "bg-amber-100 ring-amber-200/60",
    pillText: "text-amber-950",
    border: "border-amber-500",
  },
  teal: {
    cardGradient: "from-white via-white to-teal-50/[0.35]",
    topWash: "from-teal-100/25",
    pillWrap: "bg-teal-100 ring-teal-200/60",
    pillText: "text-teal-950",
    border: "border-teal-500",
  },
  blue: {
    cardGradient: "from-white via-white to-blue-50/[0.35]",
    topWash: "from-blue-100/25",
    pillWrap: "bg-blue-100 ring-blue-200/60",
    pillText: "text-blue-950",
    border: "border-blue-500",
  },
  emerald: {
    cardGradient: "from-white via-white to-emerald-50/[0.35]",
    topWash: "from-emerald-100/25",
    pillWrap: "bg-emerald-100 ring-emerald-200/60",
    pillText: "text-emerald-950",
    border: "border-emerald-500",
  },
  rose: {
    cardGradient: "from-white via-white to-rose-50/[0.35]",
    topWash: "from-rose-100/25",
    pillWrap: "bg-rose-100 ring-rose-200/60",
    pillText: "text-rose-950",
    border: "border-rose-500",
  },
};

export function platformAccentToDecoration(
  accent: "blue" | "teal" | "green" | "red" | "amber" | "orange" | "indigo",
): AccountMetricDecoration {
  switch (accent) {
    case "teal":
      return "teal";
    case "green":
      return "emerald";
    case "amber":
      return "amber";
    case "orange":
      return "orange";
    case "red":
      return "rose";
    case "indigo":
      return "blue";
    default:
      return "blue";
  }
}

function hintTone(hint?: string): "emerald" | "rose" | "amber" | "slate" {
  if (!hint) return "slate";
  const h = hint.toLowerCase();
  if (hint.startsWith("▲") || h.includes("placed") || h.includes("normal")) return "emerald";
  if (hint.startsWith("▼") || h.includes("high") || h.includes("⚠")) return "rose";
  return "slate";
}

export function ClientMetricGrid({
  count,
  children,
  className,
}: {
  count: 4 | 6;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "exec-dash-tremor client-metric-grid",
        count === 6 ? "client-metric-grid--6" : "client-metric-grid--4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Compact executive-style KPI card for account / client detail views. */
export function AccountMetricCard({
  eyebrow,
  decorationColor = "blue",
  value,
  hint,
  subtext,
  footnote,
}: {
  eyebrow: string;
  decorationColor?: AccountMetricDecoration;
  value: ReactNode;
  hint?: string;
  subtext?: string;
  footnote?: string;
}) {
  const skin = METRIC_SKIN[decorationColor];
  const tremorDecoration =
    decorationColor === "emerald" ? "emerald" : decorationColor === "rose" ? "rose" : decorationColor;

  return (
    <Card
      decoration="left"
      decorationColor={tremorDecoration}
      className={cn(
        "client-metric-card exec-dash-tremor__hero-card relative bg-gradient-to-b p-4 shadow-tremor-card ring-1 ring-black/[0.04] sm:p-5",
        skin.cardGradient,
        skin.border,
        "border-l-4",
      )}
    >
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-16 overflow-hidden bg-gradient-to-b to-transparent", skin.topWash)} />
      <div className="client-metric-card__inner relative flex min-h-0 flex-col">
        <span className={cn("client-metric-card__eyebrow-wrap inline-flex max-w-full rounded-full px-2 py-0.5 ring-1", skin.pillWrap)}>
          <Text className={cn("client-metric-card__eyebrow font-bold uppercase tracking-wide", skin.pillText)}>{eyebrow}</Text>
        </span>
        <Metric className="client-metric-card__value mt-2 text-tremor-content-strong">{value}</Metric>
        {hint ? (
          <span
            className={cn(
              "client-metric-card__hint mt-2 w-full rounded-md px-2 py-1 font-medium",
              `client-metric-card__hint--${hintTone(hint)}`,
            )}
          >
            {hint}
          </span>
        ) : null}
        {subtext ? (
          <Text className="client-metric-card__subtext mt-2 text-xs font-medium text-tremor-content-subtle">{subtext}</Text>
        ) : null}
        {footnote ? (
          <Text className="client-metric-card__footnote mt-2 text-[11px] text-tremor-content-subtle">{footnote}</Text>
        ) : null}
      </div>
    </Card>
  );
}
