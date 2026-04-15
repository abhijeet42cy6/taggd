// ============================================================
// FINANCE EXECUTIVE DASHBOARD v2 — app.js  (FULL REBUILD v3)
// Taggd.com White + Orange Theme
// Fixes: data labels ON, trendlines cut at last actual,
//        headcount as plain number, FY comparison always shows both,
//        filter bar consolidated with multi-select months + quarter
// ============================================================
'use strict';

// ── Global State ────────────────────────────────────────────
const STATE = {
  fy:           'FY2526',
  page:         'overview',
  selectedMonths: null,   // null = all months; array of indices 0-11
  quarter:      'ALL',    // 'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4'
  compare:      true,
  // Multi-select filters: [] = no filter (show all); array = selected values
  region:       [],       // [] = all regions
  subRegion:    [],       // [] = all sub-regions
  regionHead:   [],       // [] = all region heads
  practiceHead: [],       // [] = all practice heads
  vertical:     [],       // [] = all verticals
  account:      [],       // [] = all accounts
};

// Pending month selection (used by dropdown before Apply)
let _pendingMonths = null;
let _pendingRafId   = null; // tracks pending requestAnimationFrame for initCharts

let CHARTS = {};

// ── Quarter index map ──────────────────────────────────────
const Q_MAP = {
  Q1: [0,1,2],   // Apr May Jun
  Q2: [3,4,5],   // Jul Aug Sep
  Q3: [6,7,8],   // Oct Nov Dec
  Q4: [9,10,11], // Jan Feb Mar
};

// ── Colour palette ───────────────────────────────────────────
const C = {
  orange: '#E8531F', oLight: '#FF6B35', oPale: 'rgba(232,83,31,.12)',
  green:  '#10B981', gPale:  'rgba(16,185,129,.12)',
  red:    '#EF4444', rPale:  'rgba(239,68,68,.12)',
  yellow: '#F59E0B', yPale:  'rgba(245,158,11,.12)',
  blue:   '#3B82F6', bPale:  'rgba(59,130,246,.12)',
  gray:   '#9AA5B4',
  purple: '#8B5CF6',
  teal:   '#0D9488',
  cyan:   '#0891B2',
};

// Tile theme colours
const TILE_COLORS = {
  rev:      't-blue',
  cm:       't-green',
  ppc:      't-purple',
  revprod:  't-teal',
  tjp:      't-dpurple',
  hc:       't-orange',
  coll:     't-cyan',
  unbilled: 't-red',
};

// ── Chart.js global defaults (safe — only if Chart loaded) ────
function setupChartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size   = 11;
  Chart.defaults.color       = '#6B7280';
  Chart.defaults.plugins.legend.display = false;
  if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
    Chart.defaults.plugins.datalabels = Chart.defaults.plugins.datalabels || {};
    Chart.defaults.plugins.datalabels.display = false;
  }
}

// ── Boot ─────────────────────────────────────────────────────
function bootApp() {
  var ov = document.getElementById('loading-overlay');
  try {
    // ── Check for uploaded data override (from upload.html) ─
    const overrideRaw = sessionStorage.getItem('TAGGD_FIN_OVERRIDE');
    if (overrideRaw) {
      try {
        const overrideData = JSON.parse(overrideRaw);
        // Merge into FIN_DATA (keep any FY not in override)
        Object.keys(overrideData).forEach(fy => {
          window.FIN_DATA[fy] = overrideData[fy];
        });
        // Add any new FY keys to FY tab buttons if needed
        _injectFYButtons(Object.keys(overrideData));
        console.log('[Dashboard] Data override applied from upload. FYs:', Object.keys(overrideData).join(', '));
        // Show a non-blocking banner
        _showOverrideBanner(Object.keys(overrideData));
      } catch(parseErr) {
        console.warn('[Dashboard] Could not apply data override:', parseErr.message);
      }
    }
    setupChartDefaults();
    initNav();
    initFilters();
    renderPage();
    console.log('[Dashboard] Boot complete, page rendered:', STATE.page);
  } catch(e) {
    console.error('[Dashboard] Boot error:', e.message, e.stack);
    var ct = document.getElementById('content');
    if (ct) ct.innerHTML = '<div style="padding:40px;color:#EF4444;font-family:sans-serif"><h2>⚠️ Dashboard Error</h2><pre style="font-size:12px;margin-top:12px;white-space:pre-wrap">' + (e.stack || e.message) + '</pre><p style="margin-top:8px;font-size:13px">Please refresh the page.</p></div>';
  } finally {
    if (ov) { ov.style.display = 'none'; ov.style.opacity = '0'; }
    if (window._overlayTimer) clearTimeout(window._overlayTimer);
  }
}

// Inject extra FY tab buttons for newly uploaded FYs
function _injectFYButtons(fyKeys) {
  const fyBar = document.querySelector('.tb-fy');
  if (!fyBar) return;
  const existing = Array.from(fyBar.querySelectorAll('.tb-fy-btn')).map(b => b.dataset.fy);
  fyKeys.forEach(fy => {
    if (existing.includes(fy)) return;
    const fd  = window.FIN_DATA[fy];
    const btn = document.createElement('button');
    btn.className   = 'tb-fy-btn';
    btn.dataset.fy  = fy;
    btn.textContent = fd.short || fy;
    fyBar.appendChild(btn);
    // Attach listener same as initFilters does
    btn.addEventListener('click', () => {
      STATE.fy = fy;
      STATE.selectedMonths = null;
      STATE.quarter = 'ALL';
      document.querySelectorAll('.tb-fy-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      rebuildMonthGrid();
      setQuarterActive('ALL');
      updateMonthBtnLabel();
      renderPage();
    });
  });
}

// Show a small non-blocking banner when override data is active
function _showOverrideBanner(fyKeys) {
  const existing = document.getElementById('override-banner');
  if (existing) return;
  const bar = document.createElement('div');
  bar.id = 'override-banner';
  bar.innerHTML = `<i class="fas fa-cloud-arrow-up"></i> Dashboard is using <strong>uploaded data</strong> (${fyKeys.join(', ')}).
    <a href="upload.html" style="color:#fff;margin-left:10px;text-decoration:underline">Manage</a>
    <button onclick="clearOverride()" style="margin-left:12px;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:5px;padding:2px 10px;font-size:11px;cursor:pointer;font-weight:700">✕ Clear</button>`;
  bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#166534;color:#fff;padding:8px 20px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:8px;z-index:9999;box-shadow:0 -2px 8px rgba(0,0,0,.15)';
  document.body.appendChild(bar);
}

window.clearOverride = function() {
  sessionStorage.removeItem('TAGGD_FIN_OVERRIDE');
  const b = document.getElementById('override-banner');
  if (b) b.remove();
  showToast && showToast('Original data restored. Refreshing…', 'info');
  setTimeout(() => location.reload(), 900);
};

// Always wait for DOMContentLoaded — safest across all environments
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp);
} else if (document.readyState === 'interactive' || document.readyState === 'complete') {
  // DOM is ready — but defer to next tick to allow any pending HTML parsing to finish
  setTimeout(bootApp, 0);
}

// ═══════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════
function initNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      STATE.page = el.dataset.page;
      document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.remove('active'));
      el.classList.add('active');
      updatePageTitle();
      renderPage();
    });
  });
  const sbToggle = $id('sb-toggle');
  if (sbToggle) sbToggle.addEventListener('click', () => {
    const sb = $id('sidebar');
    if (sb) sb.classList.toggle('collapsed');
  });
  // Close month dropdown on outside click
  document.addEventListener('click', e => {
    const wrap = document.getElementById('month-dropdown-panel');
    const btn  = document.getElementById('month-dropdown-btn');
    if (wrap && !wrap.contains(e.target) && btn && !btn.contains(e.target)) {
      wrap.classList.remove('open');
      btn.classList.remove('open');
    }
  });
}

function updatePageTitle() {
  const titles = {
    overview: 'Executive <span>Overview</span>',
    pnl:      'P&L <span>Statement</span>',
    revenue:  'Revenue <span>Analysis</span>',
    expense:  'Expense & CM <span>Analysis</span>',
    hiring:   'Hiring <span>Analysis</span>',
    cashflow: 'Collections & <span>Cash</span>',
    manual:   'User <span>Manual</span>',
  };
  const pt = $id('page-title');
  if (pt) pt.innerHTML = titles[STATE.page] || titles.overview;
}

// ═══════════════════════════════════════════════════════════
// FILTERS
// ═══════════════════════════════════════════════════════════
// Safe element getter with optional chaining helper
function $id(id) { return document.getElementById(id); }
function $on(id, event, fn) { const el = $id(id); if (el) el.addEventListener(event, fn); }

function initFilters() {
  // FY tabs
  document.querySelectorAll('.tb-fy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (STATE.fy === btn.dataset.fy) return; // no-op if same FY
      STATE.fy = btn.dataset.fy;
      STATE.selectedMonths = null;
      STATE.quarter = 'ALL';

      // ── Preserve filters across FY switch ──────────────────
      // After switching FY, _syncFilterDropdowns will rebuild each
      // dropdown list from the new FY's projects. It already prunes
      // STATE.subRegion / regionHead / practiceHead / account to only
      // keep values that exist in the new FY. We just need to ensure
      // the VALID_REGIONS whitelist handles region, which it does.
      // So: do NOT wipe filters here — let _syncFilterDropdowns
      // cascade-prune them to what's valid in the new FY.

      document.querySelectorAll('.tb-fy-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      rebuildMonthGrid();
      setQuarterActive('ALL');
      updateMonthBtnLabel();
      _syncFilterDropdowns();   // rebuilds dropdowns & prunes invalid selections
      renderPage();
    });
  });

  // FY Compare toggle
  $on('compare-toggle', 'click', () => {
    STATE.compare = !STATE.compare;
    const cmpBtn = $id('compare-toggle');
    if (cmpBtn) cmpBtn.classList.toggle('active', STATE.compare);
    const lbl = $id('cmp-label');
    if (lbl) lbl.textContent = `FY Compare: ${STATE.compare ? 'ON' : 'OFF'}`;
    renderPage();
  });

  // Quarter pills
  document.querySelectorAll('.fb-pill[data-q]').forEach(pill => {
    pill.addEventListener('click', () => {
      const q = pill.dataset.q;
      STATE.quarter = q;
      setQuarterActive(q);
      if (q === 'ALL') {
        STATE.selectedMonths = null;
      } else {
        STATE.selectedMonths = [...Q_MAP[q]];
      }
      rebuildMonthGrid();
      updateMonthBtnLabel();
      renderPage();
    });
  });

  // Month dropdown toggle — use fixed positioning to escape overflow:hidden parents
  $on('month-dropdown-btn', 'click', e => {
    e.stopPropagation();
    const panel = $id('month-dropdown-panel');
    const btn   = $id('month-dropdown-btn');
    if (!panel || !btn) return;
    const isOpen = panel.classList.contains('open');
    if (!isOpen) {
      const rect   = btn.getBoundingClientRect();
      const vw     = window.innerWidth;
      const vh     = window.innerHeight;
      const panelW = 260;
      let leftPos  = rect.left;
      if (leftPos + panelW > vw - 8) leftPos = Math.max(8, rect.right - panelW);
      const estH   = 320;
      let topPos   = rect.bottom + 6;
      if (topPos + estH > vh - 8) topPos = Math.max(8, rect.top - estH - 6);
      panel.style.top  = topPos  + 'px';
      panel.style.left = leftPos + 'px';
      _pendingMonths = STATE.selectedMonths ? [...STATE.selectedMonths] : null;
    }
    panel.classList.toggle('open', !isOpen);
    btn.classList.toggle('open', !isOpen);
  });

  // ── Region, Vertical, Account — now all multi-select ────
  initMultiSelect('region-sel',   v => { STATE.region = v; STATE.subRegion=[]; STATE.regionHead=[]; STATE.practiceHead=[]; _syncFilterDropdowns(); renderPage(); });
  initMultiSelect('vertical-sel', v => { STATE.vertical = v; _syncFilterDropdowns(); renderPage(); });
  initMultiSelect('account-sel',  v => { STATE.account  = v; renderPage(); });

  // Multi-select dropdowns: Sub Region, Region Head, Practice Head
  initMultiSelect('subregion-sel',    v => { STATE.subRegion    = v; STATE.regionHead=[]; STATE.practiceHead=[]; _syncFilterDropdowns(); renderPage(); });
  initMultiSelect('regionhead-sel',   v => { STATE.regionHead   = v; STATE.practiceHead=[]; _syncFilterDropdowns(); renderPage(); });
  initMultiSelect('practicehead-sel', v => { STATE.practiceHead = v; _syncFilterDropdowns(); renderPage(); });  

  // Close all multiselect panels on outside click
  document.addEventListener('click', e => {
    document.querySelectorAll('.ms-panel.open').forEach(panel => {
      const wrap = panel.closest('.ms-wrap');
      if (wrap && !wrap.contains(e.target)) panel.classList.remove('open');
    });
  });

  // Reset
  $on('reset-filters', 'click', () => {
    STATE.selectedMonths = null;
    STATE.quarter = 'ALL';
    STATE.region      = [];
    STATE.subRegion   = [];
    STATE.regionHead  = [];
    STATE.practiceHead= [];
    STATE.vertical    = [];
    STATE.account     = [];
    // Reset all multi-select UI
    resetMultiSelect('region-sel');
    resetMultiSelect('vertical-sel');
    resetMultiSelect('account-sel');
    resetMultiSelect('subregion-sel');
    resetMultiSelect('regionhead-sel');
    resetMultiSelect('practicehead-sel');
    _syncAccountDropdown();
    setQuarterActive('ALL');
    rebuildMonthGrid();
    updateMonthBtnLabel();
    renderPage();
  });

  rebuildMonthGrid();
  updateMonthBtnLabel();
  _syncAccountDropdown();
}

function setQuarterActive(q) {
  document.querySelectorAll('.fb-pill[data-q]').forEach(p =>
    p.classList.toggle('active', p.dataset.q === q));
}

function rebuildMonthGrid() {
  const fd   = FIN_DATA[STATE.fy];
  const grid = $id('month-grid');
  if (!grid) return;
  const sel  = STATE.selectedMonths;
  grid.innerHTML = fd.mLabels.map((lbl, i) => {
    const isActive = !sel || sel.includes(i);
    return `<div class="month-chk-item ${isActive ? 'sel' : ''}" data-idx="${i}" onclick="toggleMonthItem(this, ${i})">${lbl}</div>`;
  }).join('');
}

window.toggleMonthItem = function(el, idx) {
  const isNowSel = !el.classList.contains('sel');
  el.classList.toggle('sel', isNowSel);
  // Build pending from scratch based on current visual state
  if (_pendingMonths === null) {
    // Was "all selected" — initialise with all 12 indices
    _pendingMonths = [...Array(12).keys()];
  }
  if (isNowSel) {
    if (!_pendingMonths.includes(idx)) _pendingMonths.push(idx);
  } else {
    _pendingMonths = _pendingMonths.filter(i => i !== idx);
  }
};

window.clearMonths = function() {
  _pendingMonths = [];
  document.querySelectorAll('.month-chk-item').forEach(el => el.classList.remove('sel'));
};

window.selectAllMonths = function() {
  _pendingMonths = null;
  document.querySelectorAll('.month-chk-item').forEach(el => el.classList.add('sel'));
};

window.applyMonths = function() {
  if (_pendingMonths === null) {
    STATE.selectedMonths = null; // all months
  } else if (_pendingMonths.length === 0) {
    STATE.selectedMonths = null; // nothing checked → fall back to all
  } else if (_pendingMonths.length === 12) {
    STATE.selectedMonths = null; // all 12 checked → same as null
  } else {
    STATE.selectedMonths = [..._pendingMonths].sort((a, b) => a - b);
  }
  STATE.quarter = detectQuarter(STATE.selectedMonths);
  setQuarterActive(STATE.quarter);
  updateMonthBtnLabel();
  const panel = $id('month-dropdown-panel');
  const btn   = $id('month-dropdown-btn');
  if (panel) panel.classList.remove('open');
  if (btn)   btn.classList.remove('open');
  renderPage();
};

function detectQuarter(sel) {
  if (!sel) return 'ALL';
  const s = sel.join(',');
  if (s === '0,1,2')   return 'Q1';
  if (s === '3,4,5')   return 'Q2';
  if (s === '6,7,8')   return 'Q3';
  if (s === '9,10,11') return 'Q4';
  return 'ALL';
}

function updateMonthBtnLabel() {
  const sel   = STATE.selectedMonths;
  const badge = $id('month-badge');
  const lbl   = $id('month-btn-label');
  if (!sel) {
    if (lbl)   lbl.textContent = 'All';
    if (badge) badge.style.display = 'none';
  } else {
    const fd = FIN_DATA[STATE.fy];
    if (lbl) lbl.textContent = sel.length === 1
      ? fd.mLabels[sel[0]]
      : sel.length <= 3 ? sel.map(i => fd.mLabels[i]).join(', ')
      : `${sel.length} Months`;
    if (badge) { badge.textContent = sel.length; badge.style.display = 'inline'; }
  }
}

// ═══════════════════════════════════════════════════════════
// PERIOD SLICE HELPERS
// ═══════════════════════════════════════════════════════════

// Returns array of month indices to include (0-11)
function getSelectedIndices() {
  if (STATE.selectedMonths && STATE.selectedMonths.length > 0) {
    return [...STATE.selectedMonths].sort((a, b) => a - b);
  }
  return [...Array(12).keys()]; // all 12 months [0..11]
}

// Last index with actual revenue > 0 (trendline cutoff)
function getLastActualIdx(fyKey) {
  const fd   = FIN_DATA[fyKey];
  const revA = fd.monthly.revA;
  for (let i = revA.length - 1; i >= 0; i--) {
    if ((revA[i] || 0) > 0) return i;
  }
  return 0;
}

// ═══════════════════════════════════════════════════════════
// AGGREGATION HELPERS (spec §10)
// ═══════════════════════════════════════════════════════════

// SUM of arr values at the given indices
function sumAt(arr, indices) {
  return indices.reduce((t, i) => t + ((arr || [])[i] || 0), 0);
}

// Average of non-zero values at the given indices
function avgNzAt(arr, indices) {
  const vals = indices.map(i => (arr || [])[i] || 0).filter(v => v > 0);
  return vals.length ? vals.reduce((t, v) => t + v, 0) / vals.length : 0;
}

// Get the LATEST month snapshot: the value at the last index that has a non-zero value
// If all are zero, returns the value at the last index (could be 0)
function latestSnapshotAt(arr, indices) {
  // Use the last index in the selected period with a non-zero value
  const sorted = [...indices].sort((a, b) => a - b);
  for (let k = sorted.length - 1; k >= 0; k--) {
    const val = (arr || [])[sorted[k]] || 0;
    if (val > 0) return val;
  }
  // Fall back to the last selected index value (may be 0)
  return (arr || [])[sorted[sorted.length - 1]] || 0;
}

// YTD AVERAGE headcount across all selected months (including zeros if data exists)
// Per spec: WL1 uses YTD average
function ytdAvgAt(arr, indices) {
  const sorted = [...indices].sort((a, b) => a - b);
  // Only average over months that have data (> 0)
  const vals = sorted.map(i => (arr || [])[i] || 0).filter(v => v > 0);
  return vals.length ? vals.reduce((t, v) => t + v, 0) / vals.length : 0;
}

// Total WL1 headcount across all period months (sum of all months' WL1)
function totalWL1At(arr, indices) {
  return sumAt(arr, indices);
}

// ═══════════════════════════════════════════════════════════
// METRICS CALCULATION  (spec §1–§7)
// ═══════════════════════════════════════════════════════════

// Returns scaling ratios {revA, revB, revF, cmA, cmB} for the active project filters.
// When no project filter is active every ratio = 1 (no change).
// When filters are active we compare filtered-project totals vs all-project totals,
// then multiply each monthly array value by the corresponding ratio.
function _getFilterRatios(fyKey) {
  const fd = FIN_DATA[fyKey];
  if (!fd || !fd.projects) return null; // no project data → no scaling

  const hasFilter = STATE.region.length > 0 || STATE.subRegion.length > 0 ||
                    STATE.regionHead.length > 0 || STATE.practiceHead.length > 0 ||
                    STATE.vertical.length > 0 || STATE.account.length > 0;
  if (!hasFilter) return null; // no filter active → use raw monthly arrays as-is

  const all      = fd.projects;
  const filtered = filterProjects(all);

  const sum = (arr, key) => arr.reduce((t, p) => t + (p[key] || 0), 0);

  const totRevA = sum(all, 'revA');
  const totRevB = sum(all, 'revB');
  const totRevF = sum(all, 'revF');
  const totCmA  = sum(all, 'cmA');
  const totCmB  = sum(all, 'cmB');

  const filRevA = sum(filtered, 'revA');
  const filRevB = sum(filtered, 'revB');
  const filRevF = sum(filtered, 'revF');
  const filCmA  = sum(filtered, 'cmA');
  const filCmB  = sum(filtered, 'cmB');

  // ── Compute filtered monthly TC and HC arrays for PPC calculation ──────────
  // Sum per-project monthly tc[] and hc[] for all filtered projects.
  // Falls back to global monthly arrays scaled by TC ratio if per-project data unavailable.
  let filteredMonthlyTC = null;
  let filteredMonthlyHC = null;
  if (fd.tcByProject && fd.hcByProject) {
    filteredMonthlyTC = new Array(12).fill(0);
    filteredMonthlyHC = new Array(12).fill(0);
    for (const proj of filtered) {
      const projName = proj.name;
      const tcArr = fd.tcByProject[projName] || new Array(12).fill(0);
      const hcArr = fd.hcByProject[projName] || new Array(12).fill(0);
      for (let i = 0; i < 12; i++) {
        filteredMonthlyTC[i] += (tcArr[i] || 0);
        filteredMonthlyHC[i] += (hcArr[i] || 0);
      }
    }
  }

  return {
    revA: totRevA > 0 ? filRevA / totRevA : 0,
    revB: totRevB > 0 ? filRevB / totRevB : 0,
    revF: totRevF > 0 ? filRevF / totRevF : 0,
    cmA:  totCmA  !== 0 ? filCmA  / totCmA  : 0,
    cmB:  totCmB  > 0 ? filCmB  / totCmB  : 0,
    // For display: actual filtered totals (used in Revenue Analysis tiles)
    filteredRevA: filRevA,
    filteredRevB: filRevB,
    filteredRevF: filRevF,   // sum of projects[].revF for filtered accounts
    filteredCmA:  filCmA,
    filteredCmB:  filCmB,
    filteredCount: filtered.length,
    totalCount:    all.length,
    // Per-month TC and HC for filtered projects (used for PPC calculation)
    filteredMonthlyTC,
    filteredMonthlyHC,
  };
}

// Helper: scale a monthly array by a ratio (returns a new array)
function _scaleArr(arr, ratio) {
  if (ratio === null) return arr;
  return (arr || []).map(v => (v || 0) * ratio);
}

// ── Compute byRegion totals for chart display ─────────────────────────────
// When NO project filters are active → use the Excel-sourced fd.byRegion (accurate totals).
// When filters ARE active → compute proportionally from filtered projects vs all projects.
// Returns array sorted: South, West, North, New Sales (then any others alphabetically).
function _calcByRegion(fd) {
  const REGION_ORDER = ['South', 'West', 'North', 'New Sales'];
  const hasFilter = (
    STATE.region.length > 0 || STATE.subRegion.length > 0 ||
    STATE.regionHead.length > 0 || STATE.practiceHead.length > 0 ||
    STATE.vertical.length > 0 || STATE.account.length > 0
  );

  if (!hasFilter) {
    // No filters — return accurate Excel-sourced byRegion directly
    return fd.byRegion.slice();
  }

  // Filters active — compute from projects proportionally
  // First get totals from all projects (unfiltered) and filtered projects
  const allProjs      = fd.projects;
  const filteredProjs = filterProjects(fd.projects);

  // Build totals by region for all projects
  const allMap = {};
  for (const p of allProjs) {
    const r = p.region || 'Other';
    if (!allMap[r]) allMap[r] = { revA: 0, revB: 0, cmA: 0, cmB: 0 };
    allMap[r].revA += (p.revA || 0);
    allMap[r].revB += (p.revB || 0);
    allMap[r].cmA  += (p.cmA  || 0);
    allMap[r].cmB  += (p.cmB  || 0);
  }

  // Build totals by region for filtered projects
  const filtMap = {};
  for (const p of filteredProjs) {
    const r = p.region || 'Other';
    if (!filtMap[r]) filtMap[r] = { revA: 0, revB: 0, cmA: 0, cmB: 0 };
    filtMap[r].revA += (p.revA || 0);
    filtMap[r].revB += (p.revB || 0);
    filtMap[r].cmA  += (p.cmA  || 0);
    filtMap[r].cmB  += (p.cmB  || 0);
  }

  // Scale Excel-sourced byRegion values by filtered/all ratio per region
  const result = {};
  for (const bk of fd.byRegion) {
    const r = bk.name;
    const allR = allMap[r] || { revA: 1, revB: 1, cmA: 1, cmB: 1 };
    const filtR = filtMap[r] || { revA: 0, revB: 0, cmA: 0, cmB: 0 };
    const ratioA = allR.revA > 0 ? filtR.revA / allR.revA : 0;
    const ratioB = allR.revB > 0 ? filtR.revB / allR.revB : 0;
    const ratioCa = allR.cmA > 0 ? filtR.cmA / allR.cmA : 0;
    const ratioCb = allR.cmB > 0 ? filtR.cmB / allR.cmB : 0;
    result[r] = {
      name: r,
      revA: bk.revA * ratioA,
      revB: bk.revB * ratioB,
      cmA:  bk.cmA  * ratioCa,
      cmB:  bk.cmB  * ratioCb,
    };
  }

  // Sort by defined order
  const known = REGION_ORDER.filter(r => result[r]);
  const extra = Object.keys(result).filter(r => !REGION_ORDER.includes(r)).sort();
  return [...known, ...extra].map(r => result[r]);
}

function calcMetrics(fyKey) {
  const fd      = FIN_DATA[fyKey];
  const m       = fd.monthly;
  const indices = getSelectedIndices();
  const numMonths = indices.length || 1;

  // ── Apply project-level filter scaling ─────────────────────
  // If region/subRegion/regionHead/practiceHead/vertical/account filters are active,
  // scale each monthly array proportionally to the filtered project share.
  const ratios = _getFilterRatios(fyKey);
  const mRevA     = ratios ? _scaleArr(m.revA,      ratios.revA) : m.revA;
  const mRevAFull = ratios ? _scaleArr(m.revA_full || m.revA, ratios.revA) : (m.revA_full || m.revA);
  const mRevB = ratios ? _scaleArr(m.revB, ratios.revB) : m.revB;
  const mRevF = ratios ? _scaleArr(m.revF, ratios.revA) : m.revF;  // use revA ratio for forecast (actual share is best proxy)
  const mCmA  = ratios ? _scaleArr(m.cmA,  ratios.cmA)  : m.cmA;
  const mCmB  = ratios ? _scaleArr(m.cmB,  ratios.cmB)  : m.cmB;
  const mCmF  = ratios ? _scaleArr(m.cmF,  ratios.cmB)  : m.cmF; // cmF scaled by cmB ratio (best proxy)

  // ── 1. Revenue (Lakhs — divide by 100 for Crores in display) ──
  // When project filters are active and ALL months are selected (YTD),
  // use filteredRevA directly from projects[] — this is the exact per-account
  // sum from Excel, avoiding the proportional scaling approximation error.
  // For quarterly/monthly selections, scaling is still used (no per-period project data).
  const isAllMonths = !STATE.selectedMonths || STATE.selectedMonths.length === 0 || STATE.selectedMonths.length === 12;
  const revA  = (ratios && isAllMonths) ? ratios.filteredRevA : sumAt(mRevA, indices);   // Lacs
  const revB  = (ratios && isAllMonths) ? ratios.filteredRevB : sumAt(mRevB, indices);   // Lacs

  // ── Forecast Revenue logic (per user spec) ──────────────────
  // YTD (quarter=ALL, no specific month selection):
  //   No filter:      Forecast = revA_full total (actuals Apr–Jan + Feb+Mar from Revenue_Actual sheet)
  //   Filter active:  Forecast = filteredRevA (actuals) + account's proportional share of Feb+Mar
  //                   = filteredRevA × (revA_full_total / revA_total)
  //                   This preserves the same rule: actual where available, forecast for remaining months
  // Monthly / Quarterly (Q1/Q2/Q3/Q4 or specific months selected):
  //   Forecast = pure values from Rev_Forecast sheet (revF array), scaled by filter ratio
  const isYTD = (STATE.quarter === 'ALL' && (!STATE.selectedMonths || STATE.selectedMonths.length === 0 || STATE.selectedMonths.length > 3));
  let revF;
  if (isYTD && ratios && isAllMonths) {
    // Filtered YTD: actual (Apr–Jan) + proportional Feb+Mar forecast
    // revA_full_total / revA_total gives the scale factor to convert actuals to full-year forecast
    const revA_full_total = fd.totals.revF;   // 10,430.65 L = sum of revA_full (company-wide YTD forecast)
    const revA_total      = fd.totals.revA;   // 8,488.65 L  = sum of revA (company-wide actuals only)
    const fullYearScale   = revA_total > 0 ? revA_full_total / revA_total : 1;
    revF = ratios.filteredRevA * fullYearScale;
  } else if (isYTD) {
    // No filter, YTD: use revA_full directly (company-wide)
    revF = sumAt(mRevAFull, indices);
  } else {
    // Monthly/Quarterly: pure Rev_Forecast sheet values (scaled if filter active)
    revF = sumAt(mRevF, indices);
  }

  // CM Forecast follows same logic:
  // YTD CM Forecast (filtered): scale filteredCmA by same full-year ratio as revenue
  // YTD CM Forecast (no filter): sum of actual CM only (Feb/Mar CM not available)
  // Monthly/Quarterly CM Forecast = pure CM_Forecast sheet values
  let cmFBlended;
  if (isYTD && ratios && isAllMonths) {
    // Filtered YTD: apply same full-year scale to actual CM
    const cmF_total = fd.totals.cmF;   // full-year CM forecast (company-wide)
    const cmA_total = fd.totals.cmA;   // YTD actual CM (company-wide)
    const cmFullYearScale = cmA_total > 0 ? cmF_total / cmA_total : 1;
    cmFBlended = ratios.filteredCmA * cmFullYearScale;
  } else if (isYTD) {
    cmFBlended = indices.reduce((t, i) => {
      const a = (mRevA[i] || 0);
      return t + (a > 0 ? (mCmA[i] || 0) : 0);  // YTD: actual CM only (confirmed months)
    }, 0);
  } else {
    cmFBlended = sumAt(mCmF, indices);  // Monthly/Quarterly: pure CM_Forecast sheet values
  }

  // Revenue variances (%) — spec §1
  const revVarPct  = revB  > 0 ? (revA - revB) / revB * 100 : 0;
  const revFVarPct = revB  > 0 ? (revF - revB) / revB * 100 : 0;

  // ── 2. CM (Lakhs) ──────────────────────────────────────────
  // Same logic as revenue: use filteredCmA directly for YTD filtered view
  const cmA  = (ratios && isAllMonths) ? ratios.filteredCmA : sumAt(mCmA, indices);
  const cmB  = (ratios && isAllMonths) ? ratios.filteredCmB : sumAt(mCmB, indices);
  const cmF  = cmFBlended;   // blended: actual CM where available, else forecast

  // CM % — spec §2
  const cmAPct = revA > 0 ? cmA / revA * 100 : 0;
  const cmBPct = revB > 0 ? cmB / revB * 100 : 0;
  const cmFPct = revF > 0 ? cmF / revF * 100 : 0;

  // CM variances — spec §2
  const cmVarPct = cmB  > 0 ? (cmA - cmB) / cmB * 100 : 0;
  const cmPPVar  = cmAPct - cmBPct;  // percentage-point variance

  // ── 3. PPC (₹/person/month) — spec §3 ────────────────────
  // Formula: Total Cost / Overall Headcount for the selected period
  // Month:   TC[i] / HC[i]
  // Quarter / YTD: sum(TC[selected]) / sum(HC[selected])   (weighted average)
  // When project filters are active: use per-project monthly TC/HC summed for filtered projects.
  // Otherwise: use company-wide monthly totalCost / hcOverall arrays.
  let ppcTCArr, ppcHCArr;
  if (ratios && ratios.filteredMonthlyTC && ratios.filteredMonthlyHC) {
    // Filter active → use sum of per-project TC and HC for filtered projects
    ppcTCArr = ratios.filteredMonthlyTC;
    ppcHCArr = ratios.filteredMonthlyHC;
  } else {
    // No filter → use company-wide arrays
    ppcTCArr = m.totalCost || [];
    ppcHCArr = m.hcOverall;
  }
  const ppcIndices  = indices.filter(i => (ppcTCArr[i] || 0) > 0 && (ppcHCArr[i] || 0) > 0);
  const sumTC       = ppcIndices.reduce((t, i) => t + (ppcTCArr[i] || 0), 0);
  const sumHCForPPC = ppcIndices.reduce((t, i) => t + (ppcHCArr[i] || 0), 0);
  const ppcRaw      = sumHCForPPC > 0 ? sumTC / sumHCForPPC : 0;
  const ppc         = Math.round(ppcRaw);   // exact value — no rounding to nearest 100
  const ppcBudget   = 0;  // Budget PPC not in current data; placeholder
  const ppcVar      = ppcBudget > 0 ? ppc - ppcBudget : null;

  // Fall back to FY totals.ppcAvg if no monthly data
  const ppcDisplay  = ppc > 0 ? ppc : (fd.totals.ppcAvg || 0);

  // ── 4. Headcount — spec §4 ────────────────────────────────
  // Overall: LATEST month with actual data (where hcOverall > 0)
  const hc   = latestSnapshotAt(m.hcOverall,  indices);
  // WL1 (Recruiters): YTD AVERAGE
  const wl1  = ytdAvgAt(m.hcWL1, indices);

  // Approved: use the same month as Overall HC (not independently latest)
  // Find the index of the latest actual Overall HC month
  const latestHcIdx = (() => {
    const sorted = [...indices].sort((a, b) => a - b);
    for (let k = sorted.length - 1; k >= 0; k--) {
      if ((m.hcOverall[sorted[k]] || 0) > 0) return sorted[k];
    }
    return sorted[sorted.length - 1];
  })();
  const appr = (m.hcApproved[latestHcIdx] || 0);

  // Utilisation = Overall / Approved × 100
  const hcUtil = appr > 0 ? hc / appr * 100 : 0;

  // ── 5. Productivity — spec §5 ────────────────────────────
  // Total WL1 HC across all period months (SUM of monthly WL1) — used for Taggd JP
  const totalWL1HC = totalWL1At(m.hcWL1, indices);

  // Revenue Productivity: sum(RevA) / sum(WL1) for selected period
  // Formula: Total RevActual ÷ Total WL1 (same period) = ₹L per recruiter-month
  // This correctly handles Apr (1 month), Q1 (3 months), YTD, FY etc.
  const validProdIdx = indices.filter(i => (mRevA[i]||0) > 0 && (m.hcWL1[i]||0) > 0);
  const sumWL1Prod = sumAt(m.hcWL1, validProdIdx);
  const sumRevProd = sumAt(mRevA,   validProdIdx);
  const revProdA   = sumWL1Prod > 0 ? sumRevProd / sumWL1Prod : 0;
  // Budget productivity: sum(RevB) / sum(WL1) for same valid months
  const sumRevBProd = sumAt(mRevB, validProdIdx);
  const revProdB    = sumWL1Prod > 0 ? sumRevBProd / sumWL1Prod : 0;
  // Always calculated consistently for both FYs
  const revProdA_hasSource = revProdA > 0;

  // Taggd Joiner Productivity = Taggd Joiners / totalWL1HC / numMonths  (spec §5)
  const taggd  = sumAt(m.taggd, indices);
  const nonTg  = sumAt(m.nonT,  indices);
  const taggdJP = totalWL1HC > 0 ? taggd / totalWL1HC : 0;

  // Revenue Per Hire (Lacs/hire)
  const totalJ = taggd + nonTg;
  const revPerHire = totalJ > 0 ? revA / totalJ : 0;

  // Taggd mix %
  const taggdMix = totalJ > 0 ? taggd / totalJ * 100 : 0;

  // ── 6. Hiring — spec §6 ───────────────────────────────────
  // taggd, nonTg, totalJ already computed above
  const taggdMixPct    = taggdMix;
  const nonTaggdMixPct = totalJ > 0 ? nonTg / totalJ * 100 : 0;

  // ── 7. Collections & Cash — spec §7 ─────────────────────
  const collA = sumAt(m.collA, indices);   // Lacs
  const collT = sumAt(m.collT, indices);   // Lacs
  const collAtt = collT > 0 ? collA / collT * 100 : 0;  // attainment %

  const ub = sumAt(m.ub, indices);   // Lacs
  const bd = sumAt(m.bd, indices);   // Lacs
  const revAdj = sumAt(m.revAdj || [], indices);  // Revenue Adjustment (Lacs)

  const ubPctRev = revA > 0 ? ub / revA * 100 : 0;
  const bdPctColl = collA > 0 ? bd / collA * 100 : 0;

  return {
    // Revenue (Lacs — callers convert /100 for Crores display)
    revA, revB, revF,
    revVarPct, revFVarPct,

    // CM (Lacs)
    cmA, cmB, cmF,
    cmAPct, cmBPct, cmFPct,
    cmVarPct, cmPPVar,

    // PPC (₹ — already per person per month)
    ppc: ppcDisplay,
    ppcBudget,
    ppcVar,

    // Headcount
    hc, wl1, appr, hcUtil,
    totalWL1HC,

    // Productivity (Lacs)
    revProdA, revProdB, revProdA_hasSource,
    revPerHire,
    sumRevProd, sumWL1Prod,

    // Hiring
    taggd, nonTg, totalJ,
    taggdJP, taggdMix, taggdMixPct, nonTaggdMixPct,

    // Collections (Lacs)
    collA, collT, collAtt,

    // Cash
    ub, bd, revAdj, ubPctRev, bdPctColl,

    // Meta
    numMonths,
    // Latest actual month label (for headcount display) — same month as latestHcIdx
    latestMonthLabel: fd.mLabels[latestHcIdx] || '',
  };
}

function getMetrics()     { return calcMetrics(STATE.fy); }
function getPrevFY()      { return STATE.fy === 'FY2526' ? 'FY2425' : null; }
function getPrevMetrics() { const p = getPrevFY(); return p ? calcMetrics(p) : null; }

// Returns an HTML badge string when project-level filters are active,
// so users can clearly see that numbers are scoped to a subset of accounts.
function filterBadge() {
  const parts = [];
  if (STATE.region.length      > 0) parts.push('Region: ' + STATE.region.join(', '));
  if (STATE.subRegion.length   > 0) parts.push('Sub-Region: ' + STATE.subRegion.join(', '));
  if (STATE.regionHead.length  > 0) parts.push('Reg Head: ' + STATE.regionHead.join(', '));
  if (STATE.practiceHead.length> 0) parts.push('Practice: ' + STATE.practiceHead.join(', '));
  if (STATE.vertical.length    > 0) parts.push('Vertical: ' + STATE.vertical.join(', '));
  if (STATE.account.length     > 0) parts.push('Account: ' + STATE.account.slice(0,3).join(', ') + (STATE.account.length>3?` +${STATE.account.length-3} more`:''));
  if (!parts.length) return '';
  return `<div class="filter-active-badge"><i class="fas fa-filter"></i> Filtered by: <strong>${parts.join(' | ')}</strong> &nbsp;<button class="fbadge-clear" onclick="document.getElementById('reset-filters').click()">✕ Clear</button></div>`;
}

// ── MoM Delta (spec §8): compare INDIVIDUAL months, not cumulative ──────
// Compares the last actual month vs the prior month in the same FY
function getMoMDelta(arr, fyKey) {
  const lastIdx = getLastActualIdx(fyKey);
  const prevIdx = lastIdx > 0 ? lastIdx - 1 : null;
  if (prevIdx === null) return null;
  const cur  = (arr[lastIdx]  || 0);
  const prev = (arr[prevIdx]  || 0);
  if (prev === 0) return null;
  return (cur - prev) / Math.abs(prev) * 100;
}

// ── MoM within selected period ─────────────────────────────────────────
function getMoMDeltaInPeriod(arr) {
  const indices = getSelectedIndices();
  if (indices.length < 2) return null;
  // Find last non-zero and its predecessor in the selected indices
  for (let k = indices.length - 1; k >= 1; k--) {
    const cur  = (arr || [])[indices[k]]     || 0;
    const prev = (arr || [])[indices[k - 1]] || 0;
    if (cur > 0 && prev > 0) {
      return (cur - prev) / Math.abs(prev) * 100;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// RENDER ROUTING
// ═══════════════════════════════════════════════════════════
function renderPage() {
  destroyCharts();
  updatePageTitle();
  const content = document.getElementById('content');
  if (!content) { console.warn('[Dashboard] #content element not found'); return; }
  const pages = {
    overview: renderOverview,
    pnl:      renderPnL,
    revenue:  renderRevenue,
    expense:  renderExpense,
    hiring:   renderHiring,
    cashflow: renderCashflow,
    manual:   renderManual,
  };
  const fn = pages[STATE.page] || pages.overview;
  content.innerHTML = fn();
  // Cancel any previously queued initCharts RAF to avoid double-render
  if (_pendingRafId !== null) cancelAnimationFrame(_pendingRafId);
  _pendingRafId = requestAnimationFrame(() => { _pendingRafId = null; initCharts(); });
}

function destroyCharts() {
  Object.values(CHARTS).forEach(c => { try { c.destroy(); } catch(e){} });
  CHARTS = {};
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
function varPct(a, b) { return b !== 0 ? (a - b) / Math.abs(b) * 100 : 0; }
function showPct(v)   { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }
function varCls(v)    { return v >= 0 ? 'td-pos' : 'td-neg'; }
function varArrow(v)  { return v >= 0 ? '↑' : '↓'; }
if (!fmt.pp) fmt.pp = v => (v >= 0 ? '+' : '') + v.toFixed(1) + 'pp';

// ═══════════════════════════════════════════════════════════
// KPI TILE (Executive Overview tiles)
// ═══════════════════════════════════════════════════════════
// yoy: { pyVal, pct, cls }  — prior-year comparison row
function kpiTile({ color, label, icon, val, targetLine, badge1, badge2, noData, yoy }) {
  const b1Html = badge1 ? `
    <div class="kpi-badge" style="flex-direction:column;align-items:flex-start">
      <div class="kpi-badge-lbl">${badge1.label}</div>
      <div class="kpi-badge-val ${badge1.cls||'neu'}">${badge1.prefix||''}${badge1.val}</div>
    </div>` : '';
  const b2Html = badge2 ? `
    <div class="kpi-badge" style="flex-direction:column;align-items:flex-start">
      <div class="kpi-badge-lbl">${badge2.label}</div>
      <div class="kpi-badge-val ${badge2.cls||'neu'}">${badge2.prefix||''}${badge2.val}</div>
    </div>` : '';

  // badges section — never show "No comparison data" if there are badges
  const badgesHtml = (b1Html || b2Html)
    ? `<div class="kpi-tile-badges">${b1Html}${b2Html}</div>`
    : (noData
        ? `<div class="kpi-tile-no-data"><i class="fas fa-minus-circle" style="margin-right:4px"></i>No period data</div>`
        : '');

  // YoY prior-year row
  const yoyHtml = yoy
    ? `<div class="kpi-tile-yoy">
        <span class="kpi-tile-yoy-lbl">vs FY24-25</span>
        <span class="kpi-tile-yoy-val">${yoy.pyVal}</span>
        <span class="kpi-tile-yoy-diff ${yoy.cls||'neu'}">${yoy.arrow||''}${yoy.pct}</span>
      </div>`
    : '';

  return `
  <div class="kpi-tile ${color}">
    <div class="kpi-tile-hd">
      <span>${label}</span>
      <i class="fas ${icon}"></i>
    </div>
    <div class="kpi-tile-body">
      <div class="kpi-tile-val">${val}</div>
      ${targetLine ? `<div class="kpi-tile-target"><i class="fas fa-circle-dot"></i> ${targetLine}</div>` : ''}
      ${badgesHtml}
      ${yoyHtml}
    </div>
  </div>`;
}

// Build a yoy object for kpiTile
// curVal & prevVal in same units; fmtFn formats display value; invertGood = true if lower is better
function mkYoy(curVal, prevVal, fmtFn, invertGood) {
  if (!prevVal || prevVal === 0) return null;
  const pct  = (curVal - prevVal) / Math.abs(prevVal) * 100;
  const good = invertGood ? pct <= 0 : pct >= 0;
  return {
    pyVal: fmtFn(prevVal),
    pct:   Math.abs(pct).toFixed(1) + '%',
    cls:   good ? 'up' : 'dn',
    arrow: pct >= 0 ? '↑ ' : '↓ ',
  };
}

// Badge helper
function mkBadge(val, label, good) {
  if (val === null || val === undefined) return null;
  const up   = val >= 0;
  const cls  = good === undefined ? (up ? 'up' : 'dn') : (good ? 'up' : 'dn');
  const arrow= up ? '↑' : '↓';
  return { label, val: Math.abs(val).toFixed(1) + '%', cls, prefix: arrow + ' ' };
}

// ═══════════════════════════════════════════════════════════
// OVERVIEW PAGE  — ALL metrics + charts here
// ═══════════════════════════════════════════════════════════
function renderOverview() {
  const m    = getMetrics();
  const prev = STATE.compare ? getPrevMetrics() : null;
  const fd   = FIN_DATA[STATE.fy];
  const ins  = buildInsights(m, prev);
  const pfy  = getPrevFY();

  // Apply filter scaling for MoM delta calculations
  const ratios = _getFilterRatios(STATE.fy);
  const mRevA = ratios ? _scaleArr(fd.monthly.revA, ratios.revA) : fd.monthly.revA;
  const mCmA  = ratios ? _scaleArr(fd.monthly.cmA,  ratios.cmA)  : fd.monthly.cmA;

  // ── Derived display values (all monetary in Crores = Lacs/100) ──
  // Collection attainment % (spec §7)
  const collAtt  = m.collT > 0 ? m.collA / m.collT * 100 : 0;

  // MoM deltas using individual month comparison (spec §8)
  const momRev  = getMoMDeltaInPeriod(mRevA);
  const momCm   = getMoMDeltaInPeriod(mCmA);
  const momColl = getMoMDeltaInPeriod(fd.monthly.collA);
  const momHC   = getMoMDeltaInPeriod(fd.monthly.hcOverall);

  // MoM for Rev Productivity: compare last actual month vs prior month (revA[i]/wl1[i])
  // Build a per-month productivity array and use getMoMDeltaInPeriod on it
  const revProdMonthly = mRevA.map((r, i) => {
    const w = (fd.monthly.hcWL1[i] || 0);
    return r > 0 && w > 0 ? r / w : 0;
  });
  const momRevProd = getMoMDeltaInPeriod(revProdMonthly);

  // vs Budget variances
  const vtRev   = m.revB  > 0 ? m.revVarPct  : null;           // % (spec §1)
  const vtCM    = m.cmBPct > 0 ? m.cmPPVar    : null;           // pp (spec §2)
  const vtProd  = m.revProdB > 0 ? varPct(m.revProdA, m.revProdB) : null;
  const vtColl  = m.collT > 0 ? varPct(m.collA, m.collT) : null;

  // Headcount Utilisation % (spec §4)
  const hcUtil  = m.hcUtil;

  // Taggd Joiner Productivity: joiners per recruiter (spec §5)
  const tjpVal  = m.taggdJP > 0 ? m.taggdJP.toFixed(2) + ' J/R' : 'N/A';

  // Revenue Productivity display (spec §5)
  const revProdDisp = m.revProdA > 0 ? '₹' + m.revProdA.toFixed(2) + ' L' : 'N/A';
  const revProdTgt  = m.revProdB > 0 ? `Target: ₹${m.revProdB.toFixed(2)} L/Rec/Mo` : 'Target: N/A';

  // ── 8 KPI Tiles ─────────────────────────────────────────
  // PPC: computed as Total Cost / HC Overall for selected period (month/quarter/YTD)
  const ppcFinal    = m.ppc > 0 ? m.ppc : (FIN_DATA[STATE.fy].totals.ppcAvg || 0);
  const ppcValStr   = ppcFinal > 0 ? '₹' + ppcFinal.toLocaleString('en-IN') : 'N/A';
  const prevPpcFinal = prev ? (prev.ppc > 0 ? prev.ppc : (pfy ? FIN_DATA[pfy].totals.ppcAvg : 0)) : 0;

  const tileHtml = `
  <div class="kpi-grid-8">

    ${kpiTile({
      color: TILE_COLORS.rev, label: 'Revenue — Actual', icon: 'fa-indian-rupee-sign',
      val: fmt.cr(m.revA),
      targetLine: `Budget: ${fmt.cr(m.revB)}  |  Forecast: ${fmt.cr(m.revF)}`,
      badge1: momRev !== null ? mkBadge(momRev, 'MoM Growth', momRev >= 0) : null,
      badge2: vtRev  !== null ? { label:'vs Budget', val:Math.abs(vtRev).toFixed(1)+'%', cls:vtRev>=0?'up':'dn', prefix:vtRev>=0?'↑ ':'↓ ' } : null,
      noData: false,
      yoy: prev && STATE.compare ? mkYoy(m.revA, prev.revA, v => fmt.cr(v), false) : null,
    })}

    ${kpiTile({
      color: TILE_COLORS.cm, label: 'CM % — Actual', icon: 'fa-percent',
      val: m.revA > 0 ? m.cmAPct.toFixed(2) + '%' : 'N/A',
      targetLine: m.cmBPct > 0 ? `Budget: ${m.cmBPct.toFixed(2)}%  |  Fcst: ${m.cmFPct > 0 ? m.cmFPct.toFixed(2)+'%' : '—'}` : '—',
      badge1: momCm !== null ? mkBadge(momCm, 'MoM CM%', momCm >= 0) : null,
      badge2: vtCM  !== null ? { label:'vs Budget', val:Math.abs(vtCM).toFixed(1)+'pp', cls:vtCM>=0?'up':'dn', prefix:vtCM>=0?'↑ ':'↓ ' } : null,
      noData: false,
      yoy: prev && STATE.compare && prev.revA > 0 ? {
        pyVal: prev.cmAPct.toFixed(2) + '%',
        pct:   Math.abs(m.cmAPct - prev.cmAPct).toFixed(1) + 'pp',
        cls:   m.cmAPct >= prev.cmAPct ? 'up' : 'dn',
        arrow: m.cmAPct >= prev.cmAPct ? '↑ ' : '↓ ',
      } : null,
    })}

    ${kpiTile({
      color: TILE_COLORS.ppc, label: 'PPC / Person / Month', icon: 'fa-database',
      val: ppcValStr,
      targetLine: ppcFinal > 0 ? 'Total Cost ÷ Overall HC (selected period)' : 'Data not available for this period',
      badge1: null,
      badge2: null,
      noData: ppcFinal === 0,
      yoy: prev && STATE.compare && prevPpcFinal > 0 && ppcFinal > 0
        ? mkYoy(ppcFinal, prevPpcFinal, v => '₹' + Math.round(v).toLocaleString('en-IN'), true)
        : null,
    })}

    ${kpiTile({
      color: TILE_COLORS.revprod, label: 'Rev Productivity (₹L/Rec/Mo)', icon: 'fa-arrow-trend-up',
      val: revProdDisp,
      targetLine: revProdTgt,
      badge1: momRevProd !== null ? mkBadge(momRevProd, 'MoM Growth', momRevProd >= 0) : null,
      badge2: vtProd !== null ? { label:'vs Target', val:Math.abs(vtProd).toFixed(1)+'%', cls:vtProd>=0?'up':'dn', prefix:vtProd>=0?'↑ ':'↓ ' } : null,
      noData: m.revProdA === 0,
      yoy: prev && STATE.compare && m.revProdA > 0 && prev.revProdA > 0
        ? mkYoy(m.revProdA, prev.revProdA, v => '₹' + v.toFixed(2) + ' L', false)
        : null,
    })}

    ${kpiTile({
      color: TILE_COLORS.tjp, label: 'Taggd Joiner Productivity', icon: 'fa-user-plus',
      val: tjpVal,
      targetLine: `WL1 Total: ${Math.round(m.totalWL1HC).toLocaleString('en-IN')} | Taggd: ${fmt.num(m.taggd)}`,
      badge1: null,
      badge2: null,
      noData: m.taggdJP === 0,
      yoy: prev && STATE.compare && prev.taggdJP > 0 && m.taggdJP > 0
        ? mkYoy(m.taggdJP, prev.taggdJP, v => v.toFixed(2) + ' J/R', false)
        : null,
    })}

    ${kpiTile({
      color: TILE_COLORS.hc, label: `Headcount — ${m.latestMonthLabel || 'Latest'} Snapshot`, icon: 'fa-users',
      val: m.hc > 0 ? Math.round(m.hc).toLocaleString('en-IN') : 'N/A',
      targetLine: m.appr > 0 ? `Approved: ${Math.round(m.appr).toLocaleString('en-IN')}  |  WL1 Avg: ${Math.round(m.wl1)}` : '—',
      badge1: momHC !== null ? mkBadge(momHC, 'MoM Change', momHC >= 0) : null,
      badge2: m.appr > 0 ? { label:'Utilisation', val:hcUtil.toFixed(1)+'%', cls: hcUtil>=85&&hcUtil<=115?'up':'dn', prefix:'' } : null,
      noData: false,
      yoy: prev && STATE.compare && prev.hc > 0
        ? mkYoy(m.hc, prev.hc, v => Math.round(v).toLocaleString('en-IN'), false)
        : null,
    })}

    ${kpiTile({
      color: TILE_COLORS.coll, label: 'Collection — Actual', icon: 'fa-hand-holding-dollar',
      val: m.collA > 0 ? fmt.cr(m.collA) : 'N/A',
      targetLine: m.collT > 0 ? `Target: ${fmt.cr(m.collT)}  |  Att: ${collAtt.toFixed(1)}%` : '—',
      badge1: momColl !== null ? mkBadge(momColl, 'MoM Growth', momColl >= 0) : null,
      badge2: vtColl  !== null ? { label:'vs Target', val:Math.abs(vtColl).toFixed(1)+'%', cls:vtColl>=0?'up':'dn', prefix:vtColl>=0?'↑ ':'↓ ' } : null,
      noData: false,
      yoy: prev && STATE.compare && prev.collA > 0
        ? mkYoy(m.collA, prev.collA, v => fmt.cr(v), false)
        : null,
    })}

    ${kpiTile({
      color: TILE_COLORS.unbilled, label: 'Unbilled & Bad Debt', icon: 'fa-file-invoice',
      val: m.ub > 0 ? fmt.cr(m.ub) : '₹0.00 Cr',
      targetLine: m.revA > 0 ? `Unbilled ${m.ubPctRev.toFixed(1)}% of Rev  |  Bad Debt: ${fmt.cr(m.bd)}` : '—',
      badge1: m.bd > 0 ? { label:'Bad Debt', val:fmt.cr(m.bd).replace('₹',''), cls:'dn', prefix:'₹' } : null,
      badge2: m.ubPctRev > 0 ? { label:'% of Revenue', val:m.ubPctRev.toFixed(1)+'%', cls:m.ubPctRev>8?'dn':m.ubPctRev>3?'warn':'neu', prefix:'' } : null,
      noData: m.ub === 0 && m.bd === 0,
      yoy: prev && STATE.compare && (prev.ub > 0 || prev.bd > 0)
        ? mkYoy(m.ub + m.bd, prev.ub + prev.bd, v => fmt.cr(v), true)
        : null,
    })}

  </div>`;

  // ── Summary Table ────────────────────────────────────────
  const summaryRows  = buildSummaryRows(m, prev);
  const periodLabel  = getPeriodLabel();
  const prevCols = STATE.compare && pfy
    ? `<th style="background:var(--blue-pale);color:var(--blue)">FY24-25 Actual (${FIN_DATA[pfy].short})</th>
       <th style="background:var(--blue-pale);color:var(--blue)">YoY</th>` : '';

  const tableHtml = `
  <div class="card g1">
    <div class="card-hd">
      <div>
        <div class="card-title">Executive Summary — ${fd.label} &nbsp;<span style="font-weight:400;color:var(--g500);font-size:11px">${periodLabel}</span></div>
        <div class="card-sub">Monetary values in ₹ Crores (1 Cr = 100 L). Headcount in actual count.</div>
      </div>
      <div class="legend">
        <div class="leg-it"><div class="leg-dot" style="background:var(--orange)"></div>${fd.short}</div>
        ${STATE.compare && pfy ? `<div class="leg-it"><div class="leg-dot" style="background:var(--blue)"></div>${FIN_DATA[pfy].short} (FY24-25)</div>` : ''}
      </div>
    </div>
    <div class="card-body np" style="overflow-x:auto">
      <table class="dt" style="min-width:700px">
        <thead>
          <tr>
            <th class="l" style="min-width:230px">Metric</th>
            <th><i class="fas fa-bullseye" style="color:var(--gray)"></i> Budget</th>
            <th><i class="fas fa-chart-line" style="color:var(--yellow)"></i> Forecast${(STATE.quarter === 'ALL' && (!STATE.selectedMonths || STATE.selectedMonths.length === 0 || STATE.selectedMonths.length > 3)) ? ' (Full Year — Revenue Actual)' : ' (Rev_Forecast Sheet)'}</th>
            <th><i class="fas fa-circle-check" style="color:var(--green)"></i> Actual</th>
            <th><i class="fas fa-right-left" style="color:var(--orange)"></i> Var vs Budget</th>
            <th><i class="fas fa-circle-info" style="color:var(--blue)"></i> Var vs Fcst</th>
            ${prevCols}
          </tr>
        </thead>
        <tbody>
          ${summaryRows.map(r => {
            const py = prev ? r.pyFn(prev) : null;
            return `<tr>
              <td><i class="fas ${r.icon}" style="color:var(--orange);margin-right:7px;width:14px;text-align:center"></i>${r.label}</td>
              <td>${r.budget}</td>
              <td>${r.forecast}</td>
              <td style="font-weight:700;color:var(--g800)">${r.actual}</td>
              <td class="${r.vbCls}">${r.vb}</td>
              <td class="${r.vfCls}">${r.vf}</td>
              ${STATE.compare && pfy
                ? `<td style="background:var(--blue-pale)">${py ? py.actual : '—'}</td>
                   <td style="background:var(--blue-pale)" class="${py ? py.yoyCls : ''}">${py ? py.yoy : '—'}</td>`
                : ''}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;

  // ── Insights Panel ───────────────────────────────────────
  const insHtml = filterBadge() + buildInsightsPanel(ins);

  // ── Overview Charts ──────────────────────────────────────
  const chartsHtml = `
  <div class="ov-section-title"><i class="fas fa-chart-line"></i> Revenue & CM Charts</div>
  <div class="g2">
    <div class="card">
      <div class="card-hd">
        <div class="card-title">Monthly Revenue — Actual vs Budget vs Forecast</div>
        <div class="legend">
          <div class="leg-it"><div class="leg-dot" style="background:${C.orange}"></div>Actual</div>
          <div class="leg-it"><div class="leg-dot" style="background:${C.gray}"></div>Budget</div>
          <div class="leg-it"><div class="leg-dot" style="background:${C.yellow}"></div>Forecast</div>
          ${STATE.compare ? `<div class="leg-it"><div class="leg-dot" style="background:${C.blue}"></div>${STATE.fy === 'FY2526' ? 'FY24-25' : 'FY25-26'} Actual</div>` : ''}
        </div>
      </div>
      <div class="card-body"><div class="ch-wrap"><canvas id="ch-rev-trend"></canvas></div></div>
    </div>
    <div class="card">
      <div class="card-hd">
        <div class="card-title">CM% Monthly — Actual vs Budget${STATE.compare ? ` vs ${STATE.fy === 'FY2526' ? 'FY24-25' : 'FY25-26'}` : ''}</div>
        <div class="legend">
          <div class="leg-it"><div class="leg-dot" style="background:${C.orange}"></div>Actual</div>
          <div class="leg-it"><div class="leg-dot" style="background:${C.gray}"></div>Budget</div>
          ${STATE.compare ? `<div class="leg-it"><div class="leg-dot" style="background:${C.blue}"></div>${STATE.fy === 'FY2526' ? 'FY24-25' : 'FY25-26'} CM%</div>` : ''}
        </div>
      </div>
      <div class="card-body"><div class="ch-wrap"><canvas id="ch-cm-trend"></canvas></div></div>
    </div>
  </div>
  <div class="ov-section-title"><i class="fas fa-map-marker-alt"></i> Regional & Hiring Overview</div>
  <div class="g2">
    <div class="card">
      <div class="card-hd"><div class="card-title">Revenue by Region — Actual vs Budget</div></div>
      <div class="card-body"><div class="ch-wrap"><canvas id="ch-region"></canvas></div></div>
    </div>
    <div class="card">
      <div class="card-hd"><div class="card-title">Monthly Joiners — Taggd vs Non-Taggd</div></div>
      <div class="card-body"><div class="ch-wrap"><canvas id="ch-joiners"></canvas></div></div>
    </div>
  </div>
  <div class="ov-section-title"><i class="fas fa-money-bill-wave"></i> Collections & Headcount Trend</div>
  <div class="g2">
    <div class="card">
      <div class="card-hd"><div class="card-title">Monthly Collections — Actual vs Target${STATE.compare ? ` vs ${STATE.fy === 'FY2526' ? 'FY24-25' : 'FY25-26'}` : ''}</div>${STATE.compare?`<div class="legend"><div class="leg-it"><div class="leg-dot" style="background:${C.orange}"></div>Actual</div><div class="leg-it"><div class="leg-dot" style="background:${C.gray}"></div>Target</div><div class="leg-it"><div class="leg-dot" style="background:${C.blue}"></div>${STATE.fy === 'FY2526' ? 'FY24-25' : 'FY25-26'} Actual</div></div>`:''}</div>
      <div class="card-body"><div class="ch-wrap"><canvas id="ch-ov-coll"></canvas></div></div>
    </div>
    <div class="card">
      <div class="card-hd"><div class="card-title">Headcount Trend — Overall vs WL1 vs Approved${STATE.compare ? ` vs ${STATE.fy === 'FY2526' ? 'FY24-25' : 'FY25-26'}` : ''}</div>${STATE.compare?`<div class="legend"><div class="leg-it"><div class="leg-dot" style="background:${C.orange}"></div>Overall HC</div><div class="leg-it"><div class="leg-dot" style="background:${C.blue}"></div>WL1 HC</div><div class="leg-it"><div class="leg-dot" style="background:${C.green}"></div>Approved HC</div><div class="leg-it"><div class="leg-dot" style="background:${C.orange+'55'}"></div>${STATE.fy === 'FY2526' ? 'FY24-25' : 'FY25-26'} Overall</div></div>`:`<div class="legend"><div class="leg-it"><div class="leg-dot" style="background:${C.orange}"></div>Overall HC</div><div class="leg-it"><div class="leg-dot" style="background:${C.blue}"></div>WL1 HC</div><div class="leg-it"><div class="leg-dot" style="background:${C.green}"></div>Approved HC</div></div>`}</div>
      <div class="card-body"><div class="ch-wrap"><canvas id="ch-ov-hc"></canvas></div></div>
    </div>
  </div>`;

  return insHtml + tileHtml + chartsHtml + tableHtml;
}

function getPeriodLabel() {
  const fd  = FIN_DATA[STATE.fy];
  const sel = STATE.selectedMonths;
  if (!sel) return 'Full Year';
  if (sel.length === 0) return 'No months selected';
  if (sel.length === 1) return fd.mLabels[sel[0]] + ' only';
  return fd.mLabels[sel[0]] + '–' + fd.mLabels[sel[sel.length-1]];
}

// Build summary table rows
function buildSummaryRows(m, prev) {
  // All monetary values in Lacs in 'm'; fmt.cr() divides by 100 for Crores display

  return [
    // ── Revenue ──────────────────────────────────────────────
    {
      icon:'fa-indian-rupee-sign', label:'Revenue (₹ Cr)',
      budget:   fmt.cr(m.revB),
      forecast: m.revF > 0 ? fmt.cr(m.revF) : '—',
      actual:   fmt.cr(m.revA),
      vb: m.revB>0 ? `${varArrow(m.revVarPct)} ${Math.abs(m.revVarPct).toFixed(1)}%` : '—',
      vbCls: m.revB>0 ? varCls(m.revVarPct) : '',
      vf: m.revF>0 ? `${varArrow(varPct(m.revA,m.revF))} ${Math.abs(varPct(m.revA,m.revF)).toFixed(1)}%` : '—',
      vfCls: m.revF>0 ? varCls(varPct(m.revA,m.revF)) : '',
      pyFn: p => p ? ({ actual:fmt.cr(p.revA), yoy:showPct(varPct(m.revA,p.revA)), yoyCls:varCls(varPct(m.revA,p.revA)) }) : null,
    },
    // ── CM Amount row REMOVED from summary table per user request ──
    // ── CM % ─────────────────────────────────────────────────
    {
      icon:'fa-percent', label:'CM % (Actual/Budget/Forecast)',
      budget:   m.cmBPct>0 ? m.cmBPct.toFixed(2)+'%' : '—',
      forecast: m.cmFPct>0 ? m.cmFPct.toFixed(2)+'%' : '—',
      actual:   m.revA>0 ? m.cmAPct.toFixed(2)+'%' : '<span class="td-na">N/A</span>',
      vb: m.revA>0 ? `${varArrow(m.cmPPVar)} ${Math.abs(m.cmPPVar).toFixed(1)}pp` : '—',
      vbCls: m.revA>0 ? varCls(m.cmPPVar) : '',
      vf: m.revA>0&&m.cmFPct>0 ? `${varArrow(m.cmAPct-m.cmFPct)} ${Math.abs(m.cmAPct-m.cmFPct).toFixed(1)}pp` : '—',
      vfCls: m.revA>0&&m.cmFPct>0 ? varCls(m.cmAPct-m.cmFPct) : '',
      pyFn: p => p&&p.revA>0 ? { actual:p.cmAPct.toFixed(2)+'%', yoy:fmt.pp(m.cmAPct-p.cmAPct), yoyCls:varCls(m.cmAPct-p.cmAPct) } : null,
    },
    // ── PPC ──────────────────────────────────────────────────
    {
      icon:'fa-wallet', label:'PPC (₹/person/month, rounded ₹100)',
      budget: m.ppcBudget>0 ? '₹'+m.ppcBudget.toLocaleString('en-IN') : '—',
      forecast:'—',
      actual:  m.ppc>0 ? '₹'+m.ppc.toLocaleString('en-IN') : '<span class="td-na">N/A</span>',
      vb: m.ppcVar!=null ? `${varArrow(m.ppcVar)} ${Math.abs(m.ppcVar/m.ppcBudget*100).toFixed(1)}%` : '—',
      vbCls: m.ppcVar!=null ? varCls(-m.ppcVar) : '', // lower PPC is better
      vf:'—', vfCls:'',
      pyFn: p => p&&p.ppc>0 ? { actual:'₹'+p.ppc.toLocaleString('en-IN'), yoy:showPct(varPct(m.ppc,p.ppc)), yoyCls:varCls(-varPct(m.ppc,p.ppc)) } : null,
    },
    // ── Revenue Productivity ──────────────────────────────────
    {
      icon:'fa-chart-bar', label:'Rev Productivity (₹L/rec/mo)',
      budget:   m.revProdB>0 ? '₹'+m.revProdB.toFixed(2)+' L' : '—',
      forecast: '—',
      actual:   m.revProdA>0 ? '₹'+m.revProdA.toFixed(2)+' L' : '<span class="td-na">N/A</span>',
      vb: m.revProdA>0&&m.revProdB>0 ? `${varArrow(varPct(m.revProdA,m.revProdB))} ${Math.abs(varPct(m.revProdA,m.revProdB)).toFixed(1)}%` : '—',
      vbCls: m.revProdA>0&&m.revProdB>0 ? varCls(varPct(m.revProdA,m.revProdB)) : '',
      vf:'—', vfCls:'',
      pyFn: () => null,
    },
    // ── Headcount ────────────────────────────────────────────
    {
      icon:'fa-people-group', label:`Headcount — ${m.latestMonthLabel||'Latest'} Snapshot`,
      budget:   m.appr>0 ? Math.round(m.appr).toLocaleString('en-IN')+' (Approved)' : '—',
      forecast: '—',
      actual:   m.hc>0 ? Math.round(m.hc).toLocaleString('en-IN') : '<span class="td-na">N/A</span>',
      vb: m.hc>0&&m.appr>0 ? m.hcUtil.toFixed(1)+'% Utilisation' : '—',
      vbCls: m.hcUtil>=85&&m.hcUtil<=115 ? 'td-pos' : m.hcUtil>0 ? 'td-warn' : '',
      vf: m.wl1>0 ? 'WL1 Avg: '+Math.round(m.wl1) : '—',
      vfCls: '',
      pyFn: p => p&&p.hc>0 ? { actual:Math.round(p.hc).toLocaleString('en-IN'), yoy:showPct(varPct(m.hc,p.hc)), yoyCls:varCls(varPct(m.hc,p.hc)) } : null,
    },
    // ── Collections ──────────────────────────────────────────
    {
      icon:'fa-hand-holding-dollar', label:'Collection Actual (₹ Cr)',
      budget:   m.collT>0 ? fmt.cr(m.collT)+' (Target)' : '—',
      forecast: '—',
      actual:   m.collA>0 ? fmt.cr(m.collA) : '<span class="td-na">N/A</span>',
      vb: m.collA>0&&m.collT>0 ? `${varArrow(varPct(m.collA,m.collT))} ${Math.abs(varPct(m.collA,m.collT)).toFixed(1)}% (${m.collAtt.toFixed(1)}% att.)` : '—',
      vbCls: m.collA>0&&m.collT>0 ? varCls(varPct(m.collA,m.collT)) : '',
      vf:'—', vfCls:'',
      pyFn: p => p&&p.collA>0 ? { actual:fmt.cr(p.collA), yoy:showPct(varPct(m.collA,p.collA)), yoyCls:varCls(varPct(m.collA,p.collA)) } : null,
    },
    // ── Source Mix ────────────────────────────────────────────
    {
      icon:'fa-tags', label:'Source Mix % (Taggd)',
      budget:'—', forecast:'—',
      actual: m.totalJ>0 ? m.taggdMix.toFixed(1)+'%' : '<span class="td-na">N/A</span>',
      vb: m.totalJ>0 ? `${fmt.num(m.taggd)} T / ${fmt.num(m.totalJ)} total` : '—',
      vbCls:'td-muted',
      vf:'—', vfCls:'',
      pyFn: p => p&&p.totalJ>0 ? { actual:p.taggdMix.toFixed(1)+'%', yoy:fmt.pp(m.taggdMix-p.taggdMix), yoyCls:varCls(m.taggdMix-p.taggdMix) } : null,
    },
    // ── Unbilled ─────────────────────────────────────────────
    {
      icon:'fa-file-invoice', label:'Unbilled (₹ Cr)',
      budget:'—', forecast:'—',
      actual: m.ub > 0 ? fmt.cr(m.ub) : '₹0.00 Cr',
      vb: m.ubPctRev>0 ? m.ubPctRev.toFixed(1)+'% of Revenue' : '—',
      vbCls: m.ubPctRev>8 ? 'td-neg' : m.ubPctRev>3 ? 'td-warn' : 'td-muted',
      vf:'—', vfCls:'',
      pyFn: p => p ? { actual: p.ub > 0 ? fmt.cr(p.ub) : '₹0.00 Cr', yoy: showPct(varPct(m.ub, Math.max(p.ub,0.001))), yoyCls: varCls(-(varPct(m.ub, Math.max(p.ub,0.001)))) } : null,
    },
    {
      icon:'fa-skull-crossbones', label:'Bad Debt (₹ Cr)',
      budget:'—', forecast:'—',
      actual: m.bd > 0 ? fmt.cr(m.bd) : '₹0.00 Cr',
      vb: m.bdPctColl>0 ? m.bdPctColl.toFixed(1)+'% of Collections' : '—',
      vbCls: m.bd>0 ? 'td-neg' : 'td-muted',
      vf:'—', vfCls:'',
      pyFn: p => p && (p.bd > 0 || m.bd > 0) ? { actual: p.bd > 0 ? fmt.cr(p.bd) : '₹0.00 Cr', yoy: p.bd > 0 ? showPct(varPct(m.bd, p.bd)) : '—', yoyCls: varCls(-(varPct(m.bd, Math.max(p.bd,0.001)))) } : null,
    },
    {
      icon:'fa-sliders', label:'Revenue Adjustment (₹ Cr)',
      budget:'—', forecast:'—',
      actual: m.revAdj > 0 ? fmt.cr(m.revAdj) : '₹0.00 Cr',
      vb: m.revA>0&&m.revAdj>0 ? (m.revAdj/m.revA*100).toFixed(1)+'% of Revenue' : '—',
      vbCls: m.revAdj>0 ? 'td-pos' : 'td-muted',
      vf:'—', vfCls:'',
      pyFn: p => p&&p.revAdj>0 ? { actual:fmt.cr(p.revAdj), yoy:showPct(varPct(m.revAdj,p.revAdj)), yoyCls:varCls(varPct(m.revAdj,p.revAdj)) } : null,
    },
  ];
}

// ═══════════════════════════════════════════════════════════
// OLD kpiCard (for sub-pages)
// ═══════════════════════════════════════════════════════════
function kpiCard({ color, label, icon, val, valSub, metrics, prog, progColor, pyVal, pyYoy, pyYoyFmt }) {
  const pfy   = getPrevFY();
  const pyRow = STATE.compare && pfy && pyVal
    ? `<div class="fy-compare-row">
        <span class="fy-tag">vs ${FIN_DATA[pfy].short}</span>
        <span class="fy-val">${pyVal}</span>
        ${pyYoy !== null && pyYoy !== undefined
          ? `<span class="fy-diff ${pyYoy>=0?'up':'dn'}">${pyYoy>=0?'▲':'▼'} ${Math.abs(pyYoy).toFixed(1)}${pyYoyFmt||'%'}</span>`
          : ''}
      </div>` : '';
  return `
  <div class="kpi-card ${color?'c-'+color:''}">
    <div class="kpi-hd"><div class="kpi-lbl">${label}</div><div class="kpi-ico ${color||''}"><i class="fas ${icon}"></i></div></div>
    <div class="kpi-val">${val}</div>
    <div class="kpi-val-lbl">${valSub}</div>
    <div class="kpi-metrics">
      ${metrics.map(mm => `<div class="kpi-m"><div class="kpi-m-lbl">${mm.l}</div><div class="kpi-m-val ${mm.cls||''}">${mm.v}</div></div>`).join('')}
    </div>
    ${prog>0?`<div class="prog"><div class="prog-fill ${progColor}" style="width:${Math.min(prog,100)}%"></div></div>`:''}
    ${pyRow}
  </div>`;
}

// ═══════════════════════════════════════════════════════════
// INSIGHTS ENGINE
// ═══════════════════════════════════════════════════════════
// Each insight item has: { t, i, txt, cat }
// cat values: 'revenue' | 'cm' | 'collection' | 'hiring' | 'project' | 'yoy'
function buildInsights(m, prev) {
  const items = [];
  const fd    = FIN_DATA[STATE.fy];

  // Revenue vs Budget (spec §1)
  if (m.revB > 0) {
    const rvb = m.revVarPct;
    if      (rvb < -30) items.push({ t:'critical', i:'fa-circle-exclamation', cat:'revenue', txt:`<strong>Revenue severely below budget:</strong> Actual ${fmt.cr(m.revA)} vs Budget ${fmt.cr(m.revB)} — <strong>${showPct(rvb)}</strong>. Urgent action needed.` });
    else if (rvb < -15) items.push({ t:'warning',  i:'fa-triangle-exclamation', cat:'revenue', txt:`<strong>Revenue below budget:</strong> ${showPct(rvb)} shortfall. Pipeline acceleration needed.` });
    else if (rvb < 0)   items.push({ t:'warning',  i:'fa-chart-line', cat:'revenue', txt:`<strong>Revenue slightly below budget:</strong> ${showPct(rvb)}. Monitor closely.` });
    else                items.push({ t:'positive', i:'fa-circle-check', cat:'revenue', txt:`<strong>Revenue on/above budget:</strong> ${fmt.cr(m.revA)} — ${showPct(rvb)} above target.` });
  }
  // Revenue vs Forecast
  if (m.revF > 0) {
    const rvf = varPct(m.revA, m.revF);
    if (rvf < -15)    items.push({ t:'warning',  i:'fa-bullseye', cat:'revenue', txt:`<strong>Revenue missing forecast:</strong> ${showPct(rvf)} below ${fmt.cr(m.revF)}.` });
    else if (rvf > 5) items.push({ t:'positive', i:'fa-arrow-trend-up', cat:'revenue', txt:`<strong>Beating forecast:</strong> Revenue ${showPct(rvf)} above forecast.` });
  }
  // CM% vs Budget (spec §2 — pp variance)
  if (m.revA > 0 && m.cmBPct > 0) {
    const cmGap = m.cmPPVar;
    if (m.cmAPct < 0)    items.push({ t:'critical', i:'fa-percent', cat:'cm', txt:`<strong>Negative CM%:</strong> ${m.cmAPct.toFixed(1)}% — account is loss-making (Budget ${m.cmBPct.toFixed(1)}%).` });
    else if (cmGap < -8) items.push({ t:'critical', i:'fa-percent', cat:'cm', txt:`<strong>Critical CM% gap:</strong> ${m.cmAPct.toFixed(1)}% actual vs ${m.cmBPct.toFixed(1)}% budget — <strong>${Math.abs(cmGap).toFixed(1)}pp below target.</strong>` });
    else if (cmGap < -3) items.push({ t:'warning',  i:'fa-percent', cat:'cm', txt:`<strong>CM% below budget:</strong> ${m.cmAPct.toFixed(1)}% vs ${m.cmBPct.toFixed(1)}% (${cmGap.toFixed(1)}pp).` });
    else                 items.push({ t:'positive', i:'fa-percent', cat:'cm', txt:`<strong>CM% healthy:</strong> ${m.cmAPct.toFixed(1)}% (Budget ${m.cmBPct.toFixed(1)}% — ${cmGap >= 0 ? '+' : ''}${cmGap.toFixed(1)}pp).` });
  }
  // Collections attainment (spec §7)
  if (m.collT > 0 && m.collA > 0) {
    const att = m.collAtt;
    if (att < 70)      items.push({ t:'critical', i:'fa-money-bill-wave', cat:'collection', txt:`<strong>Collections critically below target:</strong> ${att.toFixed(1)}% attainment (${fmt.cr(m.collA)} vs ${fmt.cr(m.collT)}).` });
    else if (att < 90) items.push({ t:'warning',  i:'fa-money-bill-wave', cat:'collection', txt:`<strong>Collections below target:</strong> ${att.toFixed(1)}% attainment.` });
    else               items.push({ t:'positive', i:'fa-money-bill-wave', cat:'collection', txt:`<strong>Collections on track:</strong> ${att.toFixed(1)}% attainment.` });
  }
  // Unbilled (spec §7)
  if (m.ub > 0 && m.revA > 0) {
    const ubP = m.ubPctRev;
    if (ubP > 8)      items.push({ t:'critical', i:'fa-file-invoice', cat:'collection', txt:`<strong>High unbilled:</strong> ${fmt.cr(m.ub)} (${ubP.toFixed(1)}% of revenue).` });
    else if (ubP > 3) items.push({ t:'warning',  i:'fa-file-invoice', cat:'collection', txt:`<strong>Unbilled building up:</strong> ${fmt.cr(m.ub)} (${ubP.toFixed(1)}% of revenue).` });
  }
  // Bad debt (spec §7)
  if (m.bd > 0) {
    const bdP = m.bdPctColl;
    items.push({ t: bdP > 3 ? 'critical' : 'warning', i:'fa-skull-crossbones', cat:'collection', txt:`<strong>Bad debt:</strong> ${fmt.cr(m.bd)}${bdP>0?` (${bdP.toFixed(1)}% of collections)`:''}.` });
  }
  // Taggd mix (spec §6)
  if (m.totalJ > 0) {
    if (m.taggdMix < 40)       items.push({ t:'warning',  i:'fa-tags', cat:'hiring', txt:`<strong>Low Taggd mix:</strong> ${m.taggdMix.toFixed(1)}% via Taggd. Target ≥50%.` });
    else if (m.taggdMix >= 50) items.push({ t:'positive', i:'fa-tags', cat:'hiring', txt:`<strong>Strong Taggd mix:</strong> ${m.taggdMix.toFixed(1)}% (above 50% target).` });
  }
  // Headcount utilisation
  if (m.hcUtil > 0 && m.appr > 0) {
    if (m.hcUtil > 115)      items.push({ t:'warning',  i:'fa-people-group', cat:'hiring', txt:`<strong>Headcount over-utilised:</strong> ${m.hcUtil.toFixed(1)}% of approved headcount. Risk of burnout.` });
    else if (m.hcUtil < 75)  items.push({ t:'warning',  i:'fa-people-group', cat:'hiring', txt:`<strong>Headcount under-utilised:</strong> ${m.hcUtil.toFixed(1)}% of approved headcount.` });
    else                     items.push({ t:'positive', i:'fa-people-group', cat:'hiring', txt:`<strong>Headcount utilisation healthy:</strong> ${m.hcUtil.toFixed(1)}% of approved.` });
  }
  // Revenue Productivity
  if (m.revProdA > 0 && m.revProdB > 0) {
    const prodVar = varPct(m.revProdA, m.revProdB);
    if (prodVar < -15)    items.push({ t:'warning',  i:'fa-gauge-high', cat:'revenue', txt:`<strong>Rev productivity below target:</strong> ₹${m.revProdA.toFixed(2)}L/rec/mo vs target ₹${m.revProdB.toFixed(2)}L (${showPct(prodVar)}).` });
    else if (prodVar > 5) items.push({ t:'positive', i:'fa-gauge-high', cat:'revenue', txt:`<strong>Rev productivity above target:</strong> ₹${m.revProdA.toFixed(2)}L/rec/mo (${showPct(prodVar)} above target).` });
  }
  // YoY comparison (spec §9)
  if (prev && prev.revA > 0) {
    const yoy = varPct(m.revA, prev.revA);
    if (yoy > 15)       items.push({ t:'positive', i:'fa-rocket',     cat:'yoy', txt:`<strong>Outstanding YoY growth:</strong> ${showPct(yoy)} revenue growth vs prior year.` });
    else if (yoy > 0)   items.push({ t:'info',     i:'fa-arrow-up',   cat:'yoy', txt:`<strong>Positive YoY growth:</strong> Revenue up ${showPct(yoy)} vs prior year.` });
    else if (yoy < -10) items.push({ t:'critical', i:'fa-arrow-down', cat:'yoy', txt:`<strong>Revenue YoY decline:</strong> Down ${showPct(Math.abs(yoy))} vs prior year.` });
    else if (yoy < 0)   items.push({ t:'warning',  i:'fa-arrow-down', cat:'yoy', txt:`<strong>Slight YoY dip:</strong> ${showPct(yoy)} vs prior year.` });
  }
  // CM YoY
  if (prev && prev.revA > 0 && m.revA > 0) {
    const cmYoy = m.cmAPct - prev.cmAPct;
    if (cmYoy < -3)     items.push({ t:'warning',  i:'fa-percent', cat:'cm', txt:`<strong>CM% YoY decline:</strong> ${m.cmAPct.toFixed(1)}% vs FY24-25 ${prev.cmAPct.toFixed(1)}% (${cmYoy.toFixed(1)}pp).` });
    else if (cmYoy > 2) items.push({ t:'positive', i:'fa-percent', cat:'cm', txt:`<strong>CM% YoY improvement:</strong> ${m.cmAPct.toFixed(1)}% vs FY24-25 ${prev.cmAPct.toFixed(1)}% (+${cmYoy.toFixed(1)}pp).` });
  }
  // Project-level alerts
  const projs    = filterProjects(fd.projects);
  const overAch  = projs.filter(p => p.revB > 0 && varPct(p.revA,p.revB) > 15).sort((a,b) => varPct(b.revA,b.revB) - varPct(a.revA,a.revB));
  const underAch = projs.filter(p => p.revB > 0 && varPct(p.revA,p.revB) < -30).sort((a,b) => varPct(a.revA,a.revB) - varPct(b.revA,b.revB));
  const negCM    = projs.filter(p => p.cmA < 0 && p.revA > 50);
  if (overAch.length)  items.push({ t:'positive', i:'fa-star',                cat:'project', txt:`<strong>Outperforming accounts (>15% above budget):</strong> ${overAch.slice(0,4).map(p=>`${p.name} (${showPct(varPct(p.revA,p.revB))})`).join(', ')}.` });
  if (underAch.length) items.push({ t:'critical', i:'fa-triangle-exclamation',cat:'project', txt:`<strong>Underperforming accounts (>30% below budget):</strong> ${underAch.slice(0,4).map(p=>`${p.name} (${showPct(varPct(p.revA,p.revB))})`).join(', ')}.` });
  if (negCM.length)    items.push({ t:'critical', i:'fa-circle-minus',         cat:'project', txt:`<strong>Loss-making accounts (negative CM):</strong> ${negCM.map(p=>`${p.name} (${(p.cmA/p.revA*100).toFixed(1)}%)`).join(', ')}.` });
  return items;
}

function filterProjects(projects) {
  return projects.filter(p => {
    if (STATE.region.length      > 0 && !STATE.region.includes(p.region))               return false;
    if (STATE.subRegion.length   > 0 && !STATE.subRegion.includes(p.subRegion))          return false;
    if (STATE.regionHead.length  > 0 && !STATE.regionHead.includes(p.regionHead))        return false;
    if (STATE.practiceHead.length> 0 && !STATE.practiceHead.includes(p.practiceHead))    return false;
    if (STATE.vertical.length    > 0 && !STATE.vertical.includes(p.vert))                return false;
    if (STATE.account.length     > 0 && !STATE.account.includes(p.name))                 return false;
    return true;
  });
}

// ── Dynamically sync ALL dependent filter dropdowns from data ──
function _syncAccountDropdown() { _syncFilterDropdowns(); }

// ═══════════════════════════════════════════════════════════
// MULTI-SELECT DROPDOWN HELPERS
// Converts a <select> element's parent .fb-group into a
// custom checkbox-based multi-select dropdown.
// ═══════════════════════════════════════════════════════════
const _msCallbacks = {}; // id → onChange callback

function initMultiSelect(selId, onChange) {
  _msCallbacks[selId] = onChange;
  const sel = $id(selId);
  if (!sel) return;
  const parent = sel.parentElement; // .fb-group
  // Hide native select
  sel.style.display = 'none';
  // Create wrapper
  const wrap = document.createElement('div');
  wrap.className = 'ms-wrap';
  wrap.id = selId + '-mswrap';
  // Button
  const btn = document.createElement('button');
  btn.className = 'ms-btn';
  btn.id = selId + '-msbtn';
  btn.type = 'button';
  btn.innerHTML = '<span class="ms-label">All</span><span class="ms-badge" style="display:none">0</span><i class="fas fa-chevron-down ms-arrow"></i>';
  // Panel
  const panel = document.createElement('div');
  panel.className = 'ms-panel';
  panel.id = selId + '-mspanel';
  panel.innerHTML = '<div class="ms-search-wrap"><input class="ms-search" type="text" placeholder="Search…" /></div><div class="ms-list"></div><div class="ms-footer"><button class="ms-clear-btn" type="button">Clear</button><button class="ms-all-btn" type="button">All</button></div>';

  wrap.appendChild(btn);
  wrap.appendChild(panel);
  parent.appendChild(wrap);

  // Toggle panel on button click
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = panel.classList.contains('open');
    // Close all other panels (including month dropdown)
    document.querySelectorAll('.ms-panel.open').forEach(p => p.classList.remove('open'));
    document.querySelectorAll('.ms-btn.open').forEach(b => b.classList.remove('open'));
    // Also close month dropdown
    const mdp = document.getElementById('month-dropdown-panel');
    const mdbtn = document.getElementById('month-dropdown-btn');
    if (mdp) mdp.classList.remove('open');
    if (mdbtn) mdbtn.classList.remove('open');
    if (!isOpen) {
      // Position panel using fixed positioning — smart edge detection
      const rect = btn.getBoundingClientRect();
      const panelW = Math.max(rect.width, 220);
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Horizontal: prefer left-aligned with button; flip to right-align if it would overflow right edge
      let leftPos = rect.left;
      if (leftPos + panelW > vw - 8) {
        leftPos = Math.max(8, rect.right - panelW);
      }

      // Vertical: prefer below button; flip to above if it would overflow bottom edge
      const estPanelH = 280; // rough estimate of open panel height
      let topPos = rect.bottom + 4;
      if (topPos + estPanelH > vh - 8) {
        topPos = Math.max(8, rect.top - estPanelH - 4);
      }

      panel.style.top      = topPos + 'px';
      panel.style.left     = leftPos + 'px';
      panel.style.minWidth = panelW + 'px';
      panel.style.maxWidth = Math.min(300, vw - leftPos - 8) + 'px';
      panel.classList.add('open');
      btn.classList.add('open');
      // Focus search
      const s = panel.querySelector('.ms-search');
      if (s) { s.value = ''; s.focus(); filterMsList(selId, ''); }
    }
  });

  // Search filter
  panel.querySelector('.ms-search').addEventListener('input', e => {
    filterMsList(selId, e.target.value);
  });
  // Clear
  panel.querySelector('.ms-clear-btn').addEventListener('click', e => {
    e.stopPropagation();
    const cb = panel.querySelectorAll('.ms-cb');
    cb.forEach(c => c.checked = false);
    _commitMultiSelect(selId);
  });
  // All
  panel.querySelector('.ms-all-btn').addEventListener('click', e => {
    e.stopPropagation();
    const cb = panel.querySelectorAll('.ms-cb');
    cb.forEach(c => c.checked = false); // deselect all = show all
    _commitMultiSelect(selId);
  });
}

function rebuildMultiSelect(selId, values, selectedArr) {
  const panel = $id(selId + '-mspanel');
  if (!panel) return;
  const list = panel.querySelector('.ms-list');
  if (!list) return;
  list.innerHTML = values.map(v => `
    <label class="ms-item">
      <input type="checkbox" class="ms-cb" value="${v}" ${selectedArr.includes(v) ? 'checked' : ''} />
      <span>${v}</span>
    </label>`).join('');
  // Re-attach change listeners
  list.querySelectorAll('.ms-cb').forEach(cb => {
    cb.addEventListener('change', () => _commitMultiSelect(selId));
  });
  _updateMsBtn(selId, selectedArr);
}

function filterMsList(selId, query) {
  const panel = $id(selId + '-mspanel');
  if (!panel) return;
  const q = query.toLowerCase();
  panel.querySelectorAll('.ms-item').forEach(item => {
    const txt = item.querySelector('span').textContent.toLowerCase();
    item.style.display = txt.includes(q) ? '' : 'none';
  });
}

function _commitMultiSelect(selId) {
  const panel = $id(selId + '-mspanel');
  if (!panel) return;
  const checked = [...panel.querySelectorAll('.ms-cb:checked')].map(c => c.value);
  _updateMsBtn(selId, checked);
  if (_msCallbacks[selId]) _msCallbacks[selId](checked);
}

function _updateMsBtn(selId, selected) {
  const btn = $id(selId + '-msbtn');
  if (!btn) return;
  const lbl   = btn.querySelector('.ms-label');
  const badge = btn.querySelector('.ms-badge');
  if (selected.length === 0) {
    if (lbl)   lbl.textContent = 'All';
    if (badge) { badge.style.display = 'none'; badge.textContent = '0'; }
  } else if (selected.length === 1) {
    if (lbl)   lbl.textContent = selected[0];
    if (badge) { badge.style.display = 'none'; }
  } else {
    if (lbl)   lbl.textContent = selected[0] + '…';
    if (badge) { badge.style.display = 'inline-flex'; badge.textContent = selected.length; }
  }
}

function resetMultiSelect(selId) {
  const panel = $id(selId + '-mspanel');
  if (!panel) return;
  panel.querySelectorAll('.ms-cb').forEach(c => c.checked = false);
  _updateMsBtn(selId, []);
}


function _syncFilterDropdowns() {
  const fd = FIN_DATA[STATE.fy];
  if (!fd || !fd.projects) return;

  // Valid known regions — exclude 'Common' and any blank/unexpected values
  const VALID_REGIONS = ['South', 'West', 'North', 'New Sales'];

  function uniq(arr) { return [...new Set(arr.filter(Boolean))].sort(); }
  const all = fd.projects;

  // ── Region options — only show valid known regions ───────────────────────
  const regionVals = uniq(all.map(p => p.region)).filter(r => VALID_REGIONS.includes(r));
  STATE.region = STATE.region.filter(v => regionVals.includes(v)); // prune invalid on FY switch
  rebuildMultiSelect('region-sel', regionVals, STATE.region);

  // ── Vertical options ─────────────────────────────────────
  const vertVals = uniq(all.map(p => p.vert));
  STATE.vertical = STATE.vertical.filter(v => vertVals.includes(v)); // prune invalid on FY switch
  rebuildMultiSelect('vertical-sel', vertVals, STATE.vertical);

  // ── Sub Region options (depends on Region selection) ─────
  const srBase = STATE.region.length > 0 ? all.filter(p => STATE.region.includes(p.region)) : all;
  const srVals = uniq(srBase.map(p => p.subRegion));
  STATE.subRegion = STATE.subRegion.filter(v => srVals.includes(v));
  rebuildMultiSelect('subregion-sel', srVals, STATE.subRegion);

  // ── Region Head options (depends on Region + SubRegion) ──
  const rhBase = all.filter(p => {
    if (STATE.region.length    > 0 && !STATE.region.includes(p.region))         return false;
    if (STATE.subRegion.length > 0 && !STATE.subRegion.includes(p.subRegion))   return false;
    return true;
  });
  const rhVals = uniq(rhBase.map(p => p.regionHead));
  STATE.regionHead = STATE.regionHead.filter(v => rhVals.includes(v));
  rebuildMultiSelect('regionhead-sel', rhVals, STATE.regionHead);

  // ── Practice Head options (depends on Region + SubRegion + RegionHead) ──
  const phBase = all.filter(p => {
    if (STATE.region.length      > 0 && !STATE.region.includes(p.region))          return false;
    if (STATE.subRegion.length   > 0 && !STATE.subRegion.includes(p.subRegion))    return false;
    if (STATE.regionHead.length  > 0 && !STATE.regionHead.includes(p.regionHead))  return false;
    return true;
  });
  const phVals = uniq(phBase.map(p => p.practiceHead));
  STATE.practiceHead = STATE.practiceHead.filter(v => phVals.includes(v));
  rebuildMultiSelect('practicehead-sel', phVals, STATE.practiceHead);

  // ── Account options (depends on all other filters) ────────
  const acBase = all.filter(p => {
    if (STATE.region.length       > 0 && !STATE.region.includes(p.region))           return false;
    if (STATE.subRegion.length    > 0 && !STATE.subRegion.includes(p.subRegion))     return false;
    if (STATE.regionHead.length   > 0 && !STATE.regionHead.includes(p.regionHead))   return false;
    if (STATE.practiceHead.length > 0 && !STATE.practiceHead.includes(p.practiceHead)) return false;
    if (STATE.vertical.length     > 0 && !STATE.vertical.includes(p.vert))           return false;
    return true;
  });
  const acVals = uniq(acBase.map(p => p.name));
  STATE.account = STATE.account.filter(v => acVals.includes(v));
  rebuildMultiSelect('account-sel', acVals, STATE.account);
}

// ═══════════════════════════════════════════════════════════
// SHARED INSIGHTS PANEL BUILDER (collapsed by default)
// ═══════════════════════════════════════════════════════════
function buildInsightsPanel(ins, title) {
  const t = title || 'Key Insights & Alerts';
  const count = ins ? ins.length : 0;
  // Count by severity for the summary badge
  const critCount = ins ? ins.filter(i=>i.t==='critical').length : 0;
  const warnCount = ins ? ins.filter(i=>i.t==='warning').length : 0;
  const posCount  = ins ? ins.filter(i=>i.t==='positive').length : 0;
  const summaryBadges = [
    critCount > 0 ? `<span style="background:#fee2e2;color:var(--red);padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700">${critCount} Critical</span>` : '',
    warnCount > 0 ? `<span style="background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700">${warnCount} Warning</span>` : '',
    posCount  > 0 ? `<span style="background:#d1fae5;color:#065f46;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700">${posCount} Positive</span>` : '',
  ].filter(Boolean).join(' ');
  const items = count
    ? ins.map(i => `<div class="ins-item ${i.t}"><i class="fas ${i.i}"></i><p>${i.txt}</p></div>`).join('')
    : '<div class="ins-item positive"><i class="fas fa-check-circle"></i><p>No critical alerts — all metrics within acceptable range.</p></div>';
  return `
  <div class="ins-panel">
    <div class="ins-hd" onclick="toggleIns(this)">
      <i class="fas fa-lightbulb ins-ic"></i>
      <div class="ins-hd-title">${t} &nbsp;<span style="color:var(--g400);font-weight:400;font-size:11px">${count} findings</span> &nbsp;${summaryBadges}</div>
      <span class="ins-hd-hint">Click to expand</span>
      <i class="fas fa-chevron-down arr"></i>
    </div>
    <div class="ins-body">
      <div class="ins-inner">${items}</div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════
// P&L PAGE
// ═══════════════════════════════════════════════════════════
function renderPnL() {
  const fd   = FIN_DATA[STATE.fy];
  const pfd  = getPrevFY() ? FIN_DATA[getPrevFY()] : null;
  const idxs = getSelectedIndices();
  const m    = fd.monthly;
  const lbls = idxs.map(i => fd.mLabels[i]);

  // Apply project-level filter scaling for the P&L table
  const ratios = _getFilterRatios(STATE.fy);
  const mRevA     = ratios ? _scaleArr(m.revA, ratios.revA) : m.revA;
  const mRevAFull = ratios ? _scaleArr(m.revA_full || m.revA, ratios.revA) : (m.revA_full || m.revA);
  const mRevB = ratios ? _scaleArr(m.revB, ratios.revB) : m.revB;
  const mRevF = ratios ? _scaleArr(m.revF, ratios.revA) : m.revF;  // use revA ratio for consistency
  const mCmA  = ratios ? _scaleArr(m.cmA,  ratios.cmA)  : m.cmA;
  const mCmB  = ratios ? _scaleArr(m.cmB,  ratios.cmB)  : m.cmB;

  const S     = arr => idxs.reduce((t,i) => t+(arr[i]||0), 0);
  const pnlIsAllMonths = !STATE.selectedMonths || STATE.selectedMonths.length === 0 || STATE.selectedMonths.length === 12;
  // When filters active + YTD: use filteredRevA/filteredCmA directly (exact project totals, no scaling error)
  const totRevA = (ratios && pnlIsAllMonths) ? ratios.filteredRevA : S(mRevA);
  const totRevB = (ratios && pnlIsAllMonths) ? ratios.filteredRevB : S(mRevB);
  const totCmA  = (ratios && pnlIsAllMonths) ? ratios.filteredCmA  : S(mCmA);
  const totCmB  = (ratios && pnlIsAllMonths) ? ratios.filteredCmB  : S(mCmB);
  // Forecast logic (per user spec):
  // YTD (All months): Forecast = full Revenue_Actual sheet (all 12 months incl. Feb26+Mar26)
  //   Filter active: filteredRevA × (revA_full_total / revA_total)   ← exact account forecast
  //   No filter:     sum(mRevAFull)                                   ← company-wide
  // Monthly/Quarterly: Forecast = pure values from Rev_Forecast sheet
  const pnlIsYTD = (STATE.quarter === 'ALL' && (!STATE.selectedMonths || STATE.selectedMonths.length === 0 || STATE.selectedMonths.length > 3));
  const mCmF  = ratios ? _scaleArr(m.cmF, ratios.cmB) : m.cmF;
  let totRevF, totCmF;
  if (pnlIsYTD && ratios && pnlIsAllMonths) {
    // Filtered YTD: actual (Apr–Jan) + proportional Feb+Mar forecast
    const revA_full_total = fd.totals.revF;   // company-wide full-year forecast (revA_full total)
    const revA_total      = fd.totals.revA;   // company-wide YTD actuals
    const fullYearScale   = revA_total > 0 ? revA_full_total / revA_total : 1;
    totRevF = ratios.filteredRevA * fullYearScale;
    // CM Forecast: same proportional scale applied to filteredCmA
    const cmF_total = fd.totals.cmF;
    const cmA_total = fd.totals.cmA;
    const cmFullYearScale = cmA_total > 0 ? cmF_total / cmA_total : 1;
    totCmF = ratios.filteredCmA * cmFullYearScale;
  } else if (pnlIsYTD) {
    // No filter, YTD: full Revenue_Actual sheet (company-wide, includes Feb/Mar)
    totRevF = S(mRevAFull);
    // CM Forecast: sum actual CM only for confirmed months
    totCmF = idxs.reduce((t,i) => t + ((mRevA[i]||0) > 0 ? (mCmA[i]||0) : 0), 0);
  } else {
    // Monthly/Quarterly: pure Rev_Forecast sheet values
    totRevF = S(mRevF);
    totCmF  = S(mCmF);
  }
  const cm = getMetrics();
  const prevM = STATE.compare ? getPrevMetrics() : null;
  const ins = buildInsights(cm, prevM);
  // P&L: show revenue, CM, and YoY insights
  const pnlIns = ins.filter(i => ['revenue','cm','yoy'].includes(i.cat));

  return filterBadge() + buildInsightsPanel(pnlIns, 'P&L Insights') + `
  <div class="g2">
    <div class="card"><div class="card-hd"><div class="card-title">Revenue Trend${STATE.compare ? ` (${STATE.fy === 'FY2526' ? 'FY25-26 vs FY24-25' : 'FY24-25 vs FY25-26'})` : ''}</div></div><div class="card-body"><div class="ch-wrap lg"><canvas id="ch-pnl-rev"></canvas></div></div></div>
    <div class="card"><div class="card-hd"><div class="card-title">CM% Monthly${STATE.compare ? ` (${STATE.fy === 'FY2526' ? 'FY25-26 vs FY24-25' : 'FY24-25 vs FY25-26'})` : ''}</div></div><div class="card-body"><div class="ch-wrap lg"><canvas id="ch-pnl-cm"></canvas></div></div></div>
  </div>
  <div class="card g1">
    <div class="card-hd">
      <div><div class="card-title">Monthly P&L — ${fd.label}</div><div class="card-sub">₹ Crores | ${getPeriodLabel()}</div></div>
    </div>
    <div class="card-body np" style="overflow-x:auto">
      <table class="dt" style="min-width:${200+idxs.length*80}px">
        <thead><tr>
          <th class="l" style="min-width:200px">Metric</th>
          ${lbls.map(l=>`<th>${l}</th>`).join('')}
          <th style="background:var(--orange-50);color:var(--orange)">Total</th>
        </tr></thead>
        <tbody>
          <tr><td><strong>Revenue — Actual</strong></td>${idxs.map(i=>`<td style="font-weight:600">${mRevA[i]>0?(mRevA[i]/100).toFixed(2):'—'}</td>`).join('')}<td style="font-weight:700;color:var(--orange)">${(totRevA/100).toFixed(2)}</td></tr>
          <tr style="color:var(--g500)"><td>Revenue — Budget</td>${idxs.map(i=>`<td>${(mRevB[i]/100).toFixed(2)}</td>`).join('')}<td>${(totRevB/100).toFixed(2)}</td></tr>
          <tr style="color:var(--g500)"><td>Revenue — Forecast</td>${idxs.map(i=>`<td>${mRevF[i]>0?(mRevF[i]/100).toFixed(2):'—'}</td>`).join('')}<td>${totRevF>0?(totRevF/100).toFixed(2):'—'}</td></tr>
          <tr><td><strong>Rev Var vs Budget</strong></td>${idxs.map(i=>{const v=mRevB[i]>0?varPct(mRevA[i],mRevB[i]):null;return `<td class="${v!==null?varCls(v):'td-na'}">${v!==null?showPct(v):'—'}</td>`;}).join('')}<td class="${totRevB>0?varCls(varPct(totRevA,totRevB)):''}">${totRevB>0?showPct(varPct(totRevA,totRevB)):'—'}</td></tr>
          <tr class="sep-row"><td colspan="${idxs.length+2}"></td></tr>
          <tr><td><strong>CM — Actual</strong></td>${idxs.map(i=>`<td>${mCmA[i]>0?(mCmA[i]/100).toFixed(2):'—'}</td>`).join('')}<td>${totCmA>0?(totCmA/100).toFixed(2):'—'}</td></tr>
          <tr style="color:var(--g500)"><td>CM — Budget</td>${idxs.map(i=>`<td>${(mCmB[i]/100).toFixed(2)}</td>`).join('')}<td>${(totCmB/100).toFixed(2)}</td></tr>
          <tr><td><strong>CM% — Actual</strong></td>${idxs.map(i=>{const v=mRevA[i]>0&&mCmA[i]>0?mCmA[i]/mRevA[i]*100:null;return `<td class="${v!==null?(v>=42?'td-pos':'td-warn'):'td-na'}">${v!==null?v.toFixed(1)+'%':'—'}</td>`;}).join('')}<td class="${totCmA>0&&totRevA>0?(totCmA/totRevA*100>=42?'td-pos':'td-warn'):'td-na'}">${totCmA>0&&totRevA>0?(totCmA/totRevA*100).toFixed(1)+'%':'—'}</td></tr>
          <tr style="color:var(--g500)"><td>CM% — Budget</td>${idxs.map(i=>`<td>${mRevB[i]>0?(mCmB[i]/mRevB[i]*100).toFixed(1)+'%':'—'}</td>`).join('')}<td>${totRevB>0?(totCmB/totRevB*100).toFixed(1)+'%':'—'}</td></tr>
          ${STATE.compare && pfd ? `
          <tr class="sep-row"><td colspan="${idxs.length+2}"></td></tr>
          <tr style="background:var(--blue-pale)"><td><strong>FY24-25 Revenue (${pfd.short})</strong></td>${idxs.map(i=>`<td>${pfd.monthly.revA[i]>0?(pfd.monthly.revA[i]/100).toFixed(2):'—'}</td>`).join('')}<td>${(idxs.reduce((t,i)=>t+(pfd.monthly.revA[i]||0),0)/100).toFixed(2)}</td></tr>
          <tr style="background:var(--blue-pale)"><td>YoY Revenue</td>${idxs.map(i=>{const a=mRevA[i]||0,b=pfd.monthly.revA[i]||0;const v=b>0?varPct(a,b):null;return `<td class="${v!==null?varCls(v):'td-na'}">${v!==null?showPct(v):'—'}</td>`;}).join('')}<td></td></tr>` : ''}
        </tbody>
      </table>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════
// REVENUE PAGE
// ═══════════════════════════════════════════════════════════
function renderRevenue() {
  const fd    = FIN_DATA[STATE.fy];
  const projs = filterProjects(fd.projects);
  const cm = getMetrics();
  const prevM = STATE.compare ? getPrevMetrics() : null;
  const ins = buildInsights(cm, prevM);
  // Revenue view: revenue, yoy, project insights
  const revIns = ins.filter(i => ['revenue','yoy','project'].includes(i.cat));
  return filterBadge() + buildInsightsPanel(revIns, 'Revenue & Productivity Insights') + `
  <div class="g2">
    <div class="card"><div class="card-hd"><div class="card-title">Monthly Revenue — Actual vs Budget vs Forecast${STATE.compare ? ` vs ${STATE.fy === 'FY2526' ? 'FY24-25' : 'FY25-26'}` : ''}</div><div class="legend"><div class="leg-it"><div class="leg-dot" style="background:${C.orange}"></div>Actual</div><div class="leg-it"><div class="leg-dot" style="background:${C.gray}"></div>Budget</div><div class="leg-it"><div class="leg-dot" style="background:${C.yellow}"></div>Forecast</div>${STATE.compare?`<div class="leg-it"><div class="leg-dot" style="background:${C.blue}"></div>${STATE.fy === 'FY2526' ? 'FY24-25' : 'FY25-26'} Actual</div>`:''}</div></div><div class="card-body"><div class="ch-wrap lg"><canvas id="ch-rev-monthly"></canvas></div></div></div>
    <div class="card"><div class="card-hd"><div class="card-title">FY25-26 vs FY24-25 Comparison</div><div class="legend"><div class="leg-it"><div class="leg-dot" style="background:${C.orange}"></div>FY25-26</div><div class="leg-it"><div class="leg-dot" style="background:${C.blue}"></div>FY24-25</div></div></div><div class="card-body"><div class="ch-wrap lg"><canvas id="ch-rev-fy-cmp"></canvas></div></div></div>
  </div>
  <div class="g2">
    <div class="card"><div class="card-hd"><div class="card-title">Revenue by Region — Actual vs Budget</div><div class="legend"><div class="leg-it"><div class="leg-dot" style="background:${C.orange}"></div>Actual</div><div class="leg-it"><div class="leg-dot" style="background:${C.gray}"></div>Budget</div></div></div><div class="card-body"><div class="ch-wrap"><canvas id="ch-rev-region"></canvas></div></div></div>
    <div class="card"><div class="card-hd"><div class="card-title">Revenue by Vertical</div></div><div class="card-body"><div class="ch-wrap"><canvas id="ch-rev-vert"></canvas></div></div></div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════
// EXPENSE / CM PAGE
// ═══════════════════════════════════════════════════════════
function renderExpense() {
  const cm = getMetrics();
  const prevM = STATE.compare ? getPrevMetrics() : null;
  const ins = buildInsights(cm, prevM);
  // CM/Expense view: cm and yoy (CM) insights
  const cmIns = ins.filter(i => ['cm','yoy'].includes(i.cat));
  return filterBadge() + buildInsightsPanel(cmIns, 'Contribution Margin Insights') + `
  <div class="g2">
    <div class="card"><div class="card-hd"><div class="card-title">Monthly CM Amount — Actual vs Budget${STATE.compare ? ` vs ${STATE.fy === 'FY2526' ? 'FY24-25' : 'FY25-26'}` : ''}</div>${STATE.compare?`<div class="legend"><div class="leg-it"><div class="leg-dot" style="background:${C.orange}"></div>Actual</div><div class="leg-it"><div class="leg-dot" style="background:${C.gray}"></div>Budget</div><div class="leg-it"><div class="leg-dot" style="background:${C.blue}"></div>${STATE.fy === 'FY2526' ? 'FY24-25' : 'FY25-26'} Actual</div></div>`:''}</div><div class="card-body"><div class="ch-wrap lg"><canvas id="ch-cm-monthly"></canvas></div></div></div>
    <div class="card"><div class="card-hd"><div class="card-title">Monthly CM% — Actual vs Budget vs Forecast${STATE.compare ? ` vs ${STATE.fy === 'FY2526' ? 'FY24-25' : 'FY25-26'}` : ''}</div>${STATE.compare?`<div class="legend"><div class="leg-it"><div class="leg-dot" style="background:${C.orange}"></div>Actual</div><div class="leg-it"><div class="leg-dot" style="background:${C.gray}"></div>Budget</div><div class="leg-it"><div class="leg-dot" style="background:${C.blue}"></div>${STATE.fy === 'FY2526' ? 'FY24-25' : 'FY25-26'} CM%</div></div>`:''}</div><div class="card-body"><div class="ch-wrap lg"><canvas id="ch-cmpct-monthly"></canvas></div></div></div>
  </div>
  <div class="g2">
    <div class="card"><div class="card-hd"><div class="card-title">FY Comparison — Monthly CM Amount</div><div class="legend"><div class="leg-it"><div class="leg-dot" style="background:${C.orange}"></div>FY25-26</div><div class="leg-it"><div class="leg-dot" style="background:${C.blue}"></div>FY24-25</div></div></div><div class="card-body"><div class="ch-wrap"><canvas id="ch-cm-fycmp"></canvas></div></div></div>
    <div class="card"><div class="card-hd"><div class="card-title">CM by Region</div></div><div class="card-body"><div class="ch-wrap"><canvas id="ch-cm-region"></canvas></div></div></div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════
// HIRING PAGE
// ═══════════════════════════════════════════════════════════
function renderHiring() {
  const m    = getMetrics();
  const prev = STATE.compare ? getPrevMetrics() : null;
  const ins  = buildInsights(m, prev);
  // Hiring view: hiring and yoy insights
  const hireIns = ins.filter(i => ['hiring','yoy'].includes(i.cat));
  // ── Compact Hiring Scorecard ────────────────────────────────
  const pfy = getPrevFY();
  const pfyShort = pfy ? FIN_DATA[pfy].short : null;
  function hsc(icon, label, val, valCls, pyVal, pyDiff, diffGood, sub) {
    const hasPY = STATE.compare && pfyShort && pyVal !== null && pyVal !== undefined;
    const diffCls = diffGood === true ? 'hsc-up' : diffGood === false ? 'hsc-dn' : 'hsc-neu';
    const diffArrow = diffGood === true ? '↑' : diffGood === false ? '↓' : '';
    return `
    <div class="hsc-card">
      <div class="hsc-top">
        <i class="fas ${icon} hsc-icon"></i>
        <span class="hsc-lbl">${label}</span>
      </div>
      <div class="hsc-val ${valCls||''}">${val}</div>
      ${sub ? `<div class="hsc-sub">${sub}</div>` : ''}
      ${hasPY ? `<div class="hsc-py">
        <span class="hsc-py-lbl">vs ${pfyShort}</span>
        <span class="hsc-py-val">${pyVal}</span>
        ${pyDiff !== null && pyDiff !== undefined ? `<span class="hsc-diff ${diffCls}">${diffArrow} ${Math.abs(pyDiff).toFixed(1)}%</span>` : ''}
      </div>` : ''}
    </div>`;
  }
  const hcUtil = m.appr > 0 && m.hc > 0 ? m.hcUtil.toFixed(1) + '%' : '—';
  const hcUtilCls = m.hcUtil > 115 ? 'td-warn' : m.hcUtil >= 85 ? 'td-pos' : '';

  // Detect if any project-level filters are active (region, sub-region, etc.)
  const hasProjectFilter = (
    STATE.region.length > 0 ||
    STATE.subRegion.length > 0 ||
    STATE.regionHead.length > 0 ||
    STATE.practiceHead.length > 0 ||
    STATE.vertical.length > 0 ||
    STATE.account.length > 0
  );
  const hiringFilterNote = hasProjectFilter ? `
  <div class="hiring-data-notice">
    <i class="fas fa-info-circle"></i>
    <div>
      <strong>Hiring data is company-wide</strong> — Joiner counts, headcount, and hiring mix are tracked at the organisation level and are <em>not broken down by region, vertical, or account</em> in the source data. The figures shown below reflect the <strong>entire company</strong> regardless of the active filters.
      Revenue and CM KPIs on other pages are filtered correctly.
    </div>
  </div>` : '';

  return filterBadge() + hiringFilterNote + buildInsightsPanel(hireIns, 'Hiring & Headcount Insights') + `
  <!-- Compact Hiring Scorecard Strip -->
  <div class="hsc-strip">
    ${hsc('fa-user-plus', 'Total Joiners', fmt.num(m.totalJ), '', prev?fmt.num(prev.totalJ):null, prev&&prev.totalJ>0?varPct(m.totalJ,prev.totalJ):null, prev&&prev.totalJ>0?m.totalJ>=prev.totalJ:null, 'All Sources')}
    ${hsc('fa-tag', 'Taggd Joiners', fmt.num(m.taggd), 'td-pos', prev?fmt.num(prev.taggd):null, prev&&prev.taggd>0?varPct(m.taggd,prev.taggd):null, prev&&prev.taggd>0?m.taggd>=prev.taggd:null, null)}
    ${hsc('fa-ban', 'Non-Taggd', fmt.num(m.nonTg), '', prev?fmt.num(prev.nonTg):null, prev&&prev.nonTg>0?varPct(m.nonTg,prev.nonTg):null, prev&&prev.nonTg>0?m.nonTg<=prev.nonTg:null, null)}
    ${hsc('fa-percent', 'Taggd Mix', m.taggdMix.toFixed(1)+'%', m.taggdMix>=50?'td-pos':'td-warn', prev&&prev.taggdMix>0?prev.taggdMix.toFixed(1)+'%':null, prev&&prev.taggdMix>0?m.taggdMix-prev.taggdMix:null, prev&&prev.taggdMix>0?m.taggdMix>=prev.taggdMix:null, 'Target ≥50%')}
    ${hsc('fa-people-group', 'Headcount', m.hc>0?Math.round(m.hc).toLocaleString('en-IN'):'N/A', '', prev&&prev.hc>0?Math.round(prev.hc).toLocaleString('en-IN'):null, prev&&prev.hc>0&&m.hc>0?varPct(m.hc,prev.hc):null, prev&&prev.hc>0?m.hc>=prev.hc:null, `WL1: ${m.wl1>0?Math.round(m.wl1):'—'} | Appr: ${m.appr>0?Math.round(m.appr):'—'}`)}
    ${hsc('fa-gauge-high', 'Joiner Prod.', m.taggdJP>0?m.taggdJP.toFixed(2)+' J/R':'N/A', '', null, null, null, 'Joiners / Recruiter')}
    ${hsc('fa-chart-bar', 'Util%', hcUtil, hcUtilCls, null, null, null, 'vs Approved HC')}
  </div>
  <div class="g2">
    <div class="card"><div class="card-hd"><div class="card-title">Monthly Joiners — Taggd vs Non-Taggd${STATE.compare?' (FY25-26 vs FY24-25)':''}</div>${STATE.compare?`<div class="legend"><div class="leg-it"><div class="leg-dot" style="background:${C.orange}"></div>Taggd FY25-26</div><div class="leg-it"><div class="leg-dot" style="background:${C.orange+'55'}"></div>Taggd FY24-25</div><div class="leg-it"><div class="leg-dot" style="background:${C.blue+'88'}"></div>Non-Taggd FY25-26</div><div class="leg-it"><div class="leg-dot" style="background:${C.blue+'33'}"></div>Non-Taggd FY24-25</div></div>`:''}</div><div class="card-body"><div class="ch-wrap lg"><canvas id="ch-hiring-monthly"></canvas></div></div></div>
    <div class="card"><div class="card-hd"><div class="card-title">FY Comparison — Taggd Joiners</div><div class="legend"><div class="leg-it"><div class="leg-dot" style="background:${C.orange}"></div>FY25-26</div><div class="leg-it"><div class="leg-dot" style="background:${C.blue}"></div>FY24-25</div></div></div><div class="card-body"><div class="ch-wrap lg"><canvas id="ch-hiring-fycmp"></canvas></div></div></div>
  </div>
  <div class="g2">
    <div class="card"><div class="card-hd"><div class="card-title">Joiner Source Mix</div></div><div class="card-body"><div class="ch-wrap sm"><canvas id="ch-src-mix"></canvas></div></div></div>
    <div class="card"><div class="card-hd"><div class="card-title">Headcount Trend — Overall vs WL1 vs Approved${STATE.compare ? ` vs ${STATE.fy === 'FY2526' ? 'FY24-25' : 'FY25-26'}` : ''}</div></div><div class="card-body"><div class="ch-wrap sm"><canvas id="ch-hc-trend"></canvas></div></div></div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════
// CASHFLOW PAGE
// ═══════════════════════════════════════════════════════════
function renderCashflow() {
  const fd   = FIN_DATA[STATE.fy];
  const fd24 = FIN_DATA.FY2425;
  const fd25 = FIN_DATA.FY2526;
  const m    = getMetrics();
  const prev = STATE.compare ? getPrevMetrics() : null;
  const pfd  = getPrevFY() ? FIN_DATA[getPrevFY()] : null;
  const ins  = buildInsights(m, prev);
  // Cashflow view: collection insights only
  const cashIns = ins.filter(i => i.cat === 'collection');
  const collAtt = m.collT>0?m.collA/m.collT*100:0;
  const ubPct   = m.revA>0?m.ub/m.revA*100:0;
  const bdPct   = m.collA>0?m.bd/m.collA*100:0;

  // ── Revenue Adjustment data ─────────────────────────────
  const idxs = getSelectedIndices();
  const revAdjCur  = m.revAdj || 0;
  const revAdjPrev = prev ? (prev.revAdj || 0) : 0;

  // ── Account-wise Unbilled table ─────────────────────────
  function buildUbTable(fdObj, fyLabel) {
    const ubAcc = fdObj.ubByAccount || {};
    const rows = Object.entries(ubAcc).map(([acc, arr]) => {
      const val = idxs.reduce((t,i) => t + (arr[i]||0), 0);
      return { acc, val };
    }).filter(r => r.val > 0).sort((a,b) => b.val - a.val);
    if (!rows.length) return `<p style="color:var(--g500);font-size:12px;margin:8px 0">No unbilled data for ${fyLabel}</p>`;
    return `<table class="dt" style="font-size:11px"><thead><tr>
      <th class="l">Account</th><th>Unbilled (₹ Cr)</th><th>% of Total UB</th>
    </tr></thead><tbody>
    ${rows.map(r => {
      const total = rows.reduce((t,x)=>t+x.val,0);
      const pct = total>0?(r.val/total*100):0;
      return `<tr>
        <td><strong>${r.acc}</strong></td>
        <td class="td-warn">${(r.val/100).toFixed(2)}</td>
        <td><div style="display:flex;align-items:center;gap:6px"><div style="width:${Math.min(pct*2,100).toFixed(0)}px;height:6px;background:var(--yellow);border-radius:3px"></div>${pct.toFixed(1)}%</div></td>
      </tr>`;
    }).join('')}
    <tr style="background:var(--orange-50);font-weight:700"><td>Total</td><td>${(rows.reduce((t,r)=>t+r.val,0)/100).toFixed(2)}</td><td>100%</td></tr>
    </tbody></table>`;
  }

  // ── Account-wise Bad Debt table ─────────────────────────
  function buildBdTable(fdObj, fyLabel) {
    const bdAcc = fdObj.bdByAccount || {};
    const rows = Object.entries(bdAcc).map(([acc, arr]) => {
      const val = idxs.reduce((t,i) => t + (arr[i]||0), 0);
      return { acc, val };
    }).filter(r => r.val > 0).sort((a,b) => b.val - a.val);
    if (!rows.length) return `<p style="color:var(--g500);font-size:12px;margin:8px 0">No bad debt data for ${fyLabel}</p>`;
    const bdTotal = rows.reduce((t,r)=>t+r.val,0);
    return `<table class="dt" style="font-size:11px"><thead><tr>
      <th class="l">Account</th><th>Bad Debt (₹ Cr)</th><th>% of Total BD</th>
    </tr></thead><tbody>
    ${rows.map(r => {
      const pct = bdTotal>0?(r.val/bdTotal*100):0;
      return `<tr>
        <td><strong>${r.acc}</strong></td>
        <td class="td-neg">${(r.val/100).toFixed(2)}</td>
        <td><div style="display:flex;align-items:center;gap:6px"><div style="width:${Math.min(pct*2,100).toFixed(0)}px;height:6px;background:var(--red);border-radius:3px"></div>${pct.toFixed(1)}%</div></td>
      </tr>`;
    }).join('')}
    <tr style="background:var(--orange-50);font-weight:700"><td>Total</td><td>${(bdTotal/100).toFixed(2)}</td><td>100%</td></tr>
    </tbody></table>`;
  }

  // ── Rev Adjustment FY comparison ─────────────────────────
  const revAdjRows25 = Object.entries(fd25.revAdjByAccount || {}).map(([acc,arr]) => {
    const val = idxs.reduce((t,i) => t + (arr[i]||0), 0);
    return { acc, val };
  }).filter(r => r.val > 0).sort((a,b) => b.val - a.val);

  const revAdjTable = revAdjRows25.length ? `
    <table class="dt" style="font-size:11px"><thead><tr>
      <th class="l">Account</th>
      <th>FY25-26 Rev Adj (₹ Cr)</th>
      ${STATE.compare && pfd ? '<th style="background:var(--blue-pale);color:var(--blue)">FY24-25 Rev Adj (₹ Cr)</th>' : ''}
    </tr></thead><tbody>
    ${revAdjRows25.map(r => {
      const py24 = STATE.compare && pfd ? (Object.entries(pfd.revAdjByAccount||{})).find(([k])=>k===r.acc)?.[1]||[] : null;
      const pyVal = py24 ? idxs.reduce((t,i)=>t+(py24[i]||0),0) : 0;
      return `<tr>
        <td><strong>${r.acc}</strong></td>
        <td class="td-pos">${(r.val/100).toFixed(2)}</td>
        ${STATE.compare && pfd ? `<td style="background:var(--blue-pale)">${pyVal>0?(pyVal/100).toFixed(2):'—'}</td>` : ''}
      </tr>`;
    }).join('')}
    <tr style="background:var(--orange-50);font-weight:700">
      <td>Total</td>
      <td>${(revAdjRows25.reduce((t,r)=>t+r.val,0)/100).toFixed(2)}</td>
      ${STATE.compare && pfd ? `<td style="background:var(--blue-pale)">${(0/100).toFixed(2)}</td>` : ''}
    </tr>
    </tbody></table>` : `<p style="color:var(--g500);font-size:12px">No revenue adjustment data for selected period</p>`;

  return filterBadge() + buildInsightsPanel(cashIns, 'Collections & Cash Insights') + `
  <div class="kpi-grid-3">
    ${kpiCard({color:collAtt>=90?'green':collAtt>=70?'yellow':'red',label:'Collections Actual',icon:'fa-hand-holding-dollar',val:m.collA>0?fmt.cr(m.collA):'N/A',valSub:'Total Collected',metrics:[{l:'Target',v:m.collT>0?fmt.cr(m.collT):'—'},{l:'Attainment',v:m.collT>0?collAtt.toFixed(1)+'%':'—',cls:collAtt>=90?'td-pos':collAtt>=70?'td-warn':'td-neg'},{l:'Var vs Tgt',v:m.collT>0&&m.collA>0?showPct(varPct(m.collA,m.collT)):'—',cls:m.collT>0?varCls(varPct(m.collA,m.collT)):''}],prog:m.collT>0?Math.min(collAtt,120):0,progColor:collAtt>=90?'green':'red',pyVal:prev&&prev.collA>0?fmt.cr(prev.collA):null,pyYoy:prev&&prev.collA>0&&m.collA>0?varPct(m.collA,prev.collA):null})}
    ${kpiCard({color:ubPct>8?'red':ubPct>3?'yellow':'green',label:'Unbilled Revenue',icon:'fa-file-invoice',val:fmt.cr(m.ub),valSub:'Outstanding Unbilled',metrics:[{l:'% of Revenue',v:m.revA>0?ubPct.toFixed(1)+'%':'—',cls:ubPct>8?'td-neg':ubPct>3?'td-warn':'td-pos'},{l:'Revenue Actual',v:fmt.cr(m.revA)},{l:'vs FY24-25',v:prev&&prev.ub>0?showPct(varPct(m.ub,prev.ub)):'—',cls:prev&&prev.ub>0?varCls(varPct(m.ub,prev.ub)):''}],prog:0,progColor:'',pyVal:prev&&prev.ub>0?fmt.cr(prev.ub):null,pyYoy:prev&&prev.ub>0&&m.ub>0?varPct(m.ub,prev.ub):null})}
    ${kpiCard({color:bdPct>3?'red':bdPct>0?'yellow':'green',label:'Bad Debt',icon:'fa-skull-crossbones',val:fmt.cr(m.bd),valSub:'Write-off Risk',metrics:[{l:'% of Collections',v:m.collA>0&&m.bd>0?bdPct.toFixed(1)+'%':'—',cls:bdPct>3?'td-neg':bdPct>0?'td-warn':''},{l:'vs FY24-25',v:prev&&prev.bd>0?showPct(varPct(m.bd,prev.bd)):'—',cls:prev&&prev.bd>0?varCls(varPct(m.bd,prev.bd)):''}],prog:0,progColor:'',pyVal:prev&&prev.bd>0?fmt.cr(prev.bd):null,pyYoy:prev&&prev.bd>0&&m.bd>0?varPct(m.bd,prev.bd):null})}
  </div>

  <!-- Revenue Adjustment Card -->
  <div class="card g1">
    <div class="card-hd">
      <div>
        <div class="card-title"><i class="fas fa-sliders" style="color:var(--orange);margin-right:6px"></i>Revenue Adjustment${STATE.compare && pfd ? ` — FY Comparison (FY25-26 vs FY24-25)` : ''}</div>
        <div class="card-sub">Adjustments applied to revenue, sourced from Revenue_Adjustment sheet — ₹ Crores</div>
      </div>
      <div class="kpi-badge" style="flex-direction:column;align-items:flex-start">
        <div class="kpi-badge-lbl">Total Rev Adj</div>
        <div class="kpi-badge-val td-pos">${revAdjCur>0?fmt.cr(revAdjCur):'₹0.00 Cr'}</div>
      </div>
      ${STATE.compare && prev ? `
      <div class="kpi-badge" style="flex-direction:column;align-items:flex-start">
        <div class="kpi-badge-lbl">FY24-25 Rev Adj</div>
        <div class="kpi-badge-val td-muted">${revAdjPrev>0?fmt.cr(revAdjPrev):'₹0.00 Cr'}</div>
      </div>` : ''}
    </div>
    <div class="card-body np" style="overflow-x:auto">${revAdjTable}</div>
  </div>

  <div class="g2">
    <div class="card"><div class="card-hd"><div class="card-title">Monthly Collections — Actual vs Target${STATE.compare ? ` vs ${STATE.fy === 'FY2526' ? 'FY24-25' : 'FY25-26'}` : ''}</div>${STATE.compare?`<div class="legend"><div class="leg-it"><div class="leg-dot" style="background:${C.orange}"></div>Actual</div><div class="leg-it"><div class="leg-dot" style="background:${C.gray}"></div>Target</div><div class="leg-it"><div class="leg-dot" style="background:${C.blue}"></div>${STATE.fy === 'FY2526' ? 'FY24-25' : 'FY25-26'} Actual</div></div>`:''}</div><div class="card-body"><div class="ch-wrap lg"><canvas id="ch-coll-monthly"></canvas></div></div></div>
    <div class="card"><div class="card-hd"><div class="card-title">Revenue Adjustment — Monthly${STATE.compare&&pfd?' (FY25-26 vs FY24-25)':''}</div>${STATE.compare&&pfd?`<div class="legend"><div class="leg-it"><div class="leg-dot" style="background:${C.green}"></div>Rev Adj FY25-26</div><div class="leg-it"><div class="leg-dot" style="background:${C.blue+'66'}"></div>Rev Adj FY24-25</div></div>`:''}</div><div class="card-body"><div class="ch-wrap lg"><canvas id="ch-rev-adj-monthly"></canvas></div></div></div>
  </div>
  <div class="g2">
    <div class="card"><div class="card-hd"><div class="card-title">Collections Attainment % — Monthly</div></div><div class="card-body"><div class="ch-wrap"><canvas id="ch-coll-att"></canvas></div></div></div>
    <div class="card"><div class="card-hd"><div class="card-title">Unbilled & Bad Debt — Monthly${STATE.compare&&pfd?' (FY25-26 vs FY24-25)':''}</div>${STATE.compare&&pfd?`<div class="legend"><div class="leg-it"><div class="leg-dot" style="background:${C.yellow}"></div>Unbilled FY25-26</div><div class="leg-it"><div class="leg-dot" style="background:${C.red}"></div>Bad Debt FY25-26</div><div class="leg-it"><div class="leg-dot" style="background:${C.blue+'66'}"></div>Unbilled FY24-25</div></div>`:''}</div><div class="card-body"><div class="ch-wrap"><canvas id="ch-ub-bd-monthly"></canvas></div></div></div>
  </div>

  <!-- Account-wise Unbilled & Bad Debt Tables -->
  <div class="g2">
    <div class="card">
      <div class="card-hd">
        <div>
          <div class="card-title"><i class="fas fa-file-invoice" style="color:var(--yellow);margin-right:6px"></i>Account-wise Unbilled Revenue${STATE.compare&&pfd?' — FY Comparison':''}</div>
          <div class="card-sub">FY25-26 unbilled by account — ₹ Crores</div>
        </div>
      </div>
      <div class="card-body np" style="overflow-x:auto">
        ${buildUbTable(fd25, 'FY25-26')}
        ${STATE.compare && pfd && Object.keys(fd24.ubByAccount||{}).length ? `
          <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--g200)">
            <div style="font-size:11px;font-weight:600;color:var(--blue);margin-bottom:8px">FY24-25 Unbilled</div>
            ${buildUbTable(fd24, 'FY24-25')}
          </div>` : ''}
      </div>
    </div>
    <div class="card">
      <div class="card-hd">
        <div>
          <div class="card-title"><i class="fas fa-skull-crossbones" style="color:var(--red);margin-right:6px"></i>Account-wise Bad Debt${STATE.compare&&pfd?' — FY Comparison':''}</div>
          <div class="card-sub">FY25-26 bad debt by account — ₹ Crores</div>
        </div>
      </div>
      <div class="card-body np" style="overflow-x:auto">
        ${buildBdTable(fd25, 'FY25-26')}
        ${STATE.compare && pfd && Object.keys(fd24.bdByAccount||{}).length ? `
          <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--g200)">
            <div style="font-size:11px;font-weight:600;color:var(--blue);margin-bottom:8px">FY24-25 Bad Debt</div>
            ${buildBdTable(fd24, 'FY24-25')}
          </div>` : ''}
      </div>
    </div>
  </div>`;
}





function toggleManualSection(hd) {
  const body = hd.nextElementSibling;
  const arr  = hd.querySelector('.ms-arr');
  const isOpen = body.style.maxHeight && body.style.maxHeight !== '0px';
  if (isOpen) { body.style.maxHeight='0px'; if(arr) arr.style.transform=''; }
  else         { body.style.maxHeight='2000px'; if(arr) arr.style.transform='rotate(180deg)'; }
}



// ═══════════════════════════════════════════════════════════
// USER MANUAL PAGE
// ═══════════════════════════════════════════════════════════
function renderManual() {
  const defs = window.CALC_DEFS || {};
  const metricSections = Object.entries(defs).map(([k,d]) => {
    const rows = [
      d.actual    && {lbl:'Actual',        val:d.actual},
      d.budget    && {lbl:'Budget',        val:d.budget},
      d.forecast  && {lbl:'Forecast',      val:d.forecast},
      d.varBudget && {lbl:'Var vs Budget', val:d.varBudget},
      d.varFcst   && {lbl:'Var vs Fcst',   val:d.varFcst},
      d.unit      && {lbl:'Unit',          val:d.unit, note:true},
      d.note      && {lbl:'Note',          val:d.note, italic:true},
    ].filter(Boolean);
    return `<div class="manual-section"><div class="manual-section-hd" onclick="toggleManualSection(this)">
      <i class="fas ${d.icon||'fa-calculator'} ms-ico"></i><span class="ms-title">${d.label}</span><i class="fas fa-chevron-down ms-arr"></i>
    </div><div class="manual-section-body"><div class="manual-inner">
      ${rows.map(r=>`<div class="mrow${r.note?' mrow-note':''}"><div class="mrow-lbl">${r.lbl}</div><div class="mrow-val${r.italic?' td-muted':''}">${r.val}</div></div>`).join('')}
    </div></div></div>`;
  }).join('');

  return `<div class="card g1"><div class="card-hd"><div><div class="card-title">📖 User Manual & Calculation Guide</div><div class="card-sub">How every metric is calculated — source sheets, formulas, interpretation</div></div></div>
  <div class="card-body">
    <div class="info-box"><strong>📂 Data Sources:</strong> <code style="background:var(--g100);padding:2px 6px;border-radius:4px">FY24-25_Finance_Data.xlsx</code> and <code style="background:var(--g100);padding:2px 6px;border-radius:4px">FY25-26_Finance_Data.xlsx</code><br>
    Values in <strong>₹ Lakhs</strong> in source; displayed as <strong>₹ Crores (÷100)</strong>. FY25-26 actuals: Apr25–Jan26 (10 months); Feb26, Mar26 = 0.</div>
    <h3 style="font-size:13px;font-weight:700;margin-bottom:12px"><i class="fas fa-filter" style="color:var(--orange);margin-right:6px"></i>Filter Controls</h3>
    <div class="manual-section" style="margin-bottom:20px"><div class="manual-section-hd open" onclick="toggleManualSection(this)"><i class="fas fa-sliders ms-ico"></i><span class="ms-title">Filter Logic &amp; How to Use</span><i class="fas fa-chevron-down ms-arr" style="transform:rotate(180deg)"></i></div>
    <div class="manual-section-body open" style="max-height:2000px"><div class="manual-inner">
      <div class="mrow"><div class="mrow-lbl">FY Selector</div><div class="mrow-val">Switches between FY24-25 and FY25-26. All metrics update.</div></div>
      <div class="mrow"><div class="mrow-lbl">Quarter Pills</div><div class="mrow-val">Q1=Apr–Jun, Q2=Jul–Sep, Q3=Oct–Dec, Q4=Jan–Mar. "All Year" = all 12 months.</div></div>
      <div class="mrow"><div class="mrow-lbl">Months Dropdown</div><div class="mrow-val">Multi-select individual months. Default = all months.</div></div>
      <div class="mrow"><div class="mrow-lbl">FY Compare: ON</div><div class="mrow-val">Shows FY24-25 comparison lines on charts and adds FY24-25 column in summary table.</div></div>
      <div class="mrow"><div class="mrow-lbl">Region / Vertical</div><div class="mrow-val">Filter account-level data in Revenue Analysis.</div></div>
      <div class="mrow mrow-note"><div class="mrow-lbl">Reset</div><div class="mrow-val">Resets to All Year, clears all filters.</div></div>
    </div></div></div>
    <h3 style="font-size:13px;font-weight:700;margin-bottom:12px"><i class="fas fa-calculator" style="color:var(--orange);margin-right:6px"></i>Metric Definitions</h3>
    ${metricSections}
    <h3 style="font-size:13px;font-weight:700;margin-bottom:12px;margin-top:20px"><i class="fas fa-palette" style="color:var(--orange);margin-right:6px"></i>Colour Coding</h3>
    <div class="card" style="margin-bottom:0"><div class="card-body">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px"><span style="width:12px;height:12px;background:var(--green);border-radius:3px;flex-shrink:0"></span><div><strong>Green</strong> — On/above target, positive variance</div></div>
        <div style="display:flex;align-items:center;gap:8px"><span style="width:12px;height:12px;background:var(--red);border-radius:3px;flex-shrink:0"></span><div><strong>Red</strong> — Below target, loss-making</div></div>
        <div style="display:flex;align-items:center;gap:8px"><span style="width:12px;height:12px;background:var(--yellow);border-radius:3px;flex-shrink:0"></span><div><strong>Amber</strong> — Borderline / monitor</div></div>
        <div style="display:flex;align-items:center;gap:8px"><span style="width:12px;height:12px;background:var(--orange);border-radius:3px;flex-shrink:0"></span><div><strong>Orange</strong> — Taggd brand, current FY</div></div>
        <div style="display:flex;align-items:center;gap:8px"><span style="width:12px;height:12px;background:var(--blue);border-radius:3px;flex-shrink:0"></span><div><strong>Blue</strong> — Prior year comparison</div></div>
      </div>
      <p style="font-size:12px;color:var(--g600)"><strong>pp</strong> = percentage points (for CM% gap). <strong>MoM</strong> = last available month vs previous month.</p>
    </div></div>
  </div></div>`;
}



// ── Account tile filter/sort helpers (kept for potential future use) ────────
window._accFilters = { region: 'All', vert: 'All' };


function filterAccTiles() {
  const q = (document.getElementById('acc-search')?.value||'').toLowerCase();
  const rf = window._accFilters.region;
  const vf = window._accFilters.vert;
  document.querySelectorAll('.acc-tile').forEach(tile => {
    const name = tile.querySelector('.acc-tile-name')?.textContent?.toLowerCase()||'';
    const rgn  = tile.querySelector('.acc-badge')?.textContent?.trim()||'';
    const vert = tile.querySelectorAll('.acc-badge')[1]?.textContent?.trim()||'';
    const vertFull = vert === 'Lead' ? 'Leadership' : 'Lateral';
    const matchQ  = !q || name.includes(q);
    const matchR  = rf === 'All' || rgn === rf;
    const matchV  = vf === 'All' || vertFull === vf;
    tile.style.display = (matchQ && matchR && matchV) ? '' : 'none';
  });
  // Hide empty groups
  document.querySelectorAll('.acc-group').forEach(g => {
    const visible = [...g.querySelectorAll('.acc-tile')].some(t => t.style.display !== 'none');
    g.style.display = visible ? '' : 'none';
  });
}

function setAccFilter(type, val, btn) {
  window._accFilters[type] = val;
  const groupId = type === 'region' ? 'acc-filter-region' : 'acc-filter-vert';
  document.querySelectorAll(`#${groupId} .acc-fbtn`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterAccTiles();
}

function togglePresMode(btn) {
  const wrapper = document.getElementById('acc-tiles-wrapper');
  if (!wrapper) return;
  const active = wrapper.classList.toggle('pres-mode');
  btn.classList.toggle('active', active);
  btn.innerHTML = active
    ? '<i class="fas fa-compress"></i> Normal View'
    : '<i class="fas fa-expand"></i> Presentation';
}

function sortAccTiles() {
  const sortVal = document.getElementById('acc-sort')?.value || 'revA_desc';
  document.querySelectorAll('.acc-tiles-grid').forEach(grid => {
    const tiles = [...grid.querySelectorAll('.acc-tile')];
    tiles.sort((a, b) => {
      if (sortVal === 'name_asc') return (a.querySelector('.acc-tile-name')?.textContent||'').localeCompare(b.querySelector('.acc-tile-name')?.textContent||'');
      const getD = (el, attr) => parseFloat(el.dataset[attr] || '0');
      if (sortVal === 'revA_desc') return getD(b,'reva') - getD(a,'reva');
      if (sortVal === 'revA_asc')  return getD(a,'reva') - getD(b,'reva');
      if (sortVal === 'cmPct_desc') return getD(b,'cmpct') - getD(a,'cmpct');
      if (sortVal === 'vsBud_desc') return getD(b,'vsbud') - getD(a,'vsbud');
      return 0;
    });
    tiles.forEach(t => grid.appendChild(t));
  });
}

function negCMTable() {
  const rows = [...FIN_DATA.FY2526.projects.filter(p=>p.cmA<0).map(p=>({...p,fy:'FY25-26'})),
                ...FIN_DATA.FY2425.projects.filter(p=>p.cmA<0).map(p=>({...p,fy:'FY24-25'}))];
  if (!rows.length) return `<div class="card"><div class="card-body"><p style="color:var(--green);font-weight:600"><i class="fas fa-check-circle"></i> No accounts with negative CM found.</p></div></div>`;
  return `<div class="card"><div class="card-hd"><div class="card-title">⚠️ Risk: Negative CM Accounts</div></div>
  <div class="card-body np" style="overflow-x:auto"><table class="dt"><thead><tr>
    <th class="l">FY</th><th class="l">Account</th><th>Region</th><th>Vertical</th>
    <th>Rev Actual</th><th>CM Actual</th><th>CM%</th><th>CM Budget</th><th>Gap</th>
  </tr></thead><tbody>
    ${rows.map(p=>{const cp=p.revA>0?p.cmA/p.revA*100:0;return `<tr>
      <td><span class="vtag" style="background:var(--blue-pale);color:var(--blue)">${p.fy}</span></td>
      <td><strong>${p.name}</strong></td><td>${p.region}</td>
      <td><span class="vtag vtag-${p.vert==='Leadership'?'lead':'lat'}">${p.vert}</span></td>
      <td>₹${p.revA.toFixed(1)}</td><td class="td-neg">₹${p.cmA.toFixed(1)}</td>
      <td class="td-neg">${cp.toFixed(1)}%</td><td>₹${p.cmB.toFixed(1)}</td>
      <td class="td-neg">₹${(p.cmA-p.cmB).toFixed(1)}</td>
    </tr>`; }).join('')}
  </tbody></table></div></div>`;
}

function switchProjTab(el, id) {
  document.querySelectorAll('#proj-tabs .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  ['pt-fy25','pt-fy24','pt-cmp','pt-neg'].forEach(i=>{const d=document.getElementById(i);if(d)d.style.display=i===id?'block':'none';});
  if (id==='pt-cmp') {
    destroyCharts();
    const fd24=FIN_DATA.FY2425, fd25=FIN_DATA.FY2526;
    const names=fd25.projects.slice(0,10).map(p=>p.name);
    const v25=names.map(n=>(fd25.projects.find(p=>p.name===n)||{revA:0}).revA/100);
    const v24=names.map(n=>(fd24.projects.find(p=>p.name===n)||{revA:0}).revA/100);
    setTimeout(()=>mkBar('ch-proj-cmp',names,[
      {label:'FY25-26',data:v25,backgroundColor:C.orange},
      {label:'FY24-25',data:v24,backgroundColor:C.blue+'BB'}
    ],{indexAxis:'y',legend:true,dataLabels:true}),50);
  }
}

// ═══════════════════════════════════════════════════════════
// CHART INITIALIZATION
// ═══════════════════════════════════════════════════════════
function initCharts() {
  const fd   = FIN_DATA[STATE.fy];
  const fd24 = FIN_DATA.FY2425;
  const fd25 = FIN_DATA.FY2526;
  const m    = fd.monthly;
  const labs = fd.mLabels;
  // Dynamic label for comparison FY line (depends on which FY is active)
  const cmpFYLabel = fd === fd25 ? 'FY24-25' : 'FY25-26';

  // ── Apply project-level filter scaling for chart arrays ──
  // When filters are active, scale rev/cm monthly arrays proportionally.
  // For Rev Forecast (mRevF): use ratios.revA as proxy — account's actual revenue share
  // is the most accurate available estimate for its forecast share.
  // This avoids using stale projects[].revF values which may be incorrect.
  const ratios = _getFilterRatios(STATE.fy);
  const mRevA = ratios ? _scaleArr(m.revA, ratios.revA) : m.revA;
  const mRevB = ratios ? _scaleArr(m.revB, ratios.revB) : m.revB;
  const mRevF = ratios ? _scaleArr(m.revF, ratios.revA) : m.revF;  // use revA ratio (actual share)
  const mCmA  = ratios ? _scaleArr(m.cmA,  ratios.cmA)  : m.cmA;
  const mCmB  = ratios ? _scaleArr(m.cmB,  ratios.cmB)  : m.cmB;

  // Last actual index for each FY (trendline cutoff)
  const last25 = getLastActualIdx('FY2526');
  const last24 = getLastActualIdx('FY2425');

  // Cut data after last actual index — nulls for future months
  // null in source = genuinely missing data; 0 = zero value (kept)
  function cutAt(arr, lastIdx) {
    return arr.map((v, i) => i <= lastIdx ? (v === null || v === undefined ? null : v) : null);
  }
  // cutAtNz: like cutAt but also converts 0→null (for revenue/cm where 0 = no data)
  function cutAtNz(arr, lastIdx) {
    return arr.map((v, i) => i <= lastIdx ? (v > 0 ? v : null) : null);
  }

  const idxs    = getSelectedIndices();
  const selLabs = idxs.map(i => fd.mLabels[i]);

  // ── Overview charts ──────────────────────────────────────
  if (el('ch-rev-trend')) {
    const curLast = getLastActualIdx(STATE.fy);
    const ds = [
      lineDs('Actual',   cutAt(mRevA.map(v=>v/100), curLast), C.orange, true),
      lineDs('Budget',   mRevB.map(v=>v/100), C.gray),
      // Forecast: show only for months AFTER last actual (future forecast)
      lineDs('Forecast', mRevF.map((v,i) => i > curLast && v > 0 ? v/100 : null), C.yellow, false, 'dash'),
    ];
    if (STATE.compare) {
      // Always show BOTH FY lines when compare is ON
      const pfd   = fd === fd25 ? fd24 : fd25;
      const pLast = fd === fd25 ? last24 : last25;
      ds.push(lineDs(cmpFYLabel + ' Actual', cutAt(pfd.monthly.revA.map(v=>v>0?v/100:null), pLast), C.blue, false, 'dash'));
    }
    mkLine('ch-rev-trend', labs, ds, { yLabel:'₹ Cr', showLegend:true, dataLabels:true });
  }

  if (el('ch-cm-trend')) {
    const curLast2 = getLastActualIdx(STATE.fy);
    const cmAP = mRevA.map((r,i) => r>0 ? mCmA[i]/r*100 : null);
    const cmBP = mRevB.map((r,i) => r>0 ? mCmB[i]/r*100 : null);
    const cmDs = [
      lineDs('CM% Actual', cutAt(cmAP, curLast2), C.orange, true),
      lineDs('CM% Budget', cmBP, C.gray),
    ];
    if (STATE.compare) {
      const pfd2 = fd === fd25 ? fd24 : fd25;
      const pLast2 = fd === fd25 ? last24 : last25;
      const pCmAP = pfd2.monthly.revA.map((r,i) => r>0 ? pfd2.monthly.cmA[i]/r*100 : null);
      cmDs.push(lineDs(cmpFYLabel + ' CM%', cutAt(pCmAP, pLast2), C.blue, false, 'dash'));
    }
    mkLine('ch-cm-trend', labs, cmDs, { yUnit:'%', showLegend:true, dataLabels:true });
  }

  if (el('ch-region')) {
    // Compute byRegion dynamically from projects for the selected FY
    const ovRegData = _calcByRegion(fd);
    const ovRegNames = ovRegData.map(r => r.name);
    mkBar('ch-region', ovRegNames, [
      {label:'Actual', data:ovRegData.map(r=>r.revA/100), backgroundColor:C.orange},
      {label:'Budget', data:ovRegData.map(r=>r.revB/100), backgroundColor:C.gray+'99'},
    ], {yLabel:'₹ Cr', legend:true, dataLabels:true});
  }

  if (el('ch-joiners')) {
    const curLast = getLastActualIdx(STATE.fy);
    if (STATE.compare) {
      // Side-by-side comparison: current FY vs FY24-25 totals per month
      const pfd3 = fd === fd25 ? fd24 : fd25;
      const pLast3 = fd === fd25 ? last24 : last25;
      mkBar('ch-joiners', labs, [
        {label:'Taggd (FY25-26)',    data:cutAt(m.taggd, curLast),          backgroundColor:C.orange},
        {label:'Taggd (FY24-25)',   data:cutAt(pfd3.monthly.taggd, pLast3), backgroundColor:C.orange+'55'},
        {label:'Non-Taggd (FY25-26)', data:cutAt(m.nonT,  curLast),         backgroundColor:C.blue+'88'},
        {label:'Non-Taggd (FY24-25)', data:cutAt(pfd3.monthly.nonT, pLast3), backgroundColor:C.blue+'33'},
      ], {legend:true, dataLabels:true, yUnit:'count'});
    } else {
      mkBar('ch-joiners', labs, [
        {label:'Taggd',     data:cutAt(m.taggd, curLast), backgroundColor:C.orange},
        {label:'Non-Taggd', data:cutAt(m.nonT,  curLast), backgroundColor:C.blue+'88'},
      ], {stacked:true, legend:true, dataLabels:true, yUnit:'count'});
    }
  }

  // Overview collection & headcount charts
  if (el('ch-ov-coll')) {
    const curLast = getLastActualIdx(STATE.fy);
    const collDs = [
      {label:'Actual', data:cutAtNz(m.collA.map(v=>v/100), curLast), backgroundColor:C.orange},
      {label:'Target', data:cutAtNz(m.collT.map(v=>v/100), curLast), backgroundColor:C.gray+'88'},
    ];
    if (STATE.compare) {
      const pfd4 = fd === fd25 ? fd24 : fd25;
      const pLast4 = fd === fd25 ? last24 : last25;
      collDs.push({label:cmpFYLabel + ' Actual', data:cutAtNz(pfd4.monthly.collA.map(v=>v/100), pLast4), backgroundColor:C.blue+'55'});
    }
    mkBar('ch-ov-coll', labs, collDs, {yLabel:'₹ Cr', legend:true, dataLabels:true});
  }

  if (el('ch-ov-hc')) {
    const curLast = getLastActualIdx(STATE.fy);
    const hcDs = [
      lineDs('Overall HC',  cutAtNz(m.hcOverall,  curLast), C.orange, true),
      lineDs('WL1 HC',      cutAtNz(m.hcWL1,      curLast), C.blue),
      lineDs('Approved HC', cutAtNz(m.hcApproved, curLast), C.green),
    ];
    if (STATE.compare) {
      const pfd5 = fd === fd25 ? fd24 : fd25;
      const pLast5 = fd === fd25 ? last24 : last25;
      hcDs.push(lineDs(cmpFYLabel + ' Overall HC', cutAtNz(pfd5.monthly.hcOverall, pLast5), C.orange, false, 'dash'));
    }
    mkLine('ch-ov-hc', labs, hcDs, {yUnit:'count', showLegend:true, dataLabels:true});
  }

  // ── P&L charts ───────────────────────────────────────────
  if (el('ch-pnl-rev')) {
    const pnlRevDs = [
      {label:'Actual',   data:idxs.map(i=>mRevA[i]>0?mRevA[i]/100:null), backgroundColor:C.orange},
      {label:'Budget',   data:idxs.map(i=>mRevB[i]/100), backgroundColor:C.gray+'88'},
      // Forecast: only show for months where no actual exists (future months)
      {label:'Forecast', data:idxs.map(i=>(mRevA[i]||0)===0&&mRevF[i]>0?mRevF[i]/100:null), backgroundColor:C.yellow+'88'},
    ];
    if (STATE.compare) {
      const pfdPnl = fd === fd25 ? fd24 : fd25;
      pnlRevDs.push({label:cmpFYLabel + ' Actual', data:idxs.map(i=>pfdPnl.monthly.revA[i]>0?pfdPnl.monthly.revA[i]/100:null), backgroundColor:C.blue+'55'});
    }
    mkBar('ch-pnl-rev', selLabs, pnlRevDs, {yLabel:'₹ Cr', legend:true, dataLabels:true});
  }

  if (el('ch-pnl-cm')) {
    const cmA2 = idxs.map(i => mRevA[i]>0 ? mCmA[i]/mRevA[i]*100 : null);
    const cmB2 = idxs.map(i => mRevB[i]>0 ? mCmB[i]/mRevB[i]*100 : null);
    const pnlCmDs = [lineDs('CM% Actual',cmA2,C.orange,true), lineDs('CM% Budget',cmB2,C.gray)];
    if (STATE.compare) {
      const pfdPnl2 = fd === fd25 ? fd24 : fd25;
      const pCmA2 = idxs.map(i => pfdPnl2.monthly.revA[i]>0 ? pfdPnl2.monthly.cmA[i]/pfdPnl2.monthly.revA[i]*100 : null);
      pnlCmDs.push(lineDs(cmpFYLabel + ' CM%', pCmA2, C.blue, false, 'dash'));
    }
    mkLine('ch-pnl-cm', selLabs, pnlCmDs, {yUnit:'%', showLegend:true, dataLabels:true});
  }

  // ── Revenue charts ───────────────────────────────────────
  if (el('ch-rev-monthly')) {
    const curLast = getLastActualIdx(STATE.fy);
    const revMonDs = [
      {label:'Actual',   data:cutAtNz(mRevA.map(v=>v/100), curLast), backgroundColor:C.orange},
      {label:'Budget',   data:mRevB.map(v=>v/100), backgroundColor:C.gray+'88'},
      // Forecast: only show for months AFTER the last actual (future months only)
      {label:'Forecast', data:mRevF.map((v,i) => i > curLast && v > 0 ? v/100 : null), backgroundColor:C.yellow+'88'},
    ];
    if (STATE.compare) {
      const pfdRev  = fd === fd25 ? fd24 : fd25;
      const pLastRev = fd === fd25 ? last24 : last25;
      revMonDs.push({label:cmpFYLabel + ' Actual', data:cutAtNz(pfdRev.monthly.revA.map(v=>v/100), pLastRev), backgroundColor:C.blue+'55'});
    }
    mkBar('ch-rev-monthly', labs, revMonDs, {yLabel:'₹ Cr', legend:true, dataLabels:true});
  }

  if (el('ch-rev-fy-cmp')) {
    mkLine('ch-rev-fy-cmp', labs, [
      lineDs('FY25-26 Actual', cutAtNz(fd25.monthly.revA.map(v=>v/100), last25), C.orange, true),
      lineDs('FY24-25 Actual', cutAtNz(fd24.monthly.revA.map(v=>v/100), last24), C.blue),
    ], {yLabel:'₹ Cr', showLegend:true, dataLabels:true});
  }

  if (el('ch-rev-region')) {
    // Compute byRegion dynamically from projects for the selected FY
    const revRegData = _calcByRegion(fd);
    const revRegNames = revRegData.map(r => r.name);
    mkBar('ch-rev-region', revRegNames, [
      {label:'Actual', data:revRegData.map(r=>r.revA/100), backgroundColor:C.orange},
      {label:'Budget', data:revRegData.map(r=>r.revB/100), backgroundColor:C.gray+'88'},
    ], {yLabel:'₹ Cr', legend:true, dataLabels:true});
  }

  if (el('ch-rev-vert')) {
    mkDoughnut('ch-rev-vert', fd.byVertical.map(r=>r.name), fd.byVertical.map(r=>r.revA/100), [C.orange, C.blue]);
  }

  // ── Expense / CM charts ──────────────────────────────────
  if (el('ch-cm-monthly')) {
    const curLast = getLastActualIdx(STATE.fy);
    const cmMonDs = [
      {label:'CM Actual', data:cutAtNz(mCmA.map(v=>v/100), curLast), backgroundColor:C.orange},
      {label:'CM Budget', data:mCmB.map(v=>v/100), backgroundColor:C.gray+'88'},
    ];
    if (STATE.compare) {
      const pfdCm  = fd === fd25 ? fd24 : fd25;
      const pLastCm = fd === fd25 ? last24 : last25;
      cmMonDs.push({label:cmpFYLabel + ' CM Actual', data:cutAtNz(pfdCm.monthly.cmA.map(v=>v/100), pLastCm), backgroundColor:C.blue+'55'});
    }
    mkBar('ch-cm-monthly', labs, cmMonDs, {yLabel:'₹ Cr', legend:true, dataLabels:true});
  }

  if (el('ch-cmpct-monthly')) {
    const curLast = getLastActualIdx(STATE.fy);
    const a = mRevA.map((r,i) => r>0 ? mCmA[i]/r*100 : null);
    const b = mRevB.map((r,i) => r>0 ? mCmB[i]/r*100 : null);
    const mCmFScaled = ratios ? _scaleArr(m.cmF, ratios.cmB) : m.cmF;
    const f = mRevF && mCmFScaled ? mRevF.map((r,i) => r>0 ? mCmFScaled[i]/r*100 : null) : null;
    const ds2 = [
      lineDs('CM% Actual',   cutAt(a, curLast), C.orange, true),
      lineDs('CM% Budget',   b, C.gray),
    ];
    if (f) ds2.push(lineDs('CM% Forecast', cutAt(f, curLast), C.yellow, false, 'dash'));
    if (STATE.compare) {
      const pfdCmPct = fd === fd25 ? fd24 : fd25;
      const pLastCmPct = fd === fd25 ? last24 : last25;
      const pA = pfdCmPct.monthly.revA.map((r,i) => r>0 ? pfdCmPct.monthly.cmA[i]/r*100 : null);
      ds2.push(lineDs(cmpFYLabel + ' CM%', cutAt(pA, pLastCmPct), C.blue, false, 'dash'));
    }
    mkLine('ch-cmpct-monthly', labs, ds2, {yUnit:'%', showLegend:true, dataLabels:true});
  }

  if (el('ch-cm-fycmp')) {
    mkLine('ch-cm-fycmp', labs, [
      lineDs('FY25-26 CM', cutAtNz(fd25.monthly.cmA.map(v=>v/100), last25), C.orange, true),
      lineDs('FY24-25 CM', cutAtNz(fd24.monthly.cmA.map(v=>v/100), last24), C.blue),
    ], {yLabel:'₹ Cr', showLegend:true, dataLabels:true});
  }

  if (el('ch-cm-region')) {
    const cmRegData = _calcByRegion(fd);
    mkBar('ch-cm-region', cmRegData.map(r=>r.name), [
      {label:'CM Actual', data:cmRegData.map(r=>r.cmA/100), backgroundColor:C.orange},
      {label:'CM Budget', data:cmRegData.map(r=>r.cmB/100), backgroundColor:C.gray+'88'},
    ], {yLabel:'₹ Cr', legend:true, dataLabels:true});
  }

  // ── Hiring charts ────────────────────────────────────────
  if (el('ch-hiring-monthly')) {
    const curLast = getLastActualIdx(STATE.fy);
    // Respect selected indices: filter data to only selected months
    const taggdD = idxs.map(i => i <= curLast ? (m.taggd[i] !== null && m.taggd[i] !== undefined ? m.taggd[i] : null) : null);
    const nonTD  = idxs.map(i => i <= curLast ? (m.nonT[i]  !== null && m.nonT[i]  !== undefined ? m.nonT[i]  : null) : null);
    if (STATE.compare) {
      const pfdHire  = fd === fd25 ? fd24 : fd25;
      const pLastHire = fd === fd25 ? last24 : last25;
      const pTaggdD  = idxs.map(i => i <= pLastHire ? (pfdHire.monthly.taggd[i] !== null && pfdHire.monthly.taggd[i] !== undefined ? pfdHire.monthly.taggd[i] : null) : null);
      const pNonTD   = idxs.map(i => i <= pLastHire ? (pfdHire.monthly.nonT[i]  !== null && pfdHire.monthly.nonT[i]  !== undefined ? pfdHire.monthly.nonT[i]  : null) : null);
      mkBar('ch-hiring-monthly', selLabs, [
        {label:'Taggd (FY25-26)',     data:taggdD,  backgroundColor:C.orange},
        {label:'Taggd (FY24-25)',     data:pTaggdD, backgroundColor:C.orange+'55'},
        {label:'Non-Taggd (CY)',      data:nonTD,   backgroundColor:C.blue+'88'},
        {label:'Non-Taggd (FY24-25)',data:pNonTD,  backgroundColor:C.blue+'33'},
      ], {legend:true, dataLabels:true, yUnit:'count'});
    } else {
      mkStackedJoinersBar('ch-hiring-monthly', selLabs, taggdD, nonTD);
    }
  }

  if (el('ch-hiring-fycmp')) {
    // FY comparison: find last joiner index independently of last revenue index
    function lastJoinerIdx(arr) {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i] !== null && arr[i] !== undefined && arr[i] > 0) return i;
      }
      return 0;
    }
    const lastT25 = lastJoinerIdx(fd25.monthly.taggd);
    const lastT24 = lastJoinerIdx(fd24.monthly.taggd);
    // Preserve null values so months with missing data show as line gaps, not zero dips
    const safeArr = arr => arr.map(v => (v === undefined ? null : v));
    // Respect selected indices: filter data to selected months only
    const fycmpTaggd25 = idxs.map(i => i <= lastT25 ? (safeArr(fd25.monthly.taggd)[i]) : null);
    const fycmpTaggd24 = idxs.map(i => i <= lastT24 ? (safeArr(fd24.monthly.taggd)[i]) : null);
    mkLine('ch-hiring-fycmp', selLabs, [
      lineDs('FY25-26 Taggd', fycmpTaggd25, C.orange, true),
      lineDs('FY24-25 Taggd', fycmpTaggd24, C.blue),
    ], {showLegend:true, dataLabels:true, yUnit:'count'});
  }

  if (el('ch-src-mix')) {
    // Use selected indices to respect filter (quarter/month selection)
    const t = idxs.reduce((s,i)=>s+(m.taggd[i]||0),0);
    const n = idxs.reduce((s,i)=>s+(m.nonT[i]||0),0);
    mkDoughnut('ch-src-mix',['Taggd','Non-Taggd'],[t,n],[C.orange,C.blue]);
  }

  if (el('ch-hc-trend')) {
    const curLast = getLastActualIdx(STATE.fy);
    // Respect selected indices: filter to selected months only
    const hcOvSlice   = idxs.map(i => i <= curLast && (m.hcOverall[i]  || 0) > 0 ? m.hcOverall[i]  : null);
    const hcWL1Slice  = idxs.map(i => i <= curLast && (m.hcWL1[i]      || 0) > 0 ? m.hcWL1[i]      : null);
    const hcApprSlice = idxs.map(i => i <= curLast && (m.hcApproved[i] || 0) > 0 ? m.hcApproved[i] : null);
    const hcTrendDs = [
      lineDs('Overall HC',  hcOvSlice,   C.orange, true),
      lineDs('WL1 HC',      hcWL1Slice,  C.blue),
      lineDs('Approved HC', hcApprSlice, C.green),
    ];
    if (STATE.compare) {
      const pfdHC = fd === fd25 ? fd24 : fd25;
      const pLastHC = fd === fd25 ? last24 : last25;
      const pHcOvSlice = idxs.map(i => i <= pLastHC && (pfdHC.monthly.hcOverall[i] || 0) > 0 ? pfdHC.monthly.hcOverall[i] : null);
      hcTrendDs.push(lineDs('FY24-25 Overall HC', pHcOvSlice, C.orange, false, 'dash'));
    }
    mkLine('ch-hc-trend', selLabs, hcTrendDs, {yUnit:'count', showLegend:true, dataLabels:true});
  }

  // ── Cashflow charts ──────────────────────────────────────
  if (el('ch-coll-monthly')) {
    const curLast = getLastActualIdx(STATE.fy);
    const cashDs = [
      {label:'Actual', data:cutAtNz(m.collA.map(v=>v/100), curLast), backgroundColor:C.orange},
      {label:'Target', data:cutAtNz(m.collT.map(v=>v/100), curLast), backgroundColor:C.gray+'88'},
    ];
    if (STATE.compare) {
      const pfdCash  = fd === fd25 ? fd24 : fd25;
      const pLastCash = fd === fd25 ? last24 : last25;
      cashDs.push({label:'FY24-25 Actual', data:cutAtNz(pfdCash.monthly.collA.map(v=>v/100), pLastCash), backgroundColor:C.blue+'55'});
    }
    mkBar('ch-coll-monthly', labs, cashDs, {yLabel:'₹ Cr', legend:true, dataLabels:true});
  }

  if (el('ch-ub-bd-monthly')) {
    const curLast = getLastActualIdx(STATE.fy);
    const ubBdDs = [
      {label:'Unbilled', data:cutAtNz(m.ub.map(v=>v/100), curLast), backgroundColor:C.yellow},
      {label:'Bad Debt', data:cutAtNz(m.bd.map(v=>v/100), curLast), backgroundColor:C.red+'88'},
    ];
    if (STATE.compare) {
      const pfdUB = fd === fd25 ? fd24 : fd25;
      const pLastUB = fd === fd25 ? last24 : last25;
      ubBdDs.push({label:'Unbilled FY24-25', data:cutAtNz(pfdUB.monthly.ub.map(v=>v/100), pLastUB), backgroundColor:C.blue+'44'});
      ubBdDs.push({label:'Bad Debt FY24-25', data:cutAtNz(pfdUB.monthly.bd.map(v=>v/100), pLastUB), backgroundColor:C.blue+'22'});
    }
    mkBar('ch-ub-bd-monthly', labs, ubBdDs, {stacked:false, yLabel:'₹ Cr', legend:true, dataLabels:true});
  }

  if (el('ch-coll-att')) {
    const curLast = getLastActualIdx(STATE.fy);
    const att = m.collA.map((a,i) => m.collT[i]>0 && a>0 ? a/m.collT[i]*100 : null);
    mkLine('ch-coll-att', labs, [lineDs('Attainment %', cutAt(att, curLast), C.orange, true)], {yUnit:'%', showLegend:false, dataLabels:true});
  }

  if (el('ch-rev-adj-monthly')) {
    const curLast = getLastActualIdx(STATE.fy);
    const revAdjArr = fd.monthly.revAdj || new Array(12).fill(0);
    const raDs = [
      {label:'Rev Adj', data:revAdjArr.map((v,i) => i<=curLast && v>0 ? v/100 : null), backgroundColor:C.green+'BB'},
    ];
    if (STATE.compare) {
      const pfdRA = fd === fd25 ? fd24 : fd25;
      const pLastRA = fd === fd25 ? last24 : last25;
      const pRevAdjArr = pfdRA.monthly.revAdj || new Array(12).fill(0);
      raDs.push({label:'Rev Adj FY24-25', data:pRevAdjArr.map((v,i) => i<=pLastRA && v>0 ? v/100 : null), backgroundColor:C.blue+'55'});
    }
    mkBar('ch-rev-adj-monthly', labs, raDs, {yLabel:'₹ Cr', legend:true, dataLabels:true});
  }
}

// ═══════════════════════════════════════════════════════════
// CHART PRIMITIVE HELPERS
// ═══════════════════════════════════════════════════════════
function el(id) { return document.getElementById(id); }

function lineDs(label, data, color, fill=false, style='') {
  return {
    label, data,
    fill: fill ? {target:'origin', above:color+'22'} : false,
    borderColor: color,
    backgroundColor: fill ? color+'22' : 'transparent',
    pointBackgroundColor: data.map(v => v !== null ? color : 'transparent'),
    pointRadius: data.map(v => v !== null ? 3 : 0),
    pointHoverRadius: 6,
    borderWidth: 2.5,
    borderDash: style==='dash' ? [5,4] : [],
    tension: 0.35,
    spanGaps: false,
  };
}

// ── Data label formatter helpers ─────────────────────────────
function dlFormatter_Cr(value) {
  if (value === null || value === undefined || value === 0) return '';
  return Math.abs(value) < 10 ? value.toFixed(1) : Math.round(value);
}

// ── STACKED JOINERS BAR (total label on top) ─────────────────
// Renders Taggd + Non-Taggd stacked bars with the SUM shown above each bar
// instead of separate labels inside each segment (which are unreadable).
function mkStackedJoinersBar(id, labels, taggdData, nonTData) {
  const ctx = el(id); if (!ctx) return;
  if (typeof Chart === 'undefined') return;
  // Destroy any existing chart on this canvas to prevent Chart.js double-render
  if (CHARTS[id]) { try { CHARTS[id].destroy(); } catch(e){} delete CHARTS[id]; }
  // Ensure labels are always strings to prevent numeric scale auto-detection
  const safeLabels = (labels || []).map(l => String(l));
  // Calculate totals per month for top-of-bar label
  const totals = safeLabels.map((_, i) => {
    const t = taggdData[i], n = nonTData[i];
    return (t !== null && n !== null) ? t + n : (t !== null ? t : (n !== null ? n : null));
  });

  CHARTS[id] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: safeLabels,
      datasets: [
        {
          label: 'Taggd',
          data: taggdData,
          backgroundColor: C.orange,
          datalabels: {
            // Show individual Taggd count INSIDE bottom segment (only if segment is tall enough)
            display: (ctx2) => {
              const v = ctx2.dataset.data[ctx2.dataIndex];
              return v !== null && v > 100;
            },
            anchor: 'center', align: 'center',
            font: { size: 9, weight: '600' }, color: '#fff',
            formatter: v => v !== null ? Math.round(v).toLocaleString('en-IN') : '',
          },
        },
        {
          label: 'Non-Taggd',
          data: nonTData,
          backgroundColor: C.blue + '88',
          datalabels: {
            // Show TOTAL on top of the Non-Taggd (topmost) segment
            display: (ctx2) => {
              const i = ctx2.dataIndex;
              const t = totals[i];
              return t !== null && t > 0;
            },
            anchor: 'end', align: 'top', offset: 4,
            font: { size: 10, weight: '700' }, color: '#374151',
            formatter: (v, ctx2) => {
              const tot = totals[ctx2.dataIndex];
              return tot !== null ? Math.round(tot).toLocaleString('en-IN') : '';
            },
          },
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top', labels: { boxWidth: 12, usePointStyle: true, font: { size: 11 } } },
        datalabels: {}, // overridden per-dataset above
        tooltip: {
          callbacks: {
            label: cb => {
              const v = cb.parsed.y;
              if (v === null || v === undefined) return null;
              const tot = totals[cb.dataIndex];
              const pct = tot > 0 ? (v / tot * 100).toFixed(1) : '—';
              return ` ${cb.dataset.label}: ${Math.round(v).toLocaleString('en-IN')} (${pct}%)`;
            },
            afterBody: (items) => {
              const i = items[0]?.dataIndex;
              const tot = totals[i];
              return tot !== null ? [`Total: ${Math.round(tot).toLocaleString('en-IN')}`] : [];
            },
          },
        },
      },
      layout: { padding: { top: 28 } },
      scales: {
        x: { type: 'category', stacked: true, grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
        y: { stacked: true, beginAtZero: true, ticks: { callback: v => Math.round(v).toLocaleString('en-IN'), font: { size: 10 } }, grid: { color: '#F0F2F5' } },
      },
    },
  });
}

function dlFormatter_Pct(value) {
  if (value === null || value === undefined || value === 0) return '';
  return value.toFixed(1) + '%';
}

function dlFormatter_Count(value) {
  if (value === null || value === undefined || value === 0) return '';
  return Math.round(value).toLocaleString('en-IN');
}

// ── LINE CHART ───────────────────────────────────────────────
function mkLine(id, labels, datasets, opts={}) {
  const ctx = el(id); if (!ctx) return;
  if (typeof Chart === 'undefined') return;
  // Destroy any existing chart on this canvas to prevent Chart.js double-render
  if (CHARTS[id]) { try { CHARTS[id].destroy(); } catch(e){} delete CHARTS[id]; }
  const showDL = opts.dataLabels !== false; // default ON
  // Ensure labels are always strings to prevent numeric scale auto-detection
  const safeLabels = (labels || []).map(l => String(l));

  // For each dataset, only show label on the LAST non-null point to avoid clutter
  const dlConfigPerDs = datasets.map(ds => ({
    display: (ctx2) => {
      if (!showDL) return false;
      const v = ds.data[ctx2.dataIndex];
      if (v === null || v === undefined) return false;
      // Show on all actual points but with smart anchor
      return true;
    },
    align: 'top',
    anchor: 'end',
    offset: 4,
    font: { size: 9, weight: '600' },
    color: ds.borderColor || '#374151',
    formatter: (value) => {
      if (value === null || value === undefined) return '';
      if (opts.yUnit === '%')     return value.toFixed(1) + '%';
      if (opts.yUnit === 'count') return Math.round(value).toLocaleString('en-IN');
      // Revenue Cr data label — show without ₹ prefix for cleaner look
      const absV = Math.abs(value);
      if (absV >= 10) return Math.round(value).toFixed(0);
      return value.toFixed(1);
    },
  }));

  CHARTS[id] = new Chart(ctx, {
    type: 'line',
    data: { labels: safeLabels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: !!opts.showLegend, position:'top', labels:{ boxWidth:12, usePointStyle:true, font:{size:11} } },
        datalabels: showDL ? {
          display: (ctx2) => {
            const v = ctx2.dataset.data[ctx2.dataIndex];
            return v !== null && v !== undefined;
          },
          align: 'top',
          anchor: 'end',
          offset: 4,
          font: { size: 9, weight: '600' },
          color: (ctx2) => ctx2.dataset.borderColor || '#374151',
          formatter: (value) => {
            if (value === null || value === undefined) return null;
            if (opts.yUnit === '%')     return value.toFixed(1) + '%';
            if (opts.yUnit === 'count') return Math.round(value).toLocaleString('en-IN');
            // Revenue Cr data label
            const absV = Math.abs(value);
            if (absV >= 10) return Math.round(value).toFixed(0);
            return value.toFixed(1);
          },
        } : { display: false },
        tooltip: {
          callbacks: {
            label: cb => {
              const v = cb.parsed.y;
              if (v === null || v === undefined) return null;
              if (opts.yUnit === '%')     return ` ${cb.dataset.label}: ${v.toFixed(1)}%`;
              if (opts.yUnit === 'count') return ` ${cb.dataset.label}: ${Math.round(v).toLocaleString('en-IN')}`;
              return ` ${cb.dataset.label}: ₹${v.toFixed(2)} Cr`;
            },
          },
        },
      },
      layout: { padding: { top: 20 } },
      scales: {
        x: { type: 'category', grid:{display:false}, ticks:{font:{size:10}, maxRotation:45} },
        y: {
          type: 'linear',
          beginAtZero: true,
          ticks: {
            callback: v => {
              if (opts.yUnit === '%')     return v.toFixed(0) + '%';
              if (opts.yUnit === 'count') return Math.round(v).toLocaleString('en-IN');
              // Revenue: show as X Cr format
              const absV = Math.abs(v);
              if (absV === 0) return '0';
              if (absV >= 1) return v.toFixed(0) + ' Cr';
              return v.toFixed(1) + ' Cr';
            },
            font: { size:10 },
          },
          grid: { color:'#F0F2F5' },
        },
      },
    },
  });
}

// ── BAR CHART ────────────────────────────────────────────────
function mkBar(id, labels, datasets, opts={}) {
  const ctx = el(id); if (!ctx) return;
  if (typeof Chart === 'undefined') return;
  // Destroy any existing chart on this canvas to prevent Chart.js double-render
  if (CHARTS[id]) { try { CHARTS[id].destroy(); } catch(e){} delete CHARTS[id]; }
  const showDL = opts.dataLabels !== false; // default ON
  const isHoriz = opts.indexAxis === 'y';
  // Ensure labels are always strings to prevent Chart.js numeric scale auto-detection
  const safeLabels = (labels || []).map(l => String(l));
  const isCount = opts.yUnit === 'count';   // joiner/headcount charts

  // Formatter for data labels on bars
  const dlFormatter = (v) => {
    if (v === null || v === undefined || v === 0) return '';
    if (isCount) return Math.round(v).toLocaleString('en-IN');
    // Stacked joiner charts (no yLabel = count data)
    if (opts.stacked && !opts.yLabel) return Math.round(v).toLocaleString('en-IN');
    // Revenue/currency values (Crore)
    const absV = Math.abs(v);
    if (absV < 0.01) return '';
    if (absV < 1) return v.toFixed(2);
    return absV < 10 ? v.toFixed(1) : Math.round(v);
  };

  // Y-axis tick callback for vertical bars (value axis)
  const yTickCb = (v) => {
    if (isCount) return Math.round(v).toLocaleString('en-IN');
    if (opts.stacked && !opts.yLabel) return Math.round(v).toLocaleString('en-IN');
    // Revenue/currency: show as "X Cr"
    const absV = Math.abs(v);
    if (absV === 0) return '0';
    if (absV >= 1) return v.toFixed(0) + ' Cr';
    return v.toFixed(1) + ' Cr';
  };

  // X-axis tick callback for horizontal bars (value axis)
  const xHorizTickCb = (v) => {
    if (isCount) return Math.round(v).toLocaleString('en-IN');
    return v.toFixed(1) + ' Cr';
  };

  // Tooltip label
  const tooltipLabel = (cb) => {
    const v = cb.parsed[isHoriz ? 'x' : 'y'];
    if (v === null || v === undefined) return null;
    if (isCount) return ` ${cb.dataset.label}: ${Math.round(v).toLocaleString('en-IN')}`;
    if (opts.stacked && !opts.yLabel) return ` ${cb.dataset.label}: ${Math.round(v).toLocaleString('en-IN')}`;
    return ` ${cb.dataset.label}: ₹${v.toFixed(3)} Cr`;
  };

  CHARTS[id] = new Chart(ctx, {
    type: 'bar',
    data: { labels: safeLabels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: opts.indexAxis || 'x',
      plugins: {
        legend: { display: !!opts.legend || datasets.length > 1, position:'top', labels:{ boxWidth:12, usePointStyle:true, font:{size:11} } },
        datalabels: showDL ? {
          display: (ctx2) => {
            const v = ctx2.dataset.data[ctx2.dataIndex];
            return v !== null && v !== undefined && v !== 0;
          },
          anchor: isHoriz ? 'end' : 'end',
          align:  isHoriz ? 'right' : 'top',
          offset: 2,
          font: { size: 9, weight: '600' },
          color: '#374151',
          formatter: dlFormatter,
        } : { display: false },
        tooltip: {
          callbacks: { label: tooltipLabel },
        },
      },
      layout: { padding: { top: showDL && !isHoriz ? 24 : 8, right: isHoriz ? 60 : 8, left: isHoriz ? 4 : 8, bottom: 8 } },
      scales: {
        x: {
          type: isHoriz ? 'linear' : 'category',
          stacked: !!opts.stacked,
          grid: { display: isHoriz },
          beginAtZero: isHoriz ? true : undefined,
          ticks: isHoriz
            ? { callback: xHorizTickCb, font: { size: 10 }, maxRotation: 0 }
            : { font: { size: 10 }, maxRotation: 45, autoSkip: true },
        },
        y: {
          type: isHoriz ? 'category' : 'linear',
          stacked: !!opts.stacked,
          beginAtZero: isHoriz ? undefined : true,
          ticks: isHoriz
            ? { font: { size: 11 }, autoSkip: false }
            : { callback: yTickCb, font: { size: 10 }, autoSkip: false },
          grid: { color: isHoriz ? 'transparent' : '#F0F2F5' },
        },
      },
    },
  });
}

// ── DOUGHNUT CHART ───────────────────────────────────────────
function mkDoughnut(id, labels, data, colors) {
  const ctx = el(id); if (!ctx) return;
  if (typeof Chart === 'undefined') return;
  // Destroy any existing chart on this canvas to prevent Chart.js double-render
  if (CHARTS[id]) { try { CHARTS[id].destroy(); } catch(e){} delete CHARTS[id]; }
  CHARTS[id] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets:[{ data, backgroundColor:colors, borderWidth:2, borderColor:'#fff' }] },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:'65%',
      plugins: {
        legend:{display:true, position:'bottom', labels:{boxWidth:12,usePointStyle:true,font:{size:11}}},
        datalabels:{
          display: true,
          formatter:(v,ctx2)=>{
            const t=ctx2.chart.data.datasets[0].data.reduce((s,x)=>s+(x||0),0);
            return t>0?(v/t*100).toFixed(1)+'%':'';
          },
          color:'#fff', font:{weight:'700',size:12},
        },
        tooltip:{callbacks:{label:cb=>{
          const v=cb.parsed;
          const t=cb.chart.data.datasets[0].data.reduce((s,x)=>s+(x||0),0);
          return ` ${cb.label}: ${Math.round(v).toLocaleString('en-IN')} (${(v/t*100).toFixed(1)}%)`;
        }}},
      },
    },
  });
}

// ── UI Helpers ───────────────────────────────────────────────
function toggleIns(hd) {
  hd.classList.toggle('open');
  hd.nextElementSibling.classList.toggle('open');
}
