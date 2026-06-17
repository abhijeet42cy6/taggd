import type { EChartsOption } from "echarts";
import { echarts } from "../echartsSetup";
import {
  ACTUAL_COLOR,
  BAR,
  FORECAST_COLOR,
  GMV_COLOR,
  GRID,
  LINE,
  PO_COLOR,
  PRIOR_FY_COLOR,
  SUCCESS_RATE_COLOR,
  BUDGET_COLOR,
  AREA_GRADIENT,
} from "../chartTokens";
import { categoryXAxis, percentYAxis, valueYAxis } from "../chartAxis";
import { legendBottom } from "../chartLegend";
import { getGmvTrendToolbox } from "../chartToolbox";
import { getInvoiceTrendDataZoom } from "../chartDataZoom";
import {
  formatCurrencyINR,
  mergeTooltipBase,
  seriesEmphasisCartesian,
  computeLabelRotate,
} from "../chartUtils";

export type DualAxisTrendPoint = {
  date: string;
  gmv?: number;
  po?: number;
  rate?: number;
};

export function buildDualAxisAreaLineOption(
  dates: string[],
  gmvData: (number | null)[],
  poData: (number | null)[],
  rateData: (number | null)[],
  maxMoney: number,
  maxRate = 100
): EChartsOption {
  const showDots = dates.length <= LINE.dotThreshold;
  return {
    color: [GMV_COLOR, PO_COLOR, SUCCESS_RATE_COLOR],
    animationDuration: 600,
    toolbox: getGmvTrendToolbox(),
    grid: GRID.dualAxis,
    dataZoom: getInvoiceTrendDataZoom(dates.length),
    tooltip: mergeTooltipBase({
      trigger: "axis",
      axisPointer: {
        type: "cross",
        crossStyle: { color: "#cbd5e1" },
        label: { backgroundColor: "#f1f5f9", color: "#475569" },
      },
      formatter: (params) => {
        const items = Array.isArray(params) ? params : [params];
        const idx = items[0]?.dataIndex ?? 0;
        const title = dates[idx] ?? "";
        const rows = items
          .map((p) => {
            const val =
              p.seriesName === "Success rate"
                ? p.value != null
                  ? `${p.value}%`
                  : "—"
                : formatCurrencyINR(Number(p.value));
            return `<div style="display:flex;align-items:center;gap:6px;margin-top:4px">
              <span style="width:10px;height:10px;border-radius:50%;background:${p.color}"></span>
              <span>${p.seriesName}: ${val}</span>
            </div>`;
          })
          .join("");
        return `<div style="font-weight:600;margin-bottom:4px">${title}</div>${rows}`;
      },
    }),
    legend: legendBottom,
    xAxis: categoryXAxis(dates, {
      boundaryGap: false,
      rotate: computeLabelRotate(dates.length),
    }),
    yAxis: [
      valueYAxis((v) => `₹${Number(v).toFixed(0)}`),
      percentYAxis(0, maxRate > 100 ? Math.ceil(maxRate / 10) * 10 : 100),
    ],
    series: [
      {
        name: "GMV",
        type: "line",
        yAxisIndex: 0,
        smooth: LINE.smooth,
        showSymbol: showDots,
        symbol: "circle",
        symbolSize: LINE.symbolSize,
        data: gmvData,
        lineStyle: { width: LINE.width, color: GMV_COLOR },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [...AREA_GRADIENT.gmv]),
        },
        ...seriesEmphasisCartesian(),
      },
      {
        name: "PO Value",
        type: "line",
        yAxisIndex: 0,
        smooth: LINE.smooth,
        showSymbol: showDots,
        symbol: "circle",
        symbolSize: LINE.symbolSize,
        data: poData,
        lineStyle: { width: LINE.width, color: PO_COLOR },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [...AREA_GRADIENT.po]),
        },
        ...seriesEmphasisCartesian(),
      },
      {
        name: "Success rate",
        type: "line",
        yAxisIndex: 1,
        smooth: LINE.smooth,
        showSymbol: true,
        symbol: "circle",
        symbolSize: LINE.symbolSize,
        data: rateData,
        lineStyle: { width: LINE.widthRate, type: "dashed", color: SUCCESS_RATE_COLOR },
        itemStyle: { color: SUCCESS_RATE_COLOR },
        ...seriesEmphasisCartesian(),
      },
    ],
  };
}

/** Composed revenue YoY: budget bars + actual/forecast/prior lines */
export function buildExecutiveRevenueYoYOption(
  months: string[],
  budget: number[],
  actual: number[],
  forecast: number[],
  prior: number[],
  priorLabel: string
): EChartsOption {
  const max = Math.max(...budget, ...actual, ...forecast, ...prior, 1);
  return {
    color: [BUDGET_COLOR, ACTUAL_COLOR, FORECAST_COLOR, PRIOR_FY_COLOR],
    animationDuration: 600,
    toolbox: getGmvTrendToolbox(),
    grid: GRID.vBar,
    tooltip: mergeTooltipBase({
      trigger: "axis",
      axisPointer: { type: "cross", crossStyle: { color: "#cbd5e1" } },
      formatter: (params) => {
        const items = Array.isArray(params) ? params : [params];
        const title = String((items[0] as { axisValue?: string; name?: string })?.axisValue ?? items[0]?.name ?? "");
        const rows = items
          .map(
            (p) =>
              `<div style="margin-top:4px">${p.marker} ${p.seriesName}: <b>₹${Number(p.value).toFixed(2)} Cr</b></div>`
          )
          .join("");
        return `<div style="font-weight:600;margin-bottom:4px">${title}</div>${rows}`;
      },
    }),
    legend: legendBottom,
    xAxis: categoryXAxis(months),
    yAxis: valueYAxis((v) => `₹${Number(v).toFixed(0)}`),
    series: [
      {
        name: "Budget",
        type: "bar",
        data: budget,
        barMaxWidth: BAR.maxWidthV,
        itemStyle: { borderRadius: BAR.radiusV, color: BUDGET_COLOR, opacity: 0.55 },
        ...seriesEmphasisCartesian(),
      },
      {
        name: "Actual",
        type: "line",
        data: actual,
        smooth: LINE.smooth,
        showSymbol: months.length <= LINE.dotThreshold,
        symbolSize: LINE.symbolSize,
        lineStyle: { width: LINE.width, color: ACTUAL_COLOR },
        ...seriesEmphasisCartesian(),
      },
      {
        name: "Forecast",
        type: "line",
        data: forecast,
        smooth: LINE.smooth,
        lineStyle: { width: 1.8, type: "dashed", color: FORECAST_COLOR },
        ...seriesEmphasisCartesian(),
      },
      {
        name: priorLabel,
        type: "line",
        data: prior,
        smooth: LINE.smooth,
        lineStyle: { width: 2, type: "dashed", color: PRIOR_FY_COLOR },
        ...seriesEmphasisCartesian(),
      },
    ],
  };
}
