import React from "react";

type Accent = "orange" | "teal" | "red" | "green" | "blue" | "amber";

const HEADER_BG: Record<Accent, string> = {
  orange: "#e16f3d",
  teal: "#14b8a6",
  red: "#ef4444",
  green: "#2ecc71",
  blue: "#3884ff",
  amber: "#f59e0b",
};

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
        {band ? <div className="exec-kpi-card__band">{band}</div> : null}
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
