import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkline } from "./Charts";

type KpiAccent = "blue" | "teal" | "green" | "red" | "amber" | "orange" | "indigo";
const ACCENT_COLORS: Record<KpiAccent, string> = {
  blue: "var(--blue)",
  teal: "var(--accent2)",
  green: "var(--green)",
  red: "var(--red)",
  amber: "var(--amber)",
  orange: "var(--accent)",
  indigo: "var(--entity-indigo)",
};

const KPI_HEADER_BG: Record<KpiAccent, string> = {
  blue: "#3884ff",
  teal: "#14b8a6",
  green: "#2ecc71",
  red: "#ef4444",
  amber: "#f59e0b",
  orange: "#e16f3d",
  indigo: "#6366f1",
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
  const headerBg = KPI_HEADER_BG[accent];
  const deltaColor = delta?.startsWith("▲") ? "var(--green)" : delta?.startsWith("▼") ? "var(--red)" : "var(--text-subtle)";

  return (
    <div
      onClick={navigateTo ? () => navigate(navigateTo) : undefined}
      style={{
        cursor: navigateTo ? "pointer" : "default",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        transition: "box-shadow var(--t-base), transform var(--t-base)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-sm)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "";
        (e.currentTarget as HTMLDivElement).style.transform = "";
      }}
    >
      <div style={{
        padding: "10px 14px 8px",
        borderBottom: "1px solid var(--border)",
        background: headerBg,
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: "9.5px",
          fontFamily: "var(--mono)",
          letterSpacing: "0.1em",
          textTransform: "uppercase" as const,
          fontWeight: 500,
          color: "rgba(255,255,255,0.9)",
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(255,255,255,0.4)", flexShrink: 0 }} />
          {label}
        </div>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 10,
          minWidth: 0,
        }}>
          <div className="platform-kpi-value" style={{ color: "var(--text)", flex: "1 1 auto", minWidth: 0, fontFamily: "var(--mono)", fontSize: 26, fontWeight: 500, letterSpacing: "-0.5px", lineHeight: 1 }}>{value}</div>
          {sparkData ? <Sparkline data={sparkData} color={color} /> : null}
        </div>
        {delta && <div style={{ fontSize: 12, color: deltaColor, fontFamily: "var(--mono)", fontWeight: 500 }}>{delta}</div>}
        {subtext && <div style={{ fontSize: 12, marginTop: 2, color: "var(--text-subtle)" }}>{subtext}</div>}
      </div>
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
  titleAccessory?: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  const showHeader = Boolean((title && title.trim()) || action || titleAccessory || headerRight);
  return (
    <section style={{
      background: "var(--surface-raised)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
    }}>
      {showHeader ? (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {title && title.trim() ? (
              <div style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text)",
              }}>
                {title}
              </div>
            ) : null}
            {titleAccessory}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {headerRight}
            {action && (
              <button type="button" onClick={onAction} style={{
                padding: "5px 12px",
                background: "var(--surface-raised)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-base)",
                fontFamily: "var(--font)",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-muted)",
                cursor: onAction ? "pointer" : "default",
                transition: "all var(--t-base)",
              }}>{action}</button>
            )}
          </div>
        </div>
      ) : null}
      <div style={{ padding: "16px 20px" }}>
        {children}
      </div>
    </section>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
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
  let bg = "var(--border)", color = "var(--text-muted)", dotColor = "var(--text-subtle)";
  if (s.includes("met") || s.includes("joined") || s.includes("closed") || s.includes("strong")) {
    bg = "var(--green-soft)"; color = "#1a7a47"; dotColor = "var(--green)";
  } else if (s.includes("breach") || s.includes("risk") || s.includes("high") || s.includes("cancel")) {
    bg = "var(--red-soft)"; color = "#b91c1c"; dotColor = "var(--red)";
  } else if (s.includes("watch") || s.includes("med") || s.includes("offer") || s.includes("near")) {
    bg = "var(--amber-soft)"; color = "#92600a"; dotColor = "var(--amber)";
  } else if (s.includes("screen") || s.includes("open") || s.includes("active") || s.includes("blue")) {
    bg = "var(--blue-soft)"; color = "#1d4ed8"; dotColor = "var(--blue)";
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px",
      borderRadius: "var(--radius-pill)", fontSize: 11.5, fontWeight: 500,
      background: bg, color, lineHeight: 1,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
      {status}
    </span>
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
        <button key={t} className={`platform-tab${active === t ? " active" : ""}`} onClick={() => onChange(t)} type="button">
          {t}
        </button>
      ))}
    </div>
  );
}
