import React from "react";
import { Database, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatMappingFieldLabel,
  parseColumnMappingSections,
} from "@/lib/column-mapping-display";
import { Badge } from "@/components/ui/badge";

type Variant = "card" | "inline";

type Props = {
  /** Raw `mapping` from upload API or `project.column_mapping`. */
  mapping: unknown;
  variant?: Variant;
  className?: string;
  /** Scroll area max height (Tailwind class or arbitrary, e.g. `max-h-[280px]`). */
  scrollMaxClass?: string;
};

function MappingBlock({
  title,
  icon: Icon,
  rows,
  variant,
  accent,
}: {
  title: string;
  icon: typeof Table2;
  rows: [string, string][];
  variant: Variant;
  accent?: "default" | "muted";
}) {
  if (!rows.length) return null;
  const isInline = variant === "inline";

  return (
    <div
      className={cn(
        "rounded-lg border border-border/50 overflow-hidden",
        accent === "muted" ? "bg-muted/15" : "bg-muted/25",
        isInline && "border-border/30"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/40",
          isInline && "py-1.5"
        )}
      >
        <Icon size={isInline ? 11 : 12} className="text-primary/70 shrink-0" />
        <span
          className={cn(
            "font-semibold uppercase tracking-wider text-muted-foreground",
            isInline ? "text-[8px]" : "text-[9px]"
          )}
        >
          {title}
        </span>
        <Badge variant="secondary" className="ml-auto h-5 text-[9px] font-mono tabular-nums">
          {rows.length}
        </Badge>
      </div>
      <div className={cn("divide-y divide-border/30", isInline ? "text-[10px]" : "text-[11px]")}>
        {rows.map(([field, excelHeader]) => (
          <div
            key={field}
            className={cn(
              "flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 px-3 py-2 hover:bg-muted/20 border-b border-border/20 last:border-b-0",
              isInline && "py-1.5"
            )}
          >
            <div className="sm:w-[38%] min-w-0 shrink-0">
              <div
                className={cn("font-mono text-primary/90 truncate", isInline ? "text-[9px]" : "text-[10px]")}
                title={field}
              >
                {field}
              </div>
              <div className="text-[9px] text-muted-foreground/90 truncate" title={formatMappingFieldLabel(field)}>
                {formatMappingFieldLabel(field)}
              </div>
            </div>
            <div
              className={cn(
                "sm:flex-1 min-w-0 font-mono text-foreground/85 break-words",
                isInline ? "text-[9px]" : "text-[10px]"
              )}
              title={excelHeader}
            >
              <span className="text-muted-foreground sm:hidden text-[9px] mr-1">Excel →</span>
              {excelHeader}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Full-width, readable column mapping for upload results (Express / Pro) and project detail.
 */
export function ColumnMappingDisplay({
  mapping,
  variant = "card",
  className,
  scrollMaxClass = "max-h-[min(60vh,420px)]",
}: Props) {
  const { isV2, universal, recordFields } = parseColumnMappingSections(mapping);
  const total = universal.length + recordFields.length;
  if (total === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 flex-wrap">
        <Database size={14} className="text-primary/70" />
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/80">
          Column mapping
        </span>
        {isV2 ? (
          <Badge variant="outline" className="h-5 text-[8px] font-mono border-primary/25 text-primary/90">
            v2 · {total} links
          </Badge>
        ) : (
          <Badge variant="outline" className="h-5 text-[8px] font-mono border-border text-muted-foreground">
            legacy · {total} links
          </Badge>
        )}
      </div>

      <div className={cn("space-y-3 overflow-y-auto pr-1", scrollMaxClass)}>
        <MappingBlock
          title="Core schema (universal)"
          icon={Table2}
          rows={universal}
          variant={variant}
        />
        {isV2 && (
          <MappingBlock
            title="Requisition / RPO fields"
            icon={Database}
            rows={recordFields}
            variant={variant}
            accent="muted"
          />
        )}
      </div>
    </div>
  );
}
