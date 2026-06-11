import type { ReactNode } from "react";
import { Badge, Card, Flex, Metric, Text } from "@tremor/react";
import { cn } from "@/lib/utils";

export type WfmHeroDecoration =
  | "orange"
  | "amber"
  | "teal"
  | "blue"
  | "indigo"
  | "cyan"
  | "rose"
  | "slate"
  | "violet"
  | "fuchsia";

type HeroSkin = {
  decoration: WfmHeroDecoration;
  cardGradient: string;
  topWash: string;
  pillWrap: string;
  pillText: string;
};

const WFM_HERO_SKIN: Record<WfmHeroDecoration, HeroSkin> = {
  orange: {
    decoration: "orange",
    cardGradient: "from-white via-white to-orange-50/[0.35]",
    topWash: "from-orange-100/25",
    pillWrap: "bg-orange-100 ring-orange-200/60",
    pillText: "text-orange-900",
  },
  amber: {
    decoration: "amber",
    cardGradient: "from-white via-white to-amber-50/[0.35]",
    topWash: "from-amber-100/25",
    pillWrap: "bg-amber-100 ring-amber-200/60",
    pillText: "text-amber-950",
  },
  teal: {
    decoration: "teal",
    cardGradient: "from-white via-white to-teal-50/[0.35]",
    topWash: "from-teal-100/25",
    pillWrap: "bg-teal-100 ring-teal-200/60",
    pillText: "text-teal-950",
  },
  blue: {
    decoration: "blue",
    cardGradient: "from-white via-white to-blue-50/[0.35]",
    topWash: "from-blue-100/25",
    pillWrap: "bg-blue-100 ring-blue-200/60",
    pillText: "text-blue-950",
  },
  indigo: {
    decoration: "indigo",
    cardGradient: "from-white via-white to-indigo-50/[0.35]",
    topWash: "from-indigo-100/25",
    pillWrap: "bg-indigo-100 ring-indigo-200/60",
    pillText: "text-indigo-950",
  },
  cyan: {
    decoration: "cyan",
    cardGradient: "from-white via-white to-cyan-50/[0.35]",
    topWash: "from-cyan-100/25",
    pillWrap: "bg-cyan-100 ring-cyan-200/60",
    pillText: "text-cyan-950",
  },
  rose: {
    decoration: "rose",
    cardGradient: "from-white via-white to-rose-50/[0.35]",
    topWash: "from-rose-100/25",
    pillWrap: "bg-rose-100 ring-rose-200/60",
    pillText: "text-rose-950",
  },
  slate: {
    decoration: "slate",
    cardGradient: "from-white via-white to-slate-50/[0.45]",
    topWash: "from-slate-100/30",
    pillWrap: "bg-slate-100 ring-slate-200/60",
    pillText: "text-slate-800",
  },
  violet: {
    decoration: "violet",
    cardGradient: "from-white via-white to-violet-50/[0.35]",
    topWash: "from-violet-100/25",
    pillWrap: "bg-violet-100 ring-violet-200/60",
    pillText: "text-violet-950",
  },
  fuchsia: {
    decoration: "fuchsia",
    cardGradient: "from-white via-white to-fuchsia-50/[0.35]",
    topWash: "from-fuchsia-100/25",
    pillWrap: "bg-fuchsia-100 ring-fuchsia-200/60",
    pillText: "text-fuchsia-950",
  },
};

export function WfmMetricHeroCard({
  eyebrow,
  decorationColor,
  primary,
  primaryClassName,
  badge,
  meta,
  onDrillIn,
  drillAriaLabel,
}: {
  eyebrow: string;
  decorationColor: WfmHeroDecoration;
  primary: ReactNode;
  primaryClassName?: string;
  badge?: ReactNode;
  meta?: { label: string; value: ReactNode; valueCls?: string }[];
  onDrillIn?: () => void;
  drillAriaLabel?: string;
}) {
  const skin = WFM_HERO_SKIN[decorationColor];

  const card = (
    <Card
      decoration="left"
      decorationColor={skin.decoration}
      className={cn(
        "exec-dash-tremor__hero-card relative h-full min-h-[6.25rem] overflow-hidden bg-gradient-to-b p-3.5 sm:p-4",
        skin.cardGradient,
        "ring-1 ring-black/[0.04]",
      )}
    >
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b to-transparent", skin.topWash)} />
      <div className="relative flex h-full flex-col">
        <Flex justifyContent="between" alignItems="start" className="gap-1.5">
          <span className={cn("inline-flex max-w-[85%] rounded-full px-2 py-0.5 ring-1", skin.pillWrap)}>
            <Text className={cn("text-[9px] font-bold uppercase leading-snug tracking-wide sm:text-[10px]", skin.pillText)}>
              {eyebrow}
            </Text>
          </span>
          {badge ? <div className="shrink-0">{badge}</div> : null}
        </Flex>

        <Metric className={cn("mt-2 text-lg tabular-nums leading-tight text-tremor-content-strong sm:text-xl", primaryClassName)}>
          {primary}
        </Metric>

        <div
          className={cn(
            "mt-2 flex flex-1 flex-col border-t border-tremor-border/80 pt-2",
            !meta?.length && "min-h-[1.75rem]",
          )}
        >
          {meta && meta.length > 0 ? (
            <div className="space-y-1">
              {meta.map((m, i) => (
                <Flex key={i} justifyContent="between" className="gap-2">
                  <Text className="text-[11px] font-medium leading-snug text-neutral-600">{m.label}</Text>
                  <Text
                    className={cn(
                      "text-right text-[11px] font-semibold leading-snug tabular-nums text-neutral-900",
                      m.valueCls === "muted" && "text-neutral-500",
                      m.valueCls === "warn" && "text-amber-700",
                      m.valueCls === "risk" && "text-rose-600",
                    )}
                  >
                    {m.value}
                  </Text>
                </Flex>
              ))}
            </div>
          ) : null}
        </div>

        {onDrillIn ? (
          <Text className="mt-auto pt-1.5 text-[9px] font-medium text-neutral-500">Tap for data reference</Text>
        ) : null}
      </div>
    </Card>
  );

  const shellClass = "h-full min-h-0";

  if (!onDrillIn) {
    return <div className={shellClass}>{card}</div>;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={drillAriaLabel ?? `View details for ${eyebrow}`}
      className="exec-dash-tremor__hero-card-wrap h-full min-h-0 rounded-tremor-default outline-none"
      onClick={onDrillIn}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onDrillIn();
        }
      }}
    >
      {card}
    </div>
  );
}
