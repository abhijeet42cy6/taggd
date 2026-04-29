/**
 * Board narrative slides — reference deck (config-driven).
 * Styling: design_style_guide + ceo-board-slides.css
 */
import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
} from "recharts";
import {
  Building2,
  Crown,
  MessageCircle,
  Rocket,
  Star,
  User,
} from "lucide-react";
import type { CeoSlideDeckConfig } from "@/lib/ceo-slide-deck/types";
import { DeckSelectableRegion } from "@/components/ceo/DeckSelectableRegion";
import "@/styles/ceo-board-slides.css";

const BLUE = "#3884ff";
const ORANGE = "#e16f3d";
const RAMP = "#f59e0b";
const NEWC = "#14b8a6";

function SlideShell({
  title,
  children,
  imageRef,
  deckKey,
}: {
  title: string;
  children: React.ReactNode;
  imageRef: string;
  /** Enables studio region selection for `deckKey.title` */
  deckKey?: string;
}) {
  const heading =
    deckKey != null ? (
      <DeckSelectableRegion deckPath={`${deckKey}.title`} label="Slide headline">
        <h2 className="ceo-slide__title">{title}</h2>
      </DeckSelectableRegion>
    ) : (
      <h2 className="ceo-slide__title">{title}</h2>
    );
  return (
    <section className="ceo-slide" aria-label={title} data-slide-ref={imageRef}>
      {heading}
      {children}
    </section>
  );
}

/* ─── Slide 1: Financial Performance ─── */
function SlideFinancial({ d }: { d: CeoSlideDeckConfig["financialPerformance"] }) {
  const totalData = d.totalRevenueByYear.map((x) => ({ name: x.label, total: x.value }));
  const stackData = d.composition.map((c) => ({
    name: c.year,
    Existing: c.existing,
    "Ramp-Up": c.rampUp,
    New: c.anew,
  }));

  return (
    <SlideShell title={d.title} imageRef="slide-01-financial-performance" deckKey="financialPerformance">
      <div className="ceo-slide__grid-3">
        <DeckSelectableRegion deckPath="financialPerformance.totalRevenueByYear" label="Total revenue data">
          <div className="ceo-slide__chart-card">
            <div className="ceo-slide__chart-title">Total revenue</div>
            <div className="ceo-slide__chart-h">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={totalData} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="total" fill={BLUE} radius={[4, 4, 0, 0]} label={{ position: "top", fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </DeckSelectableRegion>
        <DeckSelectableRegion deckPath="financialPerformance.composition" label="Composition by year">
          <div className="ceo-slide__chart-card">
            <div className="ceo-slide__chart-title">Revenue composition</div>
            <div className="ceo-slide__chart-h">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stackData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Existing" stackId="a" fill={BLUE} />
                  <Bar dataKey="Ramp-Up" stackId="a" fill={RAMP} />
                  <Bar dataKey="New" stackId="a" fill={NEWC} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </DeckSelectableRegion>
        <DeckSelectableRegion deckPath="financialPerformance.metricCards" label="Hero metric tiles">
          <div className="ceo-slide__metric-col">
            {d.metricCards.map((m) => (
              <div key={m.title} className="ceo-slide__mini-metric">
                <div className="ceo-slide__mini-metric-primary" style={{ color: ORANGE }}>
                  {m.primary}
                </div>
                <div className="ceo-slide__mini-metric-label">{m.title}</div>
                <div className="ceo-slide__mini-metric-sub">{m.sub}</div>
              </div>
            ))}
          </div>
        </DeckSelectableRegion>
      </div>
      <div className="ceo-slide__callout">
        <div className="ceo-slide__callout-bar" />
        <div>
          <DeckSelectableRegion deckPath="financialPerformance.landExpandTitle" label="Callout title">
            <strong className="ceo-slide__callout-kicker">{d.landExpandTitle}</strong>
          </DeckSelectableRegion>{" "}
          <DeckSelectableRegion deckPath="financialPerformance.landExpandBody" label="Callout body">
            <span>{d.landExpandBody}</span>
          </DeckSelectableRegion>
        </div>
      </div>
    </SlideShell>
  );
}

/* ─── Slide 2: Scale & Efficiency ─── */
function SlideScale({ d }: { d: CeoSlideDeckConfig["scaleEfficiency"] }) {
  const hireData = d.hiringVolume.map((h) => ({ name: h.year, vol: h.volume, rph: h.rphSub }));
  const rpeData = d.revenuePerEmployee.map((r) => ({ name: r.year, rev: r.value }));

  return (
    <SlideShell title={d.title} imageRef="slide-02-scale-efficiency" deckKey="scaleEfficiency">
      <div className="ceo-slide__grid-3 ceo-slide__grid-3--split">
        <DeckSelectableRegion deckPath="scaleEfficiency.hiringVolume" label="Hiring volume & RPH">
          <div className="ceo-slide__chart-card">
            <div className="ceo-slide__chart-title">Hiring volume</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hireData} margin={{ top: 28, right: 8, left: 0, bottom: 32 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="vol" fill={BLUE} radius={[4, 4, 0, 0]} label={{ position: "top", fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
            <div className="ceo-slide__axis-sub">
              {d.hiringVolume.map((h) => (
                <span key={h.year} className="ceo-slide__axis-sub-i">
                  {h.rphSub}
                </span>
              ))}
            </div>
          </div>
        </DeckSelectableRegion>
        <DeckSelectableRegion deckPath="scaleEfficiency.revenuePerEmployee" label="Revenue / employee">
          <div className="ceo-slide__chart-card">
            <div className="ceo-slide__chart-title">Revenue / Employee</div>
            <ResponsiveContainer width="100%" height={232}>
              <LineChart data={rpeData} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="rev" stroke={BLUE} strokeWidth={2} dot={{ r: 5, fill: BLUE }} label={{ position: "top", fontSize: 10 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </DeckSelectableRegion>
        <DeckSelectableRegion deckPath="scaleEfficiency.kpiTable" label="KPI table">
          <div className="ceo-slide__table-wrap">
            <div className="ceo-slide__chart-title">Key success indicators</div>
            <table className="ceo-slide__kpi-table">
            <thead>
              <tr>
                {d.kpiTable.headers.map((h) => (
                  <th key={h || "corner"}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.kpiTable.rows.map((row) => (
                <tr key={row.metric}>
                  <td>{row.metric}</td>
                  <td>{row.fy24}</td>
                  <td>{row.fy25}</td>
                  <td>{row.fy26}</td>
                  <td>
                    <strong>{row.delta}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </DeckSelectableRegion>
      </div>
      <div className="ceo-slide__callout">
        <div className="ceo-slide__callout-bar" />
        <div>
          <DeckSelectableRegion deckPath="scaleEfficiency.efficiencyTitle" label="Efficiency callout title">
            <strong className="ceo-slide__callout-kicker" style={{ color: ORANGE }}>
              {d.efficiencyTitle}
            </strong>
          </DeckSelectableRegion>
          <DeckSelectableRegion deckPath="scaleEfficiency.efficiencyBody" label="Efficiency callout body">
            <p className="ceo-slide__callout-p">{d.efficiencyBody}</p>
          </DeckSelectableRegion>
        </div>
      </div>
    </SlideShell>
  );
}

/* ─── Slide 3: Industry ─── */
function SlideIndustry({ d }: { d: CeoSlideDeckConfig["industryDiversification"] }) {
  const pieData = d.donutSegments.map((s) => ({ name: s.name, value: s.pct, color: s.color }));

  return (
    <SlideShell title={d.title} imageRef="slide-03-industry-mix" deckKey="industryDiversification">
      <div className="ceo-slide__grid-2">
        <DeckSelectableRegion deckPath="industryDiversification.donutSegments" label="Industry mix donut">
          <div className="ceo-slide__chart-card ceo-slide__donut-card">
            <div className="ceo-slide__chart-title">{d.donutLabel}</div>
            <div className="ceo-slide__donut-row">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={68} outerRadius={100} paddingAngle={1}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="var(--surface-raised)" />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v}%`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </DeckSelectableRegion>
        <DeckSelectableRegion deckPath="industryDiversification.industries" label="Industry comparison table">
          <div className="ceo-slide__chart-card">
            <div className="ceo-slide__chart-title">{d.tableTitle}</div>
            <div className="ceo-slide__chart-sub">{d.tableSubtitle}</div>
            <table className="ceo-slide__industry-table">
            <thead>
              <tr>
                <th>Industry</th>
                <th>FY24</th>
                <th>FY26E</th>
                <th>Shift</th>
              </tr>
            </thead>
            <tbody>
              {d.industries.map((row) => {
                const shift = row.fy26e - row.fy24;
                const pos = shift > 0;
                return (
                  <tr key={row.industry}>
                    <td>
                      <span className="ceo-slide__dot" style={{ background: row.color }} />
                      {row.industry}
                    </td>
                    <td>{row.fy24}%</td>
                    <td>{row.fy26e}%</td>
                    <td className={pos ? "ceo-slide__shift-pos" : ""}>
                      {shift >= 0 ? "+" : ""}
                      {shift.toFixed(1)}pp
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </DeckSelectableRegion>
      </div>
    </SlideShell>
  );
}

/* ─── Slide 4: New Business ─── */
function SlideNewBusiness({ d }: { d: CeoSlideDeckConfig["newBusinessRetention"] }) {
  const barData = d.acvBar.map((b) => ({ name: b.year, acv: b.value }));

  return (
    <SlideShell title={d.title} imageRef="slide-04-acv-retention" deckKey="newBusinessRetention">
      <DeckSelectableRegion deckPath="newBusinessRetention.kpiRow1" label="Top KPI tiles">
      <div className="ceo-slide__kpi-grid-4">
        {d.kpiRow1.map((k) => (
          <div key={k.label} className="ceo-slide__acv-card">
            <div className="ceo-slide__acv-primary">{k.primary}</div>
            <div className="ceo-slide__acv-label">{k.label}</div>
            <div className="ceo-slide__acv-sub">{k.sub}</div>
          </div>
        ))}
      </div>
      </DeckSelectableRegion>
      <DeckSelectableRegion deckPath="newBusinessRetention.kpiRow2" label="Secondary KPI tiles">
      <div className="ceo-slide__kpi-grid-3">
        {d.kpiRow2.map((k) => (
          <div key={k.label} className="ceo-slide__acv-card ceo-slide__acv-card--lg">
            <div className="ceo-slide__acv-primary">{k.primary}</div>
            <div className="ceo-slide__acv-label">{k.label}</div>
            <div className="ceo-slide__acv-sub">{k.sub}</div>
          </div>
        ))}
      </div>
      </DeckSelectableRegion>
      <div className="ceo-slide__grid-2 ceo-slide__grid-2--acv-bottom">
        <DeckSelectableRegion deckPath="newBusinessRetention.acvBar" label="New ACV chart">
        <div className="ceo-slide__chart-card">
          <div className="ceo-slide__chart-title">New ACV</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="acv" fill={BLUE} radius={[4, 4, 0, 0]} label={{ position: "top" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        </DeckSelectableRegion>
        <DeckSelectableRegion deckPath="newBusinessRetention.strengths" label="Growth strengths bullets">
        <div className="ceo-slide__strengths">
          <div className="ceo-slide__strengths-bar" />
          <div>
            <DeckSelectableRegion deckPath="newBusinessRetention.strengthsTitle" label="Strengths heading">
              <div className="ceo-slide__strengths-title">{d.strengthsTitle}</div>
            </DeckSelectableRegion>
            <ol className="ceo-slide__strengths-list">
              {d.strengths.map((s) => (
                <li key={s.num}>
                  <span className="ceo-slide__strengths-num">{s.num}</span> {s.text}
                </li>
              ))}
            </ol>
          </div>
        </div>
        </DeckSelectableRegion>
      </div>
    </SlideShell>
  );
}

/* ─── Slide 5: Growth Journey ─── */
function SlideGrowth({ d }: { d: CeoSlideDeckConfig["growthJourney"] }) {
  /** Highlight FY 25–26 bars (indices 0–1) vs forward years — match reference deck. */
  const histIdx = d.revenueYoY.findIndex((r) => r.year.trim() === d.highlightYear.trim());
  const isHist = (i: number) => (histIdx >= 0 ? i <= histIdx : i <= 1);

  return (
    <SlideShell title={d.title} imageRef="slide-05-growth-journey" deckKey="growthJourney">
      <DeckSelectableRegion deckPath="growthJourney" label="Growth journey (charts & sidebar)">
      <div className="ceo-slide__growth-wrap">
        <div className="ceo-slide__growth-grid">
          <div className="ceo-slide__chart-card">
            <div className="ceo-slide__chart-title">Revenue (Y-o-Y) (INR Cr.)</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={d.revenueYoY.map((r, i) => ({ ...r, i }))} margin={{ top: 28, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="year" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {d.revenueYoY.map((r, i) => (
                    <Cell
                      key={i}
                      fill={isHist(i) ? BLUE : ORANGE}
                      stroke={r.year.trim() === d.highlightYear.trim() ? "#111" : "none"}
                      strokeWidth={2}
                      strokeDasharray={r.year.trim() === d.highlightYear.trim() ? "4 2" : undefined}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="ceo-slide__growth-tag">{d.revenueGrowthTag}</div>
          </div>
          <div className="ceo-slide__chart-card">
            <div className="ceo-slide__chart-title">Contribution margin (Y-o-Y) (INR Cr.)</div>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={d.ebitdaYoY.map((e, i) => ({ ...e, i }))} margin={{ top: 28, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="year" tick={{ fontSize: 9 }} />
                <YAxis yAxisId="l" tick={{ fontSize: 9 }} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9 }} domain={[0, 40]} />
                <Tooltip />
                <Bar yAxisId="l" dataKey="bar" radius={[3, 3, 0, 0]}>
                  {d.ebitdaYoY.map((_, i) => (
                    <Cell key={i} fill={isHist(i) ? BLUE : ORANGE} />
                  ))}
                </Bar>
                <Line yAxisId="r" type="monotone" dataKey="marginPct" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="ceo-slide__growth-tag">{d.ebitdaGrowthTag}</div>
          </div>
          <div className="ceo-slide__chart-card">
            <div className="ceo-slide__chart-title">New ACV Growth (INR CR)</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={d.newAcv.map((r, i) => ({ ...r, i }))} margin={{ top: 28, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="year" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {d.newAcv.map((_, i) => (
                    <Cell key={i} fill={isHist(i) ? BLUE : ORANGE} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="ceo-slide__chart-card">
            <div className="ceo-slide__chart-title">Gross Margin</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={d.grossMarginPct.map((r, i) => ({ ...r, i }))} margin={{ top: 28, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="year" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
                <Tooltip formatter={(v) => [`${v}%`, ""]} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {d.grossMarginPct.map((_, i) => (
                    <Cell key={i} fill={isHist(i) ? BLUE : ORANGE} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <aside className="ceo-slide__growth-rail">
          <div className="ceo-slide__growth-rail-kpis">
            {d.sidebarKpis.map((k) => (
              <div key={k.label} className="ceo-slide__rail-kpi">
                <div className="ceo-slide__rail-kpi-p">{k.primary}</div>
                <div className="ceo-slide__rail-kpi-l">{k.label}</div>
              </div>
            ))}
          </div>
          <ul className="ceo-slide__rail-bullets">
            {d.sidebarBullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </aside>
      </div>
        <p className="ceo-slide__footer-note">{d.footerNote}</p>
      </DeckSelectableRegion>
    </SlideShell>
  );
}

/** Stacked invisible base + visible delta for waterfall (bridge) chart. */
function buildWaterfallChartData(steps: CeoSlideDeckConfig["revenueBridge"]["steps"]) {
  let run = 0;
  const out: { name: string; base: number; val: number; color: string }[] = [];
  for (const s of steps) {
    if (s.kind === "total") {
      out.push({ name: s.label, base: 0, val: s.value, color: BLUE });
      run = s.value;
    } else if (s.kind === "increase") {
      out.push({ name: s.label, base: run, val: s.value, color: "#5b9bd5" });
      run += s.value;
    } else if (s.kind === "decrease") {
      const newRun = run + s.value;
      out.push({ name: s.label, base: newRun, val: Math.abs(s.value), color: "#ed7d31" });
      run = newRun;
    } else if (s.kind === "final") {
      out.push({ name: s.label, base: 0, val: s.value, color: "#92ead3" });
    }
  }
  return out;
}

function SlideBridge({ d }: { d: CeoSlideDeckConfig["revenueBridge"] }) {
  const chartData = buildWaterfallChartData(d.steps);

  return (
    <SlideShell title={d.title} imageRef="slide-06-revenue-bridge" deckKey="revenueBridge">
      <DeckSelectableRegion deckPath="revenueBridge.steps" label="Waterfall / bridge series">
      <div className="ceo-slide__chart-card">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 16, right: 16, left: 8, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={60} />
            <YAxis domain={[0, d.yMax]} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: number) => v} />
            <Bar dataKey="base" stackId="w" fill="transparent" />
            <Bar dataKey="val" stackId="w">
              {chartData.map((b, i) => (
                <Cell key={i} fill={b.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      </DeckSelectableRegion>
      <p className="ceo-slide__bridge-legend">Blue: start &amp; increases · Orange: decrease · Mint: ending total</p>
    </SlideShell>
  );
}

function SlideUnitEconomics({ d }: { d: CeoSlideDeckConfig["unitEconomics"] }) {
  return (
    <SlideShell title={d.title} imageRef="slide-07-unit-economics" deckKey="unitEconomics">
      <DeckSelectableRegion deckPath="unitEconomics" label="Unit economics (table & note)">
      <div className="ceo-slide__table-scroll">
        <table className="ceo-slide__unit-table">
          <thead>
            <tr>
              {d.headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.rows.map((row, i) => {
              if (row.type === "section") {
                return (
                  <tr key={i} className="ceo-slide__unit-section">
                    <td colSpan={5}>{row.metric}</td>
                  </tr>
                );
              }
              const summary = row.type === "summary";
              return (
                <tr key={i} className={summary ? "ceo-slide__unit-summary" : ""}>
                  <td className={row.metric.startsWith(" ") ? "ceo-slide__unit-indent" : ""}>{row.metric}</td>
                  <td>{row.fy25}</td>
                  <td>{row.fy26}</td>
                  <td>{row.fy27}</td>
                  <td>{row.fy30}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="ceo-slide__footer-note">{d.footerNote}</p>
      </DeckSelectableRegion>
    </SlideShell>
  );
}

function SlideHiring({ d }: { d: CeoSlideDeckConfig["hiringSourceMix"] }) {
  const donut = d.donut.map((x) => ({ ...x, name: x.name, value: x.pct }));
  const seriesKeys = Object.keys(d.seriesColors);

  return (
    <SlideShell title={d.title} imageRef="slide-08-hiring-mix" deckKey="hiringSourceMix">
      <div className="ceo-slide__grid-2">
        <DeckSelectableRegion deckPath="hiringSourceMix.donut" label="Hiring mix donut">
        <div className="ceo-slide__chart-card">
          <div className="ceo-slide__chart-title">Overall hiring mix</div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={donut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={95}>
                {donut.map((e, i) => (
                  <Cell key={i} fill={e.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        </DeckSelectableRegion>
        <DeckSelectableRegion deckPath="hiringSourceMix.stackedSectors" label="Sector stack bars">
        <div className="ceo-slide__chart-card">
          <div className="ceo-slide__chart-title">Sector-wise breakdown</div>
          <div className="ceo-slide__stack-list">
            {d.stackedSectors.map((sec) => (
              <div key={sec.sector} className="ceo-slide__stack-row">
                <span className="ceo-slide__stack-name">{sec.sector}</span>
                <div className="ceo-slide__stack-bar">
                  {sec.series.map((s) => (
                    <span
                      key={s.name}
                      className="ceo-slide__stack-seg"
                      style={{
                        width: `${s.pct}%`,
                        background: d.seriesColors[s.name] ?? "#94a3b8",
                      }}
                      title={`${s.name}: ${s.pct}%`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="ceo-slide__stack-legend">
            {seriesKeys.map((k) => (
              <span key={k} className="ceo-slide__stack-legend-i">
                <span className="ceo-slide__dot" style={{ background: d.seriesColors[k] }} />
                {k}
              </span>
            ))}
          </div>
        </div>
        </DeckSelectableRegion>
      </div>
      <DeckSelectableRegion deckPath="hiringSourceMix.insights" label="Insights list">
      <ul className="ceo-slide__insights">
        {d.insights.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      </DeckSelectableRegion>
    </SlideShell>
  );
}

const ICONS = {
  building: Building2,
  star: Star,
  message: MessageCircle,
  rocket: Rocket,
  crown: Crown,
  user: User,
} as const;

function SlidePeople({ d }: { d: CeoSlideDeckConfig["peopleCapability"] }) {
  return (
    <SlideShell title={d.title} imageRef="slide-09-people" deckKey="peopleCapability">
      <DeckSelectableRegion deckPath="peopleCapability" label="People & capability slide">
      <p className="ceo-slide__subtitle">{d.subtitle}</p>
      <div className="ceo-slide__people-banner">
        {d.bannerMetrics.map((m) => (
          <div key={m.label} className="ceo-slide__people-banner-i">
            <span className="ceo-slide__people-banner-v">{m.value}</span>
            <span className="ceo-slide__people-banner-l">{m.label}</span>
          </div>
        ))}
      </div>
      <div className="ceo-slide__people-grid">
        <div className="ceo-slide__chart-card">
          <div className="ceo-slide__people-card-head">
            <span className="ceo-slide__chart-title">{d.deliveryTitle}</span>
            <span className="ceo-slide__badge">{d.deliveryBadge}</span>
          </div>
          <div className="ceo-slide__delivery-grid">
            {d.deliveryItems.map((it) => {
              const Ico = ICONS[it.icon];
              return (
                <div key={it.title} className="ceo-slide__delivery-cell">
                  <div className="ceo-slide__delivery-ico">
                    <Ico size={18} />
                  </div>
                  <div className="ceo-slide__delivery-t">{it.title}</div>
                  <div className="ceo-slide__delivery-b">{it.body}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="ceo-slide__chart-card">
          <div className="ceo-slide__chart-title">{d.leadershipTitle}</div>
          {d.leadershipItems.map((it) => {
            const Ico = ICONS[it.icon];
            return (
              <div key={it.title} className="ceo-slide__lead-row">
                <div className="ceo-slide__delivery-ico">
                  <Ico size={18} />
                </div>
                <div>
                  <div className="ceo-slide__delivery-t">{it.title}</div>
                  <div className="ceo-slide__delivery-b">{it.body}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="ceo-slide__chart-card">
          <div className="ceo-slide__chart-title">{d.distributionTitle}</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={d.wlDistribution} dataKey="pct" nameKey="level" cx="50%" cy="50%" outerRadius={80}>
                {d.wlDistribution.map((e, i) => (
                  <Cell key={i} fill={e.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="ceo-slide__footer-brand">{d.footerLine}</p>
      </DeckSelectableRegion>
    </SlideShell>
  );
}

function SlideCost({ d }: { d: CeoSlideDeckConfig["costTeamStructure"] }) {
  const { headcountBySbu } = d;
  return (
    <SlideShell title={d.title} imageRef="slide-10-cost-team" deckKey="costTeamStructure">
      <DeckSelectableRegion deckPath="costTeamStructure" label="Cost / team structure slide">
      <div className="ceo-slide__kpi-grid-4">
        {d.summaryCards.map((c, i) => (
          <div key={i} className="ceo-slide__cost-summary">
            <div className="ceo-slide__cost-summary-p">{c.primary}</div>
            <div className="ceo-slide__cost-summary-s">{c.sub}</div>
          </div>
        ))}
      </div>
      <div className="ceo-slide__cost-tables">
        <div className="ceo-slide__table-scroll">
          <table className="ceo-slide__cost-table">
            <thead>
              <tr>
                {headcountBySbu.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {headcountBySbu.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.sbu}</td>
                  <td>{r.function}</td>
                  <td>{r.east}</td>
                  <td>{r.north}</td>
                  <td>{r.south}</td>
                  <td>{r.west}</td>
                  <td>
                    <strong>{r.total}</strong>
                  </td>
                </tr>
              ))}
              <tr className="ceo-slide__cost-grand">
                <td colSpan={2}>Grand Total</td>
                <td>{headcountBySbu.grandTotal.east}</td>
                <td>{headcountBySbu.grandTotal.north}</td>
                <td>{headcountBySbu.grandTotal.south}</td>
                <td>{headcountBySbu.grandTotal.west}</td>
                <td>
                  <strong>{headcountBySbu.grandTotal.all}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="ceo-slide__table-scroll">
          <table className="ceo-slide__cost-table ceo-slide__cost-table--sm">
            <thead>
              <tr>
                <th>Band</th>
                <th>Headcount</th>
                <th>Avg tenure (yrs)</th>
              </tr>
            </thead>
            <tbody>
              {d.tenureByBand.map((r) => (
                <tr key={r.band}>
                  <td>{r.band}</td>
                  <td>{r.headcount}</td>
                  <td>{r.avgTenure}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ceo-slide__table-scroll">
          <table className="ceo-slide__cost-table ceo-slide__cost-table--sm">
            <thead>
              <tr>
                <th>Band</th>
                <th>Sales</th>
                <th>Recruitment Ops</th>
                <th>ISG</th>
                <th>Technology</th>
              </tr>
            </thead>
            <tbody>
              {d.incentiveGrid.map((r) => (
                <tr key={r.band}>
                  <td>{r.band}</td>
                  <td>{r.sales}</td>
                  <td>{r.recruitmentOps}</td>
                  <td>{r.isg}</td>
                  <td>{r.technology}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="ceo-slide__footer-note">{d.footerNote}</p>
      </DeckSelectableRegion>
    </SlideShell>
  );
}

/** Stable `data-slide-ref` values — keep in pager / studio sync order. */
export const CEO_DECK_SLIDE_REFS = [
  "slide-01-financial-performance",
  "slide-02-scale-efficiency",
  "slide-03-industry-mix",
  "slide-04-acv-retention",
  "slide-05-growth-journey",
  "slide-06-revenue-bridge",
  "slide-07-unit-economics",
  "slide-08-hiring-mix",
  "slide-09-people",
  "slide-10-cost-team",
] as const;

export const CEO_DECK_SLIDE_COUNT = CEO_DECK_SLIDE_REFS.length;

const SLIDE_KEYS: (keyof CeoSlideDeckConfig)[] = [
  "financialPerformance",
  "scaleEfficiency",
  "industryDiversification",
  "newBusinessRetention",
  "growthJourney",
  "revenueBridge",
  "unitEconomics",
  "hiringSourceMix",
  "peopleCapability",
  "costTeamStructure",
];

/** Readable title from live config — use for thumbnails / pager. */
export function ceoDeckSlideTitle(config: CeoSlideDeckConfig, index: number): string {
  const k = SLIDE_KEYS[index];
  if (!k) return `Slide ${index + 1}`;
  const blob = config[k];
  const t =
    blob && typeof blob === "object" && "title" in blob ? (blob as { title?: string }).title : undefined;
  return (t?.trim() || `Slide ${index + 1}`).slice(0, 72);
}

type SlideRenderer = (c: CeoSlideDeckConfig) => React.ReactElement;

const SLIDE_RENDERERS: SlideRenderer[] = [
  (c) => <SlideFinancial d={c.financialPerformance} />,
  (c) => <SlideScale d={c.scaleEfficiency} />,
  (c) => <SlideIndustry d={c.industryDiversification} />,
  (c) => <SlideNewBusiness d={c.newBusinessRetention} />,
  (c) => <SlideGrowth d={c.growthJourney} />,
  (c) => <SlideBridge d={c.revenueBridge} />,
  (c) => <SlideUnitEconomics d={c.unitEconomics} />,
  (c) => <SlideHiring d={c.hiringSourceMix} />,
  (c) => <SlidePeople d={c.peopleCapability} />,
  (c) => <SlideCost d={c.costTeamStructure} />,
];

/** Render exactly one narrative slide (studio viewer). */
export function CeoDeckSingleSlide({ config, index }: { config: CeoSlideDeckConfig; index: number }) {
  if (index < 0 || index >= SLIDE_RENDERERS.length) return null;
  return SLIDE_RENDERERS[index](config);
}

export function CeoBoardSlides({ config }: { config: CeoSlideDeckConfig }) {
  return (
    <div className="ceo-board-slides">
      {SLIDE_RENDERERS.map((R, i) => (
        <React.Fragment key={CEO_DECK_SLIDE_REFS[i]}>{R(config)}</React.Fragment>
      ))}
    </div>
  );
}
