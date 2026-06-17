/**
 * ECharts theme helpers — plain JS mirror of
 * frontend/src/components/charts/chartUtils.ts + chartAxis.ts
 */
'use strict';

(function (global) {
  var T = global.TaggdChartTokens || {};
  var AXIS_COLOR = T.AXIS_COLOR || '#94a3b8';
  var GRID_COLOR = T.GRID_COLOR || '#f0f0f0';
  var TEXT_COLOR = T.TEXT_COLOR || '#334155';
  var FONT = T.FONT || { axis: 11, axisSm: 10, tooltip: 12 };

  function mergeTooltipBase(partial) {
    partial = partial || {};
    return Object.assign(
      {
        appendToBody: true,
        confine: true,
        backgroundColor: '#fff',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        padding: [8, 12],
        extraCssText: 'box-shadow:0 4px 16px rgba(0,0,0,0.08);border-radius:8px;',
        textStyle: { color: TEXT_COLOR, fontSize: FONT.tooltip },
      },
      partial
    );
  }

  function categoryXAxis(data, opts) {
    opts = opts || {};
    return {
      type: 'category',
      data: data,
      boundaryGap: opts.boundaryGap !== undefined ? opts.boundaryGap : true,
      axisLine: { lineStyle: { color: AXIS_COLOR } },
      axisTick: { show: false },
      axisLabel: {
        color: AXIS_COLOR,
        fontSize: FONT.axis,
        hideOverlap: true,
        interval: opts.interval !== undefined ? opts.interval : 'auto',
        rotate: opts.rotate !== undefined ? opts.rotate : 0,
      },
      splitLine: { show: false },
    };
  }

  function valueYAxis(formatter, opts) {
    opts = opts || {};
    return {
      type: 'value',
      min: opts.min,
      max: opts.max,
      minInterval: opts.minInterval,
      name: opts.name,
      nameTextStyle: { fontSize: FONT.axisSm, color: AXIS_COLOR },
      axisLabel: {
        color: AXIS_COLOR,
        fontSize: FONT.axis,
        hideOverlap: true,
        formatter: formatter || function (v) { return String(v); },
      },
      splitLine: { lineStyle: { color: GRID_COLOR } },
      axisLine: { show: false },
      axisTick: { show: false },
    };
  }

  function valueXAxis(formatter, opts) {
    opts = opts || {};
    return {
      type: 'value',
      min: opts.min,
      max: opts.max,
      minInterval: opts.minInterval,
      axisLabel: {
        color: AXIS_COLOR,
        fontSize: FONT.axis,
        formatter: formatter || function (v) { return String(v); },
      },
      splitLine: { lineStyle: { color: GRID_COLOR } },
      axisLine: { show: false },
      axisTick: { show: false },
    };
  }

  function horizontalCategoryYAxis(names) {
    return {
      type: 'category',
      data: names,
      inverse: true,
      axisLine: { lineStyle: { color: AXIS_COLOR } },
      axisTick: { show: false },
      axisLabel: {
        color: AXIS_COLOR,
        fontSize: FONT.axis,
        formatter: function (val) {
          var s = String(val);
          return s.length > 28 ? s.slice(0, 26) + '…' : s;
        },
      },
    };
  }

  function percentYAxis(min, max) {
    min = min !== undefined ? min : 0;
    max = max !== undefined ? max : 100;
    return {
      type: 'value',
      min: min,
      max: max,
      axisLabel: { color: AXIS_COLOR, fontSize: FONT.axis, formatter: '{value}%' },
      splitLine: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    };
  }

  function seriesEmphasisCartesian() {
    return {
      emphasis: { focus: 'series', blurScope: 'coordinateSystem' },
      blur: { itemStyle: { opacity: 0.12 } },
    };
  }

  function computeLabelRotate(count) {
    if (count > 16) return 40;
    if (count > 10) return 30;
    return 0;
  }

  global.TaggdEchartsTheme = {
    mergeTooltipBase: mergeTooltipBase,
    categoryXAxis: categoryXAxis,
    valueYAxis: valueYAxis,
    valueXAxis: valueXAxis,
    horizontalCategoryYAxis: horizontalCategoryYAxis,
    percentYAxis: percentYAxis,
    seriesEmphasisCartesian: seriesEmphasisCartesian,
    computeLabelRotate: computeLabelRotate,
  };
})(typeof window !== 'undefined' ? window : globalThis);
