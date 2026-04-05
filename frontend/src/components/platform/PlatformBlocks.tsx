import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkline } from "./Charts";

type KpiAccent = "blue" | "teal" | "green" | "red" | "amber";
const ACCENT_COLORS: Record<KpiAccent, string> = {
  blue: "var(--accent)",
  teal: "var(--accent2)",
  green: "var(--green)",
  red: "var(--red)",
  amber: "var(--amber)",
};

export function PlatformKpi({
  label, value, delta, accent = "blue", subtext, navigateTo, sparkData,
}: {
  label: string;
  value: string | number;
  delta?: string;
  accent?: KpiAccent;
  subtext?: string;
  navigateTo?: string;
  sparkData?: number[];
}) {
  const navigate = useNavigate();
  const color = ACCENT_COLORS[accent];
  const deltaColor = delta?.startsWith("▲") ? "var(--green)" : delta?.startsWith("▼") ? "var(--red)" : "var(--text-muted)";

  return (
    <div
      className="platform-card"
      onClick={navigateTo ? () => navigate(navigateTo) : undefined}
      style={{
        cursor: navigateTo ? "pointer" : "default",
        position: "relative",
        overflow: "visible",
        transition: "border-color .2s, transform .15s",
        paddingBottom: 16,
      }}
      onMouseEnter={(e) => {
        if (navigateTo) (e.currentTarget as HTMLDivElement).style.borderColor = `${color}60`;
      }}
      onMouseLeave={(e) => {
        if (navigateTo) (e.currentTarget as HTMLDivElement).style.borderColor = "";
      }}
    >
      {/* top gradient line */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${color}40, transparent)`,
      }} />
      {/* bottom accent bar */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${color}, transparent)`,
      }} />

      <div className="platform-kpi-label">{label}</div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 8,
          marginTop: 8,
          minWidth: 0,
        }}
      >
        <div className="platform-kpi-value" style={{ color, flex: "1 1 auto", minWidth: 0 }}>{value}</div>
        {sparkData ? <Sparkline data={sparkData} color={color} /> : null}
      </div>
      {delta && <div style={{ fontSize: 10.5, marginTop: 6, color: deltaColor, fontFamily: "'DM Mono',monospace" }}>{delta}</div>}
      {subtext && <div style={{ fontSize: 10, marginTop: 4, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>{subtext}</div>}
    </div>
  );
}

export function PlatformSection({
  title, children, action, onAction, titleAccessory, headerRight,
}: {
  title?: string;
  children: React.ReactNode;
  action?: string;
  onAction?: () => void;
  /** Renders inline after the title (e.g. info icon + tooltip). */
  titleAccessory?: React.ReactNode;
  /** Extra controls on the right, before the optional `action` link (e.g. Add requisition). */
  headerRight?: React.ReactNode;
}) {
  const showHeader = Boolean((title && title.trim()) || action || titleAccessory || headerRight);
  return (
    <section className="platform-card">
      {showHeader ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            {title && title.trim() ? (
              <div style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-subtle)", fontFamily: "'DM Mono',monospace", letterSpacing: ".08em" }}>
                {title}
              </div>
            ) : null}
            {titleAccessory}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {headerRight}
            {action && (
              <button type="button" onClick={onAction} style={{
                background: "none", border: "none", cursor: onAction ? "pointer" : "default",
                fontSize: 10, color: "var(--accent)", fontFamily: "'DM Mono',monospace",
              }}>{action} →</button>
            )}
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div className="platform-page-title">{title}</div>
      <div className="platform-page-subtitle">{subtitle}</div>
    </div>
  );
}

export function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 12px" }}>
      <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text-subtle)", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

export function StatusTag({ status }: { status: string }) {
  const s = status.toLowerCase();
  let bg = "color-mix(in srgb, var(--text-subtle) 10%, transparent)", color = "var(--text-subtle)";
  if (s.includes("met") || s.includes("joined") || s.includes("closed") || s.includes("strong")) {
    bg = "color-mix(in srgb, var(--green) 10%, transparent)"; color = "var(--green)";
  } else if (s.includes("breach") || s.includes("risk") || s.includes("high") || s.includes("cancel")) {
    bg = "color-mix(in srgb, var(--red) 10%, transparent)"; color = "var(--red)";
  } else if (s.includes("watch") || s.includes("med") || s.includes("offer") || s.includes("near")) {
    bg = "color-mix(in srgb, var(--amber) 10%, transparent)"; color = "var(--amber)";
  } else if (s.includes("screen") || s.includes("open") || s.includes("active") || s.includes("blue")) {
    bg = "var(--accent-muted)"; color = "var(--accent)";
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "1px 7px",
      borderRadius: 4, fontSize: 9.5, fontFamily: "'DM Mono',monospace",
      background: bg, color,
    }}>{status}</span>
  );
}

export function MiniStatRow({ stats }: { stats: Array<{ label: string; value: string | number; color?: string }> }) {
  return (
    <div className="mini-stat-row">
      {stats.map((s) => (
        <div key={s.label} className="mini-stat">
          <div className="mini-stat-label">{s.label}</div>
          <div className="mini-stat-val" style={s.color ? { color: s.color } : {}}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

export function KvRow({ label, value, valueColor }: { label: string; value: React.ReactNode; valueColor?: string }) {
  return (
    <div className="kv-row">
      <span className="kv-key">{label}</span>
      <span className="kv-val" style={valueColor ? { color: valueColor } : {}}>{value}</span>
    </div>
  );
}

export function Tabs({
  tabs, active, onChange,
}: {
  tabs: string[];
  active: string;
  onChange: (t: string) => void;
}) {
  return (
    <div className="platform-tab-bar">
      {tabs.map((t) => (
        <button key={t} className={`platform-tab${active === t ? " active" : ""}`} onClick={() => onChange(t)}>
          {t}
        </button>
      ))}
    </div>
  );
}
