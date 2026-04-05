import React from "react";

type Accent = "orange" | "teal" | "red" | "green" | "blue" | "amber";

const HEADER_BG: Record<Accent, string> = {
  orange: "linear-gradient(90deg, #ea580c, #fb923c)",
  teal: "linear-gradient(90deg, #0d9488, #14b8a6)",
  red: "linear-gradient(90deg, #dc2626, #f87171)",
  green: "linear-gradient(90deg, #16a34a, #4ade80)",
  blue: "linear-gradient(90deg, #2563eb, #60a5fa)",
  amber: "linear-gradient(90deg, #d97706, #fbbf24)",
};

export function ExecutiveKpiCard({
  title,
  accent = "orange",
  primary,
  sublines = [],
  footer = [],
}: {
  title: string;
  accent?: Accent;
  primary: React.ReactNode;
  sublines?: { label: string; value: React.ReactNode; tone?: "default" | "green" | "red" | "amber" }[];
  footer?: { label: string; value: React.ReactNode }[];
}) {
  return (
    <div className="exec-kpi-card">
      <div className="exec-kpi-card__header" style={{ background: HEADER_BG[accent] }}>
        {title}
      </div>
      <div className="exec-kpi-card__body">
        <div className="exec-kpi-card__primary">{primary}</div>
        {sublines.length > 0 && (
          <div className="exec-kpi-card__sub">
            {sublines.map((l, i) => (
              <div key={i} className={`exec-kpi-card__subline exec-kpi-card__subline--${l.tone ?? "default"}`}>
                <span>{l.label}</span>
                <span>{l.value}</span>
              </div>
            ))}
          </div>
        )}
        {footer.length > 0 && (
          <div className="exec-kpi-card__footer">
            {footer.map((f, i) => (
              <div key={i} className="exec-kpi-card__footrow">
                <span>{f.label}</span>
                <span>{f.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
