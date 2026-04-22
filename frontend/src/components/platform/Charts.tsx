/**
 * Platform chart wrappers — all styled to match platform.html design tokens.
 * Uses Recharts under the hood.
 */
import React from "react";
import { formatNumber, formatPercent } from "@/lib/utils";
import type { YoYRevPoint, YoYCmPoint, RegionBarDatum } from "@/lib/dashboard-aggregates";
import {
  LineChart, Line, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, LabelList,
  ResponsiveContainer, Cell, PieChart, Pie, RadialBarChart, RadialBar,
  ScatterChart, Scatter, ZAxis,
} from "recharts";

/** Resolves from :root / .platform-app theme tokens */
const COLORS = {
  accent: "var(--accent)",
  accent2: "var(--accent2)",
  accent3: "var(--accent3)",
  accent4: "var(--accent4)",
  green: "var(--green)",
  red: "var(--red)",
  amber: "var(--amber)",
  text2: "var(--text-muted)",
  text3: "var(--text-subtle)",
  bg1: "var(--surface-raised)",
  bg3: "var(--surface-sunken)",
  border: "var(--border)",
};

const CHART_STYLE = {
  background: "transparent",
  fontSize: 10,
  fontFamily: "'DM Mono', monospace",
};

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "var(--surface-raised)",
  border: "1px solid var(--border2)",
  borderRadius: 7,
  fontSize: 11,
  color: "var(--text)",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
};

// ─── TREND CHART ──────────────────────────────────────────────────────────────
type TrendPoint = { month: string; revenue: number; budget: number; sla: number; fillRate: number };

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={data} style={CHART_STYLE}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis dataKey="month" tick={{ fill: COLORS.text3, fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="rev" tick={{ fill: COLORS.text3, fontSize: 9 }} axisLine={false} tickLine={false}
          tickFormatter={(v) => `₹${v}Cr`} width={48} />
        <YAxis yAxisId="pct" orientation="right" tick={{ fill: COLORS.text3, fontSize: 9 }}
          axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={36} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: COLORS.text2, fontFamily: "'DM Mono',monospace" }} />
        <Bar yAxisId="rev" dataKey="budget" name="Budget" fill="color-mix(in srgb, var(--accent) 18%, transparent)" radius={[2,2,0,0]} />
        <Line yAxisId="rev" type="monotone" dataKey="revenue" name="Revenue" stroke={COLORS.accent}
          strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
        <Line yAxisId="pct" type="monotone" dataKey="sla" name="SLA Met %" stroke={COLORS.accent2}
          strokeWidth={1.5} dot={{ r: 1.5 }} strokeDasharray="0" />
        <Line yAxisId="pct" type="monotone" dataKey="fillRate" name="Fill Rate %" stroke={COLORS.amber}
          strokeWidth={1.5} dot={{ r: 1.5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── BUBBLE CHART ─────────────────────────────────────────────────────────────
type BubblePoint = { name: string; x: number; y: number; z: number; color: string };

export function BubbleChart({ data }: { data: BubblePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ScatterChart style={CHART_STYLE}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis type="number" dataKey="x" name="Budget %" domain={[60, 110]}
          tick={{ fill: COLORS.text3, fontSize: 9 }} label={{ value: "Budget Attainment %", fill: COLORS.text3, fontSize: 9, position: "insideBottom", offset: -5 }} />
        <YAxis type="number" dataKey="y" name="SLA %" domain={[40, 100]}
          tick={{ fill: COLORS.text3, fontSize: 9 }} label={{ value: "SLA Met %", fill: COLORS.text3, fontSize: 9, angle: -90, position: "insideLeft", offset: 10 }} />
        <ZAxis type="number" dataKey="z" range={[40, 400]} name="Revenue" />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={tooltipStyle}
          labelStyle={{ color: "var(--text)", fontFamily: "'DM Mono', monospace" }}
          itemStyle={{ color: "var(--text)", fontFamily: "'DM Mono', monospace" }}
          formatter={(val, name) => name === "Revenue" ? [`₹${val}Cr`, name] : [`${val}%`, name]} />
        <Scatter data={data} name="Clients">
          {data.map((entry, i) => (
            <Cell key={`cell-${i}`} fill={entry.color} fillOpacity={0.65} stroke={entry.color} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ─── STACKED BAR ──────────────────────────────────────────────────────────────
type StackedBarDatum = { name: string; joined: number; open: number; offer: number; cancelled: number };

export function ReqStatusStackedBar({ data }: { data: StackedBarDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} style={CHART_STYLE}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: COLORS.text3, fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: COLORS.text3, fontSize: 9 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: COLORS.text2 }} />
        <Bar dataKey="joined" name="Joined" stackId="a" fill="color-mix(in srgb, var(--green) 75%, transparent)" radius={[0,0,0,0]} />
        <Bar dataKey="open" name="Open" stackId="a" fill="color-mix(in srgb, var(--accent) 75%, transparent)" />
        <Bar dataKey="offer" name="Offer" stackId="a" fill="color-mix(in srgb, var(--amber) 75%, transparent)" />
        <Bar dataKey="cancelled" name="Cancelled" stackId="a" fill="color-mix(in srgb, var(--red) 65%, transparent)" radius={[3,3,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── DONUT CHART ──────────────────────────────────────────────────────────────
type DonutDatum = { name: string; value: number };

export function LevelDonutChart({ data }: { data: DonutDatum[] }) {
  const DONUT_COLORS = [COLORS.accent, COLORS.accent2, COLORS.amber, COLORS.red];
  return (
    <ResponsiveContainer width="100%" height={110}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={28} outerRadius={44}
          dataKey="value" paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend iconSize={8} layout="vertical" align="right" verticalAlign="middle"
          wrapperStyle={{ fontSize: 9, color: COLORS.text2 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── FINANCE BAR+LINE CHART ────────────────────────────────────────────────────
type FinancePoint = { month: string; budget: number; actual: number; forecast: number };

export function FinanceTrendChart({ data }: { data: FinancePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={data} style={CHART_STYLE}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis dataKey="month" tick={{ fill: COLORS.text3, fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: COLORS.text3, fontSize: 9 }} axisLine={false} tickLine={false}
          tickFormatter={(v) => `₹${v}Cr`} width={48} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`₹${v}Cr`]} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: COLORS.text2 }} />
        <Bar dataKey="budget" name="Budget" fill="color-mix(in srgb, var(--accent) 18%, transparent)" strokeWidth={1} radius={[2,2,0,0]} />
        <Bar dataKey="actual" name="Actual" fill="color-mix(in srgb, var(--accent2) 70%, transparent)" radius={[2,2,0,0]} />
        <Line type="monotone" dataKey="forecast" name="Forecast" stroke={COLORS.amber}
          strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 1.5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── SLA STACKED COMPLIANCE BAR ───────────────────────────────────────────────
type SlaPoint = { month: string; met: number; notMet: number; notReported: number };

export function SlaComplianceBar({ data, height = 220 }: { data: SlaPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} style={CHART_STYLE}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
        <XAxis dataKey="month" tick={{ fill: COLORS.text3, fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: COLORS.text3, fontSize: 9 }} axisLine={false} tickLine={false}
          tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`]} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: COLORS.text2 }} />
        <Bar dataKey="met" name="Met" stackId="s" fill="color-mix(in srgb, var(--green) 70%, transparent)" radius={[0,0,0,0]} />
        <Bar dataKey="notMet" name="Not Met" stackId="s" fill="color-mix(in srgb, var(--red) 70%, transparent)" />
        <Bar dataKey="notReported" name="Not Reported" stackId="s" fill="color-mix(in srgb, var(--text-subtle) 35%, transparent)" radius={[3,3,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── WFM: PRODUCTIVITY TARGET vs FILL RATE (by client) ────────────────────────
export type WfmProdFillPoint = { name: string; fillPct: number; productivity: number; fullName?: string };

export function WfmProductivityFillChart({ data }: { data: WfmProdFillPoint[] }) {
  if (!data.length) {
    return (
      <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.text3, fontSize: 11 }}>
        Upload WFM data with ideal HC to compare
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} style={CHART_STYLE} margin={{ top: 8, right: 12, left: 4, bottom: 64 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis
          dataKey="name"
          tick={{ fill: COLORS.text3, fontSize: 8 }}
          interval={0}
          angle={-38}
          textAnchor="end"
          height={72}
        />
        <YAxis yAxisId="fill" tick={{ fill: COLORS.text3, fontSize: 9 }} tickFormatter={(v) => `${v}%`} domain={[0, "auto"]} width={44} />
        <YAxis yAxisId="prod" orientation="right" tick={{ fill: COLORS.text3, fontSize: 9 }} tickFormatter={(v) => `${v}%`} width={44} />
        <ReferenceLine yAxisId="fill" y={100} stroke={COLORS.red} strokeDasharray="4 4" strokeOpacity={0.85} label={{ value: "100%", fill: COLORS.text3, fontSize: 9 }} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(label, payload) => {
            const p = payload?.[0]?.payload as WfmProdFillPoint | undefined;
            return p?.fullName ?? String(label ?? "");
          }}
          formatter={(value: number | string, name: string) => [`${typeof value === "number" ? value.toFixed(1) : value}%`, name]}
        />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: COLORS.text2 }} />
        <Bar yAxisId="fill" dataKey="fillPct" name="Fill rate %" fill="color-mix(in srgb, var(--accent) 65%, transparent)" radius={[2, 2, 0, 0]} />
        <Line yAxisId="prod" type="monotone" dataKey="productivity" name="Productivity target %" stroke={COLORS.accent2} strokeWidth={2} dot={{ r: 2 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── WL STACKED BAR ───────────────────────────────────────────────────────────
type WlDatum = { name: string; wl1: number; wl2: number; wl3: number; wl4: number };

export function WlDistributionBar({ data }: { data: WlDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} style={CHART_STYLE}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: COLORS.text3, fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: COLORS.text3, fontSize: 9 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 9, color: COLORS.text2 }} />
        <Bar dataKey="wl1" name="WL1" stackId="w" fill="color-mix(in srgb, var(--accent) 80%, transparent)" />
        <Bar dataKey="wl2" name="WL2" stackId="w" fill="color-mix(in srgb, var(--accent2) 75%, transparent)" />
        <Bar dataKey="wl3" name="WL3" stackId="w" fill="color-mix(in srgb, var(--amber) 75%, transparent)" />
        <Bar dataKey="wl4" name="WL4+" stackId="w" fill="color-mix(in srgb, var(--red) 70%, transparent)" radius={[3,3,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── GAUGE RING (SVG) ─────────────────────────────────────────────────────────
export function GaugeRing({ value, label, sublabel, color = COLORS.accent }: {
  value: number; label: string; sublabel: string; color?: string;
}) {
  // Slightly larger ring + thinner stroke → more inner clearance for the % label
  const cx = 36;
  const cy = 36;
  const r = 28;
  const strokeW = 5;
  const circumference = 2 * Math.PI * r;
  // Arc caps at 100% of circle; label still shows actual % (e.g. 113%)
  const arcPct = Math.min(Math.max(Number(value) || 0, 0), 100);
  const filled = (arcPct / 100) * circumference;
  const size = 84;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg viewBox="0 0 72 72" width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={COLORS.bg3} strokeWidth={strokeW} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={strokeW}
            strokeDasharray={`${filled} ${circumference}`} strokeLinecap="round" />
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center",
          justifyContent: "center", fontWeight: 700, fontSize: 15, color,
          lineHeight: 1.1, padding: "0 4px", textAlign: "center",
        }}>{formatPercent(Number(value))}</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: COLORS.text3, fontFamily: "'DM Mono',monospace", marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: COLORS.text2 }}>{sublabel}</div>
      </div>
    </div>
  );
}

// ─── BULLET CHART (HC Ideal vs Actual) ────────────────────────────────────────
type BulletItem = { name: string; actual: number; ideal: number; color: string };

export function HcBulletChart({ items }: { items: BulletItem[] }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((item) => {
        const rawPct = (item.actual / Math.max(item.ideal, 1)) * 100;
        const pct = Math.min(100, Math.round(rawPct));
        // item.color is often a CSS var (e.g. var(--green)); do not append hex digits — that breaks gradients.
        const fillBg = `linear-gradient(90deg, ${item.color}, color-mix(in srgb, ${item.color} 72%, transparent))`;
        return (
          <div key={item.name} className="bullet-wrap">
            <div className="bullet-label">
              <span style={{ fontSize: 11 }}>{item.name}</span>
              <span style={{ fontSize: 11, color: item.color }}>{formatNumber(item.actual)} / {formatNumber(item.ideal)}</span>
            </div>
            <div className="bullet-track">
              <div className="bullet-actual" style={{ width: `${pct}%`, background: fillBg }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal grouped bars — ideal vs actual HC per client (clearer than single % bullet). */
export function HcIdealActualGroupedChart({ items }: { items: BulletItem[] }) {
  if (!items.length) return null;
  const data = items.map((item) => ({
    name: item.name.length > 24 ? `${item.name.slice(0, 23)}…` : item.name,
    fullName: item.name,
    Ideal: Math.max(0, Number(item.ideal) || 0),
    Actual: Math.max(0, Number(item.actual) || 0),
  }));
  const maxVal = Math.max(1, ...data.flatMap((d) => [d.Ideal, d.Actual]));
  const height = Math.min(440, Math.max(200, 56 + data.length * 36));

  return (
    <div style={{ width: "100%" }}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 8, right: 8, left: 4, bottom: 8 }}
          barCategoryGap={12}
          barGap={6}
          style={CHART_STYLE}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} horizontal={false} />
          <XAxis
            type="number"
            domain={[0, Math.ceil(maxVal * 1.08)]}
            tick={{ fill: COLORS.text3, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={118}
            tick={{ fill: COLORS.text2, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number, name: string) => [formatNumber(value), name]}
            labelFormatter={(_l, payload) => {
              const p = payload?.[0]?.payload as { fullName?: string } | undefined;
              return p?.fullName ?? "";
            }}
          />
          <Legend
            iconSize={8}
            wrapperStyle={{ fontSize: 10, color: COLORS.text2, fontFamily: "'DM Mono',monospace", paddingTop: 4 }}
          />
          <Bar
            dataKey="Ideal"
            name="Ideal HC"
            fill="color-mix(in srgb, var(--accent2) 50%, transparent)"
            stroke="var(--accent2)"
            strokeWidth={1}
            radius={[0, 3, 3, 0]}
            maxBarSize={16}
          />
          <Bar
            dataKey="Actual"
            name="Actual HC"
            fill="var(--accent)"
            radius={[0, 3, 3, 0]}
            maxBarSize={16}
          />
        </BarChart>
      </ResponsiveContainer>
      <div
        style={{
          marginTop: 8,
          fontSize: 9.5,
          color: "var(--text-muted)",
          fontFamily: "'DM Mono',monospace",
          textAlign: "center",
        }}
      >
        Teal = ideal target · Orange = actual headcount · Same scale per client
      </div>
    </div>
  );
}

// ─── AGEING BARS ──────────────────────────────────────────────────────────────
type AgeingBucket = { label: string; count: number; max: number; color: string };

export function AgeingBars({ buckets }: { buckets: AgeingBucket[] }) {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {buckets.map((b) => (
        <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 70, fontSize: 10, color: COLORS.text3, fontFamily: "'DM Mono',monospace" }}>{b.label}</div>
          <div style={{ flex: 1, height: 10, background: COLORS.bg3, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 3, background: b.color, width: `${(b.count / maxCount) * 100}%`, transition: "width .5s" }} />
          </div>
          <div style={{ width: 30, textAlign: "right", fontSize: 10, fontFamily: "'DM Mono',monospace", color: b.color }}>{b.count}</div>
        </div>
      ))}
    </div>
  );
}

// ─── WATERFALL ────────────────────────────────────────────────────────────────
type WaterfallItem = { label: string; value: number; color: string; isTotal?: boolean };

export function WaterfallChart({ items }: { items: WaterfallItem[] }) {
  const maxAbs = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {items.map((item) => {
        const width = Math.abs(item.value / maxAbs) * 88;
        const isPositive = item.value >= 0;
        return (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
            <div style={{ width: 130, color: "var(--text2)", fontSize: 10 }}>{item.label}</div>
            <div style={{ flex: 1, position: "relative", height: 16 }}>
              <div style={{
                position: "absolute", height: "100%", borderRadius: 3,
                background: item.color, opacity: item.isTotal ? 0.8 : 0.65,
                left: isPositive ? 0 : "auto", right: isPositive ? "auto" : 0,
                width: `${width}%`,
              }} />
            </div>
            <div style={{ width: 80, textAlign: "right", fontFamily: "'DM Mono',monospace", fontSize: 10, color: item.color }}>
              {isPositive ? "+" : "−"}₹{Math.abs(item.value).toFixed(1)}Cr
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── RISK BAR ─────────────────────────────────────────────────────────────────
export function RiskBar({ score, color }: { score: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{ flex: 1, height: 3, background: "var(--bg3)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 2, background: color, width: `${score}%` }} />
      </div>
      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color }}>{score}</span>
    </div>
  );
}

// ─── SPARKLINE ────────────────────────────────────────────────────────────────
export function Sparkline({ data, color = COLORS.accent }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 60;
  const h = 22;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── SLA MULTI-ACCOUNT TIME SERIES ────────────────────────────────────────────
const SLA_SERIES_COLORS = [
  "var(--accent)", "var(--green)", "var(--amber)", "var(--red)", "var(--accent2)",
  "#a78bfa", "#ea580c", "#34d399", "#f472b6", "#0d9488",
];

export type SlaSeriesPoint = { month: string; [account: string]: number | string | null };

export function SlaTimeSeriesChart({
  data,
  accounts,
}: {
  data: SlaSeriesPoint[];
  accounts: string[];
}) {
  if (!data.length || !accounts.length) return null;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} style={CHART_STYLE}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis
          dataKey="month"
          tick={{ fill: COLORS.text3, fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: COLORS.text3, fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
          domain={[0, 100]}
          width={36}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: "var(--text)", fontFamily: "'DM Mono',monospace", marginBottom: 4 }}
          itemStyle={{ color: "var(--text)", fontFamily: "'DM Mono',monospace" }}
          formatter={(v: number) => [`${v}%`]}
        />
        <Legend
          iconSize={8}
          wrapperStyle={{ fontSize: 9, color: COLORS.text2, fontFamily: "'DM Mono',monospace" }}
        />
        {accounts.map((acc, i) => (
          <Line
            key={acc}
            type="monotone"
            dataKey={acc}
            name={acc}
            stroke={SLA_SERIES_COLORS[i % SLA_SERIES_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── SLA FY COMPARISON (categorical X: accounts or regions) ────────────────────
export type SlaFyComparePoint = { name: string; p1: number | null; p2: number | null };

export function SlaFyComparisonLineChart({
  data,
  labelP1,
  labelP2,
  height = 260,
}: {
  data: SlaFyComparePoint[];
  labelP1: string;
  labelP2: string;
  height?: number;
}) {
  if (!data.length) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.text3, fontSize: 11 }}>
        No data for this period
      </div>
    );
  }
  const tilt = data.length > 6;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} style={CHART_STYLE} margin={{ top: 8, right: 12, left: 4, bottom: tilt ? 52 : 12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis
          dataKey="name"
          tick={{ fill: COLORS.text3, fontSize: 8 }}
          interval={0}
          angle={tilt ? -32 : 0}
          textAnchor={tilt ? "end" : "middle"}
          height={tilt ? 56 : 28}
        />
        <YAxis
          tick={{ fill: COLORS.text3, fontSize: 9 }}
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          width={40}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => (v == null || v === "" ? "—" : `${v}%`)}
        />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: COLORS.text2, fontFamily: "'DM Mono',monospace" }} />
        <Line type="monotone" dataKey="p1" name={labelP1} stroke={COLORS.accent} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        <Line type="monotone" dataKey="p2" name={labelP2} stroke={COLORS.accent2} strokeWidth={2} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── SLA FY: portfolio Met vs Not Met snapshot counts (grouped by period) ─────
export type SlaFyCountDatum = { period: string; met: number; notMet: number };

export function SlaFyPortfolioMetNotMetBar({ data, height = 200 }: { data: SlaFyCountDatum[]; height?: number }) {
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} style={CHART_STYLE} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
        <XAxis dataKey="period" tick={{ fill: COLORS.text3, fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: COLORS.text3, fontSize: 9 }} allowDecimals={false} width={40} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Count"]} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: COLORS.text2, fontFamily: "'DM Mono',monospace" }} />
        <Bar dataKey="met" name="Met" fill="color-mix(in srgb, var(--green) 72%, transparent)" radius={[2, 2, 0, 0]} />
        <Bar dataKey="notMet" name="Not met" fill="color-mix(in srgb, var(--red) 70%, transparent)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── SLA: FY comparison as grouped bars (regions / accounts) ─────────────────
export function SlaFyComparisonGroupedBar({
  data,
  labelP1,
  labelP2,
  height = 260,
}: {
  data: SlaFyComparePoint[];
  labelP1: string;
  labelP2: string;
  height?: number;
}) {
  if (!data.length) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.text3, fontSize: 11 }}>
        No data for this period
      </div>
    );
  }
  const tilt = data.length > 6;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} style={CHART_STYLE} margin={{ top: 8, right: 12, left: 4, bottom: tilt ? 48 : 12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: COLORS.text3, fontSize: 8 }}
          interval={0}
          angle={tilt ? -32 : 0}
          textAnchor={tilt ? "end" : "middle"}
          height={tilt ? 52 : 28}
        />
        <YAxis tick={{ fill: COLORS.text3, fontSize: 9 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={40} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => (v == null || v === "" ? "—" : `${v}%`)} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: COLORS.text2, fontFamily: "'DM Mono',monospace" }} />
        <Bar dataKey="p1" name={labelP1} fill="color-mix(in srgb, var(--accent) 65%, transparent)" radius={[2, 2, 0, 0]} />
        <Bar dataKey="p2" name={labelP2} fill="color-mix(in srgb, var(--accent2) 65%, transparent)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── SLA: Met % horizontal rank (executive tiles) ─────────────────────────────
export type SlaRankBarDatum = { name: string; value: number };

export function SlaExecutiveMetPctBar({ data, height = 140 }: { data: SlaRankBarDatum[]; height?: number }) {
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={data} style={CHART_STYLE} margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} horizontal />
        <XAxis type="number" domain={[0, 100]} tick={{ fill: COLORS.text3, fontSize: 8 }} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="name" width={88} tick={{ fill: COLORS.text3, fontSize: 8 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)}%`, "Met %"]} />
        <Bar dataKey="value" name="Met %" fill="color-mix(in srgb, var(--accent) 55%, transparent)" radius={[0, 3, 3, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export type SlaDeltaBarDatum = { name: string; delta: number };

export function SlaExecutiveDeltaBar({ data, height = 140 }: { data: SlaDeltaBarDatum[]; height?: number }) {
  if (!data.length) return null;
  const vals = data.map((d) => d.delta);
  const maxAbs = Math.max(5, ...vals.map((v) => Math.abs(v)));
  const domain: [number, number] = [-maxAbs, maxAbs];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={data} style={CHART_STYLE} margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} horizontal />
        <XAxis type="number" domain={domain} tick={{ fill: COLORS.text3, fontSize: 8 }} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="name" width={88} tick={{ fill: COLORS.text3, fontSize: 8 }} axisLine={false} tickLine={false} />
        <ReferenceLine x={0} stroke={COLORS.border} strokeDasharray="4 3" />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v >= 0 ? "+" : ""}${v.toFixed(1)} pp`, "Δ Met %"]} />
        <Bar dataKey="delta" radius={[0, 3, 3, 0]} barSize={14}>
          {data.map((e, i) => (
            <Cell key={i} fill={e.delta >= 0 ? "color-mix(in srgb, var(--green) 65%, transparent)" : "color-mix(in srgb, var(--red) 65%, transparent)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── SLA: portfolio Met vs Not met (single FY window) — doughnut ──────────────
export function SlaMetNotMetDonut({
  met,
  notMet,
  label,
  height = 168,
}: {
  met: number;
  notMet: number;
  label: string;
  height?: number;
}) {
  const total = met + notMet;
  if (total <= 0) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.text3, fontSize: 11, textAlign: "center", padding: 8 }}>
        No met / not-met snapshots in window
      </div>
    );
  }
  const pieData = [
    { name: "Met", value: met },
    { name: "Not met", value: notMet },
  ];
  return (
    <div style={{ width: "100%" }}>
      <div style={{ fontSize: 10, color: COLORS.text2, fontFamily: "'DM Mono',monospace", textAlign: "center", marginBottom: 4 }}>{label}</div>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={44}
            outerRadius={62}
            dataKey="value"
            paddingAngle={2}
            label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
            labelLine={false}
          >
            <Cell fill="color-mix(in srgb, var(--green) 75%, transparent)" />
            <Cell fill="color-mix(in srgb, var(--red) 72%, transparent)" />
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Snapshots"]} />
          <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: COLORS.text2, fontFamily: "'DM Mono',monospace" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── SLA: client Met % vs portfolio benchmark (grouped %) ───────────────────────
export type SlaBenchmarkDatum = { name: string; client: number; benchmark: number };

export function SlaBenchmarkGroupedBar({ data, benchmarkLabel, height = 260 }: { data: SlaBenchmarkDatum[]; benchmarkLabel: string; height?: number }) {
  if (!data.length) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.text3, fontSize: 11 }}>
        No comparison data
      </div>
    );
  }
  const tilt = data.length > 5;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} style={CHART_STYLE} margin={{ top: 8, right: 12, left: 4, bottom: tilt ? 44 : 12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: COLORS.text3, fontSize: 8 }}
          interval={0}
          angle={tilt ? -28 : 0}
          textAnchor={tilt ? "end" : "middle"}
          height={tilt ? 48 : 28}
        />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: COLORS.text3, fontSize: 9 }} width={36} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)}%`]} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: COLORS.text2, fontFamily: "'DM Mono',monospace" }} />
        <Bar dataKey="client" name="Client Met %" fill="color-mix(in srgb, var(--accent) 62%, transparent)" radius={[2, 2, 0, 0]} />
        <Bar dataKey="benchmark" name={benchmarkLabel} fill="color-mix(in srgb, var(--text-subtle) 45%, transparent)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── SLA: not-reported snapshot counts (vertical bar) ─────────────────────────
export type SlaCountDatum = { name: string; count: number };

export function SlaNotReportedCountBar({ data, height = 200 }: { data: SlaCountDatum[]; height?: number }) {
  if (!data.length) return null;
  const tilt = data.length > 7;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} style={CHART_STYLE} margin={{ bottom: tilt ? 40 : 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: COLORS.text3, fontSize: 8 }}
          interval={0}
          angle={tilt ? -32 : 0}
          textAnchor={tilt ? "end" : "middle"}
          height={tilt ? 44 : 24}
        />
        <YAxis allowDecimals={false} tick={{ fill: COLORS.text3, fontSize: 9 }} width={32} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Not-reported snapshots"]} />
        <Bar dataKey="count" name="Not reported" fill="color-mix(in srgb, var(--amber) 55%, transparent)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── SLA: one metric, months stacked met / not met / not reported ───────────
export type SlaMetricMonthStackDatum = { month: string; met: number; notMet: number; notReported: number };

export function SlaMetricMonthStackedBar({
  data,
  height = 160,
}: {
  data: SlaMetricMonthStackDatum[];
  height?: number;
}) {
  if (!data.length) return null;
  const tilt = data.length > 6;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} style={CHART_STYLE} margin={{ bottom: tilt ? 36 : 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fill: COLORS.text3, fontSize: 8 }}
          interval={0}
          angle={tilt ? -40 : 0}
          textAnchor={tilt ? "end" : "middle"}
          height={tilt ? 48 : 22}
        />
        <YAxis tick={{ fill: COLORS.text3, fontSize: 9 }} allowDecimals={false} width={32} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 9, color: COLORS.text2 }} />
        <Bar dataKey="met" name="Met" stackId="s" fill="color-mix(in srgb, var(--green) 70%, transparent)" />
        <Bar dataKey="notMet" name="Not Met" stackId="s" fill="color-mix(in srgb, var(--red) 70%, transparent)" />
        <Bar dataKey="notReported" name="Not Reported" stackId="s" fill="color-mix(in srgb, var(--text-subtle) 40%, transparent)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── COMPLIANCE MATRIX ────────────────────────────────────────────────────────
type MatrixRow = { metric: string; scores: Array<"met" | "near" | "breached" | "none"> };

export function ComplianceMatrix({ months, rows }: { months: string[]; rows: MatrixRow[] }) {
  const cellStyle = (s: string): React.CSSProperties => {
    if (s === "met") return { background: "color-mix(in srgb, var(--green) 15%, transparent)", color: "var(--green)" };
    if (s === "near") return { background: "color-mix(in srgb, var(--amber) 15%, transparent)", color: "var(--amber)" };
    if (s === "breached") return { background: "color-mix(in srgb, var(--red) 15%, transparent)", color: "var(--red)" };
    return { background: "color-mix(in srgb, var(--text-subtle) 8%, transparent)", color: "var(--text-muted)" };
  };
  const cellLabel = (s: string) => s === "met" ? "✓" : s === "near" ? "~" : s === "breached" ? "✗" : "–";
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="platform-table" style={{ fontSize: 10 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Metric</th>
            {months.map((m) => <th key={m} style={{ textAlign: "center" }}>{m}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.metric}>
              <td style={{ color: "var(--text2)", fontSize: 10 }}>{row.metric}</td>
              {row.scores.map((s, i) => (
                <td key={i} style={{ textAlign: "center" }}>
                  <div style={{
                    width: 28, height: 18, borderRadius: 3, display: "inline-flex",
                    alignItems: "center", justifyContent: "center", fontSize: 9,
                    fontFamily: "'DM Mono',monospace", fontWeight: 500,
                    ...cellStyle(s),
                  }}>{cellLabel(s)}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Budget bar value labels — dark ink so they read on pale slate bars (avoid theme white/--text on light fills). */
const YOY_BUDGET_LABEL_STYLE: React.CSSProperties = {
  fill: "#1e293b",
  fontSize: 8,
  fontWeight: 600,
  fontFamily: "'DM Mono', monospace",
};

function formatYoyBudgetCr(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n >= 10 ? `${n.toFixed(0)}` : n >= 1 ? `${n.toFixed(1)}` : `${n.toFixed(2)}`;
}

// ─── EXECUTIVE DASHBOARD: REVENUE YoY (₹ Cr) ─────────────────────────────────
export function ExecutiveRevenueYoYChart({
  data,
  priorLabel,
}: {
  data: YoYRevPoint[];
  priorLabel: string;
}) {
  if (!data.length) {
    return (
      <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.text3, fontSize: 11 }}>
        No finance rows for filters — upload Finance data or widen filters
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} style={CHART_STYLE} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis dataKey="month" tick={{ fill: COLORS.text3, fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: COLORS.text3, fontSize: 9 }} axisLine={false} tickLine={false}
          tickFormatter={(v) => `₹${v}`} width={44} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, name: string) => [`₹${Number(v).toFixed(2)} Cr`, name]}
        />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: COLORS.text2 }} />
        {/* Slate bars: strong enough vs page bg; neutral hue avoids clashing with prior-year blue line */}
        <Bar
          dataKey="budget"
          name="Budget"
          fill="#64748b"
          fillOpacity={0.48}
          radius={[2, 2, 0, 0]}
        >
          <LabelList
            dataKey="budget"
            position="insideTop"
            formatter={formatYoyBudgetCr}
            style={YOY_BUDGET_LABEL_STYLE}
          />
        </Bar>
        <Line type="monotone" dataKey="actual" name="Actual" stroke={COLORS.accent} strokeWidth={2.5} dot={{ r: 2 }} />
        <Line type="monotone" dataKey="forecast" name="Forecast" stroke={COLORS.amber} strokeWidth={1.8} strokeDasharray="5 4" dot={{ r: 1.5 }} />
        <Line
          type="monotone"
          dataKey="priorActual"
          name={priorLabel}
          stroke="#2563eb"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={{ r: 1.5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── EXECUTIVE DASHBOARD: CM% YoY ───────────────────────────────────────────
export function ExecutiveCmYoYChart({
  data,
  compareLabel = "Comparison FY",
}: {
  data: YoYCmPoint[];
  /** Legend + tooltip name for the dashed comparison series (e.g. "FY24–25 Actual") */
  compareLabel?: string;
}) {
  if (!data.length) {
    return (
      <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.text3, fontSize: 11 }}>
        No CM data for filters
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} style={CHART_STYLE} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis dataKey="month" tick={{ fill: COLORS.text3, fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis
          domain={[0, "auto"]}
          tick={{ fill: COLORS.text3, fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
          width={40}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, ""]} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: COLORS.text2 }} />
        <ReferenceLine y={35} stroke={COLORS.text3} strokeDasharray="4 4" label={{ value: "Ref 35%", fill: COLORS.text3, fontSize: 9 }} />
        <Line type="monotone" dataKey="actualPct" name="CM% Actual" stroke={COLORS.accent} strokeWidth={2.5} dot={{ r: 2 }} />
        <Line
          type="monotone"
          dataKey="priorActualPct"
          name={compareLabel}
          stroke="#2563eb"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={{ r: 1.5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── REGIONAL REVENUE (grouped bar) ──────────────────────────────────────────
/** Budget series: high-contrast neutral (reads on light + dark surfaces). */
const REGIONAL_BUDGET_FILL = "color-mix(in srgb, var(--text) 42%, var(--border2))";
const REGIONAL_BUDGET_STROKE = "color-mix(in srgb, var(--text) 55%, var(--border))";
/** Actual: full accent + stroke so bars read clearly vs budget. */
const REGIONAL_ACTUAL_FILL = "var(--accent)";
const REGIONAL_ACTUAL_STROKE = "color-mix(in srgb, var(--accent) 82%, #1c1917)";

const axisTickMuted = { fill: "var(--text-muted)", fontSize: 10, fontWeight: 500, fontFamily: "'DM Mono', monospace" };
const regionalLegendStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text)",
  fontFamily: "'DM Mono', monospace",
  paddingTop: 8,
};

const regionalLabelStyle: React.CSSProperties = {
  fill: "var(--text)",
  fontSize: 9,
  fontWeight: 600,
  fontFamily: "'DM Mono', monospace",
};

function regionalCrLabel(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n >= 10 ? `${n.toFixed(0)}` : n >= 1 ? `${n.toFixed(1)}` : `${n.toFixed(2)}`;
}

export function RegionalRevenueBarChart({ data }: { data: RegionBarDatum[] }) {
  if (!data.length) {
    return (
      <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.text3, fontSize: 11 }}>
        No regional breakdown — check filters
      </div>
    );
  }
  const peakCr = Math.max(0.01, ...data.map((d) => Math.max(d.actual, d.budget)));
  const yMaxCr = Math.ceil(peakCr * 1.14 * 10) / 10;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} style={CHART_STYLE} margin={{ top: 18, right: 10, left: 2, bottom: 36 }} barCategoryGap="18%" barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
        <XAxis
          dataKey="region"
          tick={axisTickMuted}
          axisLine={{ stroke: "var(--border2)" }}
          tickLine={false}
          interval={0}
          angle={-18}
          textAnchor="end"
          height={52}
        />
        <YAxis
          tick={axisTickMuted}
          tickFormatter={(v) => `₹${v} Cr`}
          width={52}
          axisLine={false}
          tickLine={false}
          domain={[0, yMaxCr]}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "color-mix(in srgb, var(--accent) 8%, transparent)" }}
          formatter={(v: number, name: string) => [`₹${Number(v).toFixed(2)} Cr`, name]}
          labelStyle={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}
        />
        <Legend verticalAlign="bottom" height={28} iconType="square" iconSize={10} wrapperStyle={regionalLegendStyle} />
        <Bar
          dataKey="budget"
          name="Budget"
          fill={REGIONAL_BUDGET_FILL}
          stroke={REGIONAL_BUDGET_STROKE}
          strokeWidth={1}
          radius={[3, 3, 0, 0]}
          maxBarSize={40}
        >
          <LabelList dataKey="budget" position="top" formatter={regionalCrLabel} style={regionalLabelStyle} />
        </Bar>
        <Bar
          dataKey="actual"
          name="Actual"
          fill={REGIONAL_ACTUAL_FILL}
          stroke={REGIONAL_ACTUAL_STROKE}
          strokeWidth={1}
          radius={[3, 3, 0, 0]}
          maxBarSize={40}
        >
          <LabelList dataKey="actual" position="top" formatter={regionalCrLabel} style={regionalLabelStyle} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
