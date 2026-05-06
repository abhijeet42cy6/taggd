import type { ReactNode } from "react";
import { Badge, Card, Flex, Grid, Metric, ProgressBar, Text } from "@tremor/react";
import type { QuarterPoint } from "@/components/platform/ExecutiveFinanceHero";
import { cn, formatLargeCurrency } from "@/lib/utils";

export type ExecutiveHeroDecoration = "orange" | "amber" | "teal" | "blue";

function badgeColorFromExecCls(cls: string): "emerald" | "rose" | "amber" | "slate" {
  if (cls.includes("green")) return "emerald";
  if (cls.includes("red")) return "rose";
  if (cls.includes("amber")) return "amber";
  return "slate";
}

function attainmentVisual(rawPct: number): {
  pctClass: string;
  barColor: "emerald" | "orange" | "rose";
} {
  if (rawPct >= 100) return { pctClass: "text-emerald-600", barColor: "emerald" };
  if (rawPct >= 70) return { pctClass: "text-amber-600", barColor: "orange" };
  return { pctClass: "text-rose-600", barColor: "rose" };
}

const HERO_SKIN: Record<
  ExecutiveHeroDecoration,
  {
    cardGradient: string;
    topWash: string;
    pillWrap: string;
    pillText: string;
    actualBar: string;
  }
> = {
  orange: {
    cardGradient: "from-white via-white to-orange-50/[0.35]",
    topWash: "from-orange-100/25",
    pillWrap: "bg-orange-100 ring-orange-200/60",
    pillText: "text-orange-900",
    actualBar: "from-orange-600 to-orange-400",
  },
  amber: {
    cardGradient: "from-white via-white to-amber-50/[0.35]",
    topWash: "from-amber-100/25",
    pillWrap: "bg-amber-100 ring-amber-200/60",
    pillText: "text-amber-950",
    actualBar: "from-amber-600 to-amber-400",
  },
  teal: {
    cardGradient: "from-white via-white to-teal-50/[0.35]",
    topWash: "from-teal-100/25",
    pillWrap: "bg-teal-100 ring-teal-200/60",
    pillText: "text-teal-950",
    actualBar: "from-teal-600 to-teal-400",
  },
  blue: {
    cardGradient: "from-white via-white to-blue-50/[0.35]",
    topWash: "from-blue-100/25",
    pillWrap: "bg-blue-100 ring-blue-200/60",
    pillText: "text-blue-950",
    actualBar: "from-blue-600 to-blue-400",
  },
};

function QuarterMiniBars({
  quarters,
  actualGradient,
}: {
  quarters: QuarterPoint[];
  actualGradient: string;
}) {
  if (!quarters.some((q) => q.planInr > 0 || q.actualInr > 0)) return null;
  const maxScale = Math.max(1, ...quarters.map((q) => Math.max(q.planInr, q.actualInr)));
  return (
    <Grid numItems={4} className="mt-5 gap-3">
      {quarters.map((q) => {
        const planH = Math.max(6, (q.planInr / maxScale) * 52);
        const actH = q.actualInr > 0 ? Math.max(4, (q.actualInr / maxScale) * 52) : 0;
        return (
          <div key={q.q} className="flex flex-col items-center">
            <Text className="text-xs font-bold text-neutral-600">{q.q}</Text>
            <div className="mt-2 flex h-14 items-end justify-center gap-1.5">
              <div
                className="w-3 rounded-t-sm bg-gradient-to-t from-slate-300 to-slate-200"
                style={{ height: planH }}
                title="Plan"
              />
              <div
                className={cn("w-3 rounded-t-sm bg-gradient-to-t", actualGradient)}
                style={{ height: actH || 3 }}
                title="Actual"
              />
            </div>
            <Text className="mt-2 text-center text-xs font-semibold text-neutral-800">
              {formatLargeCurrency(q.actualInr || q.planInr)}
            </Text>
          </div>
        );
      })}
    </Grid>
  );
}

export function ExecutiveMetricHeroCard({
  eyebrow,
  decorationColor,
  primary,
  deltas,
  attainmentLabel,
  attainmentPct,
  meta,
  quarters,
  onDrillIn,
  drillAriaLabel,
}: {
  eyebrow: string;
  decorationColor: ExecutiveHeroDecoration;
  primary: ReactNode;
  deltas?: { label: string; cls: string }[];
  attainmentLabel?: string;
  attainmentPct?: number;
  meta?: { label: string; value: ReactNode; valueCls?: string }[];
  quarters: QuarterPoint[];
  /** When set, the card is keyboard- and pointer-activated to open a drill-down (e.g. large Dialog). */
  onDrillIn?: () => void;
  drillAriaLabel?: string;
}) {
  const rawPct = attainmentPct ?? 0;
  const barPct = Math.min(100, Math.max(0, rawPct));
  const { pctClass, barColor } = attainmentVisual(rawPct);
  const skin = HERO_SKIN[decorationColor];

  const card = (
    <Card
      decoration="left"
      decorationColor={decorationColor}
      className={cn(
        "exec-dash-tremor__hero-card relative overflow-hidden bg-gradient-to-b",
        skin.cardGradient,
        "ring-1 ring-black/[0.04]",
      )}
    >
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent", skin.topWash)} />
      <div className="relative">
        <span className={cn("inline-flex rounded-full px-2.5 py-1 ring-1", skin.pillWrap)}>
          <Text className={cn("text-[11px] font-bold uppercase tracking-wide", skin.pillText)}>{eyebrow}</Text>
        </span>
        <Metric className="mt-3 text-tremor-content-strong">{primary}</Metric>

        {deltas && deltas.length > 0 ? (
          <Flex className="mt-3 flex-wrap gap-2">
            {deltas.map((d, i) => (
              <Badge key={i} color={badgeColorFromExecCls(d.cls)} size="sm">
                {d.label}
              </Badge>
            ))}
          </Flex>
        ) : null}

        {attainmentLabel != null ? (
          <div className="mt-5">
            <Flex justifyContent="between" alignItems="start" className="gap-3">
              <Text className="text-sm font-semibold leading-snug text-neutral-700">{attainmentLabel}</Text>
              <Text className={cn("shrink-0 text-lg font-bold tabular-nums", pctClass)}>{rawPct.toFixed(1)}%</Text>
            </Flex>
            <ProgressBar value={barPct} color={barColor} className="mt-3" />
          </div>
        ) : null}

        <QuarterMiniBars quarters={quarters} actualGradient={skin.actualBar} />

        {meta && meta.length > 0 ? (
          <div className="mt-5 space-y-2 border-t border-tremor-border/80 pt-4">
            {meta.map((m, i) => (
              <Flex key={i} justifyContent="between" className="gap-3">
                <Text className="font-medium text-neutral-600">{m.label}</Text>
                <Text
                  className={
                    m.valueCls === "red"
                      ? "text-right font-semibold text-rose-600"
                      : "text-right font-semibold text-neutral-900"
                  }
                >
                  {m.value}
                </Text>
              </Flex>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );

  if (!onDrillIn) return card;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={drillAriaLabel ?? "View details"}
      className="exec-dash-tremor__hero-card-wrap rounded-tremor-default outline-none"
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
