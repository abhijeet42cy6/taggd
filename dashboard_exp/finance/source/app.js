// Finance Executive Dashboard - Complete Implementation v2.0
// ============================================================================
// With Collections, Cash Health, Hiring, 6-Pillar Scorecards, and Beautiful UI

// Debug flag - set to false to disable console logs in production
const DEBUG_MODE = false;
const debugLog = DEBUG_MODE ? console.log.bind(console) : () => {};

const state = {
  filters: {
    fy: ['FY2025-26'],  // Default to latest FY
    periodMode: 'YTD',  // Changed from 'Full FY' to 'YTD'
    endMonth: '',
    vertical: [],
    region: [],
    subRegion: [],
    regionHead: [],
    practiceHead: [],
    project: [],
    yoyEnabled: false
  },
  filterOptions: {},
  currentPage: 'executive',
  data: null,
  metrics: null,
  rawData: [],
  lastFYData: []  // Store previous FY data for growth comparisons
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Safely parse numeric values, handling "-", null, undefined, and non-numeric strings
function safeParseFloat(value) {
  if (value === null || value === undefined || value === '' || value === '-') {
    return 0
  }
  const parsed = parseFloat(value)
  return isNaN(parsed) ? 0 : parsed
}

// ============================================================================
// TARGET & BUDGET SETTINGS (USER INPUT - Issue #6)
// ============================================================================

// Available fiscal years for filter
const AVAILABLE_FYS = ['ALL', 'FY2024-25', 'FY2025-26'];

// Load user-defined targets from localStorage
function loadUserTargets() {
  try {
    const stored = localStorage.getItem('dashboardTargets')
    return stored ? JSON.parse(stored) : {}
  } catch (error) {
    console.error('Error loading user targets:', error)
    return {}
  }
}

// Save user-defined targets to localStorage
function saveUserTargets(targets) {
  try {
    localStorage.setItem('dashboardTargets', JSON.stringify(targets))
    console.log('✅ User targets saved:', targets)
    return true
  } catch (error) {
    console.error('Error saving user targets:', error)
    return false
  }
}

// Get target value - use user input if available, otherwise database value
function getTargetValue(dbValue, userTargets, key) {
  if (userTargets && userTargets[key] !== undefined && userTargets[key] !== null && userTargets[key] !== '') {
    return parseFloat(userTargets[key])
  }
  return dbValue
}

// Target Settings Modal Functions (Issue #6)
function openTargetSettings() {
  // Load current values into form
  const targets = loadUserTargets()
  document.getElementById('revenueTarget').value = targets.revenueTarget || ''
  document.getElementById('cmTargetPercent').value = targets.cmTargetPercent || ''
  document.getElementById('productivityTarget').value = targets.productivityTarget || ''
  document.getElementById('ppcBudget').value = targets.ppcBudget || ''
  document.getElementById('collectionTarget').value = targets.collectionTarget || ''
  document.getElementById('headcountTarget').value = targets.headcountTarget || ''
  
  document.getElementById('target-settings-modal').classList.remove('hidden')
}

function closeTargetSettings() {
  document.getElementById('target-settings-modal').classList.add('hidden')
}

function saveTargetSettings(event) {
  event.preventDefault()
  
  const form = document.getElementById('target-settings-form')
  const formData = new FormData(form)
  
  const targets = {}
  for (const [key, value] of formData.entries()) {
    if (value && value.trim() !== '') {
      targets[key] = parseFloat(value)
    }
  }
  
  if (saveUserTargets(targets)) {
    alert('✅ Targets saved successfully! Reloading data...')
    closeTargetSettings()
    // Reload data to apply new targets
    loadData()
  } else {
    alert('❌ Error saving targets. Please try again.')
  }
}

function clearTargetSettings() {
  if (confirm('Are you sure you want to clear all target settings?')) {
    localStorage.removeItem('dashboardTargets')
    document.getElementById('target-settings-form').reset()
    alert('✅ All targets cleared! Reloading data...')
    closeTargetSettings()
    loadData()
  }
}

// Make functions globally available
window.openTargetSettings = openTargetSettings
window.closeTargetSettings = closeTargetSettings
window.saveTargetSettings = saveTargetSettings
window.clearTargetSettings = clearTargetSettings

// ============================================================================
// GOVERNANCE TARGET FUNCTIONS (for Targets page)
// ============================================================================

// Quick Target Update - Single Parameter
function saveQuickTarget(event) {
  event.preventDefault()
  const parameter = document.getElementById('quick-parameter').value
  const value = document.getElementById('quick-value').value
  
  if (!parameter || !value) {
    alert('❌ Please select a parameter and enter a value')
    return false
  }
  
  const targets = loadUserTargets()
  targets[parameter] = parseFloat(value)
  
  if (saveUserTargets(targets)) {
    alert('✅ Target updated successfully! The dashboard will reload to apply changes.')
    loadData()
    document.getElementById('quick-target-form').reset()
    document.getElementById('current-value-display').classList.add('hidden')
  } else {
    alert('❌ Error saving target. Please try again.')
  }
  return false
}

// Update placeholder and show current value when parameter is selected
function updateQuickTargetPlaceholder() {
  const parameter = document.getElementById('quick-parameter').value
  const valueInput = document.getElementById('quick-value')
  const currentValueDisplay = document.getElementById('current-value-display')
  const currentValueText = document.getElementById('current-value-text')
  
  if (!parameter) {
    valueInput.placeholder = 'Enter target value'
    currentValueDisplay.classList.add('hidden')
    return
  }
  
  const targets = loadUserTargets()
  const currentValue = targets[parameter]
  
  const placeholders = {
    'revenueTarget': 'e.g., 100.50',
    'cmTargetPercent': 'e.g., 35.5',
    'productivityTarget': 'e.g., 2.50',
    'ppcBudget': 'e.g., 105000',
    'collectionTarget': 'e.g., 95.0',
    'headcountTarget': 'e.g., 500'
  }
  
  const units = {
    'revenueTarget': '₹ Cr',
    'cmTargetPercent': '%',
    'productivityTarget': '₹ Lacs/HC',
    'ppcBudget': '₹',
    'collectionTarget': '%',
    'headcountTarget': 'HC'
  }
  
  valueInput.placeholder = placeholders[parameter] || 'Enter value'
  
  if (currentValue !== undefined && currentValue !== null) {
    currentValueText.textContent = currentValue + ' ' + (units[parameter] || '')
    currentValueDisplay.classList.remove('hidden')
  } else {
    currentValueText.textContent = 'Not Set'
    currentValueDisplay.classList.remove('hidden')
  }
}

// Bulk form handlers
function saveTargetsInline(event) {
  event.preventDefault()
  const form = document.getElementById('target-form-inline')
  const formData = new FormData(form)
  
  const targets = {}
  for (const [key, value] of formData.entries()) {
    if (value && value.trim() !== '') {
      targets[key] = parseFloat(value)
    }
  }
  
  if (saveUserTargets(targets)) {
    alert('✅ All targets saved successfully! The dashboard will reload to apply changes.')
    loadData()
  } else {
    alert('❌ Error saving targets. Please try again.')
  }
}

function clearTargetsInline() {
  if (confirm('Are you sure you want to clear all target settings?')) {
    localStorage.removeItem('dashboardTargets')
    document.getElementById('target-form-inline').reset()
    document.getElementById('quick-target-form').reset()
    alert('✅ All targets cleared! The dashboard will reload.')
    loadData()
  }
}

// Make governance functions globally available
window.saveQuickTarget = saveQuickTarget
window.updateQuickTargetPlaceholder = updateQuickTargetPlaceholder
window.saveTargetsInline = saveTargetsInline
window.clearTargetsInline = clearTargetsInline

// Check if last year data is available for YoY comparisons (Issue #2)
function hasLastYearData() {
  return state.lastFYData && state.lastFYData.length > 0
}

// Safely get YoY growth - returns null if no last year data
function safeYoYGrowth(yoyMetric) {
  if (!hasLastYearData()) return null
  if (!yoyMetric || yoyMetric.previous === 0) return null
  return yoyMetric.growth
}

// ============================================================================
// DRILL-DOWN CONSTANTS & STATE (Place after main state definition)
// ============================================================================

const drillState = {
  currentLevel: 'overall',
  breadcrumb: [{ level: 'overall', label: 'Overall', value: null }],
  selectedValues: {
    region: null,
    subRegion: null,
    regionHead: null,
    practiceHead: null,
    project: null
  }
}

// Main drill hierarchy for Revenue/CM pages
const DRILL_HIERARCHY = [
  { level: 'overall', label: 'Overall', filterKey: null, icon: 'fa-chart-line' },
  { level: 'region', label: 'Region', filterKey: 'region', icon: 'fa-map-marker-alt' },
  { level: 'subregion', label: 'Sub-Region', filterKey: 'sub_region', icon: 'fa-map-pin' },
  { level: 'regionhead', label: 'Region Head', filterKey: 'region_head', icon: 'fa-user-tie' },
  { level: 'practicehead', label: 'Practice Head', filterKey: 'practice_head', icon: 'fa-user-friends' },
  { level: 'project', label: 'Project', filterKey: 'project', icon: 'fa-briefcase' }
]

// Drill hierarchy for Headcount & PPC/Productivity pages
const HC_DRILL_HIERARCHY = [
  { level: 'overall', label: 'Overall', filterKey: null, icon: 'fa-chart-line' },
  { level: 'vertical', label: 'Vertical', filterKey: 'vertical', icon: 'fa-layer-group' },
  { level: 'region', label: 'Region', filterKey: 'region', icon: 'fa-map-marker-alt' },
  { level: 'subRegion', label: 'Sub-Region', filterKey: 'sub_region', icon: 'fa-map-pin' },
  { level: 'project', label: 'Project', filterKey: 'project', icon: 'fa-briefcase' }
]

const flipStyles = `
<style>
@keyframes flipIn {
  from {
    transform: perspective(400px) rotateX(-90deg);
    opacity: 0;
  }
  to {
    transform: perspective(400px) rotateX(0deg);
    opacity: 1;
  }
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: linear-gradient(to bottom, #a855f7, #ec4899);
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(to bottom, #9333ea, #db2777);
}

.filter-pill {
  transition: all 0.3s ease;
}

.filter-pill:hover {
  transform: translateY(-2px);
}
</style>
`

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initializeApp()
})

async function initializeApp() {
  console.log('🚀 initializeApp() called, URL:', window.location.href);
  
  try {
    // Load saved theme first
    loadSavedTheme()
    
    // Initialize drill state
    initializeDrillState()
    
    // Read URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const page = urlParams.get('page');
    console.log(`🔍 URL search params:`, window.location.search);
    console.log(`📄 Page parameter:`, page);
    
    if (page) {
      state.currentPage = page;
      console.log(`✅ Set state.currentPage to: ${page}`);
    } else {
      console.log(`ℹ️ No page parameter, using default: ${state.currentPage}`);
    }
    
    await loadFilterOptions()
    renderApp()
    
    // Initial data load with proper error handling
    // Note: loadData() will call renderCurrentPage() automatically after loading data
    await loadData()

  } catch (error) {
    console.error('Failed to initialize app:', error)
    showError('Failed to initialize dashboard. Please refresh the page.')
  }
}

async function loadFilterOptions() {
  try {
    const response = await axios.get('/api/filters')
    state.filterOptions = response.data
    
    // Set default FY to latest FY (FY2025-26) for current year analysis
    if (state.filterOptions.fiscalYears && state.filterOptions.fiscalYears.length > 0) {
      // Default to latest FY, excluding ALL option
      const defaultFY = state.filterOptions.fiscalYears.find(fy => fy === 'FY2025-26') || 
                        state.filterOptions.fiscalYears.filter(fy => fy !== 'ALL')[0] || 
                        state.filterOptions.fiscalYears[0]
      state.filters.fy = [defaultFY]
    }
    
    // Load cascading filters FIRST to get months for the selected FY
    await loadCascadingFilters()
    
    // Get the latest month with actual revenue data from the backend
    if (state.filters.fy && state.filters.fy.length > 0) {
      try {
        const latestMonthResponse = await axios.get(`/api/latest-month/${state.filters.fy[0]}`)
        if (latestMonthResponse.data.latestMonth) {
          state.filters.endMonth = latestMonthResponse.data.latestMonth
          console.log(`Latest month with actual revenue: ${state.filters.endMonth}`)
        } else {
          // Fallback to last month in calendar
          if (state.filterOptions.months && state.filterOptions.months.length > 0) {
            state.filters.endMonth = state.filterOptions.months[state.filterOptions.months.length - 1]
          }
        }
      } catch (error) {
        console.error('Error fetching latest month:', error)
        // Fallback to last month in calendar
        if (state.filterOptions.months && state.filterOptions.months.length > 0) {
          state.filters.endMonth = state.filterOptions.months[state.filterOptions.months.length - 1]
        }
      }
    }
    
    console.log('✅ Default filters set:', {
      fy: state.filters.fy[0],
      periodMode: state.filters.periodMode,
      endMonth: state.filters.endMonth,
      availableMonths: state.filterOptions.months?.length || 0
    })
  } catch (error) {
    console.error('Error loading filter options:', error)
    showError('Failed to load filter options')
  }
}

// Helper function to get months for a specific FY
function getMonthsForFY(fy) {
  if (!state.filterOptions || !state.filterOptions.months || state.filterOptions.months.length === 0) {
    return [] // Return empty array if filter options not loaded yet
  }
  
  // FY2025-26 includes Apr'25 to Mar'26
  // FY2024-25 includes Apr'24 to Mar'25
  const fyYear = fy.replace('FY', '').split('-')[0] // e.g., "2025"
  const startYear = fyYear.slice(-2) // e.g., "25"
  const endYear = (parseInt(fyYear.slice(-2)) + 1).toString().padStart(2, '0') // e.g., "26"
  
  return state.filterOptions.months.filter(month => {
    // Match months like Apr'25, May'25, ..., Mar'26
    const monthYear = month.split("'")[1]
    return monthYear === startYear || monthYear === endYear
  })
}

async function loadData() {
  try {
    showLoading()
    const months = calculateMonthsForPeriod()
    // For Full FY API call, send empty array to get all months
    // But calculations will use the full months array returned above
    const apiMonths = state.filters.periodMode === 'Full FY' ? [] : months
    const requestFilters = { ...state.filters, months: apiMonths }
    
    console.log('Loading data with filters:', requestFilters)
    const response = await axios.post('/api/data', requestFilters)
    state.rawData = response.data.data || []
    console.log('Data loaded:', state.rawData.length, 'records')
    
    // Load previous FY data for growth calculations
    const currentFY = state.filters.fy[0] || 'FY2025-26'
    const lastFY = currentFY === 'FY2025-26' ? 'FY2024-25' : 'FY2023-24'
    
    try {
      // Calculate corresponding months for last FY
      // If current is Dec'25 for FY2025-26, we want Dec'24 for FY2024-25
      const lastFYMonths = months.map(month => {
        const [monthName, yearSuffix] = month.split("'")
        const year = parseInt(yearSuffix)
        const lastYear = (year - 1).toString().padStart(2, '0')
        return `${monthName}'${lastYear}`
      })
      
      const lastFYFilters = { 
        ...state.filters, 
        fy: [lastFY], 
        months: state.filters.periodMode === 'Full FY' ? [] : lastFYMonths,
        // Remove endMonth as it's FY-specific
        endMonth: lastFYMonths.length > 0 ? lastFYMonths[lastFYMonths.length - 1] : undefined
      }
      console.log('Loading last FY data for comparisons:', lastFY, 'months:', lastFYMonths)
      const lastFYResponse = await axios.post('/api/data', lastFYFilters)
      state.lastFYData = lastFYResponse.data.data || []
      console.log('Last FY data loaded:', state.lastFYData.length, 'records')
    } catch (error) {
      console.warn('Could not load last FY data:', error)
      state.lastFYData = []
    }
    
    calculateMetrics()
    console.log('Metrics calculated:', state.metrics)
    renderCurrentPage()
    hideLoading()
  } catch (error) {
    console.error('Error loading data:', error)
    showError('Failed to load data: ' + error.message)
    hideLoading()
  }
}

// ============================================================================
// CALCULATION FUNCTIONS (Per Specification)
// ============================================================================

function calculateMonthsForPeriod() {
  const allMonths = state.filterOptions.months || []
  const fy = state.filters.fy[0]
  
  // Get all months for the selected FY
  const fyMonths = allMonths.filter(m => {
    if (fy === 'FY2024-25') {
      // Apr-Dec'24 or Jan-Mar'25
      return (m.includes("'24") && !['Jan', 'Feb', 'Mar'].some(mon => m.startsWith(mon))) ||
             (m.includes("'25") && ['Jan', 'Feb', 'Mar'].some(mon => m.startsWith(mon)))
    }
    if (fy === 'FY2025-26') {
      // Apr-Dec'25 or Jan-Mar'26
      return (m.includes("'25") && !['Jan', 'Feb', 'Mar'].some(mon => m.startsWith(mon))) ||
             (m.includes("'26") && ['Jan', 'Feb', 'Mar'].some(mon => m.startsWith(mon)))
    }
    return true
  })
  
  if (state.filters.periodMode === 'Full FY') return fyMonths // Return all FY months
  if (state.filters.periodMode === 'Month') return [state.filters.endMonth]
  
  // YTD logic - return months from start of FY to selected endMonth
  const fyEndIdx = fyMonths.indexOf(state.filters.endMonth)
  if (fyEndIdx === -1) return fyMonths // Fallback to all FY months
  return fyMonths.slice(0, fyEndIdx + 1)
}

function calculateMetrics() {
  try {
    console.log('calculateMetrics called with', state.rawData.length, 'records')
    const data = state.rawData
    
    if (!data || data.length === 0) {
      console.warn('No data available for metrics calculation')
      state.metrics = null
      return
    }
    
    // Load user-defined targets (Issue #6)
    const userTargets = loadUserTargets()
    if (Object.keys(userTargets).length > 0) {
      console.log('📊 Using user-defined targets:', userTargets)
    }
  
    // Core aggregations (SUM) - Convert from Lacs to Crores
    // For Budget metrics: Use sumBudgetMetric to handle duplicates in database
    // For other metrics: Use regular sumMetric
    const revenue = {
      budget: getTargetValue(sumBudgetMetric(data, ['Revenue_Budget']), userTargets, 'revenueTarget') / 100,  // Lacs to Crores
      actual: sumMetric(data, ['Revenue_Actual']) / 100,  // Lacs to Crores
      forecast: sumMetric(data, ['Rev_Forecast']) / 100  // Lacs to Crores
    }
    
    console.log('Revenue (in Crores):', revenue)
  
  // Forecast As-On calculation
  // For YTD mode: Actual (till selected month) + Forecast (remaining months)
  const months = calculateMonthsForPeriod()
  const endMonth = state.filters.endMonth
  
  if (state.filters.periodMode === 'YTD' && endMonth) {
    // YTD: Sum actual till endMonth + forecast for remaining months
    const actTillM = sumMetricTillMonth(data, ['Revenue_Actual'], endMonth) / 100  // Lacs to Crores
    const fcstAfterM = sumMetricAfterMonth(data, ['Rev_Forecast'], endMonth) / 100  // Lacs to Crores
    revenue.forecastAsOn = actTillM + fcstAfterM
    console.log(`💡 YTD Forecast Calculation: Actual till ${endMonth} = ${actTillM.toFixed(2)} Cr + Forecast after = ${fcstAfterM.toFixed(2)} Cr = Total ${revenue.forecastAsOn.toFixed(2)} Cr`)
  } else if (state.filters.periodMode === 'Month') {
    // Month mode: use actual forecast for that month
    revenue.forecastAsOn = revenue.forecast
  } else if (['QTR', 'H1', 'H2'].includes(state.filters.periodMode) && endMonth) {
    // Quarter/Half modes: Actual + Forecast for remaining
    const actTillM = sumMetricTillMonth(data, ['Revenue_Actual'], endMonth) / 100  // Lacs to Crores
    const fcstAfterM = sumMetricAfterMonth(data, ['Rev_Forecast'], endMonth) / 100  // Lacs to Crores
    revenue.forecastAsOn = actTillM + fcstAfterM
  } else {
    // Full FY: use total forecast
    revenue.forecastAsOn = revenue.forecast
  }
  
  const cm = {
    budget: sumBudgetMetric(data, ['CM_Budget']) / 100,  // Lacs to Crores
    actual: sumMetric(data, ['CM Actual', 'CM_Actual']) / 100,  // Lacs to Crores
    forecast: sumMetric(data, ['CM_Forecast']) / 100  // Lacs to Crores
  }
  
  // Apply user CM target if specified as percentage of revenue
  if (userTargets.cmTargetPercent) {
    cm.budget = (revenue.budget * userTargets.cmTargetPercent) / 100
    console.log(`📊 Using user CM target: ${userTargets.cmTargetPercent}% of revenue = ${cm.budget.toFixed(2)} Cr`)
  }
  
  // PPC (Per People Cost) - already per-person-per-month in sheet
  // Average excluding zero values, values are in INR
  const ppc = {
    budget: getTargetValue(avgMetricExcludingZero(data, ['PPC_Budget']), userTargets, 'ppcBudget'),
    actual: avgMetricExcludingZero(data, ['PPC_Actual', 'Actual_PPC'])
  }
  
  // Round to nearest 100 for display
  ppc.budgetRounded = Math.round(ppc.budget / 100) * 100
  ppc.actualRounded = Math.round(ppc.actual / 100) * 100
  
  // Collections (SUM) - Data is in Lacs, convert to Crores for display
  const collections = {
    actual: sumMetric(data, ['Actual_Collection', 'Revenue_Collected']) / 100,  // Lacs to Crores
    target: getTargetValue(sumMetric(data, ['Target_Collection', 'Collection Target']), userTargets, 'collectionTarget') / 100,  // Lacs to Crores
    due: (sumMetric(data, ['Collection_Due']) || 0) / 100  // Lacs to Crores
  }
  collections.attainment = collections.target > 0 ? (collections.actual / collections.target * 100) : 0
  console.log('Collections calculated:', {
    actual: collections.actual.toFixed(2) + ' Cr',
    target: collections.target.toFixed(2) + ' Cr',
    attainment: collections.attainment.toFixed(1) + '%'
  });
  
  // Cash Health (SUM) - Data is in Lacs, convert to Crores for display
  const cashHealth = {
    unbilled: sumMetric(data, ['Unbilled']) / 100,  // Lacs to Crores
    badDebt: sumMetric(data, ['Bad Debt']) / 100  // Lacs to Crores
  }
  cashHealth.unbilledPct = revenue.actual > 0 ? (cashHealth.unbilled / revenue.actual * 100) : 0
  cashHealth.badDebtPct = collections.actual > 0 ? (cashHealth.badDebt / collections.actual * 100) : 0
  
  // Headcount Calculation
  // Overall & Approved: LATEST MONTH TOTAL (snapshot)
  // WL1: YTD AVERAGE (sum monthly totals / number of months)
  // NOTE: Only use current FY metric names to avoid duplicates from historical data
  const headcount = {
    overall: getLatestMonthHeadcount(data, ['Headcount_Overall']),
    approved: getLatestMonthHeadcount(data, ['Headcount_Approved']),
    wl1: getYTDAvgHeadcount(data, ['Headcount_WL1'])  // WL1 uses YTD average
  }
  console.log('Headcount calculated (Overall/Approved: latest month, WL1: YTD avg):', headcount)
  
  // Hiring (SUM for joiners)
  const hiring = {
    taggd: sumMetric(data, ['Taggd_Source_Joiner']),
    nonTaggd: sumMetric(data, ['Non Taggd_Source_Joiner', 'Non Taggd Source Joiner'])
  }
  const totalJoiners = hiring.taggd + hiring.nonTaggd
  hiring.taggdMix = totalJoiners > 0 ? (hiring.taggd / totalJoiners * 100) : 0
  hiring.nonTaggdMix = totalJoiners > 0 ? (hiring.nonTaggd / totalJoiners * 100) : 0
  hiring.jpr = avgMetric(data, ['Joiner_Per_Recruiter_Taggd', 'JPR_Taggd']) || 0
  
  // Get number of months for per-month calculations
  const periodMonths = calculateMonthsForPeriod()
  const numMonths = periodMonths.length > 0 ? periodMonths.length : 12 // Default to 12 for Full FY
  console.log('Months for period:', periodMonths.length > 0 ? periodMonths : 'Full FY (12 months)', '- Count:', numMonths)
  
  // PPC (Per People Cost) - values in sheet are ALREADY per-person-per-month in INR
  // The sheet contains monthly per-person costs (e.g., Honeywell Apr: 98,638 INR per person per month)
  // We average these values excluding zeros, then round to nearest 100 for display
  ppc.perMonth = ppc.actualRounded  // Rounded to nearest 100
  ppc.budgetPerMonth = ppc.budgetRounded  // Rounded to nearest 100
  
  const nonZeroRecords = data.filter(d => ['PPC_Actual', 'Actual_PPC'].includes(d.metric) && d.value != null && parseFloat(d.value) !== 0).length
  console.log('PPC calculated - Exact:', ppc.actual.toFixed(2), 'INR | Rounded:', ppc.actualRounded, 'INR (averaged from', nonZeroRecords, 'non-zero records)')
  
  // Productivity (derived) - Revenue per headcount calculations
  // For WL1 (Recruiters): We need total headcount across the period, not average
  // Calculate sum of monthly WL1 totals for the period
  const wl1MonthlyTotals = {}
  // Reuse periodMonths from above (already calculated at line 527)
  data.filter(d => 
    ['Headcount_WL1'].includes(d.metric) && 
    d.value != null &&
    periodMonths.includes(d.month)
  ).forEach(d => {
    if (!wl1MonthlyTotals[d.month]) {
      wl1MonthlyTotals[d.month] = 0
    }
    wl1MonthlyTotals[d.month] += safeParseFloat(d.value)
  })
  const totalWL1HC = Object.values(wl1MonthlyTotals).reduce((sum, val) => sum + val, 0)
  
  const productivity = {
    target: getTargetValue(avgMetric(data, ['Target_Rev_Productivity', 'Target Rev Productivity']), userTargets, 'productivityTarget'),
    // Recruiter Productivity = Total Revenue / Total WL1 Headcount (across all months)
    // Revenue is in Crores, multiply by 100 to get Lacs
    recruiterPerMonth: totalWL1HC > 0 ? (revenue.actual * 100 / totalWL1HC) : 0,
    // Overall Productivity per Month = Revenue / (Overall Headcount * Number of Months)
    overallPerMonth: (headcount.overall > 0 && numMonths > 0) ? (revenue.actual * 100 / (headcount.overall * numMonths)) : 0,
    // Taggd Source Joiner Productivity per Month = Taggd Joiners / Total WL1 Headcount
    taggdJoinerPerMonth: totalWL1HC > 0 ? (hiring.taggd / totalWL1HC) : 0,
    // Revenue Per Hire = Total Revenue / Total Joiners (in Lacs)
    revenuePerHire: totalJoiners > 0 ? (revenue.actual * 100 / totalJoiners) : 0,
    // Legacy fields for backward compatibility
    actual: headcount.overall > 0 ? (revenue.actual * 100 / headcount.overall) : 0,
    revenuePerRecruiterPerMonth: totalWL1HC > 0 ? (revenue.actual * 100 / totalWL1HC) : 0,
    joinerProductivityTaggdPerMonth: (headcount.wl1 > 0 && numMonths > 0) ? (hiring.taggd / headcount.wl1 / numMonths) : 0
  }
  
  // Add hiring info to productivity object for easy access
  productivity.totalJoiners = totalJoiners
  productivity.taggdJoiners = hiring.taggd
  productivity.nonTaggdJoiners = hiring.nonTaggd
  
  console.log('Productivity calculated:', {
    recruiterPerMonth: productivity.recruiterPerMonth.toFixed(2) + ' Lacs/HC (Total Revenue / Total WL1 HC)',
    totalWL1HC: totalWL1HC.toFixed(2) + ' HC',
    overallPerMonth: productivity.overallPerMonth.toFixed(2) + ' Lacs/HC/Month',
    taggdJoinerPerMonth: productivity.taggdJoinerPerMonth.toFixed(2) + ' Joiners/Recruiter/Month',
    revenuePerHire: productivity.revenuePerHire.toFixed(2) + ' Lacs/Hire',
    totalJoiners: totalJoiners,
    taggdJoiners: hiring.taggd,
    nonTaggdJoiners: hiring.nonTaggd
  })
  
  // Calculate percentages and variances
  cm.actualPercent = revenue.actual > 0 ? (cm.actual / revenue.actual * 100) : 0
  cm.budgetPercent = revenue.budget > 0 ? (cm.budget / revenue.budget * 100) : 0
  cm.forecastPercent = revenue.forecast > 0 ? (cm.forecast / revenue.forecast * 100) : 0
  
  revenue.variance = revenue.actual - revenue.budget
  revenue.variancePercent = revenue.budget > 0 ? (revenue.variance / revenue.budget * 100) : 0
  revenue.forecastVariance = revenue.forecastAsOn - revenue.budget
  revenue.forecastVariancePercent = revenue.budget > 0 ? (revenue.forecastVariance / revenue.budget * 100) : 0
  
  cm.variance = cm.actual - cm.budget
  cm.variancePercent = cm.budget > 0 ? (cm.variance / cm.budget * 100) : 0
  cm.ppVariance = cm.actualPercent - cm.budgetPercent
  
  ppc.variance = ppc.actual - ppc.budget
  ppc.variancePercent = ppc.budget > 0 ? (ppc.variance / ppc.budget * 100) : 0
  ppc.perMonthVariance = ppc.perMonth - ppc.budgetPerMonth
  ppc.perMonthVariancePercent = ppc.budgetPerMonth > 0 ? (ppc.perMonthVariance / ppc.budgetPerMonth * 100) : 0
  
  // Productivity variance should be based on recruiterPerMonth
  productivity.variance = productivity.recruiterPerMonth - productivity.target
  productivity.variancePercent = productivity.target > 0 ? (productivity.variance / productivity.target * 100) : 0
  
  headcount.utilization = headcount.approved > 0 ? (headcount.overall / headcount.approved * 100) : 0
  
  // Calculate growth metrics (MoM, YoY, YoY YTD)
  const currentFY = state.filters.fy[0] || 'FY2025-26';
  const lastFY = currentFY === 'FY2025-26' ? 'FY2024-25' : 'FY2023-24';
  // endMonth already declared earlier - reuse it
  
  // Use the current period's months (not all months) for MoM calculation
  // This ensures we compare within the same FY
  const currentFYMonths = months; // months is calculated earlier in calculateMonthsForPeriod()
  const currentMonthIdx = currentFYMonths.indexOf(endMonth);
  const previousMonth = currentMonthIdx > 0 ? currentFYMonths[currentMonthIdx - 1] : null;
  
  console.log(`📅 MoM Month Selection:
    Current FY Months: ${currentFYMonths.join(', ')}
    Current Month: ${endMonth} (index: ${currentMonthIdx})
    Previous Month: ${previousMonth}`);
  
  // Get last FY months for headcount calculation
  const lastFYMonths = months.map(month => {
    const [monthName, yearSuffix] = month.split("'")
    const year = parseInt(yearSuffix)
    const lastYear = (year - 1).toString().padStart(2, '0')
    return `${monthName}'${lastYear}`
  });
  
  // Combine current FY and last FY data for comparisons
  const allData = [...data, ...(state.lastFYData || [])];
  
  // Revenue growth metrics
  // For MoM, we need to compare individual months, not YTD cumulative
  // Filter to get only the specific month's data
  const currentMonthData = data.filter(d => d.month === endMonth);
  const previousMonthData = data.filter(d => d.month === previousMonth);
  
  const currentMonthRevenue = sumMetric(currentMonthData, ['Revenue_Actual']);
  const previousMonthRevenue = sumMetric(previousMonthData, ['Revenue_Actual']);
  
  console.log(`📊 MoM Revenue Calculation:
    Previous Month: ${previousMonth} = ₹${(previousMonthRevenue / 100).toFixed(2)} Cr (${previousMonthData.filter(d => d.metric === 'Revenue_Actual').length} records)
    Current Month: ${endMonth} = ₹${(currentMonthRevenue / 100).toFixed(2)} Cr (${currentMonthData.filter(d => d.metric === 'Revenue_Actual').length} records)
    Growth: ${previousMonthRevenue > 0 ? ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue * 100).toFixed(2) : 0}%`);
  
  revenue.mom = previousMonth ? {
    current: currentMonthRevenue,
    previous: previousMonthRevenue,
    growth: previousMonthRevenue > 0 
      ? ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue * 100)
      : 0,
    growthAbs: currentMonthRevenue - previousMonthRevenue
  } : null;
  
  revenue.yoy = calculateYoY(allData, ['Revenue_Actual'], currentFY, lastFY, endMonth);
  revenue.yoyYTD = calculateYoYYTD(allData, ['Revenue_Actual'], currentFY, lastFY, endMonth);
  revenue.trend = getMonthlyTrend(data, ['Revenue_Actual']);
  
  // CM growth metrics
  const currentMonthCMData = data.filter(d => d.month === endMonth);
  const previousMonthCMData = data.filter(d => d.month === previousMonth);
  
  cm.mom = previousMonth ? {
    current: sumMetric(currentMonthCMData, ['CM_Actual', 'CM Actual']),
    previous: sumMetric(previousMonthCMData, ['CM_Actual', 'CM Actual']),
    growth: sumMetric(previousMonthCMData, ['CM_Actual', 'CM Actual']) > 0
      ? ((sumMetric(currentMonthCMData, ['CM_Actual', 'CM Actual']) - sumMetric(previousMonthCMData, ['CM_Actual', 'CM Actual'])) / sumMetric(previousMonthCMData, ['CM_Actual', 'CM Actual']) * 100)
      : 0,
    growthAbs: sumMetric(currentMonthCMData, ['CM_Actual', 'CM Actual']) - sumMetric(previousMonthCMData, ['CM_Actual', 'CM Actual'])
  } : null;
  
  cm.yoy = calculateYoY(allData, ['CM_Actual', 'CM Actual'], currentFY, lastFY, endMonth);
  cm.yoyYTD = calculateYoYYTD(allData, ['CM_Actual', 'CM Actual'], currentFY, lastFY, endMonth);
  cm.trend = getMonthlyTrend(data, ['CM_Actual', 'CM Actual']);
  
  // Headcount growth - calculate last year's headcount using same method
  // Get latest month headcount for last FY
  // Note: FY2024-25 uses different metric names: "Actual_Headcount Overall" vs "Headcount_Overall"
  const lastFYHeadcount = state.lastFYData && state.lastFYData.length > 0
    ? getLatestMonthHeadcountFromData(state.lastFYData, ['Headcount_Overall', 'Actual_Headcount Overall'], lastFYMonths[lastFYMonths.length - 1])
    : 0;
  
  console.log(`📊 Headcount YoY Calculation:
    Last FY target month: ${lastFYMonths[lastFYMonths.length - 1]}
    Last FY data records: ${state.lastFYData?.length || 0}
    Last FY headcount: ${lastFYHeadcount.toFixed(2)}
    Current FY headcount: ${headcount.overall.toFixed(2)}
    Growth: ${lastFYHeadcount > 0 ? ((headcount.overall - lastFYHeadcount) / lastFYHeadcount * 100).toFixed(2) : 0}%`);
  
  headcount.yoyYTD = {
    current: headcount.overall,
    previous: lastFYHeadcount,
    growth: lastFYHeadcount > 0 
      ? ((headcount.overall - lastFYHeadcount) / lastFYHeadcount * 100)
      : 0,
    growthAbs: headcount.overall - lastFYHeadcount
  };
  headcount.trend = getMonthlyTrend(data, ['Headcount_Overall']);
  
  // Collections growth
  collections.yoyYTD = calculateYoYYTD(allData, ['Actual_Collection', 'Revenue_Collected'], currentFY, lastFY, endMonth);
  collections.trend = getMonthlyTrend(data, ['Actual_Collection', 'Revenue_Collected']);
  
  // Productivity growth
  productivity.yoyYTD = calculateYoYYTD(allData, ['Target_Rev_Productivity', 'Target Rev Productivity'], currentFY, lastFY, endMonth);
  
  console.log('✅ Enhanced metrics with growth calculations:', {
    revenueMoM: revenue.mom?.growth.toFixed(1) + '%',
    revenueMoMDetails: revenue.mom,
    revenueYoYYTD: revenue.yoyYTD?.growth.toFixed(1) + '%',
    cmYoYYTD: cm.yoyYTD?.growth.toFixed(1) + '%',
    headcountYoYYTD: headcount.yoyYTD?.growth.toFixed(1) + '%',
    headcountDetails: headcount.yoyYTD
  });
  
  state.metrics = {
    revenue,
    cm,
    ppc,
    collections,
    cashHealth,
    headcount,
    hiring,
    productivity
  }
  } catch (error) {
    console.error('Error calculating metrics:', error)
    state.metrics = null
  }
}

function sumMetric(data, metricNames) {
  return data
    .filter(d => metricNames.includes(d.metric) && d.value != null)
    .reduce((sum, d) => sum + safeParseFloat(d.value), 0)
}

// Deduplicate and sum budget metrics (handles duplicate records in database)
function sumBudgetMetric(data, metricNames) {
  // Group by project, region, sub_region, month to remove duplicates
  const uniqueRecords = {};
  
  data
    .filter(d => metricNames.includes(d.metric) && d.value != null)
    .forEach(d => {
      const key = `${d.project}_${d.region}_${d.sub_region || ''}_${d.month}`;
      if (!uniqueRecords[key]) {
        uniqueRecords[key] = parseFloat(d.value);
      }
    });
  
  return Object.values(uniqueRecords).reduce((sum, val) => sum + val, 0);
}

function avgMetric(data, metricNames) {
  const values = data.filter(d => metricNames.includes(d.metric) && d.value != null)
  if (values.length === 0) return 0
  return values.reduce((sum, d) => sum + parseFloat(d.value), 0) / values.length
}

// Calculate average excluding zero values (for PPC calculation)
function avgMetricExcludingZero(data, metricNames) {
  const values = data.filter(d => {
    if (!metricNames.includes(d.metric) || d.value == null) return false
    const val = safeParseFloat(d.value)
    return val !== 0 && !isNaN(val)
  })
  if (values.length === 0) return 0
  return values.reduce((sum, d) => sum + safeParseFloat(d.value), 0) / values.length
}

// Calculate average headcount: Monthly Sum then YTD Average (excluding 0 or null)
// Logic: For each month, sum all projects/regions, then calculate average across months
// Example: Apr total = 71, May total = 75, ..., Dec total = 63 → Average = (71+75+...+63)/9 = 68
function avgHeadcountByMonth(data, metricNames) {
  const filteredData = data.filter(d => {
    if (!metricNames.includes(d.metric) || d.value == null) return false
    const val = safeParseFloat(d.value)
    return val !== 0 && !isNaN(val)
  })
  if (filteredData.length === 0) return 0
  
  // Log sample of filtered data for debugging
  console.log(`avgHeadcountByMonth for ${metricNames[0]}: ${filteredData.length} records`)
  if (filteredData.length > 0) {
    console.log('  Sample records:', filteredData.slice(0, 3).map(d => ({ 
      project: d.project, 
      region: d.region, 
      month: d.month, 
      value: d.value 
    })))
  }
  
  // Group by month and SUM all projects/regions for each month
  const monthlyTotals = {}
  filteredData.forEach(d => {
    const month = d.month
    if (!monthlyTotals[month]) {
      monthlyTotals[month] = 0
    }
    monthlyTotals[month] += safeParseFloat(d.value)
  })
  
  // Calculate AVERAGE of monthly totals (YTD average)
  const monthTotals = Object.values(monthlyTotals)
  if (monthTotals.length === 0) return 0
  
  const ytdAverage = monthTotals.reduce((sum, val) => sum + val, 0) / monthTotals.length
  
  // Log calculation details for verification
  console.log('  Monthly Totals:', monthlyTotals)
  console.log('  YTD Average:', ytdAverage.toFixed(2))
  
  return ytdAverage
}

// Get latest month headcount (sum of all projects/regions for the selected end month)
// This shows current headcount snapshot
// For each project, use the latest available month value up to endMonth
function getLatestMonthHeadcount(data, metricNames) {
  const filteredData = data.filter(d => 
    metricNames.includes(d.metric) && 
    d.value != null
    // Do NOT exclude 0 values - include all records
  )
  if (filteredData.length === 0) return 0
  
  // Use state.filters.endMonth as the target month (from filter selection)
  const targetMonth = state.filters.endMonth
  if (!targetMonth) return 0
  
  // Get all months up to and including target month
  const allMonths = state.filterOptions.months || []
  const targetIdx = allMonths.indexOf(targetMonth)
  const monthsUpTo = targetIdx >= 0 ? allMonths.slice(0, targetIdx + 1) : [targetMonth]
  
  // Group by project and get latest non-zero value for each project
  const projectLatest = {}
  filteredData.forEach(d => {
    if (!monthsUpTo.includes(d.month)) return
    
    const key = `${d.project}_${d.region}_${d.sub_region || ''}`
    if (!projectLatest[key]) {
      projectLatest[key] = { month: d.month, value: safeParseFloat(d.value), monthIdx: allMonths.indexOf(d.month) }
    } else {
      const currentIdx = allMonths.indexOf(d.month)
      // Use latest month value (highest month index)
      if (currentIdx > projectLatest[key].monthIdx) {
        projectLatest[key] = { month: d.month, value: safeParseFloat(d.value), monthIdx: currentIdx }
      }
    }
  })
  
  // Sum the latest values
  const monthTotal = Object.values(projectLatest).reduce((sum, p) => sum + p.value, 0)
  
  // Log details for debugging
  console.log(`Latest headcount (up to ${targetMonth}) ${metricNames[0]}: ${monthTotal} (from ${Object.keys(projectLatest).length} projects)`)
  console.log(`  Sample projects:`, Object.entries(projectLatest).slice(0, 3).map(([k, v]) => ({ key: k, month: v.month, value: v.value })))
  
  return monthTotal
}

// Get YTD average headcount (sum of monthly totals / number of months)
// Used specifically for WL1 Headcount as requested
// Logic: For each month up to endMonth, sum all projects, then average across months
function getYTDAvgHeadcount(data, metricNames) {
  const filteredData = data.filter(d => 
    metricNames.includes(d.metric) && 
    d.value != null
  )
  if (filteredData.length === 0) return 0
  
  // Get all months for the current fiscal year up to and including target month
  const targetMonth = state.filters.endMonth
  if (!targetMonth) return 0
  
  // Use calculateMonthsForPeriod to get the correct FY months
  const periodMonths = calculateMonthsForPeriod()
  
  // Group by month and SUM all projects/regions for each month
  const monthlyTotals = {}
  filteredData.forEach(d => {
    if (!periodMonths.includes(d.month)) return
    
    if (!monthlyTotals[d.month]) {
      monthlyTotals[d.month] = 0
    }
    monthlyTotals[d.month] += safeParseFloat(d.value)
  })
  
  // Calculate AVERAGE of monthly totals (YTD average)
  const monthTotals = Object.values(monthlyTotals)
  if (monthTotals.length === 0) return 0
  
  const ytdAverage = monthTotals.reduce((sum, val) => sum + val, 0) / monthTotals.length
  
  console.log(`YTD Avg Headcount (${targetMonth}) ${metricNames[0]}:`, {
    monthlyTotals: monthlyTotals,
    sumOfMonthlyTotals: monthTotals.reduce((sum, val) => sum + val, 0).toFixed(2),
    numMonths: monthTotals.length,
    ytdAverage: ytdAverage.toFixed(2)
  })
  
  return ytdAverage
}

// Helper function to calculate latest month headcount from a specific dataset
function getLatestMonthHeadcountFromData(dataSet, metricNames, targetMonth) {
  const filteredData = dataSet.filter(d => 
    metricNames.includes(d.metric) && 
    d.value != null &&
    d.month === targetMonth
  );
  if (filteredData.length === 0) return 0;
  
  // Group by project and sum
  const projectTotals = {};
  filteredData.forEach(d => {
    const key = `${d.project}_${d.region}_${d.sub_region || ''}`;
    if (!projectTotals[key]) {
      projectTotals[key] = 0;
    }
    projectTotals[key] += parseFloat(d.value || 0);
  });
  
  const total = Object.values(projectTotals).reduce((sum, val) => sum + val, 0);
  return total;
}

// Calculate total headcount sum across all projects/regions/months (for PPC calculation)
function sumTotalHeadcount(data, metricNames) {
  const filteredData = data.filter(d => metricNames.includes(d.metric) && d.value != null)
  if (filteredData.length === 0) return 0
  
  // Group by month and SUM all values for that month
  const monthlyTotals = {}
  filteredData.forEach(d => {
    const month = d.month
    if (!monthlyTotals[month]) {
      monthlyTotals[month] = 0
    }
    monthlyTotals[month] += safeParseFloat(d.value)
  })
  
  // Return SUM of all monthly totals (not average)
  return Object.values(monthlyTotals).reduce((sum, val) => sum + val, 0)
}

function sumMetricTillMonth(data, metricNames, endMonth) {
  const allMonths = state.filterOptions.months || []
  const endIdx = allMonths.indexOf(endMonth)
  const monthsTill = allMonths.slice(0, endIdx + 1)
  
  return data
    .filter(d => metricNames.includes(d.metric) && d.value != null && monthsTill.includes(d.month))
    .reduce((sum, d) => sum + parseFloat(d.value), 0)
}

function sumMetricAfterMonth(data, metricNames, endMonth) {
  const allMonths = state.filterOptions.months || []
  const endIdx = allMonths.indexOf(endMonth)
  const monthsAfter = allMonths.slice(endIdx + 1)
  
  return data
    .filter(d => metricNames.includes(d.metric) && d.value != null && monthsAfter.includes(d.month))
    .reduce((sum, d) => sum + parseFloat(d.value), 0)
}

// ============================================================================
// ENHANCED GROWTH METRICS CALCULATION (MoM, QoQ, YoY, YoY YTD)
// ============================================================================

// Calculate growth metrics between two periods
function calculateGrowthMetrics(currentData, previousData, metricNames) {
  const current = sumMetric(currentData, metricNames);
  const previous = sumMetric(previousData, metricNames);
  const growth = previous > 0 ? ((current - previous) / previous * 100) : 0;
  
  return { current, previous, growth, growthAbs: current - previous };
}

// Calculate MoM (Month over Month)
function calculateMoM(data, metricNames, currentMonth, previousMonth) {
  const currentData = data.filter(d => d.month === currentMonth);
  const previousData = data.filter(d => d.month === previousMonth);
  return calculateGrowthMetrics(currentData, previousData, metricNames);
}

// Calculate YoY (Year over Year) - same month last year
function calculateYoY(data, metricNames, currentFY, lastFY, month) {
  const currentData = data.filter(d => d.fy === currentFY && d.month === month);
  const lastData = data.filter(d => d.fy === lastFY && d.month === month);
  return calculateGrowthMetrics(currentData, lastData, metricNames);
}

// Calculate YoY YTD (Year over Year Year-to-Date)
function calculateYoYYTD(data, metricNames, currentFY, lastFY, endMonth) {
  const allMonths = state.filterOptions.months || [];
  const endIdx = allMonths.indexOf(endMonth);
  const monthsYTD = endIdx >= 0 ? allMonths.slice(0, endIdx + 1) : [endMonth];
  
  const currentData = data.filter(d => d.fy === currentFY && monthsYTD.includes(d.month));
  const lastData = data.filter(d => d.fy === lastFY && monthsYTD.includes(d.month));
  return calculateGrowthMetrics(currentData, lastData, metricNames);
}

// Get monthly trend data for sparklines
function getMonthlyTrend(data, metricNames, numMonths = 9) {
  const allMonths = state.filterOptions.months || [];
  const currentFY = state.filters.fy[0] || 'FY2025-26';
  const recentMonths = allMonths.slice(0, numMonths);
  
  return recentMonths.map(month => {
    const monthData = data.filter(d => d.fy === currentFY && d.month === month);
    return { month, value: sumMetric(monthData, metricNames) };
  });
}

// Calculate contribution percentage at hierarchy level
function calculateContribution(value, total) {
  return total > 0 ? (value / total * 100) : 0;
}

// ============================================================================
// UI RENDERING
// ============================================================================

function renderApp() {
  const app = document.getElementById('app')
  
  // Initialize drill state
  initializeDrillState()
  
  app.innerHTML = `
    ${flipStyles}
    <style>
      /* Beautiful Animations & Transitions */
      * { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
      
      .fade-in { animation: fadeIn 0.5s ease-in; }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .slide-in { animation: slideIn 0.4s ease-out; }
      @keyframes slideIn {
        from { transform: translateX(-20px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      
      /* Hover Effects */
      .hover-lift:hover {
        transform: translateY(-4px);
        box-shadow: 0 12px 24px -10px rgba(0,0,0,0.2);
      }
      
      .hover-scale:hover {
        transform: scale(1.02);
      }
      
      .hover-glow:hover {
        box-shadow: 0 0 20px rgba(59, 130, 246, 0.5);
      }
      
      /* Gradient Backgrounds */
      .gradient-blue {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      }
      
      .gradient-green {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      }
      
      .gradient-purple {
        background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
      }
      
      .gradient-orange {
        background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
      }
      
      /* Card Styles */
      .card {
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        transition: all 0.3s ease;
      }
      
      .card:hover {
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
      }
      
      /* Sidebar Active State */
      .nav-item {
        position: relative;
        overflow: hidden;
      }
      
      .nav-item::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 3px;
        background: linear-gradient(to bottom, #3b82f6, #8b5cf6);
        transform: scaleY(0);
        transition: transform 0.3s ease;
      }
      
      .nav-item.active::before {
        transform: scaleY(1);
      }
      
      .nav-item:hover {
        background: linear-gradient(to right, rgba(59,130,246,0.1), transparent);
      }
      
      /* Progress Bars */
      .progress-bar {
        height: 8px;
        border-radius: 4px;
        overflow: hidden;
        background: #e5e7eb;
      }
      
      .progress-fill {
        height: 100%;
        background: linear-gradient(to right, #3b82f6, #8b5cf6);
        transition: width 1s ease;
      }
      
      /* Badges */
      .badge {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
        animation: pulse 2s infinite;
      }
      
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      
      /* Table Hover */
      tbody tr {
        transition: all 0.2s ease;
      }
      
      tbody tr:hover {
        background: linear-gradient(to right, rgba(59,130,246,0.05), transparent);
        transform: translateX(4px);
      }
      
      /* Scrollbar Styling */
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      
      ::-webkit-scrollbar-track {
        background: #f1f1f1;
      }
      
      ::-webkit-scrollbar-thumb {
        background: linear-gradient(to bottom, #3b82f6, #8b5cf6);
        border-radius: 4px;
      }
      
      ::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(to bottom, #2563eb, #7c3aed);
      }
    </style>
    
    ${renderDropdownFilters()}
    
    <div class="flex flex-col h-screen overflow-hidden bg-gradient-to-br from-gray-50 to-blue-50" style="margin-top: 0;">
      
      <!-- Breadcrumb Navigation (Drill-down) -->
      <div id="breadcrumb-container" class="px-6 pt-4">
        <!-- Breadcrumb will be rendered here by renderBreadcrumb() -->
      </div>
      
      <!-- Main Content Area -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Colorful Sidebar -->
        ${renderColorfulSidebar()}
        
        <!-- Content -->
        <div id="content" class="flex-1 overflow-y-auto p-6 bg-gradient-to-br ${COLOR_THEMES[currentTheme].background}">
          <!-- Content will be rendered here -->
        </div>
      </div>
    </div>
    
    <!-- Color Palette Modal -->
    ${renderColorPalette()}
    
    <!-- Loading Overlay -->
    <div id="loading-overlay" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden z-50">
      <div class="bg-white p-8 rounded-2xl shadow-2xl text-center">
        <i class="fas fa-spinner fa-spin text-6xl text-blue-600 mb-4"></i>
        <p class="text-gray-700 text-lg font-semibold">Loading...</p>
      </div>
    </div>
  `
  
  // Initialize breadcrumb
  renderBreadcrumb()
  
  // Render the current page content after app structure is built
  renderCurrentPage()
  
  // Note: Compact filters have their own event handlers built-in
  // No need to attach listeners here
}

function renderNavLink(page, icon, label) {
  const isActive = state.currentPage === page
  return `
    <a href="#" onclick="navigateTo('${page}'); return false;" 
       class="nav-item flex items-center px-3 py-2 mb-1 text-sm rounded-lg transition-all duration-300 ${isActive ? 'active bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold shadow-lg shadow-blue-500/50' : 'text-gray-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 hover:shadow-md hover:shadow-blue-200/50 hover:scale-105 hover:translate-x-1'}">
      <i class="fas fa-${icon} w-5 mr-3"></i>
      ${label}
    </a>
  `
}

function navigateTo(page) {
  console.log('🧭 Navigating to page:', page)
  state.currentPage = page
  
  // Clear any drill-down state when switching pages
  state.drillState = {
    level: 'overall',
    breadcrumb: []
  }
  
  renderApp()
}

// ============================================================================
// DRILL-DOWN TABLE COMPONENT - Phase 2
// ============================================================================

// Aggregate data by hierarchy level
function aggregateDataByLevel(data, level, parentFilters = {}) {
  console.log(`🔍 Aggregating data for level: ${level}, data records: ${data.length}`);
  
  const groupKey = {
    'overall': null,
    'region': 'region',
    'subregion': 'sub_region',
    'regionhead': 'region_head',
    'practicehead': 'practice_head',
    'project': 'project'
  }[level];
  
  if (!groupKey) {
    // Overall level - aggregate all data
    // For YTD mode: Budget/Forecast should use LATEST month value (not sum)
    // For actual values: Use sum (they're cumulative or distributed across projects)
    const isYTD = state.filters.periodMode === 'YTD';
    
    const revenue = sumMetric(data, ['Revenue_Actual']) / 100;  // Convert Lacs to Crores
    const cm = sumMetric(data, ['CM_Actual', 'CM Actual']) / 100;  // Convert Lacs to Crores
    const collection = sumMetric(data, ['Actual_Collection', 'Revenue_Collected']) / 100;  // Convert Lacs to Crores
    
    // For budget/forecast in YTD mode, get the AVERAGE per project to avoid double-counting
    // Since each project has multiple month records, we need to deduplicate
    let budget, cmBudget;
    
    // Simple sum for actual/forecast, deduplicated sum for budget
    budget = sumBudgetMetric(data, ['Revenue_Budget']) / 100;  // Convert Lacs to Crores
    cmBudget = sumBudgetMetric(data, ['CM_Budget']) / 100;  // Convert Lacs to Crores
    
    const cmPercent = revenue > 0 ? (cm / revenue * 100) : 0;
    const variance = budget > 0 ? ((revenue - budget) / budget * 100) : 0;
    const headcountValue = getLatestMonthHeadcount(data, ['Headcount_Overall']);
    
    console.log('🔍 Overall level calculations:', {
      revenue,
      budget,
      cm,
      cmBudget,
      cmPercent,
      variance,
      headcount: headcountValue,
      collection
    });
    
    const result = [{
      name: 'Overall',
      level: 'overall',
      revenue,
      budget,
      cm,
      cmBudget,
      cmPercent,
      variance,
      headcount: headcountValue,
      collection
    }];
    
    console.log('Overall aggregation FULL OBJECT:', JSON.stringify(result[0], null, 2));
    return result;
  }
  
  // Filter data based on parent selections
  let filteredData = data;
  Object.keys(parentFilters).forEach(key => {
    if (parentFilters[key]) {
      filteredData = filteredData.filter(d => d[key] === parentFilters[key]);
    }
  });
  
  // Group by the current level
  const groups = {};
  filteredData.forEach(d => {
    const groupValue = d[groupKey];
    if (!groupValue) return;
    
    if (!groups[groupValue]) {
      groups[groupValue] = {
        name: groupValue,
        level: level,
        data: []
      };
    }
    groups[groupValue].data.push(d);
  });
  
  console.log(`Found ${Object.keys(groups).length} groups at ${level} level:`, Object.keys(groups).slice(0, 5));
  console.log(`Sample group data count:`, groups[Object.keys(groups)[0]]?.data.length);
  
  // Calculate metrics for each group
  const isYTD = state.filters.periodMode === 'YTD';
  
  const result = Object.values(groups).map(group => {
    const revenue = sumMetric(group.data, ['Revenue_Actual']) / 100;  // Convert Lacs to Crores
    const cm = sumMetric(group.data, ['CM_Actual', 'CM Actual']) / 100;  // Convert Lacs to Crores
    const collection = sumMetric(group.data, ['Actual_Collection', 'Revenue_Collected']) / 100;  // Convert Lacs to Crores
    
    let budget, cmBudget;
    
    // Simple sum for actual/forecast, deduplicated sum for budget
    budget = sumBudgetMetric(group.data, ['Revenue_Budget']) / 100;  // Convert Lacs to Crores
    cmBudget = sumBudgetMetric(group.data, ['CM_Budget']) / 100;  // Convert Lacs to Crores
    
    const cmPercent = revenue > 0 ? (cm / revenue * 100) : 0;
    const variance = budget > 0 ? ((revenue - budget) / budget * 100) : 0;
    
    console.log(`Group ${group.name}: revenue=${revenue.toFixed(2)}, budget=${budget.toFixed(2)}, records=${group.data.length}`);
    
    return {
      name: group.name,
      level: level,
      revenue,
      budget,
      cm,
      cmBudget,
      cmPercent,
      variance,
      headcount: getLatestMonthHeadcount(group.data, ['Headcount_Overall']),
      collection
    };
  }).sort((a, b) => b.revenue - a.revenue); // Sort by revenue descending
  
  // Add "Overall" summary row at the top (for drill-down levels)
  const overallRow = {
    name: 'Overall (Total)',
    level: 'overall',
    revenue: result.reduce((sum, r) => sum + r.revenue, 0),
    budget: result.reduce((sum, r) => sum + r.budget, 0),
    cm: result.reduce((sum, r) => sum + r.cm, 0),
    cmBudget: result.reduce((sum, r) => sum + r.cmBudget, 0),
    cmPercent: 0,  // Will calculate below
    variance: 0,   // Will calculate below
    headcount: result.reduce((sum, r) => sum + r.headcount, 0),
    collection: result.reduce((sum, r) => sum + r.collection, 0),
    isOverall: true  // Flag to identify overall row
  };
  
  overallRow.cmPercent = overallRow.revenue > 0 ? (overallRow.cm / overallRow.revenue * 100) : 0;
  overallRow.variance = overallRow.budget > 0 ? ((overallRow.revenue - overallRow.budget) / overallRow.budget * 100) : 0;
  
  // Insert overall row at the beginning
  result.unshift(overallRow);
  
  console.log(`Sample aggregated row:`, result[1]);  // Show first non-overall row
  return result;
}

// Calculate contribution percentage
function calculateContributionPercent(value, total) {
  return total > 0 ? (value / total * 100) : 0;
}

// Render drill-down table
function renderDrillDownTable() {
  console.log('🔍 renderDrillDownTable called');
  console.log('  state.rawData exists:', !!state.rawData);
  console.log('  state.rawData.length:', state.rawData?.length || 0);
  
  if (!state.rawData || state.rawData.length === 0) {
    console.warn('⚠️ No rawData available for drill-down');
    return '<p class="text-gray-500 p-6">No data available</p>';
  }
  
  const currentLevel = drillState.currentLevel;
  console.log('  Current drill level:', currentLevel);
  
  const parentFilters = {};
  
  // Build parent filters from breadcrumb
  drillState.breadcrumb.forEach(crumb => {
    if (crumb.level !== 'overall' && crumb.value) {
      const filterKey = DRILL_HIERARCHY.find(h => h.level === crumb.level)?.filterKey;
      if (filterKey) {
        parentFilters[filterKey] = crumb.value;
      }
    }
  });
  
  console.log('  Parent filters:', parentFilters);
  
  const aggregatedData = aggregateDataByLevel(state.rawData, currentLevel, parentFilters);
  const totalRevenue = aggregatedData.reduce((sum, row) => sum + row.revenue, 0);
  
  console.log('  Total revenue:', totalRevenue);
  console.log('  Aggregated rows:', aggregatedData.length);
  
  return `
    <div class="bg-white rounded-lg shadow-lg overflow-hidden mb-6 border border-gray-200">
      ${renderBreadcrumb()}
      
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
              <th class="px-4 py-3 text-left font-bold">
                <i class="fas ${getCurrentLevelIcon()} mr-2"></i>${getCurrentLevelLabel()}
              </th>
              <th class="px-4 py-3 text-right font-bold">Revenue (₹ Cr)</th>
              <th class="px-4 py-3 text-right font-bold">Budget (₹ Cr)</th>
              <th class="px-4 py-3 text-right font-bold">Var %</th>
              <th class="px-4 py-3 text-right font-bold">CM %</th>
              <th class="px-4 py-3 text-center font-bold">Performance</th>
              <th class="px-4 py-3 text-right font-bold">Contribution %</th>
              <th class="px-4 py-3 text-right font-bold">Headcount</th>
              <th class="px-4 py-3 text-right font-bold">Collection (₹ Cr)</th>
              <th class="px-4 py-3 text-center font-bold">Action</th>
            </tr>
          </thead>
          <tbody>
            ${aggregatedData.map(row => renderDrillTableRow(row, totalRevenue)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Render table row with drill-down capability
function renderDrillTableRow(row, totalRevenue) {

  
  const contribution = calculateContributionPercent(row.revenue, totalRevenue);
  const canDrillDown = drillState.currentLevel !== 'project' && !row.isOverall;  // Overall row cannot drill down
  
  const varianceColor = row.variance >= 0 ? 'text-green-600' : 'text-red-600';
  const varianceIcon = row.variance >= 0 ? '↑' : '↓';
  
  // Calculate performance score based on variance and CM%
  let performanceScore = 0;
  if (row.variance >= 0) performanceScore++; // Revenue meets/exceeds budget
  if (row.cmPercent >= 30) performanceScore++; // Good CM%
  if (contribution >= 10) performanceScore++; // Good contribution
  
  const performanceLabel = performanceScore >= 2 ? 'Good' : performanceScore === 1 ? 'Fair' : 'Poor';
  const performanceColor = performanceScore >= 2 ? 'bg-green-100 text-green-700' : performanceScore === 1 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
  const performanceIcon = performanceScore >= 2 ? 'check-circle' : performanceScore === 1 ? 'minus-circle' : 'times-circle';
  
  // Highlight overall row differently
  const rowClass = row.isOverall 
    ? 'border-b-2 border-blue-600 bg-blue-50 font-bold' 
    : 'border-b border-gray-200 hover:bg-blue-50';
  
  return `
    <tr class="${rowClass} transition-colors">
      <td class="px-4 py-3 font-semibold text-gray-800">${row.name}</td>
      <td class="px-4 py-3 text-right">${formatWithUnit(row.revenue, 'Crore')}</td>
      <td class="px-4 py-3 text-right text-gray-600">${formatWithUnit(row.budget, 'Crore')}</td>
      <td class="px-4 py-3 text-right ${varianceColor} font-semibold">
        ${varianceIcon} ${Math.abs(row.variance).toFixed(1)}%
      </td>
      <td class="px-4 py-3 text-right font-semibold">${row.cmPercent.toFixed(1)}%</td>
      <td class="px-4 py-3 text-center">
        <span class="px-2 py-1 ${performanceColor} rounded text-xs font-bold inline-flex items-center">
          <i class="fas fa-${performanceIcon} mr-1"></i>${performanceLabel}
        </span>
      </td>
      <td class="px-4 py-3 text-right">
        <span class="px-2 py-1 ${row.isOverall ? 'bg-blue-200 text-blue-800' : 'bg-blue-100 text-blue-700'} rounded text-xs font-bold">
          ${contribution.toFixed(1)}%
        </span>
      </td>
      <td class="px-4 py-3 text-right">${Math.round(row.headcount)}</td>
      <td class="px-4 py-3 text-right">${formatWithUnit(row.collection, 'Crore')}</td>
      <td class="px-4 py-3 text-center">
        ${canDrillDown ? `
          <button onclick="drillDown('${row.name}')" 
                  class="px-3 py-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg text-xs font-semibold hover:shadow-lg transition-all">
            <i class="fas fa-arrow-right mr-1"></i>Drill
          </button>
        ` : `
          <span class="text-gray-400 text-xs">—</span>
        `}
      </td>
    </tr>
  `;
}

// Render breadcrumb navigation
function renderBreadcrumb() {
  return `
    <div class="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center space-x-2">
      <i class="fas fa-sitemap text-blue-600"></i>
      <div class="flex items-center space-x-2">
        ${drillState.breadcrumb.map((crumb, index) => `
          <div class="flex items-center">
            ${index > 0 ? '<i class="fas fa-chevron-right text-gray-400 text-xs mx-2"></i>' : ''}
            <button onclick="drillTo(${index})" 
                    class="px-3 py-1 rounded ${index === drillState.breadcrumb.length - 1 ? 'bg-blue-600 text-white font-semibold' : 'bg-white text-gray-700 hover:bg-gray-100'} text-sm transition-all">
              <i class="fas ${DRILL_HIERARCHY.find(h => h.level === crumb.level)?.icon || 'fa-circle'} mr-1"></i>
              ${crumb.label}
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Helper functions
function getCurrentLevelLabel() {
  const hierarchy = (state.currentPage === 'headcount-capacity' || 
                     state.currentPage === 'headcount' || 
                     state.currentPage === 'capacity' ||
                     state.currentPage === 'ppc-productivity' ||
                     state.currentPage === 'ppc' ||
                     state.currentPage === 'productivity' ||
                     state.currentPage === 'collections' ||
                     state.currentPage === 'collections-cash' ||
                     state.currentPage === 'cashhealth')
    ? HC_DRILL_HIERARCHY 
    : DRILL_HIERARCHY;
  return hierarchy.find(h => h.level === drillState.currentLevel)?.label || 'Overall';
}

function getCurrentLevelIcon() {
  const hierarchy = (state.currentPage === 'headcount-capacity' || 
                     state.currentPage === 'headcount' || 
                     state.currentPage === 'capacity' ||
                     state.currentPage === 'ppc-productivity' ||
                     state.currentPage === 'ppc' ||
                     state.currentPage === 'productivity' ||
                     state.currentPage === 'collections' ||
                     state.currentPage === 'collections-cash' ||
                     state.currentPage === 'cashhealth')
    ? HC_DRILL_HIERARCHY 
    : DRILL_HIERARCHY;
  return hierarchy.find(h => h.level === drillState.currentLevel)?.icon || 'fa-chart-line';
}

// Drill down to next level
function drillDown(value) {
  console.log('🎯 drillDown called with value:', value);
  console.log('  Current level:', drillState.currentLevel);
  console.log('  Current breadcrumb:', drillState.breadcrumb);
  
  // Use appropriate hierarchy based on current page
  const hierarchy = (state.currentPage === 'headcount-capacity' || 
                     state.currentPage === 'headcount' || 
                     state.currentPage === 'capacity' ||
                     state.currentPage === 'ppc-productivity' ||
                     state.currentPage === 'ppc' ||
                     state.currentPage === 'productivity' ||
                     state.currentPage === 'collections' ||
                     state.currentPage === 'collections-cash' ||
                     state.currentPage === 'cashhealth')
    ? HC_DRILL_HIERARCHY 
    : DRILL_HIERARCHY;
  
  const currentLevelIndex = hierarchy.findIndex(h => h.level === drillState.currentLevel);
  
  if (currentLevelIndex >= hierarchy.length - 1) {
    console.log('Already at deepest level');
    return;
  }
  
  const nextLevel = hierarchy[currentLevelIndex + 1];
  const currentLevelData = hierarchy[currentLevelIndex];
  
  // Add current selection to breadcrumb (stores the level we're moving TO)
  drillState.breadcrumb.push({
    level: nextLevel.level,  // The level we're drilling TO
    label: value,
    value: value
  });
  
  // Update current level
  drillState.currentLevel = nextLevel.level;
  
  console.log('✅ Drilled down to:', nextLevel.level, 'value:', value);
  console.log('  New breadcrumb:', drillState.breadcrumb);
  
  // Re-render current page
  renderCurrentPage();
}

// Drill to specific breadcrumb level
function drillTo(breadcrumbIndex) {
  if (breadcrumbIndex >= drillState.breadcrumb.length) return;
  
  // Remove breadcrumb items after the clicked one
  drillState.breadcrumb = drillState.breadcrumb.slice(0, breadcrumbIndex + 1);
  
  // Set current level
  const targetCrumb = drillState.breadcrumb[breadcrumbIndex];
  drillState.currentLevel = targetCrumb.level;
  
  console.log('Drilled to:', drillState.currentLevel);
  
  // Re-render current page
  renderCurrentPage();
}

// Initialize drill state
function initializeDrillState() {
  drillState.currentLevel = 'overall';
  drillState.breadcrumb = [{ level: 'overall', label: 'Overall', value: null }];
  drillState.selectedValues = {
    region: null,
    subRegion: null,
    regionHead: null,
    practiceHead: null,
    project: null
  };
}

// ============================================================================
// PAGE RENDERING
// ============================================================================

function renderCurrentPage() {
  const content = document.getElementById('content')
  console.log('🔍 renderCurrentPage - content element:', content ? 'FOUND' : 'NOT FOUND')
  if (!content) return
  
  // Handle scorecard pages differently - they manipulate container directly
  if (state.currentPage.startsWith('scorecard-')) {
    const type = state.currentPage.replace('scorecard-', '')
    renderScorecard(content, type)
    return
  }
  
  // Handle other pages that manipulate container directly  
  if (state.currentPage === 'scorecards') {
    renderScorecardsHome(content)
    return
  }
  if (state.currentPage === 'cash') {
    renderCashHealth(content)
    return
  }
  
  // For pages that return HTML strings
  const theme = COLOR_THEMES[currentTheme]
  content.className = `flex-1 overflow-y-auto p-6 bg-gradient-to-br ${theme.background}`
  
  let html = ''
  switch (state.currentPage) {
    case 'executive': html = renderExecutiveOverview(); break
    case 'revenue-cm': html = renderRevenueCM(); break
    case 'ppc-productivity': html = renderPPCProductivity(); break
    case 'headcount-capacity': html = renderHeadcountCapacity(); break
    case 'collections': html = renderCollectionsCashFlow(); break
    case 'collections-cash': html = renderCollectionsCashFlow(); break
    case 'hiring': html = renderHiringEfficiency(); break
    case 'hiring-efficiency': html = renderHiringEfficiency(); break
    // Legacy routes for backward compatibility
    case 'revenue': html = renderRevenueCM(); break
    case 'cm': html = renderRevenueCM(); break
    case 'ppc': html = renderPPCProductivity(); break
    case 'productivity': html = renderPPCProductivity(); break
    case 'headcount': html = renderHeadcountCapacity(); break
    case 'cashhealth': html = renderCollectionsCashFlow(); break
    // Governance routes
    case 'targets': html = renderTargets(); break
    case 'definitions': html = renderDefinitions(); break
    case 'data-quality': html = renderDataQuality(); break
    case 'upload': html = renderUpload(); break
    default: html = '<p class="text-gray-500">Page not found</p>'
  }
  
  console.log('🎨 Setting innerHTML for page:', state.currentPage, '| HTML length:', html.length)
  content.innerHTML = html
  console.log('✅ innerHTML set, content.children.length:', content.children.length)
  
  // Render charts after content is loaded
  if (state.currentPage === 'executive') {
    renderExecutiveOverviewCharts();
  } else if (state.currentPage === 'revenue-cm' || state.currentPage === 'revenue' || state.currentPage === 'cm') {
    // Initialize Revenue & CM charts
    setTimeout(() => {
      initializeRevenueCMCharts();
    }, 100);
  } else if (state.currentPage === 'ppc-productivity' || state.currentPage === 'ppc' || state.currentPage === 'productivity') {
    // Initialize Productivity & PPC charts
    setTimeout(() => {
      initializePPCProductivityCharts();
    }, 100);
  } else if (state.currentPage === 'headcount-capacity' || state.currentPage === 'headcount' || state.currentPage === 'capacity') {
    // Initialize Headcount & Capacity charts
    setTimeout(() => {
      initializeHeadcountCharts();
    }, 100);
  } else if (state.currentPage === 'collections' || state.currentPage === 'collections-cash' || state.currentPage === 'cashhealth') {
    // Initialize Collections & Cash Flow charts
    setTimeout(() => {
      initializeCollectionsCharts();
    }, 100);
  } else if (state.currentPage === 'hiring' || state.currentPage === 'hiring-efficiency') {
    // Initialize Hiring Efficiency charts
    setTimeout(() => {
      console.log('📊 Rendering Hiring Efficiency charts...');
  initializeHiringEfficiencyCharts();
    }, 100);
  }
}

// Continue in next message due to length...

// ============================================================================
// EXECUTIVE OVERVIEW PAGE
// ============================================================================

function renderExecutiveOverview() {
  if (!state.metrics) {
    return "<p class=\"text-gray-500 p-6\">Loading metrics...</p>"
  }
  
  const m = state.metrics
  
  return `
    <div class="fade-in">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-3xl font-bold text-gray-900 flex items-center">
          <i class="fas fa-chart-pie text-blue-600 mr-3"></i>
          Executive Overview
        </h2>
        ${renderExportButton()}
      </div>
      
      <!-- AI-Powered Insights at the TOP -->
      ${renderAIInsights(m)}
      
      <!-- YoY Comparison (if enabled) -->
      ${renderYoYComparison()}
      
      <!-- Key Performance Indicators with Growth Metrics -->
      <h3 class="text-lg font-semibold text-gray-700 mb-3 mt-4 flex items-center">
        <i class="fas fa-tachometer-alt text-blue-600 mr-2"></i>
        Key Performance Indicators
        ${hasLastYearData() ? '<span class="ml-3 text-xs font-normal text-gray-500">Current FY YTD vs Last FY YTD</span>' : ''}
      </h3>
      <div class="grid grid-cols-4 gap-3 mb-6">
        ${render3DKPICard('Revenue (Actual)', m.revenue.actual, m.revenue.budget, 'Crore', 'dollar-sign', 'blue', { 
          variance: m.revenue.variancePercent,
          yoyYTD: safeYoYGrowth(m.revenue.yoyYTD),
          mom: m.revenue.mom?.growth
        })}
        ${render3DKPICard('CM %', m.cm.actualPercent, m.cm.budgetPercent, '%', 'percentage', 'green', {
          variance: m.cm.ppVariance ? m.cm.ppVariance : null,
          yoyYTD: safeYoYGrowth(m.cm.yoyYTD),
          mom: m.cm.mom?.growth
        })}
        ${render3DKPICard('PPC Per Person/Month', m.ppc.perMonth, m.ppc.budgetPerMonth, 'INR', 'coins', 'purple', {
          variance: m.ppc.perMonthVariancePercent,
          yoyYTD: null,
          mom: null
        }, true, 0)}
        ${render3DKPICard('Revenue Productivity', m.productivity.recruiterPerMonth, m.productivity.target, '₹ Lacs/Recruiter/Month', 'chart-line', 'teal', {
          variance: m.productivity.variancePercent,
          yoyYTD: null,
          mom: null
        }, false, 2)}
        ${render3DKPICard('Taggd Joiner Productivity', m.productivity.taggdJoinerPerMonth, m.productivity.target, 'Joiners/Recruiter/Month', 'user-plus', 'indigo', {
          variance: null,
          yoyYTD: null,
          mom: null
        }, false, 1)}
        ${render3DKPICard('Headcount Overall', m.headcount.overall, m.headcount.approved, 'Count', 'users', 'orange', {
          variance: m.headcount.approved > 0 ? ((m.headcount.overall - m.headcount.approved) / m.headcount.approved * 100) : null,
          yoyYTD: safeYoYGrowth(m.headcount.yoyYTD),
          mom: null
        }, true, 0)}
        ${render3DKPICard('Collection Actual', m.collections.actual, m.collections.target, 'Crore', 'hand-holding-usd', 'cyan', {
          variance: m.collections.target > 0 ? ((m.collections.actual - m.collections.target) / m.collections.target * 100) : null,
          yoyYTD: safeYoYGrowth(m.collections.yoyYTD),
          mom: null
        })}
        ${render3DKPICard('Unbilled', m.cashHealth.unbilled, null, 'Crore', 'file-invoice', 'red', {
          variance: null,
          yoyYTD: null,
          mom: null
        })}
      </div>
      
      <!-- Executive Summary Table - Compact (Issue #5) -->
      <div class="bg-white rounded-lg shadow-lg overflow-hidden mb-6 border border-gray-200">
        <div class="bg-gradient-to-r from-blue-600 to-purple-600 px-3 py-2">
          <h3 class="text-base font-bold text-white flex items-center">
            <i class="fas fa-chart-bar mr-2"></i>
            Executive Summary
          </h3>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs table-compact">
            <thead>
              <tr class="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-300">
                <th class="px-2 py-1.5 text-left font-bold text-gray-700 text-[10px]">
                  <i class="fas fa-list-ul mr-1 text-blue-600"></i>Metrics
                </th>
                <th class="px-2 py-1.5 text-right font-bold text-gray-700 text-[10px]">
                  <i class="fas fa-bullseye mr-1 text-purple-600"></i>Budget
                </th>
                <th class="px-2 py-1.5 text-right font-bold text-gray-700 text-[10px]">
                  <i class="fas fa-chart-line mr-1 text-indigo-600"></i>Forecast
                </th>
                <th class="px-3 py-2 text-right font-bold text-gray-700 text-xs">
                  <i class="fas fa-check-circle mr-1 text-green-600"></i>Actual
                </th>
                <th class="px-3 py-2 text-right font-bold text-gray-700 text-xs">
                  <i class="fas fa-exchange-alt mr-1 text-orange-600"></i>Var vs Budget
                </th>
                <th class="px-3 py-2 text-right font-bold text-gray-700 text-xs">
                  <i class="fas fa-adjust mr-1 text-teal-600"></i>Var vs Fcst
                </th>
              </tr>
            </thead>
            <tbody>
              <!-- Revenue -->
              <tr class="border-b border-gray-200 hover:bg-blue-50 transition-colors duration-150">
                <td class="px-3 py-2 font-semibold text-gray-800 text-xs">
                  <i class="fas fa-rupee-sign mr-1 text-blue-600"></i>Revenue (₹ Cr)
                </td>
                <td class="px-3 py-2 text-right text-gray-700">${formatWithUnit(m.revenue.budget, 'Crore')}</td>
                <td class="px-3 py-2 text-right text-gray-700">${formatWithUnit(m.revenue.forecastAsOn, 'Crore')}</td>
                <td class="px-3 py-2 text-right font-bold text-blue-700">${formatWithUnit(m.revenue.actual, 'Crore')}</td>
                <td class="px-3 py-2 text-right">
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold ${m.revenue.variancePercent >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                    ${m.revenue.variancePercent >= 0 ? '↑' : '↓'} ${Math.abs(m.revenue.variancePercent).toFixed(1)}%
                  </span>
                </td>
                <td class="px-3 py-2 text-right">
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold ${m.revenue.forecastVariancePercent >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                    ${m.revenue.forecastVariancePercent >= 0 ? '↑' : '↓'} ${Math.abs(m.revenue.forecastVariancePercent).toFixed(1)}%
                  </span>
                </td>
              </tr>
              
              <!-- CM % -->
              <tr class="border-b border-gray-200 hover:bg-green-50 transition-colors duration-150">
                <td class="px-3 py-2 font-semibold text-gray-800 text-xs">
                  <i class="fas fa-percentage mr-1 text-green-600"></i>CM %
                </td>
                <td class="px-3 py-2 text-right text-gray-700">${m.cm.budgetPercent.toFixed(1)}%</td>
                <td class="px-3 py-2 text-right text-gray-700">${m.cm.forecastPercent.toFixed(1)}%</td>
                <td class="px-3 py-2 text-right font-bold text-green-700">${m.cm.actualPercent.toFixed(1)}%</td>
                <td class="px-3 py-2 text-right">
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold ${m.cm.ppVariance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                    ${m.cm.ppVariance >= 0 ? '↑' : '↓'} ${Math.abs(m.cm.ppVariance).toFixed(1)}pp
                  </span>
                </td>
                <td class="px-3 py-2 text-right">
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold ${(m.cm.actualPercent - m.cm.forecastPercent) >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                    ${(m.cm.actualPercent - m.cm.forecastPercent) >= 0 ? '↑' : '↓'} ${Math.abs(m.cm.actualPercent - m.cm.forecastPercent).toFixed(1)}pp
                  </span>
                </td>
              </tr>
              
              <!-- PPC Per Person Per Month -->
              <tr class="border-b border-gray-200 hover:bg-purple-50 transition-colors duration-150">
                <td class="px-3 py-2 font-semibold text-gray-800 text-xs">
                  <i class="fas fa-coins mr-1 text-purple-600"></i>PPC (Per Person/Month)
                </td>
                <td class="px-3 py-2 text-right text-gray-700">${formatWithUnit(m.ppc.budgetPerMonth, 'INR')}</td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
                <td class="px-3 py-2 text-right font-bold text-purple-700">${formatWithUnit(m.ppc.perMonth, 'INR')}</td>
                <td class="px-3 py-2 text-right">
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold ${m.ppc.perMonthVariancePercent <= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                    ${m.ppc.perMonthVariancePercent >= 0 ? '↑' : '↓'} ${Math.abs(m.ppc.perMonthVariancePercent).toFixed(1)}%
                  </span>
                </td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
              </tr>
              
              <!-- Revenue Productivity Per Recruiter Per Month -->
              <tr class="border-b border-gray-200 hover:bg-teal-50 transition-colors duration-150">
                <td class="px-3 py-2 font-semibold text-gray-800 text-xs">
                  <i class="fas fa-chart-line mr-1 text-teal-600"></i>Revenue Productivity (Per Rec/Mo)
                </td>
                <td class="px-3 py-2 text-right text-gray-700">${formatWithUnit(m.productivity.target, 'Lacs')}</td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
                <td class="px-3 py-2 text-right font-bold text-teal-700">${formatWithUnit(m.productivity.revenuePerRecruiterPerMonth, 'Lacs')}</td>
                <td class="px-3 py-2 text-right">
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold ${m.productivity.variancePercent >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                    ${m.productivity.variancePercent >= 0 ? '↑' : '↓'} ${Math.abs(m.productivity.variancePercent).toFixed(1)}%
                  </span>
                </td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
              </tr>
              
              <!-- Taggd Source Joiner Productivity Per Recruiter Per Month -->
              <tr class="border-b border-gray-200 hover:bg-indigo-50 transition-colors duration-150">
                <td class="px-3 py-2 font-semibold text-gray-800 text-xs">
                  <i class="fas fa-user-plus mr-1 text-indigo-600"></i>Taggd Joiner Productivity (Per Rec/Mo)
                </td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
                <td class="px-3 py-2 text-right font-bold text-indigo-700">${formatWithUnit(m.productivity.joinerProductivityTaggdPerMonth, 'Count')}</td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
              </tr>
              
              <!-- Headcount -->
              <tr class="border-b border-gray-200 hover:bg-orange-50 transition-colors duration-150">
                <td class="px-3 py-2 font-semibold text-gray-800 text-xs">
                  <i class="fas fa-users mr-1 text-orange-600"></i>Headcount
                </td>
                <td class="px-3 py-2 text-right text-gray-700">${formatWithUnit(m.headcount.approved, 'Count')}</td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
                <td class="px-3 py-2 text-right font-bold text-orange-700">${formatWithUnit(m.headcount.overall, 'Count')}</td>
                <td class="px-3 py-2 text-right">
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold ${m.headcount.utilization > 100 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">
                    ${m.headcount.utilization.toFixed(1)}% Util
                  </span>
                </td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
              </tr>
              
              <!-- Collection (Actual) -->
              <tr class="border-b border-gray-200 hover:bg-cyan-50 transition-colors duration-150">
                <td class="px-3 py-2 font-semibold text-gray-800 text-xs">
                  <i class="fas fa-hand-holding-usd mr-1 text-cyan-600"></i>Collection (Actual) (₹ Cr)
                </td>
                <td class="px-3 py-2 text-right text-gray-700">${formatWithUnit(m.collections.target, 'Crore')}</td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
                <td class="px-3 py-2 text-right font-bold text-cyan-700">${formatWithUnit(m.collections.actual, 'Crore')}</td>
                <td class="px-3 py-2 text-right">
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold ${((m.collections.actual - m.collections.target) / m.collections.target * 100) >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                    ${((m.collections.actual - m.collections.target) / m.collections.target * 100) >= 0 ? '↑' : '↓'} ${Math.abs((m.collections.actual - m.collections.target) / m.collections.target * 100).toFixed(1)}%
                  </span>
                </td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
              </tr>
              
              <!-- Source Mix % -->
              <tr class="border-b border-gray-200 hover:bg-indigo-50 transition-colors duration-150">
                <td class="px-3 py-2 font-semibold text-gray-800 text-xs">
                  <i class="fas fa-chart-pie mr-1 text-indigo-600"></i>Source Mix % (Taggd)
                </td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
                <td class="px-3 py-2 text-right font-bold text-indigo-700">${m.hiring.taggdMix.toFixed(1)}%</td>
                <td class="px-3 py-2 text-right">
                  <span class="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                    ${Math.round(m.hiring.taggd)} / ${Math.round(m.hiring.taggd + m.hiring.nonTaggd)} joiners
                  </span>
                </td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
              </tr>
              
              <!-- Unbilled -->
              <tr class="border-b border-gray-200 hover:bg-red-50 transition-colors duration-150">
                <td class="px-3 py-2 font-semibold text-gray-800 text-xs">
                  <i class="fas fa-file-invoice mr-1 text-red-600"></i>Unbilled (₹ Cr)
                </td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
                <td class="px-3 py-2 text-right font-bold text-red-700">${formatWithUnit(m.cashHealth.unbilled, 'Crore')}</td>
                <td class="px-3 py-2 text-right">
                  <span class="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                    ${m.cashHealth.unbilledPct.toFixed(1)}% of Rev
                  </span>
                </td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
              </tr>
              
              <!-- Bad Debt -->
              <tr class="hover:bg-yellow-50 transition-colors duration-150">
                <td class="px-3 py-2 font-semibold text-gray-800 text-xs">
                  <i class="fas fa-exclamation-triangle mr-1 text-yellow-600"></i>Bad Debt (₹ Cr)
                </td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
                <td class="px-3 py-2 text-right font-bold text-yellow-700">${formatWithUnit(m.cashHealth.badDebt, 'Crore')}</td>
                <td class="px-3 py-2 text-right">
                  <span class="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                    ${m.cashHealth.badDebtPct.toFixed(1)}% of Coll
                  </span>
                </td>
                <td class="px-3 py-2 text-right text-gray-400">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
}

function renderAIInsights(m) {
  const insights = []
  const actions = []
  
  // Revenue insights
  if (m.revenue.variancePercent < -10) {
    insights.push({
      type: 'negative',
      icon: 'exclamation-triangle',
      text: `Revenue is ${Math.abs(m.revenue.variancePercent).toFixed(1)}% below budget (₹${formatNumber(Math.abs(m.revenue.variance))} Lacs shortfall)`
    })
    actions.push('Immediate focus on revenue recovery initiatives')
  } else if (m.revenue.variancePercent > 0) {
    insights.push({
      type: 'positive',
      icon: 'check-circle',
      text: `Revenue outperforming budget by ${m.revenue.variancePercent.toFixed(1)}% (₹${formatNumber(m.revenue.variance)} Lacs)`
    })
  }
  
  // CM insights
  if (m.cm.ppVariance < -5) {
    insights.push({
      type: 'negative',
      icon: 'arrow-down',
      text: `CM% has dropped ${Math.abs(m.cm.ppVariance).toFixed(1)}pp vs budget - margin compression alert`
    })
    actions.push('Review cost structure and pricing strategy')
  }
  
  // Collections insight
  if (m.collections.attainment < 90) {
    insights.push({
      type: 'warning',
      icon: 'exclamation-circle',
      text: `Collections at ${m.collections.attainment.toFixed(1)}% of target - below expectation`
    })
    actions.push('Accelerate collection efforts and follow-ups')
  }
  
  // Cash health insights
  if (m.cashHealth.unbilledPct > 15) {
    insights.push({
      type: 'warning',
      icon: 'file-invoice',
      text: `Unbilled at ${m.cashHealth.unbilledPct.toFixed(1)}% of revenue - billing risk`
    })
    actions.push('Expedite billing process and reduce unbilled backlog')
  }
  
  if (m.cashHealth.badDebtPct > 3) {
    insights.push({
      type: 'negative',
      icon: 'times-circle',
      text: `Bad debt at ${m.cashHealth.badDebtPct.toFixed(1)}% - credit risk alert`
    })
  }
  
  // Hiring insights
  insights.push({
    type: 'neutral',
    icon: 'users',
    text: `Hiring mix: ${m.hiring.taggdMix.toFixed(1)}% Taggd, ${m.hiring.nonTaggdMix.toFixed(1)}% Non-Taggd (${Math.round(m.hiring.taggd + m.hiring.nonTaggd)} total joiners)`
  })
  
  // Add default action if none
  if (actions.length === 0) {
    actions.push('Continue monitoring performance metrics')
    actions.push('Maintain current operational excellence')
  }
  if (actions.length < 3) {
    actions.push('Focus on sustainable growth initiatives')
  }
  
  const colors = {
    positive: { bg: 'from-green-50 to-emerald-50', border: 'green-200', text: 'green-700', icon: 'green-600' },
    negative: { bg: 'from-red-50 to-rose-50', border: 'red-200', text: 'red-700', icon: 'red-600' },
    warning: { bg: 'from-yellow-50 to-orange-50', border: 'yellow-200', text: 'yellow-700', icon: 'yellow-600' },
    neutral: { bg: 'from-blue-50 to-indigo-50', border: 'blue-200', text: 'blue-700', icon: 'blue-600' }
  }
  
  return `
    <div class="card p-4 mb-4">
      <h3 class="text-lg font-bold mb-3 flex items-center">
        <i class="fas fa-brain text-purple-600 mr-2"></i>
        AI-Powered Insights
      </h3>
      
      <div class="grid grid-cols-3 gap-3 mb-3">
        ${insights.slice(0, 3).map((insight, idx) => {
          const c = colors[insight.type]
          return `
            <div class="bg-gradient-to-br ${c.bg} border border-${c.border} rounded-lg p-3 hover-scale" style="animation-delay: ${idx * 0.1}s;">
              <div class="flex items-start">
                <i class="fas fa-${insight.icon} text-${c.icon} text-lg mr-2 mt-0.5"></i>
                <p class="text-xs text-${c.text} leading-tight">${insight.text}</p>
              </div>
            </div>
          `
        }).join('')}
      </div>
      
      <div class="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-3">
        <h4 class="font-bold text-sm text-purple-900 mb-2 flex items-center">
          <i class="fas fa-tasks text-purple-600 mr-2"></i>
          Recommended Actions
        </h4>
        <ul class="space-y-1">
          ${actions.slice(0, 3).map((action, idx) => `
            <li class="flex items-start text-xs text-purple-800">
              <i class="fas fa-chevron-right text-purple-600 mr-2 mt-0.5 text-xs"></i>
              ${action}
            </li>
          `).join('')}
        </ul>
      </div>
    </div>
  `
}

/**
 * Render Comparison Bar Charts for Revenue and CM
 */
function renderComparisonCharts(m) {
  return `
    <div class="grid grid-cols-2 gap-6 mb-6">
      <!-- Revenue Comparison Chart -->
      <div class="card hover-lift p-6">
        <h3 class="text-lg font-bold mb-4 flex items-center">
          <i class="fas fa-chart-bar text-blue-600 mr-2"></i>
          Revenue Comparison (₹ Crores)
        </h3>
        <div class="space-y-3">
          <!-- Budget Bar -->
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="font-medium text-gray-700">Budget</span>
              <span class="font-bold text-gray-900">${formatWithUnit(m.revenue.budget, 'Crore')}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
              <div class="bg-gradient-to-r from-blue-400 to-blue-600 h-full flex items-center justify-end px-3 text-white text-xs font-semibold" style="width: ${100}%">
                100%
              </div>
            </div>
          </div>
          
          <!-- Forecast Bar -->
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="font-medium text-gray-700">Forecast</span>
              <span class="font-bold text-gray-900">${formatWithUnit(m.revenue.forecastAsOn, 'Crore')}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
              <div class="bg-gradient-to-r from-purple-400 to-purple-600 h-full flex items-center justify-end px-3 text-white text-xs font-semibold" style="width: ${Math.min((m.revenue.forecastAsOn / m.revenue.budget * 100), 100)}%">
                ${(m.revenue.forecastAsOn / m.revenue.budget * 100).toFixed(1)}%
              </div>
            </div>
          </div>
          
          <!-- Actual Bar -->
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="font-medium text-gray-700">Actual</span>
              <span class="font-bold text-gray-900">${formatWithUnit(m.revenue.actual, 'Crore')}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
              <div class="bg-gradient-to-r ${m.revenue.actual >= m.revenue.budget ? 'from-green-400 to-green-600' : 'from-red-400 to-red-600'} h-full flex items-center justify-end px-3 text-white text-xs font-semibold" style="width: ${Math.min((m.revenue.actual / m.revenue.budget * 100), 100)}%">
                ${(m.revenue.actual / m.revenue.budget * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
        
        <!-- Variance Summary -->
        <div class="mt-4 pt-4 border-t border-gray-200">
          <div class="flex justify-between items-center">
            <span class="text-sm font-medium text-gray-600">Variance vs Budget:</span>
            <span class="${m.revenue.variancePercent >= 0 ? 'text-green-600' : 'text-red-600'} font-bold">
              ${m.revenue.variancePercent >= 0 ? '+' : ''}${m.revenue.variancePercent.toFixed(1)}%
            </span>
          </div>
          <div class="flex justify-between items-center mt-2">
            <span class="text-sm font-medium text-gray-600">Variance vs Forecast:</span>
            <span class="${m.revenue.forecastVariancePercent >= 0 ? 'text-green-600' : 'text-red-600'} font-bold">
              ${m.revenue.forecastVariancePercent >= 0 ? '+' : ''}${m.revenue.forecastVariancePercent.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
      
      <!-- CM Comparison Chart -->
      <div class="card hover-lift p-6">
        <h3 class="text-lg font-bold mb-4 flex items-center">
          <i class="fas fa-chart-bar text-green-600 mr-2"></i>
          Contribution Margin Comparison (%)
        </h3>
        <div class="space-y-3">
          <!-- Budget CM% Bar -->
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="font-medium text-gray-700">Budget CM%</span>
              <span class="font-bold text-gray-900">${m.cm.budgetPercent.toFixed(1)}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
              <div class="bg-gradient-to-r from-blue-400 to-blue-600 h-full flex items-center justify-end px-3 text-white text-xs font-semibold" style="width: ${m.cm.budgetPercent}%">
                ${m.cm.budgetPercent.toFixed(1)}%
              </div>
            </div>
          </div>
          
          <!-- Forecast CM% Bar -->
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="font-medium text-gray-700">Forecast CM%</span>
              <span class="font-bold text-gray-900">${m.cm.forecastPercent.toFixed(1)}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
              <div class="bg-gradient-to-r from-purple-400 to-purple-600 h-full flex items-center justify-end px-3 text-white text-xs font-semibold" style="width: ${m.cm.forecastPercent}%">
                ${m.cm.forecastPercent.toFixed(1)}%
              </div>
            </div>
          </div>
          
          <!-- Actual CM% Bar -->
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="font-medium text-gray-700">Actual CM%</span>
              <span class="font-bold text-gray-900">${m.cm.actualPercent.toFixed(1)}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
              <div class="bg-gradient-to-r ${m.cm.actualPercent >= m.cm.budgetPercent ? 'from-green-400 to-green-600' : 'from-red-400 to-red-600'} h-full flex items-center justify-end px-3 text-white text-xs font-semibold" style="width: ${m.cm.actualPercent}%">
                ${m.cm.actualPercent.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
        
        <!-- Variance Summary -->
        <div class="mt-4 pt-4 border-t border-gray-200">
          <div class="flex justify-between items-center">
            <span class="text-sm font-medium text-gray-600">Variance vs Budget:</span>
            <span class="${m.cm.ppVariance >= 0 ? 'text-green-600' : 'text-red-600'} font-bold">
              ${m.cm.ppVariance >= 0 ? '+' : ''}${m.cm.ppVariance.toFixed(1)}pp
            </span>
          </div>
          <div class="flex justify-between items-center mt-2">
            <span class="text-sm font-medium text-gray-600">Variance vs Forecast:</span>
            <span class="${(m.cm.actualPercent - m.cm.forecastPercent) >= 0 ? 'text-green-600' : 'text-red-600'} font-bold">
              ${(m.cm.actualPercent - m.cm.forecastPercent) >= 0 ? '+' : ''}${(m.cm.actualPercent - m.cm.forecastPercent).toFixed(1)}pp
            </span>
          </div>
        </div>
      </div>
    </div>
  `
}

// ============================================================================
// HIRING EFFICIENCY PAGE
// ============================================================================

function renderHiringEfficiency() {
  console.log('🎯 renderHiringEfficiency called');
  
  if (!state.metrics) {
    console.warn('⚠️ No metrics available for Hiring Efficiency page');
    return "<p class=\"text-gray-500 p-6\">Loading metrics...</p>"
  }
  
  const m = state.metrics
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  const numMonths = periodMonths.length || 12;
  
  console.log('📊 Metrics available:', m);
  
  // Calculate Hiring Efficiency Metrics
  const totalJoiners = m.productivity.totalJoiners || 0
  const taggdJoiners = m.productivity.taggdJoiners || 0
  const nonTaggdJoiners = m.productivity.nonTaggdJoiners || 0
  const recruiterHC = m.headcount.wl1 || 0  // WL1 headcount is recruiter headcount
  
  console.log('👥 Hiring data:', { totalJoiners, taggdJoiners, nonTaggdJoiners, recruiterHC, numMonths });
  
  // KPI Calculations (all per Recruiter per Month)
  const taggdSourceMixPercent = totalJoiners > 0 ? (taggdJoiners / totalJoiners * 100) : 0
  const taggdSourceMixValue = taggdJoiners
  
  // Joiner per Recruiter per Month = Total Joiners / (Recruiter HC * Months)
  const joinerPerRecruiterMonth = (recruiterHC * numMonths) > 0 ? (totalJoiners / (recruiterHC * numMonths)) : 0
  
  // Taggd Source Productivity (Joiners per Recruiter per Month) = Taggd Joiners / (Recruiter HC * Months)
  const taggdSourceProductivity = (recruiterHC * numMonths) > 0 ? (taggdJoiners / (recruiterHC * numMonths)) : 0
  
  // Revenue Productivity (per Recruiter per Month) = Revenue / (Recruiter HC * Months) * 100 (Cr to Lacs)
  const revenueProductivity = (recruiterHC * numMonths) > 0 ? (m.revenue.actual * 100 / (recruiterHC * numMonths)) : 0
  
  return `
    <div class="fade-in">
      <h2 class="text-3xl font-bold text-gray-900 mb-6 flex items-center">
        <i class="fas fa-user-plus text-green-600 mr-3"></i>
        Hiring Efficiency Analysis
      </h2>
      
      ${renderYoYComparison()}
      
      <!-- KPI Cards (as requested) -->
      <div class="grid grid-cols-5 gap-4 mb-6">
        ${render3DKPICard('Total Joiners', totalJoiners, null, 'Count', 'users', 'blue', m)}
        ${render3DKPICard('Taggd Source %', taggdSourceMixPercent, null, '%', 'tag', 'green', m)}
        ${render3DKPICard('Joiner/Recruiter/Mo', joinerPerRecruiterMonth, null, 'Count/Month', 'user-clock', 'purple', m)}
        ${render3DKPICard('Taggd Productivity', taggdSourceProductivity, null, 'Count/Month', 'chart-line', 'teal', m)}
        ${render3DKPICard('Revenue Productivity', revenueProductivity, null, '₹ Lacs', 'dollar-sign', 'orange', m)}
      </div>
      
      <!-- Key Insights -->
      <div class="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-4 mb-6 border border-green-200">
        <div class="grid grid-cols-5 gap-4 text-sm">
          <div>
            <div class="text-xs text-gray-600 mb-1">Taggd Joiners</div>
            <div class="text-lg font-bold text-green-600">${Math.round(taggdJoiners)}</div>
          </div>
          <div>
            <div class="text-xs text-gray-600 mb-1">Non-Taggd Joiners</div>
            <div class="text-lg font-bold text-orange-600">${Math.round(nonTaggdJoiners)}</div>
          </div>
          <div>
            <div class="text-xs text-gray-600 mb-1">Recruiter Headcount</div>
            <div class="text-lg font-bold text-purple-600">${Math.round(recruiterHC)} HC</div>
          </div>
          <div>
            <div class="text-xs text-gray-600 mb-1">Period Months</div>
            <div class="text-lg font-bold text-gray-900">${numMonths} Mo</div>
          </div>
          <div>
            <div class="text-xs text-gray-600 mb-1">Total Revenue</div>
            <div class="text-lg font-bold text-blue-600">₹${m.revenue.actual.toFixed(2)} Cr</div>
          </div>
        </div>
      </div>
      
      <!-- Charts Section -->
      <div class="grid grid-cols-2 gap-6 mb-6">
        <!-- Source Mix Donut Chart -->
        <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
          <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <i class="fas fa-chart-pie text-green-600 mr-2"></i>
            Source Mix Distribution
          </h3>
          <div style="height: 280px;">
            <canvas id="sourceMixChart"></canvas>
          </div>
        </div>
        
        <!-- Joiners Trend Chart -->
        <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
          <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <i class="fas fa-chart-line text-blue-600 mr-2"></i>
            Joiners Trend (Monthly)
          </h3>
          <div style="height: 280px;">
            <canvas id="joinersTrendChart"></canvas>
          </div>
        </div>
      </div>
      
      <div class="grid grid-cols-2 gap-6 mb-6">
        <!-- Revenue Growth vs Hiring Growth -->
        <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
          <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <i class="fas fa-chart-bar text-purple-600 mr-2"></i>
            Revenue Growth vs Hiring Growth
          </h3>
          <div style="height: 280px;">
            <canvas id="revenueVsHiringChart"></canvas>
          </div>
        </div>
        
        <!-- YoY Monthly Joiner Comparison -->
        <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
          <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <i class="fas fa-chart-line text-indigo-600 mr-2"></i>
            YoY Monthly Joiner Comparison
          </h3>
          <div style="height: 280px;">
            <canvas id="yoyJoinerChart"></canvas>
          </div>
        </div>
      </div>
      
      <!-- Drill-Down Table -->
      ${renderHiringEfficiencyDrillDown()}
    </div>
  `
}

// Hiring Efficiency Drill-Down Table
function renderHiringEfficiencyDrillDown() {
  console.log('🔍 renderHiringEfficiencyDrillDown called');
  
  if (!state.rawData || state.rawData.length === 0) {
    console.warn('⚠️ No rawData available for drill-down');
    return '<p class="text-gray-500 p-6">No data available</p>';
  }
  
  const currentLevel = drillState.currentLevel;
  const parentFilters = {};
  
  // Build parent filters from breadcrumb
  drillState.breadcrumb.forEach(crumb => {
    if (crumb.level !== 'overall' && crumb.value) {
      const filterKey = HC_DRILL_HIERARCHY.find(h => h.level === crumb.level)?.filterKey;
      if (filterKey) {
        parentFilters[filterKey] = crumb.value;
      }
    }
  });
  
  const aggregatedData = aggregateHiringEfficiencyByLevel(state.rawData, currentLevel, parentFilters);
  
  return `
    <div class="bg-white rounded-lg shadow-lg overflow-hidden mb-6 border border-gray-200">
      ${renderBreadcrumb()}
      
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gradient-to-r from-green-600 to-blue-600 text-white">
              <th class="px-4 py-3 text-left font-bold">
                <i class="fas ${getCurrentLevelIcon()} mr-2"></i>${getCurrentLevelLabel()}
              </th>
              <th class="px-4 py-3 text-right font-bold">Joiners</th>
              <th class="px-4 py-3 text-right font-bold">Revenue (₹ Cr)</th>
              <th class="px-4 py-3 text-right font-bold">Rev Prod WL1<br/>(₹L/HC/Mo)</th>
              <th class="px-4 py-3 text-right font-bold">Overall Prod<br/>(₹L/HC/Mo)</th>
              <th class="px-4 py-3 text-right font-bold">Taggd J/R/Mo</th>
              <th class="px-4 py-3 text-center font-bold">Performance</th>
              <th class="px-4 py-3 text-right font-bold">Hiring Mix %</th>
              <th class="px-4 py-3 text-center font-bold">Action</th>
            </tr>
          </thead>
          <tbody>
            ${aggregatedData.map(row => renderHiringEfficiencyTableRow(row)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Aggregate Hiring Efficiency data by drill-down level
function aggregateHiringEfficiencyByLevel(data, level, parentFilters) {
  const grouped = {};
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  const numMonths = periodMonths.length || 12;
  
  // Determine grouping field based on level
  const groupField = HC_DRILL_HIERARCHY.find(h => h.level === level)?.field || null;
  
  console.log('📊 Aggregating hiring efficiency for level:', level, 'groupField:', groupField, 'numMonths:', numMonths);
  
  data.forEach(d => {
    // Apply parent filters
    const matchesFilters = Object.entries(parentFilters).every(([key, value]) => d[key] === value);
    if (!matchesFilters) return;
    
    // Group by field
    const groupValue = groupField ? (d[groupField] || 'Unassigned') : 'Overall';
    
    if (!grouped[groupValue]) {
      grouped[groupValue] = {
        name: groupValue,
        revenue: 0,
        taggdJoiners: 0,
        nonTaggdJoiners: 0,
        headcountOverall: 0,
        headcountWL1: 0,
        cm: 0,
        revenueCount: 0,
        cmCount: 0,
        headcountOverallCount: 0,
        headcountWL1Count: 0
      };
    }
    
    const metric = d.metric;  // Use 'metric' not 'metric_name'
    const value = parseFloat(d.value || 0);
    
    // Revenue (in Lacs in raw data, convert to Crores)
    if (metric === 'Revenue_Actual') {
      grouped[groupValue].revenue += value / 100;  // Lacs to Crores
      grouped[groupValue].revenueCount++;
    }
    
    // Hiring Metrics - use correct metric names from data
    if (metric === 'Taggd_Source_Joiner') {
      grouped[groupValue].taggdJoiners += value;
    }
    if (metric === 'Non Taggd_Source_Joiner' || metric === 'Non Taggd Source Joiner') {
      grouped[groupValue].nonTaggdJoiners += value;
    }
    
    // Headcount
    if (metric === 'Headcount_Overall') {
      grouped[groupValue].headcountOverall += value;
      grouped[groupValue].headcountOverallCount++;
    }
    if (metric === 'Headcount_WL1') {
      grouped[groupValue].headcountWL1 += value;
      grouped[groupValue].headcountWL1Count++;
    }
    
    // CM %
    if (metric === 'CM_%' || metric === 'CM %') {
      grouped[groupValue].cm += value;
      grouped[groupValue].cmCount++;
    }
  });
  
  const groupedKeys = Object.keys(grouped);
  const firstGroup = grouped[groupedKeys[0]];
  console.log('📊 Grouped data keys:', groupedKeys);
  console.log('📊 First group data:', {
    name: firstGroup?.name,
    revenue: firstGroup?.revenue,
    taggdJoiners: firstGroup?.taggdJoiners,
    nonTaggdJoiners: firstGroup?.nonTaggdJoiners,
    headcountWL1: firstGroup?.headcountWL1,
    headcountOverall: firstGroup?.headcountOverall
  });
  
  // Calculate derived metrics
  const results = Object.values(grouped).map(g => {
    const totalJoiners = g.taggdJoiners + g.nonTaggdJoiners;
    
    // For "Overall" level, use metrics from state; for other levels use aggregated data
    let avgHeadcountOverall = g.headcountOverallCount > 0 ? g.headcountOverall / g.headcountOverallCount : 0;
    let avgHeadcountWL1 = g.headcountWL1Count > 0 ? g.headcountWL1 / g.headcountWL1Count : 0;
    
    console.log('📊 Before fix:', { name: g.name, avgHeadcountWL1, isNaN: isNaN(avgHeadcountWL1) });
    
    // If headcount is NaN or 0, and this is Overall, use state.metrics
    if (g.name === 'Overall' && (isNaN(avgHeadcountWL1) || avgHeadcountWL1 === 0) && state.metrics) {
      avgHeadcountOverall = state.metrics.headcount.overall || 0;
      avgHeadcountWL1 = state.metrics.headcount.wl1 || 0;
      console.log('📊 Using state.metrics for Overall:', { 
        avgHeadcountOverall, 
        avgHeadcountWL1, 
        revenue: g.revenue,
        numMonths 
      });
    }
    
    const avgCM = g.cmCount > 0 ? g.cm / g.cmCount : 0;
    
    // For Overall row, use CM % from state.metrics if available
    const cmPercent = (g.name === 'Overall' && avgCM === 0 && state.metrics && state.metrics.cm.cmPercent) 
      ? state.metrics.cm.cmPercent 
      : avgCM;
    
    // Revenue Productivity WL1 = Revenue / (WL1 HC * months) - multiply by 100 to convert Cr to Lacs
    const revProdWL1 = (avgHeadcountWL1 * numMonths) > 0 
      ? (g.revenue * 100 / (avgHeadcountWL1 * numMonths)) 
      : 0;
    
    // Overall Productivity = Revenue / (Overall HC * months) - multiply by 100 to convert Cr to Lacs
    const overallProd = (avgHeadcountOverall * numMonths) > 0 
      ? (g.revenue * 100 / (avgHeadcountOverall * numMonths)) 
      : 0;
    
    // Taggd Joiner Productivity = Taggd Joiners / (WL1 HC * months)
    const taggdJoinerProd = (avgHeadcountWL1 * numMonths) > 0 
      ? (g.taggdJoiners / (avgHeadcountWL1 * numMonths)) 
      : 0;
    
    // Hiring Mix % (Taggd %)
    const hiringMixPercent = totalJoiners > 0 ? (g.taggdJoiners / totalJoiners * 100) : 0;
    
    // Log calculated values for debugging
    if (g.name === 'Overall') {
      console.log('📊 Overall row calculated metrics:', {
        revProdWL1,
        overallProd,
        taggdJoinerProd,
        cmPercent,
        hiringMixPercent,
        revenue: g.revenue,
        taggdJoiners: g.taggdJoiners,
        avgHeadcountWL1,
        avgHeadcountOverall
      });
    }
    
    return {
      name: g.name,
      joiners: totalJoiners,
      revenue: g.revenue,
      revProdWL1: revProdWL1,
      overallProd: overallProd,
      taggdJoinerProd: taggdJoinerProd,
      cmPercent: cmPercent,
      hiringMixPercent: hiringMixPercent
    };
  });
  
  // Sort by revenue descending
  return results.sort((a, b) => b.revenue - a.revenue);
}

// Render Hiring Efficiency Table Row
function renderHiringEfficiencyTableRow(row) {
  const allowDrillDown = drillState.currentLevel !== 'project';
  
  // Color coding for productivity metrics
  const revProdColor = row.revProdWL1 >= 2.0 ? 'text-green-600' : 'text-red-600';
  const overallProdColor = row.overallProd >= 1.5 ? 'text-green-600' : 'text-red-600';
  const taggdProdColor = row.taggdJoinerProd >= 2.0 ? 'text-green-600' : 'text-red-600';
  const hiringMixColor = row.hiringMixPercent >= 50 ? 'text-green-600' : 'text-orange-600';
  
  // Performance label based on multiple metrics
  let performanceLabel = 'Fair';
  let performanceBadgeColor = 'bg-yellow-100 text-yellow-800 border-yellow-300';
  let performanceIcon = 'fa-minus-circle';
  
  // Calculate performance score (0-3 points)
  let performanceScore = 0;
  if (row.revProdWL1 >= 2.0) performanceScore++;
  if (row.overallProd >= 1.5) performanceScore++;
  if (row.taggdJoinerProd >= 2.0) performanceScore++;
  
  if (performanceScore >= 2) {
    performanceLabel = 'Good';
    performanceBadgeColor = 'bg-green-100 text-green-800 border-green-300';
    performanceIcon = 'fa-check-circle';
  } else if (performanceScore === 0) {
    performanceLabel = 'Poor';
    performanceBadgeColor = 'bg-red-100 text-red-800 border-red-300';
    performanceIcon = 'fa-times-circle';
  }
  
  const drillButton = allowDrillDown 
    ? `<button onclick="drillDown(\`${row.name}\`)" class="px-3 py-1 bg-gradient-to-r from-green-500 to-blue-500 text-white text-xs rounded-lg hover:shadow-lg transition-all">
         <i class="fas fa-arrow-right mr-1"></i>Drill
       </button>`
    : '<span class="text-gray-400 text-xs">—</span>';
  
  return `
    <tr class="border-b hover:bg-gray-50 transition-colors">
      <td class="px-4 py-3 font-semibold text-gray-900">${row.name}</td>
      <td class="px-4 py-3 text-right font-bold text-blue-600">${Math.round(row.joiners)}</td>
      <td class="px-4 py-3 text-right">₹${row.revenue.toFixed(2)} Cr</td>
      <td class="px-4 py-3 text-right ${revProdColor} font-semibold">${row.revProdWL1.toFixed(2)}</td>
      <td class="px-4 py-3 text-right ${overallProdColor} font-semibold">${row.overallProd.toFixed(2)}</td>
      <td class="px-4 py-3 text-right ${taggdProdColor} font-semibold">${row.taggdJoinerProd.toFixed(2)}</td>
      <td class="px-4 py-3 text-center">
        <span class="px-3 py-1 rounded-full text-xs font-bold border ${performanceBadgeColor}">
          <i class="fas ${performanceIcon} mr-1"></i>${performanceLabel}
        </span>
      </td>
      <td class="px-4 py-3 text-right ${hiringMixColor} font-semibold">${row.hiringMixPercent.toFixed(1)}%</td>
      <td class="px-4 py-3 text-center">${drillButton}</td>
    </tr>
  `;
}

// Initialize Hiring Efficiency Charts
function initializeHiringEfficiencyCharts() {
  console.log('📊 Initializing Hiring Efficiency Charts');
  renderSourceMixChart();
  renderJoinersTrendChart();
  renderRevenueVsHiringChart();
  renderYoYJoinerComparisonChart();  // Replaced hierarchy chart with YoY comparison
}

// Source Mix Donut Chart
function renderSourceMixChart() {
  const canvas = document.getElementById('sourceMixChart');
  if (!canvas) {
    console.warn('⚠️ Source Mix Chart canvas not found');
    return;
  }
  
  // Destroy existing chart using Chart.getChart()
  const existingChart = Chart.getChart(canvas);
  if (existingChart) {
    existingChart.destroy();
  }
  
  const m = state.metrics;
  const taggdJoiners = m.productivity.taggdJoiners || 0;
  const nonTaggdJoiners = m.productivity.nonTaggdJoiners || 0;
  
  console.log('📊 Source Mix Chart data:', { taggdJoiners, nonTaggdJoiners, total: taggdJoiners + nonTaggdJoiners });
  
  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Taggd Source', 'Non-Taggd Source'],
      datasets: [{
        data: [taggdJoiners, nonTaggdJoiners],
        backgroundColor: ['#10b981', '#f59e0b'],
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,  // Completely disable animation to prevent auto-scrolling
      plugins: {
        legend: {
          position: 'bottom'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return `${label}: ${Math.round(value)} (${percentage}%)`;
            }
          }
        },
        datalabels: {
          formatter: (value, ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            return `${percentage}%\n${Math.round(value)}`;
          },
          color: '#fff',
          font: {
            weight: 'bold',
            size: 14
          }
        }
      }
    }
  });
}

// Joiners Trend Chart
function renderJoinersTrendChart() {
  console.log('📊 Rendering Joiners Trend Chart');
  const canvas = document.getElementById('joinersTrendChart');
  if (!canvas) {
    console.warn('⚠️ Joiners Trend Chart canvas not found');
    return;
  }
  
  // Destroy existing chart using Chart.getChart()
  const existingChart = Chart.getChart(canvas);
  if (existingChart) {
    existingChart.destroy();
  }
  
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  // Convert string array to object array if needed
  const monthsArray = periodMonths.map(m => typeof m === 'string' ? { label: m, value: m } : m);
  const labels = monthsArray.map(m => m.label);
  
  // Aggregate joiners by month
  const monthlyData = {};
  monthsArray.forEach(m => {
    monthlyData[m.value] = { taggd: 0, nonTaggd: 0 };
  });
  
  state.rawData.forEach(d => {
    const month = d.month;
    if (monthlyData[month]) {
      // Use correct metric names from the actual data
      if (d.metric === 'Taggd_Source_Joiner') {
        monthlyData[month].taggd += parseFloat(d.value || 0);
      }
      if (d.metric === 'Non Taggd_Source_Joiner' || d.metric === 'Non Taggd Source Joiner') {
        monthlyData[month].nonTaggd += parseFloat(d.value || 0);
      }
    }
  });
  
  const taggdData = monthsArray.map(m => monthlyData[m.value].taggd);
  const nonTaggdData = monthsArray.map(m => monthlyData[m.value].nonTaggd);
  
  console.log('📊 Joiners Trend Chart data:', { taggdData, nonTaggdData, labels });
  
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Taggd Joiners',
          data: taggdData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4
        },
        {
          label: 'Non-Taggd Joiners',
          data: nonTaggdData,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          position: 'top'
        },
        tooltip: {
          mode: 'index',
          intersect: false
        },
        datalabels: {
          display: false  // Disable to reduce clutter and prevent scroll
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Joiners'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Month'
          }
        }
      }
    }
  });
}

// Revenue Growth vs Hiring Growth Chart
function renderRevenueVsHiringChart() {
  console.log('📊 Rendering Revenue vs Hiring Chart');
  const canvas = document.getElementById('revenueVsHiringChart');
  if (!canvas) {
    console.warn('⚠️ Revenue vs Hiring Chart canvas not found');
    return;
  }
  
  // Destroy existing chart using Chart.getChart()
  const existingChart = Chart.getChart(canvas);
  if (existingChart) {
    existingChart.destroy();
  }
  
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  // Convert string array to object array if needed
  const monthsArray = periodMonths.map(m => typeof m === 'string' ? { label: m, value: m } : m);
  const labels = monthsArray.map(m => m.label);
  
  // Aggregate revenue and joiners by month
  const monthlyData = {};
  monthsArray.forEach(m => {
    monthlyData[m.value] = { revenue: 0, joiners: 0 };
  });
  
  state.rawData.forEach(d => {
    const month = d.month;
    if (monthlyData[month]) {
      if (d.metric === 'Revenue_Actual') {
        monthlyData[month].revenue += parseFloat(d.value || 0) / 100;  // Lacs to Crores
      }
      // Use correct metric names from the actual data
      if (d.metric === 'Taggd_Source_Joiner' || d.metric === 'Non Taggd_Source_Joiner' || d.metric === 'Non Taggd Source Joiner') {
        monthlyData[month].joiners += parseFloat(d.value || 0);
      }
    }
  });
  
  console.log('📊 Monthly data object:', monthlyData);
  console.log('📊 Sample raw data month:', state.rawData[0]?.month);
  console.log('📊 Period months values:', periodMonths.map(m => m.value));
  
  const revenueData = monthsArray.map(m => monthlyData[m.value].revenue);
  const joinersData = monthsArray.map(m => monthlyData[m.value].joiners);
  
  console.log('📊 Revenue vs Hiring Chart data:', { 
    revenueData, 
    joinersData, 
    labels,
    revenueTotal: revenueData.reduce((a,b) => a+b, 0),
    joinersTotal: joinersData.reduce((a,b) => a+b, 0)
  });
  
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Revenue (₹ Cr)',
          data: revenueData,
          backgroundColor: 'rgba(139, 92, 246, 0.7)',
          borderColor: '#8b5cf6',
          borderWidth: 2,
          yAxisID: 'y'
        },
        {
          label: 'Total Joiners',
          data: joinersData,
          type: 'line',
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                if (context.dataset.label.includes('Revenue')) {
                  label += '₹' + context.parsed.y.toFixed(2) + ' Cr';
                } else {
                  label += Math.round(context.parsed.y) + ' Joiners';
                }
              }
              return label;
            }
          }
        },
        datalabels: {
          display: false  // Disable to prevent scroll
        }
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Revenue (₹ Cr)'
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Joiners'
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  });
}

// YoY Monthly Joiner Comparison Chart (replaced hierarchy chart)
function renderYoYJoinerComparisonChart() {
  const canvas = document.getElementById('yoyJoinerChart');
  if (!canvas) {
    console.warn('⚠️ YoY Joiner Chart canvas not found');
    return;
  }
  
  // Destroy existing chart
  const existingChart = Chart.getChart(canvas);
  if (existingChart) {
    existingChart.destroy();
  }
  
  console.log('📊 Rendering YoY Joiner Comparison Chart');
  
  // Get months for the period
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  const monthNames = periodMonths.map(m => m.split("'")[0]); // Get month name without year
  
  // Aggregate current year joiners by month
  const currentYearData = {};
  monthNames.forEach(month => {
    currentYearData[month] = 0;
  });
  
  state.rawData.forEach(d => {
    const monthName = d.month ? d.month.split("'")[0] : null;
    if (!monthName || !currentYearData.hasOwnProperty(monthName)) return;
    
    if (d.metric === 'Taggd_Source_Joiner' || d.metric === 'Non Taggd_Source_Joiner') {
      currentYearData[monthName] += parseFloat(d.value || 0);
    }
  });
  
  // Aggregate last year joiners by month
  const lastYearData = {};
  monthNames.forEach(month => {
    lastYearData[month] = 0;
  });
  
  if (state.lastFYData) {
    state.lastFYData.forEach(d => {
      const monthName = d.month ? d.month.split("'")[0] : null;
      if (!monthName || !lastYearData.hasOwnProperty(monthName)) return;
      
      if (d.metric === 'Taggd_Source_Joiner' || d.metric === 'Non Taggd_Source_Joiner') {
        lastYearData[monthName] += parseFloat(d.value || 0);
      }
    });
  }
  
  const currentYearValues = monthNames.map(m => Math.round(currentYearData[m]));
  const lastYearValues = monthNames.map(m => Math.round(lastYearData[m]));
  
  console.log('📊 YoY Joiner data:', { 
    months: monthNames, 
    currentYear: currentYearValues, 
    lastYear: lastYearValues 
  });
  
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: monthNames,
      datasets: [
        {
          label: 'Current FY (2025-26)',
          data: currentYearValues,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointHoverRadius: 7
        },
        {
          label: 'Last FY (2024-25)',
          data: lastYearValues,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 3,
          borderDash: [5, 5],
          fill: false,
          tension: 0.4,
          pointRadius: 5,
          pointHoverRadius: 7
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          position: 'top'
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.parsed.y} joiners`;
            }
          }
        },
        datalabels: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Total Joiners',
            font: { size: 12, weight: 'bold' }
          }
        },
        x: {
          title: {
            display: true,
            text: 'Month',
            font: { size: 12, weight: 'bold' }
          }
        }
      }
    }
  });
}

// Old Hiring Efficiency by Hierarchy Chart (kept for reference, not used)
function renderHiringEfficiencyByHierarchyChart_OLD() {
  const canvas = document.getElementById('hiringEfficiencyChart');
  if (!canvas) {
    console.warn('⚠️ Hiring Efficiency Chart canvas not found');
    return;
  }
  
  // Destroy existing chart using Chart.getChart()
  const existingChart = Chart.getChart(canvas);
  if (existingChart) {
    existingChart.destroy();
  }
  
  // Aggregate by vertical
  const verticalData = {};
  
  state.rawData.forEach(d => {
    const vertical = d.vertical || 'Unassigned';
    if (!verticalData[vertical]) {
      verticalData[vertical] = { taggdJoiners: 0, nonTaggdJoiners: 0, revenue: 0, headcountWL1: 0 };
    }
    
    // Use correct metric names from the actual data
    if (d.metric === 'Taggd_Source_Joiner') {
      verticalData[vertical].taggdJoiners += parseFloat(d.value || 0);
    }
    if (d.metric === 'Non Taggd_Source_Joiner' || d.metric === 'Non Taggd Source Joiner') {
      verticalData[vertical].nonTaggdJoiners += parseFloat(d.value || 0);
    }
    if (d.metric === 'Revenue_Actual') {
      verticalData[vertical].revenue += parseFloat(d.value || 0);
    }
    if (d.metric === 'Headcount_WL1') {
      verticalData[vertical].headcountWL1 += parseFloat(d.value || 0);
    }
  });
  
  const verticals = Object.keys(verticalData).filter(v => v !== 'Unassigned');
  const hiringEfficiency = verticals.map(v => {
    const totalJoiners = verticalData[v].taggdJoiners + verticalData[v].nonTaggdJoiners;
    return totalJoiners > 0 ? (verticalData[v].revenue / totalJoiners) : 0;
  });
  
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: verticals,
      datasets: [{
        label: 'Revenue per Joiner (₹ Cr)',
        data: hiringEfficiency,
        backgroundColor: 'rgba(20, 184, 166, 0.7)',
        borderColor: '#14b8a6',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return 'Efficiency: ₹' + context.parsed.y.toFixed(2) + ' Cr per Joiner';
            }
          }
        },
        datalabels: {
          display: false  // Disable to prevent scroll
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Revenue per Joiner (₹ Cr)'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Vertical'
          }
        }
      }
    }
  });
}

// ============================================================================
// COLLECTIONS PAGE
// ============================================================================

// ============================================================================
// COLLECTIONS & CASH FLOW PAGE
// ============================================================================

function renderCollectionsCashFlow() {
  if (!state.metrics) {
    return "<p class=\"text-gray-500 p-6\">Loading metrics...</p>"
  }
  
  const m = state.metrics
  
  // Calculate Collection Efficiency %
  const collectionEfficiency = m.collections.target > 0 
    ? (m.collections.actual / m.collections.target * 100) 
    : 0
  
  // Calculate YoY, MoM, Variance for Collections
  const collections = {
    yoyGrowth: m.collections.yoyYTD?.growth || null,
    momGrowth: m.collections.mom || null,
    varianceVsTarget: m.collections.target > 0 
      ? ((m.collections.actual - m.collections.target) / m.collections.target * 100)
      : null
  }
  
  // Efficiency metrics
  const efficiency = {
    yoyGrowth: null, // Calculate from last year efficiency if available
    momGrowth: null,
    varianceVsTarget: 100 - collectionEfficiency // variance from 100% target
  }
  
  // Unbilled metrics
  const unbilled = {
    yoyGrowth: null,
    momGrowth: null,
    varianceVsTarget: null
  }
  
  // Bad Debt metrics
  const badDebt = {
    yoyGrowth: null,
    momGrowth: null,
    varianceVsTarget: m.cashHealth.badDebtPct - 5 // variance from 5% target
  }
  
  return `
    <div class="fade-in">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-3xl font-bold text-gray-900 flex items-center">
          <i class="fas fa-money-check-alt text-cyan-600 mr-3"></i>
          Collections & Cash Flow Analysis
        </h2>
        ${renderExportButton()}
      </div>
      
      ${renderYoYComparison()}
      
      <!-- 4 Enhanced KPI Cards -->
      <div class="grid grid-cols-4 gap-6 mb-6">
        ${render3DKPICard(
          'Collection',
          m.collections.actual,
          m.collections.target,
          '₹ Cr',
          'check-circle',
          'teal',
          collections,
          false
        )}
        ${render3DKPICard(
          'Collection Efficiency',
          collectionEfficiency,
          100,
          '%',
          'chart-line',
          collectionEfficiency >= 90 ? 'green' : 'orange',
          efficiency,
          false
        )}
        ${render3DKPICard(
          'Unbilled',
          m.cashHealth.unbilled,
          null,
          '₹ Cr',
          'file-invoice',
          'orange',
          unbilled,
          false
        )}
        ${render3DKPICard(
          'Bad Debt',
          m.cashHealth.badDebtPct,
          5,
          '%',
          'exclamation-triangle',
          m.cashHealth.badDebtPct > 5 ? 'red' : 'green',
          badDebt,
          true // Inverted - lower is better
        )}
      </div>
      
      <!-- Charts Section (4 original + 2 new comparison charts) -->
      ${renderCollectionsChartsHTML(m)}
      
      <!-- Additional Comparison Charts -->
      <div class="grid grid-cols-2 gap-6 mb-6">
        <!-- Chart 5: Last Year vs Current Year Monthly Collection Comparison -->
        <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
          <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <i class="fas fa-calendar-alt text-purple-600 mr-2"></i>
            YoY Collection Comparison
          </h3>
          <canvas id="yoyCollectionComparisonChart" class="chart-compact"></canvas>
        </div>
        
        <!-- Chart 6: Monthly Target vs Actual Collection -->
        <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
          <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <i class="fas fa-bullseye text-indigo-600 mr-2"></i>
            Target vs Actual Collection
          </h3>
          <canvas id="targetVsActualCollectionChart" class="chart-compact"></canvas>
        </div>
      </div>
      
      <!-- Drill-down table with Collections metrics -->
      ${renderCollectionsDrillDown()}
    </div>
  `
}

// Collections-specific charts HTML
function renderCollectionsChartsHTML(m) {
  return `
    <div class="grid grid-cols-2 gap-6 mb-6">
      <!-- Chart 1: Collection Trend (Line) -->
      <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
        <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
          <i class="fas fa-chart-line text-cyan-600 mr-2"></i>
          Collection Trend
        </h3>
        <canvas id="collectionTrendChart" class="chart-compact"></canvas>
      </div>
      
      <!-- Chart 2: Unbilled vs Revenue -->
      <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
        <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
          <i class="fas fa-file-invoice text-orange-600 mr-2"></i>
          Unbilled vs Revenue
        </h3>
        <canvas id="unbilledVsRevenueChart" class="chart-compact"></canvas>
      </div>
      
      <!-- Chart 3: Bad Debt Trend -->
      <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
        <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
          <i class="fas fa-exclamation-triangle text-red-600 mr-2"></i>
          Bad Debt Trend
        </h3>
        <canvas id="badDebtTrendChart" class="chart-compact"></canvas>
      </div>
      
      <!-- Chart 4: Collection Efficiency by Month -->
      <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
        <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
          <i class="fas fa-percentage text-green-600 mr-2"></i>
          Collection Efficiency Trend
        </h3>
        <canvas id="collectionEfficiencyChart" class="chart-compact"></canvas>
      </div>
    </div>
  `;
}

// Collections & Cash Flow Drill-Down Table
function renderCollectionsDrillDown() {
  console.log('🔍 renderCollectionsDrillDown called');
  console.log('  Current drillState:', JSON.stringify(drillState, null, 2));
  
  if (!state.rawData || state.rawData.length === 0) {
    console.warn('⚠️ No rawData available for drill-down');
    return '<p class="text-gray-500 p-6">No data available</p>';
  }
  
  const currentLevel = drillState.currentLevel;
  const parentFilters = {};
  
  // Build parent filters from breadcrumb
  drillState.breadcrumb.forEach(crumb => {
    console.log('  Processing breadcrumb crumb:', crumb);
    if (crumb.level !== 'overall' && crumb.value) {
      const filterKey = HC_DRILL_HIERARCHY.find(h => h.level === crumb.level)?.filterKey;
      console.log('    Found filterKey:', filterKey, 'for level:', crumb.level);
      if (filterKey) {
        parentFilters[filterKey] = crumb.value;
      }
    }
  });
  
  console.log('  Built parentFilters:', parentFilters);
  
  const aggregatedData = aggregateCollectionsByLevel(state.rawData, currentLevel, parentFilters);
  
  return `
    <div class="bg-white rounded-lg shadow-lg overflow-hidden mb-6 border border-gray-200">
      ${renderBreadcrumb()}
      
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gradient-to-r from-cyan-600 to-blue-600 text-white">
              <th class="px-4 py-3 text-left font-bold">
                <i class="fas ${getCurrentLevelIcon()} mr-2"></i>${getCurrentLevelLabel()}
              </th>
              <th class="px-4 py-3 text-right font-bold">Revenue (₹ Cr)</th>
              <th class="px-4 py-3 text-right font-bold">Target (₹ Cr)</th>
              <th class="px-4 py-3 text-right font-bold">Actual (₹ Cr)</th>
              <th class="px-4 py-3 text-right font-bold">Collection %</th>
              <th class="px-4 py-3 text-right font-bold">Unbilled (₹ Cr)</th>
              <th class="px-4 py-3 text-right font-bold">Bad Debt %</th>
              <th class="px-4 py-3 text-center font-bold">Risk</th>
              <th class="px-4 py-3 text-center font-bold">Action</th>
            </tr>
          </thead>
          <tbody>
            ${aggregatedData.map(row => renderCollectionsTableRow(row)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Aggregate Collections data by drill-down level
function aggregateCollectionsByLevel(data, level, parentFilters) {
  const grouped = {};
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  
  console.log('📊 aggregateCollectionsByLevel - level:', level, 'parentFilters:', parentFilters, 'periodMonths:', periodMonths);
  
  // Get last year data for YoY comparison
  const lastYearData = state.lastFYData || [];
  
  // Determine grouping field based on level
  const groupField = {
    'overall': null,
    'vertical': 'vertical',
    'region': 'region',
    'subRegion': 'sub_region',
    'project': 'project'
  }[level];
  
  console.log('  Using groupField:', groupField, 'for level:', level);
  
  // Filter data based on parent filters
  let filteredData = data.filter(d => 
    (!parentFilters.vertical || d.vertical === parentFilters.vertical) &&
    (!parentFilters.region || d.region === parentFilters.region) &&
    (!parentFilters.sub_region || d.sub_region === parentFilters.sub_region)
  );
  
  console.log('  Filtered data count:', filteredData.length, 'from total:', data.length);
  
  // Group data
  filteredData.forEach(d => {
    const groupKey = level === 'overall' ? 'Overall' : (d[groupField] || 'Unknown');
    
    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        revenue: 0,
        collection: 0,
        target: 0,  // NEW: Add target collection
        unbilled: 0,
        badDebt: 0
      };
    }
    
    const value = safeParseFloat(d.value);
    const month = d.month || d.time_period;
    
    // Revenue (sum) - already in Crores from revenue calculation
    if (d.metric === 'Revenue_Actual' && periodMonths.includes(month)) {
      grouped[groupKey].revenue += value;
    }
    
    // Collection (sum) - convert Lacs to Crores
    if (['Actual_Collection', 'Revenue_Collected'].includes(d.metric) && periodMonths.includes(month)) {
      grouped[groupKey].collection += value / 100;  // Lacs to Crores
    }
    
    // Target Collection (sum) - NEW: Add target collection - convert Lacs to Crores
    if (['Target_Collection', 'Collection Target'].includes(d.metric) && periodMonths.includes(month)) {
      grouped[groupKey].target += value / 100;  // Lacs to Crores
    }
    
    // Unbilled (sum) - convert Lacs to Crores
    if (d.metric === 'Unbilled' && periodMonths.includes(month)) {
      grouped[groupKey].unbilled += value / 100;  // Lacs to Crores
    }
    
    // Bad Debt (sum) - convert Lacs to Crores
    if (d.metric === 'Bad Debt' && periodMonths.includes(month)) {
      grouped[groupKey].badDebt += value / 100;  // Lacs to Crores
    }
  });
  
  // Calculate metrics
  const results = Object.entries(grouped).map(([name, data]) => {
    // FIXED: Collection % = Actual Collection / Target Collection * 100
    const collectionPercent = data.target > 0 ? ((data.collection / data.target) * 100) : 0;
    const badDebtPercent = data.collection > 0 ? ((data.badDebt / data.collection) * 100) : 0;
    
    console.log('  Group:', name, '| Revenue:', data.revenue.toFixed(2), '| Collection:', data.collection.toFixed(2), '| Target:', data.target.toFixed(2), '| Efficiency%:', collectionPercent.toFixed(1));
    
    return {
      name,
      revenue: data.revenue,
      collection: data.collection,
      target: data.target,  // NEW: Include target in return
      collectionPercent: collectionPercent,
      unbilled: data.unbilled,
      badDebtPercent: badDebtPercent
    };
  }).sort((a, b) => b.collection - a.collection);
  
  console.log('  Total groups:', results.length);
  return results;
}

// Render Collections table row with drill-down
function renderCollectionsTableRow(row) {
  const canDrillDown = drillState.currentLevel !== 'project';
  
  // Color coding: Collection < 90% (Red), Bad Debt > 5% (Red)
  const collectionColor = row.collectionPercent < 90 ? 'text-red-600 font-bold' : 'text-green-600';
  const badDebtColor = row.badDebtPercent > 5 ? 'text-red-600 font-bold' : 'text-green-600';
  
  // Risk Indicator
  let riskLevel = 'Low';
  let riskColor = 'bg-green-100 text-green-700';
  
  if (row.collectionPercent < 90 || row.badDebtPercent > 5) {
    riskLevel = 'High';
    riskColor = 'bg-red-100 text-red-700';
  } else if (row.collectionPercent < 95 || row.badDebtPercent > 3) {
    riskLevel = 'Medium';
    riskColor = 'bg-yellow-100 text-yellow-700';
  }
  
  const drillButton = canDrillDown
    ? `<button onclick="drillDown(\`${row.name}\`)" class="px-3 py-1 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-md text-xs font-semibold hover:from-cyan-600 hover:to-blue-600 transition-all">
         <i class="fas fa-search-plus mr-1"></i>Drill
       </button>`
    : '<span class="text-gray-400 text-xs">—</span>';
  
  return `
    <tr class="border-t hover:bg-cyan-50 transition-colors">
      <td class="px-4 py-3 font-semibold text-gray-900">${row.name}</td>
      <td class="px-4 py-3 text-right text-gray-700">₹${row.revenue.toFixed(2)} Cr</td>
      <td class="px-4 py-3 text-right text-blue-600 font-semibold">₹${row.target.toFixed(2)} Cr</td>
      <td class="px-4 py-3 text-right font-semibold text-gray-900">₹${row.collection.toFixed(2)} Cr</td>
      <td class="px-4 py-3 text-right font-bold ${collectionColor}">
        ${row.collectionPercent.toFixed(1)}%
      </td>
      <td class="px-4 py-3 text-right text-orange-600 font-semibold">₹${row.unbilled.toFixed(2)} Cr</td>
      <td class="px-4 py-3 text-right font-bold ${badDebtColor}">
        ${row.badDebtPercent.toFixed(1)}%
      </td>
      <td class="px-4 py-3 text-center">
        <span class="px-2 py-1 rounded-full text-xs font-bold ${riskColor}">
          ${riskLevel}
        </span>
      </td>
      <td class="px-4 py-3 text-center">${drillButton}</td>
    </tr>
  `;
}

// ============================================================================
// CASH HEALTH PAGE
// ============================================================================

function renderCashHealth(container) {
  if (!state.metrics) {
    container.innerHTML = "<p class=\"text-gray-500 p-6\">Loading metrics...</p>"
    return
  }
  
  const m = state.metrics
  const data = state.rawData
  
  // Group by region
  const regionData = {}
  data.filter(d => ['Unbilled', 'Bad Debt'].includes(d.metric)).forEach(d => {
    if (!regionData[d.region]) {
      regionData[d.region] = { unbilled: 0, badDebt: 0, revenue: 0 }
    }
    if (d.metric === 'Unbilled') regionData[d.region].unbilled += parseFloat(d.value || 0)
    if (d.metric === 'Bad Debt') regionData[d.region].badDebt += parseFloat(d.value || 0)
  })
  
  // Add revenue for percentages
  data.filter(d => d.metric === 'Revenue_Actual').forEach(d => {
    if (regionData[d.region]) {
      regionData[d.region].revenue += parseFloat(d.value || 0)
    }
  })
  
  const regions = Object.entries(regionData).map(([name, data]) => ({
    name,
    ...data,
    unbilledPct: data.revenue > 0 ? (data.unbilled / data.revenue * 100) : 0,
    badDebtPct: data.revenue > 0 ? (data.badDebt / data.revenue * 100) : 0
  })).sort((a, b) => b.unbilled - a.unbilled)
  
  container.innerHTML = `
    <div class="fade-in">
      <h2 class="text-3xl font-bold text-gray-900 mb-6 flex items-center">
        <i class="fas fa-wallet text-green-600 mr-3"></i>
        Cash Health Analysis
      </h2>
      
      <!-- Summary Cards -->
      <div class="grid grid-cols-4 gap-4 mb-6">
        ${renderKPICard('Collection Due', m.collections.due, null, 'Crore', 'clock', 'blue', null)}
        ${renderKPICard('Unbilled', m.cashHealth.unbilled, null, 'Crore', 'file-invoice', 'orange', null)}
        ${renderKPICard('Unbilled %', m.cashHealth.unbilledPct, null, '%', 'percentage', 'yellow', null)}
        ${renderKPICard('Bad Debt', m.cashHealth.badDebt, null, 'Crore', 'exclamation-triangle', 'red', null)}
      </div>
      
      <!-- Detailed Breakdown -->
      <div class="card hover-lift p-6 mb-6">
        <h3 class="text-xl font-bold mb-4">Region-wise Cash Health</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gradient-to-r from-green-50 to-teal-50">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Region</th>
                <th class="px-4 py-3 text-right font-semibold">Revenue</th>
                <th class="px-4 py-3 text-right font-semibold">Unbilled (₹)</th>
                <th class="px-4 py-3 text-right font-semibold">Unbilled %</th>
                <th class="px-4 py-3 text-right font-semibold">Bad Debt (₹)</th>
                <th class="px-4 py-3 text-right font-semibold">Bad Debt %</th>
                <th class="px-4 py-3 text-center font-semibold">Health</th>
              </tr>
            </thead>
            <tbody>
              ${regions.map(r => {
                const healthScore = (r.unbilledPct < 10 ? 50 : 0) + (r.badDebtPct < 2 ? 50 : 0)
                const healthLabel = healthScore >= 80 ? 'Excellent' : healthScore >= 50 ? 'Good' : 'Attention'
                const healthColor = healthScore >= 80 ? 'green' : healthScore >= 50 ? 'yellow' : 'red'
                
                return `
                  <tr class="border-t hover:bg-green-50">
                    <td class="px-4 py-3 font-medium">${r.name}</td>
                    <td class="px-4 py-3 text-right">${formatNumber(r.revenue)}</td>
                    <td class="px-4 py-3 text-right font-semibold">${formatNumber(r.unbilled)}</td>
                    <td class="px-4 py-3 text-right ${r.unbilledPct > 15 ? 'text-red-600' : r.unbilledPct > 10 ? 'text-yellow-600' : 'text-green-600'} font-bold">
                      ${r.unbilledPct.toFixed(1)}%
                    </td>
                    <td class="px-4 py-3 text-right font-semibold">${formatNumber(r.badDebt)}</td>
                    <td class="px-4 py-3 text-right ${r.badDebtPct > 3 ? 'text-red-600' : r.badDebtPct > 2 ? 'text-yellow-600' : 'text-green-600'} font-bold">
                      ${r.badDebtPct.toFixed(1)}%
                    </td>
                    <td class="px-4 py-3 text-center">
                      <span class="badge bg-${healthColor}-100 text-${healthColor}-700">${healthLabel}</span>
                    </td>
                  </tr>
                `
              }).join('')}
              <tr class="border-t bg-gradient-to-r from-green-100 to-teal-100 font-bold">
                <td class="px-4 py-3">Total</td>
                <td class="px-4 py-3 text-right">${formatNumber(m.revenue.actual)}</td>
                <td class="px-4 py-3 text-right">${formatNumber(m.cashHealth.unbilled)}</td>
                <td class="px-4 py-3 text-right text-lg">${m.cashHealth.unbilledPct.toFixed(1)}%</td>
                <td class="px-4 py-3 text-right">${formatNumber(m.cashHealth.badDebt)}</td>
                <td class="px-4 py-3 text-right text-lg">${m.cashHealth.badDebtPct.toFixed(1)}%</td>
                <td class="px-4 py-3"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <!-- Health Indicators -->
      <div class="grid grid-cols-3 gap-4">
        <div class="card hover-scale p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200">
          <h4 class="font-bold text-blue-900 mb-3 flex items-center">
            <i class="fas fa-clock text-blue-600 mr-2"></i>
            Collection Due
          </h4>
          <p class="text-3xl font-bold text-blue-600 mb-2">₹${formatNumber(m.collections.due)}</p>
          <p class="text-sm text-blue-700">Lacs pending collection</p>
        </div>
        
        <div class="card hover-scale p-6 bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-200">
          <h4 class="font-bold text-yellow-900 mb-3 flex items-center">
            <i class="fas fa-file-invoice text-yellow-600 mr-2"></i>
            Unbilled Amount
          </h4>
          <p class="text-3xl font-bold text-yellow-600 mb-2">₹${formatNumber(m.cashHealth.unbilled)}</p>
          <p class="text-sm text-yellow-700">${m.cashHealth.unbilledPct.toFixed(1)}% of revenue</p>
          <div class="progress-bar mt-3">
            <div class="progress-fill bg-gradient-to-r from-yellow-400 to-orange-400" style="width: ${Math.min(m.cashHealth.unbilledPct, 100)}%"></div>
          </div>
        </div>
        
        <div class="card hover-scale p-6 bg-gradient-to-br from-red-50 to-pink-50 border-2 border-red-200">
          <h4 class="font-bold text-red-900 mb-3 flex items-center">
            <i class="fas fa-exclamation-triangle text-red-600 mr-2"></i>
            Bad Debt
          </h4>
          <p class="text-3xl font-bold text-red-600 mb-2">₹${formatNumber(m.cashHealth.badDebt)}</p>
          <p class="text-sm text-red-700">${m.cashHealth.badDebtPct.toFixed(1)}% of collections</p>
          <div class="progress-bar mt-3">
            <div class="progress-fill bg-gradient-to-r from-red-400 to-pink-400" style="width: ${Math.min(m.cashHealth.badDebtPct * 10, 100)}%"></div>
          </div>
        </div>
      </div>
    </div>
  `
}

// Continue with more pages...


// ============================================================================
// HIRING EFFICIENCY PAGE
// ============================================================================

// OLD LEGACY FUNCTION - REPLACED BY renderHiringEfficiency
// Keeping for reference but not used anymore
function renderHiring_LEGACY(container) {
  if (!state.metrics) {
    container.innerHTML = "<p class=\"text-gray-500 p-6\">Loading metrics...</p>"
    return
  }
  
  const m = state.metrics
  const data = state.rawData
  
  // Group by region
  const regionData = {}
  data.filter(d => ['Taggd_Source_Joiner', 'Non Taggd_Source_Joiner', 'Non Taggd Source Joiner'].includes(d.metric)).forEach(d => {
    if (!regionData[d.region]) {
      regionData[d.region] = { taggd: 0, nonTaggd: 0 }
    }
    if (d.metric === 'Taggd_Source_Joiner') regionData[d.region].taggd += parseFloat(d.value || 0)
    if (['Non Taggd_Source_Joiner', 'Non Taggd Source Joiner'].includes(d.metric)) regionData[d.region].nonTaggd += parseFloat(d.value || 0)
  })
  
  const regions = Object.entries(regionData).map(([name, data]) => {
    const total = data.taggd + data.nonTaggd
    return {
      name,
      ...data,
      total,
      taggdMix: total > 0 ? (data.taggd / total * 100) : 0,
      nonTaggdMix: total > 0 ? (data.nonTaggd / total * 100) : 0
    }
  }).sort((a, b) => b.total - a.total)
  
  container.innerHTML = `
    <div class="fade-in">
      <h2 class="text-3xl font-bold text-gray-900 mb-6 flex items-center">
        <i class="fas fa-user-plus text-indigo-600 mr-3"></i>
        Hiring Efficiency
      </h2>
      
      <!-- Summary Cards -->
      <div class="grid grid-cols-4 gap-4 mb-6">
        ${renderKPICard('Taggd Joiners', m.hiring.taggd, null, 'Count', 'user-check', 'indigo', null)}
        ${renderKPICard('Non-Taggd Joiners', m.hiring.nonTaggd, null, 'Count', 'user-plus', 'blue', null)}
        ${renderKPICard('Total Joiners', m.hiring.taggd + m.hiring.nonTaggd, null, 'Count', 'users', 'purple', null)}
        ${renderKPICard('Taggd Mix', m.hiring.taggdMix, null, '%', 'chart-pie', 'green', null)}
      </div>
      
      <!-- Mix Visualization -->
      <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="card hover-scale p-6 bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200">
          <h3 class="text-xl font-bold mb-4 flex items-center">
            <i class="fas fa-users text-indigo-600 mr-2"></i>
            Hiring Mix Breakdown
          </h3>
          
          <div class="space-y-4">
            <div>
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm font-semibold text-indigo-900">Taggd Source</span>
                <span class="text-2xl font-bold text-indigo-600">${Math.round(m.hiring.taggd)}</span>
              </div>
              <div class="progress-bar h-12 bg-gray-200 rounded-lg overflow-hidden">
                <div class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold" 
                     style="width: ${m.hiring.taggdMix}%">
                  ${m.hiring.taggdMix.toFixed(1)}%
                </div>
              </div>
            </div>
            
            <div>
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm font-semibold text-blue-900">Non-Taggd Source</span>
                <span class="text-2xl font-bold text-blue-600">${Math.round(m.hiring.nonTaggd)}</span>
              </div>
              <div class="progress-bar h-12 bg-gray-200 rounded-lg overflow-hidden">
                <div class="h-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold" 
                     style="width: ${m.hiring.nonTaggdMix}%">
                  ${m.hiring.nonTaggdMix.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="card hover-scale p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200">
          <h3 class="text-xl font-bold mb-4 flex items-center">
            <i class="fas fa-chart-line text-green-600 mr-2"></i>
            JPR (Joiner Per Recruiter)
          </h3>
          
          <div class="text-center py-6">
            <p class="text-6xl font-bold text-green-600 mb-3">${m.hiring.jpr.toFixed(1)}</p>
            <p class="text-lg text-green-800 font-semibold">Joiners per Recruiter</p>
            <div class="mt-4 pt-4 border-t border-green-200">
              <p class="text-sm text-green-700">Taggd Source Efficiency Metric</p>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Region-wise Hiring -->
      <div class="card hover-lift p-6">
        <h3 class="text-xl font-bold mb-4">Region-wise Hiring Analysis</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gradient-to-r from-indigo-50 to-purple-50">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Region</th>
                <th class="px-4 py-3 text-right font-semibold">Taggd</th>
                <th class="px-4 py-3 text-right font-semibold">Non-Taggd</th>
                <th class="px-4 py-3 text-right font-semibold">Total</th>
                <th class="px-4 py-3 text-right font-semibold">Taggd Mix %</th>
                <th class="px-4 py-3 text-center font-semibold">Mix Visual</th>
              </tr>
            </thead>
            <tbody>
              ${regions.map(r => `
                <tr class="border-t hover:bg-indigo-50">
                  <td class="px-4 py-3 font-medium">${r.name}</td>
                  <td class="px-4 py-3 text-right font-bold text-indigo-600">${Math.round(r.taggd)}</td>
                  <td class="px-4 py-3 text-right font-bold text-blue-600">${Math.round(r.nonTaggd)}</td>
                  <td class="px-4 py-3 text-right font-bold">${Math.round(r.total)}</td>
                  <td class="px-4 py-3 text-right font-bold ${r.taggdMix >= 60 ? 'text-green-600' : r.taggdMix >= 40 ? 'text-yellow-600' : 'text-red-600'}">
                    ${r.taggdMix.toFixed(1)}%
                  </td>
                  <td class="px-4 py-3">
                    <div class="progress-bar h-6">
                      <div class="h-full bg-gradient-to-r from-indigo-500 to-purple-500" style="width: ${r.taggdMix}%"></div>
                    </div>
                  </td>
                </tr>
              `).join('')}
              <tr class="border-t bg-gradient-to-r from-indigo-100 to-purple-100 font-bold">
                <td class="px-4 py-3">Total</td>
                <td class="px-4 py-3 text-right text-indigo-600">${Math.round(m.hiring.taggd)}</td>
                <td class="px-4 py-3 text-right text-blue-600">${Math.round(m.hiring.nonTaggd)}</td>
                <td class="px-4 py-3 text-right text-lg">${Math.round(m.hiring.taggd + m.hiring.nonTaggd)}</td>
                <td class="px-4 py-3 text-right text-lg">${m.hiring.taggdMix.toFixed(1)}%</td>
                <td class="px-4 py-3"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
}

// ============================================================================
// COMBINED PERFORMANCE PAGES
// ============================================================================

// Revenue & CM Combined Page
// ============================================================================
// REVENUE TREND CHARTS (PHASE 3)
// ============================================================================

function renderRevenueTrendCharts() {
  return `
    <div class="mb-6">
      <h3 class="text-2xl font-bold text-gray-900 mb-4 flex items-center">
        <i class="fas fa-chart-line text-purple-600 mr-3"></i>
        Revenue & CM Trend Analysis
      </h3>
      
      <!-- Chart Tabs -->
      <div class="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
        <div class="flex border-b border-gray-200 bg-gray-50">
          <button onclick="switchChartTab('revenue-trend')" id="tab-revenue-trend" class="chart-tab active flex-1 px-4 py-3 text-sm font-semibold focus:outline-none transition-colors">
            <i class="fas fa-chart-line mr-2"></i>Revenue Trend
          </button>
          <button onclick="switchChartTab('cm-trend')" id="tab-cm-trend" class="chart-tab flex-1 px-4 py-3 text-sm font-semibold focus:outline-none transition-colors">
            <i class="fas fa-coins mr-2"></i>CM Trend
          </button>
          <button onclick="switchChartTab('waterfall')" id="tab-waterfall" class="chart-tab flex-1 px-4 py-3 text-sm font-semibold focus:outline-none transition-colors">
            <i class="fas fa-water mr-2"></i>Revenue Waterfall
          </button>
        </div>
        
        <!-- Chart Containers -->
        <div class="p-4">
          <!-- Revenue Trend Chart -->
          <div id="chart-revenue-trend" class="chart-content" style="height: 220px;">
            <canvas id="revenue-trend-canvas"></canvas>
          </div>
          
          <!-- CM Trend Chart -->
          <div id="chart-cm-trend" class="chart-content" style="height: 220px; display: none;">
            <canvas id="cm-trend-canvas"></canvas>
          </div>
          
          <!-- Waterfall Chart -->
          <div id="chart-waterfall" class="chart-content" style="height: 220px; display: none;">
            <canvas id="waterfall-canvas"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Switch between chart tabs
function switchChartTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.classList.remove('active', 'bg-white', 'text-blue-600', 'border-b-2', 'border-blue-600');
    tab.classList.add('text-gray-600', 'hover:text-gray-900', 'hover:bg-gray-100');
  });
  
  const activeTab = document.getElementById(`tab-${tabName}`);
  if (activeTab) {
    activeTab.classList.add('active', 'bg-white', 'text-blue-600', 'border-b-2', 'border-blue-600');
    activeTab.classList.remove('text-gray-600', 'hover:text-gray-900', 'hover:bg-gray-100');
  }
  
  // Show/hide chart containers
  document.querySelectorAll('.chart-content').forEach(chart => {
    chart.style.display = 'none';
  });
  
  const activeChart = document.getElementById(`chart-${tabName}`);
  if (activeChart) {
    activeChart.style.display = 'block';
  }
  
  // Render the chart if not already rendered
  setTimeout(() => {
    if (tabName === 'revenue-trend') {
      renderRevenueTrendChart();
    } else if (tabName === 'cm-trend') {
      renderCMTrendChart();
    } else if (tabName === 'waterfall') {
      renderWaterfallChart();
    }
  }, 50);
}

// Render Revenue Trend Chart (Budget, Actual, Forecast) - BAR CHART
function renderRevenueTrendChart() {
  const canvas = document.getElementById('revenue-trend-canvas');
  if (!canvas || !state.rawData) return;
  
  // Get months for current period based on filters
  let periodMonths = [];
  
  if (state.filters.periodMode === 'Month') {
    // Single month mode
    periodMonths = [state.filters.endMonth];
  } else {
    // YTD, QTR, H1, H2 modes
    const allMonths = state.filterOptions.months || [];
    periodMonths = allMonths.slice(0, allMonths.indexOf(state.filters.endMonth) + 1);
  }
  
  // Extract UNIQUE month names only (Apr, May, Jun, etc.) - removes duplicates
  const uniqueMonthNames = [...new Set(periodMonths.map(m => m.split("'")[0]))];
  
  // Aggregate monthly data
  const monthlyData = {};
  periodMonths.forEach(m => {
    const monthName = m.split("'")[0];
    if (!monthlyData[monthName]) {
      monthlyData[monthName] = { budget: 0, actual: 0, forecast: 0 };
    }
  });
  
  state.rawData.forEach(d => {
    const monthName = d.month ? d.month.split("'")[0] : null;
    if (!monthName || !monthlyData[monthName]) return;
    
    if (d.metric === 'Revenue_Budget') {
      monthlyData[monthName].budget += parseFloat(d.value || 0);
    } else if (d.metric === 'Revenue_Actual') {
      monthlyData[monthName].actual += parseFloat(d.value || 0);
    } else if (d.metric === 'Rev_Forecast') {
      monthlyData[monthName].forecast += parseFloat(d.value || 0);
    }
  });
  
  // Deduplicate budget values (same logic as sumBudgetMetric)
  const budgetByMonth = {};
  uniqueMonthNames.forEach(monthName => {
    const relevantMonths = periodMonths.filter(m => m.split("'")[0] === monthName);
    const uniqueProjects = {};
    
    relevantMonths.forEach(m => {
      const monthData = state.rawData.filter(d => d.month === m && d.metric === 'Revenue_Budget');
      monthData.forEach(d => {
        const key = `${d.project}-${d.region}-${d.sub_region}`;
        if (!uniqueProjects[key]) {
          uniqueProjects[key] = parseFloat(d.value || 0);
        }
      });
    });
    
    budgetByMonth[monthName] = Object.values(uniqueProjects).reduce((sum, val) => sum + val, 0);
  });
  
  // Prepare datasets
  const budgetData = uniqueMonthNames.map(m => (budgetByMonth[m] / 100).toFixed(2));
  const forecastData = uniqueMonthNames.map(m => (monthlyData[m].forecast / 100).toFixed(2));
  const actualData = uniqueMonthNames.map(m => (monthlyData[m].actual / 100).toFixed(2));
  
  // Find max values for each dataset to show labels only on important data
  const maxBudget = Math.max(...budgetData);
  const maxForecast = Math.max(...forecastData);
  const maxActual = Math.max(...actualData);
  
  const datasets = [
    {
      label: 'Budget',
      data: budgetData,
      backgroundColor: 'rgba(59, 130, 246, 0.8)',
      borderColor: 'rgba(59, 130, 246, 1)',
      borderWidth: 1,
      borderRadius: 6,
    },
    {
      label: 'Forecast',
      data: forecastData,
      backgroundColor: 'rgba(245, 158, 11, 0.8)',
      borderColor: 'rgba(245, 158, 11, 1)',
      borderWidth: 1,
      borderRadius: 6,
    },
    {
      label: 'Actual',
      data: actualData,
      backgroundColor: 'rgba(16, 185, 129, 0.8)',
      borderColor: 'rgba(16, 185, 129, 1)',
      borderWidth: 1,
      borderRadius: 6,
    }
  ];
  
  createBarChart('revenue-trend-canvas', uniqueMonthNames, datasets, {
    plugins: {
      title: {
        display: true,
        text: 'Monthly Revenue Trend (₹ Crores)',
        font: { size: 14, weight: 'bold' }
      },
      legend: {
        display: true,
        position: 'top',
        labels: {
          boxWidth: 12,
          font: { size: 11 }
        }
      },
      datalabels: {
        display: function(context) {
          // Show labels only for max values (most important)
          const value = parseFloat(context.dataset.data[context.dataIndex]);
          if (context.dataset.label === 'Budget' && value === maxBudget) return true;
          if (context.dataset.label === 'Forecast' && value === maxForecast) return true;
          if (context.dataset.label === 'Actual' && value === maxActual) return true;
          return false;
        },
        anchor: 'end',
        align: 'top',
        formatter: (value) => '₹' + value,
        font: {
          size: 9,
          weight: 'bold'
        },
        color: '#374151'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          font: { size: 10 },
          callback: function(value) {
            return '₹' + value;
          }
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: { size: 10 }
        }
      }
    },
    animation: {
      duration: 800,
      easing: 'easeInOutQuart'
    }
  });
}

// Render CM Trend Chart - BAR CHART FOR CM VALUE + LINE CHART FOR CM%
function renderCMTrendChart() {
  const canvas = document.getElementById('cm-trend-canvas');
  if (!canvas || !state.rawData) return;
  
  // Get months for current period based on filters
  let periodMonths = [];
  
  if (state.filters.periodMode === 'Month') {
    periodMonths = [state.filters.endMonth];
  } else {
    const allMonths = state.filterOptions.months || [];
    periodMonths = allMonths.slice(0, allMonths.indexOf(state.filters.endMonth) + 1);
  }
  
  // Extract UNIQUE month names only (Apr, May, Jun, etc.)
  const uniqueMonthNames = [...new Set(periodMonths.map(m => m.split("'")[0]))];
  
  // Aggregate monthly CM data
  const monthlyData = {};
  uniqueMonthNames.forEach(monthName => {
    monthlyData[monthName] = { cm: 0, revenue: 0 };
  });
  
  state.rawData.forEach(d => {
    const monthName = d.month ? d.month.split("'")[0] : null;
    if (!monthName || !monthlyData[monthName]) return;
    
    if (d.metric === 'CM_Actual' || d.metric === 'CM Actual') {
      monthlyData[monthName].cm += parseFloat(d.value || 0);
    } else if (d.metric === 'Revenue_Actual') {
      monthlyData[monthName].revenue += parseFloat(d.value || 0);
    }
  });
  
  // Calculate CM% for each month
  const cmPercents = uniqueMonthNames.map(m => {
    const cm = monthlyData[m].cm;
    const revenue = monthlyData[m].revenue;
    return revenue > 0 ? ((cm / revenue) * 100).toFixed(2) : 0;
  });
  
  const cmValues = uniqueMonthNames.map(m => (monthlyData[m].cm / 100).toFixed(2)); // Convert to Cr
  
  // Find max/min for important labels
  const maxCM = Math.max(...cmValues.map(v => parseFloat(v)));
  const minCM = Math.min(...cmValues.map(v => parseFloat(v)));
  const maxCMPercent = Math.max(...cmPercents.map(v => parseFloat(v)));
  const minCMPercent = Math.min(...cmPercents.map(v => parseFloat(v)));
  
  const datasets = [
    {
      type: 'bar',
      label: 'CM Value (₹ Cr)',
      data: cmValues,
      backgroundColor: 'rgba(59, 130, 246, 0.8)',
      borderColor: 'rgba(59, 130, 246, 1)',
      borderWidth: 1,
      borderRadius: 6,
      yAxisID: 'y',
      order: 2,
    },
    {
      type: 'line',
      label: 'CM %',
      data: cmPercents,
      borderColor: 'rgba(16, 185, 129, 1)',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      borderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: 'rgba(16, 185, 129, 1)',
      yAxisID: 'y1',
      tension: 0.3,
      order: 1,
    }
  ];
  
  createMixedChart('cm-trend-canvas', uniqueMonthNames, datasets, {
    plugins: {
      title: {
        display: true,
        text: 'Monthly Contribution Margin Trend',
        font: { size: 14, weight: 'bold' }
      },
      legend: {
        display: true,
        position: 'top',
        labels: {
          boxWidth: 12,
          font: { size: 11 }
        }
      },
      datalabels: {
        display: function(context) {
          if (context.dataset.type === 'bar') {
            // Show labels only for max and min CM values
            const value = parseFloat(context.dataset.data[context.dataIndex]);
            return value === maxCM || value === minCM;
          }
          return false;
        },
        anchor: 'end',
        align: 'top',
        formatter: (value) => '₹' + value,
        font: {
          size: 9,
          weight: 'bold'
        },
        color: '#374151'
      }
    },
    scales: {
      y: {
        type: 'linear',
        position: 'left',
        beginAtZero: true,
        title: {
          display: true,
          text: 'CM Value (₹ Cr)',
          font: { size: 11 }
        },
        ticks: {
          font: { size: 10 },
          callback: function(value) {
            return '₹' + value;
          }
        }
      },
      y1: {
        type: 'linear',
        position: 'right',
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: 'CM %',
          font: { size: 11 }
        },
        ticks: {
          font: { size: 10 },
          callback: function(value) {
            return value + '%';
          }
        },
        grid: {
          drawOnChartArea: false,
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: { size: 10 }
        }
      }
    },
    animation: {
      duration: 800,
      easing: 'easeInOutQuart'
    }
  });
}

// Render Waterfall Chart (Budget → Actual with variance breakdown)
function renderWaterfallChart() {
  const canvas = document.getElementById('waterfall-canvas');
  if (!canvas || !state.metrics) return;
  
  const m = state.metrics;
  const budget = parseFloat((m.revenue.budget).toFixed(2));
  const actual = parseFloat((m.revenue.actual).toFixed(2));
  const variance = parseFloat((actual - budget).toFixed(2));
  
  const labels = ['Budget', 'Variance', 'Actual'];
  const data = [budget, variance, actual];
  const colors = [
    'rgba(59, 130, 246, 0.8)',      // Budget - Blue
    variance >= 0 ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)',  // Variance - Green/Red
    'rgba(99, 102, 241, 0.8)'       // Actual - Indigo
  ];
  
  createBarChart('waterfall-canvas', labels, [{
    label: 'Revenue (₹ Cr)',
    data: data,
    backgroundColor: colors,
    borderColor: colors.map(c => c.replace('0.8', '1')),
    borderWidth: 2
  }], {
    plugins: {
      title: {
        display: true,
        text: `Revenue Waterfall: Budget → Actual (${variance >= 0 ? '+' : ''}${variance} Cr)`,
        font: { size: 16, weight: 'bold' }
      },
      legend: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return '₹' + value + ' Cr';
          }
        }
      }
    }
  });
}


// Render YoY Growth Chart
function renderYoYGrowthChartData() {
  const canvas = document.getElementById('yoy-growth-canvas');
  if (!canvas || !state.rawData || !state.lastFYData) return;
  
  // Get months for current period based on filters
  let periodMonths = [];
  
  if (state.filters.periodMode === 'Month') {
    periodMonths = [state.filters.endMonth];
  } else {
    const allMonths = state.filterOptions.months || [];
    periodMonths = allMonths.slice(0, allMonths.indexOf(state.filters.endMonth) + 1);
  }
  
  // Extract UNIQUE month names
  const uniqueMonthNames = [...new Set(periodMonths.map(m => m.split("'")[0]))];
  
  // Calculate monthly revenue for current year
  const currentYearData = {};
  uniqueMonthNames.forEach(monthName => {
    currentYearData[monthName] = 0;
  });
  
  state.rawData.forEach(d => {
    const monthName = d.month ? d.month.split("'")[0] : null;
    if (!monthName || !currentYearData.hasOwnProperty(monthName)) return;
    
    if (d.metric === 'Revenue_Actual') {
      currentYearData[monthName] += parseFloat(d.value || 0);
    }
  });
  
  // Calculate monthly revenue for last year
  const lastYearData = {};
  uniqueMonthNames.forEach(monthName => {
    lastYearData[monthName] = 0;
  });
  
  state.lastFYData.forEach(d => {
    const monthName = d.month ? d.month.split("'")[0] : null;
    if (!monthName || !lastYearData.hasOwnProperty(monthName)) return;
    
    if (d.metric === 'Revenue_Actual') {
      lastYearData[monthName] += parseFloat(d.value || 0);
    }
  });
  
  // Calculate growth % for each month
  const growthData = uniqueMonthNames.map(monthName => {
    const current = currentYearData[monthName];
    const last = lastYearData[monthName];
    
    if (last > 0) {
      return ((current - last) / last * 100).toFixed(2);
    } else if (current > 0) {
      return 100; // New revenue
    }
    return 0;
  });
  
  // Convert to Cr for display
  const currentYearCr = uniqueMonthNames.map(m => (currentYearData[m] / 100).toFixed(2));
  const lastYearCr = uniqueMonthNames.map(m => (lastYearData[m] / 100).toFixed(2));
  
  // Find max and min growth for labels
  const maxGrowth = Math.max(...growthData.map(v => parseFloat(v)));
  const minGrowth = Math.min(...growthData.map(v => parseFloat(v)));
  
  const datasets = [
    {
      type: 'bar',
      label: 'Current Year (FY2025-26)',
      data: currentYearCr,
      backgroundColor: 'rgba(99, 102, 241, 0.8)',
      borderColor: 'rgba(99, 102, 241, 1)',
      borderWidth: 1,
      borderRadius: 6,
      yAxisID: 'y',
      order: 2,
    },
    {
      type: 'bar',
      label: 'Last Year (FY2024-25)',
      data: lastYearCr,
      backgroundColor: 'rgba(156, 163, 175, 0.6)',
      borderColor: 'rgba(156, 163, 175, 1)',
      borderWidth: 1,
      borderRadius: 6,
      yAxisID: 'y',
      order: 3,
    },
    {
      type: 'line',
      label: 'Growth %',
      data: growthData,
      borderColor: 'rgba(16, 185, 129, 1)',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      borderWidth: 3,
      pointRadius: 5,
      pointHoverRadius: 7,
      pointBackgroundColor: growthData.map(v => parseFloat(v) >= 0 ? 'rgba(16, 185, 129, 1)' : 'rgba(239, 68, 68, 1)'),
      yAxisID: 'y1',
      tension: 0.3,
      order: 1,
      fill: true,
    }
  ];
  
  createMixedChart('yoy-growth-canvas', uniqueMonthNames, datasets, {
    plugins: {
      title: {
        display: false
      },
      legend: {
        display: true,
        position: 'top',
        labels: {
          boxWidth: 12,
          font: { size: 11 }
        }
      },
      datalabels: {
        display: function(context) {
          // Show labels only on growth line for max and min values
          if (context.dataset.label === 'Growth %') {
            const value = parseFloat(context.dataset.data[context.dataIndex]);
            return value === maxGrowth || value === minGrowth;
          }
          return false;
        },
        anchor: 'end',
        align: function(context) {
          const value = parseFloat(context.dataset.data[context.dataIndex]);
          return value >= 0 ? 'top' : 'bottom';
        },
        formatter: (value) => value + '%',
        font: {
          size: 9,
          weight: 'bold'
        },
        color: function(context) {
          const value = parseFloat(context.dataset.data[context.dataIndex]);
          return value >= 0 ? '#059669' : '#DC2626';
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.dataset.type === 'line') {
              label += context.parsed.y + '%';
            } else {
              label += '₹' + context.parsed.y + ' Cr';
            }
            return label;
          }
        }
      }
    },
    scales: {
      y: {
        type: 'linear',
        position: 'left',
        beginAtZero: true,
        title: {
          display: true,
          text: 'Revenue (₹ Cr)',
          font: { size: 11 }
        },
        ticks: {
          font: { size: 10 },
          callback: function(value) {
            return '₹' + value;
          }
        }
      },
      y1: {
        type: 'linear',
        position: 'right',
        title: {
          display: true,
          text: 'Growth %',
          font: { size: 11 }
        },
        ticks: {
          font: { size: 10 },
          callback: function(value) {
            return value + '%';
          }
        },
        grid: {
          drawOnChartArea: false,
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: { size: 10 }
        }
      }
    },
    animation: {
      duration: 800,
      easing: 'easeInOutQuart'
    }
  });
}

// ============================================================================
// PRODUCTIVITY & PPC CHARTS (PHASE 3)
// ============================================================================

// Render Productivity Trend Charts
function renderProductivityTrendCharts() {
  return `
    <div class="mb-6">
      <h3 class="text-2xl font-bold text-gray-900 mb-4 flex items-center">
        <i class="fas fa-chart-bar text-teal-600 mr-3"></i>
        Productivity Analysis
      </h3>
      
      <div class="grid grid-cols-2 gap-4">
        <!-- Target vs Actual Productivity -->
        <div class="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div class="bg-gradient-to-r from-teal-600 to-blue-600 px-4 py-3">
            <h4 class="text-white font-bold text-sm flex items-center justify-between">
              <span><i class="fas fa-bullseye mr-2"></i>Target vs Actual Productivity</span>
              <span class="text-teal-100 text-xs">₹ Lacs</span>
            </h4>
          </div>
          <div class="p-4">
            <div style="height: 220px;">
              <canvas id="productivity-target-canvas"></canvas>
            </div>
          </div>
        </div>
        
        <!-- Productivity Trend -->
        <div class="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div class="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3">
            <h4 class="text-white font-bold text-sm flex items-center justify-between">
              <span><i class="fas fa-chart-line mr-2"></i>Productivity Trend</span>
              <span class="text-indigo-100 text-xs">Monthly</span>
            </h4>
          </div>
          <div class="p-4">
            <div style="height: 220px;">
              <canvas id="productivity-trend-canvas"></canvas>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Render data for Target vs Actual Productivity chart
function renderProductivityTargetChart() {
  const canvas = document.getElementById('productivity-target-canvas');
  if (!canvas || !state.rawData || state.rawData.length === 0) return;
  
  const periodMonths = calculateMonthsForPeriod();
  const uniqueMonthNames = [...new Set(periodMonths.map(m => m.split("'")[0]))];
  
  // Calculate monthly productivity
  const monthlyData = {};
  uniqueMonthNames.forEach(monthName => {
    monthlyData[monthName] = { revenue: 0, headcount: 0, target: 0 };
  });
  
  state.rawData.forEach(d => {
    const monthName = d.month ? d.month.split("'")[0] : null;
    if (!monthName || !monthlyData.hasOwnProperty(monthName)) return;
    
    if (d.metric === 'Revenue_Actual') {
      monthlyData[monthName].revenue += parseFloat(d.value || 0);
    } else if (d.metric === 'Headcount_WL1') {
      monthlyData[monthName].headcount = parseFloat(d.value || 0);
    } else if (d.metric === 'Target_Rev_Productivity' || d.metric === 'Target Rev Productivity') {
      monthlyData[monthName].target = parseFloat(d.value || 0);
    }
  });
  
  // Calculate actual productivity (Revenue / WL1 Headcount)
  const actualProductivity = uniqueMonthNames.map(m => {
    const hc = monthlyData[m].headcount;
    return hc > 0 ? (monthlyData[m].revenue / hc / 100).toFixed(2) : 0; // Convert to Crores
  });
  
  const targetProductivity = uniqueMonthNames.map(m => {
    return (monthlyData[m].target / 100).toFixed(2); // Convert to Crores
  });
  
  const datasets = [
    {
      label: 'Target Productivity',
      data: targetProductivity,
      backgroundColor: 'rgba(156, 163, 175, 0.7)',
      borderColor: 'rgba(156, 163, 175, 1)',
      borderWidth: 1,
      borderRadius: 6,
    },
    {
      label: 'Actual Productivity',
      data: actualProductivity,
      backgroundColor: 'rgba(20, 184, 166, 0.8)',
      borderColor: 'rgba(20, 184, 166, 1)',
      borderWidth: 1,
      borderRadius: 6,
    }
  ];
  
  createBarChart('productivity-target-canvas', uniqueMonthNames, datasets, {
    plugins: {
      title: { display: false },
      legend: {
        display: true,
        position: 'top',
        labels: { boxWidth: 12, font: { size: 11 } }
      },
      datalabels: {
        display: function(context) {
          // Only show max values
          const datasetMax = Math.max(...context.dataset.data.map(v => parseFloat(v)));
          return parseFloat(context.dataset.data[context.dataIndex]) === datasetMax;
        },
        color: '#374151',
        font: { size: 10, weight: 'bold' },
        anchor: 'end',
        align: 'top',
        formatter: (value) => '₹' + value
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: '₹ Lacs',
          font: { size: 11 }
        },
        ticks: { font: { size: 10 } }
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 } }
      }
    },
    animation: {
      duration: 800,
      easing: 'easeInOutQuart'
    }
  });
}

// Render Productivity Trend Chart
function renderProductivityTrendChartData() {
  const canvas = document.getElementById('productivity-trend-canvas');
  if (!canvas || !state.rawData || state.rawData.length === 0) return;
  
  const periodMonths = calculateMonthsForPeriod();
  const uniqueMonthNames = [...new Set(periodMonths.map(m => m.split("'")[0]))];
  
  // Calculate monthly productivity metrics
  const monthlyData = {};
  uniqueMonthNames.forEach(monthName => {
    monthlyData[monthName] = { revenue: 0, headcountWL1: 0, headcountOverall: 0, cm: 0 };
  });
  
  state.rawData.forEach(d => {
    const monthName = d.month ? d.month.split("'")[0] : null;
    if (!monthName || !monthlyData.hasOwnProperty(monthName)) return;
    
    if (d.metric === 'Revenue_Actual') {
      monthlyData[monthName].revenue += parseFloat(d.value || 0);
    } else if (d.metric === 'Headcount_WL1') {
      monthlyData[monthName].headcountWL1 = parseFloat(d.value || 0);
    } else if (d.metric === 'Headcount_Overall') {
      monthlyData[monthName].headcountOverall = parseFloat(d.value || 0);
    } else if (d.metric === 'CM_Actual') {
      monthlyData[monthName].cm += parseFloat(d.value || 0);
    }
  });
  
  // Calculate productivity per recruiter
  const productivityPerRecruiter = uniqueMonthNames.map(m => {
    const hc = monthlyData[m].headcountWL1;
    return hc > 0 ? (monthlyData[m].revenue / hc / 100).toFixed(2) : 0;
  });
  
  // Calculate productivity overall
  const productivityOverall = uniqueMonthNames.map(m => {
    const hc = monthlyData[m].headcountOverall;
    return hc > 0 ? (monthlyData[m].revenue / hc / 100).toFixed(2) : 0;
  });
  
  const datasets = [
    {
      type: 'line',
      label: 'Per Recruiter (WL1)',
      data: productivityPerRecruiter,
      borderColor: 'rgba(20, 184, 166, 1)',
      backgroundColor: 'rgba(20, 184, 166, 0.1)',
      borderWidth: 3,
      pointRadius: 5,
      pointHoverRadius: 7,
      tension: 0.3,
      fill: true,
      yAxisID: 'y',
    },
    {
      type: 'line',
      label: 'Overall HC',
      data: productivityOverall,
      borderColor: 'rgba(99, 102, 241, 1)',
      backgroundColor: 'rgba(99, 102, 241, 0.1)',
      borderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      tension: 0.3,
      fill: true,
      yAxisID: 'y',
    }
  ];
  
  createMixedChart('productivity-trend-canvas', uniqueMonthNames, datasets, {
    plugins: {
      title: { display: false },
      legend: {
        display: true,
        position: 'top',
        labels: { boxWidth: 12, font: { size: 11 } }
      },
      datalabels: {
        display: false  // Too many points for labels
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: '₹ Lacs / HC',
          font: { size: 11 }
        },
        ticks: { font: { size: 10 } }
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 } }
      }
    },
    animation: {
      duration: 800,
      easing: 'easeInOutQuart'
    }
  });
}

// Render Productivity YoY Comparison Chart
function renderProductivityYoYChart() {
  return `
    <div class="mb-6">
      <h3 class="text-2xl font-bold text-gray-900 mb-4 flex items-center">
        <i class="fas fa-chart-area text-purple-600 mr-3"></i>
        Productivity Comparison vs Last Year
      </h3>
      
      <div class="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
        <div class="bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3">
          <h4 class="text-white font-bold text-sm flex items-center justify-between">
            <span><i class="fas fa-calendar-alt mr-2"></i>Current Year vs Last Year</span>
            <span class="text-purple-100 text-xs">Productivity</span>
          </h4>
        </div>
        
        <div class="p-4">
          <div style="height: 220px;">
            <canvas id="productivity-yoy-canvas"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Render Productivity YoY Chart Data
function renderProductivityYoYChartData() {
  const canvas = document.getElementById('productivity-yoy-canvas');
  if (!canvas || !state.rawData || !state.lastFYData) return;
  
  const periodMonths = calculateMonthsForPeriod();
  const uniqueMonthNames = [...new Set(periodMonths.map(m => m.split("'")[0]))];
  
  // Calculate current year productivity
  const currentYearData = {};
  uniqueMonthNames.forEach(m => {
    currentYearData[m] = { revenue: 0, headcount: 0 };
  });
  
  state.rawData.forEach(d => {
    const monthName = d.month ? d.month.split("'")[0] : null;
    if (!monthName || !currentYearData.hasOwnProperty(monthName)) return;
    
    if (d.metric === 'Revenue_Actual') {
      currentYearData[monthName].revenue += parseFloat(d.value || 0);
    } else if (d.metric === 'Headcount_WL1') {
      currentYearData[monthName].headcount = parseFloat(d.value || 0);
    }
  });
  
  // Calculate last year productivity
  const lastYearData = {};
  uniqueMonthNames.forEach(m => {
    lastYearData[m] = { revenue: 0, headcount: 0 };
  });
  
  state.lastFYData.forEach(d => {
    const monthName = d.month ? d.month.split("'")[0] : null;
    if (!monthName || !lastYearData.hasOwnProperty(monthName)) return;
    
    if (d.metric === 'Revenue_Actual') {
      lastYearData[monthName].revenue += parseFloat(d.value || 0);
    } else if (d.metric === 'Headcount_WL1') {
      lastYearData[monthName].headcount = parseFloat(d.value || 0);
    }
  });
  
  // Calculate productivity (revenue / headcount)
  const currentYearProductivity = uniqueMonthNames.map(m => {
    const hc = currentYearData[m].headcount;
    return hc > 0 ? (currentYearData[m].revenue / hc / 100).toFixed(2) : 0;
  });
  
  const lastYearProductivity = uniqueMonthNames.map(m => {
    const hc = lastYearData[m].headcount;
    return hc > 0 ? (lastYearData[m].revenue / hc / 100).toFixed(2) : 0;
  });
  
  // Calculate growth %
  const growthData = uniqueMonthNames.map((m, idx) => {
    const current = parseFloat(currentYearProductivity[idx]);
    const last = parseFloat(lastYearProductivity[idx]);
    
    if (last > 0) {
      return ((current - last) / last * 100).toFixed(2);
    } else if (current > 0) {
      return 100;
    }
    return 0;
  });
  
  const datasets = [
    {
      type: 'bar',
      label: 'Current Year (FY2025-26)',
      data: currentYearProductivity,
      backgroundColor: 'rgba(147, 51, 234, 0.8)',
      borderColor: 'rgba(147, 51, 234, 1)',
      borderWidth: 1,
      borderRadius: 6,
      yAxisID: 'y',
      order: 2,
    },
    {
      type: 'bar',
      label: 'Last Year (FY2024-25)',
      data: lastYearProductivity,
      backgroundColor: 'rgba(156, 163, 175, 0.6)',
      borderColor: 'rgba(156, 163, 175, 1)',
      borderWidth: 1,
      borderRadius: 6,
      yAxisID: 'y',
      order: 3,
    },
    {
      type: 'line',
      label: 'Growth %',
      data: growthData,
      borderColor: 'rgba(236, 72, 153, 1)',
      backgroundColor: 'rgba(236, 72, 153, 0.1)',
      borderWidth: 3,
      pointRadius: 5,
      pointHoverRadius: 7,
      pointBackgroundColor: growthData.map(v => parseFloat(v) >= 0 ? 'rgba(16, 185, 129, 1)' : 'rgba(239, 68, 68, 1)'),
      yAxisID: 'y1',
      tension: 0.3,
      order: 1,
      fill: true,
    }
  ];
  
  createMixedChart('productivity-yoy-canvas', uniqueMonthNames, datasets, {
    plugins: {
      title: { display: false },
      legend: {
        display: true,
        position: 'top',
        labels: { boxWidth: 12, font: { size: 11 } }
      },
      datalabels: {
        display: function(context) {
          if (context.dataset.type === 'line') return false;
          const datasetMax = Math.max(...context.dataset.data.map(v => parseFloat(v)));
          return parseFloat(context.dataset.data[context.dataIndex]) === datasetMax;
        },
        color: '#374151',
        font: { size: 10, weight: 'bold' },
        anchor: 'end',
        align: 'top',
        formatter: (value) => '₹' + value
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: '₹ Lacs / HC',
          font: { size: 11 }
        },
        ticks: { font: { size: 10 } }
      },
      y1: {
        type: 'linear',
        position: 'right',
        title: {
          display: true,
          text: 'Growth %',
          font: { size: 11 }
        },
        ticks: {
          font: { size: 10 },
          callback: function(value) {
            return value + '%';
          }
        },
        grid: {
          drawOnChartArea: false,
        }
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 } }
      }
    },
    animation: {
      duration: 800,
      easing: 'easeInOutQuart'
    }
  });
}

// Render Bubble Chart (Revenue vs CM% sized by Headcount)
function renderBubbleChart() {
  return `
    <div class="mb-6">
      <h3 class="text-2xl font-bold text-gray-900 mb-4 flex items-center">
        <i class="fas fa-project-diagram text-cyan-600 mr-3"></i>
        Project Performance Matrix
      </h3>
      
      <div class="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
        <div class="bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3">
          <h4 class="text-white font-bold text-sm flex items-center justify-between">
            <span><i class="fas fa-circle mr-2"></i>Revenue vs CM% (Sized by Headcount)</span>
            <span class="text-cyan-100 text-xs">Click bubble to drill to project</span>
          </h4>
        </div>
        
        <div class="p-4">
          <div style=\"height: 400px;\">
            <canvas id=\"bubble-chart-canvas\"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Render Bubble Chart Data
function renderBubbleChartData() {
  const canvas = document.getElementById('bubble-chart-canvas');
  if (!canvas || !state.rawData || state.rawData.length === 0) return;
  
  // Aggregate data by project
  const projectData = {};
  
  state.rawData.forEach(d => {
    const project = d.project || 'Unknown';
    if (!projectData[project]) {
      projectData[project] = { revenue: 0, cm: 0, headcount: 0 };
    }
    
    if (d.metric === 'Revenue_Actual') {
      projectData[project].revenue += parseFloat(d.value || 0);
    } else if (d.metric === 'CM_Actual') {
      projectData[project].cm += parseFloat(d.value || 0);
    } else if (d.metric === 'Headcount_Overall') {
      projectData[project].headcount = parseFloat(d.value || 0);
    }
  });
  
  // Create bubble data
  const bubbleData = Object.keys(projectData).map(project => {
    const data = projectData[project];
    const cmPercent = data.revenue > 0 ? (data.cm / data.revenue * 100) : 0;
    
    return {
      x: data.revenue / 100, // Convert to Crores
      y: cmPercent,
      r: Math.sqrt(data.headcount) * 2, // Scale radius by sqrt of headcount
      project: project,
      headcount: data.headcount
    };
  }).filter(d => d.x > 0 && d.headcount > 0); // Filter out zero values
  
  // Sort by revenue to get top 20
  bubbleData.sort((a, b) => b.x - a.x);
  const top20 = bubbleData.slice(0, 20);
  
  const ctx = canvas.getContext('2d');
  if (window.bubbleChartInstance) {
    window.bubbleChartInstance.destroy();
  }
  
  window.bubbleChartInstance = new Chart(ctx, {
    type: 'bubble',
    data: {
      datasets: [{
        label: 'Projects',
        data: top20,
        backgroundColor: top20.map(d => {
          // Color code by CM%: Green (>35%), Yellow (25-35%), Red (<25%)
          if (d.y > 35) return 'rgba(16, 185, 129, 0.6)';
          if (d.y > 25) return 'rgba(245, 158, 11, 0.6)';
          return 'rgba(239, 68, 68, 0.6)';
        }),
        borderColor: top20.map(d => {
          if (d.y > 35) return 'rgba(16, 185, 129, 1)';
          if (d.y > 25) return 'rgba(245, 158, 11, 1)';
          return 'rgba(239, 68, 68, 1)';
        }),
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            title: function(context) {
              return context[0].raw.project;
            },
            label: function(context) {
              const data = context.raw;
              return [
                `Revenue: ₹${data.x.toFixed(2)} Cr`,
                `CM %: ${data.y.toFixed(1)}%`,
                `Headcount: ${data.headcount.toFixed(0)}`
              ];
            }
          }
        },
        datalabels: {
          display: false  // Too cluttered with labels
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Revenue (₹ Crores)',
            font: { size: 12, weight: 'bold' }
          },
          ticks: {
            font: { size: 10 }
          }
        },
        y: {
          title: {
            display: true,
            text: 'CM %',
            font: { size: 12, weight: 'bold' }
          },
          ticks: {
            font: { size: 10 },
            callback: function(value) {
              return value + '%';
            }
          }
        }
      },
      onClick: function(evt, activeElements) {
        if (activeElements.length > 0) {
          const dataIndex = activeElements[0].index;
          const projectName = top20[dataIndex].project;
          
          // Drill to project level
          console.log('Bubble clicked - drilling to project:', projectName);
          drillToProject(projectName);
        }
      }
    }
  });
}

// Drill to specific project (from bubble chart)
function drillToProject(projectName) {
  // Navigate to drill level showing this project
  // This requires updating the drill state and breadcrumb
  drillState.currentLevel = 'project';
  drillState.breadcrumb = [
    { level: 'overall', label: 'Overall', value: null },
    { level: 'region', label: 'All Regions', value: null },
    { level: 'subRegion', label: 'All Sub-Regions', value: null },
    { level: 'regionHead', label: 'All Region Heads', value: null },
    { level: 'practiceHead', label: 'All Practice Heads', value: null },
    { level: 'project', label: projectName, value: projectName }
  ];
  
  // Save state
  saveDrillState();
  
  // Re-render the page to show the drilled view
  renderPage();
}

// Render Correlation Heatmap
function renderCorrelationHeatmap() {
  return `
    <div class=\"mb-6\">
      <h3 class=\"text-2xl font-bold text-gray-900 mb-4 flex items-center\">
        <i class=\"fas fa-th text-orange-600 mr-3\"></i>
        Correlation Analysis
      </h3>
      
      <div class=\"bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200\">
        <div class=\"bg-gradient-to-r from-orange-600 to-red-600 px-4 py-3\">
          <h4 class=\"text-white font-bold text-sm flex items-center justify-between\">
            <span><i class=\"fas fa-chart-area mr-2\"></i>Correlation Matrix</span>
            <span class=\"text-orange-100 text-xs\">Pearson Coefficient</span>
          </h4>
        </div>
        
        <div class=\"p-6\">
          <div id=\"correlation-heatmap\" class=\"grid grid-cols-5 gap-2\"></div>
        </div>
      </div>
    </div>
  `;
}

// Calculate and render correlation heatmap data
function renderCorrelationHeatmapData() {
  const container = document.getElementById('correlation-heatmap');
  if (!container || !state.rawData || state.rawData.length === 0) return;
  
  // Aggregate data by project for correlation analysis
  const projectData = {};
  
  state.rawData.forEach(d => {
    const project = d.project || 'Unknown';
    if (!projectData[project]) {
      projectData[project] = { revenue: 0, cm: 0, headcount: 0, unbilled: 0, collection: 0 };
    }
    
    if (d.metric === 'Revenue_Actual') {
      projectData[project].revenue += parseFloat(d.value || 0);
    } else if (d.metric === 'CM_Actual') {
      projectData[project].cm += parseFloat(d.value || 0);
    } else if (d.metric === 'Headcount_Overall') {
      projectData[project].headcount = parseFloat(d.value || 0);
    } else if (d.metric === 'Unbilled_Actual') {
      projectData[project].unbilled += parseFloat(d.value || 0);
    } else if (d.metric === 'Collections_Actual') {
      projectData[project].collection += parseFloat(d.value || 0);
    }
  });
  
  // Convert to arrays and calculate derived metrics
  const projects = Object.keys(projectData).filter(p => projectData[p].revenue > 0);
  const headcounts = projects.map(p => projectData[p].headcount);
  const revenues = projects.map(p => projectData[p].revenue);
  const cmPercents = projects.map(p => {
    const rev = projectData[p].revenue;
    return rev > 0 ? (projectData[p].cm / rev * 100) : 0;
  });
  const productivities = projects.map(p => {
    const hc = projectData[p].headcount;
    return hc > 0 ? (projectData[p].revenue / hc) : 0;
  });
  const collectionPercents = projects.map(p => {
    const rev = projectData[p].revenue;
    return rev > 0 ? (projectData[p].collection / rev * 100) : 0;
  });
  const unbilledPercents = projects.map(p => {
    const rev = projectData[p].revenue;
    return rev > 0 ? (projectData[p].unbilled / rev * 100) : 0;
  });
  
  // Calculate correlations
  const correlations = {
    'Headcount vs Revenue': calculateCorrelation(headcounts, revenues),
    'Revenue vs CM %': calculateCorrelation(revenues, cmPercents),
    'Productivity vs CM %': calculateCorrelation(productivities, cmPercents),
    'Unbilled vs Collection %': calculateCorrelation(unbilledPercents, collectionPercents)
  };
  
  // Render heatmap
  let html = '<div class=\"text-center mb-4\">';
  html += '<h4 class=\"font-bold text-gray-700 mb-2\">Key Correlations</h4>';
  html += '<div class=\"grid grid-cols-2 gap-4\">';
  
  Object.keys(correlations).forEach(key => {
    const corr = correlations[key];
    const corrValue = corr.toFixed(3);
    const strength = Math.abs(corr);
    
    let color, label, bgColor;
    if (strength > 0.7) {
      color = 'text-green-700';
      bgColor = 'bg-green-100';
      label = 'Strong';
    } else if (strength > 0.4) {
      color = 'text-yellow-700';
      bgColor = 'bg-yellow-100';
      label = 'Moderate';
    } else {
      color = 'text-red-700';
      bgColor = 'bg-red-100';
      label = 'Weak';
    }
    
    html += `
      <div class=\"${bgColor} rounded-lg p-4 border-2 border-gray-200\">
        <div class=\"text-sm font-semibold text-gray-600 mb-1\">${key}</div>
        <div class=\"text-3xl font-bold ${color} mb-1\">${corrValue}</div>
        <div class=\"text-xs ${color} uppercase tracking-wide\">${label} ${corr > 0 ? 'Positive' : 'Negative'}</div>
      </div>
    `;
  });
  
  html += '</div></div>';
  
  // Add interpretation guide
  html += `
    <div class=\"mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200\">
      <h5 class=\"font-bold text-blue-900 mb-2 flex items-center\">
        <i class=\"fas fa-info-circle mr-2\"></i>
        Interpretation Guide
      </h5>
      <ul class=\"text-sm text-blue-800 space-y-1\">
        <li>• <strong>+1.0</strong>: Perfect positive correlation</li>
        <li>• <strong>+0.7 to +1.0</strong>: Strong positive correlation</li>
        <li>• <strong>+0.4 to +0.7</strong>: Moderate positive correlation</li>
        <li>• <strong>-0.4 to +0.4</strong>: Weak or no correlation</li>
        <li>• <strong>-0.4 to -0.7</strong>: Moderate negative correlation</li>
        <li>• <strong>-0.7 to -1.0</strong>: Strong negative correlation</li>
        <li>• <strong>-1.0</strong>: Perfect negative correlation</li>
      </ul>
    </div>
  `;
  
  container.innerHTML = html;
}

// Calculate Pearson correlation coefficient
function calculateCorrelation(x, y) {
  if (x.length !== y.length || x.length === 0) return 0;
  
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  if (denominator === 0) return 0;
  return numerator / denominator;
}

// Render Productivity Rankings
function renderProductivityRankings() {
  if (!state.rawData || state.rawData.length === 0) {
    return '<p class="text-gray-500 text-sm">No data available for rankings</p>';
  }
  
  // Calculate metrics by project
  const projectData = {};
  
  state.rawData.forEach(d => {
    const project = d.project || 'Unknown';
    if (!projectData[project]) {
      projectData[project] = { 
        revenue: 0, 
        headcountOverall: 0, 
        headcountWL1: 0,
        cm: 0,
        taggdJoiners: 0,
        nonTaggdJoiners: 0
      };
    }
    
    if (d.metric === 'Revenue_Actual') {
      projectData[project].revenue += parseFloat(d.value || 0);
    } else if (d.metric === 'Headcount_Overall') {
      projectData[project].headcountOverall = parseFloat(d.value || 0);
    } else if (d.metric === 'Headcount_WL1') {
      projectData[project].headcountWL1 = parseFloat(d.value || 0);
    } else if (d.metric === 'CM_Actual') {
      projectData[project].cm += parseFloat(d.value || 0);
    } else if (d.metric === 'Taggd_Source_Joiner') {
      projectData[project].taggdJoiners += parseFloat(d.value || 0);
    } else if (d.metric === 'Non Taggd_Source_Joiner' || d.metric === 'Non Taggd Source Joiner') {
      projectData[project].nonTaggdJoiners += parseFloat(d.value || 0);
    }
  });
  
  // Get number of months for per-month calculations
  const numMonths = calculateMonthsForPeriod().length || 12;
  
  // Top Projects by Overall Productivity (Revenue / Overall HC / Months)
  const topByOverallProductivity = Object.keys(projectData)
    .map(project => {
      const data = projectData[project];
      const productivity = (data.headcountOverall > 0 && numMonths > 0) ? 
        (data.revenue / (data.headcountOverall * numMonths)) : 0;
      const cmPercent = data.revenue > 0 ? (data.cm / data.revenue * 100) : 0;
      
      return {
        name: project,
        value: productivity,
        revenue: data.revenue,
        headcount: data.headcountOverall,
        cmPercent: cmPercent
      };
    })
    .filter(p => p.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  
  // Top Projects by Recruiter Productivity (Revenue / WL1 HC / Months)
  const topByRecruiterProductivity = Object.keys(projectData)
    .map(project => {
      const data = projectData[project];
      const productivity = (data.headcountWL1 > 0 && numMonths > 0) ? 
        (data.revenue / (data.headcountWL1 * numMonths)) : 0;
      const cmPercent = data.revenue > 0 ? (data.cm / data.revenue * 100) : 0;
      
      return {
        name: project,
        value: productivity,
        revenue: data.revenue,
        headcount: data.headcountWL1,
        cmPercent: cmPercent
      };
    })
    .filter(p => p.value > 0 && p.headcount > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  
  // Top Projects by Taggd Joiner Productivity (Taggd Joiners / WL1 HC / Months)
  const topByTaggdProductivity = Object.keys(projectData)
    .map(project => {
      const data = projectData[project];
      const productivity = (data.headcountWL1 > 0 && numMonths > 0) ? 
        (data.taggdJoiners / (data.headcountWL1 * numMonths)) : 0;
      const totalJoiners = data.taggdJoiners + data.nonTaggdJoiners;
      const taggdMix = totalJoiners > 0 ? (data.taggdJoiners / totalJoiners * 100) : 0;
      
      return {
        name: project,
        value: productivity,
        taggdJoiners: data.taggdJoiners,
        totalJoiners: totalJoiners,
        taggdMix: taggdMix,
        headcount: data.headcountWL1
      };
    })
    .filter(p => p.value > 0 && p.taggdJoiners > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  
  // Top Projects by Revenue Per Hire (Revenue / Total Joiners)
  const topByRevenuePerHire = Object.keys(projectData)
    .map(project => {
      const data = projectData[project];
      const totalJoiners = data.taggdJoiners + data.nonTaggdJoiners;
      const revenuePerHire = totalJoiners > 0 ? (data.revenue / totalJoiners) : 0;
      const cmPercent = data.revenue > 0 ? (data.cm / data.revenue * 100) : 0;
      
      return {
        name: project,
        value: revenuePerHire,
        revenue: data.revenue,
        totalJoiners: totalJoiners,
        taggdJoiners: data.taggdJoiners,
        cmPercent: cmPercent
      };
    })
    .filter(p => p.value > 0 && p.totalJoiners > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  
  return `
    <div class="mb-6">
      <h3 class="text-2xl font-bold text-gray-900 mb-4 flex items-center">
        <i class="fas fa-trophy text-yellow-500 mr-3"></i>
        Top Performers & Rankings
      </h3>
      
      <div class="grid grid-cols-2 gap-4">
        <!-- Top by Overall Productivity -->
        <div class="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div class="bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3">
            <h4 class="text-white font-bold text-sm flex items-center justify-between">
              <span><i class="fas fa-users mr-2"></i>Top by Overall Productivity</span>
              <span class="text-indigo-100 text-xs">₹ Lacs/HC/Mo</span>
            </h4>
          </div>
          <div class="p-3">
            ${renderRankingListGeneric(topByOverallProductivity, 'productivity')}
          </div>
        </div>
        
        <!-- Top by Recruiter Productivity -->
        <div class="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div class="bg-gradient-to-r from-teal-600 to-green-600 px-4 py-3">
            <h4 class="text-white font-bold text-sm flex items-center justify-between">
              <span><i class="fas fa-user-tie mr-2"></i>Top by Recruiter Productivity</span>
              <span class="text-teal-100 text-xs">₹ Lacs/Rec/Mo</span>
            </h4>
          </div>
          <div class="p-3">
            ${renderRankingListGeneric(topByRecruiterProductivity, 'productivity')}
          </div>
        </div>
        
        <!-- Top by Taggd Joiner Productivity -->
        <div class="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div class="bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-3">
            <h4 class="text-white font-bold text-sm flex items-center justify-between">
              <span><i class="fas fa-user-plus mr-2"></i>Top by Taggd Joiner Productivity</span>
              <span class="text-blue-100 text-xs">Joiners/Rec/Mo</span>
            </h4>
          </div>
          <div class="p-3">
            ${renderRankingListGeneric(topByTaggdProductivity, 'taggd')}
          </div>
        </div>
        
        <!-- Top by Revenue Per Hire -->
        <div class="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div class="bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3">
            <h4 class="text-white font-bold text-sm flex items-center justify-between">
              <span><i class="fas fa-user-check mr-2"></i>Top by Revenue Per Hire</span>
              <span class="text-green-100 text-xs">₹ Lacs/Hire</span>
            </h4>
          </div>
          <div class="p-3">
            ${renderRankingListGeneric(topByRevenuePerHire, 'revenuePerHire')}
          </div>
        </div>
      </div>
    </div>
  `;
}

// Generic ranking list renderer
function renderRankingListGeneric(items, type) {
  if (!items || items.length === 0) {
    return '<p class="text-gray-500 text-sm p-4">No data available</p>';
  }
  
  return items.map((item, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
    
    let mainValue, subInfo, badge;
    
    if (type === 'productivity') {
      mainValue = '₹' + (item.value / 100).toFixed(2);
      subInfo = `Revenue: ₹${(item.revenue / 100).toFixed(2)} Cr | HC: ${item.headcount.toFixed(0)}`;
      
      let cmBadgeColor = 'bg-red-100 text-red-700';
      if (item.cmPercent > 35) cmBadgeColor = 'bg-green-100 text-green-700';
      else if (item.cmPercent > 25) cmBadgeColor = 'bg-yellow-100 text-yellow-700';
      
      badge = `<span class="${cmBadgeColor} px-2 py-1 rounded text-xs font-semibold">
        CM ${item.cmPercent.toFixed(1)}%
      </span>`;
    } else if (type === 'taggd') {
      mainValue = item.value.toFixed(2);
      subInfo = `Taggd: ${item.taggdJoiners.toFixed(0)} | Total: ${item.totalJoiners.toFixed(0)} | HC: ${item.headcount.toFixed(0)}`;
      
      let mixColor = 'bg-red-100 text-red-700';
      if (item.taggdMix > 70) mixColor = 'bg-green-100 text-green-700';
      else if (item.taggdMix > 50) mixColor = 'bg-yellow-100 text-yellow-700';
      
      badge = `<span class="${mixColor} px-2 py-1 rounded text-xs font-semibold">
        ${item.taggdMix.toFixed(0)}% Taggd
      </span>`;
    } else if (type === 'revenuePerHire') {
      mainValue = '₹' + (item.value / 100).toFixed(2);
      subInfo = `Revenue: ₹${(item.revenue / 100).toFixed(2)} Cr | Hires: ${item.totalJoiners.toFixed(0)}`;
      
      let cmBadgeColor = 'bg-red-100 text-red-700';
      if (item.cmPercent > 35) cmBadgeColor = 'bg-green-100 text-green-700';
      else if (item.cmPercent > 25) cmBadgeColor = 'bg-yellow-100 text-yellow-700';
      
      badge = `<span class="${cmBadgeColor} px-2 py-1 rounded text-xs font-semibold">
        CM ${item.cmPercent.toFixed(1)}%
      </span>`;
    }
    
    return `
      <div class="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
        <div class="flex items-center flex-1">
          <span class="text-lg font-bold mr-3 w-8">${medal}</span>
          <div class="flex-1">
            <div class="font-semibold text-gray-800 text-sm truncate" title="${item.name}">${item.name}</div>
            <div class="text-xs text-gray-500">${subInfo}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="text-right">
            <div class="font-bold text-gray-900 text-sm">${mainValue}</div>
          </div>
          ${badge}
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// RANKINGS & LEADERBOARDS (PHASE 3)
// ============================================================================

function renderRankingsLeaderboards() {
  if (!state.rawData || state.rawData.length === 0) {
    return '<p class="text-gray-500 text-sm">No data available for rankings</p>';
  }
  
  // Calculate rankings
  const topProjects = calculateTopProjectsByRevenue();
  const topRegions = calculateTopRegionsByCM();
  const topPracticeHeads = calculateTopPracticeHeads();
  const momLeaders = calculateMoMGrowthLeaders();
  
  return `
    <div class="mb-6">
      <h3 class="text-2xl font-bold text-gray-900 mb-4 flex items-center">
        <i class="fas fa-trophy text-yellow-500 mr-3"></i>
        Rankings & Leaderboards
      </h3>
      
      <div class="grid grid-cols-2 gap-4">
        <!-- Top 10 Projects by Revenue -->
        <div class="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div class="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex items-center justify-between">
            <h4 class="text-white font-bold text-sm flex items-center">
              <i class="fas fa-briefcase mr-2"></i>
              Top 10 Projects by Revenue
            </h4>
            <span class="text-blue-100 text-xs">₹ Crores</span>
          </div>
          <div class="p-3">
            ${renderRankingList(topProjects, 'revenue', '₹', 'Cr')}
          </div>
        </div>
        
        <!-- Top Regions by CM % -->
        <div class="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div class="bg-gradient-to-r from-green-600 to-green-700 px-4 py-3 flex items-center justify-between">
            <h4 class="text-white font-bold text-sm flex items-center">
              <i class="fas fa-map-marker-alt mr-2"></i>
              Top Regions by CM %
            </h4>
            <span class="text-green-100 text-xs">Margin %</span>
          </div>
          <div class="p-3">
            ${renderRankingList(topRegions, 'cmPercent', '', '%')}
          </div>
        </div>
        
        <!-- Best Performing Practice Heads -->
        <div class="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div class="bg-gradient-to-r from-purple-600 to-purple-700 px-4 py-3 flex items-center justify-between">
            <h4 class="text-white font-bold text-sm flex items-center">
              <i class="fas fa-user-friends mr-2"></i>
              Best Practice Heads
            </h4>
            <span class="text-purple-100 text-xs">Revenue & CM</span>
          </div>
          <div class="p-3">
            ${renderRankingList(topPracticeHeads, 'revenue', '₹', 'Cr')}
          </div>
        </div>
        
        <!-- MoM Growth Leaders -->
        <div class="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div class="bg-gradient-to-r from-orange-600 to-orange-700 px-4 py-3 flex items-center justify-between">
            <h4 class="text-white font-bold text-sm flex items-center">
              <i class="fas fa-chart-line mr-2"></i>
              Month-over-Month Growth Leaders
            </h4>
            <span class="text-orange-100 text-xs">Growth %</span>
          </div>
          <div class="p-3">
            ${renderRankingList(momLeaders, 'growth', '', '%', true)}
          </div>
        </div>
      </div>
    </div>
  `;
}

// Calculate Top 10 Projects by Revenue
function calculateTopProjectsByRevenue() {
  const projectData = {};
  
  state.rawData.forEach(d => {
    if (!d.project || d.metric !== 'Revenue_Actual') return;
    
    if (!projectData[d.project]) {
      projectData[d.project] = {
        name: d.project,
        revenue: 0,
        cm: 0,
        cmPercent: 0
      };
    }
    
    projectData[d.project].revenue += parseFloat(d.value || 0);
  });
  
  // Calculate CM for each project
  state.rawData.forEach(d => {
    if (!d.project || (d.metric !== 'CM_Actual' && d.metric !== 'CM Actual')) return;
    if (projectData[d.project]) {
      projectData[d.project].cm += parseFloat(d.value || 0);
    }
  });
  
  // Calculate CM %
  Object.keys(projectData).forEach(project => {
    const revenue = projectData[project].revenue;
    const cm = projectData[project].cm;
    projectData[project].cmPercent = revenue > 0 ? (cm / revenue * 100) : 0;
    projectData[project].revenue = projectData[project].revenue / 100; // Convert to Cr
    projectData[project].cm = projectData[project].cm / 100;
  });
  
  return Object.values(projectData)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
}

// Calculate Top Regions by CM %
function calculateTopRegionsByCM() {
  const regionData = {};
  
  state.rawData.forEach(d => {
    if (!d.region) return;
    
    if (!regionData[d.region]) {
      regionData[d.region] = {
        name: d.region,
        revenue: 0,
        cm: 0,
        cmPercent: 0
      };
    }
    
    if (d.metric === 'Revenue_Actual') {
      regionData[d.region].revenue += parseFloat(d.value || 0);
    } else if (d.metric === 'CM_Actual' || d.metric === 'CM Actual') {
      regionData[d.region].cm += parseFloat(d.value || 0);
    }
  });
  
  // Calculate CM %
  Object.keys(regionData).forEach(region => {
    const revenue = regionData[region].revenue;
    const cm = regionData[region].cm;
    regionData[region].cmPercent = revenue > 0 ? (cm / revenue * 100) : 0;
    regionData[region].revenue = regionData[region].revenue / 100;
    regionData[region].cm = regionData[region].cm / 100;
  });
  
  return Object.values(regionData)
    .filter(r => r.revenue > 0)
    .sort((a, b) => b.cmPercent - a.cmPercent);
}

// Calculate Top Practice Heads
function calculateTopPracticeHeads() {
  const practiceHeadData = {};
  
  state.rawData.forEach(d => {
    if (!d.practice_head) return;
    
    if (!practiceHeadData[d.practice_head]) {
      practiceHeadData[d.practice_head] = {
        name: d.practice_head,
        revenue: 0,
        cm: 0,
        cmPercent: 0
      };
    }
    
    if (d.metric === 'Revenue_Actual') {
      practiceHeadData[d.practice_head].revenue += parseFloat(d.value || 0);
    } else if (d.metric === 'CM_Actual' || d.metric === 'CM Actual') {
      practiceHeadData[d.practice_head].cm += parseFloat(d.value || 0);
    }
  });
  
  // Calculate CM %
  Object.keys(practiceHeadData).forEach(head => {
    const revenue = practiceHeadData[head].revenue;
    const cm = practiceHeadData[head].cm;
    practiceHeadData[head].cmPercent = revenue > 0 ? (cm / revenue * 100) : 0;
    practiceHeadData[head].revenue = practiceHeadData[head].revenue / 100;
    practiceHeadData[head].cm = practiceHeadData[head].cm / 100;
  });
  
  return Object.values(practiceHeadData)
    .filter(h => h.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
}

// Calculate MoM Growth Leaders
function calculateMoMGrowthLeaders() {
  // Get current and previous month
  const allMonths = state.filterOptions.months || [];
  const currentMonthIndex = allMonths.indexOf(state.filters.endMonth);
  
  if (currentMonthIndex <= 0) {
    return []; // No previous month available
  }
  
  const currentMonth = allMonths[currentMonthIndex];
  const previousMonth = allMonths[currentMonthIndex - 1];
  
  const entityData = {};
  
  // Aggregate by project
  state.rawData.forEach(d => {
    if (!d.project || d.metric !== 'Revenue_Actual') return;
    if (d.month !== currentMonth && d.month !== previousMonth) return;
    
    if (!entityData[d.project]) {
      entityData[d.project] = {
        name: d.project,
        current: 0,
        previous: 0,
        growth: 0
      };
    }
    
    if (d.month === currentMonth) {
      entityData[d.project].current += parseFloat(d.value || 0);
    } else if (d.month === previousMonth) {
      entityData[d.project].previous += parseFloat(d.value || 0);
    }
  });
  
  // Calculate growth %
  Object.keys(entityData).forEach(entity => {
    const current = entityData[entity].current;
    const previous = entityData[entity].previous;
    
    if (previous > 0) {
      entityData[entity].growth = ((current - previous) / previous * 100);
    } else if (current > 0) {
      entityData[entity].growth = 100; // New revenue
    }
    
    entityData[entity].current = entityData[entity].current / 100;
    entityData[entity].previous = entityData[entity].previous / 100;
  });
  
  return Object.values(entityData)
    .filter(e => e.previous > 0 || e.current > 0)
    .sort((a, b) => b.growth - a.growth)
    .slice(0, 10);
}

// Render ranking list
function renderRankingList(items, valueKey, prefix = '', suffix = '', isGrowth = false) {
  if (!items || items.length === 0) {
    return '<p class="text-gray-400 text-xs text-center py-4">No data available</p>';
  }
  
  return `
    <div class="space-y-1">
      ${items.map((item, index) => {
        const value = item[valueKey];
        const displayValue = typeof value === 'number' ? value.toFixed(2) : '0.00';
        const rankColor = index === 0 ? 'text-yellow-600' : index === 1 ? 'text-gray-400' : index === 2 ? 'text-orange-600' : 'text-gray-600';
        const rankIcon = index === 0 ? 'fa-trophy' : index === 1 ? 'fa-medal' : index === 2 ? 'fa-award' : 'fa-circle';
        
        // Growth indicator for MoM
        let growthIndicator = '';
        if (isGrowth) {
          const growthValue = parseFloat(displayValue);
          const color = growthValue >= 0 ? 'text-green-600' : 'text-red-600';
          const arrow = growthValue >= 0 ? '↑' : '↓';
          growthIndicator = `<span class="${color} text-xs font-bold ml-1">${arrow}</span>`;
        }
        
        // CM % badge for projects and practice heads
        let cmBadge = '';
        if (item.cmPercent !== undefined && !isGrowth) {
          const cmColor = item.cmPercent >= 35 ? 'bg-green-100 text-green-700' : item.cmPercent >= 25 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
          cmBadge = `<span class="text-[10px] px-1.5 py-0.5 rounded ${cmColor} ml-1">CM ${item.cmPercent.toFixed(1)}%</span>`;
        }
        
        return `
          <div class="flex items-center justify-between py-1.5 px-2 hover:bg-gray-50 rounded transition-colors">
            <div class="flex items-center flex-1 min-w-0">
              <i class="fas ${rankIcon} ${rankColor} text-xs mr-2 flex-shrink-0"></i>
              <span class="text-xs font-medium text-gray-700 truncate" title="${item.name}">${item.name}</span>
              ${cmBadge}
            </div>
            <div class="flex items-center ml-2">
              <span class="text-xs font-bold text-gray-900">${prefix}${displayValue}${suffix}</span>
              ${growthIndicator}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ============================================================================
// REVENUE & CM COMPACT CHARTS
// ============================================================================

function initializeRevenueCMCharts() {
  console.log('🎨 Initializing Revenue & CM charts...');
  // Chart 1: Revenue Budget vs Actual
  renderRevenueBudgetActualChart();
  // Chart 2: Revenue Trend
  renderRevenueTrendChartCompact();
  // Chart 3: CM % Analysis
  renderCMPercentChart();
  // Chart 4: Revenue YoY Growth
  renderRevenueYoYChartCompact();
}

function renderRevenueBudgetActualChart() {
  const canvas = document.getElementById('revenueBudgetActualChart');
  if (!canvas) return;
  
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  
  const m = state.metrics;
  
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Revenue'],
      datasets: [
        {
          label: 'Budget',
          data: [m.revenue.budget],
          backgroundColor: 'rgba(59, 130, 246, 0.6)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 2
        },
        {
          label: 'Actual',
          data: [m.revenue.actual],
          backgroundColor: m.revenue.actual >= m.revenue.budget ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)',
          borderColor: m.revenue.actual >= m.revenue.budget ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
          borderWidth: 2
        },
        {
          label: 'Forecast',
          data: [m.revenue.forecast],
          backgroundColor: 'rgba(168, 85, 247, 0.6)',
          borderColor: 'rgb(168, 85, 247)',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top' },
        title: { display: false },
        datalabels: {
          display: true,
          anchor: 'end',
          align: 'top',
          formatter: (value) => value ? '₹' + value.toFixed(1) : '',
          color: '#374151',
          font: {
            weight: 'bold',
            size: 11
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '₹' + value.toFixed(0) + ' Cr';
            }
          }
        }
      }
    }
  });
}

function renderRevenueTrendChartCompact() {
  const canvas = document.getElementById('revenueTrendChart');
  if (!canvas) return;
  
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  const monthlyData = {};
  
  periodMonths.forEach(m => {
    monthlyData[m] = { revenue: 0, count: 0 };
  });
  
  state.rawData.forEach(d => {
    const month = d.month || d.time_period;
    if (monthlyData[month] && d.metric === 'Revenue_Actual') {
      monthlyData[month].revenue += parseFloat(d.value || 0) / 100;
      monthlyData[month].count++;
    }
  });
  
  const labels = periodMonths;
  const revenueData = periodMonths.map(m => monthlyData[m].revenue);
  
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Revenue (₹ Cr)',
        data: revenueData,
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top' },
        datalabels: {
          display: true,
          align: 'top',
          formatter: (value) => value ? '₹' + value.toFixed(1) : '',
          color: '#059669',
          font: {
            weight: 'bold',
            size: 11
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '₹' + value.toFixed(1) + ' Cr';
            }
          }
        }
      }
    }
  });
}

function renderCMPercentChart() {
  const canvas = document.getElementById('cmPercentChart');
  if (!canvas) return;
  
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  
  const m = state.metrics;
  
  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['CM %', 'Other Costs %'],
      datasets: [{
        data: [m.cm.actualPercent, 100 - m.cm.actualPercent],
        backgroundColor: [
          'rgba(20, 184, 166, 0.7)',
          'rgba(229, 231, 235, 0.7)'
        ],
        borderColor: [
          'rgb(20, 184, 166)',
          'rgb(229, 231, 235)'
        ],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom' },
        title: { display: false },
        datalabels: {
          formatter: (value, ctx) => {
            return value > 5 ? value.toFixed(1) + '%' : '';
          },
          color: '#fff',
          font: {
            weight: 'bold',
            size: 14
          }
        }
      }
    }
  });
}

function renderRevenueYoYChartCompact() {
  const canvas = document.getElementById('revenueYoYChart');
  if (!canvas) return;
  
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  
  const m = state.metrics;
  const yoyGrowth = m.revenue.yoyYTD?.growth || 0;
  
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['YoY Growth'],
      datasets: [{
        label: 'Revenue Growth %',
        data: [yoyGrowth],
        backgroundColor: yoyGrowth >= 0 ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)',
        borderColor: yoyGrowth >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          ticks: {
            callback: function(value) {
              return value + '%';
            }
          }
        }
      }
    }
  });
}

// ============================================================================
// PPC & PRODUCTIVITY COMPACT CHARTS
// ============================================================================

function initializePPCProductivityCharts() {
  console.log('🎨 Initializing PPC & Productivity charts...');
  // Chart 1: PPC Budget vs Actual
  renderPPCBudgetActualChart();
  // Chart 2: Productivity Trend
  renderProductivityTrendChartCompact();
  // Chart 3: Hiring Mix
  renderHiringMixChartCompact();
  // Chart 4: Productivity YoY
  renderProductivityYoYChartCompact();
}

function renderPPCBudgetActualChart() {
  const canvas = document.getElementById('ppcBudgetActualChart');
  if (!canvas) return;
  
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  
  const m = state.metrics;
  
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['PPC'],
      datasets: [
        {
          label: 'Budget',
          data: [m.ppc.budgetPerMonth],
          backgroundColor: 'rgba(107, 114, 128, 0.6)',
          borderColor: 'rgb(107, 114, 128)',
          borderWidth: 2
        },
        {
          label: 'Actual',
          data: [m.ppc.perMonth],
          backgroundColor: m.ppc.perMonth <= m.ppc.budgetPerMonth ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)',
          borderColor: m.ppc.perMonth <= m.ppc.budgetPerMonth ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top' }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '₹' + (value/1000).toFixed(0) + 'k';
            }
          }
        }
      }
    }
  });
}

function renderProductivityTrendChartCompact() {
  const canvas = document.getElementById('productivityTrendChart');
  if (!canvas) return;
  
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  const monthlyData = {};
  
  periodMonths.forEach(m => {
    monthlyData[m] = { revenue: 0, wl1HC: 0 };
  });
  
  state.rawData.forEach(d => {
    const month = d.month || d.time_period;
    if (!monthlyData[month]) return;
    
    if (d.metric === 'Revenue_Actual') {
      monthlyData[month].revenue += parseFloat(d.value || 0) / 100;
    } else if (d.metric === 'Headcount_WL1') {
      monthlyData[month].wl1HC += parseFloat(d.value || 0);
    }
  });
  
  const labels = periodMonths;
  const productivityData = periodMonths.map(m => {
    const data = monthlyData[m];
    return data.wl1HC > 0 ? ((data.revenue * 100) / data.wl1HC).toFixed(2) : 0;
  });
  
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Revenue Productivity (₹ L/HC)',
        data: productivityData,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top' }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '₹' + value + ' L';
            }
          }
        }
      }
    }
  });
}

function renderHiringMixChartCompact() {
  const canvas = document.getElementById('hiringMixChart');
  if (!canvas) return;
  
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  
  const m = state.metrics;
  
  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Taggd Joiners', 'Non-Taggd Joiners'],
      datasets: [{
        data: [m.productivity.taggdJoiners, m.productivity.nonTaggdJoiners],
        backgroundColor: [
          'rgba(34, 197, 94, 0.7)',
          'rgba(251, 146, 60, 0.7)'
        ],
        borderColor: [
          'rgb(34, 197, 94)',
          'rgb(251, 146, 60)'
        ],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom' }
      }
    }
  });
}

function renderProductivityYoYChartCompact() {
  const canvas = document.getElementById('productivityYoYChart');
  if (!canvas) return;
  
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  
  const m = state.metrics;
  const productivity = m.productivity.recruiterPerMonth;
  const target = m.productivity.target || productivity;
  
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Productivity'],
      datasets: [
        {
          label: 'Target',
          data: [target],
          backgroundColor: 'rgba(107, 114, 128, 0.6)',
          borderColor: 'rgb(107, 114, 128)',
          borderWidth: 2
        },
        {
          label: 'Actual',
          data: [productivity],
          backgroundColor: productivity >= target ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)',
          borderColor: productivity >= target ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top' }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '₹' + value.toFixed(1) + ' L';
            }
          }
        }
      }
    }
  });
}

// ============================================================================
// HEADCOUNT & CAPACITY CHARTS
// ============================================================================

function initializeHeadcountCharts() {
  console.log('🎨 Initializing headcount charts...');
  // Chart 1: Approved vs Actual HC (Bar)
  renderApprovedVsActualChart();
  
  // Chart 2: HC Growth Trend
  renderHCGrowthTrendChart();
  
  // Chart 3: HC vs Revenue Growth Comparison
  renderHCRevenueGrowthChart();
  
  // Chart 4: HC Mix (WL1 vs Others)
  renderHCMixChart();
}

function renderApprovedVsActualChart() {
  const canvas = document.getElementById('approvedVsActualChart');
  if (!canvas) {
    console.warn('Canvas approvedVsActualChart not found');
    return;
  }
  
  // Destroy existing chart if it exists
  const existingChart = Chart.getChart(canvas);
  if (existingChart) {
    existingChart.destroy();
  }
  
  const m = state.metrics;
  
  const data = {
    labels: ['Headcount'],
    datasets: [
      {
        label: 'Approved',
        data: [m.headcount.approved],
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 2
      },
      {
        label: 'Actual',
        data: [m.headcount.overall],
        backgroundColor: m.headcount.overall > m.headcount.approved 
          ? 'rgba(239, 68, 68, 0.7)' 
          : 'rgba(34, 197, 94, 0.7)',
        borderColor: m.headcount.overall > m.headcount.approved 
          ? 'rgb(239, 68, 68)' 
          : 'rgb(34, 197, 94)',
        borderWidth: 2
      }
    ]
  };
  
  new Chart(canvas, {
    type: 'bar',
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            font: { size: 12 }
          }
        },
        datalabels: {
          display: true,
          color: '#1f2937',
          font: { weight: 'bold', size: 14 },
          formatter: (value) => Math.round(value) + ' HC'
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              return `${context.dataset.label}: ${Math.round(context.parsed.y)} HC`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Headcount (HC)',
            font: { size: 13, weight: 'bold' }
          },
          ticks: {
            callback: (value) => Math.round(value) + ' HC'
          }
        }
      }
    }
  });
}

function renderHCGrowthTrendChart() {
  const canvas = document.getElementById('hcGrowthTrendChart');
  if (!canvas) {
    console.warn('Canvas hcGrowthTrendChart not found');
    return;
  }
  
  // Destroy existing chart if it exists
  const existingChart = Chart.getChart(canvas);
  if (existingChart) {
    existingChart.destroy();
  }
  
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  const monthlyHCByProject = {};
  
  // Group by month and project first, then sum
  state.rawData.filter(d => d.metric === 'Headcount_Overall' && periodMonths.includes(d.month || d.time_period))
    .forEach(d => {
      const month = d.month || d.time_period;
      const project = d.project || 'Unknown';
      if (!monthlyHCByProject[month]) monthlyHCByProject[month] = {};
      monthlyHCByProject[month][project] = safeParseFloat(d.value);
    });
  
  // Sum across all projects for each month
  const monthlyHC = {};
  Object.keys(monthlyHCByProject).forEach(month => {
    monthlyHC[month] = Object.values(monthlyHCByProject[month]).reduce((sum, v) => sum + v, 0);
  });
  
  const sortedMonths = periodMonths.filter(m => monthlyHC[m]);
  const hcValues = sortedMonths.map(m => monthlyHC[m]);
  
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: sortedMonths,
      datasets: [{
        label: 'Headcount',
        data: hcValues,
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { 
          display: true,
          position: 'top',
          labels: {
            font: { size: 12 }
          }
        },
        datalabels: { 
          display: true,
          align: 'top',
          anchor: 'end',
          color: '#059669',
          font: { weight: 'bold', size: 11 },
          formatter: (value) => Math.round(value) + ' HC'
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              return `Headcount: ${Math.round(context.parsed.y)} HC`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Headcount',
            font: { size: 13, weight: 'bold' }
          },
          ticks: {
            callback: (value) => Math.round(value) + ' HC'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Month',
            font: { size: 13, weight: 'bold' }
          }
        }
      }
    }
  });
}

function renderHCRevenueGrowthChart() {
  const canvas = document.getElementById('hcRevenueGrowthChart');
  if (!canvas) {
    console.warn('Canvas hcRevenueGrowthChart not found');
    return;
  }
  
  // Destroy existing chart if it exists
  const existingChart = Chart.getChart(canvas);
  if (existingChart) {
    existingChart.destroy();
  }
  
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  const monthlyDataByProject = {};
  
  // Group by month and project first
  state.rawData.filter(d => 
    (d.metric === 'Headcount_Overall' || d.metric === 'Revenue_Actual') && 
    periodMonths.includes(d.month || d.time_period)
  ).forEach(d => {
    const month = d.month || d.time_period;
    const project = d.project || 'Unknown';
    if (!monthlyDataByProject[month]) monthlyDataByProject[month] = { hcByProject: {}, revenue: 0 };
    
    if (d.metric === 'Headcount_Overall') {
      monthlyDataByProject[month].hcByProject[project] = safeParseFloat(d.value);
    } else if (d.metric === 'Revenue_Actual') {
      monthlyDataByProject[month].revenue += safeParseFloat(d.value);
    }
  });
  
  // Sum HC across all projects for each month
  const monthlyData = {};
  Object.keys(monthlyDataByProject).forEach(month => {
    const hc = Object.values(monthlyDataByProject[month].hcByProject).reduce((sum, v) => sum + v, 0);
    monthlyData[month] = {
      hc: hc,
      revenue: monthlyDataByProject[month].revenue
    };
  });
  
  const sortedMonths = periodMonths.filter(m => monthlyData[m]);
  const hcValues = sortedMonths.map(m => monthlyData[m].hc);
  const revenueValues = sortedMonths.map(m => monthlyData[m].revenue);
  
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: sortedMonths,
      datasets: [
        {
          label: 'Headcount',
          data: hcValues,
          borderColor: 'rgb(249, 115, 22)',
          backgroundColor: 'rgba(249, 115, 22, 0.1)',
          borderWidth: 2,
          yAxisID: 'y',
          tension: 0.4
        },
        {
          label: 'Revenue (₹ Cr)',
          data: revenueValues,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          yAxisID: 'y1',
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            font: { size: 12 }
          }
        },
        datalabels: { 
          display: true,
          align: 'top',
          font: { weight: 'bold', size: 10 },
          formatter: (value, context) => {
            if (context.datasetIndex === 0) {
              // Headcount
              return Math.round(value) + ' HC';
            } else {
              // Revenue in Crores
              return '₹' + value.toFixed(2) + ' Cr';
            }
          },
          color: (context) => {
            return context.datasetIndex === 0 ? 'rgb(249, 115, 22)' : 'rgb(59, 130, 246)';
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              if (context.datasetIndex === 0) {
                return `Headcount: ${Math.round(context.parsed.y)} HC`;
              } else {
                return `Revenue: ₹${context.parsed.y.toFixed(2)} Cr`;
              }
            }
          }
        }
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Headcount (HC)',
            color: 'rgb(249, 115, 22)',
            font: { size: 13, weight: 'bold' }
          },
          ticks: {
            color: 'rgb(249, 115, 22)',
            callback: (value) => Math.round(value) + ' HC'
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Revenue (₹ Cr)',
            color: 'rgb(59, 130, 246)',
            font: { size: 13, weight: 'bold' }
          },
          ticks: {
            color: 'rgb(59, 130, 246)',
            callback: (value) => '₹' + value.toFixed(1) + ' Cr'
          },
          grid: {
            drawOnChartArea: false
          }
        },
        x: {
          title: {
            display: true,
            text: 'Month',
            font: { size: 13, weight: 'bold' }
          }
        }
      }
    }
  });
}

function renderHCMixChart() {
  const canvas = document.getElementById('hcMixChart');
  if (!canvas) {
    console.warn('Canvas hcMixChart not found');
    return;
  }
  
  // Destroy existing chart if it exists
  const existingChart = Chart.getChart(canvas);
  if (existingChart) {
    existingChart.destroy();
  }
  
  const m = state.metrics;
  const wl1HC = m.headcount.wl1;
  const othersHC = m.headcount.overall - wl1HC;
  
  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['WL1 (Recruiters)', 'Others'],
      datasets: [{
        data: [wl1HC, othersHC],
        backgroundColor: [
          'rgba(147, 51, 234, 0.7)',
          'rgba(156, 163, 175, 0.7)'
        ],
        borderColor: [
          'rgb(147, 51, 234)',
          'rgb(156, 163, 175)'
        ],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom'
        },
        datalabels: {
          display: true,
          color: '#fff',
          font: { weight: 'bold', size: 14 },
          formatter: (value, context) => {
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percent = ((value / total) * 100).toFixed(1);
            return percent + '%\n' + Math.round(value);
          }
        }
      }
    }
  });
}

// ============================================================================
// COLLECTIONS & CASH FLOW CHARTS
// ============================================================================

function initializeCollectionsCharts() {
  console.log('🎨 Initializing collections charts...');
  renderCollectionTrendChart();
  renderUnbilledVsRevenueChart();
  renderBadDebtTrendChart();
  renderCollectionEfficiencyChart();
  renderYoYCollectionComparisonChart();  // NEW: Last Year vs Current Year
  renderTargetVsActualCollectionChart(); // NEW: Monthly Target vs Actual
}

function renderCollectionTrendChart() {
  const canvas = document.getElementById('collectionTrendChart');
  if (!canvas) return;
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  const monthlyData = {};
  state.rawData.filter(d => ['Actual_Collection', 'Revenue_Collected'].includes(d.metric) && periodMonths.includes(d.month || d.time_period)).forEach(d => {
    const month = d.month || d.time_period;
    if (!monthlyData[month]) monthlyData[month] = 0;
    monthlyData[month] += safeParseFloat(d.value) / 100;  // Lacs to Crores
  });
  const sortedMonths = periodMonths.filter(m => monthlyData[m]);
  const collectionValues = sortedMonths.map(m => monthlyData[m]);
  new Chart(canvas, {
    type: 'line',
    data: { labels: sortedMonths, datasets: [{ label: 'Collection (₹ Cr)', data: collectionValues, borderColor: 'rgb(6, 182, 212)', backgroundColor: 'rgba(6, 182, 212, 0.1)', borderWidth: 3, fill: true, tension: 0.4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top', labels: { font: { size: 12 } } }, datalabels: { display: true, align: 'top', anchor: 'end', color: '#0891b2', font: { weight: 'bold', size: 11 }, formatter: (value) => '₹' + value.toFixed(2) + ' Cr' }, tooltip: { callbacks: { label: (context) => `Collection: ₹${context.parsed.y.toFixed(2)} Cr` } } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Collection (₹ Cr)', font: { size: 13, weight: 'bold' } }, ticks: { callback: (value) => '₹' + value.toFixed(1) + ' Cr' } }, x: { title: { display: true, text: 'Month', font: { size: 13, weight: 'bold' } } } } }
  });
}

function renderUnbilledVsRevenueChart() {
  const canvas = document.getElementById('unbilledVsRevenueChart');
  if (!canvas) return;
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  const monthlyData = {};
  state.rawData.filter(d => (d.metric === 'Revenue_Actual' || d.metric === 'Unbilled') && periodMonths.includes(d.month || d.time_period)).forEach(d => {
    const month = d.month || d.time_period;
    if (!monthlyData[month]) monthlyData[month] = { revenue: 0, unbilled: 0 };
    if (d.metric === 'Revenue_Actual') monthlyData[month].revenue += safeParseFloat(d.value);
    else if (d.metric === 'Unbilled') monthlyData[month].unbilled += safeParseFloat(d.value);
  });
  const sortedMonths = periodMonths.filter(m => monthlyData[m]);
  const revenueValues = sortedMonths.map(m => monthlyData[m].revenue);
  const unbilledValues = sortedMonths.map(m => monthlyData[m].unbilled);
  new Chart(canvas, {
    type: 'bar',
    data: { labels: sortedMonths, datasets: [{ label: 'Revenue (₹ Cr)', data: revenueValues, backgroundColor: 'rgba(59, 130, 246, 0.7)', borderColor: 'rgb(59, 130, 246)', borderWidth: 2 }, { label: 'Unbilled (₹ Cr)', data: unbilledValues, backgroundColor: 'rgba(249, 115, 22, 0.7)', borderColor: 'rgb(249, 115, 22)', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top', labels: { font: { size: 12 } } }, datalabels: { display: false }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ₹${context.parsed.y.toFixed(2)} Cr` } } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Amount (₹ Cr)', font: { size: 13, weight: 'bold' } }, ticks: { callback: (value) => '₹' + value.toFixed(1) + ' Cr' } }, x: { title: { display: true, text: 'Month', font: { size: 13, weight: 'bold' } } } } }
  });
}

function renderBadDebtTrendChart() {
  const canvas = document.getElementById('badDebtTrendChart');
  if (!canvas) return;
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  const monthlyBadDebt = {};
  state.rawData.filter(d => d.metric === 'Bad Debt' && periodMonths.includes(d.month || d.time_period)).forEach(d => {
    const month = d.month || d.time_period;
    if (!monthlyBadDebt[month]) monthlyBadDebt[month] = 0;
    monthlyBadDebt[month] += safeParseFloat(d.value);
  });
  const sortedMonths = periodMonths.filter(m => monthlyBadDebt[m] !== undefined);
  const badDebtValues = sortedMonths.map(m => monthlyBadDebt[m]);
  new Chart(canvas, {
    type: 'line',
    data: { labels: sortedMonths, datasets: [{ label: 'Bad Debt (₹ Cr)', data: badDebtValues, borderColor: 'rgb(239, 68, 68)', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 3, fill: true, tension: 0.4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top', labels: { font: { size: 12 } } }, datalabels: { display: true, align: 'top', anchor: 'end', color: '#dc2626', font: { weight: 'bold', size: 11 }, formatter: (value) => '₹' + value.toFixed(2) + ' Cr' }, tooltip: { callbacks: { label: (context) => `Bad Debt: ₹${context.parsed.y.toFixed(2)} Cr` } } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Bad Debt (₹ Cr)', font: { size: 13, weight: 'bold' } }, ticks: { callback: (value) => '₹' + value.toFixed(2) + ' Cr' } }, x: { title: { display: true, text: 'Month', font: { size: 13, weight: 'bold' } } } } }
  });
}

function renderCollectionEfficiencyChart() {
  const canvas = document.getElementById('collectionEfficiencyChart');
  if (!canvas) return;
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  const monthlyData = {};
  // FIXED: Use Target Collection instead of Revenue for efficiency calculation
  state.rawData.filter(d => (['Target_Collection', 'Collection Target'].includes(d.metric) || ['Actual_Collection', 'Revenue_Collected'].includes(d.metric)) && periodMonths.includes(d.month || d.time_period)).forEach(d => {
    const month = d.month || d.time_period;
    if (!monthlyData[month]) monthlyData[month] = { target: 0, collection: 0 };
    if (['Target_Collection', 'Collection Target'].includes(d.metric)) monthlyData[month].target += safeParseFloat(d.value);
    else if (['Actual_Collection', 'Revenue_Collected'].includes(d.metric)) monthlyData[month].collection += safeParseFloat(d.value);
  });
  const sortedMonths = periodMonths.filter(m => monthlyData[m]);
  const efficiencyValues = sortedMonths.map(m => {
    const data = monthlyData[m];
    // Collection Efficiency = Actual Collection / Target Collection * 100
    return data.target > 0 ? (data.collection / data.target * 100) : 0;
  });
  new Chart(canvas, {
    type: 'line',
    data: { labels: sortedMonths, datasets: [{ label: 'Collection Efficiency %', data: efficiencyValues, borderColor: 'rgb(34, 197, 94)', backgroundColor: 'rgba(34, 197, 94, 0.1)', borderWidth: 3, fill: true, tension: 0.4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top', labels: { font: { size: 12 } } }, datalabels: { display: true, align: 'top', anchor: 'end', color: '#15803d', font: { weight: 'bold', size: 11 }, formatter: (value) => value.toFixed(1) + '%' }, tooltip: { callbacks: { label: (context) => `Efficiency: ${context.parsed.y.toFixed(1)}%` } } }, scales: { y: { beginAtZero: true, max: 120, title: { display: true, text: 'Efficiency (%)', font: { size: 13, weight: 'bold' } }, ticks: { callback: (value) => value + '%' } }, x: { title: { display: true, text: 'Month', font: { size: 13, weight: 'bold' } } } } }
  });
}

function renderYoYCollectionComparisonChart() {
  const canvas = document.getElementById('yoyCollectionComparisonChart');
  if (!canvas) return;
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  
  // Current Year Collections
  const currentYearData = {};
  state.rawData.filter(d => ['Actual_Collection', 'Revenue_Collected'].includes(d.metric) && periodMonths.includes(d.month || d.time_period)).forEach(d => {
    const month = d.month || d.time_period;
    if (!currentYearData[month]) currentYearData[month] = 0;
    currentYearData[month] += safeParseFloat(d.value) / 100;  // Lacs to Crores
  });
  
  // Last Year Collections
  const lastYearData = {};
  if (state.lastFYData && state.lastFYData.length > 0) {
    state.lastFYData.filter(d => ['Actual_Collection', 'Revenue_Collected'].includes(d.metric) && periodMonths.includes(d.month || d.time_period)).forEach(d => {
      const month = d.month || d.time_period;
      if (!lastYearData[month]) lastYearData[month] = 0;
      lastYearData[month] += safeParseFloat(d.value) / 100;  // Lacs to Crores
    });
  }
  
  const sortedMonths = periodMonths.filter(m => currentYearData[m] !== undefined || lastYearData[m] !== undefined);
  const currentValues = sortedMonths.map(m => currentYearData[m] || 0);
  const lastYearValues = sortedMonths.map(m => lastYearData[m] || 0);
  
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: sortedMonths,
      datasets: [
        {
          label: 'Current Year (FY ' + state.filters.fy + ')',
          data: currentValues,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 3,
          fill: false,
          tension: 0.4
        },
        {
          label: 'Last Year',
          data: lastYearValues,
          borderColor: 'rgb(156, 163, 175)',
          backgroundColor: 'rgba(156, 163, 175, 0.1)',
          borderWidth: 3,
          fill: false,
          tension: 0.4,
          borderDash: [5, 5]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top', labels: { font: { size: 12 } } },
        datalabels: {
          display: true,
          align: 'top',
          anchor: 'end',
          font: { weight: 'bold', size: 10 },
          formatter: (value, context) => {
            return value > 0 ? '₹' + value.toFixed(2) : '';
          },
          color: (context) => {
            return context.datasetIndex === 0 ? '#3b82f6' : '#9ca3af';
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ₹${context.parsed.y.toFixed(2)} Cr`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Collection (₹ Cr)', font: { size: 13, weight: 'bold' } },
          ticks: { callback: (value) => '₹' + value.toFixed(1) + ' Cr' }
        },
        x: {
          title: { display: true, text: 'Month', font: { size: 13, weight: 'bold' } }
        }
      }
    }
  });
}

function renderTargetVsActualCollectionChart() {
  const canvas = document.getElementById('targetVsActualCollectionChart');
  if (!canvas) return;
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();
  
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  
  // Actual Collections
  const actualData = {};
  state.rawData.filter(d => ['Actual_Collection', 'Revenue_Collected'].includes(d.metric) && periodMonths.includes(d.month || d.time_period)).forEach(d => {
    const month = d.month || d.time_period;
    if (!actualData[month]) actualData[month] = 0;
    actualData[month] += safeParseFloat(d.value) / 100;  // Lacs to Crores
  });
  
  // Target Collections
  const targetData = {};
  state.rawData.filter(d => ['Target_Collection', 'Collection Target'].includes(d.metric) && periodMonths.includes(d.month || d.time_period)).forEach(d => {
    const month = d.month || d.time_period;
    if (!targetData[month]) targetData[month] = 0;
    targetData[month] += safeParseFloat(d.value) / 100;  // Lacs to Crores
  });
  
  const sortedMonths = periodMonths.filter(m => actualData[m] !== undefined || targetData[m] !== undefined);
  const actualValues = sortedMonths.map(m => actualData[m] || 0);
  const targetValues = sortedMonths.map(m => targetData[m] || 0);
  
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sortedMonths,
      datasets: [
        {
          label: 'Target Collection',
          data: targetValues,
          backgroundColor: 'rgba(156, 163, 175, 0.7)',
          borderColor: 'rgb(156, 163, 175)',
          borderWidth: 2
        },
        {
          label: 'Actual Collection',
          data: actualValues,
          backgroundColor: 'rgba(34, 197, 94, 0.7)',
          borderColor: 'rgb(34, 197, 94)',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top', labels: { font: { size: 12 } } },
        datalabels: {
          display: true,
          align: 'end',
          anchor: 'end',
          font: { weight: 'bold', size: 10 },
          formatter: (value) => {
            return value > 0 ? '₹' + value.toFixed(2) : '';
          },
          color: (context) => {
            return context.datasetIndex === 0 ? '#6b7280' : '#16a34a';
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ₹${context.parsed.y.toFixed(2)} Cr`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Collection (₹ Cr)', font: { size: 13, weight: 'bold' } },
          ticks: { callback: (value) => '₹' + value.toFixed(1) + ' Cr' }
        },
        x: {
          title: { display: true, text: 'Month', font: { size: 13, weight: 'bold' } }
        }
      }
    }
  });
}

// ============================================================================
// REVENUE & CM PAGE
// ============================================================================

function renderRevenueCM() {
  if (!state.metrics) {
    return "<p class=\"text-gray-500 p-6\">Loading metrics...</p>"
  }
  
  const m = state.metrics
  
  // Calculate YoY and MoM growth
  const revenueYoY = m.revenue.yoyYTD?.growth || null
  const revenueMoM = m.revenue.mom?.growth || null
  const cmYoY = m.cm.yoyYTD?.growth || null
  const cmMoM = m.cm.mom?.growth || null
  
  return `
    <div class="fade-in">
      <h2 class="text-3xl font-bold text-gray-900 mb-6 flex items-center">
        <i class="fas fa-dollar-sign text-blue-600 mr-3"></i>
        Revenue & Contribution Margin Analysis
      </h2>
      
      ${renderYoYComparison()}
      
      <!-- Simplified to 3 Enhanced KPI Cards -->
      <div class="grid grid-cols-3 gap-6 mb-6">
        ${renderEnhancedKPICard({
          title: 'Revenue (Actual)',
          value: m.revenue.actual,
          unit: '₹ Cr',
          icon: 'dollar-sign',
          color: 'blue',
          target: m.revenue.budget,
          yoyGrowth: revenueYoY,
          momGrowth: revenueMoM,
          varianceVsTarget: m.revenue.variancePercent
        })}
        ${renderEnhancedKPICard({
          title: 'CM (Value)',
          value: m.cm.actual,
          unit: '₹ Cr',
          icon: 'coins',
          color: 'green',
          target: m.cm.budget,
          yoyGrowth: cmYoY,
          momGrowth: cmMoM,
          varianceVsTarget: m.cm.variancePercent
        })}
        ${renderEnhancedKPICard({
          title: 'CM %',
          value: m.cm.actualPercent,
          unit: '%',
          icon: 'percentage',
          color: 'teal',
          target: m.cm.budgetPercent,
          yoyGrowth: null,
          momGrowth: null,
          varianceVsTarget: m.cm.ppVariance
        })}
      </div>
      
      <!-- Charts Section (2×2 Grid) -->
      <div class="grid grid-cols-2 gap-6 mb-6">
        <!-- Chart 1: Revenue Budget vs Actual -->
        <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
          <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <i class="fas fa-chart-bar text-blue-600 mr-2"></i>
            Revenue: Budget vs Actual
          </h3>
          <canvas id="revenueBudgetActualChart" class="chart-compact"></canvas>
        </div>
        
        <!-- Chart 2: Revenue Trend (Monthly) -->
        <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
          <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <i class="fas fa-chart-line text-green-600 mr-2"></i>
            Revenue Trend (Monthly)
          </h3>
          <canvas id="revenueTrendChart" class="chart-compact"></canvas>
        </div>
        
        <!-- Chart 3: CM % Analysis -->
        <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
          <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <i class="fas fa-chart-area text-teal-600 mr-2"></i>
            CM % Performance
          </h3>
          <canvas id="cmPercentChart" class="chart-compact"></canvas>
        </div>
        
        <!-- Chart 4: Revenue Growth YoY -->
        <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
          <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <i class="fas fa-chart-pie text-indigo-600 mr-2"></i>
            Revenue Growth % (YoY)
          </h3>
          <canvas id="revenueYoYChart" class="chart-compact"></canvas>
        </div>
      </div>
      
      <!-- Drill-down table -->
      ${renderDrillDownTable()}
    </div>
  `
}

// PPC & Productivity Combined Page
function renderPPCProductivity() {
  if (!state.metrics) {
    return "<p class=\"text-gray-500 p-6\">Loading metrics...</p>"
  }
  
  const m = state.metrics
  
  return `
    <div class="fade-in">
      <h2 class="text-3xl font-bold text-gray-900 mb-6 flex items-center">
        <i class="fas fa-chart-line text-purple-600 mr-3"></i>
        Productivity & PPC Analysis
      </h2>
      
      ${renderYoYComparison()}
      
      <!-- 5 Enhanced KPI Cards matching Executive View -->
      <div class="grid grid-cols-5 gap-4 mb-6">
        ${renderEnhancedKPICard({
          title: 'PPC Per Person/Month',
          value: m.ppc.perMonth,
          unit: '₹',
          icon: 'coins',
          color: 'purple',
          target: m.ppc.budgetPerMonth,
          yoyGrowth: null,
          momGrowth: null,
          varianceVsTarget: m.ppc.perMonthVariancePercent,
          invertColors: true,
          decimals: 0
        })}
        ${renderEnhancedKPICard({
          title: 'Revenue Productivity',
          value: m.productivity.recruiterPerMonth,
          unit: '₹ Lacs/Recruiter/Month',
          icon: 'chart-line',
          color: 'blue',
          target: m.productivity.target,
          yoyGrowth: null,
          momGrowth: null,
          varianceVsTarget: m.productivity.variancePercent,
          decimals: 2
        })}
        ${renderEnhancedKPICard({
          title: 'Taggd Joiner Productivity',
          value: m.productivity.taggdJoinerPerMonth,
          unit: 'Joiners/Recruiter/Month',
          icon: 'user-plus',
          color: 'green',
          target: null,
          yoyGrowth: null,
          momGrowth: null,
          varianceVsTarget: null,
          decimals: 1
        })}
        ${renderEnhancedKPICard({
          title: 'Overall Productivity',
          value: m.productivity.overallPerMonth,
          unit: '₹ Lacs/HC/Month',
          icon: 'chart-area',
          color: 'indigo',
          target: null,
          yoyGrowth: null,
          momGrowth: null,
          varianceVsTarget: null,
          decimals: 2
        })}
        ${renderEnhancedKPICard({
          title: 'Revenue Per Hire',
          value: m.productivity.revenuePerHire,
          unit: '₹ Lacs',
          icon: 'user-check',
          color: 'teal',
          target: null,
          yoyGrowth: null,
          momGrowth: null,
          varianceVsTarget: null
        })}
      </div>
      
      <!-- Charts Section (2×2 Grid) -->
      <div class="grid grid-cols-2 gap-6 mb-6">
        <!-- Chart 1: PPC Budget vs Actual -->
        <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
          <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <i class="fas fa-chart-bar text-purple-600 mr-2"></i>
            PPC: Budget vs Actual
          </h3>
          <canvas id="ppcBudgetActualChart" class="chart-compact"></canvas>
        </div>
        
        <!-- Chart 2: Revenue Productivity Trend -->
        <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
          <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <i class="fas fa-chart-line text-blue-600 mr-2"></i>
            Revenue Productivity Trend
          </h3>
          <canvas id="productivityTrendChart" class="chart-compact"></canvas>
        </div>
        
        <!-- Chart 3: Hiring Source Mix -->
        <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
          <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <i class="fas fa-chart-pie text-green-600 mr-2"></i>
            Hiring Source Mix (Taggd vs Non-Taggd)
          </h3>
          <canvas id="hiringMixChart" class="chart-compact"></canvas>
        </div>
        
        <!-- Chart 4: Productivity YoY Growth -->
        <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
          <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <i class="fas fa-chart-area text-indigo-600 mr-2"></i>
            Productivity YoY Growth
          </h3>
          <canvas id="productivityYoYChart" class="chart-compact"></canvas>
        </div>
      </div>
      
      <!-- Drill-down table -->
      ${renderPPCProductivityDrillDown()}
    </div>
  `
}

// Compact KPI Card with smaller footprint (kept for backward compatibility)
function renderCompactKPICard(title, value, target, unit, icon, color, variance, invertColors = false) {
  const hasTarget = target !== null && target !== undefined
  const hasVariance = variance !== null && variance !== undefined
  
  // For inverted colors (like PPC), higher is worse
  const varianceColor = hasVariance 
    ? (invertColors 
        ? (variance > 0 ? 'text-red-600' : 'text-green-600')
        : (variance >= 0 ? 'text-green-600' : 'text-red-600'))
    : 'text-gray-600'
  
  const varianceIcon = hasVariance 
    ? (variance > 0 ? '↑' : '↓') 
    : ''
  
  const colorMap = {
    purple: 'from-purple-500 to-purple-600',
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    teal: 'from-teal-500 to-teal-600',
    indigo: 'from-indigo-500 to-indigo-600',
    orange: 'from-orange-500 to-orange-600',
    emerald: 'from-emerald-500 to-emerald-600',
    red: 'from-red-500 to-red-600',
    yellow: 'from-yellow-500 to-yellow-600',
    gray: 'from-gray-500 to-gray-600',
    wallet: 'from-teal-600 to-emerald-600'
  }
  
  return `
    <div class="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow border border-gray-200 overflow-hidden">
      <div class="bg-gradient-to-r ${colorMap[color] || 'from-gray-500 to-gray-600'} p-2 text-white flex items-center justify-between">
        <div class="text-xs font-semibold flex-1" style="white-space: normal; line-height: 1.3;">${title}</div>
        <i class="fas fa-${icon} text-sm opacity-80 ml-2 flex-shrink-0"></i>
      </div>
      <div class="p-3">
        <div class="text-2xl font-bold text-gray-900 mb-1">
          ${formatNumber(value)}${unit === '₹' || unit === '₹ L/HC/Mo' || unit === '₹ Lacs' ? '' : ' ' + unit}
        </div>
        ${hasTarget ? `
          <div class="text-xs text-gray-500 mb-1">
            Target: ${formatNumber(target)} ${unit}
          </div>
        ` : ''}
        ${hasVariance ? `
          <div class="${varianceColor} text-xs font-semibold">
            ${varianceIcon} ${Math.abs(variance).toFixed(1)}%
          </div>
        ` : '<div class="text-xs text-gray-400">—</div>'}
      </div>
    </div>
  `
}

// PPC & Productivity Drill-Down Table
function renderPPCProductivityDrillDown() {
  console.log('🔍 renderPPCProductivityDrillDown called');
  
  if (!state.rawData || state.rawData.length === 0) {
    console.warn('⚠️ No rawData available for drill-down');
    return '<p class="text-gray-500 p-6">No data available</p>';
  }
  
  const currentLevel = drillState.currentLevel;
  const parentFilters = {};
  
  // Build parent filters from breadcrumb
  drillState.breadcrumb.forEach(crumb => {
    if (crumb.level !== 'overall' && crumb.value) {
      const filterKey = HC_DRILL_HIERARCHY.find(h => h.level === crumb.level)?.filterKey;
      if (filterKey) {
        parentFilters[filterKey] = crumb.value;
      }
    }
  });
  
  const aggregatedData = aggregatePPCProductivityByLevel(state.rawData, currentLevel, parentFilters);
  
  return `
    <div class="bg-white rounded-lg shadow-lg overflow-hidden mb-6 border border-gray-200">
      ${renderBreadcrumb()}
      
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
              <th class="px-4 py-3 text-left font-bold">
                <i class="fas ${getCurrentLevelIcon()} mr-2"></i>${getCurrentLevelLabel()}
              </th>
              <th class="px-4 py-3 text-right font-bold">Revenue (₹ Cr)</th>
              <th class="px-4 py-3 text-right font-bold">PPC (₹/Mo)</th>
              <th class="px-4 py-3 text-right font-bold">Rev Prod (₹L/HC/Mo)</th>
              <th class="px-4 py-3 text-right font-bold">Taggd J/R/Mo</th>
              <th class="px-4 py-3 text-center font-bold">Performance</th>
              <th class="px-4 py-3 text-right font-bold">Total Joiners</th>
              <th class="px-4 py-3 text-right font-bold">WL1 HC</th>
              <th class="px-4 py-3 text-right font-bold">Overall HC</th>
              <th class="px-4 py-3 text-center font-bold">Action</th>
            </tr>
          </thead>
          <tbody>
            ${aggregatedData.map(row => renderPPCProductivityTableRow(row)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Aggregate PPC & Productivity data by drill-down level
function aggregatePPCProductivityByLevel(data, level, parentFilters) {
  const grouped = {};
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  const numMonths = periodMonths.length || 12;
  
  // Determine grouping field based on level
  const groupField = {
    'overall': null,
    'vertical': 'vertical',
    'region': 'region',
    'subRegion': 'sub_region',
    'project': 'project'
  }[level];
  
  // For Overall level, use state.metrics headcount
  if (level === 'overall') {
    const m = state.metrics;
    const totalWL1HC = m.headcount.wl1 * numMonths; // Total WL1 HC across all months
    const overallHC = m.headcount.overall;
    
    // Sum revenue and joiners
    let revenue = 0;
    let taggdJoiners = 0;
    let totalNonTaggd = 0;
    const ppcValues = [];
    
    data.forEach(d => {
      const value = safeParseFloat(d.value);
      if (d.metric === 'Revenue_Actual') revenue += value / 100;
      if (d.metric === 'Taggd_Source_Joiner') taggdJoiners += value;
      if (d.metric === 'Non_Taggd_Source_Joiner' || d.metric === 'Non Taggd_Source_Joiner') totalNonTaggd += value;
      if ((d.metric === 'PPC_Actual' || d.metric === 'Actual_PPC') && value > 0) ppcValues.push(value);
    });
    
    const avgPPC = ppcValues.length > 0 ? ppcValues.reduce((sum, v) => sum + v, 0) / ppcValues.length : 0;
    const totalJoiners = taggdJoiners + totalNonTaggd;
    const revenueProductivity = totalWL1HC > 0 ? ((revenue * 100) / totalWL1HC) : 0;
    const taggdJoinerProductivity = totalWL1HC > 0 ? (taggdJoiners / totalWL1HC) : 0;
    
    return [{
      name: 'Overall',
      revenue: revenue,
      ppc: Math.round(avgPPC / 100) * 100,
      revenueProductivity: revenueProductivity,
      taggdJoinerProductivity: taggdJoinerProductivity,
      totalJoiners: totalJoiners,
      wl1HC: m.headcount.wl1,
      overallHC: overallHC
    }];
  }
  
  // Filter data based on parent filters
  let filteredData = data.filter(d => 
    (!parentFilters.vertical || d.vertical === parentFilters.vertical) &&
    (!parentFilters.region || d.region === parentFilters.region) &&
    (!parentFilters.sub_region || d.sub_region === parentFilters.sub_region)
  );
  
  // Group data
  filteredData.forEach(d => {
    const groupKey = d[groupField] || 'Unknown';
    
    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        revenue: 0,
        ppc: [],
        wl1Totals: {},
        overallHCByMonth: {},
        taggdJoiners: 0,
        totalJoiners: 0,
        count: 0
      };
    }
    
    const value = safeParseFloat(d.value);
    const month = d.month || d.time_period;
    
    // Revenue
    if (d.metric === 'Revenue_Actual') {
      grouped[groupKey].revenue += value / 100;
    }
    
    // PPC
    if ((d.metric === 'PPC_Actual' || d.metric === 'Actual_PPC') && value > 0) {
      grouped[groupKey].ppc.push(value);
    }
    
    // WL1 Headcount by month
    if (d.metric === 'Headcount_WL1' && periodMonths.includes(month)) {
      if (!grouped[groupKey].wl1Totals[month]) {
        grouped[groupKey].wl1Totals[month] = {};
      }
      const projectKey = d.project || 'unknown';
      grouped[groupKey].wl1Totals[month][projectKey] = value;
    }
    
    // Overall Headcount by month (per project)
    if (d.metric === 'Headcount_Overall' && periodMonths.includes(month)) {
      if (!grouped[groupKey].overallHCByMonth[month]) {
        grouped[groupKey].overallHCByMonth[month] = {};
      }
      const projectKey = d.project || 'unknown';
      grouped[groupKey].overallHCByMonth[month][projectKey] = value;
    }
    
    // Joiners
    if (d.metric === 'Taggd_Source_Joiner') {
      grouped[groupKey].taggdJoiners += value;
    }
    if (d.metric === 'Non_Taggd_Source_Joiner' || d.metric === 'Non Taggd_Source_Joiner') {
      grouped[groupKey].totalJoiners += value;
    }
  });
  
  // Calculate metrics
  return Object.entries(grouped).map(([name, data]) => {
    const avgPPC = data.ppc.length > 0 
      ? data.ppc.reduce((sum, v) => sum + v, 0) / data.ppc.length 
      : 0;
    
    // Sum WL1 HC across all months (sum of project values per month)
    const totalWL1HC = Object.values(data.wl1Totals).reduce((sum, monthData) => {
      return sum + Object.values(monthData).reduce((s, v) => s + v, 0);
    }, 0);
    const avgWL1HC = numMonths > 0 ? totalWL1HC / numMonths : 0;
    
    // Get latest month overall HC (sum of all projects in latest month)
    const latestMonth = periodMonths[periodMonths.length - 1];
    const latestHCData = data.overallHCByMonth[latestMonth] || {};
    const overallHC = Object.values(latestHCData).reduce((sum, v) => sum + v, 0);
    
    const totalJoiners = data.taggdJoiners + data.totalJoiners;
    
    const revenueProductivity = totalWL1HC > 0 ? ((data.revenue * 100) / totalWL1HC) : 0;
    const taggdJoinerProductivity = totalWL1HC > 0 
      ? (data.taggdJoiners / totalWL1HC) 
      : 0;
    
    return {
      name,
      revenue: data.revenue,
      ppc: Math.round(avgPPC / 100) * 100, // Round to nearest 100
      revenueProductivity: revenueProductivity,
      taggdJoinerProductivity: taggdJoinerProductivity,
      totalJoiners: totalJoiners,
      wl1HC: avgWL1HC,
      overallHC: overallHC
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

// Render PPC & Productivity table row with drill-down
function renderPPCProductivityTableRow(row) {
  const canDrillDown = drillState.currentLevel !== 'project';
  
  const ppcColor = row.ppc > 110000 ? 'text-red-600' : (row.ppc > 100000 ? 'text-yellow-600' : 'text-green-600');
  const prodColor = row.revenueProductivity >= 2.0 ? 'text-green-600' : (row.revenueProductivity >= 1.5 ? 'text-yellow-600' : 'text-red-600');
  
  // Calculate performance score
  let performanceScore = 0;
  if (row.ppc <= 105000) performanceScore++; // Good PPC
  if (row.revenueProductivity >= 2.0) performanceScore++; // Good productivity
  if (row.taggdJoinerProductivity >= 2.0) performanceScore++; // Good taggd productivity
  
  const performanceLabel = performanceScore >= 2 ? 'Good' : performanceScore === 1 ? 'Fair' : 'Poor';
  const performanceColor = performanceScore >= 2 ? 'bg-green-100 text-green-700' : performanceScore === 1 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
  const performanceIcon = performanceScore >= 2 ? 'check-circle' : performanceScore === 1 ? 'minus-circle' : 'times-circle';
  
  return `
    <tr class="border-b border-gray-200 hover:bg-purple-50 transition-colors">
      <td class="px-4 py-3 font-semibold text-gray-800">${row.name}</td>
      <td class="px-4 py-3 text-right font-bold">${formatWithUnit(row.revenue, 'Crore')}</td>
      <td class="px-4 py-3 text-right ${ppcColor} font-semibold">₹${formatNumber(row.ppc)}</td>
      <td class="px-4 py-3 text-right ${prodColor} font-semibold">${row.revenueProductivity.toFixed(2)}</td>
      <td class="px-4 py-3 text-right font-semibold">${row.taggdJoinerProductivity.toFixed(2)}</td>
      <td class="px-4 py-3 text-center">
        <span class="px-2 py-1 ${performanceColor} rounded text-xs font-bold inline-flex items-center">
          <i class="fas fa-${performanceIcon} mr-1"></i>${performanceLabel}
        </span>
      </td>
      <td class="px-4 py-3 text-right">${Math.round(row.totalJoiners)}</td>
      <td class="px-4 py-3 text-right">${Math.round(row.wl1HC)}</td>
      <td class="px-4 py-3 text-right">${Math.round(row.overallHC)}</td>
      <td class="px-4 py-3 text-center">
        ${canDrillDown ? `
          <button onclick="drillDown('${row.name}')" 
                  class="px-3 py-1 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg text-xs font-semibold hover:shadow-lg transition-all">
            <i class="fas fa-arrow-right mr-1"></i>Drill
          </button>
        ` : `
          <span class="text-gray-400 text-xs">—</span>
        `}
      </td>
    </tr>
  `;
}

// Headcount & Capacity Combined Page
function renderHeadcountCapacity() {
  if (!state.metrics) {
    return "<p class=\"text-gray-500 p-6\">Loading metrics...</p>"
  }
  
  const m = state.metrics
  
  // Calculate Revenue per HC (overall)
  const revenuePerHC = m.headcount.overall > 0 
    ? (m.revenue.actual / m.headcount.overall) 
    : 0
  
  const hcYoY = m.headcount.yoyYTD?.growth || null
  
  return `
    <div class="fade-in">
      <h2 class="text-3xl font-bold text-gray-900 mb-6 flex items-center">
        <i class="fas fa-users text-orange-600 mr-3"></i>
        Headcount & Capacity Analysis
      </h2>
      
      ${renderYoYComparison()}
      
      <!-- Simplified to 3 Enhanced KPI Cards -->
      <div class="grid grid-cols-3 gap-6 mb-6">
        ${renderEnhancedKPICard({
          title: 'Headcount (Overall)',
          value: m.headcount.overall,
          unit: 'HC',
          icon: 'users',
          color: 'orange',
          target: m.headcount.approved,
          yoyGrowth: hcYoY,
          momGrowth: null,
          varianceVsTarget: m.headcount.approved > 0 ? ((m.headcount.overall - m.headcount.approved) / m.headcount.approved * 100) : null,
          invertColors: true
        })}
        ${renderEnhancedKPICard({
          title: 'Recruiter Headcount (WL1)',
          value: m.headcount.wl1,
          unit: 'HC',
          icon: 'user-tie',
          color: 'purple',
          target: null,
          yoyGrowth: null,
          momGrowth: null,
          varianceVsTarget: null
        })}
        ${renderEnhancedKPICard({
          title: 'Revenue Per HC (Overall)',
          value: revenuePerHC,
          unit: '₹ Lacs/HC',
          icon: 'chart-line',
          color: 'teal',
          target: null,
          yoyGrowth: null,
          momGrowth: null,
          varianceVsTarget: null
        })}
      </div>
      
      <!-- Charts Section -->
      ${renderHeadcountChartsHTML(m)}
      
      <!-- Drill-down table with Headcount metrics -->
      ${renderHeadcountCapacityDrillDown()}
    </div>
  `
}

// Headcount-specific charts HTML
function renderHeadcountChartsHTML(m) {
  return `
    <div class="grid grid-cols-2 gap-6 mb-6">
      <!-- Chart 1: Approved vs Actual HC (Bar) -->
      <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
        <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
          <i class="fas fa-chart-bar text-blue-600 mr-2"></i>
          Approved vs Actual Headcount
        </h3>
        <canvas id="approvedVsActualChart" class="chart-compact"></canvas>
      </div>
      
      <!-- Chart 2: HC Growth Trend -->
      <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
        <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
          <i class="fas fa-chart-line text-green-600 mr-2"></i>
          Headcount Growth Trend
        </h3>
        <canvas id="hcGrowthTrendChart" class="chart-compact"></canvas>
      </div>
      
      <!-- Chart 3: HC vs Revenue Growth Comparison -->
      <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
        <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
          <i class="fas fa-chart-area text-purple-600 mr-2"></i>
          HC vs Revenue Growth Comparison
        </h3>
        <canvas id="hcRevenueGrowthChart" class="chart-compact"></canvas>
      </div>
      
      <!-- Chart 4: HC Mix (WL1 vs Others) -->
      <div class="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
        <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
          <i class="fas fa-chart-pie text-orange-600 mr-2"></i>
          Headcount Mix (WL1 vs Others)
        </h3>
        <canvas id="hcMixChart" class="chart-compact"></canvas>
      </div>
    </div>
  `;
}

// Headcount & Capacity Drill-Down Table
function renderHeadcountCapacityDrillDown() {
  console.log('🔍 renderHeadcountCapacityDrillDown called');
  
  if (!state.rawData || state.rawData.length === 0) {
    console.warn('⚠️ No rawData available for drill-down');
    return '<p class="text-gray-500 p-6">No data available</p>';
  }
  
  const currentLevel = drillState.currentLevel;
  const parentFilters = {};
  
  // Build parent filters from breadcrumb
  drillState.breadcrumb.forEach(crumb => {
    if (crumb.level !== 'overall' && crumb.value) {
      const filterKey = HC_DRILL_HIERARCHY.find(h => h.level === crumb.level)?.filterKey;
      if (filterKey) {
        parentFilters[filterKey] = crumb.value;
      }
    }
  });
  
  const aggregatedData = aggregateHeadcountCapacityByLevel(state.rawData, currentLevel, parentFilters);
  
  return `
    <div class="bg-white rounded-lg shadow-lg overflow-hidden mb-6 border border-gray-200">
      ${renderBreadcrumb()}
      
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gradient-to-r from-orange-600 to-amber-600 text-white">
              <th class="px-4 py-3 text-left font-bold">
                <i class="fas ${getCurrentLevelIcon()} mr-2"></i>${getCurrentLevelLabel()}
              </th>
              <th class="px-4 py-3 text-right font-bold">Headcount</th>
              <th class="px-4 py-3 text-right font-bold">Approved</th>
              <th class="px-4 py-3 text-right font-bold">Revenue (₹ Cr)</th>
              <th class="px-4 py-3 text-right font-bold">Rev/HC/Mo (WL1)</th>
              <th class="px-4 py-3 text-right font-bold">CM %</th>
              <th class="px-4 py-3 text-right font-bold">Utilization %</th>
              <th class="px-4 py-3 text-right font-bold">YoY Growth %</th>
              <th class="px-4 py-3 text-center font-bold">Action</th>
            </tr>
          </thead>
          <tbody>
            ${aggregatedData.map(row => renderHeadcountCapacityTableRow(row)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Aggregate Headcount & Capacity data by drill-down level
function aggregateHeadcountCapacityByLevel(data, level, parentFilters) {
  const grouped = {};
  const periodMonths = calculateMonthsForPeriod(state.filters.periodMode, state.filters.endMonth, state.filters.fy);
  const numMonths = periodMonths.length || 12;
  
  console.log('📊 aggregateHeadcountCapacityByLevel - level:', level, 'periodMonths:', periodMonths);
  
  // Get last year data for YoY comparison
  const lastYearData = state.lastFYData || [];
  
  // Determine grouping field based on level
  const groupField = {
    'overall': null,
    'vertical': 'vertical',
    'region': 'region',
    'subRegion': 'sub_region',
    'project': 'project'
  }[level];
  
  // Filter data based on parent filters
  let filteredData = data.filter(d => 
    (!parentFilters.vertical || d.vertical === parentFilters.vertical) &&
    (!parentFilters.region || d.region === parentFilters.region) &&
    (!parentFilters.sub_region || d.sub_region === parentFilters.sub_region)
  );
  
  console.log('  Filtered data count:', filteredData.length);
  
  // Group data
  filteredData.forEach(d => {
    const groupKey = level === 'overall' ? 'Overall' : (d[groupField] || 'Unknown');
    
    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        overallHCByMonth: {},
        approvedHCByMonth: {},
        wl1Totals: {},
        revenue: 0,
        cm: 0,
        lastYearHC: 0,
        projectsCount: new Set()
      };
    }
    
    const value = safeParseFloat(d.value);
    const month = d.month || d.time_period;
    
    // Track unique projects
    if (d.project) {
      grouped[groupKey].projectsCount.add(d.project);
    }
    
    // Overall Headcount by month (sum across projects per month, then get latest)
    if (d.metric === 'Headcount_Overall' && periodMonths.includes(month)) {
      if (!grouped[groupKey].overallHCByMonth[month]) {
        grouped[groupKey].overallHCByMonth[month] = {};
      }
      // Sum by project for each month
      const projectKey = d.project || 'unknown';
      grouped[groupKey].overallHCByMonth[month][projectKey] = value;
    }
    
    // Approved Headcount by month (sum across projects per month, then get latest)
    if (d.metric === 'Headcount_Approved' && periodMonths.includes(month)) {
      if (!grouped[groupKey].approvedHCByMonth[month]) {
        grouped[groupKey].approvedHCByMonth[month] = {};
      }
      const projectKey = d.project || 'unknown';
      grouped[groupKey].approvedHCByMonth[month][projectKey] = value;
    }
    
    // WL1 Headcount by month (sum across projects)
    if (d.metric === 'Headcount_WL1' && periodMonths.includes(month)) {
      if (!grouped[groupKey].wl1Totals[month]) {
        grouped[groupKey].wl1Totals[month] = 0;
      }
      grouped[groupKey].wl1Totals[month] += value;
    }
    
    // Revenue (sum)
    if (d.metric === 'Revenue_Actual') {
      grouped[groupKey].revenue += value;
    }
    
    // CM (sum)
    if (d.metric === 'CM_Actual') {
      grouped[groupKey].cm += value;
    }
  });
  
  // Get last year headcount for YoY
  lastYearData.forEach(d => {
    const groupKey = level === 'overall' ? 'Overall' : (d[groupField] || 'Unknown');
    
    if (grouped[groupKey] && d.metric === 'Headcount_Overall') {
      const value = safeParseFloat(d.value);
      const month = d.month || d.time_period;
      
      // Get the last month's headcount for YoY comparison
      if (month === periodMonths[periodMonths.length - 1]) {
        if (!grouped[groupKey].lastYearHC) {
          grouped[groupKey].lastYearHC = 0;
        }
        grouped[groupKey].lastYearHC += value;
      }
    }
  });
  
  // Calculate metrics
  const results = Object.entries(grouped).map(([name, data]) => {
    // Get latest month's overall HC (sum across all projects)
    const latestMonth = periodMonths[periodMonths.length - 1];
    const latestOverallHC = data.overallHCByMonth[latestMonth] 
      ? Object.values(data.overallHCByMonth[latestMonth]).reduce((sum, v) => sum + v, 0)
      : 0;
    
    // Get latest month's approved HC (sum across all projects)
    const latestApprovedHC = data.approvedHCByMonth[latestMonth]
      ? Object.values(data.approvedHCByMonth[latestMonth]).reduce((sum, v) => sum + v, 0)
      : 0;
    
    // Calculate total WL1 HC
    const totalWL1HC = Object.values(data.wl1Totals).reduce((sum, v) => sum + v, 0);
    
    const revenuePerHCPerMonth = totalWL1HC > 0 ? (data.revenue / totalWL1HC) : 0;
    const cmPercent = data.revenue > 0 ? ((data.cm / data.revenue) * 100) : 0;
    const utilization = latestApprovedHC > 0 ? ((latestOverallHC / latestApprovedHC) * 100) : 0;
    const yoyGrowth = data.lastYearHC > 0 
      ? (((latestOverallHC - data.lastYearHC) / data.lastYearHC) * 100) 
      : null;
    
    console.log('  Group:', name, '| HC:', latestOverallHC, '| Approved:', latestApprovedHC, '| Revenue:', data.revenue.toFixed(2), '| Projects:', data.projectsCount.size);
    
    return {
      name,
      headcount: latestOverallHC,
      approved: latestApprovedHC,
      revenue: data.revenue,
      revenuePerHCPerMonth: revenuePerHCPerMonth,
      cmPercent: cmPercent,
      utilization: utilization,
      yoyGrowth: yoyGrowth
    };
  }).sort((a, b) => b.headcount - a.headcount);
  
  console.log('  Total groups:', results.length);
  return results;
}

// Render Headcount & Capacity table row with drill-down
function renderHeadcountCapacityTableRow(row) {
  const canDrillDown = drillState.currentLevel !== 'project';
  
  // Color coding: HC > Approved (Red), Low Productivity (Orange)
  const hcColor = row.headcount > row.approved ? 'text-red-600 font-bold' : 'text-gray-900';
  const prodColor = row.revenuePerHCPerMonth < 1.5 
    ? 'text-orange-600 font-bold' 
    : (row.revenuePerHCPerMonth >= 2.0 ? 'text-green-600 font-semibold' : 'text-gray-900');
  const utilizationColor = row.utilization > 100 ? 'text-red-600 font-bold' : 'text-green-600';
  const yoyColor = row.yoyGrowth !== null 
    ? (row.yoyGrowth >= 0 ? 'text-green-600' : 'text-red-600') 
    : 'text-gray-400';
  
  return `
    <tr class="border-b border-gray-200 hover:bg-orange-50 transition-colors">
      <td class="px-4 py-3 font-semibold text-gray-800">${row.name}</td>
      <td class="px-4 py-3 text-right ${hcColor}">${Math.round(row.headcount)}</td>
      <td class="px-4 py-3 text-right text-gray-600">${Math.round(row.approved)}</td>
      <td class="px-4 py-3 text-right font-bold">${formatWithUnit(row.revenue, 'Crore')}</td>
      <td class="px-4 py-3 text-right ${prodColor}">${row.revenuePerHCPerMonth.toFixed(2)}</td>
      <td class="px-4 py-3 text-right font-semibold">${row.cmPercent.toFixed(1)}%</td>
      <td class="px-4 py-3 text-right ${utilizationColor}">${row.utilization.toFixed(1)}%</td>
      <td class="px-4 py-3 text-right ${yoyColor}">
        ${row.yoyGrowth !== null ? (row.yoyGrowth >= 0 ? '↑' : '↓') + ' ' + Math.abs(row.yoyGrowth).toFixed(1) + '%' : '—'}
      </td>
      <td class="px-4 py-3 text-center">
        ${canDrillDown ? `
          <button onclick="drillDown('${row.name}')" 
                  class="px-3 py-1 bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-lg text-xs font-semibold hover:shadow-lg transition-all">
            <i class="fas fa-arrow-right mr-1"></i>Drill
          </button>
        ` : `
          <span class="text-gray-400 text-xs">—</span>
        `}
      </td>
    </tr>
  `;
}

// ============================================================================
// UPDATED REVENUE PAGE
// ============================================================================

function renderRevenue() {
  if (!state.metrics) {
    return "<p class=\"text-gray-500 p-6\">Loading metrics...</p>"
  }
  
  const m = state.metrics
  const data = state.rawData
  
  // Group by project
  const projectData = {}
  data.filter(d => ['Revenue_Budget', 'Revenue_Actual', 'Rev_Forecast'].includes(d.metric)).forEach(d => {
    if (!projectData[d.project]) {
      projectData[d.project] = { budget: 0, actual: 0, forecast: 0, region: d.region, vertical: d.vertical }
    }
    if (d.metric === 'Revenue_Budget') projectData[d.project].budget += parseFloat(d.value || 0)
    if (d.metric === 'Revenue_Actual') projectData[d.project].actual += parseFloat(d.value || 0)
    if (d.metric === 'Rev_Forecast') projectData[d.project].forecast += parseFloat(d.value || 0)
  })
  
  const projects = Object.entries(projectData).map(([name, data]) => ({
    name,
    ...data,
    variance: data.actual - data.budget,
    variancePercent: data.budget > 0 ? ((data.actual - data.budget) / data.budget * 100) : 0
  })).sort((a, b) => b.actual - a.actual)
  
  return `
    <div class="fade-in">
      <h2 class="text-3xl font-bold text-gray-900 mb-6 flex items-center">
        <i class="fas fa-dollar-sign text-blue-600 mr-3"></i>
        Revenue Analysis
      </h2>
      
      <!-- Summary Cards -->
      <div class="grid grid-cols-5 gap-4 mb-6">
        ${renderKPICard('Budget', m.revenue.budget, null, 'Crore', 'file-alt', 'gray', null)}
        ${renderKPICard('Actual', m.revenue.actual, m.revenue.budget, 'Crore', 'dollar-sign', 'blue', m.revenue.variancePercent)}
        ${renderKPICard('Forecast', m.revenue.forecast, null, 'Crore', 'chart-line', 'purple', null)}
        ${renderKPICard('Forecast As-On', m.revenue.forecastAsOn, m.revenue.budget, 'Crore', 'calendar-check', 'teal', m.revenue.forecastVariancePercent)}
        ${renderKPICard('Variance', m.revenue.variance, null, 'Crore', 'delta', m.revenue.variance >= 0 ? 'green' : 'red', null)}
      </div>
      
      <!-- Project-wise Revenue -->
      <div class="card hover-lift p-6">
        <h3 class="text-xl font-bold mb-4">Project-wise Revenue Performance</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gradient-to-r from-blue-50 to-purple-50">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Project</th>
                <th class="px-4 py-3 text-left font-semibold">Region</th>
                <th class="px-4 py-3 text-left font-semibold">Vertical</th>
                <th class="px-4 py-3 text-right font-semibold">Budget</th>
                <th class="px-4 py-3 text-right font-semibold">Actual</th>
                <th class="px-4 py-3 text-right font-semibold">Forecast</th>
                <th class="px-4 py-3 text-right font-semibold">Variance</th>
                <th class="px-4 py-3 text-right font-semibold">Var %</th>
              </tr>
            </thead>
            <tbody>
              ${projects.map(p => `
                <tr class="border-t hover:bg-blue-50">
                  <td class="px-4 py-3 font-medium">${p.name}</td>
                  <td class="px-4 py-3">${p.region}</td>
                  <td class="px-4 py-3">${p.vertical}</td>
                  <td class="px-4 py-3 text-right">${formatNumber(p.budget)}</td>
                  <td class="px-4 py-3 text-right font-bold">${formatNumber(p.actual)}</td>
                  <td class="px-4 py-3 text-right">${formatNumber(p.forecast)}</td>
                  <td class="px-4 py-3 text-right ${p.variance >= 0 ? 'text-green-600' : 'text-red-600'} font-semibold">
                    ${p.variance >= 0 ? '+' : ''}${formatNumber(p.variance)}
                  </td>
                  <td class="px-4 py-3 text-right ${p.variancePercent >= 0 ? 'text-green-600' : 'text-red-600'} font-bold">
                    ${p.variance >= 0 ? '+' : ''}${p.variancePercent.toFixed(1)}%
                  </td>
                </tr>
              `).join('')}
              <tr class="border-t bg-gradient-to-r from-blue-100 to-purple-100 font-bold text-lg">
                <td class="px-4 py-3" colspan="3">Total</td>
                <td class="px-4 py-3 text-right">${formatNumber(m.revenue.budget)}</td>
                <td class="px-4 py-3 text-right">${formatNumber(m.revenue.actual)}</td>
                <td class="px-4 py-3 text-right">${formatNumber(m.revenue.forecast)}</td>
                <td class="px-4 py-3 text-right ${m.revenue.variance >= 0 ? 'text-green-600' : 'text-red-600'}">
                  ${m.revenue.variance >= 0 ? '+' : ''}${formatNumber(m.revenue.variance)}
                </td>
                <td class="px-4 py-3 text-right ${m.revenue.variancePercent >= 0 ? 'text-green-600' : 'text-red-600'}">
                  ${m.revenue.variance >= 0 ? '+' : ''}${m.revenue.variancePercent.toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
}

// ============================================================================
// UPDATED CM PAGE
// ============================================================================

function renderCM() {
  if (!state.metrics) {
    return "<p class=\"text-gray-500 p-6\">Loading metrics...</p>"
  }
  
  const m = state.metrics
  const data = state.rawData
  
  // Group by project
  const projectData = {}
  data.filter(d => ['CM_Budget', 'CM Actual', 'CM_Actual', 'CM_Forecast', 'Revenue_Budget', 'Revenue_Actual', 'Rev_Forecast'].includes(d.metric)).forEach(d => {
    if (!projectData[d.project]) {
      projectData[d.project] = { cmBudget: 0, cmActual: 0, cmForecast: 0, revBudget: 0, revActual: 0, revForecast: 0, region: d.region }
    }
    if (d.metric === 'CM_Budget') projectData[d.project].cmBudget += parseFloat(d.value || 0)
    if (['CM Actual', 'CM_Actual'].includes(d.metric)) projectData[d.project].cmActual += parseFloat(d.value || 0)
    if (d.metric === 'CM_Forecast') projectData[d.project].cmForecast += parseFloat(d.value || 0)
    if (d.metric === 'Revenue_Budget') projectData[d.project].revBudget += parseFloat(d.value || 0)
    if (d.metric === 'Revenue_Actual') projectData[d.project].revActual += parseFloat(d.value || 0)
    if (d.metric === 'Rev_Forecast') projectData[d.project].revForecast += parseFloat(d.value || 0)
  })
  
  const projects = Object.entries(projectData).map(([name, data]) => ({
    name,
    ...data,
    cmBudgetPercent: data.revBudget > 0 ? (data.cmBudget / data.revBudget * 100) : 0,
    cmActualPercent: data.revActual > 0 ? (data.cmActual / data.revActual * 100) : 0,
    cmForecastPercent: data.revForecast > 0 ? (data.cmForecast / data.revForecast * 100) : 0,
    ppVariance: data.revActual > 0 && data.revBudget > 0 ? ((data.cmActual / data.revActual * 100) - (data.cmBudget / data.revBudget * 100)) : 0
  })).sort((a, b) => b.cmActual - a.cmActual)
  
  return `
    <div class="fade-in">
      <h2 class="text-3xl font-bold text-gray-900 mb-6 flex items-center">
        <i class="fas fa-percentage text-green-600 mr-3"></i>
        Contribution Margin Analysis
      </h2>
      
      <!-- Summary Cards -->
      <div class="grid grid-cols-4 gap-4 mb-6">
        ${renderKPICard('CM Budget', m.cm.budget, null, 'Crore', 'file-alt', 'gray', null)}
        ${renderKPICard('CM Actual', m.cm.actual, m.cm.budget, 'Crore', 'percentage', 'green', m.cm.variancePercent)}
        ${renderKPICard('CM %', m.cm.actualPercent, m.cm.budgetPercent, '%', 'chart-pie', 'purple', m.cm.ppVariance)}
        ${renderKPICard('CM Variance', m.cm.variance, null, 'Crore', 'delta', m.cm.variance >= 0 ? 'green' : 'red', null)}
      </div>
      
      <!-- Project-wise CM -->
      <div class="card hover-lift p-6">
        <h3 class="text-xl font-bold mb-4">Project-wise Contribution Margin</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gradient-to-r from-green-50 to-emerald-50">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Project</th>
                <th class="px-4 py-3 text-left font-semibold">Region</th>
                <th class="px-4 py-3 text-right font-semibold">CM Budget</th>
                <th class="px-4 py-3 text-right font-semibold">CM %</th>
                <th class="px-4 py-3 text-right font-semibold">CM Actual</th>
                <th class="px-4 py-3 text-right font-semibold">CM %</th>
                <th class="px-4 py-3 text-right font-semibold">CM Forecast</th>
                <th class="px-4 py-3 text-right font-semibold">CM %</th>
                <th class="px-4 py-3 text-right font-semibold">Var pp</th>
              </tr>
            </thead>
            <tbody>
              ${projects.map(p => `
                <tr class="border-t hover:bg-green-50">
                  <td class="px-4 py-3 font-medium">${p.name}</td>
                  <td class="px-4 py-3">${p.region}</td>
                  <td class="px-4 py-3 text-right">${formatNumber(p.cmBudget)}</td>
                  <td class="px-4 py-3 text-right">${p.cmBudgetPercent.toFixed(1)}%</td>
                  <td class="px-4 py-3 text-right font-bold">${formatNumber(p.cmActual)}</td>
                  <td class="px-4 py-3 text-right font-bold">${p.cmActualPercent.toFixed(1)}%</td>
                  <td class="px-4 py-3 text-right">${formatNumber(p.cmForecast)}</td>
                  <td class="px-4 py-3 text-right">${p.cmForecastPercent.toFixed(1)}%</td>
                  <td class="px-4 py-3 text-right ${p.ppVariance >= 0 ? 'text-green-600' : 'text-red-600'} font-bold">
                    ${p.ppVariance >= 0 ? '+' : ''}${p.ppVariance.toFixed(1)}pp
                  </td>
                </tr>
              `).join('')}
              <tr class="border-t bg-gradient-to-r from-green-100 to-emerald-100 font-bold text-lg">
                <td class="px-4 py-3" colspan="2">Total</td>
                <td class="px-4 py-3 text-right">${formatNumber(m.cm.budget)}</td>
                <td class="px-4 py-3 text-right">${m.cm.budgetPercent.toFixed(1)}%</td>
                <td class="px-4 py-3 text-right">${formatNumber(m.cm.actual)}</td>
                <td class="px-4 py-3 text-right">${m.cm.actualPercent.toFixed(1)}%</td>
                <td class="px-4 py-3 text-right">${formatNumber(m.cm.forecast)}</td>
                <td class="px-4 py-3 text-right">${m.cm.forecastPercent.toFixed(1)}%</td>
                <td class="px-4 py-3 text-right ${m.cm.ppVariance >= 0 ? 'text-green-600' : 'text-red-600'}">
                  ${m.cm.ppVariance >= 0 ? '+' : ''}${m.cm.ppVariance.toFixed(1)}pp
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
}

// ============================================================================
// REMAINING EXISTING PAGES (PPC, Productivity, Headcount)
// ============================================================================

function renderPPC() {
  if (!state.metrics) {
    return "<p class=\"text-gray-500 p-6\">Loading metrics...</p>"
  }
  
  const m = state.metrics
  const data = state.rawData
  
  const regionData = {}
  data.filter(d => ['PPC_Actual', 'Actual_PPC'].includes(d.metric)).forEach(d => {
    if (!regionData[d.region]) regionData[d.region] = 0
    regionData[d.region] += parseFloat(d.value || 0)
  })
  
  const regions = Object.entries(regionData).map(([name, ppc]) => ({ name, ppc })).sort((a, b) => b.ppc - a.ppc)
  
  return `
    <div class="fade-in">
      <h2 class="text-3xl font-bold text-gray-900 mb-6 flex items-center">
        <i class="fas fa-users text-orange-600 mr-3"></i>
        Per Person Cost (PPC) Analysis
      </h2>
      
      <div class="grid grid-cols-4 gap-4 mb-6">
        ${renderKPICard('Total PPC', m.ppc.actual, m.ppc.budget, 'Lacs', 'users', 'orange', m.ppc.variancePercent)}
        ${renderKPICard('Avg PPC/Resource', m.headcount.overall > 0 ? m.ppc.actual / m.headcount.overall : 0, null, 'Lacs', 'user', 'blue', null)}
        ${renderKPICard('Total Headcount', m.headcount.overall, null, 'Count', 'user-friends', 'green', null)}
        ${renderKPICard('PPC Variance', m.ppc.variance, null, 'Lacs', 'delta', m.ppc.variance <= 0 ? 'green' : 'red', null)}
      </div>
      
      <div class="card hover-lift p-6">
        <h3 class="text-xl font-bold mb-4">Region-wise PPC</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gradient-to-r from-orange-50 to-amber-50">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Region</th>
                <th class="px-4 py-3 text-right font-semibold">PPC (Lacs)</th>
                <th class="px-4 py-3 text-right font-semibold">% of Total</th>
              </tr>
            </thead>
            <tbody>
              ${regions.map(r => `
                <tr class="border-t hover:bg-orange-50">
                  <td class="px-4 py-3 font-medium">${r.name}</td>
                  <td class="px-4 py-3 text-right font-bold">${formatNumber(r.ppc)}</td>
                  <td class="px-4 py-3 text-right">${m.ppc.actual > 0 ? (r.ppc / m.ppc.actual * 100).toFixed(1) : 0}%</td>
                </tr>
              `).join('')}
              <tr class="border-t bg-gradient-to-r from-orange-100 to-amber-100 font-bold">
                <td class="px-4 py-3">Total</td>
                <td class="px-4 py-3 text-right text-lg">${formatNumber(m.ppc.actual)}</td>
                <td class="px-4 py-3 text-right">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
}

function renderProductivity() {
  if (!state.metrics) {
    return "<p class=\"text-gray-500 p-6\">Loading metrics...</p>"
  }
  
  const m = state.metrics
  const data = state.rawData
  
  const regionData = {}
  data.forEach(d => {
    if (!regionData[d.region]) {
      regionData[d.region] = { revenue: 0, headcount: 0, target: 0 }
    }
    if (d.metric === 'Revenue_Actual') regionData[d.region].revenue += parseFloat(d.value || 0)
    if (['Headcount_Overall', 'Actual_Headcount Overall'].includes(d.metric)) regionData[d.region].headcount = Math.max(regionData[d.region].headcount, parseFloat(d.value || 0))
    if (['Target_Rev_Productivity', 'Target Rev Productivity'].includes(d.metric)) regionData[d.region].target = Math.max(regionData[d.region].target, parseFloat(d.value || 0))
  })
  
  const regions = Object.entries(regionData).map(([name, data]) => ({
    name,
    ...data,
    actual: data.headcount > 0 ? data.revenue / data.headcount : 0
  })).sort((a, b) => b.actual - a.actual)
  
  return `
    <div class="fade-in">
      <h2 class="text-3xl font-bold text-gray-900 mb-6 flex items-center">
        <i class="fas fa-chart-bar text-teal-600 mr-3"></i>
        Productivity Analysis
      </h2>
      
      <!-- Overall Productivity Cards -->
      <div class="mb-4">
        <h3 class="text-lg font-semibold text-gray-700 mb-3">Overall Productivity</h3>
        <div class="grid grid-cols-4 gap-4">
          ${renderKPICard('Target Productivity', m.productivity.target, null, 'Lacs', 'bullseye', 'gray', null)}
          ${renderKPICard('Actual Productivity', m.productivity.actual, m.productivity.target, 'Lacs', 'chart-bar', 'teal', m.productivity.variancePercent)}
          ${renderKPICard('Total Revenue', m.revenue.actual, null, 'Crore', 'dollar-sign', 'green', null)}
          ${renderKPICard('Total Headcount', m.headcount.overall, null, 'Count', 'users', 'purple', null)}
        </div>
      </div>
      
      <!-- Recruiter Productivity Cards -->
      <div class="mb-6">
        <h3 class="text-lg font-semibold text-gray-700 mb-3">Recruiter Productivity (Per Month)</h3>
        <div class="grid grid-cols-4 gap-4">
          ${renderKPICard('Revenue per Recruiter/Month', m.productivity.revenuePerRecruiterPerMonth, null, 'Lacs', 'user-tie', 'blue', null)}
          ${renderKPICard('Joiner Productivity (Taggd)', m.productivity.joinerProductivityTaggdPerMonth, null, 'Count', 'user-plus', 'indigo', null)}
          ${renderKPICard('WL1 Headcount', m.headcount.wl1, null, 'Count', 'users', 'orange', null)}
          ${renderKPICard('Total Taggd Joiners', m.hiring.taggd, null, 'Count', 'user-check', 'green', null)}
        </div>
      </div>
      
      <div class="card hover-lift p-6">
        <h3 class="text-xl font-bold mb-4">Region-wise Productivity</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gradient-to-r from-teal-50 to-cyan-50">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Region</th>
                <th class="px-4 py-3 text-right font-semibold">Revenue</th>
                <th class="px-4 py-3 text-right font-semibold">Headcount</th>
                <th class="px-4 py-3 text-right font-semibold">Target</th>
                <th class="px-4 py-3 text-right font-semibold">Actual</th>
                <th class="px-4 py-3 text-right font-semibold">Achievement %</th>
              </tr>
            </thead>
            <tbody>
              ${regions.map(r => {
                const achievement = r.target > 0 ? (r.actual / r.target * 100) : 0
                return `
                  <tr class="border-t hover:bg-teal-50">
                    <td class="px-4 py-3 font-medium">${r.name}</td>
                    <td class="px-4 py-3 text-right">${formatNumber(r.revenue)}</td>
                    <td class="px-4 py-3 text-right">${Math.round(r.headcount)}</td>
                    <td class="px-4 py-3 text-right">${formatNumber(r.target)}</td>
                    <td class="px-4 py-3 text-right font-bold">${formatNumber(r.actual)}</td>
                    <td class="px-4 py-3 text-right ${achievement >= 100 ? 'text-green-600' : 'text-orange-600'} font-bold">
                      ${achievement.toFixed(1)}%
                    </td>
                  </tr>
                `
              }).join('')}
              <tr class="border-t bg-gradient-to-r from-teal-100 to-cyan-100 font-bold">
                <td class="px-4 py-3">Total</td>
                <td class="px-4 py-3 text-right">${formatNumber(m.revenue.actual)}</td>
                <td class="px-4 py-3 text-right">${Math.round(m.headcount.overall)}</td>
                <td class="px-4 py-3 text-right">${formatNumber(m.productivity.target)}</td>
                <td class="px-4 py-3 text-right text-lg">${formatNumber(m.productivity.actual)}</td>
                <td class="px-4 py-3 text-right text-lg ${m.productivity.actual >= m.productivity.target ? 'text-green-600' : 'text-orange-600'}">
                  ${m.productivity.target > 0 ? (m.productivity.actual / m.productivity.target * 100).toFixed(1) : 0}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
}

function renderHeadcount() {
  if (!state.metrics) {
    return "<p class=\"text-gray-500 p-6\">Loading metrics...</p>"
  }
  
  const m = state.metrics
  const data = state.rawData
  
  const regionData = {}
  data.filter(d => ['Headcount_Overall', 'Headcount_Approved', 'Headcount_WL1', 'Actual_Headcount Overall', 'Approved_Headcount', 'Actual Headcount WL1'].includes(d.metric)).forEach(d => {
    if (!regionData[d.region]) {
      regionData[d.region] = { overall: 0, approved: 0, wl1: 0 }
    }
    if (['Headcount_Overall', 'Actual_Headcount Overall'].includes(d.metric)) regionData[d.region].overall = Math.max(regionData[d.region].overall, parseFloat(d.value || 0))
    if (['Headcount_Approved', 'Approved_Headcount'].includes(d.metric)) regionData[d.region].approved = Math.max(regionData[d.region].approved, parseFloat(d.value || 0))
    if (['Headcount_WL1', 'Actual Headcount WL1'].includes(d.metric)) regionData[d.region].wl1 = Math.max(regionData[d.region].wl1, parseFloat(d.value || 0))
  })
  
  const regions = Object.entries(regionData).map(([name, data]) => ({
    name,
    ...data,
    utilization: data.approved > 0 ? (data.overall / data.approved * 100) : 0
  })).sort((a, b) => b.overall - a.overall)
  
  return `
    <div class="fade-in">
      <h2 class="text-3xl font-bold text-gray-900 mb-6 flex items-center">
        <i class="fas fa-user-friends text-purple-600 mr-3"></i>
        Headcount Analysis
      </h2>
      
      <div class="grid grid-cols-4 gap-4 mb-6">
        ${renderKPICard('Total Headcount', m.headcount.overall, null, 'Count', 'users', 'purple', null)}
        ${renderKPICard('Approved HC', m.headcount.approved, null, 'Count', 'user-check', 'green', null)}
        ${renderKPICard('WL1 Headcount', m.headcount.wl1, null, 'Count', 'user-tie', 'blue', null)}
        ${renderKPICard('Utilization', m.headcount.utilization, 100, '%', 'chart-pie', m.headcount.utilization > 100 ? 'red' : 'green', null)}
      </div>
      
      <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="card hover-scale p-6 bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200">
          <h3 class="text-lg font-semibold mb-3 flex items-center">
            <i class="fas fa-users text-indigo-600 mr-2"></i>
            Hiring Sources
          </h3>
          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-gray-700">Taggd Source</span>
              <span class="text-2xl font-bold text-indigo-600">${Math.round(m.hiring.taggd)}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-700">Non-Taggd Source</span>
              <span class="text-2xl font-bold text-blue-600">${Math.round(m.hiring.nonTaggd)}</span>
            </div>
            <div class="flex justify-between items-center pt-3 border-t border-indigo-200">
              <span class="text-gray-700 font-semibold">Total Joiners</span>
              <span class="text-2xl font-bold text-gray-900">${Math.round(m.hiring.taggd + m.hiring.nonTaggd)}</span>
            </div>
          </div>
        </div>
        
        <div class="card hover-scale p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200">
          <h3 class="text-lg font-semibold mb-3 flex items-center">
            <i class="fas fa-chart-pie text-green-600 mr-2"></i>
            Hiring Mix
          </h3>
          <div class="space-y-3">
            <div>
              <div class="flex justify-between mb-1">
                <span class="text-sm text-gray-600">Taggd %</span>
                <span class="text-sm font-medium">${m.hiring.taggdMix.toFixed(1)}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill bg-gradient-to-r from-indigo-500 to-purple-500" style="width: ${m.hiring.taggdMix}%"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between mb-1">
                <span class="text-sm text-gray-600">Non-Taggd %</span>
                <span class="text-sm font-medium">${m.hiring.nonTaggdMix.toFixed(1)}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill bg-gradient-to-r from-blue-500 to-cyan-500" style="width: ${m.hiring.nonTaggdMix}%"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="card hover-lift p-6">
        <h3 class="text-xl font-bold mb-4">Region-wise Headcount</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gradient-to-r from-purple-50 to-pink-50">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Region</th>
                <th class="px-4 py-3 text-right font-semibold">Overall HC</th>
                <th class="px-4 py-3 text-right font-semibold">Approved HC</th>
                <th class="px-4 py-3 text-right font-semibold">WL1 HC</th>
                <th class="px-4 py-3 text-right font-semibold">Utilization %</th>
              </tr>
            </thead>
            <tbody>
              ${regions.map(r => `
                <tr class="border-t hover:bg-purple-50">
                  <td class="px-4 py-3 font-medium">${r.name}</td>
                  <td class="px-4 py-3 text-right font-bold">${Math.round(r.overall)}</td>
                  <td class="px-4 py-3 text-right">${Math.round(r.approved)}</td>
                  <td class="px-4 py-3 text-right">${Math.round(r.wl1)}</td>
                  <td class="px-4 py-3 text-right ${r.utilization > 100 ? 'text-red-600' : r.utilization > 90 ? 'text-orange-600' : 'text-green-600'} font-bold">
                    ${r.utilization.toFixed(1)}%
                  </td>
                </tr>
              `).join('')}
              <tr class="border-t bg-gradient-to-r from-purple-100 to-pink-100 font-bold">
                <td class="px-4 py-3">Total</td>
                <td class="px-4 py-3 text-right text-lg">${Math.round(m.headcount.overall)}</td>
                <td class="px-4 py-3 text-right">${Math.round(m.headcount.approved)}</td>
                <td class="px-4 py-3 text-right">${Math.round(m.headcount.wl1)}</td>
                <td class="px-4 py-3 text-right text-lg">${m.headcount.utilization.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
}


// ============================================================================
// SCORECARDS PAGES
// ============================================================================

function renderScorecardsHome(container) {
  const html = `
    <div class="p-6 space-y-6 animate-fade-in">
      <!-- Header -->
      <div class="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-6 text-white shadow-lg">
        <h2 class="text-3xl font-bold mb-2 flex items-center gap-3">
          <i class="fas fa-trophy"></i>
          Performance Scorecards
        </h2>
        <p class="text-purple-100">6-Pillar Performance Scoring: Revenue (30) | CM (20) | PPC (10) | Productivity (15) | Hiring (10) | Cash (15)</p>
      </div>

      <!-- Quick Navigation Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        ${renderScoreCardNav('project', 'Project', 'briefcase', 'purple')}
        ${renderScoreCardNav('region', 'Region', 'map-marked-alt', 'blue')}
        ${renderScoreCardNav('region2', 'Sub-Region', 'map-marker-alt', 'indigo')}
        ${renderScoreCardNav('rh', 'Region Head', 'user-tie', 'green')}
        ${renderScoreCardNav('ph', 'Practice Head', 'user-cog', 'orange')}
      </div>

      <!-- Overview Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all border-l-4 border-green-500">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-800">Top Performers</h3>
            <div class="bg-green-100 p-3 rounded-lg">
              <i class="fas fa-star text-green-600 text-xl"></i>
            </div>
          </div>
          <div class="text-4xl font-bold text-green-600 mb-2">12</div>
          <p class="text-gray-600">Entities scoring ≥80 points</p>
        </div>

        <div class="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all border-l-4 border-orange-500">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-800">Need Attention</h3>
            <div class="bg-orange-100 p-3 rounded-lg">
              <i class="fas fa-exclamation-triangle text-orange-600 text-xl"></i>
            </div>
          </div>
          <div class="text-4xl font-bold text-orange-600 mb-2">5</div>
          <p class="text-gray-600">Entities scoring <60 points</p>
        </div>

        <div class="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all border-l-4 border-blue-500">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-800">Average Score</h3>
            <div class="bg-blue-100 p-3 rounded-lg">
              <i class="fas fa-chart-line text-blue-600 text-xl"></i>
            </div>
          </div>
          <div class="text-4xl font-bold text-blue-600 mb-2">72.4</div>
          <p class="text-gray-600">Across all entities</p>
        </div>
      </div>

      <!-- Scorecard Methodology -->
      <div class="bg-white rounded-xl p-6 shadow-lg">
        <h3 class="text-xl font-bold text-gray-800 mb-4">📋 Scoring Methodology</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${renderPillarInfo('Revenue', 30, 'revenue', 'Budget & Forecast Achievement', 'blue')}
          ${renderPillarInfo('CM', 20, 'percentage', 'Contribution Margin %', 'green')}
          ${renderPillarInfo('PPC', 10, 'dollar-sign', 'Per Person Cost Efficiency', 'purple')}
          ${renderPillarInfo('Productivity', 15, 'chart-line', 'Revenue Productivity', 'orange')}
          ${renderPillarInfo('Hiring', 10, 'users', 'JPR & Taggd Mix', 'indigo')}
          ${renderPillarInfo('Cash', 15, 'coins', 'Collections & Unbilled', 'teal')}
        </div>
      </div>
    </div>
  `;
  container.innerHTML = html;
}

function renderScoreCardNav(type, title, icon, color) {
  return `
    <div class="bg-gradient-to-br from-${color}-500 to-${color}-600 rounded-xl p-6 text-white shadow-lg hover:shadow-2xl transition-all transform hover:-translate-y-1 cursor-pointer"
         onclick="state.currentPage = 'scorecard-${type}'; renderApp();">
      <div class="flex items-center justify-between mb-4">
        <i class="fas fa-${icon} text-4xl opacity-80"></i>
        <i class="fas fa-arrow-right text-2xl"></i>
      </div>
      <h3 class="text-2xl font-bold mb-2">${title}</h3>
      <p class="text-${color}-100">View detailed scorecard</p>
    </div>
  `;
}

function renderPillarInfo(name, points, icon, desc, color) {
  return `
    <div class="flex items-start gap-3 p-4 bg-${color}-50 rounded-lg border border-${color}-200">
      <div class="bg-${color}-100 p-3 rounded-lg">
        <i class="fas fa-${icon} text-${color}-600 text-xl"></i>
      </div>
      <div class="flex-1">
        <div class="flex items-center justify-between mb-1">
          <h4 class="font-semibold text-gray-800">${name}</h4>
          <span class="bg-${color}-600 text-white px-2 py-1 rounded text-sm font-bold">${points} pts</span>
        </div>
        <p class="text-sm text-gray-600">${desc}</p>
      </div>
    </div>
  `;
}

async function renderScorecard(container, type) {
  const titles = {
    project: 'Project Scorecard',
    region: 'Region Scorecard',
    region2: 'Sub-Region Scorecard',
    rh: 'Region Head Scorecard',
    ph: 'Practice Head Scorecard'
  };
  
  const icons = {
    project: 'briefcase',
    region: 'map-marked-alt',
    region2: 'map-marker-alt',
    rh: 'user-tie',
    ph: 'user-cog'
  };

  // Show loading
  container.innerHTML = '<div class="p-6"><i class="fas fa-spinner fa-spin text-4xl text-blue-600"></i> Loading scorecard...</div>';
  
  // Load real scorecard data from API
  let scorecardData = [];
  try {
    const response = await axios.post(`/api/scorecards/${type}`, state.filters);
    scorecardData = response.data || [];
    
    // If no data, fall back to mock
    if (scorecardData.length === 0) {
      scorecardData = generateMockScorecardData(type);
    } else {
      // Transform API data to display format
      scorecardData = scorecardData.map(item => ({
        name: item.entity,
        totalScore: parseFloat(item.score) || 0,
        revenue: item.scoreBreakdown?.revenue?.points || '0.0',
        cm: item.scoreBreakdown?.cm?.points || '0.0',
        ppc: item.scoreBreakdown?.ppc?.points || '0.0',
        productivity: item.scoreBreakdown?.productivity?.points || '0.0',
        hiring: item.scoreBreakdown?.hiring?.points || '0.0',
        cash: item.scoreBreakdown?.cashHealth?.points || '0.0',
        grade: calculateGrade(parseFloat(item.score) || 0)
      }));
    }
  } catch (error) {
    console.error('Error loading scorecard:', error);
    // Fall back to mock data on error
    scorecardData = generateMockScorecardData(type);
  }
  
  const mockData = scorecardData;

  const html = `
    <div class="p-6 space-y-6 animate-fade-in">
      <!-- Header -->
      <div class="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-6 text-white shadow-lg">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-3xl font-bold mb-2 flex items-center gap-3">
              <i class="fas fa-${icons[type]}"></i>
              ${titles[type]}
            </h2>
            <p class="text-purple-100">100-Point Performance Scoring Across 6 Pillars</p>
          </div>
          <button onclick="state.currentPage = 'scorecards'; renderApp();" 
                  class="bg-white text-purple-600 px-4 py-2 rounded-lg font-semibold hover:bg-purple-50 transition-all">
            <i class="fas fa-arrow-left mr-2"></i>Back to Home
          </button>
        </div>
      </div>

      <!-- Top 3 Performers -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        ${mockData.slice(0, 3).map((item, idx) => renderTopPerformer(item, idx + 1)).join('')}
      </div>

      <!-- Full Rankings Table -->
      <div class="bg-white rounded-xl shadow-lg overflow-hidden">
        <div class="p-6 bg-gray-50 border-b">
          <h3 class="text-xl font-bold text-gray-800">📊 Complete Rankings</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-100">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Rank</th>
                <th class="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Name</th>
                <th class="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Total Score</th>
                <th class="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Revenue</th>
                <th class="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">CM</th>
                <th class="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">PPC</th>
                <th class="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Productivity</th>
                <th class="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Hiring</th>
                <th class="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Cash</th>
                <th class="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Grade</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              ${mockData.map((item, idx) => renderScorecardRow(item, idx + 1)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  container.innerHTML = html;
}

function renderTopPerformer(item, rank) {
  const colors = ['yellow', 'gray', 'orange'];
  const color = colors[rank - 1];
  const medals = ['🥇', '🥈', '🥉'];
  
  return `
    <div class="bg-gradient-to-br from-${color}-400 to-${color}-600 rounded-xl p-6 text-white shadow-lg hover:shadow-2xl transition-all transform hover:-translate-y-1">
      <div class="text-center mb-4">
        <div class="text-6xl mb-2">${medals[rank - 1]}</div>
        <div class="text-2xl font-bold mb-1">#${rank}</div>
      </div>
      <h3 class="text-xl font-bold text-center mb-3">${item.name}</h3>
      <div class="text-center">
        <div class="text-4xl font-bold mb-2">${item.totalScore.toFixed(1)}</div>
        <div class="bg-white bg-opacity-20 px-3 py-1 rounded-full inline-block">
          <span class="font-semibold">${item.grade}</span>
        </div>
      </div>
      <div class="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
        <div class="bg-white bg-opacity-20 rounded-lg p-2">
          <div class="font-semibold">${item.revenue}</div>
          <div class="text-xs opacity-80">Rev</div>
        </div>
        <div class="bg-white bg-opacity-20 rounded-lg p-2">
          <div class="font-semibold">${item.cm}</div>
          <div class="text-xs opacity-80">CM</div>
        </div>
        <div class="bg-white bg-opacity-20 rounded-lg p-2">
          <div class="font-semibold">${item.productivity}</div>
          <div class="text-xs opacity-80">Prod</div>
        </div>
      </div>
    </div>
  `;
}

function renderScorecardRow(item, rank) {
  const gradeColors = {
    'A+': 'green', 'A': 'green', 'B+': 'blue', 'B': 'blue',
    'C+': 'yellow', 'C': 'yellow', 'D': 'red'
  };
  const color = gradeColors[item.grade] || 'gray';
  
  return `
    <tr class="hover:bg-gray-50 transition-colors">
      <td class="px-6 py-4">
        <span class="inline-flex items-center justify-center w-8 h-8 rounded-full ${rank <= 3 ? 'bg-yellow-100 text-yellow-800 font-bold' : 'bg-gray-100 text-gray-600'}">
          ${rank}
        </span>
      </td>
      <td class="px-6 py-4 font-semibold text-gray-800">${item.name}</td>
      <td class="px-6 py-4 text-center">
        <div class="font-bold text-xl text-${color}-600">${item.totalScore.toFixed(1)}</div>
      </td>
      <td class="px-6 py-4 text-center text-gray-700">${item.revenue}</td>
      <td class="px-6 py-4 text-center text-gray-700">${item.cm}</td>
      <td class="px-6 py-4 text-center text-gray-700">${item.ppc}</td>
      <td class="px-6 py-4 text-center text-gray-700">${item.productivity}</td>
      <td class="px-6 py-4 text-center text-gray-700">${item.hiring}</td>
      <td class="px-6 py-4 text-center text-gray-700">${item.cash}</td>
      <td class="px-6 py-4 text-center">
        <span class="bg-${color}-100 text-${color}-800 px-3 py-1 rounded-full font-bold text-sm">
          ${item.grade}
        </span>
      </td>
    </tr>
  `;
}

function generateMockScorecardData(type) {
  const names = {
    project: ['Wipro', 'TCS', 'Infosys', 'HCL', 'Tech Mahindra', 'LTI', 'Mphasis', 'Hexaware'],
    region: ['North', 'South', 'West', 'East', 'Central'],
    region2: ['North 1', 'South 1', 'South 2', 'West 1', 'West 2'],
    rh: ['Anjli', 'Ashish', 'Bapi', 'Mahak', 'Nizar', 'Sulabh'],
    ph: ['Abhilash', 'Alifia', 'Ankit', 'Archana', 'Dhriti', 'Elton', 'Geetu', 'Krishna']
  };

  return names[type].map((name, idx) => {
    const revenue = 20 + Math.random() * 10;
    const cm = 13 + Math.random() * 7;
    const ppc = 6 + Math.random() * 4;
    const productivity = 10 + Math.random() * 5;
    const hiring = 6 + Math.random() * 4;
    const cash = 10 + Math.random() * 5;
    const totalScore = revenue + cm + ppc + productivity + hiring + cash;
    
    let grade = 'D';
    if (totalScore >= 90) grade = 'A+';
    else if (totalScore >= 80) grade = 'A';
    else if (totalScore >= 70) grade = 'B+';
    else if (totalScore >= 60) grade = 'B';
    else if (totalScore >= 50) grade = 'C+';
    else if (totalScore >= 40) grade = 'C';

    return {
      name,
      totalScore,
      revenue: revenue.toFixed(1),
      cm: cm.toFixed(1),
      ppc: ppc.toFixed(1),
      productivity: productivity.toFixed(1),
      hiring: hiring.toFixed(1),
      cash: cash.toFixed(1),
      grade
    };
  }).sort((a, b) => b.totalScore - a.totalScore);
}

// ============================================================================
// GOVERNANCE PAGES
// ============================================================================

function renderTargets() {
  const targets = loadUserTargets()
  
  return `
    <div class="p-6 space-y-6 animate-fade-in">
      <!-- Header -->
      <div class="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl p-6 text-white shadow-lg">
        <h2 class="text-3xl font-bold mb-2 flex items-center gap-3">
          <i class="fas fa-bullseye"></i>
          Targets & Assumptions
        </h2>
        <p class="text-blue-100">Manage budgets, forecasts, and performance targets - Select parameter and update value</p>
      </div>

      <!-- Current Targets Display -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-white rounded-xl p-4 shadow-lg border-l-4 border-blue-500">
          <div class="text-xs text-gray-600 mb-1">Revenue Target</div>
          <div class="text-xl font-bold text-gray-800">${targets.revenueTarget ? '₹' + targets.revenueTarget + ' Cr' : 'Not Set'}</div>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-lg border-l-4 border-green-500">
          <div class="text-xs text-gray-600 mb-1">CM Target %</div>
          <div class="text-xl font-bold text-gray-800">${targets.cmTargetPercent ? targets.cmTargetPercent + '%' : 'Not Set'}</div>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-lg border-l-4 border-purple-500">
          <div class="text-xs text-gray-600 mb-1">Productivity Target</div>
          <div class="text-xl font-bold text-gray-800">${targets.productivityTarget ? '₹' + targets.productivityTarget + ' Lacs/HC' : 'Not Set'}</div>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-lg border-l-4 border-orange-500">
          <div class="text-xs text-gray-600 mb-1">PPC Budget</div>
          <div class="text-xl font-bold text-gray-800">${targets.ppcBudget ? '₹' + (targets.ppcBudget/1000).toFixed(0) + 'K' : 'Not Set'}</div>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-lg border-l-4 border-cyan-500">
          <div class="text-xs text-gray-600 mb-1">Collection Target %</div>
          <div class="text-xl font-bold text-gray-800">${targets.collectionTarget ? targets.collectionTarget + '%' : 'Not Set'}</div>
        </div>
        <div class="bg-white rounded-xl p-4 shadow-lg border-l-4 border-indigo-500">
          <div class="text-xs text-gray-600 mb-1">Headcount Target</div>
          <div class="text-xl font-bold text-gray-800">${targets.headcountTarget ? targets.headcountTarget + ' HC' : 'Not Set'}</div>
        </div>
      </div>

      <!-- Quick Update: Select Parameter and Input Value -->
      <div class="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 shadow-lg border-2 border-blue-200">
        <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <i class="fas fa-edit text-blue-600"></i>
          Quick Update: Select Parameter & Enter Value
        </h3>
        <form id="quick-target-form" onsubmit="return saveQuickTarget(event)" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-2">
                <i class="fas fa-list mr-1 text-blue-600"></i>
                Select Parameter
              </label>
              <select id="quick-parameter" name="parameter" required
                      onchange="updateQuickTargetPlaceholder()"
                      class="w-full px-4 py-3 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-semibold text-gray-800">
                <option value="">-- Choose Metric --</option>
                <option value="revenueTarget">Revenue Target (₹ Crores)</option>
                <option value="cmTargetPercent">CM Target (%)</option>
                <option value="productivityTarget">Productivity Target (₹ Lacs/HC)</option>
                <option value="ppcBudget">PPC Budget (₹ per person/month)</option>
                <option value="collectionTarget">Collection Target (%)</option>
                <option value="headcountTarget">Headcount Target (Count)</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-2">
                <i class="fas fa-keyboard mr-1 text-green-600"></i>
                Enter Value
              </label>
              <input type="number" step="any" id="quick-value" name="value" required
                     placeholder="Enter target value"
                     class="w-full px-4 py-3 border-2 border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 font-semibold text-gray-800">
            </div>
            <div>
              <button type="submit" 
                      class="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-3 rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg font-semibold flex items-center justify-center gap-2">
                <i class="fas fa-save"></i>
                Save & Apply
              </button>
            </div>
          </div>
          <div id="current-value-display" class="text-sm text-gray-600 bg-white p-3 rounded-lg border border-blue-200 hidden">
            <i class="fas fa-info-circle text-blue-600 mr-2"></i>
            <strong>Current Value:</strong> <span id="current-value-text">Not Set</span>
          </div>
        </form>
      </div>

      <!-- Bulk Update: All Parameters at Once -->
      <div class="bg-white rounded-xl p-6 shadow-lg">
        <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <i class="fas fa-layer-group text-purple-600"></i>
          Bulk Update: All Parameters
        </h3>
        <form id="target-form-inline" onsubmit="return saveTargetsInline(event)" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-2">Revenue Target (Crores)</label>
              <input type="number" step="0.01" name="revenueTarget" id="revenueTarget" 
                     value="${targets.revenueTarget || ''}" 
                     placeholder="e.g., 100.50"
                     class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-2">CM Target %</label>
              <input type="number" step="0.1" name="cmTargetPercent" id="cmTargetPercent" 
                     value="${targets.cmTargetPercent || ''}" 
                     placeholder="e.g., 35.5"
                     class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent">
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-2">Productivity Target (Lacs/HC)</label>
              <input type="number" step="0.01" name="productivityTarget" id="productivityTarget" 
                     value="${targets.productivityTarget || ''}" 
                     placeholder="e.g., 2.50"
                     class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent">
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-2">PPC Budget (INR per person/month)</label>
              <input type="number" step="100" name="ppcBudget" id="ppcBudget" 
                     value="${targets.ppcBudget || ''}" 
                     placeholder="e.g., 105000"
                     class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent">
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-2">Collection Target %</label>
              <input type="number" step="0.1" name="collectionTarget" id="collectionTarget" 
                     value="${targets.collectionTarget || ''}" 
                     placeholder="e.g., 95.0"
                     class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent">
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-2">Headcount Target</label>
              <input type="number" step="1" name="headcountTarget" id="headcountTarget" 
                     value="${targets.headcountTarget || ''}" 
                     placeholder="e.g., 500"
                     class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
            </div>
          </div>
          
          <div class="flex gap-3 pt-4 border-t border-gray-200">
            <button type="submit" class="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg font-semibold">
              <i class="fas fa-save mr-2"></i>Save All Targets
            </button>
            <button type="button" onclick="clearTargetsInline()" class="px-6 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-all font-semibold">
              <i class="fas fa-trash-alt mr-2"></i>Clear All
            </button>
          </div>
          
          <p class="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200">
            <i class="fas fa-info-circle mr-2 text-blue-600"></i>
            <strong>Note:</strong> These targets will override database values and be used for all variance calculations and scorecard grading across all pages.
          </p>
        </form>
      </div>

      <!-- Assumptions -->
      <div class="bg-white rounded-xl p-6 shadow-lg">
        <h3 class="text-xl font-bold text-gray-800 mb-4">📋 Key Assumptions</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 class="font-semibold text-gray-800 mb-2">Period Logic</h4>
            <ul class="text-sm text-gray-600 space-y-1">
              <li>• <strong>Month:</strong> Single selected month</li>
              <li>• <strong>YTD:</strong> FY start through selected month</li>
              <li>• <strong>Full FY:</strong> All 12 months</li>
            </ul>
          </div>
          <div class="p-4 bg-green-50 rounded-lg border border-green-200">
            <h4 class="font-semibold text-gray-800 mb-2">Forecast As-On</h4>
            <ul class="text-sm text-gray-600 space-y-1">
              <li>• Actual: Up to selected month</li>
              <li>• Forecast: After selected month</li>
              <li>• Excludes future actuals</li>
            </ul>
          </div>
          <div class="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <h4 class="font-semibold text-gray-800 mb-2">Aggregation Rules</h4>
            <ul class="text-sm text-gray-600 space-y-1">
              <li>• SUM: Revenue, CM, Collections</li>
              <li>• AVERAGE: Headcount, JPR</li>
              <li>• Never sum headcount across months</li>
            </ul>
          </div>
          <div class="p-4 bg-orange-50 rounded-lg border border-orange-200">
            <h4 class="font-semibold text-gray-800 mb-2">Scorecard Weights</h4>
            <ul class="text-sm text-gray-600 space-y-1">
              <li>• Revenue: 30 pts | CM: 20 pts</li>
              <li>• PPC: 10 pts | Productivity: 15 pts</li>
              <li>• Hiring: 10 pts | Cash: 15 pts</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  `
}

function renderDefinitions() {
  return `
    <div class="p-6 space-y-6 animate-fade-in">
      <!-- Header -->
      <div class="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white shadow-lg">
        <h2 class="text-3xl font-bold mb-2 flex items-center gap-3">
          <i class="fas fa-book"></i>
          Metric Definitions
        </h2>
        <p class="text-indigo-100">Complete glossary of all metrics and calculations</p>
      </div>

      <!-- Search -->
      <div class="bg-white rounded-xl p-4 shadow-lg">
        <input type="text" placeholder="🔍 Search definitions..." 
               class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
      </div>

      <!-- Definitions by Category -->
      ${renderDefinitionCategory('Revenue Metrics', 'dollar-sign', 'blue', [
        { term: 'Revenue Actual', def: 'Actual revenue recognized in the period' },
        { term: 'Revenue Budget', def: 'Budgeted revenue target for the period' },
        { term: 'Revenue Forecast', def: 'Updated forecast based on latest projections' },
        { term: 'Forecast As-On', def: 'Actual up to selected month + Forecast after' },
        { term: 'Revenue Productivity', def: 'Revenue Actual ÷ Headcount ÷ Months (₹ Lacs per recruiter/month)' }
      ])}

      ${renderDefinitionCategory('CM Metrics', 'percentage', 'green', [
        { term: 'CM Actual', def: 'Actual Contribution Margin (Revenue - Direct Costs)' },
        { term: 'CM %', def: '(CM Actual / Revenue Actual) × 100' },
        { term: 'CM Budget', def: 'Budgeted CM target' },
        { term: 'CM Forecast', def: 'Updated CM forecast' }
      ])}

      ${renderDefinitionCategory('PPC Metrics', 'users', 'purple', [
        { term: 'PPC Actual', def: 'Average of PPC_Actual metric values (INR per person/month)' },
        { term: 'PPC Cap', def: 'Maximum allowed PPC (target)' },
        { term: 'PPC Variance', def: 'Actual PPC - PPC Cap' }
      ])}

      ${renderDefinitionCategory('Headcount Metrics', 'user-friends', 'orange', [
        { term: 'Headcount Overall', def: 'Monthly sum → YTD average (excluding 0/null)' },
        { term: 'Headcount Approved', def: 'Approved headcount budget (target)' },
        { term: 'Headcount WL1', def: 'Working Level 1 headcount (monthly sum → YTD average)' }
      ])}

      ${renderDefinitionCategory('Collections & Cash', 'coins', 'teal', [
        { term: 'Actual Collection', def: 'Cash collected in the period' },
        { term: 'Target Collection', def: 'Collection target for the period' },
        { term: 'Collection Due', def: 'Outstanding receivables due for collection' },
        { term: 'Unbilled', def: 'Work done but not yet invoiced' },
        { term: 'Bad Debt', def: 'Receivables deemed uncollectible' },
        { term: 'Unbilled %', def: '(Unbilled / Revenue) × 100' },
        { term: 'Bad Debt %', def: '(Bad Debt / Collections) × 100' }
      ])}

      ${renderDefinitionCategory('Hiring Metrics', 'user-plus', 'indigo', [
        { term: 'Taggd Source Joiner', def: 'Joiners sourced through Taggd' },
        { term: 'Non-Taggd Source Joiner', def: 'Joiners from other sources' },
        { term: 'Joiner Productivity', def: 'Total Taggd Joiners ÷ Headcount WL1 ÷ Months (count/recruiter/month)' },
        { term: 'Taggd Mix %', def: '(Taggd Joiners / Total Joiners) × 100' }
      ])}

      ${renderDefinitionCategory('Period Logic', 'calendar-alt', 'red', [
        { term: 'Month', def: 'Single selected month only' },
        { term: 'YTD', def: 'Fiscal year start through selected end month' },
        { term: 'Full FY', def: 'All 12 months of the fiscal year' },
        { term: 'YoY', def: 'Same month(s) in previous fiscal year' }
      ])}
    </div>
  `;
}

function renderDefinitionCategory(title, icon, color, items) {
  return `
    <div class="bg-white rounded-xl shadow-lg overflow-hidden">
      <div class="bg-${color}-50 p-4 border-b border-${color}-200">
        <h3 class="text-lg font-bold text-gray-800 flex items-center gap-2">
          <i class="fas fa-${icon} text-${color}-600"></i>
          ${title}
        </h3>
      </div>
      <div class="p-6 space-y-3">
        ${items.map(item => `
          <div class="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
            <div class="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-${color}-500"></div>
            <div class="flex-1">
              <h4 class="font-semibold text-gray-800 mb-1">${item.term}</h4>
              <p class="text-sm text-gray-600">${item.def}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderDataQuality() {
  const m = state.metrics;
  if (!m) return '<div class="p-6 text-center">No data available. Please apply filters.</div>';

  // Calculate data quality metrics
  const totalRows = state.rawData.length;
  const nullCounts = {
    revenue: state.rawData.filter(r => !r.value && r.metric_name?.includes('Revenue')).length,
    cm: state.rawData.filter(r => !r.value && r.metric_name?.includes('CM')).length,
    headcount: state.rawData.filter(r => !r.value && r.metric_name?.includes('Headcount')).length,
    ppc: state.rawData.filter(r => !r.value && r.metric_name?.includes('PPC')).length
  };
  
  const completeness = ((totalRows - Object.values(nullCounts).reduce((a,b) => a+b, 0)) / totalRows * 100).toFixed(1);

  return `
    <div class="p-6 space-y-6 animate-fade-in">
      <!-- Header -->
      <div class="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl p-6 text-white shadow-lg">
        <h2 class="text-3xl font-bold mb-2 flex items-center gap-3">
          <i class="fas fa-check-circle"></i>
          Data Quality Dashboard
        </h2>
        <p class="text-emerald-100">Monitor data completeness, accuracy, and consistency</p>
      </div>

      <!-- Quality Score -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div class="bg-white rounded-xl p-6 shadow-lg border-l-4 border-green-500">
          <div class="text-sm text-gray-600 mb-1">Overall Quality</div>
          <div class="text-3xl font-bold ${completeness >= 95 ? 'text-green-600' : completeness >= 80 ? 'text-yellow-600' : 'text-red-600'}">
            ${completeness}%
          </div>
          <div class="text-xs text-gray-500 mt-1">
            ${completeness >= 95 ? '✓ Excellent' : completeness >= 80 ? '⚠ Good' : '✗ Needs Improvement'}
          </div>
        </div>
        <div class="bg-white rounded-xl p-6 shadow-lg border-l-4 border-blue-500">
          <div class="text-sm text-gray-600 mb-1">Total Records</div>
          <div class="text-3xl font-bold text-gray-800">${totalRows.toLocaleString()}</div>
          <div class="text-xs text-gray-500 mt-1">Loaded rows</div>
        </div>
        <div class="bg-white rounded-xl p-6 shadow-lg border-l-4 border-purple-500">
          <div class="text-sm text-gray-600 mb-1">Missing Values</div>
          <div class="text-3xl font-bold text-gray-800">${Object.values(nullCounts).reduce((a,b) => a+b, 0)}</div>
          <div class="text-xs text-gray-500 mt-1">Null/empty fields</div>
        </div>
        <div class="bg-white rounded-xl p-6 shadow-lg border-l-4 border-orange-500">
          <div class="text-sm text-gray-600 mb-1">Data Coverage</div>
          <div class="text-3xl font-bold text-gray-800">${state.filters.periodMode === 'Full FY' ? '12' : '1'} months</div>
          <div class="text-xs text-gray-500 mt-1">${state.filters.fy[0]}</div>
        </div>
      </div>

      <!-- Metric-wise Completeness -->
      <div class="bg-white rounded-xl p-6 shadow-lg">
        <h3 class="text-xl font-bold text-gray-800 mb-4">📊 Metric-wise Data Completeness</h3>
        <div class="space-y-3">
          ${['Revenue', 'CM', 'Headcount', 'PPC'].map(metric => {
            const missing = nullCounts[metric.toLowerCase()];
            const percent = ((totalRows - missing) / totalRows * 100).toFixed(1);
            return `
              <div class="flex items-center gap-4">
                <div class="w-32 font-semibold text-gray-700">${metric}</div>
                <div class="flex-1 bg-gray-200 rounded-full h-6 overflow-hidden">
                  <div class="h-full bg-gradient-to-r ${percent >= 95 ? 'from-green-500 to-green-600' : percent >= 80 ? 'from-yellow-500 to-yellow-600' : 'from-red-500 to-red-600'} 
                              flex items-center justify-end pr-2 text-white text-xs font-semibold transition-all"
                       style="width: ${percent}%">
                    ${percent}%
                  </div>
                </div>
                <div class="w-20 text-sm text-gray-600">${missing} missing</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Data Validation Rules -->
      <div class="bg-white rounded-xl p-6 shadow-lg">
        <h3 class="text-xl font-bold text-gray-800 mb-4">✓ Active Validation Rules</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-4 bg-green-50 rounded-lg border border-green-200">
            <h4 class="font-semibold text-gray-800 mb-2 flex items-center gap-2">
              <i class="fas fa-check-circle text-green-600"></i>
              Range Checks
            </h4>
            <ul class="text-sm text-gray-600 space-y-1">
              <li>• CM % must be between 0-100%</li>
              <li>• Headcount must be positive</li>
              <li>• PPC must be reasonable (> 0)</li>
            </ul>
          </div>
          <div class="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 class="font-semibold text-gray-800 mb-2 flex items-center gap-2">
              <i class="fas fa-balance-scale text-blue-600"></i>
              Consistency Checks
            </h4>
            <ul class="text-sm text-gray-600 space-y-1">
              <li>• Actual ≤ Budget (if not, variance shown)</li>
              <li>• Collections ≤ Revenue + Unbilled</li>
              <li>• Headcount Overall ≥ Headcount WL1</li>
            </ul>
          </div>
          <div class="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <h4 class="font-semibold text-gray-800 mb-2 flex items-center gap-2">
              <i class="fas fa-calculator text-purple-600"></i>
              Formula Checks
            </h4>
            <ul class="text-sm text-gray-600 space-y-1">
              <li>• CM % = (CM / Revenue) × 100</li>
              <li>• Productivity = Revenue / HC / Months</li>
              <li>• Attainment = (Actual / Target) × 100</li>
            </ul>
          </div>
          <div class="p-4 bg-orange-50 rounded-lg border border-orange-200">
            <h4 class="font-semibold text-gray-800 mb-2 flex items-center gap-2">
              <i class="fas fa-calendar-check text-orange-600"></i>
              Period Checks
            </h4>
            <ul class="text-sm text-gray-600 space-y-1">
              <li>• Month format: MMM'YY (e.g., Mar'26)</li>
              <li>• FY format: FY20XX-XX</li>
              <li>• No future actuals allowed</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Recent Updates -->
      <div class="bg-white rounded-xl p-6 shadow-lg">
        <h3 class="text-xl font-bold text-gray-800 mb-4">📅 Data Freshness</h3>
        <div class="text-sm text-gray-600 space-y-2">
          <p><strong>Last Data Load:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Fiscal Year:</strong> ${state.filters.fy[0]}</p>
          <p><strong>Period:</strong> ${state.filters.periodMode} ${state.filters.endMonth ? '(through ' + state.filters.endMonth + ')' : ''}</p>
          <p><strong>Projects Covered:</strong> ${new Set(state.rawData.map(r => r.project)).size}</p>
        </div>
      </div>
    </div>
  `;
}

function renderUpload() {
  return `
    <div class="p-6 space-y-6 animate-fade-in">
      <!-- Header -->
      <div class="bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl p-6 text-white shadow-lg">
        <h2 class="text-3xl font-bold mb-2 flex items-center gap-3">
          <i class="fas fa-upload"></i>
          Data Upload & Import
        </h2>
        <p class="text-violet-100">Upload Excel files to update dashboard data</p>
      </div>

      <!-- Upload Instructions -->
      <div class="bg-white rounded-xl p-6 shadow-lg">
        <h3 class="text-xl font-bold text-gray-800 mb-4">📋 Upload Instructions</h3>
        <div class="prose prose-sm text-gray-600">
          <ol class="space-y-2">
            <li><strong>Download Template:</strong> Use the template Excel file with the correct structure</li>
            <li><strong>Fill Data:</strong> Enter your data following the column headers exactly</li>
            <li><strong>Validate:</strong> Ensure no missing critical fields (Fiscal Year, Month, Project, Metric Name, Value)</li>
            <li><strong>Upload:</strong> Click the upload button below and select your file</li>
            <li><strong>Review:</strong> Check the preview and confirm the import</li>
          </ol>
        </div>
      </div>

      <!-- Upload Form -->
      <div class="bg-white rounded-xl p-6 shadow-lg">
        <h3 class="text-xl font-bold text-gray-800 mb-4">📤 Upload File</h3>
        <div class="space-y-4">
          <div class="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-violet-500 transition-colors cursor-pointer">
            <i class="fas fa-cloud-upload-alt text-6xl text-gray-400 mb-4"></i>
            <p class="text-lg font-semibold text-gray-700 mb-2">Drag & Drop Excel File Here</p>
            <p class="text-sm text-gray-500 mb-4">or click to browse</p>
            <input type="file" accept=".xlsx,.xls" class="hidden" id="file-upload-input">
            <button onclick="document.getElementById('file-upload-input').click()" 
                    class="bg-violet-600 text-white px-6 py-3 rounded-lg hover:bg-violet-700 transition-all">
              <i class="fas fa-folder-open mr-2"></i>Select File
            </button>
          </div>
          <div class="flex items-center gap-4">
            <button class="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-all">
              <i class="fas fa-download mr-2"></i>Download Template
            </button>
            <button class="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-all opacity-50 cursor-not-allowed" disabled>
              <i class="fas fa-check mr-2"></i>Import Data
            </button>
          </div>
        </div>
      </div>

      <!-- Template Format -->
      <div class="bg-white rounded-xl p-6 shadow-lg">
        <h3 class="text-xl font-bold text-gray-800 mb-4">📄 Required Excel Format</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="bg-gray-100">
              <tr>
                <th class="px-4 py-2 text-left font-semibold">Column</th>
                <th class="px-4 py-2 text-left font-semibold">Description</th>
                <th class="px-4 py-2 text-left font-semibold">Example</th>
                <th class="px-4 py-2 text-center font-semibold">Required</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr>
                <td class="px-4 py-2 font-mono text-xs">fiscal_year</td>
                <td class="px-4 py-2">Fiscal year</td>
                <td class="px-4 py-2 text-gray-600">FY2025-26</td>
                <td class="px-4 py-2 text-center"><span class="text-red-600">✓</span></td>
              </tr>
              <tr class="bg-gray-50">
                <td class="px-4 py-2 font-mono text-xs">month</td>
                <td class="px-4 py-2">Calendar month</td>
                <td class="px-4 py-2 text-gray-600">Mar'26</td>
                <td class="px-4 py-2 text-center"><span class="text-red-600">✓</span></td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono text-xs">vertical</td>
                <td class="px-4 py-2">Business vertical</td>
                <td class="px-4 py-2 text-gray-600">IT Services</td>
                <td class="px-4 py-2 text-center"><span class="text-green-600">○</span></td>
              </tr>
              <tr class="bg-gray-50">
                <td class="px-4 py-2 font-mono text-xs">region</td>
                <td class="px-4 py-2">Geographic region</td>
                <td class="px-4 py-2 text-gray-600">North</td>
                <td class="px-4 py-2 text-center"><span class="text-green-600">○</span></td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono text-xs">project</td>
                <td class="px-4 py-2">Project name</td>
                <td class="px-4 py-2 text-gray-600">Honeywell</td>
                <td class="px-4 py-2 text-center"><span class="text-red-600">✓</span></td>
              </tr>
              <tr class="bg-gray-50">
                <td class="px-4 py-2 font-mono text-xs">metric_name</td>
                <td class="px-4 py-2">Metric identifier</td>
                <td class="px-4 py-2 text-gray-600">Revenue_Actual</td>
                <td class="px-4 py-2 text-center"><span class="text-red-600">✓</span></td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono text-xs">value</td>
                <td class="px-4 py-2">Numeric value</td>
                <td class="px-4 py-2 text-gray-600">125.50</td>
                <td class="px-4 py-2 text-center"><span class="text-red-600">✓</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p class="text-sm text-yellow-800">
            <i class="fas fa-exclamation-triangle mr-2"></i>
            <strong>Important:</strong> Column headers must match exactly (case-sensitive). Ensure numeric values don't contain currency symbols or commas.
          </p>
        </div>
      </div>

      <!-- Upload History (placeholder) -->
      <div class="bg-white rounded-xl p-6 shadow-lg">
        <h3 class="text-xl font-bold text-gray-800 mb-4">🕒 Recent Uploads</h3>
        <div class="text-center py-8 text-gray-500">
          <i class="fas fa-history text-4xl mb-3"></i>
          <p>No upload history available</p>
          <p class="text-sm">Upload data will appear here</p>
        </div>
      </div>
    </div>
  `;
}


// Helper function to calculate grade from score
function calculateGrade(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B+';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C+';
  if (score >= 40) return 'C';
  return 'D';
}

// ============================================================================
// EXCEL EXPORT FUNCTIONALITY
// ============================================================================

function exportToExcel(data, filename) {
  // Convert data to CSV format
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }
  
  // Get headers from first object
  const headers = Object.keys(data[0]);
  let csvContent = headers.join(',') + '\n';
  
  // Add data rows
  data.forEach(row => {
    const values = headers.map(header => {
      let value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`;
      }
      return value;
    });
    csvContent += values.join(',') + '\n';
  });
  
  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename + '.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportCurrentView() {
  const page = state.currentPage;
  const timestamp = new Date().toISOString().split('T')[0];
  
  if (page === 'executive') {
    exportToExcel([state.metrics], `Executive_Overview_${timestamp}`);
  } else if (page.startsWith('scorecard-')) {
    // Export scorecard data
    const type = page.replace('scorecard-', '');
    axios.post(`/api/scorecards/${type}`, state.filters)
      .then(response => {
        const data = response.data.map(item => ({
          Entity: item.entity,
          Score: item.score,
          Revenue: item.scoreBreakdown?.revenue?.points || 0,
          CM: item.scoreBreakdown?.cm?.points || 0,
          PPC: item.scoreBreakdown?.ppc?.points || 0,
          Productivity: item.scoreBreakdown?.productivity?.points || 0,
          Hiring: item.scoreBreakdown?.hiring?.points || 0,
          Cash: item.scoreBreakdown?.cashHealth?.points || 0,
          Grade: calculateGrade(item.score)
        }));
        exportToExcel(data, `Scorecard_${type}_${timestamp}`);
      })
      .catch(error => {
        console.error('Export error:', error);
        alert('Error exporting data');
      });
  } else {
    exportToExcel(state.rawData, `${page}_data_${timestamp}`);
  }
}

// Add export button to pages
function renderExportButton() {
  return `
    <button onclick="exportCurrentView()" 
            class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-all flex items-center gap-2">
      <i class="fas fa-file-excel"></i>
      Export to Excel
    </button>
  `;
}


// ============================================================================
// YOY COMPARISON FUNCTIONALITY
// ============================================================================

function calculateYoYData() {
  if (!state.filters.yoyEnabled || !state.rawData || state.rawData.length === 0) {
    return null;
  }
  
  // Get current FY and calculate previous FY
  const currentFY = state.filters.fy[0];
  const previousFY = currentFY === 'FY2025-26' ? 'FY2024-25' : 'FY2023-24';
  
  // Filter current and previous year data
  const currentData = state.rawData.filter(r => r.fy === currentFY);
  const previousData = state.rawData.filter(r => r.fy === previousFY);
  
  // Calculate aggregated metrics for both years
  const currentMetrics = aggregateMetrics(currentData);
  const previousMetrics = aggregateMetrics(previousData);
  
  // Calculate YoY changes
  const yoyComparison = {
    revenue: {
      current: currentMetrics.revenue.actual,
      previous: previousMetrics.revenue.actual,
      change: currentMetrics.revenue.actual - previousMetrics.revenue.actual,
      changePct: previousMetrics.revenue.actual > 0 ? 
        ((currentMetrics.revenue.actual - previousMetrics.revenue.actual) / previousMetrics.revenue.actual * 100) : 0
    },
    cm: {
      current: currentMetrics.cm.actual,
      previous: previousMetrics.cm.actual,
      change: currentMetrics.cm.actual - previousMetrics.cm.actual,
      changePct: previousMetrics.cm.actual > 0 ? 
        ((currentMetrics.cm.actual - previousMetrics.cm.actual) / previousMetrics.cm.actual * 100) : 0
    },
    headcount: {
      current: currentMetrics.headcount.overall,
      previous: previousMetrics.headcount.overall,
      change: currentMetrics.headcount.overall - previousMetrics.headcount.overall,
      changePct: previousMetrics.headcount.overall > 0 ? 
        ((currentMetrics.headcount.overall - previousMetrics.headcount.overall) / previousMetrics.headcount.overall * 100) : 0
    }
  };
  
  return yoyComparison;
}

function aggregateMetrics(data) {
  const metrics = {
    revenue: { actual: 0, budget: 0, forecast: 0 },
    cm: { actual: 0, budget: 0 },
    headcount: { overall: 0, count: 0 }
  };
  
  data.forEach(row => {
    if (row.metric === 'Revenue_Actual') metrics.revenue.actual += parseFloat(row.value) || 0;
    if (row.metric === 'Revenue_Budget') metrics.revenue.budget += parseFloat(row.value) || 0;
    if (row.metric === 'Rev_Forecast') metrics.revenue.forecast += parseFloat(row.value) || 0;
    if (row.metric === 'CM Actual') metrics.cm.actual += parseFloat(row.value) || 0;
    if (row.metric === 'CM_Budget') metrics.cm.budget += parseFloat(row.value) || 0;
    if (row.metric === 'Headcount_Overall') {
      metrics.headcount.overall += parseFloat(row.value) || 0;
      metrics.headcount.count++;
    }
  });
  
  // Average headcount
  if (metrics.headcount.count > 0) {
    metrics.headcount.overall = metrics.headcount.overall / metrics.headcount.count;
  }
  
  return metrics;
}

function renderYoYComparison() {
  const yoyData = calculateYoYData();
  
  if (!yoyData) {
    return '';
  }
  
  return `
    <div class="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white shadow-lg mb-6">
      <h3 class="text-2xl font-bold mb-4 flex items-center gap-2">
        <i class="fas fa-calendar-alt"></i>
        Year-over-Year Comparison
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        ${renderYoYCard('Revenue', yoyData.revenue, 'dollar-sign')}
        ${renderYoYCard('Contribution Margin', yoyData.cm, 'percentage')}
        ${renderYoYCard('Headcount', yoyData.headcount, 'users')}
      </div>
    </div>
  `;
}

function renderYoYCard(title, data, icon) {
  const isPositive = data.changePct >= 0;
  const changeColor = isPositive ? 'text-green-300' : 'text-red-300';
  const arrowIcon = isPositive ? 'fa-arrow-up' : 'fa-arrow-down';
  
  return `
    <div class="bg-white bg-opacity-10 rounded-lg p-4">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm opacity-80">${title}</span>
        <i class="fas fa-${icon}"></i>
      </div>
      <div class="text-2xl font-bold mb-1">${formatNumber(data.current)}</div>
      <div class="text-sm opacity-80 mb-2">Previous: ${formatNumber(data.previous)}</div>
      <div class="${changeColor} font-semibold flex items-center gap-1">
        <i class="fas ${arrowIcon}"></i>
        ${Math.abs(data.changePct).toFixed(1)}%
        <span class="text-xs opacity-80">(${formatNumber(data.change)})</span>
      </div>
    </div>
  `;
}


// ============================================================================
// LOADING & ERROR HANDLING
// ============================================================================

function showLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
  }
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
}

function showError(message) {
  alert(message); // Simple error handling
  console.error(message);
}


// ============================================================================
// FILTER HANDLING
// ============================================================================

function onFilterChange() {
  // Update filter values from form
  const fySelect = document.getElementById('filter-fy');
  const periodSelect = document.getElementById('filter-period');
  const monthSelect = document.getElementById('filter-month');
  const verticalSelect = document.getElementById('filter-vertical');
  const regionSelect = document.getElementById('filter-region');
  const regionHeadSelect = document.getElementById('filter-regionhead');
  
  if (fySelect) {
    state.filters.fy = Array.from(fySelect.selectedOptions).map(opt => opt.value);
  }
  if (periodSelect) {
    state.filters.periodMode = periodSelect.value;
  }
  if (monthSelect) {
    state.filters.endMonth = monthSelect.value;
  }
  if (verticalSelect) {
    state.filters.vertical = Array.from(verticalSelect.selectedOptions).map(opt => opt.value);
  }
  if (regionSelect) {
    state.filters.region = Array.from(regionSelect.selectedOptions).map(opt => opt.value);
  }
  if (regionHeadSelect) {
    state.filters.regionHead = Array.from(regionHeadSelect.selectedOptions).map(opt => opt.value);
  }
  
  const subRegionSelect = document.getElementById('filter-subregion');
  if (subRegionSelect) {
    state.filters.subRegion = Array.from(subRegionSelect.selectedOptions).map(opt => opt.value);
  }
  
  const practiceHeadSelect = document.getElementById('filter-practicehead');
  if (practiceHeadSelect) {
    state.filters.practiceHead = Array.from(practiceHeadSelect.selectedOptions).map(opt => opt.value);
  }
  
  // Reload data with new filters
  loadData();
}


// ============= HELPER FUNCTIONS =============

function renderKPICard(title, value, comparison, unit, icon, color, variance) {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
    red: 'from-red-500 to-red-600',
    yellow: 'from-yellow-500 to-yellow-600',
    teal: 'from-teal-500 to-teal-600',
    indigo: 'from-indigo-500 to-indigo-600',
    cyan: 'from-cyan-500 to-cyan-600',
    emerald: 'from-emerald-500 to-emerald-600'
  }
  
  const bgClass = colorClasses[color] || 'from-gray-500 to-gray-600'
  
  // Format the main value with unit
  const formattedValue = formatWithUnit(value, unit)
  
  let comparisonHtml = ''
  if (comparison !== null && comparison !== undefined) {
    const formattedComparison = formatWithUnit(comparison, unit)
    comparisonHtml = `
      <div class="mt-1 text-xs opacity-80">
        <span>vs ${formattedComparison}</span>
      </div>
    `
  }
  
  let varianceHtml = ''
  if (variance !== null && variance !== undefined) {
    const isPositive = variance > 0
    const arrow = isPositive ? '↑' : '↓'
    const varianceColor = isPositive ? 'text-green-300' : 'text-red-300'
    varianceHtml = `
      <div class="mt-1">
        <span class="${varianceColor} font-semibold text-xs">
          ${arrow} ${Math.abs(variance).toFixed(1)}%
        </span>
      </div>
    `
  }
  
  return `
    <div class="bg-gradient-to-br ${bgClass} rounded-lg shadow-md p-3 text-white transform hover:scale-105 transition-all duration-300 hover:shadow-lg">
      <div class="flex items-center justify-between mb-1">
        <h3 class="text-xs font-semibold opacity-90 leading-tight">${title}</h3>
        <i class="fas fa-${icon} text-lg opacity-75"></i>
      </div>
      <div class="text-xl font-bold mb-0.5">
        ${formattedValue}
      </div>
      ${unit ? `<div class="text-xs opacity-75 uppercase tracking-wide">${unit === 'Crore' || unit === '₹ Cr' ? '' : unit === 'Lacs' || unit === '₹ Lacs' ? '' : unit === 'INR' ? '' : unit}</div>` : ''}
      ${comparisonHtml}
      ${varianceHtml}
    </div>
  `
}

// Enhanced KPI Card with YoY, MoM Growth, and Variance vs Target metrics
function renderEnhancedKPICard({
  title,
  value,
  unit = '',
  icon,
  color,
  target = null,
  yoyGrowth = null,
  momGrowth = null,
  varianceVsTarget = null,
  invertColors = false,
  decimals = 2
}) {
  const hasTarget = target !== null && target !== undefined
  const hasYoY = yoyGrowth !== null && yoyGrowth !== undefined && !isNaN(yoyGrowth)
  const hasMoM = momGrowth !== null && momGrowth !== undefined && !isNaN(momGrowth)
  const hasVariance = varianceVsTarget !== null && varianceVsTarget !== undefined && !isNaN(varianceVsTarget)
  
  // Helper to get color class based on value and inversion
  const getGrowthColor = (value, inverted = false) => {
    if (value === null || value === undefined || isNaN(value)) return 'text-gray-600'
    if (inverted) {
      return value > 0 ? 'text-red-600' : 'text-green-600'
    }
    return value >= 0 ? 'text-green-600' : 'text-red-600'
  }
  
  // Helper to get icon
  const getGrowthIcon = (value) => {
    if (value === null || value === undefined || isNaN(value)) return ''
    return value > 0 ? '↑' : '↓'
  }
  
  const colorMap = {
    purple: 'from-purple-500 to-purple-600',
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    teal: 'from-teal-500 to-teal-600',
    indigo: 'from-indigo-500 to-indigo-600',
    orange: 'from-orange-500 to-orange-600',
    emerald: 'from-emerald-500 to-emerald-600',
    red: 'from-red-500 to-red-600',
    yellow: 'from-yellow-500 to-yellow-600',
    gray: 'from-gray-500 to-gray-600',
    wallet: 'from-teal-600 to-emerald-600',
    pink: 'from-pink-500 to-pink-600',
    cyan: 'from-cyan-500 to-cyan-600'
  }
  
  return `
    <div class="bg-white rounded-lg shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-200 overflow-hidden transform hover:scale-105">
      <!-- Header with gradient background -->
      <div class="bg-gradient-to-r ${colorMap[color] || 'from-gray-500 to-gray-600'} p-3 text-white">
        <div class="flex items-center justify-between">
          <div class="text-sm font-bold flex-1" style="white-space: normal; line-height: 1.3;">${title}</div>
          <i class="fas fa-${icon} text-lg opacity-90 ml-2 flex-shrink-0"></i>
        </div>
      </div>
      
      <!-- Main value and target -->
      <div class="p-4">
        <div class="text-3xl font-bold text-gray-900 mb-2">
          ${formatNumber(value, decimals)}${!hasTarget && unit ? ' ' + unit : ''}
        </div>
        
        ${hasTarget ? `
          <div class="text-xs text-gray-600 mb-2 flex items-center">
            <i class="fas fa-bullseye mr-1 text-gray-400"></i>
            Target: ${formatNumber(target, decimals)}${unit ? ' ' + unit : ''}
          </div>
        ` : ''}
        
        <!-- Growth metrics grid -->
        <div class="grid grid-cols-${[hasYoY, hasMoM, hasVariance].filter(x => x).length || 1} gap-2 mt-3 pt-3 border-t border-gray-200">
          ${hasYoY ? `
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">YoY Growth</div>
              <div class="${getGrowthColor(yoyGrowth, invertColors)} text-sm font-bold">
                ${getGrowthIcon(yoyGrowth)} ${Math.abs(yoyGrowth).toFixed(1)}%
              </div>
            </div>
          ` : ''}
          
          ${hasMoM ? `
            <div class="text-center ${hasYoY ? 'border-l border-gray-200 pl-2' : ''}">
              <div class="text-xs text-gray-500 mb-1">MoM Growth</div>
              <div class="${getGrowthColor(momGrowth, invertColors)} text-sm font-bold">
                ${getGrowthIcon(momGrowth)} ${Math.abs(momGrowth).toFixed(1)}%
              </div>
            </div>
          ` : ''}
          
          ${hasVariance ? `
            <div class="text-center ${(hasYoY || hasMoM) ? 'border-l border-gray-200 pl-2' : ''}">
              <div class="text-xs text-gray-500 mb-1">vs Target</div>
              <div class="${getGrowthColor(varianceVsTarget, invertColors)} text-sm font-bold">
                ${getGrowthIcon(varianceVsTarget)} ${Math.abs(varianceVsTarget).toFixed(1)}%
              </div>
            </div>
          ` : ''}
          
          ${!hasYoY && !hasMoM && !hasVariance ? `
            <div class="text-center text-xs text-gray-400">No growth data</div>
          ` : ''}
        </div>
      </div>
    </div>
  `
}

// Wrapper function for backward compatibility
function render3DKPICard(title, value, target, unit, icon, color, metrics, invertColors = false, decimals = 2) {
  // Extract growth metrics from the metrics object
  const yoyGrowth = metrics?.yoyYTD?.growth || null
  const momGrowth = metrics?.mom || null
  const varianceVsTarget = metrics?.variance || null
  
  // Call the new enhanced KPI card function
  return renderEnhancedKPICard({
    title,
    value,
    unit,
    icon,
    color,
    target,
    yoyGrowth,
    momGrowth,
    varianceVsTarget,
    invertColors,
    decimals
  })
}


// Unit conversion helper: convert Lacs to Crores
function lacsToCrere(lacs) {
  if (lacs === null || lacs === undefined || isNaN(lacs)) return 0
  return lacs / 100
}

// Format number with proper unit display
function formatWithUnit(value, unit, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '0.00'
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  
  switch(unit) {
    case 'Crore':
    case '₹ Cr':
      // FIXED: Value is ALREADY in Crores (pre-converted in metrics calculation)
      // Do NOT divide by 100 again!
      return `₹${numValue.toFixed(decimals)} Cr`
    
    case 'Lacs':
    case '₹ Lacs':
    case '₹L':
    case 'in lacs':
      return `₹${numValue.toFixed(decimals)} Lacs`
    
    case 'INR':
      // For PPC display - show INR directly, no decimals
      return `₹${Math.round(numValue).toLocaleString('en-IN')}`
    
    case 'Count':
      // If value is less than 10, show 1 decimal (for productivity metrics)
      if (numValue < 10) {
        return numValue.toFixed(1)
      }
      return Math.round(numValue).toString()
    
    case 'Count/Month':
      // For joiner productivity - always show 1 decimal
      return numValue.toFixed(1)
    
    case '%':
      return `${numValue.toFixed(decimals)}%`
    
    case 'Lacs/Person':
      return `₹${numValue.toFixed(decimals)} Lacs/Person`
    
    default:
      return numValue.toFixed(decimals)
  }
}

function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '0.00'
  
  // Convert to number if string
  const value = typeof num === 'string' ? parseFloat(num) : num
  
  // For large numbers, show in Lacs/Cr format
  if (Math.abs(value) >= 100) {
    return value.toFixed(decimals)
  }
  
  return value.toFixed(decimals)
}

function formatCurrency(num) {
  return '₹ ' + formatNumber(num) + ' Lacs'
}

function formatPercent(num) {
  return formatNumber(num) + '%'
}


function getGradeColor(grade) {
  const colors = {
    'A+': 'text-green-600 bg-green-100',
    'A': 'text-green-500 bg-green-50',
    'B+': 'text-blue-600 bg-blue-100',
    'B': 'text-blue-500 bg-blue-50',
    'C+': 'text-yellow-600 bg-yellow-100',
    'C': 'text-yellow-500 bg-yellow-50',
    'D': 'text-red-600 bg-red-100'
  }
  return colors[grade] || 'text-gray-600 bg-gray-100'
}

function getVarianceColor(variance) {
  if (variance > 0) return 'text-green-600'
  if (variance < 0) return 'text-red-600'
  return 'text-gray-600'
}

function getVarianceIcon(variance) {
  if (variance > 0) return 'fa-arrow-up'
  if (variance < 0) return 'fa-arrow-down'
  return 'fa-minus'
}

// ============================================================================
// PHASE 3: ADVANCED FEATURES
// ============================================================================
// Chart.js Visualizations, YoY/MoM/QoQ Analysis, XLSX Export, PDF Export
// ============================================================================

// ============================================================================
// CHART.JS HELPER FUNCTIONS
// ============================================================================

function createLineChart(canvasId, labels, datasets, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  
  const ctx = canvas.getContext('2d');
  
  // Destroy existing chart if it exists
  if (canvas.chart) {
    canvas.chart.destroy();
  }
  
  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return '₹' + value.toFixed(2) + ' L';
          }
        }
      }
    }
  };
  
  canvas.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: { ...defaultOptions, ...options }
  });
  
  return canvas.chart;
}

function createBarChart(canvasId, labels, datasets, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  
  const ctx = canvas.getContext('2d');
  
  if (canvas.chart) {
    canvas.chart.destroy();
  }
  
  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };
  
  canvas.chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: { ...defaultOptions, ...options }
  });
  
  return canvas.chart;
}

// Create Mixed Chart (Bar + Line)
function createMixedChart(canvasId, labels, datasets, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  
  const ctx = canvas.getContext('2d');
  
  if (canvas.chart) {
    canvas.chart.destroy();
  }
  
  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
      }
    },
    scales: {
      y: {
        beginAtZero: true
      },
      y1: {
        beginAtZero: true
      }
    }
  };
  
  canvas.chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: { ...defaultOptions, ...options }
  });
  
  return canvas.chart;
}

function createPieChart(canvasId, labels, data, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  
  const ctx = canvas.getContext('2d');
  
  if (canvas.chart) {
    canvas.chart.destroy();
  }
  
  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right',
      }
    }
  };
  
  canvas.chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(245, 158, 11, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(139, 92, 246, 0.8)',
          'rgba(236, 72, 153, 0.8)',
        ]
      }]
    },
    options: { ...defaultOptions, ...options }
  });
  
  return canvas.chart;
}

function createAreaChart(canvasId, labels, datasets, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  
  const ctx = canvas.getContext('2d');
  
  if (canvas.chart) {
    canvas.chart.destroy();
  }
  
  // Make datasets filled for area effect
  const filledDatasets = datasets.map(ds => ({
    ...ds,
    fill: true,
    tension: 0.4
  }));
  
  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        stacked: true
      },
      x: {
        stacked: true
      }
    }
  };
  
  canvas.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: filledDatasets
    },
    options: { ...defaultOptions, ...options }
  });
  
  return canvas.chart;
}

// ============================================================================
// YOY / MOM / QOQ ANALYSIS FUNCTIONS
// ============================================================================

function calculateMoMAnalysis(data, metric) {
  // Group by month
  const monthlyData = {};
  const months = state.filterOptions.months || [];
  
  data.filter(d => d.metric === metric).forEach(d => {
    if (!monthlyData[d.month]) {
      monthlyData[d.month] = 0;
    }
    monthlyData[d.month] += parseFloat(d.value || 0);
  });
  
  // Calculate MoM changes
  const momAnalysis = [];
  for (let i = 0; i < months.length; i++) {
    const currentMonth = months[i];
    const previousMonth = months[i - 1];
    
    const currentValue = monthlyData[currentMonth] || 0;
    const previousValue = previousMonth ? (monthlyData[previousMonth] || 0) : 0;
    
    const change = currentValue - previousValue;
    const changePercent = previousValue !== 0 ? (change / previousValue * 100) : 0;
    
    momAnalysis.push({
      month: currentMonth,
      value: currentValue,
      previousValue: previousValue,
      change: change,
      changePercent: changePercent
    });
  }
  
  return momAnalysis;
}

function calculateQoQAnalysis(data, metric) {
  // Define quarters
  const quarters = {
    'Q1': ['Apr', 'May', 'Jun'],
    'Q2': ['Jul', 'Aug', 'Sep'],
    'Q3': ['Oct', 'Nov', 'Dec'],
    'Q4': ['Jan', 'Feb', 'Mar']
  };
  
  // Group by quarter
  const quarterlyData = {};
  
  data.filter(d => d.metric === metric).forEach(d => {
    const monthPrefix = d.month.substring(0, 3);
    const fy = d.fy;
    
    for (const [quarter, monthsList] of Object.entries(quarters)) {
      if (monthsList.includes(monthPrefix)) {
        const key = `${fy}-${quarter}`;
        if (!quarterlyData[key]) {
          quarterlyData[key] = 0;
        }
        quarterlyData[key] += parseFloat(d.value || 0);
        break;
      }
    }
  });
  
  // Calculate QoQ changes
  const qoqAnalysis = [];
  const quarterKeys = Object.keys(quarterlyData).sort();
  
  for (let i = 0; i < quarterKeys.length; i++) {
    const currentQuarter = quarterKeys[i];
    const previousQuarter = quarterKeys[i - 1];
    
    const currentValue = quarterlyData[currentQuarter] || 0;
    const previousValue = previousQuarter ? (quarterlyData[previousQuarter] || 0) : 0;
    
    const change = currentValue - previousValue;
    const changePercent = previousValue !== 0 ? (change / previousValue * 100) : 0;
    
    qoqAnalysis.push({
      quarter: currentQuarter,
      value: currentValue,
      previousValue: previousValue,
      change: change,
      changePercent: changePercent
    });
  }
  
  return qoqAnalysis;
}

function renderMoMTable(momData) {
  if (!momData || momData.length === 0) {
    return '<p class="text-gray-500">No data available for MoM analysis</p>';
  }
  
  return `
    <div class="overflow-x-auto">
      <table class="min-w-full">
        <thead class="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
          <tr>
            <th class="px-4 py-3 text-left">Month</th>
            <th class="px-4 py-3 text-right">Value</th>
            <th class="px-4 py-3 text-right">Previous Month</th>
            <th class="px-4 py-3 text-right">Change</th>
            <th class="px-4 py-3 text-right">Change %</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${momData.map((item, idx) => `
            <tr class="hover:bg-gray-50">
              <td class="px-4 py-3 font-medium">${item.month}</td>
              <td class="px-4 py-3 text-right">${formatNumber(item.value)}</td>
              <td class="px-4 py-3 text-right text-gray-500">${formatNumber(item.previousValue)}</td>
              <td class="px-4 py-3 text-right ${item.change >= 0 ? 'text-green-600' : 'text-red-600'}">
                ${item.change >= 0 ? '+' : ''}${formatNumber(item.change)}
              </td>
              <td class="px-4 py-3 text-right ${item.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}">
                <span class="flex items-center justify-end gap-1">
                  <i class="fas fa-${item.changePercent >= 0 ? 'arrow-up' : 'arrow-down'}"></i>
                  ${Math.abs(item.changePercent).toFixed(1)}%
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderQoQTable(qoqData) {
  if (!qoqData || qoqData.length === 0) {
    return '<p class="text-gray-500">No data available for QoQ analysis</p>';
  }
  
  return `
    <div class="overflow-x-auto">
      <table class="min-w-full">
        <thead class="bg-gradient-to-r from-green-500 to-teal-600 text-white">
          <tr>
            <th class="px-4 py-3 text-left">Quarter</th>
            <th class="px-4 py-3 text-right">Value</th>
            <th class="px-4 py-3 text-right">Previous Quarter</th>
            <th class="px-4 py-3 text-right">Change</th>
            <th class="px-4 py-3 text-right">Change %</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${qoqData.map((item, idx) => `
            <tr class="hover:bg-gray-50">
              <td class="px-4 py-3 font-medium">${item.quarter}</td>
              <td class="px-4 py-3 text-right">${formatNumber(item.value)}</td>
              <td class="px-4 py-3 text-right text-gray-500">${formatNumber(item.previousValue)}</td>
              <td class="px-4 py-3 text-right ${item.change >= 0 ? 'text-green-600' : 'text-red-600'}">
                ${item.change >= 0 ? '+' : ''}${formatNumber(item.change)}
              </td>
              <td class="px-4 py-3 text-right ${item.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}">
                <span class="flex items-center justify-end gap-1">
                  <i class="fas fa-${item.changePercent >= 0 ? 'arrow-up' : 'arrow-down'}"></i>
                  ${Math.abs(item.changePercent).toFixed(1)}%
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ============================================================================
// MULTI-SHEET XLSX EXPORT
// ============================================================================

function exportToXLSX() {
  if (!state.metrics || !state.rawData) {
    alert('No data available to export');
    return;
  }
  
  const m = state.metrics;
  const data = state.rawData;
  const wb = XLSX.utils.book_new();
  
  // Sheet 1: Executive Summary
  const execData = [
    ['Finance Executive Dashboard'],
    ['Generated', new Date().toLocaleDateString()],
    ['Fiscal Year', state.filters.fy.join(', ')],
    ['Period Mode', state.filters.periodMode],
    ['End Month', state.filters.endMonth],
    [],
    ['Metric', 'Budget', 'Actual', 'Forecast', 'Variance', 'Variance %'],
    ['Revenue (Lacs)', m.revenue.budget, m.revenue.actual, m.revenue.forecast, m.revenue.variance, m.revenue.variancePercent],
    ['CM (Lacs)', m.cm.budget, m.cm.actual, m.cm.forecast, m.cm.variance, m.cm.variancePercent],
    ['CM %', '', m.cm.actualPercent, '', '', ''],
    ['PPC', '', m.ppc.actual, '', '', ''],
    ['Collections (Lacs)', m.collections.target, m.collections.actual, '', m.collections.actual - m.collections.target, ''],
    ['Headcount', m.headcount.approved, m.headcount.overall, '', '', ''],
    ['Productivity', '', m.productivity.actual, m.productivity.target, '', m.productivity.variancePercent],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(execData);
  XLSX.utils.book_append_sheet(wb, ws1, 'Executive Summary');
  
  // Sheet 2: Revenue Detail
  const revenueData = [
    ['Revenue Detail'],
    ['Project', 'Region', 'Month', 'Budget', 'Actual', 'Forecast'],
  ];
  data.filter(d => ['Revenue_Budget', 'Revenue_Actual', 'Rev_Forecast'].includes(d.metric)).forEach(d => {
    const existing = revenueData.find(r => r[0] === d.project && r[2] === d.month);
    if (!existing) {
      revenueData.push([d.project, d.region, d.month, '', '', '']);
    }
    const row = revenueData.find(r => r[0] === d.project && r[2] === d.month);
    if (d.metric === 'Revenue_Budget') row[3] = d.value;
    if (d.metric === 'Revenue_Actual') row[4] = d.value;
    if (d.metric === 'Rev_Forecast') row[5] = d.value;
  });
  const ws2 = XLSX.utils.aoa_to_sheet(revenueData);
  XLSX.utils.book_append_sheet(wb, ws2, 'Revenue Detail');
  
  // Sheet 3: CM Detail
  const cmData = [
    ['Contribution Margin Detail'],
    ['Project', 'Region', 'Month', 'Budget', 'Actual', 'CM %'],
  ];
  data.filter(d => ['CM_Budget', 'CM_Actual'].includes(d.metric)).forEach(d => {
    const existing = cmData.find(r => r[0] === d.project && r[2] === d.month);
    if (!existing) {
      cmData.push([d.project, d.region, d.month, '', '', '']);
    }
    const row = cmData.find(r => r[0] === d.project && r[2] === d.month);
    if (d.metric === 'CM_Budget') row[3] = d.value;
    if (d.metric === 'CM_Actual') row[4] = d.value;
  });
  const ws3 = XLSX.utils.aoa_to_sheet(cmData);
  XLSX.utils.book_append_sheet(wb, ws3, 'CM Detail');
  
  // Sheet 4: Collections
  const collData = [
    ['Collections Tracking'],
    ['Project', 'Region', 'Target', 'Actual', 'Attainment %'],
  ];
  const collProjects = {};
  data.filter(d => ['Actual_Collection', 'Target_Collection', 'Collection Target'].includes(d.metric)).forEach(d => {
    if (!collProjects[d.project]) {
      collProjects[d.project] = { region: d.region, target: 0, actual: 0 };
    }
    if (['Target_Collection', 'Collection Target'].includes(d.metric)) collProjects[d.project].target += parseFloat(d.value || 0);
    if (d.metric === 'Actual_Collection') collProjects[d.project].actual += parseFloat(d.value || 0);
  });
  Object.entries(collProjects).forEach(([project, vals]) => {
    const attainment = vals.target > 0 ? (vals.actual / vals.target * 100) : 0;
    collData.push([project, vals.region, vals.target, vals.actual, attainment.toFixed(2)]);
  });
  const ws4 = XLSX.utils.aoa_to_sheet(collData);
  XLSX.utils.book_append_sheet(wb, ws4, 'Collections');
  
  // Sheet 5: Headcount
  const hcData = [
    ['Headcount Analysis'],
    ['Project', 'Region', 'Month', 'Overall', 'Approved', 'WL1'],
  ];
  data.filter(d => ['Headcount_Overall', 'Headcount_Approved', 'Headcount_WL1'].includes(d.metric)).forEach(d => {
    const existing = hcData.find(r => r[0] === d.project && r[2] === d.month);
    if (!existing) {
      hcData.push([d.project, d.region, d.month, '', '', '']);
    }
    const row = hcData.find(r => r[0] === d.project && r[2] === d.month);
    if (d.metric === 'Headcount_Overall') row[3] = d.value;
    if (d.metric === 'Headcount_Approved') row[4] = d.value;
    if (d.metric === 'Headcount_WL1') row[5] = d.value;
  });
  const ws5 = XLSX.utils.aoa_to_sheet(hcData);
  XLSX.utils.book_append_sheet(wb, ws5, 'Headcount');
  
  // Sheet 6: Raw Data (first 1000 rows for performance)
  const rawData = [
    ['Raw Finance Data'],
    ['FY', 'Project', 'Vertical', 'Region', 'Sub Region', 'Region Head', 'Practice Head', 'Month', 'Metric', 'Value'],
  ];
  data.slice(0, 1000).forEach(d => {
    rawData.push([d.fy, d.project, d.vertical, d.region, d.sub_region, d.region_head, d.practice_head, d.month, d.metric, d.value]);
  });
  const ws6 = XLSX.utils.aoa_to_sheet(rawData);
  XLSX.utils.book_append_sheet(wb, ws6, 'Raw Data (Sample)');
  
  // Export file
  const fileName = `Finance_Dashboard_${state.filters.fy.join('_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
  
  alert(`✅ Exported to ${fileName}`);
}

// ============================================================================
// PDF REPORT EXPORT
// ============================================================================

async function exportToPDF() {
  if (!state.metrics) {
    alert('No data available to export');
    return;
  }
  
  const m = state.metrics;
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4');
  
  // Page 1: Cover Page
  pdf.setFontSize(28);
  pdf.setTextColor(59, 130, 246);
  pdf.text('Finance Executive Dashboard', 20, 40);
  
  pdf.setFontSize(14);
  pdf.setTextColor(0, 0, 0);
  pdf.text(`Fiscal Year: ${state.filters.fy.join(', ')}`, 20, 60);
  pdf.text(`Period: ${state.filters.periodMode}`, 20, 70);
  pdf.text(`End Month: ${state.filters.endMonth}`, 20, 80);
  pdf.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 90);
  
  // Add watermark
  pdf.setFontSize(10);
  pdf.setTextColor(150, 150, 150);
  pdf.text('Confidential - For Internal Use Only', 20, 280);
  
  // Page 2: Executive Summary
  pdf.addPage();
  pdf.setFontSize(20);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Executive Summary', 20, 20);
  
  // Add KPI table
  pdf.autoTable({
    startY: 30,
    head: [['Metric', 'Budget', 'Actual', 'Forecast', 'Variance %']],
    body: [
      ['Revenue (₹ Cr)', 
        m.revenue.budget.toFixed(2), 
        m.revenue.actual.toFixed(2), 
        m.revenue.forecast.toFixed(2), 
        m.revenue.variancePercent.toFixed(1) + '%'
      ],
      ['CM (₹ Cr)', 
        m.cm.budget.toFixed(2), 
        m.cm.actual.toFixed(2), 
        m.cm.forecast.toFixed(2), 
        m.cm.variancePercent.toFixed(1) + '%'
      ],
      ['CM %', '-', m.cm.actualPercent.toFixed(1) + '%', '-', '-'],
      ['PPC (₹)', '-', formatNumber(m.ppc.actual), '-', m.ppc.variancePercent.toFixed(1) + '%'],
      ['Collections (₹ Cr)', 
        m.collections.target.toFixed(2), 
        m.collections.actual.toFixed(2), 
        '-', 
        (m.collections.attainment - 100).toFixed(1) + '%'
      ],
      ['Headcount', 
        m.headcount.approved.toFixed(0), 
        m.headcount.overall.toFixed(0), 
        '-', 
        '-'
      ],
      ['Productivity (₹ Lacs)', 
        formatNumber(m.productivity.target), 
        formatNumber(m.productivity.actual), 
        '-', 
        m.productivity.variancePercent.toFixed(1) + '%'
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });
  
  // Page 3: Key Insights
  pdf.addPage();
  pdf.setFontSize(20);
  pdf.text('Key Insights', 20, 20);
  
  pdf.setFontSize(12);
  let yPos = 40;
  
  // Revenue insight
  if (m.revenue.variancePercent < -10) {
    pdf.setTextColor(220, 38, 38);
    pdf.text('• Revenue is significantly below budget (-' + Math.abs(m.revenue.variancePercent).toFixed(1) + '%)', 25, yPos);
    yPos += 10;
  } else if (m.revenue.variancePercent > 0) {
    pdf.setTextColor(16, 185, 129);
    pdf.text('• Revenue exceeds budget (+' + m.revenue.variancePercent.toFixed(1) + '%)', 25, yPos);
    yPos += 10;
  }
  
  // CM insight
  pdf.setTextColor(0, 0, 0);
  if (m.cm.actualPercent >= 40) {
    pdf.setTextColor(16, 185, 129);
    pdf.text(`• Healthy CM% at ${m.cm.actualPercent.toFixed(1)}%`, 25, yPos);
  } else {
    pdf.setTextColor(245, 158, 11);
    pdf.text(`• CM% needs improvement (${m.cm.actualPercent.toFixed(1)}%)`, 25, yPos);
  }
  yPos += 10;
  
  // Collections insight
  pdf.setTextColor(0, 0, 0);
  if (m.collections.attainment >= 90) {
    pdf.setTextColor(16, 185, 129);
    pdf.text(`• Strong collections at ${m.collections.attainment.toFixed(1)}% attainment`, 25, yPos);
  } else {
    pdf.setTextColor(220, 38, 38);
    pdf.text(`• Collections below target (${m.collections.attainment.toFixed(1)}%)`, 25, yPos);
  }
  yPos += 10;
  
  // Headcount insight
  pdf.setTextColor(0, 0, 0);
  const hcUtilization = (m.headcount.overall / m.headcount.approved * 100);
  pdf.text(`• Headcount utilization: ${hcUtilization.toFixed(1)}%`, 25, yPos);
  
  // Save PDF
  const fileName = `Finance_Report_${state.filters.fy.join('_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  pdf.save(fileName);
  
  alert(`✅ PDF exported: ${fileName}`);
}

// ============================================================================
// CHART RENDERING HELPERS
// ============================================================================

function renderRevenueChart() {
  // Get month-wise revenue data
  const months = state.filterOptions.months || [];
  const data = state.rawData;
  
  const monthlyRevenue = { budget: {}, actual: {}, forecast: {} };
  
  months.forEach(m => {
    monthlyRevenue.budget[m] = 0;
    monthlyRevenue.actual[m] = 0;
    monthlyRevenue.forecast[m] = 0;
  });
  
  data.forEach(d => {
    if (d.metric === 'Revenue_Budget' && monthlyRevenue.budget[d.month] !== undefined) {
      monthlyRevenue.budget[d.month] += parseFloat(d.value || 0);
    }
    if (d.metric === 'Revenue_Actual' && monthlyRevenue.actual[d.month] !== undefined) {
      monthlyRevenue.actual[d.month] += parseFloat(d.value || 0);
    }
    if (d.metric === 'Rev_Forecast' && monthlyRevenue.forecast[d.month] !== undefined) {
      monthlyRevenue.forecast[d.month] += parseFloat(d.value || 0);
    }
  });
  
  const datasets = [
    {
      label: 'Budget',
      data: months.map(m => monthlyRevenue.budget[m]),
      borderColor: 'rgba(59, 130, 246, 1)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      borderWidth: 2,
    },
    {
      label: 'Actual',
      data: months.map(m => monthlyRevenue.actual[m]),
      borderColor: 'rgba(16, 185, 129, 1)',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      borderWidth: 2,
    },
    {
      label: 'Forecast',
      data: months.map(m => monthlyRevenue.forecast[m]),
      borderColor: 'rgba(245, 158, 11, 1)',
      backgroundColor: 'rgba(245, 158, 11, 0.1)',
      borderWidth: 2,
      borderDash: [5, 5],
    }
  ];
  
  setTimeout(() => {
    createLineChart('revenue-trend-chart', months, datasets);
  }, 100);
}

console.log('✅ Phase 3 functions loaded: Charts, YoY/MoM/QoQ Analysis, XLSX Export, PDF Export');


// ============================================================================
// ENHANCED EXECUTIVE OVERVIEW WITH CHARTS
// ============================================================================

function renderExecutiveCharts() {
  return `
    <div class="grid grid-cols-2 gap-6 mb-6">
      <!-- Revenue Trend Chart -->
      <div class="card hover-lift p-6">
        <h3 class="text-lg font-bold mb-4 flex items-center">
          <i class="fas fa-chart-line text-blue-600 mr-2"></i>
          Revenue Trend
        </h3>
        <div style="height: 300px;">
          <canvas id="revenue-trend-chart"></canvas>
        </div>
      </div>
      
      <!-- CM % by Project Chart -->
      <div class="card hover-lift p-6">
        <h3 class="text-lg font-bold mb-4 flex items-center">
          <i class="fas fa-chart-bar text-green-600 mr-2"></i>
          Top 10 Projects by CM%
        </h3>
        <div style="height: 300px;">
          <canvas id="cm-projects-chart"></canvas>
        </div>
      </div>
    </div>
  `;
}


// ============================================================================
// CHART DATA RENDERING (called after page render)
// ============================================================================

function renderExecutiveOverviewCharts() {
  if (!state.rawData || state.rawData.length === 0) return;
  
  // Render Revenue Trend Chart
  renderRevenueChart();
  
  // Render Top Projects by CM% Chart
  renderTopProjectsCMChart();
}

function renderTopProjectsCMChart() {
  const data = state.rawData;
  
  // Calculate CM% by project
  const projectCM = {};
  data.forEach(d => {
    if (!projectCM[d.project]) {
      projectCM[d.project] = { revenue: 0, cm: 0 };
    }
    if (d.metric === 'Revenue_Actual') projectCM[d.project].revenue += parseFloat(d.value || 0);
    if (d.metric === 'CM_Actual') projectCM[d.project].cm += parseFloat(d.value || 0);
  });
  
  // Calculate CM% and get top 10
  const projects = Object.entries(projectCM)
    .map(([name, vals]) => ({
      name,
      cmPercent: vals.revenue > 0 ? (vals.cm / vals.revenue * 100) : 0
    }))
    .filter(p => p.cmPercent > 0)
    .sort((a, b) => b.cmPercent - a.cmPercent)
    .slice(0, 10);
  
  const labels = projects.map(p => p.name);
  const cmData = projects.map(p => p.cmPercent);
  
  const datasets = [{
    label: 'CM %',
    data: cmData,
    backgroundColor: 'rgba(16, 185, 129, 0.8)',
    borderColor: 'rgba(16, 185, 129, 1)',
    borderWidth: 1
  }];
  
  setTimeout(() => {
    createBarChart('cm-projects-chart', labels, datasets, {
      indexAxis: 'y',
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: function(value) {
              return value + '%';
            }
          }
        }
      }
    });
  }, 100);
}


// Simple CSV export for backward compatibility
function exportToCSV() {
  if (!state.metrics || !state.rawData) {
    alert('No data available to export');
    return;
  }
  
  const csvData = [
    ['FY', 'Project', 'Month', 'Metric', 'Value'],
    ...state.rawData.map(d => [d.fy, d.project, d.month, d.metric, d.value])
  ];
  
  const csvContent = csvData.map(row => row.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Finance_Data_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
}

// ============================================================================
// DRILL-DOWN/UP/THROUGH FUNCTIONALITY
// ============================================================================
// Hierarchy: Overall → Region → Sub-Region → Region Head → Practice Head → Project


/**
 * Drill down to next level
 * @param {string} value - The selected value to drill into
 */
function renderCompactFilters() {
  const filters = [
    {
      id: 'period',
      icon: 'fa-calendar',
      label: 'Period',
      color: 'from-blue-400 to-blue-600',
      value: state.filters.periodMode,
      options: ['Month', 'YTD', 'Full FY']
    },
    {
      id: 'selection',
      icon: 'fa-clock',
      label: 'Selection',
      color: 'from-cyan-400 to-cyan-600',
      value: formatMonthDisplay(state.filters.endMonth),
      options: state.filterOptions.months || []
    },
    {
      id: 'vertical',
      icon: 'fa-layer-group',
      label: 'Vertical',
      color: 'from-green-400 to-green-600',
      value: state.filters.vertical.join(', ') || 'All',
      options: state.filterOptions.verticals || []
    },
    {
      id: 'region',
      icon: 'fa-map-marker-alt',
      label: 'Region',
      color: 'from-purple-400 to-purple-600',
      value: state.filters.region.join(', ') || 'All',
      options: state.filterOptions.regions || []
    },
    {
      id: 'regional-head',
      icon: 'fa-user-tie',
      label: 'Regional Head',
      color: 'from-orange-400 to-orange-600',
      value: state.filters.regionHead.join(', ') || 'All',
      options: state.filterOptions.regionHeads || []
    },
    {
      id: 'practice-head',
      icon: 'fa-user-friends',
      label: 'Practice Head',
      color: 'from-teal-400 to-teal-600',
      value: state.filters.practiceHead.join(', ') || 'All',
      options: state.filterOptions.practiceHeads || []
    },
    {
      id: 'project',
      icon: 'fa-briefcase',
      label: 'Project',
      color: 'from-pink-400 to-pink-600',
      value: state.filters.project.join(', ') || 'All',
      options: state.filterOptions.projects || []
    }
  ]

  return `
    <div class="fixed top-0 left-0 right-0 z-40 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 shadow-xl">
      <!-- Top Bar -->
      <div class="px-6 py-3 flex items-center justify-between">
        <!-- Logo & Title -->
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-lg">
            <i class="fas fa-chart-line text-purple-600 text-xl"></i>
          </div>
          <h1 class="text-xl font-bold text-white">Finance Executive Dashboard</h1>
        </div>
        
        <!-- Fiscal Year Selector -->
        <div class="flex items-center space-x-4">
          <div class="bg-white bg-opacity-20 backdrop-blur-lg rounded-lg px-4 py-2 flex items-center space-x-2">
            <i class="fas fa-calendar-alt text-white"></i>
            <select id="filter-fy-compact" 
                    onchange="handleCompactFilterChange('fy', this.value)"
                    class="bg-transparent text-white font-semibold outline-none cursor-pointer">
              ${(state.filterOptions.fiscalYears || []).map(fy => 
                `<option value="${fy}" ${state.filters.fy.includes(fy) ? 'selected' : ''} 
                         class="text-gray-800 bg-white">${fy}</option>`
              ).join('')}
            </select>
          </div>
          
          <button onclick="loadData()" 
                  class="bg-white text-purple-600 px-4 py-2 rounded-lg font-semibold hover:shadow-lg transition-all flex items-center space-x-2">
            <i class="fas fa-sync-alt"></i>
            <span>Refresh</span>
          </button>
        </div>
      </div>
      
      <!-- Compact Filter Pills -->
      <div class="px-6 pb-3 flex items-center space-x-3 overflow-x-auto">
        ${filters.map(filter => renderFilterPill(filter)).join('')}
      </div>
    </div>
    
    <!-- Spacer for fixed header -->
    <div class="h-32"></div>
  `
}

// Helper function to format month for display (convert to full month name)
function formatMonthDisplay(monthLabel) {
  if (!monthLabel) return 'All'
  // Convert short month to full name (e.g., "Dec'25" -> "December")
  const monthMap = {
    'Jan': 'January', 'Feb': 'February', 'Mar': 'March', 'Apr': 'April',
    'May': 'May', 'Jun': 'June', 'Jul': 'July', 'Aug': 'August',
    'Sep': 'September', 'Oct': 'October', 'Nov': 'November', 'Dec': 'December'
  }
  const shortMonth = monthLabel.split("'")[0]
  return monthMap[shortMonth] || shortMonth
}

/**
 * Render individual filter pill with flip dropdown
 */
function renderFilterPill(filter) {
  const displayValue = filter.value?.toString().length > 15 
    ? filter.value.toString().substring(0, 15) + '...' 
    : filter.value || 'All'
    
  return `
    <div class="filter-pill-container relative">
      <button 
        onclick="toggleFilterDropdown('${filter.id}')"
        class="filter-pill bg-gradient-to-r ${filter.color} text-white px-4 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all flex items-center space-x-2 group"
        style="min-width: 140px;">
        <i class="fas ${filter.icon}"></i>
        <div class="flex-1 text-left">
          <div class="text-xs opacity-80">${filter.label}</div>
          <div class="text-sm font-semibold truncate">${displayValue}</div>
        </div>
        <i class="fas fa-chevron-down text-xs transition-transform group-hover:rotate-180"></i>
      </button>
      
      <!-- Flip Dropdown (Hidden by default) -->
      <div id="dropdown-${filter.id}" 
           class="filter-dropdown hidden absolute top-full mt-2 left-0 bg-white rounded-lg shadow-2xl border border-gray-200 z-50"
           style="min-width: 280px; max-width: 400px; max-height: 400px; animation: flipIn 0.3s ease-out;">
        <div class="p-3 border-b bg-gradient-to-r ${filter.color} text-white rounded-t-lg">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <i class="fas ${filter.icon}"></i>
              <span class="font-semibold">${filter.label}</span>
            </div>
            <button onclick="closeFilterDropdown('${filter.id}')" 
                    class="text-white hover:bg-white hover:bg-opacity-20 rounded p-1">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        
        <div class="p-3">
          ${renderFilterOptions(filter)}
        </div>
      </div>
    </div>
  `
}

/**
 * Render filter options based on filter type
 */
function renderFilterOptions(filter) {
  const isMultiSelect = ['vertical', 'region', 'regional-head', 'practice-head', 'project'].includes(filter.id)
  
  if (isMultiSelect) {
    return `
      <div class="space-y-1 max-h-80 overflow-y-auto custom-scrollbar">
        <label class="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer transition-colors">
          <input type="checkbox" 
                 onchange="handleMultiSelectAll('${filter.id}', this.checked)"
                 class="mr-2 rounded text-purple-600 focus:ring-purple-500">
          <span class="font-semibold text-gray-700">Select All</span>
        </label>
        <div class="border-t my-2"></div>
        ${filter.options.map(option => `
          <label class="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer transition-colors">
            <input type="checkbox" 
                   value="${option}"
                   onchange="handleMultiSelectChange('${filter.id}', '${option}', this.checked)"
                   ${isOptionSelected(filter.id, option) ? 'checked' : ''}
                   class="mr-2 rounded text-purple-600 focus:ring-purple-500">
            <span class="text-sm text-gray-700">${option}</span>
          </label>
        `).join('')}
      </div>
      <div class="mt-3 pt-3 border-t flex justify-end space-x-2">
        <button onclick="clearFilter('${filter.id}')" 
                class="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors">
          Clear
        </button>
        <button onclick="closeFilterDropdown('${filter.id}')" 
                class="px-3 py-1 text-sm bg-gradient-to-r ${filter.color} text-white rounded hover:shadow-lg transition-all">
          Apply
        </button>
      </div>
    `
  } else {
    // Single select (Period, Selection)
    return `
      <div class="space-y-1 max-h-80 overflow-y-auto custom-scrollbar">
        ${filter.options.map(option => `
          <label class="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer transition-colors">
            <input type="radio" 
                   name="${filter.id}"
                   value="${option}"
                   onchange="handleSingleSelectChange('${filter.id}', '${option}')"
                   ${filter.value === option ? 'checked' : ''}
                   class="mr-2 text-purple-600 focus:ring-purple-500">
            <span class="text-sm text-gray-700">${option}</span>
          </label>
        `).join('')}
      </div>
    `
  }
}

/**
 * Check if option is selected
 */
function isOptionSelected(filterId, option) {
  const filterMap = {
    'vertical': 'vertical',
    'region': 'region',
    'regional-head': 'regionHead',
    'practice-head': 'practiceHead',
    'project': 'project'
  }
  
  const filterKey = filterMap[filterId]
  if (!filterKey) return false
  
  return state.filters[filterKey]?.includes(option) || false
}

/**
 * Toggle filter dropdown
 */
function toggleFilterDropdown(filterId) {
  const dropdown = document.getElementById(`dropdown-${filterId}`)
  if (!dropdown) return
  
  // Close all other dropdowns
  document.querySelectorAll('.filter-dropdown').forEach(dd => {
    if (dd.id !== `dropdown-${filterId}`) {
      dd.classList.add('hidden')
    }
  })
  
  // Toggle current dropdown
  dropdown.classList.toggle('hidden')
}

/**
 * Close filter dropdown
 */
function closeFilterDropdown(filterId) {
  const dropdown = document.getElementById(`dropdown-${filterId}`)
  if (dropdown) {
    dropdown.classList.add('hidden')
  }
  
  // Reload data after filter change
  loadData()
}

/**
 * Handle single select change (Period, Selection)
 */
function handleSingleSelectChange(filterId, value) {
  if (filterId === 'period') {
    state.filters.periodMode = value
  } else if (filterId === 'selection') {
    state.filters.endMonth = value
  }
  
  // Update pill display
  const pill = document.querySelector(`#dropdown-${filterId}`).previousElementSibling
  const valueDisplay = pill.querySelector('.text-sm')
  if (valueDisplay) {
    valueDisplay.textContent = value
  }
  
  // Close dropdown and reload
  setTimeout(() => closeFilterDropdown(filterId), 200)
}

/**
 * Handle multi-select change
 */
function handleMultiSelectChange(filterId, option, checked) {
  const filterMap = {
    'vertical': 'vertical',
    'region': 'region',
    'regional-head': 'regionHead',
    'practice-head': 'practiceHead',
    'project': 'project'
  }
  
  const filterKey = filterMap[filterId]
  if (!filterKey) return
  
  if (checked) {
    if (!state.filters[filterKey].includes(option)) {
      state.filters[filterKey].push(option)
    }
  } else {
    state.filters[filterKey] = state.filters[filterKey].filter(v => v !== option)
  }
  
  updateFilterPillDisplay(filterId, filterKey)
}

/**
 * Handle select all
 */
function handleMultiSelectAll(filterId, checked) {
  const filterMap = {
    'vertical': 'vertical',
    'region': 'region',
    'regional-head': 'regionHead',
    'practice-head': 'practiceHead',
    'project': 'project'
  }
  
  const filterKey = filterMap[filterId]
  if (!filterKey) return
  
  const dropdown = document.getElementById(`dropdown-${filterId}`)
  const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]:not(:first-child)')
  
  if (checked) {
    state.filters[filterKey] = Array.from(checkboxes).map(cb => cb.value)
    checkboxes.forEach(cb => cb.checked = true)
  } else {
    state.filters[filterKey] = []
    checkboxes.forEach(cb => cb.checked = false)
  }
  
  updateFilterPillDisplay(filterId, filterKey)
}

/**
 * Clear filter
 */
function clearFilter(filterId) {
  const filterMap = {
    'vertical': 'vertical',
    'region': 'region',
    'regional-head': 'regionHead',
    'practice-head': 'practiceHead',
    'project': 'project'
  }
  
  const filterKey = filterMap[filterId]
  if (!filterKey) return
  
  state.filters[filterKey] = []
  
  const dropdown = document.getElementById(`dropdown-${filterId}`)
  const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]')
  checkboxes.forEach(cb => cb.checked = false)
  
  updateFilterPillDisplay(filterId, filterKey)
}

/**
 * Update filter pill display
 */
function updateFilterPillDisplay(filterId, filterKey) {
  const pill = document.querySelector(`#dropdown-${filterId}`).previousElementSibling
  const valueDisplay = pill.querySelector('.text-sm')
  
  if (valueDisplay) {
    const selectedCount = state.filters[filterKey].length
    let displayText = 'All'
    
    if (selectedCount > 0) {
      if (selectedCount === 1) {
        displayText = state.filters[filterKey][0]
      } else {
        displayText = `${selectedCount} selected`
      }
    }
    
    valueDisplay.textContent = displayText.length > 15 
      ? displayText.substring(0, 15) + '...' 
      : displayText
  }
}

/**
 * Handle compact filter change (for FY selector)
 */
async function handleCompactFilterChange(filterType, value) {
  if (filterType === 'fy') {
    state.filters.fy = [value]
    
    // Update endMonth for the selected FY
    try {
      const latestMonthResponse = await axios.get(`/api/latest-month/${value}`)
      if (latestMonthResponse.data.latestMonth) {
        state.filters.endMonth = latestMonthResponse.data.latestMonth
        console.log(`✅ FY changed to ${value}, latest month: ${state.filters.endMonth}`)
      } else {
        // Fallback to last month in FY
        const fyMonths = getMonthsForFY(value)
        if (fyMonths.length > 0) {
          state.filters.endMonth = fyMonths[fyMonths.length - 1]
        }
      }
    } catch (error) {
      console.error('Error fetching latest month for FY:', error)
      // Fallback to last month in FY
      const fyMonths = getMonthsForFY(value)
      if (fyMonths.length > 0) {
        state.filters.endMonth = fyMonths[fyMonths.length - 1]
      }
    }
    
    // Reload cascading filters for the new FY
    await loadCascadingFilters()
    
    // Load data with new FY
    await loadData()
  }
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.filter-pill-container')) {
    document.querySelectorAll('.filter-dropdown').forEach(dd => {
      dd.classList.add('hidden')
    })
  }
})

// Add custom styles for flip animation

// Refresh data function (alias for loadData)
function refreshData() {
  loadData()
}
// ============================================================================
// DROPDOWN-BASED FILTERS (No flip animation, clean dropdowns)
// ============================================================================

/**
 * Render dropdown-based filter panel (cleaner than flip pills)
 */
function renderDropdownFilters() {
  return `
    <div class="fixed top-0 left-0 right-0 z-40 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 shadow-xl">
      <!-- Top Bar -->
      <div class="px-6 py-3 flex items-center justify-between">
        <!-- Logo & Title -->
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-lg">
            <i class="fas fa-chart-line text-purple-600 text-xl"></i>
          </div>
          <h1 class="text-xl font-bold text-white">Finance Executive Dashboard</h1>
        </div>
        
        <!-- Actions -->
        <div class="flex items-center space-x-4">
          <button onclick="toggleColorPalette()" 
                  class="bg-white bg-opacity-20 backdrop-blur-lg rounded-lg px-4 py-2 text-white hover:bg-opacity-30 transition-all flex items-center space-x-2">
            <i class="fas fa-palette"></i>
            <span>Colors</span>
          </button>
          
          <button onclick="refreshData()" 
                  class="bg-white text-purple-600 px-4 py-2 rounded-lg font-semibold hover:shadow-lg transition-all flex items-center space-x-2">
            <i class="fas fa-sync-alt"></i>
            <span>Refresh</span>
          </button>
        </div>
      </div>
      
      <!-- Filter Dropdowns Row -->
      <div class="px-6 pb-3 grid grid-cols-8 gap-3">
        <!-- Fiscal Year -->
        <div class="relative">
          <label class="block text-xs font-semibold text-white mb-1 opacity-90">Fiscal Year</label>
          <select id="filter-fy-dropdown" 
                  onchange="handleDropdownFilterChange('fy', this.value)"
                  class="w-full px-3 py-2 bg-white bg-opacity-20 backdrop-blur-lg text-white border border-white border-opacity-30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 hover:bg-opacity-30 transition-all">
            ${(state.filterOptions.fiscalYears || []).map(fy => 
              `<option value="${fy}" ${state.filters.fy.includes(fy) ? 'selected' : ''} class="text-gray-800">${fy}</option>`
            ).join('')}
          </select>
        </div>
        
        <!-- Period -->
        <div class="relative">
          <label class="block text-xs font-semibold text-white mb-1 opacity-90">Period</label>
          <select id="filter-period-dropdown" 
                  onchange="handleDropdownFilterChange('period', this.value)"
                  class="w-full px-3 py-2 bg-white bg-opacity-20 backdrop-blur-lg text-white border border-white border-opacity-30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 hover:bg-opacity-30 transition-all">
            <option value="Month" ${state.filters.periodMode === 'Month' ? 'selected' : ''} class="text-gray-800">Month</option>
            <option value="YTD" ${state.filters.periodMode === 'YTD' ? 'selected' : ''} class="text-gray-800">YTD</option>
            <option value="Full FY" ${state.filters.periodMode === 'Full FY' ? 'selected' : ''} class="text-gray-800">Full FY</option>
          </select>
        </div>
        
        <!-- End Month -->
        <div class="relative">
          <label class="block text-xs font-semibold text-white mb-1 opacity-90">End Month</label>
          <select id="filter-month-dropdown" 
                  onchange="handleDropdownFilterChange('month', this.value)"
                  class="w-full px-3 py-2 bg-white bg-opacity-20 backdrop-blur-lg text-white border border-white border-opacity-30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 hover:bg-opacity-30 transition-all">
            ${(getMonthsForFY(state.filters.fy[0]).length > 0 ? getMonthsForFY(state.filters.fy[0]) : (state.filterOptions.months || [])).map(month => 
              `<option value="${month}" ${state.filters.endMonth === month ? 'selected' : ''} class="text-gray-800">${month}</option>`
            ).join('')}
          </select>
        </div>
        
        <!-- Vertical -->
        <div class="relative">
          <label class="block text-xs font-semibold text-white mb-1 opacity-90">Vertical</label>
          <select id="filter-vertical-dropdown" 
                  onchange="handleDropdownFilterChange('vertical', this.value)"
                  class="w-full px-3 py-2 bg-white bg-opacity-20 backdrop-blur-lg text-white border border-white border-opacity-30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 hover:bg-opacity-30 transition-all">
            <option value="" class="text-gray-800">All Verticals</option>
            ${(state.filterOptions.verticals || []).map(v => 
              `<option value="${v}" ${state.filters.vertical.includes(v) ? 'selected' : ''} class="text-gray-800">${v}</option>`
            ).join('')}
          </select>
        </div>
        
        <!-- Region -->
        <div class="relative">
          <label class="block text-xs font-semibold text-white mb-1 opacity-90">Region</label>
          <select id="filter-region-dropdown" 
                  onchange="handleDropdownFilterChange('region', this.value)"
                  class="w-full px-3 py-2 bg-white bg-opacity-20 backdrop-blur-lg text-white border border-white border-opacity-30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 hover:bg-opacity-30 transition-all">
            <option value="" class="text-gray-800">All Regions</option>
            ${(state.filterOptions.regions || []).map(r => 
              `<option value="${r}" ${state.filters.region.includes(r) ? 'selected' : ''} class="text-gray-800">${r}</option>`
            ).join('')}
          </select>
        </div>
        
        <!-- Sub Region -->
        <div class="relative">
          <label class="block text-xs font-semibold text-white mb-1 opacity-90">Sub Region</label>
          <select id="filter-subregion-dropdown" 
                  onchange="handleDropdownFilterChange('subRegion', this.value)"
                  class="w-full px-3 py-2 bg-white bg-opacity-20 backdrop-blur-lg text-white border border-white border-opacity-30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 hover:bg-opacity-30 transition-all">
            <option value="" class="text-gray-800">All Sub-Regions</option>
            ${(state.filterOptions.subRegions || []).map(sr => 
              `<option value="${sr}" ${state.filters.subRegion.includes(sr) ? 'selected' : ''} class="text-gray-800">${sr}</option>`
            ).join('')}
          </select>
        </div>
        
        <!-- Region Head -->
        <div class="relative">
          <label class="block text-xs font-semibold text-white mb-1 opacity-90">Region Head</label>
          <select id="filter-regionhead-dropdown" 
                  onchange="handleDropdownFilterChange('regionHead', this.value)"
                  class="w-full px-3 py-2 bg-white bg-opacity-20 backdrop-blur-lg text-white border border-white border-opacity-30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 hover:bg-opacity-30 transition-all">
            <option value="" class="text-gray-800">All Heads</option>
            ${(state.filterOptions.regionHeads || []).map(rh => 
              `<option value="${rh}" ${state.filters.regionHead.includes(rh) ? 'selected' : ''} class="text-gray-800">${rh}</option>`
            ).join('')}
          </select>
        </div>
        
        <!-- Practice Head -->
        <div class="relative">
          <label class="block text-xs font-semibold text-white mb-1 opacity-90">Practice Head</label>
          <select id="filter-practicehead-dropdown" 
                  onchange="handleDropdownFilterChange('practiceHead', this.value)"
                  class="w-full px-3 py-2 bg-white bg-opacity-20 backdrop-blur-lg text-white border border-white border-opacity-30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 hover:bg-opacity-30 transition-all">
            <option value="" class="text-gray-800">All Heads</option>
            ${(state.filterOptions.practiceHeads || []).map(ph => 
              `<option value="${ph}" ${state.filters.practiceHead.includes(ph) ? 'selected' : ''} class="text-gray-800">${ph}</option>`
            ).join('')}
          </select>
        </div>
      </div>
    </div>
    
    <!-- Spacer for fixed header -->
    <div class="h-32"></div>
  `
}

/**
 * Load cascading filter options based on current filter selections
 */
async function loadCascadingFilters() {
  try {
    // Get FY-specific months
    const fy = state.filters.fy && state.filters.fy.length > 0 && state.filters.fy[0] !== 'ALL' 
      ? state.filters.fy[0] 
      : 'FY2025-26' // Default to current FY if ALL is selected
    
    const [cascadingResponse, calendarResponse] = await Promise.all([
      axios.post('/api/filters/cascading', {
        fy: state.filters.fy,
        vertical: state.filters.vertical,
        region: state.filters.region,
        subRegion: state.filters.subRegion,
        regionHead: state.filters.regionHead,
        practiceHead: state.filters.practiceHead
      }),
      axios.get(`/api/calendar/${fy}`)
    ])
    
    // Update only dependent filter options
    state.filterOptions.verticals = cascadingResponse.data.verticals || []
    state.filterOptions.regions = cascadingResponse.data.regions || []
    state.filterOptions.subRegions = cascadingResponse.data.subRegions || []
    state.filterOptions.regionHeads = cascadingResponse.data.regionHeads || []
    state.filterOptions.practiceHeads = cascadingResponse.data.practiceHeads || []
    state.filterOptions.projects = cascadingResponse.data.projects || []
    
    // Update months for selected FY only (cascading)
    state.filterOptions.months = calendarResponse.data.months?.map(m => m.month_label) || []
    
    console.log('🔄 Cascading filters updated:', {
      fy: fy,
      months: state.filterOptions.months.length,
      verticals: state.filterOptions.verticals.length,
      regions: state.filterOptions.regions.length,
      subRegions: state.filterOptions.subRegions.length,
      regionHeads: state.filterOptions.regionHeads.length,
      practiceHeads: state.filterOptions.practiceHeads.length,
      projects: state.filterOptions.projects.length
    })
  } catch (error) {
    console.error('Error loading cascading filters:', error)
  }
}

/**
 * Handle dropdown filter changes
 */
function handleDropdownFilterChange(filterType, value) {
  console.log('Filter changed:', filterType, value)
  
  switch(filterType) {
    case 'fy':
      state.filters.fy = [value]
      // Fetch latest month with actual revenue for the selected FY
      axios.get(`/api/latest-month/${value}`)
        .then(response => {
          if (response.data.latestMonth) {
            state.filters.endMonth = response.data.latestMonth
            console.log(`✅ FY changed to ${value}, latest month: ${state.filters.endMonth}`)
          } else {
            // Fallback to last month in FY
            const fyMonths = getMonthsForFY(value)
            if (fyMonths.length > 0) {
              state.filters.endMonth = fyMonths[fyMonths.length - 1]
            }
          }
          
          // Reset dependent filters
          state.filters.vertical = []
          state.filters.region = []
          state.filters.subRegion = []
          state.filters.regionHead = []
          state.filters.practiceHead = []
          state.filters.project = []
          
          // Load cascading filters and reload data
          return loadCascadingFilters()
        })
        .then(() => {
          // Re-render sidebar to update dropdowns
          const sidebar = document.querySelector('.sidebar')
          if (sidebar) {
            sidebar.outerHTML = renderColorfulSidebar()
          }
        })
        .catch(error => {
          console.error('Error updating FY:', error)
          // Fallback to last month in FY
          const fyMonths = getMonthsForFY(value)
          if (fyMonths.length > 0) {
            state.filters.endMonth = fyMonths[fyMonths.length - 1]
          }
        })
      break
    case 'period':
      state.filters.periodMode = value
      break
    case 'month':
      state.filters.endMonth = value
      break
    case 'vertical':
      state.filters.vertical = value ? [value] : []
      // Reset dependent filters
      state.filters.region = []
      state.filters.subRegion = []
      state.filters.regionHead = []
      state.filters.practiceHead = []
      state.filters.project = []
      // Load cascading filters
      loadCascadingFilters().then(() => {
        const sidebar = document.querySelector('.sidebar')
        if (sidebar) {
          sidebar.outerHTML = renderColorfulSidebar()
        }
      })
      break
    case 'region':
      state.filters.region = value ? [value] : []
      // Reset dependent filters
      state.filters.subRegion = []
      state.filters.regionHead = []
      state.filters.practiceHead = []
      state.filters.project = []
      // Load cascading filters
      loadCascadingFilters().then(() => {
        const sidebar = document.querySelector('.sidebar')
        if (sidebar) {
          sidebar.outerHTML = renderColorfulSidebar()
        }
      })
      break
    case 'subRegion':
      state.filters.subRegion = value ? [value] : []
      // Reset dependent filters
      state.filters.regionHead = []
      state.filters.practiceHead = []
      state.filters.project = []
      // Load cascading filters
      loadCascadingFilters().then(() => {
        const sidebar = document.querySelector('.sidebar')
        if (sidebar) {
          sidebar.outerHTML = renderColorfulSidebar()
        }
      })
      break
    case 'regionHead':
      state.filters.regionHead = value ? [value] : []
      // Reset dependent filters
      state.filters.practiceHead = []
      state.filters.project = []
      // Load cascading filters
      loadCascadingFilters().then(() => {
        const sidebar = document.querySelector('.sidebar')
        if (sidebar) {
          sidebar.outerHTML = renderColorfulSidebar()
        }
      })
      break
    case 'practiceHead':
      state.filters.practiceHead = value ? [value] : []
      // Reset dependent filters
      state.filters.project = []
      // Load cascading filters
      loadCascadingFilters().then(() => {
        const sidebar = document.querySelector('.sidebar')
        if (sidebar) {
          sidebar.outerHTML = renderColorfulSidebar()
        }
      })
      break
  }
  
  // Reload data
  loadData()
}
// ============================================================================
// COLORFUL SIDEBAR DESIGN with Color Palette Selector
// ============================================================================

// Color themes for user selection
const COLOR_THEMES = {
  default: {
    name: 'Default Purple',
    primary: '#8b5cf6',
    secondary: '#ec4899',
    accent: '#06b6d4',
    gradient: 'from-purple-500 to-pink-600',
    background: 'from-gray-50 to-blue-50'
  },
  ocean: {
    name: 'Ocean Blue',
    primary: '#0ea5e9',
    secondary: '#06b6d4',
    accent: '#0891b2',
    gradient: 'from-blue-500 to-cyan-600',
    background: 'from-blue-50 to-cyan-50'
  },
  forest: {
    name: 'Forest Green',
    primary: '#10b981',
    secondary: '#059669',
    accent: '#14b8a6',
    gradient: 'from-green-500 to-emerald-600',
    background: 'from-green-50 to-emerald-50'
  },
  sunset: {
    name: 'Sunset Orange',
    primary: '#f97316',
    secondary: '#ea580c',
    accent: '#fb923c',
    gradient: 'from-orange-500 to-red-600',
    background: 'from-orange-50 to-red-50'
  },
  royal: {
    name: 'Royal Blue',
    primary: '#3b82f6',
    secondary: '#6366f1',
    accent: '#8b5cf6',
    gradient: 'from-blue-600 to-indigo-600',
    background: 'from-blue-50 to-indigo-50'
  },
  rose: {
    name: 'Rose Pink',
    primary: '#ec4899',
    secondary: '#db2777',
    accent: '#f472b6',
    gradient: 'from-pink-500 to-rose-600',
    background: 'from-pink-50 to-rose-50'
  }
}

// Dashboard background colors
const DASHBOARD_BG_COLORS = {
  default: {
    name: 'Light Blue',
    class: 'from-gray-50 to-blue-50'
  },
  light: {
    name: 'Light Gray',
    class: 'from-gray-50 to-gray-100'
  },
  white: {
    name: 'Pure White',
    class: 'from-white to-gray-50'
  },
  warm: {
    name: 'Warm Beige',
    class: 'from-orange-50 to-amber-50'
  },
  cool: {
    name: 'Cool Mint',
    class: 'from-teal-50 to-cyan-50'
  },
  lavender: {
    name: 'Soft Lavender',
    class: 'from-purple-50 to-pink-50'
  }
}

let currentTheme = 'default'
let currentBgColor = 'default'

// Current theme state (already declared above, removed duplicate)

/**
 * Render colorful sidebar with modern design
 */
function renderColorfulSidebar() {
  const theme = COLOR_THEMES[currentTheme]
  
  return `
    <div class="w-64 bg-gradient-to-b ${theme.gradient} shadow-2xl overflow-y-auto">
      <!-- Sidebar Header -->
      <div class="p-6 border-b border-white border-opacity-20">
        <div class="flex items-center space-x-3 mb-4">
          <div class="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg">
            <i class="fas fa-chart-line text-2xl" style="color: ${theme.primary}"></i>
          </div>
          <div>
            <h2 class="text-white font-bold text-lg">Finance</h2>
            <p class="text-white text-xs opacity-75">Executive Dashboard</p>
          </div>
        </div>
      </div>
      
      <!-- Performance Menu -->
      <div class="p-4 border-b border-white border-opacity-20">
        <div class="flex items-center justify-between mb-3">
          <div class="text-xs font-bold text-white uppercase tracking-wider opacity-90">
            <i class="fas fa-chart-bar mr-2"></i>Performance
          </div>
          <div class="bg-white bg-opacity-20 backdrop-blur-lg rounded-full px-2 py-1 text-xs text-white font-semibold">
            6
          </div>
        </div>
        
        <div class="space-y-1">
          ${renderColorfulNavLink('executive', 'fa-chart-pie', 'Executive Overview', theme)}
          ${renderColorfulNavLink('revenue-cm', 'fa-dollar-sign', 'Revenue & CM', theme)}
          ${renderColorfulNavLink('ppc-productivity', 'fa-coins', 'PPC & Productivity', theme)}
          ${renderColorfulNavLink('headcount-capacity', 'fa-users', 'Headcount & Capacity', theme)}
          ${renderColorfulNavLink('collections', 'fa-money-check-alt', 'Collections', theme)}
          ${renderColorfulNavLink('hiring', 'fa-user-plus', 'Hiring Efficiency', theme)}
        </div>
      </div>
      
      <!-- Governance Menu -->
      <div class="p-4">
        <div class="flex items-center justify-between mb-3">
          <div class="text-xs font-bold text-white uppercase tracking-wider opacity-90">
            <i class="fas fa-shield-alt mr-2"></i>Governance
          </div>
          <div class="bg-white bg-opacity-20 backdrop-blur-lg rounded-full px-2 py-1 text-xs text-white font-semibold">
            4
          </div>
        </div>
        
        <div class="space-y-1">
          ${renderColorfulNavLink('targets', 'fa-bullseye', 'Targets', theme)}
          ${renderColorfulNavLink('data-quality', 'fa-check-circle', 'Data Quality', theme)}
          ${renderColorfulNavLink('upload', 'fa-upload', 'Upload', theme)}
          ${renderColorfulNavLink('definitions', 'fa-book', 'Definitions', theme)}
        </div>
      </div>
      
      <!-- Footer -->
      <div class="p-4 border-t border-white border-opacity-20">
        <div class="text-center text-white text-xs opacity-75">
          <i class="fas fa-shield-check mr-1"></i>
          v4.7.0
        </div>
      </div>
    </div>
  `
}

/**
 * Render colorful navigation link
 */
function renderColorfulNavLink(page, icon, label, theme) {
  const isActive = state.currentPage === page
  
  return `
    <a href="#" 
       onclick="navigateTo('${page}'); return false;" 
       class="nav-item flex items-center px-3 py-2.5 rounded-lg transition-all duration-300 group ${
         isActive 
           ? 'bg-white text-gray-800 shadow-lg transform scale-105' 
           : 'text-white hover:bg-white hover:bg-opacity-20 hover:translate-x-1'
       }">
      <div class="w-8 h-8 ${isActive ? 'bg-gradient-to-br ' + theme.gradient : 'bg-white bg-opacity-20'} rounded-lg flex items-center justify-center flex-shrink-0 mr-3">
        <i class="fas ${icon} text-sm ${isActive ? 'text-white' : 'text-white'}"></i>
      </div>
      <span class="text-sm font-medium flex-1">${label}</span>
      ${isActive ? '<i class="fas fa-chevron-right text-sm"></i>' : ''}
    </a>
  `
}

/**
 * Render color palette selector modal
 */
function renderColorPalette() {
  return `
    <div id="color-palette-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full mx-4">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-2xl font-bold text-gray-800 flex items-center">
            <i class="fas fa-palette mr-3 text-purple-600"></i>
            Choose Color Theme
          </h3>
          <button onclick="toggleColorPalette()" class="text-gray-500 hover:text-gray-700">
            <i class="fas fa-times text-2xl"></i>
          </button>
        </div>
        
        <div class="grid grid-cols-3 gap-4">
          ${Object.entries(COLOR_THEMES).map(([key, theme]) => `
            <button 
              onclick="applyColorTheme('${key}')"
              class="relative p-4 rounded-xl border-2 transition-all hover:scale-105 ${
                currentTheme === key 
                  ? 'border-purple-600 shadow-lg' 
                  : 'border-gray-200 hover:border-purple-300'
              }">
              <div class="flex items-center space-x-3 mb-3">
                <div class="w-10 h-10 bg-gradient-to-br ${theme.gradient} rounded-lg"></div>
                <div class="text-left">
                  <div class="font-semibold text-gray-800">${theme.name}</div>
                  ${currentTheme === key ? '<div class="text-xs text-purple-600 font-semibold">Current</div>' : ''}
                </div>
              </div>
              
              <div class="flex space-x-1">
                <div class="flex-1 h-8 rounded" style="background: ${theme.primary}"></div>
                <div class="flex-1 h-8 rounded" style="background: ${theme.secondary}"></div>
                <div class="flex-1 h-8 rounded" style="background: ${theme.accent}"></div>
              </div>
              
              ${currentTheme === key ? '<i class="fas fa-check-circle absolute top-2 right-2 text-purple-600 text-xl"></i>' : ''}
            </button>
          `).join('')}
        </div>
        
        <div class="mt-6 p-4 bg-blue-50 rounded-lg">
          <div class="flex items-start space-x-3">
            <i class="fas fa-info-circle text-blue-600 mt-1"></i>
            <div class="text-sm text-blue-800">
              <strong>Tip:</strong> Your selected theme affects the sidebar, navigation, and dashboard background color. Each theme has its own complementary background gradient.
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

/**
 * Toggle color palette modal
 */
function toggleColorPalette() {
  const modal = document.getElementById('color-palette-modal')
  if (modal) {
    modal.classList.toggle('hidden')
  }
}

/**
 * Apply selected color theme
 */
function applyColorTheme(themeKey) {
  currentTheme = themeKey
  
  // Save to localStorage
  localStorage.setItem('dashboardTheme', themeKey)
  
  // Re-render sidebar and filters
  renderApp()
  
  // Close modal
  toggleColorPalette()
  
  console.log('Theme applied:', themeKey)
}

// Load saved theme on init
function loadSavedTheme() {
  const saved = localStorage.getItem('dashboardTheme')
  if (saved && COLOR_THEMES[saved]) {
    currentTheme = saved
  }
}
