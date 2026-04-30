import type { ReactNode } from "react";
import { Badge, Card, Flex, Grid, Metric, Text } from "@tremor/react";
import { cn } from "@/lib/utils";

const toneClass: Record<
  "sky" | "violet" | "teal" | "orange",
  { border: string; label: string; ring: string }
> = {
  sky: {
    border: "border-l-[3px] border-l-sky-500",
    label: "text-sky-950",
    ring: "ring-sky-100/90",
  },
  violet: {
    border: "border-l-[3px] border-l-violet-500",
    label: "text-violet-950",
    ring: "ring-violet-100/90",
  },
  teal: {
    border: "border-l-[3px] border-l-teal-500",
    label: "text-teal-950",
    ring: "ring-teal-100/90",
  },
  orange: {
    border: "border-l-[3px] border-l-orange-500",
    label: "text-orange-950",
    ring: "ring-orange-100",
  },
};

export function OperationalPulseCard({
  label,
  primary,
  sub,
  badge,
  tone = "orange",
}: {
  label: string;
  primary: ReactNode;
  sub?: ReactNode;
  badge?: { label: string; color: "emerald" | "rose" | "amber" | "slate" };
  tone?: keyof typeof toneClass;
}) {
  const t = toneClass[tone];
  return (
    <Card
      className={cn(
        "exec-dash-tremor__pulse-card bg-gradient-to-br from-white to-neutral-50/80 shadow-tremor-card",
        t.border,
        t.ring,
        "ring-1",
      )}
    >
      <Flex justifyContent="between" alignItems="start" className="gap-2">
        <Text className={cn("text-sm font-bold", t.label)}>{label}</Text>
        {badge ? (
          <Badge color={badge.color} size="sm">
            {badge.label}
          </Badge>
        ) : null}
      </Flex>
      <Metric className="mt-3 text-tremor-content-strong">{primary}</Metric>
      {sub ? <Text className="mt-2 text-sm font-medium leading-snug text-neutral-600">{sub}</Text> : null}
    </Card>
  );
}

export function OperationalPulseGrid({ children }: { children: ReactNode }) {
  return (
    <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="exec-dash-tremor__pulse-grid gap-4">
      {children}
    </Grid>
  );
}

export function pulseBadgeFromExecCls(cls: string): "emerald" | "rose" | "amber" | "slate" {
  if (cls.includes("green")) return "emerald";
  if (cls.includes("red")) return "rose";
  if (cls.includes("amber")) return "amber";
  return "slate";
}
