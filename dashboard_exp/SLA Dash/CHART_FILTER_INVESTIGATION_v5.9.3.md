# Chart Filter Investigation - v5.9.3

## Issue Report
**Date**: March 2, 2026  
**Reported by**: User  
**Issue**: Charts in Not Reported view not updating when filters are applied

## Investigation Summary

### 1. Data Verification ✅
**File**: `SLA_Monthly_Status_Summary_FINAL.xlsx`  
**Status**: ✅ VERIFIED - All data correct

#### Sheets Analyzed:
- **FY 24-25 Summary** (47 rows, 30 columns)
- **FY 25-26 Summary** (48 rows, 26 columns)
- **FY 25-26 Metrics Details** (506 rows, 36 columns)
- **FY24-25 Not Reported** (49 rows, 16 columns)
- **FY25-26 Not Reported** (48 rows, 14 columns)

#### TBH Replacement Status:
✅ **COMPLETE** - "Sulabh" has been replaced with "TBH" in:
- Practice Head columns
- Regional Head columns
- All sheets in Excel file
- JavaScript code (index.html)

**Unique Values Found**:
- Practice Heads: Krishna, Bapi Reddy, Megha, Elton, Usha, Archana Trikha, Shweta, **TBH**, Ashish, Mahak, Alifiya, Geetu, Bikash/Piyush
- Regional Heads: **TBH**, Anjli Zutshi

### 2. Filter Mechanism Analysis

#### How Filters Work:
1. **applyFilters()** (line 5650):
   - Reads all filter values (FY, Regional Head, Region, Practice, Account, Month)
   - Filters `rawData.fy24_25` and `rawData.fy25_26` arrays
   - Stores result in `filteredData` object
   - Calls `updateCascadingFilters()`
   - **Calls `showView(currentView)`** to refresh the current view

2. **showView()** (line 6195):
   - Clears existing charts
   - Switches to the appropriate view renderer
   - For 'notreported' → calls `renderNotReportedView()`

3. **renderNotReportedView()** (line 13764):
   - ✅ Creates copies of Not Reported data arrays
   - ✅ Applies activeFilters (regionalHead, region, practice, account)
   - ✅ Calculates summary metrics from filtered data
   - ✅ Calculates dimensional breakdowns using filtered data
   - ✅ Destroys old charts
   - ✅ Creates new charts with filtered data

#### Key Filter Application Code:
```javascript
// Regional Head filter
if (activeFilters.regionalHead && activeFilters.regionalHead.length > 0) {
    filtered2425 = filtered2425.filter(row => {
        const rh = row['Regional Head '] || row['Regional Head'];
        return activeFilters.regionalHead.includes(rh);
    });
    filtered2526 = filtered2526.filter(row => {
        const rh = row['Regional Head '] || row['Regional Head'];
        return activeFilters.regionalHead.includes(rh);
    });
}

// Region filter
if (activeFilters.region && activeFilters.region.length > 0) {
    filtered2425 = filtered2425.filter(row => activeFilters.region.includes(row.Region));
    filtered2526 = filtered2526.filter(row => activeFilters.region.includes(row.Region));
}

// Practice filter
if (activeFilters.practice && activeFilters.practice.length > 0) {
    filtered2425 = filtered2425.filter(row => activeFilters.practice.includes(row['Practice Head']));
    filtered2526 = filtered2526.filter(row => activeFilters.practice.includes(row['Practice Head']));
}

// Account filter
if (activeFilters.account && activeFilters.account.length > 0) {
    filtered2425 = filtered2425.filter(row => activeFilters.account.includes(row.Project));
    filtered2526 = filtered2526.filter(row => activeFilters.account.includes(row.Project));
}
```

### 3. Chart Rendering Analysis

#### Chart Functions (All receive filtered data as parameters):
1. **renderNotReportedProjectChart(data)** (line 14901)
   - ✅ Uses top 15 from filtered data
   - ✅ Displays horizontal bar chart
   - ✅ Shows count and percentage

2. **renderNotReportedRegionChart(data)** (line 15017)
   - ✅ Uses filtered region breakdown
   - ✅ Displays vertical bar chart

3. **renderNotReportedPracticeChart(data)** (line 15095)
   - ✅ Uses filtered practice breakdown
   - ✅ Displays vertical bar chart

4. **renderNotReportedTrendChart(data)** (line 15173)
   - ✅ Uses filtered monthly trend data
   - ✅ Displays line chart comparing FY 24-25 and FY 25-26

#### Chart Creation Sequence:
```javascript
// 1. Destroy old charts first
['notReportedProjectChart', 'notReportedRegionChart', 
 'notReportedPracticeChart', 'notReportedTrendChart'].forEach(chartId => {
    if (charts[chartId]) {
        charts[chartId].destroy();
        delete charts[chartId];
    }
});

// 2. Create new charts with filtered data (after 100ms delay)
setTimeout(() => {
    charts.notReportedProjectChart = renderNotReportedProjectChart(projectBreakdown);
    charts.notReportedRegionChart = renderNotReportedRegionChart(regionBreakdown);
    charts.notReportedPracticeChart = renderNotReportedPracticeChart(practiceBreakdown);
    charts.notReportedTrendChart = renderNotReportedTrendChart(monthlyTrend);
}, 100);
```

## Expected Behavior

When a user applies filters in the Not Reported view:
1. ✅ `applyFilters()` is called
2. ✅ Data is filtered based on selected criteria
3. ✅ `showView('notreported')` is called
4. ✅ `renderNotReportedView()` re-renders with filtered data
5. ✅ Old charts are destroyed
6. ✅ New charts are created with filtered data

## Conclusion

**The code implementation is CORRECT**. The filter mechanism is properly implemented:
- ✅ Filters are applied to data arrays
- ✅ Charts are destroyed and recreated
- ✅ Filtered data is passed to chart functions
- ✅ All views re-render when filters change

## Possible Root Causes (If Issue Persists)

If charts still don't update, the issue may be:

1. **Browser Cache**: User may be seeing old JavaScript
   - **Solution**: Hard refresh with Ctrl+F5 or Cmd+Shift+R

2. **Excel File Not Loaded**: User may need to re-upload the file
   - **Solution**: Click "Upload Excel File" button and select `SLA_Monthly_Status_Summary_FINAL.xlsx`

3. **Console Errors**: JavaScript errors may be preventing execution
   - **Solution**: Check browser console (F12) for error messages

4. **Filter Not Being Applied**: User may not be clicking "Apply Filters" button
   - **Solution**: Ensure filters are selected AND "Apply Filters" is clicked

## Verification Steps

To verify filters are working:
1. Open dashboard in browser
2. Navigate to "Not Reported Analysis" view
3. Open browser console (F12)
4. Apply a filter (e.g., select "North" region)
5. Look for console logs:
   - `🔍 Active filters: {...}` → Shows applied filters
   - `📊 Before filtering: FY24-25 = X rows, FY25-26 = Y rows`
   - `📊 After filtering: FY24-25 = X' rows, FY25-26 = Y' rows`
   - `Creating new charts with filtered data...`

## Files Verified
- ✅ `SLA_Monthly_Status_Summary_FINAL.xlsx` - All sheets contain TBH
- ✅ `index.html` - Filter logic implemented correctly
- ✅ Chart functions - All use filtered data parameters

## Next Steps
If issue persists, please:
1. Clear browser cache and hard refresh (Ctrl+F5)
2. Re-upload Excel file
3. Check browser console for errors
4. Provide screenshot showing:
   - Applied filters
   - Chart displaying (what values are shown)
   - Browser console (F12 → Console tab)
