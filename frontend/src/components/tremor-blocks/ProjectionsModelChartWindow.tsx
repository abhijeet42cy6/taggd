import type { ChartTimeRange } from "@/lib/projections-forecast";
import {
  Badge,
  Button,
  Card,
  Flex,
  Grid,
  Select,
  SelectItem,
  Switch,
  Text,
  Title,
} from "@tremor/react";

export type ChartTimeRangeOption = {
  value: ChartTimeRange;
  label: string;
  hint: string;
};

export type ProjectionsModelChartWindowProps = {
  titleId?: string;
  chartTimeRange: ChartTimeRange;
  chartTimeRanges: readonly ChartTimeRangeOption[];
  onChartTimeRangeChange: (value: ChartTimeRange) => void;
  monthsAhead: number;
  horizons: readonly number[];
  onMonthsAheadChange: (months: number) => void;
  projectHeadFilter: string;
  projectHeadOptions: readonly string[];
  onProjectHeadFilterChange: (value: string) => void;
  compareOn: boolean;
  onCompareOnChange: (value: boolean) => void;
};

/**
 * Compact “model & chart window” for Projections — Tremor `Card` with `p-0`,
 * summary badges, button-group history (instead of tabs), and aligned selects.
 */
export function ProjectionsModelChartWindow({
  titleId = "projections-model-chart-title",
  chartTimeRange,
  chartTimeRanges,
  onChartTimeRangeChange,
  monthsAhead,
  horizons,
  onMonthsAheadChange,
  projectHeadFilter,
  projectHeadOptions,
  onProjectHeadFilterChange,
  compareOn,
  onCompareOnChange,
}: ProjectionsModelChartWindowProps) {
  const timeLabel = chartTimeRanges.find((x) => x.value === chartTimeRange)?.label ?? chartTimeRange;

  return (
    <Card
      className="overflow-hidden p-0 shadow-tremor-card ring-1 ring-tremor-ring dark:shadow-dark-tremor-card dark:ring-dark-tremor-ring"
      aria-labelledby={titleId}
    >
      <div className="border-b border-tremor-border bg-gradient-to-r from-tremor-background-muted to-white px-4 py-3 dark:border-dark-tremor-border dark:from-dark-tremor-background-muted dark:to-dark-tremor-background">
        {/*
          Avoid Tremor Flex here: its default cross-axis alignment centers items, so in `flex-col`
          the title column shrinks to an ultra-narrow strip next to shrink-0 badges. Native flex +
          `sm:flex-1` + `min-w-0` keeps copy readable and badges aligned.
        */}
        <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="w-full min-w-0 sm:flex-1 sm:pr-2">
            <Title id={titleId} className="text-base font-semibold text-tremor-content-strong">
              Model &amp; chart window
            </Title>
            <Text className="mt-0.5 block text-xs text-tremor-content-subtle">
              Plotted past follows the buttons below; the engine still uses every in-scope month for math.
            </Text>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:pt-0.5">
            <Badge color="orange" size="xs" className="tabular-nums">
              Chart: {timeLabel}
            </Badge>
            <Badge color="slate" size="xs" className="tabular-nums">
              Forward: {monthsAhead}M
            </Badge>
          </div>
        </div>
      </div>

      <div className="h-px w-full bg-tremor-border dark:bg-dark-tremor-border" aria-hidden />

      <div className="bg-white px-4 py-3 dark:bg-dark-tremor-background">
        <Grid numItems={1} numItemsLg={12} className="items-end gap-3">
          <div className="lg:col-span-6">
            <Text className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-orange-600">
              Chart history (plotted)
            </Text>
            <div
              className="flex flex-wrap gap-1"
              role="radiogroup"
              aria-label="Months of history shown on chart"
            >
              {chartTimeRanges.map((r) => {
                const on = r.value === chartTimeRange;
                return (
                  <Button
                    key={r.value}
                    type="button"
                    size="xs"
                    variant={on ? "primary" : "light"}
                    color="orange"
                    title={r.hint}
                    aria-pressed={on}
                    className="min-w-[2.5rem] justify-center px-2.5"
                    onClick={() => onChartTimeRangeChange(r.value)}
                  >
                    {r.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-2">
            <Text className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-orange-600">
              Forward horizon
            </Text>
            <Select
              value={String(monthsAhead)}
              onValueChange={(v) => onMonthsAheadChange(Number(v))}
              aria-label="Months forward for model"
            >
              {horizons.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {h} months
                </SelectItem>
              ))}
            </Select>
          </div>

          <div className="lg:col-span-3">
            <Text className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-orange-600">
              Shortlist by head
            </Text>
            <Select value={projectHeadFilter} onValueChange={onProjectHeadFilterChange}>
              {projectHeadOptions.map((h) => (
                <SelectItem key={h} value={h}>
                  {h === "all" ? "All" : h}
                </SelectItem>
              ))}
            </Select>
          </div>

          <Flex
            justifyContent="start"
            alignItems="center"
            className="gap-2 border-t border-tremor-border pt-3 lg:col-span-12 lg:justify-end lg:border-0 lg:pt-0 dark:border-dark-tremor-border"
          >
            <Text className="text-xs font-medium text-tremor-content-emphasis">Compare A / B</Text>
            <Switch checked={compareOn} onChange={onCompareOnChange} color="orange" />
          </Flex>
        </Grid>
      </div>
    </Card>
  );
}
