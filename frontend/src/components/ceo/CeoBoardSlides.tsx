/**
 * Board narrative slides — reference deck (config-driven).
 * Styling: design_style_guide + ceo-board-slides.css
 */
import React, { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChartsCanvas } from "@/components/charts/EChartsCanvas";
import {
  buildDonutPieOption,
  buildMultiLineTimeseriesOption,
  buildSingleVerticalBarOption,
  buildStackedVerticalBarOption,
} from "@/components/charts/optionBuilders";
import { BAR, GRID, LINE } from "@/components/charts/chartTokens";
import { categoryXAxis, percentYAxis, valueYAxis } from "@/components/charts/chartAxis";
import { mergeTooltipBase, seriesEmphasisCartesian } from "@/components/charts/chartUtils";
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

function CeoChart({ option, height }: { option: EChartsOption | null; height: number }) {
  return <EChartsCanvas option={option} height={height} />;
}

function buildColoredBarOption(
  categories: string[],
  values: number[],
  colors: string[],
  yMax?: number,
): EChartsOption {
  return {
    grid: GRID.vBar,
    tooltip: mergeTooltipBase({
      trigger: "axis",
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        return `<b>${p?.name ?? ""}</b><br/>${p?.value ?? ""}`;
      },
    }),
    xAxis: categoryXAxis(categories),
    yAxis: valueYAxis(undefined, yMax != null ? { max: yMax } : {}),
    series: [
      {
        type: "bar",
        data: values.map((v, i) => ({
          value: v,
          itemStyle: { color: colors[i], borderRadius: BAR.radiusV },
        })),
        barMaxWidth: BAR.maxWidthV,
        label: { show: true, position: "top", fontSize: 11, color: "#334155" },
        ...seriesEmphasisCartesian(),
      },
    ],
  };
}

function buildBridgeWaterfallOption(
  chartData: { name: string; base: number; val: number; color: string }[],
  yMax: number,
): EChartsOption {
  return {
    grid: { left: 8, right: 44, top: 16, bottom: 48, containLabel: true },
    tooltip: mergeTooltipBase({ trigger: "axis", axisPointer: { type: "shadow" } }),
    xAxis: categoryXAxis(
      chartData.map((d) => d.name),
      { rotate: -12 },
    ),
    yAxis: valueYAxis(undefined, { max: yMax }),
    series: [
      {
        name: "Base",
        type: "bar",
        stack: "w",
        itemStyle: { borderColor: "transparent", color: "transparent" },
        emphasis: { itemStyle: { borderColor: "transparent", color: "transparent" } },
        data: chartData.map((d) => d.base),
      },
      {
        name: "Value",
        type: "bar",
        stack: "w",
        data: chartData.map((d) => ({
          value: d.val,
          itemStyle: { color: d.color, borderRadius: BAR.radiusV },
        })),
      },
    ],
  };
}

function buildDualAxisBarLineOption(
  categories: string[],
  barValues: number[],
  barColors: string[],
  lineValues: number[],
  lineColor: string,
): EChartsOption {
  return {
    grid: GRID.vBar,
    tooltip: mergeTooltipBase({ trigger: "axis" }),
    xAxis: categoryXAxis(categories),
    yAxis: [valueYAxis(), percentYAxis(0, 40)],
    series: [
      {
        type: "bar",
        yAxisIndex: 0,
        data: barValues.map((v, i) => ({
          value: v,
          itemStyle: { color: barColors[i], borderRadius: BAR.radiusV },
        })),
        barMaxWidth: BAR.maxWidthV,
        ...seriesEmphasisCartesian(),
      },
      {
        type: "line",
        yAxisIndex: 1,
        data: lineValues,
        smooth: LINE.smooth,
        symbolSize: LINE.symbolSize,
        lineStyle: { width: LINE.width, color: lineColor },
        ...seriesEmphasisCartesian(),
      },
    ],
  };
}

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

  const totalOption = useMemo(
    () => buildSingleVerticalBarOption(totalData.map((x) => x.name), totalData.map((x) => x.total), "Total", BLUE),
    [totalData],
  );

  const stackOption = useMemo(
    () =>
      buildStackedVerticalBarOption(
        stackData.map((x) => x.name),
        [
          { name: "Existing", data: stackData.map((x) => x.Existing), color: BLUE },
          { name: "Ramp-Up", data: stackData.map((x) => x["Ramp-Up"]), color: RAMP },
          { name: "New", data: stackData.map((x) => x.New), color: NEWC, roundTop: true },
        ],
      ),
    [stackData],
  );

  return (
    <SlideShell title={d.title} imageRef="slide-01-financial-performance" deckKey="financialPerformance">
      <div className="ceo-slide__grid-3">
        <DeckSelectableRegion deckPath="financialPerformance.totalRevenueByYear" label="Total revenue data">
          <div className="ceo-slide__chart-card">
            <div className="ceo-slide__chart-title">Total revenue</div>
            <div className="ceo-slide__chart-h">
              <CeoChart option={totalOption} height={220} />
            </div>
          </div>
        </DeckSelectableRegion>
        <DeckSelectableRegion deckPath="financialPerformance.composition" label="Composition by year">
          <div className="ceo-slide__chart-card">
            <div className="ceo-slide__chart-title">Revenue composition</div>
            <div className="ceo-slide__chart-h">
              <CeoChart option={stackOption} height={220} />
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

  const hireOption = useMemo(
    () => buildSingleVerticalBarOption(hireData.map((h) => h.name), hireData.map((h) => h.vol), "Volume", BLUE),
    [hireData],
  );

  const rpeOption = useMemo(
    () =>
      buildMultiLineTimeseriesOption(
        rpeData.map((r) => r.name),
        [{ name: "Revenue / Employee", data: rpeData.map((r) => r.rev), color: BLUE }],
      ),
    [rpeData],
  );

  return (
    <SlideShell title={d.title} imageRef="slide-02-scale-efficiency" deckKey="scaleEfficiency">
      <div className="ceo-slide__grid-3 ceo-slide__grid-3--split">
        <DeckSelectableRegion deckPath="scaleEfficiency.hiringVolume" label="Hiring volume & RPH">
          <div className="ceo-slide__chart-card">
            <div className="ceo-slide__chart-title">Hiring volume</div>
            <CeoChart option={hireOption} height={200} />
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
            <CeoChart option={rpeOption} height={232} />
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

  const donutOption = useMemo(
    () => buildDonutPieOption(
      pieData.map((s) => ({ name: s.name, value: s.value })),
      pieData.map((s) => s.color),
    ),
    [pieData],
  );

  return (
    <SlideShell title={d.title} imageRef="slide-03-industry-mix" deckKey="industryDiversification">
      <div className="ceo-slide__grid-2">
        <DeckSelectableRegion deckPath="industryDiversification.donutSegments" label="Industry mix donut">
          <div className="ceo-slide__chart-card ceo-slide__donut-card">
            <div className="ceo-slide__chart-title">{d.donutLabel}</div>
            <div className="ceo-slide__donut-row">
              <CeoChart option={donutOption} height={260} />
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

  const acvOption = useMemo(
    () => buildSingleVerticalBarOption(barData.map((b) => b.name), barData.map((b) => b.acv), "New ACV", BLUE),
    [barData],
  );

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
          <CeoChart option={acvOption} height={220} />
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

  const revenueOption = useMemo(
    () =>
      buildColoredBarOption(
        d.revenueYoY.map((r) => r.year),
        d.revenueYoY.map((r) => r.value),
        d.revenueYoY.map((_, i) => (isHist(i) ? BLUE : ORANGE)),
      ),
    [d.revenueYoY, histIdx],
  );

  const ebitdaOption = useMemo(
    () =>
      buildDualAxisBarLineOption(
        d.ebitdaYoY.map((e) => e.year),
        d.ebitdaYoY.map((e) => e.bar),
        d.ebitdaYoY.map((_, i) => (isHist(i) ? BLUE : ORANGE)),
        d.ebitdaYoY.map((e) => e.marginPct),
        "#22c55e",
      ),
    [d.ebitdaYoY, histIdx],
  );

  const newAcvOption = useMemo(
    () =>
      buildColoredBarOption(
        d.newAcv.map((r) => r.year),
        d.newAcv.map((r) => r.value),
        d.newAcv.map((_, i) => (isHist(i) ? BLUE : ORANGE)),
      ),
    [d.newAcv, histIdx],
  );

  const grossMarginOption = useMemo(
    () =>
      buildColoredBarOption(
        d.grossMarginPct.map((r) => r.year),
        d.grossMarginPct.map((r) => r.value),
        d.grossMarginPct.map((_, i) => (isHist(i) ? BLUE : ORANGE)),
        100,
      ),
    [d.grossMarginPct, histIdx],
  );

  return (
    <SlideShell title={d.title} imageRef="slide-05-growth-journey" deckKey="growthJourney">
      <DeckSelectableRegion deckPath="growthJourney" label="Growth journey (charts & sidebar)">
      <div className="ceo-slide__growth-wrap">
        <div className="ceo-slide__growth-grid">
          <div className="ceo-slide__chart-card">
            <div className="ceo-slide__chart-title">Revenue (Y-o-Y) (INR Cr.)</div>
            <CeoChart option={revenueOption} height={180} />
            <div className="ceo-slide__growth-tag">{d.revenueGrowthTag}</div>
          </div>
          <div className="ceo-slide__chart-card">
            <div className="ceo-slide__chart-title">Contribution margin (Y-o-Y) (INR Cr.)</div>
            <CeoChart option={ebitdaOption} height={180} />
            <div className="ceo-slide__growth-tag">{d.ebitdaGrowthTag}</div>
          </div>
          <div className="ceo-slide__chart-card">
            <div className="ceo-slide__chart-title">New ACV Growth (INR CR)</div>
            <CeoChart option={newAcvOption} height={180} />
          </div>
          <div className="ceo-slide__chart-card">
            <div className="ceo-slide__chart-title">Gross Margin</div>
            <CeoChart option={grossMarginOption} height={180} />
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
  const bridgeOption = useMemo(
    () => buildBridgeWaterfallOption(chartData, d.yMax),
    [chartData, d.yMax],
  );

  return (
    <SlideShell title={d.title} imageRef="slide-06-revenue-bridge" deckKey="revenueBridge">
      <DeckSelectableRegion deckPath="revenueBridge.steps" label="Waterfall / bridge series">
      <div className="ceo-slide__chart-card">
        <CeoChart option={bridgeOption} height={320} />
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

  const hiringDonutOption = useMemo(
    () =>
      buildDonutPieOption(
        donut.map((x) => ({ name: x.name, value: x.value })),
        donut.map((x) => x.color),
      ),
    [donut],
  );

  return (
    <SlideShell title={d.title} imageRef="slide-08-hiring-mix" deckKey="hiringSourceMix">
      <div className="ceo-slide__grid-2">
        <DeckSelectableRegion deckPath="hiringSourceMix.donut" label="Hiring mix donut">
        <div className="ceo-slide__chart-card">
          <div className="ceo-slide__chart-title">Overall hiring mix</div>
          <CeoChart option={hiringDonutOption} height={280} />
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
  const wlOption = useMemo(
    () =>
      buildDonutPieOption(
        d.wlDistribution.map((e) => ({ name: e.level, value: e.pct })),
        d.wlDistribution.map((e) => e.color),
      ),
    [d.wlDistribution],
  );

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
          <CeoChart option={wlOption} height={200} />
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
