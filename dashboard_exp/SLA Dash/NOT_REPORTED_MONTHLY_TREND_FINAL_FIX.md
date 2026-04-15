# Not Reported Monthly Trend Chart - Final Fix

## Issue Reported
The **Monthly Trend Comparison** chart in the Not Reporting Analysis view was showing **0 values** for future months (Nov, Dec, Jan, Feb, Mar) instead of stopping the trendline at the last month with actual data (Oct).

### Screenshot Evidence
The user provided a screenshot showing:
- FY 24-25 line: Correctly displays all 12 months with actual values
- FY 25-26 line: Shows values from Apr to Oct, but then shows **0** for Nov, Dec, Jan, Feb, Mar
- Expected: FY 25-26 line should **stop at Oct** and not display anything for future months

---

## Root Cause Analysis

### Multiple Functions Involved
Unlike the previous charts, the Not Reporting Analysis view uses a different set of functions:

1. **`renderNotReportedView()`** (Line 9700) - Main view renderer
2. **`calculateMonthlyTrend()`** (Line 10007) - Calculates monthly data
3. **`renderNotReportedTrendChart()`** (Line 10517) - Renders the chart

### The Problem

**Issue 1: Data Initialization (Line 10098-10103)**
```javascript
// Initialize trend structure
months.forEach(month => {
    trend[month] = { 
        month, 
        fy2425: 0, 
        fy2526: 0,  // ❌ Always initialized to 0, even for future months
        hasFY2526Data: fy2526Months.has(month)
    };
});
```

**Problem:** All months were initialized with `fy2526: 0`, including future months that don't have FY25-26 data columns in the Excel file.

**Issue 2: Return Statement (Line 10138)**
```javascript
return months.map(m => trend[m]);
```

**Problem:** This returned all months with `fy2526: 0` for future months, instead of setting them to `null`.

**Issue 3: Chart Configuration (Line 10550-10561)**
```javascript
{
    label: 'FY 25-26',
    data: fy25Data,
    // ❌ Missing spanGaps: false
}
```

**Problem:** Without `spanGaps: false`, Chart.js would connect `null` values with lines, but since we were returning `0` instead of `null`, it showed 0 on the chart.

---

## The Solution

### Fix 1: Set FY25-26 to Null for Future Months (Line 10139-10148)

**Before:**
```javascript
return months.map(m => trend[m]);
```

**After:**
```javascript
// Return trend data, setting fy2526 to null for months without data columns
return months.map(m => {
    const monthData = trend[m];
    return {
        month: monthData.month,
        fy2425: monthData.fy2425,
        fy2526: monthData.hasFY2526Data ? monthData.fy2526 : null,  // ✅ null if column doesn't exist
        hasFY2526Data: monthData.hasFY2526Data
    };
});
```

**What Changed:**
- ✅ For months with FY25-26 data columns (Apr-Oct): Returns actual value (could be 0 or any number)
- ✅ For months without FY25-26 data columns (Nov-Mar): Returns `null`
- ✅ Preserves `hasFY2526Data` flag for use in tables

### Fix 2: Add spanGaps: false to Chart (Line 10561)

**Before:**
```javascript
{
    label: 'FY 25-26',
    data: fy25Data,
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    tension: 0.4,
    borderWidth: 3,
    pointRadius: 5,
    pointHoverRadius: 7,
    pointBackgroundColor: '#10b981',
    fill: true
}
```

**After:**
```javascript
{
    label: 'FY 25-26',
    data: fy25Data,
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    tension: 0.4,
    borderWidth: 3,
    pointRadius: 5,
    pointHoverRadius: 7,
    pointBackgroundColor: '#10b981',
    fill: true,
    spanGaps: false  // ✅ Don't connect null values - stop line at last data point
}
```

**What Changed:**
- ✅ `spanGaps: false` tells Chart.js to NOT draw lines across `null` values
- ✅ The line now stops at Oct (last non-null value) and doesn't continue to Nov-Mar

---

## Technical Details

### How Month Detection Works

1. **Extract Month Columns** (Line 10077-10095):
   ```javascript
   // Track which months have FY25-26 data columns
   const fy2526Months = new Set();
   if (data2526 && data2526.length > 0) {
       Object.keys(data2526[0]).forEach(key => {
           const match = key.match(/^([A-Za-z]+)\s+MET\/NOT_MET_NotReported$/);
           if (match) {
               const normalizedMonth = normalizeMonthName(match[1]);
               fy2526Months.add(normalizedMonth);  // e.g., 'Apr', 'May', ..., 'Oct'
           }
       });
   }
   ```

2. **Initialize with Flag** (Line 10098-10103):
   ```javascript
   months.forEach(month => {
       trend[month] = { 
           month, 
           fy2425: 0, 
           fy2526: 0,
           hasFY2526Data: fy2526Months.has(month)  // true for Apr-Oct, false for Nov-Mar
       };
   });
   ```

3. **Return with Null Check** (Line 10139-10148):
   ```javascript
   return months.map(m => {
       const monthData = trend[m];
       return {
           month: monthData.month,
           fy2425: monthData.fy2425,
           fy2526: monthData.hasFY2526Data ? monthData.fy2526 : null,  // Key line!
           hasFY2526Data: monthData.hasFY2526Data
       };
   });
   ```

### Data Flow Example

**Input (from sample_data.json):**
- FY24-25 has columns: Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec, Jan, Feb, Mar (12 months)
- FY25-26 has columns: Apr, May, Jun, Jul, Aug, Sep, Oct (7 months only)

**Processing:**
1. `fy2526Months` Set = {'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'}
2. For each month:
   - Apr-Oct: `hasFY2526Data = true` → returns actual value
   - Nov-Mar: `hasFY2526Data = false` → returns `null`

**Output (trend array):**
```javascript
[
    { month: 'Apr', fy2425: 53, fy2526: 107, hasFY2526Data: true },
    { month: 'May', fy2425: 28, fy2526: 79, hasFY2526Data: true },
    { month: 'Jun', fy2425: 46, fy2526: 96, hasFY2526Data: true },
    { month: 'Jul', fy2425: 45, fy2526: 88, hasFY2526Data: true },
    { month: 'Aug', fy2425: 42, fy2526: 82, hasFY2526Data: true },
    { month: 'Sep', fy2425: 30, fy2526: 144, hasFY2526Data: true },
    { month: 'Oct', fy2425: 49, fy2526: 102, hasFY2526Data: true },
    { month: 'Nov', fy2425: 45, fy2526: null, hasFY2526Data: false },  // ✅ null
    { month: 'Dec', fy2425: 55, fy2526: null, hasFY2526Data: false },  // ✅ null
    { month: 'Jan', fy2425: 65, fy2526: null, hasFY2526Data: false },  // ✅ null
    { month: 'Feb', fy2425: 46, fy2526: null, hasFY2526Data: false },  // ✅ null
    { month: 'Mar', fy2425: 60, fy2526: null, hasFY2526Data: false }   // ✅ null
]
```

**Chart Rendering:**
- FY 24-25 dataset: `[53, 28, 46, 45, 42, 30, 49, 45, 55, 65, 46, 60]` (all values)
- FY 25-26 dataset: `[107, 79, 96, 88, 82, 144, 102, null, null, null, null, null]` (nulls for future)
- With `spanGaps: false`, the line stops at Oct and doesn't show Nov-Mar

---

## Results

### Before Fix
```
Chart Display:
Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec  Jan  Feb  Mar
107  79   96   88   82   144  102  0    0    0    0    0    ❌ Shows 0s
```

### After Fix
```
Chart Display:
Apr  May  Jun  Jul  Aug  Sep  Oct
107  79   96   88   82   144  102  ✅ Line stops at Oct, no Nov-Mar shown
```

---

## Testing Instructions

1. **Open Dashboard**: https://3000-i06je7d51yb0robxe7bji-3844e1b6.sandbox.novita.ai
2. **Navigate**: Data Quality → Not Reporting Analysis
3. **View Chart**: "Monthly Trend Comparison" chart
4. **Verify**:
   - ✅ FY 24-25 line: Shows all 12 months
   - ✅ FY 25-26 line: Shows Apr to Oct only
   - ✅ No zeros displayed for Nov-Mar
   - ✅ Line stops smoothly at Oct
5. **Check Table**: "Monthly Summary" table should show "N/A" for Nov-Mar (already fixed in previous session)

---

## Related Fixes

This fix works together with the previous fixes:
1. **Issue 1 Fix**: Projects with 0→36 now show "Worsening" (not "N/A" or "Stable")
2. **Issue 2 Fix**: Monthly Summary shows "N/A" for future months (not -100%)
3. **Issue 3 Fix**: Monthly Trend chart stops at last data point (THIS FIX)

All three issues are now fully resolved!

---

## Files Modified
1. `/home/user/webapp/index.html` (Lines 10139-10148, 10561)
2. `/home/user/webapp/TAGGD_Dashboard_ENHANCED.html` (Backup synced)

## Deployment
- **Commit**: `bb530f5`
- **Pushed to**: `https://github.com/Rishab25276/SLA-DASHBOARD`
- **Live Dashboard**: https://3000-i06je7d51yb0robxe7bji-3844e1b6.sandbox.novita.ai

---

## Additional Notes

### Why This Fix is Different from Previous Attempts

Previous attempts fixed the chart in the old `renderNotReportedCharts()` function (Line 4837), but the user was viewing the **NEW** Not Reporting Analysis view which uses `renderNotReportedView()` (Line 9700) and `renderNotReportedTrendChart()` (Line 10517).

The dashboard has **TWO different** Not Reporting implementations:
1. **Old**: `showNotReportedAnalysis()` → uses `processedNotReported` data
2. **New**: `renderNotReportedView()` → uses `fy2425NotReportedData` and `fy2526NotReportedData`

This fix targets the NEW implementation which is actually being used.

---

**Status**: ✅ Issue Fully Resolved  
**Chart Behavior**: Correct - Stops at last data point  
**Ready for Production**: Yes
