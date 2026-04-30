import type { ReactNode } from "react";
import { Button, Card, Text, Title } from "@tremor/react";
import { cn } from "@/lib/utils";

export function TremorDashboardSection({
  tag,
  title,
  titleAccessory,
  toolbar,
  action,
  onAction,
  children,
  noPad,
  compact,
  className,
}: {
  tag?: string;
  title: string;
  /** Rendered inline after the title (e.g. info tooltip trigger). */
  titleAccessory?: ReactNode;
  /** Extra controls below the title row (filters, search, etc.). */
  toolbar?: ReactNode;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
  noPad?: boolean;
  /** Tighter header, title, and body padding (dashboard density). */
  compact?: boolean;
  /** Merged onto the root Card (e.g. flat shell from Requisitions). */
  className?: string;
}) {
  const headerPad = compact ? "px-4 py-3" : "px-6 py-4";
  const titleGap = compact ? "mt-0.5" : "mt-1";
  const titleClass = compact
    ? "text-base font-semibold leading-snug text-tremor-content-strong"
    : "text-tremor-title font-semibold text-tremor-content-strong";
  const tagClass = compact
    ? "text-[10px] font-bold uppercase tracking-wider text-orange-600"
    : "font-bold uppercase tracking-wide text-orange-600";
  const toolbarWrap = compact ? "mt-3 border-t border-tremor-border/80 pt-3" : "mt-4 border-t border-tremor-border/80 pt-4";
  const bodyPad = noPad ? "" : compact ? "bg-white p-4" : "bg-white p-6";

  return (
    <Card className={cn("overflow-hidden p-0 shadow-tremor-card", className)}>
      <div className={`border-b border-tremor-border bg-white ${headerPad}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {tag ? (
              <Text className={tagClass}>{tag}</Text>
            ) : null}
            <div className={tag ? `${titleGap} flex flex-wrap items-center gap-x-2 gap-y-1` : "flex flex-wrap items-center gap-x-2 gap-y-1"}>
              <Title className={titleClass}>{title}</Title>
              {titleAccessory}
            </div>
          </div>
          {action && onAction ? (
            <Button type="button" variant="light" size="xs" color="orange" onClick={onAction}>
              {action}
            </Button>
          ) : null}
        </div>
        {toolbar ? <div className={toolbarWrap}>{toolbar}</div> : null}
      </div>
      <div className={bodyPad}>{children}</div>
    </Card>
  );
}
