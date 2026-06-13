import React from "react";
import {
  AccountMetricCard,
  platformAccentToDecoration,
} from "@/components/tremor-dashboard/AccountMetricCard";
import "@/styles/exec-dash-premium.css";

type Accent = "orange" | "teal" | "red" | "green" | "blue" | "amber";

function formatSubline(line: { label: string; value: React.ReactNode }): string {
  return `${line.label}: ${line.value ?? "—"}`;
}

export function ExecutiveKpiCard({
  title,
  accent = "orange",
  primary,
  sublines = [],
  band,
  footer = [],
}: {
  title: string;
  accent?: Accent;
  primary: React.ReactNode;
  sublines?: { label: string; value: React.ReactNode; tone?: "default" | "green" | "red" | "amber" }[];
  /** Optional strip between sublines and footer (e.g. quarterly plan vs actual). */
  band?: React.ReactNode;
  footer?: { label: string; value: React.ReactNode }[];
}) {
  const subtext = sublines[0] ? formatSubline(sublines[0]) : undefined;
  const extraLines = [
    ...sublines.slice(1).map(formatSubline),
    ...footer.map(formatSubline),
    ...(band ? [String(band)] : []),
  ];
  const footnote = extraLines.length > 0 ? extraLines.join(" · ") : undefined;

  return (
    <AccountMetricCard
      eyebrow={title}
      decorationColor={platformAccentToDecoration(accent)}
      value={primary}
      subtext={subtext}
      footnote={footnote}
    />
  );
}
