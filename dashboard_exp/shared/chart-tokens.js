/**
 * Taggd chart design tokens — plain JS mirror of
 * frontend/src/components/charts/chartTokens.ts
 */
'use strict';

(function (global) {
  var CHART_COLORS = [
    '#e16f3d',
    '#14b8a6',
    '#f59e0b',
    '#ef4444',
    '#6366f1',
    '#3884ff',
    '#8b5cf6',
    '#ec4899',
    '#64748b',
    '#0f766e',
    '#d97706',
    '#be185d',
  ];

  var GMV_COLOR = '#e16f3d';
  var PO_COLOR = '#14b8a6';
  var SUCCESS_RATE_COLOR = '#f59e0b';
  var FAIL_COLOR = '#ef4444';
  var BUDGET_COLOR = '#64748b';
  var FORECAST_COLOR = '#f59e0b';
  var ACTUAL_COLOR = '#e16f3d';
  var PRIOR_FY_COLOR = '#3884ff';

  var AXIS_COLOR = '#94a3b8';
  var GRID_COLOR = '#f0f0f0';
  var TEXT_COLOR = '#334155';
  var BORDER_COLOR = '#e2e8f0';

  function successBarColor(pct) {
    if (pct >= 80) return '#14b8a6';
    if (pct >= 60) return '#f59e0b';
    return '#ef4444';
  }

  function gaugeArcColor(pct) {
    return successBarColor(pct);
  }

  var FONT = {
    axis: 11,
    axisSm: 10,
    legend: 12,
    legendSm: 10,
    tooltip: 12,
    label: 11,
    gauge: 26,
  };

  var GRID = {
    default: { left: 8, right: 44, top: 16, bottom: 48, containLabel: true },
    dualAxis: { left: 8, right: 68, top: 16, bottom: 52, containLabel: true },
    hBar: { left: 8, right: 44, top: 12, bottom: 8, containLabel: true },
    vBar: { left: 8, right: 44, top: 12, bottom: 48, containLabel: true },
  };

  var CHART_HEIGHT = {
    sm: 220,
    md: 240,
    lg: 260,
    xl: 300,
    hero: 320,
    zoom: 352,
  };

  var BAR = {
    maxWidth: 22,
    maxWidthV: 28,
    maxWidthStack: 32,
    maxWidthGroup: 36,
    radiusH: [0, 4, 4, 0],
    radiusV: [4, 4, 0, 0],
    radiusStackTop: [4, 4, 0, 0],
  };

  var LINE = {
    width: 2.5,
    widthRate: 2,
    smooth: true,
    symbolSize: 6,
    dotThreshold: 16,
  };

  var CARD_STYLE = {
    borderRadius: 12,
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    border: '1px solid #e2e8f0',
    padding: 24,
  };

  var AREA_GRADIENT = {
    gmv: [
      { offset: 0, color: 'rgba(225,111,61,0.28)' },
      { offset: 1, color: 'rgba(225,111,61,0.02)' },
    ],
    po: [
      { offset: 0, color: 'rgba(20,184,166,0.22)' },
      { offset: 1, color: 'rgba(20,184,166,0.02)' },
    ],
    accent2: [
      { offset: 0, color: 'rgba(20,184,166,0.22)' },
      { offset: 1, color: 'rgba(20,184,166,0.02)' },
    ],
  };

  var FUNNEL_COLORS = ['#e16f3d', '#f59e0b', '#64748b', '#14b8a6'];
  var SLA_STACK_COLORS = { met: '#14b8a6', notMet: '#ef4444', notReported: '#64748b' };
  var REQ_STATUS_COLORS = { joined: '#14b8a6', open: '#e16f3d', offer: '#f59e0b', cancelled: '#ef4444' };
  var AGEING_COLORS = ['#15803d', '#0f766e', '#f59e0b', '#b91c1c'];
  var WEEK_SERIES_COLORS = CHART_COLORS.slice(0, 8);
  var FIXED_QUAD_COLORS = [BUDGET_COLOR, ACTUAL_COLOR, FORECAST_COLOR, PRIOR_FY_COLOR];

  global.TaggdChartTokens = {
    CHART_COLORS: CHART_COLORS,
    GMV_COLOR: GMV_COLOR,
    PO_COLOR: PO_COLOR,
    SUCCESS_RATE_COLOR: SUCCESS_RATE_COLOR,
    FAIL_COLOR: FAIL_COLOR,
    BUDGET_COLOR: BUDGET_COLOR,
    FORECAST_COLOR: FORECAST_COLOR,
    ACTUAL_COLOR: ACTUAL_COLOR,
    PRIOR_FY_COLOR: PRIOR_FY_COLOR,
    AXIS_COLOR: AXIS_COLOR,
    GRID_COLOR: GRID_COLOR,
    TEXT_COLOR: TEXT_COLOR,
    BORDER_COLOR: BORDER_COLOR,
    successBarColor: successBarColor,
    gaugeArcColor: gaugeArcColor,
    FONT: FONT,
    GRID: GRID,
    CHART_HEIGHT: CHART_HEIGHT,
    BAR: BAR,
    LINE: LINE,
    CARD_STYLE: CARD_STYLE,
    AREA_GRADIENT: AREA_GRADIENT,
    FUNNEL_COLORS: FUNNEL_COLORS,
    SLA_STACK_COLORS: SLA_STACK_COLORS,
    REQ_STATUS_COLORS: REQ_STATUS_COLORS,
    AGEING_COLORS: AGEING_COLORS,
    WEEK_SERIES_COLORS: WEEK_SERIES_COLORS,
    FIXED_QUAD_COLORS: FIXED_QUAD_COLORS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
