/**
 * Shared executive financial hero cards + Q1–Q4 band (Executive Overview + CEO's View).
 */
import React from "react";
import { formatLargeCurrency } from "@/lib/utils";

export type QuarterPoint = { q: string; planInr: number; actualInr: number };

export function QuarterBand({
  quarters,
  variant = "orange",
}: {
  quarters: QuarterPoint[];
  variant?: "orange" | "teal" | "blue";
}) {
  if (!quarters.some((q) => q.planInr > 0 || q.actualInr > 0)) return null;
  const maxScale = Math.max(1, ...quarters.map((q) => Math.max(q.planInr, q.actualInr)));
  return (
    <div className={`exec-quarter-band exec-quarter-band--${variant}`}>
      {quarters.map((q) => {
        const planH = Math.max(3, (q.planInr / maxScale) * 28);
        const actH = q.actualInr > 0 ? Math.max(0, (q.actualInr / maxScale) * 28) : 0;
        const onTrack = q.planInr > 0 ? q.actualInr + 1 >= q.planInr : q.actualInr > 0;
        return (
          <div key={q.q} className="exec-quarter-col">
            <div className="exec-quarter-col__bars">
              <div className="exec-quarter-col__bar-plan" style={{ height: planH }} />
              {q.actualInr > 0 && (
                <div
                  className={`exec-quarter-col__bar-actual exec-quarter-col__bar-actual--${onTrack ? "on" : "off"}`}
                  style={{ height: actH }}
                />
              )}
            </div>
            <div className="exec-quarter-col__label">{q.q}</div>
            <div className="exec-quarter-col__val">{formatLargeCurrency(q.actualInr || q.planInr)}</div>
          </div>
        );
      })}
    </div>
  );
}

function attainmentCls(pct: number): "green" | "amber" | "red" {
  return pct >= 100 ? "green" : pct >= 70 ? "amber" : "red";
}

export function ExecutiveHeroCard({
  eyebrow,
  variant,
  primary,
  deltas,
  attainmentLabel,
  attainmentPct,
  meta,
  children,
}: {
  eyebrow: string;
  variant: "orange" | "teal" | "blue";
  primary: React.ReactNode;
  deltas?: { label: string; cls: string }[];
  attainmentLabel?: string;
  attainmentPct?: number;
  meta?: { label: string; value: React.ReactNode; valueCls?: string }[];
  children?: React.ReactNode;
}) {
  const att = attainmentPct ?? 0;
  const attCls = attainmentCls(att);
  return (
    <div className={`exec-hero-card exec-hero-card--${variant}`}>
      <div className="exec-hero-card__eyebrow">{eyebrow}</div>
      <div className="exec-hero-card__primary">{primary}</div>
      {deltas && deltas.length > 0 && (
        <div className="exec-hero-card__deltas">
          {deltas.map((d, i) => (
            <span key={i} className={`exec-delta-chip ${d.cls}`}>
              {d.label}
            </span>
          ))}
        </div>
      )}
      {attainmentLabel != null && (
        <div className="exec-attainment">
          <div className="exec-attainment__header">
            <span className="exec-attainment__label">{attainmentLabel}</span>
            <span className={`exec-attainment__pct exec-attainment__pct--${attCls}`}>
              {att.toFixed(1)}%
            </span>
          </div>
          <div className="exec-attainment__track">
            <div
              className={`exec-attainment__fill exec-attainment__fill--${attCls}`}
              style={{ width: `${Math.min(100, att)}%` }}
            />
          </div>
        </div>
      )}
      {children}
      {meta && meta.length > 0 && (
        <div className="exec-hero-card__meta">
          {meta.map((m, i) => (
            <div key={i} className="exec-hero-card__meta-row">
              <span className="exec-hero-card__meta-label">{m.label}</span>
              <span
                className={`exec-hero-card__meta-val${m.valueCls ? ` exec-hero-card__meta-val--${m.valueCls}` : ""}`}
              >
                {m.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
