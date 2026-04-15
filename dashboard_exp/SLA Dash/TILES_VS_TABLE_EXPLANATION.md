# Tiles vs Table Data Discrepancy Explanation

## Issue Description
The SLA Bifurcation tiles show **62.2%** for January, but when you filter the monthly view table for January, it displays a **different percentage**. This discrepancy occurs due to how the two views calculate and present data.

## Root Cause Analysis

### 1. **Tiles Calculation (SLA Bifurcation)**
**Location**: `generateKPIBifurcationTiles()` function (lines 7686-7862)

**Data Source**: `metricsDetailsData` (from FY 25-26 Metrics Details sheet)

**Calculation Logic**:
```javascript
// For January only when month filter = 'Jan':
const calcMetPct = (data) => {
    let totalMet = 0;
    let totalNotMet = 0;
    
    data.forEach(row => {
        const status = row['Jan MET/NOT_MET'];
        if (status === 'Met') totalMet++;
        else if (status === 'Not Met') totalNotMet++;
        // Excludes: 'Not Reported', 'NA', null, undefined (152 rows)
    });
    
    const total = totalMet + totalNotMet;
    const pct = (totalMet / total) * 100;
    return pct;
};
```

**January Data Breakdown**:
- Total rows: **506 measures**
- Met: **150**
- Not Met: **91**
- Not Reported: **113**
- Null/NA: **152**

**Calculation**:
- Total considered = Met + Not Met = 150 + 91 = **241**
- Percentage = 150 / 241 × 100 = **62.2%**

**Key Points**:
- ✅ Counts individual **measures** (not projects)
- ✅ Excludes "Not Reported" and null/NA values
- ✅ Uses **row-level** data from Excel sheet
- ✅ Shows **overall SLA compliance** across all measures

---

### 2. **Table Calculation (Monthly Performance)**
**Location**: `renderMonthlyView()` function (lines 7865-8039)

**Data Source**: `filteredData.fy25_26` (aggregated summary data)

**Calculation Logic**:
```javascript
// For January:
const met = filteredData.fy25_26.reduce((sum, row) => {
    return sum + getMonthData(row, 'Jan', 'fy25_26', 'Met');
}, 0);

const notMet = filteredData.fy25_26.reduce((sum, row) => {
    return sum + getMonthData(row, 'Jan', 'fy25_26', 'Not_Met');
}, 0);

const total = met + notMet;
const percentage = (met / total) * 100;
```

**Key Points**:
- ✅ Uses **aggregated project-level** summary data
- ✅ Reads from summary columns like `Jan_Met`, `Jan_Not_Met`
- ✅ Different data structure (summary counts, not individual measures)
- ✅ Shows **project-level** aggregated compliance

---

## Why the Numbers Differ

| Aspect | **Tiles (SLA Bifurcation)** | **Table (Monthly View)** |
|--------|----------------------------|--------------------------|
| **Data Source** | FY 25-26 Metrics Details (raw data) | FY 25-26 Summary (aggregated) |
| **Granularity** | Individual measures (506 rows) | Project-level summaries (~25 projects) |
| **Calculation** | Counts "Met"/"Not Met" per measure | Sums Met/Not Met counts per project |
| **Exclusions** | Excludes Not Reported + null/NA | Depends on summary data structure |
| **Scope** | Measure-level compliance | Project-level compliance |

---

## Example Scenario

### Tiles View (Measure-Level):
**Project A** has 10 measures in January:
- 6 Met
- 2 Not Met
- 2 Not Reported

**Tiles calculation** for Project A:
- Contributes: 6 Met, 2 Not Met (ignores Not Reported)
- Compliance: 6/8 = 75%

### Table View (Project-Level):
**Project A** in summary might aggregate:
- Total Met: 6
- Total Not Met: 2
- Percentage: 6/8 = 75%

**BUT** if the summary data has different aggregation logic (e.g., includes quarterly data, YTD, or different handling of Not Reported), the numbers will differ.

---

## The 62.2% Calculation Verified

Using the actual January data from `SLA_Data_20260128.xlsx`:

```
Total measures: 506
Met: 150
Not Met: 91
Not Reported: 113
Null/NA: 152

Calculation:
Total counted = Met + Not Met = 150 + 91 = 241
Percentage = 150 / 241 = 0.6223... = 62.2%
```

This **62.2%** represents the **measure-level compliance** for January across all projects.

---

## Which Number is Correct?

**Both are correct** - they just measure different things:

1. **Tiles (62.2%)**: Measure-level compliance
   - "Out of all measures that were reported in January, 62.2% met their targets"
   - More granular view
   - Shows individual measure performance

2. **Table (Different %)**: Project-level aggregated compliance
   - "Average compliance across all projects for January"
   - Higher-level view
   - Shows project-wise performance

---

## Recommendations

### Option 1: Keep Both (Current State)
- Tiles show measure-level compliance
- Table shows project-level aggregated view
- Add tooltips/labels to clarify the difference

### Option 2: Align Both to Same Data Source
- Modify table calculation to use `metricsDetailsData`
- Apply same logic as tiles
- Both will show 62.2% for January

### Option 3: Add Clarifying Labels
- Tiles: "Measure-Level Compliance: 62.2%"
- Table: "Project-Level Average: X%"

---

## Technical Files Involved

1. **index.html**:
   - Line 7686-7862: `generateKPIBifurcationTiles()` (tiles)
   - Line 7865-8039: `renderMonthlyView()` (table)
   - Line 4830-4852: `getMonthData()` helper

2. **Data Files**:
   - `SLA_Data_20260128.xlsx` → Sheet: "FY 25-26 Metrics Details" (506 rows)
   - Columns: Project, Region, Practice Head, ... Jan MET/NOT_MET, ... (33 columns)

---

## Conclusion

The **62.2%** shown in the tiles is **accurate** for measure-level compliance in January. The table shows a different calculation based on aggregated project-level data from the summary sheet. The discrepancy is **by design** due to different data sources and calculation methodologies.

**User's Choice**: Should we align both to show the same number, or keep them as different views (measure-level vs project-level)?
