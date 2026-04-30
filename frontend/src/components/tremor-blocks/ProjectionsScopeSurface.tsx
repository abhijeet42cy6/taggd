import type { ReactNode } from "react";
import { Card, Text, Title } from "@tremor/react";

const flatCard =
  "overflow-hidden border-0 p-0 shadow-tremor-card ring-1 ring-tremor-ring dark:bg-dark-tremor-background dark:shadow-dark-tremor-card dark:ring-dark-tremor-ring";

/** Single-surface shell: no inner “muted panel” so the card reads as one box. */
export function ProjectionsLedgerScopeCard({
  summaryLine,
  filters,
  footnote,
}: {
  summaryLine: string;
  filters: ReactNode;
  footnote: ReactNode;
}) {
  return (
    <Card className={flatCard}>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-tremor-border px-4 py-3 marker:hidden hover:bg-tremor-background-muted/40 dark:border-dark-tremor-border dark:hover:bg-dark-tremor-background-muted/40 [&::-webkit-details-marker]:hidden">
          <Title className="text-sm font-semibold text-tremor-content-strong">Ledger &amp; portfolio scope</Title>
          <Text className="max-w-[58%] truncate text-right text-[11px] text-tremor-content-subtle md:text-xs">
            {summaryLine}
          </Text>
        </summary>
        <div className="px-3 py-3">
          {filters}
          <div className="mt-2 px-0.5">{footnote}</div>
        </div>
      </details>
    </Card>
  );
}

export function ProjectionsScenariosCard({
  open,
  onToggle,
  summaryMeta,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  summaryMeta: string;
  children?: ReactNode;
}) {
  return (
    <Card className={flatCard}>
      <button
        type="button"
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-tremor-background-muted/40 dark:hover:bg-dark-tremor-background-muted/40 ${open ? "border-b border-tremor-border dark:border-dark-tremor-border" : ""}`}
        aria-expanded={open}
        onClick={onToggle}
      >
        <div className="min-w-0">
          <Title className="text-sm font-semibold text-tremor-content-strong">Scenarios</Title>
          <Text className="mt-0.5 text-[11px] text-tremor-content-subtle md:text-xs">{summaryMeta}</Text>
        </div>
        <Text className="shrink-0 text-xs text-tremor-content-subtle" aria-hidden>
          {open ? "▾" : "▸"}
        </Text>
      </button>
      {open && children ? <div className="space-y-3 px-3 py-3">{children}</div> : null}
    </Card>
  );
}
